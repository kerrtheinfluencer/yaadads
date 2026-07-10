/* ═══════════════════════════════════════════════════════════
   FULLSCREEN LIGHTBOX §LIGHTBOX
═══════════════════════════════════════════════════════════ */
let _lbPhotos = [];
let _lbIndex = 0;

function openLightbox(photos, startIndex) {
  _lbPhotos = photos || [];
  _lbIndex = startIndex || 0;
  if (!_lbPhotos.length) return;
  const lb = document.getElementById('lightbox');
  lb.classList.add('open');
  document.body.style.overflow = 'hidden';
  renderLightbox();
}

function closeLightbox() {
  document.getElementById('lightbox').classList.remove('open');
  document.body.style.overflow = '';
  if (!document.querySelector('.overlay.open')) document.body.style.overflow = '';
}

function lbNav(dir) {
  _lbIndex = (_lbIndex + dir + _lbPhotos.length) % _lbPhotos.length;
  renderLightbox();
}

function renderLightbox() {
  const img = document.getElementById('lbImg');
  img.src = _lbPhotos[_lbIndex];
  img.style.animation = 'none'; img.offsetHeight; img.style.animation = '';

  document.getElementById('lbCounter').textContent = (_lbIndex+1) + ' / ' + _lbPhotos.length;

  // Nav buttons
  document.getElementById('lbPrev').style.display = _lbPhotos.length > 1 ? '' : 'none';
  document.getElementById('lbNext').style.display = _lbPhotos.length > 1 ? '' : 'none';

  // Dots
  const dots = document.getElementById('lbDots');
  if (_lbPhotos.length > 1 && _lbPhotos.length <= 10) {
    dots.innerHTML = _lbPhotos.map(function(_, i) {
      return '<span class="lightbox-dot' + (i===_lbIndex?' active':'') + '" onclick="lbGoTo('+i+')"></span>';
    }).join('');
    dots.style.display = 'flex';
  } else { dots.style.display = 'none'; }
}

function lbGoTo(i) { _lbIndex = i; renderLightbox(); }

// Keyboard navigation
document.addEventListener('keydown', function(e) {
  if (!document.getElementById('lightbox').classList.contains('open')) return;
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowLeft') lbNav(-1);
  if (e.key === 'ArrowRight') lbNav(1);
});

// Swipe support for lightbox
(function() {
  let sx=0;
  const lb = document.getElementById('lightbox');
  if (!lb) return;
  lb.addEventListener('touchstart', function(e) { sx=e.touches[0].clientX; }, {passive:true});
  lb.addEventListener('touchend', function(e) {
    const dx = e.changedTouches[0].clientX - sx;
    if (Math.abs(dx) > 50) lbNav(dx < 0 ? 1 : -1);
  }, {passive:true});
})();

/* ═══════════════════════════════════════════════════════════
   FLOATING AI CHAT (desktop widget) §FLOAT-CHAT
═══════════════════════════════════════════════════════════ */
let _floatOpen = false;
let _floatHistory = [];

function toggleFloatChat() {
  // On mobile — use the bottom sheet instead
  if (window.innerWidth <= 640) {
    _floatOpen = false;
    document.getElementById('aiFloatChat').classList.remove('open');
    document.getElementById('aiFab').style.display = '';
    openAiSheet();
    return;
  }
  _floatOpen = !_floatOpen;
  document.getElementById('aiFloatChat').classList.toggle('open', _floatOpen);
  document.getElementById('aiFab').style.display = _floatOpen ? 'none' : '';
  if (_floatOpen) setTimeout(function(){ document.getElementById('floatInput')?.focus(); }, 300);
}

