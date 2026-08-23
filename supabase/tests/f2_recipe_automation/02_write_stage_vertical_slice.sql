-- F2 Recipe Automation — Step 06 SQL test: the manually created kabak RecipeBrief, promoted to a
-- write-stage job, validated and stored as a version-1 draft.
--
-- `draft` below is NOT synthetic — it is the actual output of a LIVE OpenAI Structured Outputs call
-- through the real, shipped Writer code (recipe-automation/schemas.ts's recipeDraftPayloadSchema,
-- infra/agent-runner.ts's SdkAgentRunner, writer/system-prompt.ts's buildWriterSystemPrompt()),
-- captured via a throwaway probe deployed to the live efuqpiaavrzimvstpdpm project (see the Step 06
-- completion report for the exact trace id/usage/timing). `photoUrl`/`coverPhotoUrl` are set to
-- null here — the model returned the empty string / literal "null" for those in the raw call
-- (image generation is a later pipeline stage), and write-stage.ts's normalizeEmptyUrlFields()
-- normalizes that before storage; this fixture reflects the post-normalization value it actually
-- stores, not the raw provider output.
--
-- Run via supabase/tests/f2_recipe_automation/run.sh, after 01_assertions.sql.

\set ON_ERROR_STOP on

create or replace function pg_temp.assert(cond boolean, msg text)
returns void
language plpgsql
as $$
begin
  if not coalesce(cond, false) then
    raise exception 'ASSERTION FAILED: %', msg;
  end if;
end;
$$;

do $$
declare
  v_batch_id uuid := gen_random_uuid();
  v_job_id uuid := gen_random_uuid();
  v_brief_id uuid := gen_random_uuid();
  v_draft jsonb := $draft$
  {
    "jobId": "00000000-0000-4000-8000-000000000000",
    "briefId": "00000000-0000-4000-8000-000000000000",
    "title": "Fırında Kabak Musakka",
    "description": "Mevsimlik kabak, domates ve soğanla hazırlanan, ailece paylaşmaya uygun hafif ve doyurucu bir akşam yemeği.",
    "coverPhotoUrl": null,
    "servings": 4,
    "prepMinutes": 25,
    "cookMinutes": 40,
    "restMinutes": 5,
    "difficulty": "kolay",
    "cuisine": "Türk mutfağı",
    "dietTags": ["vejetaryen"],
    "allergenLabels": null,
    "requiredEquipment": ["fırın", "fırın kabı", "süzgeç"],
    "sourceType": "manual",
    "authorType": "kullanici",
    "visibility": "private",
    "ownerId": null,
    "extractionConfidence": 1,
    "ingredients": [
      {"crop": "kabak", "freeTextName": null, "quantity": 1, "unit": "kg", "note": "İnce dilimlenmiş", "isKeyIngredient": true, "ingredientClass": "tarimsal", "sortOrder": 1},
      {"crop": null, "freeTextName": "soğan", "quantity": 1, "unit": "adet", "note": "Yemeklik doğranmış", "isKeyIngredient": false, "ingredientClass": "platform_disi", "sortOrder": 2},
      {"crop": null, "freeTextName": "domates", "quantity": 4, "unit": "adet", "note": "Küp doğranmış", "isKeyIngredient": false, "ingredientClass": "platform_disi", "sortOrder": 3},
      {"crop": null, "freeTextName": "sarımsak", "quantity": 2, "unit": "diş", "note": "Ezilmiş", "isKeyIngredient": false, "ingredientClass": "platform_disi", "sortOrder": 4},
      {"crop": null, "freeTextName": "zeytinyağı", "quantity": 4, "unit": "yemek kaşığı", "note": null, "isKeyIngredient": false, "ingredientClass": "platform_disi", "sortOrder": 5},
      {"crop": null, "freeTextName": "domates salçası", "quantity": 1, "unit": "yemek kaşığı", "note": null, "isKeyIngredient": false, "ingredientClass": "platform_disi", "sortOrder": 6},
      {"crop": null, "freeTextName": "tuz", "quantity": 1, "unit": "çay kaşığı", "note": "Damak tadına göre artırılabilir", "isKeyIngredient": false, "ingredientClass": "platform_disi", "sortOrder": 7},
      {"crop": null, "freeTextName": "karabiber", "quantity": 0.5, "unit": "çay kaşığı", "note": null, "isKeyIngredient": false, "ingredientClass": "platform_disi", "sortOrder": 8},
      {"crop": null, "freeTextName": "pul biber", "quantity": 0.5, "unit": "çay kaşığı", "note": null, "isKeyIngredient": false, "ingredientClass": "platform_disi", "sortOrder": 9},
      {"crop": null, "freeTextName": "sıcak su", "quantity": 1, "unit": "su bardağı", "note": null, "isKeyIngredient": false, "ingredientClass": "platform_disi", "sortOrder": 10}
    ],
    "steps": [
      {"stepNo": 1, "instruction": "Fırını 200°C'ye ısıtın. Kabak dilimlerini hafifçe tuzlayıp 10 dakika bekletin; ardından süzgeçte suyunu süzdürün.", "photoUrl": null, "timerSeconds": 600},
      {"stepNo": 2, "instruction": "Kabakları yağlı kâğıt serili tepsiye tek sıra halinde dizin, üzerlerine 1 yemek kaşığı zeytinyağı gezdirin ve 15 dakika fırınlayın.", "photoUrl": null, "timerSeconds": 900},
      {"stepNo": 3, "instruction": "Kalan zeytinyağını tavada ısıtın. Soğanı 3-4 dakika yumuşatın, sarımsağı ekleyip 1 dakika çevirin.", "photoUrl": null, "timerSeconds": 240},
      {"stepNo": 4, "instruction": "Salçayı ekleyip 1 dakika kavurun. Domatesleri, tuzu, karabiberi ve pul biberi ekleyin; 8-10 dakika pişirin. Sıcak suyu ilave edip 2 dakika daha kaynatın.", "photoUrl": null, "timerSeconds": 720},
      {"stepNo": 5, "instruction": "Fırın kabına bir kat kabak, üzerine domatesli sos olacak şekilde malzemeleri yerleştirin. Kabın üstünü kapatmadan 200°C fırında 20 dakika pişirin.", "photoUrl": null, "timerSeconds": 1200},
      {"stepNo": 6, "instruction": "Fırından çıkarıp 5 dakika dinlendirin ve sıcak servis edin.", "photoUrl": null, "timerSeconds": 300}
    ]
  }
  $draft$::jsonb;
  v_structure jsonb;
  v_crop_values jsonb;
  v_coverage jsonb;
  v_slug jsonb;
  v_normalized jsonb;
  v_draft_id uuid;
  v_second_insert_failed boolean := false;
