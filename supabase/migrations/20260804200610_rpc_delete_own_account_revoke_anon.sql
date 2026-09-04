-- Supabase's default privileges auto-grant EXECUTE to anon/authenticated on
-- function creation (same pattern as kural #110's view-grant surprise) --
-- "revoke all from public" in the previous migration does not touch that.
-- The function already guards on auth.uid() is null, but close the anon
-- grant explicitly to match project convention (least-privilege by default).
revoke execute on function public.rpc_delete_own_account() from anon;
