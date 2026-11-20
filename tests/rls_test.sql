\set ON_ERROR_STOP 1
-- kullanıcılar: admin (ilk), ali, veli
insert into auth.users values ('00000000-0000-0000-0000-0000000000a1','admin@x.com','{"full_name":"Yönetici"}');
insert into auth.users values ('00000000-0000-0000-0000-0000000000b1','ali@x.com','{"full_name":"Ali"}');
insert into auth.users values ('00000000-0000-0000-0000-0000000000c1','veli@x.com','{"full_name":"Veli"}');
select email, role from public.profiles order by email;

create function pg_temp.as_user(u text) returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub', u, false); end $$;

set role authenticated;
-- Ali kendi kişisini ekler
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
insert into contacts(phone,name,note) values ('905321112233','Ahmet Yılmaz','Güzelbahçe arsa');
insert into interactions(contact_id, region, outcome) select id,'Güzelbahçe','Olmadı' from contacts where phone='905321112233';
-- Veli aynı numarayı ve başka bir kişiyi ekler
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
insert into contacts(phone,name,note) values ('905321112233','Ahmet Y.','Urla villa'), ('905559998877','Ayşe Kaya','');
select 'veli sees' t, count(*) from contacts;                     -- 2
select 'veli sees ali interactions' t, count(*) from interactions; -- 0
do $$ begin
  begin insert into contacts(owner_id, phone) values ('00000000-0000-0000-0000-0000000000b1','905000000000'); raise exception 'FAIL: veli inserted for ali';
  exception when insufficient_privilege or check_violation then raise notice 'ok: veli cannot insert for ali'; end;
end $$;
update contacts set owner_id='00000000-0000-0000-0000-0000000000c1' where phone='905321112233' and name='Ahmet Yılmaz'; -- 0 rows (invisible)
do $$ begin
  begin update contacts set owner_id='00000000-0000-0000-0000-0000000000b1' where name='Ayşe Kaya'; raise exception 'FAIL: owner change';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; raise notice 'ok: consultant cannot change owner';
            when insufficient_privilege or check_violation then raise notice 'ok: consultant cannot change owner'; end;
end $$;
do $$ begin
  begin insert into settings(key,value) values ('fx','{"usd_try":40}'); raise exception 'FAIL: consultant wrote settings';
  exception when insufficient_privilege then raise notice 'ok: consultant cannot write settings'; end;
end $$;
-- portföy: Veli ekler, Ali görür ama silemez
insert into listings(title, prop_type, region, price_usd) values ('Güzelbahçe arsa','Arsa','Güzelbahçe',6000000);
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
do $$ begin if (select count(*) from listings) <> 0 then raise exception 'FAIL: ali sees veli listing'; end if; raise notice 'ok: consultant cannot see other listings'; end $$;
-- Veli'nin portföyü için ekip taraması: Ali'nin Ahmet'i (Güzelbahçe görüşmesi) uyar
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
do $$ declare n int; begin
  select refresh_team_matches(id) into n from listings where title='Güzelbahçe arsa';
  if n <> 1 then raise exception 'FAIL: expected 1 team match, got %', n; end if;
  if (select count(*) from team_matches) <> 0 then raise exception 'FAIL: consultant sees team_matches'; end if;
  raise notice 'ok: consultant gets only the count (%)', n; end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
do $$ begin
  begin perform refresh_team_matches((select id from listings limit 1)); exception when others then null; end;
  raise notice 'ok: ali cannot scan listings he cannot see';
end $$;
do $$ begin
  begin perform transfer_contacts('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b1'); raise exception 'FAIL: consultant transfer';
  exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; raise notice 'ok: consultant cannot transfer'; end;
end $$;
-- admin
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select 'admin sees' t, count(*) from contacts; -- 3
insert into settings(key,value) values ('fx','{"usd_try":42.1}');
select 'admin team matches' t, score, reasons from team_matches;
-- Veli ayrılıyor: rehberi Ali'ye devredilir, ortak numara birleşir
select 'moved' t, transfer_contacts('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b1');
select name, note, owner_id = '00000000-0000-0000-0000-0000000000b1' as alis from contacts order by name;
update profiles set active=false where email='veli@x.com';
-- pasif Veli hiçbir şey göremez
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select 'inactive veli sees contacts' t, count(*) from contacts;  -- 0
select 'inactive veli sees listings' t, count(*) from listings;  -- 0
-- Ali iki adımlı doğrulamayı açtı: kod girmeden (aal1) veri göremez, kodla (aal2) görür
reset role;
insert into auth.mfa_factors(user_id,status) values ('00000000-0000-0000-0000-0000000000b1','verified');
set role authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select set_config('request.jwt.claims','{"aal":"aal1"}',false);
do $$ begin if (select count(*) from contacts) <> 0 then raise exception 'FAIL: aal1 sees data'; end if; raise notice 'ok: 2FA user without code sees nothing'; end $$;
select set_config('request.jwt.claims','{"aal":"aal2"}',false);
do $$ begin if (select count(*) from contacts) = 0 then raise exception 'FAIL: aal2 sees nothing'; end if; raise notice 'ok: 2FA user with code sees own contacts'; end $$;
reset role;
-- anon hiçbir şey göremez
set role anon;
do $$ begin begin perform count(*) from contacts; raise exception 'FAIL anon'; exception when insufficient_privilege then raise notice 'ok: anon blocked'; end; end $$;
