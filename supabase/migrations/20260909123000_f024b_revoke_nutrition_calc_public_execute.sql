-- F0-24 follow-up — same bug class as B-1 (dispatch_push) / B-2 (harvest_reminders): Supabase's
-- per-project default ACL (ALTER DEFAULT PRIVILEGES set by postgres/supabase_admin) auto-grants
-- EXECUTE on every newly created function in public to anon/authenticated/postgres/service_role.
-- The 20260909120000 migration's own "revoke all ... from public; grant execute ... to
-- service_role;" only revokes what the PUBLIC pseudo-role itself held — it does not touch the
-- separate, individually-held grants anon/authenticated got from the default ACL. Confirmed live via
-- has_function_privilege('anon', ..., 'execute') = true / ('authenticated', ..., 'execute') = true
-- before this migration. Explicit per-role revoke, exactly like B-1/B-2.
--
-- NOT: bu SQL orkestratör tarafından 2026-09-09'da doğrudan production'a uygulandı (Supabase MCP,
-- apply_migration). Bu dosya git geçmişini production ile senkronize ediyor — canlıda zaten aktif.
-- Idempotent (revoke, zaten yoksa hata vermez).

revoke execute on function public.calculate_recipe_nutrition(uuid) from anon, authenticated;
revoke execute on function public.fn_recipe_ingredient_grams(text, numeric, text) from anon, authenticated;
