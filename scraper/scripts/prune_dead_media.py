"""Prune dead origin media_url rows by tagging them with 'hide-dead'.

Keeps the row and source_url in Neon so the scraper does not re-ingest broken links.
Usage:
    python scripts/prune_dead_media.py          # dry-run report only
    python scripts/prune_dead_media.py --apply  # tag confirmed dead rows with 'hide-dead'
"""

import argparse
import asyncio
import logging
import os
import sys
from collections import Counter
from pathlib import Path
from urllib.parse import urlparse

import aiohttp
import asyncpg
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("prune_dead_media")

EPHEMERAL_CDN_SUFFIXES = (".cdninstagram.com", ".fbcdn.net")
DEAD_HTTP_STATUSES = {403, 404, 410}
DEAD_ERRORS = {"ClientConnectorDNSError"}
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)


def is_ephemeral_cdn(url: str) -> bool:
    host = urlparse(url).netloc.lower()
    return any(host.endswith(s) or host == s.lstrip(".") for s in EPHEMERAL_CDN_SUFFIXES)


async def probe_url(sem: asyncio.Semaphore, session: aiohttp.ClientSession, url: str, use_get: bool = False):
    async with sem:
        try:
            if not use_get:
                async with session.head(url, allow_redirects=True) as r:
                    if r.status not in (400, 403, 405):
                        return r.status
            async with session.get(url, headers={"Range": "bytes=0-255"}, allow_redirects=True) as gr:
                return gr.status
        except Exception as e:
            return type(e).__name__


def is_confirmed_dead(url: str, result) -> bool:
    if result in (200, 206):
        return False
    if is_ephemeral_cdn(url):
        return True
    return result in DEAD_HTTP_STATUSES or result in DEAD_ERRORS


async def main(apply: bool) -> None:
    db_url = os.environ.get("NEON_DATABASE_URL", "").strip()
    if not db_url:
        raise RuntimeError("NEON_DATABASE_URL is required")

    conn = await asyncpg.connect(db_url, statement_cache_size=0)
    try:
        rows = await conn.fetch(
            """
            SELECT id, media_url
            FROM public.memes
            WHERE NOT ('hide-dead' = ANY(COALESCE(tags, '{}')))
            """
        )
        logger.info(f"Checking {len(rows)} active memes...")

        fast_sem = asyncio.Semaphore(100)
        fast_timeout = aiohttp.ClientTimeout(total=8, connect=4)
        connector = aiohttp.TCPConnector(limit=120, ssl=False)
        async with aiohttp.ClientSession(
            timeout=fast_timeout, connector=connector, headers={"User-Agent": UA}
        ) as session:
            results = await asyncio.gather(*(probe_url(fast_sem, session, r["media_url"]) for r in rows))

        suspects = [(r, res) for r, res in zip(rows, results) if res not in (200, 206)]
        logger.info(f"First pass found {len(suspects)} non-200 URLs; rechecking at low concurrency...")

        recheck_sem = asyncio.Semaphore(6)
        recheck_timeout = aiohttp.ClientTimeout(total=12, connect=5)
        recheck_conn = aiohttp.TCPConnector(limit=12, ssl=False)
        async with aiohttp.ClientSession(
            timeout=recheck_timeout, connector=recheck_conn, headers={"User-Agent": UA}
        ) as session:
            rechecked = await asyncio.gather(
                *(probe_url(recheck_sem, session, r["media_url"], use_get=True) for r, _ in suspects)
            )

        dead_ids = []
        breakdown = Counter()
        for (r, _), final_res in zip(suspects, rechecked):
            if is_confirmed_dead(r["media_url"], final_res):
                dead_ids.append(r["id"])
                host = urlparse(r["media_url"]).netloc.lower()
                breakdown[f"{host}:{final_res}"] += 1

        logger.info(f"Confirmed dead URLs: {len(dead_ids)}")
        for k, cnt in breakdown.most_common(20):
            logger.info(f"  {k} -> {cnt}")

        if apply and dead_ids:
            res = await conn.execute(
                """
                UPDATE public.memes
                SET tags = array_append(COALESCE(tags, '{}'), 'hide-dead')
                WHERE id = ANY($1::uuid[])
                  AND NOT ('hide-dead' = ANY(COALESCE(tags, '{}')))
                """,
                dead_ids,
            )
            logger.info(f"Tagged dead rows in Neon: {res}")
        elif not apply:
            logger.info("Dry-run only. Re-run with --apply to tag confirmed dead rows.")
    finally:
        await conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Prune dead origin media URLs")
    parser.add_argument("--apply", action="store_true", help="Tag confirmed dead rows with 'hide-dead'")
    args = parser.parse_args()
    asyncio.run(main(apply=args.apply))
