# TWmeme Chrome Extension

在 LINE / Threads / IG 輸入框打 `:meme 柴犬雷` 直接搜尋台灣迷因，鍵盤選圖、Enter 插入。

## 開發狀態

**v0.0.2 — W2 (UI + 鍵盤 + 動畫)，等 spike 補圖片插入**

完成：
- ✅ Shadow-DOM-isolated overlay UI（4-col grid、coral focus border、200ms entrance、Hover 動畫）
- ✅ 邊打邊搜：`:meme test` 一打到第 4 個字就 debounced query
- ✅ 鍵盤導航：↑↓←→ 選、Enter 確認、Esc 關、外部 click 關
- ✅ 空結果處理：「搜不到 X」+ 連回 TWmeme 提交建議
- ✅ Visual 套 web/DESIGN.md 同色票（coral / 奶油紙白 / DM Sans+Noto Sans TC）
- ✅ Icons 16/48/128

仍未做（等 W2 spike）：
- ❌ **圖片真的插入輸入框** — `content.js:insertImageInto()` 目前是 stub，console.log 而已
  - 待 spike 結果：哪個 API 在 LINE Web / Threads / IG 各 work
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

在 LINE Web 的訊息輸入框聚焦後，DevTools console 試：

```js
// 候選 A: execCommand
document.execCommand("insertHTML", false,
  '<img src="https://pub-26dcc45acd9349968b1ee689f0113ee1.r2.dev/memes/d6f311ea-8c75-4035-8dd2-802aa6718065.png">');

// 候選 B: ClipboardEvent with image blob
const blob = await (await fetch(
  "https://pub-26dcc45acd9349968b1ee689f0113ee1.r2.dev/memes/d6f311ea-8c75-4035-8dd2-802aa6718065.png"
)).blob();
const dt = new DataTransfer();
dt.items.add(new File([blob], "meme.png", { type: "image/png" }));
document.activeElement.dispatchEvent(
  new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true })
);

// 候選 C: 純 DOM 對 contenteditable
const img = document.createElement("img");
img.src = "https://pub-26dcc45acd9349968b1ee689f0113ee1.r2.dev/memes/d6f311ea-8c75-4035-8dd2-802aa6718065.png";
document.activeElement.appendChild(img);
```

哪條讓圖**真的出現在訊息預覽（送出前）**裡，那條就是 W2 該寫進 `insertImageInto()` 的 API。回報結果。

## 設定

`db.js` 內含 Neon `web_anon` connection string，由 Postgres GRANT 保護（只能 SELECT memes、INSERT logs），公開安全 — 跟 `web/db.js` 同一個 trust model。

換 Neon project 時直接改 `db.js` 那 4 個常數。

## 檔案結構

```
extension/
├── manifest.json    # MV3 + host_permissions
├── db.js            # Neon HTTP client (vanilla fetch, ~50 行)
├── overlay.js       # Shadow-DOM UI (grid + animation, ~200 行)
├── content.js       # Controller: 邊打邊搜 + 鍵盤導航 + insert stub
├── icons/
│   ├── icon-16.png
│   ├── icon-48.png
│   ├── icon-128.png
│   └── _generate.py # 重生 icons 用，commit 進 git
└── README.md
```

## 後續

見 `~/.gstack/projects/u9511112-twmeme/u9511112-master-design-20260511-162000.md` 的 Week 3-4 計劃（Threads/IG 平台差異、recent carousel、settings popup、Chrome Web Store 上架）。
