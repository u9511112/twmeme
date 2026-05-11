# TWmeme Chrome Extension

在 LINE / Threads / IG 輸入框打 `:meme 柴犬雷 <Enter>` 直接搜尋台灣迷因。

## 開發狀態

**v0.0.1 — W1 skeleton**：只 console.log 結果，沒 UI。W2 才會把圖直接插進輸入框。

當前進度對照 design doc：`~/.gstack/projects/u9511112-twmeme/u9511112-master-design-20260511-162000.md`

## 本機安裝（開發用）

1. 開 `chrome://extensions`
2. 右上角開 **Developer mode**
3. **Load unpacked** → 選 `TWmeme/extension/` 這個資料夾
4. 開 LINE Web (`https://line.me`)
5. F12 開 DevTools → Console tab
6. 在 LINE 輸入框打 `:meme 柴犬 <Enter>`
7. Console 應顯示：
   ```
   [TWmeme] :meme query = "柴犬"
   [TWmeme] N results in XXms:
     [ptt] xxxxx → https://pub-xxx.r2.dev/memes/xxx.jpg
   ```

## 設定

連線資訊（Neon `web_anon` role）寫在 `db.js`。本質跟 `web/db.js` 一樣，由 Postgres GRANT 保護，公開安全。

## W1 limitations

- 只攔截 Enter，沒有「邊打邊預覽」
- 沒有 UI overlay，只 console.log
- 圖**沒有**真的被插入輸入框 — 這是 W2 的工作
- icons/ 目錄空著 — chrome 會用 default icon

## 後續

見 design doc Week 2-4。
