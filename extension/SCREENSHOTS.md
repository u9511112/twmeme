# Screenshot guide for Chrome Web Store

Web Store 規定截圖 **1280×800 或 640×400**（4:5 ratio 也可），PNG/JPEG。
這頁告訴你拍哪幾張、怎麼擺、怎麼存。送審至少要 1 張，建議 3-5 張多角度。

---

## Tooling

任選其一，能直接吐 1280×800 的螢幕擷取就行：

- **macOS**：`Cmd+Shift+5` → 「擷取選取部分」，視窗大小調到 1280×800（用 `Rectangle` 或 `BetterDisplay` 鎖定視窗尺寸）。
- **Windows**：`Win+Shift+S` → 矩形截取。視窗用 `PowerToys FancyZones` 預設一個 1280×800 grid。
- **任何 OS**：開 Chrome DevTools → 右上角 ⋮ → `Run command` → `Capture full size screenshot`，搭配 `Cmd/Ctrl+Shift+M` device toolbar 設 1280×800 viewport。

不要用手機截圖。Chrome Web Store 會把比例不對的截圖縮歪。

---

## 拍哪幾張（建議順序）

### 1. Hero — `:meme` 觸發瞬間 (必拍)

**目的**：第一眼讓人秒懂功能。

**怎麼擺**：
- 在 LINE Web 開一個你跟朋友的對話
- 訊息輸入框打 `:meme 柴犬` 但還沒按 Enter
- Overlay 已彈出，4×2 grid 滿，第一張被 coral 框框選中
- 截整個視窗（連 LINE 的對話列表 + sidebar 都帶到，看起來像真的在用）

**圖檔名**：`store/screenshot-01-hero.png`

### 2. 鍵盤導航 (必拍)

**目的**：證明「不用滑鼠也能用」這個 selling point。

**怎麼擺**：
- 同一個對話，overlay 已開
- 用 ↓ ←→ 移到第 5 張或第 6 張，coral 選中框在那
- 螢幕上半部疊個提示文字（用 Figma / Canva / 甚至 macOS Preview 加 annotation）：
  > **↑↓←→ 選圖、Enter 插入**

**圖檔名**：`store/screenshot-02-keyboard.png`

### 3. 最近用過 (必拍)

**目的**：展示 chrome.storage.local 的「不重複翻」價值。

**怎麼擺**：
- 先用 5-10 次 `:meme` 不同關鍵字、各選一張，讓 storage 累積
- 然後在輸入框打 `:meme`（單字，不加關鍵字）
- Overlay header 顯示「最近用過」，grid 12 張你自己選過的
- 截圖

**圖檔名**：`store/screenshot-03-recent.png`

### 4. (選用) 跨平台 — Threads + IG

如果想多 1-2 張，重複前面的流程在 Threads / IG 上拍：
- `store/screenshot-04-threads.png` — Threads 留言框觸發
- `store/screenshot-05-instagram.png` — IG DM 觸發

跨平台這幾張是「擴大可信度」的 bonus，沒拍也能上架。

### 5. (選用) 找不到 + 引導

- 打 `:meme 完全不存在的字`
- Overlay 顯示「搜不到 X」+ TWmeme 提交建議連結
- `store/screenshot-06-empty-state.png`

---

## Annotation 風格

如果要在截圖上加文字標註（推薦做給 hero 那張）：

- 字型用 **Noto Sans TC Bold**，跟 overlay 一致
- 文字色 `#1A1A1A`，背景框 `#FCFAF6` (cream paper)，邊框 `#FF5B4B` (coral)
- 不要堆超過 2 行，5 個字內最好

工具推薦：
- **Figma**（免費、最快）— 開新檔案 1280×800、貼截圖、加文字
- **Canva**（有 Web Store 模板）
- **macOS Preview**（內建夠用）

---

## 存放位置

把成品截圖放在 repo `store/` 目錄（用 git 追，不要 gitignore）：

```
TWmeme/
├── store/
│   ├── screenshot-01-hero.png        (1280×800)
│   ├── screenshot-02-keyboard.png    (1280×800)
│   ├── screenshot-03-recent.png      (1280×800)
│   ├── screenshot-04-threads.png     (optional)
│   └── screenshot-05-instagram.png   (optional)
└── ...
```

上傳到 Web Store 時直接從這裡選。

---

## Demo video (選用)

Web Store 接受 YouTube 連結做 promo video（30-90 秒）。如果要拍：

**腳本** (45 秒)：
1. (0-5s) 開 LINE Web 對話 — 「平常想找一張迷因，要切視窗、找圖、存圖、拖回來。」
2. (5-15s) 鏡頭聚焦輸入框 — 打 `:meme 柴犬雷` — overlay 從框下方滑出。
3. (15-25s) 用 ←→ 選圖 — Enter — 圖直接出現在訊息預覽。
4. (25-35s) 再來一次：`:meme` 單字 → 「最近用過」直接跳出。
5. (35-45s) 旁白 + 文字卡：「TWmeme — Chrome 安裝、免費、不收資料。」加 Web Store 連結。

錄製工具：
- macOS：QuickTime Screen Recording（內建）
- 加旁白：剪輯時用 GarageBand / Audacity 錄音
- 上字幕：CapCut（免費）或 DaVinci Resolve

上傳到 YouTube **Unlisted**，把連結貼到 Web Store listing 的 "Promotional video" 欄位。
