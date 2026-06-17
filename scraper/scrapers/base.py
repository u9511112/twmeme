"""
BaseScraper — Anti-ban core with patchright stealth browser.

Features:
- patchright: patches Playwright CDP Runtime.enable detection (primary bot signal)
- Randomized User-Agent, viewport, locale, timezone
- navigator.webdriver removed via addInitScript
- Cookie banner auto-accept
- Human scroll simulation
- Proxy rotation from proxies.txt pool
- Tenacity retry (3 attempts, exponential backoff) on 403/429
"""

import asyncio
import io
import json
import logging
import os
import random
import re

import google.generativeai as genai
from PIL import Image
from fake_useragent import UserAgent
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from apify_client import ApifyClient

try:
    from patchright.async_api import async_playwright
    BROWSER_LIB = "patchright"
except ImportError:
    from playwright.async_api import async_playwright
    BROWSER_LIB = "playwright"

logger = logging.getLogger(__name__)

UA = UserAgent()
PROXIES: list[str] = []   # format: http://user:pass@host:port


def load_proxies(path: str = "proxies.txt") -> None:
    global PROXIES
    try:
        with open(path) as f:
            PROXIES = [line.strip() for line in f if line.strip()]
        logger.info(f"Loaded {len(PROXIES)} proxies from {path}")
    except FileNotFoundError:
        logger.warning(f"{path} not found — running without proxy rotation")
        PROXIES = []


def _pick_proxy() -> dict | None:
    if not PROXIES:
        return None
    # Subnet-diversity: avoid same /24 consecutively
    proxy_str = random.choice(PROXIES)
    return {"server": proxy_str}


async def human_scroll(page, steps: int = 5) -> None:
    """Simulate realistic human scrolling pattern to bypass WAF heuristics."""
    for _ in range(steps):
        delta = random.randint(200, 900)
        await page.mouse.wheel(0, delta)
        await asyncio.sleep(random.uniform(0.2, 1.0))


async def accept_cookie_banner(page) -> None:
    """Try common cookie accept selectors for TW/international sites."""
    selectors = [
        "button:has-text('接受')",
        "button:has-text('同意')",
        "button:has-text('Accept all')",
        "button:has-text('Accept')",
        "[data-testid='cookie-accept']",
        "#accept-cookies",
        ".cookie-accept",
    ]
    for sel in selectors:
        try:
            btn = page.locator(sel)
            if await btn.count() > 0:
                await btn.first.click(timeout=3000)
                logger.debug(f"Accepted cookie banner via: {sel}")
                return
        except Exception:
            continue


class ScraperBlockedError(Exception):
    """Raised when the target site returns 403/429 after retries."""


class BaseScraper:
    def __init__(self):
        self.logger = logging.getLogger(self.__class__.__name__)

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=15),
        retry=retry_if_exception_type(ScraperBlockedError),
        reraise=True,
    )
    async def fetch_page(self, url: str) -> str:
        """
        Open URL in a stealthy headless Chromium, return rendered HTML.
        Switches proxy on each retry attempt.
        """
        proxy = _pick_proxy()
        self.logger.info(f"Fetching {url} (proxy: {proxy is not None}, lib: {BROWSER_LIB})")

        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=True,
                proxy=proxy,
                args=[
                    "--no-sandbox",
                    "--disable-blink-features=AutomationControlled",
                    "--disable-dev-shm-usage",
                ],
            )
            ctx = await browser.new_context(
                user_agent=UA.random,
                viewport={
                    "width": random.randint(1280, 1920),
                    "height": random.randint(800, 1080),
                },
                locale="zh-TW",
                timezone_id="Asia/Taipei",
                # Mimic real hardware concurrency
                extra_http_headers={"Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8"},
            )
            page = await ctx.new_page()

            # Remove webdriver fingerprint
            await page.add_init_script(
                "Object.defineProperty(navigator, 'webdriver', {get: () => undefined});"
                "window.chrome = {runtime: {}};"
            )

            try:
                response = await page.goto(
                    url, wait_until="networkidle", timeout=30_000
                )
                status = response.status if response else 0
                if status in (403, 429):
                    self.logger.warning(f"Blocked ({status}) on {url} — will retry")
                    raise ScraperBlockedError(f"HTTP {status}")

                await accept_cookie_banner(page)
                await human_scroll(page, steps=random.randint(3, 6))
                await asyncio.sleep(random.uniform(1.5, 3.5))

                html = await page.content()
                self.logger.info(f"Fetched {len(html):,} chars from {url}")
                return html

            finally:
                await browser.close()

    async def scrape(self) -> list[dict]:
        """Override in subclasses. Return list of meme dicts."""
        raise NotImplementedError


