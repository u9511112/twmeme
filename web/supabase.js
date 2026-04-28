// TWmeme — shared Supabase client + query helpers.
//
// anon key is public-safe by RLS (see migrations/001 + 002):
//   - public read on memes
//   - anon insert on search_queries / unmet_searches
//   - explicit revoke select on logging tables
//
// All read paths fall back to mock data on failure so the static site
// never goes blank if Supabase is paused / restoring / network blips.

const SUPABASE_URL = 'https://yayqogregeqtggsijole.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlheXFvZ3JlZ2VxdGdnc2lqb2xlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4OTkwNTIsImV4cCI6MjA4OTQ3NTA1Mn0.FNNi48oVw-YNyYTXxVpgBgsgq8lVLXFEUuIYRORVgvM';

let _client = null;
function client() {
  if (_client) return _client;
  if (typeof window === 'undefined' || !window.supabase) return null;
  _client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return _client;
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
    return false; // localStorage disabled → don't throttle
  }
}

// ---- READS -----------------------------------------------------------
async function getTrendingMemes(limit = 12) {
  const c = client();
  if (!c) return null;
  try {
    const { data, error } = await c
      .from('memes')
      .select('id, title, cached_url, media_url, media_type, platform')
      .order('trending_score', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data && data.length > 0) ? data : null;
  } catch (e) {
    console.warn('[supabase] trending fetch failed, falling back:', e);
    return null;
  }
}

async function searchMemes(query, limit = 40) {
  const c = client();
  if (!c) return null;
  try {
    const safe = String(query || '').trim();
    if (!safe) return [];
    const { data, error } = await c
      .from('memes')
      .select('id, title, cached_url, media_url, media_type, platform')
      .ilike('title', '%' + safe + '%')
      .limit(limit);
    if (error) throw error;
    return data || [];
  } catch (e) {
    console.warn('[supabase] search failed, falling back:', e);
    return null;
  }
}

// ---- WRITES (fire-and-forget, never blocks UI) -----------------------
function logSearchQuery({ queryText, hadResult, resultCount, clickedIndex = null }) {
  const c = client();
  if (!c) return;
  const safe = String(queryText || '').trim();
  if (!safe) return;
  if (throttled('q:' + safe)) return;
  c.from('search_queries')
    .insert({
      query_text: safe,
      had_result: !!hadResult,
      result_count: resultCount ?? null,
      clicked_index: clickedIndex,
    })
    .then(({ error }) => {
      if (error) console.warn('[supabase] logSearchQuery error:', error);
    });
}

function logClick(queryText, clickedIndex) {
  const c = client();
  if (!c) return;
  const safe = String(queryText || '').trim();
  if (!safe) return;
  c.from('search_queries')
    .insert({
      query_text: safe,
      had_result: true,
      clicked_index: clickedIndex,
    })
    .then(({ error }) => {
      if (error) console.warn('[supabase] logClick error:', error);
    });
}

async function submitUnmetSearch(description) {
  const c = client();
  if (!c) return { ok: false, reason: 'no-client' };
  const safe = String(description || '').trim();
  if (safe.length < 2) return { ok: false, reason: 'too-short' };
  if (throttled('u:' + safe)) return { ok: false, reason: 'throttled' };
  try {
    const { error } = await c.from('unmet_searches').insert({ description: safe });
    if (error) throw error;
    return { ok: true };
  } catch (e) {
    console.warn('[supabase] submitUnmetSearch error:', e);
    return { ok: false, reason: 'error' };
  }
}

window.TWmeme = window.TWmeme || {};
window.TWmeme.supa = {
  getTrendingMemes, searchMemes,
  logSearchQuery, logClick, submitUnmetSearch,
};
