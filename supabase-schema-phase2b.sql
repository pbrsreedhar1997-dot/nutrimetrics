-- NutriMetrics — Supabase schema (Phase 2b: step challenges + leaderboards)
-- Run once in the Supabase SQL Editor, after supabase-schema-phase2.sql.

create table if not exists challenges (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  metric      text not null default 'steps', -- reserved for future metrics
  start_date  date not null,
  end_date    date not null,
  created_by  uuid not null references profiles(id) on delete cascade,
  group_id    uuid references groups(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_challenges_creator on challenges(created_by);

create table if not exists challenge_participants (
  id            uuid primary key default gen_random_uuid(),
  challenge_id  uuid not null references challenges(id) on delete cascade,
  user_id       uuid not null references profiles(id) on delete cascade,
  joined_at     timestamptz not null default now(),
  unique (challenge_id, user_id)
);
create index if not exists idx_chal_participants_chal on challenge_participants(challenge_id);
create index if not exists idx_chal_participants_user on challenge_participants(user_id);
