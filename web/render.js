// TWmeme — shared DOM render helpers.
//
// renderCard(meme) accepts both shapes:
//   - DB row:        { id, title, cached_url, media_type, platform }
//   - Mock fallback: { name, emoji, bg, quality, tall }
// Real images get an <img>; mock entries fall back to emoji + color block.

const ALLOWED_BGS = new Set([
  't-coral', 't-mustard', 't-sage', 't-sky', 't-plum',
  't-sand', 't-mint', 't-rose', 't-steel',
]);

function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 1500);
}

function renderCard(meme, opts) {
  opts = opts || {};
  const wrap = document.createElement('article');
  wrap.className = 'card-wrap' + (meme.tall ? ' tall' : '');

  const link = document.createElement('a');
  link.className = 'card';
  link.href = meme.id ? ('/meme/' + encodeURIComponent(meme.id)) : '/';
  const displayName = meme.title || meme.name || '迷因';
  link.setAttribute('aria-label', displayName + ' 迷因詳細');
  if (opts.onClick) {
    link.addEventListener('click', () => opts.onClick(meme));
  }

  const thumb = document.createElement('div');
  const bgClass = ALLOWED_BGS.has(meme.bg) ? meme.bg : 't-sand';
  thumb.className = 'thumb ' + bgClass;

  const primaryUrl = meme.cached_url || meme.media_url;
  const fallbackUrl = (meme.cached_url && meme.media_url && meme.cached_url !== meme.media_url) ? meme.media_url : null;

  if (primaryUrl) {
    const img = document.createElement('img');
    img.alt = displayName;
    img.className = 'thumb-img';
    // Eager loading for the first 8 items on screen, lazy load for the rest
    if (typeof opts.index === 'number' && opts.index >= 8) {
      img.loading = 'lazy';
    }

    img.addEventListener('load', () => {
      thumb.classList.add('loaded');
    });

    let attemptedFallback = false;
    img.addEventListener('error', () => {
      if (fallbackUrl && !attemptedFallback) {
        attemptedFallback = true;
        img.src = fallbackUrl;
      } else {
        img.remove();
        thumb.classList.add('loaded');
        thumb.textContent = meme.emoji || '🖼️';
      }
    });

    img.src = primaryUrl;
    // Check if already completed (cached by browser)
    if (img.complete && img.naturalWidth !== 0) {
      thumb.classList.add('loaded');
    }
    thumb.appendChild(img);
  } else {
    thumb.classList.add('loaded');
    thumb.textContent = meme.emoji || '🖼️';
  }

  if (meme.quality) {
    const badge = document.createElement('span');
    badge.className = 'quality-badge';
    badge.textContent = meme.quality;
    thumb.appendChild(badge);
  }

  const caption = document.createElement('div');
  caption.className = 'caption';
  const nameSpan = document.createElement('span');
  nameSpan.className = 'name';

  if (opts.query && typeof opts.query === 'string' && opts.query.trim()) {
    const q = opts.query.trim();
    const escapedQ = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp('(' + escapedQ + ')', 'gi');
    const parts = displayName.split(regex);
    nameSpan.replaceChildren();
    parts.forEach(part => {
      if (part.toLowerCase() === q.toLowerCase()) {
        const mark = document.createElement('mark');
        mark.className = 'highlight-term';
        mark.textContent = part;
        nameSpan.appendChild(mark);
      } else if (part) {
        nameSpan.appendChild(document.createTextNode(part));
      }
    });
  } else {
    nameSpan.textContent = displayName;
  }

  caption.appendChild(nameSpan);

  link.appendChild(thumb);
  link.appendChild(caption);

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'copy-ghost';
  copyBtn.textContent = '複製';
  copyBtn.dataset.meme = displayName;
  copyBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const url = meme.cached_url || meme.media_url;
    if (url) {
      try {
        await navigator.clipboard.writeText(url);
        showToast('已複製「' + displayName + '」連結');
      } catch (_) {
        showToast('複製失敗、長按圖片用瀏覽器複製');
      }
    } else {
      // mock entry without URL
      showToast('此卡片暫無連結可複製');
    }
    if (opts.onCopy) opts.onCopy(meme);
  });

  wrap.appendChild(link);
  wrap.appendChild(copyBtn);
  return wrap;
}

function renderGrid(container, memes, opts) {
  if (!container) return;
  container.replaceChildren();
  const isMasonry = container.classList.contains('masonry');
  const frag = document.createDocumentFragment();
  memes.forEach((m, idx) => {
    // Break monotonous card grid in dynamic masonry
    const cardOpts = { ...opts, index: idx };
    const memeData = { ...m };
    if (isMasonry && memeData.tall === undefined) {
      memeData.tall = (idx % 5 === 1 || idx % 7 === 3);
    }
    frag.appendChild(renderCard(memeData, cardOpts));
  });
  container.appendChild(frag);
}

window.TWmeme = window.TWmeme || {};
window.TWmeme.render = { renderCard, renderGrid, showToast, ALLOWED_BGS };
