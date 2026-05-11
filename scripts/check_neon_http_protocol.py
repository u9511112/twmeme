"""Neon HTTP wire-protocol canary.

`extension/db.js` and `web/db.js` (transitively, via @neondatabase/serverless)
both rely on the Neon HTTP endpoint accepting:

  POST https://<host>/sql
  Headers: Neon-Connection-String, Neon-Raw-Text-Output, Neon-Array-Mode
  Body:    {"query": "...", "params": [...], "arrayMode": false, "fullResults": false}
  Response: {"rows": [...]}

This is an internal protocol of @neondatabase/serverless. Neon can change it
without warning and our hand-rolled `extension/db.js` will silently 500. The
web version is one esm.sh update away from being fine, but the extension is
weeks-of-Chrome-Web-Store-review away.

Run this before tagging any extension release. It does a real query against
prod Neon, asserts the response shape we depend on, and fails CI if anything
drifted.

Usage:
  python scripts/check_neon_http_protocol.py
  echo $?   # 0 = OK, non-zero = protocol drifted
"""

import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

SECRETS = Path.home() / ".gstack/projects/u9511112-twmeme/secrets/neon.env"


def load_env():
    env = {}
    for line in SECRETS.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            env[k.strip()] = v.strip()
    return env


def main():
    env = load_env()
    host = env["NEON_POOLER_HOST"]
    dsn = env["NEON_WEB_POOLED_DATABASE_URL"]

    body = json.dumps({
        "query": "SELECT 1 AS n",
        "params": [],
        "arrayMode": False,
        "fullResults": False,
    }).encode("utf-8")

    req = urllib.request.Request(f"https://{host}/sql", data=body, method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("Neon-Connection-String", dsn)
    req.add_header("Neon-Raw-Text-Output", "true")
    req.add_header("Neon-Array-Mode", "false")

    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            resp = json.load(r)
    except urllib.error.HTTPError as e:
        print(f"FAIL: Neon returned HTTP {e.code} — protocol drift likely")
        print(e.read().decode("utf-8", errors="replace")[:400])
        sys.exit(1)
    except Exception as e:
        print(f"FAIL: {type(e).__name__}: {e}")
        sys.exit(1)

    # Assert: response must have "rows" array with one row, n=1 (as string per raw-text-output mode).
    if "rows" not in resp:
        print(f"FAIL: response missing 'rows' key. Got: {list(resp.keys())}")
        sys.exit(2)
    rows = resp["rows"]
    if len(rows) != 1:
        print(f"FAIL: expected 1 row, got {len(rows)}: {rows}")
        sys.exit(3)
    if "n" not in rows[0]:
        print(f"FAIL: expected column 'n' in row, got keys: {list(rows[0].keys())}")
        sys.exit(4)
    n = rows[0]["n"]
    # raw-text-output returns "1" (string); without it it'd be 1 (int). Either is fine — we just
    # care that the value is truthy and represents 1.
    if str(n) != "1":
        print(f"FAIL: SELECT 1 returned n={n!r}, expected 1")
        sys.exit(5)

    print(f"OK: Neon HTTP protocol unchanged. Response: rows[0]={rows[0]}")


if __name__ == "__main__":
    main()
