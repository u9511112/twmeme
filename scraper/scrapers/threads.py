# -*- coding: utf-8 -*-
"""
Threads Scraper — uses Apify Threads Scraper to bypass WAF.
"""

import logging

from .base import ApifyBaseScraper

logger = logging.getLogger(__name__)

# Using Unicode escape to ensure no encoding issues on Windows
THREADS_TAGS = ["\u53f0\u7063\u8ff7\u56e0", "\u8ff7\u56e0", "\u5e79\u8a71", "\u53f0\u7063funny"]
THREADS_BASE = "https://www.threads.net"


class ThreadsScraper(ApifyBaseScraper):
    async def scrape(self) -> list[dict]:
        if not self.check_apify_budget_safe():
            logger.warning("Apify budget check failed or insufficient, skipping Threads scrape.")
            return []

        results: list[dict] = []

        run_input = {
            "mode": "search",
            "searchQueries": THREADS_TAGS,
            "maxPostsPerSource": 10,
            "proxyConfiguration": {
                "useApifyProxy": True,
                "countryCode": "TW"
            }
        }

        logger.info(f"Calling automation-lab/threads-scraper for queries: {THREADS_TAGS}")
        try:
            run = self.client.actor("automation-lab/threads-scraper").call(run_input=run_input)
            
            # Compatible with both dict and Pydantic object
            dataset_id = getattr(run, "default_dataset_id", None) or (run.get("defaultDatasetId") if isinstance(run, dict) else None)
            if not dataset_id:
                logger.error("Threads scraper failed: default_dataset_id not found in run response.")
                return []

            for item in self.client.dataset(dataset_id).iterate_items():
                # Extract media. Some scrapers return a list of media under "media" or "media_attachments"
                media_attachments = item.get("media") or item.get("mediaAttachments") or []
                
                # If there's no media list, try top-level image/video fields
                if not media_attachments:
                    img_url = item.get("imageUrl") or item.get("image") or item.get("displayUrl")
                    vid_url = item.get("videoUrl") or item.get("video")
                    if img_url or vid_url:
                        media_attachments = [{
                            "url": vid_url if vid_url else img_url,
                            "type": "video" if vid_url else "image"
                        }]
                
                if not media_attachments:
                    continue

                caption = item.get("caption") or item.get("text") or ""
                title = caption[:100] if caption else "#迷因"
                
                likes = item.get("likesCount") or item.get("likes") or item.get("likeCount") or 0
                comments = item.get("repliesCount") or item.get("commentsCount") or item.get("replyCount") or 0
                
                post_id = item.get("id") or item.get("postId")
                source_url = item.get("url") or item.get("postUrl") or (f"{THREADS_BASE}/post/{post_id}" if post_id else THREADS_BASE)

                for media in media_attachments:
                    url = media.get("url")
                    if not url:
                        continue
                    
                    media_type = media.get("type", "image")
                    # Map type if it's "video" or "image"
                    if "video" in media_type.lower():
                        media_type = "video"
                    else:
                        media_type = "image"

                    results.append({
                        "platform":      "threads",
                        "source_url":    source_url,
                        "media_url":     url,
                        "media_type":    media_type,
                        "title":         title,
                        "like_count":    likes,
                        "share_count":   0,
                        "comment_count": comments,
                    })

            logger.info(f"Threads: successfully fetched and parsed {len(results)} items via Apify")
        except Exception as e:
            logger.error(f"Threads scraper failed: {e}")

        return results
