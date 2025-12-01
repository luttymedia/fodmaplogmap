const CACHE_NAME = 'fodlog-v0.14.0'; // Bumped version
const CACHE_WHITELIST = [CACHE_NAME];

// 1. CRITICAL FILES (Strict - App Shell)
// We use relative paths to match the HTML references exactly.
const CRITICAL_FILES = [
  './', // Root
  'index.html',
  'manifest.json',
  'app.js',
  'style.css',
  'images/fodlog_logo_h.png' // Updated logo filename
];

// 2. LOCAL ASSETS (Best Effort - Images)
const LOCAL_ASSETS = [
  'images/icon-192.png',
  'images/icon-512.png',
  'images/icon-maskable-192.png',
  'images/icon-maskable-512.png',
  'images/onboarding1.png',
  'images/onboarding2.png',
  'images/onboarding3.png'
];

// 3. EXTERNAL ASSETS (Opaque - Scripts/CSS)
const OPAQUE_ASSETS = [
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://www.gstatic.com/firebasejs/9.22.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.22.1/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore-compat.js',
  'https://www.gstatic.com/firebasejs/9.22.1/firebase-functions-compat.js'
];

// 4. FONT ASSETS (Cors - Icons/Fonts)
const FONT_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-solid-900.woff2',
  'https://fonts.googleapis.com/css2?family=Quicksand:wght@500;600;700&display=swap',
  'https://fonts.gstatic.com/s/quicksand/v37/6xKtdSZaM9iE8KbpRA_hK1QN.woff2'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log(`[SW] Installing ${CACHE_NAME}`);

      // A. CRITICAL (Strict)
      try {
        await cache.addAll(CRITICAL_FILES);
      } catch (err) {
        console.error('[SW] Critical cache failed:', err);
        throw err; // Abort if app shell fails
      }

      // B. LOCAL ASSETS (Best Effort)
      await Promise.allSettled(LOCAL_ASSETS.map(url => {
        return fetch(url).then(res => {
            if (res.ok) return cache.put(url, res);
            return Promise.resolve(); // Continue even if fetch fails
        }).catch(() => Promise.resolve()); // Continue even if network fails
      }));

      // C. OPAQUE (No-Cors)
      await Promise.allSettled(OPAQUE_ASSETS.map(url => {
        return fetch(url, { mode: 'no-cors' }).then(res => cache.put(url, res));
      }));
      
      // D. FONTS (Cors)
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
  // 1. Ignore chrome-extension, about:, data: requests
  if (!event.request.url.startsWith('http')) return;

  const url = new URL(event.request.url);

  // 2. Ignore Firestore/Auth/Google APIs (allow fonts)
  if (url.hostname.includes('googleapis.com') && !url.hostname.includes('fonts')) return;

  // 3. Navigation (HTML)
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

  // 4. Assets
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then(cachedRes => {
      if (cachedRes) return cachedRes;

      return fetch(event.request).then(networkRes => {
        // Cache successful requests
        if (networkRes.ok) {
          const responseClone = networkRes.clone();
          caches.open(CACHE_NAME).then(cache => {
             // STRICT SAFETY CHECK: Only cache http/https
             if (event.request.url.startsWith('http')) {
                 try {
                    cache.put(event.request, responseClone);
                 } catch (err) {
                    console.warn('SW: Could not cache', event.request.url, err);
                 }
             }
          });
        }
        return networkRes;
      }).catch(() => {
        // Offline Fallback for Images
        if (event.request.destination === 'image') {
          return new Response(
            '<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#f3f4f6"/><text x="50%" y="50%" font-family="Arial" font-size="12" text-anchor="middle" dy=".3em" fill="#9ca3af">Offline</text></svg>',
            { headers: { 'Content-Type': 'image/svg+xml' } }
          );
        }
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