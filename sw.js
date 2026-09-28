/* =========================================================
   Saqskyscoop – Service Worker (v4 – Latest)
   Handles offline caching, versioning and asset updates
   ========================================================= */

const CACHE_VERSION = 'v4';
const CACHE_NAME = `saqskyscoop-${CACHE_VERSION}`;

// Assets to cache on install (only local files – no external CDN)
const PRE_CACHE_ASSETS = [
    './',
    './index.html',
    './manifest.json'
];

// External assets (cached at runtime, network-first)
const RUNTIME_CACHE_HOSTS = [
    'cdnjs.cloudflare.com',
    'fonts.googleapis.com',
    'fonts.gstatic.com',
    'api.sunrise-sunset.org',
    'api.open-meteo.com',
    'api.open-notify.org',
    'ipapi.co'
];

// =========================================================
// INSTALL: Pre-cache essential local assets
// =========================================================
self.addEventListener('install', (event) => {
    console.log('[SW] Installing version:', CACHE_VERSION);
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(PRE_CACHE_ASSETS).catch((err) => {
                console.warn('[SW] Pre-cache partial failure:', err);
            });
        })
    );
    self.skipWaiting();
});

// =========================================================
// ACTIVATE: Delete old caches
// =========================================================
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating version:', CACHE_VERSION);
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys
                    .filter((key) => key.startsWith('saqskyscoop-') && key !== CACHE_NAME)
                    .map((key) => {
                        console.log('[SW] Deleting old cache:', key);
                        return caches.delete(key);
                    })
            );
        })
    );
    self.clients.claim();
});

// =========================================================
// FETCH: Smart caching strategy
//  - Local assets  → Cache-first (fast)
//  - External APIs → Network-first (always fresh)
// =========================================================
self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // Skip non-GET requests
    if (request.method !== 'GET') return;

    // Skip browser extension / chrome requests
    if (!url.protocol.startsWith('http')) return;

    // External APIs → Network-first, fallback to cache
    if (RUNTIME_CACHE_HOSTS.includes(url.hostname)) {
        event.respondWith(networkFirstWithCache(request));
        return;
    }

    // Local assets → Cache-first, fallback to network
    if (url.origin === self.location.origin) {
        event.respondWith(cacheFirstWithNetwork(request));
        return;
    }

    // Everything else → Network only
    event.respondWith(fetch(request).catch(() => caches.match(request)));
});

// =========================================================
// STRATEGY: Cache-first (best for local HTML/CSS/JS)
// =========================================================
async function cacheFirstWithNetwork(request) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;

    try {
        const response = await fetch(request);
        if (response && response.status === 200) {
            cache.put(request, response.clone());
        }
        return response;
    } catch (err) {
        // If offline and not cached → show fallback (index.html)
        const fallback = await cache.match('./index.html');
        if (fallback) return fallback;
        throw err;
    }
}

// =========================================================
// STRATEGY: Network-first (best for live API data)
// =========================================================
async function networkFirstWithCache(request) {
    const cache = await caches.open(CACHE_NAME);
    try {
        const response = await fetch(request, { mode: 'cors' });
        if (response && response.status === 200) {
            cache.put(request, response.clone());
        }
        return response;
    } catch (err) {
        const cached = await cache.match(request);
        if (cached) return cached;
        // Return empty JSON for API failures so app doesn't break
        return new Response(JSON.stringify({ error: 'offline' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// =========================================================
// MESSAGE: Allow app to trigger skipWaiting
// =========================================================
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    if (event.data && event.data.type === 'CLEAR_CACHE') {
        caches.keys().then((keys) =>
            Promise.all(keys.map((k) => caches.delete(k)))
        ).then(() => {
            event.source.postMessage({ type: 'CACHE_CLEARED' });
        });
    }
});