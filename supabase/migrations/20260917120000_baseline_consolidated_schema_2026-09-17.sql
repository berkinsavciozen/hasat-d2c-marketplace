-- =============================================================================
-- BASELINE CONSOLIDATED SCHEMA SNAPSHOT — 2026-09-17
-- =============================================================================
--
-- WHAT THIS FILE IS
-- ------------------
-- On 2026-09-17 a migration-history audit (see the dispatch document
-- "Git <-> Canli Supabase Migration Baseline Konsolidasyonu (2026-09-17)")
-- found that the live Supabase project (efuqpiaavrzimvstpdpm / "Hasat") had
-- 69 migrations applied to it (dated 2026-07-20 through 2026-09-16) that were
-- never committed to this repository's supabase/migrations/ directory. Git's
-- migration history is otherwise a strict subset of the live database's
-- history (zero "orphan" files exist in git that are absent live) — the gap
-- is one-directional: things were applied live/via tooling and never
-- committed back.
--
-- The missing migrations include the ones that created the entire `recipes`
-- subsystem (recipes, recipe_steps, recipe_ingredients, recipe_drafts,
-- recipe_generation_jobs/batches/stage_runs, recipe_qa_results, recipe_assets,
-- recipe_admin_reviews, recipe_plan_briefs, recipe_views, recipe_saves,
-- recipe_rfq_links, crop_culinary_meta, crop_nutrition, and the ingredient
-- nutrition reference tables), several KPI views, the care-journal feature,
-- crop-demand-heatmap logic, notification/push plumbing, and assorted RLS and
-- trigger hardening migrations. Rebuilding a fresh environment from git's
-- migration history alone (`supabase db reset` + replay) would silently omit
-- all of this.
--
-- Rather than hand-reconstruct 69 individual historical migration files (which
-- would require guessing exact intermediate states), this single file
-- consolidates the *current, live* schema of the affected objects into one
-- baseline snapshot, so that git + this file together reflect what is
-- actually running in production. It is intentionally idempotent-unsafe to
-- "just re-run" — see APPLYING THIS FILE below.
--
-- HOW THIS FILE WAS GENERATED (read before trusting it)
-- -------------------------------------------------------
-- The dispatch instructions asked for `supabase db dump --schema-only` or a
-- read-only `pg_dump`. Neither was reachable from this task's execution
-- environment: the Supabase CLI is not installed here, and direct TCP/psql
-- connections to db.efuqpiaavrzimvstpdpm.supabase.co:5432 (and the pooler
-- host) timed out — this sandbox only has network egress through an HTTPS
-- proxy, not raw Postgres connections. The only reachable, read-only path was
-- the Supabase MCP server's SQL-execution tool (which runs arbitrary
-- read-only SELECTs against the live database over its management API).
--
-- This file was therefore built by querying pg_catalog / information_schema
-- directly (format_type(), pg_get_constraintdef(), pg_get_indexdef(),
-- pg_get_viewdef(), pg_get_functiondef(), pg_get_triggerdef(), pg_policies)
-- and reassembling the DDL text below, table by table / function by
-- function. This is NOT the same code path as `pg_dump` and has not been
-- byte-diffed against one. It should be reasonably faithful (column types,
-- defaults, identity/generated columns, all constraint kinds, indexes,
-- views, functions, triggers, RLS policies, and anon/authenticated/
-- service_role grants were all captured this way), but before relying on
-- this file to bootstrap a *new* environment, re-verify it with a true
-- `supabase db dump --schema-only` (or `pg_dump --schema-only`) run from a
-- machine with real network/CLI access, and diff the result against this
-- file.
--
-- Deliberately OUT OF SCOPE / excluded from this file:
--   * pg_cron job schedules (`cron.job`) — these are DATA, not schema, and
--     several of them carry a live anon-key JWT embedded in the scheduled
--     `net.http_post(...)` command text. Reproducing that here would leak
--     credentials into git history and undo the (deliberate) removal of an
--     embedded apikey done by migration `sync_istanbul_hal_prices_daily_cron_drop_apikey`
--     (2026-09-16, already in git). The live job *names* as of this snapshot
--     are: notify-admin-outbox-retry, recipe-stage-plan-weekly,
--     recipe-stage-sweep, subscription-harvest-reminders-daily,
--     sync-bursa-hal-prices-daily/-retry, sync-istanbul-hal-prices-daily/-retry,
--     sync-izmir-hal-prices-daily/-retry. Their schedules are already
--     represented by the individual per-feature migration files still
--     present in git (e.g. p23_m8b_..., f2s14_recipe_stage_sweep_cron,
--     f2s15_recipe_stage_plan_scheduler_cron, sync_istanbul_hal_prices_daily_cron*)
--     for everything except the two still-missing pg_cron-only migrations
--     already handled by the separate "Fix 1" dispatch
--     (f2s17_draft_nutrition_preview intersects this only incidentally).
--   * `storage.buckets` rows (certificates, crop-photos, delivery-photos,
--     harvest-photos, listing-photos, parcel-photos, recipe-step-photos) —
--     also data, not schema; bucket creation already has its own migration
--     for the one baseline-relevant bucket (p23_m8_d_recipe_step_photos_bucket,
--     missing from git, listed below) but the bucket ROW itself is not
--     reconstructed here.
--   * `auth`, `storage`, `realtime`, `extensions`, `graphql*`, `vault`,
--     `cron`, `pgbouncer`, `net` schemas — these are Supabase platform
--     managed, not application migrations.
--
-- THE 69 MISSING LIVE MIGRATIONS THIS FILE CONSOLIDATES
-- --------------------------------------------------------
-- (live version timestamp, live migration name — reconciled against git
-- main @ 41b0c78 / 02fde9d on 2026-09-17; this list was re-verified against
-- the current live `list_migrations` output as part of this task and is 69,
-- not the 71 originally reported in the dispatch: two of the originally
-- reported names, t7a_f11_source_type_and_clone_rpc and
-- t7a_f11_revoke_anon_execute_clone_recipe, were committed to git in the
-- meantime by PR #135 "UX-1A reconcile T7a and F11 production sources".)
-- The three items already covered by the separate "Fix 1" dispatch
-- (f2s17_draft_nutrition_preview, t4b2_awaiting_approval_ingredient_backfill,
-- t4b2_taze_kekik_alias_fix) are listed here too for completeness, since this
-- file is a superset snapshot of the resulting schema either way.
--
--   20260720204141 add_market_sources_p19
--   20260720204243 widen_price_history_source_check_p19
--   20260720204326 extend_price_history_rpcs_multi_source_p19
--   20260720204353 extend_price_history_series_rpc_multi_source_p19
--   20260721061336 enable_pg_cron_izmir_hal_sync
--   20260721065900 expand_izmir_hal_crop_sources
--   20260721070746 add_unit_to_price_history_rpcs
--   20260721120303 add_orders_update_rls_p17b
--   20260721133159 add_buyer_rating_summary_rpc
--   20260721151856 p17g1_kpi_review_avg_view
--   20260721151928 p17g1_kpi_measurement_views_core
--   20260721152035 p17g1_kpi_views_restrict_access
--   20260721154334 p17g2_farmer_kpi_views
--   20260721154403 p17g2_farmer_views_restrict_access
--   20260721154430 p17g2_buyer_kpi_views
--   20260721154525 p17g2_fix_aov_segment_grouping_bug_v2
--   20260721154545 p17g2_buyer_views_restrict_access
--   20260721154635 p17g2_platform_kpi_views_v2
--   20260721154710 p17g2_platform_views_restrict_access
--   20260721154731 p17g2_farmer_retention_view
--   20260721154749 p17g2_fix_farmer_retention_groupby
--   20260721161627 p20_sms_notification_expansion
--   20260728112336 p23m1a_fix_safran_sogani_default_unit
--   20260728112352 p23m1a_fix_violating_listing_min_order
--   20260728112356 p23m1a_listings_min_order_insert_trigger
--   20260728112427 p23m1a_buyer_profiles_company_name_nullable
--   20260728112449 p23m1a_buyer_addresses_single_default_trigger
--   20260728112547 p23m1a_fix_trigger_search_path
--   20260729130747 p23_m2_recipe_schema
--   20260729130851 p23_m2_recipe_rls
--   20260729130950 p23_m2_culinary_meta_seed
--   20260729131107 p23_m2_recipe_logic_fn
--   20260729131150 p23_m2_recipe_rpcs
--   20260729131227 p23_m2_recipe_views
--   20260729191938 p23_m2_ek_recipe_views_and_offer_attribution
--   20260729192025 p23_m2_ek_funnel_hard_joins_only
--   20260730062521 p23_m3_crop_culinary_meta_seed
--   20260730063018 p23_m3_recipes_content
--   20260730070518 p23_m4a_recipe_funnel_by_recipe
--   20260730070543 p23_m4a_recipe_funnel_by_recipe_revoke_grants
--   20260730120631 p23_m4b_crop_demand_heatmap
--   20260730120705 p23_m4b_notify_crop_request_fulfilled
--   20260730120728 p23_m4b_fix_fulfilled_status_value
--   20260730120753 p23_m4b_totaltime_include_passive_steps
--   20260730125616 p23_m4c_add_rest_minutes
--   20260730125634 p23_m4c_split_cook_into_rest
--   20260803145240 p23_m6_device_token_takeover
--   20260804093911 p23_m6ek_ingredient_crop_matching
--   20260804124059 rpc_create_offer
--   20260804130320 crop_demand_heatmap_ingredient_class_split_v2
--   20260805100327 p23_m7e_buyer_type_out_of_self_update_guard
--   20260805100334 p23_m7e_backfill_profiles_buyer_type
--   20260810121635 p23_m8b_fix_min_order_trigger_exempt_draft
--   20260810121735 p23_m8b_push_notif_prefs_columns
--   20260810121756 p23_m8b_dispatch_push_function
--   20260810121908 p23_m8b_wire_dispatch_push_into_notify_triggers
--   20260811114122 p23_m8b2_fix_offer_accepted_notify_recipient
--   20260817091659 p23_m8_d_recipe_step_photos_bucket
--   20260818094915 recipes_metadata_expansion_and_notif_prefs_cleanup
--   20260818103942 f3_notif_prefs_round2_price_alert_removed_new_events_added
--   20260904143625 legacy_recipe_image_backfill_auth   (2nd application, see NOTE below)
--   20260904143631 drop_legacy_recipe_image_backfill_auth (2nd application, see NOTE below)
--   20260910095802 t6_backlog_revoke_anon_execute_ai_customize_and_validators
--   20260910101002 t4a2_recipes_insert_column_lock
--   20260916084539 f2s17_draft_nutrition_preview   (also covered by "Fix 1" dispatch)
--   20260916102144 t4b2_awaiting_approval_ingredient_backfill (also covered by "Fix 1" dispatch)
--   20260916102223 t4b2_taze_kekik_alias_fix        (also covered by "Fix 1" dispatch)
--   20260916111257 sync_istanbul_hal_prices_daily_cron_drop_apikey
--   20260916150409 halx_add_istanbul_crop_market_sources
--
-- NOTE on legacy_recipe_image_backfill_auth (investigated as part of this task):
-- This migration pair is applied TWICE live — once as
-- 20260903122505/20260903124138, and again a day later as
-- 20260904143625/20260904143631. Git already has one copy of this exact
-- content as 20260904090000_legacy_recipe_image_backfill_auth.sql +
-- 20260904093000_drop_legacy_recipe_image_backfill_auth.sql. The SQL text of
-- all three occurrences (both live applications, and the git file) is
-- byte-identical modulo a trailing newline/comment wording — this was a
-- one-off bearer-token gate table for a since-decommissioned Edge Function,
-- created then immediately dropped both times (net schema effect: zero
-- either time). The second live application (20260904143625/143631, listed
-- above) has no dedicated git file of its own; it is fully covered by the
-- existing git file's identical content plus this baseline (which reflects
-- the table's current, dropped state — it does not appear in the CREATE
-- TABLE statements below).
--
-- APPLYING THIS FILE
-- -------------------
-- This file is NOT meant to be run against the current production database
-- (efuqpiaavrzimvstpdpm) — every object in it already exists there. It exists
-- so that a *fresh* environment built from `supabase db reset` + replaying
-- supabase/migrations/*.sql in order ends up with the same schema production
-- has today. Objects are ordered so a clean replay succeeds: extensions,
-- schema, enum types, sequences, tables, functions (needed by CHECK
-- constraints below), constraints, indexes, triggers, views, RLS enablement,
-- RLS policies, then grants.
--
-- =============================================================================

-- ============================== SCHEMAS ==============================
CREATE SCHEMA IF NOT EXISTS private;

-- ============================== EXTENSIONS ==============================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ============================== ENUM TYPES ==============================
CREATE TYPE public.certification_type AS ENUM ('organik', 'iso', 'cografi', 'hasat', 'premium', 'yeni');
CREATE TYPE public.company_type AS ENUM ('restoran', 'otel', 'organik_market', 'ihracatci', 'diger', 'bireysel');
CREATE TYPE public.delivery_type AS ENUM ('kargo-buyer', 'kargo-seller', 'elden');
CREATE TYPE public.listing_status AS ENUM ('draft', 'active', 'sold', 'expired');
CREATE TYPE public.notif_channel AS ENUM ('whatsapp', 'push', 'sms');
CREATE TYPE public.offer_status AS ENUM ('pending', 'accepted', 'rejected', 'counter', 'completed', 'pending_farmer', 'pending_buyer');
CREATE TYPE public.order_status AS ENUM ('preparing', 'shipped', 'delivered', 'disputed', 'completed', 'cancelled');
CREATE TYPE public.price_alert_condition AS ENUM ('above', 'below');
CREATE TYPE public.quality_grade AS ENUM ('A', 'B', 'C');
CREATE TYPE public.subscription_status AS ENUM ('pending', 'active', 'paused', 'fulfilled', 'cancelled');
CREATE TYPE public.unit_type AS ENUM ('g', 'kg', 'L');
CREATE TYPE public.user_role AS ENUM ('farmer', 'buyer');
CREATE TYPE public.user_tier AS ENUM ('free', 'premium');

-- ============================== SEQUENCES ==============================
CREATE SEQUENCE public.mcp_tool_calls_id_seq START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807;
CREATE SEQUENCE public.order_seq START WITH 1000 INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807;

-- ============================== TABLES (public) ==============================
CREATE TABLE public.ai_chat_messages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  session_id uuid NOT NULL,
  role text NOT NULL,
  content text NOT NULL,
  source text DEFAULT 'in_app'::text NOT NULL,
  page_context text,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.ai_customize_requests (
  idempotency_key uuid NOT NULL,
  user_id uuid NOT NULL,
  source_recipe_id uuid NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  created_recipe_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.ai_usage_tracking (
  user_id uuid NOT NULL,
  month text NOT NULL,
  message_count integer DEFAULT 0 NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.buyer_addresses (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  buyer_id uuid NOT NULL,
  label text NOT NULL,
  address text NOT NULL,
  city text NOT NULL,
  is_default boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.buyer_profiles (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  company_name text,
  company_type company_type DEFAULT 'diger'::company_type NOT NULL,
  monthly_volume text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.certifications (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  farmer_id uuid NOT NULL,
  type certification_type NOT NULL,
  verified_at timestamp with time zone,
  expires_at timestamp with time zone,
  document_url text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.community_post_likes (
  post_id uuid NOT NULL,
  user_id uuid NOT NULL
);

CREATE TABLE public.community_posts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  author_id uuid NOT NULL,
  content text NOT NULL,
  category text DEFAULT 'Genel'::text NOT NULL,
  likes_count integer DEFAULT 0 NOT NULL,
  comments_count integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  parent_id uuid,
  flagged_for_review boolean DEFAULT false NOT NULL
);

CREATE TABLE public.crop_config (
  crop text NOT NULL,
  display_name text NOT NULL,
  default_unit text DEFAULT 'kg'::text NOT NULL,
  harvest_window_start_month integer,
  harvest_window_end_month integer,
  lifecycle_steps jsonb,
  price_benchmark_source text,
  category_group text,
  has_official_price_source boolean DEFAULT false NOT NULL,
  official_source_name text,
  price_window_type text DEFAULT 'rolling_30d'::text NOT NULL,
  is_seasonal_harvest boolean DEFAULT false NOT NULL,
  default_photo_url text
);

CREATE TABLE public.crop_culinary_meta (
  crop text NOT NULL,
  is_edible boolean DEFAULT true NOT NULL,
  culinary_aliases text[] DEFAULT '{}'::text[] NOT NULL,
  conversion_hints jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.crop_journal_glossary (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  crop text NOT NULL,
  term text NOT NULL,
  explanation text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.crop_market_sources (
  crop text NOT NULL,
  source_code text NOT NULL
);

CREATE TABLE public.crop_nutrition (
  crop text NOT NULL,
  reference_source text NOT NULL,
  reference_source_id text,
  reference_version text NOT NULL,
  basis text DEFAULT 'per_100g'::text NOT NULL,
  calories_kcal numeric,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  fiber_g numeric,
  sodium_mg numeric,
  potassium_mg numeric,
  calcium_mg numeric,
  iron_mg numeric,
  vitamin_c_mg numeric,
  vitamin_a_mcg_rae numeric,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.crop_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  requested_by uuid,
  crop_name_free_text text NOT NULL,
  note text,
  status text DEFAULT 'pending'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  quantity numeric,
  unit text,
  region text,
  target_date_start date,
  target_date_end date,
  target_price numeric,
  ingredient_class text
);

CREATE TABLE public.crop_type_requests (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  requested_by uuid NOT NULL,
  crop_name text NOT NULL,
  suggested_category_group text,
  suggested_default_unit text,
  suggested_harvest_window_start_month integer,
  suggested_harvest_window_end_month integer,
  lifecycle_notes text,
  note text,
  status text DEFAULT 'pending'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.device_tokens (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  token text NOT NULL,
  platform text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.disputes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  order_id uuid NOT NULL,
  opened_by uuid NOT NULL,
  reason text NOT NULL,
  evidence_photo_urls text[] DEFAULT '{}'::text[] NOT NULL,
  status text DEFAULT 'open'::text NOT NULL,
  resolution text,
  resolved_at timestamp with time zone,
  window_expires_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.farmer_journal_prefs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  farmer_id uuid NOT NULL,
  entry_type_id uuid NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  frequency_days integer,
  threshold_note text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.farms (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  farmer_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.harvest_entries (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  parcel_id uuid NOT NULL,
  farmer_id uuid NOT NULL,
  harvest_date date NOT NULL,
  crop text NOT NULL,
  quantity numeric(10,2) NOT NULL,
  unit unit_type DEFAULT 'g'::unit_type NOT NULL,
  quality quality_grade DEFAULT 'A'::quality_grade NOT NULL,
  photo_urls text[] DEFAULT '{}'::text[],
  notes text,
  costs jsonb DEFAULT '{"labor": 0, "other": 0, "packaging": 0, "transport": 0, "fertilizer": 0}'::jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  step_key text,
  journal_entry_type_id uuid
);

CREATE TABLE public.harvest_subscriptions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  buyer_id uuid NOT NULL,
  farmer_id uuid NOT NULL,
  next_harvest_date date,
  estimated_qty numeric(10,2),
  volume_commitment numeric(10,2),
  price_lock boolean DEFAULT false NOT NULL,
  locked_price numeric(12,2),
  locked_at timestamp with time zone,
  status subscription_status DEFAULT 'pending'::subscription_status NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  crop text,
  note text
);

CREATE TABLE public.indoor_interest_leads (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  phone text NOT NULL,
  city text,
  interest_type text,
  note text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.ingredient_measure_reference (
  target_kind text NOT NULL,
  target_key text NOT NULL,
  normalized_unit text NOT NULL,
  grams_per_unit numeric NOT NULL,
  reference_source text NOT NULL,
  reference_source_id text NOT NULL,
  reference_version text NOT NULL,
  reference_url text NOT NULL,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.ingredient_nutrition_alias (
  normalized_alias text NOT NULL,
  target_kind text NOT NULL,
  target_key text NOT NULL,
  rationale text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.ingredient_nutrition_reference (
  food_key text NOT NULL,
  display_name text NOT NULL,
  reference_source text NOT NULL,
  reference_source_id text NOT NULL,
  reference_version text NOT NULL,
  reference_url text NOT NULL,
  calories_kcal numeric NOT NULL,
  protein_g numeric NOT NULL,
  carbs_g numeric NOT NULL,
  fat_g numeric NOT NULL,
  fiber_g numeric NOT NULL,
  sodium_mg numeric,
  potassium_mg numeric,
  calcium_mg numeric,
  iron_mg numeric,
  vitamin_c_mg numeric,
  vitamin_a_mcg_rae numeric,
  notes text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.journal_entry_types (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  theme_id uuid NOT NULL,
  farmer_id uuid,
  crop text,
  name text NOT NULL,
  icon text,
  default_frequency_days integer,
  is_preset boolean DEFAULT false NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  work_type_key text DEFAULT 'gozlem'::text NOT NULL
);

CREATE TABLE public.journal_themes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  icon text,
  sort_order integer DEFAULT 0 NOT NULL,
  crop text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.listing_harvest_entries (
  listing_id uuid NOT NULL,
  harvest_entry_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.listings (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  farmer_id uuid NOT NULL,
  harvest_entry_id uuid,
  crop text NOT NULL,
  quantity numeric(10,2) NOT NULL,
  unit unit_type DEFAULT 'g'::unit_type NOT NULL,
  price_per_unit numeric(12,2) NOT NULL,
  min_order numeric(10,2) DEFAULT 1 NOT NULL,
  quality quality_grade DEFAULT 'A'::quality_grade NOT NULL,
  description text,
  photo_urls text[] DEFAULT '{}'::text[],
  status listing_status DEFAULT 'active'::listing_status NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  parcel_id uuid,
  batch_name text
);

CREATE TABLE public.market_sources (
  code text NOT NULL,
  display_name text NOT NULL,
  region text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.mcp_tool_calls (
  id bigint DEFAULT nextval('mcp_tool_calls_id_seq'::regclass) NOT NULL,
  user_id uuid NOT NULL,
  called_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.mobile_handoff_nonces (
  nonce text NOT NULL,
  user_id uuid NOT NULL,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  next_path text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  expires_at timestamp with time zone DEFAULT (now() + '00:01:00'::interval) NOT NULL,
  consumed_at timestamp with time zone
);

CREATE TABLE public.notif_prefs (
  user_id uuid NOT NULL,
  new_offer_whatsapp boolean DEFAULT true NOT NULL,
  new_offer_push boolean DEFAULT true NOT NULL,
  new_offer_sms boolean DEFAULT false NOT NULL,
  harvest_time_whatsapp boolean DEFAULT true NOT NULL,
  harvest_time_push boolean DEFAULT true NOT NULL,
  harvest_time_sms boolean DEFAULT false NOT NULL,
  offer_accepted_sms boolean DEFAULT false NOT NULL,
  payment_confirmed_sms boolean DEFAULT false NOT NULL,
  order_shipped_sms boolean DEFAULT false NOT NULL,
  order_delivered_sms boolean DEFAULT false NOT NULL,
  order_cancelled_sms boolean DEFAULT false NOT NULL,
  dispute_opened_sms boolean DEFAULT false NOT NULL,
  crop_request_match_sms boolean DEFAULT false NOT NULL,
  subscription_new_sms boolean DEFAULT true NOT NULL,
  subscription_accepted_sms boolean DEFAULT true NOT NULL,
  subscription_rejected_sms boolean DEFAULT true NOT NULL,
  offer_accepted_push boolean DEFAULT true NOT NULL,
  offer_countered_push boolean DEFAULT true NOT NULL,
  payment_confirmed_push boolean DEFAULT true NOT NULL,
  order_shipped_push boolean DEFAULT true NOT NULL,
  order_delivered_push boolean DEFAULT true NOT NULL,
  order_cancelled_push boolean DEFAULT true NOT NULL,
  dispute_opened_push boolean DEFAULT true NOT NULL,
  crop_request_match_push boolean DEFAULT true NOT NULL,
  subscription_new_push boolean DEFAULT true NOT NULL,
  subscription_accepted_push boolean DEFAULT true NOT NULL,
  subscription_rejected_push boolean DEFAULT true NOT NULL,
  offer_rejected_push boolean DEFAULT true NOT NULL,
  offer_rejected_sms boolean DEFAULT false NOT NULL,
  order_preparing_push boolean DEFAULT true NOT NULL,
  order_preparing_sms boolean DEFAULT false NOT NULL,
  order_completed_push boolean DEFAULT true NOT NULL,
  order_completed_sms boolean DEFAULT false NOT NULL
);

CREATE TABLE public.notifications (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  related_id uuid,
  read_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE public.offer_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  offer_id uuid NOT NULL,
  listing_id uuid NOT NULL,
  quantity numeric NOT NULL,
  price_per_unit numeric NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.offer_messages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  offer_id uuid NOT NULL,
  sender_role text NOT NULL,
  sender_id uuid NOT NULL,
  price numeric,
  quantity numeric,
  note text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.offers (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  buyer_id uuid NOT NULL,
  farmer_id uuid NOT NULL,
  listing_id uuid NOT NULL,
  quantity numeric(10,2) NOT NULL,
  price_per_unit numeric(12,2) NOT NULL,
  delivery delivery_type DEFAULT 'kargo-buyer'::delivery_type NOT NULL,
  delivery_date date,
  note text,
  status offer_status DEFAULT 'pending'::offer_status NOT NULL,
  counter_offer jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  negotiation_history jsonb DEFAULT '[]'::jsonb NOT NULL,
  ball_side text DEFAULT 'farmer'::text NOT NULL,
  current_price numeric,
  current_quantity numeric,
  payment_status text DEFAULT 'unpaid'::text NOT NULL,
  subscription_id uuid,
  source_recipe_id uuid
);

CREATE TABLE public.order_timeline (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  order_id uuid NOT NULL,
  step text NOT NULL,
  label text NOT NULL,
  completed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.orders (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  offer_id uuid NOT NULL,
  buyer_id uuid NOT NULL,
  farmer_id uuid NOT NULL,
  order_ref text NOT NULL,
  status order_status DEFAULT 'preparing'::order_status NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  tracking_number text,
  carrier text,
  cancelled_at timestamp with time zone,
  cancel_reason text,
  dispute_window_expires_at timestamp with time zone
);

CREATE TABLE public.parcels (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  farm_id uuid NOT NULL,
  farmer_id uuid NOT NULL,
  name text NOT NULL,
  area numeric(6,1) NOT NULL,
  crops text[] DEFAULT '{}'::text[] NOT NULL,
  location_label text,
  lat numeric(10,6),
  lng numeric(10,6),
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  parcel_photo_urls text[] DEFAULT '{}'::text[] NOT NULL,
  production_method text DEFAULT 'outdoor'::text,
  is_primary boolean DEFAULT false
);

CREATE TABLE public.price_alerts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  farmer_id uuid NOT NULL,
  crop text NOT NULL,
  target_price numeric(12,2) NOT NULL,
  condition price_alert_condition NOT NULL,
  channels notif_channel[] DEFAULT '{whatsapp}'::notif_channel[] NOT NULL,
  active boolean DEFAULT true NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.price_history (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  crop text NOT NULL,
  source text NOT NULL,
  price_per_unit numeric NOT NULL,
  unit text NOT NULL,
  region text,
  recorded_date date NOT NULL,
  order_id uuid,
  farmer_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  market_source_code text
);

CREATE TABLE public.price_points (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  crop text NOT NULL,
  hal_price numeric(12,2),
  d2c_price numeric(12,2),
  export_price numeric(8,4),
  delta_7d numeric(6,2),
  recorded_date date DEFAULT CURRENT_DATE NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.profiles (
  id uuid NOT NULL,
  role user_role NOT NULL,
  name text,
  phone text,
  city text,
  premium boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  tier user_tier DEFAULT 'free'::user_tier NOT NULL,
  iban text,
  bank_account_name text,
  referral_code text,
  referred_by uuid,
  buyer_type company_type,
  premium_until timestamp with time zone,
  deleted_at timestamp with time zone
);

CREATE TABLE public.recipe_admin_reviews (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  job_id uuid NOT NULL,
  batch_id uuid NOT NULL,
  draft_id uuid,
  draft_version integer,
  action text NOT NULL,
  temperature_reviewed boolean DEFAULT false NOT NULL,
  timing_reviewed boolean DEFAULT false NOT NULL,
  allergens_reviewed boolean DEFAULT false NOT NULL,
  content_reviewed boolean DEFAULT false NOT NULL,
  images_reviewed boolean DEFAULT false NOT NULL,
  from_stage text NOT NULL,
  from_status text NOT NULL,
  to_stage text NOT NULL,
  to_status text NOT NULL,
  notes text,
  admin_actor text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.recipe_assets (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  job_id uuid NOT NULL,
  draft_id uuid NOT NULL,
  recipe_id uuid,
  asset_type text NOT NULL,
  step_no integer,
  storage_bucket text DEFAULT 'crop-photos'::text NOT NULL,
  storage_path text NOT NULL,
  content_type text DEFAULT 'image/webp'::text NOT NULL,
  width_px integer,
  height_px integer,
  source_width_px integer,
  source_height_px integer,
  quality integer,
  prompt text,
  processing_params jsonb,
  validation_status text,
  validation_results jsonb,
  provider text DEFAULT 'google-gemini'::text,
  model text,
  trace_id text,
  generated_at timestamp with time zone DEFAULT now() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.recipe_drafts (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  job_id uuid NOT NULL,
  version integer NOT NULL,
  title text NOT NULL,
  description text,
  cover_photo_url text,
  servings integer,
  prep_minutes integer,
  cook_minutes integer,
  rest_minutes integer,
  difficulty text,
  cuisine text,
  diet_tags text[] DEFAULT '{}'::text[] NOT NULL,
  allergen_labels text[],
  required_equipment text[],
  source_type text DEFAULT 'manual'::text NOT NULL,
  author_type text DEFAULT 'hasat'::text NOT NULL,
  visibility text DEFAULT 'private'::text NOT NULL,
  owner_id uuid,
  extraction_confidence numeric,
  ingredients jsonb NOT NULL,
  steps jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  nutrition_preview jsonb,
  nutrition_preview_computed_at timestamp with time zone
);

CREATE TABLE public.recipe_generation_batches (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  requested_by uuid,
  target_count integer NOT NULL,
  focus_crops text[],
  diet_focus text[] DEFAULT '{}'::text[] NOT NULL,
  locale text DEFAULT 'tr'::text NOT NULL,
  notes text,
  planner_model text,
  planned_at timestamp with time zone,
  status text DEFAULT 'active'::text NOT NULL,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  error_summary jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  review_status text DEFAULT 'pending_review'::text NOT NULL,
  reviewed_by text,
  reviewed_at timestamp with time zone,
  plan_error jsonb,
  diversity_report jsonb,
  fanned_out_at timestamp with time zone
);

CREATE TABLE public.recipe_generation_jobs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  batch_id uuid NOT NULL,
  brief_id uuid NOT NULL,
  recipe_id uuid,
  requested_by uuid,
  working_title text NOT NULL,
  focus_crop text,
  angle text,
  target_difficulty text,
  diet_tags text[] DEFAULT '{}'::text[] NOT NULL,
  locale text DEFAULT 'tr'::text NOT NULL,
  stage text DEFAULT 'plan'::text NOT NULL,
  status text DEFAULT 'queued'::text NOT NULL,
  revision_count integer DEFAULT 0 NOT NULL,
  attempt integer DEFAULT 1 NOT NULL,
  max_attempts integer DEFAULT 3 NOT NULL,
  next_attempt_at timestamp with time zone,
  last_error jsonb,
  locked_by text,
  locked_at timestamp with time zone,
  lock_expires_at timestamp with time zone,
  trace_id text,
  provider text,
  model text,
  usage jsonb,
  started_at timestamp with time zone,
  finished_at timestamp with time zone,
  completed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.recipe_generation_stage_runs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  job_id uuid NOT NULL,
  batch_id uuid NOT NULL,
  recipe_id uuid,
  stage text NOT NULL,
  status text NOT NULL,
  attempt integer NOT NULL,
  started_at timestamp with time zone NOT NULL,
  finished_at timestamp with time zone,
  output jsonb,
  error jsonb,
  trace_id text,
  provider text,
  model text,
  usage jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.recipe_ingredient_nutrition_backfill_audit (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  migration_key text NOT NULL,
  ingredient_id uuid NOT NULL,
  recipe_id uuid NOT NULL,
  before_row jsonb NOT NULL,
  after_row jsonb NOT NULL,
  rationale text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.recipe_ingredients (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  recipe_id uuid NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  crop text,
  free_text_name text,
  quantity numeric,
  unit text,
  note text,
  is_key_ingredient boolean DEFAULT false NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  ingredient_class text,
  nutrition_food_key text,
  nutrition_exclusion_reason text
);

CREATE TABLE public.recipe_plan_briefs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  batch_id uuid NOT NULL,
  brief_id uuid NOT NULL,
  working_title text NOT NULL,
  focus_crop text NOT NULL,
  angle text,
  target_difficulty text,
  diet_tags text[] DEFAULT '{}'::text[] NOT NULL,
  locale text DEFAULT 'tr'::text NOT NULL,
  audience text DEFAULT 'bireysel'::text NOT NULL,
  meal_type text,
  selection_reason text NOT NULL,
  excluded boolean DEFAULT false NOT NULL,
  exclusion_reason text,
  job_id uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.recipe_qa_results (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  job_id uuid NOT NULL,
  draft_id uuid NOT NULL,
  draft_version integer NOT NULL,
  recipe_id uuid,
  decision text NOT NULL,
  overall_score numeric NOT NULL,
  scores jsonb NOT NULL,
  blocking_issues jsonb DEFAULT '[]'::jsonb NOT NULL,
  non_blocking_suggestions jsonb DEFAULT '[]'::jsonb NOT NULL,
  safety_review jsonb NOT NULL,
  safety_reviewed_by uuid,
  safety_reviewed_at timestamp with time zone,
  safety_approved boolean,
  approved_for_imaging boolean DEFAULT false NOT NULL,
  model text,
  checked_at timestamp with time zone DEFAULT now() NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.recipe_rfq_links (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  recipe_id uuid NOT NULL,
  crop_request_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.recipe_saves (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  user_id uuid NOT NULL,
  recipe_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.recipe_steps (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  recipe_id uuid NOT NULL,
  step_no integer NOT NULL,
  instruction text NOT NULL,
  photo_url text,
  timer_seconds integer,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.recipe_views (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  recipe_id uuid NOT NULL,
  user_id uuid,
  session_id text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.recipes (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  slug text NOT NULL,
  title text NOT NULL,
  description text,
  cover_photo_url text,
  servings integer,
  prep_minutes integer,
  cook_minutes integer,
  difficulty text,
  cuisine text,
  diet_tags text[] DEFAULT '{}'::text[] NOT NULL,
  status text DEFAULT 'draft'::text NOT NULL,
  visibility text DEFAULT 'private'::text NOT NULL,
  source_type text DEFAULT 'manual'::text NOT NULL,
  source_url text,
  owner_id uuid,
  author_type text DEFAULT 'hasat'::text NOT NULL,
  extraction_confidence numeric,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  rest_minutes integer,
  allergen_labels text[],
  required_equipment text[],
  calories numeric,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  fiber_g numeric,
  micronutrients jsonb,
  nutrition_calculated_at timestamp with time zone,
  share_token uuid,
  cloned_from_recipe_id uuid,
  nutrition_source text,
  nutrition_coverage_pct numeric(5,2),
  nutrition_input_hash text,
  nutrition_reference_version text,
  nutrition_warnings text[] DEFAULT '{}'::text[] NOT NULL,
  allergens_reviewed boolean DEFAULT false NOT NULL,
  allergens_reviewed_at timestamp with time zone,
  allergens_reviewed_by uuid
);

CREATE TABLE public.referral_qualifications (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  referred_user_id uuid NOT NULL,
  referrer_id uuid NOT NULL,
  qualified_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.reviews (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  order_id uuid NOT NULL,
  reviewer_id uuid NOT NULL,
  reviewee_id uuid NOT NULL,
  reviewer_role text NOT NULL,
  rating integer NOT NULL,
  comment text,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- ============================== TABLES (private) ==============================
CREATE TABLE private.admin_sms_outbox (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  event_key text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  attempt_count smallint DEFAULT 0 NOT NULL,
  next_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
  last_attempt_at timestamp with time zone,
  sent_at timestamp with time zone,
  provider_message_id text,
  last_error_code text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- ============================== SEQUENCE OWNERSHIP ==============================
ALTER SEQUENCE public.mcp_tool_calls_id_seq OWNED BY public.mcp_tool_calls.id;

-- ============================== FUNCTIONS (public) ==============================
-- topologically ordered so a function is created before anything that
-- references it (required for LANGUAGE sql functions, which Postgres
-- resolves eagerly at CREATE time; also needed by CHECK constraints below).
CREATE OR REPLACE FUNCTION public.admin_update_ingredient_nutrition(p_ingredient_id uuid, p_crop text, p_free_text_name text, p_quantity numeric, p_unit text, p_nutrition_food_key text, p_nutrition_exclusion_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  update public.recipe_ingredients
  set crop = p_crop,
      free_text_name = p_free_text_name,
      quantity = p_quantity,
      unit = p_unit,
      nutrition_food_key = p_nutrition_food_key,
      nutrition_exclusion_reason = p_nutrition_exclusion_reason
  where id = p_ingredient_id;

  if not found then
    raise exception 'ADMIN_UPDATE_INGREDIENT_NOT_FOUND: recipe_ingredients row % not found', p_ingredient_id;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.buyer_addresses_clear_default()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.is_default THEN
    UPDATE public.buyer_addresses
      SET is_default = false, updated_at = now()
      WHERE buyer_id = NEW.buyer_id
        AND id <> NEW.id
        AND is_default;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.buyer_addresses_touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.can_send_ai_message(_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _tier public.user_tier;
  _pu timestamptz;
  _count integer;
  _month text := to_char(now(), 'YYYY-MM');
  _free_limit constant integer := 50;
  _premium_limit constant integer := 500;
BEGIN
  IF current_setting('request.jwt.claims', true)::jsonb->>'role' = 'authenticated' THEN
    IF _user_id <> auth.uid() THEN
      RAISE EXCEPTION 'Cross-user access not allowed';
    END IF;
  END IF;

  SELECT tier, premium_until INTO _tier, _pu FROM public.profiles WHERE id = _user_id;
  IF _tier IS NULL THEN RETURN false; END IF;

  SELECT COALESCE(message_count, 0) INTO _count
    FROM public.ai_usage_tracking WHERE user_id = _user_id AND month = _month;

  IF _tier = 'premium' AND (_pu IS NULL OR _pu > now()) THEN
    RETURN COALESCE(_count, 0) < _premium_limit;
  END IF;

  RETURN COALESCE(_count, 0) < _free_limit;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_and_record_mcp_call()
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  recent_count integer;
  window_start timestamptz := now() - interval '10 minutes';
BEGIN
  -- Skip enforcement for service_role / non-authenticated callers
  IF uid IS NULL THEN
    RETURN true;
  END IF;

  -- Opportunistic cleanup: delete rows older than 1 hour (kept only for stats/debug)
  DELETE FROM public.mcp_tool_calls
    WHERE called_at < now() - interval '1 hour';

  SELECT count(*) INTO recent_count
    FROM public.mcp_tool_calls
    WHERE user_id = uid AND called_at > window_start;

  IF recent_count >= 30 THEN
    RAISE EXCEPTION 'Çok fazla istek gönderildi, birkaç dakika sonra tekrar deneyin.';
  END IF;

  INSERT INTO public.mcp_tool_calls (user_id) VALUES (uid);
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_admin_sms_event(p_event_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  _event private.admin_sms_outbox%rowtype;
  _recent_attempts integer;
  _rate_gate_lock_class constant integer := 12125002;
  _rate_gate_lock_object constant integer := 1;
begin
  -- Every claim path takes the same transaction-scoped global gate before any event row lock.
  -- This makes the rolling count + claim update atomic across different event IDs, while the
  -- single lock order (global gate -> event row) avoids cross-event deadlocks.
  perform pg_catalog.pg_advisory_xact_lock(
    _rate_gate_lock_class,
    _rate_gate_lock_object
  );

  select *
    into _event
    from private.admin_sms_outbox
    where id = p_event_id
    for update;

  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  if _event.status = 'sent' then
    return jsonb_build_object('outcome', 'duplicate');
  end if;

  -- A request that reached Twilio but did not record its result is deliberately never retried
  -- automatically: standard Twilio Message creation has no idempotency key, so retrying an
  -- uncertain POST could create a second paid SMS. Operators reconcile this state in Twilio logs.
  if _event.status in ('sending', 'uncertain') then
    return jsonb_build_object('outcome', 'in_progress_or_uncertain');
  end if;

  if _event.status = 'dead' or _event.attempt_count >= 3 then
    update private.admin_sms_outbox
      set status = 'dead', updated_at = clock_timestamp()
      where id = p_event_id;
    return jsonb_build_object('outcome', 'attempts_exhausted');
  end if;

  if _event.next_attempt_at > clock_timestamp() then
    return jsonb_build_object('outcome', 'retry_later');
  end if;

  select count(*)::integer
    into _recent_attempts
    from private.admin_sms_outbox
    where last_attempt_at >= clock_timestamp() - interval '1 minute';

  if _recent_attempts >= 5 then
    return jsonb_build_object('outcome', 'rate_limited');
  end if;

  update private.admin_sms_outbox
    set status = 'sending',
        attempt_count = attempt_count + 1,
        last_attempt_at = clock_timestamp(),
        last_error_code = null,
        updated_at = clock_timestamp()
    where id = p_event_id
    returning * into _event;

  return jsonb_build_object(
    'outcome', 'claimed',
    'eventType', _event.event_type,
    'payload', _event.payload,
    'attemptCount', _event.attempt_count
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.complete_admin_sms_event(p_event_id uuid, p_outcome text, p_provider_message_id text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  _updated integer;
begin
  if p_outcome not in ('sent', 'retryable_failure', 'uncertain') then
    raise exception using errcode = '22023', message = 'unsupported admin SMS outcome';
  end if;

  update private.admin_sms_outbox
    set status = case
          when p_outcome = 'sent' then 'sent'
          when p_outcome = 'uncertain' then 'uncertain'
          when attempt_count >= 3 then 'dead'
          else 'failed'
        end,
        provider_message_id = case
          when p_outcome = 'sent' then left(p_provider_message_id, 64)
          else null
        end,
        last_error_code = case
          when p_outcome = 'retryable_failure' then 'provider_rejected'
          when p_outcome = 'uncertain' then 'provider_result_uncertain'
          else null
        end,
        next_attempt_at = case
          when p_outcome = 'retryable_failure' and attempt_count = 1
            then clock_timestamp() + interval '1 minute'
          when p_outcome = 'retryable_failure' and attempt_count = 2
            then clock_timestamp() + interval '5 minutes'
          else next_attempt_at
        end,
        sent_at = case when p_outcome = 'sent' then clock_timestamp() else null end,
        updated_at = clock_timestamp()
    where id = p_event_id and status = 'sending';

  get diagnostics _updated = row_count;
  return _updated = 1;
end;
$function$;

CREATE OR REPLACE FUNCTION public.dispatch_push(_user_id uuid, _event text, _title text, _message text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  _col text;
  _enabled boolean;
  _sql text;
  _url text := 'https://efuqpiaavrzimvstpdpm.supabase.co/functions/v1/send-push';
  _anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVmdXFwaWFhdnJ6aW12c3RwZHBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MDE4NzgsImV4cCI6MjA5NjQ3Nzg3OH0.YQ459pxmKISJYfuzbA7edlIywHl11-62znbb-iIw8Pg';
  _tokens text[];
begin
  if _user_id is null or _event is null then return; end if;

  -- Kural #101/#106: bu CASE, send-sms'in COL map'inin aksine, TEK yerde
  -- yaşıyor -- send-push edge function'ı bunu tekrarlamıyor.
  _col := case _event
    when 'new_offer' then 'new_offer_push'
    when 'harvest_time' then 'harvest_time_push'
    when 'offer_accepted' then 'offer_accepted_push'
    when 'offer_countered' then 'offer_countered_push'
    when 'offer_rejected' then 'offer_rejected_push'
    when 'payment_confirmed' then 'payment_confirmed_push'
    when 'order_preparing' then 'order_preparing_push'
    when 'order_shipped' then 'order_shipped_push'
    when 'order_delivered' then 'order_delivered_push'
    when 'order_cancelled' then 'order_cancelled_push'
    when 'order_completed' then 'order_completed_push'
    when 'dispute_opened' then 'dispute_opened_push'
    when 'crop_request_match' then 'crop_request_match_push'
    when 'subscription_new' then 'subscription_new_push'
    when 'subscription_accepted' then 'subscription_accepted_push'
    when 'subscription_rejected' then 'subscription_rejected_push'
    else null end;
  if _col is null then return; end if;

  _sql := format('select coalesce(%I, false) from public.notif_prefs where user_id = $1', _col);
  execute _sql into _enabled using _user_id;
  if not coalesce(_enabled, false) then return; end if;

  select array_agg(token) into _tokens from public.device_tokens where user_id = _user_id;
  if _tokens is null or array_length(_tokens, 1) = 0 then return; end if;

  perform net.http_post(
    url := _url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _anon
    ),
    body := jsonb_build_object(
      'tokens', to_jsonb(_tokens),
      'title', _title,
      'body', _message,
      'event', _event,
      'userId', _user_id
    )
  );
exception when others then
  raise log 'dispatch_push failed: %', sqlerrm;
end;
$function$;

CREATE OR REPLACE FUNCTION public.dispatch_recipe_stage(_job_id uuid, _function_name text, _dispatch_key text, _payload jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  _allowed_function_names constant text[] := array[
    'recipe-stage-plan',
    'recipe-stage-write',
    'recipe-stage-qa',
    'recipe-stage-revise',
    'recipe-stage-image',
    'recipe-stage-finalize',
    'recipe-stage-publish'
  ];
  _base_url text := coalesce(
    current_setting('app.dispatch_base_url', true),
    'https://efuqpiaavrzimvstpdpm.supabase.co/functions/v1/'
  );
  _url text;
begin
  if _job_id is null or _function_name is null or _dispatch_key is null then
    return;
  end if;

  if not (_function_name = any (_allowed_function_names)) then
    raise log 'dispatch_recipe_stage refused unknown function_name % for job %', _function_name, _job_id;
    return;
  end if;

  _url := _base_url || _function_name;

  perform net.http_post(
    url := _url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-admin-key', _dispatch_key
    ),
    body := coalesce(_payload, '{}'::jsonb) || jsonb_build_object('jobId', _job_id)
  );
exception when others then
  raise log 'dispatch_recipe_stage failed for job %/%: %', _job_id, _function_name, sqlerrm;
end;
$function$;

CREATE OR REPLACE FUNCTION public.dispatch_sms(_user_id uuid, _event text, _message text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  _col text;
  _enabled boolean;
  _sql text;
  _url text := 'https://efuqpiaavrzimvstpdpm.supabase.co/functions/v1/send-sms';
  _anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVmdXFwaWFhdnJ6aW12c3RwZHBtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MDE4NzgsImV4cCI6MjA5NjQ3Nzg3OH0.YQ459pxmKISJYfuzbA7edlIywHl11-62znbb-iIw8Pg';
begin
  if _user_id is null or _event is null then return; end if;
  _col := case _event
    when 'new_offer' then 'new_offer_sms'
    when 'harvest_time' then 'harvest_time_sms'
    when 'offer_accepted' then 'offer_accepted_sms'
    when 'offer_rejected' then 'offer_rejected_sms'
    when 'payment_confirmed' then 'payment_confirmed_sms'
    when 'order_preparing' then 'order_preparing_sms'
    when 'order_shipped' then 'order_shipped_sms'
    when 'order_delivered' then 'order_delivered_sms'
    when 'order_cancelled' then 'order_cancelled_sms'
    when 'order_completed' then 'order_completed_sms'
    when 'dispute_opened' then 'dispute_opened_sms'
    when 'crop_request_match' then 'crop_request_match_sms'
    when 'subscription_new' then 'subscription_new_sms'
    when 'subscription_accepted' then 'subscription_accepted_sms'
    when 'subscription_rejected' then 'subscription_rejected_sms'
    else null end;
  if _col is null then return; end if;

  _sql := format('select coalesce(%I, false) from public.notif_prefs where user_id = $1', _col);
  execute _sql into _enabled using _user_id;
  if not coalesce(_enabled, false) then return; end if;

  perform net.http_post(
    url := _url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _anon
    ),
    body := jsonb_build_object(
      'userId', _user_id,
      'message', _message,
      'event', _event
    )
  );
exception when others then
  raise log 'dispatch_sms failed: %', sqlerrm;
end;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_cert_verification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RETURN NEW;
  END IF;
  IF uid = NEW.farmer_id THEN
    NEW.verified_at := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_community_moderation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  s text;
  has_currency boolean;
  has_coord boolean;
BEGIN
  s := ' ' || lower(coalesce(NEW.content,'')) || ' ';
  has_currency := s LIKE '%₺%' OR s LIKE '% tl%' OR s LIKE '%$%';
  has_coord := s LIKE '%anlaşalım%'
            OR s LIKE '%birlikte%'
            OR s LIKE '%hepimiz%'
            OR s LIKE '%sabit fiyat%'
            OR s LIKE '%taban fiyat%';
  NEW.flagged_for_review := (has_currency AND has_coord);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_harvest_date_lock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.harvest_date IS DISTINCT FROM OLD.harvest_date THEN
    IF EXISTS (
      SELECT 1
      FROM public.listing_harvest_entries lhe
      JOIN public.listings l ON l.id = lhe.listing_id
      WHERE lhe.harvest_entry_id = NEW.id
        AND l.status IN ('active','sold')
    ) THEN
      RAISE EXCEPTION 'Aktif veya satılmış bir ürüne bağlı hasadın olay tarihi değiştirilemez';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_link_unit_match()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  he_unit text;
  l_unit text;
BEGIN
  SELECT unit::text INTO he_unit FROM public.harvest_entries WHERE id = NEW.harvest_entry_id;
  SELECT unit::text INTO l_unit  FROM public.listings        WHERE id = NEW.listing_id;
  IF he_unit IS NOT NULL AND l_unit IS NOT NULL AND he_unit <> l_unit THEN
    RAISE EXCEPTION 'Hasat birimi (%) ilanın birimi (%) ile eşleşmiyor', he_unit, l_unit;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_offer_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  items_count int;
  rec record;
  batch_total numeric;
  listing_qty numeric;
  base_stock numeric;
  reserved numeric;
  available numeric;
  requested numeric;
BEGIN
  IF NEW.status = 'accepted' AND (OLD.status IS DISTINCT FROM 'accepted') THEN
    SELECT count(*) INTO items_count FROM public.offer_items WHERE offer_id = NEW.id;

    IF items_count > 0 THEN
      -- Per-listing check across all offer_items rows (grouped by listing)
      FOR rec IN
        SELECT listing_id, SUM(quantity) AS requested_qty
        FROM public.offer_items
        WHERE offer_id = NEW.id
        GROUP BY listing_id
      LOOP
        SELECT COALESCE(SUM(he.quantity), 0), MAX(l.quantity)
          INTO batch_total, listing_qty
          FROM public.listings l
          LEFT JOIN public.listing_harvest_entries lhe ON lhe.listing_id = l.id
          LEFT JOIN public.harvest_entries he ON he.id = lhe.harvest_entry_id
          WHERE l.id = rec.listing_id
          GROUP BY l.id;

        base_stock := CASE WHEN batch_total > 0 THEN batch_total ELSE COALESCE(listing_qty, 0) END;

        SELECT COALESCE(SUM(oi.quantity), 0)
          INTO reserved
          FROM public.offer_items oi
          JOIN public.offers o ON o.id = oi.offer_id
          WHERE oi.listing_id = rec.listing_id
            AND o.status = 'accepted'
            AND o.id <> NEW.id;

        available := base_stock - reserved;
        IF rec.requested_qty > available THEN
          RAISE EXCEPTION 'Stok yetersiz (batch)';
        END IF;
      END LOOP;
    ELSE
      -- Legacy single-listing path (unchanged behaviour)
      SELECT COALESCE(SUM(he.quantity), 0), MAX(l.quantity)
        INTO batch_total, listing_qty
        FROM public.listings l
        LEFT JOIN public.listing_harvest_entries lhe ON lhe.listing_id = l.id
        LEFT JOIN public.harvest_entries he ON he.id = lhe.harvest_entry_id
        WHERE l.id = NEW.listing_id
        GROUP BY l.id;

      base_stock := CASE WHEN batch_total > 0 THEN batch_total ELSE COALESCE(listing_qty, 0) END;

      SELECT COALESCE(SUM(o.quantity), 0)
        INTO reserved
        FROM public.offers o
        WHERE o.listing_id = NEW.listing_id
          AND o.status = 'accepted'
          AND o.id <> NEW.id;

      requested := COALESCE(NEW.current_quantity, NEW.quantity);
      available := base_stock - reserved;

      IF requested > available THEN
        RAISE EXCEPTION 'Stok yetersiz';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_offer_transitions()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  econ_changed boolean;
  turn_holder uuid;
BEGIN
  IF uid IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
    IF OLD.payment_status = 'unpaid'
       AND NEW.payment_status = 'pending_transfer'
       AND uid = NEW.buyer_id
       AND OLD.status = 'accepted' THEN
      NULL;
    ELSIF OLD.payment_status = 'pending_transfer'
       AND NEW.payment_status = 'paid'
       AND uid = NEW.farmer_id THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'Gecersiz odeme durumu gecisi: % -> %',
        OLD.payment_status, NEW.payment_status;
    END IF;
  END IF;

  econ_changed :=
       NEW.price_per_unit    IS DISTINCT FROM OLD.price_per_unit
    OR NEW.quantity          IS DISTINCT FROM OLD.quantity
    OR NEW.current_price     IS DISTINCT FROM OLD.current_price
    OR NEW.current_quantity  IS DISTINCT FROM OLD.current_quantity;

  IF econ_changed THEN
    IF COALESCE(OLD.ball_side,'farmer') = 'farmer' THEN
      turn_holder := OLD.farmer_id;
    ELSE
      turn_holder := OLD.buyer_id;
    END IF;

    IF NEW.status <> 'counter'
       OR OLD.status NOT IN ('pending','counter')
       OR uid <> turn_holder
       OR COALESCE(NEW.ball_side,'farmer') = COALESCE(OLD.ball_side,'farmer')
       OR NEW.ball_side NOT IN ('farmer','buyer') THEN
      RAISE EXCEPTION 'Fiyat/miktar yalnizca karsi teklif sirasinda ve sira sizdeyken degistirilebilir';
    END IF;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
         (OLD.status = 'pending' AND NEW.status IN ('counter','accepted','rejected'))
      OR (OLD.status = 'counter' AND NEW.status IN ('counter','accepted','rejected'))
    ) THEN
      RAISE EXCEPTION 'Gecersiz teklif durum gecisi: % -> %', OLD.status, NEW.status;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_profile_self_update_restrictions()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL OR uid <> NEW.id THEN
    RETURN NEW;
  END IF;

  NEW.role       := OLD.role;
  NEW.tier       := OLD.tier;
  NEW.premium    := OLD.premium;

  IF NEW.referred_by IS DISTINCT FROM OLD.referred_by THEN
    IF OLD.referred_by IS NOT NULL THEN
      NEW.referred_by := OLD.referred_by;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_subscription_buyer_role()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r public.user_role;
BEGIN
  SELECT role INTO r FROM public.profiles WHERE id = NEW.buyer_id;
  IF r IS DISTINCT FROM 'buyer'::public.user_role THEN
    RAISE EXCEPTION 'harvest_subscriptions.buyer_id must reference a profile with role=buyer';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_subscription_updates()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RETURN NEW; END IF;

  IF NEW.buyer_id IS DISTINCT FROM OLD.buyer_id
     OR NEW.farmer_id IS DISTINCT FROM OLD.farmer_id THEN
    RAISE EXCEPTION 'Abonelik sahipliği değiştirilemez';
  END IF;

  IF uid = OLD.buyer_id THEN
    IF NEW.volume_commitment IS DISTINCT FROM OLD.volume_commitment
       OR NEW.price_lock       IS DISTINCT FROM OLD.price_lock
       OR NEW.locked_price     IS DISTINCT FROM OLD.locked_price
       OR NEW.locked_at        IS DISTINCT FROM OLD.locked_at
       OR NEW.next_harvest_date IS DISTINCT FROM OLD.next_harvest_date
       OR NEW.estimated_qty    IS DISTINCT FROM OLD.estimated_qty THEN
      RAISE EXCEPTION 'Alıcı yalnızca aboneliği iptal edebilir';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'cancelled' THEN
      RAISE EXCEPTION 'Alıcı yalnızca cancelled durumuna geçebilir';
    END IF;
  ELSIF uid = OLD.farmer_id THEN
    IF NEW.volume_commitment IS DISTINCT FROM OLD.volume_commitment
       OR NEW.price_lock       IS DISTINCT FROM OLD.price_lock
       OR NEW.locked_price     IS DISTINCT FROM OLD.locked_price
       OR NEW.locked_at        IS DISTINCT FROM OLD.locked_at THEN
      RAISE EXCEPTION 'Ekonomik alanlar üretici tarafından değiştirilemez';
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT (
           (OLD.status = 'pending' AND NEW.status IN ('active','cancelled'))
        OR (OLD.status = 'active'  AND NEW.status IN ('paused','fulfilled','cancelled'))
        OR (OLD.status = 'paused'  AND NEW.status IN ('active','cancelled'))
      ) THEN
        RAISE EXCEPTION 'Geçersiz abonelik durum geçişi: % -> %', OLD.status, NEW.status;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.fan_out_recipe_plan_batch(_batch_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_batch record;
  v_brief record;
  v_job_id uuid;
  v_jobs jsonb := '[]'::jsonb;
begin
  -- Lock the batch row for the rest of this transaction — a second, concurrent fan-out call for the
  -- SAME batch blocks here until the first commits, then observes the already-linked
  -- recipe_plan_briefs.job_id values and takes the "already created" branch below for every brief,
  -- never attempting a second insert. This is the real no-duplicate guarantee; the
  -- recipe_generation_jobs_batch_id_brief_id_key UNIQUE constraint (f2s03) plus the
  -- ON CONFLICT DO NOTHING below is the backstop for a caller that races this function without ever
  -- taking the lock at all (impossible from this function's own callers, but defense in depth costs
  -- nothing here).
  select * into v_batch from public.recipe_generation_batches where id = _batch_id for update;
  if not found then
    raise exception 'FANOUT_BATCH_NOT_FOUND: batch % not found', _batch_id;
  end if;

  if v_batch.review_status <> 'approved' then
    raise exception 'FANOUT_BATCH_NOT_APPROVED: batch % is not approved (review_status=%)', _batch_id, v_batch.review_status;
  end if;

  for v_brief in
    select * from public.recipe_plan_briefs
    where batch_id = _batch_id and not excluded
    order by created_at asc
  loop
    if v_brief.job_id is not null then
      -- Already promoted by an earlier fan-out call for this batch — report it back to the caller
      -- (so it can still be (re)dispatched, which is always safe to repeat, see
      -- ../infra/stage-dispatch.ts's header) without attempting to insert again.
      v_jobs := v_jobs || jsonb_build_object(
        'briefId', v_brief.brief_id, 'jobId', v_brief.job_id,
        'workingTitle', v_brief.working_title, 'focusCrop', v_brief.focus_crop, 'created', false
      );
      continue;
    end if;

    v_job_id := null;
    insert into public.recipe_generation_jobs (
      batch_id, brief_id, working_title, focus_crop, angle, target_difficulty, diet_tags, locale,
      stage, status
    ) values (
      v_brief.batch_id, v_brief.brief_id, v_brief.working_title, v_brief.focus_crop, v_brief.angle,
      v_brief.target_difficulty, v_brief.diet_tags, v_brief.locale,
      -- Jobs are created already PAST 'plan' — planning happened at the batch level, not per-job;
      -- 'write' is the first stage a per-brief job actually runs (see recipe-stage-write's own
      -- claimJob(expectedStage='write')).
      'write', 'queued'
    )
    on conflict on constraint recipe_generation_jobs_batch_id_brief_id_key do nothing
    returning id into v_job_id;

    if v_job_id is null then
      -- Conflict path: a job for this exact (batch_id, brief_id) already exists (a genuinely
      -- concurrent caller that inserted between our lock and this statement is impossible given the
      -- FOR UPDATE lock above — this path is reached only by a caller that created the job through
      -- some other route entirely, e.g. a manual fix). Link to whatever already exists rather than
      -- erroring, so this function stays idempotent regardless of how that row got there.
      select id into v_job_id from public.recipe_generation_jobs
      where batch_id = v_brief.batch_id and brief_id = v_brief.brief_id;
    end if;

    update public.recipe_plan_briefs set job_id = v_job_id where id = v_brief.id;

    v_jobs := v_jobs || jsonb_build_object(
      'briefId', v_brief.brief_id, 'jobId', v_job_id,
      'workingTitle', v_brief.working_title, 'focusCrop', v_brief.focus_crop, 'created', true
    );
  end loop;

  update public.recipe_generation_batches
  set fanned_out_at = coalesce(fanned_out_at, now())
  where id = _batch_id;

  return jsonb_build_object('ok', true, 'batchId', _batch_id, 'jobs', v_jobs);
end;
$function$;

CREATE OR REPLACE FUNCTION public.find_recipe_duplicates(p_title text, p_crop text DEFAULT NULL::text, p_slug text DEFAULT NULL::text, p_limit integer DEFAULT 5)
 RETURNS TABLE(id uuid, slug text, title text, match_reason text, status text, visibility text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with candidate_words as (
    select array_agg(distinct w) as words
    from unnest(regexp_split_to_array(btrim(lower(coalesce(p_title, ''))), '\s+')) as w
    where length(w) >= 4
  ),
  scored as (
    select
      r.id, r.slug, r.title, r.status, r.visibility,
      case
        when p_slug is not null and r.slug = p_slug then 'exact_slug'
        when lower(btrim(r.title)) = lower(btrim(coalesce(p_title, ''))) then 'exact_title'
        when (
          select count(*) from unnest(
            regexp_split_to_array(btrim(lower(r.title)), '\s+')
          ) as rw
          where length(rw) >= 4
            and rw = any (coalesce((select words from candidate_words), array[]::text[]))
        ) >= 2 then 'title_word_overlap'
        when p_crop is not null
          and exists (select 1 from public.recipe_ingredients ri where ri.recipe_id = r.id and ri.crop = p_crop)
          and (
            select count(*) from unnest(
              regexp_split_to_array(btrim(lower(r.title)), '\s+')
            ) as rw
            where length(rw) >= 4
              and rw = any (coalesce((select words from candidate_words), array[]::text[]))
          ) >= 1 then 'same_crop_and_title_word'
        else null
      end as match_reason
    from public.recipes r
  )
  select id, slug, title, match_reason, status, visibility
  from scored
  where match_reason is not null
  order by
    case match_reason
      when 'exact_slug' then 0
      when 'exact_title' then 1
      when 'title_word_overlap' then 2
      else 3
    end
  limit greatest(1, least(50, coalesce(p_limit, 5)));
$function$;

CREATE OR REPLACE FUNCTION public.fn_culinary_to_canonical(p_crop text, p_quantity numeric, p_unit text)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  v_default_unit text;
  v_unit  text := lower(btrim(coalesce(p_unit, '')));
  v_base  numeric;   -- gram veya mililitre cinsinden ara değer
  v_hint  numeric;
begin
  if p_crop is null or p_quantity is null or v_unit = '' then
    return null;
  end if;

  select cc.default_unit into v_default_unit
  from public.crop_config cc
  where cc.crop = p_crop;

  if v_default_unit is null then
    return null;                              -- bilinmeyen crop
  end if;

  -- 1) Metrik birimler ipucu gerektirmez.
  v_base := case v_unit
              when 'g'     then p_quantity
              when 'gr'    then p_quantity
              when 'gram'  then p_quantity
              when 'kg'    then p_quantity * 1000
              when 'ml'    then p_quantity
              when 'l'     then p_quantity * 1000
              when 'lt'    then p_quantity * 1000
              when 'litre' then p_quantity * 1000
              else null
            end;

  -- 2) Culinary birim: YALNIZCA conversion_hints'ten.
  if v_base is null then
    select case
             when jsonb_typeof(m.conversion_hints -> v_unit) = 'number'
             then (m.conversion_hints ->> v_unit)::numeric
           end
      into v_hint
    from public.crop_culinary_meta m
    where m.crop = p_crop;

    if v_hint is null then
      return null;                            -- ipucu yok -> uydurma yok
    end if;

    v_base := p_quantity * v_hint;
  end if;

  -- 3) Temel metrik birimden kanonik birime.
  return case v_default_unit
           when 'g'  then v_base
           when 'ml' then v_base
           when 'kg' then v_base / 1000.0
           when 'L'  then v_base / 1000.0
           when 'l'  then v_base / 1000.0
           else null
         end;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_match_culinary_crop(p_text text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  v_norm text;
  v_core text;
  v_matches text[];
begin
  if p_text is null then
    return null;
  end if;

  v_norm := lower(btrim(p_text));
  if v_norm = '' then
    return null;
  end if;

  -- Baştaki miktar + mutfak birimini at (ör. "2 adet kırmızı domates" -> "kırmızı domates").
  -- Çok kelimeli birimler (ör. "su bardağı") alternatifte önce gelir.
  v_norm := regexp_replace(
    v_norm,
    '^[0-9]+([.,][0-9]+)?\s*(çay bardağı|su bardağı|yemek kaşığı|tatlı kaşığı|çay kaşığı|bardak|adet|demet|tutam|dal|salkım|dilim|diş|paket|kutu|kg|gr|gram|g|ml|lt|litre|l)?\s*',
    '',
    'i'
  );

  -- Virgülden sonraki hazırlık notunu at (ör. "..., ince kıyılmış").
  v_core := btrim(split_part(v_norm, ',', 1));
  if v_core = '' then
    return null;
  end if;

  select array_agg(distinct cc.crop)
  into v_matches
  from public.crop_culinary_meta cm
  join public.crop_config cc on cc.crop = cm.crop
  where cm.is_edible = true
    and exists (
      select 1 from unnest(cm.culinary_aliases) as alias
      where lower(btrim(alias)) = v_core
    );

  if array_length(v_matches, 1) = 1 then
    return v_matches[1];
  end if;

  return null; -- 0 eşleşme ya da >1 (belirsiz) -> boş bırak
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_nutrition_normalize_text(p_value text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select nullif(regexp_replace(replace(lower(btrim(coalesce(p_value, ''))), '_', ' '), '\s+', ' ', 'g'), '')
$function$;

CREATE OR REPLACE FUNCTION public.fn_nutrition_normalize_unit(p_unit text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select case public.fn_nutrition_normalize_text(p_unit)
    when 'cay kasigi' then 'çay kaşığı'
    when 'çay kasigi' then 'çay kaşığı'
    when 'cay kaşığı' then 'çay kaşığı'
    when 'tatli kasigi' then 'tatlı kaşığı'
    when 'tatlı kasigi' then 'tatlı kaşığı'
    when 'yemek kasigi' then 'yemek kaşığı'
    when 'su bardagi' then 'su bardağı'
    when 'dis' then 'diş'
    else public.fn_nutrition_normalize_text(p_unit)
  end
$function$;

CREATE OR REPLACE FUNCTION public.fn_recipe_canonical_unit(p_unit text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  v text := lower(btrim(coalesce(p_unit, '')));
begin
  if v = '' then
    return null;
  end if;

  return case v
    when 'g' then 'g'
    when 'gr' then 'g'
    when 'gram' then 'g'
    when 'grams' then 'g'
    when 'kg' then 'kg'
    when 'kilo' then 'kg'
    when 'kilogram' then 'kg'
    when 'ml' then 'ml'
    when 'mililitre' then 'ml'
    when 'mililitre'  then 'ml'
    when 'l' then 'l'
    when 'lt' then 'l'
    when 'litre' then 'l'
    when 'lite' then 'l'
    when 'adet' then 'adet'
    when 'tane' then 'adet'
    when 'demet' then 'demet'
    when 'tutam' then 'tutam'
    when 'dal' then 'dal'
    when 'salkım' then 'salkim'
    when 'salkim' then 'salkim'
    when 'dilim' then 'dilim'
    when 'diş' then 'dis'
    when 'dis' then 'dis'
    when 'paket' then 'paket'
    when 'kutu' then 'kutu'
    when 'bardak' then 'bardak'
    when 'su bardağı' then 'su_bardagi'
    when 'su bardagi' then 'su_bardagi'
    when 'çay bardağı' then 'cay_bardagi'
    when 'cay bardagi' then 'cay_bardagi'
    when 'yemek kaşığı' then 'yemek_kasigi'
    when 'yemek kasigi' then 'yemek_kasigi'
    when 'yk' then 'yemek_kasigi'
    when 'tatlı kaşığı' then 'tatli_kasigi'
    when 'tatli kasigi' then 'tatli_kasigi'
    when 'çay kaşığı' then 'cay_kasigi'
    when 'cay kasigi' then 'cay_kasigi'
    when 'ck' then 'cay_kasigi'
    else v
  end;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_recipe_escape_regex(p_text text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select regexp_replace(coalesce(p_text, ''), '([.^$*+?()\[\]{}\\|])', '\\\1', 'g');
$function$;

CREATE OR REPLACE FUNCTION public.fn_recipe_ingredient_grams_v2(p_crop text, p_food_key text, p_free_text_name text, p_quantity numeric, p_unit text)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_unit text := public.fn_nutrition_normalize_unit(p_unit);
  v_alias record;
  v_kind text;
  v_key text;
  v_hint numeric;
begin
  if p_quantity is null or v_unit is null then return null; end if;

  case v_unit
    when 'g' then return p_quantity;
    when 'gr' then return p_quantity;
    when 'gram' then return p_quantity;
    when 'kg' then return p_quantity * 1000;
    when 'ml' then return p_quantity;
    when 'l' then return p_quantity * 1000;
    when 'lt' then return p_quantity * 1000;
    when 'litre' then return p_quantity * 1000;
    else null;
  end case;

  if p_food_key is not null then
    v_kind := 'food'; v_key := p_food_key;
  elsif p_crop is not null then
    v_kind := 'crop'; v_key := p_crop;
  else
    select a.target_kind, a.target_key into v_alias
    from public.ingredient_nutrition_alias a
    where a.normalized_alias = public.fn_nutrition_normalize_text(p_free_text_name);
    v_kind := v_alias.target_kind; v_key := v_alias.target_key;
  end if;

  select m.grams_per_unit into v_hint
  from public.ingredient_measure_reference m
  where m.target_kind = v_kind and m.target_key = v_key and m.normalized_unit = v_unit;
  if v_hint is not null then return p_quantity * v_hint; end if;

  if v_kind = 'crop' then
    select case when jsonb_typeof(c.conversion_hints -> v_unit) = 'number'
                then (c.conversion_hints ->> v_unit)::numeric end
      into v_hint from public.crop_culinary_meta c where c.crop = v_key;
    if v_hint is not null then return p_quantity * v_hint; end if;
  end if;
  return null;
end $function$;

CREATE OR REPLACE FUNCTION public.generate_order_ref()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.order_ref := 'HT-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('order_seq')::text, 4, '0');
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_active_listing_crops(p_limit integer DEFAULT 30)
 RETURNS TABLE(crop text, display_name text, active_listing_count integer, total_quantity numeric, farmer_count integer)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.get_buyer_rating_summary(_buyer_id uuid)
 RETURNS TABLE(avg_rating numeric, review_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT AVG(rating)::numeric, COUNT(*)::int
  FROM public.reviews
  WHERE reviewee_id = _buyer_id
    AND reviewer_role = 'farmer';
$function$;

CREATE OR REPLACE FUNCTION public.get_crop_context(p_crop text, p_month integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_month integer := greatest(1, least(12, coalesce(p_month, extract(month from now())::int)));
  v_row record;
  v_in_season boolean;
begin
  select cc.crop, cc.display_name, cc.default_unit, cc.category_group,
         cc.harvest_window_start_month, cc.harvest_window_end_month,
         coalesce(cm.is_edible, false) as is_edible,
         coalesce(cm.culinary_aliases, array[]::text[]) as culinary_aliases
    into v_row
    from public.crop_config cc
    left join public.crop_culinary_meta cm on cm.crop = cc.crop
    where cc.crop = p_crop;

  if not found then
    return jsonb_build_object('crop', p_crop, 'found', false);
  end if;

  v_in_season := case
    when v_row.harvest_window_start_month is null or v_row.harvest_window_end_month is null then false
    when v_row.harvest_window_start_month <= v_row.harvest_window_end_month
      then v_month between v_row.harvest_window_start_month and v_row.harvest_window_end_month
    else v_month >= v_row.harvest_window_start_month or v_month <= v_row.harvest_window_end_month
  end;

  return jsonb_build_object(
    'crop', v_row.crop,
    'found', true,
    'displayName', v_row.display_name,
    'defaultUnit', v_row.default_unit,
    'categoryGroup', v_row.category_group,
    'harvestWindowStartMonth', v_row.harvest_window_start_month,
    'harvestWindowEndMonth', v_row.harvest_window_end_month,
    'inSeason', v_in_season,
    'isEdible', v_row.is_edible,
    'culinaryAliases', to_jsonb(v_row.culinary_aliases)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_crop_demand_signal(p_days integer DEFAULT 30, p_limit integer DEFAULT 20)
 RETURNS TABLE(crop text, display_name text, order_count integer, total_quantity numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.get_farmer_rating_summary(_farmer_id uuid)
 RETURNS TABLE(avg_rating numeric, review_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT AVG(rating)::numeric, COUNT(*)::int
  FROM public.reviews
  WHERE reviewee_id = _farmer_id
    AND reviewer_role = 'buyer';
$function$;

CREATE OR REPLACE FUNCTION public.get_my_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select role::text from profiles where id = auth.uid()
$function$;

CREATE OR REPLACE FUNCTION public.get_my_role_for_offer(offer_row offers)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN auth.uid() = offer_row.farmer_id THEN 'farmer'
    WHEN auth.uid() = offer_row.buyer_id THEN 'buyer'
    ELSE NULL
  END;
$function$;

CREATE OR REPLACE FUNCTION public.get_price_board(p_days integer DEFAULT 30, p_crops text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_days int := GREATEST(1, LEAST(COALESCE(p_days, 30), 365));
  v_cur_from date := current_date - v_days;
  v_prev_from date := current_date - (2 * v_days);
  v_result jsonb;
BEGIN
  WITH cfg AS (
    SELECT c.crop, c.display_name, c.default_unit, c.price_window_type,
           c.has_official_price_source, c.official_source_name
    FROM public.crop_config c
    WHERE p_crops IS NULL
       OR lower(c.crop) = ANY (SELECT lower(x) FROM unnest(p_crops) x)
  ),
  ph AS (
    SELECT p.crop, p.source, p.market_source_code, p.price_per_unit,
           p.farmer_id, p.recorded_date,
           (p.recorded_date >= v_cur_from) AS is_cur,
           (p.recorded_date >= v_prev_from AND p.recorded_date < v_cur_from) AS is_prev
    FROM public.price_history p
    WHERE p.recorded_date >= v_prev_from
      AND p.crop IN (SELECT crop FROM cfg)
  ),
  hasat AS (
    SELECT c.crop,
           AVG(x.price_per_unit) FILTER (WHERE x.is_cur) AS cur_price,
           AVG(x.price_per_unit) FILTER (WHERE x.is_prev) AS prev_price,
           COUNT(DISTINCT x.farmer_id) FILTER (WHERE x.is_cur) AS cur_farmers,
           COUNT(DISTINCT x.farmer_id) FILTER (WHERE x.is_prev) AS prev_farmers,
           COUNT(*) FILTER (WHERE x.is_cur) AS cur_points,
           MAX(x.recorded_date) FILTER (WHERE x.is_cur) AS last_date
    FROM cfg c
    LEFT JOIN ph x ON x.crop = c.crop AND x.source = 'order'
    GROUP BY c.crop
  ),
  official AS (
    SELECT c.crop,
           AVG(x.price_per_unit) FILTER (WHERE x.is_cur) AS cur_price,
           AVG(x.price_per_unit) FILTER (WHERE x.is_prev) AS prev_price,
           COUNT(*) FILTER (WHERE x.is_cur) AS cur_points,
           MAX(x.recorded_date) FILTER (WHERE x.is_cur) AS last_date
    FROM cfg c
    LEFT JOIN ph x ON x.crop = c.crop AND x.source = 'hks'
    GROUP BY c.crop
  ),
  markets AS (
    SELECT x.crop, ms.code, ms.display_name, ms.region,
           AVG(x.price_per_unit) FILTER (WHERE x.is_cur) AS cur_price,
           AVG(x.price_per_unit) FILTER (WHERE x.is_prev) AS prev_price,
           COUNT(*) FILTER (WHERE x.is_cur) AS cur_points,
           MAX(x.recorded_date) FILTER (WHERE x.is_cur) AS last_date
    FROM ph x
    JOIN public.market_sources ms ON ms.code = x.market_source_code
    WHERE x.market_source_code IS NOT NULL
    GROUP BY x.crop, ms.code, ms.display_name, ms.region
  ),
  market_json AS (
    SELECT m.crop,
           jsonb_agg(
             jsonb_build_object(
               'key', m.code,
               'kind', 'market',
               'label', m.display_name,
               'region', m.region,
               'price', m.cur_price,
               'prev_price', m.prev_price,
               'change_pct', CASE WHEN m.cur_price IS NOT NULL AND m.prev_price IS NOT NULL AND m.prev_price <> 0
                                  THEN round(((m.cur_price - m.prev_price) / m.prev_price) * 100, 1) END,
               'points', m.cur_points,
               'last_date', m.last_date,
               'insufficient', false
             ) ORDER BY m.display_name
           ) AS sources
    FROM markets m
    WHERE m.cur_price IS NOT NULL
    GROUP BY m.crop
  )
  SELECT COALESCE(jsonb_agg(row_json ORDER BY display_name), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT c.display_name,
           jsonb_build_object(
             'crop', c.crop,
             'display_name', c.display_name,
             'unit', c.default_unit,
             'window_type', c.price_window_type,
             'hasat', jsonb_build_object(
                'key', 'hasat',
                'kind', 'hasat',
                'label', 'Hasat',
                'insufficient', (COALESCE(h.cur_farmers, 0) < 5),
                'price', CASE WHEN COALESCE(h.cur_farmers, 0) >= 5 THEN h.cur_price END,
                'prev_price', CASE WHEN COALESCE(h.cur_farmers, 0) >= 5 AND COALESCE(h.prev_farmers, 0) >= 5 THEN h.prev_price END,
                'change_pct', CASE WHEN COALESCE(h.cur_farmers, 0) >= 5 AND COALESCE(h.prev_farmers, 0) >= 5
                                     AND h.cur_price IS NOT NULL AND h.prev_price IS NOT NULL AND h.prev_price <> 0
                                   THEN round(((h.cur_price - h.prev_price) / h.prev_price) * 100, 1) END,
                'farmer_count', COALESCE(h.cur_farmers, 0),
                'points', COALESCE(h.cur_points, 0),
                'last_date', h.last_date
             ),
             'official', CASE WHEN c.has_official_price_source AND o.cur_price IS NOT NULL THEN
                jsonb_build_object(
                  'key', 'official',
                  'kind', 'official',
                  'label', COALESCE(c.official_source_name, 'Resmi kaynak'),
                  'price', o.cur_price,
                  'prev_price', o.prev_price,
                  'change_pct', CASE WHEN o.prev_price IS NOT NULL AND o.prev_price <> 0
                                     THEN round(((o.cur_price - o.prev_price) / o.prev_price) * 100, 1) END,
                  'points', o.cur_points,
                  'last_date', o.last_date,
                  'insufficient', false
                ) END,
             'markets', COALESCE(mj.sources, '[]'::jsonb),
             'has_any_data', (
               (COALESCE(h.cur_farmers, 0) >= 5 AND h.cur_price IS NOT NULL)
               OR (c.has_official_price_source AND o.cur_price IS NOT NULL)
               OR mj.sources IS NOT NULL
             )
           ) AS row_json
    FROM cfg c
    LEFT JOIN hasat h ON h.crop = c.crop
    LEFT JOIN official o ON o.crop = c.crop
    LEFT JOIN market_json mj ON mj.crop = c.crop
  ) rows;

  RETURN COALESCE(v_result, '[]'::jsonb);
END $function$;

CREATE OR REPLACE FUNCTION public.get_price_history_series(p_crop text, p_weeks integer DEFAULT 12)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_canonical text;
  v_cfg record;
  v_since date;
  v_hasat jsonb;
  v_official jsonb := NULL;
  v_market_series jsonb;
  v_unit text;
BEGIN
  IF p_weeks IS NULL OR p_weeks < 1 THEN p_weeks := 12; END IF;
  IF p_weeks > 104 THEN p_weeks := 104; END IF;

  SELECT crop INTO v_canonical FROM public.crop_config
    WHERE lower(crop) = lower(p_crop) LIMIT 1;

  IF v_canonical IS NULL THEN
    RETURN jsonb_build_object('hasat_series', '[]'::jsonb, 'official_series', NULL, 'market_series', '[]'::jsonb, 'unit', NULL);
  END IF;

  SELECT has_official_price_source, official_source_name, default_unit
    INTO v_cfg FROM public.crop_config WHERE crop = v_canonical;
  v_unit := v_cfg.default_unit;

  v_since := (date_trunc('week', current_date) - make_interval(weeks => p_weeks - 1))::date;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.week_start), '[]'::jsonb)
    INTO v_hasat
    FROM (
      SELECT
        to_char(date_trunc('week', recorded_date), 'YYYY-MM-DD') AS week_start,
        AVG(price_per_unit)::numeric AS avg_price
      FROM public.price_history
      WHERE crop = v_canonical
        AND source = 'order'
        AND recorded_date >= v_since
      GROUP BY date_trunc('week', recorded_date)
      HAVING COUNT(DISTINCT farmer_id) >= 5
    ) t;

  IF COALESCE(v_cfg.has_official_price_source, false) THEN
    SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.week_start), '[]'::jsonb)
      INTO v_official
      FROM (
        SELECT
          to_char(date_trunc('week', recorded_date), 'YYYY-MM-DD') AS week_start,
          AVG(price_per_unit)::numeric AS avg_price
        FROM public.price_history
        WHERE crop = v_canonical
          AND source = 'hks'
          AND recorded_date >= v_since
        GROUP BY date_trunc('week', recorded_date)
      ) t;
  END IF;

  SELECT COALESCE(jsonb_agg(src), '[]'::jsonb) INTO v_market_series
  FROM (
    SELECT
      ms.code AS source_code,
      ms.display_name,
      ms.region,
      COALESCE(
        (SELECT jsonb_agg(row_to_json(t) ORDER BY t.week_start)
         FROM (
           SELECT
             to_char(date_trunc('week', ph.recorded_date), 'YYYY-MM-DD') AS week_start,
             AVG(ph.price_per_unit)::numeric AS avg_price
           FROM public.price_history ph
           WHERE ph.crop = v_canonical
             AND ph.market_source_code = ms.code
             AND ph.recorded_date >= v_since
           GROUP BY date_trunc('week', ph.recorded_date)
         ) t),
        '[]'::jsonb
      ) AS series
    FROM public.crop_market_sources cms
    JOIN public.market_sources ms ON ms.code = cms.source_code
    WHERE cms.crop = v_canonical
  ) src;

  RETURN jsonb_build_object(
    'hasat_series', v_hasat,
    'official_series', v_official,
    'market_series', v_market_series,
    'unit', v_unit
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_price_history_summary(p_crop text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_canonical text;
  v_cfg record;
  v_days int; v_since date;
  v_hasat jsonb; v_official jsonb := NULL; v_market_sources jsonb;
  v_avg numeric; v_std numeric; v_cnt int; v_last timestamptz;
  v_unit text;
BEGIN
  SELECT crop INTO v_canonical FROM public.crop_config
    WHERE lower(crop) = lower(p_crop) LIMIT 1;
  IF v_canonical IS NULL THEN
    RETURN jsonb_build_object('hasat_data', jsonb_build_object('insufficient_data', true),
                              'official_data', NULL, 'last_updated', NULL, 'market_sources', '[]'::jsonb, 'unit', NULL);
  END IF;

  SELECT price_window_type, has_official_price_source, official_source_name, default_unit
    INTO v_cfg FROM public.crop_config WHERE crop = v_canonical;
  v_unit := v_cfg.default_unit;

  v_days := CASE WHEN v_cfg.price_window_type = 'rolling_365d' THEN 365 ELSE 30 END;
  v_since := current_date - v_days;

  SELECT AVG(price_per_unit), STDDEV_SAMP(price_per_unit),
         COUNT(DISTINCT farmer_id), MAX(created_at)
    INTO v_avg, v_std, v_cnt, v_last
    FROM public.price_history
    WHERE crop = v_canonical AND source = 'order' AND recorded_date >= v_since;

  IF COALESCE(v_cnt,0) < 5 THEN
    v_hasat := jsonb_build_object('insufficient_data', true,
                                  'distinct_farmer_count', COALESCE(v_cnt,0));
  ELSE
    v_hasat := jsonb_build_object('insufficient_data', false,
      'avg_price', v_avg, 'stddev_price', COALESCE(v_std,0),
      'distinct_farmer_count', v_cnt);
  END IF;

  IF v_cfg.has_official_price_source THEN
    SELECT AVG(price_per_unit) INTO v_avg
      FROM public.price_history
      WHERE crop = v_canonical AND source = 'hks' AND recorded_date >= v_since;
    IF v_avg IS NOT NULL THEN
      v_official := jsonb_build_object('avg_price', v_avg,
                                       'official_source_name', v_cfg.official_source_name);
    END IF;
  END IF;

  SELECT COALESCE(jsonb_agg(seg), '[]'::jsonb) INTO v_market_sources
  FROM (
    SELECT ms.code AS source_code, ms.display_name, ms.region,
           AVG(ph.price_per_unit) AS avg_price,
           MAX(ph.created_at) AS last_updated
    FROM public.crop_market_sources cms
    JOIN public.market_sources ms ON ms.code = cms.source_code
    LEFT JOIN public.price_history ph
      ON ph.crop = v_canonical AND ph.market_source_code = ms.code AND ph.recorded_date >= v_since
    WHERE cms.crop = v_canonical
    GROUP BY ms.code, ms.display_name, ms.region
  ) seg;

  RETURN jsonb_build_object('hasat_data', v_hasat,
                            'official_data', v_official,
                            'last_updated', v_last,
                            'market_sources', v_market_sources,
                            'unit', v_unit);
END $function$;

CREATE OR REPLACE FUNCTION public.get_recent_recipe_mix(p_days integer DEFAULT 30, p_limit integer DEFAULT 20)
 RETURNS TABLE(crop text, display_name text, recipe_count integer, last_created_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select
    ri.crop,
    cc.display_name,
    count(distinct r.id)::integer as recipe_count,
    max(r.created_at) as last_created_at
  from public.recipe_ingredients ri
  join public.recipes r on r.id = ri.recipe_id
  join public.crop_config cc on cc.crop = ri.crop
  where ri.is_key_ingredient
    and ri.crop is not null
    and r.created_at >= now() - make_interval(days => greatest(1, least(365, coalesce(p_days, 30))))
  group by ri.crop, cc.display_name
  order by recipe_count desc, last_created_at desc
  limit greatest(1, least(100, coalesce(p_limit, 20)));
$function$;

CREATE OR REPLACE FUNCTION public.get_recipe_engagement_signal(p_days integer DEFAULT 30, p_limit integer DEFAULT 20)
 RETURNS TABLE(crop text, display_name text, view_count integer, save_count integer, recipe_count integer)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.get_recipe_plan_schedule()
 RETURNS TABLE(schedule text, active boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'cron'
AS $function$
  select j.schedule, j.active
  from cron.job j
  where j.jobname = 'recipe-stage-plan-weekly';
$function$;

CREATE OR REPLACE FUNCTION public.get_seasonal_crop_candidates(p_month integer DEFAULT NULL::integer, p_category_group text DEFAULT NULL::text, p_only_in_season boolean DEFAULT false, p_edible_only boolean DEFAULT false, p_limit integer DEFAULT 20)
 RETURNS TABLE(crop text, display_name text, category_group text, default_unit text, harvest_window_start_month integer, harvest_window_end_month integer, in_season boolean, is_edible boolean, default_photo_url text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with month as (
    select greatest(1, least(12, coalesce(p_month, extract(month from now())::int))) as m
  )
  select
    cc.crop,
    cc.display_name,
    cc.category_group,
    cc.default_unit,
    cc.harvest_window_start_month,
    cc.harvest_window_end_month,
    coalesce(
      case
        when cc.harvest_window_start_month is null or cc.harvest_window_end_month is null then false
        when cc.harvest_window_start_month <= cc.harvest_window_end_month
          then month.m between cc.harvest_window_start_month and cc.harvest_window_end_month
        else month.m >= cc.harvest_window_start_month or month.m <= cc.harvest_window_end_month
      end,
      false
    ) as in_season,
    coalesce(m.is_edible, true) as is_edible,
    cc.default_photo_url
  from public.crop_config cc
  cross join month
  left join public.crop_culinary_meta m on m.crop = cc.crop
  where (p_category_group is null or cc.category_group = p_category_group)
    and (not coalesce(p_edible_only, false) or coalesce(m.is_edible, true))
    and (
      not coalesce(p_only_in_season, false)
      or coalesce(
        case
          when cc.harvest_window_start_month is null or cc.harvest_window_end_month is null then false
          when cc.harvest_window_start_month <= cc.harvest_window_end_month
            then month.m between cc.harvest_window_start_month and cc.harvest_window_end_month
          else month.m >= cc.harvest_window_start_month or month.m <= cc.harvest_window_end_month
        end,
        false
      )
    )
  order by in_season desc, cc.display_name asc
  limit greatest(1, least(100, coalesce(p_limit, 20)));
$function$;

CREATE OR REPLACE FUNCTION public.get_subscription_fulfillment(_subscription_id uuid)
 RETURNS TABLE(delivered_qty numeric, order_count integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE ok boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM public.harvest_subscriptions
    WHERE id = _subscription_id
      AND (buyer_id = auth.uid() OR farmer_id = auth.uid())
  ) INTO ok;
  IF NOT ok THEN
    RETURN QUERY SELECT 0::numeric, 0;
    RETURN;
  END IF;
  RETURN QUERY
    SELECT COALESCE(SUM(o.quantity), 0)::numeric, COUNT(*)::int
    FROM public.offers o
    WHERE o.subscription_id = _subscription_id
      AND o.payment_status = 'paid';
END $function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_phone text := NULLIF(REGEXP_REPLACE(REPLACE(COALESCE(NEW.phone, ''), '+', ''), '\s+', '', 'g'), '');
  v_role  user_role := CASE
    WHEN NEW.raw_user_meta_data->>'role' IN ('farmer','buyer')
    THEN (NEW.raw_user_meta_data->>'role')::user_role
    ELSE 'farmer'::user_role
  END;
  v_code text;
  v_len  int := 6;
  v_profile_count int;
  v_tier public.user_tier := 'free';
  v_premium_until timestamptz := NULL;
BEGIN
  LOOP
    v_code := UPPER(LEFT(REPLACE(NEW.id::text, '-', ''), v_len));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE referral_code = v_code);
    v_len := v_len + 2;
    IF v_len > 32 THEN
      v_code := UPPER(REPLACE(gen_random_uuid()::text, '-', ''));
      EXIT;
    END IF;
  END LOOP;

  -- Early-adopter bonus: first 100 profiles get 6 months of premium.
  SELECT count(*) INTO v_profile_count FROM public.profiles;
  IF v_profile_count < 100 THEN
    v_tier := 'premium';
    v_premium_until := now() + interval '6 months';
  END IF;

  INSERT INTO public.profiles (id, role, phone, referral_code, tier, premium_until)
  VALUES (NEW.id, v_role, v_phone, v_code, v_tier, v_premium_until)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.notif_prefs (user_id, new_offer_sms)
  VALUES (NEW.id, true)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.increment_ai_usage(_user_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _month text := to_char(now(), 'YYYY-MM');
  _new_count integer;
BEGIN
  IF current_setting('request.jwt.claims', true)::jsonb->>'role' = 'authenticated' THEN
    IF _user_id <> auth.uid() THEN
      RAISE EXCEPTION 'Cross-user access not allowed';
    END IF;
  END IF;

  INSERT INTO public.ai_usage_tracking (user_id, month, message_count, updated_at)
  VALUES (_user_id, _month, 1, now())
  ON CONFLICT (user_id, month)
  DO UPDATE SET
    message_count = public.ai_usage_tracking.message_count + 1,
    updated_at = now()
  RETURNING message_count INTO _new_count;

  RETURN _new_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.is_valid_recipe_allergen_labels(labels text[])
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select
    case
      when labels is null then true
      when cardinality(labels) = 0 then true
      else
        not exists (
          select 1 from unnest(labels) as v
          where v is null
             or v <> all (array[
               'gluten',
               'laktoz',
               'yumurta',
               'findik-yerfistigi',
               'agac-kuruyemisi',
               'soya',
               'susam',
               'deniz-urunu',
               'hardal',
               'kereviz',
               'sulfit',
               'lupin'
             ])
        )
        and cardinality(labels) = (select count(distinct v) from unnest(labels) as v)
    end;
$function$;

CREATE OR REPLACE FUNCTION public.is_valid_recipe_micronutrients_v1(p jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare
  allowed_top text[] := array['schema_version','basis','values'];
  allowed_value_keys text[] := array[
    'sodium_mg','potassium_mg','calcium_mg','iron_mg','vitamin_c_mg','vitamin_a_mcg_rae'
  ];
  k text;
  v jsonb;
begin
  if p is null then
    return true;
  end if;

  if jsonb_typeof(p) is distinct from 'object' then
    return false;
  end if;

  for k in select jsonb_object_keys(p) loop
    if not (k = any (allowed_top)) then
      return false;
    end if;
  end loop;

  if jsonb_typeof(p -> 'schema_version') is distinct from 'number' or (p ->> 'schema_version') <> '1' then
    return false;
  end if;

  if jsonb_typeof(p -> 'basis') is distinct from 'string' or (p ->> 'basis') <> 'per_serving' then
    return false;
  end if;

  if not (p ? 'values') or jsonb_typeof(p -> 'values') is distinct from 'object' then
    return false;
  end if;

  for k, v in select * from jsonb_each(p -> 'values') loop
    if not (k = any (allowed_value_keys)) then
      return false;
    end if;
    if jsonb_typeof(v) is distinct from 'number' then
      return false;
    end if;
    if (v #>> '{}')::numeric < 0 then
      return false;
    end if;
  end loop;

  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.is_valid_recipe_required_equipment(equipment text[])
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  select
    case
      when equipment is null then true
      when cardinality(equipment) = 0 then true
      else
        not exists (
          select 1 from unnest(equipment) as v
          where v is null
             or v <> all (array[
               'firin', 'ocak', 'mikrodalga', 'airfryer', 'blender', 'mutfak-robotu',
               'duduklu-tencere', 'izgara', 'ozel-ekipman-gerekmiyor'
             ])
        )
        and cardinality(equipment) = (select count(distinct v) from unnest(equipment) as v)
    end;
$function$;

CREATE OR REPLACE FUNCTION public.normalize_recipe_units(p_ingredients jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_result jsonb := '[]'::jsonb;
  v_ing jsonb;
  v_canonical text;
begin
  if jsonb_typeof(p_ingredients) is distinct from 'array' then
    return p_ingredients;
  end if;

  for v_ing in select * from jsonb_array_elements(p_ingredients)
  loop
    if v_ing ? 'unit' and jsonb_typeof(v_ing->'unit') = 'string' then
      v_canonical := public.fn_recipe_canonical_unit(v_ing->>'unit');
      v_ing := jsonb_set(v_ing, '{unit}', coalesce(to_jsonb(v_canonical), 'null'::jsonb), true);
    end if;
    v_result := v_result || jsonb_build_array(v_ing);
  end loop;

  return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.notify_crop_request_fulfilled()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  _display_name text;
  r record;
  _push_body text;
begin
  if new.status is distinct from 'active' then return new; end if;
  if TG_OP = 'UPDATE' and old.status = 'active' then return new; end if;

  select display_name into _display_name from public.crop_config where crop = new.crop;

  for r in
    select cr.id, cr.requested_by
    from public.crop_requests cr
    where cr.status = 'pending'
      and cr.requested_by is not null
      and (
        lower(trim(cr.crop_name_free_text)) = lower(new.crop)
        or lower(trim(cr.crop_name_free_text)) = lower(coalesce(_display_name, ''))
      )
      and (
        cr.region is null or trim(cr.region) = ''
        or exists (
          select 1 from public.profiles p where p.id = new.farmer_id and p.city = cr.region
        )
      )
  loop
    _push_body := format('%s artık Hasat''ta mevcut — talebinizdeki malzemeyi şimdi alabilirsiniz.', coalesce(_display_name, new.crop));

    insert into public.notifications (user_id, type, title, body, related_id)
    values (
      r.requested_by,
      'crop_request_fulfilled',
      'Talep ettiğiniz ürün geldi',
      _push_body,
      new.id
    );

    perform public.dispatch_sms(
      r.requested_by,
      'crop_request_match',
      format('Hasat: Talep ettiğiniz %s artık mevcut!', coalesce(_display_name, new.crop))
    );
    perform public.dispatch_push(
      r.requested_by,
      'crop_request_match',
      'Talep ettiğiniz ürün geldi',
      _push_body
    );

    update public.crop_requests set status = 'added' where id = r.id;
  end loop;

  return new;
exception when others then
  raise log 'notify_crop_request_fulfilled failed: %', sqlerrm;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.notify_offer_accepted()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  farmer_name text;
  unit_name text;
  qty numeric;
  price numeric;
  total numeric;
  counter_body text;
  accepted_recipient uuid;
  accepted_body text;
  rejected_body text;
begin
  select name into farmer_name from profiles where id = NEW.farmer_id;
  select unit into unit_name from listings where id = NEW.listing_id;
  qty := coalesce(NEW.current_quantity, NEW.quantity);
  price := coalesce(NEW.current_price, NEW.price_per_unit);
  total := qty * price;

  if NEW.status = 'accepted' and (OLD.status is distinct from 'accepted') then
    if coalesce(OLD.ball_side, 'farmer') = 'farmer' then
      -- Çiftçi kabul etti (buyer'ın pending teklifi) -> buyer'a bildir.
      accepted_recipient := NEW.buyer_id;
      accepted_body := '✅ ' || coalesce(farmer_name, 'Çiftçi') || ' teklifinizi kabul etti! Ödeme yaparak siparişi tamamlayın.';
    else
      -- Buyer kabul etti (çiftçinin karşı teklifi) -> çiftçiye bildir.
      accepted_recipient := NEW.farmer_id;
      accepted_body := '✅ Alıcı karşı teklifinizi kabul etti! Sipariş için ödeme bekleniyor.';
    end if;

    insert into notifications(user_id, type, title, body, related_id)
    values (accepted_recipient, 'offer_accepted', 'Teklifiniz Kabul Edildi', accepted_body, NEW.id);
    perform public.dispatch_sms(
      accepted_recipient,
      'offer_accepted',
      'Hasat: ' || accepted_body
    );
    perform public.dispatch_push(
      accepted_recipient,
      'offer_accepted',
      'Teklifiniz Kabul Edildi',
      accepted_body
    );
  end if;
  if NEW.status = 'counter' and (OLD.status is distinct from 'counter' or OLD.current_price is distinct from NEW.current_price or OLD.current_quantity is distinct from NEW.current_quantity) then
    counter_body := '↩️ ' || coalesce(farmer_name, 'Karşı taraf') || ' teklifinize karşı teklif yaptı: ' || qty || coalesce(unit_name, '') || ' @ ₺' || to_char(price, 'FM999G999G999D00') || '/' || coalesce(unit_name, '');
    insert into notifications(user_id, type, title, body, related_id)
    values (
      case when NEW.ball_side = 'buyer' then NEW.buyer_id else NEW.farmer_id end,
      'offer_countered',
      'Karşı Teklif',
      counter_body,
      NEW.id
    );
    -- P23-M8-b: bu branch daha önce hiçbir kanaldan (SMS de) bildirim
    -- göndermiyordu — push burada YENİ ekleniyor (SMS'e dokunulmadı,
    -- kapsam kararı: yalnızca raporlanan push eksiği kapatıldı).
    perform public.dispatch_push(
      case when NEW.ball_side = 'buyer' then NEW.buyer_id else NEW.farmer_id end,
      'offer_countered',
      'Karşı Teklif',
      counter_body
    );
  end if;
  if NEW.status = 'rejected' and (OLD.status is distinct from 'rejected') then
    rejected_body := '❌ ' || coalesce(farmer_name, 'Çiftçi') || ' teklifinizi reddetti.';
    insert into notifications(user_id, type, title, body, related_id)
    values (
      NEW.buyer_id,
      'offer_rejected',
      'Teklif Reddedildi',
      rejected_body,
      NEW.id
    );
    perform public.dispatch_sms(NEW.buyer_id, 'offer_rejected', 'Hasat: ' || rejected_body);
    perform public.dispatch_push(NEW.buyer_id, 'offer_rejected', 'Teklif Reddedildi', rejected_body);
  end if;
  if NEW.payment_status = 'paid' and (OLD.payment_status is distinct from 'paid') then
    insert into notifications(user_id, type, title, body, related_id)
    values (
      NEW.farmer_id,
      'payment_received',
      'Ödeme Alındı',
      '💰 Alıcı ödemeyi tamamladı. Sipariş aktif.',
      NEW.id
    );
    perform public.dispatch_sms(
      NEW.farmer_id,
      'payment_confirmed',
      'Hasat: Alıcı ödemeyi tamamladı (' || qty || coalesce(unit_name, '') ||
        ' - TL' || to_char(total, 'FM999G999G999D00') || '). Sipariş aktif.'
    );
    perform public.dispatch_push(
      NEW.farmer_id,
      'payment_confirmed',
      'Ödeme Alındı',
      '💰 Alıcı ödemeyi tamamladı. Sipariş aktif.'
    );
  end if;
  return NEW;
end;
$function$;

CREATE OR REPLACE FUNCTION public.notify_offer_received()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  farmer uuid;
  buyer_name text;
  crop_name text;
  qty numeric;
  unit_name text;
  total numeric;
  msg text;
begin
  select farmer_id, crop, unit
    into farmer, crop_name, unit_name
    from listings where id = NEW.listing_id;
  select name into buyer_name from profiles where id = NEW.buyer_id;
  qty := NEW.quantity;
  total := NEW.quantity * NEW.price_per_unit;
  msg := '🌾 ' || coalesce(buyer_name, 'Alıcı') || ' ' || coalesce(crop_name, 'ürün') ||
    ' için ' || qty || coalesce(unit_name, '') || ' - ₺' || to_char(total, 'FM999G999G999D00') || ' teklif gönderdi';

  insert into notifications(user_id, type, title, body, related_id)
  values (farmer, 'offer_received', 'Yeni Teklif', msg, NEW.id);

  perform public.dispatch_sms(farmer, 'new_offer', 'Hasat: ' || msg);
  perform public.dispatch_push(farmer, 'new_offer', 'Yeni Teklif', msg);
  return NEW;
end;
$function$;

CREATE OR REPLACE FUNCTION public.notify_order_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  label text;
  body_text text;
  sms_event text;
  sms_message text;
begin
  if NEW.status <> OLD.status then
    case NEW.status
      when 'preparing' then
        label := 'Siparişiniz Hazırlanıyor';
        body_text := 'Siparişiniz hazırlanıyor, çok yakında kargoya verilecek.';
        sms_event := 'order_preparing';
        sms_message := 'Hasat: ' || body_text;
      when 'shipped' then
        label := 'Siparişiniz Kargoya Verildi';
        body_text := case
          when NEW.carrier is not null and NEW.tracking_number is not null
            then NEW.carrier || ' ile kargoya verildi. Takip no: ' || NEW.tracking_number
          when NEW.tracking_number is not null
            then 'Kargoya verildi. Takip no: ' || NEW.tracking_number
          else 'Siparişiniz kargoya verildi.'
        end;
        sms_event := 'order_shipped';
        sms_message := 'Hasat: ' || body_text;
      when 'delivered' then
        label := 'Siparişiniz Teslim Edildi';
        body_text := 'Siparişiniz teslim edildi. Bir sorun varsa itiraz penceresi içinde bildirebilirsiniz.';
        sms_event := 'order_delivered';
        sms_message := 'Hasat: Siparişiniz teslim edildi.';
      when 'cancelled' then
        label := 'Sipariş İptal Edildi';
        body_text := coalesce('İptal nedeni: ' || NEW.cancel_reason, 'Sipariş iptal edildi.');
        sms_event := 'order_cancelled';
        sms_message := 'Hasat: Siparişiniz iptal edildi.';
      when 'disputed' then
        label := 'Siparişte İhtilaf Açıldı';
        body_text := 'Bu sipariş için bir ihtilaf açıldı.';
        sms_event := 'dispute_opened';
        sms_message := 'Hasat: Siparişinizde bir ihtilaf açıldı.';
      when 'completed' then
        label := 'Sipariş Tamamlandı';
        body_text := 'Siparişiniz başarıyla tamamlandı. Bizi tercih ettiğiniz için teşekkürler.';
        sms_event := 'order_completed';
        sms_message := 'Hasat: ' || body_text;
      else
        label := 'Sipariş Durumu Güncellendi';
    end case;

    insert into notifications(user_id, type, title, body, related_id)
    values (NEW.buyer_id, 'order_status', label, body_text, NEW.id);

    -- İptal/ihtilaf her iki tarafı da ilgilendirir; çiftçiye de in-app bildirim gitsin.
    if NEW.status in ('cancelled', 'disputed') then
      insert into notifications(user_id, type, title, body, related_id)
      values (NEW.farmer_id, 'order_status', label, body_text, NEW.id);
    end if;

    if sms_event is not null then
      perform public.dispatch_sms(NEW.buyer_id, sms_event, sms_message);
      perform public.dispatch_push(NEW.buyer_id, sms_event, label, body_text);
      if NEW.status in ('cancelled', 'disputed') then
        perform public.dispatch_sms(NEW.farmer_id, sms_event, sms_message);
        perform public.dispatch_push(NEW.farmer_id, sms_event, label, body_text);
      end if;
    end if;
  end if;
  return NEW;
end;
$function$;

CREATE OR REPLACE FUNCTION public.notify_subscription_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  buyer_name text; farmer_name text;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'pending' THEN
    SELECT name INTO buyer_name FROM public.profiles WHERE id = NEW.buyer_id;
    INSERT INTO public.notifications(user_id, type, title, body, related_id)
    VALUES (NEW.farmer_id, 'subscription_request', 'Yeni Abonelik Talebi',
      '📅 ' || coalesce(buyer_name,'Alıcı') || ' sizden düzenli tedarik talep etti.',
      NEW.id);
    PERFORM public.dispatch_sms(NEW.farmer_id, 'subscription_new',
      'Hasat: ' || coalesce(buyer_name,'Alıcı') || ' sizden abonelik talep etti. Uygulamada onaylayın.');
    PERFORM public.dispatch_push(NEW.farmer_id, 'subscription_new', 'Yeni Abonelik Talebi',
      '📅 ' || coalesce(buyer_name,'Alıcı') || ' sizden düzenli tedarik talep etti.');
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT name INTO farmer_name FROM public.profiles WHERE id = NEW.farmer_id;
    IF NEW.status = 'active' AND OLD.status = 'pending' THEN
      INSERT INTO public.notifications(user_id, type, title, body, related_id)
      VALUES (NEW.buyer_id, 'subscription_accepted', 'Aboneliğiniz Aktif',
        '✅ ' || coalesce(farmer_name,'Üretici') || ' abonelik talebinizi kabul etti.',
        NEW.id);
      PERFORM public.dispatch_sms(NEW.buyer_id, 'subscription_accepted',
        'Hasat: ' || coalesce(farmer_name,'Üretici') || ' abonelik talebinizi kabul etti.');
      PERFORM public.dispatch_push(NEW.buyer_id, 'subscription_accepted', 'Aboneliğiniz Aktif',
        '✅ ' || coalesce(farmer_name,'Üretici') || ' abonelik talebinizi kabul etti.');
    ELSIF NEW.status = 'cancelled' AND OLD.status = 'pending' AND auth.uid() = NEW.farmer_id THEN
      INSERT INTO public.notifications(user_id, type, title, body, related_id)
      VALUES (NEW.buyer_id, 'subscription_rejected', 'Abonelik Reddedildi',
        '❌ ' || coalesce(farmer_name,'Üretici') || ' abonelik talebinizi reddetti.',
        NEW.id);
      PERFORM public.dispatch_sms(NEW.buyer_id, 'subscription_rejected',
        'Hasat: ' || coalesce(farmer_name,'Üretici') || ' abonelik talebinizi reddetti.');
      PERFORM public.dispatch_push(NEW.buyer_id, 'subscription_rejected', 'Abonelik Reddedildi',
        '❌ ' || coalesce(farmer_name,'Üretici') || ' abonelik talebinizi reddetti.');
    END IF;
  END IF;
  RETURN NEW;
END
$function$;

CREATE OR REPLACE FUNCTION public.process_referral_qualification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  candidates uuid[] := ARRAY[NEW.buyer_id, NEW.farmer_id];
  candidate uuid;
  ref_by uuid;
  did_insert boolean;
  q_count int;
BEGIN
  IF NEW.payment_status <> 'paid' OR OLD.payment_status IS NOT DISTINCT FROM 'paid' THEN
    RETURN NEW;
  END IF;

  FOREACH candidate IN ARRAY candidates LOOP
    IF candidate IS NULL THEN CONTINUE; END IF;
    SELECT referred_by INTO ref_by FROM public.profiles WHERE id = candidate;
    IF ref_by IS NULL OR ref_by = candidate THEN CONTINUE; END IF;

    did_insert := false;
    WITH ins AS (
      INSERT INTO public.referral_qualifications (referred_user_id, referrer_id)
      VALUES (candidate, ref_by)
      ON CONFLICT (referred_user_id) DO NOTHING
      RETURNING referrer_id
    )
    SELECT true INTO did_insert FROM ins;

    IF COALESCE(did_insert, false) THEN
      SELECT count(*) INTO q_count
        FROM public.referral_qualifications WHERE referrer_id = ref_by;
      IF q_count > 0 AND q_count % 3 = 0 THEN
        UPDATE public.profiles
           SET premium_until = GREATEST(COALESCE(premium_until, now()), now()) + interval '12 months',
               tier = 'premium'
         WHERE id = ref_by;
      END IF;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.profiles_sync_tier_premium()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.tier = 'free' AND NEW.premium = true THEN
      NEW.tier := 'premium';
    ELSIF NEW.tier = 'premium' AND NEW.premium = false THEN
      NEW.premium := true;
    ELSIF NEW.tier = 'free' AND NEW.premium = false THEN
      NULL;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.tier IS DISTINCT FROM OLD.tier AND NEW.premium IS NOT DISTINCT FROM OLD.premium THEN
      NEW.premium := (NEW.tier = 'premium');
    ELSIF NEW.premium IS DISTINCT FROM OLD.premium AND NEW.tier IS NOT DISTINCT FROM OLD.tier THEN
      NEW.tier := CASE WHEN NEW.premium THEN 'premium'::public.user_tier ELSE 'free'::public.user_tier END;
    ELSIF NEW.tier IS DISTINCT FROM OLD.tier AND NEW.premium IS DISTINCT FROM OLD.premium THEN
      -- both changed: trust tier as source of truth
      NEW.premium := (NEW.tier = 'premium');
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.protect_profile_deleted_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if current_user in ('anon', 'authenticated') then
    if TG_OP = 'INSERT' then
      if NEW.deleted_at is not null then
        raise exception 'Account deletion status is server-managed' using errcode = '42501';
      end if;
    elsif NEW.deleted_at is distinct from OLD.deleted_at then
      raise exception 'Account deletion status is server-managed' using errcode = '42501';
    end if;
  end if;
  return NEW;
end;
$function$;

CREATE OR REPLACE FUNCTION public.record_order_price_history()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_listing_crop text;
  v_canonical_crop text;
  v_unit text;
  v_region text;
  v_order_id uuid;
BEGIN
  IF NEW.payment_status = 'paid' AND OLD.payment_status IS DISTINCT FROM 'paid' THEN
    SELECT l.crop, l.unit::text INTO v_listing_crop, v_unit
      FROM public.listings l WHERE l.id = NEW.listing_id;

    IF v_listing_crop IS NULL THEN
      RETURN NEW;
    END IF;

    -- Case-insensitive lookup: listings.crop is display-cased, crop_config.crop is canonical (lowercase).
    SELECT cc.crop INTO v_canonical_crop
      FROM public.crop_config cc
      WHERE lower(cc.crop) = lower(v_listing_crop)
      LIMIT 1;

    IF v_canonical_crop IS NULL THEN
      RETURN NEW;
    END IF;

    SELECT p.city INTO v_region FROM public.profiles p WHERE p.id = NEW.farmer_id;
    SELECT o.id INTO v_order_id FROM public.orders o WHERE o.offer_id = NEW.id;

    INSERT INTO public.price_history (crop, source, price_per_unit, unit, region, recorded_date, order_id, farmer_id)
    VALUES (v_canonical_crop, 'order', COALESCE(NEW.current_price, NEW.price_per_unit),
            v_unit, v_region, current_date, v_order_id, NEW.farmer_id);
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.refresh_draft_nutrition_preview(p_job_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_clone_recipe(p_source_recipe_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.rpc_clone_shared_recipe(p_share_token uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
         rest_minutes, difficulty, cuisine, diet_tags, required_equipment, owner_id
  into v_source
  from public.recipes
  where share_token = p_share_token and visibility = 'private';

  if v_source.id is null then
    raise exception 'RECIPE_SHARE_LINK_NOT_FOUND: share link is invalid or no longer active';
  end if;

  if v_source.owner_id = auth.uid() then
    raise exception 'RECIPE_SHARE_CANNOT_CLONE_OWN: cannot clone your own recipe';
  end if;

  loop
    v_suffix := substr(md5(random()::text || clock_timestamp()::text), 1, 6);
    v_slug := coalesce(v_source.slug, 'tarif') || '-defter-' || v_suffix
      || case when v_attempt = 0 then '' else '-' || v_attempt::text end;
    exit when not exists (select 1 from public.recipes where slug = v_slug);
    v_attempt := v_attempt + 1;
    if v_attempt > 20 then
      raise exception 'could not derive a unique slug after % attempts', v_attempt;
    end if;
  end loop;

  insert into public.recipes (
    slug, title, description, cover_photo_url, servings, prep_minutes, cook_minutes, rest_minutes,
    difficulty, cuisine, diet_tags, required_equipment,
    status, visibility, source_type, owner_id, author_type, cloned_from_recipe_id
  ) values (
    v_slug, v_source.title, v_source.description, v_source.cover_photo_url, v_source.servings,
    v_source.prep_minutes, v_source.cook_minutes, v_source.rest_minutes,
    v_source.difficulty, v_source.cuisine, v_source.diet_tags, v_source.required_equipment,
    'draft', 'private', 'shared_clone', auth.uid(), 'kullanici', v_source.id
  )
  returning id into v_new_recipe_id;

  insert into public.recipe_ingredients (
    recipe_id, sort_order, crop, free_text_name, quantity, unit, note, is_key_ingredient, ingredient_class
  )
  select
    v_new_recipe_id, sort_order, crop, free_text_name, quantity, unit, note, is_key_ingredient, ingredient_class
  from public.recipe_ingredients
  where recipe_id = v_source.id;

  insert into public.recipe_steps (
    recipe_id, step_no, instruction, timer_seconds
  )
  select
    v_new_recipe_id, step_no, instruction, timer_seconds
  from public.recipe_steps
  where recipe_id = v_source.id;

  return v_new_recipe_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_consume_mobile_handoff_nonce(p_nonce text)
 RETURNS TABLE(user_id uuid, access_token text, refresh_token text, next_path text)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  return query
  update public.mobile_handoff_nonces t
  set consumed_at = now()
  where t.nonce = p_nonce
    and t.consumed_at is null
    and t.expires_at > now()
  returning t.user_id, t.access_token, t.refresh_token, t.next_path;
end;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_create_ai_customized_recipe(p_idempotency_key uuid, p_source_recipe_id uuid, p_title text, p_description text, p_servings integer, p_prep_minutes integer, p_cook_minutes integer, p_rest_minutes integer, p_difficulty text, p_ingredients jsonb, p_steps jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_existing record;
  v_source record;
  v_new_recipe_id uuid;
  v_base_slug text;
  v_slug text;
  v_suffix text;
  v_attempt integer := 0;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select * into v_existing
  from public.ai_customize_requests
  where idempotency_key = p_idempotency_key;

  if v_existing.idempotency_key is not null then
    if v_existing.user_id <> auth.uid() then
      raise exception 'idempotency key belongs to a different user';
    end if;
    if v_existing.status = 'completed' and v_existing.created_recipe_id is not null then
      return v_existing.created_recipe_id;
    end if;
  else
    insert into public.ai_customize_requests (idempotency_key, user_id, source_recipe_id, status)
    values (p_idempotency_key, auth.uid(), p_source_recipe_id, 'pending');
  end if;

  select id, visibility, author_type into v_source
  from public.recipes
  where id = p_source_recipe_id;

  if v_source.id is null then
    raise exception 'source recipe not found';
  end if;
  if v_source.visibility <> 'public' or v_source.author_type = 'kullanici' then
    raise exception 'source recipe is not eligible for AI customization (must be public and not author_type=kullanici)';
  end if;

  select slug into v_base_slug from public.recipes where id = p_source_recipe_id;
  v_base_slug := coalesce(v_base_slug, 'tarif');

  loop
    v_suffix := substr(md5(random()::text || clock_timestamp()::text), 1, 6);
    v_slug := v_base_slug || '-ai-' || v_suffix || case when v_attempt = 0 then '' else '-' || v_attempt::text end;
    exit when not exists (select 1 from public.recipes where slug = v_slug);
    v_attempt := v_attempt + 1;
    if v_attempt > 20 then
      raise exception 'could not derive a unique slug after % attempts', v_attempt;
    end if;
  end loop;

  insert into public.recipes (
    slug, title, description, servings, prep_minutes, cook_minutes, rest_minutes, difficulty,
    status, visibility, source_type, owner_id, author_type, cloned_from_recipe_id
  ) values (
    v_slug, p_title, p_description, p_servings, p_prep_minutes, p_cook_minutes, p_rest_minutes, p_difficulty,
    'draft', 'private', 'ai_customize', auth.uid(), 'kullanici', p_source_recipe_id
  )
  returning id into v_new_recipe_id;

  insert into public.recipe_ingredients (
    recipe_id, sort_order, crop, free_text_name, quantity, unit, note, is_key_ingredient
  )
  select
    v_new_recipe_id,
    coalesce((elem->>'sortOrder')::integer, ord - 1),
    nullif(elem->>'crop', ''),
    nullif(elem->>'freeTextName', ''),
    (elem->>'quantity')::numeric,
    nullif(elem->>'unit', ''),
    nullif(elem->>'note', ''),
    coalesce((elem->>'isKeyIngredient')::boolean, false)
  from jsonb_array_elements(p_ingredients) with ordinality as t(elem, ord);

  insert into public.recipe_steps (
    recipe_id, step_no, instruction, timer_seconds
  )
  select
    v_new_recipe_id,
    coalesce((elem->>'stepNo')::integer, ord),
    elem->>'instruction',
    (elem->>'timerSeconds')::integer
  from jsonb_array_elements(p_steps) with ordinality as t(elem, ord);

  update public.ai_customize_requests
  set status = 'completed', created_recipe_id = v_new_recipe_id, updated_at = now()
  where idempotency_key = p_idempotency_key;

  return v_new_recipe_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_create_offer(p_farmer_id uuid, p_items jsonb, p_delivery text DEFAULT 'kargo-buyer'::text, p_delivery_date date DEFAULT NULL::date, p_note text DEFAULT NULL::text, p_subscription_id uuid DEFAULT NULL::uuid, p_source_recipe_id uuid DEFAULT NULL::uuid)
 RETURNS offers
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_buyer_id uuid := auth.uid();
  v_offer public.offers;
  v_item jsonb;
  v_qty numeric;
  v_price numeric;
  v_listing_id uuid;
  v_total_qty numeric := 0;
  v_weighted_sum numeric := 0;
  v_primary_listing_id uuid;
  v_listing record;
  v_base_stock numeric;
  v_reserved numeric;
  v_available numeric;
begin
  if v_buyer_id is null then
    raise exception 'Oturum bulunamadı' using errcode = '28000';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'En az bir parti seçmelisiniz';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_listing_id := (v_item->>'listing_id')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_price := (v_item->>'price_per_unit')::numeric;

    if v_listing_id is null then
      raise exception 'listing_id zorunlu';
    end if;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Miktar 0''dan büyük olmalı';
    end if;
    if v_price is null or v_price <= 0 then
      raise exception 'Fiyat 0''dan büyük olmalı';
    end if;

    select l.id, l.farmer_id, l.status, l.quantity, l.min_order,
      coalesce((
        select sum(he.quantity)
        from listing_harvest_entries lhe
        join harvest_entries he on he.id = lhe.harvest_entry_id
        where lhe.listing_id = l.id
      ), 0) as batch_total
    into v_listing
    from listings l
    where l.id = v_listing_id;

    if v_listing.id is null then
      raise exception 'İlan bulunamadı';
    end if;
    if v_listing.farmer_id <> p_farmer_id then
      raise exception 'İlan bu çiftçiye ait değil';
    end if;
    if v_listing.status <> 'active' then
      raise exception 'İlan artık aktif değil';
    end if;

    if v_qty < v_listing.min_order then
      raise exception 'Minimum sipariş miktarının altında (min: %)', v_listing.min_order;
    end if;

    v_base_stock := case when v_listing.batch_total > 0 then v_listing.batch_total else coalesce(v_listing.quantity, 0) end;

    select coalesce(sum(oi.quantity), 0) into v_reserved
    from offer_items oi
    join offers o on o.id = oi.offer_id
    where oi.listing_id = v_listing_id
      and o.status = 'accepted';

    v_available := v_base_stock - v_reserved;
    if v_qty > v_available then
      raise exception 'Stok yetersiz (batch)';
    end if;

    v_total_qty := v_total_qty + v_qty;
    v_weighted_sum := v_weighted_sum + v_qty * v_price;
    if v_primary_listing_id is null then
      v_primary_listing_id := v_listing_id;
    end if;
  end loop;

  insert into public.offers (
    buyer_id, farmer_id, listing_id, quantity, price_per_unit,
    current_quantity, current_price, ball_side, payment_status,
    delivery, delivery_date, note, status, subscription_id, source_recipe_id
  ) values (
    v_buyer_id, p_farmer_id, v_primary_listing_id, v_total_qty, v_weighted_sum / v_total_qty,
    v_total_qty, v_weighted_sum / v_total_qty, 'farmer', 'unpaid',
    coalesce(p_delivery, 'kargo-buyer')::delivery_type, p_delivery_date, p_note, 'pending',
    p_subscription_id, p_source_recipe_id
  )
  returning * into v_offer;

  insert into public.offer_items (offer_id, listing_id, quantity, price_per_unit)
  select v_offer.id, (i->>'listing_id')::uuid, (i->>'quantity')::numeric, (i->>'price_per_unit')::numeric
  from jsonb_array_elements(p_items) i;

  return v_offer;
end;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_delete_own_account()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_role public.user_role;
  v_has_active_listing boolean;
  v_has_open_order boolean;
begin
  if v_uid is null then
    raise exception 'Oturum bulunamadı';
  end if;

  select role into v_role from public.profiles where id = v_uid;
  if not found then
    raise exception 'Profil bulunamadı';
  end if;

  if v_role = 'farmer' then
    select exists(
      select 1 from public.listings where farmer_id = v_uid and status = 'active'
    ) into v_has_active_listing;

    select exists(
      select 1 from public.orders
      where farmer_id = v_uid and status not in ('completed', 'cancelled')
    ) into v_has_open_order;

    if v_has_active_listing or v_has_open_order then
      raise exception 'Önce açık ilanlarınızı ve siparişlerinizi tamamlayın';
    end if;
  end if;

  delete from public.buyer_addresses where buyer_id = v_uid;
  delete from public.buyer_profiles where user_id = v_uid;
  delete from public.recipe_saves where user_id = v_uid;
  delete from public.recipes where owner_id = v_uid and author_type = 'kullanici';
  delete from public.device_tokens where user_id = v_uid;
  delete from public.ai_usage_tracking where user_id = v_uid;
  delete from public.ai_chat_messages where user_id = v_uid;
  delete from public.mcp_tool_calls where user_id = v_uid;

  update public.profiles
  set deleted_at = coalesce(deleted_at, transaction_timestamp()),
      name = 'Silinmiş Kullanıcı',
      phone = null,
      city = null,
      iban = null,
      bank_account_name = null
  where id = v_uid;

  update auth.users
  set phone = null,
      phone_confirmed_at = null,
      phone_change = null,
      phone_change_token = '',
      email = null,
      email_confirmed_at = null,
      email_change = null,
      email_change_token_new = '',
      email_change_token_current = '',
      encrypted_password = '',
      confirmation_token = '',
      recovery_token = '',
      reauthentication_token = '',
      raw_user_meta_data = '{}'::jsonb,
      banned_until = now() + interval '100 years',
      updated_at = now()
  where id = v_uid;
end;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_generate_recipe_share_token(p_recipe_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_token uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select share_token into v_token
  from public.recipes
  where id = p_recipe_id and owner_id = auth.uid() and visibility = 'private';

  if not found then
    raise exception 'RECIPE_SHARE_NOT_ELIGIBLE: recipe % is not an owned private recipe', p_recipe_id;
  end if;

  if v_token is not null then
    return v_token;
  end if;

  v_token := gen_random_uuid();

  update public.recipes
  set share_token = v_token
  where id = p_recipe_id and owner_id = auth.uid() and visibility = 'private';

  return v_token;
end;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_get_shared_recipe(p_share_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_recipe record;
begin
  select id, title, description, cover_photo_url, servings, prep_minutes, cook_minutes,
         rest_minutes, difficulty, cuisine, diet_tags, required_equipment
  into v_recipe
  from public.recipes
  where share_token = p_share_token and visibility = 'private';

  if v_recipe.id is null then
    return null;
  end if;

  return jsonb_build_object(
    'recipe', jsonb_build_object(
      'id', v_recipe.id,
      'title', v_recipe.title,
      'description', v_recipe.description,
      'cover_photo_url', v_recipe.cover_photo_url,
      'servings', v_recipe.servings,
      'prep_minutes', v_recipe.prep_minutes,
      'cook_minutes', v_recipe.cook_minutes,
      'rest_minutes', v_recipe.rest_minutes,
      'difficulty', v_recipe.difficulty,
      'cuisine', v_recipe.cuisine,
      'diet_tags', coalesce(to_jsonb(v_recipe.diet_tags), '[]'::jsonb),
      'required_equipment', coalesce(to_jsonb(v_recipe.required_equipment), '[]'::jsonb)
    ),
    'ingredients', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ri.id,
        'sort_order', ri.sort_order,
        'crop', ri.crop,
        'free_text_name', ri.free_text_name,
        'quantity', ri.quantity,
        'unit', ri.unit,
        'note', ri.note,
        'is_key_ingredient', ri.is_key_ingredient
      ) order by ri.sort_order)
      from public.recipe_ingredients ri
      where ri.recipe_id = v_recipe.id
    ), '[]'::jsonb),
    'steps', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', rs.id,
        'step_no', rs.step_no,
        'instruction', rs.instruction,
        'photo_url', rs.photo_url,
        'timer_seconds', rs.timer_seconds
      ) order by rs.step_no)
      from public.recipe_steps rs
      where rs.recipe_id = v_recipe.id
    ), '[]'::jsonb)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_recipe_availability(p_recipe_id uuid)
 RETURNS TABLE(ingredient_id uuid, sort_order integer, crop text, crop_display_name text, crop_photo_url text, free_text_name text, quantity numeric, unit text, is_key_ingredient boolean, is_platform_crop boolean, is_matched boolean, active_listing_count integer, canonical_unit text, best_price_per_canonical numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with ing as (
    select i.*
    from public.recipe_ingredients i
    where i.recipe_id = p_recipe_id
      -- Yenilemez crop'lar sonuçta HİÇ görünmez (pamuk/tütün/şeker pancarı/safran soğanı).
      and (
        i.crop is null
        or exists (select 1 from public.crop_culinary_meta m
                   where m.crop = i.crop and m.is_edible)
      )
  ),
  lst as (
    select l.crop,
           count(*)::integer as active_listing_count,
           min(
             l.price_per_unit
             * (case cc.default_unit when 'kg' then 1000 when 'L' then 1000 else 1 end)::numeric
             / (case l.unit::text     when 'kg' then 1000 when 'L' then 1000 else 1 end)::numeric
           ) as best_price_per_canonical
    from public.listings l
    join public.crop_config cc on cc.crop = l.crop
    where l.status = 'active'
      and l.crop in (select i.crop from ing i where i.crop is not null)
    group by l.crop
  )
  select
    ing.id,
    ing.sort_order,
    ing.crop,
    cc.display_name,
    cc.default_photo_url,
    ing.free_text_name,
    ing.quantity,
    ing.unit,
    ing.is_key_ingredient,
    (ing.crop is not null)                                   as is_platform_crop,
    (ing.crop is not null and coalesce(lst.active_listing_count, 0) > 0) as is_matched,
    coalesce(lst.active_listing_count, 0)                    as active_listing_count,
    cc.default_unit,
    lst.best_price_per_canonical
  from ing
  left join public.crop_config cc on cc.crop = ing.crop
  left join lst on lst.crop = ing.crop
  order by ing.sort_order, ing.id;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_recipe_shopping_list(p_recipe_id uuid, p_servings integer DEFAULT NULL::integer)
 RETURNS TABLE(ingredient_id uuid, sort_order integer, crop text, crop_display_name text, free_text_name text, is_platform_crop boolean, is_matched boolean, recipe_servings integer, requested_servings integer, scale_factor numeric, recipe_quantity numeric, recipe_unit text, scaled_quantity numeric, canonical_unit text, needed_canonical numeric, conversion_available boolean, min_order_canonical numeric, purchase_canonical numeric, rounded_up_to_min_order boolean, recipes_covered numeric, best_price_per_canonical numeric, estimated_cost numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with r as (
    select rec.id, rec.servings from public.recipes rec where rec.id = p_recipe_id
  ),
  sc as (
    select r.id,
           r.servings                                              as recipe_servings,
           coalesce(p_servings, r.servings)                        as requested_servings,
           case
             when p_servings is null or r.servings is null or r.servings = 0 then 1::numeric
             else p_servings::numeric / r.servings::numeric
           end                                                     as scale_factor
    from r
  ),
  ing as (
    select i.*
    from public.recipe_ingredients i
    where i.recipe_id = p_recipe_id
      and (
        i.crop is null
        or exists (select 1 from public.crop_culinary_meta m
                   where m.crop = i.crop and m.is_edible)
      )
  ),
  -- En iyi fiyatlı aktif ilan: alışverişin fiilen yapılacağı ilan.
  best as (
    select distinct on (l.crop)
           l.crop,
           l.price_per_unit
             * (case cc.default_unit when 'kg' then 1000 when 'L' then 1000 else 1 end)::numeric
             / (case l.unit::text     when 'kg' then 1000 when 'L' then 1000 else 1 end)::numeric as price_per_canonical,
           l.min_order
             * (case l.unit::text     when 'kg' then 1000 when 'L' then 1000 else 1 end)::numeric
             / (case cc.default_unit  when 'kg' then 1000 when 'L' then 1000 else 1 end)::numeric as min_order_canonical
    from public.listings l
    join public.crop_config cc on cc.crop = l.crop
    where l.status = 'active'
      and l.crop in (select i.crop from ing i where i.crop is not null)
    order by l.crop, price_per_canonical asc
  ),
  calc as (
    select
      ing.id, ing.sort_order, ing.crop, ing.free_text_name,
      cc.display_name, cc.default_unit,
      sc.recipe_servings, sc.requested_servings, sc.scale_factor,
      ing.quantity as recipe_quantity,
      ing.unit     as recipe_unit,
      ing.quantity * sc.scale_factor as scaled_quantity,
      public.fn_culinary_to_canonical(ing.crop, ing.quantity * sc.scale_factor, ing.unit) as needed_canonical,
      best.min_order_canonical,
      best.price_per_canonical
    from ing
    cross join sc
    left join public.crop_config cc on cc.crop = ing.crop
    left join best on best.crop = ing.crop
  )
  select
    calc.id,
    calc.sort_order,
    calc.crop,
    calc.display_name,
    calc.free_text_name,
    (calc.crop is not null)                       as is_platform_crop,
    (calc.price_per_canonical is not null)        as is_matched,
    calc.recipe_servings,
    calc.requested_servings,
    calc.scale_factor,
    calc.recipe_quantity,
    calc.recipe_unit,
    calc.scaled_quantity,
    calc.default_unit,
    calc.needed_canonical,
    (calc.needed_canonical is not null)           as conversion_available,
    calc.min_order_canonical,
    -- min_order yuvarlaması: gereken miktar min_order'ın altındaysa min_order alınır.
    case
      when calc.needed_canonical is null then null
      when calc.min_order_canonical is null then calc.needed_canonical
      else greatest(calc.needed_canonical, calc.min_order_canonical)
    end                                            as purchase_canonical,
    case
      when calc.needed_canonical is null or calc.min_order_canonical is null then null
      else calc.min_order_canonical > calc.needed_canonical
    end                                            as rounded_up_to_min_order,
    -- "Bu miktar kaç tarif yapar" — beklenti yönetiminin sayısı.
    case
      when calc.needed_canonical is null or calc.needed_canonical = 0 then null
      else round(
             (case
                when calc.min_order_canonical is null then calc.needed_canonical
                else greatest(calc.needed_canonical, calc.min_order_canonical)
              end) / calc.needed_canonical, 2)
    end                                            as recipes_covered,
    calc.price_per_canonical,
    case
      when calc.needed_canonical is null or calc.price_per_canonical is null then null
      else round(
             (case
                when calc.min_order_canonical is null then calc.needed_canonical
                else greatest(calc.needed_canonical, calc.min_order_canonical)
              end) * calc.price_per_canonical, 2)
    end                                            as estimated_cost
  from calc
  order by calc.sort_order, calc.id;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_register_device_token(p_token text, p_platform text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _token text := btrim(coalesce(p_token, ''));
  _id uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF _token = '' THEN
    RAISE EXCEPTION 'token_required';
  END IF;
  IF p_platform IS NULL OR p_platform NOT IN ('ios', 'android') THEN
    RAISE EXCEPTION 'invalid_platform';
  END IF;

  INSERT INTO public.device_tokens (user_id, token, platform)
  VALUES (_uid, _token, p_platform)
  ON CONFLICT (token) DO UPDATE
    SET user_id    = EXCLUDED.user_id,
        platform   = EXCLUDED.platform,
        updated_at = now()
  RETURNING id INTO _id;

  RETURN _id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_revoke_recipe_share_token(p_recipe_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  update public.recipes
  set share_token = null
  where id = p_recipe_id and owner_id = auth.uid();

  if not found then
    raise exception 'RECIPE_SHARE_REVOKE_NOT_FOUND: recipe % is not owned by caller', p_recipe_id;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.search_existing_recipes(p_query text DEFAULT NULL::text, p_crop text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_limit integer DEFAULT 20)
 RETURNS TABLE(id uuid, slug text, title text, status text, visibility text, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select r.id, r.slug, r.title, r.status, r.visibility, r.created_at
  from public.recipes r
  where (p_query is null or btrim(p_query) = '' or r.title ilike '%' || btrim(p_query) || '%')
    and (p_status is null or r.status = p_status)
    and (
      p_crop is null
      or exists (
        select 1 from public.recipe_ingredients ri
        where ri.recipe_id = r.id and ri.crop = p_crop
      )
    )
  order by r.created_at desc
  limit greatest(1, least(100, coalesce(p_limit, 20)));
$function$;

CREATE OR REPLACE FUNCTION public.send_subscription_harvest_reminders()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  rec record;
  buyer_name text;
  farmer_name text;
BEGIN
  FOR rec IN
    SELECT hs.id, hs.buyer_id, hs.farmer_id, hs.crop, hs.next_harvest_date
    FROM public.harvest_subscriptions hs
    WHERE hs.status = 'active'
      AND hs.next_harvest_date = (CURRENT_DATE + 3)
  LOOP
    SELECT name INTO buyer_name FROM public.profiles WHERE id = rec.buyer_id;
    SELECT name INTO farmer_name FROM public.profiles WHERE id = rec.farmer_id;

    INSERT INTO public.notifications(user_id, type, title, body, related_id)
    VALUES (rec.farmer_id, 'harvest_time', '🌾 Hasat Yaklaşıyor',
      coalesce(buyer_name,'Alıcınız') || ' ile aboneliğinizde hasat tarihi 3 gün sonra (' || to_char(rec.next_harvest_date,'DD.MM.YYYY') || ').',
      rec.id);
    PERFORM public.dispatch_sms(rec.farmer_id, 'harvest_time',
      'Hasat: ' || coalesce(rec.crop,'Ürün') || ' aboneliğinizde hasat tarihi 3 gün sonra (' || to_char(rec.next_harvest_date,'DD.MM.YYYY') || ').');
    PERFORM public.dispatch_push(rec.farmer_id, 'harvest_time', '🌾 Hasat Yaklaşıyor',
      coalesce(buyer_name,'Alıcınız') || ' ile aboneliğinizde hasat tarihi 3 gün sonra (' || to_char(rec.next_harvest_date,'DD.MM.YYYY') || ').');

    INSERT INTO public.notifications(user_id, type, title, body, related_id)
    VALUES (rec.buyer_id, 'harvest_time', '🌾 Hasat Yaklaşıyor',
      coalesce(farmer_name,'Üreticiniz') || ' ile aboneliğinizde hasat tarihi 3 gün sonra (' || to_char(rec.next_harvest_date,'DD.MM.YYYY') || '). Sipariş vermeyi unutmayın.',
      rec.id);
    PERFORM public.dispatch_sms(rec.buyer_id, 'harvest_time',
      'Hasat: ' || coalesce(rec.crop,'Ürün') || ' aboneliğinizde hasat tarihi 3 gün sonra (' || to_char(rec.next_harvest_date,'DD.MM.YYYY') || '). Sipariş vermeyi unutmayın.');
    PERFORM public.dispatch_push(rec.buyer_id, 'harvest_time', '🌾 Hasat Yaklaşıyor',
      coalesce(farmer_name,'Üreticiniz') || ' ile aboneliğinizde hasat tarihi 3 gün sonra (' || to_char(rec.next_harvest_date,'DD.MM.YYYY') || '). Sipariş vermeyi unutmayın.');
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_recipe_plan_schedule(_cron text, _active boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'cron'
AS $function$
declare
  -- The ONLY cron expressions this function will ever apply when _active is true — matches
  -- admin-recipe-plan-schedule/index.ts's own fixed preset allow-list exactly.
  _allowed_schedules constant text[] := array['0 6 * * 1', '0 6 1 * *'];
  _job_id bigint;
begin
  if _active and not (_cron = any (_allowed_schedules)) then
    raise exception 'set_recipe_plan_schedule: unsupported cron expression %', _cron;
  end if;

  select j.jobid into _job_id from cron.job j where j.jobname = 'recipe-stage-plan-weekly';
  if _job_id is null then
    raise exception 'set_recipe_plan_schedule: recipe-stage-plan-weekly cron job not found';
  end if;

  if _active then
    perform cron.alter_job(_job_id, schedule => _cron, active => true);
  else
    perform cron.alter_job(_job_id, active => false);
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.tg_enforce_min_order_le_quantity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status <> 'draft' AND NEW.min_order > NEW.quantity THEN
    RAISE EXCEPTION 'min_order (%) quantity (%) üzerinde olamaz', NEW.min_order, NEW.quantity
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.tg_harvest_entries_after_insert_autolink()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  match_count int;
  only_listing_id uuid;
BEGIN
  IF NEW.parcel_id IS NULL THEN RETURN NEW; END IF;

  SELECT count(*) INTO match_count
    FROM public.listings l
    WHERE l.farmer_id = NEW.farmer_id
      AND l.parcel_id = NEW.parcel_id
      AND lower(l.crop) = lower(NEW.crop)
      AND l.status IN ('draft','active');

  IF match_count = 1 THEN
    SELECT l.id INTO only_listing_id
      FROM public.listings l
      WHERE l.farmer_id = NEW.farmer_id
        AND l.parcel_id = NEW.parcel_id
        AND lower(l.crop) = lower(NEW.crop)
        AND l.status IN ('draft','active')
      LIMIT 1;

    INSERT INTO public.listing_harvest_entries (listing_id, harvest_entry_id)
    VALUES (only_listing_id, NEW.id)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.tg_recipe_ingredients_auto_match_crop()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.crop is null and new.free_text_name is not null then
    new.crop := public.fn_match_culinary_crop(new.free_text_name);
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.tg_require_published_recipe_facts()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_recipe record;
  v_has_publish_provenance boolean;
begin
  select * into v_recipe from public.recipes where id = new.id;
  if not found or v_recipe.status <> 'published' then
    return null;
  end if;

  if v_recipe.allergen_labels is null
     or v_recipe.allergens_reviewed is distinct from true
     or v_recipe.allergens_reviewed_at is null
     or not public.is_valid_recipe_allergen_labels(v_recipe.allergen_labels) then
    raise exception 'PUBLISH_ALLERGEN_FACTS_INCOMPLETE: recipe % is not human-reviewed with controlled labels', new.id;
  end if;

  if v_recipe.nutrition_source is distinct from 'computed'
     or v_recipe.nutrition_coverage_pct is distinct from 100
     or v_recipe.calories is null
     or v_recipe.protein_g is null
     or v_recipe.carbs_g is null
     or v_recipe.fat_g is null
     or v_recipe.nutrition_calculated_at is null
     or v_recipe.nutrition_input_hash is null
     or v_recipe.nutrition_reference_version is null then
    raise exception 'PUBLISH_NUTRITION_FACTS_INCOMPLETE: recipe % is not computed with 100%% coverage', new.id;
  end if;

  select exists (
    select 1
    from public.recipe_generation_jobs as j
    join lateral (
      select d.id, d.version
      from public.recipe_drafts as d
      where d.job_id = j.id
      order by d.version desc
      limit 1
    ) as d on true
    join public.recipe_admin_reviews as ar
      on ar.job_id = j.id
     and ar.draft_id = d.id
     and ar.draft_version = d.version
     and ar.action = 'approve'
    where j.recipe_id = new.id
      and j.stage = 'publish'
      and j.status = 'completed'
  ) into v_has_publish_provenance;

  if not v_has_publish_provenance then
    raise exception 'PUBLISH_PROVENANCE_MISSING: recipe % is not linked to an exact approved F2 publish job', new.id;
  end if;

  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_likes_count()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT' then
    update community_posts set likes_count = likes_count + 1 where id = new.post_id;
  elsif tg_op = 'DELETE' then
    update community_posts set likes_count = likes_count - 1 where id = old.post_id;
  end if;
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.validate_recipe_crop_values(p_draft jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_issues jsonb := '[]'::jsonb;
  v_ingredients jsonb;
  v_ing jsonb;
  v_idx integer := 0;
  v_crop text;
  v_free_text text;
begin
  v_ingredients := case when jsonb_typeof(p_draft) = 'object' then p_draft->'ingredients' else null end;
  if jsonb_typeof(v_ingredients) is distinct from 'array' then
    return jsonb_build_object(
      'valid', false,
      'issues', jsonb_build_array(jsonb_build_object(
        'code', 'INGREDIENTS_NOT_ARRAY', 'field', 'ingredients', 'severity', 'blocking',
        'message', 'ingredients must be an array', 'requiredChange', 'ingredients alanini bir dizi olarak gonderin.'
      ))
    );
  end if;

  for v_ing in select * from jsonb_array_elements(v_ingredients)
  loop
    v_crop := nullif(btrim(coalesce(v_ing->>'crop', '')), '');
    v_free_text := nullif(btrim(coalesce(v_ing->>'freeTextName', '')), '');

    if v_crop is null and v_free_text is null then
      v_issues := v_issues || jsonb_build_object(
        'code', 'INGREDIENT_NAME_MISSING', 'field', format('ingredients[%s]', v_idx), 'severity', 'blocking',
        'message', format('ingredient #%s needs either crop or freeTextName', v_idx),
        'requiredChange', 'Malzeme icin crop veya freeTextName degerlerinden birini belirtin.'
      );
    end if;

    if v_crop is not null and not exists (select 1 from public.crop_config cc where cc.crop = v_crop) then
      v_issues := v_issues || jsonb_build_object(
        'code', 'INGREDIENT_CROP_UNKNOWN', 'field', format('ingredients[%s].crop', v_idx), 'severity', 'blocking',
        'message', format('ingredient #%s references unknown crop "%s" (not in crop_config)', v_idx, v_crop),
        'requiredChange', 'crop_config icinde tanimli gecerli bir crop secin.'
      );
    end if;

    if v_ing ? 'quantity' and jsonb_typeof(v_ing->'quantity') is distinct from 'null' then
      if jsonb_typeof(v_ing->'quantity') is distinct from 'number' then
        v_issues := v_issues || jsonb_build_object(
          'code', 'INGREDIENT_QUANTITY_NOT_NUMBER', 'field', format('ingredients[%s].quantity', v_idx), 'severity', 'blocking',
          'message', format('ingredient #%s quantity must be a number', v_idx),
          'requiredChange', 'quantity alanina sayisal bir deger girin.'
        );
      elsif (v_ing->>'quantity')::numeric <= 0 then
        v_issues := v_issues || jsonb_build_object(
          'code', 'INGREDIENT_QUANTITY_NOT_POSITIVE', 'field', format('ingredients[%s].quantity', v_idx), 'severity', 'blocking',
          'message', format('ingredient #%s quantity must be > 0 (got %s)', v_idx, v_ing->>'quantity'),
          'requiredChange', 'quantity degerini 0''dan buyuk yapin.'
        );
      end if;
    end if;

    v_idx := v_idx + 1;
  end loop;

  return jsonb_build_object(
    'valid', not exists (
      select 1 from jsonb_array_elements(v_issues) i where i->>'severity' = 'blocking'
    ),
    'issues', v_issues
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.validate_recipe_ingredient_coverage(p_draft jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_issues jsonb := '[]'::jsonb;
  v_ingredients jsonb;
  v_steps jsonb;
  v_all_text text;
  v_ing jsonb;
  v_idx integer := 0;
  v_name text;
  v_root text;
  v_is_key boolean;
  v_draft_crops text[] := array[]::text[];
  v_step jsonb;
  v_step_text text;
  v_other record;
begin
  if jsonb_typeof(p_draft) is distinct from 'object' then
    return jsonb_build_object(
      'valid', false,
      'issues', jsonb_build_array(jsonb_build_object(
        'code', 'DRAFT_NOT_OBJECT', 'field', 'draft', 'severity', 'blocking',
        'message', 'draft must be a JSON object', 'requiredChange', 'Taslagi bir JSON nesnesi olarak gonderin.'
      ))
    );
  end if;

  v_ingredients := p_draft->'ingredients';
  v_steps := p_draft->'steps';
  if jsonb_typeof(v_ingredients) is distinct from 'array' or jsonb_typeof(v_steps) is distinct from 'array' then
    return jsonb_build_object(
      'valid', true,
      'issues', '[]'::jsonb
    );
  end if;

  select string_agg(lower(coalesce(s->>'instruction', '')), ' ') into v_all_text
  from jsonb_array_elements(v_steps) as s;
  v_all_text := coalesce(v_all_text, '');

  for v_ing in select * from jsonb_array_elements(v_ingredients)
  loop
    if (v_ing ? 'isKeyIngredient') and jsonb_typeof(v_ing->'isKeyIngredient') not in ('boolean', 'null') then
      v_issues := v_issues || jsonb_build_object(
        'code', 'INGREDIENT_IS_KEY_NOT_BOOLEAN', 'field', format('ingredients[%s].isKeyIngredient', v_idx),
        'severity', 'warning', 'message', format('ingredient #%s isKeyIngredient must be a boolean; treated as false', v_idx),
        'requiredChange', 'isKeyIngredient alanini true veya false olarak ayarlayin.'
      );
      v_is_key := false;
    else
      v_is_key := coalesce((v_ing->>'isKeyIngredient')::boolean, false);
    end if;

    if v_is_key then
      v_name := coalesce(
        (select cc.display_name from public.crop_config cc where cc.crop = v_ing->>'crop'),
        nullif(btrim(coalesce(v_ing->>'freeTextName', '')), '')
      );
      if v_name is not null then
        v_root := lower(split_part(v_name, ' ', 1));
        if length(v_root) >= 3 and v_all_text !~ ('\m' || public.fn_recipe_escape_regex(v_root)) then
          v_issues := v_issues || jsonb_build_object(
            'code', 'INGREDIENT_UNUSED', 'field', format('ingredients[%s]', v_idx), 'severity', 'warning',
            'message', format('key ingredient "%s" is never mentioned in any step instruction', v_name),
            'requiredChange', null
          );
        end if;
      end if;
    end if;
    if v_ing->>'crop' is not null then
      v_draft_crops := v_draft_crops || (v_ing->>'crop');
    end if;
    v_idx := v_idx + 1;
  end loop;

  for v_step in select * from jsonb_array_elements(v_steps)
  loop
    v_step_text := lower(coalesce(v_step->>'instruction', ''));
    if v_step_text <> '' then
      for v_other in
        select cc.crop, cc.display_name
        from public.crop_config cc
        where length(cc.display_name) >= 4
          and not (cc.crop = any (v_draft_crops))
          and v_step_text ~ ('\m' || public.fn_recipe_escape_regex(lower(split_part(cc.display_name, ' ', 1))))
      loop
        v_issues := v_issues || jsonb_build_object(
          'code', 'STEP_UNKNOWN_CROP_MENTION', 'field', format('steps[%s]', coalesce(v_step->>'stepNo', '?')), 'severity', 'warning',
          'message', format(
            'step %s mentions "%s" (crop "%s"), which is not among this draft''s ingredients',
            coalesce(v_step->>'stepNo', '?'), v_other.display_name, v_other.crop
          ),
          'requiredChange', null
        );
      end loop;
    end if;
  end loop;

  return jsonb_build_object(
    'valid', not exists (
      select 1 from jsonb_array_elements(v_issues) i where i->>'severity' = 'blocking'
    ),
    'issues', v_issues
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.validate_recipe_plan(p_plan jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_issues jsonb := '[]'::jsonb;
  v_briefs jsonb;
  v_brief jsonb;
  v_idx integer := 0;
  v_working_title text;
  v_focus_crop text;
  v_difficulty text;
  v_seen_titles text[] := array[]::text[];
  v_norm_title text;
begin
  if jsonb_typeof(p_plan) is distinct from 'object' then
    return jsonb_build_object(
      'valid', false,
      'issues', jsonb_build_array(jsonb_build_object(
        'code', 'PLAN_NOT_OBJECT', 'field', 'plan', 'severity', 'blocking',
        'message', 'plan must be a JSON object', 'requiredChange', 'Plani bir JSON nesnesi olarak gonderin.'
      )),
      'briefCount', 0
    );
  end if;

  v_briefs := p_plan->'briefs';
  if jsonb_typeof(v_briefs) is distinct from 'array' or jsonb_array_length(v_briefs) = 0 then
    v_issues := v_issues || jsonb_build_object(
      'code', 'BRIEFS_EMPTY', 'field', 'briefs', 'severity', 'blocking',
      'message', 'briefs must be a non-empty array',
      'requiredChange', 'Plana en az bir brief ekleyin.'
    );
    v_briefs := '[]'::jsonb;
  end if;

  for v_brief in select * from jsonb_array_elements(v_briefs)
  loop
    v_working_title := btrim(coalesce(v_brief->>'workingTitle', ''));
    v_focus_crop := nullif(btrim(coalesce(v_brief->>'focusCrop', '')), '');
    v_difficulty := nullif(btrim(coalesce(v_brief->>'targetDifficulty', '')), '');

    if v_working_title = '' then
      v_issues := v_issues || jsonb_build_object(
        'code', 'BRIEF_TITLE_MISSING', 'field', format('briefs[%s].workingTitle', v_idx), 'severity', 'blocking',
        'message', format('brief #%s is missing a workingTitle', v_idx),
        'requiredChange', 'Brief icin bir workingTitle belirleyin.'
      );
    else
      v_norm_title := lower(v_working_title);
      if v_norm_title = any (v_seen_titles) then
        v_issues := v_issues || jsonb_build_object(
          'code', 'BRIEF_TITLE_DUPLICATE', 'field', format('briefs[%s].workingTitle', v_idx), 'severity', 'blocking',
          'message', format('brief #%s ("%s") repeats another brief''s workingTitle in the same batch', v_idx, v_working_title),
          'requiredChange', 'Bu brief icin farkli, benzersiz bir workingTitle secin.'
        );
      else
        v_seen_titles := v_seen_titles || v_norm_title;
      end if;
    end if;

    if v_focus_crop is not null and not exists (
      select 1 from public.crop_config cc where cc.crop = v_focus_crop
    ) then
      v_issues := v_issues || jsonb_build_object(
        'code', 'BRIEF_CROP_UNKNOWN', 'field', format('briefs[%s].focusCrop', v_idx), 'severity', 'blocking',
        'message', format('brief #%s references unknown crop "%s" (not in crop_config)', v_idx, v_focus_crop),
        'requiredChange', 'crop_config icinde tanimli gecerli bir crop secin.'
      );
    end if;

    if v_difficulty is not null and v_difficulty not in ('kolay', 'orta', 'zor') then
      v_issues := v_issues || jsonb_build_object(
        'code', 'BRIEF_DIFFICULTY_INVALID', 'field', format('briefs[%s].targetDifficulty', v_idx), 'severity', 'blocking',
        'message', format('brief #%s has invalid targetDifficulty "%s" (must be kolay|orta|zor)', v_idx, v_difficulty),
        'requiredChange', 'targetDifficulty degerini kolay, orta veya zor olarak ayarlayin.'
      );
    end if;

    v_idx := v_idx + 1;
  end loop;

  return jsonb_build_object(
    'valid', not exists (
      select 1 from jsonb_array_elements(v_issues) i where i->>'severity' = 'blocking'
    ),
    'issues', v_issues,
    'briefCount', jsonb_array_length(v_briefs)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.validate_recipe_plan_diversity(p_plan jsonb, p_options jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_issues jsonb := '[]'::jsonb;
  v_briefs jsonb := coalesce(p_plan->'briefs', '[]'::jsonb);
  -- "istenmedikçe aynı primary crop'un tekrarından kaçın" — repeats are blocking BY DEFAULT; a
  -- caller may explicitly request the exception via p_options.allowCropRepeat.
  v_allow_repeat boolean := coalesce((p_options->>'allowCropRepeat')::boolean, false);
  v_brief jsonb;
  v_idx integer := 0;
  v_focus_crop text;
  v_working_title text;
  v_brief_count integer := jsonb_array_length(v_briefs);
  v_dup record;
  v_distinct_audiences integer;
  v_max_meal_share integer;
  v_max_difficulty_share integer;
begin
  if jsonb_typeof(p_plan) is distinct from 'object' then
    return jsonb_build_object(
      'valid', false,
      'issues', jsonb_build_array(jsonb_build_object(
        'code', 'DIVERSITY_PLAN_NOT_OBJECT', 'field', 'plan', 'severity', 'blocking',
        'message', 'plan must be a JSON object', 'requiredChange', 'Plani bir JSON nesnesi olarak gonderin.'
      )),
      'briefCount', 0
    );
  end if;

  if jsonb_typeof(v_briefs) is distinct from 'array' or v_brief_count = 0 then
    return jsonb_build_object(
      'valid', false,
      'issues', jsonb_build_array(jsonb_build_object(
        'code', 'DIVERSITY_BRIEFS_EMPTY', 'field', 'briefs', 'severity', 'blocking',
        'message', 'briefs must be a non-empty array', 'requiredChange', 'Plana en az bir brief ekleyin.'
      )),
      'briefCount', 0
    );
  end if;

  -- Soft-balance denominators, computed once (used only when v_brief_count is large enough for an
  -- imbalance to be meaningful — see the checks below).
  select count(distinct nullif(btrim(coalesce(b->>'audience', '')), ''))
    into v_distinct_audiences
    from jsonb_array_elements(v_briefs) b;

  select coalesce(max(cnt), 0) into v_max_meal_share
  from (
    select count(*) as cnt
    from jsonb_array_elements(v_briefs) b
    where nullif(btrim(coalesce(b->>'mealType', '')), '') is not null
    group by nullif(btrim(coalesce(b->>'mealType', '')), '')
  ) s;

  select coalesce(max(cnt), 0) into v_max_difficulty_share
  from (
    select count(*) as cnt
    from jsonb_array_elements(v_briefs) b
    where nullif(btrim(coalesce(b->>'targetDifficulty', '')), '') is not null
    group by nullif(btrim(coalesce(b->>'targetDifficulty', '')), '')
  ) s;

  for v_brief in select * from jsonb_array_elements(v_briefs)
  loop
    v_working_title := btrim(coalesce(v_brief->>'workingTitle', ''));
    v_focus_crop := nullif(btrim(coalesce(v_brief->>'focusCrop', '')), '');

    -- "primary crop'lar mutlaka crop_config'den gelmeli" — required AND must resolve live.
    if v_focus_crop is null then
      v_issues := v_issues || jsonb_build_object(
        'code', 'DIVERSITY_CROP_REQUIRED', 'field', format('briefs[%s].focusCrop', v_idx), 'severity', 'blocking',
        'message', format('brief #%s has no focusCrop — a primary crop is required', v_idx),
        'requiredChange', 'Bu brief icin crop_config''dan bir primary crop secin.'
      );
    elsif not exists (select 1 from public.crop_config cc where cc.crop = v_focus_crop) then
      v_issues := v_issues || jsonb_build_object(
        'code', 'DIVERSITY_CROP_NOT_IN_CONFIG', 'field', format('briefs[%s].focusCrop', v_idx), 'severity', 'blocking',
        'message', format('brief #%s focusCrop "%s" is not in crop_config', v_idx, v_focus_crop),
        'requiredChange', 'crop_config icinde tanimli gecerli bir crop secin.'
      );
    elsif not v_allow_repeat and (
      select count(*) from jsonb_array_elements(v_briefs) bb
      where nullif(btrim(coalesce(bb->>'focusCrop', '')), '') = v_focus_crop
    ) > 1 then
      v_issues := v_issues || jsonb_build_object(
        'code', 'DIVERSITY_CROP_REPEATED', 'field', format('briefs[%s].focusCrop', v_idx), 'severity', 'blocking',
        'message', format('brief #%s repeats primary crop "%s" elsewhere in the same plan', v_idx, v_focus_crop),
        'requiredChange', 'Farkli bir primary crop secin (veya tekrari p_options.allowCropRepeat ile acikca talep edin).'
      );
    end if;

    -- "yakın zamanlı tekrar eden (duplicate'e yakın) tarifleri önle" — reuses find_recipe_duplicates
    -- (f2s04) as-is; an exact match is blocking, a heuristic word-overlap/same-crop match is a
    -- warning (same "heuristic -> warning" convention f2s04's own header documents).
    for v_dup in
      select * from public.find_recipe_duplicates(v_working_title, v_focus_crop, null, 3)
    loop
      if v_dup.match_reason in ('exact_slug', 'exact_title') then
        v_issues := v_issues || jsonb_build_object(
          'code', 'DIVERSITY_EXACT_DUPLICATE', 'field', format('briefs[%s].workingTitle', v_idx), 'severity', 'blocking',
          'message', format('brief #%s ("%s") exactly matches existing recipe "%s" (%s)', v_idx, v_working_title, v_dup.title, v_dup.match_reason),
          'requiredChange', 'Farkli, ayirt edici bir workingTitle secin.'
        );
      else
        v_issues := v_issues || jsonb_build_object(
          'code', 'DIVERSITY_NEAR_DUPLICATE', 'field', format('briefs[%s].workingTitle', v_idx), 'severity', 'warning',
          'message', format('brief #%s ("%s") is a near-duplicate of existing recipe "%s" (%s)', v_idx, v_working_title, v_dup.title, v_dup.match_reason),
          'requiredChange', 'Baslik veya aciyi belirginlestirerek farklilastirin.'
        );
      end if;
    end loop;

    v_idx := v_idx + 1;
  end loop;

  -- Soft balance checks — heuristic distribution warnings, only meaningful once a batch is large
  -- enough for an imbalance to say anything ("başlangıç kuralları": difficulty/meal-type/audience
  -- balance are all phrased as "dengele"/"kapsa", not hard per-brief constraints).
  if v_brief_count >= 2 and v_distinct_audiences <= 1 then
    v_issues := v_issues || jsonb_build_object(
      'code', 'DIVERSITY_AUDIENCE_NOT_COVERED', 'field', 'briefs', 'severity', 'warning',
      'message', 'plan does not cover both bireysel and horeca audiences',
      'requiredChange', 'En az bir brief HoReCa, en az bir brief bireysel hedef kitleye yonelik olsun.'
    );
  end if;

  if v_brief_count >= 3 and v_max_meal_share > ceil(v_brief_count * 0.6) then
    v_issues := v_issues || jsonb_build_object(
      'code', 'DIVERSITY_MEAL_TYPE_IMBALANCED', 'field', 'briefs', 'severity', 'warning',
      'message', 'plan is dominated by a single meal type',
      'requiredChange', 'Yemek turlerini (kahvalti/ana yemek/corba/salata/tatli...) dengeleyin.'
    );
  end if;

  if v_brief_count >= 3 and v_max_difficulty_share > ceil(v_brief_count * 0.7) then
    v_issues := v_issues || jsonb_build_object(
      'code', 'DIVERSITY_DIFFICULTY_IMBALANCED', 'field', 'briefs', 'severity', 'warning',
      'message', 'plan is dominated by a single difficulty level',
      'requiredChange', 'kolay/orta/zor zorluk seviyelerini dengeleyin.'
    );
  end if;

  return jsonb_build_object(
    'valid', not exists (select 1 from jsonb_array_elements(v_issues) i where i->>'severity' = 'blocking'),
    'issues', v_issues,
    'briefCount', v_brief_count
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.validate_recipe_slug(p_slug text, p_exclude_recipe_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_issues jsonb := '[]'::jsonb;
  v_slug text := btrim(coalesce(p_slug, ''));
begin
  if v_slug = '' then
    v_issues := v_issues || jsonb_build_object(
      'code', 'SLUG_REQUIRED', 'field', 'slug', 'severity', 'blocking',
      'message', 'slug is required', 'requiredChange', 'Slug alanini doldurun.'
    );
  else
    if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
      v_issues := v_issues || jsonb_build_object(
        'code', 'SLUG_INVALID_FORMAT', 'field', 'slug', 'severity', 'blocking',
        'message', 'slug must be lowercase alphanumeric segments separated by single hyphens (got "' || v_slug || '")',
        'requiredChange', 'Slug sadece kucuk harf/rakam icersin ve bolumler tek tire ile ayrilsin.'
      );
    end if;

    if exists (
      select 1 from public.recipes r
      where r.slug = v_slug
        and (p_exclude_recipe_id is null or r.id <> p_exclude_recipe_id)
    ) then
      v_issues := v_issues || jsonb_build_object(
        'code', 'SLUG_ALREADY_USED', 'field', 'slug', 'severity', 'blocking',
        'message', 'slug "' || v_slug || '" is already used by an existing recipe',
        'requiredChange', 'Farkli, benzersiz bir slug secin.'
      );
    end if;
  end if;

  return jsonb_build_object(
    'valid', not exists (
      select 1 from jsonb_array_elements(v_issues) i where i->>'severity' = 'blocking'
    ),
    'issues', v_issues,
    'slug', v_slug
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.validate_recipe_structure(p_draft jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_issues jsonb := '[]'::jsonb;
  v_ingredients jsonb;
  v_steps jsonb;
  v_step jsonb;
  v_step_nos integer[] := array[]::integer[];
  v_expected integer[];
  v_difficulty text;
  v_num numeric;
begin
  if jsonb_typeof(p_draft) is distinct from 'object' then
    return jsonb_build_object(
      'valid', false,
      'issues', jsonb_build_array(jsonb_build_object(
        'code', 'DRAFT_NOT_OBJECT', 'field', 'draft', 'severity', 'blocking',
        'message', 'draft must be a JSON object', 'requiredChange', 'Taslagi bir JSON nesnesi olarak gonderin.'
      ))
    );
  end if;

  if btrim(coalesce(p_draft->>'title', '')) = '' then
    v_issues := v_issues || jsonb_build_object(
      'code', 'TITLE_MISSING', 'field', 'title', 'severity', 'blocking',
      'message', 'title is required', 'requiredChange', 'Baslik alanini doldurun.'
    );
  end if;

  if p_draft ? 'servings' and jsonb_typeof(p_draft->'servings') is distinct from 'null' then
    if jsonb_typeof(p_draft->'servings') is distinct from 'number' then
      v_issues := v_issues || jsonb_build_object(
        'code', 'SERVINGS_NOT_NUMBER', 'field', 'servings', 'severity', 'blocking',
        'message', 'servings must be a number', 'requiredChange', 'servings alanina sayisal bir deger girin.'
      );
    else
      v_num := (p_draft->>'servings')::numeric;
      if v_num <> trunc(v_num) then
        v_issues := v_issues || jsonb_build_object(
          'code', 'SERVINGS_NOT_INTEGER', 'field', 'servings', 'severity', 'blocking',
          'message', format('servings must be a whole number (got %s)', v_num),
          'requiredChange', 'servings degerini tam sayi olarak girin.'
        );
      elsif v_num <= 0 then
        v_issues := v_issues || jsonb_build_object(
          'code', 'SERVINGS_NOT_POSITIVE', 'field', 'servings', 'severity', 'blocking',
          'message', format('servings must be > 0 (got %s)', v_num),
          'requiredChange', 'servings degerini 0''dan buyuk yapin.'
        );
      end if;
    end if;
  end if;

  if p_draft ? 'prepMinutes' and jsonb_typeof(p_draft->'prepMinutes') is distinct from 'null' then
    if jsonb_typeof(p_draft->'prepMinutes') is distinct from 'number' then
      v_issues := v_issues || jsonb_build_object(
        'code', 'PREP_MINUTES_NOT_NUMBER', 'field', 'prepMinutes', 'severity', 'blocking',
        'message', 'prepMinutes must be a number', 'requiredChange', 'prepMinutes alanina sayisal bir deger girin.'
      );
    else
      v_num := (p_draft->>'prepMinutes')::numeric;
      if v_num <> trunc(v_num) then
        v_issues := v_issues || jsonb_build_object(
          'code', 'PREP_MINUTES_NOT_INTEGER', 'field', 'prepMinutes', 'severity', 'blocking',
          'message', format('prepMinutes must be a whole number (got %s)', v_num),
          'requiredChange', 'prepMinutes degerini tam sayi olarak girin.'
        );
      elsif v_num < 0 then
        v_issues := v_issues || jsonb_build_object(
          'code', 'PREP_MINUTES_NEGATIVE', 'field', 'prepMinutes', 'severity', 'blocking',
          'message', format('prepMinutes must be >= 0 (got %s)', v_num),
          'requiredChange', 'prepMinutes degerini 0 veya daha buyuk yapin.'
        );
      end if;
    end if;
  end if;

  if p_draft ? 'cookMinutes' and jsonb_typeof(p_draft->'cookMinutes') is distinct from 'null' then
    if jsonb_typeof(p_draft->'cookMinutes') is distinct from 'number' then
      v_issues := v_issues || jsonb_build_object(
        'code', 'COOK_MINUTES_NOT_NUMBER', 'field', 'cookMinutes', 'severity', 'blocking',
        'message', 'cookMinutes must be a number', 'requiredChange', 'cookMinutes alanina sayisal bir deger girin.'
      );
    else
      v_num := (p_draft->>'cookMinutes')::numeric;
      if v_num <> trunc(v_num) then
        v_issues := v_issues || jsonb_build_object(
          'code', 'COOK_MINUTES_NOT_INTEGER', 'field', 'cookMinutes', 'severity', 'blocking',
          'message', format('cookMinutes must be a whole number (got %s)', v_num),
          'requiredChange', 'cookMinutes degerini tam sayi olarak girin.'
        );
      elsif v_num < 0 then
        v_issues := v_issues || jsonb_build_object(
          'code', 'COOK_MINUTES_NEGATIVE', 'field', 'cookMinutes', 'severity', 'blocking',
          'message', format('cookMinutes must be >= 0 (got %s)', v_num),
          'requiredChange', 'cookMinutes degerini 0 veya daha buyuk yapin.'
        );
      end if;
    end if;
  end if;

  if p_draft ? 'restMinutes' and jsonb_typeof(p_draft->'restMinutes') is distinct from 'null' then
    if jsonb_typeof(p_draft->'restMinutes') is distinct from 'number' then
      v_issues := v_issues || jsonb_build_object(
        'code', 'REST_MINUTES_NOT_NUMBER', 'field', 'restMinutes', 'severity', 'blocking',
        'message', 'restMinutes must be a number', 'requiredChange', 'restMinutes alanina sayisal bir deger girin.'
      );
    else
      v_num := (p_draft->>'restMinutes')::numeric;
      if v_num <> trunc(v_num) then
        v_issues := v_issues || jsonb_build_object(
          'code', 'REST_MINUTES_NOT_INTEGER', 'field', 'restMinutes', 'severity', 'blocking',
          'message', format('restMinutes must be a whole number (got %s)', v_num),
          'requiredChange', 'restMinutes degerini tam sayi olarak girin.'
        );
      elsif v_num < 0 then
        v_issues := v_issues || jsonb_build_object(
          'code', 'REST_MINUTES_NEGATIVE', 'field', 'restMinutes', 'severity', 'blocking',
          'message', format('restMinutes must be >= 0 (got %s)', v_num),
          'requiredChange', 'restMinutes degerini 0 veya daha buyuk yapin.'
        );
      end if;
    end if;
  end if;

  v_difficulty := nullif(btrim(coalesce(p_draft->>'difficulty', '')), '');
  if v_difficulty is not null and v_difficulty not in ('kolay', 'orta', 'zor') then
    v_issues := v_issues || jsonb_build_object(
      'code', 'DIFFICULTY_INVALID', 'field', 'difficulty', 'severity', 'blocking',
      'message', format('difficulty must be kolay|orta|zor (got "%s")', v_difficulty),
      'requiredChange', 'difficulty degerini kolay, orta veya zor olarak ayarlayin.'
    );
  end if;

  v_ingredients := p_draft->'ingredients';
  if jsonb_typeof(v_ingredients) is distinct from 'array' or jsonb_array_length(v_ingredients) = 0 then
    v_issues := v_issues || jsonb_build_object(
      'code', 'INGREDIENTS_EMPTY', 'field', 'ingredients', 'severity', 'blocking',
      'message', 'ingredients must be a non-empty array', 'requiredChange', 'En az bir malzeme ekleyin.'
    );
  end if;

  v_steps := p_draft->'steps';
  if jsonb_typeof(v_steps) is distinct from 'array' or jsonb_array_length(v_steps) = 0 then
    v_issues := v_issues || jsonb_build_object(
      'code', 'STEPS_EMPTY', 'field', 'steps', 'severity', 'blocking',
      'message', 'steps must be a non-empty array', 'requiredChange', 'En az bir adim ekleyin.'
    );
  else
    for v_step in select * from jsonb_array_elements(v_steps)
    loop
      if btrim(coalesce(v_step->>'instruction', '')) = '' then
        v_issues := v_issues || jsonb_build_object(
          'code', 'STEP_INSTRUCTION_MISSING',
          'field', format('steps[%s].instruction', coalesce(v_step->>'stepNo', '?')),
          'severity', 'blocking', 'message', 'step instruction is required',
          'requiredChange', 'Adim icin bir talimat metni girin.'
        );
      end if;

      if jsonb_typeof(v_step->'stepNo') is distinct from 'number' then
        v_issues := v_issues || jsonb_build_object(
          'code', 'STEP_NO_NOT_NUMBER', 'field', 'steps[].stepNo', 'severity', 'blocking',
          'message', 'every step needs a numeric stepNo', 'requiredChange', 'Her adima sayisal bir stepNo verin.'
        );
      else
        v_num := (v_step->>'stepNo')::numeric;
        if v_num <> trunc(v_num) then
          v_issues := v_issues || jsonb_build_object(
            'code', 'STEP_NO_NOT_INTEGER', 'field', format('steps[%s].stepNo', v_step->>'stepNo'), 'severity', 'blocking',
            'message', format('stepNo must be a whole number (got %s)', v_num),
            'requiredChange', 'stepNo degerini tam sayi olarak girin.'
          );
        elsif v_num <= 0 then
          v_issues := v_issues || jsonb_build_object(
            'code', 'STEP_NO_NOT_POSITIVE', 'field', format('steps[%s].stepNo', v_step->>'stepNo'), 'severity', 'blocking',
            'message', format('stepNo must be > 0 (got %s)', v_num),
            'requiredChange', 'stepNo degerini 0''dan buyuk yapin.'
          );
        else
          v_step_nos := v_step_nos || v_num::integer;
        end if;
      end if;

      if v_step ? 'timerSeconds' and jsonb_typeof(v_step->'timerSeconds') is distinct from 'null' then
        if jsonb_typeof(v_step->'timerSeconds') is distinct from 'number' then
          v_issues := v_issues || jsonb_build_object(
            'code', 'STEP_TIMER_NOT_NUMBER', 'field', format('steps[%s].timerSeconds', v_step->>'stepNo'), 'severity', 'blocking',
            'message', 'timerSeconds must be a number', 'requiredChange', 'timerSeconds alanina sayisal bir deger girin.'
          );
        else
          v_num := (v_step->>'timerSeconds')::numeric;
          if v_num <> trunc(v_num) then
            v_issues := v_issues || jsonb_build_object(
              'code', 'STEP_TIMER_NOT_INTEGER', 'field', format('steps[%s].timerSeconds', v_step->>'stepNo'), 'severity', 'blocking',
              'message', format('timerSeconds must be a whole number (got %s)', v_num),
              'requiredChange', 'timerSeconds degerini tam sayi (saniye) olarak girin.'
            );
          elsif v_num <= 0 then
            v_issues := v_issues || jsonb_build_object(
              'code', 'STEP_TIMER_NOT_POSITIVE', 'field', format('steps[%s].timerSeconds', v_step->>'stepNo'), 'severity', 'blocking',
              'message', format('timerSeconds must be > 0 (got %s)', v_num),
              'requiredChange', 'timerSeconds degerini 0''dan buyuk yapin.'
            );
          end if;
        end if;
      end if;
    end loop;

    if array_length(v_step_nos, 1) = jsonb_array_length(v_steps) then
      select array_agg(n order by n) into v_step_nos from unnest(v_step_nos) as n;
      select array_agg(g) into v_expected from generate_series(1, jsonb_array_length(v_steps)) as g;
      if v_step_nos is distinct from v_expected then
        v_issues := v_issues || jsonb_build_object(
          'code', 'STEPS_NOT_SEQUENTIAL', 'field', 'steps', 'severity', 'blocking',
          'message', 'steps must have sequential stepNo starting at 1, with no gaps or duplicates',
          'requiredChange', 'Adimlari 1''den baslayarak, bosluksuz ve tekrarsiz sirala.'
        );
      end if;
    end if;
  end if;

  return jsonb_build_object(
    'valid', not exists (
      select 1 from jsonb_array_elements(v_issues) i where i->>'severity' = 'blocking'
    ),
    'issues', v_issues
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_update_recipe_allergens(p_recipe_id uuid, p_allergen_labels text[], p_reviewed boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.is_valid_recipe_allergen_labels(p_allergen_labels) then
    raise exception 'ADMIN_UPDATE_ALLERGENS_INVALID_LABELS: allergen_labels must be a duplicate-free subset of the controlled taxonomy';
  end if;

  update public.recipes
  set allergen_labels = p_allergen_labels,
      allergens_reviewed = p_reviewed,
      allergens_reviewed_at = case when p_reviewed then now() else allergens_reviewed_at end
  where id = p_recipe_id;

  if not found then
    raise exception 'ADMIN_UPDATE_ALLERGENS_NOT_FOUND: recipe % not found', p_recipe_id;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_update_recipe_facts(p_recipe_id uuid, p_required_equipment text[], p_diet_tags text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.is_valid_recipe_required_equipment(p_required_equipment) then
    raise exception 'ADMIN_UPDATE_FACTS_INVALID_EQUIPMENT: required_equipment must be a duplicate-free subset of the controlled equipment vocabulary';
  end if;

  if p_diet_tags is null or exists (
    select 1 from unnest(p_diet_tags) as v where v is null or btrim(v) = ''
  ) then
    raise exception 'ADMIN_UPDATE_FACTS_INVALID_DIET_TAGS: diet_tags must be a non-null array of non-empty strings';
  end if;
  if cardinality(p_diet_tags) <> (select count(distinct v) from unnest(p_diet_tags) as v) then
    raise exception 'ADMIN_UPDATE_FACTS_INVALID_DIET_TAGS: diet_tags must not contain duplicates';
  end if;

  update public.recipes
  set required_equipment = p_required_equipment,
      diet_tags = p_diet_tags
  where id = p_recipe_id;

  if not found then
    raise exception 'ADMIN_UPDATE_FACTS_NOT_FOUND: recipe % not found', p_recipe_id;
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.calculate_recipe_nutrition(p_recipe_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_servings numeric; v_total numeric := 0; v_matched numeric := 0;
  v_cal numeric := 0; v_pro numeric := 0; v_carb numeric := 0; v_fat numeric := 0; v_fiber numeric := 0;
  v_sodium numeric := 0; v_potassium numeric := 0; v_calcium numeric := 0; v_iron numeric := 0;
  v_vitc numeric := 0; v_vita numeric := 0; v_micro_complete boolean := true;
  v_unresolved boolean := false; v_grams numeric; v_coverage numeric; v_source text;
  v_versions text[] := '{}'; v_warnings text[] := '{}'; v_hash text; v_ref_version text; r record;
begin
  select servings into v_servings from public.recipes where id=p_recipe_id;
  if not found then raise exception 'calculate_recipe_nutrition: recipe % not found',p_recipe_id; end if;

  for r in
    select ri.id,ri.crop,ri.free_text_name,ri.quantity,ri.unit,ri.nutrition_food_key,ri.nutrition_exclusion_reason,
      coalesce(ri.nutrition_food_key,case when a.target_kind='food' then a.target_key end) food_key,
      coalesce(ri.crop,case when a.target_kind='crop' then a.target_key end) resolved_crop,
      coalesce(fr.calories_kcal,cn.calories_kcal) calories_kcal,
      coalesce(fr.protein_g,cn.protein_g) protein_g,coalesce(fr.carbs_g,cn.carbs_g) carbs_g,
      coalesce(fr.fat_g,cn.fat_g) fat_g,coalesce(fr.fiber_g,cn.fiber_g) fiber_g,
      coalesce(fr.sodium_mg,cn.sodium_mg) sodium_mg,coalesce(fr.potassium_mg,cn.potassium_mg) potassium_mg,
      coalesce(fr.calcium_mg,cn.calcium_mg) calcium_mg,coalesce(fr.iron_mg,cn.iron_mg) iron_mg,
      coalesce(fr.vitamin_c_mg,cn.vitamin_c_mg) vitamin_c_mg,
      coalesce(fr.vitamin_a_mcg_rae,cn.vitamin_a_mcg_rae) vitamin_a_mcg_rae,
      coalesce(fr.reference_version,cn.reference_version) reference_version
    from public.recipe_ingredients ri
    left join public.ingredient_nutrition_alias a on ri.crop is null and ri.nutrition_food_key is null
      and a.normalized_alias=public.fn_nutrition_normalize_text(ri.free_text_name)
    left join public.ingredient_nutrition_reference fr on fr.food_key=coalesce(ri.nutrition_food_key,case when a.target_kind='food' then a.target_key end)
    left join public.crop_nutrition cn on cn.crop=coalesce(ri.crop,case when a.target_kind='crop' then a.target_key end)
    where ri.recipe_id=p_recipe_id order by ri.sort_order,ri.id
  loop
    if r.nutrition_exclusion_reason is not null then
      v_warnings := array_append(v_warnings,'excluded_ingredient:'||r.nutrition_exclusion_reason);
      continue;
    end if;
    v_grams := public.fn_recipe_ingredient_grams_v2(r.resolved_crop,r.food_key,r.free_text_name,r.quantity,r.unit);
    if v_grams is null then v_unresolved:=true; continue; end if;
    v_total:=v_total+v_grams;
    if r.calories_kcal is null or r.protein_g is null or r.carbs_g is null or r.fat_g is null or r.fiber_g is null then
      v_unresolved:=true; continue;
    end if;
    v_matched:=v_matched+v_grams;
    v_cal:=v_cal+v_grams*r.calories_kcal/100; v_pro:=v_pro+v_grams*r.protein_g/100;
    v_carb:=v_carb+v_grams*r.carbs_g/100; v_fat:=v_fat+v_grams*r.fat_g/100;
    v_fiber:=v_fiber+v_grams*r.fiber_g/100;
    if r.sodium_mg is null or r.potassium_mg is null or r.calcium_mg is null or r.iron_mg is null
       or r.vitamin_c_mg is null or r.vitamin_a_mcg_rae is null then v_micro_complete:=false;
    else
      v_sodium:=v_sodium+v_grams*r.sodium_mg/100; v_potassium:=v_potassium+v_grams*r.potassium_mg/100;
      v_calcium:=v_calcium+v_grams*r.calcium_mg/100; v_iron:=v_iron+v_grams*r.iron_mg/100;
      v_vitc:=v_vitc+v_grams*r.vitamin_c_mg/100; v_vita:=v_vita+v_grams*r.vitamin_a_mcg_rae/100;
    end if;
    if r.reference_version is not null and not r.reference_version=any(v_versions) then v_versions:=v_versions||r.reference_version; end if;
  end loop;

  if v_unresolved then v_warnings:=array_append(v_warnings,'unmatched_ingredient'); end if;
  select array(select distinct x from unnest(v_warnings) x order by x) into v_warnings;
  if v_matched<=0 or v_servings is null or v_servings<=0 then
    update public.recipes set calories=null,protein_g=null,carbs_g=null,fat_g=null,fiber_g=null,micronutrients=null,
      nutrition_source=null,nutrition_coverage_pct=null,nutrition_calculated_at=null,nutrition_input_hash=null,
      nutrition_reference_version=null,nutrition_warnings=v_warnings where id=p_recipe_id; return;
  end if;
  v_coverage:=round(v_matched/nullif(v_total,0)*100,2);
  if v_unresolved then v_coverage:=least(v_coverage,99.99); end if;
  v_source:=case when not v_unresolved and v_coverage=100 then 'computed' else 'partial' end;
  v_ref_version:=array_to_string(v_versions,'+');
  select md5(p_recipe_id::text||'|t4-nutrition-v2|'||v_servings::text||'|'||coalesce(v_ref_version,'')||'|'||
    coalesce(string_agg(coalesce(ri.crop,'')||':'||coalesce(ri.free_text_name,'')||':'||coalesce(ri.nutrition_food_key,'')||':'||
      coalesce(ri.nutrition_exclusion_reason,'')||':'||coalesce(ri.quantity::text,'')||':'||coalesce(ri.unit,''),',' order by ri.sort_order,ri.id),''))
    into v_hash from public.recipe_ingredients ri where ri.recipe_id=p_recipe_id;
  update public.recipes set calories=round(v_cal/v_servings,2),protein_g=round(v_pro/v_servings,2),
    carbs_g=round(v_carb/v_servings,2),fat_g=round(v_fat/v_servings,2),fiber_g=round(v_fiber/v_servings,2),
    micronutrients=case when v_micro_complete then jsonb_build_object('schema_version',1,'basis','per_serving','values',jsonb_build_object(
      'sodium_mg',round(v_sodium/v_servings,2),'potassium_mg',round(v_potassium/v_servings,2),
      'calcium_mg',round(v_calcium/v_servings,2),'iron_mg',round(v_iron/v_servings,2),
      'vitamin_c_mg',round(v_vitc/v_servings,2),'vitamin_a_mcg_rae',round(v_vita/v_servings,2))) else null end,
    nutrition_source=v_source,nutrition_coverage_pct=v_coverage,nutrition_calculated_at=now(),nutrition_input_hash=v_hash,
    nutrition_reference_version=v_ref_version,nutrition_warnings=v_warnings where id=p_recipe_id;
end $function$;

CREATE OR REPLACE FUNCTION public.create_draft_listings_for_parcel(_farmer_id uuid, _parcel_id uuid, _crops text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  c text;
  seed_price numeric;
  summary jsonb;
  hasat jsonb;
BEGIN
  IF _crops IS NULL THEN RETURN; END IF;
  FOREACH c IN ARRAY _crops LOOP
    IF c IS NULL OR btrim(c) = '' THEN CONTINUE; END IF;
    IF EXISTS (
      SELECT 1 FROM public.listings
      WHERE farmer_id = _farmer_id AND parcel_id = _parcel_id AND crop = c
    ) THEN CONTINUE; END IF;

    seed_price := 0;
    BEGIN
      summary := public.get_price_history_summary(c);
      hasat := summary->'hasat_data';
      IF hasat IS NOT NULL
         AND COALESCE((hasat->>'insufficient_data')::boolean, true) = false THEN
        seed_price := COALESCE((hasat->>'avg_price')::numeric, 0);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      seed_price := 0;
    END;

    INSERT INTO public.listings
      (farmer_id, parcel_id, crop, quantity, unit, price_per_unit, min_order, quality, status)
    VALUES
      (_farmer_id, _parcel_id, c, 0, 'g', seed_price, 10, 'A', 'draft');
  END LOOP;
END $function$;

CREATE OR REPLACE FUNCTION public.enforce_offer_accept_turn()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  my_role text;
BEGIN
  -- Only guard transitions into 'accepted'
  IF NEW.status = 'accepted' AND OLD.status IS DISTINCT FROM 'accepted' THEN
    -- Skip enforcement for service_role / non-authenticated callers (admin paths)
    IF auth.uid() IS NULL THEN
      RETURN NEW;
    END IF;
    my_role := public.get_my_role_for_offer(OLD);
    IF my_role IS NULL THEN
      RAISE EXCEPTION 'Bu teklif size ait değil';
    END IF;
    IF COALESCE(OLD.ball_side, 'farmer') <> my_role THEN
      RAISE EXCEPTION 'Sırada karşı taraf var, teklifi kabul edemezsiniz';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_recalc_recipe_nutrition_ids(p_recipe_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_id uuid;
begin
  for v_id in
    select distinct x from unnest(p_recipe_ids) as x where x is not null
  loop
    begin
      perform public.calculate_recipe_nutrition(v_id);
    exception when others then
      raise warning 'f024t4b: nutrition recalc failed for recipe %: %', v_id, sqlerrm;
    end;
  end loop;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_recipe_ingredient_grams(p_crop text, p_quantity numeric, p_unit text)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$ select public.fn_recipe_ingredient_grams_v2(p_crop,null,null,p_quantity,p_unit) $function$;

CREATE OR REPLACE FUNCTION public.publish_recipe_draft(_job_id uuid, _lock_token text, _slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_job record;
  v_draft record;
  v_qa record;
  v_hero record;
  v_square record;
  v_admin_approved boolean;
  v_draft_json jsonb;
  v_structure jsonb;
  v_crop_values jsonb;
  v_recipe_id uuid;
  v_base_url text;
  v_cover_photo_url text;
  v_ingredient jsonb;
  v_step jsonb;
  v_ingredient_count integer;
  v_step_count integer;
  v_updated_job_id uuid;
  v_missing_assets text[];
begin
  select * into v_job from public.recipe_generation_jobs where id = _job_id for update;
  if not found then
    raise exception 'PUBLISH_JOB_NOT_FOUND: job % not found', _job_id;
  end if;

  if v_job.recipe_id is not null then
    return jsonb_build_object(
      'ok', true,
      'recipeId', v_job.recipe_id,
      'slug', (select slug from public.recipes where id = v_job.recipe_id),
      'alreadyPublished', true
    );
  end if;

  if v_job.locked_by is distinct from _lock_token or v_job.stage <> 'publish' or v_job.status <> 'running' then
    raise exception 'PUBLISH_LOCK_LOST: job % is not held at stage=publish/status=running under the expected lock token', _job_id;
  end if;

  if _slug is null or _slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'PUBLISH_SLUG_INVALID_FORMAT: slug "%" is not lowercase alphanumeric segments separated by single hyphens', _slug;
  end if;

  select * into v_draft
  from public.recipe_drafts
  where job_id = _job_id
  order by version desc
  limit 1;

  if not found then
    raise exception 'PUBLISH_NO_DRAFT: job % has no recipe_drafts row', _job_id;
  end if;

  select * into v_qa
  from public.recipe_qa_results
  where job_id = _job_id and draft_id = v_draft.id and draft_version = v_draft.version;

  if not found then
    raise exception 'PUBLISH_QA_RESULT_MISSING: no recipe_qa_results row for job %, draft %, version %', _job_id, v_draft.id, v_draft.version;
  end if;
  if v_qa.decision <> 'approved' or jsonb_array_length(v_qa.blocking_issues) > 0 then
    raise exception 'PUBLISH_QA_NOT_CLEAN: latest QA result for this exact draft version is not an approved, blocker-free decision';
  end if;

  select exists(
    select 1 from public.recipe_admin_reviews
    where job_id = _job_id and draft_id = v_draft.id and draft_version = v_draft.version and action = 'approve'
  ) into v_admin_approved;
  if not v_admin_approved then
    raise exception 'PUBLISH_SAFETY_CHECKLIST_INCOMPLETE: no recipe_admin_reviews approve row for job %, draft %, version %', _job_id, v_draft.id, v_draft.version;
  end if;

  select * into v_hero from public.recipe_assets
    where job_id = _job_id and draft_id = v_draft.id and asset_type = 'hero';
  select * into v_square from public.recipe_assets
    where job_id = _job_id and draft_id = v_draft.id and asset_type = 'square';
  if v_hero is null or v_square is null then
    v_missing_assets := array_remove(array[
      case when v_hero is null then 'hero' end,
      case when v_square is null then 'square' end
    ], null);
    raise exception 'PUBLISH_MISSING_ASSETS: job % is missing recipe_assets row(s): %', _job_id, array_to_string(v_missing_assets, ', ');
  end if;

  v_draft_json := jsonb_build_object(
    'title', v_draft.title,
    'servings', v_draft.servings,
    'prepMinutes', v_draft.prep_minutes,
    'cookMinutes', v_draft.cook_minutes,
    'restMinutes', v_draft.rest_minutes,
    'difficulty', v_draft.difficulty,
    'ingredients', v_draft.ingredients,
    'steps', v_draft.steps
  );
  v_structure := public.validate_recipe_structure(v_draft_json);
  if not (v_structure->>'valid')::boolean then
    raise exception 'PUBLISH_VALIDATION_FAILED: draft failed validate_recipe_structure: %', v_structure->'issues';
  end if;
  v_crop_values := public.validate_recipe_crop_values(v_draft_json);
  if not (v_crop_values->>'valid')::boolean then
    raise exception 'PUBLISH_VALIDATION_FAILED: draft failed validate_recipe_crop_values: %', v_crop_values->'issues';
  end if;

  begin
    insert into public.recipes (
      slug, title, description, cover_photo_url, servings, prep_minutes, cook_minutes, rest_minutes,
      difficulty, cuisine, diet_tags, status, visibility, source_type, owner_id, author_type,
      extraction_confidence, allergen_labels, required_equipment
    ) values (
      _slug, v_draft.title, v_draft.description, null, v_draft.servings, v_draft.prep_minutes,
      v_draft.cook_minutes, v_draft.rest_minutes, v_draft.difficulty, v_draft.cuisine, v_draft.diet_tags,
      'draft', v_draft.visibility, v_draft.source_type, v_draft.owner_id, v_draft.author_type,
      v_draft.extraction_confidence, v_draft.allergen_labels, v_draft.required_equipment
    )
    returning id into v_recipe_id;
  exception when unique_violation then
    raise exception 'PUBLISH_SLUG_ALREADY_USED: slug "%" is already used by an existing recipe', _slug;
  end;

  v_ingredient_count := 0;
  for v_ingredient in select * from jsonb_array_elements(v_draft.ingredients)
  loop
    insert into public.recipe_ingredients (
      recipe_id, crop, free_text_name, quantity, unit, note, is_key_ingredient, ingredient_class, sort_order
    ) values (
      v_recipe_id,
      nullif(v_ingredient->>'crop', ''),
      nullif(v_ingredient->>'freeTextName', ''),
      (v_ingredient->>'quantity')::numeric,
      v_ingredient->>'unit',
      v_ingredient->>'note',
      coalesce((v_ingredient->>'isKeyIngredient')::boolean, false),
      nullif(v_ingredient->>'ingredientClass', ''),
      coalesce((v_ingredient->>'sortOrder')::integer, 0)
    );
    v_ingredient_count := v_ingredient_count + 1;
  end loop;

  v_step_count := 0;
  for v_step in select * from jsonb_array_elements(v_draft.steps)
  loop
    insert into public.recipe_steps (recipe_id, step_no, instruction, photo_url, timer_seconds)
    values (
      v_recipe_id,
      (v_step->>'stepNo')::integer,
      v_step->>'instruction',
      nullif(v_step->>'photoUrl', ''),
      nullif(v_step->>'timerSeconds', '')::integer
    );
    v_step_count := v_step_count + 1;
  end loop;

  v_base_url := coalesce(current_setting('app.supabase_url', true), 'https://efuqpiaavrzimvstpdpm.supabase.co');
  v_cover_photo_url := v_base_url || '/storage/v1/object/public/' || v_hero.storage_bucket || '/' || v_hero.storage_path;
  update public.recipes set cover_photo_url = v_cover_photo_url where id = v_recipe_id;
  update public.recipe_assets set recipe_id = v_recipe_id where job_id = _job_id and draft_id = v_draft.id;

  if (select count(*) from public.recipe_ingredients where recipe_id = v_recipe_id) <> v_ingredient_count then
    raise exception 'PUBLISH_FINAL_VALIDATION_FAILED: ingredient row count mismatch for recipe %', v_recipe_id;
  end if;
  if (select count(*) from public.recipe_steps where recipe_id = v_recipe_id) <> v_step_count then
    raise exception 'PUBLISH_FINAL_VALIDATION_FAILED: step row count mismatch for recipe %', v_recipe_id;
  end if;

  update public.recipes set status = 'published' where id = v_recipe_id;

  update public.recipe_generation_jobs
  set recipe_id = v_recipe_id,
      status = 'completed',
      completed_at = now(),
      started_at = coalesce(started_at, now()),
      finished_at = now(),
      locked_by = null,
      locked_at = null,
      lock_expires_at = null
  where id = _job_id and locked_by = _lock_token and stage = 'publish' and status = 'running'
  returning id into v_updated_job_id;

  if v_updated_job_id is null then
    raise exception 'PUBLISH_LOCK_LOST_AT_COMMIT: lock was lost while publishing job %', _job_id;
  end if;

  return jsonb_build_object('ok', true, 'recipeId', v_recipe_id, 'slug', _slug, 'alreadyPublished', false);
end;
$function$;

CREATE OR REPLACE FUNCTION public.tg_finalize_recipe_facts_on_publish_job()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_reviewed_at timestamptz;
  v_recipe record;
begin
  select ar.created_at
  into v_reviewed_at
  from (
    select id, version
    from public.recipe_drafts
    where job_id = new.id
    order by version desc
    limit 1
  ) as d
  join public.recipe_admin_reviews as ar
    on ar.job_id = new.id
   and ar.draft_id = d.id
   and ar.draft_version = d.version
   and ar.action = 'approve'
  order by ar.created_at desc
  limit 1;

  if v_reviewed_at is null then
    raise exception 'PUBLISH_ALLERGEN_REVIEW_MISSING: no exact approved human review for job %', new.id;
  end if;

  select id, allergen_labels
  into v_recipe
  from public.recipes
  where id = new.recipe_id;

  if not found or v_recipe.allergen_labels is null then
    raise exception 'PUBLISH_ALLERGEN_LABELS_MISSING: recipe % has no controlled allergen assessment', new.recipe_id;
  end if;

  if not public.is_valid_recipe_allergen_labels(v_recipe.allergen_labels) then
    raise exception 'PUBLISH_ALLERGEN_LABELS_INVALID: recipe % has invalid or duplicate allergen labels', new.recipe_id;
  end if;

  update public.recipes
  set allergens_reviewed = true,
      allergens_reviewed_at = v_reviewed_at,
      allergens_reviewed_by = null
  where id = new.recipe_id;

  perform public.calculate_recipe_nutrition(new.recipe_id);

  select *
  into v_recipe
  from public.recipes
  where id = new.recipe_id;

  if v_recipe.nutrition_source is distinct from 'computed'
     or v_recipe.nutrition_coverage_pct is distinct from 100
     or v_recipe.calories is null
     or v_recipe.protein_g is null
     or v_recipe.carbs_g is null
     or v_recipe.fat_g is null
     or v_recipe.nutrition_calculated_at is null
     or v_recipe.nutrition_input_hash is null
     or v_recipe.nutrition_reference_version is null then
    raise exception 'PUBLISH_NUTRITION_INCOMPLETE: recipe % did not reach computed/100 nutrition coverage', new.recipe_id;
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.tg_parcels_after_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.create_draft_listings_for_parcel(NEW.farmer_id, NEW.id, NEW.crops);
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.tg_parcels_after_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE added text[];
BEGIN
  IF NEW.crops IS DISTINCT FROM OLD.crops THEN
    SELECT ARRAY(
      SELECT unnest(COALESCE(NEW.crops, ARRAY[]::text[]))
      EXCEPT
      SELECT unnest(COALESCE(OLD.crops, ARRAY[]::text[]))
    ) INTO added;
    PERFORM public.create_draft_listings_for_parcel(NEW.farmer_id, NEW.id, added);
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.tg_recipe_ingredients_recalc_nutrition_del()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform public.fn_recalc_recipe_nutrition_ids(array(select recipe_id from old_rows));
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.tg_recipe_ingredients_recalc_nutrition_ins()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform public.fn_recalc_recipe_nutrition_ids(array(select recipe_id from new_rows));
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.tg_recipe_ingredients_recalc_nutrition_upd()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform public.fn_recalc_recipe_nutrition_ids(array(
    select recipe_id from new_rows
    union
    select recipe_id from old_rows
  ));
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.tg_recipes_servings_recalc_nutrition()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform public.fn_recalc_recipe_nutrition_ids(array[new.id]);
  return null;
end;
$function$;

-- ============================== FUNCTIONS (private) ==============================
CREATE OR REPLACE FUNCTION private.dispatch_admin_sms_event(p_event_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  _secret text;
  _timestamp text;
  _body jsonb;
  _signature text;
begin
  select decrypted_secret
    into _secret
    from vault.decrypted_secrets
    where name = 'notify_admin_ingress_hmac'
    order by created_at desc
    limit 1;

  if _secret is null or octet_length(_secret) < 32 then
    raise log 'notify-admin dispatch skipped: Vault HMAC secret is not configured';
    return;
  end if;

  _timestamp := floor(extract(epoch from clock_timestamp()))::bigint::text;
  _body := jsonb_build_object('eventId', p_event_id::text);
  _signature := encode(
    extensions.hmac(_timestamp || '.' || _body::text, _secret, 'sha256'),
    'hex'
  );

  perform net.http_post(
    url := 'https://efuqpiaavrzimvstpdpm.supabase.co/functions/v1/notify-admin',
    body := _body,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Hasat-Timestamp', _timestamp,
      'X-Hasat-Signature', _signature
    ),
    timeout_milliseconds := 5000
  );
exception when others then
  raise log 'notify-admin dispatch failed [%]', sqlstate;
end;
$function$;

CREATE OR REPLACE FUNCTION private.notify_crop_request_catalog_gap()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  _event_id uuid;
  _note text;
begin
  if exists (
    select 1
      from public.crop_config as cc
      where lower(btrim(cc.crop)) = lower(btrim(new.crop_name_free_text))
         or lower(btrim(cc.display_name)) = lower(btrim(new.crop_name_free_text))
  ) then
    return new;
  end if;

  _note := left(btrim(coalesce(new.note, '')), 80);

  insert into private.admin_sms_outbox (event_key, event_type, payload)
  values (
    'crop_request_catalog_gap:' || new.id::text,
    'crop_request.catalog_gap.created',
    jsonb_strip_nulls(jsonb_build_object(
      'sourceId', new.id::text,
      'cropName', left(btrim(new.crop_name_free_text), 100),
      'note', nullif(_note, '')
    ))
  )
  on conflict (event_key) do nothing
  returning id into _event_id;

  if _event_id is not null then
    perform private.dispatch_admin_sms_event(_event_id);
  end if;

  return new;
exception when others then
  raise log 'notify_crop_request_catalog_gap failed [%]', sqlstate;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.notify_new_crop_type_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  _event_id uuid;
  _requester_name text;
  _note text;
begin
  select left(btrim(name), 80)
    into _requester_name
    from public.profiles
    where id = new.requested_by;

  _note := left(btrim(coalesce(nullif(new.note, ''), nullif(new.lifecycle_notes, ''), '')), 80);

  insert into private.admin_sms_outbox (event_key, event_type, payload)
  values (
    'crop_type_request:' || new.id::text,
    'crop_type_request.created',
    jsonb_strip_nulls(jsonb_build_object(
      'sourceId', new.id::text,
      'cropName', left(btrim(new.crop_name), 100),
      'unit', nullif(left(btrim(new.suggested_default_unit), 20), ''),
      'category', nullif(left(btrim(new.suggested_category_group), 40), ''),
      'harvestStartMonth', new.suggested_harvest_window_start_month,
      'harvestEndMonth', new.suggested_harvest_window_end_month,
      'requesterName', coalesce(nullif(_requester_name, ''), 'bir çiftçi'),
      'note', nullif(_note, '')
    ))
  )
  on conflict (event_key) do nothing
  returning id into _event_id;

  if _event_id is not null then
    perform private.dispatch_admin_sms_event(_event_id);
  end if;

  return new;
exception when others then
  raise log 'notify_new_crop_type_request failed [%]', sqlstate;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.retry_admin_sms_events()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  _event_id uuid;
begin
  for _event_id in
    select id
      from private.admin_sms_outbox
      where status in ('pending', 'failed')
        and attempt_count < 3
        and next_attempt_at <= clock_timestamp()
      order by next_attempt_at, created_at
      limit 5
  loop
    perform private.dispatch_admin_sms_event(_event_id);
  end loop;
end;
$function$;


-- ============================== PRIMARY KEY CONSTRAINTS ==============================
ALTER TABLE ONLY public.ai_chat_messages ADD CONSTRAINT ai_chat_messages_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.ai_customize_requests ADD CONSTRAINT ai_customize_requests_pkey PRIMARY KEY (idempotency_key);
ALTER TABLE ONLY public.ai_usage_tracking ADD CONSTRAINT ai_usage_tracking_pkey PRIMARY KEY (user_id, month);
ALTER TABLE ONLY public.buyer_addresses ADD CONSTRAINT buyer_addresses_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.buyer_profiles ADD CONSTRAINT buyer_profiles_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.certifications ADD CONSTRAINT certifications_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.community_post_likes ADD CONSTRAINT community_post_likes_pkey PRIMARY KEY (post_id, user_id);
ALTER TABLE ONLY public.community_posts ADD CONSTRAINT community_posts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.crop_config ADD CONSTRAINT crop_config_pkey PRIMARY KEY (crop);
ALTER TABLE ONLY public.crop_culinary_meta ADD CONSTRAINT crop_culinary_meta_pkey PRIMARY KEY (crop);
ALTER TABLE ONLY public.crop_journal_glossary ADD CONSTRAINT crop_journal_glossary_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.crop_market_sources ADD CONSTRAINT crop_market_sources_pkey PRIMARY KEY (crop, source_code);
ALTER TABLE ONLY public.crop_nutrition ADD CONSTRAINT crop_nutrition_pkey PRIMARY KEY (crop);
ALTER TABLE ONLY public.crop_requests ADD CONSTRAINT crop_requests_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.crop_type_requests ADD CONSTRAINT crop_type_requests_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.device_tokens ADD CONSTRAINT device_tokens_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.disputes ADD CONSTRAINT disputes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.farmer_journal_prefs ADD CONSTRAINT farmer_journal_prefs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.farms ADD CONSTRAINT farms_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.harvest_entries ADD CONSTRAINT harvest_entries_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.harvest_subscriptions ADD CONSTRAINT harvest_subscriptions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.indoor_interest_leads ADD CONSTRAINT indoor_interest_leads_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.ingredient_measure_reference ADD CONSTRAINT ingredient_measure_reference_pkey PRIMARY KEY (target_kind, target_key, normalized_unit);
ALTER TABLE ONLY public.ingredient_nutrition_alias ADD CONSTRAINT ingredient_nutrition_alias_pkey PRIMARY KEY (normalized_alias);
ALTER TABLE ONLY public.ingredient_nutrition_reference ADD CONSTRAINT ingredient_nutrition_reference_pkey PRIMARY KEY (food_key);
ALTER TABLE ONLY public.journal_entry_types ADD CONSTRAINT journal_entry_types_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.journal_themes ADD CONSTRAINT journal_themes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.listing_harvest_entries ADD CONSTRAINT listing_harvest_entries_pkey PRIMARY KEY (listing_id, harvest_entry_id);
ALTER TABLE ONLY public.listings ADD CONSTRAINT listings_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.market_sources ADD CONSTRAINT market_sources_pkey PRIMARY KEY (code);
ALTER TABLE ONLY public.mcp_tool_calls ADD CONSTRAINT mcp_tool_calls_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.mobile_handoff_nonces ADD CONSTRAINT mobile_handoff_nonces_pkey PRIMARY KEY (nonce);
ALTER TABLE ONLY public.notif_prefs ADD CONSTRAINT notif_prefs_pkey PRIMARY KEY (user_id);
ALTER TABLE ONLY public.notifications ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.offer_items ADD CONSTRAINT offer_items_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.offer_messages ADD CONSTRAINT offer_messages_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.offers ADD CONSTRAINT offers_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.order_timeline ADD CONSTRAINT order_timeline_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.orders ADD CONSTRAINT orders_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.parcels ADD CONSTRAINT parcels_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.price_alerts ADD CONSTRAINT price_alerts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.price_history ADD CONSTRAINT price_history_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.price_points ADD CONSTRAINT price_points_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.recipe_admin_reviews ADD CONSTRAINT recipe_admin_reviews_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.recipe_assets ADD CONSTRAINT recipe_assets_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.recipe_drafts ADD CONSTRAINT recipe_drafts_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.recipe_generation_batches ADD CONSTRAINT recipe_generation_batches_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.recipe_generation_jobs ADD CONSTRAINT recipe_generation_jobs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.recipe_generation_stage_runs ADD CONSTRAINT recipe_generation_stage_runs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.recipe_ingredient_nutrition_backfill_audit ADD CONSTRAINT recipe_ingredient_nutrition_backfill_audit_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.recipe_ingredients ADD CONSTRAINT recipe_ingredients_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.recipe_plan_briefs ADD CONSTRAINT recipe_plan_briefs_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.recipe_qa_results ADD CONSTRAINT recipe_qa_results_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.recipe_rfq_links ADD CONSTRAINT recipe_rfq_links_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.recipe_saves ADD CONSTRAINT recipe_saves_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.recipe_steps ADD CONSTRAINT recipe_steps_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.recipe_views ADD CONSTRAINT recipe_views_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.recipes ADD CONSTRAINT recipes_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.referral_qualifications ADD CONSTRAINT referral_qualifications_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.reviews ADD CONSTRAINT reviews_pkey PRIMARY KEY (id);

-- ============================== UNIQUE CONSTRAINTS ==============================
ALTER TABLE ONLY public.certifications ADD CONSTRAINT certifications_farmer_id_type_key UNIQUE (farmer_id, type);
ALTER TABLE ONLY public.crop_journal_glossary ADD CONSTRAINT crop_journal_glossary_crop_term_key UNIQUE (crop, term);
ALTER TABLE ONLY public.device_tokens ADD CONSTRAINT device_tokens_token_key UNIQUE (token);
ALTER TABLE ONLY public.farmer_journal_prefs ADD CONSTRAINT farmer_journal_prefs_farmer_id_entry_type_id_key UNIQUE (farmer_id, entry_type_id);
ALTER TABLE ONLY public.orders ADD CONSTRAINT orders_order_ref_key UNIQUE (order_ref);
ALTER TABLE ONLY public.profiles ADD CONSTRAINT profiles_referral_code_key UNIQUE (referral_code);
ALTER TABLE ONLY public.profiles ADD CONSTRAINT profiles_phone_unique UNIQUE (phone);
ALTER TABLE ONLY public.recipe_drafts ADD CONSTRAINT recipe_drafts_job_id_id_version_key UNIQUE (job_id, id, version);
ALTER TABLE ONLY public.recipe_drafts ADD CONSTRAINT recipe_drafts_job_id_id_key UNIQUE (job_id, id);
ALTER TABLE ONLY public.recipe_drafts ADD CONSTRAINT recipe_drafts_job_id_version_key UNIQUE (job_id, version);
ALTER TABLE ONLY public.recipe_generation_jobs ADD CONSTRAINT recipe_generation_jobs_batch_id_brief_id_key UNIQUE (batch_id, brief_id);
ALTER TABLE ONLY public.recipe_generation_jobs ADD CONSTRAINT recipe_generation_jobs_recipe_id_key UNIQUE (recipe_id);
ALTER TABLE ONLY public.recipe_generation_jobs ADD CONSTRAINT recipe_generation_jobs_id_batch_id_key UNIQUE (id, batch_id);
ALTER TABLE ONLY public.recipe_generation_stage_runs ADD CONSTRAINT recipe_generation_stage_runs_job_stage_attempt_key UNIQUE (job_id, stage, attempt);
ALTER TABLE ONLY public.recipe_ingredient_nutrition_backfill_audit ADD CONSTRAINT recipe_ingredient_nutrition_bac_migration_key_ingredient_id_key UNIQUE (migration_key, ingredient_id);
ALTER TABLE ONLY public.recipe_plan_briefs ADD CONSTRAINT recipe_plan_briefs_job_id_key UNIQUE (job_id);
ALTER TABLE ONLY public.recipe_plan_briefs ADD CONSTRAINT recipe_plan_briefs_batch_brief_key UNIQUE (batch_id, brief_id);
ALTER TABLE ONLY public.recipe_qa_results ADD CONSTRAINT recipe_qa_results_job_draft_version_key UNIQUE (job_id, draft_id, draft_version);
ALTER TABLE ONLY public.recipe_rfq_links ADD CONSTRAINT recipe_rfq_links_recipe_request_key UNIQUE (recipe_id, crop_request_id);
ALTER TABLE ONLY public.recipe_saves ADD CONSTRAINT recipe_saves_user_recipe_key UNIQUE (user_id, recipe_id);
ALTER TABLE ONLY public.referral_qualifications ADD CONSTRAINT referral_qualifications_referred_user_id_key UNIQUE (referred_user_id);
ALTER TABLE ONLY public.reviews ADD CONSTRAINT reviews_order_id_reviewer_id_key UNIQUE (order_id, reviewer_id);

-- ============================== CHECK CONSTRAINTS ==============================
ALTER TABLE ONLY public.ai_chat_messages ADD CONSTRAINT ai_chat_messages_role_check CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text, 'system'::text])));
ALTER TABLE ONLY public.ai_chat_messages ADD CONSTRAINT ai_chat_messages_source_check CHECK ((source = ANY (ARRAY['in_app'::text, 'whatsapp'::text])));
ALTER TABLE ONLY public.ai_customize_requests ADD CONSTRAINT ai_customize_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'completed'::text, 'failed'::text])));
ALTER TABLE ONLY public.ai_usage_tracking ADD CONSTRAINT ai_usage_tracking_message_count_check CHECK ((message_count >= 0));
ALTER TABLE ONLY public.ai_usage_tracking ADD CONSTRAINT ai_usage_tracking_month_check CHECK ((month ~ '^\d{4}-\d{2}$'::text));
ALTER TABLE ONLY public.crop_config ADD CONSTRAINT crop_config_price_window_type_check CHECK ((price_window_type = ANY (ARRAY['rolling_30d'::text, 'rolling_365d'::text])));
ALTER TABLE ONLY public.crop_nutrition ADD CONSTRAINT crop_nutrition_basis_check CHECK ((basis = 'per_100g'::text));
ALTER TABLE ONLY public.crop_nutrition ADD CONSTRAINT crop_nutrition_calcium_mg_check CHECK (((calcium_mg IS NULL) OR (calcium_mg >= (0)::numeric)));
ALTER TABLE ONLY public.crop_nutrition ADD CONSTRAINT crop_nutrition_calories_kcal_check CHECK (((calories_kcal IS NULL) OR (calories_kcal >= (0)::numeric)));
ALTER TABLE ONLY public.crop_nutrition ADD CONSTRAINT crop_nutrition_carbs_g_check CHECK (((carbs_g IS NULL) OR (carbs_g >= (0)::numeric)));
ALTER TABLE ONLY public.crop_nutrition ADD CONSTRAINT crop_nutrition_fat_g_check CHECK (((fat_g IS NULL) OR (fat_g >= (0)::numeric)));
ALTER TABLE ONLY public.crop_nutrition ADD CONSTRAINT crop_nutrition_fiber_g_check CHECK (((fiber_g IS NULL) OR (fiber_g >= (0)::numeric)));
ALTER TABLE ONLY public.crop_nutrition ADD CONSTRAINT crop_nutrition_iron_mg_check CHECK (((iron_mg IS NULL) OR (iron_mg >= (0)::numeric)));
ALTER TABLE ONLY public.crop_nutrition ADD CONSTRAINT crop_nutrition_notes_check CHECK (((notes IS NULL) OR (char_length(notes) <= 2000)));
ALTER TABLE ONLY public.crop_nutrition ADD CONSTRAINT crop_nutrition_potassium_mg_check CHECK (((potassium_mg IS NULL) OR (potassium_mg >= (0)::numeric)));
ALTER TABLE ONLY public.crop_nutrition ADD CONSTRAINT crop_nutrition_protein_g_check CHECK (((protein_g IS NULL) OR (protein_g >= (0)::numeric)));
ALTER TABLE ONLY public.crop_nutrition ADD CONSTRAINT crop_nutrition_reference_source_check CHECK ((reference_source = ANY (ARRAY['tuber'::text, 'usda'::text])));
ALTER TABLE ONLY public.crop_nutrition ADD CONSTRAINT crop_nutrition_reference_source_id_check CHECK (((reference_source_id IS NULL) OR (char_length(reference_source_id) <= 200)));
ALTER TABLE ONLY public.crop_nutrition ADD CONSTRAINT crop_nutrition_reference_version_check CHECK ((char_length(reference_version) > 0));
ALTER TABLE ONLY public.crop_nutrition ADD CONSTRAINT crop_nutrition_sodium_mg_check CHECK (((sodium_mg IS NULL) OR (sodium_mg >= (0)::numeric)));
ALTER TABLE ONLY public.crop_nutrition ADD CONSTRAINT crop_nutrition_vitamin_a_mcg_rae_check CHECK (((vitamin_a_mcg_rae IS NULL) OR (vitamin_a_mcg_rae >= (0)::numeric)));
ALTER TABLE ONLY public.crop_nutrition ADD CONSTRAINT crop_nutrition_vitamin_c_mg_check CHECK (((vitamin_c_mg IS NULL) OR (vitamin_c_mg >= (0)::numeric)));
ALTER TABLE ONLY public.crop_requests ADD CONSTRAINT crop_requests_crop_name_free_text_check CHECK (((char_length(btrim(crop_name_free_text)) >= 1) AND (char_length(btrim(crop_name_free_text)) <= 100)));
ALTER TABLE ONLY public.crop_requests ADD CONSTRAINT crop_requests_ingredient_class_check CHECK ((ingredient_class = ANY (ARRAY['tarimsal'::text, 'platform_disi'::text])));
ALTER TABLE ONLY public.crop_requests ADD CONSTRAINT crop_requests_note_check CHECK (((note IS NULL) OR (char_length(note) <= 500)));
ALTER TABLE ONLY public.crop_requests ADD CONSTRAINT crop_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'added'::text, 'rejected'::text])));
ALTER TABLE ONLY public.crop_type_requests ADD CONSTRAINT crop_type_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'reviewed'::text, 'added'::text, 'rejected'::text])));
ALTER TABLE ONLY public.device_tokens ADD CONSTRAINT device_tokens_platform_check CHECK ((platform = ANY (ARRAY['ios'::text, 'android'::text])));
ALTER TABLE ONLY public.disputes ADD CONSTRAINT disputes_status_check CHECK ((status = ANY (ARRAY['open'::text, 'resolved'::text])));
ALTER TABLE ONLY public.indoor_interest_leads ADD CONSTRAINT indoor_interest_leads_interest_type_check CHECK ((interest_type = ANY (ARRAY['danışmanlık'::text, 'ortaklık'::text, 'diğer'::text])));
ALTER TABLE ONLY public.ingredient_measure_reference ADD CONSTRAINT ingredient_measure_reference_grams_per_unit_check CHECK ((grams_per_unit > (0)::numeric));
ALTER TABLE ONLY public.ingredient_measure_reference ADD CONSTRAINT ingredient_measure_reference_normalized_unit_check CHECK ((normalized_unit = fn_nutrition_normalize_text(normalized_unit)));
ALTER TABLE ONLY public.ingredient_measure_reference ADD CONSTRAINT ingredient_measure_reference_target_kind_check CHECK ((target_kind = ANY (ARRAY['food'::text, 'crop'::text])));
ALTER TABLE ONLY public.ingredient_nutrition_alias ADD CONSTRAINT ingredient_nutrition_alias_normalized_alias_check CHECK ((normalized_alias = fn_nutrition_normalize_text(normalized_alias)));
ALTER TABLE ONLY public.ingredient_nutrition_alias ADD CONSTRAINT ingredient_nutrition_alias_target_kind_check CHECK ((target_kind = ANY (ARRAY['food'::text, 'crop'::text])));
ALTER TABLE ONLY public.journal_entry_types ADD CONSTRAINT journal_entry_types_preset_farmer_chk CHECK (((is_preset AND (farmer_id IS NULL)) OR ((NOT is_preset) AND (farmer_id IS NOT NULL))));
ALTER TABLE ONLY public.journal_entry_types ADD CONSTRAINT journal_entry_types_work_type_key_check CHECK ((work_type_key = ANY (ARRAY['sulama'::text, 'gubreleme'::text, 'dikim'::text, 'budama'::text, 'ilaclama'::text, 'hasat'::text, 'kurutma'::text, 'distilasyon'::text, 'gozlem'::text])));
ALTER TABLE ONLY public.offer_items ADD CONSTRAINT offer_items_price_per_unit_check CHECK ((price_per_unit >= (0)::numeric));
ALTER TABLE ONLY public.offer_items ADD CONSTRAINT offer_items_quantity_check CHECK ((quantity > (0)::numeric));
ALTER TABLE ONLY public.offer_messages ADD CONSTRAINT offer_messages_sender_role_check CHECK ((sender_role = ANY (ARRAY['farmer'::text, 'buyer'::text])));
ALTER TABLE ONLY public.offers ADD CONSTRAINT offers_ball_side_check CHECK ((ball_side = ANY (ARRAY['farmer'::text, 'buyer'::text])));
ALTER TABLE ONLY public.offers ADD CONSTRAINT offers_payment_status_check CHECK ((payment_status = ANY (ARRAY['unpaid'::text, 'pending'::text, 'pending_transfer'::text, 'paid'::text])));
ALTER TABLE ONLY public.parcels ADD CONSTRAINT parcels_production_method_check CHECK ((production_method = ANY (ARRAY['indoor'::text, 'outdoor'::text])));
ALTER TABLE ONLY public.price_history ADD CONSTRAINT price_history_price_per_unit_check CHECK ((price_per_unit > (0)::numeric));
ALTER TABLE ONLY public.price_history ADD CONSTRAINT price_history_source_check CHECK ((source = ANY (ARRAY['order'::text, 'hks'::text, 'external'::text])));
ALTER TABLE ONLY public.recipe_admin_reviews ADD CONSTRAINT recipe_admin_reviews_action_check CHECK ((action = ANY (ARRAY['approve'::text, 'reject'::text, 'request_revision'::text, 'retry_stage'::text])));
ALTER TABLE ONLY public.recipe_admin_reviews ADD CONSTRAINT recipe_admin_reviews_admin_actor_check CHECK (((admin_actor IS NULL) OR (char_length(admin_actor) <= 200)));
ALTER TABLE ONLY public.recipe_admin_reviews ADD CONSTRAINT recipe_admin_reviews_check CHECK (((action <> 'approve'::text) OR (temperature_reviewed AND timing_reviewed AND allergens_reviewed AND content_reviewed AND images_reviewed)));
ALTER TABLE ONLY public.recipe_admin_reviews ADD CONSTRAINT recipe_admin_reviews_draft_version_check CHECK (((draft_version IS NULL) OR (draft_version > 0)));
ALTER TABLE ONLY public.recipe_admin_reviews ADD CONSTRAINT recipe_admin_reviews_from_stage_check CHECK ((from_stage = ANY (ARRAY['plan'::text, 'write'::text, 'qa'::text, 'revise'::text, 'image'::text, 'finalize'::text, 'awaiting_approval'::text, 'publish'::text])));
ALTER TABLE ONLY public.recipe_admin_reviews ADD CONSTRAINT recipe_admin_reviews_from_status_check CHECK ((from_status = ANY (ARRAY['queued'::text, 'running'::text, 'retryable'::text, 'failed'::text, 'awaiting_approval'::text, 'approved'::text, 'rejected'::text, 'completed'::text, 'cancelled'::text])));
ALTER TABLE ONLY public.recipe_admin_reviews ADD CONSTRAINT recipe_admin_reviews_notes_check CHECK (((notes IS NULL) OR (char_length(notes) <= 4000)));
ALTER TABLE ONLY public.recipe_admin_reviews ADD CONSTRAINT recipe_admin_reviews_to_stage_check CHECK ((to_stage = ANY (ARRAY['plan'::text, 'write'::text, 'qa'::text, 'revise'::text, 'image'::text, 'finalize'::text, 'awaiting_approval'::text, 'publish'::text])));
ALTER TABLE ONLY public.recipe_admin_reviews ADD CONSTRAINT recipe_admin_reviews_to_status_check CHECK ((to_status = ANY (ARRAY['queued'::text, 'running'::text, 'retryable'::text, 'failed'::text, 'awaiting_approval'::text, 'approved'::text, 'rejected'::text, 'completed'::text, 'cancelled'::text])));
ALTER TABLE ONLY public.recipe_assets ADD CONSTRAINT recipe_assets_asset_type_check CHECK ((asset_type = ANY (ARRAY['source'::text, 'hero'::text, 'square'::text, 'step'::text])));
ALTER TABLE ONLY public.recipe_assets ADD CONSTRAINT recipe_assets_check CHECK (((asset_type = 'step'::text) = (step_no IS NOT NULL)));
ALTER TABLE ONLY public.recipe_assets ADD CONSTRAINT recipe_assets_height_px_check CHECK (((height_px IS NULL) OR (height_px > 0)));
ALTER TABLE ONLY public.recipe_assets ADD CONSTRAINT recipe_assets_processing_params_check CHECK (((processing_params IS NULL) OR (jsonb_typeof(processing_params) = 'object'::text)));
ALTER TABLE ONLY public.recipe_assets ADD CONSTRAINT recipe_assets_quality_check CHECK (((quality IS NULL) OR ((quality >= 1) AND (quality <= 100))));
ALTER TABLE ONLY public.recipe_assets ADD CONSTRAINT recipe_assets_source_height_px_check CHECK (((source_height_px IS NULL) OR (source_height_px > 0)));
ALTER TABLE ONLY public.recipe_assets ADD CONSTRAINT recipe_assets_source_width_px_check CHECK (((source_width_px IS NULL) OR (source_width_px > 0)));
ALTER TABLE ONLY public.recipe_assets ADD CONSTRAINT recipe_assets_step_no_check CHECK (((step_no IS NULL) OR (step_no > 0)));
ALTER TABLE ONLY public.recipe_assets ADD CONSTRAINT recipe_assets_storage_bucket_check CHECK ((storage_bucket = 'crop-photos'::text));
ALTER TABLE ONLY public.recipe_assets ADD CONSTRAINT recipe_assets_validation_results_check CHECK (((validation_results IS NULL) OR (jsonb_typeof(validation_results) = 'object'::text)));
ALTER TABLE ONLY public.recipe_assets ADD CONSTRAINT recipe_assets_validation_status_check CHECK (((validation_status IS NULL) OR (validation_status = ANY (ARRAY['pending'::text, 'passed'::text, 'failed'::text, 'warning'::text]))));
ALTER TABLE ONLY public.recipe_assets ADD CONSTRAINT recipe_assets_width_px_check CHECK (((width_px IS NULL) OR (width_px > 0)));
ALTER TABLE ONLY public.recipe_drafts ADD CONSTRAINT recipe_drafts_author_type_check CHECK ((author_type = ANY (ARRAY['hasat'::text, 'ciftci'::text, 'sef'::text, 'kullanici'::text])));
ALTER TABLE ONLY public.recipe_drafts ADD CONSTRAINT recipe_drafts_cook_minutes_check CHECK (((cook_minutes IS NULL) OR (cook_minutes >= 0)));
ALTER TABLE ONLY public.recipe_drafts ADD CONSTRAINT recipe_drafts_difficulty_check CHECK (((difficulty IS NULL) OR (difficulty = ANY (ARRAY['kolay'::text, 'orta'::text, 'zor'::text]))));
ALTER TABLE ONLY public.recipe_drafts ADD CONSTRAINT recipe_drafts_extraction_confidence_check CHECK (((extraction_confidence IS NULL) OR ((extraction_confidence >= (0)::numeric) AND (extraction_confidence <= (1)::numeric))));
ALTER TABLE ONLY public.recipe_drafts ADD CONSTRAINT recipe_drafts_ingredients_check CHECK (((jsonb_typeof(ingredients) = 'array'::text) AND (jsonb_array_length(ingredients) >= 1)));
ALTER TABLE ONLY public.recipe_drafts ADD CONSTRAINT recipe_drafts_prep_minutes_check CHECK (((prep_minutes IS NULL) OR (prep_minutes >= 0)));
ALTER TABLE ONLY public.recipe_drafts ADD CONSTRAINT recipe_drafts_rest_minutes_check CHECK (((rest_minutes IS NULL) OR (rest_minutes >= 0)));
ALTER TABLE ONLY public.recipe_drafts ADD CONSTRAINT recipe_drafts_servings_check CHECK (((servings IS NULL) OR (servings > 0)));
ALTER TABLE ONLY public.recipe_drafts ADD CONSTRAINT recipe_drafts_source_type_check CHECK ((source_type = ANY (ARRAY['manual'::text, 'text'::text, 'photo'::text, 'url'::text])));
ALTER TABLE ONLY public.recipe_drafts ADD CONSTRAINT recipe_drafts_steps_check CHECK (((jsonb_typeof(steps) = 'array'::text) AND (jsonb_array_length(steps) >= 1)));
ALTER TABLE ONLY public.recipe_drafts ADD CONSTRAINT recipe_drafts_version_check CHECK ((version > 0));
ALTER TABLE ONLY public.recipe_drafts ADD CONSTRAINT recipe_drafts_visibility_check CHECK ((visibility = ANY (ARRAY['public'::text, 'private'::text])));
ALTER TABLE ONLY public.recipe_generation_batches ADD CONSTRAINT recipe_generation_batches_check CHECK (((completed_at IS NULL) OR (started_at IS NOT NULL)));
ALTER TABLE ONLY public.recipe_generation_batches ADD CONSTRAINT recipe_generation_batches_check1 CHECK (((status = ANY (ARRAY['completed'::text, 'failed'::text, 'cancelled'::text])) OR (completed_at IS NULL)));
ALTER TABLE ONLY public.recipe_generation_batches ADD CONSTRAINT recipe_generation_batches_diversity_report_check CHECK (((diversity_report IS NULL) OR (jsonb_typeof(diversity_report) = 'object'::text)));
ALTER TABLE ONLY public.recipe_generation_batches ADD CONSTRAINT recipe_generation_batches_error_summary_check CHECK (((error_summary IS NULL) OR (jsonb_typeof(error_summary) = 'object'::text)));
ALTER TABLE ONLY public.recipe_generation_batches ADD CONSTRAINT recipe_generation_batches_plan_error_check CHECK (((plan_error IS NULL) OR (jsonb_typeof(plan_error) = 'object'::text)));
ALTER TABLE ONLY public.recipe_generation_batches ADD CONSTRAINT recipe_generation_batches_review_status_check CHECK ((review_status = ANY (ARRAY['pending_review'::text, 'approved'::text, 'rejected'::text])));
ALTER TABLE ONLY public.recipe_generation_batches ADD CONSTRAINT recipe_generation_batches_reviewed_at_requires_decision CHECK (((reviewed_at IS NULL) OR (review_status <> 'pending_review'::text)));
ALTER TABLE ONLY public.recipe_generation_batches ADD CONSTRAINT recipe_generation_batches_reviewed_by_check CHECK (((reviewed_by IS NULL) OR (char_length(reviewed_by) <= 200)));
ALTER TABLE ONLY public.recipe_generation_batches ADD CONSTRAINT recipe_generation_batches_status_check CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text, 'failed'::text, 'cancelled'::text])));
ALTER TABLE ONLY public.recipe_generation_batches ADD CONSTRAINT recipe_generation_batches_target_count_check CHECK (((target_count > 0) AND (target_count <= 25)));
ALTER TABLE ONLY public.recipe_generation_jobs ADD CONSTRAINT recipe_generation_jobs_attempt_check CHECK ((attempt > 0));
ALTER TABLE ONLY public.recipe_generation_jobs ADD CONSTRAINT recipe_generation_jobs_check CHECK ((((locked_by IS NULL) AND (locked_at IS NULL) AND (lock_expires_at IS NULL)) OR ((locked_by IS NOT NULL) AND (locked_at IS NOT NULL) AND (lock_expires_at IS NOT NULL))));
ALTER TABLE ONLY public.recipe_generation_jobs ADD CONSTRAINT recipe_generation_jobs_check1 CHECK (((finished_at IS NULL) OR (started_at IS NOT NULL)));
ALTER TABLE ONLY public.recipe_generation_jobs ADD CONSTRAINT recipe_generation_jobs_check2 CHECK (((completed_at IS NULL) OR (status = ANY (ARRAY['completed'::text, 'failed'::text, 'cancelled'::text]))));
ALTER TABLE ONLY public.recipe_generation_jobs ADD CONSTRAINT recipe_generation_jobs_last_error_check CHECK (((last_error IS NULL) OR (jsonb_typeof(last_error) = 'object'::text)));
ALTER TABLE ONLY public.recipe_generation_jobs ADD CONSTRAINT recipe_generation_jobs_max_attempts_check CHECK ((max_attempts > 0));
ALTER TABLE ONLY public.recipe_generation_jobs ADD CONSTRAINT recipe_generation_jobs_revision_count_check CHECK (((revision_count >= 0) AND (revision_count <= 2)));
ALTER TABLE ONLY public.recipe_generation_jobs ADD CONSTRAINT recipe_generation_jobs_stage_check CHECK ((stage = ANY (ARRAY['plan'::text, 'write'::text, 'qa'::text, 'revise'::text, 'image'::text, 'finalize'::text, 'awaiting_approval'::text, 'publish'::text])));
ALTER TABLE ONLY public.recipe_generation_jobs ADD CONSTRAINT recipe_generation_jobs_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'retryable'::text, 'failed'::text, 'awaiting_approval'::text, 'approved'::text, 'rejected'::text, 'completed'::text, 'cancelled'::text])));
ALTER TABLE ONLY public.recipe_generation_jobs ADD CONSTRAINT recipe_generation_jobs_target_difficulty_check CHECK (((target_difficulty IS NULL) OR (target_difficulty = ANY (ARRAY['kolay'::text, 'orta'::text, 'zor'::text]))));
ALTER TABLE ONLY public.recipe_generation_jobs ADD CONSTRAINT recipe_generation_jobs_usage_check CHECK (((usage IS NULL) OR (jsonb_typeof(usage) = 'object'::text)));
ALTER TABLE ONLY public.recipe_generation_stage_runs ADD CONSTRAINT recipe_generation_stage_runs_attempt_check CHECK ((attempt > 0));
ALTER TABLE ONLY public.recipe_generation_stage_runs ADD CONSTRAINT recipe_generation_stage_runs_check CHECK (((finished_at IS NULL) OR (finished_at >= started_at)));
ALTER TABLE ONLY public.recipe_generation_stage_runs ADD CONSTRAINT recipe_generation_stage_runs_error_check CHECK (((error IS NULL) OR (jsonb_typeof(error) = 'object'::text)));
ALTER TABLE ONLY public.recipe_generation_stage_runs ADD CONSTRAINT recipe_generation_stage_runs_stage_check CHECK ((stage = ANY (ARRAY['plan'::text, 'write'::text, 'qa'::text, 'revise'::text, 'image'::text, 'finalize'::text, 'awaiting_approval'::text, 'publish'::text])));
ALTER TABLE ONLY public.recipe_generation_stage_runs ADD CONSTRAINT recipe_generation_stage_runs_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'retryable'::text, 'failed'::text, 'awaiting_approval'::text, 'approved'::text, 'rejected'::text, 'completed'::text, 'cancelled'::text])));
ALTER TABLE ONLY public.recipe_generation_stage_runs ADD CONSTRAINT recipe_generation_stage_runs_usage_check CHECK (((usage IS NULL) OR (jsonb_typeof(usage) = 'object'::text)));
ALTER TABLE ONLY public.recipe_ingredients ADD CONSTRAINT recipe_ingredients_ingredient_class_check CHECK ((ingredient_class = ANY (ARRAY['tarimsal'::text, 'platform_disi'::text])));
ALTER TABLE ONLY public.recipe_ingredients ADD CONSTRAINT recipe_ingredients_name_present CHECK (((crop IS NOT NULL) OR (NULLIF(btrim(COALESCE(free_text_name, ''::text)), ''::text) IS NOT NULL)));
ALTER TABLE ONLY public.recipe_ingredients ADD CONSTRAINT recipe_ingredients_nutrition_exclusion_reason_check CHECK (((nutrition_exclusion_reason IS NULL) OR (nutrition_exclusion_reason = ANY (ARRAY['serving_only_unquantified'::text, 'seasoning_to_taste_unquantified'::text, 'trace_flavoring_unquantified'::text]))));
ALTER TABLE ONLY public.recipe_ingredients ADD CONSTRAINT recipe_ingredients_nutrition_resolution_check CHECK ((NOT ((nutrition_food_key IS NOT NULL) AND (nutrition_exclusion_reason IS NOT NULL))));
ALTER TABLE ONLY public.recipe_ingredients ADD CONSTRAINT recipe_ingredients_quantity_check CHECK (((quantity IS NULL) OR (quantity > (0)::numeric)));
ALTER TABLE ONLY public.recipe_plan_briefs ADD CONSTRAINT recipe_plan_briefs_audience_check CHECK ((audience = ANY (ARRAY['bireysel'::text, 'horeca'::text])));
ALTER TABLE ONLY public.recipe_plan_briefs ADD CONSTRAINT recipe_plan_briefs_check CHECK (((exclusion_reason IS NULL) OR excluded));
ALTER TABLE ONLY public.recipe_plan_briefs ADD CONSTRAINT recipe_plan_briefs_meal_type_check CHECK (((meal_type IS NULL) OR (meal_type = ANY (ARRAY['kahvalti'::text, 'ana_yemek'::text, 'aperatif_meze'::text, 'corba'::text, 'salata'::text, 'tatli'::text, 'icecek'::text]))));
ALTER TABLE ONLY public.recipe_plan_briefs ADD CONSTRAINT recipe_plan_briefs_selection_reason_check CHECK ((char_length(btrim(selection_reason)) > 0));
ALTER TABLE ONLY public.recipe_plan_briefs ADD CONSTRAINT recipe_plan_briefs_target_difficulty_check CHECK (((target_difficulty IS NULL) OR (target_difficulty = ANY (ARRAY['kolay'::text, 'orta'::text, 'zor'::text]))));
ALTER TABLE ONLY public.recipe_plan_briefs ADD CONSTRAINT recipe_plan_briefs_working_title_check CHECK ((char_length(btrim(working_title)) > 0));
ALTER TABLE ONLY public.recipe_qa_results ADD CONSTRAINT recipe_qa_results_blocking_issues_check CHECK ((jsonb_typeof(blocking_issues) = 'array'::text));
ALTER TABLE ONLY public.recipe_qa_results ADD CONSTRAINT recipe_qa_results_check CHECK (((safety_approved IS NOT TRUE) OR ((safety_reviewed_by IS NOT NULL) AND (safety_reviewed_at IS NOT NULL))));
ALTER TABLE ONLY public.recipe_qa_results ADD CONSTRAINT recipe_qa_results_check1 CHECK (((NOT approved_for_imaging) OR ((decision = 'approved'::text) AND (jsonb_array_length(blocking_issues) = 0))));
ALTER TABLE ONLY public.recipe_qa_results ADD CONSTRAINT recipe_qa_results_decision_check CHECK ((decision = ANY (ARRAY['approved'::text, 'revision_required'::text, 'manual_review_required'::text])));
ALTER TABLE ONLY public.recipe_qa_results ADD CONSTRAINT recipe_qa_results_draft_version_check CHECK ((draft_version > 0));
ALTER TABLE ONLY public.recipe_qa_results ADD CONSTRAINT recipe_qa_results_non_blocking_suggestions_check CHECK ((jsonb_typeof(non_blocking_suggestions) = 'array'::text));
ALTER TABLE ONLY public.recipe_qa_results ADD CONSTRAINT recipe_qa_results_overall_score_check CHECK (((overall_score >= (0)::numeric) AND (overall_score <= (100)::numeric)));
ALTER TABLE ONLY public.recipe_qa_results ADD CONSTRAINT recipe_qa_results_safety_review_check CHECK ((jsonb_typeof(safety_review) = 'object'::text));
ALTER TABLE ONLY public.recipe_qa_results ADD CONSTRAINT recipe_qa_results_scores_check CHECK ((jsonb_typeof(scores) = 'object'::text));
ALTER TABLE ONLY public.recipe_steps ADD CONSTRAINT recipe_steps_step_no_check CHECK ((step_no > 0));
ALTER TABLE ONLY public.recipe_steps ADD CONSTRAINT recipe_steps_timer_seconds_check CHECK (((timer_seconds IS NULL) OR (timer_seconds > 0)));
ALTER TABLE ONLY public.recipes ADD CONSTRAINT recipes_allergen_labels_taxonomy_check CHECK (is_valid_recipe_allergen_labels(allergen_labels));
ALTER TABLE ONLY public.recipes ADD CONSTRAINT recipes_allergens_review_consistency_check CHECK (((allergens_reviewed = false) OR (allergens_reviewed_at IS NOT NULL)));
ALTER TABLE ONLY public.recipes ADD CONSTRAINT recipes_author_type_check CHECK ((author_type = ANY (ARRAY['hasat'::text, 'ciftci'::text, 'sef'::text, 'kullanici'::text])));
ALTER TABLE ONLY public.recipes ADD CONSTRAINT recipes_cook_minutes_check CHECK (((cook_minutes IS NULL) OR (cook_minutes >= 0)));
ALTER TABLE ONLY public.recipes ADD CONSTRAINT recipes_difficulty_check CHECK (((difficulty IS NULL) OR (difficulty = ANY (ARRAY['kolay'::text, 'orta'::text, 'zor'::text]))));
ALTER TABLE ONLY public.recipes ADD CONSTRAINT recipes_extraction_confidence_check CHECK (((extraction_confidence IS NULL) OR ((extraction_confidence >= (0)::numeric) AND (extraction_confidence <= (1)::numeric))));
ALTER TABLE ONLY public.recipes ADD CONSTRAINT recipes_micronutrients_v1_check CHECK (is_valid_recipe_micronutrients_v1(micronutrients));
ALTER TABLE ONLY public.recipes ADD CONSTRAINT recipes_nutrition_consistency_check CHECK ((((calories IS NOT NULL) AND (protein_g IS NOT NULL) AND (carbs_g IS NOT NULL) AND (fat_g IS NOT NULL)) = ((nutrition_source IS NOT NULL) AND (nutrition_coverage_pct IS NOT NULL) AND (nutrition_calculated_at IS NOT NULL) AND (nutrition_input_hash IS NOT NULL) AND (nutrition_reference_version IS NOT NULL))));
ALTER TABLE ONLY public.recipes ADD CONSTRAINT recipes_nutrition_coverage_pct_check CHECK (((nutrition_coverage_pct IS NULL) OR ((nutrition_coverage_pct >= (0)::numeric) AND (nutrition_coverage_pct <= (100)::numeric))));
ALTER TABLE ONLY public.recipes ADD CONSTRAINT recipes_nutrition_source_check CHECK (((nutrition_source IS NULL) OR (nutrition_source = ANY (ARRAY['computed'::text, 'partial'::text, 'estimated'::text]))));
ALTER TABLE ONLY public.recipes ADD CONSTRAINT recipes_prep_minutes_check CHECK (((prep_minutes IS NULL) OR (prep_minutes >= 0)));
ALTER TABLE ONLY public.recipes ADD CONSTRAINT recipes_servings_check CHECK (((servings IS NULL) OR (servings > 0)));
ALTER TABLE ONLY public.recipes ADD CONSTRAINT recipes_source_type_check CHECK ((source_type = ANY (ARRAY['manual'::text, 'text'::text, 'photo'::text, 'url'::text, 'ai_customize'::text, 'photo_estimate'::text, 'clone'::text, 'shared_clone'::text])));
ALTER TABLE ONLY public.recipes ADD CONSTRAINT recipes_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text])));
ALTER TABLE ONLY public.recipes ADD CONSTRAINT recipes_visibility_check CHECK ((visibility = ANY (ARRAY['public'::text, 'private'::text])));
ALTER TABLE ONLY public.reviews ADD CONSTRAINT reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5)));
ALTER TABLE ONLY public.reviews ADD CONSTRAINT reviews_reviewer_role_check CHECK ((reviewer_role = ANY (ARRAY['farmer'::text, 'buyer'::text])));

-- ============================== FOREIGN KEY CONSTRAINTS ==============================
ALTER TABLE ONLY public.ai_chat_messages ADD CONSTRAINT ai_chat_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.ai_customize_requests ADD CONSTRAINT ai_customize_requests_created_recipe_id_fkey FOREIGN KEY (created_recipe_id) REFERENCES recipes(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.ai_customize_requests ADD CONSTRAINT ai_customize_requests_source_recipe_id_fkey FOREIGN KEY (source_recipe_id) REFERENCES recipes(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.ai_customize_requests ADD CONSTRAINT ai_customize_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.ai_usage_tracking ADD CONSTRAINT ai_usage_tracking_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.buyer_addresses ADD CONSTRAINT buyer_addresses_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.buyer_profiles ADD CONSTRAINT buyer_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.certifications ADD CONSTRAINT certifications_farmer_id_fkey FOREIGN KEY (farmer_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.community_post_likes ADD CONSTRAINT community_post_likes_post_id_fkey FOREIGN KEY (post_id) REFERENCES community_posts(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.community_post_likes ADD CONSTRAINT community_post_likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.community_posts ADD CONSTRAINT community_posts_author_id_fkey FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.community_posts ADD CONSTRAINT community_posts_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES community_posts(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.crop_culinary_meta ADD CONSTRAINT crop_culinary_meta_crop_fkey FOREIGN KEY (crop) REFERENCES crop_config(crop) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE ONLY public.crop_journal_glossary ADD CONSTRAINT crop_journal_glossary_crop_fkey FOREIGN KEY (crop) REFERENCES crop_config(crop) ON DELETE CASCADE;
ALTER TABLE ONLY public.crop_market_sources ADD CONSTRAINT crop_market_sources_source_code_fkey FOREIGN KEY (source_code) REFERENCES market_sources(code) ON DELETE CASCADE;
ALTER TABLE ONLY public.crop_nutrition ADD CONSTRAINT crop_nutrition_crop_fkey FOREIGN KEY (crop) REFERENCES crop_config(crop) ON UPDATE CASCADE ON DELETE CASCADE;
ALTER TABLE ONLY public.crop_requests ADD CONSTRAINT crop_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.crop_type_requests ADD CONSTRAINT crop_type_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.device_tokens ADD CONSTRAINT device_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.disputes ADD CONSTRAINT disputes_opened_by_fkey FOREIGN KEY (opened_by) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.disputes ADD CONSTRAINT disputes_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.farmer_journal_prefs ADD CONSTRAINT farmer_journal_prefs_entry_type_id_fkey FOREIGN KEY (entry_type_id) REFERENCES journal_entry_types(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.farmer_journal_prefs ADD CONSTRAINT farmer_journal_prefs_farmer_id_fkey FOREIGN KEY (farmer_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.farms ADD CONSTRAINT farms_farmer_id_fkey FOREIGN KEY (farmer_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.harvest_entries ADD CONSTRAINT harvest_entries_farmer_id_fkey FOREIGN KEY (farmer_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.harvest_entries ADD CONSTRAINT harvest_entries_journal_entry_type_id_fkey FOREIGN KEY (journal_entry_type_id) REFERENCES journal_entry_types(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.harvest_entries ADD CONSTRAINT harvest_entries_parcel_id_fkey FOREIGN KEY (parcel_id) REFERENCES parcels(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.harvest_subscriptions ADD CONSTRAINT harvest_subscriptions_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.harvest_subscriptions ADD CONSTRAINT harvest_subscriptions_farmer_id_fkey FOREIGN KEY (farmer_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.journal_entry_types ADD CONSTRAINT journal_entry_types_crop_fkey FOREIGN KEY (crop) REFERENCES crop_config(crop);
ALTER TABLE ONLY public.journal_entry_types ADD CONSTRAINT journal_entry_types_farmer_id_fkey FOREIGN KEY (farmer_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.journal_entry_types ADD CONSTRAINT journal_entry_types_theme_id_fkey FOREIGN KEY (theme_id) REFERENCES journal_themes(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.journal_themes ADD CONSTRAINT journal_themes_crop_fkey FOREIGN KEY (crop) REFERENCES crop_config(crop);
ALTER TABLE ONLY public.listing_harvest_entries ADD CONSTRAINT listing_harvest_entries_harvest_entry_id_fkey FOREIGN KEY (harvest_entry_id) REFERENCES harvest_entries(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.listing_harvest_entries ADD CONSTRAINT listing_harvest_entries_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.listings ADD CONSTRAINT listings_farmer_id_fkey FOREIGN KEY (farmer_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.listings ADD CONSTRAINT listings_harvest_entry_id_fkey FOREIGN KEY (harvest_entry_id) REFERENCES harvest_entries(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.listings ADD CONSTRAINT listings_parcel_id_fkey FOREIGN KEY (parcel_id) REFERENCES parcels(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.mcp_tool_calls ADD CONSTRAINT mcp_tool_calls_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.mobile_handoff_nonces ADD CONSTRAINT mobile_handoff_nonces_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.notif_prefs ADD CONSTRAINT notif_prefs_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.notifications ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.offer_items ADD CONSTRAINT offer_items_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES listings(id);
ALTER TABLE ONLY public.offer_items ADD CONSTRAINT offer_items_offer_id_fkey FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.offer_messages ADD CONSTRAINT offer_messages_offer_id_fkey FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.offer_messages ADD CONSTRAINT offer_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.offers ADD CONSTRAINT offers_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.offers ADD CONSTRAINT offers_farmer_id_fkey FOREIGN KEY (farmer_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.offers ADD CONSTRAINT offers_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.offers ADD CONSTRAINT offers_source_recipe_id_fkey FOREIGN KEY (source_recipe_id) REFERENCES recipes(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.offers ADD CONSTRAINT offers_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES harvest_subscriptions(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.order_timeline ADD CONSTRAINT order_timeline_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.orders ADD CONSTRAINT orders_buyer_id_fkey FOREIGN KEY (buyer_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.orders ADD CONSTRAINT orders_farmer_id_fkey FOREIGN KEY (farmer_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.orders ADD CONSTRAINT orders_offer_id_fkey FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.parcels ADD CONSTRAINT parcels_farm_id_fkey FOREIGN KEY (farm_id) REFERENCES farms(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.parcels ADD CONSTRAINT parcels_farmer_id_fkey FOREIGN KEY (farmer_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.price_alerts ADD CONSTRAINT price_alerts_farmer_id_fkey FOREIGN KEY (farmer_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.price_history ADD CONSTRAINT price_history_crop_fkey FOREIGN KEY (crop) REFERENCES crop_config(crop);
ALTER TABLE ONLY public.price_history ADD CONSTRAINT price_history_farmer_id_fkey FOREIGN KEY (farmer_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.price_history ADD CONSTRAINT price_history_market_source_code_fkey FOREIGN KEY (market_source_code) REFERENCES market_sources(code);
ALTER TABLE ONLY public.price_history ADD CONSTRAINT price_history_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.profiles ADD CONSTRAINT profiles_referred_by_fkey FOREIGN KEY (referred_by) REFERENCES profiles(id);
ALTER TABLE ONLY public.recipe_admin_reviews ADD CONSTRAINT recipe_admin_reviews_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES recipe_generation_batches(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.recipe_admin_reviews ADD CONSTRAINT recipe_admin_reviews_draft_fk FOREIGN KEY (job_id, draft_id, draft_version) REFERENCES recipe_drafts(job_id, id, version) ON DELETE CASCADE;
ALTER TABLE ONLY public.recipe_admin_reviews ADD CONSTRAINT recipe_admin_reviews_job_fk FOREIGN KEY (job_id, batch_id) REFERENCES recipe_generation_jobs(id, batch_id) ON DELETE CASCADE;
ALTER TABLE ONLY public.recipe_admin_reviews ADD CONSTRAINT recipe_admin_reviews_job_id_fkey FOREIGN KEY (job_id) REFERENCES recipe_generation_jobs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.recipe_assets ADD CONSTRAINT recipe_assets_draft_fk FOREIGN KEY (job_id, draft_id) REFERENCES recipe_drafts(job_id, id) ON DELETE CASCADE;
ALTER TABLE ONLY public.recipe_assets ADD CONSTRAINT recipe_assets_job_id_fkey FOREIGN KEY (job_id) REFERENCES recipe_generation_jobs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.recipe_assets ADD CONSTRAINT recipe_assets_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.recipe_drafts ADD CONSTRAINT recipe_drafts_job_id_fkey FOREIGN KEY (job_id) REFERENCES recipe_generation_jobs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.recipe_drafts ADD CONSTRAINT recipe_drafts_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.recipe_generation_batches ADD CONSTRAINT recipe_generation_batches_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.recipe_generation_jobs ADD CONSTRAINT recipe_generation_jobs_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES recipe_generation_batches(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.recipe_generation_jobs ADD CONSTRAINT recipe_generation_jobs_focus_crop_fkey FOREIGN KEY (focus_crop) REFERENCES crop_config(crop) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE ONLY public.recipe_generation_jobs ADD CONSTRAINT recipe_generation_jobs_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.recipe_generation_jobs ADD CONSTRAINT recipe_generation_jobs_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.recipe_generation_stage_runs ADD CONSTRAINT recipe_generation_stage_runs_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES recipe_generation_batches(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.recipe_generation_stage_runs ADD CONSTRAINT recipe_generation_stage_runs_job_fk FOREIGN KEY (job_id, batch_id) REFERENCES recipe_generation_jobs(id, batch_id) ON DELETE CASCADE;
ALTER TABLE ONLY public.recipe_generation_stage_runs ADD CONSTRAINT recipe_generation_stage_runs_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.recipe_ingredients ADD CONSTRAINT recipe_ingredients_crop_fkey FOREIGN KEY (crop) REFERENCES crop_config(crop) ON UPDATE CASCADE ON DELETE SET NULL;
ALTER TABLE ONLY public.recipe_ingredients ADD CONSTRAINT recipe_ingredients_nutrition_food_key_fkey FOREIGN KEY (nutrition_food_key) REFERENCES ingredient_nutrition_reference(food_key);
ALTER TABLE ONLY public.recipe_ingredients ADD CONSTRAINT recipe_ingredients_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.recipe_plan_briefs ADD CONSTRAINT recipe_plan_briefs_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES recipe_generation_batches(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.recipe_plan_briefs ADD CONSTRAINT recipe_plan_briefs_focus_crop_fkey FOREIGN KEY (focus_crop) REFERENCES crop_config(crop) ON UPDATE CASCADE;
ALTER TABLE ONLY public.recipe_plan_briefs ADD CONSTRAINT recipe_plan_briefs_job_id_fkey FOREIGN KEY (job_id) REFERENCES recipe_generation_jobs(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.recipe_qa_results ADD CONSTRAINT recipe_qa_results_draft_fk FOREIGN KEY (job_id, draft_id, draft_version) REFERENCES recipe_drafts(job_id, id, version) ON DELETE CASCADE;
ALTER TABLE ONLY public.recipe_qa_results ADD CONSTRAINT recipe_qa_results_job_id_fkey FOREIGN KEY (job_id) REFERENCES recipe_generation_jobs(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.recipe_qa_results ADD CONSTRAINT recipe_qa_results_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.recipe_qa_results ADD CONSTRAINT recipe_qa_results_safety_reviewed_by_fkey FOREIGN KEY (safety_reviewed_by) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.recipe_rfq_links ADD CONSTRAINT recipe_rfq_links_crop_request_id_fkey FOREIGN KEY (crop_request_id) REFERENCES crop_requests(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.recipe_rfq_links ADD CONSTRAINT recipe_rfq_links_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.recipe_saves ADD CONSTRAINT recipe_saves_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.recipe_saves ADD CONSTRAINT recipe_saves_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.recipe_steps ADD CONSTRAINT recipe_steps_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.recipe_views ADD CONSTRAINT recipe_views_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.recipe_views ADD CONSTRAINT recipe_views_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.recipes ADD CONSTRAINT recipes_cloned_from_recipe_id_fkey FOREIGN KEY (cloned_from_recipe_id) REFERENCES recipes(id);
ALTER TABLE ONLY public.recipes ADD CONSTRAINT recipes_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.referral_qualifications ADD CONSTRAINT referral_qualifications_referred_user_id_fkey FOREIGN KEY (referred_user_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.referral_qualifications ADD CONSTRAINT referral_qualifications_referrer_id_fkey FOREIGN KEY (referrer_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.reviews ADD CONSTRAINT reviews_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.reviews ADD CONSTRAINT reviews_reviewee_id_fkey FOREIGN KEY (reviewee_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.reviews ADD CONSTRAINT reviews_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES profiles(id) ON DELETE CASCADE;

-- ============================== PRIVATE SCHEMA CONSTRAINTS ==============================
ALTER TABLE ONLY private.admin_sms_outbox ADD CONSTRAINT admin_sms_outbox_pkey PRIMARY KEY (id);
ALTER TABLE ONLY private.admin_sms_outbox ADD CONSTRAINT admin_sms_outbox_event_key_key UNIQUE (event_key);
ALTER TABLE ONLY private.admin_sms_outbox ADD CONSTRAINT admin_sms_outbox_attempt_count_check CHECK (((attempt_count >= 0) AND (attempt_count <= 3)));
ALTER TABLE ONLY private.admin_sms_outbox ADD CONSTRAINT admin_sms_outbox_event_key_check CHECK (((char_length(event_key) >= 1) AND (char_length(event_key) <= 180)));
ALTER TABLE ONLY private.admin_sms_outbox ADD CONSTRAINT admin_sms_outbox_event_type_check CHECK ((event_type = ANY (ARRAY['crop_type_request.created'::text, 'crop_request.catalog_gap.created'::text])));
ALTER TABLE ONLY private.admin_sms_outbox ADD CONSTRAINT admin_sms_outbox_last_error_code_check CHECK (((last_error_code IS NULL) OR (char_length(last_error_code) <= 64)));
ALTER TABLE ONLY private.admin_sms_outbox ADD CONSTRAINT admin_sms_outbox_payload_check CHECK (((jsonb_typeof(payload) = 'object'::text) AND (octet_length((payload)::text) <= 2048)));
ALTER TABLE ONLY private.admin_sms_outbox ADD CONSTRAINT admin_sms_outbox_provider_message_id_check CHECK (((provider_message_id IS NULL) OR (char_length(provider_message_id) <= 64)));
ALTER TABLE ONLY private.admin_sms_outbox ADD CONSTRAINT admin_sms_outbox_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sending'::text, 'sent'::text, 'failed'::text, 'dead'::text, 'uncertain'::text])));

-- ============================== INDEXES (public) ==============================
CREATE INDEX ai_chat_messages_user_created_idx ON public.ai_chat_messages USING btree (user_id, created_at DESC);
CREATE INDEX ai_chat_messages_user_session_idx ON public.ai_chat_messages USING btree (user_id, session_id, created_at);
CREATE INDEX ai_customize_requests_user_id_idx ON public.ai_customize_requests USING btree (user_id);
CREATE UNIQUE INDEX buyer_addresses_one_default_per_buyer ON public.buyer_addresses USING btree (buyer_id) WHERE is_default;
CREATE INDEX idx_community_posts_parent ON public.community_posts USING btree (parent_id) WHERE (parent_id IS NOT NULL);
CREATE INDEX crop_journal_glossary_crop_idx ON public.crop_journal_glossary USING btree (crop);
CREATE INDEX crop_type_requests_requested_by_idx ON public.crop_type_requests USING btree (requested_by);
CREATE INDEX crop_type_requests_status_idx ON public.crop_type_requests USING btree (status);
CREATE INDEX device_tokens_user_idx ON public.device_tokens USING btree (user_id);
CREATE INDEX disputes_order_id_idx ON public.disputes USING btree (order_id);
CREATE INDEX farmer_journal_prefs_entry_type_idx ON public.farmer_journal_prefs USING btree (entry_type_id);
CREATE INDEX farmer_journal_prefs_farmer_idx ON public.farmer_journal_prefs USING btree (farmer_id);
CREATE INDEX harvest_entries_journal_entry_type_idx ON public.harvest_entries USING btree (journal_entry_type_id);
CREATE INDEX journal_entry_types_crop_idx ON public.journal_entry_types USING btree (crop);
CREATE INDEX journal_entry_types_farmer_idx ON public.journal_entry_types USING btree (farmer_id);
CREATE INDEX journal_entry_types_theme_idx ON public.journal_entry_types USING btree (theme_id);
CREATE INDEX journal_themes_crop_idx ON public.journal_themes USING btree (crop);
CREATE INDEX idx_lhe_entry ON public.listing_harvest_entries USING btree (harvest_entry_id);
CREATE INDEX idx_lhe_listing ON public.listing_harvest_entries USING btree (listing_id);
CREATE INDEX mcp_tool_calls_user_time_idx ON public.mcp_tool_calls USING btree (user_id, called_at DESC);
CREATE INDEX mobile_handoff_nonces_user_id_idx ON public.mobile_handoff_nonces USING btree (user_id);
CREATE INDEX offer_items_listing_id_idx ON public.offer_items USING btree (listing_id);
CREATE INDEX offer_items_offer_id_idx ON public.offer_items USING btree (offer_id);
CREATE INDEX offer_messages_offer_idx ON public.offer_messages USING btree (offer_id, created_at);
CREATE INDEX offers_source_recipe_idx ON public.offers USING btree (source_recipe_id) WHERE (source_recipe_id IS NOT NULL);
CREATE INDEX offers_subscription_id_idx ON public.offers USING btree (subscription_id);
CREATE INDEX price_history_crop_date_idx ON public.price_history USING btree (crop, recorded_date DESC);
CREATE INDEX price_history_source_idx ON public.price_history USING btree (crop, source, recorded_date DESC);
CREATE INDEX recipe_admin_reviews_created_at_idx ON public.recipe_admin_reviews USING btree (created_at DESC);
CREATE INDEX recipe_admin_reviews_job_id_idx ON public.recipe_admin_reviews USING btree (job_id, created_at DESC);
CREATE INDEX recipe_assets_recipe_id_idx ON public.recipe_assets USING btree (recipe_id) WHERE (recipe_id IS NOT NULL);
CREATE UNIQUE INDEX recipe_assets_unique_non_step_idx ON public.recipe_assets USING btree (job_id, draft_id, asset_type) WHERE (asset_type <> 'step'::text);
CREATE UNIQUE INDEX recipe_assets_unique_step_idx ON public.recipe_assets USING btree (job_id, draft_id, step_no) WHERE (asset_type = 'step'::text);
CREATE INDEX recipe_generation_batches_review_status_idx ON public.recipe_generation_batches USING btree (review_status) WHERE (review_status = 'pending_review'::text);
CREATE INDEX recipe_generation_jobs_batch_status_idx ON public.recipe_generation_jobs USING btree (batch_id, status);
CREATE INDEX recipe_generation_jobs_locked_idx ON public.recipe_generation_jobs USING btree (lock_expires_at) WHERE (locked_by IS NOT NULL);
CREATE INDEX recipe_generation_jobs_retry_idx ON public.recipe_generation_jobs USING btree (status, next_attempt_at) WHERE (next_attempt_at IS NOT NULL);
CREATE INDEX recipe_generation_jobs_runnable_idx ON public.recipe_generation_jobs USING btree (next_attempt_at) WHERE (status = 'queued'::text);
CREATE INDEX recipe_generation_jobs_stage_status_idx ON public.recipe_generation_jobs USING btree (stage, status);
CREATE INDEX recipe_generation_stage_runs_batch_id_idx ON public.recipe_generation_stage_runs USING btree (batch_id);
CREATE INDEX recipe_generation_stage_runs_stage_status_idx ON public.recipe_generation_stage_runs USING btree (stage, status);
CREATE INDEX recipe_ingredients_crop_idx ON public.recipe_ingredients USING btree (crop) WHERE (crop IS NOT NULL);
CREATE INDEX recipe_ingredients_nutrition_food_key_idx ON public.recipe_ingredients USING btree (nutrition_food_key) WHERE (nutrition_food_key IS NOT NULL);
CREATE INDEX recipe_ingredients_recipe_idx ON public.recipe_ingredients USING btree (recipe_id, sort_order);
CREATE INDEX recipe_plan_briefs_batch_id_idx ON public.recipe_plan_briefs USING btree (batch_id, created_at);
CREATE INDEX recipe_qa_results_draft_id_idx ON public.recipe_qa_results USING btree (draft_id);
CREATE INDEX recipe_qa_results_job_id_idx ON public.recipe_qa_results USING btree (job_id);
CREATE INDEX recipe_qa_results_pending_safety_idx ON public.recipe_qa_results USING btree (checked_at) WHERE (safety_approved IS NULL);
CREATE INDEX recipe_rfq_links_request_idx ON public.recipe_rfq_links USING btree (crop_request_id);
CREATE INDEX recipe_saves_recipe_idx ON public.recipe_saves USING btree (recipe_id);
CREATE UNIQUE INDEX recipe_steps_recipe_step_key ON public.recipe_steps USING btree (recipe_id, step_no);
CREATE INDEX recipe_views_created_idx ON public.recipe_views USING btree (created_at);
CREATE INDEX recipe_views_recipe_idx ON public.recipe_views USING btree (recipe_id);
CREATE INDEX recipes_owner_idx ON public.recipes USING btree (owner_id) WHERE (owner_id IS NOT NULL);
CREATE INDEX recipes_public_published_idx ON public.recipes USING btree (created_at DESC) WHERE ((visibility = 'public'::text) AND (status = 'published'::text));
CREATE UNIQUE INDEX recipes_share_token_key ON public.recipes USING btree (share_token) WHERE (share_token IS NOT NULL);
CREATE UNIQUE INDEX recipes_slug_key ON public.recipes USING btree (slug);
CREATE INDEX referral_qualifications_referrer_idx ON public.referral_qualifications USING btree (referrer_id);
CREATE INDEX reviews_order_idx ON public.reviews USING btree (order_id);
CREATE INDEX reviews_reviewee_idx ON public.reviews USING btree (reviewee_id);

-- ============================== INDEXES (private) ==============================
CREATE INDEX admin_sms_outbox_recent_attempt_idx ON private.admin_sms_outbox USING btree (last_attempt_at) WHERE (last_attempt_at IS NOT NULL);
CREATE INDEX admin_sms_outbox_retry_idx ON private.admin_sms_outbox USING btree (next_attempt_at, created_at) WHERE (status = ANY (ARRAY['pending'::text, 'failed'::text]));

-- ============================== TRIGGERS ==============================
CREATE TRIGGER trg_buyer_addresses_clear_default BEFORE INSERT OR UPDATE OF is_default ON public.buyer_addresses FOR EACH ROW EXECUTE FUNCTION buyer_addresses_clear_default();
CREATE TRIGGER trg_buyer_addresses_updated_at BEFORE UPDATE ON public.buyer_addresses FOR EACH ROW EXECUTE FUNCTION buyer_addresses_touch_updated_at();
CREATE TRIGGER enforce_cert_verification_trg BEFORE INSERT OR UPDATE ON public.certifications FOR EACH ROW EXECUTE FUNCTION enforce_cert_verification();
CREATE TRIGGER on_like_change AFTER INSERT OR DELETE ON public.community_post_likes FOR EACH ROW EXECUTE FUNCTION update_likes_count();
CREATE TRIGGER enforce_community_moderation_trg BEFORE INSERT OR UPDATE ON public.community_posts FOR EACH ROW EXECUTE FUNCTION enforce_community_moderation();
CREATE TRIGGER trg_crop_culinary_meta_updated_at BEFORE UPDATE ON public.crop_culinary_meta FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER crop_journal_glossary_set_updated_at BEFORE UPDATE ON public.crop_journal_glossary FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_crop_nutrition_updated_at BEFORE UPDATE ON public.crop_nutrition FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER tg_crop_requests_notify_catalog_gap AFTER INSERT ON public.crop_requests FOR EACH ROW EXECUTE FUNCTION private.notify_crop_request_catalog_gap();
CREATE TRIGGER tg_crop_type_requests_notify AFTER INSERT ON public.crop_type_requests FOR EACH ROW EXECUTE FUNCTION private.notify_new_crop_type_request();
CREATE TRIGGER farmer_journal_prefs_set_updated_at BEFORE UPDATE ON public.farmer_journal_prefs FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER harvest_entries_after_insert_autolink AFTER INSERT ON public.harvest_entries FOR EACH ROW EXECUTE FUNCTION tg_harvest_entries_after_insert_autolink();
CREATE TRIGGER trg_enforce_harvest_date_lock BEFORE UPDATE ON public.harvest_entries FOR EACH ROW EXECUTE FUNCTION enforce_harvest_date_lock();
CREATE TRIGGER trg_enforce_subscription_buyer_role BEFORE INSERT OR UPDATE OF buyer_id ON public.harvest_subscriptions FOR EACH ROW EXECUTE FUNCTION enforce_subscription_buyer_role();
CREATE TRIGGER trg_enforce_subscription_updates BEFORE UPDATE ON public.harvest_subscriptions FOR EACH ROW EXECUTE FUNCTION enforce_subscription_updates();
CREATE TRIGGER trg_notify_subscription_changes AFTER INSERT OR UPDATE ON public.harvest_subscriptions FOR EACH ROW EXECUTE FUNCTION notify_subscription_changes();
CREATE TRIGGER tg_enforce_link_unit_match BEFORE INSERT ON public.listing_harvest_entries FOR EACH ROW EXECUTE FUNCTION enforce_link_unit_match();
CREATE TRIGGER tg_listings_notify_crop_request_fulfilled AFTER INSERT OR UPDATE OF status ON public.listings FOR EACH ROW EXECUTE FUNCTION notify_crop_request_fulfilled();
CREATE TRIGGER trg_enforce_min_order_le_quantity BEFORE INSERT ON public.listings FOR EACH ROW EXECUTE FUNCTION tg_enforce_min_order_le_quantity();
CREATE TRIGGER enforce_offer_accept_turn_trg BEFORE UPDATE ON public.offers FOR EACH ROW EXECUTE FUNCTION enforce_offer_accept_turn();
CREATE TRIGGER enforce_offer_transitions_trg BEFORE UPDATE ON public.offers FOR EACH ROW EXECUTE FUNCTION enforce_offer_transitions();
CREATE TRIGGER trg_enforce_offer_stock BEFORE UPDATE ON public.offers FOR EACH ROW EXECUTE FUNCTION enforce_offer_stock();
CREATE TRIGGER trg_offer_received AFTER INSERT ON public.offers FOR EACH ROW EXECUTE FUNCTION notify_offer_received();
CREATE TRIGGER trg_offer_status AFTER UPDATE ON public.offers FOR EACH ROW EXECUTE FUNCTION notify_offer_accepted();
CREATE TRIGGER trg_offers_referral_qualification AFTER UPDATE OF payment_status ON public.offers FOR EACH ROW EXECUTE FUNCTION process_referral_qualification();
CREATE TRIGGER trg_offers_updated_at BEFORE UPDATE ON public.offers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_record_order_price_history AFTER UPDATE ON public.offers FOR EACH ROW EXECUTE FUNCTION record_order_price_history();
CREATE TRIGGER orders_set_order_ref BEFORE INSERT ON public.orders FOR EACH ROW WHEN (((new.order_ref IS NULL) OR (new.order_ref = ''::text))) EXECUTE FUNCTION generate_order_ref();
CREATE TRIGGER set_order_ref BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION generate_order_ref();
CREATE TRIGGER trg_order_status AFTER UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION notify_order_status();
CREATE TRIGGER parcels_after_insert_create_drafts AFTER INSERT ON public.parcels FOR EACH ROW EXECUTE FUNCTION tg_parcels_after_insert();
CREATE TRIGGER parcels_after_update_create_drafts AFTER UPDATE ON public.parcels FOR EACH ROW EXECUTE FUNCTION tg_parcels_after_update();
CREATE TRIGGER enforce_profile_self_update_restrictions_trg BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION enforce_profile_self_update_restrictions();
CREATE TRIGGER profiles_sync_tier_premium BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION profiles_sync_tier_premium();
CREATE TRIGGER protect_profile_deleted_at BEFORE INSERT OR UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION protect_profile_deleted_at();
CREATE TRIGGER recipe_drafts_set_updated_at BEFORE UPDATE ON public.recipe_drafts FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER recipe_generation_batches_set_updated_at BEFORE UPDATE ON public.recipe_generation_batches FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER recipe_generation_jobs_set_updated_at BEFORE UPDATE ON public.recipe_generation_jobs FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER recipe_jobs_finalize_recipe_facts BEFORE UPDATE OF recipe_id ON public.recipe_generation_jobs FOR EACH ROW WHEN (((old.recipe_id IS NULL) AND (new.recipe_id IS NOT NULL))) EXECUTE FUNCTION tg_finalize_recipe_facts_on_publish_job();
CREATE TRIGGER trg_recipe_ingredients_auto_match_crop BEFORE INSERT ON public.recipe_ingredients FOR EACH ROW EXECUTE FUNCTION tg_recipe_ingredients_auto_match_crop();
CREATE TRIGGER trg_recipe_ingredients_recalc_nutrition_del AFTER DELETE ON public.recipe_ingredients REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION tg_recipe_ingredients_recalc_nutrition_del();
CREATE TRIGGER trg_recipe_ingredients_recalc_nutrition_ins AFTER INSERT ON public.recipe_ingredients REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION tg_recipe_ingredients_recalc_nutrition_ins();
CREATE TRIGGER trg_recipe_ingredients_recalc_nutrition_upd AFTER UPDATE ON public.recipe_ingredients REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION tg_recipe_ingredients_recalc_nutrition_upd();
CREATE TRIGGER recipe_plan_briefs_set_updated_at BEFORE UPDATE ON public.recipe_plan_briefs FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER recipe_qa_results_set_updated_at BEFORE UPDATE ON public.recipe_qa_results FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE CONSTRAINT TRIGGER recipes_insert_publish_facts_gate AFTER INSERT ON public.recipes DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION tg_require_published_recipe_facts();
CREATE CONSTRAINT TRIGGER recipes_status_publish_facts_gate AFTER UPDATE OF status ON public.recipes DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (((old.status IS DISTINCT FROM 'published'::text) AND (new.status = 'published'::text))) EXECUTE FUNCTION tg_require_published_recipe_facts();
CREATE TRIGGER trg_recipes_servings_recalc_nutrition AFTER UPDATE ON public.recipes FOR EACH ROW WHEN ((old.servings IS DISTINCT FROM new.servings)) EXECUTE FUNCTION tg_recipes_servings_recalc_nutrition();
CREATE TRIGGER trg_recipes_updated_at BEFORE UPDATE ON public.recipes FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================== VIEWS ==============================
-- topologically ordered so a view referencing another view is created after it.
CREATE OR REPLACE VIEW public.admin_recipe_quality_overview AS
 SELECT id,
    slug,
    title,
    status,
    visibility,
    created_at,
    required_equipment IS NOT NULL AND array_length(required_equipment, 1) > 0 AS has_equipment,
    nutrition_source = 'computed'::text AND nutrition_coverage_pct = 100::numeric AS nutrition_complete,
    nutrition_source,
    nutrition_coverage_pct,
    nutrition_reference_version,
    allergen_labels IS NOT NULL AS allergens_reviewed_state,
    allergens_reviewed,
    allergen_labels,
    ( SELECT count(*) AS count
           FROM recipe_ingredients ri
          WHERE ri.recipe_id = r.id) AS ingredient_count,
    ( SELECT count(*) AS count
           FROM recipe_ingredients ri
          WHERE ri.recipe_id = r.id AND ri.crop IS NULL AND ri.free_text_name IS NOT NULL AND ri.nutrition_food_key IS NULL AND ri.nutrition_exclusion_reason IS NULL) AS unresolved_ingredient_count
   FROM recipes r
  WHERE status = 'published'::text AND visibility = 'public'::text;

CREATE OR REPLACE VIEW public.public_certifications AS
 SELECT id,
    farmer_id,
    type,
    verified_at,
    expires_at,
    created_at
   FROM certifications;

CREATE OR REPLACE VIEW public.public_farmer_profiles AS
 SELECT id,
    role,
    name,
    city,
    premium,
    tier,
    referral_code,
    created_at
   FROM profiles
  WHERE role = 'farmer'::user_role;

CREATE OR REPLACE VIEW public.public_parcel_cards AS
 SELECT id,
    farm_id,
    farmer_id,
    name,
    area,
    crops,
    location_label,
    parcel_photo_urls,
    production_method,
    is_primary,
    created_at
   FROM parcels;

CREATE OR REPLACE VIEW public.v_kpi_crop_demand_heatmap AS
 WITH recipe_key_ingredients AS (
         SELECT ri.crop,
            count(DISTINCT ri.recipe_id) AS key_ingredient_recipe_count
           FROM recipe_ingredients ri
             JOIN recipes r ON r.id = ri.recipe_id
          WHERE ri.crop IS NOT NULL AND ri.is_key_ingredient = true AND r.visibility = 'public'::text AND r.status = 'published'::text
          GROUP BY ri.crop
        ), request_canonical AS (
         SELECT cr.id AS crop_request_id,
            cr.requested_by,
            cr.quantity,
            cr.unit,
            cr.region,
            cr.ingredient_class,
            COALESCE(cc_1.crop, lower(TRIM(BOTH FROM cr.crop_name_free_text))) AS crop_key
           FROM crop_requests cr
             LEFT JOIN LATERAL ( SELECT cc_2.crop
                   FROM crop_config cc_2
                  WHERE lower(cc_2.crop) = lower(TRIM(BOTH FROM cr.crop_name_free_text)) OR lower(cc_2.display_name) = lower(TRIM(BOTH FROM cr.crop_name_free_text))
                 LIMIT 1) cc_1 ON true
        ), request_agg AS (
         SELECT rc.crop_key,
            count(DISTINCT rc.requested_by) AS requester_count,
            count(DISTINCT rc.requested_by) FILTER (WHERE rc.ingredient_class = 'tarimsal'::text) AS requester_count_tarimsal,
            count(DISTINCT rc.requested_by) FILTER (WHERE rc.ingredient_class = 'platform_disi'::text) AS requester_count_platform_disi,
            sum(
                CASE
                    WHEN rc.unit IS NULL OR rc.quantity IS NULL THEN NULL::numeric
                    WHEN rc.unit = cc2.default_unit THEN rc.quantity
                    WHEN rc.unit = 'kg'::text AND cc2.default_unit = 'g'::text THEN rc.quantity * 1000::numeric
                    WHEN rc.unit = 'g'::text AND cc2.default_unit = 'kg'::text THEN rc.quantity / 1000::numeric
                    ELSE NULL::numeric
                END) AS total_quantity_normalized,
            array_remove(array_agg(DISTINCT rc.region), NULL::text) AS regions,
            array_agg(DISTINCT rc.crop_request_id) AS crop_request_ids
           FROM request_canonical rc
             LEFT JOIN crop_config cc2 ON cc2.crop = rc.crop_key
          GROUP BY rc.crop_key
        ), request_recipes AS (
         SELECT rc.crop_key,
            array_agg(DISTINCT r.title) AS requested_recipe_titles
           FROM request_canonical rc
             JOIN recipe_rfq_links rl ON rl.crop_request_id = rc.crop_request_id
             JOIN recipes r ON r.id = rl.recipe_id
          GROUP BY rc.crop_key
        ), all_crops AS (
         SELECT recipe_key_ingredients.crop
           FROM recipe_key_ingredients
        UNION
         SELECT request_agg.crop_key
           FROM request_agg
        )
 SELECT ac.crop,
    COALESCE(cc.display_name, ac.crop) AS crop_display_name,
    COALESCE(rki.key_ingredient_recipe_count, 0::bigint) AS key_ingredient_recipe_count,
    COALESCE(ra.requester_count, 0::bigint) AS requester_count,
    ra.total_quantity_normalized,
    cc.default_unit AS normalized_unit,
    COALESCE(ra.regions, '{}'::text[]) AS regions,
    COALESCE(rr.requested_recipe_titles, '{}'::text[]) AS requested_recipe_titles,
    (EXISTS ( SELECT 1
           FROM listings l
          WHERE l.crop = ac.crop AND l.status = 'active'::listing_status)) AS has_active_listing,
    COALESCE(ra.requester_count_tarimsal, 0::bigint) AS requester_count_tarimsal,
    COALESCE(ra.requester_count_platform_disi, 0::bigint) AS requester_count_platform_disi
   FROM all_crops ac
     LEFT JOIN crop_config cc ON cc.crop = ac.crop
     LEFT JOIN recipe_key_ingredients rki ON rki.crop = ac.crop
     LEFT JOIN request_agg ra ON ra.crop_key = ac.crop
     LEFT JOIN request_recipes rr ON rr.crop_key = ac.crop
  ORDER BY (COALESCE(ra.requester_count, 0::bigint)) DESC, (COALESCE(rki.key_ingredient_recipe_count, 0::bigint)) DESC, ac.crop;

CREATE OR REPLACE VIEW public.v_kpi_farmer_activation AS
 WITH farmer_first_listing AS (
         SELECT p.id AS farmer_id,
            p.created_at AS signup_at,
            min(l.created_at) AS first_listing_at
           FROM profiles p
             LEFT JOIN listings l ON l.farmer_id = p.id
          WHERE p.role = 'farmer'::user_role
          GROUP BY p.id, p.created_at
        )
 SELECT count(*) AS total_farmers,
    count(*) FILTER (WHERE first_listing_at IS NOT NULL) AS farmers_with_listing,
    round(EXTRACT(epoch FROM percentile_cont(0.5::double precision) WITHIN GROUP (ORDER BY (first_listing_at - signup_at)) FILTER (WHERE first_listing_at IS NOT NULL)) / 3600.0, 1) AS median_hours_to_first_listing,
        CASE
            WHEN count(*) = 0 THEN NULL::numeric
            ELSE round(100.0 * count(*) FILTER (WHERE first_listing_at IS NOT NULL AND first_listing_at <= (signup_at + '7 days'::interval))::numeric / count(*)::numeric, 2)
        END AS pct_listing_within_7d
   FROM farmer_first_listing;

CREATE OR REPLACE VIEW public.v_kpi_farmer_sellthrough AS
 WITH listing_first_order AS (
         SELECT l.id AS listing_id,
            l.created_at AS listing_created_at,
            min(ord.created_at) AS first_order_at
           FROM listings l
             LEFT JOIN offers o ON o.listing_id = l.id
             LEFT JOIN orders ord ON ord.offer_id = o.id
          GROUP BY l.id, l.created_at
        ), eligible AS (
         SELECT listing_first_order.listing_id,
            listing_first_order.listing_created_at,
            listing_first_order.first_order_at
           FROM listing_first_order
          WHERE listing_first_order.listing_created_at <= (now() - '30 days'::interval)
        )
 SELECT count(*) AS eligible_listings,
    count(*) FILTER (WHERE first_order_at IS NOT NULL AND first_order_at <= (listing_created_at + '30 days'::interval)) AS sold_within_30d,
        CASE
            WHEN count(*) = 0 THEN NULL::numeric
            ELSE round(100.0 * count(*) FILTER (WHERE first_order_at IS NOT NULL AND first_order_at <= (listing_created_at + '30 days'::interval))::numeric / count(*)::numeric, 2)
        END AS sellthrough_30d_pct
   FROM eligible;

CREATE OR REPLACE VIEW public.v_kpi_farmer_verified_pct AS
 WITH active_farmers AS (
         SELECT DISTINCT listings.farmer_id
           FROM listings
        ), verified AS (
         SELECT DISTINCT c.farmer_id
           FROM certifications c
          WHERE c.verified_at IS NOT NULL AND (c.expires_at IS NULL OR c.expires_at > now())
        )
 SELECT ( SELECT count(*) AS count
           FROM active_farmers) AS active_farmer_count,
    ( SELECT count(*) AS count
           FROM active_farmers af
          WHERE (af.farmer_id IN ( SELECT verified.farmer_id
                   FROM verified))) AS verified_active_farmer_count,
        CASE
            WHEN (( SELECT count(*) AS count
               FROM active_farmers)) = 0 THEN NULL::numeric
            ELSE round(100.0 * (( SELECT count(*) AS count
               FROM active_farmers af
              WHERE (af.farmer_id IN ( SELECT verified.farmer_id
                       FROM verified))))::numeric / (( SELECT count(*) AS count
               FROM active_farmers))::numeric, 2)
        END AS verified_pct;

CREATE OR REPLACE VIEW public.v_kpi_listing_offer_rate AS
 WITH listing_first_offer AS (
         SELECT l.id AS listing_id,
            l.created_at AS listing_created_at,
            min(o.created_at) AS first_offer_at
           FROM listings l
             LEFT JOIN offers o ON o.listing_id = l.id
          GROUP BY l.id, l.created_at
        ), eligible AS (
         SELECT listing_first_offer.listing_id,
            listing_first_offer.listing_created_at,
            listing_first_offer.first_offer_at
           FROM listing_first_offer
          WHERE listing_first_offer.listing_created_at <= (now() - '14 days'::interval)
        )
 SELECT count(*) AS eligible_listings,
    count(*) FILTER (WHERE first_offer_at IS NOT NULL AND first_offer_at <= (listing_created_at + '14 days'::interval)) AS listings_with_offer_14d,
        CASE
            WHEN count(*) = 0 THEN NULL::numeric
            ELSE round(100.0 * count(*) FILTER (WHERE first_offer_at IS NOT NULL AND first_offer_at <= (listing_created_at + '14 days'::interval))::numeric / count(*)::numeric, 2)
        END AS offer_rate_14d_pct,
    round(EXTRACT(epoch FROM percentile_cont(0.5::double precision) WITHIN GROUP (ORDER BY (first_offer_at - listing_created_at)) FILTER (WHERE first_offer_at IS NOT NULL)) / 3600.0, 1) AS median_hours_to_first_offer
   FROM eligible;

CREATE OR REPLACE VIEW public.v_kpi_offer_conversion AS
 WITH offer_to_order AS (
         SELECT o.id AS offer_id,
            o.created_at AS offer_created_at,
            ord.created_at AS order_created_at
           FROM offers o
             LEFT JOIN orders ord ON ord.offer_id = o.id
        )
 SELECT count(*) AS total_offers,
    count(*) FILTER (WHERE order_created_at IS NOT NULL) AS converted_offers,
        CASE
            WHEN count(*) = 0 THEN NULL::numeric
            ELSE round(100.0 * count(*) FILTER (WHERE order_created_at IS NOT NULL)::numeric / count(*)::numeric, 2)
        END AS conversion_pct,
    round(EXTRACT(epoch FROM percentile_cont(0.5::double precision) WITHIN GROUP (ORDER BY (order_created_at - offer_created_at)) FILTER (WHERE order_created_at IS NOT NULL)) / 3600.0, 1) AS median_hours_offer_to_order
   FROM offer_to_order;

CREATE OR REPLACE VIEW public.v_kpi_order_base AS
 SELECT o.id AS order_id,
    o.order_ref,
    o.status AS order_status,
    o.created_at,
    o.buyer_id,
    o.farmer_id,
    o.offer_id,
    fo.payment_status,
    l.crop,
    fp.city AS farmer_city,
    bpr.company_type AS buyer_company_type,
    COALESCE(fo.current_price, fo.price_per_unit) * COALESCE(fo.current_quantity, fo.quantity) AS amount,
    o.status = ANY (ARRAY['delivered'::order_status, 'completed'::order_status]) AS reached_delivery,
    (o.status = ANY (ARRAY['delivered'::order_status, 'completed'::order_status])) AND fo.payment_status = 'paid'::text AS is_realized_sale,
    (EXISTS ( SELECT 1
           FROM disputes d
          WHERE d.order_id = o.id)) AS has_dispute
   FROM orders o
     JOIN offers fo ON fo.id = o.offer_id
     LEFT JOIN listings l ON l.id = fo.listing_id
     LEFT JOIN profiles fp ON fp.id = o.farmer_id
     LEFT JOIN buyer_profiles bpr ON bpr.user_id = o.buyer_id;

CREATE OR REPLACE VIEW public.v_kpi_price_vs_market AS
 WITH hasat_price AS (
         SELECT price_history.crop,
            date_trunc('month'::text, price_history.recorded_date::timestamp with time zone)::date AS month,
            avg(price_history.price_per_unit) AS hasat_avg_price
           FROM price_history
          WHERE price_history.source = 'order'::text
          GROUP BY price_history.crop, (date_trunc('month'::text, price_history.recorded_date::timestamp with time zone))
        ), market_price AS (
         SELECT price_history.crop,
            date_trunc('month'::text, price_history.recorded_date::timestamp with time zone)::date AS month,
            avg(price_history.price_per_unit) AS market_avg_price
           FROM price_history
          WHERE price_history.source = 'external'::text
          GROUP BY price_history.crop, (date_trunc('month'::text, price_history.recorded_date::timestamp with time zone))
        )
 SELECT h.crop,
    h.month,
    round(h.hasat_avg_price, 2) AS hasat_avg_price,
    round(m.market_avg_price, 2) AS market_avg_price,
        CASE
            WHEN m.market_avg_price IS NULL OR m.market_avg_price = 0::numeric THEN NULL::numeric
            ELSE round(100.0 * (h.hasat_avg_price - m.market_avg_price) / m.market_avg_price, 2)
        END AS price_diff_pct
   FROM hasat_price h
     JOIN market_price m ON m.crop = h.crop AND m.month = h.month
  ORDER BY h.crop, h.month;

CREATE OR REPLACE VIEW public.v_kpi_recipe_funnel AS
 WITH v AS (
         SELECT date_trunc('month'::text, rv.created_at)::date AS month,
            count(*) AS recipe_views,
            count(DISTINCT COALESCE(rv.user_id::text, rv.session_id)) AS unique_viewers
           FROM recipe_views rv
          GROUP BY (date_trunc('month'::text, rv.created_at)::date)
        ), s AS (
         SELECT date_trunc('month'::text, rs.created_at)::date AS month,
            count(*) AS recipe_saves
           FROM recipe_saves rs
          GROUP BY (date_trunc('month'::text, rs.created_at)::date)
        ), req AS (
         SELECT date_trunc('month'::text, cr.created_at)::date AS month,
            count(DISTINCT cr.id) AS recipe_requests
           FROM recipe_rfq_links lnk
             JOIN crop_requests cr ON cr.id = lnk.crop_request_id
          GROUP BY (date_trunc('month'::text, cr.created_at)::date)
        ), off AS (
         SELECT date_trunc('month'::text, o.created_at)::date AS month,
            count(*) AS recipe_offers,
            count(*) FILTER (WHERE (EXISTS ( SELECT 1
                   FROM orders od
                  WHERE od.offer_id = o.id))) AS recipe_offers_converted
           FROM offers o
          WHERE o.source_recipe_id IS NOT NULL
          GROUP BY (date_trunc('month'::text, o.created_at)::date)
        ), ords AS (
         SELECT date_trunc('month'::text, od.created_at)::date AS month,
            count(*) AS recipe_orders
           FROM orders od
             JOIN offers o ON o.id = od.offer_id
          WHERE o.source_recipe_id IS NOT NULL
          GROUP BY (date_trunc('month'::text, od.created_at)::date)
        ), months AS (
         SELECT v_1.month
           FROM v v_1
        UNION
         SELECT s_1.month
           FROM s s_1
        UNION
         SELECT req_1.month
           FROM req req_1
        UNION
         SELECT off_1.month
           FROM off off_1
        UNION
         SELECT ords_1.month
           FROM ords ords_1
        )
 SELECT m.month,
    COALESCE(v.recipe_views, 0::bigint) AS recipe_views,
    COALESCE(v.unique_viewers, 0::bigint) AS unique_viewers,
    COALESCE(s.recipe_saves, 0::bigint) AS recipe_saves,
    COALESCE(req.recipe_requests, 0::bigint) AS recipe_requests,
    COALESCE(off.recipe_offers, 0::bigint) AS recipe_offers,
    COALESCE(ords.recipe_orders, 0::bigint) AS recipe_orders,
    COALESCE(off.recipe_offers_converted, 0::bigint) AS recipe_offers_converted,
        CASE
            WHEN COALESCE(v.recipe_views, 0::bigint) = 0 THEN NULL::numeric
            ELSE round(100.0 * COALESCE(s.recipe_saves, 0::bigint)::numeric / v.recipe_views::numeric, 2)
        END AS view_to_save_pct,
        CASE
            WHEN COALESCE(off.recipe_offers, 0::bigint) = 0 THEN NULL::numeric
            ELSE round(100.0 * COALESCE(off.recipe_offers_converted, 0::bigint)::numeric / off.recipe_offers::numeric, 2)
        END AS offer_to_order_pct
   FROM months m
     LEFT JOIN v ON v.month = m.month
     LEFT JOIN s ON s.month = m.month
     LEFT JOIN req ON req.month = m.month
     LEFT JOIN off ON off.month = m.month
     LEFT JOIN ords ON ords.month = m.month
  ORDER BY m.month;

CREATE OR REPLACE VIEW public.v_kpi_recipe_funnel_by_recipe AS
 WITH v AS (
         SELECT recipe_views.recipe_id,
            count(*) AS recipe_views,
            count(DISTINCT COALESCE(recipe_views.user_id::text, recipe_views.session_id)) AS unique_viewers
           FROM recipe_views
          GROUP BY recipe_views.recipe_id
        ), s AS (
         SELECT recipe_saves.recipe_id,
            count(*) AS recipe_saves
           FROM recipe_saves
          GROUP BY recipe_saves.recipe_id
        ), req AS (
         SELECT lnk.recipe_id,
            count(DISTINCT cr.id) AS recipe_requests
           FROM recipe_rfq_links lnk
             JOIN crop_requests cr ON cr.id = lnk.crop_request_id
          GROUP BY lnk.recipe_id
        ), off AS (
         SELECT o.source_recipe_id AS recipe_id,
            count(*) AS recipe_offers,
            count(*) FILTER (WHERE (EXISTS ( SELECT 1
                   FROM orders od
                  WHERE od.offer_id = o.id))) AS recipe_offers_converted
           FROM offers o
          WHERE o.source_recipe_id IS NOT NULL
          GROUP BY o.source_recipe_id
        ), ords AS (
         SELECT o.source_recipe_id AS recipe_id,
            count(*) AS recipe_orders
           FROM orders od
             JOIN offers o ON o.id = od.offer_id
          WHERE o.source_recipe_id IS NOT NULL
          GROUP BY o.source_recipe_id
        )
 SELECT r.id AS recipe_id,
    r.slug,
    r.title,
    COALESCE(v.recipe_views, 0::bigint) AS recipe_views,
    COALESCE(v.unique_viewers, 0::bigint) AS unique_viewers,
    COALESCE(s.recipe_saves, 0::bigint) AS recipe_saves,
    COALESCE(req.recipe_requests, 0::bigint) AS recipe_requests,
    COALESCE(off.recipe_offers, 0::bigint) AS recipe_offers,
    COALESCE(ords.recipe_orders, 0::bigint) AS recipe_orders,
    COALESCE(off.recipe_offers_converted, 0::bigint) AS recipe_offers_converted,
        CASE
            WHEN COALESCE(v.recipe_views, 0::bigint) = 0 THEN NULL::numeric
            ELSE round(100.0 * COALESCE(s.recipe_saves, 0::bigint)::numeric / v.recipe_views::numeric, 2)
        END AS view_to_save_pct,
        CASE
            WHEN COALESCE(off.recipe_offers, 0::bigint) = 0 THEN NULL::numeric
            ELSE round(100.0 * COALESCE(off.recipe_offers_converted, 0::bigint)::numeric / off.recipe_offers::numeric, 2)
        END AS offer_to_order_pct
   FROM recipes r
     LEFT JOIN v ON v.recipe_id = r.id
     LEFT JOIN s ON s.recipe_id = r.id
     LEFT JOIN req ON req.recipe_id = r.id
     LEFT JOIN off ON off.recipe_id = r.id
     LEFT JOIN ords ON ords.recipe_id = r.id
  WHERE r.visibility = 'public'::text AND r.status = 'published'::text
  ORDER BY r.title;

CREATE OR REPLACE VIEW public.v_kpi_review_avg AS
 SELECT COALESCE(reviewee_profile.role::text, 'genel'::text) AS reviewee_role,
    reviews.reviewee_id,
    count(*) AS review_count,
    round(avg(reviews.rating), 2) AS avg_rating
   FROM reviews reviews
     LEFT JOIN profiles reviewee_profile ON reviewee_profile.id = reviews.reviewee_id
  GROUP BY GROUPING SETS ((reviewee_profile.role, reviews.reviewee_id), (reviewee_profile.role), ());

CREATE OR REPLACE VIEW public.v_kpi_supply_density AS
 WITH cells AS (
         SELECT p.city AS region,
            l.crop,
            count(DISTINCT l.farmer_id) AS farmer_count
           FROM listings l
             JOIN profiles p ON p.id = l.farmer_id
          WHERE l.status = 'active'::listing_status AND p.city IS NOT NULL
          GROUP BY p.city, l.crop
        )
 SELECT count(*) AS total_cells,
    count(*) FILTER (WHERE farmer_count >= 3) AS dense_cells,
        CASE
            WHEN count(*) = 0 THEN NULL::numeric
            ELSE round(100.0 * count(*) FILTER (WHERE farmer_count >= 3)::numeric / count(*)::numeric, 2)
        END AS dense_cell_pct
   FROM cells;

CREATE OR REPLACE VIEW public.v_recipe_coverage AS
 WITH ing AS (
         SELECT i.recipe_id,
            i.id,
            i.crop,
            i.is_key_ingredient
           FROM recipe_ingredients i
          WHERE i.crop IS NULL OR (EXISTS ( SELECT 1
                   FROM crop_culinary_meta m
                  WHERE m.crop = i.crop AND m.is_edible))
        ), avail AS (
         SELECT DISTINCT l.crop
           FROM listings l
          WHERE l.status = 'active'::listing_status
        )
 SELECT r.id AS recipe_id,
    r.slug,
    r.title,
    r.visibility,
    r.status,
    count(ing.id)::integer AS ingredient_count,
    count(ing.id) FILTER (WHERE ing.crop IS NOT NULL)::integer AS crop_linked_count,
    count(ing.id) FILTER (WHERE ing.crop IS NULL)::integer AS off_platform_count,
    count(ing.id) FILTER (WHERE ing.crop IS NOT NULL AND (ing.crop IN ( SELECT avail.crop
           FROM avail)))::integer AS available_count,
    count(ing.id) FILTER (WHERE ing.is_key_ingredient AND ing.crop IS NOT NULL AND (ing.crop IN ( SELECT avail.crop
           FROM avail)))::integer AS key_available_count,
    count(ing.id) FILTER (WHERE ing.is_key_ingredient)::integer AS key_ingredient_count,
        CASE
            WHEN count(ing.id) FILTER (WHERE ing.crop IS NOT NULL) = 0 THEN NULL::numeric
            ELSE round(100.0 * count(ing.id) FILTER (WHERE ing.crop IS NOT NULL AND (ing.crop IN ( SELECT avail.crop
               FROM avail)))::numeric / count(ing.id) FILTER (WHERE ing.crop IS NOT NULL)::numeric, 1)
        END AS coverage_pct
   FROM recipes r
     LEFT JOIN ing ON ing.recipe_id = r.id
  GROUP BY r.id, r.slug, r.title, r.visibility, r.status;

CREATE OR REPLACE VIEW public.v_routine_maintenance_status AS
 WITH prefs AS (
         SELECT fjp.id AS pref_id,
            fjp.farmer_id,
            fjp.entry_type_id,
            fjp.threshold_note,
            COALESCE(fjp.frequency_days, jet.default_frequency_days) AS frequency_days,
            jet.crop AS entry_type_crop,
            jet.name AS entry_type_name,
            jet.icon AS entry_type_icon,
            jet.work_type_key
           FROM farmer_journal_prefs fjp
             JOIN journal_entry_types jet ON jet.id = fjp.entry_type_id
          WHERE fjp.is_active = true
        ), exploded AS (
         SELECT pr.pref_id,
            pr.farmer_id,
            pr.entry_type_id,
            pr.threshold_note,
            pr.frequency_days,
            pr.entry_type_name,
            pr.entry_type_icon,
            pr.work_type_key,
            p.id AS parcel_id,
            p.name AS parcel_name,
            pc.crop
           FROM prefs pr
             JOIN parcels p ON p.farmer_id = pr.farmer_id
             CROSS JOIN LATERAL unnest(
                CASE
                    WHEN pr.entry_type_crop IS NOT NULL THEN ARRAY[pr.entry_type_crop]
                    ELSE p.crops
                END) pc(crop)
          WHERE pr.entry_type_crop IS NULL OR (EXISTS ( SELECT 1
                   FROM unnest(p.crops) c(crop)
                  WHERE lower(c.crop) = lower(pr.entry_type_crop)))
        ), last_done AS (
         SELECT harvest_entries.journal_entry_type_id,
            harvest_entries.parcel_id,
            harvest_entries.crop,
            max(harvest_entries.harvest_date) AS last_performed_date
           FROM harvest_entries
          WHERE harvest_entries.journal_entry_type_id IS NOT NULL
          GROUP BY harvest_entries.journal_entry_type_id, harvest_entries.parcel_id, harvest_entries.crop
        )
 SELECT e.pref_id,
    e.farmer_id,
    e.parcel_id,
    e.parcel_name,
    e.crop,
    e.entry_type_id,
    e.entry_type_name,
    e.entry_type_icon,
    e.work_type_key,
    e.frequency_days,
    e.threshold_note,
    ld.last_performed_date,
        CASE
            WHEN ld.last_performed_date IS NOT NULL AND e.frequency_days IS NOT NULL THEN ld.last_performed_date + e.frequency_days
            ELSE NULL::date
        END AS next_due_date,
    ld.last_performed_date IS NULL AS never_performed,
    e.frequency_days IS NULL AS is_event_based,
        CASE
            WHEN ld.last_performed_date IS NULL THEN false
            WHEN e.frequency_days IS NULL THEN false
            ELSE (ld.last_performed_date + e.frequency_days) < CURRENT_DATE
        END AS is_overdue
   FROM exploded e
     LEFT JOIN last_done ld ON ld.journal_entry_type_id = e.entry_type_id AND ld.parcel_id = e.parcel_id AND ld.crop = e.crop;

CREATE OR REPLACE VIEW public.v_kpi_buyer_activation AS
 WITH buyer_first_order AS (
         SELECT p.id AS buyer_id,
            p.created_at AS signup_at,
            p.buyer_type,
            min(ob.created_at) AS first_order_at
           FROM profiles p
             LEFT JOIN v_kpi_order_base ob ON ob.buyer_id = p.id AND ob.reached_delivery
          WHERE p.role = 'buyer'::user_role
          GROUP BY p.id, p.created_at, p.buyer_type
        )
 SELECT count(*) AS total_buyers,
    count(*) FILTER (WHERE first_order_at IS NOT NULL) AS buyers_with_order,
    round(EXTRACT(epoch FROM percentile_cont(0.5::double precision) WITHIN GROUP (ORDER BY (first_order_at - signup_at)) FILTER (WHERE first_order_at IS NOT NULL)) / 86400.0, 1) AS median_days_to_first_order
   FROM buyer_first_order;

CREATE OR REPLACE VIEW public.v_kpi_buyer_aov_segment AS
 SELECT
        CASE
            WHEN GROUPING(company_type_text) = 1 THEN 'genel'::text
            WHEN company_type_text IS NULL THEN 'bilinmiyor'::text
            ELSE company_type_text
        END AS segment,
    count(*) FILTER (WHERE is_realized_sale) AS realized_order_count,
    round(avg(amount) FILTER (WHERE is_realized_sale), 2) AS aov
   FROM ( SELECT order_base.buyer_company_type::text AS company_type_text,
            order_base.is_realized_sale,
            order_base.amount
           FROM v_kpi_order_base order_base) seg
  GROUP BY GROUPING SETS ((company_type_text), ());

CREATE OR REPLACE VIEW public.v_kpi_buyer_gmv_retention AS
 WITH buyer_cohort AS (
         SELECT order_base.buyer_id,
            date_trunc('month'::text, min(order_base.created_at) FILTER (WHERE order_base.is_realized_sale)) AS cohort_month
           FROM v_kpi_order_base order_base
          GROUP BY order_base.buyer_id
         HAVING min(order_base.created_at) FILTER (WHERE order_base.is_realized_sale) IS NOT NULL
        ), monthly_gmv AS (
         SELECT order_base.buyer_id,
            date_trunc('month'::text, order_base.created_at) AS order_month,
            sum(order_base.amount) AS gmv
           FROM v_kpi_order_base order_base
          WHERE order_base.is_realized_sale
          GROUP BY order_base.buyer_id, (date_trunc('month'::text, order_base.created_at))
        ), cohort_m0 AS (
         SELECT bc.buyer_id,
            bc.cohort_month,
            mg.gmv AS m0_gmv
           FROM buyer_cohort bc
             JOIN monthly_gmv mg ON mg.buyer_id = bc.buyer_id AND mg.order_month = bc.cohort_month
        ), cohort_m1 AS (
         SELECT bc.buyer_id,
            mg.gmv AS m1_gmv
           FROM buyer_cohort bc
             LEFT JOIN monthly_gmv mg ON mg.buyer_id = bc.buyer_id AND mg.order_month = (bc.cohort_month + '1 mon'::interval)
        )
 SELECT cohort_m0.cohort_month::date AS cohort_month,
    count(*) AS cohort_buyers,
    round(sum(cohort_m0.m0_gmv), 2) AS m0_gmv_total,
    round(COALESCE(sum(cohort_m1.m1_gmv), 0::numeric), 2) AS m1_gmv_total,
        CASE
            WHEN sum(cohort_m0.m0_gmv) = 0::numeric THEN NULL::numeric
            ELSE round(100.0 * COALESCE(sum(cohort_m1.m1_gmv), 0::numeric) / sum(cohort_m0.m0_gmv), 2)
        END AS m1_gmv_retention_pct
   FROM cohort_m0
     JOIN cohort_m1 ON cohort_m1.buyer_id = cohort_m0.buyer_id
  GROUP BY cohort_m0.cohort_month
  ORDER BY (cohort_m0.cohort_month::date);

CREATE OR REPLACE VIEW public.v_kpi_buyer_repeat_rate AS
 WITH buyer_orders AS (
         SELECT order_base.buyer_id,
            order_base.buyer_company_type,
            count(*) FILTER (WHERE order_base.reached_delivery) AS delivered_order_count
           FROM v_kpi_order_base order_base
          GROUP BY order_base.buyer_id, order_base.buyer_company_type
        )
 SELECT COALESCE(buyer_company_type::text, 'genel'::text) AS segment,
    count(*) FILTER (WHERE delivered_order_count >= 1) AS active_buyers,
    count(*) FILTER (WHERE delivered_order_count >= 2) AS repeat_buyers,
        CASE
            WHEN count(*) FILTER (WHERE delivered_order_count >= 1) = 0 THEN NULL::numeric
            ELSE round(100.0 * count(*) FILTER (WHERE delivered_order_count >= 2)::numeric / count(*) FILTER (WHERE delivered_order_count >= 1)::numeric, 2)
        END AS repeat_buyer_rate_pct
   FROM buyer_orders
  WHERE delivered_order_count >= 1
  GROUP BY GROUPING SETS (((buyer_company_type::text)), ());

CREATE OR REPLACE VIEW public.v_kpi_buyer_seller_ratio AS
 WITH region_activity AS (
         SELECT v_kpi_order_base.farmer_city AS region,
            v_kpi_order_base.farmer_id,
            NULL::uuid AS buyer_id
           FROM v_kpi_order_base
          WHERE v_kpi_order_base.is_realized_sale
        UNION ALL
         SELECT v_kpi_order_base.farmer_city AS region,
            NULL::uuid AS farmer_id,
            v_kpi_order_base.buyer_id
           FROM v_kpi_order_base
          WHERE v_kpi_order_base.is_realized_sale
        )
 SELECT
        CASE
            WHEN GROUPING(region) = 1 THEN 'genel'::text
            ELSE COALESCE(region, 'bilinmiyor'::text)
        END AS region,
    count(DISTINCT buyer_id) AS active_buyer_count,
    count(DISTINCT farmer_id) AS active_farmer_count,
        CASE
            WHEN count(DISTINCT farmer_id) = 0 THEN NULL::numeric
            ELSE round(count(DISTINCT buyer_id)::numeric / count(DISTINCT farmer_id)::numeric, 2)
        END AS buyer_to_seller_ratio
   FROM region_activity ra
  GROUP BY GROUPING SETS ((region), ());

CREATE OR REPLACE VIEW public.v_kpi_dispute_rate AS
 SELECT date_trunc('month'::text, created_at)::date AS month,
    count(*) FILTER (WHERE reached_delivery) AS delivered_or_completed_orders,
    count(*) FILTER (WHERE reached_delivery AND has_dispute) AS disputed_orders,
        CASE
            WHEN count(*) FILTER (WHERE reached_delivery) = 0 THEN NULL::numeric
            ELSE round(100.0 * count(*) FILTER (WHERE reached_delivery AND has_dispute)::numeric / count(*) FILTER (WHERE reached_delivery)::numeric, 2)
        END AS dispute_rate_pct
   FROM v_kpi_order_base order_base
  GROUP BY (date_trunc('month'::text, created_at)::date)
  ORDER BY (date_trunc('month'::text, created_at)::date);

CREATE OR REPLACE VIEW public.v_kpi_farmer_gmv AS
 SELECT date_trunc('month'::text, created_at)::date AS month,
    count(DISTINCT farmer_id) FILTER (WHERE is_realized_sale) AS active_farmers,
    COALESCE(sum(amount) FILTER (WHERE is_realized_sale), 0::numeric) AS total_gmv,
        CASE
            WHEN count(DISTINCT farmer_id) FILTER (WHERE is_realized_sale) = 0 THEN NULL::numeric
            ELSE round(COALESCE(sum(amount) FILTER (WHERE is_realized_sale), 0::numeric) / count(DISTINCT farmer_id) FILTER (WHERE is_realized_sale)::numeric, 2)
        END AS gmv_per_active_farmer
   FROM v_kpi_order_base order_base
  GROUP BY (date_trunc('month'::text, created_at)::date)
  ORDER BY (date_trunc('month'::text, created_at)::date);

CREATE OR REPLACE VIEW public.v_kpi_farmer_retention AS
 WITH farmer_cohort AS (
         SELECT order_base.farmer_id,
            date_trunc('month'::text, min(order_base.created_at) FILTER (WHERE order_base.is_realized_sale)) AS cohort_month
           FROM v_kpi_order_base order_base
          GROUP BY order_base.farmer_id
         HAVING min(order_base.created_at) FILTER (WHERE order_base.is_realized_sale) IS NOT NULL
        ), farmer_active_months AS (
         SELECT DISTINCT v_kpi_order_base.farmer_id,
            date_trunc('month'::text, v_kpi_order_base.created_at) AS active_month
           FROM v_kpi_order_base
          WHERE v_kpi_order_base.is_realized_sale
        )
 SELECT cohort_month::date AS cohort_month,
    count(*) AS cohort_farmers,
    count(*) FILTER (WHERE (EXISTS ( SELECT 1
           FROM farmer_active_months fam
          WHERE fam.farmer_id = fc.farmer_id AND fam.active_month = (fc.cohort_month + '1 mon'::interval)))) AS retained_m1,
    count(*) FILTER (WHERE (EXISTS ( SELECT 1
           FROM farmer_active_months fam
          WHERE fam.farmer_id = fc.farmer_id AND fam.active_month = (fc.cohort_month + '3 mons'::interval)))) AS retained_m3,
        CASE
            WHEN count(*) = 0 THEN NULL::numeric
            ELSE round(100.0 * count(*) FILTER (WHERE (EXISTS ( SELECT 1
               FROM farmer_active_months fam
              WHERE fam.farmer_id = fc.farmer_id AND fam.active_month = (fc.cohort_month + '1 mon'::interval))))::numeric / count(*)::numeric, 2)
        END AS m1_retention_pct,
        CASE
            WHEN count(*) = 0 THEN NULL::numeric
            ELSE round(100.0 * count(*) FILTER (WHERE (EXISTS ( SELECT 1
               FROM farmer_active_months fam
              WHERE fam.farmer_id = fc.farmer_id AND fam.active_month = (fc.cohort_month + '3 mons'::interval))))::numeric / count(*)::numeric, 2)
        END AS m3_retention_pct
   FROM farmer_cohort fc
  GROUP BY cohort_month
  ORDER BY (cohort_month::date);

CREATE OR REPLACE VIEW public.v_kpi_full_acceptance_rate AS
 SELECT date_trunc('month'::text, created_at)::date AS month,
    count(*) FILTER (WHERE reached_delivery) AS delivered_or_completed_orders,
    count(*) FILTER (WHERE reached_delivery AND NOT has_dispute) AS fully_accepted_orders,
        CASE
            WHEN count(*) FILTER (WHERE reached_delivery) = 0 THEN NULL::numeric
            ELSE round(100.0 * count(*) FILTER (WHERE reached_delivery AND NOT has_dispute)::numeric / count(*) FILTER (WHERE reached_delivery)::numeric, 2)
        END AS full_acceptance_rate_pct
   FROM v_kpi_order_base order_base
  GROUP BY (date_trunc('month'::text, created_at)::date)
  ORDER BY (date_trunc('month'::text, created_at)::date);

CREATE OR REPLACE VIEW public.v_kpi_horeca_order_frequency AS
 WITH horeca_orders AS (
         SELECT order_base.buyer_id,
            count(*) AS order_count,
            min(order_base.created_at) AS first_order_at,
            max(order_base.created_at) AS last_order_at
           FROM v_kpi_order_base order_base
          WHERE order_base.reached_delivery AND (order_base.buyer_company_type = ANY (ARRAY['restoran'::company_type, 'otel'::company_type]))
          GROUP BY order_base.buyer_id
         HAVING count(*) >= 2
        ), with_freq AS (
         SELECT horeca_orders.buyer_id,
            horeca_orders.order_count,
            GREATEST(1.0, EXTRACT(epoch FROM horeca_orders.last_order_at - horeca_orders.first_order_at) / 604800.0) AS active_weeks,
            horeca_orders.order_count::numeric / GREATEST(1.0, EXTRACT(epoch FROM horeca_orders.last_order_at - horeca_orders.first_order_at) / 604800.0) AS weekly_frequency
           FROM horeca_orders
        )
 SELECT count(*) AS horeca_buyers_with_2plus_orders,
    round(avg(weekly_frequency), 2) AS avg_weekly_order_frequency,
    round(percentile_cont(0.5::double precision) WITHIN GROUP (ORDER BY (weekly_frequency::double precision))::numeric, 2) AS median_weekly_order_frequency
   FROM with_freq;

CREATE OR REPLACE VIEW public.v_kpi_north_star AS
 SELECT date_trunc('month'::text, created_at)::date AS month,
    COALESCE(sum(amount) FILTER (WHERE is_realized_sale), 0::numeric) AS total_gmv,
    COALESCE(sum(amount) FILTER (WHERE is_realized_sale AND NOT has_dispute), 0::numeric) AS dispute_free_gmv,
        CASE
            WHEN COALESCE(sum(amount) FILTER (WHERE is_realized_sale), 0::numeric) = 0::numeric THEN NULL::numeric
            ELSE round(100.0 * COALESCE(sum(amount) FILTER (WHERE is_realized_sale AND NOT has_dispute), 0::numeric) / sum(amount) FILTER (WHERE is_realized_sale), 2)
        END AS dispute_free_share_pct
   FROM v_kpi_order_base order_base
  GROUP BY (date_trunc('month'::text, created_at)::date)
  ORDER BY (date_trunc('month'::text, created_at)::date);


-- ============================== ROW LEVEL SECURITY: ENABLE ==============================
ALTER TABLE private.admin_sms_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_customize_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buyer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buyer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.certifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crop_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crop_culinary_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crop_journal_glossary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crop_market_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crop_nutrition ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crop_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crop_type_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farmer_journal_prefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.harvest_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.harvest_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.indoor_interest_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingredient_measure_reference ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingredient_nutrition_alias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingredient_nutrition_reference ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entry_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_harvest_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_tool_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mobile_handoff_nonces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notif_prefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offer_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offer_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_timeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parcels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_admin_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_generation_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_generation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_generation_stage_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_ingredient_nutrition_backfill_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_plan_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_qa_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_rfq_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_saves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_qualifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

-- ============================== ROW LEVEL SECURITY: POLICIES ==============================
CREATE POLICY ai_chat_messages_insert_own ON public.ai_chat_messages FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));
CREATE POLICY ai_chat_messages_select_own ON public.ai_chat_messages FOR SELECT TO authenticated USING ((auth.uid() = user_id));
CREATE POLICY "ai_customize_requests own insert" ON public.ai_customize_requests FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "ai_customize_requests own select" ON public.ai_customize_requests FOR SELECT TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY "ai_customize_requests own update" ON public.ai_customize_requests FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY ai_usage_insert_own ON public.ai_usage_tracking FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));
CREATE POLICY ai_usage_select_own ON public.ai_usage_tracking FOR SELECT TO authenticated USING ((auth.uid() = user_id));
CREATE POLICY ai_usage_update_own ON public.ai_usage_tracking FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY buyer_addresses_owner_all ON public.buyer_addresses FOR ALL TO public USING ((auth.uid() = buyer_id)) WITH CHECK ((auth.uid() = buyer_id));
CREATE POLICY "Buyers manage own company" ON public.buyer_profiles FOR ALL TO public USING ((auth.uid() = user_id));
CREATE POLICY "Farmers manage own certs" ON public.certifications FOR ALL TO public USING ((auth.uid() = farmer_id));
CREATE POLICY "Users manage own likes" ON public.community_post_likes FOR ALL TO public USING ((auth.uid() = user_id));
CREATE POLICY "All authenticated read posts" ON public.community_posts FOR SELECT TO public USING ((auth.role() = 'authenticated'::text));
CREATE POLICY "Authors manage own posts" ON public.community_posts FOR ALL TO public USING ((auth.uid() = author_id));
CREATE POLICY "Public read crop_config" ON public.crop_config FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "crop_culinary_meta public read" ON public.crop_culinary_meta FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "Public read crop_journal_glossary" ON public.crop_journal_glossary FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY crop_market_sources_public_read ON public.crop_market_sources FOR SELECT TO public USING (true);
CREATE POLICY "own insert" ON public.crop_requests FOR INSERT TO authenticated WITH CHECK ((requested_by = auth.uid()));
CREATE POLICY "own select" ON public.crop_requests FOR SELECT TO authenticated USING ((requested_by = auth.uid()));
CREATE POLICY "Farmers create own crop type requests" ON public.crop_type_requests FOR INSERT TO authenticated WITH CHECK ((auth.uid() = requested_by));
CREATE POLICY "Farmers read own crop type requests" ON public.crop_type_requests FOR SELECT TO authenticated USING ((auth.uid() = requested_by));
CREATE POLICY "device_tokens own delete" ON public.device_tokens FOR DELETE TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY "device_tokens own insert" ON public.device_tokens FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "device_tokens own select" ON public.device_tokens FOR SELECT TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY "device_tokens own update" ON public.device_tokens FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "Order parties can open disputes" ON public.disputes FOR INSERT TO authenticated WITH CHECK (((opened_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = disputes.order_id) AND ((o.buyer_id = auth.uid()) OR (o.farmer_id = auth.uid())))))));
CREATE POLICY "Order parties can update own disputes" ON public.disputes FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = disputes.order_id) AND ((o.buyer_id = auth.uid()) OR (o.farmer_id = auth.uid())))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = disputes.order_id) AND ((o.buyer_id = auth.uid()) OR (o.farmer_id = auth.uid()))))));
CREATE POLICY "Order parties can view own disputes" ON public.disputes FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = disputes.order_id) AND ((o.buyer_id = auth.uid()) OR (o.farmer_id = auth.uid()))))));
CREATE POLICY "Farmers CRUD own journal prefs" ON public.farmer_journal_prefs FOR ALL TO authenticated USING ((auth.uid() = farmer_id)) WITH CHECK ((auth.uid() = farmer_id));
CREATE POLICY "Farmers manage own farm" ON public.farms FOR ALL TO public USING ((auth.uid() = farmer_id));
CREATE POLICY "Buyers read entries for their orders" ON public.harvest_entries FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM ((orders o
     JOIN offers of ON ((of.id = o.offer_id)))
     JOIN listings l ON ((l.id = of.listing_id)))
  WHERE ((o.buyer_id = auth.uid()) AND (l.harvest_entry_id = harvest_entries.id)))));
CREATE POLICY "Buyers read harvest entries via offer_items" ON public.harvest_entries FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM ((listing_harvest_entries lhe
     JOIN offer_items oi ON ((oi.listing_id = lhe.listing_id)))
     JOIN offers o ON ((o.id = oi.offer_id)))
  WHERE ((lhe.harvest_entry_id = harvest_entries.id) AND (o.buyer_id = auth.uid())))));
CREATE POLICY "Farmers CRUD own entries" ON public.harvest_entries FOR ALL TO public USING ((auth.uid() = farmer_id));
CREATE POLICY "Public read entries linked to a listing" ON public.harvest_entries FOR SELECT TO authenticated, anon USING ((EXISTS ( SELECT 1
   FROM (listing_harvest_entries lhe
     JOIN listings l ON ((l.id = lhe.listing_id)))
  WHERE ((lhe.harvest_entry_id = harvest_entries.id) AND (l.status = ANY (ARRAY['active'::listing_status, 'sold'::listing_status]))))));
CREATE POLICY "Both parties read subscriptions" ON public.harvest_subscriptions FOR SELECT TO public USING (((auth.uid() = buyer_id) OR (auth.uid() = farmer_id)));
CREATE POLICY "Buyers manage own subscriptions" ON public.harvest_subscriptions FOR ALL TO public USING ((auth.uid() = buyer_id)) WITH CHECK ((auth.uid() = buyer_id));
CREATE POLICY "Farmers respond to subscriptions" ON public.harvest_subscriptions FOR UPDATE TO authenticated USING ((auth.uid() = farmer_id)) WITH CHECK ((auth.uid() = farmer_id));
CREATE POLICY "Anyone can submit indoor interest" ON public.indoor_interest_leads FOR INSERT TO authenticated, anon WITH CHECK ((((char_length(btrim(name)) >= 1) AND (char_length(btrim(name)) <= 100)) AND ((char_length(btrim(phone)) >= 3) AND (char_length(btrim(phone)) <= 30)) AND ((city IS NULL) OR (char_length(city) <= 100)) AND ((interest_type IS NULL) OR (char_length(interest_type) <= 50)) AND ((note IS NULL) OR (char_length(note) <= 1000))));
CREATE POLICY "Farmers CRUD own entry types" ON public.journal_entry_types FOR ALL TO authenticated USING ((auth.uid() = farmer_id)) WITH CHECK (((auth.uid() = farmer_id) AND (is_preset = false)));
CREATE POLICY "Farmers read own entry types" ON public.journal_entry_types FOR SELECT TO authenticated USING ((auth.uid() = farmer_id));
CREATE POLICY "Public read preset entry types" ON public.journal_entry_types FOR SELECT TO authenticated, anon USING ((is_preset = true));
CREATE POLICY "Public read journal_themes" ON public.journal_themes FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "Farmers manage their batch links" ON public.listing_harvest_entries FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
   FROM listings l
  WHERE ((l.id = listing_harvest_entries.listing_id) AND (l.farmer_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM listings l
  WHERE ((l.id = listing_harvest_entries.listing_id) AND (l.farmer_id = auth.uid())))));
CREATE POLICY "Public read batch links" ON public.listing_harvest_entries FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "All authenticated read active listings" ON public.listings FOR SELECT TO public USING (((auth.role() = 'authenticated'::text) AND (status = 'active'::listing_status)));
CREATE POLICY "Buyers read listings via offer_items" ON public.listings FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (offer_items oi
     JOIN offers o ON ((o.id = oi.offer_id)))
  WHERE ((oi.listing_id = listings.id) AND (o.buyer_id = auth.uid())))));
CREATE POLICY "Farmers CRUD own listings" ON public.listings FOR ALL TO public USING ((auth.uid() = farmer_id));
CREATE POLICY "Public read active listings anon" ON public.listings FOR SELECT TO anon USING ((status = 'active'::listing_status));
CREATE POLICY market_sources_public_read ON public.market_sources FOR SELECT TO public USING (true);
CREATE POLICY "Users can insert their own mcp tool calls" ON public.mcp_tool_calls FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "Users can view their own mcp tool calls" ON public.mcp_tool_calls FOR SELECT TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY "Users manage own prefs" ON public.notif_prefs FOR ALL TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users see own notifications" ON public.notifications FOR ALL TO public USING ((auth.uid() = user_id));
CREATE POLICY "Buyer inserts own offer items" ON public.offer_items FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM offers o
  WHERE ((o.id = offer_items.offer_id) AND (o.buyer_id = auth.uid())))));
CREATE POLICY "Parties read offer items" ON public.offer_items FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM offers o
  WHERE ((o.id = offer_items.offer_id) AND ((o.buyer_id = auth.uid()) OR (o.farmer_id = auth.uid()))))));
CREATE POLICY "Parties can insert their own messages" ON public.offer_messages FOR INSERT TO authenticated WITH CHECK (((sender_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM offers o
  WHERE ((o.id = offer_messages.offer_id) AND (((offer_messages.sender_role = 'buyer'::text) AND (o.buyer_id = auth.uid())) OR ((offer_messages.sender_role = 'farmer'::text) AND (o.farmer_id = auth.uid()))))))));
CREATE POLICY "Parties can read offer messages" ON public.offer_messages FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM offers o
  WHERE ((o.id = offer_messages.offer_id) AND ((o.buyer_id = auth.uid()) OR (o.farmer_id = auth.uid()))))));
CREATE POLICY "Sender can delete own offer_messages" ON public.offer_messages FOR DELETE TO authenticated USING ((sender_id = auth.uid()));
CREATE POLICY "Both parties update offer" ON public.offers FOR UPDATE TO public USING (((auth.uid() = buyer_id) OR (auth.uid() = farmer_id)));
CREATE POLICY "Buyer reads own offers" ON public.offers FOR SELECT TO public USING ((auth.uid() = buyer_id));
CREATE POLICY "Buyers insert offers" ON public.offers FOR INSERT TO public WITH CHECK ((auth.uid() = buyer_id));
CREATE POLICY "Farmer reads received offers" ON public.offers FOR SELECT TO public USING ((auth.uid() = farmer_id));
CREATE POLICY "Both parties read timeline" ON public.order_timeline FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = order_timeline.order_id) AND ((o.buyer_id = auth.uid()) OR (o.farmer_id = auth.uid()))))));
CREATE POLICY "Buyers insert order timeline" ON public.order_timeline FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = order_timeline.order_id) AND (o.buyer_id = auth.uid())))));
CREATE POLICY "Farmers insert order timeline" ON public.order_timeline FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM orders
  WHERE ((orders.id = order_timeline.order_id) AND (orders.farmer_id = auth.uid())))));
CREATE POLICY "Both parties read their orders" ON public.orders FOR SELECT TO public USING (((auth.uid() = buyer_id) OR (auth.uid() = farmer_id)));
CREATE POLICY "Farmers insert orders on acceptance" ON public.orders FOR INSERT TO public WITH CHECK ((auth.uid() = farmer_id));
CREATE POLICY "Order parties can update their orders" ON public.orders FOR UPDATE TO public USING (((auth.uid() = buyer_id) OR (auth.uid() = farmer_id))) WITH CHECK (((auth.uid() = buyer_id) OR (auth.uid() = farmer_id)));
CREATE POLICY "System inserts orders" ON public.orders FOR INSERT TO public WITH CHECK ((auth.uid() = buyer_id));
CREATE POLICY "Buyers read parcels with orders" ON public.parcels FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.buyer_id = auth.uid()) AND (o.farmer_id = parcels.farmer_id)))));
CREATE POLICY "Farmers CRUD own parcels" ON public.parcels FOR ALL TO public USING ((auth.uid() = farmer_id));
CREATE POLICY "Farmers CRUD own alerts" ON public.price_alerts FOR ALL TO public USING ((auth.uid() = farmer_id));
CREATE POLICY "own history" ON public.price_history FOR SELECT TO authenticated USING ((farmer_id = auth.uid()));
CREATE POLICY "All read price points" ON public.price_points FOR SELECT TO public USING (true);
CREATE POLICY "Buyers read related farmer profiles" ON public.profiles FOR SELECT TO authenticated USING (((role = 'farmer'::user_role) AND (get_my_role() = 'buyer'::text) AND ((EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.farmer_id = profiles.id) AND (o.buyer_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM harvest_subscriptions s
  WHERE ((s.farmer_id = profiles.id) AND (s.buyer_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM offers of
  WHERE ((of.farmer_id = profiles.id) AND (of.buyer_id = auth.uid())))))));
CREATE POLICY "Farmers read related buyer profiles" ON public.profiles FOR SELECT TO authenticated USING (((role = 'buyer'::user_role) AND (get_my_role() = 'farmer'::text) AND ((EXISTS ( SELECT 1
   FROM offers o
  WHERE ((o.buyer_id = profiles.id) AND (o.farmer_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.buyer_id = profiles.id) AND (o.farmer_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM harvest_subscriptions s
  WHERE ((s.buyer_id = profiles.id) AND (s.farmer_id = auth.uid())))))));
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT TO public WITH CHECK ((auth.uid() = id));
CREATE POLICY "Users read own profile" ON public.profiles FOR SELECT TO public USING ((auth.uid() = id));
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO public USING ((auth.uid() = id));
CREATE POLICY "recipe_ingredients anon read via public recipe" ON public.recipe_ingredients FOR SELECT TO anon USING ((EXISTS ( SELECT 1
   FROM recipes r
  WHERE ((r.id = recipe_ingredients.recipe_id) AND (r.visibility = 'public'::text) AND (r.status = 'published'::text)))));
CREATE POLICY "recipe_ingredients auth delete own recipe" ON public.recipe_ingredients FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM recipes r
  WHERE ((r.id = recipe_ingredients.recipe_id) AND (r.owner_id = auth.uid())))));
CREATE POLICY "recipe_ingredients auth insert own recipe" ON public.recipe_ingredients FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM recipes r
  WHERE ((r.id = recipe_ingredients.recipe_id) AND (r.owner_id = auth.uid())))));
CREATE POLICY "recipe_ingredients auth read via visible recipe" ON public.recipe_ingredients FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM recipes r
  WHERE ((r.id = recipe_ingredients.recipe_id) AND (((r.visibility = 'public'::text) AND (r.status = 'published'::text)) OR (r.owner_id = auth.uid()))))));
CREATE POLICY "recipe_ingredients auth update own recipe" ON public.recipe_ingredients FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM recipes r
  WHERE ((r.id = recipe_ingredients.recipe_id) AND (r.owner_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM recipes r
  WHERE ((r.id = recipe_ingredients.recipe_id) AND (r.owner_id = auth.uid())))));
CREATE POLICY "recipe_rfq_links auth insert own request" ON public.recipe_rfq_links FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM crop_requests cr
  WHERE ((cr.id = recipe_rfq_links.crop_request_id) AND (cr.requested_by = auth.uid())))));
CREATE POLICY "recipe_rfq_links owner delete" ON public.recipe_rfq_links FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM crop_requests cr
  WHERE ((cr.id = recipe_rfq_links.crop_request_id) AND (cr.requested_by = auth.uid())))));
CREATE POLICY "recipe_rfq_links owner select" ON public.recipe_rfq_links FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM crop_requests cr
  WHERE ((cr.id = recipe_rfq_links.crop_request_id) AND (cr.requested_by = auth.uid())))));
CREATE POLICY "recipe_saves own delete" ON public.recipe_saves FOR DELETE TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY "recipe_saves own insert" ON public.recipe_saves FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "recipe_saves own select" ON public.recipe_saves FOR SELECT TO authenticated USING ((user_id = auth.uid()));
CREATE POLICY "recipe_saves own update" ON public.recipe_saves FOR UPDATE TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "recipe_steps anon read via public recipe" ON public.recipe_steps FOR SELECT TO anon USING ((EXISTS ( SELECT 1
   FROM recipes r
  WHERE ((r.id = recipe_steps.recipe_id) AND (r.visibility = 'public'::text) AND (r.status = 'published'::text)))));
CREATE POLICY "recipe_steps auth delete own recipe" ON public.recipe_steps FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM recipes r
  WHERE ((r.id = recipe_steps.recipe_id) AND (r.owner_id = auth.uid())))));
CREATE POLICY "recipe_steps auth insert own recipe" ON public.recipe_steps FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM recipes r
  WHERE ((r.id = recipe_steps.recipe_id) AND (r.owner_id = auth.uid())))));
CREATE POLICY "recipe_steps auth read via visible recipe" ON public.recipe_steps FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM recipes r
  WHERE ((r.id = recipe_steps.recipe_id) AND (((r.visibility = 'public'::text) AND (r.status = 'published'::text)) OR (r.owner_id = auth.uid()))))));
CREATE POLICY "recipe_steps auth update own recipe" ON public.recipe_steps FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM recipes r
  WHERE ((r.id = recipe_steps.recipe_id) AND (r.owner_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM recipes r
  WHERE ((r.id = recipe_steps.recipe_id) AND (r.owner_id = auth.uid())))));
CREATE POLICY "recipe_views public insert" ON public.recipe_views FOR INSERT TO authenticated, anon WITH CHECK (((user_id IS NULL) OR (user_id = auth.uid())));
CREATE POLICY "recipes anon read public published" ON public.recipes FOR SELECT TO anon USING (((visibility = 'public'::text) AND (status = 'published'::text)));
CREATE POLICY "recipes auth delete own" ON public.recipes FOR DELETE TO authenticated USING ((owner_id = auth.uid()));
CREATE POLICY "recipes auth insert own private" ON public.recipes FOR INSERT TO authenticated WITH CHECK (((owner_id = auth.uid()) AND (visibility = 'private'::text)));
CREATE POLICY "recipes auth read public or own" ON public.recipes FOR SELECT TO authenticated USING ((((visibility = 'public'::text) AND (status = 'published'::text)) OR (owner_id = auth.uid())));
CREATE POLICY "recipes auth update own private" ON public.recipes FOR UPDATE TO authenticated USING ((owner_id = auth.uid())) WITH CHECK (((owner_id = auth.uid()) AND (visibility = 'private'::text)));
CREATE POLICY "Referrer can see own qualifications" ON public.referral_qualifications FOR SELECT TO authenticated USING ((auth.uid() = referrer_id));
CREATE POLICY "Order parties can insert their review" ON public.reviews FOR INSERT TO authenticated WITH CHECK (((auth.uid() = reviewer_id) AND (EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = reviews.order_id) AND (o.status = ANY (ARRAY['delivered'::order_status, 'completed'::order_status])) AND (((reviews.reviewer_role = 'buyer'::text) AND (o.buyer_id = auth.uid()) AND (o.farmer_id = reviews.reviewee_id)) OR ((reviews.reviewer_role = 'farmer'::text) AND (o.farmer_id = auth.uid()) AND (o.buyer_id = reviews.reviewee_id))))))));
CREATE POLICY "Reviews are publicly readable" ON public.reviews FOR SELECT TO public USING (true);

-- ============================== GRANTS: TABLES ==============================
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.admin_recipe_quality_overview TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ai_chat_messages TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ai_chat_messages TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ai_chat_messages TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ai_customize_requests TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ai_customize_requests TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ai_usage_tracking TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ai_usage_tracking TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ai_usage_tracking TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.buyer_addresses TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.buyer_addresses TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.buyer_addresses TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.buyer_profiles TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.buyer_profiles TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.buyer_profiles TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.certifications TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.certifications TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.certifications TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.community_post_likes TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.community_post_likes TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.community_post_likes TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.community_posts TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.community_posts TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.community_posts TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.crop_config TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.crop_config TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.crop_config TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.crop_culinary_meta TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.crop_culinary_meta TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.crop_culinary_meta TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.crop_journal_glossary TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.crop_journal_glossary TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.crop_journal_glossary TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.crop_market_sources TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.crop_market_sources TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.crop_market_sources TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.crop_nutrition TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.crop_requests TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.crop_requests TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.crop_requests TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.crop_type_requests TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.crop_type_requests TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.crop_type_requests TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.device_tokens TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.device_tokens TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.device_tokens TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.disputes TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.disputes TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.disputes TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.farmer_journal_prefs TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.farmer_journal_prefs TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.farmer_journal_prefs TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.farms TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.farms TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.farms TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.harvest_entries TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.harvest_entries TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.harvest_entries TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.harvest_subscriptions TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.harvest_subscriptions TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.harvest_subscriptions TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.indoor_interest_leads TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.indoor_interest_leads TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.indoor_interest_leads TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ingredient_measure_reference TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ingredient_nutrition_alias TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.ingredient_nutrition_reference TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.journal_entry_types TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.journal_entry_types TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.journal_entry_types TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.journal_themes TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.journal_themes TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.journal_themes TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.listing_harvest_entries TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.listing_harvest_entries TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.listing_harvest_entries TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.listings TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.listings TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.listings TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.market_sources TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.market_sources TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.market_sources TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.mcp_tool_calls TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.mcp_tool_calls TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.mcp_tool_calls TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.mobile_handoff_nonces TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.notif_prefs TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.notif_prefs TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.notif_prefs TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.notifications TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.notifications TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.notifications TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.offer_items TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.offer_items TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.offer_items TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.offer_messages TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.offer_messages TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.offer_messages TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.offers TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.offers TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.offers TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.order_timeline TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.order_timeline TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.order_timeline TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.orders TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.orders TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.orders TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.parcels TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.parcels TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.parcels TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.price_alerts TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.price_alerts TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.price_alerts TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.price_history TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.price_history TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.price_history TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.price_points TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.price_points TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.price_points TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.profiles TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.profiles TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.profiles TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.public_certifications TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.public_certifications TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.public_certifications TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.public_farmer_profiles TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.public_farmer_profiles TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.public_farmer_profiles TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.public_parcel_cards TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.public_parcel_cards TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.public_parcel_cards TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.recipe_admin_reviews TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.recipe_assets TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.recipe_drafts TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.recipe_generation_batches TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.recipe_generation_jobs TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.recipe_generation_stage_runs TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.recipe_ingredient_nutrition_backfill_audit TO service_role;
GRANT DELETE, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.recipe_ingredients TO anon;
GRANT DELETE, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.recipe_ingredients TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.recipe_ingredients TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.recipe_plan_briefs TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.recipe_qa_results TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.recipe_rfq_links TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.recipe_rfq_links TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.recipe_rfq_links TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.recipe_saves TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.recipe_saves TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.recipe_saves TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.recipe_steps TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.recipe_steps TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.recipe_steps TO service_role;
GRANT INSERT ON TABLE public.recipe_views TO anon;
GRANT INSERT ON TABLE public.recipe_views TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.recipe_views TO service_role;
GRANT DELETE, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.recipes TO anon;
GRANT DELETE, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE public.recipes TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.recipes TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.referral_qualifications TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.referral_qualifications TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.referral_qualifications TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.reviews TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.reviews TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.reviews TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.v_kpi_buyer_activation TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.v_kpi_buyer_aov_segment TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.v_kpi_buyer_gmv_retention TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.v_kpi_buyer_repeat_rate TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.v_kpi_buyer_seller_ratio TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.v_kpi_crop_demand_heatmap TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.v_kpi_dispute_rate TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.v_kpi_farmer_activation TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.v_kpi_farmer_gmv TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.v_kpi_farmer_retention TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.v_kpi_farmer_sellthrough TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.v_kpi_farmer_verified_pct TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.v_kpi_full_acceptance_rate TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.v_kpi_horeca_order_frequency TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.v_kpi_listing_offer_rate TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.v_kpi_north_star TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.v_kpi_offer_conversion TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.v_kpi_order_base TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.v_kpi_price_vs_market TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.v_kpi_recipe_funnel TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.v_kpi_recipe_funnel_by_recipe TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.v_kpi_review_avg TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.v_kpi_supply_density TO service_role;
GRANT SELECT ON TABLE public.v_recipe_coverage TO anon;
GRANT SELECT ON TABLE public.v_recipe_coverage TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.v_recipe_coverage TO service_role;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.v_routine_maintenance_status TO anon;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.v_routine_maintenance_status TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.v_routine_maintenance_status TO service_role;

-- ============================== GRANTS: FUNCTIONS ==============================
GRANT EXECUTE ON FUNCTION public.buyer_addresses_clear_default() TO authenticated;
GRANT EXECUTE ON FUNCTION public.buyer_addresses_clear_default() TO service_role;
GRANT EXECUTE ON FUNCTION public.buyer_addresses_touch_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.buyer_addresses_touch_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.check_and_record_mcp_call() TO anon;
GRANT EXECUTE ON FUNCTION public.check_and_record_mcp_call() TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_record_mcp_call() TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_cert_verification() TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_community_moderation() TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_harvest_date_lock() TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_link_unit_match() TO anon;
GRANT EXECUTE ON FUNCTION public.enforce_link_unit_match() TO authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_link_unit_match() TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_offer_accept_turn() TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_offer_stock() TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_offer_transitions() TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_profile_self_update_restrictions() TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_subscription_buyer_role() TO anon;
GRANT EXECUTE ON FUNCTION public.enforce_subscription_buyer_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_subscription_buyer_role() TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_subscription_updates() TO anon;
GRANT EXECUTE ON FUNCTION public.enforce_subscription_updates() TO authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_subscription_updates() TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_order_ref() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_recipe_plan_schedule() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.notify_crop_request_fulfilled() TO anon;
GRANT EXECUTE ON FUNCTION public.notify_crop_request_fulfilled() TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_crop_request_fulfilled() TO service_role;
GRANT EXECUTE ON FUNCTION public.notify_offer_accepted() TO service_role;
GRANT EXECUTE ON FUNCTION public.notify_offer_received() TO service_role;
GRANT EXECUTE ON FUNCTION public.notify_order_status() TO service_role;
GRANT EXECUTE ON FUNCTION public.notify_subscription_changes() TO anon;
GRANT EXECUTE ON FUNCTION public.notify_subscription_changes() TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_subscription_changes() TO service_role;
GRANT EXECUTE ON FUNCTION public.process_referral_qualification() TO anon;
GRANT EXECUTE ON FUNCTION public.process_referral_qualification() TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_referral_qualification() TO service_role;
GRANT EXECUTE ON FUNCTION public.profiles_sync_tier_premium() TO anon;
GRANT EXECUTE ON FUNCTION public.profiles_sync_tier_premium() TO authenticated;
GRANT EXECUTE ON FUNCTION public.profiles_sync_tier_premium() TO service_role;
GRANT EXECUTE ON FUNCTION public.protect_profile_deleted_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.record_order_price_history() TO anon;
GRANT EXECUTE ON FUNCTION public.record_order_price_history() TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_order_price_history() TO service_role;
GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO service_role;
GRANT EXECUTE ON FUNCTION public.rpc_delete_own_account() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_delete_own_account() TO service_role;
GRANT EXECUTE ON FUNCTION public.send_subscription_harvest_reminders() TO service_role;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO anon;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.tg_enforce_min_order_le_quantity() TO anon;
GRANT EXECUTE ON FUNCTION public.tg_enforce_min_order_le_quantity() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tg_enforce_min_order_le_quantity() TO service_role;
GRANT EXECUTE ON FUNCTION public.tg_finalize_recipe_facts_on_publish_job() TO service_role;
GRANT EXECUTE ON FUNCTION public.tg_harvest_entries_after_insert_autolink() TO service_role;
GRANT EXECUTE ON FUNCTION public.tg_parcels_after_insert() TO service_role;
GRANT EXECUTE ON FUNCTION public.tg_parcels_after_update() TO service_role;
GRANT EXECUTE ON FUNCTION public.tg_recipe_ingredients_auto_match_crop() TO anon;
GRANT EXECUTE ON FUNCTION public.tg_recipe_ingredients_auto_match_crop() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tg_recipe_ingredients_auto_match_crop() TO service_role;
GRANT EXECUTE ON FUNCTION public.tg_require_published_recipe_facts() TO service_role;
GRANT EXECUTE ON FUNCTION public.update_likes_count() TO service_role;
