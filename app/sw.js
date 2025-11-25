// We use 'v0.9' to match your pre-launch status.
// When you launch v1.0, you will change this to 'fodmap-logmap-v1.0'
const CACHE_NAME = 'fodmap-logmap-v0.9'; 
const FONT_CACHE = 'font-icon-cache-v1';
const CACHE_WHITELIST = [CACHE_NAME, FONT_CACHE];

// 1. Critical Files (Local) - MUST cache these for the app to run at all
// Note: Using relative paths './' is safer for subdirectories/Render
const CRITICAL_FILES = [
  './',
  './index.html',
  './manifest.json',
  './app.js',
  './style.css',
  './images/fmlm_logo_h.png',
  './images/icon-192.png',
  './images/icon-512.png'
];

// 2. Optional Files (External) - Try to cache, but don't crash if they fail
const OPTIONAL_FILES = [
  'https://cdn.tailwindcss.com',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Quicksand:wght@500;600;700&display=swap',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://www.gstatic.com/firebasejs/9.22.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.22.1/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore-compat.js',
  'https://www.gstatic.com/firebasejs/9.22.1/firebase-functions-compat.js'
];

// Install Event: The "Best Effort" Strategy
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log(`[SW] Opening cache: ${CACHE_NAME}`);

      // A. Cache Critical Files (Strict)
      try {
        await cache.addAll(CRITICAL_FILES);
        console.log('[SW] Critical files cached successfully');
      } catch (err) {
        console.error('[SW] Critical file cache FAILED:', err);
        // If critical files fail, we let the promise reject (install fails)
        throw err;
      }

      // B. Cache Optional Files (Loose)
      // We loop through them individually so one failure doesn't stop the others
      const optionalPromises = OPTIONAL_FILES.map(async (url) => {
        try {
          // 'no-cors' is vital for opaque responses (like CDNs)
          const response = await fetch(url, { mode: 'no-cors' }); 
          if (response) {
            await cache.put(url, response);
          }
        } catch (error) {
          console.warn(`[SW] Failed to cache optional file: ${url}`, error);
          // We swallow the error here so the install continues!
        }
      });

      // Wait for attempts, but don't care if they fail
      await Promise.allSettled(optionalPromises);
      console.log('[SW] Optional files processed');
      
      return self.skipWaiting();
    })
  );
});

// Fetch Event: Network First for HTML, Cache First for Assets
self.addEventListener('fetch', (event) => {
  // 1. Navigation (HTML) - Network First (to get updates faster)
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

  // 2. Assets/Scripts - Cache First, Fallback to Network
  event.respondWith(
    caches.match(event.request).then((cachedRes) => {
      return cachedRes || fetch(event.request).catch(err => {
         // If both cache and network fail (offline + missing asset), return null
         // This prevents the "red error" spam in console
         return null; 
      });
    })
  );
});

// Activate Event: Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (CACHE_WHITELIST.indexOf(key) === -1) {
          console.log(`[SW] Deleting old cache: ${key}`);
          return caches.delete(key);
        }
      }));
    }).then(() => self.clients.claim())
  );
});