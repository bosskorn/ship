-- OneScan 1.3 — Account Foundation (docs/account/ACCOUNT-1.3-SPEC.md §3, §5, §7, §8, §11)
--
-- Supabase Auth owns credentials, password hashes, email verification, password reset and
-- sessions (schema `auth`). This migration adds only what OneScan itself needs, in schema `app`:
-- an immutable OneScan user_id mapped to the provider identity, devices, entitlements, account
-- deletion and a security audit trail. Nothing here stores passwords, OTPs, tokens or documents.
--
-- Access: every table has RLS on and no policies, and the schema is not exposed to `anon` or
-- `authenticated`; only the OneScan API (service role) calls the functions below.

create extension if not exists pgcrypto with schema extensions;

create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to service_role;

-- UUIDv7 (time-ordered, random) for OneScan ids.
create or replace function app.uuid_v7() returns uuid
language plpgsql volatile set search_path = '' as $$
declare
  ms bigint := floor(extract(epoch from clock_timestamp()) * 1000);
  b bytea := extensions.gen_random_bytes(16);
begin
  b := set_byte(b, 0, ((ms >> 40) & 255)::int);
  b := set_byte(b, 1, ((ms >> 32) & 255)::int);
  b := set_byte(b, 2, ((ms >> 24) & 255)::int);
  b := set_byte(b, 3, ((ms >> 16) & 255)::int);
  b := set_byte(b, 4, ((ms >> 8) & 255)::int);
  b := set_byte(b, 5, (ms & 255)::int);
  b := set_byte(b, 6, (get_byte(b, 6) & 15) | 112);   -- version 7
  b := set_byte(b, 8, (get_byte(b, 8) & 63) | 128);   -- variant 10
  return encode(b, 'hex')::uuid;
end $$;

