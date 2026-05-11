// TWmeme overlay UI — Shadow-DOM-isolated meme picker.
//
// Rendered into a single <div> host on the page. All styling lives inside
// a shadow root so the host site's CSS (LINE, Threads, IG) can't bleed in
// or out. Visual language tracks web/DESIGN.md verbatim — coral primary,
// 奶油紙白 background, Space Grotesk + Noto Sans TC, 12px radius cards.

const HOST_ID = "twmeme-overlay-host";

const CSS = `
  :host {
    all: initial;
    position: fixed;
    z-index: 2147483647;
    font-family: "DM Sans", "Noto Sans TC", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: #1A1A1A;
  }
  .panel {
    background: #FCFAF6;
    border: 1px solid #E8E2D6;
    border-radius: 12px;
    box-shadow: 0 12px 32px rgba(26, 26, 26, 0.12), 0 2px 6px rgba(26, 26, 26, 0.06);
    padding: 12px;
    min-width: 360px;
    max-width: 440px;
    opacity: 0;
    transform: translateY(8px);
    transition: opacity 200ms cubic-bezier(0.16, 1, 0.3, 1),
                transform 200ms cubic-bezier(0.16, 1, 0.3, 1);
  }
  .panel.open {
    opacity: 1;
    transform: translateY(0);
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 13px;
    color: #6B6459;
    margin-bottom: 8px;
    padding: 0 2px;
  }
  .header .q {
    color: #1A1A1A;
    font-weight: 500;
  }
  .header .hint {
    font-size: 11px;
  }
  .header .hint kbd {
    background: #fff;
    border: 1px solid #E8E2D6;
    border-radius: 4px;
    padding: 1px 5px;
    font-family: inherit;
    font-size: 10px;
    color: #1A1A1A;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
  }
  .cell {
    position: relative;
    aspect-ratio: 1;
    border-radius: 6px;
    overflow: hidden;
    background: #fff;
    border: 1px solid #E8E2D6;
    cursor: pointer;
    transition: transform 150ms ease-out, border-color 150ms ease-out;
  }
  .cell img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .cell:hover {
    transform: translateY(-2px);
    border-color: #FFC233;
  }
  .cell.selected {
    border-color: #FF5B4B;
    border-width: 2px;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(255, 91, 75, 0.25);
  }
  .cell .platform {
    position: absolute;
    bottom: 4px;
    right: 4px;
    background: rgba(255, 255, 255, 0.92);
    color: #6B6459;
    font-size: 9px;
    padding: 1px 5px;
    border-radius: 9999px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .empty {
    padding: 24px 12px;
    text-align: center;
    color: #6B6459;
    font-size: 14px;
    line-height: 1.5;
  }
  .empty .q {
    color: #1A1A1A;
    font-weight: 500;
  }
  .empty a {
    color: #FF5B4B;
    text-decoration: none;
    font-weight: 500;
  }
  .empty a:hover {
    text-decoration: underline;
  }
  .loading {
    padding: 16px;
    text-align: center;
    color: #6B6459;
    font-size: 13px;
  }
`;

class Overlay {
  constructor() {
    this.host = null;
    this.shadow = null;
    this.panel = null;
    this.grid = null;
    this.header = null;
    this.body = null;
    this.results = [];
    this.selectedIndex = 0;
    this.isOpen = false;
    this.onPick = null;  // (meme) => void — set by controller
    this.lastInput = null;  // remembered for refocus
    this._hideTimer = null;  // pending body-clear timer from hide(); cancelled on show()
  }

  ensureMounted() {
    if (this.host) return;
    this.host = document.createElement("div");
    this.host.id = HOST_ID;
    this.shadow = this.host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = CSS;
    this.shadow.appendChild(style);

    this.panel = document.createElement("div");
    this.panel.className = "panel";
    this.shadow.appendChild(this.panel);

    this.header = document.createElement("div");
    this.header.className = "header";
    this.panel.appendChild(this.header);

    this.body = document.createElement("div");
    this.panel.appendChild(this.body);

    document.documentElement.appendChild(this.host);
  }

