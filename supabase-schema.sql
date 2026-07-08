-- NutriMetrics — Supabase schema (Phase 1: relational port of the NeDB collections)
-- Run this once in the Supabase project's SQL Editor (Dashboard → SQL Editor → New query).
--
-- Notes:
--   * Application auth is entirely our own JWT (issued by server.js). Phone OTP is
--     verified by MSG91 directly (send-otp / verify-otp) — Supabase Auth sessions
--     are not used at all. These are plain data tables accessed by the server's
--     service-role client; no RLS policies are required (the server is the only
--     thing that talks to Postgres directly).
--   * `gen_random_uuid()` needs the pgcrypto extension, enabled by default on Supabase.
--   * If you ran an earlier version of this schema with a `supabase_uid` column on
--     `profiles`, it's no longer used and safe to drop:
--     alter table profiles drop column if exists supabase_uid;

create table if not exists profiles (
  id            uuid primary key default gen_random_uuid(),
  username      text unique,
  email         text unique,
  phone         text unique,
  password_hash text,
  created_at    timestamptz not null default now()
);

create table if not exists protein_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  date          date not null,
  food_name     text not null,
  grams         numeric,
  protein       numeric not null,
  emoji         text default '',
  protein_goal  numeric default 120,
  logged_at     timestamptz not null default now()
);
create index if not exists idx_protein_logs_user on protein_logs(user_id);

create table if not exists diet_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  date        date not null,
  food_name   text not null,
  emoji       text default '',
  grams       numeric,
  protein     numeric default 0,
  carbs       numeric default 0,
  fat         numeric default 0,
  calories    numeric default 0,
  fiber       numeric default 0,
  vitB12      numeric default 0,
  vitC        numeric default 0,
  vitD        numeric default 0,
  iron        numeric default 0,
  calcium     numeric default 0,
  logged_at   timestamptz not null default now()
);
create index if not exists idx_diet_logs_user on diet_logs(user_id);

create table if not exists diet_goals (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null unique references profiles(id) on delete cascade,
  calories  numeric default 2000,
  protein   numeric default 120,
  carbs     numeric default 250,
  fat       numeric default 65
);

create table if not exists bmi_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  bmi         numeric not null,
  weight_kg   numeric,
  height_cm   numeric,
  category    text,
  age         integer,
  gender      text,
  logged_at   timestamptz not null default now()
);
create index if not exists idx_bmi_logs_user on bmi_logs(user_id);

create table if not exists workout_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  date        date not null,
  goal        text,
  level       text,
  logged_at   timestamptz not null default now()
);
create index if not exists idx_workout_logs_user on workout_logs(user_id);

create table if not exists activity_logs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  date            date not null,
  steps           integer default 0,
  distance_km     numeric default 0,
  calories_burned numeric default 0,
  active_minutes  integer default 0,
  step_goal       integer default 10000,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, date)
);
create index if not exists idx_activity_logs_user on activity_logs(user_id);
