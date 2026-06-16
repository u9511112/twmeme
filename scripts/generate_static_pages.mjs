// TWmeme — Phase 2 SSG: generate /meme/<uuid>.html per meme + sitemap.
//
// Runs at Vercel build time (or locally for dry-run). Reads all memes from
// Neon via the web_anon role (SELECT-only on public.memes — same credentials
// baked into web/db.js), renders each as a fully-formed static page with
// ImageObject + BreadcrumbList JSON-LD, then rewrites web/sitemap.xml with
// every meme URL so Google/Bing/AI engines can discover them.
//
// Why this exists: web/detail.html is 100% client-side rendered. Bots see
// "<h1>載入中...</h1>" — the meme content is invisible. With ~274 memes
// today (and growing every 4h), each meme is a long-tail landing page we
// were leaving on the table.
//
// Local dry-run:
//   node scripts/generate_static_pages.mjs
//
// On Vercel: vercel.json `buildCommand` hooks this in.

import { neon } from '@neondatabase/serverless';
import { mkdir, writeFile, rm, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const NEON_URL = process.env.NEON_DATABASE_URL
  || process.env.NEON_WEB_ANON_URL
  // Fallback: same web_anon string baked into web/db.js (GRANT-restricted,
  // SELECT-only on public.memes). Safe to keep here because Vercel build
  // env doesn't need a separate secret for read-only public content.
  || 'postgresql://web_anon:eSoHu1pLOwjbDiQQsO6IWt90Pr5G@ep-dawn-voice-ao8hd53u-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';

const SITE_ORIGIN = process.env.SITE_ORIGIN || 'https://twmeme.pages.dev';
const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_DIR = join(__dirname, '..', 'web');
const MEME_DIR = join(WEB_DIR, 'meme');

// Cap to keep build under Vercel's 45-min limit even if DB grows. ~5000
// pages takes ~30s of fs writes locally; safe ceiling for now.
const MEME_LIMIT = 5000;
const RELATED_COUNT = 12;
const TODAY = new Date().toISOString().slice(0, 10);

const PLATFORM_LABEL = {
  ptt: 'PTT',
  dcard: 'Dcard',
  threads: 'Threads',
  instagram: 'Instagram',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(s) {
  return escapeHtml(s);
}

function jsonStr(s) {
  // JSON.stringify handles all escaping (quotes, backslashes, control chars)
  return JSON.stringify(String(s ?? ''));
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function platformLabel(p) {
  return PLATFORM_LABEL[p] || p || '—';
}

function pickImageUrl(meme) {
  return meme.cached_url || meme.media_url || '';
}

// Trim PTT-style bracket prefix only for description, keep for title.
function descriptionTitle(title) {
  const t = String(title || '').trim();
  // Strip leading [xxx] tags and "Re: " for cleaner SEO description sentences
  return t.replace(/^(\[[^\]]+\]\s*)+/, '').replace(/^Re:\s*/, '').trim() || t;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

function renderMemePage(meme, related) {
  const id = meme.id;
  const title = String(meme.title || '迷因').trim();
  const cleanTitle = descriptionTitle(title);
  const imageUrl = pickImageUrl(meme);
  const platform = platformLabel(meme.platform);
  const date = fmtDate(meme.fetched_at);
  const hasDims = meme.width && meme.height;
  const url = `${SITE_ORIGIN}/meme/${id}`;
  const isoDate = meme.fetched_at
    ? new Date(meme.fetched_at).toISOString()
    : new Date().toISOString();

  // SEO-rich description, ~100-150 字 zh
  const description = `${cleanTitle}—來自 ${platform}、${date} 收錄的台灣迷因圖。一鍵複製連結貼到 LINE / IG / Threads、或下載原圖。${hasDims ? `解析度 ${meme.width}×${meme.height}。` : ''}`.slice(0, 200);

  // JSON-LD
  const imageObjectLd = {
    '@context': 'https://schema.org',
    '@type': 'ImageObject',
    '@id': `${url}#image`,
    contentUrl: imageUrl,
    url: imageUrl,
    name: title,
    description: `${cleanTitle}—來自 ${platform}、${date} 收錄。`,
    datePublished: isoDate,
    inLanguage: 'zh-Hant-TW',
    isAccessibleForFree: true,
    creditText: `Source: ${platform}`,
    isPartOf: { '@id': `${SITE_ORIGIN}/#website` },
    thumbnailUrl: imageUrl,
    ...(hasDims ? { width: meme.width, height: meme.height } : {}),
  };

  const webPageLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': url,
    url,
    name: `${title} — TWmeme`,
    description,
    inLanguage: 'zh-Hant-TW',
    primaryImageOfPage: { '@id': `${url}#image` },
    breadcrumb: { '@id': `${url}#breadcrumb` },
    isPartOf: { '@id': `${SITE_ORIGIN}/#website` },
  };

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    '@id': `${url}#breadcrumb`,
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'TWmeme', item: SITE_ORIGIN + '/' },
      { '@type': 'ListItem', position: 2, name: '迷因索引', item: SITE_ORIGIN + '/meme' },
      { '@type': 'ListItem', position: 3, name: title.slice(0, 60) },
    ],
  };

  // Visible meme-context paragraph (200+ 字 zh for AI citation sweet spot)
  const memeContext = `這張迷因「${cleanTitle}」取自 ${platform}、於 ${date} 被 TWmeme 自動收錄。${meme.source_url ? `原始發文連結可見頁面下方「看原文」按鈕。` : ''}${hasDims ? `圖片原始解析度為 ${meme.width}×${meme.height} pixels、` : ''}適合作為 LINE 群組的反應圖、IG 限時動態的素材、Threads 留言的回覆圖、或 FB 粉專貼文的配圖。點上方「複製連結」會把圖片直接 URL 放到剪貼簿、貼到任何聊天室都會自動展開預覽；點「下載原圖」會把原始解析度的檔案存到電腦。整個流程不需要登入、也不會記錄你點了哪張迷因。如果你是這張圖的原始發文者、希望從索引中下架、用首頁右上角「意見回饋」聯絡即可。`;

  // Related memes (12 most recent excluding current)
  const relatedHtml = related
    .filter(r => r.id !== id)
    .slice(0, RELATED_COUNT)
    .map(r => {
      const rUrl = `/meme/${r.id}`;
      const rTitle = String(r.title || '迷因').trim();
      const rImg = pickImageUrl(r);
      return `      <article class="card-wrap">
        <a class="card" href="${escapeAttr(rUrl)}" aria-label="${escapeAttr(rTitle)} 迷因詳細">
          <div class="thumb t-sand">${rImg ? `<img src="${escapeAttr(rImg)}" alt="${escapeAttr(rTitle)}" loading="lazy" class="thumb-img">` : '🖼️'}</div>
          <div class="caption"><span class="name">${escapeHtml(rTitle)}</span></div>
        </a>
      </article>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)} — TWmeme 迷因</title>
<meta name="description" content="${escapeAttr(description)}">
<link rel="canonical" href="${escapeAttr(url)}">
<meta property="og:type" content="article">
<meta property="og:title" content="${escapeAttr(title)} — TWmeme">
<meta property="og:description" content="${escapeAttr(description)}">
<meta property="og:image" content="${escapeAttr(imageUrl)}">
<meta property="og:url" content="${escapeAttr(url)}">
<meta property="og:site_name" content="TWmeme">
<meta property="og:locale" content="zh_TW">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeAttr(title)} — TWmeme">
<meta name="twitter:description" content="${escapeAttr(description)}">
<meta name="twitter:image" content="${escapeAttr(imageUrl)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=Noto+Sans+TC:wght@400;500;700&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css">

<script type="application/ld+json">
${JSON.stringify(imageObjectLd, null, 2)}
</script>

<script type="application/ld+json">
${JSON.stringify(webPageLd, null, 2)}
</script>

<script type="application/ld+json">
${JSON.stringify(breadcrumbLd, null, 2)}
</script>
</head>
<body>

<header class="site-header">
  <a href="/" class="wordmark">迷因<em>搜</em></a>
  <nav class="nav-links">
    <a href="mailto:u9511112@gmail.com?subject=TWmeme%20%E6%84%8F%E8%A6%8B%E5%9B%9E%E9%A5%8B">意見回饋</a>
  </nav>
</header>

<div class="topbar">
  <a href="/" class="back" aria-label="回首頁">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
  </a>
  <form class="searchbox" action="/results.html" method="get">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
    <input id="detail-q" name="q" type="text" placeholder="搜更多迷因">
    <button class="btn-search" type="submit" aria-label="搜尋">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
    </button>
  </form>
</div>

<main class="detail">
  <div class="image-pane t-sand">
    ${imageUrl
      ? `<img src="${escapeAttr(imageUrl)}" alt="${escapeAttr(title)}" class="thumb-img">`
      : '<span class="emoji-fallback">🖼️</span>'}
    ${hasDims ? `<span class="quality-badge">${meme.width}×${meme.height}</span>` : ''}
  </div>

  <aside>
    <h1>${escapeHtml(title)}</h1>
    <div class="meta-row">
      <span>來源：${escapeHtml(platform)}</span>
      <span>${escapeHtml(date)}</span>
    </div>

    <div class="actions">
      <button class="btn btn-primary" data-action="copy" data-url="${escapeAttr(imageUrl)}" data-title="${escapeAttr(title)}">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
        複製連結
      </button>
      <button class="btn btn-secondary" data-action="download" data-url="${escapeAttr(imageUrl)}" data-title="${escapeAttr(title)}">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
        下載原圖
      </button>
      <button class="btn btn-secondary" data-action="share" data-title="${escapeAttr(title)}">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg>
        分享
      </button>
      ${meme.source_url ? `<a class="btn btn-secondary" href="${escapeAttr(meme.source_url)}" target="_blank" rel="noopener noreferrer">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        看原文
      </a>` : ''}
    </div>

    <div class="meme-context">
      <p>${escapeHtml(memeContext)}</p>
    </div>
  </aside>
</main>

<section class="section">
  <div class="section-head">
    <h2>更多迷因</h2>
    <a class="more" href="/">回首頁 →</a>
  </div>
  <div class="broken-grid">
${relatedHtml}
  </div>
</section>

<footer class="site-footer">
  © 2026 TWmeme · 台灣繁中迷因搜尋 · <a href="/privacy.html">隱私政策</a>
</footer>

<div class="toast" id="toast"></div>

<script src="/meme.js"></script>
</body>
</html>
`;
}

function renderSitemap(memes, guideSlugs) {
  const staticEntries = [
    { loc: `${SITE_ORIGIN}/`, lastmod: TODAY, changefreq: 'daily', priority: '1.0' },
    // results.html is intentionally excluded — it's marked noindex,follow
    // since search-result URLs would create infinite Google index pages.
    { loc: `${SITE_ORIGIN}/privacy.html`, lastmod: TODAY, changefreq: 'yearly', priority: '0.3' },
    { loc: `${SITE_ORIGIN}/meme`, lastmod: TODAY, changefreq: 'daily', priority: '0.9' },
    { loc: `${SITE_ORIGIN}/guide`, lastmod: TODAY, changefreq: 'monthly', priority: '0.8' },
  ];

  const guideEntries = guideSlugs.map(slug => ({
    loc: `${SITE_ORIGIN}/guide/${slug}`,
    lastmod: TODAY,
    changefreq: 'monthly',
    priority: slug === 'taiwan-meme' ? '0.9' : '0.7',  // pillar gets higher
  }));

  const memeEntries = memes.map(m => ({
    loc: `${SITE_ORIGIN}/meme/${m.id}`,
    lastmod: m.fetched_at ? new Date(m.fetched_at).toISOString().slice(0, 10) : TODAY,
    changefreq: 'monthly',
    priority: '0.7',
  }));

  const entries = [...staticEntries, ...guideEntries, ...memeEntries]
    .map(e =>
      `  <url>
    <loc>${e.loc}</loc>
    <lastmod>${e.lastmod}</lastmod>
    <changefreq>${e.changefreq}</changefreq>
    <priority>${e.priority}</priority>
  </url>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>
`;
}

function renderMemeIndexPage(memes) {
  // HTML sitemap — a real page users can browse, also great for AI crawlers
  // to discover every meme. Sorted newest first.
  const itemsHtml = memes.map(m => {
    const url = `/meme/${m.id}`;
    const title = String(m.title || '迷因').trim();
    const img = pickImageUrl(m);
    const platform = platformLabel(m.platform);
    const date = fmtDate(m.fetched_at);
    return `      <article class="card-wrap">
        <a class="card" href="${escapeAttr(url)}" aria-label="${escapeAttr(title)}">
          <div class="thumb t-sand">${img ? `<img src="${escapeAttr(img)}" alt="${escapeAttr(title)}" loading="lazy" class="thumb-img">` : '🖼️'}</div>
          <div class="caption">
            <span class="name">${escapeHtml(title)}</span>
            <span class="meta-sm">${escapeHtml(platform)} · ${escapeHtml(date)}</span>
          </div>
        </a>
      </article>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>所有迷因索引 — TWmeme</title>
<meta name="description" content="TWmeme 收錄的所有台灣繁中迷因索引、來自 PTT 表特板與 C_Chat 板、依發文時間倒序排列。每張可點進詳細頁複製連結或下載原圖。">
<link rel="canonical" href="${SITE_ORIGIN}/meme">
<meta property="og:type" content="website">
<meta property="og:title" content="所有迷因索引 — TWmeme">
<meta property="og:description" content="TWmeme 收錄的所有台灣繁中迷因、依發文時間排列。">
<meta property="og:url" content="${SITE_ORIGIN}/meme">
<meta property="og:locale" content="zh_TW">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=Noto+Sans+TC:wght@400;500;700&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/styles.css">
</head>
<body>

<header class="site-header">
  <a href="/" class="wordmark">迷因<em>搜</em></a>
  <nav class="nav-links">
    <a href="mailto:u9511112@gmail.com?subject=TWmeme%20%E6%84%8F%E8%A6%8B%E5%9B%9E%E9%A5%8B">意見回饋</a>
  </nav>
</header>

<main>
<section class="hero" style="padding-bottom: var(--s-md)">
  <h1>所有迷因索引</h1>
  <p class="sub">目前收錄 ${memes.length.toLocaleString('en')} 張迷因、依發文時間倒序排列。</p>
</section>

<section class="section">
  <div class="broken-grid">
${itemsHtml}
  </div>
</section>
</main>

<footer class="site-footer">
  © 2026 TWmeme · 台灣繁中迷因搜尋 · <a href="/privacy.html">隱私政策</a>
</footer>

</body>
</html>
`;
}

function renderMemeJs() {
  // Shared JS for static meme pages: handles copy/download/share buttons
  // via data-action attributes. Cached by browser after first visit.
  return `// TWmeme — static meme page interactions (Phase 2 SSG)
(function() {
  function showToast(msg) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(function() { t.classList.remove('show'); }, 1500);
  }

  function onCopy(btn) {
    var url = btn.dataset.url;
    if (!url) { showToast('沒有可複製的連結'); return; }
    navigator.clipboard.writeText(url).then(
      function() { showToast('已複製連結到剪貼簿'); },
      function() { showToast('複製失敗、長按圖片用瀏覽器複製'); }
    );
  }

  function onDownload(btn) {
    var url = btn.dataset.url;
    if (!url) { showToast('沒有可下載的圖片'); return; }
    var a = document.createElement('a');
    a.href = url;
    a.download = (btn.dataset.title || 'meme') + '.jpg';
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    showToast('開啟下載');
  }

  function onShare(btn) {
    var title = btn.dataset.title || 'TWmeme';
    var shareData = { title: title + ' — TWmeme', text: title, url: location.href };
    if (navigator.share) {
      navigator.share(shareData).catch(function() {});
    } else {
      navigator.clipboard.writeText(location.href).then(
        function() { showToast('已複製這頁連結'); },
        function() { showToast('長按網址列複製'); }
      );
    }
  }

  document.addEventListener('click', function(e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var action = btn.dataset.action;
    if (action === 'copy') onCopy(btn);
    else if (action === 'download') onDownload(btn);
    else if (action === 'share') onShare(btn);
  });
})();
`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('[ssg] connecting to Neon...');
  const sql = neon(NEON_URL);

  console.log('[ssg] fetching memes (limit ' + MEME_LIMIT + ')...');
  const memes = await sql`
    SELECT id, title, cached_url, media_url, media_type, platform,
           source_url, width, height, like_count, share_count, comment_count,
           fetched_at
    FROM public.memes
    ORDER BY fetched_at DESC
    LIMIT ${MEME_LIMIT}
  `;
  console.log('[ssg] loaded ' + memes.length + ' memes');

  if (memes.length === 0) {
    console.error('[ssg] FATAL: 0 memes returned from DB — refusing to wipe /meme/');
    process.exit(1);
  }

  // Clean meme dir to avoid stale pages from deleted memes
  console.log('[ssg] cleaning ' + MEME_DIR + '...');
  await rm(MEME_DIR, { recursive: true, force: true });
  await mkdir(MEME_DIR, { recursive: true });

  // For "related" links on each page, reuse the recent slice
  const recent = memes.slice(0, RELATED_COUNT + 1);

  console.log('[ssg] writing ' + memes.length + ' meme pages...');
  let written = 0;
  for (const meme of memes) {
    const html = renderMemePage(meme, recent);
    await writeFile(join(MEME_DIR, `${meme.id}.html`), html, 'utf-8');
    written++;
    if (written % 50 === 0) console.log('  ' + written + '/' + memes.length);
  }
  console.log('[ssg] wrote ' + written + ' meme pages');

  // Index page (HTML sitemap for users + AI crawlers)
  console.log('[ssg] writing meme index page...');
  await writeFile(join(MEME_DIR, 'index.html'), renderMemeIndexPage(memes), 'utf-8');

  // Glob /guide/*.html (excluding index.html) for sitemap inclusion
  const guideDir = join(WEB_DIR, 'guide');
  let guideSlugs = [];
  try {
    const entries = await readdir(guideDir);
    guideSlugs = entries
      .filter(f => f.endsWith('.html') && f !== 'index.html')
      .map(f => f.replace(/\.html$/, ''));
  } catch (_) { /* guide dir might not exist on first build */ }
  console.log('[ssg] found ' + guideSlugs.length + ' guide pages');

  // Sitemap with all meme URLs + guides
  console.log('[ssg] writing sitemap.xml...');
  await writeFile(join(WEB_DIR, 'sitemap.xml'), renderSitemap(memes, guideSlugs), 'utf-8');

  // Shared meme.js
  console.log('[ssg] writing /meme.js...');
  await writeFile(join(WEB_DIR, 'meme.js'), renderMemeJs(), 'utf-8');

  console.log('[ssg] done.');
  console.log('  /meme/<uuid>.html × ' + memes.length);
  console.log('  /meme/index.html');
  console.log('  /sitemap.xml (' + (memes.length + 4 + guideSlugs.length) + ' urls)');
  console.log('  /meme.js');
}

main().catch(e => {
  console.error('[ssg] FATAL:', e);
  process.exit(1);
});
