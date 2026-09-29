-- DATA-0: preserve the two production acceptance principals while excluding their data from
-- customer-facing discovery and product KPI reporting.
--
-- orders_allowlist is the bootstrap source of truth for the initial marker. The durable marker
-- deliberately lives on profiles so later order-gate allowlist changes cannot silently reclassify
-- historical data. No rows are deleted.

alter table public.profiles
  add column if not exists is_test_account boolean not null default false;

update public.profiles p
set is_test_account = true
where exists (
  select 1 from public.orders_allowlist a where a.user_id = p.id
);

comment on column public.profiles.is_test_account is
  'DATA-0 production acceptance principal. Excluded from public discovery and product KPIs; retained for controlled runtime tests.';

-- The new administrative marker must never become client-writable through future broad grants.
revoke insert (is_test_account), update (is_test_account)
  on public.profiles from public, anon, authenticated;

create schema if not exists private;

create or replace function private.is_test_account(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select p.is_test_account
    from public.profiles p
    where p.id = p_user_id
  ), false)
$$;

revoke all on function private.is_test_account(uuid) from public;
grant execute on function private.is_test_account(uuid) to anon, authenticated, service_role;

-- Existing permissive listing policies still decide which ordinary rows are visible. This
-- restrictive policy only removes test listings from non-test principals; the test pair and the
-- owning test farmer retain the production acceptance path.
drop policy if exists "DATA-0 isolate test listings" on public.listings;
create policy "DATA-0 isolate test listings"
on public.listings
as restrictive
for select
to public
using (
  not private.is_test_account(farmer_id)
  or private.is_test_account(auth.uid())
);

-- Public storefront projections preserve their column contracts and deliberately remain
-- SECURITY DEFINER for the existing anonymous storefront use case.
create or replace view public.public_farmer_profiles as
select p.id, p.role, p.name, p.city, p.premium, p.tier,
       case when p.deleted_at is null then p.referral_code end as referral_code,
       p.created_at
from public.profiles p
where p.role = 'farmer'::public.user_role
  and (not p.is_test_account or private.is_test_account(auth.uid()));

create or replace view public.public_parcel_cards as
select pc.id, pc.farm_id, pc.farmer_id, pc.name, pc.area, pc.crops, pc.location_label,
       pc.parcel_photo_urls, pc.production_method, pc.is_primary, pc.created_at
from public.parcels pc
where exists (
  select 1 from public.profiles pr
  where pr.id = pc.farmer_id
    and pr.deleted_at is null
    and (not pr.is_test_account or private.is_test_account(auth.uid()))
);

create or replace view public.public_certifications as
select c.id, c.farmer_id, c.type, c.verified_at, c.expires_at, c.created_at
from public.certifications c
where exists (
  select 1 from public.profiles pr
  where pr.id = c.farmer_id
    and pr.deleted_at is null
    and (not pr.is_test_account or private.is_test_account(auth.uid()))
);

-- Core transaction KPI source. Every downstream GMV, retention, dispute and order KPI already
-- derives from this view.
create or replace view public.v_kpi_order_base as
select o.id as order_id, o.order_ref, o.status as order_status, o.created_at,
       o.buyer_id, o.farmer_id, o.offer_id, fo.payment_status, l.crop,
       fp.city as farmer_city, bpr.company_type as buyer_company_type,
       coalesce(fo.current_price, fo.price_per_unit) * coalesce(fo.current_quantity, fo.quantity) as amount,
       o.status = any (array['delivered'::public.order_status, 'completed'::public.order_status]) as reached_delivery,
       (o.status = any (array['delivered'::public.order_status, 'completed'::public.order_status]))
         and fo.payment_status = 'paid'::text as is_realized_sale,
       exists (select 1 from public.disputes d where d.order_id = o.id) as has_dispute
from public.orders o
join public.offers fo on fo.id = o.offer_id
left join public.listings l on l.id = fo.listing_id
left join public.profiles fp on fp.id = o.farmer_id
left join public.buyer_profiles bpr on bpr.user_id = o.buyer_id
where not private.is_test_account(o.buyer_id)
  and not private.is_test_account(o.farmer_id);

create or replace view public.v_kpi_farmer_activation as
with farmer_first_listing as (
  select p.id farmer_id, p.created_at signup_at, min(l.created_at) first_listing_at
  from public.profiles p left join public.listings l on l.farmer_id = p.id
  where p.role = 'farmer'::public.user_role and not p.is_test_account
  group by p.id, p.created_at
)
select count(*) total_farmers,
       count(*) filter (where first_listing_at is not null) farmers_with_listing,
       round(extract(epoch from percentile_cont(0.5) within group (order by first_listing_at-signup_at)
         filter (where first_listing_at is not null))/3600.0,1) median_hours_to_first_listing,
       case when count(*)=0 then null else round(100.0*count(*) filter (
         where first_listing_at is not null and first_listing_at <= signup_at + interval '7 days')/count(*),2) end pct_listing_within_7d
