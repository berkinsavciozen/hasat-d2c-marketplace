# Read-only audit: F2 recipe-automation migrations

No code, migrations, or database state were changed.

## 1. Supabase project ref

`efuqpiaavrzimvstpdpm` (from project configuration and `supabase/config.toml`).

## 2. Applied migrations matching the two F2 versions

Neither is applied.

Query (supabase--read_query):
```sql
select version, name from supabase_migrations.schema_migrations
where version in ('20260819120000','20260819150000')
   or name ilike '%recipe_automation%'
   or name ilike '%recipe_validation%'
   or name ilike '%f2s0%';
```
Result: `[]` (zero rows).

Context query:
```sql
select count(*) as total, max(version) as latest from supabase_migrations.schema_migrations;
```
Result: `total = 134`, `latest = 20260818103942` — the migration history stops one day before both F2 files, consistent with them never having been applied.

## 3. Branches / environments

Only one environment is reachable from this project: the connected Supabase project `efuqpiaavrzimvstpdpm`, which is the target of every database tool available here.

**Cannot be checked:** Supabase preview/persistent branches. There is no branch-management tool in this environment and no `PGHOST`/`psql` credentials (`test -n "$PGHOST"` returned nothing), so no other branch database can be queried. If branches exist, their migration state must be verified in the Supabase dashboard (Branches tab) — this audit makes no claim about them.

## 4. Live database objects

```sql
select table_schema, table_name from information_schema.tables
where table_name in ('recipe_generation_batches','recipe_qa_results');
```
Result: `[]` — **neither table exists** in any schema.

```sql
select p.proname, n.nspname from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.proname ilike '%validate_recipe%' or p.proname ilike '%recipe%plan%';
```
Result: `[]` — **`validate_recipe_plan` does not exist**.

Existing `recipe*` tables in `public` (for contrast):
```sql
select table_name from information_schema.tables
where table_schema='public' and table_name like 'recipe%' order by 1;
```
Result: `recipe_ingredients`, `recipe_rfq_links`, `recipe_saves`, `recipe_steps`, `recipe_views`, `recipes` — i.e. only the editorial recipe layer, none of the F2 automation layer.

## Conclusion

On the connected project `efuqpiaavrzimvstpdpm`, both `20260819120000_f2s03_recipe_automation_schema.sql` and `20260819150000_f2s04_recipe_validation_rpcs.sql` are unapplied: no migration rows, no automation tables, no validation RPCs. Branch environments could not be inspected from here.
