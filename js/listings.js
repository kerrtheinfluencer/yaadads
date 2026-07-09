/* ═══════════════════════════════════════════════════════════
   EDIT AD §EDIT-AD
═══════════════════════════════════════════════════════════ */
let _editAdId = null;
let _editAdNewFile = null;

function openEditAd(id) {
  const ad = _ads.find(a => a.id === id);
  if (!ad) return;
  _editAdId = id;

  document.getElementById('eaTitle').value = ad.title || '';
  document.getElementById('eaPrice').value = ad.price || '';
  document.getElementById('eaDesc').value = ad.desc || '';
  document.getElementById('eaPhone').value = ad.phone || '';
  document.getElementById('eaNeg').checked = ad.neg || false;

  // Fill category select
  const eaCat = document.getElementById('eaCat');
  eaCat.innerHTML = CATS.map(c => '<option value="'+c.id+'"'+(c.id===ad.category?' selected':'')+'>'+c.icon+' '+c.name+'</option>').join('');

  // Fill parish select
  const eaParish = document.getElementById('eaParish');
  eaParish.innerHTML = '<option value="">Select…</option>' + PARISHES.map(p => '<option'+(p===ad.parish?' selected':'')+'>'+p+'</option>').join('');

  // Load existing photos into edit photo array
  _editAdPhotos = [];
  const existingPhotos = (ad.photos && ad.photos.length) ? ad.photos : (ad.image ? [ad.image] : []);
  existingPhotos.forEach(function(url) {
    _editAdPhotos.push({ url: url, file: null, preview: url });
  });
  renderEditAdPhotoGrid();

  document.getElementById('eaImgFile').value = '';
  document.getElementById('editAdAlert').className = 'alert-box';

  openOverlay('ovEditAd');
}

// Edit ad photo management
let _editAdPhotos = []; // Array of { url: existing URL or null, file: File or null, preview: dataURL or URL }

function renderEditAdPhotoGrid() {
  var grid = document.getElementById('eaPhotoGrid');
  if (!grid) return;
  var thumbs = _editAdPhotos.map(function(item, i) {
    return '<div class="photo-thumb-wrap">' +
      '<img src="' + item.preview + '" class="photo-thumb">' +
      '<button class="photo-rm" onclick="removeEditAdPhoto(' + i + ')">✕</button>' +
      (i===0 ? '<span class="photo-cover-tag">Cover</span>' : '') +
    '</div>';
  }).join('');
  var addBtn = _editAdPhotos.length < 6
    ? '<div class="photo-add-btn" onclick="document.getElementById(\'eaImgFile\').click()"><span>📸</span><span>Add</span></div>'
    : '';
  grid.innerHTML = thumbs + addBtn;
}

function handleEditAdImgs(input) {
  var files = Array.from(input.files||[]);
  var remaining = 6 - _editAdPhotos.length;
  files.slice(0, remaining).forEach(function(file) {
    if (file.size > 5000000) { showToast('Max 5MB per image','⚠️'); return; }
    if (!file.type.startsWith('image/')) { showToast('Only image files allowed','⚠️'); return; }
    var reader = new FileReader();
    reader.onload = function(e) {
      _editAdPhotos.push({ url: null, file: file, preview: e.target.result });
      renderEditAdPhotoGrid();
    };
    reader.readAsDataURL(file);
  });
  input.value = '';
}

function removeEditAdPhoto(i) {
  _editAdPhotos.splice(i, 1);
  renderEditAdPhotoGrid();
}