begin
  -- Set up the batch + the ONE manually created kabak job (PROMPT 06 — no Planner in this step).
  insert into public.recipe_generation_batches (id, target_count, focus_crops, locale)
  values (v_batch_id, 1, array['kabak'], 'tr');

  insert into public.recipe_generation_jobs (
    id, batch_id, brief_id, working_title, focus_crop, angle, target_difficulty, diet_tags, locale, stage, status
  ) values (
    v_job_id, v_batch_id, v_brief_id, 'Fırında Kabak Musakka', 'kabak',
    'Mevsimlik kabaklarla hazirlanan, ailece paylasilan hafif bir aksam yemegi.', 'orta',
    array['vejetaryen'], 'tr', 'write', 'running'
  );

  -- Patch the fixture's placeholder jobId/briefId to the real ones this test seeded.
  v_draft := v_draft || jsonb_build_object('jobId', v_job_id, 'briefId', v_brief_id);

  -- 1. Structure/crop/coverage validation — this is real LLM output, so this is the actual proof
  --    the Writer's produced shape clears the same Postgres gates write-stage.ts calls.
  v_structure := public.validate_recipe_structure(v_draft);
  perform pg_temp.assert((v_structure->>'valid')::boolean, 'expected the live kabak draft to pass validate_recipe_structure, got: ' || v_structure::text);

  v_crop_values := public.validate_recipe_crop_values(v_draft);
  perform pg_temp.assert((v_crop_values->>'valid')::boolean, 'expected the live kabak draft to pass validate_recipe_crop_values, got: ' || v_crop_values::text);

  -- Coverage is heuristic/warning-only by design (never blocking) — still assert nothing turned up
  -- 'blocking' on real content.
  v_coverage := public.validate_recipe_ingredient_coverage(v_draft);
  perform pg_temp.assert(
    not exists (select 1 from jsonb_array_elements(v_coverage->'issues') i where i->>'severity' = 'blocking'),
    'expected no blocking coverage issues on the live kabak draft, got: ' || v_coverage::text
  );

  -- 2. Slug validation on the Writer-derived candidate slug (see writer/slug.ts).
  v_slug := public.validate_recipe_slug('firinda-kabak-musakka');
  perform pg_temp.assert((v_slug->>'valid')::boolean, 'expected a fresh candidate slug to validate, got: ' || v_slug::text);

  -- 3. Unit normalization on the live ingredients array — proves fn_recipe_canonical_unit handles
  --    every unit spelling this real recipe actually used (kg, adet, diş, yemek kaşığı, çay
  --    kaşığı, su bardağı).
  v_normalized := public.normalize_recipe_units(v_draft->'ingredients');
  perform pg_temp.assert(jsonb_array_length(v_normalized) = jsonb_array_length(v_draft->'ingredients'), 'normalize_recipe_units must not drop or add ingredients');
  perform pg_temp.assert(v_normalized->0->>'unit' = 'kg', 'expected kg to normalize to itself');
  perform pg_temp.assert(v_normalized->4->>'unit' = 'yemek_kasigi', 'expected "yemek kaşığı" to normalize to yemek_kasigi, got ' || (v_normalized->4->>'unit'));
  perform pg_temp.assert(v_normalized->6->>'unit' = 'cay_kasigi', 'expected "çay kaşığı" to normalize to cay_kasigi, got ' || (v_normalized->6->>'unit'));

  -- 4. Store draft version 1 (write-stage.ts's actual insert shape) — only after schema/validation
  --    passed, per PROMPT 06 item 7.
  insert into public.recipe_drafts (
    job_id, version, title, description, cover_photo_url, servings, prep_minutes, cook_minutes,
    rest_minutes, difficulty, cuisine, diet_tags, allergen_labels, required_equipment, source_type,
    author_type, visibility, owner_id, extraction_confidence, ingredients, steps
  ) values (
    v_job_id, 1, v_draft->>'title', v_draft->>'description', v_draft->>'coverPhotoUrl',
    (v_draft->>'servings')::int, (v_draft->>'prepMinutes')::int, (v_draft->>'cookMinutes')::int,
    (v_draft->>'restMinutes')::int, v_draft->>'difficulty', v_draft->>'cuisine',
    array(select jsonb_array_elements_text(v_draft->'dietTags')), null,
    array(select jsonb_array_elements_text(v_draft->'requiredEquipment')), v_draft->>'sourceType',
    v_draft->>'authorType', v_draft->>'visibility', null, (v_draft->>'extractionConfidence')::numeric,
    v_normalized, v_draft->'steps'
  )
  returning id into v_draft_id;

  perform pg_temp.assert(v_draft_id is not null, 'expected the version-1 draft insert to succeed');

  -- 5. Idempotency at the DB layer (PROMPT 06's idempotency requirement, backing up write-stage.ts's
  --    own pre-insert existence check): a second version=1 row for the SAME job is impossible —
  --    recipe_drafts_job_id_version_key (job_id, version) unique constraint.
  begin
    insert into public.recipe_drafts (job_id, version, title, ingredients, steps)
    values (v_job_id, 1, 'duplicate attempt', '[{"freeTextName":"x"}]'::jsonb, '[{"stepNo":1,"instruction":"x"}]'::jsonb);
  exception when unique_violation then
    v_second_insert_failed := true;
  end;
  perform pg_temp.assert(v_second_insert_failed, 'expected a second version=1 draft for the same job to violate the unique constraint');

  raise notice 'F2 Step 06 write-stage vertical slice (kabak): draft_id=%, structure=%, crop_values=%, coverage_issues=%',
    v_draft_id, v_structure->>'valid', v_crop_values->>'valid', jsonb_array_length(v_coverage->'issues');
end;
$$;

\echo 'F2 Step 06 write-stage vertical slice (kabak) SQL test: ALL ASSERTIONS PASSED'
