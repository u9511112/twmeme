"""
PTT Scraper — uses plain aiohttp (no browser needed).

PTT's web interface is server-rendered HTML, no JS required.
We pass the over18=1 cookie to bypass the age gate.
Extracts media links (images/videos) from post content.
"""

import asyncio
import logging
import random
import re

import aiohttp
from bs4 import BeautifulSoup

from .base import BaseScraper

logger = logging.getLogger(__name__)

PTT_BASE    = "https://www.ptt.cc"
PTT_BOARDS  = ["Memes", "funny", "joke", "StupidClown"]

# Image/video URL patterns found in PTT posts
IMG_PATTERN  = re.compile(r"\.(jpg|jpeg|png|gif|webp)$", re.I)
VID_PATTERN  = re.compile(r"\.(mp4|webm|mov)$", re.I)
IMGUR_GIFV   = re.compile(r"https?://i\.imgur\.com/\S+\.gifv", re.I)


class PTTScraper(BaseScraper):
    async def scrape(self) -> list[dict]:
        results: list[dict] = []
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/122.0.0.0 Safari/537.36"
            )
        }
        async with aiohttp.ClientSession(
            cookies={"over18": "1"}, headers=headers
        ) as session:
            for board in PTT_BOARDS:
                url = f"{PTT_BASE}/bbs/{board}/index.html"
                try:
                    items = await self._scrape_board(session, url, board)
                    results.extend(items)
                    logger.info(f"PTT/{board}: {len(items)} items")
                except Exception as e:
                    logger.error(f"PTT/{board} failed: {e}")
                await asyncio.sleep(random.uniform(1.0, 2.5))
        return results

    async def _scrape_board(
        self, session: aiohttp.ClientSession, url: str, board: str
    ) -> list[dict]:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=15)) as r:
            html = await r.text()

        soup = BeautifulSoup(html, "html.parser")
        items: list[dict] = []

        for row in soup.select(".r-ent"):
            title_el = row.select_one(".title a")
            if not title_el:
                continue

            # Parse push count
            nrec_el = row.select_one(".nrec span")
            nrec_text = nrec_el.text.strip() if nrec_el else "0"
            try:
                like_count = int(nrec_text) if nrec_text.isdigit() else 0
            except ValueError:
                like_count = 0

            post_url = PTT_BASE + title_el["href"]
            title    = title_el.text.strip()

            try:
                media_list = await self._extract_media(session, post_url)
                for m in media_list:
                    items.append({
                        "platform":    "ptt",
                        "source_url":  post_url,
                        "media_url":   m["url"],
                        "media_type":  m["type"],
                        "title":       title,
                        "like_count":  like_count,
                        "share_count": 0,
                        "comment_count": 0,
                    })
            except Exception as e:
                logger.debug(f"PTT post {post_url}: {e}")

            await asyncio.sleep(random.uniform(0.3, 0.8))

        return items

    async def _extract_media(
        self, session: aiohttp.ClientSession, url: str
    ) -> list[dict]:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=15)) as r:
            html = await r.text()

        soup  = BeautifulSoup(html, "html.parser")
        media: list[dict] = []
        seen:  set[str]   = set()

        for a in soup.select(".content a[href]"):
            href = a["href"].strip()
            if href in seen:
                continue
            seen.add(href)

            if IMG_PATTERN.search(href):
                mtype = "gif" if href.lower().endswith(".gif") else "image"
                media.append({"url": href, "type": mtype})
            elif VID_PATTERN.search(href):
                media.append({"url": href, "type": "video"})
            elif IMGUR_GIFV.match(href):
                # .gifv → convert to .mp4 for direct playback
                mp4_url = href.replace(".gifv", ".mp4")
                media.append({"url": mp4_url, "type": "video"})

        return media
