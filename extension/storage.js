// TWmeme — chrome.storage.local wrapper for "recent picks".
//
// Tracks the last N memes the user inserted, MRU-ordered, deduped by id.
// Read on overlay-open with empty query so the first thing the user sees is
// a familiar grid of their own greatest hits — same UX shape as the search
// results grid (overlay.js renders both via renderResults).

const RECENT_KEY = "twmeme.recent";
const RECENT_CAP = 12;

async function getRecent() {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get([RECENT_KEY], (out) => {
        const arr = Array.isArray(out?.[RECENT_KEY]) ? out[RECENT_KEY] : [];
        resolve(arr);
      });
    } catch {
      // Non-extension context (e.g. unit-test). Silently return empty.
      resolve([]);
    }
  });
}

async function pushRecent(meme) {
  if (!meme || !meme.id) return;
  const trimmed = {
    id: meme.id,
    title: meme.title || "",
    cached_url: meme.cached_url || "",
    media_type: meme.media_type || "image",
    platform: meme.platform || "",
  };
  const existing = await getRecent();
  // MRU: drop any prior entry for the same id, prepend, cap.
  const filtered = existing.filter((m) => m.id !== trimmed.id);
  filtered.unshift(trimmed);
  const next = filtered.slice(0, RECENT_CAP);
  return new Promise((resolve) => {
    try {
      chrome.storage.local.set({ [RECENT_KEY]: next }, () => resolve());
    } catch {
      resolve();
    }
  });
}

async function clearRecent() {
  return new Promise((resolve) => {
    try {
      chrome.storage.local.remove([RECENT_KEY], () => resolve());
    } catch {
      resolve();
    }
  });
}

window.TWmemeStorage = { getRecent, pushRecent, clearRecent, RECENT_CAP };
