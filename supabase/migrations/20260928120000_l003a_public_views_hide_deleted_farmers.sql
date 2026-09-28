-- L0-03 (a) — herkese açık view'larda silinmiş çiftçi verisinin gizlenmesi.
--
-- rpc_delete_own_account profili anonimleştirir (ad 'Silinmiş Kullanıcı'; city/phone/iban null;
-- profiles.deleted_at dolar) ama parcels ve certifications satırlarına dokunmaz. Aşağıdaki üç view
-- anon'a açık ve deleted_at filtresi yoktu; silinmiş çiftçinin parselleri (ad, location_label,
-- parcel_photo_urls), sertifikaları ve referral_code'u vitrinde kalıyordu.
--
-- Kapsam: yalnız satır filtresi (public_farmer_profiles'ta referral_code maskesi). Kolon adları,
-- sırası ve tipleri baseline (20260917120000) ile birebir aynı; grant'lere dokunulmaz, istemci
-- tipleri değişmez.
--
-- Bilinçli SECURITY DEFINER: profiles, parcels ve certifications RLS'li; security_invoker anon
-- vitrinini (/s/:slug, ürün sayfası, sitemap) boşaltır. Advisor'ın SECURITY DEFINER view uyarısı
-- bu yüzden kalıyor. security_invoker EKLENMEZ.
--
-- Tekrar çalıştırılabilir: create or replace view + comment on view.

-- ---------------------------------------------------------------------------------------------
-- 1. public_farmer_profiles — satırlar kalır (alıcının sipariş geçmişi silinmiş çiftçinin anonim
--    adını buradan okuyor); silinmiş satırda referral_code null döner.
-- ---------------------------------------------------------------------------------------------
create or replace view public.public_farmer_profiles as
select p.id,
       p.role,
       p.name,
       p.city,
       p.premium,
       p.tier,
       case when p.deleted_at is null then p.referral_code end as referral_code,
       p.created_at
from public.profiles p
where p.role = 'farmer'::public.user_role;

-- ---------------------------------------------------------------------------------------------
-- 2. public_parcel_cards — silinmiş çiftçinin parselleri gizlenir.
-- ---------------------------------------------------------------------------------------------
create or replace view public.public_parcel_cards as
select pc.id,
       pc.farm_id,
       pc.farmer_id,
       pc.name,
       pc.area,
       pc.crops,
       pc.location_label,
       pc.parcel_photo_urls,
       pc.production_method,
       pc.is_primary,
       pc.created_at
from public.parcels pc
where exists (select 1 from public.profiles pr where pr.id = pc.farmer_id and pr.deleted_at is null);

-- ---------------------------------------------------------------------------------------------
-- 3. public_certifications — silinmiş çiftçinin sertifikaları gizlenir.
-- ---------------------------------------------------------------------------------------------
create or replace view public.public_certifications as
select c.id,
       c.farmer_id,
       c.type,
       c.verified_at,
       c.expires_at,
       c.created_at
from public.certifications c
where exists (select 1 from public.profiles pr where pr.id = c.farmer_id and pr.deleted_at is null);

-- ---------------------------------------------------------------------------------------------
-- 4. Yorumlar.
-- ---------------------------------------------------------------------------------------------
comment on view public.public_farmer_profiles is
  'Anon vitrin projeksiyonu. Bilinçli SECURITY DEFINER (alttaki tablolar RLS''li); silinmiş çiftçi (profiles.deleted_at) filtrelenir. L0-03 (a), 2026-09-28.';
comment on view public.public_parcel_cards is
  'Anon vitrin projeksiyonu. Bilinçli SECURITY DEFINER (alttaki tablolar RLS''li); silinmiş çiftçi (profiles.deleted_at) filtrelenir. L0-03 (a), 2026-09-28.';
comment on view public.public_certifications is
  'Anon vitrin projeksiyonu. Bilinçli SECURITY DEFINER (alttaki tablolar RLS''li); silinmiş çiftçi (profiles.deleted_at) filtrelenir. L0-03 (a), 2026-09-28.';
