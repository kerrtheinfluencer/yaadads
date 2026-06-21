/**
 * Yaad Adz — Service Worker (Phase 4 Optimized)
 * ─────────────────────────────────────────────
 * Strategy:
 *  - App shell (/, /index.html, /style.css) → Stale-While-Revalidate
 *  - Static assets (images, fonts, SVGs, icons) → Cache First
 *  - Ad pages (/ad/*) → Stale-While-Revalidate (instant + fresh in bg)
 *  - API / Supabase → Network Only (always fresh)
 *  - Everything else → Network First with cache fallback
 */

const CACHE_VERSION = 'yaadads-shell-v1';
const SHELL_CACHE   = CACHE_VERSION + '-shell';   // HTML, CSS, JS app shell
const STATIC_CACHE  = CACHE_VERSION + '-static';  // Images, fonts, SVGs, icons

// Core app shell — precached on install
const PRECACHE_SHELL = [
  '/',
  '/index.html',
  '/style.css',
  '/assets/jamaica-map.svg',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
];

// Static assets that never change — cache forever
const PRECACHE_STATIC = [
  '/og-image.jpg',
  '/screenshot.jpg',
];

// ── Install: precache app shell + static assets ────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    Promise.all([
      caches.open(SHELL_CACHE).then(cache =>
        cache.addAll(PRECACHE_SHELL).catch(() => {})
      ),
      caches.open(STATIC_CACHE).then(cache =>
        cache.addAll(PRECACHE_STATIC).catch(() => {})
      ),
    ]).then(() => self.skipWaiting())
  );
});

// ── Activate: delete old caches ────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== SHELL_CACHE && k !== STATIC_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: routing logic ────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin API calls (Supabase, Analytics, AdSense)
  if (request.method !== 'GET') return;
  if (url.hostname.includes('supabase.co'))            return;
  if (url.hostname.includes('googletagmanager.com'))   return;
  if (url.hostname.includes('googlesyndication.com')) return;
  if (url.hostname.includes('google-analytics.com'))   return;

  // Google Fonts — Cache First (already versioned by Google)
  if (url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // App shell (HTML, CSS, main JS) — Stale-While-Revalidate
  // Instant local render + silent background update
  if (
    url.pathname === '/' ||
    url.pathname === '/index.html' ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.js')
  ) {
    event.respondWith(staleWhileRevalidate(request, SHELL_CACHE));
    return;
  }

  // Static assets — Cache First (images, fonts, SVGs, icons)
  if (
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.jpeg') ||
    url.pathname.endsWith('.webp') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.ico') ||
    url.pathname.endsWith('.woff2') ||
    url.pathname.endsWith('.woff') ||
    url.pathname.includes('/assets/') ||
    url.pathname.includes('/splash/')
  ) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Ad pages — Stale-While-Revalidate (instant + fresh in bg)
  if (url.pathname.startsWith('/ad/') ||
      url.pathname.startsWith('/category/') ||
      url.pathname.startsWith('/parish/')) {
    event.respondWith(staleWhileRevalidate(request, SHELL_CACHE));
    return;
  }

  // Home page and everything else — Network First with offline fallback
  event.respondWith(networkFirst(request));
});

// ── Cache strategies ────────────────────────────────────────────────

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  // Revalidate in background
  const fetchPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);

  // Return cached immediately if available, otherwise wait for network
  return cached || fetchPromise;
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Network failed — try cache
    const cached = await caches.match(request);
    if (cached) return cached;
    // Last resort — offline page
    const offlinePage = await caches.match('/offline.html');
    return offlinePage || new Response(
      `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Yaad Adz — Offline</title></head>
      <body style="font-family:sans-serif;text-align:center;padding:60px 20px;background:#0c1e14;color:#e8ede9">
        <div style="font-size:48px;margin-bottom:16px">🇯🇲</div>
        <h1 style="font-family:serif;font-size:28px;margin-bottom:8px">Yaad <em style="color:#f5c842">Adz</em></h1>
        <p style="color:#6b7a71;margin-bottom:24px">You're offline. Check your connection and try again.</p>
        <button onclick="location.reload()" style="background:#1db954;color:#fff;border:none;padding:12px 28px;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer">Try Again</button>
      </body></html>`,
      { headers: { 'Content-Type': 'text/html' } }
    );
  }
}
