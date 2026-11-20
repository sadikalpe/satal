-- STA Gayrimenkul CRM — veritabanı şeması
-- Supabase SQL Editor'de bir kez çalıştırın (ya da `supabase db push`).
-- Erişim modeli:
--   * admin       : her şeyi görür ve düzenler, danışman ekler/kapatır
--   * consultant  : yalnızca kendi eklediği kişileri ve onların görüşmelerini görür
--   * portföyler (listings) ve dolar kuru tüm aktif kullanıcılara açıktır

create extension if not exists pgcrypto;

-- ---------- profiles ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text not null default '',
  role        text not null default 'consultant' check (role in ('admin','consultant')),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- İki adımlı doğrulamayı (Google Authenticator) açmış bir kullanıcı, kodu girmeden
-- (oturum seviyesi aal2 olmadan) hiçbir veriye erişemez.
create or replace function public.mfa_ok() returns boolean
language sql stable security definer set search_path = public, auth as $$
  select coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2'
      or not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified');
$$;

create or replace function public.is_active() returns boolean
language sql stable security definer set search_path = public as $$
  select public.mfa_ok() and exists (select 1 from public.profiles where id = auth.uid() and active);
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select public.mfa_ok() and exists (select 1 from public.profiles where id = auth.uid() and active and role = 'admin');
$$;

-- Yeni kullanıcı oluşunca profil açılır. İlk kullanıcı otomatik olarak admin olur.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email,''), '@', 1)),
    case when exists (select 1 from public.profiles) then 'consultant' else 'admin' end
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Kullanıcı kendi adını değiştirebilir (rolünü değil).
create or replace function public.set_my_name(new_name text) returns void
language sql security definer set search_path = public as $$
  update public.profiles set full_name = left(trim(new_name), 120) where id = auth.uid();
$$;

-- ---------- listings (portföy) ----------
create table if not exists public.listings (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  prop_type    text not null default '',
  region       text not null default '',
  hood         text not null default '',
  m2           numeric,
  -- Satılık mülkün fiyatı girildiği para biriminde saklanır. TL fiyatlı mülklerin dolar karşılığı
  -- (price_usd) her kur güncellemesinde yeniden hesaplanır; eşleştirme bu güncel değeri kullanır.
  price_currency text not null default 'USD' check (price_currency in ('USD','TRY')),
  price_amount   numeric check (price_amount > 0),
  price_usd    numeric not null check (price_usd > 0),
  description  text not null default '',
  status       text not null default 'active' check (status in ('active','sold','archived')),
  created_by   uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------- contacts (rehber) ----------
create table if not exists public.contacts (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles(id) default auth.uid(),
  phone         text not null check (phone ~ '^[0-9]{8,15}$'),
  extra_phones  text[] not null default '{}',
  name          text not null default '',
  note          text not null default '',
  -- Alım gücü her zaman dolar olarak saklanır (budget_min/max). TL girildiyse girildiği günün
  -- kuruyla çevrilir; asıl TL tutar, kullanılan kur ve tarih kayıt için ayrıca tutulur.
  budget_min    numeric,
  budget_max    numeric,
  budget_currency text not null default 'USD' check (budget_currency in ('USD','TRY')),
  budget_min_try numeric,
  budget_max_try numeric,
  budget_fx      numeric,
  budget_fx_day  date,
  tier          text check (tier in ('A','B','C')),
  regions       text[] not null default '{}',
  types         text[] not null default '{}',
  source        text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (owner_id, phone)
);
create index if not exists contacts_phone_idx on public.contacts(phone);

-- ---------- interactions (geçmiş görüşmeler / sunulan mülkler) ----------
create table if not exists public.interactions (
  id           uuid primary key default gen_random_uuid(),
  contact_id   uuid not null references public.contacts(id) on delete cascade,
  happened_on  date not null default current_date,
  region       text not null default '',
  prop_type    text not null default '',
  price_usd    numeric,
  price_try    numeric,           -- TL girildiyse asıl tutar
  price_fx     numeric,           -- çevirmede kullanılan, görüşme tarihindeki kur
  outcome      text not null default 'İlgilendi',
  note         text not null default '',
  listing_id   uuid references public.listings(id) on delete set null,
  created_by   uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now()
);
create index if not exists interactions_contact_idx on public.interactions(contact_id);

-- ---------- fx_rates (günlük USD/TRY kuru) ----------
-- TCMB döviz satış kuru; "fx" sunucu fonksiyonu doldurur, yönetici elle de girebilir.
create table if not exists public.fx_rates (
  day         date primary key,
  usd_try     numeric not null check (usd_try > 0),
  source      text not null default 'tcmb',
  created_at  timestamptz not null default now()
);

create or replace function public.current_usd_try() returns numeric
language sql stable security definer set search_path = public as $$
  select usd_try from public.fx_rates order by day desc limit 1;
$$;

-- TL fiyatlı mülklerin dolar karşılığını güncel kurla hesaplar.
create or replace function public.listing_price_sync() returns trigger
language plpgsql security definer set search_path = public as $$
declare r numeric;
begin
  if new.price_currency = 'TRY' then
    if new.price_amount is null then raise exception 'TL fiyat girilmedi'; end if;
    r := public.current_usd_try();
    if r is null then raise exception 'Dolar kuru henüz girilmedi'; end if;
    new.price_usd := round(new.price_amount / r);
  else
    new.price_amount := new.price_usd;
  end if;
  return new;
end $$;

-- Yeni ve en güncel kur gelince TL fiyatlı mülkleri yeniden hesaplar.
create or replace function public.fx_rates_reprice() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.day >= (select max(day) from public.fx_rates) then
    update public.listings set price_usd = round(price_amount / new.usd_try)
    where price_currency = 'TRY' and price_amount is not null;
  end if;
  return new;
end $$;

-- ---------- settings ----------
create table if not exists public.settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles(id) on delete set null default auth.uid()
);