from farmer_first_listing;

create or replace view public.v_kpi_farmer_sellthrough as
with listing_first_order as (
  select l.id listing_id, l.created_at listing_created_at, min(ord.created_at) first_order_at
  from public.listings l
  left join public.offers o on o.listing_id=l.id
  left join public.orders ord on ord.offer_id=o.id
  where not private.is_test_account(l.farmer_id)
  group by l.id,l.created_at
), eligible as (select * from listing_first_order where listing_created_at <= now()-interval '30 days')
select count(*) eligible_listings,
 count(*) filter (where first_order_at is not null and first_order_at <= listing_created_at+interval '30 days') sold_within_30d,
 case when count(*)=0 then null else round(100.0*count(*) filter (
  where first_order_at is not null and first_order_at <= listing_created_at+interval '30 days')/count(*),2) end sellthrough_30d_pct
from eligible;

create or replace view public.v_kpi_listing_offer_rate as
with listing_first_offer as (
 select l.id listing_id,l.created_at listing_created_at,min(o.created_at) first_offer_at
 from public.listings l left join public.offers o on o.listing_id=l.id
 where not private.is_test_account(l.farmer_id)
 group by l.id,l.created_at
), eligible as (select * from listing_first_offer where listing_created_at <= now()-interval '14 days')
select count(*) eligible_listings,
 count(*) filter (where first_offer_at is not null and first_offer_at <= listing_created_at+interval '14 days') listings_with_offer_14d,
 case when count(*)=0 then null else round(100.0*count(*) filter (
  where first_offer_at is not null and first_offer_at <= listing_created_at+interval '14 days')/count(*),2) end offer_rate_14d_pct,
 round(extract(epoch from percentile_cont(0.5) within group (order by first_offer_at-listing_created_at)
  filter (where first_offer_at is not null))/3600.0,1) median_hours_to_first_offer
from eligible;

create or replace view public.v_kpi_offer_conversion as
with offer_to_order as (
 select o.id offer_id,o.created_at offer_created_at,ord.created_at order_created_at
 from public.offers o left join public.orders ord on ord.offer_id=o.id
 where not private.is_test_account(o.buyer_id) and not private.is_test_account(o.farmer_id)
)
select count(*) total_offers,count(*) filter(where order_created_at is not null) converted_offers,
 case when count(*)=0 then null else round(100.0*count(*) filter(where order_created_at is not null)/count(*),2) end conversion_pct,
 round(extract(epoch from percentile_cont(0.5) within group(order by order_created_at-offer_created_at)
  filter(where order_created_at is not null))/3600.0,1) median_hours_offer_to_order
from offer_to_order;

create or replace view public.v_kpi_farmer_verified_pct as
with active_farmers as (
 select distinct l.farmer_id from public.listings l where not private.is_test_account(l.farmer_id)
), verified as (
 select distinct c.farmer_id from public.certifications c
 where c.verified_at is not null and (c.expires_at is null or c.expires_at>now())
   and not private.is_test_account(c.farmer_id)
)
select (select count(*) from active_farmers) active_farmer_count,
 (select count(*) from active_farmers af where af.farmer_id in(select farmer_id from verified)) verified_active_farmer_count,
 case when (select count(*) from active_farmers)=0 then null else round(100.0*(select count(*) from active_farmers af
  where af.farmer_id in(select farmer_id from verified))/(select count(*) from active_farmers),2) end verified_pct;

create or replace view public.v_kpi_buyer_activation as
with buyer_first_order as (
 select p.id buyer_id,p.created_at signup_at,p.buyer_type,min(ob.created_at) first_order_at
 from public.profiles p left join public.v_kpi_order_base ob on ob.buyer_id=p.id and ob.reached_delivery
 where p.role='buyer'::public.user_role and not p.is_test_account
 group by p.id,p.created_at,p.buyer_type
)
select count(*) total_buyers,count(*) filter(where first_order_at is not null) buyers_with_order,
 round(extract(epoch from percentile_cont(0.5) within group(order by first_order_at-signup_at)
  filter(where first_order_at is not null))/86400.0,1) median_days_to_first_order
from buyer_first_order;

create or replace view public.v_kpi_review_avg as
select coalesce(reviewee_profile.role::text,'genel') reviewee_role,reviews.reviewee_id,
 count(*) review_count,round(avg(reviews.rating),2) avg_rating
from public.reviews reviews
left join public.profiles reviewee_profile on reviewee_profile.id=reviews.reviewee_id
where not private.is_test_account(reviews.reviewer_id)
  and not private.is_test_account(reviews.reviewee_id)
group by grouping sets ((reviewee_profile.role,reviews.reviewee_id),(reviewee_profile.role),());

