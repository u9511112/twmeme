#!/usr/bin/env python
"""
TWmeme data migration: Supabase Postgres + Storage  →  Neon + R2.

Default mode is --dry-run: verify connectivity + plan, no writes anywhere.
Use --execute to do the real migration (requires Supabase project ACTIVE
and SOURCE_DATABASE_URL set).

Idempotent:
  - memes: ON CONFLICT (source_url) DO NOTHING — re-running skips existing.
  - R2: HEAD before PUT — re-running skips already-uploaded objects.
  - logging tables (search_queries, unmet_searches, meme_stats_history):
    skip entirely if target already has rows (cannot dedup, append-only).

Reads creds from ~/.gstack/projects/u9511112-twmeme/secrets/neon.env
(machine-local; never commit).

Run:
  python scripts/migrate_data.py                  # dry-run
  SOURCE_DATABASE_URL=postgresql://... \
    python scripts/migrate_data.py --execute      # real migration
  python scripts/migrate_data.py --execute --limit 5   # test with 5 memes
"""

import argparse
import logging
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import boto3
import psycopg2
import psycopg2.extras
from botocore.config import Config
from botocore.exceptions import ClientError

SECRETS_PATH = Path.home() / ".gstack/projects/u9511112-twmeme/secrets/neon.env"
HTTP_TIMEOUT = 30
HTTP_RETRIES = 3
RETRY_BACKOFF = 2.0

EXT_BY_CONTENT_TYPE = {
    "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png",
    "image/gif": "gif", "image/webp": "webp",
    "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
}

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("migrate")


def load_env(path: Path) -> dict:
    if not path.exists():
        sys.exit(f"FATAL: secrets file not found: {path}")
    env = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        k, _, v = line.partition("=")
        env[k.strip()] = v.strip()
    required = [
        "NEON_OWNER_DATABASE_URL",
        "R2_ENDPOINT", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY",
        "R2_BUCKET", "R2_PUBLIC_URL",
    ]
    missing = [k for k in required if not env.get(k)]
    if missing:
        sys.exit(f"FATAL: missing keys in {path}: {missing}")
    return env


def connect_neon(env: dict):
    conn = psycopg2.connect(env["NEON_OWNER_DATABASE_URL"])
    conn.autocommit = False
    return conn


def connect_r2(env: dict):
    return boto3.client(
        "s3",
        endpoint_url=env["R2_ENDPOINT"],
        aws_access_key_id=env["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=env["R2_SECRET_ACCESS_KEY"],
        config=Config(signature_version="s3v4", region_name="auto"),
    )


def connect_source(source_url: str):
    conn = psycopg2.connect(source_url)
    conn.autocommit = True
    return conn


def http_get(url: str) -> tuple[bytes, str]:
    """GET url with retries. Returns (body, content_type)."""
    last_err = None
    for attempt in range(1, HTTP_RETRIES + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "twmeme-migrate/1.0"})
            with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as r:
                return r.read(), (r.headers.get_content_type() or "application/octet-stream")
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            last_err = e
            if attempt < HTTP_RETRIES:
                time.sleep(RETRY_BACKOFF * attempt)
    raise RuntimeError(f"http_get failed after {HTTP_RETRIES} attempts: {url} — {last_err}")


def r2_head(r2, bucket: str, key: str) -> int | None:
    """Return Content-Length if object exists, else None."""
    try:
        resp = r2.head_object(Bucket=bucket, Key=key)
        return int(resp["ContentLength"])
    except ClientError as e:
        if e.response["Error"]["Code"] in ("404", "NoSuchKey", "NotFound"):
            return None
        raise


def ext_from_url_or_type(url: str, content_type: str) -> str:
    if content_type in EXT_BY_CONTENT_TYPE:
        return EXT_BY_CONTENT_TYPE[content_type]
    # fall back to URL ext
    tail = url.rsplit(".", 1)[-1].lower().split("?", 1)[0]
    if tail in {"jpg", "jpeg", "png", "gif", "webp", "mp4", "webm", "mov"}:
        return "jpeg" if tail == "jpg" else tail
    return "jpg"


