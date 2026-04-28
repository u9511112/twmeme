"""
Dcard Scraper — uses patchright browser with API interception.

Dcard is protected by Cloudflare WAF. We launch a stealth browser,
let it handle the Cloudflare challenge, then intercept the internal
API calls the page makes to get structured JSON post data.
"""

import asyncio
import json
import logging
import random
import re

from .base import BaseScraper, _pick_proxy, human_scroll, accept_cookie_banner, UA, ScraperBlockedError

try:
    from patchright.async_api import async_playwright
except ImportError:
    from playwright.async_api import async_playwright

logger = logging.getLogger(__name__)

DCARD_WEB = "https://www.dcard.tw"
FORUMS    = ["meme", "funny", "joke", "trending"]


class DcardScraper(BaseScraper):
    async def scrape(self) -> list[dict]:
        results: list[dict] = []
        for forum in FORUMS:
            try:
                items = await self._scrape_forum_via_browser(forum)
                results.extend(items)
                logger.info(f"Dcard/{forum}: {len(items)} items")
            except Exception as e:
                logger.error(f"Dcard/{forum} failed: {e}")
            await asyncio.sleep(random.uniform(2.0, 4.0))
        return results

    async def _scrape_forum_via_browser(self, forum: str) -> list[dict]:
        """Load Dcard forum in browser, intercept API responses for post data."""
        url = f"{DCARD_WEB}/f/{forum}?tab=popular"
        captured_posts: list[dict] = []

        proxy = _pick_proxy()
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
                extra_http_headers={"Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8"},
            )
            page = await ctx.new_page()

            await page.add_init_script(
                "Object.defineProperty(navigator, 'webdriver', {get: () => undefined});"
                "window.chrome = {runtime: {}};"
            )

            # Intercept API responses to capture post JSON
            async def on_response(response):
                resp_url = response.url
                # Dcard's internal API calls for posts
                if "/api/v2/" in resp_url and "posts" in resp_url:
                    try:
                        body = await response.json()
                        if isinstance(body, list):
                            captured_posts.extend(body)
                        elif isinstance(body, dict) and "posts" in body:
                            captured_posts.extend(body["posts"])
                    except Exception:
                        pass

            page.on("response", on_response)

            try:
                response = await page.goto(url, wait_until="networkidle", timeout=45_000)
                status = response.status if response else 0
                if status in (403, 429):
                    logger.warning(f"Dcard/{forum} blocked ({status})")
                    raise ScraperBlockedError(f"HTTP {status}")

                await accept_cookie_banner(page)
                await human_scroll(page, steps=random.randint(4, 8))
                await asyncio.sleep(random.uniform(2.0, 4.0))

                # If no API data captured, try parsing the rendered HTML
                if not captured_posts:
                    html = await page.content()
                    logger.info(f"Dcard/{forum}: no API data intercepted, parsing HTML ({len(html):,} chars)")
                    return self._parse_html(html, forum)

            finally:
                await browser.close()

        # Convert captured API posts to our format
        items: list[dict] = []
        for post in captured_posts:
            items.extend(self._post_to_items(post, forum))
        return items

    def _parse_html(self, html: str, forum: str) -> list[dict]:
        """Fallback: extract media from rendered HTML."""
        from bs4 import BeautifulSoup
        items: list[dict] = []
        soup = BeautifulSoup(html, "html.parser")

        # Try __NEXT_DATA__
        script_el = soup.select_one("script#__NEXT_DATA__")
        if script_el and script_el.string:
            try:
                data = json.loads(script_el.string)
                posts = self._find_posts_in_json(data)
                for post in posts:
                    items.extend(self._post_to_items(post, forum))
                if items:
                    return items
            except (json.JSONDecodeError, KeyError) as e:
                logger.debug(f"Dcard __NEXT_DATA__ parse: {e}")

        # Try all script tags for embedded JSON
        for script in soup.select("script"):
            text = script.string or ""
            if '"media"' not in text or '"title"' not in text:
                continue
            # Try to find JSON arrays
            for match in re.finditer(r'\[(\{[^{]*?"id"\s*:\s*\d+.*?\})\]', text, re.S):
                try:
                    arr = json.loads(f"[{match.group(1)}]")
                    for post in arr:
                        if "id" in post and "title" in post:
                            items.extend(self._post_to_items(post, forum))
                except json.JSONDecodeError:
                    pass

        # Extract images from visible cards
        if not items:
            for a in soup.select("a[href*='/f/'][href*='/p/']"):
                href = a.get("href", "")
                source_url = DCARD_WEB + href if href.startswith("/") else href
                parent = a.find_parent(["article", "div"])
                if not parent:
                    continue
                for img in parent.select("img[src]"):
                    src = img.get("src", "")
                    if not src or "avatar" in src or "emoji" in src:
                        continue
                    if re.search(r"\.(jpg|jpeg|png|gif|webp)", src, re.I):
                        items.append({
                            "platform":      "dcard",
                            "source_url":    source_url,
                            "media_url":     src,
                            "media_type":    "gif" if src.lower().endswith(".gif") else "image",
                            "title":         a.get_text(strip=True)[:100],
                            "like_count":    0,
                            "share_count":   0,
                            "comment_count": 0,
                        })

        return items

    def _find_posts_in_json(self, obj, depth=0) -> list[dict]:
        """Recursively find arrays of post objects in nested JSON."""
        if depth > 6:
            return []
        if isinstance(obj, list) and obj:
            if isinstance(obj[0], dict) and "id" in obj[0] and ("title" in obj[0] or "media" in obj[0]):
                return obj
        if isinstance(obj, dict):
            for v in obj.values():
                result = self._find_posts_in_json(v, depth + 1)
                if result:
                    return result
        return []

    def _post_to_items(self, post: dict, forum: str) -> list[dict]:
        """Convert a Dcard post dict to our item format."""
        items = []
        post_id       = post.get("id", "")
        title         = post.get("title", "")
        like_count    = post.get("likeCount", 0)
        comment_count = post.get("commentCount", 0)
        share_count   = post.get("shareCount", 0)
        source_url    = f"{DCARD_WEB}/f/{forum}/p/{post_id}"

        for media in post.get("media", []):
            media_url = media.get("url") or media.get("normalUrl") or ""
            if not media_url:
                continue
            media_type = "image"
            if media.get("type") == "video":
                media_type = "video"
            elif media_url.lower().endswith(".gif"):
                media_type = "gif"

            items.append({
                "platform":      "dcard",
                "source_url":    source_url,
                "media_url":     media_url,
                "media_type":    media_type,
                "title":         title,
                "like_count":    like_count,
                "share_count":   share_count,
                "comment_count": comment_count,
            })

        return items