-- ---------- updated_at ----------
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists contacts_touch on public.contacts;
create trigger contacts_touch before update on public.contacts for each row execute function public.touch_updated_at();
drop trigger if exists listings_touch on public.listings;
create trigger listings_touch before update on public.listings for each row execute function public.touch_updated_at();
drop trigger if exists listings_price_sync on public.listings;
create trigger listings_price_sync before insert or update of price_currency, price_amount, price_usd on public.listings
  for each row execute function public.listing_price_sync();
drop trigger if exists fx_rates_reprice on public.fx_rates;
create trigger fx_rates_reprice after insert or update on public.fx_rates
  for each row execute function public.fx_rates_reprice();
drop trigger if exists settings_touch on public.settings;
create trigger settings_touch before update on public.settings for each row execute function public.touch_updated_at();

-- Danışman kişinin sahibini değiştiremez (yalnızca admin).
create or replace function public.guard_contact_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.owner_id is distinct from old.owner_id and not public.is_admin() then
    raise exception 'Kişinin sahibini yalnızca yönetici değiştirebilir';
  end if;
  return new;
end $$;
drop trigger if exists contacts_owner_guard on public.contacts;
create trigger contacts_owner_guard before update on public.contacts for each row execute function public.guard_contact_owner();

-- ---------- Row Level Security ----------
alter table public.profiles     enable row level security;
alter table public.listings     enable row level security;
alter table public.contacts     enable row level security;
alter table public.interactions enable row level security;
alter table public.settings     enable row level security;
alter table public.fx_rates     enable row level security;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (public.is_active() or id = auth.uid());
drop policy if exists profiles_admin_write on public.profiles;
create policy profiles_admin_write on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists listings_read on public.listings;
create policy listings_read on public.listings for select to authenticated
  using (public.is_active() and (created_by = auth.uid() or public.is_admin()));
drop policy if exists listings_insert on public.listings;
create policy listings_insert on public.listings for insert to authenticated
  with check (public.is_active() and created_by = auth.uid());
