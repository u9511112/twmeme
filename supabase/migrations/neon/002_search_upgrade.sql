-- ============================================================
-- TWmeme — Neon Schema Upgrade (002)
--
-- Adds AI-generated metadata columns for enhanced semantic search:
--   - ocr_text: extracted text/dialogue inside the meme image
--   - description: detailed visual description of the image scene
--   - tags: array of categories, emotions, or objects
-- ============================================================

ALTER TABLE public.memes
ADD COLUMN IF NOT EXISTS ocr_text TEXT,
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS tags TEXT[];

CREATE INDEX IF NOT EXISTS idx_memes_ocr_text_trgm ON public.memes USING gin (ocr_text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_memes_description_trgm ON public.memes USING gin (description gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_memes_tags_gin ON public.memes USING gin (tags);