async function saveEditAd() {
  const ad = _ads.find(a => a.id === _editAdId);
  if (!ad) return;
  const alertEl = document.getElementById('editAdAlert');

  const title = document.getElementById('eaTitle').value.trim();
  const category = document.getElementById('eaCat').value;
  const parish = document.getElementById('eaParish').value;
  const price = parseFloat(document.getElementById('eaPrice').value) || 0;
  const desc = document.getElementById('eaDesc').value.trim();
  const phone = document.getElementById('eaPhone').value.trim();
  const neg = document.getElementById('eaNeg').checked;

  if (!title) { alertEl.textContent='Title is required.'; alertEl.className='alert-box alert-err show'; return; }
  if (!parish) { alertEl.textContent='Please select a parish.'; alertEl.className='alert-box alert-err show'; return; }
  if (!price) { alertEl.textContent='Please enter a price.'; alertEl.className='alert-box alert-err show'; return; }

  const btn = document.getElementById('saveEditAdBtn');
  btn.textContent = 'Saving…'; btn.disabled = true;

  try {
    // Build final photo URLs — upload any new files, keep existing URLs
    const finalUrls = [];
    for (let i = 0; i < _editAdPhotos.length; i++) {
      const item = _editAdPhotos[i];
      if (item.url && !item.file) {
        // Existing photo — keep the URL
        finalUrls.push(item.url);
      } else if (item.file) {
        // New photo — upload to Supabase
        btn.textContent = 'Uploading ' + (i+1) + '/' + _editAdPhotos.length + '…';
        const url = await uploadToSupabase(item.file);
        if (url) finalUrls.push(url);
      }
    }

    const imageUrl = finalUrls.length > 1 ? JSON.stringify(finalUrls) : (finalUrls[0] || '');

    const dbUpdates = {
      title, category, parish, price,
      description: desc, phone,
      negotiable: neg,
      image_url: imageUrl,
    };

    await sbUpdateAd(_editAdId, dbUpdates);

    // Update local cache
    ad.title = title;
    ad.category = category;
    ad.parish = parish;
    ad.price = price;
    ad.desc = desc;
    ad.phone = phone;
    ad.neg = neg;
    ad.image = finalUrls[0] || '';
    ad.photos = finalUrls;

    closeOverlay('ovEditAd');
    renderMyAds(); renderHome(); renderCats();
    showToast('Listing updated! ✅', '✅');
  } catch(e) {
    alertEl.textContent = 'Update failed: ' + (e.message||'try again');
    alertEl.className = 'alert-box alert-err show';
  } finally {
    btn.textContent = 'Save Changes'; btn.disabled = false;
  }
}

async function delAd(id) {
  if (!confirm('Delete this listing? This cannot be undone.')) return;
  try {
    await sbDeleteAd(id);
    _ads = _ads.filter(function(a){ return a.id !== id; });
    renderMyAds(); renderHome(); renderCats(); updateStats();
    showToast('Listing deleted.', '🗑️');
  } catch(e) { showToast('Delete failed. Try again.', '⚠️'); }
}

/* ═══════════════════════════════════════════════════════════
   POST AD WIZARD §POST-AD
═══════════════════════════════════════════════════════════ */
function openPostAd() {
  if (!CU) return openAuth('login');
  currentPostStep = 1; uploadPhotos = []; uploadUrl = '';
  ['aTitle','aDesc','aPrice','aPhone'].forEach(function(id){ document.getElementById(id).value=''; });
  // Pre-fill parish from user profile — saves a tap every time
  const parishEl = document.getElementById('aParish');
  parishEl.value = (CU && CU.parish) ? CU.parish : '';
  document.getElementById('aNeg').checked = false;
  document.getElementById('postAlert').classList.remove('show');
  renderPhotoGrid(); setStep(1);
  openOverlay('ovPost');
}
function setStep(n) {
  currentPostStep = n;
  [1,2,3].forEach(function(i) {
    const s = document.getElementById('s'+i);
    const p = document.getElementById('sp'+i);
    if (s) { s.classList.toggle('active', i===n); s.classList.toggle('done', i<n); }
    if (p) p.classList.toggle('active', i===n);
  });
  if (n === 3) buildPreview();
}
function nextStep(n) {
  document.getElementById('postAlert').classList.remove('show');
  if (n > currentPostStep && currentPostStep === 1) {
    if (!document.getElementById('aTitle').value.trim()) return showPostErr('Please enter a title.');
    if (!document.getElementById('aParish').value) return showPostErr('Please select a parish.');
    if (!document.getElementById('aPrice').value) return showPostErr('Please enter a price.');
    if (!document.getElementById('aDesc').value.trim()) return showPostErr('Please add a description.');
  }
  setStep(n);
}
function showPostErr(m) {
  const e = document.getElementById('postAlert'); e.textContent = m; e.className = 'alert-box alert-err show';
}
function buildPreview() {
  const cat   = CATS.find(function(c){ return c.id === document.getElementById('aCat').value; });
  const title = document.getElementById('aTitle').value.trim();
  const price = document.getElementById('aPrice').value;
  const parish= document.getElementById('aParish').value;
  const img   = uploadUrl
    ? '<img src="' + uploadUrl + '" style="width:100%;height:150px;object-fit:cover">'
    : '<div style="height:150px;background:' + (cat?.color||'#f5f5f5') + ';display:flex;align-items:center;justify-content:center;font-size:56px">' + (cat?.icon||'📦') + '</div>';
  document.getElementById('adPreviewCard').innerHTML =
    '<div class="ad-card" style="cursor:default;transform:none!important">' +
      '<div class="ad-card-img" style="height:150px">' + img + '<span class="ad-cat-tag">' + (cat?.name||'Other') + '</span></div>' +
      '<div class="ad-card-body">' +
        '<div class="ad-price">J$' + fmtN(parseFloat(price)||0) + '</div>' +
        '<div class="ad-title">' + escHtml(title) + '</div>' +
        '<div class="ad-meta"><span>📍 ' + parish + '</span><span>🕐 just now</span></div>' +
      '</div>' +
    '</div>';
  document.getElementById('previewDetails').innerHTML =
    '<strong>Description:</strong> ' + escHtml(document.getElementById('aDesc').value.trim()) + '<br>' +
    '<strong>Contact:</strong> ' + (document.getElementById('aPhone').value || CU?.phone || 'Not provided') + '<br>' +
    '<strong>Negotiable:</strong> ' + (document.getElementById('aNeg').checked ? 'Yes' : 'No');
}

