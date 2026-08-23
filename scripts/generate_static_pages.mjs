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
import { mkdir, writeFile, rm, readdir, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const NEON_URL = process.env.NEON_DATABASE_URL
  || process.env.NEON_WEB_ANON_URL;
if (!NEON_URL) {
  console.error('[ssg] FATAL: NEON_DATABASE_URL or NEON_WEB_ANON_URL environment variable is required.');
  process.exit(1);
}

const SITE_ORIGIN = process.env.SITE_ORIGIN || 'https://tw-meme.com';
const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_DIR = join(__dirname, '..', 'web');
const MEME_DIR = join(WEB_DIR, 'meme');

// Cap to keep build under Vercel's 45-min limit even if DB grows. ~5000
// pages takes ~30s of fs writes locally; safe ceiling for now.
const MEME_LIMIT = 5000;
const RELATED_COUNT = 12;
const TODAY = new Date().toISOString().slice(0, 10);

const PLATFORM_LABEL = {
  ptt: '網路討論區',
  dcard: '熱門論壇',
  threads: '社群平台',
  instagram: '社群平台',
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

const safeJsonLd = (obj) => JSON.stringify(obj, null, 2).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');

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
    creator: {
      '@type': 'Organization',
      name: platform || '網路社群原作者',
      url: SITE_ORIGIN,
    },
    copyrightNotice: '© 2026 TWmeme / 圖片收集自公開網路社群，著作權歸原作者所有',
    license: `${SITE_ORIGIN}/legal/terms`,
    acquireLicensePage: `${SITE_ORIGIN}/legal/dmca`,
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

  // Dynamic usage note based on tags/title
  let usageNote = '這張迷因在台灣社群中被廣泛用於表達生動的情緒反應。一鍵複製圖片連結即可在 LINE、IG 限動、Threads 與 Discord 聊天室中即時展開預覽。';
  const tagStr = (meme.tags || []).join(' ') + ' ' + cleanTitle;
  if (/崩潰|哭|難過|眼淚|痛|傷心|救命/.test(tagStr)) {
    usageNote = '適合在遭遇突發意外、考試/工作進度落後、或是遇到令人難以置信的荒謬事件時，在 LINE、Discord 或 Threads 上作為「無語問蒼天」的情緒宣洩反應圖。';
  } else if (/貓|狗|柴犬|動物|水豚|鳥/.test(tagStr)) {
    usageNote = '這張動物反應圖自帶天然的萌感與幽默防護罩，非常適合作為工作群組中的安全牌表情包、或是向好友撒嬌、發呆與表達平和心境時使用。';
  } else if (/職場|社畜|工作|加班|主管|上班|同事|老闆/.test(tagStr)) {
    usageNote = '專為職場打工人設計的自嘲神器。適合在週一開工、週五下班前被臨時交辦任務、或是與同事私下吐槽工作日常時使用。';
  } else if (/二次元|動漫|吉伊卡哇|芙莉蓮|遊戲|VTuber|鳴潮|蔚藍|鐵道/.test(tagStr)) {
    usageNote = '具備濃厚次文化色彩的經典名場面，適合在動漫討論區、遊戲公會 Discord、或是向同好同溫層精準傳遞作品專屬梗點時使用。';
  } else if (/生氣|怒|火大|不爽|嗆/.test(tagStr)) {
    usageNote = '火藥味十足但幽默感滿分的吐槽圖。適合在朋友講冷笑話、遊戲被隊友坑、或是對荒謬現象發表抗議時作為有力回擊。';
  } else if (/傻眼|問號|疑惑|無奈|尷尬|老頭/.test(tagStr)) {
    usageNote = '經典的「冷眼看世界」系列表情包。面對令人啼笑皆非的對話或長輩群組的奇葩言論時，一張圖勝過千言萬語。';
  }

  const loreBoxHtml = `
    <div class="meme-lore-box">
      <h3>💡 推薦聊天場合與使用指南</h3>
      <p>${escapeHtml(usageNote)}</p>
      ${meme.ocr_text ? `<p><strong>📝 畫面核心文字：</strong>「${escapeHtml(meme.ocr_text)}」</p>` : ''}
      ${meme.description ? `<p><strong>🎯 視覺語意解析：</strong>${escapeHtml(meme.description)}</p>` : ''}
      <p style="font-size: 12px; color: var(--muted); margin-top: 8px;">
        📅 收錄日期：${escapeHtml(date)} · 📐 原始畫質：${hasDims ? `${meme.width}×${meme.height} px` : '標準規格'} · 🔓 著作權屬原作者所有，提供公開網路社群索引搜尋。
      </p>
    </div>`;

  // Related memes (12 most recent excluding current)
  const relatedHtml = related
    .filter(r => r.id !== id)
    .slice(0, RELATED_COUNT)
    .map(r => {
      const rUrl = `/meme/${r.id}`;
      const rTitle = String(r.title || '迷因').trim();
      const rImg = pickImageUrl(r);
      const rFallback = (r.cached_url && r.media_url && r.cached_url !== r.media_url) ? r.media_url : '';
      const fbAttr = rFallback ? ` data-fallback="${escapeAttr(rFallback)}"` : '';
      return `      <article class="card-wrap">
        <a class="card" href="${escapeAttr(rUrl)}" aria-label="${escapeAttr(rTitle)} 迷因詳細">
          <div class="thumb t-sand">${rImg ? `<img src="${escapeAttr(rImg)}" alt="${escapeAttr(rTitle)}" loading="lazy" class="thumb-img"${fbAttr} onload="this.parentElement.classList.add('loaded')" onerror="var f=this.dataset.fallback;if(f&&this.src!==f){this.src=f;}else{this.remove();this.parentElement.classList.add('loaded');}">` : '🖼️'}</div>
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
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2538043639262395" crossorigin="anonymous"></script>

<script type="application/ld+json">
${safeJsonLd(imageObjectLd)}
</script>

<script type="application/ld+json">
${safeJsonLd(webPageLd)}
</script>

<script type="application/ld+json">
${safeJsonLd(breadcrumbLd)}
</script>
</head>
<body>

<header class="site-header">
  <a href="/" class="wordmark">迷因<em>搜</em></a>
  <nav class="nav-links">
    <a href="/guide/">指南專題</a>
    <a href="/sponsor">贊助支持</a>
    <a href="mailto:u9511112@gmail.com?subject=TWmeme%20%E6%84%8F%E8%A6%8B%E5%9B%9E%E9%A5%8B">意見回饋</a>
  </nav>
</header>

<div class="topbar">
  <a href="/" class="back" aria-label="返回" onclick="if(history.length>1){history.back();return false;}">
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
  <div>
    <div class="image-pane t-sand">
      ${imageUrl
        ? `<img src="${escapeAttr(imageUrl)}" alt="${escapeAttr(title)}" class="thumb-img">`
        : '<span class="emoji-fallback">🖼️</span>'}
      ${hasDims ? `<span class="quality-badge">${meme.width}×${meme.height}</span>` : ''}
    </div>
    ${loreBoxHtml}
  </div>

  <aside>
    <h1>${escapeHtml(title)}</h1>
    <div class="meta-row">
      <span>📅 ${escapeHtml(date)}</span>
      <a href="/guide/" style="color:var(--primary);text-decoration:none;font-weight:600;">📖 迷因指南</a>
    </div>

    ${(meme.ocr_text || meme.description || (meme.tags && meme.tags.length > 0)) ? `
    <div class="ai-interpretation" id="ai-section">
      ${meme.ocr_text ? `<blockquote id="ai-ocr">${escapeHtml(meme.ocr_text)}</blockquote>` : ''}
      ${meme.description ? `<p class="ai-desc" id="ai-desc">${escapeHtml(meme.description)}</p>` : ''}
      ${(meme.tags && meme.tags.length > 0) ? `
      <div class="ai-tags" id="ai-tags">
        ${meme.tags.map(tag => `<a class="chip-sm" href="/results.html?q=${encodeURIComponent(tag)}">#${escapeHtml(tag)}</a>`).join('')}
      </div>` : ''}
    </div>` : ''}

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
      <a href="/sponsor" class="btn btn-sponsor" style="text-decoration: none;">
        🍜 贊助小編
      </a>
    </div>
  </aside>
</main>

<div class="ad-container">
  <span class="ad-label">贊助商廣告 · Advertisement</span>
  <!-- AdSense Responsive Slot -->
  <ins class="adsbygoogle"
       style="display:block"
       data-ad-client="ca-pub-2538043639262395"
       data-ad-slot="auto"
       data-ad-format="auto"
       data-full-width-responsive="true"></ins>
  <script>
       (adsbygoogle = window.adsbygoogle || []).push({});
  </script>
</div>

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
  <div style="margin-bottom: var(--s-xs);">
    <a href="/guide" style="color: var(--muted); margin: 0 var(--s-xs); text-decoration: none;">使用指南</a> ·
    <a href="/legal/privacy" style="color: var(--muted); margin: 0 var(--s-xs); text-decoration: none;">隱私權政策</a> ·
    <a href="/legal/terms" style="color: var(--muted); margin: 0 var(--s-xs); text-decoration: none;">使用條款</a> ·
    <a href="/legal/dmca" style="color: var(--muted); margin: 0 var(--s-xs); text-decoration: none;">著作權申訴</a> ·
    <a href="/sponsor" style="color: var(--primary); margin: 0 var(--s-xs); text-decoration: none; font-weight: 600;">贊助支持</a>
  </div>
  © 2026 Geek Tech 極客科技. All rights reserved.
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
    { loc: `${SITE_ORIGIN}/legal/privacy`, lastmod: TODAY, changefreq: 'yearly', priority: '0.3' },
    { loc: `${SITE_ORIGIN}/legal/terms`, lastmod: TODAY, changefreq: 'yearly', priority: '0.3' },
    { loc: `${SITE_ORIGIN}/legal/dmca`, lastmod: TODAY, changefreq: 'yearly', priority: '0.3' },
    { loc: `${SITE_ORIGIN}/sponsor`, lastmod: TODAY, changefreq: 'monthly', priority: '0.5' },
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
    const mFallback = (m.cached_url && m.media_url && m.cached_url !== m.media_url) ? m.media_url : '';
    const fbAttr = mFallback ? ` data-fallback="${escapeAttr(mFallback)}"` : '';
    return `      <article class="card-wrap">
        <a class="card" href="${escapeAttr(url)}" aria-label="${escapeAttr(title)}">
          <div class="thumb t-sand">${img ? `<img src="${escapeAttr(img)}" alt="${escapeAttr(title)}" loading="lazy" class="thumb-img"${fbAttr} onload="this.parentElement.classList.add('loaded')" onerror="var f=this.dataset.fallback;if(f&&this.src!==f){this.src=f;}else{this.remove();this.parentElement.classList.add('loaded');}">` : '🖼️'}</div>
          <div class="caption">
            <span class="name">${escapeHtml(title)}</span>
            <span class="meta-sm">${escapeHtml(date)}</span>
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
<meta name="description" content="TWmeme 收錄的所有台灣繁中迷因梗圖索引、依發文時間倒序排列。每張可點進詳細頁複製連結或下載原圖。">
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
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2538043639262395" crossorigin="anonymous"></script>
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
  <div style="margin-bottom: var(--s-xs);">
    <a href="/guide" style="color: var(--muted); margin: 0 var(--s-xs); text-decoration: none;">使用指南</a> ·
    <a href="/legal/privacy" style="color: var(--muted); margin: 0 var(--s-xs); text-decoration: none;">隱私權政策</a> ·
    <a href="/legal/terms" style="color: var(--muted); margin: 0 var(--s-xs); text-decoration: none;">使用條款</a> ·
    <a href="/legal/dmca" style="color: var(--muted); margin: 0 var(--s-xs); text-decoration: none;">著作權申訴</a> ·
    <a href="/sponsor" style="color: var(--primary); margin: 0 var(--s-xs); text-decoration: none; font-weight: 600;">贊助支持</a>
  </div>
  © 2026 Geek Tech 極客科技. All rights reserved.
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
           fetched_at, ocr_text, description, tags
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

  // Update web/index.html with static trending memes and count
  console.log('[ssg] updating web/index.html with static trending memes and count...');
  try {
    const indexHtmlPath = join(WEB_DIR, 'index.html');
    let indexHtml = await readFile(indexHtmlPath, 'utf-8');

    // Update hero subtitle with real meme count
    const countRes = await sql`SELECT count(*) FROM public.memes`;
    const totalCount = Number(countRes[0]?.count || memes.length);
    const countStr = totalCount.toLocaleString('en');
    const countText = `早期版本、目前收錄 ${countStr} 張迷因梗圖。搜不到的告訴我們、會補上。`;
    indexHtml = indexHtml.replace(
      /<p class="sub" id="hero-sub">([\s\S]*?)<\/p>/,
      `<p class="sub" id="hero-sub">${countText}</p>`
    );

    // Helper: render card HTML for a meme row
    const cardHtml = (r, idx) => {
      const rUrl = `/meme/${r.id}`;
      const rTitle = String(r.title || '迷因').trim();
      const primaryUrl = pickImageUrl(r);
      const fallbackUrl = (r.cached_url && r.media_url && r.cached_url !== r.media_url) ? r.media_url : '';
      const loadingAttr = (typeof idx === 'number' && idx < 8) ? '' : 'loading="lazy"';
      const fallbackAttr = fallbackUrl ? ` data-fallback="${escapeAttr(fallbackUrl)}"` : '';
      return `      <article class="card-wrap">
        <a class="card" href="${escapeAttr(rUrl)}" aria-label="${escapeAttr(rTitle)} 迷因詳細">
          <div class="thumb t-sand">${primaryUrl ? `<img src="${escapeAttr(primaryUrl)}" alt="${escapeAttr(rTitle)}" ${loadingAttr} class="thumb-img"${fallbackAttr} onload="this.parentElement.classList.add('loaded')" onerror="var f=this.dataset.fallback;if(f&&this.src!==f){this.src=f;}else{this.remove();this.parentElement.classList.add('loaded');}">` : '🖼️'}</div>
          <div class="caption"><span class="name">${escapeHtml(rTitle)}</span></div>
        </a>
      </article>`;
    };
    const injectGrid = (html, gridId, rows) => {
      const cards = rows.map((r, i) => cardHtml(r, i)).join('\n');
      const regex = new RegExp(`<!-- SSG:${gridId}:START -->[\\s\\S]*?<!-- SSG:${gridId}:END -->`);
      if (!regex.test(html)) {
        console.warn(`[ssg] WARNING: missing SSG markers for ${gridId}, skipping injection`);
        return html;
      }
      return html.replace(regex, () => `<!-- SSG:${gridId}:START -->\n${cards}\n    <!-- SSG:${gridId}:END -->`);
    };

    // 🔥 本週熱門 (last 7 days, by popularity)
    const weeklyRows = await sql`
      SELECT * FROM public.memes
      WHERE fetched_at > now() - interval '7 days'
      ORDER BY like_count DESC, comment_count DESC
      LIMIT 8`;
    indexHtml = injectGrid(indexHtml, 'weekly-hot-grid', weeklyRows);
    console.log(`[ssg] injected ${weeklyRows.length} weekly hot memes`);

    // 👀 最多人氣 (all-time, by likes)
    const popularRows = await sql`
      SELECT * FROM public.memes
      ORDER BY like_count DESC, comment_count DESC
      LIMIT 8`;
    indexHtml = injectGrid(indexHtml, 'popular-grid', popularRows);
    console.log(`[ssg] injected ${popularRows.length} popular memes`);

    // 🆕 最新上架 (newest first)
    const latestRows = await sql`
      SELECT * FROM public.memes
      ORDER BY fetched_at DESC
      LIMIT 8`;
    indexHtml = injectGrid(indexHtml, 'latest-grid', latestRows);
    console.log(`[ssg] injected ${latestRows.length} latest memes`);

    await writeFile(indexHtmlPath, indexHtml, 'utf-8');
    console.log('[ssg] successfully updated web/index.html statically.');
  } catch (err) {
    console.error('[ssg] failed to update web/index.html statically:', err);
  }

  console.log('[ssg] done.');
  console.log('  /meme/<uuid>.html × ' + memes.length);
  console.log('  /meme/index.html');
  console.log('  /sitemap.xml (' + (memes.length + 4 + guideSlugs.length) + ' urls)');
  console.log('  /meme.js');
  console.log('  /index.html (updated statically)');
}

main().catch(e => {
  console.error('[ssg] FATAL:', e);
  process.exit(1);
});
