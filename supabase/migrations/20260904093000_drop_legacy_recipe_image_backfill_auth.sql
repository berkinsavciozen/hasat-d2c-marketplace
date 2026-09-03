-- legacy-recipe-image-backfill has been run against all 10 target recipes and decommissioned (see
-- that function's own header, now a 410 stub). Its one-off bearer-token gate table
-- (20260904090000_legacy_recipe_image_backfill_auth.sql) already had its rows deleted and is no
-- longer needed by anything — dropping it per that table's own comment ("Safe to drop once that
-- function is decommissioned.").
drop table if exists public.legacy_recipe_image_backfill_auth;