/* ═══════════════════════════════════════════════════════════
   FAVOURITES §FAVOURITES
═══════════════════════════════════════════════════════════ */
function isFav(id) { return L.favs.includes(id); }
function togFav(id, btn) {
  const f = [...L.favs]; const i = f.indexOf(id);
  if (i > -1) { f.splice(i, 1); if(btn) btn.textContent = '🤍'; showToast('Removed from favourites', '🤍'); }
  else         { f.push(id);     if(btn) btn.textContent = '❤️'; showToast('Saved to favourites', '❤️'); }
  L.favs = f;
}

/* ═══════════════════════════════════════════════════════════
   CONVERSATION KEY
═══════════════════════════════════════════════════════════ */
function convKey(uid1, uid2, adId) {
  return [uid1, uid2].sort().join('__') + '__' + adId;
}

/* ═══════════════════════════════════════════════════════════
   GALLERY NAV
═══════════════════════════════════════════════════════════ */
function galleryGoTo(i) {
  const t = document.getElementById('galleryTrack');
  if (t) t.scrollTo({ left: i * t.offsetWidth, behavior: 'smooth' });
}
function galleryPrev() {
  const t = document.getElementById('galleryTrack');
  if (t) galleryGoTo(Math.max(0, Math.round(t.scrollLeft / (t.offsetWidth||1)) - 1));
}
function galleryNext() {
  const t = document.getElementById('galleryTrack');
  if (t) galleryGoTo(Math.min(t.children.length - 1, Math.round(t.scrollLeft / (t.offsetWidth||1)) + 1));
}
function galleryUpdateDots() {
  const t = document.getElementById('galleryTrack');
  if (!t) return;
  const idx = Math.round(t.scrollLeft / (t.offsetWidth || 1));
  const dots = t.parentElement.querySelectorAll('.gallery-dot');
  dots.forEach((d, i) => d.classList.toggle('active', i === idx));
}
// Sync gallery dots on swipe/scroll
document.addEventListener('scroll', function(e) {
  const t = e.target;
  if (t && t.id === 'galleryTrack') {
    clearTimeout(t._galleryDotTimer);
    t._galleryDotTimer = setTimeout(galleryUpdateDots, 50);
  }
}, { passive: true });


let CU = L.sess;
// Restores an existing Supabase session on page load — used both for
// normal returning visitors AND for users landing back from a Google
// OAuth redirect. init() (in ui-nav.js) awaits this before the first
// renderNav() so the nav never flashes "Log In" for a signed-in user.
async function restoreSession() {
  if (!(_db && _db.auth)) return;
  try {
    const { data: { session } } = await _db.auth.getSession();
    if (session && session.user) {
      const { data: profile } = await _db.from('profiles').select('*').eq('id', session.user.id).single();
      const p = profile || {};
      CU = { id: session.user.id, name: p.name||session.user.email, email: p.email||session.user.email, phone: p.phone||'', parish: p.parish||'' };
      L.sess = CU;
    }
  } catch(e) { console.warn('[Yaad Adz] Session restore failed:', e); }
}
let activeF = 'all';      // active category filter
let searchQ = '';         // search query
let uploadUrl = '';       // current upload image url
let currentConv = null;   // current open conversation
let currentPostStep = 1;

