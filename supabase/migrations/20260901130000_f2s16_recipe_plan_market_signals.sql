-- F2 Recipe Automation — Step 16: real-world market signals for the Planner (recipe-stage-plan).
--
-- Adds THREE new, additive, narrow-purpose RPCs so the Planner's input reflects live marketplace
-- reality, not only the static `crop_config` harvest calendar. Nothing here changes any existing
-- table, trigger, RLS policy, or the three f2s04 RPCs the Planner already calls
-- (`get_seasonal_crop_candidates`, `get_recent_recipe_mix`, `search_existing_recipes`) — this is
-- purely additive, matching every prior F2 migration's own "additive only" convention.
--
-- Same pattern as f2s04's own RPCs (verified against that migration's file header before writing
-- this): `language sql`, `stable`, `security invoker` (service_role already has
-- `rolbypassrls = true` on this project, so DEFINER buys nothing and would only be a needless
-- privilege escalation — see f2s04's header §3 for the full reasoning this migration reuses
-- verbatim), `set search_path = ''` with every table reference fully qualified with `public.`, and
-- EXECUTE revoked from PUBLIC / granted only to `service_role` (this is pipeline plumbing, not a
-- new client-facing surface). All three are read-only — no INSERT/UPDATE/DELETE anywhere below, on
-- `listings`, `offers`, or `orders`, matching this step's own "salt-okunur" (read-only) scope.
--
-- Signal design (PROMPT 16), and why each source table was chosen:
--   1. get_active_listing_crops — groups CURRENTLY active `listings` rows (`status = 'active'`) by
--      crop: active listing count, total quantity, distinct farmer count. This is the "is anyone
--      actually selling this right now" signal a static seasonal calendar cannot provide — a crop
--      can be textbook in-season (get_seasonal_crop_candidates says so) while zero farmers have an
--      active listing for it today.
--   2. get_crop_demand_signal — groups real, accepted transactions from `orders` (never `offers`:
--      `offers.status` also carries `pending`/`pending_farmer`/`pending_buyer`/`rejected`/`counter`,
--      none of which represent a transaction that actually happened, and counting them would inflate
--      apparent demand with negotiations that never closed) by crop, over the trailing N days.
--      Join path verified live against this schema (`information_schema.columns`, not assumed):
--      `orders.offer_id -> offers.id`, `offers.listing_id -> listings.id`, `listings.crop`. Excludes
--      `orders.status = 'cancelled'` — a cancelled order is exactly the "this didn't actually
--      happen" case demand-from-orders is meant to exclude (no cancelled/disputed rows exist in the
--      live data as of this migration, but the exclusion is correctness, not a no-op for today's
--      data specifically). Sums `offers.current_quantity` (the final negotiated quantity an order
--      was actually created from), not `offers.quantity` (the buyer's original ask, which a
--      counter-offer may have changed).
--   3. get_recipe_engagement_signal — joins `recipe_views` + `recipe_saves` (both keyed by
--      `recipe_id`) through `recipes.id -> recipe_ingredients.crop`, restricted to
--      `is_key_ingredient = true and crop is not null` (the same restriction
--      `get_recent_recipe_mix`, f2s04, already applies for the identical reason: a garnish/optional
--      ingredient mention shouldn't count as "this crop's recipes are popular"), over the trailing N
--      days. This is additive information on top of the existing `get_recent_recipe_mix` +
--      deterministic `validate_recipe_plan_diversity` repeat-avoidance gate, not a replacement for
--      either.

-- =================================================================================================
-- 1. get_active_listing_crops — real active supply, grouped by crop. Top ~30 by active listing
--    count (ties broken by total quantity, then distinct farmer count) is the default shape the
--    Planner consumes; both are overridable for future callers.
-- =================================================================================================

create or replace function public.get_active_listing_crops(
  p_limit integer default 30
)
returns table (
  crop text,
  display_name text,
  active_listing_count integer,
  total_quantity numeric,
  farmer_count integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    l.crop,
    cc.display_name,
    count(*)::integer as active_listing_count,
    sum(l.quantity) as total_quantity,
    count(distinct l.farmer_id)::integer as farmer_count
  from public.listings l
  left join public.crop_config cc on cc.crop = l.crop
  where l.status = 'active'
  group by l.crop, cc.display_name
  order by active_listing_count desc, total_quantity desc, farmer_count desc
  limit greatest(1, least(100, coalesce(p_limit, 30)));
$$;

revoke all on function public.get_active_listing_crops(integer) from public;
grant execute on function public.get_active_listing_crops(integer) to service_role;

-- =================================================================================================
-- 2. get_crop_demand_signal — real completed/accepted demand from `orders` (never `offers`), joined
--    to `listings.crop` via `orders.offer_id -> offers.id -> offers.listing_id`, over the trailing
--    `p_days` days. Top ~20 by order count (ties broken by total quantity).
-- =================================================================================================

create or replace function public.get_crop_demand_signal(
  p_days integer default 30,
  p_limit integer default 20
)
returns table (
  crop text,
  display_name text,
  order_count integer,
  total_quantity numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    l.crop,
    cc.display_name,
    count(*)::integer as order_count,
    sum(coalesce(o2.current_quantity, o2.quantity)) as total_quantity
  from public.orders o
  join public.offers o2 on o2.id = o.offer_id
  join public.listings l on l.id = o2.listing_id
  left join public.crop_config cc on cc.crop = l.crop
  where o.status <> 'cancelled'
    and o.created_at >= now() - make_interval(days => greatest(1, least(365, coalesce(p_days, 30))))
  group by l.crop, cc.display_name
  order by order_count desc, total_quantity desc
  limit greatest(1, least(100, coalesce(p_limit, 20)));
$$;

revoke all on function public.get_crop_demand_signal(integer, integer) from public;
grant execute on function public.get_crop_demand_signal(integer, integer) to service_role;

-- =================================================================================================
-- 3. get_recipe_engagement_signal — view/save engagement on recipes, attributed to each recipe's
--    KEY ingredient crops, over the trailing `p_days` days. Top ~20 by (views + saves) combined,
--    ties broken by save count (a stronger intent signal than a view).
-- =================================================================================================

create or replace function public.get_recipe_engagement_signal(
  p_days integer default 30,
  p_limit integer default 20
)
returns table (
  crop text,
  display_name text,
  view_count integer,
  save_count integer,
  recipe_count integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  with key_ingredient_crops as (
    select distinct ri.recipe_id, ri.crop
    from public.recipe_ingredients ri
    where ri.is_key_ingredient
      and ri.crop is not null
  ),
  views_in_window as (
    select rv.recipe_id, count(*) as view_count
    from public.recipe_views rv
    where rv.created_at >= now() - make_interval(days => greatest(1, least(365, coalesce(p_days, 30))))
    group by rv.recipe_id
  ),
  saves_in_window as (
    select rs.recipe_id, count(*) as save_count
    from public.recipe_saves rs
    where rs.created_at >= now() - make_interval(days => greatest(1, least(365, coalesce(p_days, 30))))
    group by rs.recipe_id
  )
  select
    kic.crop,
    cc.display_name,
    coalesce(sum(v.view_count), 0)::integer as view_count,
    coalesce(sum(s.save_count), 0)::integer as save_count,
    count(distinct kic.recipe_id)::integer as recipe_count
  from key_ingredient_crops kic
  left join public.crop_config cc on cc.crop = kic.crop
  left join views_in_window v on v.recipe_id = kic.recipe_id
  left join saves_in_window s on s.recipe_id = kic.recipe_id
  where v.recipe_id is not null or s.recipe_id is not null
  group by kic.crop, cc.display_name
  order by (coalesce(sum(v.view_count), 0) + coalesce(sum(s.save_count), 0)) desc, save_count desc
  limit greatest(1, least(100, coalesce(p_limit, 20)));
$$;

revoke all on function public.get_recipe_engagement_signal(integer, integer) from public;
grant execute on function public.get_recipe_engagement_signal(integer, integer) to service_role;
