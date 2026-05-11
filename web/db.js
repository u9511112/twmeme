// TWmeme — Neon HTTP client + query helpers.
//
// web_anon connection string is baked in below. The password is
// "public-safe" because the role has strict Postgres GRANTs (see
// supabase/migrations/neon/001_schema.sql):
//   - SELECT memes / meme_stats_history
//   - INSERT search_queries / unmet_searches
//   - explicitly NOT allowed to SELECT either logging table
//
// All read paths fall back to mock data on failure so the static site
// never goes blank if the DB is unreachable / paused / network blips.

const NEON_URL = "postgresql://web_anon:eSoHu1pLOwjbDiQQsO6IWt90Pr5G@ep-dawn-voice-ao8hd53u-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";

// Lazy-loaded Neon driver. Resolved on first call; stays cached.
let _sqlPromise = null;
function sql() {
  if (!_sqlPromise) {
    _sqlPromise = import("https://esm.sh/@neondatabase/serverless@0.10.4")
      .then(mod => mod.neon(NEON_URL));
  }
  return _sqlPromise;
}

// ---- 2-second submit throttle (per query_text key) -------------------
const THROTTLE_MS = 2000;
function throttled(key) {
  try {
    const last = Number(localStorage.getItem('tw_throttle_' + key) || 0);
    const now = Date.now();
    if (now - last < THROTTLE_MS) return true;
    localStorage.setItem('tw_throttle_' + key, String(now));
    return false;
  } catch (_) {
    return false;
  }
}

// ---- READS -----------------------------------------------------------
async function getTrendingMemes(limit = 12) {
  try {
    const s = await sql();
    const rows = await s`SELECT id, title, cached_url, media_url, media_type, platform
                         FROM public.memes
                         ORDER BY trending_score DESC
                         LIMIT ${limit}`;
    return rows.length > 0 ? rows : null;
  } catch (e) {
    console.warn('[db] trending fetch failed, falling back:', e);
    return null;
  }
}

async function getMemeCount() {
  try {
    const s = await sql();
    const rows = await s`SELECT count(*)::int AS n FROM public.memes`;
    return rows[0]?.n ?? null;
  } catch (e) {
    console.warn('[db] getMemeCount failed:', e);
    return null;
  }
}

async function getMemeById(id) {
  try {
    const safe = String(id || '').trim();
    if (!safe) return null;
    const s = await sql();
    const rows = await s`SELECT id, title, cached_url, media_url, media_type, platform,
                                source_url, width, height, like_count, share_count,
                                comment_count, fetched_at
                         FROM public.memes
                         WHERE id = ${safe}::uuid
                         LIMIT 1`;
    return rows[0] || null;
  } catch (e) {
    console.warn('[db] getMemeById failed:', e);
    return null;
  }
}

async function searchMemes(query, limit = 40) {
  try {
    const safe = String(query || '').trim();
    if (!safe) return [];
    const s = await sql();
    const pattern = '%' + safe + '%';
    const rows = await s`SELECT id, title, cached_url, media_url, media_type, platform, trending_score
                         FROM public.memes
                         WHERE title ILIKE ${pattern}
                         ORDER BY trending_score DESC
                         LIMIT ${limit}`;
    return rows;
  } catch (e) {
    console.warn('[db] search failed, falling back:', e);
    return null;
  }
}

// ---- WRITES (fire-and-forget, never blocks UI) -----------------------
function logSearchQuery({ queryText, hadResult, resultCount, clickedIndex = null }) {
  const safe = String(queryText || '').trim();
  if (!safe) return;
  if (throttled('q:' + safe)) return;
  sql().then(s =>
    s`INSERT INTO public.search_queries (query_text, had_result, result_count, clicked_index)
      VALUES (${safe}, ${!!hadResult}, ${resultCount ?? null}, ${clickedIndex})`
  ).catch(e => console.warn('[db] logSearchQuery error:', e));
}

function logClick(queryText, clickedIndex) {
  const safe = String(queryText || '').trim();
  if (!safe) return;
  sql().then(s =>
    s`INSERT INTO public.search_queries (query_text, had_result, clicked_index)
      VALUES (${safe}, true, ${clickedIndex})`
  ).catch(e => console.warn('[db] logClick error:', e));
}

async function submitUnmetSearch(description) {
  const safe = String(description || '').trim();
  if (safe.length < 2) return { ok: false, reason: 'too-short' };
  if (throttled('u:' + safe)) return { ok: false, reason: 'throttled' };
  try {
    const s = await sql();
    await s`INSERT INTO public.unmet_searches (description) VALUES (${safe})`;
    return { ok: true };
  } catch (e) {
    console.warn('[db] submitUnmetSearch error:', e);
    return { ok: false, reason: 'error' };
  }
}

window.TWmeme = window.TWmeme || {};
window.TWmeme.supa = {
  getTrendingMemes, searchMemes, getMemeById, getMemeCount,
  logSearchQuery, logClick, submitUnmetSearch,
};