/* ═══════════════════════════════════════════════════════════
   INIT — async boot sequence §INIT
═══════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════
   AD STATE MUTATIONS
═══════════════════════════════════════════════════════════ */
async function toggleSold(id) {
  const ad = _ads.find(function(a){ return a.id===id; }); if (!ad) return;
  const newStatus = ad.status === 'sold' ? 'active' : 'sold';
  try {
    await sbUpdateAdStatus(id, newStatus);
    ad.status = newStatus;
    renderHome(); renderCats(); updateStats();
    showToast(newStatus==='sold' ? 'Marked as sold' : 'Relisted as active', newStatus==='sold'?'🏷️':'✅');
  } catch(e) { showToast('Update failed', '⚠️'); }
}

async function doPostAd() {
  const cat   = CATS.find(function(c){ return c.id===document.getElementById('aCat').value; });
  const title = document.getElementById('aTitle').value.trim();
  const parish= document.getElementById('aParish').value;
  const price = parseFloat(document.getElementById('aPrice').value)||0;
  if (!title || !parish || !price) return showPostErr('Please fill in all required fields.');

  // ── Duplicate-listing check ──
  const oneDayAgo = Date.now() - 24*60*60*1000;
  const possibleDupe = _ads.find(function(a) {
    return a.sellerId === CU.id &&
      a.title.trim().toLowerCase() === title.toLowerCase() &&
      a.price === price &&
      new Date(a.date).getTime() > oneDayAgo;
  });
  if (possibleDupe) {
    const proceed = confirm('You already posted "' + title + '" for the same price in the last 24 hours. Post it again anyway?');
    if (!proceed) return;
  }

  const btn = document.querySelector('#sp3 .btn-gold');
  if (btn) { btn.textContent = '⏳ Uploading images…'; btn.disabled = true; }

  try {
    // Upload all photos to Supabase Storage and get public URLs
    const imageUrls = [];
    for (let i = 0; i < uploadPhotos.length; i++) {
      if (btn) btn.textContent = `⏳ Uploading image ${i+1}/${uploadPhotos.length}…`;
      const url = await uploadToSupabase(uploadPhotos[i].file);
      if (url) imageUrls.push(url);
    }

    if (btn) btn.textContent = '⏳ Publishing…';

    const ad = {
      id:         'a' + Date.now(),
      title,
      category:   document.getElementById('aCat').value,
      parish,
      price,
      desc:       document.getElementById('aDesc').value.trim(),
      phone:      document.getElementById('aPhone').value.trim() || CU.phone || '',
      image:      imageUrls[0] || '',
      photos:     imageUrls,
      neg:        document.getElementById('aNeg').checked,
      icon:       cat ? cat.icon : '📦',
      seller:     CU.name,
      sellerInit: initials(CU.name),
      sellerId:   CU.id,
      date:       new Date().toISOString().split('T')[0],
      status:     'active',
      views:      0,
    };

    await sbInsertAd(ad);
    closeOverlay('ovPost');
    renderCats(); renderHome(); updateStats();
    showToast('Your ad is live! 🎉', '🎉');
    launchConfetti();
  } catch(e) {
    showPostErr('Failed to post: ' + (e.message||'please try again'));
  } finally {
    if (btn) { btn.textContent = '🚀 Publish Ad Free'; btn.disabled = false; }
  }
}

/* ═══════════════════════════════════════════════════════════
   SUPABASE STORAGE — Image Upload + Compression §UPLOAD
═══════════════════════════════════════════════════════════ */

