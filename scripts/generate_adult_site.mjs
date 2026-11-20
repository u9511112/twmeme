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

const ADULT_RE = '色圖|黑絲|全裸|裸體|裸照|色色|情色|成人|保險套|過夜|18禁|限制級|內衣|比基尼|泳裝|巨乳|爆乳|性愛|做愛|約砲|援交|開房|自慰|兔女郎|性感|內褲|胖次|乳';
const NOT_ADULT_RE = '公告|水桶|板規|版規|板務|菸害|處置|刪文|置底';
// Only anime-board drawings are listed (no real-person photos), and anything hinting at minors is dropped.
const MINOR_RE = '少女|學生|國中|高中|小學|未成年|蘿莉|loli|幼|童|JK|制服|校服|萌妹|正太|兒童|小孩|蔚藍|碧藍檔案|正妹|寫真|貓|喵|狗|犬|動物|寵物|鼠|鳥';
// ExoClick rejects young-looking characters (Blue Archive = all students) and animals; real-person photo words (寫真|正妹|女優) are not selected at all.
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
<meta name="juicyads-site-verification" content="acf7cba738c3a75a496c84949863b731">
<meta name="6a97888e-site-verification" content="419bd8f87cf17a28420be1cffdca2c38">
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
.adult-foot{padding:24px 16px;text-align:center;font-size:14px;line-height:1.6;color:#9a9aa6}
.adult-foot a{display:inline-block;padding:11px 6px}
body{background:#0f0f12;color:#ececf1}
a{color:#ff8a4c}
.a-top{display:flex;justify-content:space-between;align-items:center;max-width:1200px;margin:0 auto;padding:14px 16px}
.a-top .mark{font-weight:700;font-size:18px;color:#fff;text-decoration:none;white-space:nowrap;padding:8px 0}
.a-top .mark b{background:#e8590c;color:#fff;border-radius:4px;padding:1px 6px;margin-left:6px;font-size:13px}
.a-top nav{display:flex;align-items:center}
.a-top nav a{color:#b9b9c4;text-decoration:none;font-size:14px;padding:13px 10px}
.a-hero{max-width:1200px;margin:0 auto;padding:40px 16px 24px}
.a-hero h1{font-size:clamp(34px,7vw,72px);line-height:1.08;margin:0 0 16px;color:#fff;letter-spacing:-.01em}
.a-hero h1 em{font-style:normal;color:#ff8a4c;white-space:nowrap}
.a-hero .lead{font-size:clamp(16px,2.2vw,20px);line-height:1.7;color:#c9c9d3;max-width:44ch;margin:0 0 20px}
.a-facts{display:flex;flex-wrap:wrap;gap:8px 20px;margin:0 0 24px;padding:0;list-style:none;color:#fff;font-weight:700}
.a-facts span{display:block;font-weight:400;font-size:14px;color:#9a9aa6}
.a-btn{display:inline-block;background:#e8590c;color:#fff;font-weight:700;font-size:17px;padding:14px 26px;border-radius:8px;text-decoration:none;transition:transform .12s,background .12s}
.a-btn:hover{background:#ff6f1f;transform:translateY(-2px)}
.a-btn:active{transform:translateY(0)}
.a-chips{display:flex;flex-wrap:wrap;gap:8px;max-width:1200px;margin:0 auto;padding:8px 16px 0}
.a-chips button{min-height:44px;padding:0 16px;border-radius:999px;border:1px solid #33333d;background:#1a1a20;color:#ececf1;font-size:15px;cursor:pointer}
.a-chips button[aria-pressed=true]{background:#e8590c;border-color:#e8590c;color:#fff}
.a-sec{max-width:1200px;margin:0 auto;padding:28px 16px 0;font-size:22px;color:#fff}
.adult-grid{max-width:1200px;margin:0 auto}
.adult-grid a{display:block;overflow:hidden;border-radius:8px}
.adult-grid img{display:block;transition:transform .2s}
.adult-grid a:hover img{transform:scale(1.03)}
.ja-slot{min-height:100px;display:flex;flex-wrap:wrap;justify-content:center;align-items:flex-start;gap:12px}
main.detail h1{font-size:clamp(20px,3.4vw,30px);line-height:1.3;color:#fff;margin:8px 0 16px}
main.detail>img{display:block;margin:0 auto;max-height:78vh;width:auto;max-width:100%;object-fit:contain}
main.detail blockquote{margin:16px 0;padding:10px 14px;border-left:3px solid #e8590c;background:#17171c;color:#ececf1}
.d-tags{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}
.d-tags span{padding:4px 12px;border-radius:999px;background:#1a1a20;border:1px solid #33333d;color:#c9c9d3;font-size:14px}
.d-back{display:inline-block;color:#b9b9c4;text-decoration:none;font-size:14px;padding:12px 0}
main.detail{display:block}
#age-gate .what{font-size:15px;color:#ff8a4c;font-weight:700;margin:0 0 8px}
.lang-toggle{min-height:44px;padding:0 14px;margin-left:8px;border-radius:999px;border:1px solid #33333d;background:#1a1a20;color:#ececf1;font-size:14px;cursor:pointer}
#age-gate .lang-toggle{display:block;margin:20px auto 0}
@media(max-width:560px){
.a-top nav a:nth-child(2){display:none}
.adult-grid{grid-template-columns:repeat(2,1fr);gap:8px}
.a-chips{flex-wrap:nowrap;overflow-x:auto}
.a-chips button{flex:none}
}
</style>
<script>try{if(localStorage.getItem('tw_adult_ok')==='1')document.documentElement.classList.add('age-ok')}catch(e){}</script>
<script src="/i18n.js"></script>
</head>
<body>
<div id="age-gate" role="dialog" aria-modal="true">
  <div class="box">
    <p class="what">TWmeme 成人區</p>
    <h1>動漫成人向梗圖圖庫</h1>
    <p>收錄網友分享的 ACG 成人向插畫與迷因。本區含成人向圖片，僅限年滿 18 歲者瀏覽。<br>若你未滿 18 歲，或所在地區禁止瀏覽此類內容，請離開。</p>
    <button class="yes" onclick="try{localStorage.setItem('tw_adult_ok','1')}catch(e){};document.documentElement.classList.add('age-ok');window.jaLoad&&jaLoad()">我已年滿 18 歲，進入</button>
    <a class="no" href="${MAIN}/">離開</a>
  </div>
</div>
`;

const FOOT = `<footer class="adult-foot age-content">
  本區圖片收集自公開網路社群，著作權歸原作者所有。權利人或圖中人物請至 <a href="/dmca">移除申請</a>。
  <br><a href="/about">關於</a> · <a href="/terms">使用條款</a> · <a href="/privacy">隱私權政策</a> · <a href="/dmca">著作權與移除申請</a> · <a href="/contact">聯絡我們</a>
  · <a href="${MAIN}/">TWmeme 主站</a>
</footer>
<script>
// JuicyAds: one banner per page, only after the age gate is passed. Wide screens get 300x250, narrow 300x100.
function jaLoad(){
  var s=document.querySelector('.ja-slot');
  if(!s||window.__ja||!document.documentElement.classList.contains('age-ok'))return;
  window.__ja=1;
  var z=matchMedia('(min-width:768px)').matches?[1131483,300,250]:[1131482,300,100];
  s.innerHTML='<ins id="'+z[0]+'" data-width="'+z[1]+'" data-height="'+z[2]+'"></ins>';
  var j=document.createElement('script');j.async=true;j.src='https://poweredby.jads.co/js/jads.js';j.setAttribute('data-cfasync','false');document.head.appendChild(j);
  (window.adsbyjuicy=window.adsbyjuicy||[]).push({adzone:z[0]});
  // ExoClick 300x250 zone, stacked under the JuicyAds banner.
  var e=document.createElement('div');e.innerHTML='<ins class="eas6a97888e2" data-zoneid="6084128"></ins>';s.appendChild(e);
  var x=document.createElement('script');x.async=true;x.src='https://a.magsrv.com/ad-provider.js';document.head.appendChild(x);
  (window.AdProvider=window.AdProvider||[]).push({serve:{}});
}
jaLoad();
</script>
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
<h2>廣告</h2><p>本站放置第三方成人廣告（JuicyAds），廣告商可能使用 Cookie 投放與衡量廣告，其處理方式依各廣告商政策。您可透過瀏覽器設定管理 Cookie。</p>
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
    TOP + `<main class="age-content" style="max-width:68ch;margin:0 auto;padding:24px 16px;line-height:1.8"><h1>${title}</h1>${body}<p><a href="/">← 成人區首頁</a></p></main>
` + FOOT;
};

const card = (m) => `<a href="/meme/${m.id}" data-tags="${esc(tagsOf(m).join('|'))}"><img src="${esc(img(m))}" alt="${esc(m.title)}" loading="lazy"></a>`;

function memePage(m, related) {
  const url = `${ORIGIN}/meme/${m.id}`;
  const title = String(m.title || '迷因').trim();
  const desc = (m.description || title).slice(0, 160);
  const tags = tagsOf(m);
  return HEAD(`${title} — TWmeme 成人區`, desc, url) + TOP + `<main class="detail age-content" style="padding:16px;max-width:900px;margin:0 auto">
  <a class="d-back" href="/">← 全部成人梗圖</a>
  <h1>${esc(title)}</h1>
  <img src="${esc(img(m))}" alt="${esc(m.description || title)}" style="max-width:100%;border-radius:8px">
  ${m.ocr_text ? `<blockquote>${esc(m.ocr_text)}</blockquote>` : ''}
  ${m.description ? `<p>${esc(m.description)}</p>` : ''}
  ${tags.length ? `<div class="d-tags">${tags.map(t => `<span>#${esc(t)}</span>`).join('')}</div>` : ''}
  <div class="ja-slot" style="text-align:center;margin:16px 0"></div>
  <h2 class="a-sec" style="padding:20px 0 12px">看更多成人梗圖</h2>
  <div class="adult-grid" style="padding:0">${related.filter(r => r.id !== m.id).slice(0, 12).map(card).join('')}</div>
  <p style="text-align:center"><a class="a-btn" href="/">回成人區首頁</a></p>
</main>
` + FOOT;
}

const TOP = `<header class="a-top age-content"><a class="mark" href="/">TWmeme 成人區<b>18+</b></a><nav><a href="/about">關於</a><a href="/dmca">移除申請</a></nav></header>
`;

function indexPage(memes) {
  const shown = memes.slice(0, INDEX_COUNT);
  const count = new Map();
  for (const m of shown) for (const t of tagsOf(m)) if (!/^(adult-|hide-)/.test(t)) count.set(t, (count.get(t) || 0) + 1);
  const chips = [...count].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([t]) => t);
  return HEAD('TWmeme 成人區 — 動漫成人向梗圖圖庫', `收錄 ${memes.length} 張 ACG 成人向插畫與迷因，每張附中文說明與標籤，每天更新。限 18 歲以上瀏覽。`, ORIGIN + '/') + TOP +
`<main class="age-content">
<section class="a-hero">
  <h1>動漫成人向梗圖，<em>一頁看完</em></h1>
  <p class="lead">這裡收錄 PTT 西洽板友分享的 ACG 成人向插畫與迷因。每張都有中文說明與標籤，點圖就能看大圖。</p>
  <ul class="a-facts"><li>${memes.length} 張<span>目前收錄</span></li><li>每天<span>自動更新</span></li><li>18+<span>限成年人瀏覽</span></li></ul>
  <a class="a-btn" href="#latest">看最新圖片</a>
</section>
<div class="ja-slot" style="text-align:center;margin:12px 0"></div>
<h2 class="a-sec" id="latest">最新收錄</h2>
<div class="a-chips" id="chips"><button aria-pressed="true" data-t="">全部</button>${chips.map(t => `<button aria-pressed="false" data-t="${esc(t)}">#${esc(t)}</button>`).join('')}</div>
<div class="adult-grid" id="grid">${shown.map(card).join('')}</div>
</main>
<script>
document.getElementById('chips').addEventListener('click',function(e){
  var b=e.target.closest('button');if(!b)return;var t=b.dataset.t;
  this.querySelectorAll('button').forEach(function(x){x.setAttribute('aria-pressed',x===b)});
  document.querySelectorAll('#grid a').forEach(function(a){a.hidden=!!t&&a.dataset.tags.split('|').indexOf(t)<0});
});
</script>
` + FOOT;
}

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
  WHERE COALESCE(source_url,'') LIKE '%/bbs/C_Chat/%'
    AND (COALESCE(title,'') ~* $1 OR '18+' = ANY(COALESCE(tags,'{}')))
    AND COALESCE(title,'') !~* $2
    AND concat_ws(' ', title, ocr_text, description, array_to_string(tags, ' ')) !~* $3
    AND NOT ('hide-adult' = ANY(COALESCE(tags,'{}')))
    AND ${SUBSTANCE}
  ORDER BY fetched_at DESC
  LIMIT ${LIMIT}`, [ADULT_RE, NOT_ADULT_RE, MINOR_RE]);
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
await copyFile(join(ROOT, 'web', 'i18n.js'), join(OUT, 'i18n.js'));
console.log('[adult] done → web-adult/');
