const CACHE_NAME = 'fodmap-logmap-v0.10.2'; // Bump version
const CACHE_WHITELIST = [CACHE_NAME];

// 1. CRITICAL FILES (Strict)
const CRITICAL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './app.js',
  './style.css'
];

// 2. LOCAL ASSETS (Best Effort)
const LOCAL_ASSETS = [
  'images/fmlm_logo_h.png',
  'images/icon-192.png',
  'images/icon-512.png',
  'images/icon-maskable-192.png',
  'images/icon-maskable-512.png',
  'images/onboarding1.png',
  'images/onboarding2.png',
  'images/onboarding3.png'
];

// 3. EXTERNAL ASSETS (Opaque - Tailwind/Firebase)
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

// 4. FONT ASSETS (Cors - Icons)
const FONT_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-solid-900.woff2',
  'https://fonts.gstatic.com/s/quicksand/v37/6xKtdSZaM9iE8KbpRA_hK1QN.woff2'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log(`[SW] Installing ${CACHE_NAME}`);

      // A. Criticals (Abort if failed)
      try {
        await cache.addAll(CRITICAL_FILES);
      } catch (err) {
        console.error('[SW] Critical cache failed:', err);
        throw err;
      }

      // B. Images (Best Effort)
      // FIX WAS HERE: Changed OPTIONAL_ASSETS to LOCAL_ASSETS
      await Promise.allSettled(LOCAL_ASSETS.map(url => {
        return fetch(url).then(res => { 
            if (res.ok) return cache.put(url, res); 
        });
      }));

      // C. Opaque (No-Cors)
      await Promise.allSettled(OPAQUE_ASSETS.map(url => {
        return fetch(url, { mode: 'no-cors' }).then(res => cache.put(url, res));
      }));
      
      // D. Fonts (Cors)
      await Promise.allSettled(FONT_ASSETS.map(url => {
        return fetch(url, { mode: 'cors' }).then(res => { 
            if (res.ok) return cache.put(url, res); 
        });
      }));

      return self.skipWaiting();
    })
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Ignore Firestore logs
  if (url.hostname.includes('googleapis.com') && !url.hostname.includes('fonts')) return;

  // Navigation
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          return caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, res.clone());
            return res;
          });
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Assets
  event.respondWith(
    caches.match(event.request).then(cachedRes => {
      if (cachedRes) return cachedRes;
      return fetch(event.request).catch(() => {
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
          return caches.delete(key);
        }
      }));
    }).then(() => self.clients.claim())
  );
});