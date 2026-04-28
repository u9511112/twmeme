-- ============================================================
-- TWmeme — Phase 1 Query Logging
-- Adds search_queries (every search) + unmet_searches (zero-result form).
-- See ~/.gstack/projects/TWmeme/VIPUSER-master-design-20260428-130958.md
-- ============================================================

-- ============================================================
-- TABLES
-- ============================================================
create table public.search_queries (
  id            bigserial    primary key,
  query_text    text         not null,
  had_result    boolean      not null,
  result_count  integer,
  clicked_index integer,
  searched_at   timestamptz  not null default now()
);

create table public.unmet_searches (
  id           bigserial    primary key,
  description  text         not null,
  created_at   timestamptz  not null default now()
);

-- ============================================================
-- INDEXES
-- ============================================================
create index idx_search_queries_searched on public.search_queries(searched_at desc);
create index idx_search_queries_zero_result on public.search_queries(searched_at desc) where had_result = false;
create index idx_unmet_searches_created on public.unmet_searches(created_at desc);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.search_queries enable row level security;
alter table public.unmet_searches enable row level security;

-- service_role full access (for retro analysis, founder-side reads)
create policy "service all search_queries"
  on public.search_queries for all
  using (auth.role() = 'service_role');

create policy "service all unmet_searches"
  on public.unmet_searches for all
  using (auth.role() = 'service_role');

-- anon insert only (frontend writes log entries from the static site)
create policy "anon insert search_queries"
  on public.search_queries for insert to anon
  with check (true);

create policy "anon insert unmet_searches"
  on public.unmet_searches for insert to anon
  with check (true);

-- explicit deny anon read (no public scraping of others' queries)
revoke select on public.search_queries from anon;
revoke select on public.unmet_searches from anon;
