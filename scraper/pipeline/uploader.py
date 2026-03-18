"""
Supabase uploader pipeline.

Flow:
1. Check source_url uniqueness (fast DB lookup)
2. pHash dedup check against recent hashes
3. Download + upload media to Supabase Storage (cached_url)
4. Insert meme row
5. Insert stats history snapshot
"""

import logging
import os
import uuid

import aiohttp
from supabase import create_client, Client

from .dedup import is_duplicate

logger = logging.getLogger(__name__)

FETCH_TIMEOUT     = aiohttp.ClientTimeout(total=45)
RECENT_HASH_LIMIT = 5000   # compare against this many recent hashes


def get_client() -> Client:
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    return create_client(url, key)


async def upload_media_to_storage(
    client: Client, media_url: str, meme_id: str
) -> str | None:
    """
    Download media bytes → upload to Supabase Storage bucket 'memes'.
    Returns the public URL or None on failure.
    """
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                media_url, timeout=FETCH_TIMEOUT,
                headers={"Referer": "https://www.google.com/"}
            ) as r:
                if r.status != 200:
                    logger.warning(f"Media download {media_url}: HTTP {r.status}")
                    return None
                content_type = r.content_type or "image/jpeg"
                data = await r.read()

        # Derive extension from content-type
        ext = content_type.split("/")[-1].split(";")[0].strip()
        if ext not in ("jpeg", "jpg", "png", "gif", "webp", "mp4", "webm", "mov"):
            ext = "jpg"
        path = f"{meme_id}.{ext}"

        client.storage.from_("memes").upload(
            path, data, {"content-type": content_type, "upsert": "false"}
        )
        public_url = client.storage.from_("memes").get_public_url(path)
        logger.debug(f"Uploaded to storage: {public_url}")
        return public_url

    except Exception as e:
        logger.warning(f"Storage upload failed for {media_url}: {e}")
        return None


async def insert_meme(client: Client, item: dict, phash: str) -> str | None:
    """
    Dedup-check then insert meme. Returns inserted UUID or None if skipped.
    """
    # Fast source_url dedup (unique constraint in DB)
    existing_url = (
        client.table("memes")
        .select("id")
        .eq("source_url", item["source_url"])
        .limit(1)
        .execute()
    )
    if existing_url.data:
        logger.debug(f"Skipping duplicate source_url: {item['source_url']}")
        return None

    # pHash dedup against recent entries
    recent = (
        client.table("memes")
        .select("phash")
        .order("fetched_at", desc=True)
        .limit(RECENT_HASH_LIMIT)
        .execute()
    )
    existing_hashes = [r["phash"] for r in recent.data]
    if is_duplicate(phash, existing_hashes):
        logger.debug(f"pHash duplicate detected for {item['media_url']}")
        return None

    meme_id    = str(uuid.uuid4())
    cached_url = await upload_media_to_storage(client, item["media_url"], meme_id)

    client.table("memes").insert({
        "id":            meme_id,
        "platform":      item["platform"],
        "source_url":    item["source_url"],
        "media_url":     item["media_url"],
        "cached_url":    cached_url,
        "media_type":    item["media_type"],
        "title":         item.get("title"),
        "like_count":    item.get("like_count", 0),
        "share_count":   item.get("share_count", 0),
        "comment_count": item.get("comment_count", 0),
        "phash":         phash,
    }).execute()

    # Record stats snapshot for spike detection
    client.table("meme_stats_history").insert({
        "meme_id":   meme_id,
        "like_count": item.get("like_count", 0),
    }).execute()

    logger.info(f"Inserted [{item['platform']}] {item.get('title', '')[:40]} → {meme_id}")
    return meme_id
