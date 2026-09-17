-- Supabase, CREATE FUNCTION sonrası, `anon`/`authenticated` rollerine PUBLIC pseudo-role üzerinden
-- DEĞİL DOĞRUDAN otomatik EXECUTE grant'i veriyor (bu turun T6/T9/T4-A2 migration'larında tekrar
-- tekrar bulunan aynı platform davranışı). Önceki migration'da (t7a_f11_source_type_and_clone_rpc)
-- 'revoke all ... from public' zaten vardı ama bu, doğrudan anon/authenticated grant'lerini
-- kapsamıyor. rpc_clone_recipe SECURITY INVOKER olduğu için anon çağrısı auth.uid() IS NULL
-- exception'ına düşerdi (privilege escalation riski yok), ama savunma derinliği için anon'un
-- EXECUTE'u burada da açıkça kapatılıyor.
revoke execute on function public.rpc_clone_recipe(uuid) from anon;
