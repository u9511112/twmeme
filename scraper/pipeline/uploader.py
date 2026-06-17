"""
Neon + R2 uploader pipeline.

Flow:
1. Check source_url uniqueness (fast DB lookup)
2. pHash dedup check against recent hashes
3. Download + upload media to R2 (cached_url)
4. Insert meme row into Neon
5. Insert stats history snapshot

Connection model:
- Neon Postgres via asyncpg (TCP, persistent pool)
- R2 via boto3 (sync; called from async context — fine because items
  are processed sequentially)
"""

import asyncio
import logging
import os
import uuid

import aiohttp
import asyncpg
import boto3
from botocore.config import Config

from .dedup import is_duplicate
from scrapers.base import analyze_meme_image

logger = logging.getLogger(__name__)

FETCH_TIMEOUT     = aiohttp.ClientTimeout(total=45)
RECENT_HASH_LIMIT = 5000

# Module-level state. get_client() lazy-initializes; close_client() tears down.
_state: dict = {"pool": None, "r2": None, "bucket": None, "public_url": None}


def get_client() -> dict:
    """Initialize R2 + return state bag. asyncpg pool is created on first DB call."""
    if _state["r2"] is None:
        required = ("NEON_DATABASE_URL", "R2_ENDPOINT", "R2_ACCESS_KEY_ID",
                    "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_PUBLIC_URL")
        missing = [k for k in required if not os.environ.get(k, "").strip()]
        if missing:
            raise RuntimeError(
                f"Missing required env var(s): {', '.join(missing)}. "
                "Set them in scraper/.env locally, or as GitHub Actions repo secrets."
            )
        _state["r2"] = boto3.client(
            "s3",
            endpoint_url=os.environ["R2_ENDPOINT"],
            aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
            aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
            config=Config(signature_version="s3v4", region_name="auto"),
        )
        _state["bucket"] = os.environ["R2_BUCKET"]
        _state["public_url"] = os.environ["R2_PUBLIC_URL"].rstrip("/")
    return _state


async def _get_pool() -> asyncpg.Pool:
    if _state["pool"] is None:
        _state["pool"] = await asyncpg.create_pool(
            os.environ["NEON_DATABASE_URL"],
            min_size=1,
            max_size=4,
            statement_cache_size=0,  # Neon poolers don't keep prepared statements
        )
    return _state["pool"]


async def close_client(client: dict) -> None:
    if client.get("pool") is not None:
        await client["pool"].close()
        client["pool"] = None


async def upload_media_to_storage(
    client: dict, media_url: str, meme_id: str, retries: int = 3
) -> tuple[str | None, bytes | None]:
    """
    Download media bytes → upload to R2 as memes/{meme_id}.{ext}.
    Returns (public_url, media_bytes) or (None, None) on failure.
    """
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/122.0.0.0 Safari/537.36"
        ),
        "Referer": "https://www.google.com/",
    }

    for attempt in range(1, retries + 1):
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    media_url, timeout=FETCH_TIMEOUT, headers=headers
                ) as r:
                    if r.status != 200:
                        logger.warning(
                            f"Media download {media_url}: HTTP {r.status} "
                            f"(attempt {attempt}/{retries})"
                        )
                        if attempt < retries:
                            await asyncio.sleep(2 * attempt)
                            continue
                        return None
                    content_type = r.content_type or "image/jpeg"
                    data = await r.read()

            ext = content_type.split("/")[-1].split(";")[0].strip()
            if ext not in ("jpeg", "jpg", "png", "gif", "webp", "mp4", "webm", "mov"):
                ext = "jpg"
            key = f"memes/{meme_id}.{ext}"

            client["r2"].put_object(
                Bucket=client["bucket"], Key=key, Body=data, ContentType=content_type,
            )
            public_url = f"{client['public_url']}/{key}"
            logger.debug(f"Uploaded to R2: {public_url}")
            return public_url, data

        except Exception as e:
            logger.warning(
                f"R2 upload failed for {media_url}: {e} "
                f"(attempt {attempt}/{retries})"
            )
            if attempt < retries:
                await asyncio.sleep(2 * attempt)

    return None, None


