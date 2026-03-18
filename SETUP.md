# MemeMaster TW — Setup Guide

## Prerequisites
- Python 3.12+
- Flutter 3.19+
- Supabase account (free tier works)
- Firebase project (for FCM push)
- GitHub repo (for Actions scheduler)

---

## Step 1 — Supabase

1. Create a new Supabase project at supabase.com
2. In **SQL Editor**, run `supabase/migrations/001_initial_schema.sql`
3. Verify in **Table Editor**: `memes` and `meme_stats_history` tables exist
4. Copy your **Project URL** and **anon/service_role keys** from Settings → API

---

## Step 2 — Python Scraper (local test)

```bash
cd scraper
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python -m patchright install chromium

cp .env.example .env
# Edit .env — add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY

# Optional: add proxies
cp proxies.txt.example proxies.txt
# Edit proxies.txt with real proxy URLs

python main.py --platforms ptt dcard
```

---

## Step 3 — GitHub Actions (automated scraping)

1. Push this repo to GitHub
2. Go to **Settings → Secrets and variables → Actions**
3. Add:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. The scraper runs automatically every 4 hours
5. To test manually: **Actions → Scrape Memes → Run workflow**

---

## Step 4 — Supabase Edge Function (FCM alerts)

```bash
# Install Supabase CLI
npm install -g supabase

# Login and link project
supabase login
supabase link --project-ref YOUR_PROJECT_REF

# Deploy function
supabase functions deploy trending-alert

# Set FCM secret
supabase secrets set FCM_SERVER_KEY=your_legacy_server_key

# Enable pg_cron + pg_net in Supabase Dashboard → Extensions
# Then in SQL Editor, uncomment and run the cron.schedule() block
# at the bottom of 001_initial_schema.sql (replace YOUR_PROJECT_REF and YOUR_ANON_KEY)
```

---

## Step 5 — Flutter App

### Firebase setup
1. Create a Firebase project at console.firebase.google.com
2. Add Android/iOS apps
3. Download `google-services.json` → `app/android/app/`
4. Download `GoogleService-Info.plist` → `app/ios/Runner/`

### Run
```bash
cd app
flutter pub get
flutter run \
  --dart-define=SUPABASE_URL=https://YOUR_REF.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=your_anon_key
```

### Build release
```bash
# Android
flutter build apk --release \
  --dart-define=SUPABASE_URL=... \
  --dart-define=SUPABASE_ANON_KEY=...

# iOS
flutter build ipa --release \
  --dart-define=SUPABASE_URL=... \
  --dart-define=SUPABASE_ANON_KEY=...
```

---

## Architecture at a Glance

```
GitHub Actions (every 4h)
    │
    ▼
Python Scraper (patchright + anti-ban)
    │  PTT / Dcard / Threads / IG
    │  pHash dedup
    ▼
Supabase PostgreSQL ←──────────────────────────── Flutter App
    │  + Storage (cached media)                   (Riverpod + infinite scroll)
    │                                              (Waterfall grid / TikTok feed)
    ▼
Supabase Edge Function (hourly)
    │  Detect like spike ≥100 in 1h
    ▼
Firebase Cloud Messaging
    │
    ▼
App push notification 🔥
```

---

## Platform Notes

| Platform | Method | Auth | Difficulty |
|----------|--------|------|------------|
| PTT | aiohttp + BeautifulSoup | None (over18 cookie) | Easy |
| Dcard | Public REST API | None | Easy |
| Threads | patchright + network intercept | None | Medium |
| Instagram | patchright + network intercept | None | Hard (needs residential proxy) |
