# TWmeme Chrome Extension

在 LINE / Threads / IG 輸入框打 `:meme 柴犬雷` 直接搜尋台灣迷因，鍵盤選圖、Enter 插入。

## 開發狀態

**v0.0.3 — W3 (最近用過 + storage)，等 spike 補圖片插入**

完成：
- ✅ Shadow-DOM-isolated overlay UI（4-col grid、coral focus border、200ms entrance、Hover 動畫）
- ✅ 邊打邊搜：`:meme test` 一打到第 4 個字就 debounced query
- ✅ 鍵盤導航：↑↓←→ 選、Enter 確認、Esc 關、外部 click 關
- ✅ 空結果處理：「搜不到 X」+ 連回 TWmeme 提交建議
- ✅ Visual 套 web/DESIGN.md 同色票（coral / 奶油紙白 / DM Sans+Noto Sans TC）
- ✅ Icons 16/48/128
- ✅ **W3：最近用過** — 打 `:meme`（不加關鍵字）開出最近 12 張選過的圖，chrome.storage.local，MRU
- ✅ **W4 prep**：packaging script、Web Store listing 文案、截圖指南都已備（見 SCREENSHOTS.md / STORE-LISTING.md）

仍未做（等 W2 spike）：
- ❌ **圖片真的插入輸入框** — `content.js:insertImageInto()` 目前是 stub，console.log 而已
  - 待 spike 結果：哪個 API 在 LINE Web / Threads / IG 各 work
  - 跑 `scripts/devtools_image_insert_spike.js` 自動測 3 種 API
  - spike 完只改 `insertImageInto()` 那一個 function，不動別的

## 本機安裝

1. `chrome://extensions` → 開 **Developer mode**
2. **Load unpacked** → 選 `TWmeme/extension/`
3. 開 LINE Web (`https://line.me/...`)、Threads、或 IG
4. 在訊息輸入框打 `:meme test <Enter>`（或不按 Enter 等 200ms）
5. Overlay 應從輸入框下方滑出，顯示 2 個 test seed memes
6. 用 ↑↓ 選圖 → Enter → **目前只 console.log**「would insert」加上 cached_url
7. Esc 關閉

## DevTools spike（W2 阻塞點）

跑 `scripts/devtools_image_insert_spike.js` — 一個 self-contained
harness，自動跑 3 種 API、自動 rollback、印 verdict：

1. 開 LINE Web (或 Threads / IG)
2. 點進訊息輸入框讓它聚焦
3. F12 → Console，貼整個 `scripts/devtools_image_insert_spike.js`
4. 看最後一行 `WINNER on <host>: strategy A/B/C` 回報給我

回報結果後，只改 `content.js::insertImageInto()` ~30 行。

## 設定

`db.js` 內含 Neon `web_anon` connection string，由 Postgres GRANT 保護（只能 SELECT memes、INSERT logs），公開安全 — 跟 `web/db.js` 同一個 trust model。

換 Neon project 時直接改 `db.js` 那 4 個常數。

## 檔案結構

```
extension/
├── manifest.json     # MV3 + host_permissions + storage
├── db.js             # Neon HTTP client (vanilla fetch, ~50 行)
├── storage.js        # chrome.storage.local wrapper for "最近用過"
├── overlay.js        # Shadow-DOM UI (grid + animation + recent, ~250 行)
├── content.js        # Controller: 邊打邊搜 + 鍵盤導航 + insert stub
├── icons/
│   ├── icon-16.png
│   ├── icon-48.png
│   ├── icon-128.png
│   └── _generate.py  # 重生 icons 用，commit 進 git
├── PRIVACY.md        # source of https://twmeme.vercel.app/privacy
├── STORE-LISTING.md  # Chrome Web Store 上架文案
├── SCREENSHOTS.md    # 截圖指南 (1280×800)
└── README.md
```

## 上架到 Chrome Web Store

1. 跑 `python scripts/package_extension.py` → 產出 `dist/twmeme-extension-v0.0.3.zip`
2. 照 `extension/SCREENSHOTS.md` 拍 3-5 張截圖
3. 把 `extension/STORE-LISTING.md` 各區段貼到 https://chrome.google.com/webstore/devconsole
4. 上傳 zip + 截圖 → 送審

## 後續

見 `~/.gstack/projects/u9511112-twmeme/u9511112-master-design-20260511-162000.md` 的 Week 3-4 計劃（Threads/IG 平台差異、recent carousel、settings popup、Chrome Web Store 上架）。
