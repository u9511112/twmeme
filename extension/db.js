// TWmeme extension — Neon HTTP client (content-script-safe).
//
// Content scripts can't dynamic-import from a CDN (CSP + module loading
// restrictions), so we talk to Neon's HTTP endpoint with plain fetch().
// This is the same wire protocol @neondatabase/serverless uses under the
// hood — just hand-rolled to stay zero-dep.
//
// web_anon credentials are GRANT-restricted to:
//   - SELECT public.memes, public.meme_stats_history
//   - INSERT public.search_queries, public.unmet_searches
// Same trust model as web/db.js. Public-safe by design.

const NEON_HOST = "ep-dawn-voice-ao8hd53u-pooler.c-2.ap-southeast-1.aws.neon.tech";
const NEON_DB = "neondb";
const NEON_USER = "web_anon";
const NEON_PASS = "eSoHu1pLOwjbDiQQsO6IWt90Pr5G";

const SQL_URL = `https://${NEON_HOST}/sql`;
const CONNSTRING = `postgresql://${NEON_USER}:${NEON_PASS}@${NEON_HOST}/${NEON_DB}?sslmode=require`;

async function neonQuery(query, params = []) {
  const resp = await fetch(SQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Neon-Connection-String": CONNSTRING,
      "Neon-Raw-Text-Output": "true",
      "Neon-Array-Mode": "false",
    },
    body: JSON.stringify({ query, params, arrayMode: false, fullResults: false }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Neon HTTP ${resp.status}: ${body.slice(0, 200)}`);
  }
  const json = await resp.json();
  return json.rows || [];
}

async function searchMemes(query, limit = 5) {
  const safe = String(query || "").trim();
  if (!safe) return [];
  const pattern = "%" + safe + "%";
  return await neonQuery(
    `SELECT id, title, cached_url, media_type, platform
     FROM public.memes
     WHERE title ILIKE $1
     ORDER BY trending_score DESC
     LIMIT $2`,
    [pattern, limit],
  );
}

// Expose on window so content.js can call (content scripts share scope per match).
window.TWmemeDB = { searchMemes, neonQuery };
