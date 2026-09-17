-- Same recurring gap this project has closed repeatedly (b1/b2/f024b/t6 backlog/t9): Supabase
-- auto-grants EXECUTE on a newly created function directly to `anon` AND `authenticated` (not via
-- the `PUBLIC` pseudo-role), so the previous migration's `revoke all ... from public` never touched
-- those direct grants. `rpc_get_shared_recipe` is meant to be anon-callable (that grant stays); the
-- other three — rpc_generate_recipe_share_token, rpc_revoke_recipe_share_token,
-- rpc_clone_shared_recipe — all start with `if auth.uid() is null then raise exception`, so an anon
-- call was never a real authorization bypass, but closing the direct grant is the same
-- defense-in-depth this repo already applies everywhere else in this class.
--
-- Rollback: `grant execute on function public.rpc_generate_recipe_share_token(uuid),
-- public.rpc_revoke_recipe_share_token(uuid), public.rpc_clone_shared_recipe(uuid) to anon;`
-- restores the pre-this-migration (over-permissive) state.

revoke execute on function public.rpc_generate_recipe_share_token(uuid) from anon;
revoke execute on function public.rpc_revoke_recipe_share_token(uuid) from anon;
revoke execute on function public.rpc_clone_shared_recipe(uuid) from anon;
