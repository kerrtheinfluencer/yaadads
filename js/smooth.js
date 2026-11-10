/* §SMOOTH — scroll governor. Pairs with smooth.css.
   Adds html.is-scrolling while the page is moving so the ambient animations behind
   the glass can rest, and removes it ~160ms after the last scroll event.
   (Device-tier detection lives inline in index.html <head> so it runs before first paint.) */
(function () {
  'use strict';
  var root = document.documentElement;
  var timer = 0;
  var moving = false;

  function rest() {
    moving = false;
    timer = 0;
    root.classList.remove('is-scrolling');
  }

  window.addEventListener('scroll', function () {
    if (!moving) {
      moving = true;
      root.classList.add('is-scrolling');
    }
    clearTimeout(timer);
    timer = setTimeout(rest, 160);
  }, { passive: true });

  // Never leave the animations frozen if the tab is backgrounded mid-scroll.
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { clearTimeout(timer); rest(); }
  });
})();
