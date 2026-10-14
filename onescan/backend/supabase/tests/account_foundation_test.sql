-- Run after auth_stub.sql + the migration. Every block raises on failure.
\set ON_ERROR_STOP on
set client_min_messages = warning;

-- Signup creates the OneScan user, identity, FREE entitlement and REGISTER audit.
insert into auth.users (id, email, encrypted_password) values
  ('00000000-0000-0000-0000-00000000000a', 'Alice@Example.com ', 'h1'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com', 'h2');

do $$
declare u record; uid uuid;
begin
  uid := app.user_for('00000000-0000-0000-0000-00000000000a');
  assert uid is not null, 'user created on signup';
  assert uid <> '00000000-0000-0000-0000-00000000000a'::uuid, 'OneScan user_id is not the provider id';
  assert substr(uid::text, 15, 1) = '7', 'user_id is UUIDv7';
  select * into u from app.users where user_id = uid;
  assert u.email_normalized = 'alice@example.com', 'email normalised';
  assert u.email_verified_at is null, 'not verified yet';
  assert (select plan from app.entitlements where user_id = uid) = 'FREE';
  assert (select capabilities from app.entitlements where user_id = uid) = array['local_scan','local_ocr','pdf','local_search'];
  assert (select count(*) from app.audit_events where user_id = uid and event = 'REGISTER') = 1;
  assert (select count(*) from information_schema.columns where table_schema = 'app' and column_name ilike '%password%') = 0, 'no password columns';
end $$;

-- Verification, reset request, password change.
update auth.users set email_confirmed_at = now() where id = '00000000-0000-0000-0000-00000000000a';
update auth.users set recovery_sent_at = now() where id = '00000000-0000-0000-0000-00000000000a';
update auth.users set encrypted_password = 'h1b' where id = '00000000-0000-0000-0000-00000000000a';
do $$
declare uid uuid := app.user_for('00000000-0000-0000-0000-00000000000a'); m jsonb;
begin
  m := app.me('00000000-0000-0000-0000-00000000000a');
  assert (m->>'email_verified')::boolean, 'verified';
  assert m->>'status' = 'active';
  assert m->>'plan' = 'FREE';
  assert (select array_agg(event order by id) from app.audit_events where user_id = uid)
       = array['REGISTER','EMAIL_VERIFIED','PASSWORD_RESET_REQUEST','PASSWORD_RESET_COMPLETED'], 'audit sequence';
end $$;

-- Sessions + devices.
insert into auth.sessions (id, user_id) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b');
select app.register_device('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1',
  '11111111-1111-4111-8111-111111111111', 'android', 'Galaxy S25', '1.3.0');
select app.register_device('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a2',
  '22222222-2222-4222-8222-222222222222', 'android', 'Tablet', '1.3.0');
-- Same installation logging in again: same device row, new session.
select app.register_device('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1',
  '11111111-1111-4111-8111-111111111111', 'android', null, '1.3.1');
select app.register_device('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000b1',
  '33333333-3333-4333-8333-333333333333', 'android', 'Bob phone', '1.3.0');
do $$
declare l jsonb; bobdev uuid; uid uuid := app.user_for('00000000-0000-0000-0000-00000000000a');
begin
  assert (select count(*) from app.audit_events where event = 'LOGIN_SUCCESS') = 3, 'login audit per session';
  l := app.list_devices('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1');
  assert jsonb_array_length(l) = 2, 'two devices';
  assert (select count(*) from jsonb_array_elements(l) e where (e->>'current')::boolean) = 1, 'one current';
  assert (select device_label from app.devices where installation_id = '11111111-1111-4111-8111-111111111111') = 'Galaxy S25', 'label kept';
  assert (select app_version from app.devices where installation_id = '11111111-1111-4111-8111-111111111111') = '1.3.1';
  assert (select count(*) from app.audit_events where user_id = uid and event = 'DEVICE_REGISTERED') = 2, 'no duplicate registration event';
  -- Alice cannot revoke Bob's device.
  select device_id into bobdev from app.devices where installation_id = '33333333-3333-4333-8333-333333333333';
  assert not app.revoke_device('00000000-0000-0000-0000-00000000000a', bobdev), 'cross-user revoke refused';
  assert exists (select 1 from auth.sessions where id = '00000000-0000-0000-0000-0000000000b1'), 'bob session intact';
end $$;

-- Revoke the tablet: its session goes, the phone stays.
do $$
declare tab uuid;
begin
  select device_id into tab from app.devices where installation_id = '22222222-2222-4222-8222-222222222222';
  assert app.revoke_device('00000000-0000-0000-0000-00000000000a', tab);
  assert not exists (select 1 from auth.sessions where id = '00000000-0000-0000-0000-0000000000a2'), 'tablet session deleted';
  assert exists (select 1 from auth.sessions where id = '00000000-0000-0000-0000-0000000000a1'), 'phone session kept';
  assert jsonb_array_length(app.list_devices('00000000-0000-0000-0000-00000000000a', null)) = 1;
end $$;

-- Logout current device, then login again (re-registration reactivates the device).
select app.logout_current('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1');
do $$ begin
  assert not exists (select 1 from auth.sessions where user_id = '00000000-0000-0000-0000-00000000000a'), 'session gone';
  assert jsonb_array_length(app.list_devices('00000000-0000-0000-0000-00000000000a', null)) = 0;
  assert exists (select 1 from app.audit_events where event = 'LOGOUT');
end $$;
insert into auth.sessions (id, user_id) values ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-00000000000a');
select app.register_device('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a3',
  '11111111-1111-4111-8111-111111111111', 'android', null, '1.3.1');
do $$ begin
  assert jsonb_array_length(app.list_devices('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a3')) = 1;
end $$;

-- Logout all.
insert into auth.sessions (id, user_id) values ('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-00000000000a');
select app.revoke_all('00000000-0000-0000-0000-00000000000a');
do $$ begin
  assert not exists (select 1 from auth.sessions where user_id = '00000000-0000-0000-0000-00000000000a'), 'all sessions gone';
  assert exists (select 1 from auth.sessions where user_id = '00000000-0000-0000-0000-00000000000b'), 'other users untouched';
  assert exists (select 1 from app.audit_events where event = 'LOGOUT_ALL');
end $$;

-- Session policy: 30-day inactivity and 90-day absolute.
insert into auth.sessions (id, user_id, created_at, updated_at, refreshed_at) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-00000000000a', now() - interval '40 days', now() - interval '31 days', null),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-00000000000a', now() - interval '91 days', now() - interval '1 day', (now() - interval '1 day')::timestamp),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-00000000000a', now() - interval '60 days', now() - interval '60 days', (now() - interval '2 days') at time zone 'UTC');
do $$ begin
  assert app.enforce_session_policy() = 2, 'two sessions expired by policy';
  assert exists (select 1 from auth.sessions where id = '00000000-0000-0000-0000-0000000000c3'), 'recently refreshed session kept';
