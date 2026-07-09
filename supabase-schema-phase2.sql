-- NutriMetrics — Supabase schema (Phase 2: social layer)
-- Run once in the Supabase project's SQL Editor, after supabase-schema.sql.
--
-- Notes:
--   * Same conventions as Phase 1: plain data tables, no RLS (only the server's
--     service-role client talks to Postgres directly), FKs cascade on delete.
--   * `posts` stores a SNAPSHOT of activity data at share time (steps/distance/
--     calories/active_minutes copied from activity_logs when the post is
--     created) — sharing is manual and deliberate, not a live link.

create table if not exists friendships (
  id            uuid primary key default gen_random_uuid(),
  requester_id  uuid not null references profiles(id) on delete cascade,
  addressee_id  uuid not null references profiles(id) on delete cascade,
  status        text not null default 'pending', -- 'pending' | 'accepted' | 'declined'
  created_at    timestamptz not null default now(),
  responded_at  timestamptz,
  unique (requester_id, addressee_id)
);
create index if not exists idx_friendships_requester on friendships(requester_id);
create index if not exists idx_friendships_addressee on friendships(addressee_id);

create table if not exists groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_by  uuid not null references profiles(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table if not exists group_members (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references groups(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  role       text not null default 'member', -- 'owner' | 'member'
  joined_at  timestamptz not null default now(),
  unique (group_id, user_id)
);
create index if not exists idx_group_members_group on group_members(group_id);
create index if not exists idx_group_members_user on group_members(user_id);

create table if not exists posts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  kind            text not null, -- 'activity' | 'thought'
  content         text,
  steps           integer,
  distance_km     numeric,
  calories_burned numeric,
  active_minutes  integer,
  group_id        uuid references groups(id) on delete cascade, -- null = shared to friends
  created_at      timestamptz not null default now()
);
create index if not exists idx_posts_user on posts(user_id);
create index if not exists idx_posts_group on posts(group_id);
create index if not exists idx_posts_created on posts(created_at desc);

create table if not exists post_likes (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references posts(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (post_id, user_id)
);
create index if not exists idx_post_likes_post on post_likes(post_id);

create table if not exists post_comments (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references posts(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  content     text not null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_post_comments_post on post_comments(post_id);

create table if not exists messages (
  id            uuid primary key default gen_random_uuid(),
  sender_id     uuid not null references profiles(id) on delete cascade,
  recipient_id  uuid not null references profiles(id) on delete cascade,
  content       text not null,
  created_at    timestamptz not null default now(),
  read_at       timestamptz
);
create index if not exists idx_messages_sender on messages(sender_id);
create index if not exists idx_messages_recipient on messages(recipient_id);
create index if not exists idx_messages_pair on messages(sender_id, recipient_id, created_at);