function floatSubmit() {
  const inp = document.getElementById('floatInput');
  const query = (inp?.value||'').trim();
  if (!query) return;
  inp.value = '';

  const msgs = document.getElementById('floatMsgs');

  // User bubble
  const userEl = document.createElement('div');
  userEl.className = 'sheet-msg-user';
  userEl.textContent = query;
  msgs.appendChild(userEl);

  // Typing indicator
  const typing = document.createElement('div');
  typing.className = 'sheet-typing';
  typing.innerHTML = '<span></span><span></span><span></span>';
  msgs.appendChild(typing);
  msgs.scrollTop = msgs.scrollHeight;

  requestAnimationFrame(function() {
    setTimeout(function() {
      try {
        const result = YaadBrain.process(query, _floatHistory);
        typing.remove();

        const aiEl = document.createElement('div');
        aiEl.className = 'sheet-msg-ai';
        const msgText = (result.message||'').replace(/\n/g, '<br>');
        aiEl.innerHTML = '<div class="sheet-msg-text">' + msgText + '</div>';

        if (result.type === 'search' && result.results && result.results.length) {
          const resWrap = document.createElement('div');
          resWrap.className = 'sheet-results';
          result.results.slice(0,4).forEach(function(ad) {
            const cat = CATS.find(function(c){ return c.id===ad.category; });
            const card = document.createElement('div');
            card.className = 'sheet-result-card';
            const thumb = ad.image
              ? '<img class="src-thumb" src="'+ad.image+'" alt="" loading="lazy" onerror="this.style.display=\'none\'">'
              : '<div class="src-icon">'+(cat?cat.icon:'📦')+'</div>';
            card.innerHTML = thumb +
              '<div class="src-info">' +
                '<div class="src-price">J$'+fmtN(ad.price)+'</div>' +
                '<div class="src-title">'+escHtml(ad.title)+'</div>' +
                '<div class="src-meta">📍 '+ad.parish+'</div>' +
              '</div><div class="src-arrow">›</div>';
            card.onclick = function() { toggleFloatChat(); setTimeout(function(){ openDetail(ad.id); },200); };
            resWrap.appendChild(card);
          });
          if (result.allResults && result.allResults.length > 4) {
            const more = document.createElement('button');
            more.className = 'sheet-view-all';
            more.textContent = 'View all ' + result.allResults.length + ' results →';
            more.onclick = function() {
              toggleFloatChat();
              activeF = (result.filters?.categories?.length===1) ? result.filters.categories[0] : 'all';
              searchQ = (result.filters?.keywords||[]).join(' ');
              window._aiFilters = result.filters;
              renderCats(); renderHome(); delete window._aiFilters;
              showAiResponse(result.message, result.allResults.length);
              scrollToResults();
            };
            resWrap.appendChild(more);
          }
          aiEl.appendChild(resWrap);
        }

        msgs.appendChild(aiEl);
        _floatHistory.push({role:'user',text:query},{role:'ai',text:result.message});
        if (_floatHistory.length > 10) _floatHistory = _floatHistory.slice(-10);
      } catch(e) {
        typing.remove();
        const errEl = document.createElement('div');
        errEl.className = 'sheet-msg-ai';
        errEl.innerHTML = '<div class="sheet-msg-text">Something went wrong — try rephrasing! 🔍</div>';
        msgs.appendChild(errEl);
      }
      msgs.scrollTop = msgs.scrollHeight;
      document.getElementById('floatInput')?.focus();
    }, 200);
  });
}

/* ═══════════════════════════════════════════════════════════
   PWA INSTALL PROMPT §PWA
═══════════════════════════════════════════════════════════ */
let _pwaPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); _pwaPrompt = e;
  if (localStorage.getItem('ya_pwa_dismissed')) return;
  // Track visits — show on 2nd visit after 4s, not 30s on first visit
  var visits = parseInt(localStorage.getItem('ya_visits') || '0') + 1;
  localStorage.setItem('ya_visits', visits);
  var delay = visits >= 2 ? 4000 : 45000;
  setTimeout(() => document.getElementById('pwaBanner')?.classList.add('show'), delay);
});
function pwaTriggerInstall() {
  if (_pwaPrompt) { _pwaPrompt.prompt(); _pwaPrompt.userChoice.then(() => { _pwaPrompt = null; pwaDismiss(); }); }
  else { showToast('Open in browser and use "Add to Home Screen"','📲'); pwaDismiss(); }
}
function pwaDismiss() {
  document.getElementById('pwaBanner')?.classList.remove('show');
  localStorage.setItem('ya_pwa_dismissed','1');
}

