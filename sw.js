/**
 * Yaad Adz — Service Worker
 * ─────────────────────────
 * Strategy:
 *  - Static assets (CSS, fonts, icons) → Cache First (fast, rarely change)
 *  - Ad pages (/ad/*) → Stale-While-Revalidate (instant + fresh in bg)
 *  - API / Supabase → Network Only (always fresh)
 *  - Everything else → Network First with cache fallback
 */

const CACHE_VERSION  = 'yaadadz-v17'; // bump this any time style.css or js/*.js changes — otherwise
                                      // Cache-First below will keep serving the OLD file forever,
                                      // no matter how many times the actual file is updated on GitHub.
const STATIC_CACHE   = CACHE_VERSION + '-static';
const PAGES_CACHE    = CACHE_VERSION + '-pages';

// Assets that never change between visits — cache forever
const PRECACHE_URLS = [
  '/style.css',
  '/offline.html',
];

// ── Install: precache static assets ──────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(PRECACHE_URLS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: delete old caches ──────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== STATIC_CACHE && k !== PAGES_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: routing logic ──────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin API calls (Supabase, Analytics, AdSense)
  if (request.method !== 'GET') return;
  if (url.hostname.includes('supabase.co'))          return;
  if (url.hostname.includes('googletagmanager.com')) return;
  if (url.hostname.includes('googlesyndication.com'))return;
  if (url.hostname.includes('google-analytics.com')) return;
  if (url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com')) {
    // Cache First for Google Fonts
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Static assets — Cache First
  if (
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.js')  ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.jpeg')||
    url.pathname.endsWith('.webp')||
    url.pathname.endsWith('.ico') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.woff2')
  ) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Ad pages — Network First (NEVER serve stale — old 404s break navigation)
  if (url.pathname.startsWith('/ad/') ||
      url.pathname.startsWith('/category/') ||
      url.pathname.startsWith('/parish/')) {
    event.respondWith(networkFirstPages(request));
    return;
  }

  // Home page and everything else — Network First with offline fallback
  event.respondWith(networkFirst(request));
});

// ── Cache strategies ──────────────────────────────────────────────

async function networkFirstPages(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      // Only cache successful 200 responses — NEVER cache 404s
      const cache = await caches.open(PAGES_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Network failed — try cache as offline fallback
    const cached = await caches.match(request);
    if (cached) return cached;
    // Last resort: serve home page
    const home = await caches.match('/');
    return home || new Response('Offline', { status: 503 });
  }
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

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(PAGES_CACHE);
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

/* ═══════════════════════════════════════════════════════════
   §PUSH — real background push notifications
   Fires even when the app/tab is fully closed, as long as the
   browser process is running (or, on iOS, as long as the PWA
   was installed via Add to Home Screen — see subscribeToPush
   in core.js for that constraint).
═══════════════════════════════════════════════════════════ */
self.addEventListener('push', event => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'Yaad Adz', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Yaad Adz';
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: data.url || '/' },
    tag: data.tag || 'yaadadz-push',
    renotify: !!data.tag,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url === url && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