-- Secret salt for pseudonymising deleted users in the audit trail.
create table if not exists app.settings (
  key   text primary key,
  value text not null
);
insert into app.settings (key, value)
values ('audit_salt', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (key) do nothing;

create table if not exists app.users (
  user_id           uuid primary key default app.uuid_v7(),
  email_normalized  text not null,
  email_verified_at timestamptz,
  status            text not null default 'active' check (status in ('active', 'pending_deletion', 'deleted')),
  locale            text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create unique index if not exists users_email_active on app.users (email_normalized) where status <> 'deleted';

create table if not exists app.auth_identities (
  provider         text not null,
  provider_subject uuid not null,
  user_id          uuid not null references app.users (user_id) on delete cascade,
  created_at       timestamptz not null default now(),
  primary key (provider, provider_subject)
);
create index if not exists auth_identities_user on app.auth_identities (user_id);

create table if not exists app.devices (
  device_id           uuid primary key default app.uuid_v7(),
  user_id             uuid not null references app.users (user_id) on delete cascade,
  installation_id     uuid not null,
  provider_session_id uuid,
  platform            text not null check (platform in ('android', 'ios', 'web')),
  device_label        text check (char_length(device_label) <= 80),
  app_version         text not null check (char_length(app_version) <= 32),
  created_at          timestamptz not null default now(),
  last_seen_at        timestamptz not null default now(),
  revoked_at          timestamptz,
  unique (user_id, installation_id)
);

create table if not exists app.entitlements (
  user_id      uuid primary key references app.users (user_id) on delete cascade,
  plan         text not null default 'FREE' check (plan in ('FREE', 'PLUS', 'BUSINESS')),
  capabilities text[] not null,
  source       text not null default 'default',
  valid_until  timestamptz,
  updated_at   timestamptz not null default now()
);

create table if not exists app.audit_events (
  id               bigint generated always as identity primary key,
  user_id          uuid,
  user_hash        text,
  event            text not null check (event in (
                     'REGISTER', 'EMAIL_VERIFIED', 'LOGIN_SUCCESS', 'LOGIN_FAILED', 'TOKEN_REFRESH',
                     'PASSWORD_RESET_REQUEST', 'PASSWORD_RESET_COMPLETED', 'LOGOUT', 'LOGOUT_ALL',
                     'DEVICE_REGISTERED', 'DEVICE_REVOKED', 'ACCOUNT_DELETE_REQUESTED',
                     'ACCOUNT_DELETE_CANCELLED', 'ACCOUNT_DELETED', 'SESSION_EXPIRED_POLICY')),
  device_id        uuid,
  meta             jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);
create index if not exists audit_events_user on app.audit_events (user_id, created_at desc);

create table if not exists app.account_deletions (
  user_id       uuid primary key,
  requested_at  timestamptz not null default now(),
  scheduled_for timestamptz not null,
  cancelled_at  timestamptz,
  completed_at  timestamptz,
  source        text not null default 'app' check (source in ('app', 'web', 'support'))
);

alter table app.settings enable row level security;
alter table app.users enable row level security;
alter table app.auth_identities enable row level security;
alter table app.devices enable row level security;
alter table app.entitlements enable row level security;
alter table app.audit_events enable row level security;
alter table app.account_deletions enable row level security;
grant select, insert, update, delete on all tables in schema app to service_role;

-- Local capabilities are free and never depend on the account (spec §1, PHASE 9).
create or replace function app.free_capabilities() returns text[]
language sql immutable as $$ select array['local_scan', 'local_ocr', 'pdf', 'local_search'] $$;

create or replace function app.audit(p_user uuid, p_event text, p_device uuid default null, p_meta jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = '' as $$
  insert into app.audit_events (user_id, event, device_id, meta) values (p_user, p_event, p_device, coalesce(p_meta, '{}'::jsonb));
$$;

create or replace function app.user_for(p_sub uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select user_id from app.auth_identities where provider = 'supabase' and provider_subject = p_sub;
$$;

-- Creates the OneScan user for a provider identity (idempotent). Called by the signup trigger
-- and, as a fallback, by the API (`/v1/me`) for identities created before this migration.
create or replace function app.ensure_user(p_sub uuid, p_email text, p_confirmed_at timestamptz)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := app.user_for(p_sub);
begin
  if uid is not null then
    return uid;
  end if;
  insert into app.users (email_normalized, email_verified_at)
  values (lower(trim(p_email)), p_confirmed_at)
  returning user_id into uid;
  insert into app.auth_identities (provider, provider_subject, user_id) values ('supabase', p_sub, uid);
  insert into app.entitlements (user_id, capabilities) values (uid, app.free_capabilities());
  perform app.audit(uid, 'REGISTER');
  if p_confirmed_at is not null then
    perform app.audit(uid, 'EMAIL_VERIFIED');
  end if;
  return uid;
end $$;

-- auth.users → app.users: signup, verification, email change, reset requested/completed.
create or replace function app.on_auth_user_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email is not null then
    perform app.ensure_user(new.id, new.email, new.email_confirmed_at);
  end if;
  return new;
end $$;

create or replace function app.on_auth_user_update() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := app.user_for(new.id);
begin
  if uid is null then
    if new.email is not null then
      perform app.ensure_user(new.id, new.email, new.email_confirmed_at);
    end if;
    return new;
  end if;
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    update app.users set email_verified_at = new.email_confirmed_at, updated_at = now() where user_id = uid;
    perform app.audit(uid, 'EMAIL_VERIFIED');
  end if;
  if new.email is distinct from old.email and new.email is not null then
    update app.users set email_normalized = lower(trim(new.email)), updated_at = now() where user_id = uid;
  end if;
  if new.recovery_sent_at is distinct from old.recovery_sent_at and new.recovery_sent_at is not null then
    perform app.audit(uid, 'PASSWORD_RESET_REQUEST');
  end if;
  if new.encrypted_password is distinct from old.encrypted_password and old.encrypted_password is not null then
    perform app.audit(uid, 'PASSWORD_RESET_COMPLETED');
  end if;
  return new;
end $$;

-- auth.sessions → LOGIN_SUCCESS (failed logins never reach the database; see KNOWN ISSUES).
create or replace function app.on_auth_session_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := app.user_for(new.user_id);
begin
  if uid is not null then
    perform app.audit(uid, 'LOGIN_SUCCESS', null, jsonb_build_object('session', new.id));
  end if;
  return new;
end $$;

drop trigger if exists onescan_user_insert on auth.users;
create trigger onescan_user_insert after insert on auth.users for each row execute function app.on_auth_user_insert();
drop trigger if exists onescan_user_update on auth.users;
create trigger onescan_user_update after update on auth.users for each row execute function app.on_auth_user_update();
drop trigger if exists onescan_session_insert on auth.sessions;
create trigger onescan_session_insert after insert on auth.sessions for each row execute function app.on_auth_session_insert();

-- ---------------------------------------------------------------- API functions (service role)

create or replace function app.me(p_sub uuid, p_email text default null, p_confirmed_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := app.user_for(p_sub);
  r jsonb;
begin
  if uid is null and p_email is not null then
    uid := app.ensure_user(p_sub, p_email, p_confirmed_at);
  end if;
  if uid is null then
    return null;
  end if;
  select jsonb_build_object(
           'user_id', u.user_id,
           'email', u.email_normalized,
           'email_verified', u.email_verified_at is not null,
           'status', u.status,
           'plan', coalesce(e.plan, 'FREE'),
           'capabilities', to_jsonb(coalesce(e.capabilities, app.free_capabilities())),
           'deletion_scheduled_for', d.scheduled_for)
    into r
    from app.users u
    left join app.entitlements e on e.user_id = u.user_id
    left join app.account_deletions d on d.user_id = u.user_id and d.cancelled_at is null and d.completed_at is null
   where u.user_id = uid;
  return r;
end $$;

create or replace function app.register_device(
  p_sub uuid, p_session uuid, p_installation uuid, p_platform text, p_label text, p_app_version text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := app.user_for(p_sub);
  d app.devices;
  is_new boolean;
begin
  if uid is null then
    raise exception 'unknown_user' using errcode = 'P0002';
  end if;
  select * into d from app.devices where user_id = uid and installation_id = p_installation;
  is_new := not found or d.revoked_at is not null;
  insert into app.devices as x (user_id, installation_id, provider_session_id, platform, device_label, app_version)
  values (uid, p_installation, p_session, p_platform, left(p_label, 80), left(p_app_version, 32))
  on conflict (user_id, installation_id) do update
    set provider_session_id = excluded.provider_session_id,
        platform = excluded.platform,
        device_label = coalesce(excluded.device_label, x.device_label),
        app_version = excluded.app_version,
        last_seen_at = now(),
        revoked_at = null
  returning * into d;
  if is_new then
    perform app.audit(uid, 'DEVICE_REGISTERED', d.device_id);
  end if;
  return jsonb_build_object('device_id', d.device_id);
end $$;

create or replace function app.heartbeat(p_sub uuid, p_session uuid, p_app_version text)
returns void language sql security definer set search_path = '' as $$
  update app.devices
     set last_seen_at = now(), app_version = left(p_app_version, 32)
   where user_id = app.user_for(p_sub) and provider_session_id = p_session and revoked_at is null;
$$;

create or replace function app.list_devices(p_sub uuid, p_session uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'device_id', d.device_id,
           'platform', d.platform,
           'device_label', d.device_label,
           'app_version', d.app_version,
           'created_at', d.created_at,
           'last_seen_at', d.last_seen_at,
           'current', d.provider_session_id = p_session)
         order by d.last_seen_at desc), '[]'::jsonb)
    from app.devices d
   where d.user_id = app.user_for(p_sub) and d.revoked_at is null;
$$;

-- Ends one device's session. Only the owner's devices; the provider session row is deleted so
-- its refresh token stops working at once.
create or replace function app.revoke_device(p_sub uuid, p_device uuid, p_event text default 'DEVICE_REVOKED')
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := app.user_for(p_sub);
  d app.devices;
begin
  update app.devices set revoked_at = now()
   where device_id = p_device and user_id = uid and revoked_at is null
  returning * into d;
  if not found then
    return false;
  end if;
  if d.provider_session_id is not null then
    delete from auth.sessions where id = d.provider_session_id and user_id = p_sub;
  end if;
  perform app.audit(uid, p_event, d.device_id);
  return true;
end $$;

-- Logout on this device: the device row for the caller's current session.
create or replace function app.logout_current(p_sub uuid, p_session uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := app.user_for(p_sub);
  dev uuid;
begin
  select device_id into dev from app.devices
   where user_id = uid and provider_session_id = p_session and revoked_at is null;
  update app.devices set revoked_at = now() where device_id = dev;
  delete from auth.sessions where id = p_session and user_id = p_sub;
  if uid is not null then
    perform app.audit(uid, 'LOGOUT', dev);
  end if;
end $$;

create or replace function app.revoke_all(p_sub uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := app.user_for(p_sub);
begin
  update app.devices set revoked_at = now() where user_id = uid and revoked_at is null;
  delete from auth.sessions where user_id = p_sub;
  if uid is not null then
    perform app.audit(uid, 'LOGOUT_ALL');
  end if;
end $$;

-- Account deletion (spec §8): 14-day grace, every session ends now; local documents are never
-- touched (the server has none).
create or replace function app.request_deletion(p_sub uuid, p_source text default 'app')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := app.user_for(p_sub);
  due timestamptz := now() + interval '14 days';
begin
  if uid is null then
    raise exception 'unknown_user' using errcode = 'P0002';
  end if;
  insert into app.account_deletions as x (user_id, requested_at, scheduled_for, source)
  values (uid, now(), due, p_source)
  on conflict (user_id) do update
    set requested_at = case when x.cancelled_at is null and x.completed_at is null then x.requested_at else now() end,
        scheduled_for = case when x.cancelled_at is null and x.completed_at is null then x.scheduled_for else excluded.scheduled_for end,
        cancelled_at = null,
        source = excluded.source
  returning scheduled_for into due;
  update app.users set status = 'pending_deletion', updated_at = now() where user_id = uid;
  update app.devices set revoked_at = now() where user_id = uid and revoked_at is null;
  delete from auth.sessions where user_id = p_sub;
  perform app.audit(uid, 'ACCOUNT_DELETE_REQUESTED', null, jsonb_build_object('scheduled_for', due));
  return jsonb_build_object('scheduled_for', due);
end $$;

create or replace function app.cancel_deletion(p_sub uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := app.user_for(p_sub);
begin
  update app.account_deletions set cancelled_at = now()
   where user_id = uid and cancelled_at is null and completed_at is null and scheduled_for > now();
  if not found then
    return false;
  end if;
  update app.users set status = 'active', updated_at = now() where user_id = uid;
  perform app.audit(uid, 'ACCOUNT_DELETE_CANCELLED');
  return true;
end $$;

-- Runs daily: deletes accounts whose grace period has passed. The provider user (auth.users,
-- with its identities and sessions) and every OneScan row go; the audit trail keeps only a
-- salted hash of the user id.
create or replace function app.process_deletions()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  rec record;
  n integer := 0;
  salt text := (select value from app.settings where key = 'audit_salt');
  h text;
begin
  for rec in
    select d.user_id from app.account_deletions d
     where d.cancelled_at is null and d.completed_at is null and d.scheduled_for <= now()
     for update skip locked
  loop
    h := encode(extensions.digest(rec.user_id::text || salt, 'sha256'), 'hex');
    update app.audit_events set user_hash = h, user_id = null, meta = '{}'::jsonb where user_id = rec.user_id;
    delete from auth.users where id in (
      select provider_subject from app.auth_identities where user_id = rec.user_id and provider = 'supabase');
    delete from app.users where user_id = rec.user_id;
    update app.account_deletions set completed_at = now() where user_id = rec.user_id;
    insert into app.audit_events (user_hash, event) values (h, 'ACCOUNT_DELETED');
    n := n + 1;
  end loop;
  return n;
end $$;

-- Session policy (spec §5, Owner decision): refresh inactivity 30 days, absolute 90 days.
-- Enforced here as well as in Auth settings, so it holds on every Supabase plan.
create or replace function app.enforce_session_policy()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  with gone as (
    delete from auth.sessions s
     where s.created_at < now() - interval '90 days'
        or greatest(s.created_at, s.updated_at, s.refreshed_at at time zone 'UTC') < now() - interval '30 days'
    returning s.user_id
  )
  insert into app.audit_events (user_id, event)
  select app.user_for(user_id), 'SESSION_EXPIRED_POLICY' from gone;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function app.purge_audit()
returns integer language sql security definer set search_path = '' as $$
  with gone as (delete from app.audit_events where created_at < now() - interval '12 months' returning 1)
  select count(*)::integer from gone;
$$;

revoke all on all functions in schema app from public;
grant execute on function
  app.me(uuid, text, timestamptz),
  app.register_device(uuid, uuid, uuid, text, text, text),
  app.heartbeat(uuid, uuid, text),
  app.list_devices(uuid, uuid),
  app.revoke_device(uuid, uuid, text),
  app.logout_current(uuid, uuid),
  app.revoke_all(uuid),
  app.request_deletion(uuid, text),
  app.cancel_deletion(uuid)
to service_role;

-- Schedules (pg_cron is available on Supabase; skipped where it is not, e.g. local tests).
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('onescan-session-policy', '17 * * * *', 'select app.enforce_session_policy()');
  perform cron.schedule('onescan-process-deletions', '41 3 * * *', 'select app.process_deletions()');
  perform cron.schedule('onescan-purge-audit', '53 3 * * 0', 'select app.purge_audit()');
exception when others then
  raise notice 'pg_cron unavailable: schedule app.enforce_session_policy / app.process_deletions / app.purge_audit elsewhere';
end $$;
