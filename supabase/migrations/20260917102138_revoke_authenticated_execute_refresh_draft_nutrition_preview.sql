-- Güvenlik sıkılaştırması (2026-09-17): refresh_draft_nutrition_preview yalnızca
-- admin-recipe-review-action ve admin-recipe-job-detail edge fonksiyonlarından,
-- getSupabaseAdminClient() (service-role) ile çağrılıyor — repo genelinde başka hiçbir
-- çağıran yok, özellikle normal kullanıcı JWT'siyle (authenticated rolüyle) hiç
-- çağrılmıyor. Admin paneli is_admin/RLS/normal Lovable user session kullanmıyor,
-- yalnız paylaşılan x-admin-key sırrıyla + service-role client ile çalışıyor (bkz.
-- admin-recipe-review-action/index.ts). f2s17_draft_nutrition_preview migration'ı
-- fonksiyonu oluştururken authenticated rolüne de gereksiz yere EXECUTE vermişti — bu
-- kod tabanının zaten defalarca kullandığı "revoke anon/authenticated execute"
-- takip-migration desenini (t9_revoke_anon_execute_mobile_handoff_nonce,
-- t7a_f11_revoke_anon_execute_clone_recipe, revoke_anon_execute_recipe_share_rpcs)
-- tekrarlayarak bu yetki fazlalığını kaldırır. anon zaten hiç yetkili değildi, ona
-- dokunulmadı.

revoke execute on function public.refresh_draft_nutrition_preview(uuid) from authenticated;
