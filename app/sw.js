const CACHE_NAME = 'fodmap-logmap-v7';
const FONT_CACHE = 'font-icon-cache-v1';
const CACHE_WHITELIST = [CACHE_NAME, FONT_CACHE];

const FILES_TO_CACHE = [
  '/',
  'index.html',
  'manifest.json',
  'app.js',
  'style.css',
  'images/fmlm_logo_h.png',
  'images/icon-192.png',
  'images/icon-512.png'
];

// Install event: Caches the app shell and takes control immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(FILES_TO_CACHE);
      })
      .then(() => self.skipWaiting()) // <-- Forces the new SW to activate
  );
});

// Fetch event: "Network First" for pages, "Cache-First" for assets
self.addEventListener('fetch', (event) => {

  // 1. Navigation requests (loading the page)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request) // 1. Try network
        .then((response) => {
          // 2. If success, cache and return
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, response.clone());
            return response;
          });
        })
        .catch(() => {
          // 3. If network fails, get from cache
          return caches.match(event.request);
        })
    );

  // 2. NEW: Fonts and Icons (Stale-While-Revalidate, simple)
  } else if (
    event.request.url.startsWith('https://fonts.googleapis.com') ||
    event.request.url.startsWith('https://fonts.gstatic.com') || // Google's font files
    event.request.url.startsWith('https://cdnjs.cloudflare.com') || // Font Awesome
    event.request.url.startsWith('https://cdn.jsdelivr.net/npm/chart.js') // Chart.js CDN
  ) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        // 1. Return from cache if we have it
        if (cachedResponse) {
          return cachedResponse;
        }
        // 2. If not, fetch from network
        return fetch(event.request).then((networkResponse) => {
          // 3. ...and cache it for next time
          return caches.open(FONT_CACHE).then((cache) => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
        });
      })
    );

  // 3. Other requests (app shell, images, etc.)
  } else {
    // Use your original cache-first strategy
    event.respondWith(
      caches.match(event.request)
        .then((response) => {
          return response || fetch(event.request);
        })
    );
  }
});


// Activate event: Cleans up old caches and claims the page
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        // Check against the whitelist instead of just one cache
        if (CACHE_WHITELIST.indexOf(key) === -1) {
          return caches.delete(key);
        }
      }));
    }).then(() => self.clients.claim()) // <-- Makes the active SW control the page immediately
  );
});