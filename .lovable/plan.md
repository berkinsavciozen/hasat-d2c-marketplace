# AI Features — DB Foundation (revised)

## Current state
- `public.profiles`: `id, role, name, phone, city, premium boolean default false, created_at, updated_at`. No `tier` column.
- No existing AI tables (`ai_*`, `*chat*`, `*usage*`).
- `profiles.premium` is read by `login.tsx`, `__root.tsx`, `buyer.account.tsx`, `farmer.premium.tsx`, `lib/hasat/store.ts`, and written `false` by `onboarding.farmer.tsx`. We must keep `premium` working.

## Single idempotent migration

### 1. `profiles.tier`
- Create enum `public.user_tier AS ENUM ('free','premium')` if not exists.
- `ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS tier public.user_tier NOT NULL DEFAULT 'free'`.
- Backfill: `UPDATE public.profiles SET tier='premium' WHERE premium=true AND tier='free'`.
- BEFORE INSERT/UPDATE trigger `profiles_sync_tier_premium` keeping `tier` ↔ `premium` in sync both directions, so legacy reads/writes of `premium` continue to work.

### 2. `public.ai_chat_messages`
Columns: `id uuid pk default gen_random_uuid()`, `user_id uuid not null references auth.users(id) on delete cascade`, `session_id uuid not null`, `role text check in ('user','assistant','system')`, `content text not null`, `source text default 'in_app' check in ('in_app','whatsapp')`, `page_context text null`, `metadata jsonb default '{}'`, `created_at timestamptz default now()`.
Indexes: `(user_id, created_at desc)`, `(user_id, session_id, created_at)`.
Grants: `SELECT, INSERT TO authenticated`; `ALL TO service_role`.
RLS enabled. Policies (authenticated): select own, insert own. No update/delete (permanent).

### 3. `public.ai_usage_tracking`
Columns: `user_id uuid not null references auth.users(id) on delete cascade`, `month text not null check (month ~ '^\d{4}-\d{2}$')`, `message_count integer not null default 0 check >= 0`, `updated_at timestamptz default now()`. PK `(user_id, month)`.
Grants: `SELECT, INSERT, UPDATE TO authenticated`; `ALL TO service_role`.
RLS enabled. Policies (authenticated): select/insert/update own (`auth.uid() = user_id`). Service role bypasses RLS.

### 4. Helper functions (`SECURITY DEFINER`, `SET search_path = public`)

Both functions use a **role-aware assertion** so the WhatsApp edge function can call them as `service_role` (where `auth.uid()` is null):

```sql
IF current_setting('request.jwt.claims', true)::jsonb->>'role' = 'authenticated' THEN
  IF _user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Cross-user access not allowed';
  END IF;
END IF;
```

Applied to **both** `can_send_ai_message` and `increment_ai_usage`. Service-role callers (edge functions) skip the check; anon callers also skip but they have no `EXECUTE` grant so they can't reach the function anyway.

**`public.can_send_ai_message(_user_id uuid) returns boolean`**
- Run role-aware assertion.
- If `profiles.tier = 'premium'` → return true.
- Else return `(coalesce(message_count,0) < 50)` for current month (`to_char(now(),'YYYY-MM')`).
- Free-tier limit `50` as constant in body.
- Grant `EXECUTE TO authenticated, service_role`; revoke from `anon, public`.

**`public.increment_ai_usage(_user_id uuid) returns integer`**
- Run role-aware assertion.
- `INSERT ... ON CONFLICT (user_id, month) DO UPDATE SET message_count = ai_usage_tracking.message_count + 1, updated_at = now()` for current month, `RETURNING message_count`.
- Grant `EXECUTE TO authenticated, service_role`; revoke from `anon, public`.

### 5. Sanity check (executed after migration)
```sql
SELECT public.can_send_ai_message('0868e4fe-86d2-4c5d-8ba5-f15fd4fac146');
-- expected: true
```

## Out of scope
- No changes to `premium` column, no other table changes, no frontend code, no changes to existing RLS policies.

## Will report back
Created column, table names, function names, and sanity-check result.
