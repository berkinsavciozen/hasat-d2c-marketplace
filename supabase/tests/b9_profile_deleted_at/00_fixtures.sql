-- Extends the existing B-3 minimal local schema; includes a legacy lookalike.
insert into profiles(id,role,name) values('00000000-0000-0000-0000-0000000000a1','buyer','Silinmiş Kullanıcı');
create table b9_retained_reference(profile_id uuid references profiles(id) on delete cascade);
-- Columns used by the existing self-update trigger (which remains installed).
alter table profiles add column tier text, add column premium boolean, add column buyer_type text, add column referred_by uuid;