/* ═══════════════════════════════════════════════════════════
   INFO PAGES — About, How It Works, Safety, Contact, Terms, Privacy §INFO-PAGES
═══════════════════════════════════════════════════════════ */
const INFO_PAGES = {
  about: {
    title: 'About Yaad Adz',
    body: `<p>Yaad Adz is Jamaica's free online classifieds marketplace — built by Jamaicans, for Jamaicans.</p>
<p>We believe buying and selling should be simple, free, and accessible to everyone across all 14 parishes. No middleman fees, no agent commissions, no hidden charges — just direct connections between real people.</p>
<p>Whether you're selling a car in Kingston, renting a room in Montego Bay, or looking for a job in Mandeville, Yaad Adz connects you with your community.</p>
<p><strong>Our mission:</strong> Make commerce accessible to every Jamaican, powered by AI that actually understands how we search and what we need.</p>`
  },
  how: {
    title: 'How It Works',
    body: `<p><strong>🔍 Buying</strong></p>
<p>Browse listings across all 14 parishes or use our AI search — just type naturally like "cheap phone in Kingston" or "house under 15 million". Found something you like? Contact the seller directly via Call, WhatsApp, or in-app Message.</p>
<p><strong>📝 Selling</strong></p>
<p>Tap "+ Post Ad" and fill in your item details — title, price, parish, description, and up to 6 photos. Your listing goes live in under 2 minutes. Completely free, always.</p>
<p><strong>💬 Communicating</strong></p>
<p>Use the built-in messaging system to chat with buyers or sellers. Make offers, negotiate prices, and arrange meetups — all within the app.</p>
<p><strong>🤖 AI Search</strong></p>
<p>Our AI assistant understands natural language, Jamaican Patois, price ranges, parish names, and even typos. It gets smarter as more listings are added to the platform.</p>`
  },
  safety: {
    title: 'Safety Tips',
    body: `<p>Your safety is our top priority. Follow these guidelines when buying or selling on Yaad Adz:</p>
<p><strong>🤝 Meet in public places</strong><br>Half Way Tree, Constant Spring Plaza, a busy mall, or your local police station. Never meet at your home for the first transaction.</p>
<p><strong>👥 Bring a friend</strong><br>Especially for expensive items like vehicles, electronics, or property viewings. There's safety in numbers.</p>
<p><strong>💵 Cash on meetup</strong><br>Don't send money before seeing the item. If a deal seems too good to be true, it probably is.</p>
<p><strong>📱 Use in-app messaging</strong><br>Keep your conversations on-platform so there's a record. Avoid sharing personal details like your home address or bank info.</p>
<p><strong>⭐ Check the seller's profile</strong><br>Look at their ratings, how long they've been a member, and their other listings. Established sellers are generally more trustworthy.</p>
<p><strong>🚩 Report suspicious listings</strong><br>See something that doesn't look right? Tap the ⚑ Report button on any listing. We review every report.</p>`
  },
  contact: {
    title: 'Contact Us',
    body: `<p>Have a question, feedback, or need help? We'd love to hear from you.</p>
<p><strong>📧 Email:</strong> hello@yaadadz.com</p>
<p><strong>💬 In-app:</strong> Use the AI assistant — it can answer most questions about how the site works, posting ads, and safety.</p>
<p><strong>🐛 Found a bug?</strong> Let us know at support@yaadadz.com with a screenshot and description of what happened.</p>
<p><strong>📱 Social Media:</strong></p>
<p>Instagram: @yaadadz<br>Twitter/X: @yaadadz<br>Facebook: Yaad Adz Jamaica</p>
<p style="margin-top:16px;padding:14px;background:var(--green-light);border-radius:10px;color:var(--green)"><strong>💡 Tip:</strong> For the fastest response, use the AI chat — it's available 24/7 and can help with most questions instantly.</p>`
  },
  terms: {
    title: 'Terms of Service',
    body: `<p><em>Last updated: June 2025</em></p>
<p>By using Yaad Adz, you agree to these terms:</p>
<p><strong>1. Free to Use</strong><br>Yaad Adz is free to browse, post, and message. We reserve the right to introduce optional premium features in the future.</p>
<p><strong>2. Your Listings</strong><br>You are responsible for the accuracy of your listings. Do not post illegal items, counterfeit goods, stolen property, or misleading descriptions.</p>
<p><strong>3. Prohibited Items</strong><br>Weapons, drugs, stolen goods, counterfeit items, and adult services are strictly prohibited. Violations result in immediate account termination.</p>
<p><strong>4. User Conduct</strong><br>Treat other users with respect. Harassment, scams, and fraud will result in account suspension. We cooperate with law enforcement when required.</p>
<p><strong>5. Content Rights</strong><br>You retain ownership of your photos and descriptions. By posting, you grant Yaad Adz a license to display your content on the platform.</p>
<p><strong>6. No Guarantees</strong><br>Yaad Adz is a platform connecting buyers and sellers. We do not guarantee the quality, safety, or legality of any item listed. Transactions are between users.</p>
<p><strong>7. Account Termination</strong><br>We may remove listings or suspend accounts that violate these terms without prior notice.</p>`
  },
  privacy: {
    title: 'Privacy Policy',
    body: `<p><em>Last updated: June 2025</em></p>
<p><strong>What we collect:</strong></p>
<p>When you create an account: name, email, phone number, and parish. When you post an ad: listing details and photos. We also collect anonymous usage data to improve the platform.</p>
<p><strong>How we use it:</strong></p>
<p>To display your listings, enable messaging between users, and improve the AI search experience. We never sell your personal information to third parties.</p>
<p><strong>Data storage:</strong></p>
<p>Your data is stored securely on Supabase (hosted on AWS). Photos are stored in Supabase Storage with public URLs for display purposes.</p>
<p><strong>Cookies & local storage:</strong></p>
<p>We use localStorage to remember your session, favourites, and search preferences. No tracking cookies are used by Yaad Adz directly. Google AdSense may set cookies for ad personalisation.</p>
<p><strong>Your rights:</strong></p>
<p>You can delete your listings at any time from your Account page. To delete your account entirely, contact us at support@yaadadz.com.</p>
<p><strong>Third parties:</strong></p>
<p>We use Google AdSense for advertising and Supabase for data storage. These services have their own privacy policies.</p>`
  }
};

