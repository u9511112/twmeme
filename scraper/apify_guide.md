# TWmeme — Apify Scraper 整合與額度控制指南 (AI 專用)

> [!IMPORTANT]
> **Apify 帳戶共享資訊**
> - **API Key**：`apify_api_jkoqZcARggDuvixgmztr5Ur6aRylIH0bdVCl`
> - **免費額度**：每月 **$5 USD**（與 VinHardLink、EasyPcBuild 共享）。
> - **7 天保留限制**：Apify 免費版之 Dataset/Key-Value Store 資料僅暫存 7 天。**所有爬取到的迷因與資料必須立即讀取，計算 pHash，上傳 R2，並寫入 Neon Database**，避免因過期而遺失。

---

## 1. 爬蟲策略評估

- **PTT** (`scrapers/ptt.py`)：
  - **維持現有免費 aiohttp 抓取**。不經過瀏覽器，完全不使用 Apify。
- **Dcard / Instagram / Threads** (`scrapers/dcard.py`, `instagram.py`, `threads.py`)：
  - 目前被 Cloudflare WAF/Meta 擋，在 GitHub Actions 成功率極低，原本需要每季付費購買住宅代理。
  - **Apify 替代方案**：使用 Apify 現成的 Actor（例如 `apify/instagram-scraper`、`apify/threads-scraper`），這類 Actor 內建防 Ban 繞過與代理輪替。
  - **額度限制**：
    - **頻率降低**：Dcard, IG, Threads 的爬取從原先的每 4 小時執行，改為每日一次或每週一次。
    - **限制數量**：呼叫 Actor 時，必須傳入 `maxItems` 或 `limit` 參數，限制抓取量在 **10 筆** 以內。
    - **立即存取**：任務完成後，必須立即在 Python 腳本中讀取 Dataset，對圖片計算 pHash 去重，上傳 Cloudflare R2，並將 meta 寫入 Neon Database。

---

## 2. 額度防護程式碼 (Python)

在發起任何 Apify 請求前，必須先驗證帳戶剩餘額度：

```python
from apify_client import ApifyClient

APIFY_API_KEY = "apify_api_jkoqZcARggDuvixgmztr5Ur6aRylIH0bdVCl"
client = ApifyClient(APIFY_API_KEY)

def check_apify_budget_safe() -> bool:
    try:
        # 獲取帳戶當月使用量
        me = client.users().get()
        free_limit = 5.0  # $5 USD
        current_usage = me.get("usage", {}).get("totalUsd", 0.0)
        
        # 剩餘額度不足 $0.5 時拒絕執行
        if (free_limit - current_usage) < 0.5:
            print(f"[Apify Guard] 剩餘額度不足 (${free_limit - current_usage:.2f} USD). 跳過此爬蟲任務。")
            return False
        return True
    except Exception as e:
        print(f"[Apify Guard] 檢查帳戶額度失敗: {e}")
        return False
```
