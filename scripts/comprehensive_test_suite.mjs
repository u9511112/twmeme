import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { neon } from '@neondatabase/serverless';

const SITE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WEB_DIR = join(SITE_ROOT, 'web');
const LIVE_ORIGIN = 'https://tw-meme.com';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures = [];

function assert(condition, name, details = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ [PASS] ${name}`);
  } else {
    failedTests++;
    failures.push({ name, details });
    console.error(`  ❌ [FAIL] ${name} ${details ? `(${details})` : ''}`);
  }
}

async function runTests() {
  console.log('\n========================================');
  console.log('🧪 TWmeme 全站全面自動化測試套件 (AdSense 升級驗證)');
  console.log('========================================\n');

  // --- Suite 1: 靜態檔案與 SSG 完整性 ---
  console.log('📦 [Suite 1] 靜態檔案與 SSG 產物檢查');
  assert(existsSync(join(WEB_DIR, 'index.html')), 'web/index.html 存在');
  assert(existsSync(join(WEB_DIR, 'results.html')), 'web/results.html 存在');
  assert(existsSync(join(WEB_DIR, 'styles.css')), 'web/styles.css 存在');
  assert(existsSync(join(WEB_DIR, 'db.js')), 'web/db.js 存在');
  assert(existsSync(join(WEB_DIR, 'render.js')), 'web/render.js 存在');
  assert(existsSync(join(WEB_DIR, 'sitemap.xml')), 'web/sitemap.xml 存在');
  assert(existsSync(join(WEB_DIR, 'robots.txt')), 'web/robots.txt 存在');
  assert(existsSync(join(WEB_DIR, 'ads.txt')), 'web/ads.txt 存在');
  assert(existsSync(join(WEB_DIR, 'sponsor.html')), 'web/sponsor.html 存在');
  assert(existsSync(join(WEB_DIR, 'about.html')), 'web/about.html 存在');
  assert(existsSync(join(WEB_DIR, 'contact.html')), 'web/contact.html 存在');
  
  // 檢查 8 篇 Guide 文章
  const guideDir = join(WEB_DIR, 'guide');
  const guideFiles = readdirSync(guideDir).filter(f => f.endsWith('.html') && f !== 'index.html');
  assert(guideFiles.length === 8, `專題指南文章數量為 8 篇 (目前: ${guideFiles.length})`);

  // 檢查 SSG meme 頁面目錄
  const memeDir = join(WEB_DIR, 'meme');
  if (existsSync(memeDir)) {
    const memeFiles = readdirSync(memeDir).filter(f => f.endsWith('.html'));
    assert(memeFiles.length > 0, `SSG 迷因靜態頁面數量 > 0 (目前: ${memeFiles.length})`);
  } else {
    assert(false, 'web/meme 目錄存在');
  }

  // --- Suite 2: CSS 設計系統與 Token 完整性 ---
  console.log('\n🎨 [Suite 2] CSS Neo-Brutalist 設計 Token 檢查');
  const css = readFileSync(join(WEB_DIR, 'styles.css'), 'utf-8');
  assert(css.includes('--shadow-sticker: 3px 3px 0'), '定義了 --shadow-sticker 硬陰影');
  assert(css.includes('--shadow-pop: 4px 4px 0'), '定義了 --shadow-pop 硬陰影');
  assert(css.includes('--border-hard: 2px solid'), '定義了 --border-hard 2px 黑邊框');
  assert(css.includes('.home-guides'), '定義了 .home-guides 首頁專題樣式');
  assert(css.includes('.meme-lore-box'), '定義了 .meme-lore-box 迷因解析便條盒');
  assert(css.includes('.ad-container'), '定義了 .ad-container 安全廣告容器');

  // --- Suite 3: 首頁結構與 SEO 規範 ---
  console.log('\n🔍 [Suite 3] 首頁 SEO 與結構檢查');
  const indexHtml = readFileSync(join(WEB_DIR, 'index.html'), 'utf-8');
  assert(indexHtml.includes('ca-pub-2538043639262395'), '包含 Google AdSense 宣告代碼');
  assert(indexHtml.includes('home-guides'), '首頁包含「📰 迷因文化專題」區塊');
  assert(indexHtml.includes('taiwan-meme-origin-top10'), '首頁連結至十大經典迷因起源考');
  assert(indexHtml.includes('cat-dog-meme-collection'), '首頁連結至貓狗迷因梗圖大全');
  assert(indexHtml.includes('office-worker-meme-guide'), '首頁連結至社畜必備迷因指南');
  assert(indexHtml.includes('how-memes-spread-in-taiwan'), '首頁連結至台灣迷因傳播學');

  // --- Suite 4: 抽樣檢查 SSG 迷因詳細頁結構與豐富語意 ---
  console.log('\n📄 [Suite 4] 迷因詳細頁 Schema 與豐富解析內容抽樣');
  if (existsSync(memeDir)) {
    const sampleFiles = readdirSync(memeDir).filter(f => f.endsWith('.html') && f !== 'index.html').slice(0, 5);
    for (const f of sampleFiles) {
      const memeHtml = readFileSync(join(memeDir, f), 'utf-8');
      assert(memeHtml.includes('meme-lore-box'), `${f} 包含 meme-lore-box 解析區塊`);
      assert(memeHtml.includes('💡 推薦聊天場合與使用指南'), `${f} 包含推薦聊天場合標題`);
      assert(memeHtml.includes('ad-container'), `${f} 包含 ad-container 安全廣告版位`);
      assert(memeHtml.includes('@type": "ImageObject"'), `${f} 包含 ImageObject Schema`);
      assert(memeHtml.includes('"license": "https://tw-meme.com/legal/terms"'), `${f} 包含 license 授權網址`);
      assert(memeHtml.includes('history.back()'), `${f} 返回鍵包含 history.back() 修復`);
    }
  }

  // --- Suite 5: AdSense 隱私政策合規檢查 ---
  console.log('\n🔒 [Suite 5] 隱私權政策與 AdSense 條款合規檢查');
  const privacyHtml = readFileSync(join(WEB_DIR, 'legal', 'privacy.html'), 'utf-8');
  assert(privacyHtml.includes('Google AdSense'), '包含 Google AdSense 服務宣告');
  assert(privacyHtml.includes('Cookie'), '包含 Cookie 與個人化廣告宣告');
  assert(privacyHtml.includes('google.com/settings/ads'), '包含 Google 廣告設定停用連結');
  assert(privacyHtml.includes('aboutads.info'), '包含 aboutads.info 宣告');

  // --- Suite 6: 內容過濾與薄頁 noindex ---
  console.log('\n🧹 [Suite 6] 內容過濾與薄頁 noindex 檢查');
  const sitemap = readFileSync(join(WEB_DIR, 'sitemap.xml'), 'utf-8');
  assert(!sitemap.includes(`${LIVE_ORIGIN}/meme<`), 'sitemap 不含薄的 /meme 索引頁');
  assert(sitemap.includes(`${LIVE_ORIGIN}/about`) && sitemap.includes(`${LIVE_ORIGIN}/contact`), 'sitemap 含 about / contact');
  assert(/<meta name="robots" content="noindex,follow">/.test(readFileSync(join(memeDir, 'index.html'), 'utf-8')), '/meme 索引頁為 noindex');
  assert(!/\[公告\]|\[正妹\]|\[色圖\]/.test(indexHtml), '首頁不含公告 / 正妹 / 色圖內容');

  // --- 測試結果總結 ---
  console.log('\n========================================');
  console.log(`📊 測試完成: 總計 ${totalTests} 項測試 | 通過: ${passedTests} | 失敗: ${failedTests}`);
  console.log('========================================\n');

  if (failedTests > 0) {
    console.error('❌ 失敗項目清單:');
    failures.forEach(f => console.error(`  - ${f.name}: ${f.details}`));
    process.exit(1);
  } else {
    console.log('🎉 所有 SSG 內容、設計 Token、SEO 與 AdSense 合規測試全數通過！');
  }
}

runTests().catch(err => {
  console.error('測試執行異常:', err);
  process.exit(1);
});
