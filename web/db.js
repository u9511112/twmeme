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

const NEON_URL = (typeof window !== "undefined" && (window.TWmeme_NEON_URL || window.NEON_URL))
  || "postgresql://web_anon:eSoHu1pLOwjbDiQQsO6IWt90Pr5G@ep-dawn-voice-ao8hd53u-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";

// Lazy-loaded Neon driver. Resolved on first call; stays cached.
let _sqlPromise = null;
function sql() {
  if (!_sqlPromise) {
    _sqlPromise = import("https://esm.sh/@neondatabase/serverless@0.10.4")
      .then(mod => mod.neon(NEON_URL));
  }
  return _sqlPromise;
}

// Auth / permission errors mean the connection string in this file is no
// longer valid (password rotated, role dropped, GRANT revoked). We don't
// want those to be silently caught and degrade to mock data — bump them
// from warn to error so they show up in DevTools red.
function logErr(label, e) {
  const msg = String(e?.message || e || '');
  const isAuth = /password|authentication|permission denied|role .* does not exist|HTTP 401|HTTP 403/i.test(msg);
  if (isAuth) {
    console.error('[db] CRITICAL — auth/permission failure in ' + label + ' — site is now serving fallback data:', e);
  } else {
    console.warn('[db] ' + label + ' failed:', e);
  }
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
async function getWeeklyHotMemes(limit = 8) {
  try {
    const s = await sql();
    const rows = await s`SELECT id, title, cached_url, media_url, media_type, platform
                         FROM public.memes
                         WHERE fetched_at > now() - interval '7 days'
                         ORDER BY like_count DESC, comment_count DESC
                         LIMIT ${limit}`;
    return rows.length > 0 ? rows : null;
  } catch (e) {
    logErr('weekly hot fetch', e);
    return null;
  }
}

async function getPopularMemes(limit = 8) {
  try {
    const s = await sql();
    const rows = await s`SELECT id, title, cached_url, media_url, media_type, platform
                         FROM public.memes
                         ORDER BY like_count DESC, comment_count DESC
                         LIMIT ${limit}`;
    return rows.length > 0 ? rows : null;
  } catch (e) {
    logErr('popular fetch', e);
    return null;
  }
}

async function getLatestMemes(limit = 8) {
  try {
    const s = await sql();
    const rows = await s`SELECT id, title, cached_url, media_url, media_type, platform
                         FROM public.memes
                         ORDER BY fetched_at DESC
                         LIMIT ${limit}`;
    return rows.length > 0 ? rows : null;
  } catch (e) {
    logErr('latest fetch', e);
    return null;
  }
}

async function getMemeCount() {
  try {
    const s = await sql();
    const rows = await s`SELECT count(*)::int AS n FROM public.memes`;
    return rows[0]?.n ?? null;
  } catch (e) {
    logErr('getMemeCount', e);
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
                                comment_count, fetched_at, ocr_text, description, tags
                         FROM public.memes
                         WHERE id = ${safe}::uuid
                         LIMIT 1`;
    return rows[0] || null;
  } catch (e) {
    logErr('getMemeById', e);
    return null;
  }
}

const SYNONYM_MAP = {
  '傻眼': ['傻眼', '無語', '白眼', '眼神死', '無奈', '問號', '離譜', '傻眼貓咪', '蛤', '誇張', '黑人問號'],
  '無語': ['傻眼', '無語', '白眼', '眼神死', '無奈', '問號', '離譜', '傻眼貓咪'],
  '崩潰': ['崩潰', '痛哭', '哭了', '救命', '太難了', '哭哭', '悲傷', '絕望', '哭爆'],
  '貓': ['貓', '貓咪', '橘貓', '貓咪驚恐', '貓貓', '喵'],
  '貓咪': ['貓', '貓咪', '橘貓', '貓咪驚恐', '貓貓', '喵'],
  '狗': ['狗', '柴犬', '汪', '狗勾', '犬', '狗狗'],
  '柴犬': ['狗', '柴犬', '汪', '狗勾', '犬', '狗狗'],
  '統神': ['統神', '張嘉航', '癢癢', '賴皮', '神聖', '亞統'],
  '館長': ['館長', '陳之漢', '成吉思汗', '阿館', '肌肉'],
  '吉伊卡哇': ['吉伊卡哇', 'chiikawa', '小八', '烏薩奇', '兔兔', '小八貓', '吉伊'],
  '芙莉蓮': ['芙莉蓮', '葬送', '費倫', '修爾克', '阿嬤', '魔法'],
  '職場': ['職場', '社畜', '上班', '加班', '老闆', '工作', '辭職', '薪水', '公司', '打工人'],
  '社畜': ['職場', '社畜', '上班', '加班', '老闆', '工作', '辭職', '薪水', '公司', '打工人'],
  '地獄': ['地獄', '地獄梗', '地獄圖', '壞', '黑色幽默'],
  '地獄梗': ['地獄', '地獄梗', '地獄圖', '壞', '黑色幽默'],
  '諧音': ['諧音', '諧音梗', '梗圖', '雙關', '發音'],
  '諧音梗': ['諧音', '諧音梗', '梗圖', '雙關', '發音'],
  '活俠傳': ['活俠傳', '活俠', '趙活'],
  '蔚藍': ['蔚藍', '檔案', '蔚藍檔案', '羊師'],
  '正妹': ['正妹', '美女', '妹子', '女孩', '妹'],
  '閒聊': ['閒聊', '討論', '心得']
};

async function searchMemes(query, filters = {}, limit = 40) {
  try {
    const safe = String(query || '').trim();
    const s = await sql();
    
    if (!safe) {
      // Empty query search (popular / latest)
      let queryText = `
        SELECT id, title, cached_url, media_url, media_type, platform, trending_score, fetched_at, like_count,
               0 AS sm
        FROM public.memes
        WHERE 1=1
      `;
      const params = [];
      let paramIdx = 1;
      
      if (filters.platform && filters.platform !== 'all') {
        queryText += ` AND platform = $${paramIdx}::platform_enum`;
        params.push(filters.platform);
        paramIdx++;
      }
      
      if (filters.media_type && filters.media_type !== 'all') {
        queryText += ` AND media_type = $${paramIdx}::media_type_enum`;
        params.push(filters.media_type);
        paramIdx++;
      }
      
      let orderBy = 'trending_score DESC, fetched_at DESC';
      if (filters.sort_by === 'latest') {
        orderBy = 'fetched_at DESC, id DESC';
      } else if (filters.sort_by === 'popular') {
        orderBy = 'like_count DESC, trending_score DESC';
      }
      
      queryText += ` ORDER BY ${orderBy} LIMIT $${paramIdx}`;
      params.push(limit);
      
      return await s(queryText, params);
    }
    
    // Multi-tokenized Smart Query Strategy
    const rawTokens = safe.split(/\s+/).filter(Boolean).slice(0, 8);
    const allTerms = [];
    const tokenSynonymGroups = [];
    
    for (const tok of rawTokens) {
      const syns = Object.prototype.hasOwnProperty.call(SYNONYM_MAP, tok) ? SYNONYM_MAP[tok] : [tok];
      tokenSynonymGroups.push(syns);
      allTerms.push(...syns);
    }
    
    // Similarity scoring across all expanded terms
    const smExpr = allTerms.length > 0
      ? `GREATEST(${allTerms.map((_, i) => `similarity(COALESCE(title, ''), $${i + 1})`).join(', ')})`
      : '0';
      
    // Execute Stage 1: Token AND matching (all tokens must match at least one synonym)
    const runQuery = async (isOrMatch = false) => {
      const params = [...allTerms];
      let paramIdx = params.length + 1;
      
      let queryText = `
        SELECT id, title, cached_url, media_url, media_type, platform, trending_score, fetched_at, like_count,
               ${smExpr} AS sm
        FROM public.memes
        WHERE 1=1
      `;
      
      const tokenConditions = [];
      for (const group of tokenSynonymGroups) {
        const groupOrConditions = [];
        for (const syn of group) {
          const pattern = '%' + syn + '%';
          groupOrConditions.push(`(title ILIKE $${paramIdx} 
                                   OR ocr_text ILIKE $${paramIdx} 
                                   OR description ILIKE $${paramIdx} 
                                   OR tags::text ILIKE $${paramIdx})`);
          params.push(pattern);
          paramIdx++;
        }
        tokenConditions.push(`(${groupOrConditions.join(' OR ')})`);
      }
      
      if (tokenConditions.length > 0) {
        const joinOperator = isOrMatch ? ' OR ' : ' AND ';
        queryText += ` AND (${tokenConditions.join(joinOperator)})`;
      }
      
      if (filters.platform && filters.platform !== 'all') {
        queryText += ` AND platform = $${paramIdx}::platform_enum`;
        params.push(filters.platform);
        paramIdx++;
      }
      
      if (filters.media_type && filters.media_type !== 'all') {
        queryText += ` AND media_type = $${paramIdx}::media_type_enum`;
        params.push(filters.media_type);
        paramIdx++;
      }
      
      let orderBy = 'sm DESC, trending_score DESC';
      if (filters.sort_by === 'latest') {
        orderBy = 'fetched_at DESC, id DESC';
      } else if (filters.sort_by === 'popular') {
        orderBy = 'like_count DESC, trending_score DESC';
      }
      
      queryText += ` ORDER BY ${orderBy} LIMIT $${paramIdx}`;
      params.push(limit);
      
      return await s(queryText, params);
    };
    
    // Stage 1 (AND match)
    let rows = await runQuery(false);
    
    // Stage 2 (OR fallback if AND returns fewer than 10 rows and there are multiple tokens)
    if (rows.length < 10 && rawTokens.length > 1) {
      const fallbackRows = await runQuery(true);
      const existingIds = new Set(rows.map(r => r.id));
      for (const fRow of fallbackRows) {
        if (!existingIds.has(fRow.id)) {
          rows.push(fRow);
          existingIds.add(fRow.id);
        }
        if (rows.length >= limit) break;
      }
    }
    
    return rows;
  } catch (e) {
    logErr('search', e);
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
  ).catch(e => logErr('logSearchQuery', e));
}

function logClick(queryText, clickedIndex) {
  const safe = String(queryText || '').trim();
  if (!safe) return;
  sql().then(s =>
    s`INSERT INTO public.search_queries (query_text, had_result, clicked_index)
      VALUES (${safe}, true, ${clickedIndex})`
  ).catch(e => logErr('logClick', e));
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
    logErr('submitUnmetSearch', e);
    return { ok: false, reason: 'error' };
  }
}

window.TWmeme = window.TWmeme || {};
window.TWmeme.supa = {
  getWeeklyHotMemes, getPopularMemes, getLatestMemes,
  searchMemes, getMemeById, getMemeCount,
  logSearchQuery, logClick, submitUnmetSearch,
};

