/* ═══════════════════════════════════════════════════════════════════════════
   §PHOTO-GESTURES — touch fine-tuning for the fullscreen lightbox
   ───────────────────────────────────────────────────────────────────────────
   The old lightbox read only the FIRST and LAST touch: a `touchend` compared
   `changedTouches[0].clientX` to the start and fired a nav if |dx| > 50px.
   Nothing followed the finger, a 51px diagonal drift counted as a swipe, a
   deliberate slow drag counted as a swipe, and there was no zoom at all — so
   on a phone it felt like a coin-flip whether the photo changed, and you could
   never pinch into a listing's detail.

   This replaces that with ONE gesture engine that owns the lightbox while it
   is open:
     • axis-locked swipe — the photo only follows once the gesture is clearly
       horizontal (vertical drags never steal a photo change),
     • decision by distance OR flick velocity, so a quick short flick works,
     • vertical drag DOWN past a threshold dismisses the viewer,
     • pinch-to-zoom + double-tap-to-zoom, with panning while zoomed,
     • a tap on the backdrop still closes (the inline onclick is untouched),
     • multi-touch is never mistaken for a swipe.
   It publishes nothing: an IIFE, so it can never collide with another file's
   top-level let/const/var (tools/verify-v2.js checks for exactly that), and it
   feature-detects the app's own lbNav()/closeLightbox() at call time so load
   order can never break it. Idempotent — safe to include twice.
   Static ad pages get the same engine inlined by generate-pages.js.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;
  var lb = document.getElementById('lightbox');
  var img = document.getElementById('lbImg');
  if (!lb || !img) return;
  if (lb._yaadGestureWired) return;
  lb._yaadGestureWired = true;

  var SWIPE_COMMIT = 56;    // px of horizontal travel that always changes photo
  var SWIPE_FLICK  = 22;    // px that changes photo if released fast enough
  var FLICK_V      = 0.45;  // px/ms — the "fast enough" line
  var SLOP         = 8;     // px before an axis is locked
  var DISMISS      = 96;    // px dragged down to dismiss
  var DISMISS_V    = 0.6;   // px/ms downward flick to dismiss
  var MAX_SCALE    = 4;
  var DOUBLE_MS    = 300;
  var DOUBLE_PX    = 30;

  var scale = 1, tx = 0, ty = 0;         // committed zoom / pan
  var g = null;                          // the live gesture
  var lastTapTs = 0, lastTapX = 0, lastTapY = 0;
  var eatClick = false;

  function now() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function dist(a, b) {
    var dx = a.clientX - b.clientX, dy = a.clientY - b.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /* Write the transform. IMPORTANT inline beats the entrance keyframe
     (`animation: lbIn`) — animations outrank normal author styles in the
     cascade, so a plain inline transform would be ignored while it played. */
  function paint(anim) {
    img.style.transition = anim ? 'transform .22s cubic-bezier(.22,.61,.36,1)' : 'none';
    if (scale > 1.001 || tx || ty) {
      img.style.animation = 'none';
      img.style.setProperty('transform',
        'translate3d(' + tx.toFixed(1) + 'px,' + ty.toFixed(1) + 'px,0) scale(' + scale.toFixed(3) + ')',
        'important');
    } else {
      img.style.removeProperty('transform');
    }
    img.classList.toggle('zoomed', scale > 1.001);
  }
  function clampPan() {
    var mx = img.offsetWidth  * (scale - 1) / 2;
    var my = img.offsetHeight * (scale - 1) / 2;
    tx = clamp(tx, -mx, mx);
    ty = clamp(ty, -my, my);
  }
  function resetZoom(anim) {
    scale = 1; tx = 0; ty = 0;
    img.style.animation = '';
    paint(anim);
  }
  /* A committed gesture may still bubble a synthetic click into the inline
     onclick handlers (closeLightbox on the backdrop). Swallow exactly one. */
  function armEat() {
    eatClick = true;
    setTimeout(function () { eatClick = false; }, 400);
  }
  document.addEventListener('click', function (e) {
    if (!eatClick) return;
    eatClick = false;
    e.stopPropagation();
    e.preventDefault();
  }, true);

  function nav(dir) {
    resetZoom(false);
    if (typeof lbNav === 'function') { try { lbNav(dir); } catch (e) {} }
  }

  // A new photo (any nav path: arrows, dots, swipe) resets zoom.
  img.addEventListener('load', function () { resetZoom(false); });
  // Open/close both reset, so reopening never shows a stale zoom.
  if (typeof MutationObserver === 'function') {
    new MutationObserver(function () { resetZoom(false); })
      .observe(lb, { attributes: true, attributeFilter: ['class'] });
  }
  window.addEventListener('orientationchange', function () {
    lb.style.opacity = '';
    resetZoom(false);
  });

  lb.addEventListener('touchstart', function (e) {
    if (!e.touches || !e.touches.length) return;
    if (e.touches.length >= 2) {
      img.style.animation = 'none';
      var a = e.touches[0], b = e.touches[1];
      g = { mode: 'pinch', d0: dist(a, b),
            mx: (a.clientX + b.clientX) / 2, my: (a.clientY + b.clientY) / 2,
            s0: scale, x0: tx, y0: ty };
      return;
    }
    var p = e.touches[0];
    if (scale > 1.001) {
      g = { mode: 'pan', sx: p.clientX, sy: p.clientY, x0: tx, y0: ty };
    } else {
      g = { mode: 'tap', sx: p.clientX, sy: p.clientY, axis: null, t0: now() };
    }
  }, { passive: true });

  lb.addEventListener('touchmove', function (e) {
    if (!g) return;
    if (g.mode === 'pinch') {
      if (e.touches.length < 2) return;
      var a = e.touches[0], b = e.touches[1];
      scale = clamp(g.s0 * (dist(a, b) / (g.d0 || 1)), 1, MAX_SCALE);
      tx = g.x0 + ((a.clientX + b.clientX) / 2 - g.mx);
      ty = g.y0 + ((a.clientY + b.clientY) / 2 - g.my);
      if (scale <= 1.001) { tx = 0; ty = 0; }
      clampPan(); paint(false); e.preventDefault();
      return;
    }
    var t = e.touches[0];
    if (!t) return;
    var dx = t.clientX - g.sx, dy = t.clientY - g.sy;
    if (g.mode === 'pan') {
      tx = g.x0 + dx; ty = g.y0 + dy;
      clampPan(); paint(false); e.preventDefault();
      return;
    }
    if (!g.axis) {
      if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
      g.axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
    }
    img.style.animation = 'none';
    if (g.axis === 'x') {
      tx = dx; ty = 0;
    } else {
      ty = Math.max(0, dy); tx = 0;
      lb.style.opacity = String(clamp(1 - dy / 500, 0.4, 1));
    }
    paint(false); e.preventDefault();
  }, { passive: false });

  lb.addEventListener('touchend', function (e) {
    if (!g) return;
    var gg = g; g = null;
    var dt = Math.max(1, now() - (gg.t0 || now()));

    if (gg.mode === 'pinch') {
      if (e.touches && e.touches.length >= 1) return;  // one finger still down
      if (scale <= 1.05) resetZoom(true);
      else { clampPan(); paint(true); }
      return;
    }
    if (gg.mode === 'pan') { clampPan(); paint(true); return; }

    var t = (e.changedTouches && e.changedTouches[0]) || null;
    var dx = t ? t.clientX - gg.sx : 0;
    var dy = t ? t.clientY - gg.sy : 0;

    if (gg.axis === 'x') {
      var v = Math.abs(dx) / dt;
      if (Math.abs(dx) >= SWIPE_COMMIT || (Math.abs(dx) >= SWIPE_FLICK && v >= FLICK_V)) {
        armEat();
        nav(dx < 0 ? 1 : -1);
      } else { resetZoom(true); }
      return;
    }
    if (gg.axis === 'y') {
      lb.style.opacity = '';
      if (dy >= DISMISS || (dy >= 40 && dy / dt >= DISMISS_V)) {
        armEat();
        resetZoom(false);
        if (typeof closeLightbox === 'function') { try { closeLightbox(); } catch (err) {} }
      } else { ty = 0; paint(true); }
      return;
    }
    // No axis lock => a tap. Two quick taps toggle zoom (browser double-tap
    // zoom is disabled by `touch-action: none`, so we provide our own).
    var ts = now();
    if (ts - lastTapTs < DOUBLE_MS &&
        Math.abs(gg.sx - lastTapX) < DOUBLE_PX && Math.abs(gg.sy - lastTapY) < DOUBLE_PX) {
      armEat();
      lastTapTs = 0;
      if (scale > 1.05) { resetZoom(true); return; }
      var r = img.getBoundingClientRect();
      scale = clamp(2.5, 1, MAX_SCALE);
      tx = -((gg.sx - (r.left + r.width / 2)) * (scale - 1));
      ty = -((gg.sy - (r.top + r.height / 2)) * (scale - 1));
      clampPan(); paint(true);
    } else {
      lastTapTs = ts; lastTapX = gg.sx; lastTapY = gg.sy;
    }
  }, { passive: true });

  lb.addEventListener('touchcancel', function () {
    g = null;
    lb.style.opacity = '';
    tx = 0; ty = 0;
    if (scale <= 1.05) resetZoom(true); else { clampPan(); paint(true); }
  }, { passive: true });
})();