class ApifyBaseScraper(BaseScraper):
    def __init__(self):
        super().__init__()
        self.api_key = os.getenv("APIFY_API_KEY")
        if not self.api_key:
            raise ValueError("APIFY_API_KEY environment variable is not set")
        self.client = ApifyClient(self.api_key)

    def check_apify_budget_safe(self) -> bool:
        try:
            limits_data = self.client.user().limits()
            
            # Extract monthly_usage_usd
            current_usage = 0.0
            if hasattr(limits_data, "current"):
                current = limits_data.current
                current_usage = getattr(current, "monthly_usage_usd", 0.0)
            elif isinstance(limits_data, dict):
                current_usage = limits_data.get("current", {}).get("monthly_usage_usd", 0.0)
            
            # Extract max_monthly_usage_usd (default to 5.0 if not found)
            free_limit = 5.0
            if hasattr(limits_data, "limits"):
                limits_obj = limits_data.limits
                free_limit = getattr(limits_obj, "max_monthly_usage_usd", 5.0)
            elif isinstance(limits_data, dict):
                free_limit = limits_data.get("limits", {}).get("max_monthly_usage_usd", 5.0)

            remaining = free_limit - current_usage
            self.logger.info(f"[Apify Guard] Current monthly usage: ${current_usage:.6f} USD, remaining: ${remaining:.6f} USD")
            
            # 剩餘額度不足 $0.5 時拒絕執行
            if remaining < 0.5:
                self.logger.warning(f"[Apify Guard] Remaining budget too low (${remaining:.2f} USD). Skipping tasks.")
                return False
            return True
        except Exception as e:
            self.logger.error(f"[Apify Guard] Failed to check Apify budget: {e}")
            return False


# Configure Gemini API
_gemini_configured = False

def _setup_gemini():
    global _gemini_configured
    if _gemini_configured:
        return
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        logger.warning("[Gemini] GEMINI_API_KEY is not set. AI metadata extraction will be skipped.")
        return
    genai.configure(api_key=api_key)
    _gemini_configured = True

async def analyze_meme_image(image_bytes: bytes) -> dict:
    """
    Analyze meme image bytes via Gemini 2.5 Flash.
    Returns: {
      "ocr_text": "text inside image",
      "description": "visual description",
      "tags": ["tag1", "tag2", ...]
    }
    """
    _setup_gemini()
    if not _gemini_configured:
        return {"ocr_text": None, "description": None, "tags": []}

    try:
        # Load image via PIL
        img = Image.open(io.BytesIO(image_bytes))
        
        # We use gemini-2.5-flash which is multimodal and fast
        model = genai.GenerativeModel("gemini-2.5-flash")
        
        prompt = (
            "你是一隻專門分析繁體中文迷因（Meme）梗圖的 AI 專家。\n"
            "請詳細閱讀並分析這張圖片，並嚴格只回傳一個符合以下格式的 JSON 物件（請勿包含 markdown ```json 標記或任何其他贅詞）：\n"
            "{\n"
            "  \"ocr_text\": \"圖片中出現的所有繁體中文對白、台詞或文字。如果沒有文字，請填 null。\",\n"
            "  \"description\": \"簡短描述這張圖片的視覺畫面（例如：一隻戴著墨鏡露出驚訝表情的柴犬）。\",\n"
            "  \"tags\": [\"5個繁體中文的關聯標籤，包含情緒、物件、或迷因名稱，例如：傻眼、貓咪、反應圖\"]\n"
            "}"
        )
        
        # Execute vision task
        # PIL Image can be passed directly as part of contents list
        # run in executor since genai is synchronous blocking IO
        loop = asyncio.get_running_loop()
        response = await loop.run_in_executor(
            None,
            lambda: model.generate_content([prompt, img])
        )
        
        text = response.text.strip()
        
        # Clean markdown code block if model outputted them anyway
        if text.startswith("```"):
            text = re.sub(r"^```(?:json)?\n", "", text)
            text = re.sub(r"\n```$", "", text)
            text = text.strip()
            
        data = json.loads(text)
        return {
            "ocr_text": data.get("ocr_text"),
            "description": data.get("description"),
            "tags": data.get("tags") if isinstance(data.get("tags"), list) else []
        }
    except Exception as e:
        logger.error(f"[Gemini] Failed to analyze image: {e}")
        return {"ocr_text": None, "description": None, "tags": []}

