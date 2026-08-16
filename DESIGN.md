---
name: TWmeme
description: 台灣繁中迷因搜尋引擎——用印象關鍵字找到那張你記得但搜不到的迷因
colors:
  coral-hot: "oklch(64.5% 0.22 36)"
  coral-deep: "oklch(58.0% 0.21 36)"
  marigold-pop: "oklch(82.0% 0.19 75)"
  paper-cream: "oklch(98.5% 0.006 45)"
  card-white: "oklch(99.5% 0.005 45)"
  ink-black: "oklch(15.0% 0.008 45)"
  warm-grey: "oklch(50.0% 0.015 45)"
  border-kraft: "oklch(91.0% 0.008 45)"
typography:
  display:
    fontFamily: "'Space Grotesk', 'Noto Sans TC', sans-serif"
    fontSize: "clamp(36px, 5vw, 56px)"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "'Space Grotesk', 'Noto Sans TC', sans-serif"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  body:
    fontFamily: "'DM Sans', 'PingFang TC', 'Microsoft JhengHei', sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "'DM Sans', sans-serif"
    fontSize: "13px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "0.05em"
rounded:
  sm: "6px"
  md: "12px"
  lg: "20px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  2xl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.coral-hot}"
    textColor: "{colors.card-white}"
    rounded: "{rounded.full}"
    padding: "16px 24px"
  button-primary-hover:
    backgroundColor: "{colors.coral-deep}"
  button-secondary:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.ink-black}"
    rounded: "{rounded.md}"
    padding: "16px 24px"
  chip-emotion:
    backgroundColor: "oklch(93.0% 0.04 85)"
    textColor: "oklch(35.0% 0.06 85)"
    rounded: "{rounded.full}"
    padding: "12px 16px"
  card:
    backgroundColor: "{colors.card-white}"
    rounded: "{rounded.md}"
    padding: "0"
---

# Design System: TWmeme

## 1. Overview

**Creative North Star: "The Meme Corner Store（台灣梗圖雜貨店）"**

TWmeme 是巷口那間什麼都有的雜貨店。招牌配色很醜但一眼就認得出來，老闆（搜尋引擎）超熱情什麼都幫你找，貨架上貼滿手寫標價牌和促銷貼紙。進門就能抓到你要的東西，因為一切都擺在眼前，沒有假裝高級的玻璃展示櫃。

這個設計系統刻意拒絕所有「AI 生成 Landing Page」的特徵：不要完美的模糊陰影、不要無衝突的奶油白漸層、不要冷靜克制的 SaaS 灰白。取而代之的是 Gumroad 式的網路放克（Web Punk）美學——粗黑邊框、純黑硬陰影、高飽和對比色、貼紙感的圓角元件。

每一個設計決策都服務於一個目標：讓使用者在 5 秒內找到迷因並貼到聊天室。介面只是舞台，迷因圖片才是主角。

**Key Characteristics:**
- 硬邊框 + 純黑 offset 陰影（3-4px，無模糊），取代柔和的 rgba 陰影
- 高對比、高飽和的珊瑚紅 × 金盞花黃雙色系統
- 粗糙拼貼感：dashed 邊框、手作紙質紋理、不完美的排列
- 速度至上：減少不必要的動畫，搜尋到結果 < 5 秒

## 2. Colors: The Corner-Store Palette

台灣雜貨店的配色邏輯——醒目的紅色招牌、黃色促銷價格牌、牛皮紙包裝袋。

### Primary
- **熱珊瑚紅 Coral Hot** (oklch(64.5% 0.22 36)): 搜尋按鈕、CTA、active 狀態、品牌強調色。像雜貨店門口的紅色塑膠布條。
- **深珊瑚紅 Coral Deep** (oklch(58.0% 0.21 36)): hover 加深態。

### Secondary
- **金盞花黃 Marigold Pop** (oklch(82.0% 0.19 75)): 本週熱門徽章、促銷標籤、hover 回饋。像手寫黃色價格牌。

### Neutral
- **奶油紙白 Paper Cream** (oklch(98.5% 0.006 45)): 頁面底色。微暖，不是冷白。
- **卡紙白 Card White** (oklch(99.5% 0.005 45)): 卡片表面、輸入框底色。
- **深墨黑 Ink Black** (oklch(15.0% 0.008 45)): 主要文字、硬陰影色。
- **暖灰 Warm Grey** (oklch(50.0% 0.015 45)): 次要文字、placeholder。
- **牛皮紙邊框灰 Border Kraft** (oklch(91.0% 0.008 45)): 分割線、邊框。

### Named Rules
**The Corner Store Rule.** 整個調色板只有 2 個飽和色（珊瑚紅 + 金盞花黃），其餘全是暖中性色。飽和色用在「動作」上（按鈕、徽章、連結），不用在「容器」上（背景、邊框、分隔線）。如果螢幕上超過 15% 面積是飽和色，就太多了。

## 3. Typography

**Display Font:** Space Grotesk (with Noto Sans TC, sans-serif fallback)
**Body Font:** DM Sans (with PingFang TC, Microsoft JhengHei fallback)

**Character:** Space Grotesk 的幾何感與 tight letter-spacing 帶來工具般的銳利，DM Sans 的圓潤人文主義筆觸讓內文保持可親。兩者搭配像是「工程師做的，但給人用的」。

