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
  const els = [];
  const document = {
    readyState: 'loading', title: '', body: { nodeType: 1, nodeName: 'BODY', firstChild: null, hasAttribute: () => false },
    documentElement: { style, lang: '' },
    querySelector: () => null,
    createElement: () => ({ setAttribute() {}, addEventListener() {} }),
    addEventListener(_, fn) { document.ready = fn; },
  };
  const window = {};
  const ctx = { document, window, localStorage: { getItem: () => lang, setItem() {} }, setTimeout: () => 0,
    MutationObserver: class { observe() {} }, location: {}, console };
  vm.runInNewContext(src, ctx);
  return { tr: window.__tr, style, document };
}

const { tr, style, document } = load('en');
const cases = [
  ['搜尋', 'Search'],
  ['傻眼 😑', 'Speechless 😑'],
  ['看全部 12 篇專題 →', 'See all 12 guides →'],
  ['沒找到「柴犬」？', 'No results for “柴犬”?'],
  ['統神 — TWmeme 迷因', 'Tong God — TWmeme'],
  ['📅 收錄日期：2026-01-02 · 📐 原始畫質：標準規格 · 🔓 版權歸原作者', 'Added: 2026-01-02 · Size: standard · Copyright belongs to the original author'],
];
for (const [zh, en] of cases) assert.equal(tr(zh), en, zh);
assert.equal(tr('Search'), null, 'English text is left alone');
assert.equal(tr('某張沒收錄的迷因標題'), null, 'unknown Chinese (meme titles) is left alone');

assert.equal(style.visibility, 'hidden', 'English mode hides the page until translated');
document.ready();
assert.equal(document.documentElement.lang, 'en', 'run() sets <html lang=en>');
assert.equal(style.visibility, '', 'run() reveals the page when done');

const zh = load('zh');
assert.equal(zh.style.visibility, undefined, 'Chinese mode never hides the page');
console.log('i18n smoke test OK');
