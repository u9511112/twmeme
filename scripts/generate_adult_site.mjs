// TWmeme adult section — separate static site (web-adult/) behind an age gate.
// Deploy to its own Pages project / subdomain so the main site stays clean:
//   npm run build:adult && wrangler pages deploy web-adult --project-name=twmeme-adult
//
// Selects what the main site excludes (EXCLUDE_TITLE_RE in generate_static_pages.mjs,
// minus the announcement words) plus rows tagged '18+', and only those with AI text.
// Rows the AI skipped (broken image / minor-looking) have no text, so they never appear.
// ADULT_TEST=1 drops the text requirement for local smoke tests.

import { neon } from '@neondatabase/serverless';
import { mkdir, writeFile, rm, copyFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const NEON_URL = process.env.NEON_DATABASE_URL || process.env.NEON_WEB_ANON_URL;
if (!NEON_URL) { console.error('[adult] NEON_DATABASE_URL required'); process.exit(1); }

const ORIGIN = process.env.ADULT_ORIGIN || 'https://adult.tw-meme.com';
const MAIN = 'https://tw-meme.com';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'web-adult');
const LIMIT = 5000;
const INDEX_COUNT = 200;

const ADULT_RE = '色圖|正妹|寫真|黑絲|全裸|裸體|裸照|色色|情色|成人|保險套|過夜|18禁|限制級|內衣|比基尼|泳裝|巨乳|爆乳|性愛|做愛|約砲|援交|開房|女優|自慰|兔女郎|性感|內褲|胖次|乳';
const NOT_ADULT_RE = '公告|水桶|板規|版規|板務|菸害|處置|刪文|置底';
const SUBSTANCE = process.env.ADULT_TEST ? 'TRUE'
  : `(COALESCE(ocr_text,'') <> '' OR COALESCE(description,'') <> '' OR COALESCE(array_length(tags,1),0) > 0)`;

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const img = (m) => m.cached_url || m.media_url || '';
const tagsOf = (m) => (m.tags || []).filter(t => t !== '18+');

// Gate: hide <main> until confirmed. Content stays in the HTML (labelled via RTA meta).
const HEAD = (title, desc, canonical) => `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(canonical)}">
<meta name="rating" content="adult">
<meta name="RATING" content="RTA-5042-1996-1400-1577-RTA">
<link rel="stylesheet" href="/styles.css">
<style>
html:not(.age-ok) .age-content{display:none}
html.age-ok #age-gate{display:none}
#age-gate{position:fixed;inset:0;z-index:99;display:flex;align-items:center;justify-content:center;background:#111;color:#fff;padding:24px;text-align:center}
#age-gate .box{max-width:420px}
#age-gate h1{font-size:28px;margin:0 0 12px}
#age-gate p{line-height:1.7;margin:0 0 20px;color:#ddd}
#age-gate button,#age-gate a{display:inline-block;margin:6px;padding:12px 22px;border-radius:8px;border:0;font-size:16px;cursor:pointer;text-decoration:none}
#age-gate .yes{background:#e8590c;color:#fff}
#age-gate .no{background:#444;color:#fff}
.adult-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;padding:16px}
.adult-grid img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px}
.adult-foot{padding:24px 16px;text-align:center;font-size:13px;color:#888}
</style>
<script>try{if(localStorage.getItem('tw_adult_ok')==='1')document.documentElement.classList.add('age-ok')}catch(e){}</script>
</head>
<body>
<div id="age-gate" role="dialog" aria-modal="true">
  <div class="box">
    <h1>🔞 成人內容</h1>
    <p>本區含成人向圖片，僅限年滿 18 歲者瀏覽。<br>若你未滿 18 歲，或所在地區禁止瀏覽此類內容，請離開。</p>
    <button class="yes" onclick="try{localStorage.setItem('tw_adult_ok','1')}catch(e){};document.documentElement.classList.add('age-ok')">我已年滿 18 歲，進入</button>
    <a class="no" href="${MAIN}/">離開</a>
  </div>
</div>
`;

const FOOT = `<footer class="adult-foot age-content">
  本區圖片收集自公開網路社群，著作權歸原作者所有。權利人請至 <a href="${MAIN}/legal/dmca">下載／移除申請</a>。
  · <a href="${MAIN}/">回 TWmeme 主站</a>
</footer>
</body></html>
`;

const card = (m) => `<a href="/meme/${m.id}"><img src="${esc(img(m))}" alt="${esc(m.title)}" loading="lazy"></a>`;

function memePage(m, related) {
  const url = `${ORIGIN}/meme/${m.id}`;
  const title = String(m.title || '迷因').trim();
  const desc = (m.description || title).slice(0, 160);
  const tags = tagsOf(m);
  return HEAD(`${title} — TWmeme 成人區`, desc, url) + `<main class="detail age-content" style="padding:16px;max-width:900px;margin:0 auto">
  <h1>${esc(title)}</h1>
  <img src="${esc(img(m))}" alt="${esc(m.description || title)}" style="max-width:100%;border-radius:8px">
  ${m.ocr_text ? `<blockquote>${esc(m.ocr_text)}</blockquote>` : ''}
  ${m.description ? `<p>${esc(m.description)}</p>` : ''}
  ${tags.length ? `<p>${tags.map(t => `#${esc(t)}`).join(' ')}</p>` : ''}
  <h2>更多</h2>
  <div class="adult-grid" style="padding:0">${related.filter(r => r.id !== m.id).slice(0, 12).map(card).join('')}</div>
  <p><a href="/">← 成人區首頁</a></p>
</main>
` + FOOT;
}

const indexPage = (memes) => HEAD('TWmeme 成人區', 'TWmeme 成人向迷因圖區，限 18 歲以上瀏覽。', ORIGIN + '/') +
  `<main class="age-content"><h1 style="padding:16px 16px 0">TWmeme 成人區</h1><div class="adult-grid">${memes.slice(0, INDEX_COUNT).map(card).join('')}</div></main>\n` + FOOT;

const sitemap = (memes) => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>${ORIGIN}/</loc></url>
${memes.map(m => `<url><loc>${ORIGIN}/meme/${m.id}</loc></url>`).join('\n')}
</urlset>
`;

const sql = neon(NEON_URL);
const memes = await sql(`
  SELECT id, title, cached_url, media_url, ocr_text, description, tags, fetched_at
  FROM public.memes
  WHERE (COALESCE(source_url,'') LIKE '%/bbs/Beauty/%' OR COALESCE(title,'') ~* $1 OR '18+' = ANY(COALESCE(tags,'{}')))
    AND COALESCE(title,'') !~* $2
    AND ${SUBSTANCE}
  ORDER BY fetched_at DESC
  LIMIT ${LIMIT}`, [ADULT_RE, NOT_ADULT_RE]);
console.log('[adult] ' + memes.length + ' pages');
if (memes.length === 0) { console.error('[adult] nothing to build — import AI results first'); process.exit(1); }

await rm(OUT, { recursive: true, force: true });
await mkdir(join(OUT, 'meme'), { recursive: true });
const recent = memes.slice(0, 13);
for (const m of memes) await writeFile(join(OUT, 'meme', `${m.id}.html`), memePage(m, recent));
await writeFile(join(OUT, 'index.html'), indexPage(memes));
await writeFile(join(OUT, 'sitemap.xml'), sitemap(memes));
await writeFile(join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${ORIGIN}/sitemap.xml\n`);
await copyFile(join(ROOT, 'web', 'styles.css'), join(OUT, 'styles.css'));
console.log('[adult] done → web-adult/');
