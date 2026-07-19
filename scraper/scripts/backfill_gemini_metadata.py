import asyncio
import logging
import os
import sys
import aiohttp
from pathlib import Path

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("backfill")

# Ensure we can import modules from parent directory
sys.path.append(str(Path(__file__).parent.parent))

from scrapers.base import analyze_meme_image
from pipeline.uploader import _get_pool

# Cap on how many items to process in one run (adjust as needed)
BACKFILL_LIMIT = 20
FETCH_TIMEOUT = aiohttp.ClientTimeout(total=30)

async def apply_migration_002(conn):
    """Ensure the new columns exist in the database."""
    migration_path = Path(__file__).parent.parent.parent / "supabase" / "migrations" / "neon" / "002_search_upgrade.sql"
    if not migration_path.exists():
        logger.warning(f"Migration file not found at: {migration_path}")
        return
        
    logger.info("Checking & applying database migration 002...")
    with open(migration_path, "r", encoding="utf-8") as f:
        sql_content = f.read()
        
    await conn.execute(sql_content)
    logger.info("Migration 002 checked/applied successfully.")

async def download_image(url: str) -> bytes | None:
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, timeout=FETCH_TIMEOUT, headers=headers) as r:
                if r.status == 200:
                    return await r.read()
                logger.warning(f"Failed to download image {url[:50]}: HTTP {r.status}")
    except Exception as e:
        logger.warning(f"Error downloading image {url[:50]}: {e}")
    return None

async def main():
    db_url = os.getenv("NEON_DATABASE_URL")
    gemini_key = os.getenv("GEMINI_API_KEY")
    
    if not db_url:
        logger.error("NEON_DATABASE_URL not set in environment.")
        return
    if not gemini_key:
        logger.error("GEMINI_API_KEY not set in environment.")
        return

    pool = await _get_pool()
    logger.info(f"Fetching memes missing AI metadata (limit {BACKFILL_LIMIT})...")
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, cached_url, media_url, title
            FROM public.memes
            WHERE ocr_text IS NULL
            ORDER BY fetched_at DESC
            LIMIT $1
            """,
            BACKFILL_LIMIT
        )
        
    total_found = len(rows)
    logger.info(f"Found {total_found} memes to backfill.")
    if total_found == 0:
        logger.info("No memes need backfilling. Exiting.")
        await pool.close()
        return

    # 3. Process each meme
    processed = 0
    success = 0
    
    for i, row in enumerate(rows, 1):
        meme_id = row["id"]
        # Prioritize cached_url (R2) over media_url (original CDN) for faster downloads and no rate-blocks
        img_url = row["cached_url"] or row["media_url"]
        title = row["title"] or "Meme"
        
        logger.info(f"[{i}/{total_found}] Processing meme {meme_id} ({title[:30]})")
        
        # Download image bytes
        img_bytes = await download_image(img_url)
        if not img_bytes:
            logger.warning(f"  → Skipping: Failed to download image from {img_url[:60]}")
            continue
            
        # Analyze via Gemini
        logger.info(f"  → Calling Gemini API for image analysis...")
        ai_meta = await analyze_meme_image(img_bytes)
        
        ocr_text = ai_meta.get("ocr_text")
        description = ai_meta.get("description")
        tags = ai_meta.get("tags")
        
        # Ensure ocr_text and description are strings (sometimes Gemini returns lists)
        if isinstance(ocr_text, list):
            ocr_text = "\n".join(str(x) for x in ocr_text)
        elif ocr_text is not None:
            ocr_text = str(ocr_text)
            
        if isinstance(description, list):
            description = " ".join(str(x) for x in description)
        elif description is not None:
            description = str(description)
            
        # Ensure tags is a list
        if isinstance(tags, str):
            tags = [tags]
        elif not isinstance(tags, list):
            tags = []
        
        if ocr_text or description:
            # Update database
            async with pool.acquire() as conn:
                await conn.execute(
                    """
                    UPDATE public.memes
                    SET ocr_text = $1, description = $2, tags = $3
                    WHERE id = $4
                    """,
                    ocr_text, description, tags, meme_id
                )
            success += 1
            logger.info(f"  → Success: OCR='{ocr_text[:30] if ocr_text else None}', Description='{description[:30] if description else None}', Tags={tags}")
        else:
            logger.warning("  → Gemini returned empty metadata (failed analysis).")
            
        processed += 1
        # Avoid hitting API rate limits
        await asyncio.sleep(4.0)
        
    logger.info(f"Backfill finished. Processed: {processed}, Successfully updated: {success}")
    
    # Close pool
    await pool.close()

if __name__ == "__main__":
    # Load .env locally if present
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent.parent / ".env")
    
    asyncio.run(main())