drop policy if exists listings_update on public.listings;
create policy listings_update on public.listings for update to authenticated
  using (public.is_active() and (created_by = auth.uid() or public.is_admin()))
  with check (public.is_active());
drop policy if exists listings_delete on public.listings;
create policy listings_delete on public.listings for delete to authenticated
  using (public.is_active() and (created_by = auth.uid() or public.is_admin()));

drop policy if exists contacts_read on public.contacts;
create policy contacts_read on public.contacts for select to authenticated
  using (public.is_active() and (owner_id = auth.uid() or public.is_admin()));
drop policy if exists contacts_insert on public.contacts;
create policy contacts_insert on public.contacts for insert to authenticated
  with check (public.is_active() and (owner_id = auth.uid() or public.is_admin()));
drop policy if exists contacts_update on public.contacts;
create policy contacts_update on public.contacts for update to authenticated
  using (public.is_active() and (owner_id = auth.uid() or public.is_admin()))
  with check (public.is_active() and (owner_id = auth.uid() or public.is_admin()));
drop policy if exists contacts_delete on public.contacts;
create policy contacts_delete on public.contacts for delete to authenticated
  using (public.is_active() and (owner_id = auth.uid() or public.is_admin()));

drop policy if exists interactions_all on public.interactions;
create policy interactions_all on public.interactions for all to authenticated
  using (public.is_active() and exists (
    select 1 from public.contacts c where c.id = contact_id and (c.owner_id = auth.uid() or public.is_admin())))
  with check (public.is_active() and exists (
    select 1 from public.contacts c where c.id = contact_id and (c.owner_id = auth.uid() or public.is_admin())));

