# TWmeme 🇹🇼

台灣繁中迷因搜尋網站 — 你記得長什麼樣、但搜不到名字的那張。

Live: https://twmeme.vercel.app/

## What this is

- **目標使用者**：FB/IG/Threads 內容創作者；想用迷因回聊天的人
- **解決什麼**：Google 搜不到「那張柴犬被雷打到的反應圖」、PTT 表特板每張要點進去才看得到
- **目前範圍**：早期版本，DB 內以 PTT 表特板為主（後續會擴 Dcard）

## Architecture

```
GitHub Actions (cron 每 4 小時)
    │
    ▼
Python Scraper (patchright stealth + 代理輪替)
    │  PTT / Dcard
    │  pHash 去重 (imagehash, Hamming ≤ 8)
    ▼
Supabase PostgreSQL + Storage
    │
    ▼
靜態 Web (web/, 部署在 Vercel)
    │  supabase-js anon key + RLS
    ▼
使用者搜尋 / 複製 / 下載
```

## Stack

| Layer | Tech |
|-------|------|
| Scraper | Python 3.12, patchright, aiohttp, imagehash |
| Database | Supabase (PostgreSQL + Storage) |
| Scheduler | GitHub Actions (`cron: '0 */4 * * *'`) |
| Web | 純靜態 HTML/CSS/JS + supabase-js v2 |
| Hosting | Vercel |

> **過去的版本**：曾經有 Flutter mobile app + FCM trending 推播，後來收斂為純網頁。`supabase/functions/trending-alert/` 是當時的孤兒 Edge Function（已移除）。

## Quick Start

完整步驟見 [SETUP.md](SETUP.md)。

```bash
# 本機跑 scraper（需 Supabase service_role key）
cd scraper
pip install -r requirements.txt
python -m patchright install chromium
cp .env.example .env  # 填入 SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
python main.py --platforms ptt dcard

# 本機開 web（純靜態）
# 直接用任何 static server
cd web
python -m http.server 5173
# 開 http://localhost:5173
```

## Project Structure

```
TWmeme/
├── scraper/          # Python 爬蟲 + 反封鎖
├── supabase/         # SQL migrations + Edge Functions
├── web/              # 靜態前端（Vercel 部署目標）
├── vercel.json       # Vercel 設定（output dir = web）
└── .github/          # GitHub Actions cron
```

## Anti-Ban Strategy

- **patchright**：把 Playwright 的 CDP `Runtime.enable` 訊號 patch 掉（最主要的 bot fingerprint）
- 隨機 User-Agent、viewport（1280–1920px）、`locale=zh-TW`、`timezone=Asia/Taipei`
- `navigator.webdriver` 用 `addInitScript` 移除
- 模擬人類捲動 + 隨機 sleep（1.5–3.5s）
- 代理輪替（`scraper/proxies.txt`，可選）
- HTTP 403/429 用 `tenacity` 重試 3 次（指數退避）

## Platform Coverage

| Platform | Method | 狀態 |
|----------|--------|------|
| PTT | aiohttp + BeautifulSoup（Beauty / C_Chat 各 3 頁） | ✅ 穩定 |
| Dcard | patchright 攔 GraphQL response（v2 API 已被 Cloudflare 擋） | ✅ 穩定 |
| Threads | patchright + network intercept | ⚠️ 沒住宅代理穩定度 ~50% — 預設不跑 |
| Instagram | patchright + hashtag API intercept | ⚠️ 沒住宅代理穩定度 ~30% — 預設不跑 |

CI 預設只跑 `ptt dcard`。要試 Threads/IG 用 `workflow_dispatch` 手動觸發並指定平台。

## License

MIT
