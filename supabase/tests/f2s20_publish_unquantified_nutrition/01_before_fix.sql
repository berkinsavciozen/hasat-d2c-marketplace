-- Reproduces F2-S20 against the pre-fix publish_recipe_draft: the draft's "tuz, damak tadına göre"
-- line (no quantity, no unit) is written without nutrition_exclusion_reason, the calculator counts
-- it as unmatched, and the publish gate rolls the whole transaction back.
\set ON_ERROR_STOP on

do $$
declare
  v_job_id uuid;
  v_error text;
begin
  v_job_id := public.f2s20_seed_publish_job(
    'F2S20 Before', 'f2s20-before-lock',
    jsonb_build_object(
      'crop', null, 'freeTextName', 'tuz', 'quantity', null, 'unit', null, 'note', 'damak tadına göre',
      'isKeyIngredient', false, 'ingredientClass', 'platform_disi', 'sortOrder', 1
    )
  );
  begin
    perform public.publish_recipe_draft(v_job_id, 'f2s20-before-lock', 'f2s20-before');
  exception when others then
    v_error := sqlerrm;
  end;
  if v_error is null or v_error not like 'PUBLISH_NUTRITION_INCOMPLETE:%' then
    raise exception 'ASSERTION FAILED: pre-fix publish should fail with PUBLISH_NUTRITION_INCOMPLETE, got %', coalesce(v_error, '(success)');
  end if;
  if exists (select 1 from public.recipes where slug = 'f2s20-before') then
    raise exception 'ASSERTION FAILED: failed publish left a recipes row behind';
  end if;
end;
$$;
