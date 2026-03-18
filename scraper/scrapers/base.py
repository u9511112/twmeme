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
import logging
import random

from fake_useragent import UserAgent
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

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
