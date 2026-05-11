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
  link.href = meme.id ? ('detail.html?id=' + encodeURIComponent(meme.id)) : 'detail.html';
  const displayName = meme.title || meme.name || '迷因';
  link.setAttribute('aria-label', displayName + ' 迷因詳細');
  if (opts.onClick) {
    link.addEventListener('click', () => opts.onClick(meme));
  }

  const thumb = document.createElement('div');
  const bgClass = ALLOWED_BGS.has(meme.bg) ? meme.bg : 't-sand';
  thumb.className = 'thumb ' + bgClass;

  if (meme.cached_url) {
    const img = document.createElement('img');
    img.src = meme.cached_url;
    img.alt = displayName;
    img.loading = 'lazy';
    img.className = 'thumb-img';
    img.addEventListener('error', () => {
      // network or 404 → fall through to emoji-style empty thumb
      img.remove();
      thumb.textContent = meme.emoji || '🖼️';
    });
    thumb.appendChild(img);
  } else {
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
  nameSpan.textContent = displayName;
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
      // mock entry without URL — keep old fake-toast behavior
      showToast('已複製「' + displayName + '」');
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
  const frag = document.createDocumentFragment();
  memes.forEach(m => frag.appendChild(renderCard(m, opts)));
  container.appendChild(frag);
}

window.TWmeme = window.TWmeme || {};
window.TWmeme.render = { renderCard, renderGrid, showToast, ALLOWED_BGS };
