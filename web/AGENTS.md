# TWmeme/web — Subdirectory Instructions for Codex

## 角色
純靜態前端（HTML / CSS / JS）、部署 Vercel。讀 Neon Postgres 顯示迷因搜尋結果。

## Stack
- 純 HTML / CSS / JS（**無 framework、無 build step for HTML**）
- `@neondatabase/serverless` HTTP driver（不走 connection pool、直接走 Neon HTTP endpoint）
- 部署 Vercel（static + serverless functions）

## 檔案結構
```
index.html      ← 主搜尋頁
detail.html     ← 迷因詳情頁
db.js           ← @neondatabase/serverless wrapper，用 web_anon role
render.js       ← 卡片渲染邏輯
meme.js         ← 搜尋 / 排序 / 篩選
guide/          ← 使用指南頁
privacy.html / PRIVACY.md
DESIGN.md
README.md / SCREENSHOTS.md / STORE-LISTING.md
```

## DB 連線（重要）
- **一定用 `web_anon` role** — 僅 SELECT、走 pooled HTTP connection
- 連線字串放 Vercel env var（**不要 commit 進 db.js**）
- 絕不在這層用 scraper role；GRANT 設計就是為了防這個

## 慣例
- 不引入前端 framework（React / Vue 都不要）
- 圖片直接讀 R2 public URL（`https://pub-xxxx.r2.dev/...`）、不要 proxy
- 搜尋 query 一定走 prepared statement、避免 SQL injection
- DESIGN.md 是 single source of truth、改視覺前先讀

## 常見陷阱
- 在 db.js 內 hardcode 連線字串 → secret 外洩
- 用 scraper role → 爆炸半徑炸大
- R2 public URL 改了沒更新 → 圖全壞
- 引入 React / Vue → 違反「純靜態」決策、Vercel 部署複雜度上升
