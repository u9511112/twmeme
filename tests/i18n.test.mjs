// Smoke test for web/i18n.js: loads it in a stubbed DOM and checks the translation table.
// Run: node tests/i18n.test.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const src = readFileSync(new URL('../web/i18n.js', import.meta.url), 'utf8')
  // expose tr() for the test only
  .replace("if (document.readyState", "window.__tr = tr; if (document.readyState");

function load(lang) {
  const style = {};
  const toggles = [];
  const host = { appendChild(el) { toggles.push(el); } };
  const document = {
    readyState: 'loading', title: '', body: { nodeType: 1, nodeName: 'BODY', firstChild: null, hasAttribute: () => false },
    documentElement: { style, lang: '' },
    querySelector: () => null,
    querySelectorAll: () => [host],
    createElement: () => ({ setAttribute() {}, addEventListener() {} }),
    addEventListener(_, fn) { document.ready = fn; },
  };
  const window = {};
  const ctx = { document, window, localStorage: { getItem: () => lang, setItem() {} }, setTimeout: () => 0,
    MutationObserver: class { observe() {} }, location: {}, console };
  vm.runInNewContext(src, ctx);
  return { tr: window.__tr, style, document, toggles };
}

const { tr, style, document, toggles } = load('en');
const cases = [
  ['搜尋', 'Search'],
  ['傻眼 😑', 'Speechless 😑'],
  ['看全部 12 篇專題 →', 'See all 12 guides →'],
  ['沒找到「柴犬」？', 'No results for “柴犬”?'],
  ['統神 — TWmeme 迷因', 'Tong God — TWmeme'],
  ['📅 收錄日期：2026-01-02 · 📐 原始畫質：標準規格 · 🔓 版權歸原作者', 'Added: 2026-01-02 · Size: standard · Copyright belongs to the original author'],
  ['檢舉／要求移除這張圖', 'Report / request removal'],
  ['這裡收錄 ACG 成人向插畫與迷因。每張都有中文說明與標籤，點圖就能看大圖。', 'Adult-oriented ACG illustrations and memes. Every image has a Chinese description and tags; tap one to see it full size.'],
  ['關於本站 — TWmeme 成人區', 'About this site — TWmeme Adult'],
  ['找不到這張迷因 — TWmeme 成人區', 'Meme not found — TWmeme Adult'],
  ['TWmeme 主站', 'TWmeme main site'],
  ['一、使用資格', '1. Eligibility'],
  ['傻眼 貓咪 — TWmeme 迷因', '傻眼 貓咪 — TWmeme'],
];
for (const [zh, en] of cases) assert.equal(tr(zh), en, zh);
assert.equal(tr('Search'), null, 'English text is left alone');
assert.equal(tr('某張沒收錄的迷因標題'), null, 'unknown Chinese (meme titles) is left alone');

assert.equal(style.visibility, 'hidden', 'English mode hides the page until translated');
document.ready();
assert.equal(document.documentElement.lang, 'en', 'run() sets <html lang=en>');
assert.equal(style.visibility, '', 'run() reveals the page when done');
assert.equal(toggles.length, 1, 'addToggle() appends a toggle button');
assert.equal(toggles[0].textContent, '中文', 'English mode toggle button offers Chinese');

const zh = load('zh');
assert.equal(zh.style.visibility, undefined, 'Chinese mode never hides the page');
console.log('i18n smoke test OK');
