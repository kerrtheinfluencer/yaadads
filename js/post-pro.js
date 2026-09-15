/* ═══════════════════════════════════════════════════════════
   🚀 POST AD PRO — premium onboarding + uploader upgrade §PP
   ═══════════════════════════════════════════════════════════
   Turns the plain Post-Ad wizard into a guided, gamified
   experience. Everything here is additive — the wizard's own
   functions (openPostAd/nextStep/postMyAd) keep working and
   simply call in here through small typeof-guarded hooks:

     ppOnOpen()       ← openPostAd()      (draft restore + tour)
     ppOnStep(n)      ← setStep(n)        (chrome: progress/tips)
     ppUploadTick(i,n)← postMyAd() loop   (per-photo progress)
     ppPostSuccess(ad)← postMyAd()        (success screen + XP)

   Features
     1 · First-run coach-mark tour (replayable any time)
     2 · Step progress meter + completion ring + pro tips
     3 · Drag & drop AND clipboard paste photos
     4 · Tap any photo → "make cover"
     5 · Draft autosave — never lose work on mobile
     6 ·  Smart fill: paste any text → fills the whole form
     7 · Live J$ price formatting + inline field errors
     8 · Success screen: confetti, WhatsApp share, XP, "post another"

   Storage (localStorage): ya_pp_v1 (progress) · ya_pp_draft_v1
   Globals used: $el, CU, catById, PARISHES, CATS, showToast,
   openOverlay/closeOverlay, launchConfetti, _addFilesToPhotos,
   renderPhotoGrid, uploadPhotos, capParseCaption, capAward
   Every id/function is prefixed pp/PP — zero clashes.
   ═══════════════════════════════════════════════════════════ */

var PP_STORE_KEY = 'ya_pp_v1';
var PP_DRAFT_KEY = 'ya_pp_draft_v1';

/* ── §PP-STORE — post progress (posts, checklist, tour flag) ── */
var ppStore = (function () {
  var d = { posts: 0, tour: false, check: { ad: false, photo: false, share: false }, lastPost: '' };
  try {
    var raw = JSON.parse(localStorage.getItem(PP_STORE_KEY) || 'null');
    if (raw && typeof raw === 'object') {
      d = Object.assign(d, raw);
      d.check = Object.assign({ ad: false, photo: false, share: false }, d.check || {});
    }
  } catch (e) {}
  return d;
})();

function ppSave() { try { localStorage.setItem(PP_STORE_KEY, JSON.stringify(ppStore)); } catch (e) {} }

/* ── §PP-XP — post-ad XP awards (capAward shim is a no-op) ── */
var PP_XP = { fill: 8, publish: 60, photo: 2, cover: 1, draft: 3, share: 15, tour: 20 };
function ppAward(xp, why) {
  if (!xp) return;
  try { if (typeof capAward === 'function') capAward(xp, why); } catch (e) {}
}