// Compress image client-side before upload (target ≤ 800px wide, JPEG 0.8)
function compressImage(file, maxWidth, quality) {
  maxWidth = maxWidth || 1200;
  quality = quality || 0.82;
  return new Promise(function(resolve, reject) {
    // Guard against accidentally-picked huge files (e.g. Live Photos,
    // videos mis-selected from a phone gallery) — decoding a 50MB+ file
    // into an <img> can hang or crash on lower-end phones before
    // compression even has a chance to shrink it.
    const MAX_INPUT_BYTES = 25 * 1024 * 1024; // 25MB
    if (file.size > MAX_INPUT_BYTES) {
      reject(new Error('That photo is too large (' + (file.size/1024/1024).toFixed(1) + 'MB). Please choose a photo under 25MB.'));
      return;
    }
    // If it's already small enough, skip compression
    if (file.size < 150000) { resolve(file); return; }
    var img = new Image();
    var objectUrl = URL.createObjectURL(file);
    var cleanup = function() { URL.revokeObjectURL(objectUrl); };
    img.onload = function() {
      var w = img.width, h = img.height;
      if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth; }
      var canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(function(blob) {
        cleanup();
        if (blob) resolve(new File([blob], file.name || 'photo.jpg', { type: 'image/jpeg' }));
        else resolve(file);
      }, 'image/jpeg', quality);
    };
    img.onerror = function() { cleanup(); resolve(file); };
    img.src = objectUrl;
  });
}

// Upload a single file to Supabase Storage → returns public URL
async function uploadToSupabase(file) {
  const bucket = CFG.supabase.storageBucket;
  try {
    // Compress first
    const compressed = await compressImage(file);
    // Unique filename
    const ext = compressed.type === 'image/png' ? 'png' : 'jpg';
    const path = (CU ? CU.id : 'anon') + '/' + Date.now() + '_' + Math.random().toString(36).slice(2,8) + '.' + ext;

    const { data, error } = await _db.storage.from(bucket).upload(path, compressed, {
      contentType: compressed.type || 'image/jpeg',
      upsert: false,
    });
    if (error) throw error;

    // Get public URL
    const { data: urlData } = _db.storage.from(bucket).getPublicUrl(data.path);
    return urlData.publicUrl;
  } catch(e) {
    console.error('Upload error:', e);
    showToast('Image upload failed: ' + (e.message || 'check storage setup'), '⚠️');
    return null;
  }
}

/* ═══════════════════════════════════════════════════════════
   PHOTO PICKER — local preview + file references
═══════════════════════════════════════════════════════════ */
let uploadPhotos = []; // Array of { file: File, preview: dataURL }

function handleImgFiles(input) {
  var files = Array.from(input.files||[]);
  var remaining = 6 - uploadPhotos.length;
  files.slice(0, remaining).forEach(function(file) {
    if (file.size > 5000000) { showToast('Max 5MB per image','⚠️'); return; }
    if (!file.type.startsWith('image/')) { showToast('Only image files allowed','⚠️'); return; }
    var reader = new FileReader();
    reader.onload = function(e) {
      uploadPhotos.push({ file: file, preview: e.target.result });
      uploadUrl = uploadPhotos[0].preview;
      renderPhotoGrid();
    };
    reader.readAsDataURL(file);
  });
  // Reset file input so the same file can be re-selected
  input.value = '';
}
function handleImgFile(input) { handleImgFiles(input); }

function removePhoto(i) {
  uploadPhotos.splice(i, 1);
  uploadUrl = uploadPhotos.length ? uploadPhotos[0].preview : '';
  renderPhotoGrid();
}
function clearImg() {
  uploadPhotos = []; uploadUrl = '';
  renderPhotoGrid();
  var ua = document.getElementById('imgUploadArea');
  var pb = document.getElementById('imgPreviewBox');
  if (ua) ua.style.display = '';
  if (pb) pb.style.display = 'none';
}
function renderPhotoGrid() {
  var grid = document.getElementById('photoGrid');
  var ua   = document.getElementById('imgUploadArea');
  if (!grid) return;
  // Render thumbnails from local previews
  var thumbs = uploadPhotos.map(function(item, i) {
    return '<div class="photo-thumb-wrap">' +
      '<img src="' + item.preview + '" class="photo-thumb">' +
      '<button class="photo-rm" onclick="removePhoto(' + i + ')">✕</button>' +
      (i===0 ? '<span class="photo-cover-tag">Cover</span>' : '') +
    '</div>';
  }).join('');
  // Re-add the "Add Photo" button if under limit
  var addBtn = uploadPhotos.length < 6
    ? '<div class="photo-add-btn" onclick="document.getElementById(\'imgFile\').click()"><span>📸</span><span>Add Photo</span></div>'
    : '';
  grid.innerHTML = thumbs + addBtn;
}


