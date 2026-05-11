// TWmeme content script (W2 controller).
//
// Watches text inputs / contenteditables for `:meme <query>` patterns.
// On match, debounce 200ms, query Neon, open overlay anchored below the
// input. Keyboard nav inside overlay. On confirm, call insertImage() —
// which is stubbed pending the DevTools spike on which API LINE Web /
// Threads / IG actually accept.

const TRIGGER = /:meme\s+([^\n]+?)\s*$/;
const DEBOUNCE_MS = 200;

let debounceTimer = null;
let currentInput = null;
let currentQuery = "";
let inflightAbort = null;

function getText(el) {
  if (!el) return null;
  if (el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && el.type !== "password")) {
    return el.value;
  }
  if (el.isContentEditable) {
    return el.innerText;
  }
  return null;
}

function getCaretText(el) {
  // For W2 we don't bother computing the caret-context substring — we just
  // look at the trailing portion of the input. Good enough for trigger
  // detection; refine in W3 if multi-line inputs become a problem.
  return getText(el);
}

function findTrigger(text) {
  if (text == null) return null;
  const m = TRIGGER.exec(text);
  return m ? m[1].trim() : null;
}

function isEligibleTarget(el) {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el.tagName === "TEXTAREA") return true;
  if (el.tagName === "INPUT") return el.type !== "password" && el.type !== "hidden";
  if (el.isContentEditable) return true;
  return false;
}

async function runQuery(query) {
  if (inflightAbort) inflightAbort.abort();
  const ctrl = new AbortController();
  inflightAbort = ctrl;
  try {
    const rows = await window.TWmemeDB.searchMemes(query, 8, { signal: ctrl.signal });
    if (ctrl.signal.aborted) return;
    window.TWmemeOverlay.renderResults(rows, query);
  } catch (e) {
    if (ctrl.signal.aborted) return;
    if (e?.name === "AbortError") return;
    console.error("[TWmeme] query failed:", e);
    window.TWmemeOverlay.renderResults([], query);
  } finally {
    if (inflightAbort === ctrl) inflightAbort = null;
  }
}

function openFor(el, query) {
  currentInput = el;
  currentQuery = query;
  const rect = el.getBoundingClientRect();
  window.TWmemeOverlay.show(rect, query);
  // Slight delay so the "searching…" state is briefly visible if the
  // query is fast — avoids flash-of-empty.
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => runQuery(query), DEBOUNCE_MS);
}

function closeOverlay() {
  window.TWmemeOverlay.hide();
  currentInput = null;
  currentQuery = "";
  if (inflightAbort) inflightAbort.abort();
}

// ─── Image insertion (STUB — pending W1 DevTools spike) ──────────────────
//
// The spike will tell us which of these LINE Web / Threads / IG accepts:
//   A) document.execCommand("insertHTML", false, '<img src="...">')
//   B) ClipboardEvent with image blob in dataTransfer
//   C) Direct DOM manipulation on the contenteditable
//
// Until then, we stub: remove the `:meme <query>` text and console.log
// what would have been inserted.
//
// ⚠️ DANGEROUS STUB BEHAVIOR — contenteditable wipe ⚠️
// The contenteditable branch currently does `el.innerText = stripped`,
// which wipes ALL descendants of the input element — mentions, emoji
// glyphs, link spans, draft attachments, formatting. If you test this on
// LINE Web / Threads / IG with rich content already in the composer,
// your draft will be replaced with plain text only. This is acceptable
// while spiking (you're testing with an empty input anyway), but the
// real `insertImageInto()` must preserve the rest of the composer state.
async function insertImageInto(el, meme) {
  console.log("[TWmeme] would insert", meme.cached_url, "into", el);

  // Remove the trailing `:meme <query>` so the input is back to clean state.
  const text = getText(el);
  if (text != null) {
    const stripped = text.replace(TRIGGER, "");
    if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
      el.value = stripped;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    } else if (el.isContentEditable) {
      // WARNING: wipes other content. Replace with structure-preserving
      // logic once W2 spike picks the real insertion API.
      el.innerText = stripped;
    }
  }

  // TODO(W2-spike): replace this stub with the API picked by the spike.
  // Make sure the replacement (a) preserves existing rich content in the
  // composer and (b) only removes the `:meme <query>` trigger substring.
}

function handleInput(ev) {
  const el = ev.target;
  if (!isEligibleTarget(el)) return;

  const text = getCaretText(el);
  const query = findTrigger(text);

  if (query == null) {
    if (window.TWmemeOverlay.isOpen) closeOverlay();
    return;
  }

  // Open or re-query
  if (!window.TWmemeOverlay.isOpen || el !== currentInput) {
    openFor(el, query);
  } else if (query !== currentQuery) {
    currentQuery = query;
    window.TWmemeOverlay.renderHeader(query);
    window.TWmemeOverlay.renderLoading();
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => runQuery(query), DEBOUNCE_MS);
  }
}

function handleKeydown(ev) {
  if (!window.TWmemeOverlay.isOpen) return;
  // Overlay grid is 4 columns. ↑↓ moves between rows (±GRID_COLS),
  // ←→ moves between columns within a row (±1).
  const GRID_COLS = 4;
  switch (ev.key) {
    case "ArrowDown":
      ev.preventDefault();
      ev.stopPropagation();
      window.TWmemeOverlay.moveSelection(+GRID_COLS);
      break;
    case "ArrowUp":
      ev.preventDefault();
      ev.stopPropagation();
      window.TWmemeOverlay.moveSelection(-GRID_COLS);
      break;
    case "ArrowRight":
      ev.preventDefault();
      ev.stopPropagation();
      window.TWmemeOverlay.moveSelection(+1);
      break;
    case "ArrowLeft":
      ev.preventDefault();
      ev.stopPropagation();
      window.TWmemeOverlay.moveSelection(-1);
      break;
    case "Enter":
      ev.preventDefault();
      ev.stopPropagation();
      window.TWmemeOverlay.confirm();
      break;
    case "Escape":
      ev.preventDefault();
      ev.stopPropagation();
      closeOverlay();
      break;
  }
}

function handleClickOutside(ev) {
  if (!window.TWmemeOverlay.isOpen) return;
  if (ev.target.closest("#" + "twmeme-overlay-host")) return;  // click inside overlay
  if (ev.target === currentInput) return;
  closeOverlay();
}

// Hook overlay → controller
window.TWmemeOverlay.onPick = async (meme) => {
  const el = currentInput;
  closeOverlay();
  if (el) await insertImageInto(el, meme);
};

document.addEventListener("input", handleInput, true);
document.addEventListener("keydown", handleKeydown, true);
document.addEventListener("mousedown", handleClickOutside, true);

console.log("[TWmeme] content script v0.0.2 loaded on", location.host);
