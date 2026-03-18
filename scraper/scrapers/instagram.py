"""
Instagram Scraper — browser automation via patchright (stealth).

Instagram is the most aggressively protected platform.
Strategy: scrape public hashtag pages without login.
Without residential proxies, success rate is low (~30%).

We intercept the `api/v1/tags/{hashtag}/sections/` endpoint which
returns structured JSON with media URLs, avoiding brittle HTML parsing.
"""

import asyncio
import json
import logging
import random

from .base import BaseScraper, async_playwright

logger = logging.getLogger(__name__)

IG_HASHTAGS = ["台灣迷因", "迷因", "幹話tw", "台灣funny"]
IG_BASE     = "https://www.instagram.com"


class InstagramScraper(BaseScraper):
    async def scrape(self) -> list[dict]:
        results: list[dict] = []
        for tag in IG_HASHTAGS:
            try:
                items = await self._scrape_hashtag(tag)
                results.extend(items)
                logger.info(f"IG/#{tag}: {len(items)} items")
            except Exception as e:
                logger.error(f"IG/#{tag} failed: {e}")
            await asyncio.sleep(random.uniform(5.0, 10.0))
        return results

    async def _scrape_hashtag(self, tag: str) -> list[dict]:
        url = f"{IG_BASE}/explore/tags/{tag}/"
        captured: list[dict] = []

        async with async_playwright() as p:
            from .base import _pick_proxy, UA
            proxy = _pick_proxy()
            browser = await p.chromium.launch(
                headless=True,
                proxy=proxy,
                args=["--no-sandbox", "--disable-blink-features=AutomationControlled"],
            )
            ctx = await browser.new_context(
                user_agent=UA.random,
                viewport={"width": 390, "height": 844},  # iPhone 14 Pro
                locale="zh-TW",
                timezone_id="Asia/Taipei",
                is_mobile=True,
                has_touch=True,
            )
            page = await ctx.new_page()
            await page.add_init_script(
                "Object.defineProperty(navigator, 'webdriver', {get: () => undefined});"
                "Object.defineProperty(navigator, 'plugins', {get: () => [1,2,3]});"
            )

            async def handle_response(response):
                try:
                    if "api/v1/tags/" in response.url or "graphql/query" in response.url:
                        text = await response.text()
                        self._parse_api_response(text, tag, captured)
                except Exception:
                    pass

            page.on("response", handle_response)

            try:
                await page.goto(url, wait_until="networkidle", timeout=35_000)
                await asyncio.sleep(random.uniform(3.0, 6.0))
                for _ in range(4):
                    await page.touch_screen.tap(195, 400)
                    await page.mouse.wheel(0, random.randint(300, 600))
                    await asyncio.sleep(random.uniform(1.5, 3.0))
            except Exception as e:
                logger.warning(f"IG page load error for #{tag}: {e}")
            finally:
                await browser.close()

        return captured

    def _parse_api_response(
        self, text: str, tag: str, captured: list[dict]
    ) -> None:
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            return

        def extract(obj):
            if isinstance(obj, dict):
                # Image node
                if "display_url" in obj:
                    captured.append({
                        "platform":      "instagram",
                        "source_url":    f"{IG_BASE}/explore/tags/{tag}/",
                        "media_url":     obj["display_url"],
                        "media_type":    "image",
                        "title":         obj.get("accessibility_caption") or f"#{tag}",
                        "like_count":    obj.get("edge_liked_by", {}).get("count", 0),
                        "comment_count": obj.get("edge_media_to_comment", {}).get("count", 0),
                        "share_count":   0,
                    })
                # Video node
                if obj.get("is_video") and "video_url" in obj:
                    captured.append({
                        "platform":      "instagram",
                        "source_url":    f"{IG_BASE}/explore/tags/{tag}/",
                        "media_url":     obj["video_url"],
                        "media_type":    "video",
                        "title":         f"#{tag}",
                        "like_count":    obj.get("edge_liked_by", {}).get("count", 0),
                        "comment_count": obj.get("edge_media_to_comment", {}).get("count", 0),
                        "share_count":   0,
                    })
                for v in obj.values():
                    extract(v)
            elif isinstance(obj, list):
                for item in obj:
                    extract(item)

        extract(data)
