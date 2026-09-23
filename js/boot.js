/* ═══════════════════════════════════════════════════════════
   BOOT §BOOT
═══════════════════════════════════════════════════════════ */
init();

/* ═══════════════════════════════════════════════════════════
   MOBILE UX — Pull to refresh + Sheet swipe to close
═══════════════════════════════════════════════════════════ */
(function(){
  // ── Pull-to-refresh ──────────────────────────────────────
  var ptrBar = document.createElement('div');
  ptrBar.className = 'ptr-bar';
  ptrBar.textContent = '↓ Release to refresh';
  document.body.appendChild(ptrBar);

  var startY = 0, startX = 0, pulling = false, pulledFar = false, refreshing = false, lastRefresh = 0;
  var PTR_ACTIVATE = 24;    // px of downward travel before the hint shows
  var PTR_THRESHOLD = 110;  // px needed to actually trigger a refresh
  var PTR_COOLDOWN = 8000;  // min ms between refreshes
  var ptrHideTimer = null;

  function resetPtr() {
    pulling = false; pulledFar = false; startY = 0; startX = 0;
    ptrBar.classList.remove('show', 'ready');
    clearTimeout(ptrHideTimer);
  }

  function ptrEligible() {
    if (refreshing) return false;
    if ((window.scrollY || 0) > 0 || (document.documentElement.scrollTop || 0) > 0) return false;
    if (document.body.classList.contains('ai-sheet-open')) return false;
    // Don't hijack gestures inside open sheets, modals, lightbox or
    // scrollable carousels/detail galleries.
    if (document.querySelector('.overlay.open, .lightbox.open, .ai-sheet.open, .modal.open')) return false;
    var ae = document.activeElement;
    if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return false;
    return true;
  }

  // Media-query listener so rotating/resizing doesn't leave PTR
  // permanently on or off for the session.
  function ptrMatch() {
    return (typeof window.matchMedia === 'function')
      ? window.matchMedia('(max-width: 640px)').matches
      : window.innerWidth <= 640;
  }
  if (typeof window.matchMedia === 'function') {
    try {
      var ptrMQ = window.matchMedia('(max-width: 640px)');
      var ptrMQFn = function(){ resetPtr(); };
      if (ptrMQ.addEventListener) ptrMQ.addEventListener('change', ptrMQFn);
      else if (ptrMQ.addListener) ptrMQ.addListener(ptrMQFn);
    } catch (e) {}
  }

  // NOTE: listeners stay registered on all viewports — ptrMatch()/
  // ptrEligible() gate each gesture, so rotating to desktop can't leave
  // a stuck handler and rotating back to mobile keeps working.

  document.addEventListener('touchstart', function(e){
    if (!ptrMatch() || !ptrEligible() || !e.touches || !e.touches.length) return;
    // Multi-touch (pinch/zoom) is never a refresh gesture.
    if (e.touches.length > 1) { resetPtr(); return; }
    startY = e.touches[0].clientY;
    startX = e.touches[0].clientX;
    pulling = false; pulledFar = false;
  }, {passive:true});

  document.addEventListener('touchmove', function(e){
    if (startY === 0 || !e.touches || !e.touches.length) return;
    if (e.touches.length > 1) { resetPtr(); return; }
    var t = e.touches[0];
    var dy = t.clientY - startY;
    var dx = Math.abs(t.clientX - startX);
    // Mostly-horizontal swipe (carousels, gallery, back gesture) cancels PTR.
    if (dx > 30 && dx > Math.abs(dy) * 1.2) { resetPtr(); return; }
    if (dy < 0) { if (!pulling) { startY = 0; startX = 0; } return; }
    if (window.scrollY !== 0 || !ptrEligible()) { if (!pulling) { startY = 0; startX = 0; } return; }
    if (dy > PTR_ACTIVATE) {
      pulling = true;
      pulledFar = dy > PTR_THRESHOLD;
      ptrBar.textContent = pulledFar ? '↑ Release to refresh' : '↓ Pull to refresh';
      ptrBar.classList.add('show');
      ptrBar.classList.toggle('ready', pulledFar);
      // Safety: auto-hide after 4 seconds if stuck
      clearTimeout(ptrHideTimer);
      ptrHideTimer = setTimeout(function(){
        resetPtr();
      }, 4000);
    }
  }, {passive:true});

  document.addEventListener('touchend', function(){
    var shouldRefresh = pulling && pulledFar && (Date.now() - lastRefresh > PTR_COOLDOWN);
    resetPtr();
    if (shouldRefresh && !refreshing) {
      refreshing = true;
      lastRefresh = Date.now();
      ptrBar.textContent = '⟳ Refreshing…';
      ptrBar.classList.add('show', 'loading');
      // Reload listings from Supabase
      var done = function(){
        refreshing = false;
        ptrBar.classList.remove('show', 'ready', 'loading');
      };
      if (window._ads !== undefined) {
        setTimeout(function(){
          try {
            if (typeof loadAds === 'function') {
              loadAds().then(function(){
                try { renderCats(); } catch (e) {}
                try { renderHome(); } catch (e) {}
                done();
              }, function(){ done(); });
            } else { done(); }
          } catch (e) { done(); }
        }, 300);
        // Backstop: never leave the spinner stuck.
        setTimeout(function(){ if (refreshing) done(); }, 12000);
      } else {
        location.reload();
      }
    }
  }, {passive:true});

  document.addEventListener('touchcancel', function(){ resetPtr(); }, {passive:true});

  // ── AI Sheet swipe-to-close ──────────────────────────────
  var sheet = document.getElementById('aiSheet');
  if(!sheet) return;
  var sheetStartY = 0, sheetDragging = false, CLOSE_THRESHOLD = 100;

  sheet.addEventListener('touchstart', function(e){
    // Only track drags starting on the handle or header
    var handle = document.querySelector('.ai-sheet-handle, .ai-sheet-header');
    if(handle && (handle.contains(e.target) || e.target === handle)){
      sheetStartY = e.touches[0].clientY;
      sheetDragging = true;
    }
  }, {passive:true});

  sheet.addEventListener('touchmove', function(e){
    if(!sheetDragging) return;
    var dy = e.touches[0].clientY - sheetStartY;
    if(dy > 0){
      sheet.style.transform = 'translateY(' + Math.min(dy, 300) + 'px)';
    }
  }, {passive:true});

  sheet.addEventListener('touchend', function(e){
    if(!sheetDragging) return;
    var dy = e.changedTouches[0].clientY - sheetStartY;
    sheet.style.transform = '';
    sheet.style.transition = '';
    if(dy > CLOSE_THRESHOLD && typeof closeAiSheet === 'function'){
      closeAiSheet();
    }
    sheetDragging = false;
    sheetStartY = 0;
  }, {passive:true});

})();
