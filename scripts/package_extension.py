#!/usr/bin/env python3
"""
TWmeme — Chrome extension packaging script (cross-platform).

Reads version from extension/manifest.json, bundles the production files
into dist/twmeme-extension-vX.Y.Z.zip, ready for Chrome Web Store upload.

Uses Python's stdlib zipfile so it works identically on Linux, macOS, and
Windows (where Git Bash typically has no `zip` binary).

Refuses to run if the working tree is dirty under extension/ unless --dirty
is passed, so we always know exactly what was packaged.

Usage:
    python scripts/package_extension.py
    python scripts/package_extension.py --dirty  # allow uncommitted files
"""

import json
import re
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXT = ROOT / "extension"
DIST = ROOT / "dist"

# Explicit allow-list — never auto-glob, so we can't accidentally ship
# .bak / scratch files or skip a newly-required asset silently.
INCLUDE = [
    "manifest.json",
    "db.js",
    "storage.js",
    "overlay.js",
    "content.js",
    "icons/icon-16.png",
    "icons/icon-48.png",
    "icons/icon-128.png",
]


def die(msg: str) -> None:
    print(f"ERROR: {msg}", file=sys.stderr)
    sys.exit(1)


def manifest_version() -> str:
    manifest = EXT / "manifest.json"
    if not manifest.exists():
        die(f"{manifest} not found")
    with manifest.open(encoding="utf-8") as f:
        data = json.load(f)
    version = data.get("version")
    if not version or not re.match(r"^\d+\.\d+\.\d+", str(version)):
        die(f"manifest.json has invalid version: {version!r}")
    return str(version)


def working_tree_clean() -> bool:
    try:
        subprocess.run(
            ["git", "diff", "--quiet", "--", str(EXT)],
            cwd=ROOT,
            check=True,
        )
        subprocess.run(
            ["git", "diff", "--cached", "--quiet", "--", str(EXT)],
            cwd=ROOT,
            check=True,
        )
        return True
    except subprocess.CalledProcessError:
        return False


def main() -> None:
    allow_dirty = "--dirty" in sys.argv[1:]

    if not allow_dirty and not working_tree_clean():
        print(
            "ERROR: extension/ has uncommitted changes. "
            "Commit first, or pass --dirty to skip this check.",
            file=sys.stderr,
        )
        subprocess.run(["git", "status", "--short", "--", str(EXT)], cwd=ROOT)
        sys.exit(1)

    version = manifest_version()
    DIST.mkdir(parents=True, exist_ok=True)
    zip_path = DIST / f"twmeme-extension-v{version}.zip"
    if zip_path.exists():
        zip_path.unlink()

    print(f"Packaging TWmeme extension v{version} -> {zip_path}")

    missing = [f for f in INCLUDE if not (EXT / f).exists()]
    if missing:
        die("required file(s) missing: " + ", ".join(missing))

    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for rel in INCLUDE:
            src = EXT / rel
            # Use forward-slash arcname so the zip stays portable across OSes.
            zf.write(src, arcname=rel.replace("\\", "/"))

    size_kb = zip_path.stat().st_size // 1024
    # ASCII-only output — Windows cp950/cp1252 consoles can't render emoji.
    print(f"OK packaged: {zip_path} ({size_kb} KB)")
    print("   contents:")
    with zipfile.ZipFile(zip_path) as zf:
        for info in zf.infolist():
            print(f"     {info.file_size:>8}  {info.filename}")
    print()
    print("Upload at: https://chrome.google.com/webstore/devconsole")


if __name__ == "__main__":
    main()
