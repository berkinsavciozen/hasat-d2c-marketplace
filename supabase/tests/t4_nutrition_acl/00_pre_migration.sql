-- The T4 reference migration adds a pul_biber nutrition row; reproduce its controlled crop FK.
insert into public.crop_config(crop,display_name,default_unit) values ('pul_biber','Pul biber','kg');
insert into public.crop_culinary_meta(crop,is_edible,conversion_hints) values ('pul_biber',true,'{}');

-- Reproduce the project's permissive function default ACL. PostgreSQL grants EXECUTE to PUBLIC
-- by default; these extra role grants prove every function in the migration closes all three paths.
alter default privileges in schema public grant execute on functions to public, anon, authenticated;
