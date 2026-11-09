// TWmeme — zh/en UI switch. Default is zh; the choice is kept in localStorage and a reload applies it.
// English mode swaps exact UI strings (text nodes + aria-label/placeholder/title) via the table below and
// watches DOM changes so dynamically rendered text and toasts are translated too. Meme titles/OCR/articles stay Chinese.
(function () {
  var KEY = 'tw_lang';
  function get() { try { return localStorage.getItem(KEY) === 'en' ? 'en' : 'zh'; } catch (e) { return 'zh'; } }
  function set(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }
  var lang = get();
  // Loaded synchronously in <head>: hide the page right away in English mode so the Chinese source never flashes.
  // run() reveals it after translating; the timer is a fallback so a failure can never leave the page blank.
  var root = document.documentElement;
  function reveal() { root.style.visibility = ''; }
  if (lang === 'en') { root.style.visibility = 'hidden'; setTimeout(reveal, 1000); }

  function addToggle() {
    var host = document.querySelector('.nav-links') || document.querySelector('.site-header');
    if (!host) return;
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'lang-toggle'; b.textContent = lang === 'en' ? '中文' : 'EN';
    b.lang = lang === 'en' ? 'zh-Hant' : 'en';
    b.setAttribute('aria-label', lang === 'en' ? '切換成中文' : 'Switch to English');
    b.addEventListener('click', function () { set(lang === 'en' ? 'zh' : 'en'); location.reload(); });
    host.appendChild(b);
  }

  // English users can't search by English keywords (index is Chinese): say so under the home search box.
  function addHint() {
    var f = document.querySelector('.hero .searchbox');
    if (!f) return;
    var p = document.createElement('p');
    p.className = 'lang-hint';
    p.textContent = 'Search works best in Chinese — try the category chips below. The interface is in English; meme content stays Chinese.';
    f.insertAdjacentElement('afterend', p);
  }

  var EN = {
    // header / nav / footer
    '跳至主要內容': 'Skip to main content', '指南': 'Guide', '指南專題': 'Guides', '關於我們': 'About', '意見回饋': 'Feedback',
    '贊助支持': 'Support us', '使用指南': 'Guide', '聯絡我們': 'Contact', '服務條款': 'Terms', '使用條款': 'Terms',
    '隱私權政策': 'Privacy', 'DMCA 侵權通報': 'DMCA', '著作權申訴': 'Copyright claims', '贊助商廣告 · Advertisement': 'Sponsored · Advertisement',
    '© 2026 TWmeme 迷因搜 ·': '© 2026 TWmeme ·', '台灣繁體中文迷因搜尋引擎 ·': 'Taiwanese meme search ·',
    '© 2026 TWmeme 迷因搜 · 台灣繁體中文迷因搜尋引擎 ·': '© 2026 TWmeme · Taiwanese meme search ·',
    'TWmeme — 找到那張你記得但搜不到的迷因': 'TWmeme — Find the meme you remember but can’t name',
    // home
    '找到那張你記得': 'Find the meme you remember', '但搜不到的迷因': "but can't find by name",
    '輸入你記得的關鍵字、人名、或標題片段': 'Type a keyword, a name, or part of the title', '搜尋迷因關鍵字': 'Search memes', '搜尋': 'Search',
    '按情感': 'By mood', '按角色': 'By character', '二次元': 'Anime & games', '生活情境': 'Daily life', '梗圖類型': 'Meme type',
    '更多分類 ▾': 'More categories ▾', '收合分類 ▴': 'Fewer categories ▴',
    '🔥 近期熱門': '🔥 Trending', '每 3 天自動更新': 'Updated every 3 days', '👀 最多人氣': '👀 Most popular', '🆕 最新收錄': '🆕 Latest',
    '看全部 →': 'See all →', '📰 迷因文化專題與指南': '📰 Meme culture guides', '💬 常見問題': '💬 FAQ',
    'TWmeme 是什麼？': 'What is TWmeme?', '如何搜尋迷因？': 'How do I search?', '圖片來源來自哪裡？': 'Where do the images come from?',
    '可以免費下載或複製連結嗎？': 'Can I download or copy links for free?',
    '專門搜尋台灣繁體中文迷因圖片的免費網頁工具。輸入你記得的關鍵字、角色名或台詞片段，就能快速找到那張圖並一鍵複製或下載。':
      'A free web tool for finding Taiwanese Traditional Chinese memes. Type a keyword, character name or a line from the meme to find it, then copy or download it in one click.',
    '在首頁搜尋框輸入印象中的關鍵字（如「傻眼」、「統神」、「吉伊卡哇」），或直接點選上方的分類標籤即可探索熱門梗圖。':
      'Type a keyword you remember into the search box (e.g. 傻眼, 統神, 吉伊卡哇), or tap a category chip above to explore popular memes. Search keywords are in Chinese.',
    '收錄各大公開網路討論區（PTT、Dcard、巴哈姆特等）之熱門迷因，經由演算法去重與分類整理。':
      'Popular memes from public forums (PTT, Dcard, Bahamut, etc.), de-duplicated and organised automatically.',
    '可以，所有迷因均支援一鍵複製圖片連結至 LINE、Discord、IG 或直接下載原圖。':
      'Yes. Every meme supports one-click link copying for LINE, Discord or IG, or downloading the original image.',
    '🍜 請小編吃泡麵': '🍜 Buy the editor noodles', '贊助支持 TWmeme': 'Support TWmeme',
    // chips (word before the emoticon)
    '崩潰': 'Meltdown', '傻眼': 'Speechless', '疑惑': 'Confused', '開心': 'Happy', '生氣': 'Angry', '尷尬': 'Awkward', '無奈': 'Helpless', '發瘋': 'Going nuts',
    '貓咪': 'Cats', '柴犬': 'Shiba', '水豚': 'Capybara', '統神': 'Tong God', '館長': 'Director Guan', '國動': 'Guodong', '杰哥': 'Jie Ge', '微笑老頭': 'Smiling old man',
    '吉伊卡哇': 'Chiikawa', '芙莉蓮': 'Frieren', '熱血動漫': 'Shonen anime', '電競遊戲': 'Gaming',
    '社畜職場': 'Office life', '校園考試': 'School & exams', '感情戀愛': 'Love life', '日常生活': 'Everyday', '地獄梗': 'Dark humor', '熱門時事': 'Current events',
    '諧音雙關': 'Puns', '文字對話': 'Chat text', '四格漫畫': '4-panel comics', '經典模板': 'Classic templates', '諧音': 'Puns',
    // results
    '搜尋結果': 'Search results', '返回首頁': 'Back to home', '返回': 'Back', '所有格式': 'All formats', '靜態圖片': 'Still images', '動態 GIF': 'Animated GIFs',
    '相關度排序': 'Most relevant', '最新發佈': 'Newest', '熱門程度': 'Most popular', '找到': 'Found', '張': 'results', '此篩選條件': 'this filter',
    '沒找到「': 'No results for “', '」？': '”?', '送出': 'Send', '描述你想找的迷因': 'Describe the meme you want', '描述一下你想找的迷因、我們收集起來補上。': "Describe the meme you're looking for and we'll try to add it.",
    '例：那張柴犬被雷打到的反應圖、或是那個館長跪的梗': 'e.g. the Shiba hit by lightning, or the director kneeling meme',
    '多寫幾個字比較好找': 'A few more words will help', '收到、晚點補上': "Got it — we'll add it soon", '剛剛已收到、不用再送一次': "Already received — no need to resend",
    '送出失敗、稍候再試': 'Failed to send, try again later',
    // detail / meme page
    '搜更多迷因': 'Search more memes', '載入中...': 'Loading...', '複製連結': 'Copy link', '下載原圖': 'Download original', '分享': 'Share', '看原文': 'View source',
    '🍜 贊助小編': '🍜 Support the editor', '更多迷因': 'More memes', '回首頁 →': 'Home →', '📖 迷因指南': '📖 Meme guide', '複製': 'Copy',
    '找不到這張迷因': 'Meme not found', '可能已被移除、或連結錯誤。': 'It may have been removed, or the link is wrong.', '回首頁繼續找': 'Back to home',
    '沒有可複製的連結': 'No link to copy', '已複製連結到剪貼簿': 'Link copied to clipboard', '複製失敗、長按圖片用瀏覽器複製': 'Copy failed — long-press the image to copy',
    '沒有可下載的圖片': 'No image to download', '開啟下載': 'Starting download', '已複製這頁連結': 'Page link copied', '長按網址列複製': 'Long-press the address bar to copy',
    '此卡片暫無連結可複製': 'No link to copy on this card', '巴哈姆特': 'Bahamut', '網路討論區': 'Forum', '熱門論壇': 'Forum', '社群平台': 'Social media',
    '💡 推薦聊天場合與使用指南': '💡 Where to use it', '標準規格': 'Standard size',
    '📝 畫面核心文字：': '📝 Text in the image:', '🎯 視覺語意解析：': '🎯 Visual description:',
    '© 2026 Geek Tech 極客科技. All rights reserved.': '© 2026 Geek Tech. All rights reserved.'
  };
  // Dynamic strings with numbers / names
  var RULES = [
    [/^早期版本、目前收錄 ([\d,]+) 張迷因梗圖。搜不到的告訴我們、會補上。$/, 'Early version — $1 memes indexed. Can’t find one? Tell us and we’ll add it.'],
    [/^看全部 (\d+) 篇專題 →$/, 'See all $1 guides →'],
    [/^沒找到「(.*)」？$/, 'No results for “$1”?'],
    [/^來源：(.*)$/, 'Source: $1'],
    [/^已複製「(.*)」連結$/, 'Copied link for “$1”'],
    [/^(.*) 迷因詳細$/, '$1 — meme details'],
    [/^📅 收錄日期：(.+?) · 📐 原始畫質：標準規格 · 🔓.*$/, 'Added: $1 · Size: standard · Copyright belongs to the original author'],
    [/^📅 收錄日期：(.+?) · 📐 原始畫質：(.+?) · 🔓.*$/, 'Added: $1 · Size: $2 · Copyright belongs to the original author']
  ];

  function tr(s) {
    var t = s.trim();
    if (!t || !/[㐀-鿿]/.test(t)) return null;
    var lead = s.slice(0, s.indexOf(t)), tail = s.slice(s.indexOf(t) + t.length);
    if (EN[t] !== undefined) return lead + EN[t] + tail;
    for (var i = 0; i < RULES.length; i++) {
      if (RULES[i][0].test(t)) return lead + t.replace(RULES[i][0], RULES[i][1]) + tail;
    }
    var ti = t.match(/^(.*) — TWmeme( 迷因)?$/); // page titles (before the chip rule, which would grab the first word)
    if (ti) { var h = tr(ti[1]); return lead + (h === null ? ti[1] : h) + ' — TWmeme' + tail; }
    var sp = t.indexOf(' '); // chip label + emoticon
    if (sp > 0 && EN[t.slice(0, sp)] !== undefined) return lead + EN[t.slice(0, sp)] + t.slice(sp) + tail;
    return null;
  }

  var ATTRS = ['aria-label', 'placeholder', 'title'], SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, NOSCRIPT: 1 };
  function doNode(n) {
    if (n.nodeType === 3) {
      if (n.parentNode && SKIP[n.parentNode.nodeName]) return;
      var r = tr(n.nodeValue); if (r !== null && r !== n.nodeValue) n.nodeValue = r;
    } else if (n.nodeType === 1 && !SKIP[n.nodeName]) {
      ATTRS.forEach(function (a) { if (n.hasAttribute(a)) { var r = tr(n.getAttribute(a)); if (r !== null) n.setAttribute(a, r); } });
      for (var c = n.firstChild; c; c = c.nextSibling) doNode(c);
    }
  }
  function run() {
    try {
      addToggle();
      if (lang !== 'en') return;
      root.lang = 'en';
      var r = tr(document.title); if (r !== null) document.title = r;
      doNode(document.body);
      addHint();
      new MutationObserver(function (ms) {
        ms.forEach(function (m) {
          if (m.type === 'characterData') doNode(m.target);
          else m.addedNodes.forEach(doNode);
        });
      }).observe(document.body, { childList: true, subtree: true, characterData: true });
    } finally { reveal(); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();
