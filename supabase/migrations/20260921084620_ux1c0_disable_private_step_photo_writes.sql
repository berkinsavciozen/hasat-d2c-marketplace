-- UX-1C-0 launch containment: stop new client writes to the legacy public
-- recipe-step-photos bucket without changing existing object reads or the
-- UX-1B canonical step-photo reference contract.
--
-- Production preflight (2026-09-21): the already-applied UX-1B migration is
-- recorded as 20260918091532_ux1b_private_step_photo_preservation while the
-- repository file is 20260918090000_ux1b_private_step_photo_preservation.sql.
-- Do not replay or repair that applied migration. This forward-only migration
-- intentionally follows both identifiers.
--
-- ACL / RLS after this migration for bucket_id = 'recipe-step-photos':
--   anon          SELECT yes; INSERT/UPDATE/DELETE no
--   authenticated SELECT yes; INSERT/UPDATE no; owner-path DELETE yes
--   service_role  unchanged (BYPASSRLS)
--
-- The bucket row remains public and is not renamed or deleted. Existing
-- objects and recipe_steps.photo_url values are not modified. UX-1C-1+ owns
-- the private bucket, signed URL/resolver, backfill, cleanup, and cutover.
--
-- Rollback / forward-stop boundary: stop the dependent mobile rollout first.
-- Re-enabling uploads requires an explicit new reviewed migration; do not
-- repair migration history or silently recreate the removed write policies.

drop policy if exists "recipe-step-photos owner insert" on storage.objects;
drop policy if exists "recipe-step-photos owner update" on storage.objects;

-- Keep cleanup available to the authenticated owner, but remove the legacy
-- PUBLIC role target so anonymous callers are not even candidates for DELETE.
drop policy if exists "recipe-step-photos owner delete" on storage.objects;
create policy "recipe-step-photos owner delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'recipe-step-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
