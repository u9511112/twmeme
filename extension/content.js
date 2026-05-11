// TWmeme content script (W1 skeleton).
//
// Listens for `:meme <query>` typed into any contenteditable or textarea.
// On detection: queries Neon, console.log()s top 5. No UI yet — that's W2.
//
// Trigger pattern: `:meme<space>` opens capture; user types query; Enter or
// `:meme<space>...<space>` (no Enter, just trailing space) fires the search.
// Escape cancels. For W1 we keep it simple: fire on Enter only.

const TRIGGER = /:meme\s+([^\n]+?)\s*$/;

function getTextAt(el) {
  if (el.tagName === "TEXTAREA" || el.tagName === "INPUT") {
    return el.value;
  }
  if (el.isContentEditable) {
    return el.innerText;
  }
  return null;
}

async function handleEnter(el, ev) {
  const text = getTextAt(el);
  if (text == null) return;
  const m = TRIGGER.exec(text);
  if (!m) return;

  ev.preventDefault();
  ev.stopPropagation();

  const query = m[1].trim();
  console.log("[TWmeme] :meme query =", JSON.stringify(query));

  try {
    const t0 = performance.now();
    const rows = await window.TWmemeDB.searchMemes(query, 5);
    const dt = Math.round(performance.now() - t0);
    console.log(`[TWmeme] ${rows.length} results in ${dt}ms:`);
    for (const r of rows) {
      console.log(`  [${r.platform}] ${r.title?.slice(0, 30) || "(no title)"} → ${r.cached_url}`);
    }
    if (rows.length === 0) {
      console.log("[TWmeme] (no matches — try a different keyword)");
    }
  } catch (e) {
    console.error("[TWmeme] query failed:", e);
  }
}

document.addEventListener("keydown", (ev) => {
  if (ev.key !== "Enter") return;
  if (ev.shiftKey) return;  // Shift+Enter = newline, don't intercept
  const el = ev.target;
  if (!el || !(el instanceof HTMLElement)) return;
  if (el.tagName !== "TEXTAREA" && el.tagName !== "INPUT" && !el.isContentEditable) return;
  handleEnter(el, ev);
}, true);

console.log("[TWmeme] content script loaded on", location.host);