create or replace view public.v_kpi_supply_density as
with cells as (
 select p.city region,l.crop,count(distinct l.farmer_id) farmer_count
 from public.listings l join public.profiles p on p.id=l.farmer_id
 where l.status='active'::public.listing_status and p.city is not null and not p.is_test_account
 group by p.city,l.crop
)
select count(*) total_cells,count(*) filter(where farmer_count>=3) dense_cells,
 case when count(*)=0 then null else round(100.0*count(*) filter(where farmer_count>=3)/count(*),2) end dense_cell_pct
from cells;

create or replace view public.v_kpi_order_intent_blocked as
select date_trunc('day',e.created_at) day,e.surface,e.platform,e.crop,
 count(*) events,count(distinct e.user_id) users
from public.order_intent_events e
where not private.is_test_account(e.user_id)
group by date_trunc('day',e.created_at),e.surface,e.platform,e.crop;

create or replace view public.v_kpi_crop_demand_heatmap as
with recipe_key_ingredients as (
 select ri.crop,count(distinct ri.recipe_id) key_ingredient_recipe_count
 from public.recipe_ingredients ri join public.recipes r on r.id=ri.recipe_id
 where ri.crop is not null and ri.is_key_ingredient=true and r.visibility='public' and r.status='published'
 group by ri.crop
), request_canonical as (
 select cr.id crop_request_id,cr.requested_by,cr.quantity,cr.unit,cr.region,cr.ingredient_class,
  coalesce(cc.crop,lower(trim(cr.crop_name_free_text))) crop_key
 from public.crop_requests cr
 left join lateral (
  select c.crop from public.crop_config c
  where lower(c.crop)=lower(trim(cr.crop_name_free_text))
     or lower(c.display_name)=lower(trim(cr.crop_name_free_text)) limit 1
 ) cc on true
 where not private.is_test_account(cr.requested_by)
), request_agg as (
 select rc.crop_key,count(distinct rc.requested_by) requester_count,
  count(distinct rc.requested_by) filter(where rc.ingredient_class='tarimsal') requester_count_tarimsal,
  count(distinct rc.requested_by) filter(where rc.ingredient_class='platform_disi') requester_count_platform_disi,
  sum(case when rc.unit is null or rc.quantity is null then null
      when rc.unit=cc.default_unit then rc.quantity
      when rc.unit='kg' and cc.default_unit='g' then rc.quantity*1000
      when rc.unit='g' and cc.default_unit='kg' then rc.quantity/1000 else null end) total_quantity_normalized,
  array_remove(array_agg(distinct rc.region),null) regions,
  array_agg(distinct rc.crop_request_id) crop_request_ids
 from request_canonical rc left join public.crop_config cc on cc.crop=rc.crop_key group by rc.crop_key
), request_recipes as (
 select rc.crop_key,array_agg(distinct r.title) requested_recipe_titles
 from request_canonical rc join public.recipe_rfq_links rl on rl.crop_request_id=rc.crop_request_id
 join public.recipes r on r.id=rl.recipe_id group by rc.crop_key
), all_crops as (
 select crop from recipe_key_ingredients union select crop_key from request_agg
)
select ac.crop,coalesce(cc.display_name,ac.crop) crop_display_name,
 coalesce(rki.key_ingredient_recipe_count,0) key_ingredient_recipe_count,
 coalesce(ra.requester_count,0) requester_count,ra.total_quantity_normalized,
 cc.default_unit normalized_unit,coalesce(ra.regions,'{}'::text[]) regions,
 coalesce(rr.requested_recipe_titles,'{}'::text[]) requested_recipe_titles,
 exists(select 1 from public.listings l where l.crop=ac.crop and l.status='active'::public.listing_status
   and not private.is_test_account(l.farmer_id)) has_active_listing,
 coalesce(ra.requester_count_tarimsal,0) requester_count_tarimsal,
 coalesce(ra.requester_count_platform_disi,0) requester_count_platform_disi
from all_crops ac left join public.crop_config cc on cc.crop=ac.crop
left join recipe_key_ingredients rki on rki.crop=ac.crop
left join request_agg ra on ra.crop_key=ac.crop
left join request_recipes rr on rr.crop_key=ac.crop
order by coalesce(ra.requester_count,0) desc,coalesce(rki.key_ingredient_recipe_count,0) desc,ac.crop;