  show(anchorRect, query) {
    this.ensureMounted();
    // Cancel any pending body-clear timer from a hide() in flight — if user
    // re-triggers within the 200ms exit animation, we'd otherwise wipe the
    // freshly-rendered new content.
    if (this._hideTimer != null) {
      clearTimeout(this._hideTimer);
      this._hideTimer = null;
    }
    this.isOpen = true;
    this.selectedIndex = 0;
    this.results = [];
    this.lastInput = document.activeElement;

    // Position below anchor, clamped to viewport.
    const PANEL_W = 380;
    const left = Math.min(
      Math.max(8, anchorRect.left),
      window.innerWidth - PANEL_W - 8,
    );
    const top = Math.min(
      anchorRect.bottom + 6,
      window.innerHeight - 280,
    );
    this.host.style.left = left + "px";
    this.host.style.top = top + "px";

    this.renderHeader(query);
    this.renderLoading();

    // Trigger animation on next frame
    requestAnimationFrame(() => this.panel.classList.add("open"));
  }

  hide() {
    if (!this.isOpen) return;
    this.isOpen = false;
    if (this.panel) {
      this.panel.classList.remove("open");
    }
    // Allow exit animation to finish, then clear body. show() cancels this.
    this._hideTimer = setTimeout(() => {
      this._hideTimer = null;
      if (this.body) this.body.innerHTML = "";
    }, 200);
  }

  renderHeader(query) {
    this.header.innerHTML = "";
    const q = document.createElement("span");
    q.innerHTML = `<span class="q">:meme ${escapeHtml(query)}</span>`;
    const hint = document.createElement("span");
    hint.className = "hint";
    hint.innerHTML = `<kbd>↑</kbd><kbd>↓</kbd> 選 <kbd>Enter</kbd> 插入 <kbd>Esc</kbd> 關閉`;
    this.header.appendChild(q);
    this.header.appendChild(hint);
  }

  renderLoading() {
    this.body.innerHTML = `<div class="loading">搜尋中…</div>`;
  }

  renderResults(rows, query) {
    this.results = rows;
    this.selectedIndex = 0;
    this.body.innerHTML = "";

    if (rows.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.innerHTML = `搜不到 <span class="q">${escapeHtml(query)}</span><br>` +
        `<a href="https://twmeme.vercel.app/results.html?q=${encodeURIComponent(query)}" target="_blank" rel="noopener">在 TWmeme 提交建議 →</a>`;
      this.body.appendChild(empty);
      return;
    }

    this.grid = document.createElement("div");
    this.grid.className = "grid";
    rows.slice(0, 8).forEach((row, i) => {
      const cell = document.createElement("div");
      cell.className = "cell" + (i === 0 ? " selected" : "");
      cell.dataset.index = String(i);

      // DOM API instead of innerHTML so cached_url / title / platform values
      // are treated as data, not parsed as HTML. No XSS surface even if a
      // future scraper bug lets a malicious string into the row.
      const img = document.createElement("img");
      img.src = row.cached_url || "";
      img.alt = row.title || "";
      img.loading = "lazy";
      cell.appendChild(img);

      const platform = document.createElement("span");
      platform.className = "platform";
      platform.textContent = row.platform || "";
      cell.appendChild(platform);

      cell.addEventListener("mouseenter", () => this.setSelected(i));
      cell.addEventListener("click", () => this.confirm());
      this.grid.appendChild(cell);
    });
    this.body.appendChild(this.grid);
  }

  setSelected(i) {
    if (!this.grid) return;
    const cells = this.grid.querySelectorAll(".cell");
    cells.forEach((c, idx) => c.classList.toggle("selected", idx === i));
    this.selectedIndex = i;
  }

  moveSelection(delta) {
    if (!this.results.length) return;
    const next = (this.selectedIndex + delta + this.results.length) % this.results.length;
    this.setSelected(next);
  }

  confirm() {
    if (!this.results.length) return;
    const meme = this.results[this.selectedIndex];
    if (this.onPick) this.onPick(meme);
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;");
}

window.TWmemeOverlay = new Overlay();
