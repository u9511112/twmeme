# TWmeme/scraper — Subdirectory Instructions for Codex

## 角色
Python scraper、跑 PTT / Dcard、抓圖去重後寫進 Neon + R2。GitHub Actions cron 每 4 小時跑。

## Stack
- Python 3.12
- `patchright`（stealth Playwright fork、繞反爬）
- `aiohttp`（async fetch）
- `imagehash`（pHash 去重、Hamming ≤ 8）
- `asyncpg`（直連 Neon）
- `boto3`（上傳 R2，走 S3-compatible API）

## 本機開發
```bash
cd scraper
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python -m patchright install chromium
cp .env.example .env            # 填 DATABASE_URL（scraper role）+ R2 keys + proxy
python main.py
```

## .env 必填
- `DATABASE_URL` — Neon 連線（**scraper role**、不是 web_anon）
- `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`
- `R2_ENDPOINT` — S3 endpoint
- `R2_BUCKET` — `twmeme-memes`
- Proxy 設定（看 `proxies.txt.example`）

## 檔案結構
```
main.py              ← 入口、orchestrate scrapers
pipeline/            ← pHash 去重、DB write、R2 upload
scrapers/            ← PTT / Dcard 各自的 scraper
proxies.txt.example  ← 代理範本（不 commit 真實代理）
requirements.txt
```

## 慣例
- 所有 IO 走 async（`asyncio`、`aiohttp`、`asyncpg`）
- pHash Hamming 門檻 `≤ 8` 視為重複（不要動、動了會破壞去重歷史）
- R2 上傳前先檢查 DB 是否有相同 phash → 有 → skip 上傳省 egress
- 代理輪替：每 N 個請求換一個（看 main.py 邏輯）
- patchright stealth context 一定要設、不然會被 PTT / Dcard 擋

## 常見陷阱
- 用 `web_anon` role 連 DB → INSERT 會被擋（GRANT-restricted）
- patchright chromium 沒裝 → `python -m patchright install chromium`
- proxy 死了沒檢查 → 整批被 ban、要在 main.py 加 health check
- 改 phash threshold → 歷史去重資料失準、別動
- 把 .env 或 proxies.txt commit 進 git → secrets 外洩
