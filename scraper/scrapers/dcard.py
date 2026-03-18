"""
Dcard Scraper — uses the public Dcard v2 API.

No auth required. Rate limit ~30 req/min — we add random sleep.
Targets meme-adjacent forums and fetches popular posts with media.
"""

import asyncio
import logging
import random

import aiohttp

from .base import BaseScraper

logger = logging.getLogger(__name__)

DCARD_API  = "https://www.dcard.tw/service/api/v2"
DCARD_WEB  = "https://www.dcard.tw"
FORUMS     = ["meme", "funny", "joke", "trending"]


class DcardScraper(BaseScraper):
    async def scrape(self) -> list[dict]:
        results: list[dict] = []
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Linux; Android 13; Pixel 7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/122.0.6261.119 Mobile Safari/537.36"
            ),
            "Referer": DCARD_WEB,
        }
        async with aiohttp.ClientSession(headers=headers) as session:
            for forum in FORUMS:
                try:
                    items = await self._scrape_forum(session, forum)
                    results.extend(items)
                    logger.info(f"Dcard/{forum}: {len(items)} items")
                except Exception as e:
                    logger.error(f"Dcard/{forum} failed: {e}")
                await asyncio.sleep(random.uniform(1.5, 3.0))
        return results

    async def _scrape_forum(
        self, session: aiohttp.ClientSession, forum: str
    ) -> list[dict]:
        url = f"{DCARD_API}/forums/{forum}/posts?popular=true&limit=30"
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=15)) as r:
            if r.status != 200:
                logger.warning(f"Dcard API {forum} returned HTTP {r.status}")
                return []
            posts = await r.json()

        items: list[dict] = []
        for post in posts:
            post_id   = post.get("id", "")
            title     = post.get("title", "")
            like_count    = post.get("likeCount", 0)
            comment_count = post.get("commentCount", 0)
            share_count   = post.get("shareCount", 0)
            source_url    = f"{DCARD_WEB}/f/{forum}/p/{post_id}"

            for media in post.get("media", []):
                media_url  = media.get("url") or media.get("normalUrl") or ""
                if not media_url:
                    continue
                media_type = "video" if media.get("type") == "video" else "image"
                # Dcard GIFs come through as image type
                if media_url.lower().endswith(".gif"):
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
