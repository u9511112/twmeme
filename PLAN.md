# PLAN.md — 成人區風險收斂與版面收尾（交接給 Antigravity）

最後更新：2026-11-21。語言：繁體中文。最小 git diff，不做多餘重構。

## 背景（只列必要）
- 主站 tw-meme.com（`web/`，`npm run build`）；成人區 adult.tw-meme.com（`web-adult/`，gitignored，`npm run build:adult`，產生器 `scripts/generate_adult_site.mjs`）。
- 成人區目前 267 頁，收錄條件在產生器的 `ADULT_RE`（約第 25 行）、`NOT_ADULT_RE`、`MINOR_RE`（約第 28 行）。
- 上一輪法律風險評估（非律師意見）結論：最大風險是圖片著作權；其次是過於露骨內容（刑法第 235 條）與年齡隔離是否足夠；第三方廣告素材不可控。
- 需要 `NEON_DATABASE_URL`：從 `scraper/.env` 讀取（PowerShell：`$l=(Select-String -Path scraper\.env -Pattern '^NEON_DATABASE_URL=').Line; $env:NEON_DATABASE_URL=($l -replace '^NEON_DATABASE_URL=','').Trim()`）。不要印出值。

## 鐵則（違反就停手）
1. **不得放寬** `MINOR_RE` 或成人／未成年過濾；只能收緊。
2. **廣告版位不得移動**：JuicyAds 區 1131482（手機 300x100）、1131483（桌機 300x250）、ExoClick 區 6084128，維持年齡確認後才載入（`jaLoad()`）。
3. 不改 Cloudflare 安全設定、不碰 ExoClick／JuicyAds 後台（使用者自己處理）。
4. **部署與 commit 只在使用者明確說「部署並提交」後才做。** 平時只改程式、本機 build、預覽驗證。
5. 不動 `supabase/migrations/legacy/`；不印任何 secret 值。
6. 內容過濾規則若有改動，主站 `scripts/generate_static_pages.mjs` 與 `web/db.js` 也要同步（見 AGENTS.md「常見陷阱」），避免首頁與搜尋結果不一致。

## 任務 1：移除過於露骨的頁面（需使用者先確認關鍵字清單）
- 目標：成人區不再收錄標題／OCR／描述含下列字的頁面：`做愛`、`裸體`、`性愛`、`自慰`、`全裸`、`裸照`。
- 做法（最小改動）：在 `scripts/generate_adult_site.mjs` 新增一個 `EXPLICIT_RE` 常數，沿用 `MINOR_RE` 的套用方式（SQL 排除條件，約第 251 行附近）。**不要**只從 `ADULT_RE` 拿掉字，否則含其他字的同一張圖仍會被收錄。
- 驗收：
  - `npm run build:adult` 成功，頁數少於 267。
  - `grep -l "做愛\|裸體\|性愛\|自慰\|全裸\|裸照" web-adult/meme/*.html` 無結果。
  - 先把被移除的頁面清單（標題＋網址）貼給使用者看，再收尾。
- 部署後（使用者核准時）：重新部署 `web-adult`，並用 Cloudflare 清快取 API 清 adult 主機（見記憶檔 `cloudflare-cache-purge-api`；`hosts` 填 adult.tw-meme.com）。已被 Google 收錄的舊網址要在 sitemap 重新提交後讓其 404 失效，此步驟交給使用者在 Search Console 確認。

## 任務 2：每頁加「檢舉／移除申請」入口（著作權通知機制）
- 現況：頁尾有「移除申請」連結（走 `contact`／移除頁）。
- 目標：每個成人梗圖詳細頁加一個明顯、可點（觸控高度 ≥ 44px）的「檢舉／要求移除這張圖」連結，並帶入該頁網址（`mailto:` 或現有移除申請頁的 query 參數，擇最小者）。
- 同步在 `web/i18n.js` 的 `EN` 補英文：例如「檢舉／要求移除」→ `Report / request removal`。
- 驗收：任一 `web-adult/meme/*.html` 可看到連結；zh／en 切換後文字正確；手機 375px 不爆版。

## 任務 3：詳細頁圖片不再被方形裁切（版面）
- 問題：方形裁切會切掉漫畫與推特截圖的內容。
- 做法：只動成人區內嵌 CSS（`generate_adult_site.mjs` 內 `<style>`）：詳細頁圖片改 `object-fit: contain` 並設 `max-height`；列表頁縮圖維持現狀（不要影響格線）。
- 驗收：用 `.claude/launch.json` 的 `adult-preview`（port 8791，served `web-adult`）看首頁與任一詳細頁，桌機與 375px 皆正常。瀏覽器會快取，請用 `?v=` 或強制重新整理。

## 任務 4：桌機首頁 hero 右半空白（版面，低優先）
- 只做版面與層級調整，不新增內容、不移動廣告。若需要加素材，先回報使用者，不自行決定。

## 任務 5：英文模式下的法律頁（低優先）
- 現況：英文模式下法律頁本文仍是中文（故意保留）。若要翻，只翻「年齡限制／移除申請／關於」三頁本文，放進 `web/i18n.js` 的 `EN`，不翻梗圖標題／OCR／標籤。

## 不做（已討論決定）
- 不爬 Dcard／巴哈；不處理 ExoClick 2FA；不移除 Doppler 舊 service token；`.claude/launch.json` 維持未追蹤。
- 不在這份計畫內實作「改為連結原站、不存 R2」：這是架構決策（影響所有頁面與爬蟲），需使用者另行拍板。

## 做完後固定流程
1. `npm run build:adult`（必要時 `npm run build`）→ 檢查無報錯。
2. 預覽驗證：桌機＋375px，首頁＋詳細頁，確認 console 無錯誤。
3. 回報：改了哪些檔、頁數變化、被移除頁清單。
4. 等使用者說「部署並提交」才：
   `doppler run --project hermes --config prd --scope 'D:\' -- npx --yes wrangler pages deploy web-adult --project-name twmeme-adult --branch master --commit-dirty=true`，再 commit，最後清快取。

## 需使用者在後台自行處理（不在本計畫實作範圍）
- ExoClick／JuicyAds：設定類別排除，避免第三方廣告出現真人露骨素材（未確認有無此選項）。
- Search Console：確認 `sitemap.xml` 上次讀取日期。
- 長期：諮詢台灣網路法律律師（刑法第 235 條、年齡確認是否足夠、著作權處理）。