### Hierarchy
- **Display** (700, clamp(36px, 5vw, 56px), 1.05): 首頁 hero 標題專用。-0.03em letter-spacing 壓緊。
- **Headline** (600, 28px, 1.25): 區塊標題（本週熱門、人氣精選）。-0.01em。
- **Title** (600, 19px, 1.35): 卡片內標題、FAQ 問題。
- **Body** (400, 16px, 1.6): 文章內文、描述。max-width 65ch。
- **Label** (700, 13px, 1.3, uppercase, 0.05em tracking): 分類標籤、徽章、metadata。

### Named Rules
**The No-Huge-Untracked Rule.** 任何超過 24px 的字型必須有負值 letter-spacing（-0.01em 以上）。大字不壓字距 = AI 味的最大來源之一。

## 4. Elevation: The Sticker-Lift System

本系統使用**純黑硬陰影**（solid offset shadow），完全不使用模糊陰影。這是與 AI 生成介面最關鍵的差異點。

硬陰影的邏輯：元件像「貼紙」浮在紙面上。陰影是純黑色塊，有方向性（右下偏移），沒有擴散。越重要的元素，偏移越大。

### Shadow Vocabulary
- **Sticker Lift** (`3px 3px 0 oklch(15% 0.008 45)`): 預設狀態的卡片、按鈕。
- **Sticker Pop** (`4px 4px 0 oklch(15% 0.008 45)`): hover 時的「彈出」回饋。
- **Sticker Slam** (`1px 1px 0 oklch(15% 0.008 45)`): active / pressed 回饋，陰影縮小 = 物理按壓感。

### Named Rules
**The No-Blur Rule.** 禁止 `box-shadow` 的第三個值（blur-radius）大於 0。模糊陰影是 AI 味的頭號元兇。唯一例外是 focus ring 的外暈（用 outline + outline-offset 實現，不用 box-shadow）。

## 5. Components

### Buttons
- **Shape:** 圓角膠囊 (9999px radius)，2px 黑色實線邊框
- **Primary:** 珊瑚紅底 + 白字 + Sticker Lift 硬陰影。hover → Coral Deep + Sticker Pop，active → shadow 縮至 Sticker Slam + translateY(1px)。
- **Secondary:** 白底 + 黑字 + 2px 黑邊框 + Sticker Lift。hover → 金盞花黃底。

### Chips / Category Tags
- **Style:** 各分類用不同淡色底（情感=暖黃、角色=白邊框、二次元=淡藍、趨勢=淡粉、場景=淡綠、格式=淡紫）
- **Shape:** 圓角膠囊 + 2px 黑邊框
- **Hover:** 整個 chip 向上浮 2px（translateY(-2px)）+ 陰影從無到 Sticker Lift

### Cards / Containers
- **Corner Style:** 12px radius
- **Background:** Card White
- **Border:** 2px solid Ink Black（取代模糊陰影的卡片分隔方式）
- **Shadow:** Sticker Lift (3px 3px 0 black)。Hover → Sticker Pop + translateY(-3px)。
- **Internal Padding:** 縮圖區 8px padding 維持呼吸感

### Search Box
- **Style:** 白底、2px 黑邊框、圓角膠囊
- **Focus:** 邊框變珊瑚紅 + 3px 3px 0 珊瑚紅硬陰影外暈
- **Button:** 48×48 珊瑚紅圓形 + Sticker Lift

### Navigation
- **Header:** 左側 wordmark「迷因搜」（搜字珊瑚紅），右側文字連結
- **Typography:** Label weight (700, 14px)
- **Hover:** 文字色從暖灰到墨黑

### Broken Grid (Signature Component)
首頁的非對稱 12 欄 grid 佈局。每張卡片的 grid-column span 和 grid-row span 不同，打破「同尺寸卡片重複排列」的 AI 模板感。這是 TWmeme 最核心的視覺簽名。

## 6. Do's and Don'ts

### Do:
- **Do** 所有卡片和按鈕使用 2px 黑色實線邊框 + 純黑硬陰影（3-4px offset, 0 blur）。
- **Do** 讓迷因圖片佔據卡片 70%+ 面積。介面元素越少越好。
- **Do** 在中文排版中對超過 24px 的標題使用負值 letter-spacing（-0.01em 以上）。
- **Do** 保留首頁 broken grid 的不對稱佈局。永遠不要改成等寬卡片 grid。
- **Do** 用台灣網路社群的真實用語（「梗圖」不說「模因」，「傻眼」不說「驚訝」）。
- **Do** 維持所有無障礙基礎設施（skip-link、:focus-visible、prefers-reduced-motion）。

### Don't:
- **Don't** 使用模糊陰影（blur-radius > 0 的 box-shadow）。這是 PRODUCT.md 中「AI 生成 Landing Page」反面教材的首要特徵。
- **Don't** 使用線性漸層作為區塊背景（目前 weekly-hot / popular / latest 區塊有淡色漸層底，應移除）。
- **Don't** 使用 Notion / Linear 式的冷灰白配色。所有灰色必須帶暖色調（hue 45°）。
- **Don't** 讓元件看起來「太完美」。刻意的粗糙感（dashed 邊框、不完美的間距）比精密的一致性更符合品牌。
- **Don't** 添加任何不直接服務於「搜尋到找到圖 < 5 秒」這個目標的裝飾性動畫。
- **Don't** 用 `border-left > 1px` 的彩色邊條作為卡片標記（impeccable 全域禁令）。
- **Don't** 用 `background-clip: text` 漸層文字（impeccable 全域禁令）。
