# TWmeme — Setup Guide

## Prerequisites

- Python 3.12+
- Neon 帳號（免費方案夠用）
- Cloudflare 帳號 + R2 啟用（10GB 免費，零 egress）
- GitHub repo（給 Actions 排程用）
- Vercel 帳號（部署 web）

---

## Step 1 — Neon Postgres

1. 在 neon.tech 開新 project（建議 region: Singapore / Tokyo，看你離哪近）
2. **SQL Editor** 跑 `supabase/migrations/neon/001_schema.sql`
   - 這個檔案 idempotent：建 tables、indexes、enums、兩個 LOGIN role（`web_anon` / `scraper`），全部用 `IF NOT EXISTS`
3. 設角色密碼（檔案註解有指令）：
   ```sql
   ALTER ROLE web_anon PASSWORD '<random_a>';   -- 給 web/db.js 用
   ALTER ROLE scraper  PASSWORD '<random_b>';   -- 給 scraper .env 用
   ```
4. 從 **Connection Details** 抄下：
   - `web_anon` pooled connection string（給 web 用，HTTP driver 走 pooler）
   - `scraper` connection string（給 scraper 用，直連或 pooler 都行）

---

## Step 2 — Cloudflare R2

1. Dashboard → **R2 Object Storage** → 第一次要綁信用卡，但用量在免費額度內不會扣
2. **Create bucket** → `twmeme-memes`，region 任意
3. 進 bucket → **Settings** → **Public Development URL** → **Enable**，記下 `https://pub-xxxx.r2.dev`
4. 回 R2 主頁 → **Manage R2 API Tokens** → **Create API Token**：
   - Permissions: **Object Read & Write**
   - Specify bucket: `twmeme-memes`（限定爆炸半徑）
5. 抄下 **Access Key ID** + **Secret Access Key**（後者只顯示一次）+ **S3 endpoint**

---

## Step 3 — Scraper（本機測試）

```bash
cd scraper
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python -m patchright install chromium

cp .env.example .env
# 編輯 .env：填 NEON_DATABASE_URL（用 scraper role）+ R2_*（共 5 個）

# 可選：加代理（Threads/IG 沒這個就會失敗）
cp proxies.txt.example proxies.txt
# 編輯 proxies.txt

# 跑（預設只 ptt dcard，這兩個沒代理也穩）
python main.py --platforms ptt dcard
```

---

## Step 4 — GitHub Actions（自動化）

1. push 這個 repo 到 GitHub
2. **Settings → Secrets and variables → Actions** 新增 6 個：
   - `NEON_DATABASE_URL`
   - `R2_ENDPOINT`
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
   - `R2_BUCKET`
   - `R2_PUBLIC_URL`
3. cron 每 4 小時自動跑（`.github/workflows/scrape.yml`）
4. 想手動跑：**Actions → Scrape Memes → Run workflow**，可選平台

---

## Step 5 — Web（Vercel 部署）

Web 是純靜態（`index.html` + `results.html` + `detail.html` + `db.js` + `render.js`），沒 build step。

### Neon credentials in client

`web/db.js` 的 connection string **寫死在 client**，含 `web_anon` 角色密碼。**這是設計刻意**：
- `web_anon` 在 Postgres 層被 GRANT 限制成只能 `SELECT memes` / `INSERT search_queries+unmet_searches`，**讀不到 logs**
- 即使連線字串洩漏，攻擊者能做的事跟原本網站就允許的事一樣
- 替代方案（Vercel Function proxy）會增加冷啟動延遲、複雜度、計費，沒必要

換 Neon project 時直接改 `db.js` 那個常數即可，不需要 build/env。

### 部署

```bash
# 第一次：link 到 Vercel project
npx vercel link

# 部署 preview
npx vercel

# 部署 production（或直接 push master，Git 整合會自動 deploy）
npx vercel --prod
```

`vercel.json` 已設好 `outputDirectory: "web"`、cleanUrls、安全 header。

---

## Step 6 — 本機開 web

純靜態，任何 static server 都行：

```bash
cd web
python -m http.server 5173
# 開 http://localhost:5173
```

連線會直接打 prod Neon（透過 `web_anon` GRANT 保護），不需要本機 DB。

---

## Architecture at a Glance

```
GitHub Actions (cron 每 4h)
    │
    ▼
Python Scraper (patchright 反封鎖)
    │  PTT / Dcard
    │  pHash 去重
    │  asyncpg + boto3
    ▼
Neon Postgres (metadata) + Cloudflare R2 (images)
    │
    ▼
靜態 Web (Vercel CDN)
    │  @neondatabase/serverless HTTP driver
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

---

## Migrating from Supabase (historical reference)

Original schema lived in Supabase (Postgres + Storage). The one-time migration ran via `scripts/migrate_data.py`:

```bash
# dry-run (safe, no writes)
python scripts/migrate_data.py

# real migration
SOURCE_DATABASE_URL='postgresql://postgres.<ref>:<pw>@aws-1-<region>.pooler.supabase.com:5432/postgres' \
  python scripts/migrate_data.py --execute
```

Script reads Neon + R2 creds from `~/.gstack/projects/u9511112-twmeme/secrets/neon.env` (machine-local). Idempotent: re-running skips already-migrated rows + objects.

Legacy SQL kept in `supabase/migrations/legacy/` so the original Supabase schema is reproducible if anyone wants it.