# ──────────────────────────────────────────────────────────────────────
# DRY-RUN
# ──────────────────────────────────────────────────────────────────────
def dry_run(env: dict, source_url: str | None) -> int:
    log.info("=" * 60)
    log.info("DRY-RUN — no writes")
    log.info("=" * 60)

    # Neon connectivity
    log.info("[Neon] connecting as owner...")
    with connect_neon(env) as nc, nc.cursor() as cur:
        cur.execute("SELECT current_user, current_database(), version();")
        u, db, ver = cur.fetchone()
        log.info(f"[Neon] connected: user={u} db={db} pg={ver.split(',')[0]}")
        for tbl in ("memes", "meme_stats_history", "search_queries", "unmet_searches"):
            cur.execute(f"SELECT count(*) FROM public.{tbl};")
            log.info(f"[Neon]   {tbl}: {cur.fetchone()[0]} rows")

    # R2 connectivity
    log.info("[R2] connecting...")
    r2 = connect_r2(env)
    bucket = env["R2_BUCKET"]
    resp = r2.list_objects_v2(Bucket=bucket, Prefix="memes/", MaxKeys=5)
    n = resp.get("KeyCount", 0)
    log.info(f"[R2] bucket={bucket} memes/ prefix: {n} objects (showing up to 5)")
    for o in resp.get("Contents", [])[:5]:
        log.info(f"[R2]   {o['Key']} ({o['Size']} bytes)")

    # Source connectivity (optional)
    if source_url:
        log.info("[Source] connecting to Supabase Postgres...")
        try:
            with connect_source(source_url) as sc, sc.cursor() as cur:
                cur.execute("SELECT version();")
                log.info(f"[Source] connected: pg={cur.fetchone()[0].split(',')[0]}")
                for tbl in ("memes", "meme_stats_history", "search_queries", "unmet_searches"):
                    try:
                        cur.execute(f"SELECT count(*) FROM public.{tbl};")
                        log.info(f"[Source]   {tbl}: {cur.fetchone()[0]} rows")
                    except psycopg2.Error as e:
                        log.warning(f"[Source]   {tbl}: {e}")
                # Sample one row to show schema
                cur.execute("SELECT id, platform, cached_url FROM public.memes LIMIT 1;")
                row = cur.fetchone()
                if row:
                    log.info(f"[Source] sample meme: id={row[0]} platform={row[1]} cached_url={row[2][:60] if row[2] else None}")
        except psycopg2.OperationalError as e:
            log.error(f"[Source] connection failed (Supabase paused?): {e}")
            return 2
    else:
        log.info("[Source] SOURCE_DATABASE_URL not set — skipping source check")
        log.info("[Source] (set it when ready to --execute; Supabase project must be ACTIVE)")

    log.info("=" * 60)
    log.info("DRY-RUN OK — no errors")
    log.info("=" * 60)
    log.info("Next: restore Supabase, set SOURCE_DATABASE_URL, run with --execute")
    return 0


# ──────────────────────────────────────────────────────────────────────
# EXECUTE
# ──────────────────────────────────────────────────────────────────────
def migrate_memes(src_conn, dst_conn, r2, env, limit: int | None) -> tuple[int, int, int]:
    """Returns (inserted, skipped_existing, failed)."""
    bucket = env["R2_BUCKET"]
    public_url = env["R2_PUBLIC_URL"].rstrip("/")

    sql_select = (
        "SELECT id, platform, source_url, media_url, cached_url, media_type, "
        "       width, height, title, like_count, share_count, comment_count, "
        "       phash, trending_score, fetched_at, created_at "
        "FROM public.memes ORDER BY created_at"
    )
    if limit:
        sql_select += f" LIMIT {limit}"

    inserted = skipped = failed = 0
    with src_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as sc:
        sc.execute(sql_select)
        rows = sc.fetchall()
        log.info(f"[memes] source: {len(rows)} rows to consider")

        with dst_conn.cursor() as dc:
            for i, row in enumerate(rows, 1):
                meme_id = str(row["id"])

                # Skip if already in Neon
                dc.execute("SELECT 1 FROM public.memes WHERE source_url = %s", (row["source_url"],))
                if dc.fetchone():
                    skipped += 1
                    log.info(f"[memes {i}/{len(rows)}] skip (exists): {meme_id}")
                    continue

                # Download object — prefer cached_url (Supabase Storage public URL)
                fetch_url = row["cached_url"] or row["media_url"]
                if not fetch_url:
                    failed += 1
                    log.warning(f"[memes {i}/{len(rows)}] FAIL: no url to fetch ({meme_id})")
                    continue

                try:
                    body, ctype = http_get(fetch_url)
                except RuntimeError as e:
                    failed += 1
                    log.warning(f"[memes {i}/{len(rows)}] FAIL fetch: {e}")
                    continue

                ext = ext_from_url_or_type(fetch_url, ctype)
                key = f"memes/{meme_id}.{ext}"
                new_cached_url = f"{public_url}/{key}"

                # Upload (skip if already in R2 with same size)
                existing = r2_head(r2, bucket, key)
                if existing == len(body):
                    log.info(f"[memes {i}/{len(rows)}] R2 already has {key} ({existing}b)")
                else:
                    r2.put_object(Bucket=bucket, Key=key, Body=body, ContentType=ctype)
                    log.info(f"[memes {i}/{len(rows)}] R2 PUT {key} ({len(body)}b)")

                # Insert into Neon
                dc.execute(
                    """
                    INSERT INTO public.memes (
                        id, platform, source_url, media_url, cached_url, media_type,
                        width, height, title, like_count, share_count, comment_count,
                        phash, trending_score, fetched_at, created_at
                    ) VALUES (
                        %(id)s, %(platform)s, %(source_url)s, %(media_url)s, %(cached_url)s, %(media_type)s,
                        %(width)s, %(height)s, %(title)s, %(like_count)s, %(share_count)s, %(comment_count)s,
                        %(phash)s, %(trending_score)s, %(fetched_at)s, %(created_at)s
                    )
                    ON CONFLICT (source_url) DO NOTHING
                    """,
                    {**row, "cached_url": new_cached_url},
                )
                inserted += 1
                if i % 10 == 0:
                    dst_conn.commit()
                    log.info(f"[memes] committed at {i}")

            dst_conn.commit()

    return inserted, skipped, failed


