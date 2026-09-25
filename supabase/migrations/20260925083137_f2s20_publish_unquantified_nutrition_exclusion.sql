-- F2-S20 — publish_recipe_draft: miktarsız ("damak tadına göre") malzemeler için
-- nutrition_exclusion_reason yazımı. 2026-09-24 kuyruk temizliğinde bulundu.
--
-- Hata: iki besin hesaplayıcısı miktarsız satırı farklı yorumluyordu.
--   * refresh_draft_nutrition_preview (onay öncesi kapı, f2s17/f2s18): quantity VE unit boşsa satırı
--     sessizce ATLIYOR — "tuz, damak tadına göre" kapsama hesabına girmiyor, önizleme %100 çıkıyor,
--     admin onayı geçiyor.
--   * calculate_recipe_nutrition (publish sonrası tg_finalize_recipe_facts_on_publish_job):
--     yalnız nutrition_exclusion_reason dolu satırları atlıyor; miktarsız satır için
--     fn_recipe_ingredient_grams_v2 null döndüğünden "unmatched_ingredient" sayıp kapsamı 99.99'a
--     kırpıyor → trigger PUBLISH_NUTRITION_INCOMPLETE ile tüm publish transaction'ını geri alıyor.
--   publish_recipe_draft recipe_ingredients'a hiç nutrition_exclusion_reason yazmadığından köprü
--   kurulmuyordu: onaylanan iş publish'te düşüyordu.
--
-- Düzeltme (tek fonksiyon, tek satır grubu): publish_recipe_draft, taslak malzemesinde quantity ve
-- unit ikisi de boş/null ise satırı nutrition_exclusion_reason = 'seasoning_to_taste_unquantified'
-- ile yazıyor. Koşul, önizlemenin kendi atlama koşuluyla birebir aynı (nullif(...,'') ikisi için
-- de), yani iki hesaplayıcı artık aynı satır kümesini dışlıyor. Bu, t4b_close_13_recipes'in
-- mevcut tarifler için elle uyguladığı ve admin_resolve_nutrition_unresolved'ın
-- 'mark_unquantified' yolunun dayandığı etiketin aynısı. Satırın nutrition_food_key'i publish'te
-- hiç yazılmadığından recipe_ingredients_nutrition_resolution_check ile çakışma yok.
--
-- Fonksiyonun geri kalanı 20260917120000 baseline'daki tanımla birebir aynı. CREATE OR REPLACE
-- mevcut grant'leri korur. Backfill gerekmiyor: düşen publish'ler rollback olduğundan
-- recipe_ingredients'ta etkilenmiş satır kalmadı; PUBLISH_NUTRITION_INCOMPLETE ile failed olan
-- işler panelden "Aşamayı Yeniden Dene" ile tekrar publish edilebilir.