end $$;

-- Deletion: request (14 days), cancel, request again, process after the grace period.
do $$
declare r jsonb; uid uuid := app.user_for('00000000-0000-0000-0000-00000000000a');
begin
  insert into auth.sessions (id, user_id) values ('00000000-0000-0000-0000-0000000000a5', '00000000-0000-0000-0000-00000000000a');
  r := app.request_deletion('00000000-0000-0000-0000-00000000000a');
  assert (r->>'scheduled_for')::timestamptz between now() + interval '13 days 23 hours' and now() + interval '14 days 1 hour', '14-day grace';
  assert (select status from app.users where user_id = uid) = 'pending_deletion';
  assert not exists (select 1 from auth.sessions where user_id = '00000000-0000-0000-0000-00000000000a'), 'sessions ended';
  assert app.me('00000000-0000-0000-0000-00000000000a')->>'deletion_scheduled_for' is not null;
  -- A second request keeps the original date.
  assert (app.request_deletion('00000000-0000-0000-0000-00000000000a')->>'scheduled_for') = r->>'scheduled_for', 'idempotent';
  assert app.cancel_deletion('00000000-0000-0000-0000-00000000000a'), 'cancel within grace';
  assert (select status from app.users where user_id = uid) = 'active';
  assert app.me('00000000-0000-0000-0000-00000000000a')->>'deletion_scheduled_for' is null;
  assert not app.cancel_deletion('00000000-0000-0000-0000-00000000000a'), 'nothing to cancel';
  perform app.request_deletion('00000000-0000-0000-0000-00000000000a');
  assert app.process_deletions() = 0, 'not before the grace period';
  update app.account_deletions set scheduled_for = now() - interval '1 minute' where user_id = uid;
  assert app.process_deletions() = 1;
  assert not exists (select 1 from auth.users where id = '00000000-0000-0000-0000-00000000000a'), 'provider user deleted';
  assert not exists (select 1 from app.users where user_id = uid), 'OneScan user deleted';
  assert not exists (select 1 from app.devices where user_id = uid), 'devices deleted';
  assert not exists (select 1 from app.audit_events where user_id = uid), 'audit pseudonymised';
  assert exists (select 1 from app.audit_events where event = 'ACCOUNT_DELETED' and user_hash is not null);
  assert exists (select 1 from app.users where email_normalized = 'bob@example.com'), 'other users kept';
end $$;

-- The email can sign up again after deletion.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000c', 'alice@example.com');
do $$ begin
  assert app.user_for('00000000-0000-0000-0000-00000000000c') is not null, 're-signup after deletion';
end $$;

-- Roles: the client roles cannot read or call anything in schema app.
do $$ begin
  assert not has_schema_privilege('anon', 'app', 'usage'), 'anon has no access';
  assert not has_schema_privilege('authenticated', 'app', 'usage'), 'authenticated has no access';
  assert has_function_privilege('service_role', 'app.me(uuid, text, timestamptz)', 'execute');
  assert not has_function_privilege('authenticated', 'app.revoke_all(uuid)', 'execute');
  assert not has_function_privilege('service_role', 'app.process_deletions()', 'execute'), 'deletion job is not an API call';
end $$;

select 'ALL ACCOUNT SQL TESTS PASSED' as result;
