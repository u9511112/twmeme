# Chrome Web Store Listing — TWmeme

## 基本資訊

| 欄位 | 內容 |
|------|------|
| **Name** | TWmeme |
| **Category** | Productivity |
| **Language** | 中文 (繁體) |
| **Privacy policy URL** | https://twmeme.vercel.app/privacy.html |
| **Homepage URL** | https://twmeme.vercel.app |
| **Support URL** | https://twmeme.vercel.app |

---

## Short description（最多 132 字元）

```
在 LINE Web、Threads、Instagram 輸入框打 :meme 搜尋台灣繁中迷因，Enter 直接插入。不用切分頁，不用存圖，鍵盤全程。
```

字元數：~65（遠低於上限，保留空間）

---

## Full description（最多 16,000 字元）

```
在 LINE、Threads 或 IG 找迷因，你現在要做幾步？

切到別的分頁 → 搜尋 → 找到圖 → 右鍵存圖 → 切回去 → 拖曳 or 貼上。
至少 5-6 步，而且每次都一樣。

TWmeme 把這 6 步壓成 1 步。

────────────────────────────

▌ 怎麼用

1. 在任何 LINE Web、Threads 或 Instagram 的訊息輸入框
2. 打   :meme 柴犬
3. 彈出 4×2 迷因選圖格，用 ↑↓←→ 選、Enter 確認
4. 圖直接插入，trigger 文字自動消失

只打 :meme（不加關鍵字）→ 顯示最近用過的 12 張，常用的永遠在手邊。

────────────────────────────

▌ 資料來源

TWmeme 收錄 PTT 表特板、Dcard 表特版、C_Chat 板的繁體中文迷因，
每 4 小時更新一次，只抓公開貼文。

────────────────────────────

▌ 隱私

✓ 不收集任何個人資料
✓ 不追蹤使用行為
✓ 搜尋查詢只送到 TWmeme 的唯讀資料庫，不記錄 log
✓ 最近用過的圖片 ID 只存在你的瀏覽器本地（chrome.storage.local）
✓ 開源：https://github.com/u9511112/TWmeme

────────────────────────────

▌ 相容平台

• LINE Web（web.line.me）
• Threads（threads.net）
• Instagram（instagram.com）— DM 與留言框

────────────────────────────

▌ 常見問題

Q：要付費嗎？
A：完全免費，沒有訂閱，沒有廣告。

Q：會讀取我的訊息嗎？
A：不會。Extension 只監聽輸入框的 input 事件來偵測 :meme trigger，不讀取其他內容。

Q：為什麼叫 TWmeme？
A：Taiwan Meme，專注台灣繁中論壇文化的梗圖搜尋引擎。
```

---

## 審查用補充說明（Reviewer notes，上架時填在 "Notes for reviewer"）

```
This extension injects a content script into LINE Web, Threads, and Instagram
to detect the ":meme" trigger pattern in message composer inputs.
When the pattern is detected, it queries a read-only PostgreSQL database
(Neon serverless, ap-southeast-1) for Taiwan meme images and displays a
selection overlay.

The host_permission for the Neon endpoint (ep-dawn-voice-ao8hd53u-pooler...)
is required for the database fetch. The storage permission is used only to
persist the user's last 12 selected image IDs locally (recent picks feature).

No user data is transmitted to any server other than the search query string.
```

---

## 截圖上傳順序

1. `screenshot-01-hero.png` — :meme 觸發瞬間（必傳）
2. `screenshot-02-keyboard.png` — 鍵盤導航（必傳）
3. `screenshot-03-recent.png` — 最近用過（必傳）
4. `screenshot-04-threads.png` — Threads（選用）
5. `screenshot-05-instagram.png` — IG（選用）

詳見 `extension/SCREENSHOTS.md`。
