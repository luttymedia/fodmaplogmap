const CACHE_NAME = 'fodmap-logmap-v0.9.3'; // Bumped version
const CACHE_WHITELIST = [CACHE_NAME];

const CRITICAL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './app.js',
  './style.css'
];

const OPTIONAL_FILES = [
  './images/fmlm_logo_h.png',
  './images/icon-192.png',
  './images/icon-512.png',
  './images/onboarding1.png',
  './images/onboarding2.png',
  './images/onboarding3.png',
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
      // 1. Critical Files (Must work)
      try {
        await cache.addAll(CRITICAL_FILES);
      } catch (err) {
        console.error('Critical cache failed:', err);
        throw err; 
      }

      // 2. Optional Files (Best effort - don't crash install if they fail)
      await Promise.allSettled(OPTIONAL_FILES.map(url => {
        return fetch(url, { mode: 'no-cors' }) 
          .then(response => {
            if (response) return cache.put(url, response);
          });
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
        .catch(() => caches.match(event.request)) // Fallback to cache
    );
    return;
  }

  // 2. Assets - Cache First, Fallback to Network, Fallback to 404
  event.respondWith(
    caches.match(event.request).then((cachedRes) => {
      if (cachedRes) return cachedRes;

      return fetch(event.request).catch(err => {
        // FIX IS HERE: Return a valid Response object, not null
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