/* ── small helpers ── */
function ppQ(id) { return (typeof $el === 'function') ? $el(id) : document.getElementById(id); }
function ppEscape(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function ppMoney(n) {
  var v = Number(n) || 0;
  return 'J$ ' + v.toLocaleString('en-JM');
}
function ppCatName(id) { try { var c = catById(id); return (c && c.name) || 'Other'; } catch (e) { return 'Other'; } }

/* ── §PP-CHROME — progress meter, completion ring, pro tips ── */
var PP_TIPS = {
  1: '💡 Buyers skip ads with no price. A real number gets 3× more calls.',
  2: ' Real photos of the actual item sell fastest. First photo = your cover.',
  3: '👀 Check the preview — that is exactly what buyers will see.'
};

function ppFieldScore() {
  var ids = ['aTitle', 'aCat', 'aParish', 'aPrice', 'aDesc'];
  var done = 0;
  ids.forEach(function (id) {
    var el = ppQ(id);
    if (el && String(el.value || '').trim()) done++;
  });
  var grid = ppQ('photoGrid');
  var hasPhoto = grid && grid.querySelector('.photo-thumb');
  return { done: done, total: ids.length, pct: Math.round((done + (hasPhoto ? 1 : 0)) / (ids.length + 1) * 100), photo: !!hasPhoto };
}

function ppPaintChrome() {
  var bar = ppQ('ppBar');
  if (!bar) return;
  var s = ppFieldScore();
  var ring = bar.querySelector('.pp-ring-fill');
  var label = bar.querySelector('.pp-bar-label');
  if (ring) {
    var C = 2 * Math.PI * 15;
    ring.style.strokeDasharray = C;
    ring.style.strokeDashoffset = C * (1 - s.pct / 100);
  }
  if (label) label.textContent = s.pct >= 100 ? 'Ready to go 🚀' : s.pct + '% complete';
  var wrap = bar.querySelector('.pp-bar-wrap');
  if (wrap) wrap.classList.toggle('pp-ready', s.pct >= 100);
}

function ppRenderChrome() {
  var modal = ppQ('ovPost');
  if (!modal) return;
  var host = ppQ('ppBar');
  if (!host || host.dataset.ppDone) { ppPaintChrome(); return; }
  host.dataset.ppDone = '1';
  host.innerHTML =
    '<div class="pp-bar-wrap">' +
      '<div class="pp-bar-left">' +
        '<svg class="pp-ring" viewBox="0 0 36 36" aria-hidden="true">' +
          '<circle class="pp-ring-bg" cx="18" cy="18" r="15"></circle>' +
          '<circle class="pp-ring-fill" cx="18" cy="18" r="15"></circle>' +
        '</svg>' +
        '<span class="pp-bar-label">0% complete</span>' +
      '</div>' +
      '<button type="button" class="pp-help" onclick="ppStartTour()">❔ How it works</button>' +
    '</div>' +
    '<div class="pp-tip" id="ppTip"></div>';
  ppPaintChrome();
  ppPaintTip(currentPostStep || 1);
}

function ppPaintTip(step) {
  var t = ppQ('ppTip');
  if (!t) return;
  var txt = PP_TIPS[step] || '';
  if (t.textContent === txt) return;
  t.textContent = txt;
  t.classList.remove('pp-tip-in');
  void t.offsetWidth;
  if (txt) t.classList.add('pp-tip-in');
}

/* ── §PP-PHOTOS — drag & drop, clipboard paste, make-cover ── */
function ppPhotoBoard() {
  if (ppQ('ovPost') && ppQ('ovPost').classList.contains('open')) {
    return { grid: ppQ('photoGrid'), list: uploadPhotos, render: renderPhotoGrid, label: 'ad' };
  }
  if (ppQ('ovEditAd') && ppQ('ovEditAd').classList.contains('open')) {
    return { grid: ppQ('eaPhotoGrid'), list: _editAdPhotos, render: renderEditAdPhotoGrid, label: 'edit' };
  }
  return null;
}

function ppAddFilesToBoard(files, board) {
  if (!files || !files.length) return;
  var b = board || ppPhotoBoard();
  if (!b || !b.list) return;
  var room = 6 - b.list.length;
  if (room <= 0) { showToast('6 photos max — remove one first', '⚠️'); return; }
  var n = Math.min(files.length, room);
  _addFilesToPhotos(files, b.list, b.render);
  if (b.label === 'ad' && b.list.length) {
    uploadUrl = b.list[0].preview;
    ppAward(PP_XP.photo * n, n + ' photo' + (n === 1 ? '' : 's') + ' added');
    ppStore.check.photo = true; ppSave();
    showToast(n + ' photo' + (n === 1 ? '' : 's') + ' added ✨', '');
  }
  ppPaintChrome();
}

function ppDropOver(e) { e.preventDefault(); e.stopPropagation(); var g = e.currentTarget; if (g) g.classList.add('pp-drag'); }
function ppDropLeave(e) { e.preventDefault(); var g = e.currentTarget; if (g) g.classList.remove('pp-drag'); }
function ppDropFiles(e) {
  e.preventDefault(); e.stopPropagation();
  var g = e.currentTarget; if (g) g.classList.remove('pp-drag');
  var dt = e.dataTransfer;
  if (!dt) return;
  ppAddFilesToBoard(dt.files && dt.files.length ? dt.files : null);
}

/* Paste photos straight from the clipboard — the fastest lane on desktop,
   and works on mobile too when the OS offers "paste image". */
function ppPasteHandler(e) {
  var b = ppPhotoBoard();
  if (!b) return;
  var tag = (e.target && e.target.tagName || '').toLowerCase();
  var typing = tag === 'input' || tag === 'textarea';
  var items = (e.clipboardData && e.clipboardData.items) || [];
  var imgs = [];
  for (var i = 0; i < items.length; i++) {
    if (items[i].type && items[i].type.indexOf('image') === 0) {
      var f = items[i].getAsFile();
      if (f) imgs.push(f);
    }
  }
  if (!imgs.length) return;            // plain text paste → let the field have it
  if (typing) return;
  e.preventDefault();
  ppAddFilesToBoard(imgs, b);
}

function ppSetCover(i) {
  if (i <= 0 || i >= uploadPhotos.length) return;
  var item = uploadPhotos.splice(i, 1)[0];
  uploadPhotos.unshift(item);
  uploadUrl = uploadPhotos[0].preview;
  renderPhotoGrid();
  ppAward(PP_XP.cover, 'Cover photo set');
}
function ppSetEditCover(i) {
  if (i <= 0 || i >= _editAdPhotos.length) return;
  var item = _editAdPhotos.splice(i, 1)[0];
  _editAdPhotos.unshift(item);
  renderEditAdPhotoGrid();
  ppAward(PP_XP.cover, 'Cover photo set');
}

function ppWireBoards() {
  [['photoGrid', ppQ('photoGrid')], ['eaPhotoGrid', ppQ('eaPhotoGrid')]].forEach(function (pair) {
    var g = pair[1];
    if (!g || g.dataset.ppWired) return;
    g.dataset.ppWired = '1';
    g.addEventListener('dragover', ppDropOver);
    g.addEventListener('dragenter', ppDropOver);
    g.addEventListener('dragleave', ppDropLeave);
    g.addEventListener('drop', ppDropFiles);
  });
}

/* ── §PP-FIELDS — live price formatting + inline errors ── */
function ppPriceHint() {
  var inp = ppQ('aPrice');
  if (!inp) return;
  var host = inp.parentNode;
  var hint = ppQ('ppPriceHint');
  if (!hint) {
    hint = document.createElement('div');
    hint.id = 'ppPriceHint';
    hint.className = 'pp-price-hint';
    host.appendChild(hint);
  }
  var v = parseFloat(inp.value);
  if (v > 0) { hint.textContent = ppMoney(v); hint.classList.add('show'); }
  else { hint.textContent = ''; hint.classList.remove('show'); }
}

function ppFieldMsg(id, msg) {
  var el = ppQ(id);
  if (!el) return;
  var host = el.parentNode;
  var m = document.getElementById('ppMsg-' + id);
  if (!m) {
    m = document.createElement('div');
    m.id = 'ppMsg-' + id;
    m.className = 'pp-field-msg';
    host.appendChild(m);
  }
  if (msg) {
    m.textContent = msg;
    m.classList.add('show');
    el.classList.add('pp-bad');
  } else {
    m.textContent = '';
    m.classList.remove('show');
    el.classList.remove('pp-bad');
  }
}

function ppCheckField(id) {
  var el = ppQ(id);
  if (!el) return true;
  var v = String(el.value || '').trim();
  if (id === 'aTitle') {
    if (!v) { ppFieldMsg(id, 'Give your ad a title — e.g. "Toyota Axio 2015"'); return false; }
    if (v.length < 4) { ppFieldMsg(id, 'A little more detail helps buyers ^'); return false; }
  }
  if (id === 'aPrice') {
    if (!v || !(parseFloat(v) > 0)) { ppFieldMsg(id, 'Enter a real price in JMD — buyers skip "inbox me"'); return false; }
  }
  if (id === 'aDesc' && v.length < 10) {
    ppFieldMsg(id, 'Add a few details — condition, size, why you are selling'); return false;
  }
  if (id === 'aParish' && !v) { ppFieldMsg(id, 'Pick your parish so nearby buyers see it'); return false; }
  ppFieldMsg(id, '');
  return true;
}

function ppWireFields() {
  ['aTitle', 'aPrice', 'aDesc', 'aParish'].forEach(function (id) {
    var el = ppQ(id);
    if (!el || el.dataset.ppWired) return;
    el.dataset.ppWired = '1';
    el.addEventListener('blur', function () { ppCheckField(id); });
    el.addEventListener('input', function () {
      if (el.classList.contains('pp-bad')) ppCheckField(id);
      if (id === 'aPrice') ppPriceHint();
      ppPaintChrome();
      if (typeof ppDraftQueue === 'function') ppDraftQueue();
    });
  });
  var cat = ppQ('aCat');
  if (cat && !cat.dataset.ppWired) {
    cat.dataset.ppWired = '1';
    cat.addEventListener('change', function () {
      ppPaintChrome();
      if (cat.value && !ppQ('aCat').dataset.ppNudged) {
        cat.dataset.ppNudged = '1';
        showToast('Good choice — ' + ppCatName(cat.value) + ' buyers are active 🎯', '');
      }
    });
  }
}

/* ── §PP-SMARTFILL — paste anything, form fills itself ──
   Reuses the caption parser (capParseCaption in js/caption-parse.js)
   so a seller can paste text they already wrote and skip re-typing. */
function ppPulse(id) {
  var el = ppQ(id);
  if (!el) return;
  el.classList.remove('pp-filled');
  void el.offsetWidth;
  el.classList.add('pp-filled');
  setTimeout(function () { el.classList.remove('pp-filled'); }, 1400);
}

function ppSetSelect(sel, value) {
  if (!sel || !value) return false;
  var opts = sel.options || [];
  for (var i = 0; i < opts.length; i++) {
    if (String(opts[i].value).toLowerCase() === String(value).toLowerCase()) { sel.value = opts[i].value; return true; }
  }
  return false;
}

function ppSmartPanelHTML() {
  return '' +
    '<div class="pp-smart pp-in">' +
      '<button type="button" class="pp-smart-head" onclick="ppSmartToggle()">' +
        '<span class="pp-smart-ico">✨</span>' +
        '<span class="pp-smart-title">Smart fill — paste your caption, we do the typing</span>' +
        '<span class="pp-smart-chev" id="ppSmartChev">▾</span>' +
      '</button>' +
      '<div class="pp-smart-body open" id="ppSmartBody">' +
        '<textarea id="ppSmartText" class="form-inp" rows="4" ' +
          'placeholder="Paste the post or message you already wrote…&#10;e.g. Toyota Axio 2015, 85k km, AC cold, $1.6m neg, Kingston, 876-555-1234"></textarea>' +
        '<div class="pp-smart-row">' +
          '<button type="button" class="btn btn-gold btn-sm" onclick="ppSmartGo()">✨ Fill my ad</button>' +
          '<span class="pp-smart-note">Reads title · price · parish · category · phone</span>' +
        '</div>' +
      '</div>' +
    '</div>';
}

function ppSmartToggle() {
  var body = ppQ('ppSmartBody'), chev = ppQ('ppSmartChev');
  if (!body) return;
  var open = body.classList.toggle('open');
  if (chev) chev.textContent = open ? '▴' : '▾';
  if (open) { var ta = ppQ('ppSmartText'); if (ta) setTimeout(function () { ta.focus(); }, 120); }
}

function ppSmartFillMount() {
  var host = ppQ('ppSmartPanel');
  if (!host || host.dataset.ppDone) return;
  host.dataset.ppDone = '1';
  host.innerHTML = ppSmartPanelHTML();
}

function ppSmartGo() {
  var ta = ppQ('ppSmartText');
  var text = ta ? String(ta.value || '').trim() : '';
  if (!text) { showToast('Paste some text first ✨', '⚠️'); return; }
  if (typeof capParseCaption !== 'function') { showToast('Smart fill is unavailable right now', '⚠️'); return; }
  var p = null;
  try { p = capParseCaption(text); } catch (e) { p = null; }
  if (!p) { showToast('Could not read that — try adding a price and parish', '⚠️'); return; }

  var filled = [];

  var titleEl = ppQ('aTitle');
  if (titleEl && !titleEl.value.trim() && p.title) { titleEl.value = p.title; ppPulse('aTitle'); filled.push('title'); }

  var descEl = ppQ('aDesc');
  if (descEl && !descEl.value.trim() && p.desc) {
    descEl.value = p.desc.length > 600 ? p.desc.slice(0, 600) : p.desc;
    ppPulse('aDesc'); filled.push('description');
  }

  var priceEl = ppQ('aPrice');
  if (priceEl && !priceEl.value && p.price && !p.usd) {
    priceEl.value = p.price; ppPulse('aPrice'); ppPriceHint(); filled.push('price');
  }

  var parishEl = ppQ('aParish');
  if (parishEl && !parishEl.value && p.parish && ppSetSelect(parishEl, p.parish)) {
    ppPulse('aParish'); filled.push('parish');
  }

  var catEl = ppQ('aCat');
  if (catEl && p.category && p.category !== 'other' && ppSetSelect(catEl, p.category)) {
    ppPulse('aCat'); filled.push('category');
  }

  var phoneEl = ppQ('aPhone');
  if (phoneEl && !phoneEl.value.trim() && p.phone) { phoneEl.value = p.phone; ppPulse('aPhone'); filled.push('phone'); }

  var negEl = ppQ('aNeg');
  if (negEl) { var wantNeg = (p.neg !== false); if (negEl.checked !== wantNeg) { negEl.checked = wantNeg; ppPulse('aNeg'); } }

  ppPaintChrome();

  if (!filled.length) { showToast('Nothing new to fill — your fields are already set 👍', ''); return; }
  ppAward(PP_XP.fill, 'Smart fill used');
  showToast('Smart fill wrote your ' + filled.join(', ') + ' ✨', '');
  var body = ppQ('ppSmartBody');
  if (body) body.classList.remove('open');
  var chev = ppQ('ppSmartChev');
  if (chev) chev.textContent = '\u25be';
}

/* ─ §PP-DRAFT — autosave, so a phone call never eats the ad ── */
function ppDraftRead() {
  try {
    var d = JSON.parse(localStorage.getItem(PP_DRAFT_KEY) || 'null');
    return (d && typeof d === 'object') ? d : null;
  } catch (e) { return null; }
}
function ppDraftSnapshot() {
  var g = function (id) { var el = ppQ(id); return el ? String(el.value || '') : ''; };
  return {
    title: g('aTitle'), cat: g('aCat'), parish: g('aParish'), price: g('aPrice'),
    desc: g('aDesc'), phone: g('aPhone'),
    neg: !!(ppQ('aNeg') && ppQ('aNeg').checked), at: Date.now()
  };
}
function ppDraftHasContent(d) {
  return !!(d && (String(d.title || '').trim() || String(d.desc || '').trim() || String(d.price || '').trim()));
}
var _ppDraftTimer = null;
function ppDraftQueue() {
  clearTimeout(_ppDraftTimer);
  _ppDraftTimer = setTimeout(function () {
    var d = ppDraftSnapshot();
    if (!ppDraftHasContent(d)) return;
    try { localStorage.setItem(PP_DRAFT_KEY, JSON.stringify(d)); } catch (e) {}
    var note = ppQ('ppDraftNote');
    if (note) {
      note.textContent = '✓ Draft saved';
      note.classList.add('show');
      clearTimeout(note._t);
      note._t = setTimeout(function () { note.classList.remove('show'); }, 1800);
    }
  }, 650);
}
function ppDraftClear() {
  clearTimeout(_ppDraftTimer);
  try { localStorage.removeItem(PP_DRAFT_KEY); } catch (e) {}
  var b = ppQ('ppDraftBanner');
  if (b) b.remove();
}
function ppDraftOffer() {
  var host = ppQ('ppDraftHost');
  if (!host) return;
  var old = ppQ('ppDraftBanner');
  if (old) old.remove();
  var d = ppDraftRead();
  if (!ppDraftHasContent(d)) return;
  var mins = Math.max(1, Math.round((Date.now() - (d.at || Date.now())) / 60000));
  var when = mins < 60 ? mins + ' min ago' : Math.round(mins / 60) + 'h ago';
  var div = document.createElement('div');
  div.id = 'ppDraftBanner';
  div.className = 'pp-draft pp-in';
  div.innerHTML =
    '<span class="pp-draft-ico"></span>' +
    '<div class="pp-draft-txt"><strong>Unfinished ad found</strong>' +
      '<small>' + ppEscape(String(d.title || 'Untitled').slice(0, 40)) + ' · saved ' + when + '</small></div>' +
    '<button type="button" class="btn btn-gold btn-sm" onclick="ppDraftRestore()">Resume</button>' +
    '<button type="button" class="pp-draft-x" onclick="ppDraftClear()" aria-label="Discard draft">✕</button>';
  host.appendChild(div);
}
function ppDraftRestore() {
  var d = ppDraftRead();
  if (!d) return;
  var set = function (id, v) { var el = ppQ(id); if (el && v != null) { el.value = v; ppPulse(id); } };
  set('aTitle', d.title); set('aPrice', d.price); set('aDesc', d.desc);
  set('aPhone', d.phone);
  if (d.parish) { var p = ppQ('aParish'); if (p && ppSetSelect(p, d.parish)) ppPulse('aParish'); }
  if (d.cat) { var c = ppQ('aCat'); if (c && ppSetSelect(c, d.cat)) ppPulse('aCat'); }
  var n = ppQ('aNeg'); if (n) n.checked = !!d.neg;
  ppPriceHint(); ppPaintChrome();
  var b = ppQ('ppDraftBanner'); if (b) b.remove();
  ppAward(PP_XP.draft, 'Draft restored');
  showToast('Draft restored — just add your photos 📸', '');
}

/* ── §PP-HOOKS — called from listings.js ── */
function ppPublishBar(state, label) {
  var wrap = ppQ('ppUpWrap');
  if (!wrap) return;
  if (state === 'hide') { wrap.classList.remove('show'); return; }
  wrap.classList.add('show');
  var lab = wrap.querySelector('.pp-up-label');
  if (lab && label) lab.textContent = label;
}
function ppUploadTick(i, total) {
  var wrap = ppQ('ppUpWrap');
  if (!wrap) return;
  var pct = total ? Math.round(i / total * 100) : 0;
  var fill = wrap.querySelector('.pp-up-fill');
  if (fill) fill.style.width = pct + '%';
  ppPublishBar('show', 'Uploading photo ' + i + ' of ' + total + '…');
}
function ppPublishDone() { ppPublishBar('show', 'Publishing your ad…'); }

function ppOnOpen() {
  ppRenderChrome();
  ppSmartFillMount();
  ppWireBoards();
  ppWireFields();
  ppPriceHint();
  ppPaintTip(1);
  ppPublishBar('hide');
  var mb = ppQ('ovPost') && ppQ('ovPost').querySelector('.modal');
  if (mb) mb.classList.remove('pp-success-mode');
  var host = ppQ('ppSuccess');
  if (host) { host.classList.remove('active'); host.innerHTML = ''; }
  ppDraftOffer();
  if (!ppStore.tour) {
    setTimeout(function () {
      var ov = ppQ('ovPost');
      if (ov && ov.classList.contains('open')) ppStartTour();
    }, 750);
  }
}
function ppOnStep(n) {
  ppPaintChrome();
  ppPaintTip(n);
  if (n !== 3) ppPublishBar('hide');
  var mb = ppQ('ovPost') && ppQ('ovPost').querySelector('.modal');
  if (mb && !mb.classList.contains('pp-success-mode')) mb.scrollTop = 0;
}

/* ── §PP-SUCCESS — celebration + share + XP ── */
var ppLastAd = null;
function ppSlug(ad) {
  var raw = (ad.title || '') + (ad.parish ? '-' + ad.parish : '');
  var out = raw.toLowerCase()
    .replace(/[\u2018\u2019\u02bc`]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .slice(0, 80);
  return out + '-' + String(ad.id || '').slice(0, 8);
}
function ppAdUrl(ad) { return 'https://yaadadz.com/ad/' + ppSlug(ad) + '.html'; }
function ppShareText(ad) {
  return '\ud83d\uded2 ' + ad.title + ' \u2014 ' + ppMoney(ad.price) +
    (ad.parish ? ' \u00b7 ' + ad.parish : '') + ' on Yaad Adz \ud83c\uddef\ud83c\uddf2\n' + ppAdUrl(ad);
}
function ppShareAd() {
  if (!ppLastAd) return;
  ppStore.check.share = true; ppSave();
  ppAward(PP_XP.share, 'Shared your ad');
  try { window.open('https://wa.me/?text=' + encodeURIComponent(ppShareText(ppLastAd)), '_blank', 'noopener'); } catch (e) {}
}
function ppSuccessHTML(ad) {
  return '' +
    '<div class="pp-win">' +
      '<div class="pp-win-burst" aria-hidden="true"></div>' +
      '<div class="pp-win-ring"><span>\u2713</span></div>' +
      '<h3 class="pp-win-title">Your ad is <em>live</em> \ud83c\udf89</h3>' +
      '<p class="pp-win-sub">' + ppEscape(String(ad.title)) + ' \u00b7 ' + ppMoney(ad.price) +
        (ad.parish ? ' \u00b7 ' + ppEscape(String(ad.parish)) : '') + '</p>' +
      '<div class="pp-win-link">' +
        '<span class="pp-win-link-url">' + ppEscape(ppAdUrl(ad).replace(/^https?:\/\//, '')) + '</span>' +
        '<button type="button" class="pp-win-copy" id="ppWinCopy" onclick="ppCopyAdLink()">Copy link</button>' +
      '</div>' +
      '<p class="pp-win-note">Already showing in search and category pages \u2014 sharing it on WhatsApp usually brings far more views.</p>' +
      '<div class="pp-win-cta">' +
        '<button type="button" class="btn btn-gold btn-lg pp-win-share" onclick="ppShareAd()">\ud83d\udcac Share on WhatsApp</button>' +
        '<div class="pp-win-row">' +
          '<button type="button" class="btn btn-ghost" onclick="ppViewMyAd()">\ud83d\udc40 View listing</button>' +
          '<button type="button" class="btn btn-ghost" onclick="ppPostAnother()">\u2795 Post another</button>' +
        '</div>' +
      '</div>' +
      '<button type="button" class="pp-win-close" onclick="ppCloseWizard()">Done</button>' +
    '</div>';
}
function ppPostSuccess(ad) {
  var host = ppQ('ppSuccess');
  if (!host) return false;
  try {
    ppLastAd = ad;
    ppDraftClear();
    ppStore.posts = (ppStore.posts || 0) + 1;
    ppStore.check.ad = true;
    if (ad.photos && ad.photos.length) ppStore.check.photo = true;
    ppStore.lastPost = ad.id;
    ppSave();
    host.innerHTML = ppSuccessHTML(ad);
    ['sp1', 'sp2', 'sp3'].forEach(function (id) { var el = ppQ(id); if (el) el.classList.remove('active'); });
    host.classList.add('active');
    var mb = ppQ('ovPost') && ppQ('ovPost').querySelector('.modal');
    if (mb) { mb.classList.add('pp-success-mode'); mb.scrollTop = 0; }
    var tip = ppQ('ppTip');
    if (tip) tip.textContent = '';
    ppPublishBar('hide');
    ppAward(PP_XP.publish, 'Ad published');
    if (typeof launchConfetti === 'function') { try { launchConfetti(); } catch (e) {} }
    return true;
  } catch (e) { return false; }
}
function ppPostAnother() {
  var mb = ppQ('ovPost') && ppQ('ovPost').querySelector('.modal');
  if (mb) mb.classList.remove('pp-success-mode');
  var host = ppQ('ppSuccess');
  if (host) { host.classList.remove('active'); host.innerHTML = ''; }
  if (typeof openPostAd === 'function') openPostAd();
}
function ppViewMyAd() {
  var id = ppLastAd && ppLastAd.id;
  ppCloseWizard();
  if (id && typeof openAd === 'function') { try { openAd(id); return; } catch (e) {} }
  if (typeof goPage === 'function') { try { goPage('mine'); } catch (e) {} }
}
function ppCloseWizard() {
  var mb = ppQ('ovPost') && ppQ('ovPost').querySelector('.modal');
  if (mb) mb.classList.remove('pp-success-mode');
  var host = ppQ('ppSuccess');
  if (host) { host.classList.remove('active'); host.innerHTML = ''; }
  if (typeof closeOverlay === 'function') closeOverlay('ovPost');
}

/* ── §PP-TOUR — first-run coach marks (replayable) ── */
var PP_TOUR = [
  { step: 1, sel: 'ppSmartPanel', title: 'Skip the typing ✨',
    text: 'Already wrote a caption or a message about this item? Paste it here and <strong>Smart fill</strong> writes the title, price, parish, category and phone for you.' },
  { step: 1, sel: 'aCat', title: 'What are you selling?',
    text: 'Pick a category — buyers browse by category more than anything else, so this decides who sees your ad.' },
  { step: 1, sel: 'aPrice', title: 'Name a real price',
    text: 'Ads with an actual number get far more calls. We format it in JMD automatically, and you can still tick <strong>Negotiable</strong>.' },
  { step: 2, sel: 'photoGrid', title: 'Photos do the selling',
    text: 'Tap to browse, <strong>drag &amp; drop</strong>, or just <strong>paste</strong> (Ctrl/⌘+V) straight from your clipboard. Tap any photo to make it the cover.' },
  { step: 2, sel: 'aPhone', title: 'How buyers reach you',
    text: 'Optional — we use your profile number if you leave it blank. A number here gets WhatsApp and call buttons on your ad.' },
  { step: 3, sel: 'buildPreview', title: 'Exactly what buyers see',
    text: 'This is your live card. Check the photo, price and parish before you publish — you can always edit the ad later.' },
  { step: 3, sel: 'sp3pub', title: 'Free to publish 🚀',
    text: 'Your ad goes live instantly, gets its own Google-friendly page, and you can share it to WhatsApp in one tap.' }
];
var _ppTourIdx = 0, _ppTourOn = false, _ppTourWatch = null;

function ppTourTarget(sel) {
  if (!sel) return null;
  if (sel.charAt(0) === '#') { try { return document.querySelector(sel); } catch (e) { return null; } }
  if (sel === 'buildPreview') return ppQ('adPreviewCard');
  if (sel === 'sp3pub') { try { return document.querySelector('#sp3 .btn-gold'); } catch (e) { return null; } }
  return ppQ(sel);
}

function ppTourRoot() {
  var root = ppQ('ppTourRoot');
  if (root) return root;
  root = document.createElement('div');
  root.id = 'ppTourRoot';
  root.className = 'pp-tour';
  root.innerHTML =
    '<div class="pp-tour-block" id="ppTourBlock"></div>' +
    '<div class="pp-tour-spot" id="ppTourSpot"></div>' +
    '<div class="pp-tour-tip" id="ppTourTip" role="dialog" aria-live="polite">' +
      '<div class="pp-tour-k" id="ppTourK"></div>' +
      '<h4 class="pp-tour-h" id="ppTourH"></h4>' +
      '<p class="pp-tour-p" id="ppTourP"></p>' +
      '<div class="pp-tour-actions">' +
        '<button type="button" class="pp-tour-skip" onclick="ppTourExit(false)">Skip</button>' +
        '<span class="pp-tour-gap"></span>' +
        '<button type="button" class="pp-tour-back" id="ppTourBack" onclick="ppTourPrev()">← Back</button>' +
        '<button type="button" class="btn btn-gold btn-sm" id="ppTourNext" onclick="ppTourNext()">Next →</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(root);
  var block = root.querySelector('#ppTourBlock');
  if (block) block.addEventListener('click', function () { ppTourNext(); });
  var tip = root.querySelector('#ppTourTip');
  if (tip) tip.addEventListener('click', function (e) { e.stopPropagation(); });
  return root;
}

function ppStartTour() {
  var ov = ppQ('ovPost');
  if (!ov || !ov.classList.contains('open')) return;
  if (_ppTourOn) return;
  _ppTourOn = true;
  _ppTourIdx = 0;
  ppTourRoot();
  if (typeof setStep === 'function') setStep(1);
  ppTourShow(0);
  clearTimeout(_ppTourWatch);
  _ppTourWatch = setTimeout(function () { if (_ppTourOn) ppTourExit(false); }, 90000);
}

function ppTourExit(done) {
  if (!_ppTourOn && !ppQ('ppTourRoot')) return;
  _ppTourOn = false;
  clearTimeout(_ppTourWatch);
  var root = ppQ('ppTourRoot');
  if (root) root.remove();
  ppStore.tour = true; ppSave();
  if (done) {
    ppAward(PP_XP.tour, 'Took the guided tour');
    showToast('You are ready — post it like a pro 🚀', '');
    if (typeof setStep === 'function') setStep(1);
  }
}

function ppTourShow(i) {
  if (!_ppTourOn) return;
  var s = PP_TOUR[i];
  if (!s) { ppTourExit(true); return; }
  _ppTourIdx = i;
  if (typeof currentPostStep !== 'undefined' && currentPostStep !== s.step && typeof setStep === 'function') setStep(s.step);
  var k = ppQ('ppTourK'), h = ppQ('ppTourH'), p = ppQ('ppTourP');
  if (k) k.textContent = 'Step ' + (i + 1) + ' of ' + PP_TOUR.length;
  if (h) h.innerHTML = s.title;
  if (p) p.innerHTML = s.text;
  var back = ppQ('ppTourBack'), next = ppQ('ppTourNext');
  if (back) back.style.visibility = i === 0 ? 'hidden' : 'visible';
  if (next) next.innerHTML = (i === PP_TOUR.length - 1) ? 'Got it ✓' : 'Next →';
  var t = ppTourTarget(s.sel);
  if (t && t.scrollIntoView) { try { t.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { t.scrollIntoView(); } }
  ppTourPlace();
  setTimeout(ppTourPlace, 180);
  setTimeout(ppTourPlace, 420);
  setTimeout(ppTourPlace, 760);
}

function ppTourNext() {
  if (_ppTourIdx >= PP_TOUR.length - 1) { ppTourExit(true); return; }
  ppTourShow(_ppTourIdx + 1);
}
function ppTourPrev() { if (_ppTourIdx > 0) ppTourShow(_ppTourIdx - 1); }

function ppTourPlace() {
  if (!_ppTourOn) return;
  var s = PP_TOUR[_ppTourIdx];
  var spot = ppQ('ppTourSpot'), tip = ppQ('ppTourTip');
  if (!spot || !tip || !s) return;
  var t = ppTourTarget(s.sel);
  if (!t || !t.getBoundingClientRect) { spot.style.opacity = '0'; tip.classList.add('pp-tour-tip-float'); return; }
  var r = t.getBoundingClientRect();
  if (!r.width || !r.height) { spot.style.opacity = '0'; return; }
  spot.style.opacity = '1';
  var pad = 6;
  spot.style.top = (r.top - pad) + 'px';
  spot.style.left = (r.left - pad) + 'px';
  spot.style.width = (r.width + pad * 2) + 'px';
  spot.style.height = (r.height + pad * 2) + 'px';
  var tw = Math.min(340, window.innerWidth - 28);
  tip.style.width = tw + 'px';
  var th = tip.offsetHeight || 190;
  var below = r.bottom + 16;
  var fits = (below + th) < (window.innerHeight - 12);
  var top = fits ? below : Math.max(12, r.top - th - 16);
  var left = Math.min(Math.max(14, r.left + r.width / 2 - tw / 2), Math.max(14, window.innerWidth - tw - 14));
  tip.style.top = top + 'px';
  tip.style.left = left + 'px';
  /* Arrow flips to the bottom edge when the card sits above its target */
  if (fits) tip.classList.remove('pp-tour-tip-above');
  else tip.classList.add('pp-tour-tip-above');
  tip.classList.add('pp-tour-tip-show');
}

if (typeof window !== 'undefined') {
  window.addEventListener('resize', function () { if (_ppTourOn) ppTourPlace(); });
  window.addEventListener('scroll', function () { if (_ppTourOn) ppTourPlace(); }, true);
}