async def backfill_missing_cache(client: dict) -> int:
    """Re-download and upload media for all memes with NULL cached_url."""
    pool = await _get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, media_url FROM public.memes WHERE cached_url IS NULL"
        )
    fixed = 0
    total = len(rows)
    logger.info(f"Backfill: {total} memes with NULL cached_url")

    for i, row in enumerate(rows, 1):
        meme_id   = str(row["id"])
        media_url = row["media_url"]
        logger.info(f"Backfill [{i}/{total}] {media_url[:60]}")

        cached_url, _ = await upload_media_to_storage(client, media_url, meme_id)
        if cached_url:
            async with pool.acquire() as conn:
                await conn.execute(
                    "UPDATE public.memes SET cached_url = $1 WHERE id = $2",
                    cached_url, row["id"],
                )
            fixed += 1
            logger.info(f"  → cached: {cached_url[:60]}")
        else:
            logger.warning(f"  → FAILED to cache {meme_id}")

        await asyncio.sleep(0.5)

    logger.info(f"Backfill complete: {fixed}/{total} fixed")
    return fixed


async def insert_meme(client: dict, item: dict, phash: str) -> str | None:
    """
    Dedup-check then insert meme. Returns inserted UUID or None if skipped.

    Two-phase dedup:
    1. Pre-flight check (no lock) — reject obvious dups fast, before R2 upload.
    2. Authoritative re-check inside an advisory-locked transaction — closes
       the TOCTOU race that opens up while the R2 upload is in flight. The
       lock serializes the dedup-and-insert critical section across all
       workers, scoped to this scraper (hashtext namespace).

    R2 upload happens between the two phases (unlocked) so we don't hold a
    Postgres advisory lock through tens of seconds of network IO. The cost
    of losing the race is one wasted R2 upload, not a duplicate row.
    """
    pool = await _get_pool()

    async with pool.acquire() as conn:
        existing = await conn.fetchval(
            "SELECT id FROM public.memes WHERE source_url = $1 LIMIT 1",
            item["source_url"],
        )
        if existing:
            logger.debug(f"Skipping duplicate source_url: {item['source_url']}")
            return None

        recent = await conn.fetch(
            "SELECT phash FROM public.memes ORDER BY fetched_at DESC LIMIT $1",
            RECENT_HASH_LIMIT,
        )
        if is_duplicate(phash, [r["phash"] for r in recent]):
            logger.debug(f"pHash duplicate detected for {item['media_url']}")
            return None

    meme_id = str(uuid.uuid4())
    cached_url, image_bytes = await upload_media_to_storage(client, item["media_url"], meme_id)

    ai_meta = {"ocr_text": None, "description": None, "tags": []}
    if image_bytes and item.get("media_type") == "image":
        # Analyze image via Gemini
        ai_meta = await analyze_meme_image(image_bytes)

    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                "SELECT pg_advisory_xact_lock(hashtext('twmeme.insert_meme'))"
            )

            existing = await conn.fetchval(
                "SELECT id FROM public.memes WHERE source_url = $1 LIMIT 1",
                item["source_url"],
            )
            if existing:
                logger.info(
                    f"Race lost on source_url after R2 upload, skipping: "
                    f"{item['source_url']}"
                )
                return None

            recent = await conn.fetch(
                "SELECT phash FROM public.memes ORDER BY fetched_at DESC LIMIT $1",
                RECENT_HASH_LIMIT,
            )
            if is_duplicate(phash, [r["phash"] for r in recent]):
                logger.info(
                    f"Race lost on pHash after R2 upload, skipping: "
                    f"{item['media_url']}"
                )
                return None

            await conn.execute(
                """
                INSERT INTO public.memes (
                    id, platform, source_url, media_url, cached_url, media_type,
                    title, like_count, share_count, comment_count, phash,
                    ocr_text, description, tags
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                """,
                uuid.UUID(meme_id),
                item["platform"],
                item["source_url"],
                item["media_url"],
                cached_url,
                item["media_type"],
                item.get("title"),
                item.get("like_count", 0),
                item.get("share_count", 0),
                item.get("comment_count", 0),
                phash,
                ai_meta.get("ocr_text"),
                ai_meta.get("description"),
                ai_meta.get("tags")
            )
            await conn.execute(
                """
                INSERT INTO public.meme_stats_history (meme_id, like_count)
                VALUES ($1, $2)
                """,
                uuid.UUID(meme_id),
                item.get("like_count", 0),
            )

    logger.info(f"Inserted [{item['platform']}] {item.get('title', '')[:40]} → {meme_id}")
    return meme_id
