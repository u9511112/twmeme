/* =============================================================================
 * TWmeme — DevTools image insertion spike
 * =============================================================================
 *
 * USAGE:
 *   1. Open LINE Web (or Threads, or Instagram) in your browser.
 *   2. CLICK INSIDE the message/comment composer so it has focus.
 *      (Important: the spike tests against `document.activeElement`.)
 *   3. Open DevTools console (F12 → Console tab).
 *   4. Paste this entire file's contents and press Enter.
 *   5. Read the verdict at the bottom of the output.
 *   6. Re-run on each platform you care about (LINE, Threads, IG separately).
 *
 * WHAT IT TESTS:
 *   Three insertion strategies, in order, against the focused composer:
 *     A) document.execCommand("insertHTML", false, '<img src=...>')
 *     B) ClipboardEvent("paste") with image blob in DataTransfer
 *     C) Plain DOM append: composer.appendChild(<img>)
 *
 *   For each one, the spike:
 *     - records composer state before
 *     - attempts the insertion
 *     - waits 500ms for the framework (LINE/Threads/IG) to react
 *     - checks whether an <img> actually appeared in the composer subtree
 *     - rolls back the change before trying the next one
 *
 * REPORT BACK with:
 *   - Platform you tested on (LINE Web / Threads / IG comments / IG DM / etc.)
 *   - Which strategy verdict was "ACCEPTED"
 *   - Any error logged for the other two
 *
 * The result rewires `extension/content.js::insertImageInto`. ~30 LOC change.
 * ============================================================================= */

