-- NutriMetrics — Supabase schema (Phase 2d: group chat)
-- Run once in the Supabase SQL Editor, after supabase-schema-phase2.sql.
-- Lets a group have an actual message thread (like a WhatsApp group chat),
-- shown alongside 1:1 conversations in one unified Connections list.

create table if not exists group_messages (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references groups(id) on delete cascade,
  sender_id  uuid not null references profiles(id) on delete cascade,
  content    text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_group_messages_group on group_messages(group_id, created_at);
