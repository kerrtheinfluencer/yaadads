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
  } catch (e) { /* decoration only */ }
})();
