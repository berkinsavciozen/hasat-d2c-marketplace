-- T7a + F11 — backend contract, built directly this turn (Cowork/orkestratör oturumu, Supabase MCP
-- ile canlıya uygulanıyor — Claude Code dispatch'i değil, Berkin'in "sen hızlıca tamamlasan" talebi
-- ve ardından AskUserQuestion ile onaylanan "devam et, hukuki risk kabul" kararı üzerine).
--
-- =================================================================================================
-- T7a — bitmiş/pişmiş yemek FOTOĞRAFINDAN AI tahmini tarif.
-- =================================================================================================
-- extract-recipe/index.ts'in kendi başlık yorumu bu senaryoyu açıkça "⛔ ... bitmiş yemek
-- fotoğrafından tahmin -> M9 (hukuki kontrol şartlı)" diye işaretlemişti. Berkin'e bu gate açıkça
-- soruldu (kural #107); cevap: "Devam et, hukuki risk kabul" — ama şu sınırlarla:
--   1. Çıktı DAİMA visibility='private', status='draft' — hiçbir şekilde F2'nin editoryal/public
--      pipeline'ına girmiyor, T3-B'nin allergen/nutrition publish-gate'i bu satırı asla atlamıyor
--      (bu fonksiyon allergen_labels/allergens_reviewed/nutrition_* kolonlarına HİÇ dokunmuyor —
--      DB default'ları (unreviewed) geçerli kalıyor, extract-recipe ile birebir aynı disiplin).
--   2. API yanıtı DAİMA sunucu tarafında sabitlenmiş bir uyarı metni taşıyor (model çıktısına
--      bağlı değil) — UI dispatch'inde bu uyarının kullanıcıya belirgin şekilde gösterilmesi
--      ZORUNLU koşul olarak not edildi (Lovable/mobil dispatch dokümanlarında).
--   3. Sistem prompt'u modelin "bu bir tahmindir, düşük görünürlükte malzeme/gizli alerjen riskini
--      itiraf et" demesini zorluyor (bkz. edge function).
--
-- recipes_source_type_check'e yeni değer: 'photo_estimate'.
--
-- =================================================================================================
-- F11 — bağımsız tarif klonlama (AI yok, T6'nın Faz B iskeletinin AI'sız/salt-kopya hali).
-- =================================================================================================
-- Berkin'in "T7a UI, T6 UI ve F11 UI Lovable'a" talebini işlevsel bir backend'e bağlamak için,
-- F11'in var olan cloned_from_recipe_id altyapısını (T6 ile paylaşılan) LLM adımı olmadan, doğrudan
-- kaynak tarifin ingredient/step satırlarını kopyalayan tek bir SECURITY INVOKER RPC ile kapatıyoruz.
-- T6'nın kendi discovery notları (bu dosyanın referans aldığı 20260910100000 migration'ı) burada da
-- geçerli: recipes/recipe_ingredients/recipe_steps RLS'i owner_id=auth.uid() + visibility='private'
-- insert'e zaten izin veriyor, ayrı bir tablo/idempotency mekanizmasına gerek yok (F11 tek adımlık
-- bir "klonla" butonu, T6'nın 2 fazlı AI-öneri akışı değil).
--
-- Kaynak uygunluk kuralı T6 ile BİREBİR aynı tutuldu (visibility='public' AND status='published' AND
-- author_type<>'kullanici') — bu bilinçli bir varsayım, UI/ürün tarafında onaylanmadıysa
-- gevşetilebilir; rapora açık risk olarak not düşüldü.
--
-- Kopyalanmayanlar (bilinçli, açık risk): recipe_steps.photo_url (kaynağın adım fotoğrafları
-- klonlanan taslağa taşınmıyor — storage/ownership varsayımı netleşene kadar).
--
-- Rollback: her iki parça da katkısal (additive) — constraint eski haline döndürülebilir
-- (recipes_source_type_check'i 'photo_estimate'/'clone' olmadan yeniden oluştur), RPC drop edilebilir.

-- =================================================================================================
-- Part 1 — recipes_source_type_check genişletme (T7a + F11 birlikte).
-- =================================================================================================

alter table public.recipes
  drop constraint recipes_source_type_check;

alter table public.recipes
  add constraint recipes_source_type_check
  check (source_type = any (array[
    'manual'::text, 'text'::text, 'photo'::text, 'url'::text,
    'ai_customize'::text, 'photo_estimate'::text, 'clone'::text
  ]));

-- =================================================================================================
-- Part 2 — F11: rpc_clone_recipe.
-- =================================================================================================

create or replace function public.rpc_clone_recipe(p_source_recipe_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_source record;
  v_new_recipe_id uuid;
  v_slug text;
  v_suffix text;
  v_attempt integer := 0;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select id, slug, title, description, cover_photo_url, servings, prep_minutes, cook_minutes,
         rest_minutes, difficulty, cuisine, diet_tags, required_equipment, visibility, status,
         author_type
  into v_source
  from public.recipes
  where id = p_source_recipe_id;

  if v_source.id is null then
    raise exception 'source recipe not found';
  end if;
  if v_source.visibility <> 'public' or v_source.status <> 'published' or v_source.author_type = 'kullanici' then
    raise exception 'source recipe is not eligible for cloning (must be public, published, and not author_type=kullanici)';
  end if;

  -- Slug: recipes.slug'ın DB seviyesinde unique constraint'i yok (T6 discovery #6 ile aynı gerçek) —
  -- uygulama seviyesinde, bu transaction içinde çakışma kontrolü yapılıyor.
  loop
    v_suffix := substr(md5(random()::text || clock_timestamp()::text), 1, 6);
    v_slug := coalesce(v_source.slug, 'tarif') || '-klon-' || v_suffix
      || case when v_attempt = 0 then '' else '-' || v_attempt::text end;
    exit when not exists (select 1 from public.recipes where slug = v_slug);
    v_attempt := v_attempt + 1;
    if v_attempt > 20 then
      raise exception 'could not derive a unique slug after % attempts', v_attempt;
    end if;
  end loop;

  -- allergen/nutrition kolonları BİLİNÇLİ OLARAK bu insert'in dışında — DB default'ları
  -- (allergens_reviewed=false, nutrition_source=null) geçerli kalır: klon, kaynağın "reviewed"
  -- durumunu miras almaz, sahibi kendi review akışından geçirmek zorunda kalır.
  insert into public.recipes (
    slug, title, description, cover_photo_url, servings, prep_minutes, cook_minutes, rest_minutes,
    difficulty, cuisine, diet_tags, required_equipment,
    status, visibility, source_type, owner_id, author_type, cloned_from_recipe_id
  ) values (
    v_slug, v_source.title, v_source.description, v_source.cover_photo_url, v_source.servings,
    v_source.prep_minutes, v_source.cook_minutes, v_source.rest_minutes,
    v_source.difficulty, v_source.cuisine, v_source.diet_tags, v_source.required_equipment,
    'draft', 'private', 'clone', auth.uid(), 'kullanici', p_source_recipe_id
  )
  returning id into v_new_recipe_id;

  insert into public.recipe_ingredients (
    recipe_id, sort_order, crop, free_text_name, quantity, unit, note, is_key_ingredient, ingredient_class
  )
  select
    v_new_recipe_id, sort_order, crop, free_text_name, quantity, unit, note, is_key_ingredient, ingredient_class
  from public.recipe_ingredients
  where recipe_id = p_source_recipe_id;

  -- photo_url bilinçli olarak kopyalanmıyor (yukarıdaki dosya başlığı notu).
  insert into public.recipe_steps (
    recipe_id, step_no, instruction, timer_seconds
  )
  select
    v_new_recipe_id, step_no, instruction, timer_seconds
  from public.recipe_steps
  where recipe_id = p_source_recipe_id;

  return v_new_recipe_id;
end;
$$;

comment on function public.rpc_clone_recipe(uuid) is
  'F11. Bağımsız tarif klonlama: public+published+author_type<>kullanici kaynaktan, AI adımı '
  'olmadan, ingredient/step satırlarını birebir kopyalayarak çağıranın kendi private/draft '
  'tarifini oluşturur. SECURITY INVOKER — mevcut recipes/recipe_ingredients/recipe_steps RLS''ine '
  'dayanır. allergen/nutrition kolonları kasıtlı olarak kopyalanmaz (DB default = unreviewed).';

revoke all on function public.rpc_clone_recipe(uuid) from public;
grant execute on function public.rpc_clone_recipe(uuid) to authenticated;
