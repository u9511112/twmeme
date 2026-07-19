# TWmeme — Repo-Level Instructions for Codex

## 專案性質
台灣繁中迷因搜尋網站。「你記得長什麼樣、但搜不到名字的那張」。
目標：FB / IG / Threads 內容創作者；想用迷因回聊天的人。
Live：https://twmeme.vercel.app/

## 架構
```
GitHub Actions (cron 每 4 小時)
    ↓
Python Scraper (patchright stealth + 代理輪替)
    ├─ PTT / Dcard
    ├─ pHash 去重 (imagehash, Hamming ≤ 8)
    ├─ asyncpg → Neon Postgres
    └─ boto3   → Cloudflare R2
    ↓
Neon Postgres (metadata) + Cloudflare R2 (images)
    ↓
靜態 Web (web/、Vercel)
    └─ @neondatabase/serverless HTTP driver、GRANT-restricted web_anon role
```

## Stack
| Layer | Tech |
|-------|------|
| Scraper | Python 3.12 / patchright / aiohttp / imagehash / asyncpg / boto3 |
| Database | Neon Postgres 17（Singapore） |
| Object Storage | Cloudflare R2（APAC、public `r2.dev` URL） |
| Scheduler | GitHub Actions `cron: '0 */4 * * *'` |
| Web | 純靜態 HTML / CSS / JS + `@neondatabase/serverless` HTTP driver |
| Hosting | Vercel |

## 歷史包袱
- 曾經有 Flutter mobile app + FCM trending push、後來收斂為純網頁
- 原本 DB 是 Supabase（Postgres + Storage）、2026-05 遷到 Neon + R2（脫 free-tier auto-pause、拿 R2 10GB + 零 egress）
- 舊 Supabase migrations 在 `supabase/migrations/legacy/`、留作歷史

## 子目錄職責
| Dir | 角色 | 注意 |
|-----|------|------|
| `scraper/` | Python scraper、PTT / Dcard | requirements.txt、`.env` 用 `scraper` role |
| `web/` | 靜態網站、部署 Vercel | 用 `web_anon` role（GRANT-restricted） |
| `extension/` | Chrome extension（v1.0.0） | manifest v3 |
| `store/` | Chrome Web Store 上架素材 | screenshots、listing |
| `scripts/generate_static_pages.mjs` | 靜態頁面產生器 | `npm run build` |
| `supabase/migrations/neon/` | Neon schema（active） | `001_schema.sql` idempotent |
| `supabase/migrations/legacy/` | Supabase 時代 migration | **不要動** |

## 兩個 DB role（重要）
- **`web_anon`** — 給 `web/` 用、僅 SELECT、走 pooler
- **`scraper`** — 給 `scraper/` 用、SELECT + INSERT + UPDATE、直連 or pooler
- 設定密碼：在 Neon SQL Editor 跑 `ALTER ROLE web_anon PASSWORD '...'`
- **絕不**在 web 端用 scraper role；爆炸半徑會炸到整個 DB

## 環境變數
- **scraper/.env**：`DATABASE_URL`（scraper role）、`R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_ENDPOINT` / `R2_BUCKET`、proxy 設定
- **web/db.js**：`DATABASE_URL_WEB`（web_anon role、pooled connection string）

## R2 慣例
- Bucket：`twmeme-memes`
- API Token：限定該 bucket（爆炸半徑）
- Public Development URL：`https://pub-xxxx.r2.dev`（**不要關**，web 直接讀）

## Cron Schedule
- GitHub Actions：每 4 小時跑 scraper
- 跑前確認代理還活著（爬蟲被 ban 的常見原因）

## 常見陷阱
- 在 web 端用 scraper role → 爆炸半徑炸大（GRANT 設計就是為了防這個）
- pHash Hamming threshold 改太鬆 → 重複圖塞滿 DB；改太緊 → 變體圖被誤判
- patchright 沒裝 chromium → scraper 在 Actions 上跑會炸（`python -m patchright install chromium`）
- 改 schema 動到 `legacy/` migration → 歷史紀錄被破壞、Neon 不會跑這些
- R2 public URL 改了沒同步 web 端 → 圖全壞
