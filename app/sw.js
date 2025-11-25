const CACHE_NAME = 'fodmap-logmap-v0.9.8'; // Bumped version
const CACHE_WHITELIST = [CACHE_NAME];

// 1. Critical Files (App Shell)
const CRITICAL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './app.js',
  './style.css'
];

// 2. Local Images (Standard Fetch)
const LOCAL_ASSETS = [
  './images/fmlm_logo_h.png',
  './images/icon-192.png',
  './images/icon-512.png',
  './images/onboarding1.png',
  './images/onboarding2.png',
  './images/onboarding3.png'
];

// 3. Opaque External Assets (Scripts & CSS)
// We use 'no-cors' here. This is the "Brute Force" way to ensure Tailwind
// and Firebase cache successfully, avoiding the 404s you saw.
const OPAQUE_ASSETS = [
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Quicksand:wght@500;600;700&display=swap',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://www.gstatic.com/firebasejs/9.22.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.22.1/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore-compat.js',
  'https://www.gstatic.com/firebasejs/9.22.1/firebase-functions-compat.js'
];

// 4. CORS External Assets (Fonts)
// Fonts MUST be fetched with CORS or they won't render.
const FONT_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-solid-900.woff2',
  'https://fonts.gstatic.com/s/quicksand/v37/6xKtdSZaM9iE8KbpRA_hK1QN.woff2'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log(`[SW] Installing ${CACHE_NAME}`);

      // A. Critical Files (Strict)
      try {
        await cache.addAll(CRITICAL_FILES);
      } catch (err) {
        console.error('[SW] Critical cache failed:', err);
        // We don't throw here to allow partial installs during testing
      }

      // B. Local Assets (Best Effort)
      try {
        await cache.addAll(LOCAL_ASSETS);
      } catch (err) {
        console.warn('[SW] Local asset issue:', err);
      }

      // C. Opaque Assets (Scripts/CSS) - fetch with no-cors
      await Promise.allSettled(OPAQUE_ASSETS.map(url => {
        return fetch(url, { mode: 'no-cors' })
          .then(res => cache.put(url, res));
      }));

      // D. Font Assets - fetch with CORS
      await Promise.allSettled(FONT_ASSETS.map(url => {
        return fetch(url, { mode: 'cors' })
          .then(res => {
            if (res.ok) return cache.put(url, res);
          });
      }));

      return self.skipWaiting();
    })
  );
});

self.addEventListener('fetch', (event) => {
  const requestURL = new URL(event.request.url);

  // 1. Ignore Firestore/Google APIs (Stop Log Spam)
  // We EXCLUDE fonts.gstatic.com from being ignored
  if ((requestURL.hostname.includes('googleapis.com') && !requestURL.hostname.includes('fonts')) || 
      (requestURL.hostname.includes('google.com') && !requestURL.hostname.includes('gstatic'))) {
    return; 
  }

  // 2. Navigation (HTML)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((networkRes) => {
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, networkRes.clone());
            return networkRes;
          });
        })
        .catch(() => {
          return caches.match(event.request).then(res => {
            return res || new Response("<h1>Offline</h1><p>App shell missing.</p>", { 
              headers: {'Content-Type': 'text/html'} 
            });
          });
        })
    );
    return;
  }

  // 3. Assets
  event.respondWith(
    caches.match(event.request).then((cachedRes) => {
      if (cachedRes) return cachedRes;

      return fetch(event.request).catch(() => {
        // Return 404 for missing assets instead of crashing
        return new Response("Offline", { status: 404, statusText: "Offline" });
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