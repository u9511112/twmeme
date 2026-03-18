# MemeMaster TW 🇹🇼

全自動台灣迷因採集系統 — Automated Taiwan Meme Collection App

## Overview

A fully automated pipeline that scrapes memes from PTT, Dcard, Threads, and Instagram every 4 hours, deduplicates via perceptual hashing (pHash), stores content in Supabase, and delivers it through a polished Flutter app with waterfall grid and TikTok-style video feed.

## Architecture

```
GitHub Actions (every 4h)
    │
    ▼
Python Scraper  ←  patchright stealth browser + proxy rotation
    │               PTT / Dcard / Threads / Instagram
    │  pHash dedup (imagehash, Hamming ≤ 8)
    ▼
Supabase PostgreSQL + Storage
    │
    ├── Flutter App (Riverpod + MasonryGridView + PageView video feed)
    │
    └── Edge Function → FCM push (🔥 爆紅通知)
```

## Stack

| Layer | Tech |
|-------|------|
| Scraper | Python 3.12, patchright, aiohttp, imagehash |
| Database | Supabase (PostgreSQL + Storage) |
| Scheduler | GitHub Actions (`cron: '0 */4 * * *'`) |
| Push alerts | Supabase Edge Function (Deno) → Firebase FCM |
| Mobile app | Flutter 3.19+, Riverpod, flutter_staggered_grid_view |

## Quick Start

See [SETUP.md](SETUP.md) for full step-by-step deployment instructions.

```bash
# 1. Run scraper locally
cd scraper && pip install -r requirements.txt
python -m patchright install chromium
cp .env.example .env  # add Supabase keys
python main.py --platforms ptt dcard

# 2. Run Flutter app
cd app
flutter pub get
flutter run --dart-define=SUPABASE_URL=... --dart-define=SUPABASE_ANON_KEY=...
```

## Project Structure

```
TWmeme/
├── scraper/          # Python scraper + anti-ban pipeline
├── supabase/         # SQL migrations + Edge Functions
├── app/              # Flutter mobile app
└── .github/          # GitHub Actions workflow
```

## Anti-Ban Strategy

- **patchright**: patches Playwright's CDP `Runtime.enable` signal (primary bot fingerprint)
- Randomised User-Agent, viewport (1280–1920px), `locale=zh-TW`, `timezone=Asia/Taipei`
- `navigator.webdriver` removed via `addInitScript`
- Human scroll simulation + random sleep (1.5–3.5s)
- Proxy rotation with configurable pool (`scraper/proxies.txt`)
- `tenacity` retry (3 attempts, exponential back-off) on HTTP 403/429

## License

MIT