def migrate_append_only(
    src_conn, dst_conn, table: str, columns: list[str],
    filter_to_existing_memes: bool = False,
) -> tuple[int, str]:
    """Copy append-only logging table. Skips entirely if target non-empty.

    If filter_to_existing_memes=True, restricts to rows whose meme_id is in
    Neon's memes table (needed for --limit runs where stats reference memes
    we haven't migrated yet — FK would otherwise fire).

    Returns (rows_inserted, status). Status is one of: 'copied', 'skip_nonempty'.
    """
    with dst_conn.cursor() as dc:
        dc.execute(f"SELECT count(*) FROM public.{table};")
        existing = dc.fetchone()[0]
        if existing > 0:
            log.info(f"[{table}] target has {existing} rows — skipping (cannot dedup)")
            return 0, "skip_nonempty"

    cols_csv = ", ".join(columns)
    placeholders = ", ".join(["%s"] * len(columns))

    with src_conn.cursor() as sc:
        if filter_to_existing_memes:
            with dst_conn.cursor() as dc:
                dc.execute("SELECT id FROM public.memes;")
                allowed = [str(r[0]) for r in dc.fetchall()]
            if not allowed:
                log.info(f"[{table}] no memes in target — nothing to migrate")
                return 0, "copied"
            sc.execute(
                f"SELECT {cols_csv} FROM public.{table} WHERE meme_id = ANY(%s::uuid[]) ORDER BY 1;",
                (allowed,),
            )
        else:
            sc.execute(f"SELECT {cols_csv} FROM public.{table} ORDER BY 1;")
        rows = sc.fetchall()

    if not rows:
        log.info(f"[{table}] source empty — nothing to migrate")
        return 0, "copied"

    with dst_conn.cursor() as dc:
        psycopg2.extras.execute_batch(
            dc,
            f"INSERT INTO public.{table} ({cols_csv}) VALUES ({placeholders})",
            rows,
            page_size=200,
        )
        dst_conn.commit()

    log.info(f"[{table}] inserted {len(rows)} rows")
    return len(rows), "copied"


def execute(env: dict, source_url: str, limit: int | None) -> int:
    log.info("=" * 60)
    log.info("EXECUTE — will write to Neon + R2")
    log.info("=" * 60)

    if not source_url:
        log.error("SOURCE_DATABASE_URL not set. Get it from Supabase dashboard:")
        log.error("  Settings → Database → Connection string → URI (use service password)")
        return 2

    src = connect_source(source_url)
    dst = connect_neon(env)
    r2 = connect_r2(env)

    try:
        ins, skp, fail = migrate_memes(src, dst, r2, env, limit)
        log.info(f"[memes] inserted={ins} skipped={skp} failed={fail}")

        # Stats history — preserve recorded_at + like_count, let Neon assign new PKs.
        # Filter to memes that exist in target so --limit doesn't blow up the FK.
        s_ins, _ = migrate_append_only(
            src, dst, "meme_stats_history",
            ["meme_id", "like_count", "recorded_at"],
            filter_to_existing_memes=True,
        )

        # Search queries — drop original PK, let Neon assign
        q_ins, _ = migrate_append_only(
            src, dst, "search_queries",
            ["query_text", "had_result", "result_count", "clicked_index", "searched_at"],
        )

        # Unmet searches
        u_ins, _ = migrate_append_only(
            src, dst, "unmet_searches",
            ["description", "created_at"],
        )

        log.info("=" * 60)
        log.info(f"DONE — memes:{ins}+{skp}skip+{fail}fail  stats:{s_ins}  queries:{q_ins}  unmet:{u_ins}")
        log.info("=" * 60)
        return 0 if fail == 0 else 1

    finally:
        for c in (src, dst):
            try:
                c.close()
            except Exception:
                pass


# ──────────────────────────────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────────────────────────────
def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--execute", action="store_true", help="Actually do the migration (default: dry-run)")
    p.add_argument("--limit", type=int, default=None, help="Limit number of memes (for testing)")
    p.add_argument("--secrets", type=Path, default=SECRETS_PATH, help=f"Path to creds file (default: {SECRETS_PATH})")
    args = p.parse_args()

    env = load_env(args.secrets)
    source_url = os.environ.get("SOURCE_DATABASE_URL", "").strip() or None

    if args.execute:
        return execute(env, source_url, args.limit)
    return dry_run(env, source_url)


if __name__ == "__main__":
    sys.exit(main())
