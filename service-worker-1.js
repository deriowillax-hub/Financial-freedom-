/* ═══════════════════════════════════════════════
   FINANCIAL FREEDOM — SERVICE WORKER
   Strategy: Cache-first for static assets,
             Network-first for Supabase API calls
═══════════════════════════════════════════════ */

const CACHE_NAME = 'ff-tracker-v1';
const OFFLINE_URL = '/offline.html';

// Assets to pre-cache on install
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// External CDN URLs to cache on first use
const CDN_ORIGINS = [
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com',
  'https://cdn.jsdelivr.net'
];

// Supabase origin — always go network-first
const SUPABASE_ORIGIN = 'supabase.co';

/* ── INSTALL ── */
self.addEventListener('install', (event) => {
  console.log('[SW] Installing Financial Freedom v1...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS);
    }).then(() => {
      // Activate immediately without waiting
      return self.skipWaiting();
    })
  );
});

/* ── ACTIVATE ── */
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      );
    }).then(() => self.clients.claim())
  );
});

/* ── FETCH ── */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests (Supabase POST, auth calls, etc.)
  if (request.method !== 'GET') return;

  // Skip chrome-extension and non-http requests
  if (!request.url.startsWith('http')) return;

  // ── Supabase API: Network-first, no caching ──
  // Your auth, data reads/writes must always be fresh
  if (url.hostname.includes(SUPABASE_ORIGIN)) {
    event.respondWith(
      fetch(request).catch(() => {
        // Supabase offline: return a JSON error so the app handles it
        return new Response(
          JSON.stringify({ error: 'You are offline. Please reconnect to sync.' }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
    return;
  }

  // ── CDN assets (fonts, chart.js, supabase-js): Cache-first ──
  if (CDN_ORIGINS.some(origin => request.url.startsWith(origin))) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          // Cache a copy for next time
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // ── App shell & static assets: Cache-first, fallback to network ──
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request).then((response) => {
        // Only cache successful same-origin responses
        if (response.ok && url.origin === self.location.origin) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
        }
        return response;
      }).catch(() => {
        // Navigating to a page while offline — show offline notice
        if (request.destination === 'document') {
          return caches.match('/') || caches.match('/index.html');
        }
      });
    })
  );
});
