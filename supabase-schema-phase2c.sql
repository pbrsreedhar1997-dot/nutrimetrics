-- NutriMetrics — Supabase schema (Phase 2c: media attachments on posts)
-- Run once in the Supabase SQL Editor, after supabase-schema-phase2.sql / phase2b.sql.
-- Lets feed posts (including ones shared to a challenge's group) attach an
-- image, gif, or video uploaded to the "media" Storage bucket.

alter table posts add column if not exists media_url  text;
alter table posts add column if not exists media_type text; -- 'image' | 'gif' | 'video'