function openInfoPage(key) {
  const page = INFO_PAGES[key];
  if (!page) return;
  document.getElementById('infoContent').innerHTML =
    '<h2 style="font-family:var(--font-d);font-size:24px;font-weight:800;margin-bottom:16px;color:var(--text-1)">' + page.title + '</h2>' +
    page.body;
  openOverlay('ovInfo');
}

/* ═══════════════════════════════════════════════════════════
   OPEN AD FROM URL PARAM (?ad=id) + SEARCH STATE §URL-PARAM
═══════════════════════════════════════════════════════════ */
function checkUrlAdParam() {
  const params = new URLSearchParams(location.search);

  // ── Read path: either current URL or restored from 404.html redirect ──
  let activePath = location.pathname;
  try {
    const stored = sessionStorage.getItem('yaad_redirect_path');
    // Only use redirect path if it's different from current path (avoid loops)
    if (stored && stored !== '/' && stored !== location.pathname) {
      activePath = stored;
      sessionStorage.removeItem('yaad_redirect_path');
      if (history.replaceState) history.replaceState({}, '', stored + location.search + location.hash);
    } else if (stored) {
      // Stale redirect path — clear it to prevent loops
      sessionStorage.removeItem('yaad_redirect_path');
    }
  } catch(e) {}

  // Support pretty URLs: /ad/2015-honda-civic-kingston-ab12cd34
  const pathParts = activePath.split('/');
  if (pathParts[1] === 'ad' && pathParts[2]) {
    const shortId = idFromSlug(pathParts[2]);
    if (shortId) {
      // Find ad whose id starts with shortId
      const ad = _ads.find(function(a){ return a.id.startsWith(shortId); });
      if (ad) { setTimeout(() => openDetail(ad.id), 600); return; }
      // Ads not yet loaded — retry after load
      window._pendingSlug = pathParts[2];
      return;
    }
  }

  // Legacy: ?ad=full-uuid support (backwards compat for old shared links)
  const id = params.get('ad');
  if (id) { setTimeout(() => openDetail(id), 600); return; }

  // Restore search state from URL
  const q = params.get('q');
  const cat = params.get('cat');
  const parish = params.get('parish');
  if (q || cat || parish) {
    if (q) {
      searchQ = q;
      const inp = document.getElementById('aiInput');
      if (inp) inp.value = q;
    }
    if (cat && CATS.find(c=>c.id===cat)) activeF = cat;
    if (parish) window._aiFilters = { parish };
    setTimeout(() => { renderCats(); renderHome(); scrollToResults(); }, 700);
  }
}

