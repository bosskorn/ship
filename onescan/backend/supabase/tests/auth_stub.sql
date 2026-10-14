-- Minimal stand-in for Supabase's `auth` schema and roles (only the columns OneScan uses),
-- so the account migration can be tested on a plain Postgres.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema extensions;
create schema auth;
create table auth.users (
  id                 uuid primary key,
  email              text,
  encrypted_password text,
  email_confirmed_at timestamptz,
  recovery_sent_at   timestamptz,
  created_at         timestamptz not null default now()
);
create table auth.sessions (
  id           uuid primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  refreshed_at timestamp
);
