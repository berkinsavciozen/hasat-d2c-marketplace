create or replace function public.admin_resolve_nutrition_unresolved(
  p_job_id uuid,
  p_ingredient_label text,
  p_resolution jsonb,
  p_notes text default null,
  p_admin_actor text default null
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
    v_food_key := nullif(p_resolution->>'foodKey', '');
    if v_food_key is null then
      raise exception 'ADMIN_NUTRITION_RESOLVE_INVALID_FOOD_KEY: new_reference requires resolution.foodKey';
    end if;
    if (p_resolution->>'caloriesKcal') is null or (p_resolution->>'proteinG') is null
       or (p_resolution->>'carbsG') is null or (p_resolution->>'fatG') is null
       or (p_resolution->>'fiberG') is null then
      raise exception 'ADMIN_NUTRITION_RESOLVE_INCOMPLETE_MACROS: new_reference requires caloriesKcal, proteinG, carbsG, fatG and fiberG';
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
