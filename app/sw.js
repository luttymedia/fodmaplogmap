const CACHE_NAME = 'fodmap-logmap-v0.9.2'; // Bumped version
const CACHE_WHITELIST = [CACHE_NAME];

// 1. Critical Files - ONLY code required to boot the app.
// If any of these fail, the app is considered broken offline.
const CRITICAL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './app.js',
  './style.css'
];

// 2. Assets & Externals - Cached "Best Effort".
// If these fail (e.g., 404 icon, opaque CDN), the app still installs.
const OPTIONAL_FILES = [
  // Local Images
  './images/fmlm_logo_h.png',
  './images/icon-192.png',
  './images/icon-512.png',
  './images/onboarding1.png',
  './images/onboarding2.png',
  './images/onboarding3.png',
  
  // External CDNs
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Quicksand:wght@500;600;700&display=swap',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://www.gstatic.com/firebasejs/9.22.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.22.1/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore-compat.js',
  'https://www.gstatic.com/firebasejs/9.22.1/firebase-functions-compat.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log(`[SW] Opening cache: ${CACHE_NAME}`);

      // 1. Cache Critical Files (Strict)
      try {
        await cache.addAll(CRITICAL_FILES);
        console.log('[SW] Critical files cached');
      } catch (err) {
        console.error('[SW] Critical file cache FAILED. Offline mode will not work.', err);
        throw err; // Abort install
      }

      // 2. Cache Optional Files (Loose)
      // We loop individually so one failure doesn't kill the whole batch
      await Promise.allSettled(OPTIONAL_FILES.map(url => {
        return fetch(url, { mode: 'no-cors' }) // 'no-cors' handles external CDNs
          .then(response => {
            if (response && (response.status === 200 || response.type === 'opaque')) {
              return cache.put(url, response);
            }
          })
          .catch(e => console.warn(`[SW] Failed to cache asset: ${url}`, e));
      }));

      return self.skipWaiting();
    })
  );
});

self.addEventListener('fetch', (event) => {
  // 1. Navigation (HTML) - Network First, then Cache
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((networkRes) => {
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, networkRes.clone());
            return networkRes;
          });
        })
        .catch(() => caches.match(event.request)) // Offline Fallback
    );
    return;
  }

  // 2. Assets - Cache First, then Network
  event.respondWith(
    caches.match(event.request).then((cachedRes) => {
      if (cachedRes) return cachedRes;
      return fetch(event.request).catch(err => {
        // Swallow errors to prevent console spam, return nothing (missing image)
        return null; 
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (CACHE_WHITELIST.indexOf(key) === -1) {
          console.log(`[SW] Cleaning old cache: ${key}`);
          return caches.delete(key);
        }
      }));
    }).then(() => self.clients.claim())
  );
});