// Browser back/forward button support
window.addEventListener('popstate', function(e) {
  const params = new URLSearchParams(location.search);

  // Pretty URL: /ad/slug — these are static pages now, let browser handle navigation
  const pathParts = location.pathname.split('/');
  if (pathParts[1] === 'ad') return; // static page, no action needed

  // Legacy ?ad= param
  const adId = params.get('ad');
  if (adId) {
    openDetail(adId);
  } else {
    // Navigating back — close detail page if open, else close any overlay
    const detailPage = document.getElementById('page-detail');
    if (detailPage && detailPage.classList.contains('active')) {
      goHome();
      SEO.resetOG(); SEO.setCanonical('/');
      return;
    }
    const ovDetail = document.getElementById('ovDetail');
    if (ovDetail && ovDetail.classList.contains('open')) {
      ovDetail.classList.remove('open');
      document.body.style.overflow = '';
      SEO.resetOG(); SEO.setCanonical('/');
    }
    // Restore search state if present
    const q = params.get('q');
    if (q) {
      searchQ = q;
      const inp = document.getElementById('aiInput');
      if (inp) inp.value = q;
      renderCats(); renderHome();
    }
  }
});

// Helper: push search state to URL
function pushSearchState() {
  const params = new URLSearchParams();
  if (searchQ) params.set('q', searchQ);
  if (activeF && activeF !== 'all') params.set('cat', activeF);
  const qs = params.toString();
  const url = location.pathname + (qs ? '?' + qs : '');
  if (history.replaceState) history.replaceState({}, '', url);
}

/* ═══════════════════════════════════════════════════════════
   PERFORMANCE — Passive events, overlay touch lock
═══════════════════════════════════════════════════════════ */
// Passive scroll listener — tells browser scroll won't be cancelled
document.addEventListener('touchstart', () => {}, { passive: true });
document.addEventListener('touchmove',  () => {}, { passive: true });

// Lock body scroll when overlay is open (prevents background scroll on iOS)
document.querySelectorAll('.overlay').forEach(o => {
  o.addEventListener('touchmove', e => { if (e.target === o) e.preventDefault(); }, { passive: false });
});

// Resize: only re-render on actual orientation change, not keyboard show/hide
let _resizeTimer, _lastOrientation = window.innerWidth > window.innerHeight;
window.addEventListener('resize', () => {
  const nowLandscape = window.innerWidth > window.innerHeight;
  if (nowLandscape === _lastOrientation) return; // keyboard open/close — ignore
  _lastOrientation = nowLandscape;
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(() => { renderHome(); renderCats(); }, 300);
}, { passive: true });

