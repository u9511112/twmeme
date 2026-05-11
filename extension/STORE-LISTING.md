# Chrome Web Store listing — TWmeme

繁中市場 v1 上架文案。所有欄位都對應 Chrome Web Store Developer
Dashboard 的具體輸入框，貼進去就能用。送審前每段都自己讀一次。

---

## Item / Store Listing

### Title (45 char max)

```
TWmeme — 在 LINE Threads IG 打 :meme 直接插入台灣迷因
```

(54 char — 太長，下面這版 45 內收：)

```
TWmeme — :meme 一鍵插入台灣迷因
```

### Summary (132 char max)

```
打 :meme 柴犬雷，直接從 LINE / Threads / IG 輸入框插入台灣本土迷因。鍵盤 ↑↓ 選、Enter 送，不用切視窗、不用存圖。
```

### Description (16,000 char max)

```
TWmeme 是給每天聊天用的台灣迷因外掛。

在 LINE Web、Threads、Instagram 的訊息或留言框打 :meme 加你想要的關鍵字，例如 :meme 柴犬雷，外掛立刻從 TWmeme 收的台灣 PTT、Dcard 迷因庫搜出最相關的圖、彈出小視窗給你選，按 Enter 直接插入。

整段流程都在輸入框內：
  • 不用切到瀏覽器找圖
  • 不用右鍵存到桌面再拖回來
  • 不用打開 Discord / LINE Keep 翻舊圖
  • ↑↓←→ 選圖、Enter 插入、Esc 關閉

也支援「最近用過」：你選過的迷因會記在本機 chrome.storage（不上雲、不傳第三方），下次只要打 :meme 不加關鍵字，最近 12 張會立刻跳出來。

支援平台：
  • LINE Web (line.me)
  • Threads (threads.com / threads.net)
  • Instagram (instagram.com)

開發中：
  • 桌面版 LINE 不支援（Chrome 外掛只能跑在 Chrome / Edge / Brave 裡）
  • Mobile 不支援

迷因來源：TWmeme 自有爬蟲每 4 小時從 PTT 自動更新。所有圖快取在 Cloudflare R2，載入快、不會被原站 hotlink 防呆擋掉。

隱私：
  • 不收集任何個人資料
  • 不追蹤瀏覽行為
  • 唯一的網路請求是搜尋字串送到 TWmeme 的 Neon 資料庫（用 GRANT 權限只能讀迷因表跟寫搜尋紀錄，公開安全）
  • 「最近用過」只存本機，不同步到任何地方
  • 詳細：https://twmeme.vercel.app/privacy

回報問題、建議新迷因來源：https://twmeme.vercel.app
```

### Category

`Communication` 或 `Productivity` 二選一。建議 `Communication`（更貼近實際使用情境）。

### Language

`Chinese (Traditional)`

---

## Privacy practices

### Single purpose description

```
讓使用者在 LINE Web / Threads / Instagram 的輸入框內，透過 :meme 關鍵字觸發指令搜尋並插入台灣本土迷因圖片。
```

### Permission justifications

- **`storage`**：儲存使用者「最近選過的迷因」清單在本機 chrome.storage.local，下次打 `:meme` 不加關鍵字時直接顯示，不需要重新搜尋。不上傳、不同步。

- **Host permission `https://ep-dawn-voice-...neon.tech/*`**：搜尋使用者打的關鍵字。這是 TWmeme 的公開唯讀 Neon Postgres 端點，由資料庫 GRANT 權限限制只能 SELECT 迷因表跟 INSERT 搜尋紀錄（無 UPDATE/DELETE，無使用者個資存取）。

- **Content scripts on `*.line.me`、`*.threads.com`、`*.threads.net`、`*.instagram.com`**：必須注入到這些站才能監聽輸入框、彈出選圖視窗、把圖插回去。沒有這些站就沒功能。

### Data usage

勾以下三項全部「No」：
- ❌ Personally identifiable information
- ❌ Health information
- ❌ Financial / payment information
- ❌ Authentication information
- ❌ Personal communications
- ❌ Location
- ❌ Web history
- ❌ User activity
- ❌ Website content

唯一傳出的資料是「使用者主動打的搜尋字串」，不屬於上述任一類。
打勾「I do not collect or use user data」。

### Privacy policy URL

```
https://twmeme.vercel.app/privacy
```

(已上線，於 commit d0b4a19)

---

## Distribution

- **Visibility**: `Public` (建議；初期可先 `Unlisted` 給朋友灰度)
- **Regions**: `Taiwan` 起步；穩定後加 `Hong Kong`、`Worldwide`
- **Pricing**: `Free`

---

## Assets to upload (見 SCREENSHOTS.md)

- 1× 128×128 icon — 已有 `extension/icons/icon-128.png`
- 至少 1× screenshot 1280×800 或 640×400 — **要拍**
- (選用) 1× promo tile 440×280 — **可選**
- (選用) 1× marquee 1400×560 — **可選**

---

## 送審前 checklist

- [ ] `python scripts/package_extension.py` 跑成功，產出 `dist/twmeme-extension-v0.0.3.zip`
- [ ] zip 內檔案數 = 8（manifest + 4 js + 3 png）
- [ ] manifest.json version 已 bump
- [ ] 至少 3 張 1280×800 截圖（見 SCREENSHOTS.md）
- [ ] 隱私政策連結可以打開 `https://twmeme.vercel.app/privacy`
- [ ] 所有 permission 都在 description 解釋過理由
- [ ] DevTools spike 完成、`insertImageInto()` 不再是 stub（否則送審會被打回說 "doesn't work as advertised"）
