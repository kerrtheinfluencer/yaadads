/* dock.js — gas + Ask strip inside the phone tab bar (styled in hybrid.css, phones only).
   Replaces the old floating gas pill and AI orb. The strip lives INSIDE #mobNav, so it hides,
   slides and shrinks together with the bar (the bar's own scroll logic toggles .mob-nav-compact). */
(function () {
  'use strict';
  var GAS = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 20V5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v15M5 20h9M14 9h2.5a1.5 1.5 0 0 1 1.5 1.5V16a1.5 1.5 0 0 0 3 0V9l-3-3"/><path d="M7 8h5"/></svg>';
  var ICONS = {
    mnHome: '<path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>',
    mnSaved: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 5.5-7 10-7 10z"/>',
    mnMsgs: '<path d="M4 5h16v11H9l-5 4z"/>',
    mnAccount: '<circle cx="12" cy="8" r="4"/><path d="M4 20c1-4 4-6 8-6s7 2 8 6"/>'
  };
  function icon(path) {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('class', 'hy-ic'); s.setAttribute('width', '18'); s.setAttribute('height', '18'); s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2.2');
    s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true');
    s.innerHTML = path; return s;
  }
  function build() {
    var nav = document.getElementById('mobNav');
    if (!nav || document.getElementById('hyStrip')) return;
    var strip = document.createElement('div');
    strip.className = 'hy-strip'; strip.id = 'hyStrip';
    strip.innerHTML =
      '<a href="/gas-prices.html#prices" id="hyGas" aria-label="Jamaica gas prices today">' + GAS + '<span id="hyGasPrice">Gas</span></a>' +
      '<button type="button" id="hyAsk" aria-label="Ask Yaad Brain"><span class="hy-ask-full">Ask Yaad Brain</span><span class="hy-ask-short">Ask \u2726</span>' +
      '<span class="hy-orb" aria-hidden="true"><i></i><i></i><i></i><i></i></span></button>';
    nav.insertBefore(strip, nav.firstChild);
    document.getElementById('hyAsk').addEventListener('click', function () { if (window.openAiSheet) window.openAiSheet(); });
    Object.keys(ICONS).forEach(function (id) {
      var el = document.getElementById(id); if (el) el.insertBefore(icon(ICONS[id]), el.firstChild);
    });
    // mirror the live price the banner already fetches
    var src = document.getElementById('bannerPrice'), out = document.getElementById('hyGasPrice');
    function sync() { var t = src && src.textContent.trim(); if (t && t !== '\u2026') out.textContent = t; }
    if (src) { sync(); if (window.MutationObserver) new MutationObserver(sync).observe(src, { childList: true, characterData: true, subtree: true }); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
