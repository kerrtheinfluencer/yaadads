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

  var startY = 0, pulling = false, PTR_THRESHOLD = 72;
  var ptrHideTimer = null;

  // Only enable pull-to-refresh on mobile
  if (window.innerWidth <= 640) {

  document.addEventListener('touchstart', function(e){
    if(window.scrollY === 0) startY = e.touches[0].clientY;
  }, {passive:true});

  document.addEventListener('touchmove', function(e){
    if(startY === 0) return;
    var dy = e.touches[0].clientY - startY;
    if(dy > 20 && window.scrollY === 0 && !document.body.classList.contains('ai-sheet-open')){
      pulling = true;
      ptrBar.textContent = dy > PTR_THRESHOLD ? '↑ Release to refresh' : '↓ Pull to refresh';
      ptrBar.classList.add('show');
      // Safety: auto-hide after 4 seconds if stuck
      clearTimeout(ptrHideTimer);
      ptrHideTimer = setTimeout(function(){
        if(pulling) { ptrBar.classList.remove('show'); pulling = false; startY = 0; }
      }, 4000);
    }
  }, {passive:true});

  document.addEventListener('touchend', function(){
    if(pulling){
      ptrBar.classList.remove('show');
      pulling = false;
      clearTimeout(ptrHideTimer);
      startY = 0;
      // Reload listings from Supabase
      if(window._ads !== undefined){
        setTimeout(function(){
          if(typeof loadAds === 'function') loadAds().then(function(){ renderCats(); renderHome(); });
        }, 300);
      } else {
        location.reload();
      }
    }
    startY = 0;
  }, {passive:true});

  } // end mobile-only PTR check

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
