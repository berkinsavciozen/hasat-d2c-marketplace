-- T4-A — Nutrition contract, part 2: `crop_nutrition` reference table.
--
-- Canonical doc: `04.12 — T3/T4 Veri Sözleşmesi v1.0` §2.5 (RLS ve rol matrisi). §2.5 is explicit
-- that this table's public-good nature does NOT make it a Data API table: "İki client yalnız
-- materialize edilmiş recipe payload'ını okur" — anon/authenticated get NO grants at all, only
-- service_role/admin. Same enable-RLS-then-revoke-then-grant-service_role shape already used by
-- `public.recipe_admin_reviews` (20260826120000_f2s11_recipe_admin_reviews.sql) in this repo, and
-- required here because this project's `public` schema default privileges hand every new table
-- full CRUD to anon/authenticated unless a migration explicitly revokes it (confirmed live via
-- information_schema.role_table_grants — see PR description).
--
-- SCHEMA IS PROPOSED, NOT FINAL: 04.12 gives no column list for this table (only the RLS/grant
-- matrix). The shape below is this PR's best-effort proposal for a per-100g TÜBER/USDA reference
-- row per crop, keyed the same way `crop_culinary_meta`/`crop_config` already are (`crop` text
-- PK/FK, not `crop_slug` — matched to the live naming convention rather than the dispatch's
-- suggested column name, to stay consistent with the rest of the schema). Flag for explicit
-- reviewer sign-off before any real TÜBER/USDA data entry (a separate, later task) locks it in.
--
-- Out of scope for this PR (explicitly): populating real reference data for ~70 crops. This
-- migration only creates the empty table plus whatever rows the test fixtures need.

create table public.crop_nutrition (
  crop text primary key references public.crop_config(crop) on update cascade on delete cascade,

  -- Provenance of the values on this row.
  reference_source text not null check (reference_source = any (array['tuber','usda'])),
  reference_source_id text check (reference_source_id is null or char_length(reference_source_id) <= 200),
  reference_version text not null check (char_length(reference_version) > 0),

  -- Baseline values are always per 100g edible portion — the standard TÜBER/USDA reporting basis.
  -- This is intentionally a different basis than recipes.micronutrients' per_serving contract
  -- (04.12 §2.2): this table is the raw per-100g reference input the (not-yet-designed) nutrition
  -- engine looks up and converts, not a payload shape a client ever reads.
  basis text not null default 'per_100g' check (basis = 'per_100g'),

  calories_kcal numeric check (calories_kcal is null or calories_kcal >= 0),
  protein_g numeric check (protein_g is null or protein_g >= 0),
  carbs_g numeric check (carbs_g is null or carbs_g >= 0),
  fat_g numeric check (fat_g is null or fat_g >= 0),
  fiber_g numeric check (fiber_g is null or fiber_g >= 0),

  -- Same six-key micronutrient vocabulary as recipes.micronutrients.values (04.12 §2.2), but
  -- flat per-100g numeric columns here rather than a versioned JSON blob: this is source reference
  -- data, not a payload that needs a schema_version envelope for client forward-compatibility.
  sodium_mg numeric check (sodium_mg is null or sodium_mg >= 0),
  potassium_mg numeric check (potassium_mg is null or potassium_mg >= 0),
  calcium_mg numeric check (calcium_mg is null or calcium_mg >= 0),
  iron_mg numeric check (iron_mg is null or iron_mg >= 0),
  vitamin_c_mg numeric check (vitamin_c_mg is null or vitamin_c_mg >= 0),
  vitamin_a_mcg_rae numeric check (vitamin_a_mcg_rae is null or vitamin_a_mcg_rae >= 0),

  notes text check (notes is null or char_length(notes) <= 2000),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.crop_nutrition is
  'T4-A. Proposed per-100g TÜBER/USDA nutrition reference row per crop_config.crop, for the '
  '(not-yet-built) nutrition calculation engine to look up. RLS enabled, no anon/authenticated '
  'grants — client apps never query this table directly, only the materialized recipes payload '
  '(04.12 §2.5). Schema is a proposal pending explicit sign-off before real reference data entry.';

create trigger trg_crop_nutrition_updated_at
  before update on public.crop_nutrition
  for each row execute function public.set_updated_at();

alter table public.crop_nutrition enable row level security;
revoke all on table public.crop_nutrition from anon, authenticated;
grant all on table public.crop_nutrition to service_role;
