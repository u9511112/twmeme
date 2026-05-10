-- ============================================================
-- TWmeme — Neon Schema (replaces Supabase migrations)
--
-- Differences from Supabase 001+002:
--   - dropped pg_net (Supabase-only, was for trending-alert FCM)
--   - dropped memes.notified column (legacy FCM flag, dead code)
--   - dropped trending_memes view (was for FCM hourly check)
--   - dropped Storage bucket SQL (R2 lives outside the DB)
--   - dropped all RLS / auth.role() policies (Neon has no Supabase Auth)
--   - replaced with two LOGIN roles + GRANT-based access:
--       * web_anon — read public content, write logs only (cannot read logs)
--       * scraper  — full write on content + read logs for retro
--   - added GIN trigram index on memes.title (web does ILIKE search;
--     was free oversight in original; matters as DB grows past ~1000 rows)
--
-- Run order on a fresh Neon DB (as project owner, idempotent):
--   1. Run this whole file
--   2. ALTER ROLE web_anon PASSWORD '<random_a>';  -- goes into web/db.js
--   3. ALTER ROLE scraper  PASSWORD '<random_b>';  -- goes into scraper .env
--
-- Connection strings end up looking like:
--   postgresql://web_anon:<a>@ep-xxx.<region>.aws.neon.tech/<db>?sslmode=require
--   postgresql://scraper:<b>@ep-xxx.<region>.aws.neon.tech/<db>?sslmode=require
-- ============================================================

-- ============================================================
-- EXTENSIONS
-- ============================================================
create extension if not exists "uuid-ossp";
create extension if not exists pg_trgm;

-- ============================================================
-- ENUMS
-- ============================================================
do $$ begin
  if not exists (select 1 from pg_type where typname = 'media_type_enum') then
    create type media_type_enum as enum ('image', 'video', 'gif');
  end if;
  if not exists (select 1 from pg_type where typname = 'platform_enum') then
    create type platform_enum as enum ('ptt', 'dcard', 'threads', 'instagram');
  end if;
end $$;

-- ============================================================
-- ROLES
-- Passwords are intentionally left blank here. Set them with
-- ALTER ROLE after running this file (see header).
-- ============================================================
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'web_anon') then
    create role web_anon login;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'scraper') then
    create role scraper login;
  end if;
end $$;

-- ============================================================
-- TABLES
-- ============================================================
create table if not exists public.memes (
  id              uuid             primary key default uuid_generate_v4(),
  platform        platform_enum    not null,
  source_url      text             not null unique,        -- dedup key
  media_url       text             not null,               -- original CDN URL
  cached_url      text,                                    -- public R2 URL (cdn.twmeme...)
  media_type      media_type_enum  not null default 'image',
  width           integer,
  height          integer,
  title           text,
  like_count      integer          not null default 0,
  share_count     integer          not null default 0,
  comment_count   integer          not null default 0,
  phash           text             not null,               -- 64-char hex perceptual hash
  trending_score  float8           not null default 0.0,
  fetched_at      timestamptz      not null default now(),
  created_at      timestamptz      not null default now()
);

create table if not exists public.meme_stats_history (
  id          bigserial    primary key,
  meme_id     uuid         not null references public.memes(id) on delete cascade,
  like_count  integer      not null,
  recorded_at timestamptz  not null default now()
);

create table if not exists public.search_queries (
  id            bigserial    primary key,
  query_text    text         not null,
  had_result    boolean      not null,
  result_count  integer,
  clicked_index integer,
  searched_at   timestamptz  not null default now()
);

create table if not exists public.unmet_searches (
  id           bigserial    primary key,
  description  text         not null,
  created_at   timestamptz  not null default now()
);

-- ============================================================
-- INDEXES
-- ============================================================
create index if not exists idx_memes_platform              on public.memes(platform);
create index if not exists idx_memes_fetched_at            on public.memes(fetched_at desc);
create index if not exists idx_memes_trending_score        on public.memes(trending_score desc);
create index if not exists idx_memes_phash                 on public.memes(phash);
create index if not exists idx_memes_title_trgm            on public.memes using gin (title gin_trgm_ops);
create index if not exists idx_stats_meme_recorded         on public.meme_stats_history(meme_id, recorded_at desc);
create index if not exists idx_search_queries_searched     on public.search_queries(searched_at desc);
create index if not exists idx_search_queries_zero_result  on public.search_queries(searched_at desc) where had_result = false;
create index if not exists idx_unmet_searches_created      on public.unmet_searches(created_at desc);

-- ============================================================
-- GRANTS (replaces Supabase RLS)
--
-- web_anon: client-side role baked into web/db.js. Even if the
-- connection string leaks, the worst an attacker gets is reading
-- public memes (already public via the live site) and inserting
-- logs (already an open form). Cannot read logs back.
--
-- scraper: server-side role for the GitHub Actions cron. Full DML
-- on content tables, read-only on logs for retro analysis.
-- ============================================================

-- web_anon
grant usage on schema public to web_anon;
grant select on public.memes              to web_anon;
grant select on public.meme_stats_history to web_anon;
grant insert on public.search_queries     to web_anon;
grant insert on public.unmet_searches     to web_anon;
grant usage  on sequence public.search_queries_id_seq to web_anon;
grant usage  on sequence public.unmet_searches_id_seq to web_anon;

-- scraper
grant usage on schema public to scraper;
grant select, insert, update, delete on public.memes              to scraper;
grant select, insert, update, delete on public.meme_stats_history to scraper;
grant select on public.search_queries to scraper;
grant select on public.unmet_searches to scraper;
grant usage  on all sequences in schema public to scraper;

-- ============================================================
-- DONE
-- Verify after running:
--   select count(*) from public.memes;            -- expect 0 on fresh DB
--   set role web_anon; select 1 from public.memes limit 0; reset role;
--   set role web_anon; insert into public.unmet_searches(description) values ('test'); reset role;
-- ============================================================
