-- NOT: bu fonksiyon gövdesi 2026-09-16 içindeki iki ayrı canlı-migration adımının (f2s17 + t4b2_taze_kekik_alias_fix'in küçük bir düzeltmesi) birleşmiş/final hâlidir; ayrıntı için Konsolide-Lansman-Plani ve T4-Nutrition-Onay-Akisi-Bug-Teshis-ve-Spec-2026-09-16.md dokümanlarına bakın.
--
-- F2 Recipe Automation — draft-level nutrition preview (early gate, before publish transaction).
-- Admin onay ekranında publish'e girmeden önce besin değeri coverage'ını göstermek/kontrol etmek
-- için: recipe_drafts'ın JSONB malzeme listesi üzerinde calculate_recipe_nutrition ile aynı eşleme
-- mantığını çalıştırıp sonucu draftın kendi satırına yazan bir önizleme fonksiyonu.
-- Bkz. proje dokümanı: T4-Nutrition-Onay-Akisi-Bug-Teshis-ve-Spec-2026-09-16.md §7.

alter table public.recipe_drafts
  add column if not exists nutrition_preview jsonb,
  add column if not exists nutrition_preview_computed_at timestamptz;

create or replace function public.refresh_draft_nutrition_preview(p_job_id uuid)
 returns jsonb
 language plpgsql
 set search_path to ''
as $function$
declare
  v_draft record;
  v_servings numeric;
  v_ing jsonb;
  v_crop text;
  v_free_text text;
  v_quantity numeric;
  v_unit text;
  v_resolved_food_key text;
  v_resolved_crop text;
  v_alias record;
  v_grams numeric;
  v_ref record;
  v_total numeric := 0;
  v_matched numeric := 0;
  v_cal_sum numeric := 0;
  v_pro_sum numeric := 0;
  v_carb_sum numeric := 0;
  v_fat_sum numeric := 0;
  v_fiber_sum numeric := 0;
  v_unresolved jsonb := '[]'::jsonb;
  v_unresolved_flag boolean := false;
  v_coverage numeric;
  v_source text;
  v_result jsonb;
  v_idx int := 0;
  v_label text;
begin
  select * into v_draft
  from public.recipe_drafts
  where job_id = p_job_id
  order by version desc
  limit 1;

  if not found then
    raise exception 'DRAFT_NUTRITION_PREVIEW_NO_DRAFT: no recipe_drafts row found for job %', p_job_id;
  end if;

  v_servings := v_draft.servings;

  for v_ing in select * from jsonb_array_elements(coalesce(v_draft.ingredients, '[]'::jsonb))
  loop
    v_idx := v_idx + 1;
    v_crop := nullif(v_ing->>'crop', '');
    v_free_text := nullif(v_ing->>'freeTextName', '');
    v_quantity := nullif(v_ing->>'quantity', '')::numeric;
    v_unit := nullif(v_ing->>'unit', '');
    v_label := coalesce(v_free_text, v_crop, '(bilinmeyen malzeme)');

    if v_quantity is null and v_unit is null then
      continue;
    end if;

    v_resolved_crop := v_crop;
    v_resolved_food_key := null;

    if v_crop is null then
      select a.target_kind, a.target_key into v_alias
      from public.ingredient_nutrition_alias a
      where a.normalized_alias = public.fn_nutrition_normalize_text(v_free_text);
      if found then
        if v_alias.target_kind = 'food' then
          v_resolved_food_key := v_alias.target_key;
        elsif v_alias.target_kind = 'crop' then
          v_resolved_crop := v_alias.target_key;
        end if;
      end if;
    end if;

    v_grams := public.fn_recipe_ingredient_grams_v2(v_resolved_crop, v_resolved_food_key, v_free_text, v_quantity, v_unit);

    if v_grams is null then
      v_unresolved_flag := true;
      v_unresolved := v_unresolved || jsonb_build_object(
        'sortOrder', coalesce((v_ing->>'sortOrder')::int, v_idx),
        'name', v_label,
        'reason', 'quantity_or_unit_not_resolvable'
      );
      continue;
    end if;

    v_total := v_total + v_grams;

    select coalesce(fr.calories_kcal, cn.calories_kcal) as calories_kcal,
           coalesce(fr.protein_g, cn.protein_g) as protein_g,
           coalesce(fr.carbs_g, cn.carbs_g) as carbs_g,
           coalesce(fr.fat_g, cn.fat_g) as fat_g,
           coalesce(fr.fiber_g, cn.fiber_g) as fiber_g
    into v_ref
    from (values (1)) as dummy(x)
    left join public.ingredient_nutrition_reference fr on fr.food_key = v_resolved_food_key
    left join public.crop_nutrition cn on cn.crop = v_resolved_crop;

    if v_ref.calories_kcal is null or v_ref.protein_g is null or v_ref.carbs_g is null
       or v_ref.fat_g is null or v_ref.fiber_g is null then
      v_unresolved_flag := true;
      v_unresolved := v_unresolved || jsonb_build_object(
        'sortOrder', coalesce((v_ing->>'sortOrder')::int, v_idx),
        'name', v_label,
        'reason', 'nutrition_reference_missing'
      );
      continue;
    end if;

    v_matched := v_matched + v_grams;
    v_cal_sum := v_cal_sum + v_grams * v_ref.calories_kcal / 100;
    v_pro_sum := v_pro_sum + v_grams * v_ref.protein_g / 100;
    v_carb_sum := v_carb_sum + v_grams * v_ref.carbs_g / 100;
    v_fat_sum := v_fat_sum + v_grams * v_ref.fat_g / 100;
    v_fiber_sum := v_fiber_sum + v_grams * v_ref.fiber_g / 100;
  end loop;

  if v_matched <= 0 or v_servings is null or v_servings <= 0 then
    v_result := jsonb_build_object(
      'coverage_pct', 0,
      'source', 'unavailable',
      'calories', null,
      'protein_g', null,
      'carbs_g', null,
      'fat_g', null,
      'fiber_g', null,
      'unresolved', v_unresolved,
      'computed_at', now()
    );
  else
    v_coverage := round(v_matched / nullif(v_total, 0) * 100, 2);
    if v_unresolved_flag then
      v_coverage := least(v_coverage, 99.99);
    end if;
    v_source := case when not v_unresolved_flag and v_coverage = 100 then 'computed' else 'partial' end;
    v_result := jsonb_build_object(
      'coverage_pct', v_coverage,
      'source', v_source,
      'calories', round(v_cal_sum / v_servings, 2),
      'protein_g', round(v_pro_sum / v_servings, 2),
      'carbs_g', round(v_carb_sum / v_servings, 2),
      'fat_g', round(v_fat_sum / v_servings, 2),
      'fiber_g', round(v_fiber_sum / v_servings, 2),
      'unresolved', v_unresolved,
      'computed_at', now()
    );
  end if;

  update public.recipe_drafts
  set nutrition_preview = v_result,
      nutrition_preview_computed_at = now()
  where id = v_draft.id;

  return v_result;
end;
$function$;

grant execute on function public.refresh_draft_nutrition_preview(uuid) to authenticated, service_role;
