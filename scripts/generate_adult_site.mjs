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
  本區圖片收集自公開網路社群，著作權歸原作者所有。權利人或圖中人物請至 <a href="/dmca">移除申請</a>。
  <br><a href="/about">關於</a> · <a href="/terms">使用條款</a> · <a href="/privacy">隱私權政策</a> · <a href="/dmca">著作權與移除申請</a> · <a href="/contact">聯絡我們</a>
  · <a href="${MAIN}/">TWmeme 主站</a>
</footer>
</body></html>
`;


const MAIL = 'twmeme.contact@gmail.com';
const PAGES = {
  about: ['關於本站', `<p>TWmeme 成人區是 <a href="${MAIN}/">TWmeme</a> 的獨立分站，收錄台灣網路社群公開張貼的成人向迷因與插畫，並以繁體中文加上文字說明與標籤，方便搜尋。</p>
<h2>年齡限制</h2><p>本站內容僅限年滿 18 歲者瀏覽。進站需通過年齡確認，頁面並帶有 <code>rating: adult</code> 與 RTA 成人網站標籤，家長可用過濾軟體封鎖本站。</p>
<h2>內容原則</h2><ul><li>不收錄外觀為未成年人的色情或裸露內容，發現請立即通報。</li><li>不收錄真人偷拍、未經同意散布的私密影像。</li><li>圖片來源為公開網路社群，著作權屬原作者，本站僅提供索引與搜尋。</li></ul>`],
  terms: ['使用條款', `<p>最後更新：2026 年 11 月</p>
<h2>一、使用資格</h2><p>您必須年滿 18 歲（或所在地法定成年年齡），且所在地法律允許瀏覽成人內容，才可使用本站。進入本站即表示您聲明符合上述條件。</p>
<h2>二、內容與著作權</h2><p>本站圖片收集自公開網路社群，著作權屬原作者所有。您不得將本站內容用於商業用途或違法目的。</p>
<h2>三、禁止行為</h2><ul><li>以自動化程式大量抓取本站內容。</li><li>上傳、散布或要求收錄涉及未成年人的性內容。</li><li>侵害他人隱私或名譽。</li></ul>
<h2>四、免責聲明</h2><p>本站內容依現狀提供，不保證完整或正確。本站有權隨時移除內容或調整服務。</p>
<h2>五、聯絡</h2><p>任何問題請寄 <a href="mailto:${MAIL}">${MAIL}</a>。</p>`],
  privacy: ['隱私權政策', `<p>最後更新：2026 年 11 月</p>
<h2>我們蒐集什麼</h2><p>本站不要求註冊，不蒐集姓名、電子郵件等個人資料。您按下「我已年滿 18 歲」後，瀏覽器會在本機儲存一個年齡確認標記（localStorage），僅用於避免重複詢問，不會傳送給我們。</p>
<h2>伺服器紀錄</h2><p>本站由 Cloudflare 提供服務，Cloudflare 可能記錄 IP 位址與請求資訊以提供安全與效能功能，詳見其隱私權政策。</p>
<h2>廣告</h2><p>本站日後可能放置第三方成人廣告，廣告商可能使用 Cookie 投放與衡量廣告，其處理方式依各廣告商政策。您可透過瀏覽器設定管理 Cookie。</p>
<h2>您的權利</h2><p>如需詢問或要求刪除與您有關的內容，請見 <a href="/dmca">移除申請</a> 或寄信至 <a href="mailto:${MAIL}">${MAIL}</a>。</p>`],
  dmca: ['著作權與移除申請', `<p>我們尊重智慧財產權與個人隱私。以下情況可申請移除：</p>
<ul><li>您是著作權人或其授權代理人，認為本站內容侵害您的著作權。</li><li>您是圖片中的人物，且未同意被公開。</li><li>內容涉及或疑似涉及未成年人，或為未經同意散布的私密影像。</li></ul>
<h2>申請方式</h2><p>請寄信至 <a href="mailto:${MAIL}">${MAIL}</a>，並提供：</p>
<ol><li>您的姓名與聯絡方式。</li><li>涉及內容在本站的完整網址。</li><li>說明您的身分（著作權人、圖中人物或其代理人）與理由。</li><li>著作權申訴請附善意聲明與簽名。</li></ol>
<h2>處理時間</h2><p>我們會在收到完整資料後 72 小時內審核並回覆。涉及未成年人或未經同意的私密影像，會先下架再審核。</p>`],
  contact: ['聯絡我們', `<p>電子郵件：<a href="mailto:${MAIL}">${MAIL}</a></p>
<p>一般詢問、合作洽談、內容移除申請皆可寄至此信箱，我們會在 72 小時內回覆。內容移除請參考 <a href="/dmca">移除申請</a>。</p>`],
};
const staticPage = (slug) => {
  const [title, body] = PAGES[slug];
  return HEAD(`${title} — TWmeme 成人區`, title, `${ORIGIN}/${slug}`) +
    `<main class="age-content" style="max-width:68ch;margin:0 auto;padding:24px 16px;line-height:1.8"><h1>${title}</h1>${body}<p><a href="/">← 成人區首頁</a></p></main>
` + FOOT;
};

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
${Object.keys(PAGES).map(k => `<url><loc>${ORIGIN}/${k}</loc></url>`).join('\n')}
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
for (const slug of Object.keys(PAGES)) await writeFile(join(OUT, `${slug}.html`), staticPage(slug));
await writeFile(join(OUT, 'sitemap.xml'), sitemap(memes));
await writeFile(join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${ORIGIN}/sitemap.xml\n`);
await copyFile(join(ROOT, 'web', 'styles.css'), join(OUT, 'styles.css'));
console.log('[adult] done → web-adult/');
