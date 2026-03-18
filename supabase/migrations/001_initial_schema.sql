-- ============================================================
-- MemeMaster TW — Initial Schema
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- Required extensions
create extension if not exists "uuid-ossp";
create extension if not exists pg_trgm;
create extension if not exists pg_net;       -- HTTP calls from pg_cron → Edge Function

-- ============================================================
-- ENUM TYPES
-- ============================================================
create type media_type_enum as enum ('image', 'video', 'gif');
create type platform_enum   as enum ('ptt', 'dcard', 'threads', 'instagram');

-- ============================================================
-- MEMES TABLE
-- ============================================================
create table public.memes (
  id              uuid             primary key default uuid_generate_v4(),
  platform        platform_enum    not null,
  source_url      text             not null unique,        -- original post URL (dedup key)
  media_url       text             not null,               -- original CDN URL
  cached_url      text,                                    -- Supabase Storage public URL
  media_type      media_type_enum  not null default 'image',
  width           integer,
  height          integer,
  title           text,
  like_count      integer          not null default 0,
  share_count     integer          not null default 0,
  comment_count   integer          not null default 0,
  phash           text             not null,               -- 64-char hex perceptual hash
  trending_score  float8           not null default 0.0,
  notified        boolean          not null default false, -- FCM sent flag
  fetched_at      timestamptz      not null default now(),
  created_at      timestamptz      not null default now()
);

-- ============================================================
-- LIKE-COUNT HISTORY  (for spike detection)
-- ============================================================
create table public.meme_stats_history (
  id          bigserial    primary key,
  meme_id     uuid         not null references public.memes(id) on delete cascade,
  like_count  integer      not null,
  recorded_at timestamptz  not null default now()
);

-- ============================================================
-- INDEXES
-- ============================================================
create index idx_memes_platform        on public.memes(platform);
create index idx_memes_fetched_at      on public.memes(fetched_at desc);
create index idx_memes_trending_score  on public.memes(trending_score desc);
create index idx_memes_phash           on public.memes(phash);
create index idx_memes_notified        on public.memes(notified) where notified = false;
create index idx_stats_meme_recorded   on public.meme_stats_history(meme_id, recorded_at desc);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.memes              enable row level security;
alter table public.meme_stats_history enable row level security;

-- Flutter app (anon key) — read-only
create policy "public read memes"
  on public.memes for select using (true);

create policy "public read stats"
  on public.meme_stats_history for select using (true);

-- Python scraper (service_role key) — full write access
create policy "service write memes"
  on public.memes for all using (auth.role() = 'service_role');

create policy "service write stats"
  on public.meme_stats_history for all using (auth.role() = 'service_role');

-- ============================================================
-- TRENDING VIEW
-- Memes that gained > 100 likes in the past hour, not yet notified
-- ============================================================
create or replace view public.trending_memes as
select
  m.id,
  m.title,
  m.media_url,
  m.cached_url,
  m.platform,
  m.like_count,
  (
    m.like_count - coalesce((
      select h.like_count
      from   public.meme_stats_history h
      where  h.meme_id = m.id
        and  h.recorded_at < now() - interval '1 hour'
      order  by h.recorded_at desc
      limit  1
    ), 0)
  ) as like_delta_1h
from public.memes m
where m.notified = false;

-- ============================================================
-- STORAGE BUCKET
-- ============================================================
insert into storage.buckets (id, name, public)
values ('memes', 'memes', true)
on conflict do nothing;

-- Allow public reads on storage
create policy "public read memes storage"
  on storage.objects for select
  using (bucket_id = 'memes');

-- Allow service_role to upload
create policy "service upload memes storage"
  on storage.objects for insert
  using (bucket_id = 'memes' and auth.role() = 'service_role');

-- ============================================================
-- pg_cron: call trending-alert Edge Function every hour
-- (Replace YOUR_PROJECT_REF and YOUR_ANON_KEY before running)
-- ============================================================
-- select cron.schedule(
--   'trending-check',
--   '0 * * * *',
--   $$
--     select net.http_post(
--       url     := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/trending-alert',
--       headers := '{"Authorization": "Bearer YOUR_ANON_KEY", "Content-Type": "application/json"}'::jsonb,
--       body    := '{}'::jsonb
--     )
--   $$
-- );
