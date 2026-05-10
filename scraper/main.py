"""
TWmeme — Scraper Orchestrator

Usage:
    python main.py                                   # default: ptt dcard
    python main.py --platforms ptt dcard
    python main.py --platforms threads instagram     # needs residential proxies

Environment variables (set in .env or GitHub Actions secrets):
    SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY
"""

import argparse
import asyncio
import logging
import sys
from pathlib import Path

from dotenv import load_dotenv

# Load .env before importing scrapers that use env vars
load_dotenv(Path(__file__).parent / ".env")

from scrapers.base import load_proxies
from scrapers.ptt import PTTScraper
from scrapers.dcard import DcardScraper
from scrapers.threads import ThreadsScraper
from scrapers.instagram import InstagramScraper
from pipeline.dedup import compute_phash
from pipeline.uploader import get_client, insert_meme

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("orchestrator")

SCRAPER_MAP = {
    "ptt":       PTTScraper,
    "dcard":     DcardScraper,
    "threads":   ThreadsScraper,
    "instagram": InstagramScraper,
}

# Threads/IG need residential proxies to be reliable (~30-50% without).
# Run them explicitly via --platforms when you have proxies set up.
DEFAULT_PLATFORMS = ["ptt", "dcard"]


async def process_item(client, item: dict) -> bool:
    """Compute pHash and insert one meme. Returns True if inserted."""
    media_url  = item.get("media_url", "")
    media_type = item.get("media_type", "image")
    if not media_url:
        return False

    phash = await compute_phash(media_url, media_type)
    if not phash:
        logger.debug(f"pHash failed, skipping: {media_url[:60]}")
        return False

    result = await insert_meme(client, item, phash)
    return result is not None


async def run(platforms: list[str]) -> None:
    load_proxies("proxies.txt")
    client = get_client()

    total_seen     = 0
    total_inserted = 0

    for name in platforms:
        cls = SCRAPER_MAP.get(name)
        if cls is None:
            logger.warning(f"Unknown platform: {name}")
            continue

        scraper = cls()
        logger.info(f"=== Scraping: {name} ===")
        try:
            items = await scraper.scrape()
        except Exception as e:
            logger.error(f"{name} scraper crashed: {e}")
            continue

        logger.info(f"{name}: {len(items)} items fetched")
        total_seen += len(items)

        for item in items:
            inserted = await process_item(client, item)
            if inserted:
                total_inserted += 1

        logger.info(f"{name}: inserted {total_inserted}/{total_seen} so far")

    logger.info(
        f"=== Done: {total_inserted} new memes inserted out of {total_seen} seen ==="
    )


def main():
    parser = argparse.ArgumentParser(description="MemeMaster TW Scraper")
    parser.add_argument(
        "--platforms",
        nargs="+",
        default=DEFAULT_PLATFORMS,
        choices=list(SCRAPER_MAP.keys()),
        help="Platforms to scrape (default: ptt dcard; threads/instagram need residential proxies)",
    )
    args = parser.parse_args()
    asyncio.run(run(args.platforms))


if __name__ == "__main__":
    main()
