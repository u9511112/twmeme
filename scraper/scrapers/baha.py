# -*- coding: utf-8 -*-
"""
Baha Scraper — uses plain aiohttp.
Scrapes Gamer forum (bsn=60076: 場外休憩區) list and extracts image URLs.
"""

import asyncio
import logging
import random
import os
import re
import aiohttp
from bs4 import BeautifulSoup

from .base import BaseScraper

logger = logging.getLogger(__name__)

BAHA_BASE = "https://forum.gamer.com.tw"
BAHA_FORUM_URL = f"{BAHA_BASE}/B.php?bsn=60076"

# Valid image extension pattern
IMG_PATTERN = re.compile(r"\.(jpg|jpeg|png|gif|webp)$", re.I)
# Excluded sub-strings (avatars, layout elements, emojis, official gamer graphics)
EXCLUDE_PATTERN = re.compile(r"(i2\.bahamut\.com\.tw|face/|avatar/|ad/|css/|images/)", re.I)

class BahaScraper(BaseScraper):
    def __init__(self, pages: int = 3):
        super().__init__()
        self.pages = pages
        
    async def scrape(self) -> list[dict]:
        bahasid = os.getenv("BAHASID")
        if not bahasid:
            logger.warning("BAHASID environment variable is not set. Skipping Bahamut scraper to avoid Age Gate block.")
            return []

        results: list[dict] = []
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/125.0.0.0 Safari/537.36"
            ),
            "Referer": BAHA_BASE
        }
        
        cookies = {"BAHASID": bahasid}
        async with aiohttp.ClientSession(headers=headers, cookies=cookies) as session:
            # Scrape self.pages pages
            for page in range(1, self.pages + 1):
                url = f"{BAHA_FORUM_URL}&page={page}"
                try:
                    items = await self._scrape_page(session, url)
                    results.extend(items)
                    logger.info(f"Baha Scraper: fetched {len(items)} items from page {page}")
                except Exception as e:
                    logger.error(f"Baha Scraper failed on page {page}: {e}")
                await asyncio.sleep(random.uniform(1.5, 3.0))
                
        return results
        
    async def _scrape_page(self, session: aiohttp.ClientSession, url: str) -> list[dict]:
        items: list[dict] = []
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=15)) as r:
            if r.status != 200:
                logger.warning(f"Baha Scraper: HTTP {r.status} on {url}")
                return []
            html = await r.text()
            
        soup = BeautifulSoup(html, "html.parser")
        rows = soup.select(".b-list__row")
        
        for row in rows:
            # 1. Skip sticky posts (pinned posts)
            if "b-list__row--top" in row.get("class", []):
                continue
                
            # 2. Get title and post link
            title_el = row.select_one(".b-list__main__title")
            if not title_el:
                continue
                
            post_url = BAHA_BASE + "/" + title_el.get("href", "").strip()
            title = title_el.text.strip()
            
            # 3. Parse GP (like_count)
            gp_el = row.select_one(".b-list__summary__gp")
            gp_text = gp_el.text.strip() if gp_el else "0"
            
            like_count = 0
            # GP count normally is 'GP 10', 'GP 100', 'GP 1.2k'
            match = re.search(r"(\d+(\.\d+)?)", gp_text)
            if match:
                val = float(match.group(1))
                if "k" in gp_text.lower():
                    val *= 1000
                like_count = int(val)
                    
            try:
                # 4. Extract image media inside the post detail page
                media_urls = await self._extract_post_images(session, post_url)
                for img_url in media_urls:
                    items.append({
                        "platform": "baha",
                        "source_url": post_url,
                        "media_url": img_url,
                        "media_type": "gif" if img_url.lower().endswith(".gif") else "image",
                        "title": title,
                        "like_count": like_count,
                        "share_count": 0,
                        "comment_count": 0
                    })
            except Exception as e:
                logger.debug(f"Failed to extract images from {post_url}: {e}")
                
            await asyncio.sleep(random.uniform(0.5, 1.2))
            
        return items
        
    async def _extract_post_images(self, session: aiohttp.ClientSession, url: str) -> list[str]:
        images: list[str] = []
        seen: set[str] = set()
        
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=15)) as r:
            if r.status != 200:
                return []
            html = await r.text()
            
        soup = BeautifulSoup(html, "html.parser")
        post_content = soup.select_one(".c-post__body__content")
        if not post_content:
            return []
            
        imgs = post_content.select("img")
        for img in imgs:
            img_url = img.get("data-src") or img.get("src") or ""
            img_url = img_url.strip()
            
            if not img_url.startswith("http"):
                continue
                
            if not IMG_PATTERN.search(img_url):
                continue
                
            if EXCLUDE_PATTERN.search(img_url):
                continue
                
            if img_url in seen:
                continue
                
            seen.add(img_url)
            images.append(img_url)
            
        return images
