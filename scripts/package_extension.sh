#!/usr/bin/env bash
# =============================================================================
# TWmeme — Chrome extension packaging script
# =============================================================================
# Reads version from extension/manifest.json, bundles the production files
# into dist/twmeme-extension-vX.Y.Z.zip, ready for Chrome Web Store upload.
#
# Excludes README, PRIVACY.md, icons/_generate.py, and any *.bak/*.orig that
# might be lying around. Refuses to run if the working tree is dirty under
# extension/ (so we always know exactly what was packaged).
#
# Usage:
#   bash scripts/package_extension.sh           # normal
#   bash scripts/package_extension.sh --dirty   # allow uncommitted files
# =============================================================================

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
EXT="$ROOT/extension"
DIST="$ROOT/dist"

if [ ! -f "$EXT/manifest.json" ]; then
  echo "ERROR: $EXT/manifest.json not found" >&2
  exit 1
fi

ALLOW_DIRTY="${1:-}"
if [ "$ALLOW_DIRTY" != "--dirty" ]; then
  if ! git diff --quiet -- "$EXT" || ! git diff --cached --quiet -- "$EXT"; then
    echo "ERROR: extension/ has uncommitted changes. Commit first, or pass --dirty to skip this check." >&2
    git status --short -- "$EXT" >&2
    exit 1
  fi
fi

VERSION=$(grep -E '"version"\s*:' "$EXT/manifest.json" | head -1 | sed -E 's/.*"version"\s*:\s*"([^"]+)".*/\1/')
if [ -z "$VERSION" ]; then
  echo "ERROR: could not parse version from manifest.json" >&2
  exit 1
fi

mkdir -p "$DIST"
ZIP="$DIST/twmeme-extension-v$VERSION.zip"
rm -f "$ZIP"

echo "Packaging TWmeme extension v$VERSION → $ZIP"

# Files to include — explicit allow-list, not exclude-list, so we can't
# accidentally ship a stray .bak or test file.
INCLUDE=(
  "manifest.json"
  "db.js"
  "storage.js"
  "overlay.js"
  "content.js"
  "icons/icon-16.png"
  "icons/icon-48.png"
  "icons/icon-128.png"
)

# Verify every included file actually exists before zipping.
for f in "${INCLUDE[@]}"; do
  if [ ! -f "$EXT/$f" ]; then
    echo "ERROR: required file missing: extension/$f" >&2
    exit 1
  fi
done

(cd "$EXT" && zip -r "$ZIP" "${INCLUDE[@]}" >/dev/null)

SIZE_KB=$(du -k "$ZIP" | cut -f1)
echo "✅ packaged: $ZIP ($SIZE_KB KB)"
echo "   contents:"
unzip -l "$ZIP" | sed 's/^/     /'
echo ""
echo "Upload at: https://chrome.google.com/webstore/devconsole"