(async function twmemeSpike() {
  const TEST_IMG_URL = "https://pub-26dcc45acd9349968b1ee689f0113ee1.r2.dev/memes/test-image.jpg";
  // Tiny 1x1 PNG fallback if the R2 URL isn't reachable from this page (CSP).
  const TINY_PNG_DATA_URI =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

  const log = (...args) => console.log("%c[TWmeme spike]", "color:#FF5B4B;font-weight:bold", ...args);
  const err = (...args) => console.error("%c[TWmeme spike]", "color:#FF5B4B;font-weight:bold", ...args);
  const ok  = (...args) => console.log("%c[TWmeme spike]", "color:#3DA35D;font-weight:bold", ...args);

  log("Spike v1 starting on", location.host);

  const composer = document.activeElement;
  if (!composer || composer === document.body) {
    err("No element focused. Click inside the message composer first, then re-run.");
    return;
  }

  const isCE = composer.isContentEditable;
  const isInput = composer.tagName === "TEXTAREA" || composer.tagName === "INPUT";
  if (!isCE && !isInput) {
    err(`Focused element is <${composer.tagName.toLowerCase()}>, not editable. Click inside the actual composer.`);
    return;
  }

  log("Target composer:", composer);
  log("  tagName:", composer.tagName, "| contentEditable:", composer.isContentEditable, "| input:", isInput);

  // Snapshot before each test so we can roll back.
  function snapshot() {
    return {
      html: isCE ? composer.innerHTML : null,
      value: isInput ? composer.value : null,
    };
  }
  function restore(snap) {
    if (snap.html != null) composer.innerHTML = snap.html;
    if (snap.value != null) composer.value = snap.value;
  }

  function hasImg(root) {
    if (!root) return false;
    if (root.querySelector && root.querySelector("img")) return true;
    return false;
  }

  async function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  const results = {};

  // ─── Strategy A: execCommand("insertHTML") ─────────────────────────────────
  try {
    log("--- A) document.execCommand('insertHTML') ---");
    const snap = snapshot();
    composer.focus();
    const html = `<img src="${TEST_IMG_URL}" alt="twmeme test" data-twmeme-test="A">`;
    const supported = document.execCommand("insertHTML", false, html);
    log("  execCommand returned:", supported);
    await wait(500);
    const inserted = composer.querySelector('img[data-twmeme-test="A"]');
    if (inserted) {
      ok("  ✅ A ACCEPTED — img survived in composer subtree");
      results.A = "ACCEPTED";
    } else if (hasImg(composer)) {
      log("  ⚠️ A PARTIAL — img exists but our marker was stripped (framework re-rendered)");
      results.A = "PARTIAL";
    } else {
      err("  ❌ A REJECTED — no img in composer after 500ms");
      results.A = "REJECTED";
    }
    restore(snap);
  } catch (e) {
    err("  ❌ A THREW:", e.message);
    results.A = "THREW: " + e.message;
  }

  // ─── Strategy B: synthetic paste ClipboardEvent ────────────────────────────
  try {
    log("--- B) ClipboardEvent('paste') with image blob ---");
    const snap = snapshot();
    composer.focus();

    // Fetch the data URI as a Blob so we can drop it into a DataTransfer.
    const resp = await fetch(TINY_PNG_DATA_URI);
    const blob = await resp.blob();
    const file = new File([blob], "twmeme.png", { type: "image/png" });

    const dt = new DataTransfer();
    try {
      dt.items.add(file);
    } catch {
      // Some browsers refuse DataTransfer.items.add for files outside paste handler.
    }
    const evt = new ClipboardEvent("paste", {
      clipboardData: dt,
      bubbles: true,
      cancelable: true,
    });
    const dispatched = composer.dispatchEvent(evt);
    log("  paste event dispatched:", dispatched, "| files in dt:", dt.files.length);
    await wait(800);
    if (hasImg(composer)) {
      ok("  ✅ B ACCEPTED — img appeared after paste");
      results.B = "ACCEPTED";
    } else {
      err("  ❌ B REJECTED — no img after paste");
      results.B = "REJECTED";
    }
    restore(snap);
  } catch (e) {
    err("  ❌ B THREW:", e.message);
    results.B = "THREW: " + e.message;
  }

  // ─── Strategy C: direct DOM append ─────────────────────────────────────────
  try {
    log("--- C) composer.appendChild(<img>) ---");
    const snap = snapshot();
    if (!isCE) {
      log("  ⏭ C SKIPPED — composer is <input>/<textarea>, can't appendChild HTML");
      results.C = "SKIPPED";
    } else {
      composer.focus();
      const img = document.createElement("img");
      img.src = TEST_IMG_URL;
      img.alt = "twmeme test";
      img.dataset.twmemeTest = "C";
      composer.appendChild(img);
      // Notify framework
      composer.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertFromPaste" }));
      await wait(500);
      const inserted = composer.querySelector('img[data-twmeme-test="C"]');
      if (inserted) {
        ok("  ✅ C ACCEPTED — img survived");
        results.C = "ACCEPTED";
      } else if (hasImg(composer)) {
        log("  ⚠️ C PARTIAL — img exists but marker stripped");
        results.C = "PARTIAL";
      } else {
        err("  ❌ C REJECTED — img was stripped within 500ms");
        results.C = "REJECTED";
      }
      restore(snap);
    }
  } catch (e) {
    err("  ❌ C THREW:", e.message);
    results.C = "THREW: " + e.message;
  }

  // ─── Verdict ───────────────────────────────────────────────────────────────
  log("=========================================================");
  log("VERDICT for", location.host + " (composer:", composer.tagName, "ce=" + composer.isContentEditable + ")");
  log("  A) execCommand insertHTML:", results.A);
  log("  B) ClipboardEvent paste:  ", results.B);
  log("  C) DOM appendChild:       ", results.C);
  log("=========================================================");

  const winner =
    Object.entries(results).find(([_, v]) => v === "ACCEPTED")?.[0] ||
    Object.entries(results).find(([_, v]) => v === "PARTIAL")?.[0];

  if (winner) {
    ok(`WINNER on ${location.host}: strategy ${winner}`);
    log("Report back with: platform + winner letter + any THROW messages above.");
  } else {
    err(`NO WINNER on ${location.host} — none of the 3 APIs survived. Report all 3 result lines back.`);
    log("Possible next moves: investigate framework's own paste handler, or try sending Ctrl+V via CDP.");
  }
})();
