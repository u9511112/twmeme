-- ============================================================
-- TWmeme — Neon Schema Migration 004
-- Indexes for homepage SSG queries (weekly hot, popular, latest)
-- ============================================================

create index if not exists idx_memes_weekly_hot on public.memes(fetched_at desc, like_count desc);
create index if not exists idx_memes_popular on public.memes(like_count desc, comment_count desc);
