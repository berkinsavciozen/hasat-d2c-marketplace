-- Applies the manual backfill and its 34/34 assertion inside a transaction, then always rolls back.
-- psql usage: psql ... -v ON_ERROR_STOP=1 -f this_file
\set ON_ERROR_STOP on
\set T4_ROLLBACK 1
\ir t4_production_nutrition_debt_closure.sql
