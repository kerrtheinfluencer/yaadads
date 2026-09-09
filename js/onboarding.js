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

  function flag(key, val) {
    try {
      if (val === undefined) return localStorage.getItem(key) === '1';
      localStorage.setItem(key, val ? '1' : '0');
    } catch (e) { return false; }
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
      <div class="ob-welcome" id="obWelcome" role="dialog" aria-modal="true" aria-label="Welcome to Yaad Adz" tabindex="-1">
        <button class="ob-skip" id="obSkip" aria-label="Skip tour">Skip ✕</button>
        <div class="ob-welcome-inner">
          <div class="ob-slide" data-slide="0">
            <div class="ob-slide-icon">🇯🇲</div>
            <h2 class="ob-slide-title">Welcome to <em>Yaad Adz</em></h2>
            <p class="ob-slide-text">Jamaica's free marketplace — browse cars, property, phones, jobs and more across all <strong>14 parishes</strong>. No fees, ever.</p>
          </div>
          <div class="ob-slide" data-slide="1">
            <div class="ob-slide-icon">🤖</div>
            <h2 class="ob-slide-title">Ask the <em>Yaad Brain</em></h2>
            <p class="ob-slide-text">Search like you talk — <strong>"cheap car under 2M"</strong> or <strong>"mi waan a phone fi likkle money"</strong>. Our AI understands Patois and plain English.</p>
          </div>
          <div class="ob-slide" data-slide="2">
            <div class="ob-slide-icon">🚀</div>
            <h2 class="ob-slide-title">Post your ad <em>free</em></h2>
            <p class="ob-slide-text">Sell anything in under 2 minutes — add photos, set your price, done. Reach buyers in Kingston, Portmore, Mobay and beyond.</p>
          </div>
          <div class="ob-slide" data-slide="3">
            <div class="ob-slide-icon">⛽</div>
            <h2 class="ob-slide-title">Live <em>gas prices</em></h2>
            <p class="ob-slide-text">Petrojam prices updated weekly, real driver reports at the pump, and a fill-up calculator. Tap the ⛽ banner anytime.</p>
          </div>
        </div>
        <div class="ob-dots" id="obDots"></div>
        <div class="ob-welcome-nav">
          <button class="btn btn-ghost" id="obBack" style="visibility:hidden">← Back</button>
          <button class="btn btn-green btn-lg" id="obNext">Next →</button>
        </div>
      </div>
      <div class="ob-spotlight" id="obSpotlight"></div>
      <div class="ob-tip" id="obTip" role="dialog" aria-live="polite">
        <div class="ob-tip-step" id="obTipStep"></div>
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
  const SLIDE_COUNT = 4;

  function buildDots() {
    const dots = document.getElementById('obDots');
    if (!dots) return;
    dots.innerHTML = Array.from({ length: SLIDE_COUNT },
      (_, i) => '<span class="ob-dot' + (i === 0 ? ' active' : '') + '" data-i="' + i + '"></span>').join('');
    dots.querySelectorAll('.ob-dot').forEach(d =>
      d.addEventListener('click', () => setSlide(Number(d.dataset.i))));
  }

  function wireWelcome() {
    buildDots();
    const next = document.getElementById('obNext');
    const back = document.getElementById('obBack');
    const skip = document.getElementById('obSkip');
    const ov   = document.getElementById('obOverlay');
    next.addEventListener('click', function() {
      if (_slide < SLIDE_COUNT - 1) { setSlide(_slide + 1); }
      else { finishWelcome(); }
    });
    back.addEventListener('click', function() { if (_slide > 0) setSlide(_slide - 1); });
    skip.addEventListener('click', finishWelcome);
    // Tap outside the dialog (on the dim layer) dismisses it — never trapped
    if (ov) ov.addEventListener('click', function() {
      if (_root && _root.classList.contains('ob-welcome-open')) finishWelcome();
      else if (_tourActive) endTour(false);
    });
    document.addEventListener('keydown', welcomeKeys);
  }

  function welcomeKeys(e) {
    if (!_root || !_root.classList.contains('ob-welcome-open')) return;
    if (e.key === 'Escape') { finishWelcome(); return; }
    if (e.key === 'ArrowRight' && _slide < SLIDE_COUNT - 1) { setSlide(_slide + 1); return; }
    if (e.key === 'ArrowLeft' && _slide > 0) { setSlide(_slide - 1); return; }
    if (e.key === 'Tab') {
      // Focus trap — cycle inside the welcome dialog only
      const focusables = _root.querySelectorAll('#obWelcome button, #obWelcome [tabindex]:not([tabindex="-1"])');
      if (!focusables.length) return;
      const first = focusables[0], last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  function setSlide(n) {
    _slide = n;
    _root.querySelectorAll('.ob-slide').forEach(s =>
      s.classList.toggle('active', Number(s.dataset.slide) === n));
    _root.querySelectorAll('.ob-dot').forEach((d, i) =>
      d.classList.toggle('active', i === n));
    document.getElementById('obBack').style.visibility = n === 0 ? 'hidden' : 'visible';
    const next = document.getElementById('obNext');
    if (n === SLIDE_COUNT - 1) {
      next.textContent = 'Show me around ✨';
      next.className = 'btn btn-gold btn-lg';
    } else {
      next.textContent = 'Next →';
      next.className = 'btn btn-green btn-lg';
    }
  }

  function showWelcome() {
    ensureRoot();
    try {
      _lastFocus = document.activeElement;
      _slide = 0;
      setSlide(0);
      _root.classList.add('ob-welcome-open');
      document.body.classList.add('ob-locked');
      var n = document.getElementById('obNext');
      if (n) setTimeout(function() { n.focus(); }, 60);
    } catch (e) {
      // Never leave a blocking overlay behind if something goes wrong
      if (_root) _root.classList.remove('ob-welcome-open');
      document.body.classList.remove('ob-locked');
      console.error('[onboarding] showWelcome failed:', e);
    }
    // Watchdog: auto-dismiss after 20s no matter what
    clearTimeout(_welcomeWatchdog);
    _welcomeWatchdog = setTimeout(function() {
      if (_root && _root.classList.contains('ob-welcome-open')) finishWelcome();
    }, 20000);
  }

  function finishWelcome() {
    if (_root) _root.classList.remove('ob-welcome-open');
    document.body.classList.remove('ob-locked');
    clearTimeout(_welcomeWatchdog);
    flag(K.onboarded, true);
    try { if (_lastFocus && typeof _lastFocus.focus === 'function') _lastFocus.focus(); } catch (e) {}
    // Offer the interactive coach-mark tour right after the welcome
    if (!flag(K.tourDone)) {
      setTimeout(startTour, 350);
    }
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
      title: 'Post an ad in 2 minutes',
      text: 'Selling something? Tap here — photos, price, done. Posting is always free.',
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
      title: 'Message sellers safely',
      text: 'Chat in-app with buyers and sellers — no phone number needed, everything stays in one place.',
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

  let _tourIdx = 0, _tourActive = false;
  let _welcomeWatchdog = null, _tourWatchdog = null;

  function startTour() {
    _tourActive = true;
    _tourIdx = 0;
    ensureRoot();
    _root.classList.add('ob-tour-open');
    document.body.classList.add('ob-locked');
    try { showTourStep(); } catch (e) { endTour(false); return; }
    // Watchdog: a tour can never trap the page — auto-close after 45s
    clearTimeout(_tourWatchdog);
    _tourWatchdog = setTimeout(function() {
      if (_tourActive) endTour(false);
    }, 45000);
  }

  function endTour(completed) {
    _tourActive = false;
    clearTimeout(_tourWatchdog);
    if (_root) _root.classList.remove('ob-tour-open');
    document.body.classList.remove('ob-locked');
    flag(K.tourDone, true);
    try { if (_lastFocus && typeof _lastFocus.focus === 'function') _lastFocus.focus(); } catch (e) {}
    if (typeof showToast === 'function' && completed) {
      showToast("You're all set! Happy hunting 🇯🇲", '🎉');
    }
  }

  function showTourStep() {
    const steps = TOUR_STEPS;
    try {
      // Find the next step with a visible target
      while (_tourIdx < steps.length) {
        const sel = steps[_tourIdx].sel();
        const el = sel ? document.querySelector(sel) : null;
        if (el && isVisible(el)) break;
        _tourIdx++;
      }
      if (_tourIdx >= steps.length) { endTour(true); return; }

      const step = steps[_tourIdx];
      const target = document.querySelector(step.sel);

      // Scroll target into view if needed
      if (step.scroll && target) {
        target.scrollIntoView({ block: 'center', behavior: 'instant' });
      }

      requestAnimationFrame(function() {
        try {
          positionSpotlight(target, step.pos);
          const tip = document.getElementById('obTip');
          document.getElementById('obTipIcon').textContent = step.icon;
          document.getElementById('obTipTitle').textContent = step.title;
          document.getElementById('obTipText').textContent = step.text;
          document.getElementById('obTipStep').textContent =
            'Step ' + (_tourIdx + 1) + ' of ' + steps.length;
          document.getElementById('obTipBack').style.visibility = _tourIdx === 0 ? 'hidden' : 'visible';
          document.getElementById('obTipNext').textContent =
            _tourIdx === steps.length - 1 ? 'Done ✓' : 'Next →';
          tip.classList.add('show');
          var nextBtn = document.getElementById('obTipNext');
          if (nextBtn) nextBtn.focus();
        } catch (e) {
          // Any animation/positioning hiccup must not strand the user in a
          // dimmed, unclickable state — release the tour.
          console.error('[onboarding] showTourStep render failed:', e);
          endTour(false);
        }
      });
    } catch (e) {
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
    const tipH = tip.offsetHeight || 150;
    const spaceBelow = window.innerHeight - r.bottom;
    const spaceAbove = r.top;
    const fitsBelow = spaceBelow > tipH + 24;
    const fitsAbove = spaceAbove > tipH + 24;

    let below;
    if (pos === 'top')         below = false;
    else if (pos === 'bottom') below = true;
    else                       below = fitsBelow || !fitsAbove; // 'auto'

    if (below) {
      tip.classList.add('below');
      tip.style.top = (r.bottom + 14) + 'px';
    } else {
      tip.classList.add('above');
      tip.style.top = (r.top - tipH - 14) + 'px';
    }

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
      if (_tourIdx >= TOUR_STEPS.length) { endTour(true); return; }
      showTourStep();
    });
    document.getElementById('obTipBack').addEventListener('click', function() {
      if (_tourIdx > 0) { _tourIdx--; showTourStep(); }
    });
    document.getElementById('obTipSkip').addEventListener('click', function() { endTour(false); });
    document.addEventListener('keydown', function(e) {
      if (!_tourActive) return;
      if (e.key === 'Escape') endTour(false);
      if (e.key === 'ArrowRight' && e.target.id === 'obTipNext') { _tourIdx++; showTourStep(); }
    });
    window.addEventListener('resize', function() {
      if (_tourActive) showTourStep(); // reposition
    });
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

  function maybeWelcome() {
    // Never run on tiny embeds/iframes or before body exists
    if (!document.body) return;
    // Mark returning users as onboarded BEFORE arming tips so their tips work
    if (!flag(K.onboarded) && isReturningUser()) flag(K.onboarded, true);
    trackDetailViews();
    maybeCmdkTip();
    maybeGasTip();
    maybePwaTip();
    if (flag(K.onboarded)) return; // already seen (or returning user)
    // Wait for first content paint so the page doesn't feel broken
    setTimeout(function() {
      if (document.querySelector('.overlay.open') || document.body.classList.contains('ai-sheet-open')) return; // don't fight other modals
      showWelcome();
    }, 1400);
  }

  // Public: replay the tour from the footer link
  function startOnboarding() {
    if (_root && _root.classList.contains('ob-welcome-open')) return;
    flag(K.onboarded, false);
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