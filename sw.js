/* =========================================================
   Saqskyscoop Ultra – Service Worker (v6)
   URL: Next_level_saqtele
   ========================================================= */

const CACHE_VERSION = 'v6';
const CACHE_NAME = `saqskyscoop-${CACHE_VERSION}`;

// Local assets to cache on install
const PRE_CACHE_ASSETS = [
    './',
    './index.html',
    './manifest.json'
];

// External hosts (cached at runtime, network-first)
const RUNTIME_CACHE_HOSTS = [
    'cdnjs.cloudflare.com',
    'fonts.googleapis.com',
    'fonts.gstatic.com',
    'api.sunrise-sunset.org',
    'api.open-meteo.com',
    'api.open-notify.org',
    'ipapi.co',
    'placehold.co'
];

// =========================================================
// INSTALL
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
// ACTIVATE
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
// FETCH
// =========================================================
self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    if (request.method !== 'GET') return;
    if (!url.protocol.startsWith('http')) return;

    // External APIs → Network-first
    if (RUNTIME_CACHE_HOSTS.includes(url.hostname)) {
        event.respondWith(networkFirstWithCache(request));
        return;
    }

    // Local assets → Cache-first
    if (url.origin === self.location.origin) {
        event.respondWith(cacheFirstWithNetwork(request));
        return;
    }

    // Everything else → Network with cache fallback
    event.respondWith(fetch(request).catch(() => caches.match(request)));
});

// =========================================================
// STRATEGY: Cache-first
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
        const fallback = await cache.match('./index.html');
        if (fallback) return fallback;
        throw err;
    }
}

// =========================================================
// STRATEGY: Network-first
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
        return new Response(JSON.stringify({ error: 'offline' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// =========================================================
// MESSAGES
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