drop policy if exists fx_read on public.fx_rates;
create policy fx_read on public.fx_rates for select to authenticated using (public.is_active());
drop policy if exists fx_write on public.fx_rates;
create policy fx_write on public.fx_rates for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists settings_read on public.settings;
create policy settings_read on public.settings for select to authenticated using (public.is_active());
drop policy if exists settings_write on public.settings;
create policy settings_write on public.settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- Danışman ayrılınca rehberini devralma ----------
-- from_user'ın tüm kişilerini to_user'a taşır. Aynı numara iki tarafta da varsa
-- kayıtlar birleştirilir (notlar eklenir, görüşmeler taşınır). Taşınan kişi sayısını döner.
create or replace function public.transfer_contacts(from_user uuid, to_user uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare
  moved integer := 0;
  r public.contacts%rowtype;
  existing uuid;
begin
  if not public.is_admin() then raise exception 'Bu işlem için yönetici olmalısınız'; end if;
  if from_user = to_user then return 0; end if;
  for r in select * from public.contacts where owner_id = from_user loop
    select id into existing from public.contacts where owner_id = to_user and phone = r.phone;
    if existing is null then
      update public.contacts set owner_id = to_user where id = r.id;
    else
      update public.interactions set contact_id = existing where contact_id = r.id;
      update public.contacts c set
        note       = trim(both e'\n' from c.note || case when r.note <> '' and position(r.note in c.note) = 0 then e'\n' || r.note else '' end),
        budget_min = coalesce(c.budget_min, r.budget_min),
        budget_max = coalesce(c.budget_max, r.budget_max),
        tier       = coalesce(c.tier, r.tier),
        regions    = array(select distinct x from unnest(c.regions || r.regions) x),
        types      = array(select distinct x from unnest(c.types || r.types) x),
        name       = case when c.name = '' then r.name else c.name end
      where c.id = existing;
      delete from public.contacts where id = r.id;
    end if;
    moved := moved + 1;
  end loop;
  return moved;
end $$;

-- ---------- Ekip eşleşmeleri ----------
-- Bir danışmanın portföyü, BAŞKA danışmanların (ya da yöneticinin) rehberindeki birine uyuyorsa
-- burada kayıt açılır. Bu tabloyu yalnızca yönetici görür; danışman yalnızca sayıyı öğrenir.
create table if not exists public.team_matches (
  listing_id  uuid not null references public.listings(id) on delete cascade,
  contact_id  uuid not null references public.contacts(id) on delete cascade,
  score       integer not null,
  reasons     jsonb not null default '[]',
  status      text not null default 'new' check (status in ('new','shared','dismissed')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (listing_id, contact_id)
);
alter table public.team_matches enable row level security;
drop policy if exists team_matches_admin on public.team_matches;
create policy team_matches_admin on public.team_matches for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create or replace function public.tr_norm(t text) returns text language sql immutable as $$
  select btrim(regexp_replace(lower(translate(coalesce(t,''), 'ÇĞİIÖŞÜçğıöşüÂÎÛâîû', 'cgiiosucgiosuaiuaiu')), '\s+', ' ', 'g'));
$$;

create or replace function public.usd_txt(v numeric) returns text language sql immutable as $$
  select '$' || replace(to_char(round(v), 'FM999,999,999,999'), ',', '.');
$$;

create or replace function public.region_hit(v text, r text, h text) returns boolean language sql immutable as $$
  select v <> '' and (
    v = r or (h <> '' and v = h)
    or (r <> '' and length(v) > 3 and (position(v in r) > 0 or position(r in v) > 0))
    or (length(h) > 3 and position(h in v) > 0));
$$;

-- Portföyü bütün ekibin rehberinde tarar (portföy sahibinin kendi kişileri hariç),
-- team_matches tablosunu günceller ve uyan farklı kişi (telefon) sayısını döner.
-- Aynı puanlama web/lib.js içindeki matchContacts ile uyumludur.
create or replace function public.refresh_team_matches(p_listing uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare
  L public.listings%rowtype;
  R text; H text; P numeric; n integer;
begin
  if not public.is_active() then raise exception 'Erişim yok'; end if;
  select * into L from public.listings where id = p_listing;
  if not found then return 0; end if;
  if L.created_by is distinct from auth.uid() and not public.is_admin() then raise exception 'Erişim yok'; end if;
  -- Yöneticinin kendi portföyleri için bildirim gerekmez, yönetici zaten herkesi görür.
  if exists (select 1 from public.profiles where id = L.created_by and role = 'admin') then
    delete from public.team_matches where listing_id = L.id and status = 'new';
    return 0;
  end if;
  R := public.tr_norm(L.region); H := public.tr_norm(L.hood); P := L.price_usd;

  create temp table if not exists _tm (contact_id uuid, phone text, score int, reasons jsonb) on commit drop;
  delete from _tm where true;
  insert into _tm
  select c.id, c.phone, least(99, s.score), s.reasons
  from public.contacts c
  cross join lateral (
    select
      (select exists (select 1 from unnest(c.regions) x where public.region_hit(public.tr_norm(x), R, H))) as reg,
      (select row(i.happened_on, i.region, i.prop_type, i.outcome)::text from public.interactions i
         where i.contact_id = c.id and i.listing_id is distinct from L.id
           and public.region_hit(public.tr_norm(i.region), R, H)
         order by i.happened_on desc limit 1) as best_txt,
      (select i.outcome from public.interactions i
         where i.contact_id = c.id and i.listing_id is distinct from L.id
           and public.region_hit(public.tr_norm(i.region), R, H)
         order by i.happened_on desc limit 1) as best_outcome,
      (select to_char(i.happened_on, 'YYYY-MM') || ' ' || i.region || case when i.prop_type <> '' then ' ' || lower(i.prop_type) else '' end || ' · ' || i.outcome
         from public.interactions i
         where i.contact_id = c.id and i.listing_id is distinct from L.id
           and public.region_hit(public.tr_norm(i.region), R, H)
         order by i.happened_on desc limit 1) as best_label,
      exists (select 1 from public.interactions i where i.contact_id = c.id and i.prop_type = L.prop_type and L.prop_type <> '') as hist_type,
      exists (select 1 from public.interactions i where i.contact_id = c.id and i.outcome = 'Satın aldı') as bought
  ) f
  cross join lateral (
    select
      (case
         when c.budget_max is not null and c.budget_max >= P * 0.9 and (c.budget_min is null or c.budget_min <= P * 1.25) then 40
         when c.budget_max is not null and c.budget_max >= P * 0.7 and c.budget_max < P * 0.9 then 18
         when c.budget_max is not null and c.budget_min is not null and c.budget_min > P * 1.25 then 5
         when c.budget_max is null and c.tier = 'A' and P >= 500000 then 12
         else 0 end)
      + (case when f.reg then 28 else 0 end)
      + (case when f.best_txt is null then 0 when f.best_outcome = 'Satın aldı' then 38 else 32 end)
      + (case when f.best_txt is null and not f.reg and R <> '' and position(R in public.tr_norm(c.note)) > 0 then 15 else 0 end)
      + (case when L.prop_type <> '' and L.prop_type = any(c.types) then 14 when f.hist_type then 8 else 0 end)
      + (case when f.bought then 6 else 0 end) as score,
      to_jsonb(array_remove(array[
        case
          when c.budget_max is not null and c.budget_max >= P * 0.9 and (c.budget_min is null or c.budget_min <= P * 1.25)
            then 'Bütçe ' || coalesce(public.usd_txt(c.budget_min) || '–', '') || public.usd_txt(c.budget_max)
          when c.budget_max is not null and c.budget_max >= P * 0.7 and c.budget_max < P * 0.9 then 'Bütçe biraz altında (' || public.usd_txt(c.budget_max) || ')'
          when c.budget_max is null and c.tier = 'A' and P >= 500000 then 'Yüksek potansiyel (A)'
        end,
        case when f.reg then L.region || ' ile ilgileniyor' end,
        case when f.best_label is not null then 'Geçmiş: ' || f.best_label end,
        case when f.best_txt is null and not f.reg and R <> '' and position(R in public.tr_norm(c.note)) > 0 then 'Notunda ' || L.region || ' geçiyor' end,
        case when L.prop_type <> '' and L.prop_type = any(c.types) then L.prop_type || ' arıyor' when f.hist_type then 'Daha önce ' || lower(L.prop_type) || ' konuşuldu' end
      ], null)) as reasons
  ) s
  where c.owner_id is distinct from L.created_by and s.score >= 28;

  insert into public.team_matches (listing_id, contact_id, score, reasons)
  select L.id, contact_id, score, reasons from _tm
  on conflict (listing_id, contact_id) do update set score = excluded.score, reasons = excluded.reasons, updated_at = now();
  delete from public.team_matches t where t.listing_id = L.id and t.status = 'new'
    and not exists (select 1 from _tm where _tm.contact_id = t.contact_id);
  select count(distinct phone) into n from _tm;
  return n;
end $$;

-- ---------- Yetkiler ----------
revoke all on public.profiles, public.listings, public.contacts, public.interactions, public.settings, public.team_matches, public.fx_rates from anon;
grant select, insert, update, delete on public.fx_rates to authenticated;
grant execute on function public.current_usd_try() to authenticated;
grant select, update, delete on public.team_matches to authenticated;
revoke execute on function public.refresh_team_matches(uuid) from public, anon;
grant execute on function public.refresh_team_matches(uuid) to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.listings, public.contacts, public.interactions, public.settings to authenticated;
revoke execute on function public.transfer_contacts(uuid, uuid) from public, anon;
grant execute on function public.transfer_contacts(uuid, uuid) to authenticated;
revoke execute on function public.set_my_name(text) from public, anon;
grant execute on function public.set_my_name(text) to authenticated;
grant execute on function public.is_admin(), public.is_active() to authenticated;
-- Sunucu fonksiyonları (danışman hesabı, kur) servis rolüyle çalışır. Yeni Supabase projeleri
-- bu yetkiyi otomatik vermediği için açıkça veriyoruz.
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant execute on all functions in schema public to service_role;
