/* Shared ad pages: the photo that is on screen also becomes a soft blurred backdrop
   for the whole page, so the glass panels pick up its colours as you scroll. */
(function () {
  'use strict';
  try {
    var img = document.getElementById('featuredImg');
    if (!img) return;
    var bg = document.createElement('div');
    bg.className = 'v3-ad-bg';
    bg.setAttribute('aria-hidden', 'true');
    document.body.insertBefore(bg, document.body.firstChild);
    function paint() {
      var u = img.currentSrc || img.getAttribute('src');
      if (u) bg.style.backgroundImage = 'url("' + String(u).replace(/["\\\n\r]/g, '') + '")';
    }
    paint();
    img.addEventListener('load', paint);
    if (window.MutationObserver) new MutationObserver(paint).observe(img, { attributes: true, attributeFilter: ['src'] });
    document.body.classList.add('has-ad-bg');
    /* depth: as the page scrolls, the hero photo recedes (shrinks, softens, fades) while the
       backdrop sharpens, so the glass panels appear to slide over a photo that has moved back */
    var hero = document.querySelector('.gallery-main') || img.parentElement;
    var still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (hero && !still) {
      var ticking = false;
      var update = function () {
        ticking = false;
        var h = hero.offsetHeight || 300;
        var p = Math.max(0, Math.min(1, (window.pageYOffset || 0) / (h * 0.85)));
        document.body.style.setProperty('--p', p.toFixed(3));
      };
      window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
      window.addEventListener('resize', update);
      update();
    }
  } catch (e) { /* decoration only */ }
})();
