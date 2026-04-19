# Design System — TWmeme

> Source of truth for 所有 visual / UI decisions on the TWmeme Web 前端。
> Always read before making design changes. Flag any deviation.

## Product Context
- **What this is**：台灣繁中迷因搜尋網站（Taiwan traditional-Chinese meme search web tool）
- **Who it's for**：經營 FB 粉專 / IG / Threads 內容創作者；愛用迷因回覆聊天留言的使用者
- **Use cases**（from Phase 0 interviews）：
  - R1（創作者）：做 FB 粉專封面，要找高畫質特定迷因 → 畫質徽章、一鍵下載
  - R2（聊天回覆）：記得圖長什麼樣但忘記關鍵字 → 搜尋 + tag chips + 一鍵複製
- **Space/industry**：meme search / image discovery / 輕社群工具
- **Project type**：Web app（桌面優先 + RWD），未來加 credit-based 付費 AI 微調

## Aesthetic Direction
- **Direction**：Playful-Editorial（年輕有個性 × 編輯質感）
- **Decoration level**：intentional（紙感背景 + 微量卡片陰影 + 破格 masonry）
- **Mood**：年輕台灣迷因文化、polished editorial、紙質溫暖、不是 SaaS 不是 9GAG
- **Reference posture**：a modern zine that happens to have search on it
- **絕對避免**：紫色漸層、3 欄 icon + 圓圈、居中一切、gradient 按鈕、decorative blobs

## Typography
- **Display / Hero**：`Space Grotesk` 700 — geometric quirk，台灣網站少用，第一眼就有個性
- **Body**：`DM Sans` 400/500 + `Noto Sans TC` 400/500 fallback — zh-TW 可讀性必備
- **UI Labels**：同 body，14px medium
- **Numbers / Credits**：`DM Sans` with `font-variant-numeric: tabular-nums`（未來 credit 餘額對齊用）
- **Loading**：Google Fonts `<link>`（prefetch + preload hero 字重）
- **Scale**：
  - hero: 48-64px / 1.05 / -0.02em
  - section: 28px / 1.2 / -0.01em
  - title: 20px / 1.3
  - body: 16px / 1.6
  - label: 14px / 1.4
  - caption: 13px / 1.4

## Color
- **Approach**：restrained（1 主色 + 1 輔色 + 紙感中性）
- **Primary** `#FF5B4B` 熱珊瑚 — CTA、brand accent「搜」、focus ring
- **Accent** `#FFC233` 金盞花黃 — tag chips（情緒類）、quality badge HD/4K
- **BG** `#FCFAF6` 奶油紙白 — 頁面背景（非純白）
- **Surface** `#FFFFFF` 白卡 — 迷因卡片、搜尋框
- **Ink** `#1A1A1A` 深墨 — 主文字
- **Muted** `#6B6459` 暖灰 — 輔助文字、靜態 tag
- **Border** `#E8E2D6` 紙邊淺灰
- **Semantic**：success `#2E8B57`、warning `#D97706`、error `#D9372C`、info `#3A6FB0`
- **Dark mode**：Phase 1 不做，Phase 2 再補

## Spacing
- **Base unit**：8px
- **Density**：comfortable
- **Scale**：`2xs(2) xs(4) sm(8) md(16) lg(24) xl(32) 2xl(48) 3xl(64) 4xl(96)`

## Layout
- **Approach**：grid-disciplined 為骨架 + 首頁 editorial broken-grid 破格（RISK）
- **Desktop max-width**：1200px 主容器
- **Grid columns**：desktop 12 / tablet 8 / mobile 4
- **Breakpoints**：`sm: 640px`, `md: 768px`, `lg: 1024px`, `xl: 1280px`
- **Border radius**：`sm 6px`（tag、button）/ `md 12px`（卡片）/ `lg 20px`（modal）/ `full 9999px`（搜尋框、chip）

## Motion
- **Approach**：intentional
- **Easing**：enter `cubic-bezier(0.16, 1, 0.3, 1)`, exit `ease-in`, hover `ease-out`
- **Duration**：micro 80ms / short 150ms / medium 250ms / long 400ms
- **Patterns**：
  - 卡片 hover：translateY(-4px) + shadow 加深，150ms
  - 縮圖 hover：scale(1.02)，250ms
  - 畫質徽章 entrance：fade-in + translateY(-2px)，200ms stagger 40ms

## Content Voice
- 繁體中文為主，英文標點用半形
- CTA 用動詞開頭：「複製到剪貼簿」「下載原圖」「分享到 LINE」
- Tag 命名：口語而非正式（「厭世」「崩潰」不是「疲倦」「情緒低落」）
- 標題用完整短句，副標可以口語（「一鍵複製到聊天室」）

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-19 | Initial system | Phase 1 Web 前端設計，based on n=2 訪談 + Playful-Editorial 定位 |
| 2026-04-19 | Space Grotesk display | 台灣少用、第一眼有個性、geometric 不走可愛風 |
| 2026-04-19 | 紙感奶油白 BG 不用純白 | 溫暖感、區分 AdSense 模板站 |
| 2026-04-19 | 首頁 broken-grid Trending | 視覺記憶點、第一眼「迷因站」而非「搜尋引擎」 |
