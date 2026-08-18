# Step 00 — Repository Audit &amp; Decision Log

**Recipe Automation plan — Prompt 00.** Branch: `claude/recipe-automation-prompt-00-01-1jj1wd`.
Repo: `berkinsavciozen/hasat-d2c-marketplace`. Supabase project: **Hasat**
(`efuqpiaavrzimvstpdpm`, ap-northeast-1, Postgres 17).

This document is read-only in nature: no DDL/DML was run against the live database while
producing it (see "Verification" at the end). It establishes the implementation baseline for
the recipe automation pipeline and closes/surfaces the product decisions requested by Prompt 00.

---

## 1. Branch

Created `claude/recipe-automation-prompt-00-01-1jj1wd` from the tip of `main`
(`04b1662b885a59bb626cfd4ef95ecc4cdb5a9994`, merge commit for PR #34, dated 2026-08-18).

---

## 2. Schema inventory: `recipes`, `recipe_ingredients`, `recipe_steps`, `crop_config`

Queried live via `information_schema.columns` and `pg_constraint` against
`efuqpiaavrzimvstpdpm`. Full column list and every constraint below is copied verbatim from
query output (not summarized from memory).

### `recipes`

| column | type | nullable | default |
|---|---|---|---|
| id | uuid | NO | `gen_random_uuid()` |
| slug | text | NO | — |
| title | text | NO | — |
| description | text | YES | — |
| cover_photo_url | text | YES | — |
| servings | int4 | YES | — |
| prep_minutes | int4 | YES | — |
| cook_minutes | int4 | YES | — |
| difficulty | text | YES | — |
| cuisine | text | YES | — |
| diet_tags | text[] | NO | `'{}'::text[]` |
| status | text | NO | `'draft'::text` |
| visibility | text | NO | `'private'::text` |
| source_type | text | NO | `'manual'::text` |
| source_url | text | YES | — |
| owner_id | uuid | YES | — |
| author_type | text | NO | `'hasat'::text` |
| extraction_confidence | numeric | YES | — |
| created_at / updated_at | timestamptz | NO | `now()` |
| rest_minutes | int4 | YES | — |
| **allergen_labels** | **text[]** | **YES** | — |
| required_equipment | text[] | YES | — |
| calories, protein_g, carbs_g, fat_g, fiber_g | numeric | YES | — |
| micronutrients | jsonb | YES | — |
| nutrition_calculated_at | timestamptz | YES | — |
| share_token | uuid | YES | — |
| cloned_from_recipe_id | uuid | YES | — |

Constraints (`pg_get_constraintdef`):
- `recipes_status_check`: `status = ANY (ARRAY['draft','published'])` — **exactly two values, confirmed.**
- `recipes_visibility_check`: `visibility = ANY (ARRAY['public','private'])`
- `recipes_difficulty_check`: `difficulty IS NULL OR difficulty = ANY (ARRAY['kolay','orta','zor'])` — **confirmed Turkish enum, implemented as a `text` CHECK, not a Postgres `ENUM` type** (no `difficulty` type appears in `pg_enum`; see §6).
- `recipes_author_type_check`: `author_type = ANY (ARRAY['hasat','ciftci','sef','kullanici'])` — `hasat_ai` is **not** currently in this list (see decision log §7).
- `recipes_source_type_check`: `source_type = ANY (ARRAY['manual','text','photo','url'])`
- `recipes_owner_id_fkey` → `profiles(id)` ON DELETE CASCADE
- `recipes_cloned_from_recipe_id_fkey` → `recipes(id)`
- `recipes_extraction_confidence_check`: 0–1 range
- `recipes_servings_check`, `recipes_prep_minutes_check`, `recipes_cook_minutes_check`: positivity checks

### `recipe_ingredients`

| column | type | nullable |
|---|---|---|
| id | uuid | NO |
| recipe_id | uuid | NO |
| sort_order | int4 | NO (default 0) |
| **crop** | **text** | YES |
| free_text_name | text | YES |
| quantity | numeric | YES |
| unit | text | YES |
| note | text | YES |
| is_key_ingredient | boolean | NO (default false) |
| ingredient_class | text | YES |
| created_at | timestamptz | NO |

Constraints:
- `recipe_ingredients_crop_fkey`: `crop` → `crop_config(crop)` ON UPDATE CASCADE ON DELETE SET NULL — **confirms ingredient crop reference is text `crop` matched to `crop_config.crop`; there is no `crop_id` column anywhere in this table.**
- `recipe_ingredients_ingredient_class_check`: `ingredient_class = ANY (ARRAY['tarimsal','platform_disi'])`
- `recipe_ingredients_name_present`: `crop IS NOT NULL OR NULLIF(btrim(COALESCE(free_text_name,'')),'') IS NOT NULL`
- `recipe_ingredients_quantity_check`: `quantity IS NULL OR quantity > 0`
- `recipe_ingredients_recipe_id_fkey` → `recipes(id)` ON DELETE CASCADE

A `BEFORE INSERT` trigger auto-matches `crop` when null (see §3.4 below).

### `recipe_steps`

| column | type | nullable |
|---|---|---|
| id | uuid | NO |
| recipe_id | uuid | NO |
| step_no | int4 | NO |
| instruction | text | NO |
| photo_url | text | YES |
| timer_seconds | int4 | YES |
| created_at | timestamptz | NO |

Constraints: `recipe_steps_step_no_check` (`step_no > 0`), `recipe_steps_timer_seconds_check`
(`timer_seconds IS NULL OR timer_seconds > 0`), FK to `recipes(id)` ON DELETE CASCADE.

### `crop_config`

Primary key is `crop` (text) — 14 columns including `display_name`, `default_unit`,
`harvest_window_start_month/end_month`, `lifecycle_steps` (jsonb), `category_group`,
`has_official_price_source`, `is_seasonal_harvest`, and **`default_photo_url` (text)**, which is
the crop's representative photo.

### Recipe image fields and current public URL construction

- `recipes.cover_photo_url` (text) and `recipe_steps.photo_url` (text) are plain URL columns —
  no separate "path + bucket" split; the app stores the full public URL.
- `crop_config.default_photo_url` sample values (queried live):
  `https://efuqpiaavrzimvstpdpm.supabase.co/storage/v1/object/public/crop-photos/findik.webp`,
  `.../crop-photos/zeytinyagi.webp`, `.../crop-photos/bugday.webp` — i.e. Supabase Storage
  public-object URLs, WebP, Turkish-to-ASCII filenames (ğ→g, ı→i, etc.), already matching the
  automation's target contract exactly.
- Storage buckets confirmed live (public): `crop-photos` and `recipe-step-photos` (the latter
  added by migration `p23_m8_d_recipe_step_photos_bucket`, live but recipe-steps-only). There is
  **no `recipe-photos` bucket**; cover photos and crop fallback photos both live in `crop-photos`.
- App-layer fallback logic (`src/lib/hasat/recipes.ts`, `attachCoverFallback`): if a recipe has
  no `cover_photo_url`, the app falls back to `crop_config.default_photo_url` of its first
  key ingredient's crop, and flags `isRepresentativePhoto: true`. This powers the existing
  **"temsili görsel"** (representative image) disclosure component
  (`src/components/hasat/RepresentativePhoto.tsx`): an ⓘ badge with `aria-label="Temsili görsel"`
  and alt-text suffix `(temsili görsel)`, shown whenever the displayed photo isn't the item's own
  photography. This is a pre-existing, reusable pattern — not something Step 02+ needs to invent.

---

## 3. Implementation-pattern inventory

### 3.1 `admin-kpi` (`supabase/functions/admin-kpi/index.ts`, live version 10, in repo on `main`)

- `verify_jwt: false` at the platform level; auth is enforced **inside** the function body via a
  **timing-safe `x-admin-key` check**:
  ```ts
  function timingSafeEqual(a: string, b: string): boolean { ...XOR every byte, constant time... }
  const provided = req.headers.get("x-admin-key") ?? "";
  const expected = Deno.env.get("ADMIN_DASHBOARD_KEY") ?? "";
  if (!expected || !provided || !timingSafeEqual(provided, expected)) return 401;
  ```
- On success, it builds a **service-role** `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })` client and queries KPI views directly.
- **Confirms**: admin endpoints use `x-admin-key` timing-safe validation against
  `ADMIN_DASHBOARD_KEY`, then service-role DB access — no Supabase Auth session, no RLS-based
  admin role.

### 3.2 `dispatch_push` / `dispatch_sms` (Postgres RPCs, **not** edge functions)

Both are `SECURITY DEFINER` PL/pgSQL functions in `public`, confirmed via `pg_get_functiondef`.
They are **not present as edge functions** in `list_edge_functions` — they are Postgres RPCs that
each `perform net.http_post(...)` against a Supabase Edge Function URL. Defined by migrations
`p23_m8b_dispatch_push_function` (20260810121756) and its sibling for SMS (name inferred from
symmetry; `dispatch_sms`'s own defining migration is not separately listed by name in
`list_migrations`, but its live definition was retrieved directly).

```sql
CREATE OR REPLACE FUNCTION public.dispatch_push(_user_id uuid, _event text, _title text, _message text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions'
AS $$
declare
  _col text; _enabled boolean; _sql text;
  _url text := 'https://efuqpiaavrzimvstpdpm.supabase.co/functions/v1/send-push';
  _anon text := '<anon JWT>';
  _tokens text[];
begin
  if _user_id is null or _event is null then return; end if;
  _col := case _event when 'new_offer' then 'new_offer_push' ... else null end;
  if _col is null then return; end if;
  _sql := format('select coalesce(%I, false) from public.notif_prefs where user_id = $1', _col);
  execute _sql into _enabled using _user_id;
  if not coalesce(_enabled, false) then return; end if;
  select array_agg(token) into _tokens from public.device_tokens where user_id = _user_id;
  if _tokens is null or array_length(_tokens, 1) = 0 then return; end if;
  perform net.http_post(url := _url, headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||_anon),
    body := jsonb_build_object('tokens', to_jsonb(_tokens), 'title', _title, 'body', _message, 'event', _event, 'userId', _user_id));
exception when others then
  raise log 'dispatch_push failed: %', sqlerrm;
end;
$$;
```

`dispatch_sms` is structurally identical: per-event `notif_prefs` column lookup (`*_sms`
instead of `*_push`), `net.http_post` to `.../functions/v1/send-sms`, same
`exception when others then raise log ...` isolation (a failure never propagates to — or rolls
back — the caller's transaction).

**Confirms** the "chained, short-lived Edge Functions wired through `pg_net`/`net.http_post`,
with exception isolation" pattern the automation invariants require, and gives the exact template
(`SECURITY DEFINER`, `search_path` pinned, per-event column lookup via `format()+execute`,
`exception when others` swallow-and-log) to reuse for any new dispatch RPC the pipeline needs.

### 3.3 `extract-recipe` (live edge function, version 4 — **not present in the repo on `main`**, see §4 drift)

Full source retrieved via `mcp__Supabase__get_edge_function`. Key implementation facts:
- `verify_jwt: true` — user-triggered only (comment explicitly notes the `sync-izmir-hal-prices`
  cron exemption does **not** apply here).
- Uses the **Lovable AI Gateway**, not a direct OpenAI or Google API key:
  `LOVABLE_API_KEY` env var, `POST https://ai.gateway.lovable.dev/v1/chat/completions`,
  `model: "google/gemini-3-flash-preview"`. This is the same pattern used by `ai-chat-stream`
  (also inspected; same `LOVABLE_API_KEY`/gateway/model triplet). **This is the existing
  AI-secret naming convention in this repo** — relevant to Step 01's secret inventory (§ Step 01
  report, SECRETS OR CONFIG).
- Server-side invariants enforced in code (not trusted from the client): `visibility` forced to
  `'private'`, `owner_id` taken from the JWT `sub` claim only, `author_type` forced to
  `'kullanici'`, `status` forced to `'draft'`.
- Structured-output contract: single `response_format: { type: "json_object" }` call, strict
  system prompt ("do not invent missing fields, return null"), then application-code validation
  (`clampConfidence`, `posInt`, `str` length-clamping) before insert — no unrestricted SQL or raw
  model output reaches the database.
- A `BEFORE INSERT` trigger `tg_recipe_ingredients_auto_match_crop` (confirmed via
  `pg_get_functiondef`) calls `fn_match_culinary_crop(free_text_name)` to fill `crop` when the
  function itself inserts it as `null` — i.e. crop-matching is push-based DB logic the edge
  function relies on, not something `extract-recipe` computes itself.
- On any downstream insert failure it explicitly deletes the just-created `recipes` row
  (compensating delete, since there's no multi-statement transaction across `sb.from(...).insert`
  calls in the JS client).

### 3.4 Ingredient crop matching

`tg_recipe_ingredients_auto_match_crop()` (`pg_get_functiondef`, confirmed live):
```sql
CREATE OR REPLACE FUNCTION public.tg_recipe_ingredients_auto_match_crop()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$
begin
  if new.crop is null and new.free_text_name is not null then
    new.crop := public.fn_match_culinary_crop(new.free_text_name);
  end if;
  return new;
end;
$$;
```
Deterministic alias lookup (per `extract-recipe`'s own comments), not fuzzy matching — matches
the "shared validation belongs in Postgres RPC so `extract-recipe` can reuse it later" invariant;
this is the existing instance of that pattern for crop matching specifically.

---

## 4. Recipe create/publish logic, and migration/drift audit

### 4.1 Create logic

The **only** recipe-creation code path found anywhere in the repo (`src/`, `supabase/functions/`
on `main`, and 7 other branches checked — see §4.3) is `extract-recipe`: AI-assisted extraction
from user-submitted text/photo, always inserting `status='draft'`, `visibility='private'`,
`owner_id=<jwt user>`, `author_type='kullanici'`. There is **no editorial/admin create-or-publish
path in the codebase today.**

### 4.2 Publish logic

**None exists yet.** `src/routes/admin.kpi.tsx` is the only admin route in the app; there is no
admin recipe editor, no publish button, no RPC named anything like `publish_recipe`. Live data
confirms this gap is currently being filled outside the app entirely: of 23 recipes in the live
DB, 18 are `status='published'` with `author_type='hasat'`, but they were seeded directly via
migrations (`p23_m3_recipes_content`, `p23_m3_crop_culinary_meta_seed`), not through any
application code. Building deterministic, idempotent, human-approved publishing is genuinely new
work for Step 02+, not a refactor of an existing flow.

### 4.3 Migration and code drift — audited and documented, not fixed

Two independent, confirmed drift findings, both bypassing git entirely (schema/functions pushed
straight to the live project, e.g. via `mcp__Supabase__apply_migration` /
`mcp__Supabase__deploy_edge_function` in earlier sessions, never committed to any branch):

**(a) Six live, ACTIVE edge functions are absent from git on every branch checked.**
`list_edge_functions` on `efuqpiaavrzimvstpdpm` returns 12 functions; `supabase/functions/` on
`main` contains only 6 (`admin-kpi`, `ai-box-insights`, `ai-chat-stream`, `notify-admin`,
`send-sms`, `whatsapp-ai-webhook`). The other 6 — `extract-recipe`, `send-push`,
`sync-izmir-hal-prices`, `probe-ibb-hal`, `probe-api-ninjas`, `diag-p23-m6ek` — were checked
against `supabase/functions/` on 8 branches total: `main`,
`claude/p23-m4a-recipe-surface-kdkg9h`, `claude/p23-m4-b-transformation-layer-yrbyxv`,
`claude/p23-m5-storage-adapter`, `claude/hasat-environment-inventory-ft0ehg`,
`claude/p23-m8-session-regression-or5i7o`, `claude/supabase-types-import-fix-gitoum`,
`claude/p23-m7-g-visual-label-format-wqg9av`, `claude/marketplace-mobile-launch-sync-7tw8ac`.
**None of the 9 checked branches contain any of the 6 missing functions.** `extract-recipe`'s own
full source was recovered directly from the live function (§3.3), not from git.

**(b) ~30 live migrations (all recipe-schema-related, and more) are absent from git on every
branch checked.** The local `main` clone's `supabase/migrations/` has 72 files, the newest being
`20260728145433_p22g_crop_type_request_sms_include_fields.sql` (2026-07-28). `list_migrations`
against the live project returns 91 entries, the newest being
`20260818103942_f3_notif_prefs_round2_price_alert_removed_new_events_added`. The ~19 extra
entries (`20260729130747_p23_m2_recipe_schema` through
`20260818103942_f3_notif_prefs_round2_...`) include: the entire `recipes` /
`recipe_ingredients` / `recipe_steps` schema and RLS (`p23_m2_recipe_schema`, `p23_m2_recipe_rls`,
`p23_m2_recipe_rpcs`, `p23_m2_recipe_views`), `p23_m8b_dispatch_push_function`, the
`recipe-step-photos` bucket, and — most relevant here — `recipes_metadata_expansion_and_notif_prefs_cleanup`
(20260818094915, dated **today**), which is the migration that added `allergen_labels` (see §6).
Checked `supabase/migrations/` on `claude/p23-m4a-recipe-surface-kdkg9h` (72 files, same set as
`main`) and `claude/hasat-environment-inventory-ft0ehg` (70 files, an older subset) — neither
contains any of these either.

**Conclusion:** the live project's recipe schema is materially ahead of every git ref this
session could inspect. This audit treats live schema as authoritative for "current state" per
the Prompt 00 instruction ("treat repository and live schema evidence as authoritative"), but
flags this as an operational risk for whoever runs Step 02+: a real migration file for the
recipe schema does not exist in version control yet, so a fresh `supabase db reset` / local dev
environment would not reproduce production. This is a finding to route to Berkin, not something
this step attempts to fix (Step 00 is read-only; retroactively authoring 19 migration files
reproducing already-applied live DDL is explicitly out of this step's scope and risks fighting
the live migration history table if done carelessly).

---

## 5. Migration / test / shared-module / Edge Function naming conventions

- **Migrations**: `supabase/migrations/<YYYYMMDDHHMMSS>_<name>.sql`. Two observed styles: raw
  Lovable-generated UUID-suffixed names (`20260706083440_4e7c8963-....sql`, older) and
  human-readable slugs, usually `<phase>_<module>_<description>` (`p22g_routine_maintenance_status_view`,
  `p23_m2_recipe_schema`, `p23_m8b_dispatch_push_function`, `f3_notif_prefs_round2_...`). The
  `pXX(_letter)(_ek)_` phase/module prefix convention (`p22`, `p23_m2`, `p23_m4b`, `p23_m6ek`,
  `f3`, `f13`) is the dominant recent style and should be followed for any new automation
  migrations (e.g. a `p24_...` or feature-specific prefix, pending Berkin's naming call for this
  workstream).
- **Edge Functions**: `supabase/functions/<kebab-case-name>/index.ts`, one directory per
  function, CORS headers module-scoped as a `CORS`/`corsHeaders` const, `Deno.serve(async (req) => {...})`
  entrypoint, `createClient` from `esm.sh/@supabase/supabase-js@2.45.0` pinned version.
  Diagnostic/throwaway functions use a `probe-*` or `diag-p23-*` prefix (`probe-ibb-hal`,
  `probe-api-ninjas`, `diag-p23-m6ek`) — i.e. **this repo already has a convention for
  clearly-named, disposable functions**, which this plan's `spike-*` naming (Step 01) is
  consistent with.
- **Shared modules**: app-side shared logic lives under `src/lib/hasat/*.ts` (domain) and
  `src/lib/core/*` (cross-cutting, e.g. `src/lib/core/db/types.ts`, `src/lib/core/design/tokens.ts`).
  No shared TypeScript module directory exists yet under `supabase/functions/` (no `_shared/`
  folder was found) — each function is currently self-contained; introducing a `_shared/` module
  for the pipeline's common validation/dispatch helpers would be new but is consistent with
  standard Supabase Edge Function conventions.
- **Tests**: no test files were found under `supabase/functions/` or a dedicated test directory
  in this repo (no `*.test.ts` / `*_test.ts` under `supabase/`). `pgtap` extension is installed
  on the project (`default_version 1.3.3`, not currently `installed_version`-active) but no pgTAP
  test files exist in `supabase/migrations/` or elsewhere in the tree. There is currently no
  established test convention to follow for Edge Functions in this repo — Step 01's spikes
  therefore define their own lightweight self-check pattern (see the Step 01 report) rather than
  fitting an existing one.
- **Docs**: no `docs/` or `ADR/` directory existed before this step; the closest precedent is
  `.lovable/plan.md` (ad hoc planning notes, not a formal ADR log) and in-code long-form comments
  referencing `Build/DB-Schema.md` and `Build/P23-Mobile.md` (external planning docs not present
  in this repo's tree — likely tracked elsewhere, e.g. Notion/Google Docs). This document was
  placed at `docs/recipe-automation/00-repo-audit-decision-log.md` per the orchestrator's
  fallback instruction, since no in-repo ADR convention exists to match.

---

## 6. Confirmed facts (with evidence)

| # | Claim | Status | Evidence |
|---|---|---|---|
| 1 | Ingredient crop reference is `text` `crop`, not `crop_id` | **Confirmed** | `information_schema.columns`: `recipe_ingredients.crop` is `text`; `recipe_ingredients_crop_fkey` → `crop_config(crop)`. No `crop_id` column exists on either table. |
| 2 | Difficulty is a Turkish enum | **Confirmed, with a nuance** | `recipes.difficulty` is `text` (not a Postgres `ENUM` type — `pg_enum` was queried project-wide and no `difficulty` type exists), constrained by `recipes_difficulty_check` to exactly `kolay \| orta \| zor`. Functionally an enum; implemented as a CHECK constraint, matching the "Difficulty is exactly kolay \| orta \| zor" invariant verbatim. |
| 3 | `recipes.status` accepts only `draft`/`published` | **Confirmed** | `recipes_status_check`: `status = ANY (ARRAY['draft','published'])`. |
| 4 | No `allergen_labels` column | **FALSE — corrected below** | See dedicated entry in §7. |
| 5 | No admin RLS / `is_admin` path | **Confirmed** | `pg_policy` for `recipes`, `recipe_ingredients`, `recipe_steps` (all 14 policies listed) are 100% `owner_id = auth.uid()` or `visibility='public' AND status='published'` — none reference any admin role or `is_admin()`. A project-wide search of `information_schema.routines` for `%is_admin%` returned zero rows. `admin-kpi` (the one real admin endpoint) bypasses RLS entirely via `x-admin-key` + service-role client (§3.1), confirming admin access is a header-key + service-role pattern, never a Postgres role/RLS policy. |

---

## 7. Decision log — open product choices

Each item is marked **Proposed** (this session's recommendation, awaiting Berkin's sign-off) or
**Decided** (already settled, with evidence), and states exactly what approval is still missing.

### 7.1 AI recipe author type — **Proposed**
Recommended value: `hasat_ai`. **Blocking issue**: `recipes_author_type_check` currently allows
only `ARRAY['hasat','ciftci','sef','kullanici']` — `hasat_ai` is not a member today. Adding it
requires an `ALTER TABLE ... DROP CONSTRAINT ... ADD CONSTRAINT` migration (out of scope for
Step 00, which is read-only) and a UI-impact check: `author_type` values likely surface as
attribution labels somewhere in `src/routes/tarifler.*` (not yet audited line-by-line for every
render site). **Missing approval**: Berkin's sign-off on the literal value `hasat_ai` (vs. e.g.
reusing `hasat` for AI-authored-and-human-approved recipes) and on how it should render in the UI
attribution string.

### 7.2 AI disclosure — **Proposed / partially Decided**
**Decided**: the image-level "temsili görsel" (representative image) disclosure pattern already
exists and is reusable as-is (`RepresentativePhoto.tsx` / `RepresentativeBadge`, §2 above) — no
new decision needed there.
**Proposed, open**: a **recipe-level** AI-authorship disclosure (e.g. "Bu tarif yapay zeka
tarafından oluşturuldu" or similar, distinct from the image disclosure) does not exist anywhere
in the codebase today — no component, no copy, no schema flag for it beyond `author_type` itself.
**Missing approval**: whether a recipe-level disclosure is required at all (vs. `author_type`
alone being sufficient signal), and if so its exact copy/placement — this is a product/legal
question, not something this audit can resolve from code.

### 7.3 Allergen migration timing — **Decided / ALREADY CLOSED**
The `recipes.allergen_labels text[]` column is **already live** in production. Independently
verified (not just trusted from the task brief) via two separate live queries against
`efuqpiaavrzimvstpdpm`:
1. `information_schema.columns`: `recipes.allergen_labels` — `data_type: ARRAY`, `udt_name: _text`, `is_nullable: YES`.
2. The exact defining SQL, recovered from `supabase_migrations.schema_migrations.statements` for
   version `20260818094915` (name: `recipes_metadata_expansion_and_notif_prefs_cleanup`, applied
   **today**):
   ```sql
   -- F13: alerjen ve ekipman filtreleri
   alter table public.recipes
     add column allergen_labels text[],
     add column required_equipment text[];
   ```
3. Population state, also verified live: `select count(*) ... from recipes` → **23 total rows, 0
   with a non-null `allergen_labels`, 0 with a non-empty array** — the column exists but is
   entirely unpopulated.

**Resolution**: the schema decision is closed — the column already exists, was added in a prior
session turn for a separate workstream ("F13"), and does not need a Step 02+ migration. What
remains is only **populating** it (AI pre-labeling of allergens + mandatory human review/approval
— see the "temperature, timing and allergen review always require a human" invariant, which this
audit did not relax), and that population work belongs to F13's own v1.1 scope, not to a Step 02+
schema decision here. No approval is missing on the schema question; population workflow
ownership (F13 vs. this pipeline) should be confirmed with Berkin if there's any ambiguity about
who implements the labeling step.

### 7.4 `hasat-webp.sh` location — **Proposed**
No file named `hasat-webp.sh` (or any `*webp*.sh`) exists anywhere in the repository today
(`find . -iname "*hasat-webp*" -o -iname "*webp*.sh"` on `main`, zero results). Recommended
location: a `scripts/` directory adjacent to the automation implementation (e.g.
`scripts/hasat-webp.sh` or co-located under wherever Step 02+ places the image-processing Edge
Function, such as `supabase/functions/_shared/`), so it stays next to the code it's meant to
mirror/validate against. **Missing approval**: Berkin has not yet specified the intended location
or confirmed the script should live in this repo at all (vs. being an external/local-only dev
tool) — Step 01's image-processing spike (§ Step 01 report) treats the invariant's spec
(chop 14% right/bottom → center-crop 16:9 and 1:1 → WebP q82 → strip metadata) as the source of
truth in the script's absence, per the Prompt 01 instruction to do exactly that.

---

## Verification

**Read-only confirmation**: every Supabase call in this step was `mcp__Supabase__execute_sql`
(read-only `SELECT` against `information_schema`, `pg_catalog`, `pg_policy`, `pg_proc`,
`supabase_migrations.schema_migrations`, and the `recipes`/`crop_config`/`storage.buckets`
tables themselves), `mcp__Supabase__list_tables`, `mcp__Supabase__list_edge_functions`,
`mcp__Supabase__list_migrations`, `mcp__Supabase__list_extensions`, and
`mcp__Supabase__get_edge_function` (read-only source retrieval). **No `apply_migration`, no
`deploy_edge_function`, no `INSERT`/`UPDATE`/`DELETE`/`ALTER` statement was executed against
`efuqpiaavrzimvstpdpm` during Step 00.** No RLS policy, table, function, or storage object was
created, altered, or dropped. The exact SQL text of every query used to populate this document is
reproduced inline above (§2, §4.3, §6, §7.3) rather than paraphrased.
