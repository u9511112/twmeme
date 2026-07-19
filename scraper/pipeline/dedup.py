"""
pHash deduplication pipeline.

Computes a perceptual hash (DCT-based) for each image and compares
against existing hashes in the DB using Hamming distance.
Threshold of 8 tolerates: minor resizing, compression, watermarks.

Videos are deduped by URL hash (not pHash) since downloading full
videos just to hash them would be too slow in a scraping pipeline.
"""

import hashlib
import io
import logging

import aiohttp
import imagehash
from PIL import Image

logger = logging.getLogger(__name__)

HASH_THRESHOLD = 8    # Hamming distance ≤ 8 → considered duplicate
FETCH_TIMEOUT  = aiohttp.ClientTimeout(total=20)


async def compute_phash(media_url: str, media_type: str = "image") -> str | None:
    """
    Compute perceptual hash for images/GIFs.
    For videos, return a deterministic hash of the URL instead.
    Returns hex string or None on failure.
    """
    if media_type == "video":
        return "v_" + hashlib.sha256(media_url.encode()).hexdigest()[:14]

    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(media_url, timeout=FETCH_TIMEOUT) as r:
                if r.status != 200:
                    logger.debug(f"pHash fetch {media_url}: HTTP {r.status}")
                    return None
                data = await r.read()

        img = Image.open(io.BytesIO(data)).convert("RGB")
        return str(imagehash.phash(img))  # 64-bit hex, e.g. "f8e0c0..."

    except Exception as e:
        logger.debug(f"pHash failed for {media_url}: {e}")
        return None


def is_duplicate(new_hash: str, existing_hashes: list[str]) -> bool:
    """
    Compare new_hash against all existing hashes.
    Returns True if a near-duplicate is found.
    Video hashes (prefix 'v_') use exact match.
    """
    if new_hash.startswith("v_"):
        return new_hash in existing_hashes

    try:
        h1 = imagehash.hex_to_hash(new_hash)
    except Exception:
        return False

    for eh in existing_hashes:
        if eh.startswith("v_"):
            continue
        try:
            if abs(h1 - imagehash.hex_to_hash(eh)) <= HASH_THRESHOLD:
                return True
        except Exception:
            continue

    return False