/* ═══════════════════════════════════════════════════════════
   QoL: BACK-TO-TOP + SCROLL PROGRESS
═══════════════════════════════════════════════════════════ */
(function() {
  let ticking = false;
  let lastY = window.scrollY || 0;
  const TRANSPARENT_THRESHOLD = 60; // px before bars go translucent
  const DIRECTION_THRESHOLD = 6;    // px of movement before we react — avoids jitter from tiny scroll bounces

  window.addEventListener('scroll', function() {
    if (!ticking) {
      requestAnimationFrame(function() {
        const scrollY = window.scrollY || window.pageYOffset;

        // Back to top visibility
        const fab = document.getElementById('backToTop');
        if (fab) fab.classList.toggle('visible', scrollY > 400);

        // ── iOS 27 pill transparency ──────────────────────────
        const isScrolled = scrollY > TRANSPARENT_THRESHOLD;
        const navEl    = document.querySelector('nav');
        const mobNavEl = document.getElementById('mobNav');
        const gasEl    = document.getElementById('gasBanner');
        if (navEl)    navEl.classList.toggle('scrolled-transparent', isScrolled);
        if (mobNavEl) mobNavEl.classList.toggle('scrolled-transparent', isScrolled);

        // ── Scroll-direction: hide top pill / shrink bottom pill,
        // gas banner, and back-to-top button on scroll down, restore
        // all of them on scroll up.
        const delta = scrollY - lastY;
        if (Math.abs(delta) > DIRECTION_THRESHOLD) {
          const scrollingDown = delta > 0 && scrollY > TRANSPARENT_THRESHOLD;
          if (navEl)    navEl.classList.toggle('nav-hidden', scrollingDown);
          if (mobNavEl) mobNavEl.classList.toggle('mob-nav-compact', scrollingDown);
          if (gasEl)    gasEl.classList.toggle('gas-banner-compact', scrollingDown);
          if (fab)      fab.classList.toggle('back-to-top-compact', scrollingDown);
          lastY = scrollY;
        }
        if (scrollY <= TRANSPARENT_THRESHOLD) {
          if (navEl)    navEl.classList.remove('nav-hidden');
          if (mobNavEl) mobNavEl.classList.remove('mob-nav-compact');
          if (gasEl)    gasEl.classList.remove('gas-banner-compact');
          if (fab)      fab.classList.remove('back-to-top-compact');
        }

        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });
})();

/* ═══════════════════════════════════════════════════════════
   QoL: SWIPE-DOWN TO CLOSE MODALS (mobile)
═══════════════════════════════════════════════════════════ */
(function() {
  let startY = 0, currentY = 0, isDragging = false;
  const THRESHOLD = 80;

  function getModal(el) {
    while (el && !el.classList.contains('modal')) el = el.parentElement;
    return el;
  }
  function getOverlay(modal) {
    return modal ? modal.closest('.overlay') : null;
  }

  document.addEventListener('touchstart', function(e) {
    if (window.innerWidth > 640) return;
    const handle = e.target.closest('.modal-drag-handle');
    const modal = handle ? getModal(handle) : null;
    if (!modal) return;
    startY = e.touches[0].clientY;
    currentY = startY;
    isDragging = true;
    modal.style.transition = 'none';
  }, { passive: true });

  document.addEventListener('touchmove', function(e) {
    if (!isDragging) return;
    currentY = e.touches[0].clientY;
    const diff = currentY - startY;
    if (diff > 0) {
      const modal = getModal(e.target);
      if (modal) modal.style.transform = 'translateY(' + diff + 'px)';
    }
  }, { passive: true });

  document.addEventListener('touchend', function(e) {
    if (!isDragging) return;
    isDragging = false;
    const diff = currentY - startY;
    const modal = getModal(e.target);
    if (!modal) return;
    modal.style.transition = '';
    modal.style.transform = '';
    if (diff > THRESHOLD) {
      const overlay = getOverlay(modal);
      if (overlay) closeOverlay(overlay.id);
    }
  }, { passive: true });
})();

/* ═══════════════════════════════════════════════════════════
   QoL: KEYBOARD SHORTCUT — Ctrl+K / Cmd+K for search
═══════════════════════════════════════════════════════════ */
document.addEventListener('keydown', function(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    if (window.innerWidth <= 640) {
      openAiSheet();
    } else {
      const inp = document.getElementById('aiInput');
      if (inp) { inp.focus(); inp.select(); }
    }
  }
});

