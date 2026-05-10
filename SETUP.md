# TWmeme — Setup Guide

## Prerequisites

- Python 3.12+
- Supabase 帳號（免費版夠用）
- GitHub repo（給 Actions 排程用）
- Vercel 帳號（部署 web）

---

## Step 1 — Supabase

1. 在 supabase.com 開新 project
2. **SQL Editor** 跑 `supabase/migrations/001_initial_schema.sql`
3. 接著跑 `supabase/migrations/002_query_logging.sql`
4. **Table Editor** 確認 `memes` / `meme_stats_history` / `search_queries` / `unmet_searches` 都建好
5. 從 **Settings → API** 抄下：
   - `Project URL`
   - `anon` key（可公開，給 web 用）
   - `service_role` key（絕對保密，給 scraper 用）

---

## Step 2 — Scraper（本機測試）

```bash
cd scraper
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python -m patchright install chromium

cp .env.example .env
# 編輯 .env：填 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY

# 可選：加代理（Threads/IG 沒這個就會失敗）
cp proxies.txt.example proxies.txt
# 編輯 proxies.txt

# 跑（預設只 ptt dcard，這兩個沒代理也穩）
python main.py --platforms ptt dcard
```

---

## Step 3 — GitHub Actions（自動化）

1. push 這個 repo 到 GitHub
2. **Settings → Secrets and variables → Actions** 新增：
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
3. cron 每 4 小時自動跑（`.github/workflows/scrape.yml`）
4. 想手動跑：**Actions → Scrape Memes → Run workflow**，可選平台

---

## Step 4 — Web（Vercel 部署）

Web 是純靜態（`web/index.html` + `results.html` + `detail.html` + js/css），沒 build step。

### 設定 Supabase keys

`web/supabase.js` 的 `SUPABASE_URL` 和 `SUPABASE_ANON_KEY` 是**寫死在 client**的。anon key 配合 RLS 是公開安全的（[migrations 註解](supabase/migrations/001_initial_schema.sql) 有寫為什麼）。

換 Supabase project 時直接改這兩個常數即可，不需要 build/env。

### 部署

```bash
# 第一次：link 到 Vercel project
npx vercel link

# 部署 preview
npx vercel

# 部署 production
npx vercel --prod
```

`vercel.json` 已設好 `outputDirectory: "web"`、cleanUrls、安全 header。

---

## Step 5 — 本機開 web

純靜態，任何 static server 都行：

```bash
cd web
python -m http.server 5173
# 開 http://localhost:5173
```

---

## Architecture at a Glance

```
GitHub Actions (cron 每 4h)
    │
    ▼
Python Scraper (patchright 反封鎖)
    │  PTT / Dcard
    │  pHash 去重
    ▼
Supabase PostgreSQL + Storage
    │
    ▼
靜態 Web (Vercel CDN)
    │  搜尋 / trending / detail
    ▼
使用者
```

---

## Platform Coverage

| Platform | Method | 預設啟用 |
|----------|--------|----------|
| PTT | aiohttp + BeautifulSoup | ✅ |
| Dcard | patchright + GraphQL intercept | ✅ |
| Threads | patchright + network intercept | ⚠️ 需住宅代理 |
| Instagram | patchright + hashtag API | ⚠️ 需住宅代理 |
