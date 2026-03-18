"""
Threads Scraper — browser automation via patchright (stealth).

Threads loads content via XHR after initial JS hydration.
We intercept network responses to capture the GraphQL API payload
instead of parsing HTML, which is more resilient to layout changes.

Note: Threads/Meta actively fights scrapers. Residential proxies
significantly improve success rate. Without proxies, expect ~50% success.
"""

import asyncio
import json
import logging
import random
import re

from .base import BaseScraper, async_playwright

logger = logging.getLogger(__name__)

THREADS_TAGS = ["台灣迷因", "迷因", "幹話", "台灣funny"]
THREADS_BASE = "https://www.threads.net"


class ThreadsScraper(BaseScraper):
    async def scrape(self) -> list[dict]:
        results: list[dict] = []
        for tag in THREADS_TAGS:
            try:
                items = await self._scrape_tag(tag)
                results.extend(items)
                logger.info(f"Threads/#{tag}: {len(items)} items")
            except Exception as e:
                logger.error(f"Threads/#{tag} failed: {e}")
            await asyncio.sleep(random.uniform(3.0, 6.0))
        return results

    async def _scrape_tag(self, tag: str) -> list[dict]:
        url = f"{THREADS_BASE}/search?q={tag}&type=posts"
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
                viewport={"width": random.randint(390, 430), "height": 844},  # mobile
                locale="zh-TW",
                timezone_id="Asia/Taipei",
            )
            page = await ctx.new_page()
            await page.add_init_script(
                "Object.defineProperty(navigator, 'webdriver', {get: () => undefined});"
            )

            # Intercept GraphQL responses
            async def handle_response(response):
                try:
                    if "graphql" in response.url or "api/graphql" in response.url:
                        text = await response.text()
                        self._parse_graphql_response(text, tag, captured)
                except Exception:
                    pass

            page.on("response", handle_response)

            try:
                await page.goto(url, wait_until="networkidle", timeout=30_000)
                await asyncio.sleep(random.uniform(2.0, 4.0))
                # Scroll to trigger lazy-loading
                for _ in range(3):
                    await page.mouse.wheel(0, random.randint(400, 700))
                    await asyncio.sleep(random.uniform(1.0, 2.0))
            except Exception as e:
                logger.warning(f"Threads page load error: {e}")
            finally:
                await browser.close()

        # Fallback: regex parse raw HTML if no API captured
        if not captured:
            try:
                html = await self.fetch_page(url)
                captured.extend(self._parse_html_fallback(html, tag))
            except Exception as e:
                logger.warning(f"Threads HTML fallback failed: {e}")

        return captured

    def _parse_graphql_response(
        self, text: str, tag: str, captured: list[dict]
    ) -> None:
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            return

        # Traverse nested JSON for image_versions2 / video_versions patterns
        def extract(obj):
            if isinstance(obj, dict):
                # Image
                if "image_versions2" in obj:
                    candidates = obj["image_versions2"].get("candidates", [])
                    if candidates:
                        best = max(candidates, key=lambda c: c.get("width", 0))
                        url  = best.get("url", "")
                        if url:
                            captured.append({
                                "platform":   "threads",
                                "source_url": f"https://www.threads.net/search?q={tag}",
                                "media_url":  url,
                                "media_type": "image",
                                "title":      obj.get("accessibility_caption") or f"#{tag}",
                                "like_count": obj.get("like_count", 0),
                                "share_count": 0,
                                "comment_count": obj.get("text_post_app_info", {})
                                    .get("direct_reply_count", 0),
                            })
                # Video
                if "video_versions" in obj:
                    vids = obj.get("video_versions", [])
                    if vids:
                        captured.append({
                            "platform":   "threads",
                            "source_url": f"https://www.threads.net/search?q={tag}",
                            "media_url":  vids[0].get("url", ""),
                            "media_type": "video",
                            "title":      f"#{tag}",
                            "like_count": obj.get("like_count", 0),
                            "share_count": 0,
                            "comment_count": 0,
                        })
                for v in obj.values():
                    extract(v)
            elif isinstance(obj, list):
                for item in obj:
                    extract(item)

        extract(data)

    def _parse_html_fallback(self, html: str, tag: str) -> list[dict]:
        """Last resort: extract media URLs via regex from rendered HTML."""
        results = []
        for m in re.finditer(r'"(https://scontent[^"]+\.(?:jpg|jpeg|png|webp))"', html):
            url = m.group(1).replace("\\u0026", "&")
            results.append({
                "platform":    "threads",
                "source_url":  f"https://www.threads.net/search?q={tag}",
                "media_url":   url,
                "media_type":  "image",
                "title":       f"#{tag}",
                "like_count":  0,
                "share_count": 0,
                "comment_count": 0,
            })
        return results[:10]  # cap fallback results