create or replace function public.publish_recipe_draft(_job_id uuid, _lock_token text, _slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_job record;
  v_draft record;
  v_qa record;
  v_hero record;
  v_square record;
  v_admin_approved boolean;
  v_draft_json jsonb;
  v_structure jsonb;
  v_crop_values jsonb;
  v_recipe_id uuid;
  v_base_url text;
  v_cover_photo_url text;
  v_ingredient jsonb;
  v_step jsonb;
  v_ingredient_count integer;
  v_step_count integer;
  v_updated_job_id uuid;
  v_missing_assets text[];
begin
  select * into v_job from public.recipe_generation_jobs where id = _job_id for update;
  if not found then
    raise exception 'PUBLISH_JOB_NOT_FOUND: job % not found', _job_id;
  end if;

  if v_job.recipe_id is not null then
    return jsonb_build_object(
      'ok', true,
      'recipeId', v_job.recipe_id,
      'slug', (select slug from public.recipes where id = v_job.recipe_id),
      'alreadyPublished', true
    );
  end if;

  if v_job.locked_by is distinct from _lock_token or v_job.stage <> 'publish' or v_job.status <> 'running' then
    raise exception 'PUBLISH_LOCK_LOST: job % is not held at stage=publish/status=running under the expected lock token', _job_id;
  end if;

  if _slug is null or _slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'PUBLISH_SLUG_INVALID_FORMAT: slug "%" is not lowercase alphanumeric segments separated by single hyphens', _slug;
  end if;

  select * into v_draft
  from public.recipe_drafts
  where job_id = _job_id
  order by version desc
  limit 1;

  if not found then
    raise exception 'PUBLISH_NO_DRAFT: job % has no recipe_drafts row', _job_id;
  end if;

  select * into v_qa
  from public.recipe_qa_results
  where job_id = _job_id and draft_id = v_draft.id and draft_version = v_draft.version;

  if not found then
    raise exception 'PUBLISH_QA_RESULT_MISSING: no recipe_qa_results row for job %, draft %, version %', _job_id, v_draft.id, v_draft.version;
  end if;
  if v_qa.decision <> 'approved' or jsonb_array_length(v_qa.blocking_issues) > 0 then
    raise exception 'PUBLISH_QA_NOT_CLEAN: latest QA result for this exact draft version is not an approved, blocker-free decision';
  end if;

  select exists(
    select 1 from public.recipe_admin_reviews
    where job_id = _job_id and draft_id = v_draft.id and draft_version = v_draft.version and action = 'approve'
  ) into v_admin_approved;
  if not v_admin_approved then
    raise exception 'PUBLISH_SAFETY_CHECKLIST_INCOMPLETE: no recipe_admin_reviews approve row for job %, draft %, version %', _job_id, v_draft.id, v_draft.version;
  end if;

  select * into v_hero from public.recipe_assets
    where job_id = _job_id and draft_id = v_draft.id and asset_type = 'hero';
  select * into v_square from public.recipe_assets
    where job_id = _job_id and draft_id = v_draft.id and asset_type = 'square';
  if v_hero is null or v_square is null then
    v_missing_assets := array_remove(array[
      case when v_hero is null then 'hero' end,
      case when v_square is null then 'square' end
    ], null);
    raise exception 'PUBLISH_MISSING_ASSETS: job % is missing recipe_assets row(s): %', _job_id, array_to_string(v_missing_assets, ', ');
  end if;

  v_draft_json := jsonb_build_object(
    'title', v_draft.title,
    'servings', v_draft.servings,
    'prepMinutes', v_draft.prep_minutes,
    'cookMinutes', v_draft.cook_minutes,
    'restMinutes', v_draft.rest_minutes,
    'difficulty', v_draft.difficulty,
    'ingredients', v_draft.ingredients,
    'steps', v_draft.steps
  );
  v_structure := public.validate_recipe_structure(v_draft_json);
  if not (v_structure->>'valid')::boolean then
    raise exception 'PUBLISH_VALIDATION_FAILED: draft failed validate_recipe_structure: %', v_structure->'issues';
  end if;
  v_crop_values := public.validate_recipe_crop_values(v_draft_json);
  if not (v_crop_values->>'valid')::boolean then
    raise exception 'PUBLISH_VALIDATION_FAILED: draft failed validate_recipe_crop_values: %', v_crop_values->'issues';
  end if;

  begin
    insert into public.recipes (
      slug, title, description, cover_photo_url, servings, prep_minutes, cook_minutes, rest_minutes,
      difficulty, cuisine, diet_tags, status, visibility, source_type, owner_id, author_type,
      extraction_confidence, allergen_labels, required_equipment
    ) values (
      _slug, v_draft.title, v_draft.description, null, v_draft.servings, v_draft.prep_minutes,
      v_draft.cook_minutes, v_draft.rest_minutes, v_draft.difficulty, v_draft.cuisine, v_draft.diet_tags,
      'draft', v_draft.visibility, v_draft.source_type, v_draft.owner_id, v_draft.author_type,
      v_draft.extraction_confidence, v_draft.allergen_labels, v_draft.required_equipment
    )
    returning id into v_recipe_id;
  exception when unique_violation then
    raise exception 'PUBLISH_SLUG_ALREADY_USED: slug "%" is already used by an existing recipe', _slug;
  end;

  v_ingredient_count := 0;
  for v_ingredient in select * from jsonb_array_elements(v_draft.ingredients)
  loop
    insert into public.recipe_ingredients (
      recipe_id, crop, free_text_name, quantity, unit, note, is_key_ingredient, ingredient_class, sort_order,
      nutrition_exclusion_reason
    ) values (
      v_recipe_id,
      nullif(v_ingredient->>'crop', ''),
      nullif(v_ingredient->>'freeTextName', ''),
      (v_ingredient->>'quantity')::numeric,
      v_ingredient->>'unit',
      v_ingredient->>'note',
      coalesce((v_ingredient->>'isKeyIngredient')::boolean, false),
      nullif(v_ingredient->>'ingredientClass', ''),
      coalesce((v_ingredient->>'sortOrder')::integer, 0),
      -- F2-S20: refresh_draft_nutrition_preview'un "miktarsız satırı atla" kuralının birebir aynısı
      -- (quantity VE unit boş/null) — onay kapısında hesaba katılmayan satır, publish'te de
      -- calculate_recipe_nutrition'a "bilinçli dışlandı" olarak gitmeli, "çözümsüz" olarak değil.
      case
        when nullif(v_ingredient->>'quantity', '') is null and nullif(v_ingredient->>'unit', '') is null
          then 'seasoning_to_taste_unquantified'
      end
    );
    v_ingredient_count := v_ingredient_count + 1;
  end loop;

  v_step_count := 0;
  for v_step in select * from jsonb_array_elements(v_draft.steps)
  loop
    insert into public.recipe_steps (recipe_id, step_no, instruction, photo_url, timer_seconds)
    values (
      v_recipe_id,
      (v_step->>'stepNo')::integer,
      v_step->>'instruction',
      nullif(v_step->>'photoUrl', ''),
      nullif(v_step->>'timerSeconds', '')::integer
    );
    v_step_count := v_step_count + 1;
  end loop;

  v_base_url := coalesce(current_setting('app.supabase_url', true), 'https://efuqpiaavrzimvstpdpm.supabase.co');
  v_cover_photo_url := v_base_url || '/storage/v1/object/public/' || v_hero.storage_bucket || '/' || v_hero.storage_path;
  update public.recipes set cover_photo_url = v_cover_photo_url where id = v_recipe_id;
  update public.recipe_assets set recipe_id = v_recipe_id where job_id = _job_id and draft_id = v_draft.id;

  if (select count(*) from public.recipe_ingredients where recipe_id = v_recipe_id) <> v_ingredient_count then
    raise exception 'PUBLISH_FINAL_VALIDATION_FAILED: ingredient row count mismatch for recipe %', v_recipe_id;
  end if;
  if (select count(*) from public.recipe_steps where recipe_id = v_recipe_id) <> v_step_count then
    raise exception 'PUBLISH_FINAL_VALIDATION_FAILED: step row count mismatch for recipe %', v_recipe_id;
  end if;

  update public.recipes set status = 'published' where id = v_recipe_id;

  update public.recipe_generation_jobs
  set recipe_id = v_recipe_id,
      status = 'completed',
      completed_at = now(),
      started_at = coalesce(started_at, now()),
      finished_at = now(),
      locked_by = null,
      locked_at = null,
      lock_expires_at = null
  where id = _job_id and locked_by = _lock_token and stage = 'publish' and status = 'running'
  returning id into v_updated_job_id;

  if v_updated_job_id is null then
    raise exception 'PUBLISH_LOCK_LOST_AT_COMMIT: lock was lost while publishing job %', _job_id;
  end if;

  return jsonb_build_object('ok', true, 'recipeId', v_recipe_id, 'slug', _slug, 'alreadyPublished', false);
end;
$function$;
