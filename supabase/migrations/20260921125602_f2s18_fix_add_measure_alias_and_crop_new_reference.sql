
-- F2-S18 bug fix (2026-09-21, dispatched by Berkin: "Asıl kod bug'ı hâlâ duruyor ... bunu biz
-- düzeltelim"). Root cause (verified by reading refresh_draft_nutrition_preview's source):
--
-- (1) add_measure alone can never resolve a freeTextName (food-kind) ingredient with no
--     pre-existing alias, because the measure row it writes is keyed by target_key and nothing
--     links the ingredient's literal text to that target_key — only alias_to_existing /
--     new_reference create that link. Fix: add_measure now also creates the alias for food-kind
--     targets (crop-kind ingredients resolve directly via their own `crop` field, no alias
--     needed or created).
--
-- (2) Crop-typed ingredients missing a crop_nutrition row had NO admin-UI path to fix at all —
--     none of the 4 resolution kinds ever wrote to crop_nutrition. Fix: new_reference now
--     branches on resolution.targetKind ('crop' | 'food', default 'food' for backward
--     compatibility) and writes to crop_nutrition for the crop case.

create or replace function public.admin_resolve_nutrition_unresolved(
  p_job_id uuid,
  p_ingredient_label text,
  p_resolution jsonb,
  p_notes text default null::text,
  p_admin_actor text default null::text
)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_kind text := p_resolution->>'kind';
  v_draft record;
  v_normalized_label text := public.fn_nutrition_normalize_text(p_ingredient_label);
  v_scope jsonb;
  v_target_kind text;
  v_target_key text;
  v_unit text;
  v_grams numeric;
  v_food_key text;
  v_reference_source text;
  v_ingredients jsonb;
  v_ing jsonb;
  v_matched boolean;
  v_outcome text;
  v_preview jsonb;
  v_audit_id uuid;
begin
  if v_kind is null or v_kind not in ('add_measure', 'alias_to_existing', 'new_reference', 'mark_unquantified') then
    raise exception 'ADMIN_NUTRITION_RESOLVE_UNKNOWN_KIND: resolution.kind must be one of add_measure, alias_to_existing, new_reference, mark_unquantified (got %)', v_kind;
  end if;
  if p_ingredient_label is null or btrim(p_ingredient_label) = '' then
    raise exception 'ADMIN_NUTRITION_RESOLVE_INGREDIENT_LABEL_REQUIRED: ingredientLabel is required';
  end if;

  select * into v_draft
  from public.recipe_drafts
  where job_id = p_job_id
  order by version desc
  limit 1;

  if not found then
    raise exception 'ADMIN_NUTRITION_RESOLVE_NO_DRAFT: no recipe_drafts row found for job %', p_job_id;
  end if;

  v_outcome := 'applied';

  if v_kind = 'add_measure' then
    v_scope := p_resolution->'scope';
    if v_scope ? 'crop' and nullif(v_scope->>'crop', '') is not null then
      v_target_kind := 'crop'; v_target_key := v_scope->>'crop';
    elsif v_scope ? 'foodKey' and nullif(v_scope->>'foodKey', '') is not null then
      v_target_kind := 'food'; v_target_key := v_scope->>'foodKey';
    else
      raise exception 'ADMIN_NUTRITION_RESOLVE_INVALID_SCOPE: add_measure requires resolution.scope.crop or resolution.scope.foodKey';
    end if;

    v_unit := public.fn_nutrition_normalize_unit(p_resolution->>'unit');
    if v_unit is null then
      raise exception 'ADMIN_NUTRITION_RESOLVE_INVALID_UNIT: resolution.unit could not be normalized';
    end if;

    v_grams := (p_resolution->>'gramsPerUnit')::numeric;
    if v_grams is null or v_grams <= 0 then
      raise exception 'ADMIN_NUTRITION_RESOLVE_INVALID_GRAMS: resolution.gramsPerUnit must be a positive number';
    end if;

    insert into public.ingredient_measure_reference
      (target_kind, target_key, normalized_unit, grams_per_unit, reference_source, reference_source_id, reference_version, reference_url, notes)
    values
      (v_target_kind, v_target_key, v_unit, v_grams, 'admin_manual', 'admin:' || p_job_id::text, 'unverified',
       'internal://admin-manual-entry',
       'ADMIN GİRİŞİ — canlı kaynakla doğrulanmadı, ' || to_char(now(), 'YYYY-MM-DD') || coalesce(' — ' || p_notes, ''))
    on conflict (target_kind, target_key, normalized_unit) do nothing;

    if not found then
      v_outcome := 'already_exists';
    end if;

    -- Bug fix: ensure the alias exists too, for food-kind targets, regardless of whether the
    -- measure row was newly inserted or already existed (idempotently heals previously-stuck
    -- ingredients the next time an admin touches add_measure for them).
    if v_target_kind = 'food' then
      insert into public.ingredient_nutrition_alias (normalized_alias, target_kind, target_key, rationale)
      values (
        v_normalized_label, 'food', v_target_key,
        'ADMIN GİRİŞİ — add_measure ile birlikte otomatik oluşturuldu, ' || to_char(now(), 'YYYY-MM-DD')
      )
      on conflict (normalized_alias) do nothing;
    end if;

  elsif v_kind = 'alias_to_existing' then
    v_target_kind := p_resolution->>'targetKind';
    v_target_key := nullif(p_resolution->>'targetKey', '');
    if v_target_kind is null or v_target_kind not in ('crop', 'food') or v_target_key is null then
      raise exception 'ADMIN_NUTRITION_RESOLVE_INVALID_TARGET: alias_to_existing requires resolution.targetKind (crop|food) and resolution.targetKey';
    end if;

    insert into public.ingredient_nutrition_alias (normalized_alias, target_kind, target_key, rationale)
    values (
      v_normalized_label, v_target_kind, v_target_key,
      'ADMIN GİRİŞİ — ' || to_char(now(), 'YYYY-MM-DD') || coalesce(' — ' || p_notes, '')
    )
    on conflict (normalized_alias) do nothing;

    if not found then
      v_outcome := 'already_exists';
    end if;

  elsif v_kind = 'new_reference' then
    v_target_kind := coalesce(nullif(p_resolution->>'targetKind', ''), 'food');
    if v_target_kind not in ('crop', 'food') then
      raise exception 'ADMIN_NUTRITION_RESOLVE_INVALID_TARGET_KIND: new_reference resolution.targetKind must be crop or food (got %)', v_target_kind;
    end if;
    if (p_resolution->>'caloriesKcal') is null or (p_resolution->>'proteinG') is null
       or (p_resolution->>'carbsG') is null or (p_resolution->>'fatG') is null
       or (p_resolution->>'fiberG') is null then
      raise exception 'ADMIN_NUTRITION_RESOLVE_INCOMPLETE_MACROS: new_reference requires caloriesKcal, proteinG, carbsG, fatG and fiberG';
    end if;

    if v_target_kind = 'crop' then
      -- Bug fix: crop-typed ingredients resolve directly via their own `crop` field (see
      -- refresh_draft_nutrition_preview) — no alias is needed or created here.
      v_target_key := nullif(p_resolution->>'crop', '');
      if v_target_key is null then
        raise exception 'ADMIN_NUTRITION_RESOLVE_INVALID_CROP: new_reference (targetKind=crop) requires resolution.crop';
      end if;

      if not exists (select 1 from public.crop_config where crop = v_target_key) then
        raise exception 'ADMIN_NUTRITION_RESOLVE_UNKNOWN_CROP: % crop_config tablosunda tanımlı değil', v_target_key;
      end if;

      v_reference_source := coalesce(nullif(p_resolution->>'referenceSource', ''), 'usda');
      if v_reference_source not in ('usda', 'tuber') then
        raise exception 'ADMIN_NUTRITION_RESOLVE_INVALID_REFERENCE_SOURCE: crop_nutrition.reference_source usda veya tuber olmalı (got %)', v_reference_source;
      end if;

      insert into public.crop_nutrition (
        crop, reference_source, reference_source_id, reference_version,
        calories_kcal, protein_g, carbs_g, fat_g, fiber_g, notes
      ) values (
        v_target_key, v_reference_source, 'admin:' || p_job_id::text, 'unverified',
        (p_resolution->>'caloriesKcal')::numeric, (p_resolution->>'proteinG')::numeric,
        (p_resolution->>'carbsG')::numeric, (p_resolution->>'fatG')::numeric, (p_resolution->>'fiberG')::numeric,
        'ADMIN GİRİŞİ — canlı kaynakla doğrulanmadı, ' || to_char(now(), 'YYYY-MM-DD') || coalesce(' — ' || p_notes, '')
      )
      on conflict (crop) do nothing;

      if not found then
        v_outcome := 'already_exists';
      end if;

    else
      v_food_key := nullif(p_resolution->>'foodKey', '');
      if v_food_key is null then
        raise exception 'ADMIN_NUTRITION_RESOLVE_INVALID_FOOD_KEY: new_reference requires resolution.foodKey';
      end if;

      insert into public.ingredient_nutrition_reference (
        food_key, display_name, reference_source, reference_source_id, reference_version, reference_url,
        calories_kcal, protein_g, carbs_g, fat_g, fiber_g, notes
      ) values (
        v_food_key,
        coalesce(nullif(p_resolution->>'displayName', ''), p_ingredient_label),
        'admin_manual', 'admin:' || p_job_id::text, 'unverified', 'internal://admin-manual-entry',
        (p_resolution->>'caloriesKcal')::numeric, (p_resolution->>'proteinG')::numeric,
        (p_resolution->>'carbsG')::numeric, (p_resolution->>'fatG')::numeric, (p_resolution->>'fiberG')::numeric,
        'ADMIN GİRİŞİ — canlı kaynakla doğrulanmadı, ' || to_char(now(), 'YYYY-MM-DD') || coalesce(' — ' || p_notes, '')
      )
      on conflict (food_key) do nothing;

      if not found then
        v_outcome := 'already_exists';
      else
        -- Aynı transaction içinde otomatik alias — spec §2.2 new_reference davranışı.
        insert into public.ingredient_nutrition_alias (normalized_alias, target_kind, target_key, rationale)
        values (
          v_normalized_label, 'food', v_food_key,
          'ADMIN GİRİŞİ — new_reference ile birlikte otomatik oluşturuldu, ' || to_char(now(), 'YYYY-MM-DD')
        )
        on conflict (normalized_alias) do nothing;
      end if;
    end if;

  elsif v_kind = 'mark_unquantified' then
    v_ingredients := '[]'::jsonb;
    v_matched := false;
    for v_ing in select * from jsonb_array_elements(coalesce(v_draft.ingredients, '[]'::jsonb))
    loop
      if public.fn_nutrition_normalize_text(coalesce(nullif(v_ing->>'freeTextName', ''), nullif(v_ing->>'crop', ''))) = v_normalized_label then
        v_matched := true;
        v_ing := v_ing || jsonb_build_object('quantity', null, 'unit', null);
      end if;
      v_ingredients := v_ingredients || jsonb_build_array(v_ing);
    end loop;

    if not v_matched then
      v_outcome := 'ingredient_not_found';
    else
      update public.recipe_drafts
      set ingredients = v_ingredients, updated_at = now()
      where id = v_draft.id;
    end if;
  end if;

  insert into public.nutrition_admin_resolutions
    (job_id, ingredient_label, resolution_kind, resolution, outcome, notes, admin_actor)
  values
    (p_job_id, p_ingredient_label, v_kind, p_resolution, v_outcome, p_notes, p_admin_actor)
  returning id into v_audit_id;

  if v_outcome <> 'applied' then
    return jsonb_build_object('ok', false, 'error', v_outcome, 'auditId', v_audit_id);
  end if;

  v_preview := public.refresh_draft_nutrition_preview(p_job_id);

  return jsonb_build_object('ok', true, 'auditId', v_audit_id, 'preview', v_preview);
end;
$function$;