create or replace view public.v_kpi_recipe_funnel as
with v as (
 select date_trunc('month',rv.created_at)::date month,count(*) recipe_views,
  count(distinct coalesce(rv.user_id::text,rv.session_id)) unique_viewers
 from public.recipe_views rv where not private.is_test_account(rv.user_id) group by 1
), s as (
 select date_trunc('month',rs.created_at)::date month,count(*) recipe_saves
 from public.recipe_saves rs where not private.is_test_account(rs.user_id) group by 1
), req as (
 select date_trunc('month',cr.created_at)::date month,count(distinct cr.id) recipe_requests
 from public.recipe_rfq_links lnk join public.crop_requests cr on cr.id=lnk.crop_request_id
 where not private.is_test_account(cr.requested_by) group by 1
), off as (
 select date_trunc('month',o.created_at)::date month,count(*) recipe_offers,
  count(*) filter(where exists(select 1 from public.orders od where od.offer_id=o.id)) recipe_offers_converted
 from public.offers o where o.source_recipe_id is not null
  and not private.is_test_account(o.buyer_id) and not private.is_test_account(o.farmer_id) group by 1
), ords as (
 select date_trunc('month',od.created_at)::date month,count(*) recipe_orders
 from public.orders od join public.offers o on o.id=od.offer_id
 where o.source_recipe_id is not null and not private.is_test_account(od.buyer_id)
  and not private.is_test_account(od.farmer_id) group by 1
), months as (
 select month from v union select month from s union select month from req union select month from off union select month from ords
)
select m.month,coalesce(v.recipe_views,0) recipe_views,coalesce(v.unique_viewers,0) unique_viewers,
 coalesce(s.recipe_saves,0) recipe_saves,coalesce(req.recipe_requests,0) recipe_requests,
 coalesce(off.recipe_offers,0) recipe_offers,coalesce(ords.recipe_orders,0) recipe_orders,
 coalesce(off.recipe_offers_converted,0) recipe_offers_converted,
 case when coalesce(v.recipe_views,0)=0 then null else round(100.0*coalesce(s.recipe_saves,0)/v.recipe_views,2) end view_to_save_pct,
 case when coalesce(off.recipe_offers,0)=0 then null else round(100.0*coalesce(off.recipe_offers_converted,0)/off.recipe_offers,2) end offer_to_order_pct
from months m left join v on v.month=m.month left join s on s.month=m.month left join req on req.month=m.month
left join off on off.month=m.month left join ords on ords.month=m.month order by m.month;

create or replace view public.v_kpi_recipe_funnel_by_recipe as
with v as (
 select rv.recipe_id,count(*) recipe_views,count(distinct coalesce(rv.user_id::text,rv.session_id)) unique_viewers
 from public.recipe_views rv where not private.is_test_account(rv.user_id) group by rv.recipe_id
), s as (
 select rs.recipe_id,count(*) recipe_saves from public.recipe_saves rs
 where not private.is_test_account(rs.user_id) group by rs.recipe_id
), req as (
 select lnk.recipe_id,count(distinct cr.id) recipe_requests
 from public.recipe_rfq_links lnk join public.crop_requests cr on cr.id=lnk.crop_request_id
 where not private.is_test_account(cr.requested_by) group by lnk.recipe_id
), off as (
 select o.source_recipe_id recipe_id,count(*) recipe_offers,
  count(*) filter(where exists(select 1 from public.orders od where od.offer_id=o.id)) recipe_offers_converted
 from public.offers o where o.source_recipe_id is not null
  and not private.is_test_account(o.buyer_id) and not private.is_test_account(o.farmer_id)
 group by o.source_recipe_id
), ords as (
 select o.source_recipe_id recipe_id,count(*) recipe_orders
 from public.orders od join public.offers o on o.id=od.offer_id
 where o.source_recipe_id is not null and not private.is_test_account(od.buyer_id)
  and not private.is_test_account(od.farmer_id) group by o.source_recipe_id
)
select r.id recipe_id,r.slug,r.title,coalesce(v.recipe_views,0) recipe_views,
 coalesce(v.unique_viewers,0) unique_viewers,coalesce(s.recipe_saves,0) recipe_saves,
 coalesce(req.recipe_requests,0) recipe_requests,coalesce(off.recipe_offers,0) recipe_offers,
 coalesce(ords.recipe_orders,0) recipe_orders,coalesce(off.recipe_offers_converted,0) recipe_offers_converted,
 case when coalesce(v.recipe_views,0)=0 then null else round(100.0*coalesce(s.recipe_saves,0)/v.recipe_views,2) end view_to_save_pct,
 case when coalesce(off.recipe_offers,0)=0 then null else round(100.0*coalesce(off.recipe_offers_converted,0)/off.recipe_offers,2) end offer_to_order_pct
from public.recipes r left join v on v.recipe_id=r.id left join s on s.recipe_id=r.id
left join req on req.recipe_id=r.id left join off on off.recipe_id=r.id left join ords on ords.recipe_id=r.id
where r.visibility='public' and r.status='published' order by r.title;

-- Preserve the existing read-only public view boundary after CREATE OR REPLACE.
revoke insert, update, delete, truncate
  on public.public_farmer_profiles, public.public_parcel_cards, public.public_certifications
  from public, anon, authenticated;
