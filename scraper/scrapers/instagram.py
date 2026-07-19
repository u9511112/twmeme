# -*- coding: utf-8 -*-
"""
Instagram Scraper — uses Apify Instagram Scraper to bypass WAF.
"""

import logging
import urllib.parse

from .base import ApifyBaseScraper

logger = logging.getLogger(__name__)

IG_HASHTAGS = ["\u53f0\u7063\u8ff7\u56e0", "\u8ff7\u56e0", "\u5e79\u8a71tw", "\u53f0\u7063funny"]
IG_BASE     = "https://www.instagram.com"


class InstagramScraper(ApifyBaseScraper):
    async def scrape(self) -> list[dict]:
        if not self.check_apify_budget_safe():
            logger.warning("Apify budget check failed or insufficient, skipping Instagram scrape.")
            return []

        results: list[dict] = []
        
        # Format direct tag URLs
        direct_urls = []
        for tag in IG_HASHTAGS:
            # Apify handles URL formatting. We encode the hashtag
            encoded_tag = urllib.parse.quote(tag)
            direct_urls.append(f"{IG_BASE}/explore/tags/{encoded_tag}/")

        run_input = {
            "directUrls": direct_urls,
            "resultsType": "posts",
            "resultsLimit": 10,
            "proxyConfiguration": {
                "useApifyProxy": True,
                "apifyProxyGroups": ["RESIDENTIAL"],
                "countryCode": "TW"
            }
        }

        logger.info(f"Calling apify/instagram-scraper for tags: {IG_HASHTAGS}")
        try:
            run = self.client.actor("apify/instagram-scraper").call(run_input=run_input)
            
            # Compatible with both dict and Pydantic object
            dataset_id = getattr(run, "default_dataset_id", None) or (run.get("defaultDatasetId") if isinstance(run, dict) else None)
            if not dataset_id:
                logger.error("Instagram scraper failed: default_dataset_id not found in run response.")
                return []

            for item in self.client.dataset(dataset_id).iterate_items():
                # Extract media info compatible with Apify Instagram Scraper output fields
                video_url = item.get("videoUrl") or item.get("video_url")
                display_url = item.get("displayUrl") or item.get("display_url") or item.get("thumbnailUrl")
                
                if not display_url and not video_url:
                    continue
                
                media_url = video_url if video_url else display_url
                media_type = "video" if video_url else "image"
                
                caption = item.get("caption") or item.get("accessibility_caption") or ""
                # Cap the title
                title = caption[:100] if caption else "#迷因"
                
                likes = item.get("likesCount") or item.get("likes_count") or 0
                comments = item.get("commentsCount") or item.get("comments_count") or 0
                
                short_code = item.get("shortCode") or item.get("code")
                source_url = item.get("url") or (f"{IG_BASE}/p/{short_code}/" if short_code else f"{IG_BASE}/explore/tags/{IG_HASHTAGS[0]}/")

                results.append({
                    "platform":      "instagram",
                    "source_url":    source_url,
                    "media_url":     media_url,
                    "media_type":    media_type,
                    "title":         title,
                    "like_count":    likes,
                    "share_count":   0,
                    "comment_count": comments,
                })
                
            logger.info(f"Instagram: successfully fetched and parsed {len(results)} items via Apify")
        except Exception as e:
            logger.error(f"Instagram scraper failed: {e}")

        return results
