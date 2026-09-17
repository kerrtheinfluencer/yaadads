/* ═══════════════════════════════════════════════════════════
   🎓 ONBOARDING v2 §ONBOARD
   First-visit welcome tour + interactive coach marks +
   smart contextual tips. All vanilla JS, zero dependencies.

   Storage keys (localStorage):
     ya_onboarded_v2  — '1' once the welcome modal was seen
     ya_tour_done_v2  — '1' once the coach-mark tour finished
     ya_tip_cmdk      — desktop ⌘K tip shown
     ya_tip_fav3      — favourite tip after 3rd listing view
     ya_tip_gas       — gas-price banner tip shown
     ya_tip_pwa       — "add to home screen" tip shown
     ya_tip_post      — "post your first ad" tip shown
     ya_v2_visit_count — total visits (for the PWA tip; distinct from the
                         per-page visitors counter in core.js)

   Public API:
     startOnboarding()  — replay the full tour (footer link)
     OB.maybeWelcome()  — auto-called on load
   ═══════════════════════════════════════════════════════════ */
const OB = (function() {

  const K = {
    onboarded: 'ya_onboarded_v2',
    tourDone:  'ya_tour_done_v2',
    tipCmdk:   'ya_tip_cmdk',
    tipFav3:   'ya_tip_fav3',
    tipGas:    'ya_tip_gas',
    tipPwa:    'ya_tip_pwa',
    tipPost:   'ya_tip_post',
    visits:    'ya_v2_visit_count',
  };

  const memoryFlags = {};
  function flag(key, val) {
    if (val !== undefined) memoryFlags[key] = !!val;
    if (val === undefined && key in memoryFlags) return memoryFlags[key];
    try {
      if (val === undefined) return localStorage.getItem(key) === '1';
      localStorage.setItem(key, val ? '1' : '0');
    } catch (e) { return memoryFlags[key] || false; }
  }

  const isMobile = () => window.innerWidth <= 640;

  function isLoggedIn() {
    return typeof CU !== 'undefined' && !!CU;
  }

  /* ── TIP QUEUE — one tip at a time, never stacks, once each ──
     Tips wait politely until the welcome/tour is finished, then
     drain one-by-one with a minimum gap between them. */
  const GAP_MS = 9000;
  const Tips = {
    _q: [],
    _busy: false,
    push(tip) {
      if (flag(tip.id)) return;          // already shown — once ever
      flag(tip.id, true);                // reserve immediately (no dupes)
      this._q.push(tip);
      this._drain();
    },
    _drain() {
      if (this._busy || !this._q.length) return;
      // Never fight the welcome modal, the coach tour, or another overlay
      if (!flag(K.onboarded) || _tourActive || document.body.classList.contains('ob-locked') ||
          document.querySelector('.overlay.open') || document.body.classList.contains('ai-sheet-open')) {
        setTimeout(() => this._drain(), 2500);
        return;
      }
      this._busy = true;
      const tip = this._q.shift();
      const show = () => {
        if (document.body.classList.contains('ob-locked') || document.querySelector('.overlay.open') || document.body.classList.contains('ai-sheet-open')) {
          setTimeout(show, 2500);
          return;
        }
        if (typeof showToast !== 'function') { this._busy = false; this._drainNext(); return; }
        showToast(tip.msg, tip.icon, tip.action || null);
        this._busy = false;
        this._drainNext();
      };
      tip.delay ? setTimeout(show, tip.delay) : show();
    },
    _drainNext() {
      setTimeout(() => this._drain(), GAP_MS);
    },
  };

  /* ── Build the DOM once ─────────────────────────────────── */
  let _root = null;
  let _lastFocus = null;
  function ensureRoot() {
    if (_root) return _root;
    _root = document.createElement('div');
    _root.id = 'obRoot';
    _root.innerHTML = `
      <div class="ob-overlay" id="obOverlay"></div>
      <div class="ob-welcome" id="obWelcome" role="dialog" aria-modal="true" aria-label="Welcome to Yaad Adz" tabindex="-1" hidden>
        <div class="ob-brand"><img src="/logo.svg" width="30" height="30" alt=""><span>YOUR QUICK START</span></div>
        <button class="ob-skip" id="obSkip" aria-label="Skip onboarding">Skip ✕</button>
        <div class="ob-dots" id="obDots" aria-label="Quick start steps"></div>
        <div class="ob-welcome-inner">
          <section class="ob-slide" data-slide="0">
            <div class="ob-visual ob-market" aria-hidden="true">
              <span class="ob-visual-label">LOCAL FINDS. NEW POSSIBILITIES.</span>
              <div class="ob-mini-cards"><span>🚗<small>Vehicles</small></span><span>📱<small>Phones</small></span><span>🏡<small>Property</small></span></div>
              <span class="ob-visual-caption">One marketplace. All 14 parishes.</span>
            </div>
            <h2 class="ob-slide-title">A little closer to your <em>next great find.</em></h2>
            <p class="ob-slide-text">Welcome to Yaad Adz, Jamaica's free marketplace. Find something you need or give something you own a new home.</p>
            <div class="ob-benefits"><span>✓ Browse without an account</span><span>✓ Free to post</span></div>
          </section>
          <section class="ob-slide" data-slide="1" hidden>
            <div class="ob-visual ob-search-demo" aria-hidden="true">
              <span class="ob-visual-label">SEARCH THE WAY YOU TALK</span>
              <div class="ob-demo-input">🔍 <span>phone under 30,000 in Kingston</span></div>
              <div class="ob-demo-tags"><span>Phones</span><span>Under J$30,000</span><span>Kingston</span></div>
              <span class="ob-visual-caption">An example search — not a live listing</span>
            </div>
            <h2 class="ob-slide-title">Find it. Save it. <em>Ask about it.</em></h2>
            <p class="ob-slide-text">Use search or choose a category. Open a listing for photos, price and location. Tap the heart to save it on this device.</p>
            <div class="ob-note"><span aria-hidden="true">💬</span><span>Ready to ask a question? Sign in to message the seller, or use the contact options on their listing.</span></div>
          </section>
          <section class="ob-slide" data-slide="2" hidden>
            <div class="ob-visual ob-sell-demo" aria-hidden="true">
              <span class="ob-visual-label">YOUR FIRST AD, MADE SIMPLE</span>
              <div class="ob-sell-steps"><span>📷<small>Add photos</small></span><b>→</b><span>🏷️<small>Set a price</small></span><b>→</b><span>✓<small>Publish</small></span></div>
              <span class="ob-visual-caption">The posting guide helps you along the way.</span>
            </div>
            <h2 class="ob-slide-title" id="obReadyTitle">Your next move? <em>It's up to you.</em></h2>
            <p class="ob-slide-text">Browse now, take a tour of the buttons, or post your first ad. You'll need a free account to post.</p>
            <div class="ob-note"><span aria-hidden="true">🛡️</span><span><strong>Trade with care.</strong> Check the item before paying, meet in a public place and never share verification codes.</span></div>
            <div class="ob-start-actions"><button class="btn btn-gold" id="obBrowse">Start browsing →</button><button class="btn btn-outline" id="obPost">Post my first ad</button></div>
          </section>
        </div>
        <div class="ob-welcome-nav">
          <button class="btn btn-ghost" id="obBack" hidden>← Back</button>
          <span class="ob-step-label" id="obStepLabel" aria-live="polite"></span>
          <button class="btn btn-gold" id="obNext">Next →</button>
        </div>
        <p class="ob-replay-note">Go at your own pace. Replay anytime from the footer.</p>
      </div>
      <div class="ob-spotlight" id="obSpotlight"></div>
      <div class="ob-tip" id="obTip" role="dialog" aria-modal="true" aria-labelledby="obTipTitle" aria-describedby="obTipText" tabindex="-1" hidden>
        <div class="ob-tip-step" id="obTipStep" aria-live="polite"></div>
        <div class="ob-tour-progress" aria-hidden="true"><span id="obTourProgress"></span></div>
        <div class="ob-tip-icon" id="obTipIcon"></div>
        <div class="ob-tip-title" id="obTipTitle"></div>
        <div class="ob-tip-text" id="obTipText"></div>
        <div class="ob-tip-nav">
          <button class="ob-tip-skip" id="obTipSkip">Skip tour</button>
          <div style="flex:1"></div>
          <button class="ob-tip-back" id="obTipBack">← Back</button>
          <button class="ob-tip-next" id="obTipNext">Next →</button>
        </div>
      </div>
    `;
    document.body.appendChild(_root);
    wireWelcome();
    wireTour();
    return _root;
  }

  /* ═══════════════════════════════════════════════════════════
     WELCOME MODAL — 4 slides
  ═══════════════════════════════════════════════════════════ */
  let _slide = 0;
  const SLIDE_COUNT = 3;

  function buildDots() {
    const dots = document.getElementById('obDots');
    const labels = ['Welcome', 'Find & connect', 'Get started'];
    dots.innerHTML = labels.map((label, i) =>
      '<button type="button" class="ob-dot" data-i="' + i + '" aria-label="Step ' + (i + 1) + ': ' + label + '"><span>' + (i + 1) + '</span>' + label + '</button>').join('');
    dots.querySelectorAll('.ob-dot').forEach(d =>
      d.addEventListener('click', () => setSlide(Number(d.dataset.i))));
  }

  function wireWelcome() {
    buildDots();
    document.getElementById('obNext').addEventListener('click', function() {
      if (_slide < SLIDE_COUNT - 1) setSlide(_slide + 1);
      else { finishWelcome(false); startTour(); }
    });
    document.getElementById('obBack').addEventListener('click', function() { setSlide(_slide - 1); });
    document.getElementById('obSkip').addEventListener('click', () => finishWelcome());
    document.getElementById('obBrowse').addEventListener('click', function() {
      finishWelcome();
      if (typeof goPage === 'function') goPage('home');
    });
    document.getElementById('obPost').addEventListener('click', function() {
      finishWelcome();
      postFromWelcome();
    });
    document.getElementById('obOverlay').addEventListener('click', function() {
      if (_tourActive) endTour(false);
      else finishWelcome();
    });
    document.addEventListener('keydown', welcomeKeys);
  }

  // Resume this CTA only after its auth dialog closes with a signed-in user.
  // Closing while logged out cancels the intent; nothing persists across visits.
  let _postAuthObserver = null;
  function postFromWelcome() {
    if (typeof openPostAd !== 'function') return;
    if (_postAuthObserver) { _postAuthObserver.disconnect(); _postAuthObserver = null; }
    const auth = document.getElementById('ovAuth');
    if (!isLoggedIn() && auth) {
      _postAuthObserver = new MutationObserver(function() {
        if (auth.classList.contains('open')) return;
        _postAuthObserver.disconnect();
        _postAuthObserver = null;
        if (isLoggedIn()) openPostAd();
      });
      _postAuthObserver.observe(auth, { attributes: true, attributeFilter: ['class'] });
    }
    try { openPostAd(); }
    finally {
      if (_postAuthObserver && !auth.classList.contains('open')) {
        _postAuthObserver.disconnect();
        _postAuthObserver = null;
      }
    }
  }

  function trapFocus(e, dialog) {
    if (e.key !== 'Tab') return;
    const buttons = Array.from(dialog.querySelectorAll('button, [tabindex="0"]'))
      .filter(el => !el.disabled && !el.closest('[hidden]') && isVisible(el));
    const first = buttons[0], last = buttons[buttons.length - 1];
    if (!first) { e.preventDefault(); dialog.focus(); return; }
    if (e.shiftKey && (document.activeElement === first || !buttons.includes(document.activeElement))) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && (document.activeElement === last || !buttons.includes(document.activeElement))) {
      e.preventDefault(); first.focus();
    }
  }

  function welcomeKeys(e) {
    if (!_root || !_root.classList.contains('ob-welcome-open')) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); finishWelcome(); return; }
    trapFocus(e, document.getElementById('obWelcome'));
  }

  function setSlide(n) {
    _slide = Math.max(0, Math.min(n, SLIDE_COUNT - 1));
    _root.querySelectorAll('.ob-slide').forEach(s => {
      s.hidden = Number(s.dataset.slide) !== _slide;
      s.classList.toggle('active', !s.hidden);
    });
    _root.querySelectorAll('.ob-dot').forEach((d, i) => {
      d.classList.toggle('active', i === _slide);
      d.setAttribute('aria-current', i === _slide ? 'step' : 'false');
    });
    document.getElementById('obBack').hidden = _slide === 0;
    document.getElementById('obStepLabel').textContent = (_slide + 1) + ' of ' + SLIDE_COUNT;
    document.getElementById('obNext').textContent = _slide === SLIDE_COUNT - 1 ? 'Show me around' : 'Next →';
    document.getElementById('obWelcome').scrollTop = 0;
    armWatchdog();
  }

  // A health watchdog releases broken UI, but never puts a timer on reading.
  function armWatchdog() {
    clearTimeout(_welcomeWatchdog);
    clearTimeout(_tourWatchdog);
    const check = function() {
      const dialog = document.getElementById(_tourActive ? 'obTip' : 'obWelcome');
      if (!_root || !document.body.classList.contains('ob-locked')) return;
      if (!_root.isConnected || !dialog || !isVisible(dialog)) {
        if (_tourActive) endTour(false); else finishWelcome();
        return;
      }
      armWatchdog();
    };
    if (_tourActive) _tourWatchdog = setTimeout(check, 5000);
    else _welcomeWatchdog = setTimeout(check, 5000);
  }

  function showWelcome() {
    try {
      ensureRoot();
      if (!_root || !_root.contains(document.activeElement)) _lastFocus = document.activeElement;
      document.getElementById('obWelcome').hidden = false;
      setSlide(0);
      _root.classList.add('ob-welcome-open');
      document.body.classList.add('ob-locked');
      document.getElementById('obNext').focus({ preventScroll: true });
    } catch (e) {
      if (_root) _root.classList.remove('ob-welcome-open');
      finishWelcome();
      console.error('[onboarding] showWelcome failed:', e);
    }
  }

  function finishWelcome(restoreFocus = true) {
    if (_root) _root.classList.remove('ob-welcome-open');
    const dialog = document.getElementById('obWelcome');
    if (dialog) dialog.hidden = true;
    document.body.classList.remove('ob-locked');
    clearTimeout(_welcomeWatchdog);
    flag(K.onboarded, true);
    if (restoreFocus) restoreLastFocus();
  }

  function restoreLastFocus() {
    try { if (_lastFocus && _lastFocus.isConnected) _lastFocus.focus({ preventScroll: true }); } catch (e) {}
  }

  /* ═══════════════════════════════════════════════════════════
     COACH MARKS — spotlight tour of the real UI
  ═══════════════════════════════════════════════════════════ */
  // Each step: pick the first selector that exists & is visible.
  // Steps whose target can't be found are skipped automatically.
  const TOUR_STEPS = [
    {
      sel: () => isMobile() ? '#mnSearch' : '#navSearchPill',
      icon: '🔍',
      title: 'Search anything',
      text: isMobile()
        ? 'Tap here to ask the Yaad Brain — "cheap car under 2M" works just fine.'
        : 'Type here or press ⌘K / Ctrl+K to search. Try "cheap car under 2M".',
      pos: 'bottom',
    },
    {
      sel: () => '#catRow',
      icon: '📂',
      title: 'Browse by category',
      text: 'Filter instantly — Vehicles, Property, Phones, Jobs and more. Counts update live.',
      pos: 'bottom',
      scroll: true,
    },
    {
      sel: () => '.ad-card:not(.sold) .fav-btn',
      icon: '❤️',
      title: 'Save your favourites',
      text: 'Tap the heart on any listing to save it. Your favourites stay on this device.',
      pos: 'auto',
    },
    {
      sel: () => isMobile() ? '.mob-nav-post' : '#navPostBtn',
      icon: '🚀',
      title: 'Post your first ad',
      text: 'Sign in or create a free account, then add details, photos and a price. The posting guide walks you through each step.',
      pos: 'top',
    },
    {
      sel: () => '#gasBanner',
      icon: '⛽',
      title: 'Live gas prices',
      text: 'Petrojam prices weekly + real pump reports from drivers. Check before you drive.',
      pos: 'top',
    },
    {
      sel: () => isMobile() ? '#mnMsgs' : null,
      icon: '💬',
      title: 'Keep your conversations together',
      text: 'Sign in to read and reply to messages here. Check items before paying and never share verification codes.',
      pos: 'top',
    },
    {
      sel: () => isMobile() ? '#mnAccount' : '.user-pill',
      icon: '👤',
      title: 'Your account',
      text: isMobile()
        ? 'Manage your listings, messages and profile from here — all in one spot.'
        : 'Tap your name anytime to manage your listings, messages and profile.',
      pos: 'top',
    },
  ];

  let _tourIdx = 0, _tourActive = false, _steps = [];
  let _welcomeWatchdog = null, _tourWatchdog = null;

  function startTour() {
    ensureRoot();
    _steps = TOUR_STEPS.filter(step => {
      const sel = step.sel();
      return sel && isVisible(document.querySelector(sel));
    });
    _tourActive = true;
    _tourIdx = 0;
    _root.classList.add('ob-tour-open');
    document.getElementById('obTip').hidden = false;
    document.body.classList.add('ob-locked');
    showTourStep();
    armWatchdog();
  }

  function endTour(completed) {
    _tourActive = false;
    clearTimeout(_tourWatchdog);
    if (_root) {
      _root.classList.remove('ob-tour-open');
      const spot = document.getElementById('obSpotlight');
      if (spot) spot.classList.remove('show');
      const tip = document.getElementById('obTip');
      if (tip) { tip.classList.remove('show'); tip.hidden = true; }
    }
    document.body.classList.remove('ob-locked');
    if (completed) {
      flag(K.tourDone, true);
      // Finish with useful actions, not a toast that disappears before it is read.
      showWelcome();
      setSlide(SLIDE_COUNT - 1);
      document.getElementById('obBrowse').focus({ preventScroll: true });
    } else restoreLastFocus();
  }

  function showTourStep() {
    if (!_tourActive) return;
    try {
      if (_tourIdx >= _steps.length) { endTour(true); return; }
      const step = _steps[_tourIdx];
      const target = document.querySelector(step.sel());
      if (!isVisible(target)) {
        _steps.splice(_tourIdx, 1);
        showTourStep();
        return;
      }
      const tip = document.getElementById('obTip');
      document.getElementById('obTipIcon').textContent = step.icon;
      document.getElementById('obTipTitle').textContent = step.title;
      document.getElementById('obTipText').textContent = step.text;
      document.getElementById('obTipStep').textContent = 'Step ' + (_tourIdx + 1) + ' of ' + _steps.length;
      document.getElementById('obTourProgress').style.width = ((_tourIdx + 1) / _steps.length * 100) + '%';
      document.getElementById('obTipBack').hidden = _tourIdx === 0;
      document.getElementById('obTipNext').textContent = _tourIdx === _steps.length - 1 ? 'Finish ✓' : 'Next →';
      target.scrollIntoView({ block: 'center', behavior: 'instant' });
      tip.classList.add('show');
      positionSpotlight(target, step.pos);
      document.getElementById('obTipNext').focus({ preventScroll: true });
      armWatchdog();
    } catch (e) {
      console.error('[onboarding] showTourStep render failed:', e);
      endTour(false);
    }
  }

  function isVisible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  }

  function positionSpotlight(target, pos) {
    const spot = document.getElementById('obSpotlight');
    const tip  = document.getElementById('obTip');
    const r = target.getBoundingClientRect();
    const pad = 10;
    spot.style.top    = (r.top - pad) + 'px';
    spot.style.left   = (r.left - pad) + 'px';
    spot.style.width  = (r.width + pad * 2) + 'px';
    spot.style.height = (r.height + pad * 2) + 'px';
    spot.style.borderRadius = '18px';
    spot.classList.add('show');

    // Position the tooltip — above or below the target, whichever fits
    tip.classList.remove('above', 'below');
    const viewH = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const tipH = tip.offsetHeight || 150;
    const fitsBelow = r.bottom + tipH + 24 <= viewH;
    const fitsAbove = r.top - tipH - 24 >= 0;
    const below = pos === 'top' ? !fitsAbove && fitsBelow : fitsBelow || !fitsAbove;
    tip.classList.add(below ? 'below' : 'above');
    const top = below ? r.bottom + 14 : r.top - tipH - 14;
    tip.style.top = Math.max(12, Math.min(top, viewH - tipH - 12)) + 'px';

    // Horizontal clamp
    const tipW = Math.min(tip.offsetWidth || 300, window.innerWidth - 24);
    let left = r.left + r.width / 2 - tipW / 2;
    left = Math.max(12, Math.min(left, window.innerWidth - tipW - 12));
    tip.style.left = left + 'px';
    tip.style.maxWidth = tipW + 'px';
  }

  function wireTour() {
    document.getElementById('obTipNext').addEventListener('click', function() {
      _tourIdx++;
      showTourStep();
    });
    document.getElementById('obTipBack').addEventListener('click', function() {
      if (_tourIdx > 0) { _tourIdx--; showTourStep(); }
    });
    document.getElementById('obTipSkip').addEventListener('click', function() { endTour(false); });
    document.addEventListener('keydown', function(e) {
      if (!_tourActive) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); endTour(false); return; }
      trapFocus(e, document.getElementById('obTip'));
    });
    const reposition = function() {
      if (!_tourActive) return;
      const step = _steps[_tourIdx];
      const target = step && document.querySelector(step.sel());
      if (!isVisible(target)) { showTourStep(); return; }
      positionSpotlight(target, step.pos);
    };
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, { passive: true, capture: true });
    if (window.visualViewport) window.visualViewport.addEventListener('resize', reposition);
  }

  /* ═══════════════════════════════════════════════════════════
     CONTEXTUAL TIPS — shown once, behavior-triggered
  ═══════════════════════════════════════════════════════════ */

  // Desktop: teach ⌘K after the user first scrolls into the results
  function maybeCmdkTip() {
    if (isMobile() || flag(K.tipCmdk) || !flag(K.onboarded)) return;
    const grid = document.getElementById('homeGrid');
    if (!grid) return;
    const onScroll = function() {
      const rect = grid.getBoundingClientRect();
      if (rect.top < window.innerHeight * 0.6) {
        window.removeEventListener('scroll', onScroll);
        Tips.push({
          id: K.tipCmdk,
          icon: '⌨️',
          msg: 'Tip: press ⌘K (or Ctrl+K) to search from anywhere',
        });
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // ⛽ Gas price banner — once the visitor has settled in
  function maybeGasTip() {
    if (flag(K.tipGas)) return;
    if (!document.getElementById('gasBanner')) return;
    Tips.push({
      id: K.tipGas,
      icon: '⛽',
      delay: 14000,
      msg: 'Live Jamaica gas prices, updated weekly — check before you drive',
      action: { label: 'View', fn: function() { location.href = '/gas-prices.html'; } },
    });
  }

  // 📲 PWA install — 2nd visit, only if the install banner isn't already showing
  function maybePwaTip() {
    let visits = 1;
    try { visits = Number(localStorage.getItem(K.visits) || 0) + 1; localStorage.setItem(K.visits, String(visits)); } catch (e) {}
    if (visits < 2) return;
    if (flag(K.tipPwa)) return;
    if (window.navigator.standalone === true ||
        (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)) return; // already installed
    let dismissed = false;
    try { dismissed = localStorage.getItem('ya_pwa_dismissed') === '1'; } catch (e) {}
    if (dismissed) return;
    if (typeof pwaTriggerInstall !== 'function') return;
    Tips.push({
      id: K.tipPwa,
      icon: '📲',
      delay: 26000,
      msg: 'Add Yaad Adz to your home screen — faster, and works offline',
      action: { label: '📲 Install', fn: function() { pwaTriggerInstall(); } },
    });
  }

  // 🚀 Post-first-ad nudge — logged-out users who are clearly browsing
  function trackDetailViews() {
    const orig = window.openDetail;
    // Guard: only wrap once — maybeWelcome runs on every page load
    if (typeof orig !== 'function' || orig._obHooked) return;
    const wrapped = function() {
      const r = orig.apply(this, arguments);
      try {
        const n = Number(sessionStorage.getItem('ya_detail_views') || 0) + 1;
        sessionStorage.setItem('ya_detail_views', String(n));
        if (n >= 3) {
          // Lurkers get the favourites tip; logged-out lurkers get the seller nudge
          if (!isLoggedIn() && !flag(K.tipPost)) {
            Tips.push({
              id: K.tipPost,
              icon: '🚀',
              delay: 1200,
              msg: 'Selling something? Post your first ad free — takes 2 minutes',
              action: { label: '＋ Post', fn: function() { if (typeof openPostAd === 'function') openPostAd(); } },
            });
          } else if (isLoggedIn() && !flag(K.tipFav3)) {
            Tips.push({
              id: K.tipFav3,
              icon: '❤️',
              delay: 1200,
              msg: 'Tip: tap ❤️ on any listing to save it for later',
            });
          }
        }
      } catch (e) {}
      return r;
    };
    wrapped._obHooked = true;
    window.openDetail = wrapped;
  }

  /* ═══════════════════════════════════════════════════════════
     BOOT
  ═══════════════════════════════════════════════════════════ */
  // v2: existing users (any prior activity signal) skip the auto-welcome —
  // their saved data, session and flows stay exactly as before. The tour is
  // still available via the footer "Replay Tour" link, and every contextual
  // tip still fires for them.
  function isReturningUser() {
    try {
      const sess = JSON.parse(localStorage.getItem('ya_sess') || 'null');
      if (sess) return true;                                          // logged in / had a session
      const favs = JSON.parse(localStorage.getItem('ya_favs') || '[]');
      if (Array.isArray(favs) && favs.length) return true;            // saved favourites
      const brain = JSON.parse(localStorage.getItem('ya_brain_searches') || '{}');
      if (brain && typeof brain === 'object' && Object.keys(brain).length) return true; // used AI search
      if (localStorage.getItem('ya_ratings') || localStorage.getItem('ya_reports')) return true;
      if (localStorage.getItem('ya_pwa_dismissed') === '1') return true;
      if (parseInt(localStorage.getItem('ya_visits') || '0', 10) >= 2) return true;
      if (parseInt(localStorage.getItem('ya_v2_visit_count') || '0', 10) >= 2) return true;
    } catch (e) { /* corrupted key — treat as new user, never throw */ }
    return false;
  }

  let _booted = false;
  function maybeWelcome() {
    if (!document.body || _booted) return;
    _booted = true;
    // Mark returning users as onboarded BEFORE arming tips so their tips work
    if (!flag(K.onboarded) && isReturningUser()) flag(K.onboarded, true);
    trackDetailViews();
    maybeCmdkTip();
    maybeGasTip();
    maybePwaTip();
    if (flag(K.onboarded)) return; // already seen (or returning user)
    // Wait for first content paint so the page doesn't feel broken
    let attempts = 0;
    function offerWelcome() {
      if (flag(K.onboarded) || _tourActive || (_root && _root.classList.contains('ob-welcome-open'))) return;
      if (document.querySelector('.overlay.open, #suOverlay') || document.body.classList.contains('ai-sheet-open') || document.hidden) {
        if (++attempts < 30) setTimeout(offerWelcome, 2000);
        return;
      }
      showWelcome();
    }
    setTimeout(offerWelcome, 1400);
  }

  // Public: replay the tour from the footer link
  function startOnboarding() {
    if (_tourActive || (_root && _root.classList.contains('ob-welcome-open'))) return;
    // The site-update modal never carries an .open class — check for the element itself
    if (document.querySelector('.overlay.open, #suOverlay') || document.body.classList.contains('ai-sheet-open')) return;
    showWelcome();
  }

  return {
    maybeWelcome,
    startOnboarding,
  };
})();

// Expose for footer link
function startOnboarding() { OB.startOnboarding(); }

// Auto-boot once DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() { setTimeout(OB.maybeWelcome, 800); });
} else {
  setTimeout(OB.maybeWelcome, 800);
}