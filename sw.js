const CACHE_NAME = 'fodmap-logmap-v3';
const FILES_TO_CACHE = [
  'index.html',
  'manifest.json',
  'icon-192.png',
  'icon-512.png',
  '/' // Caches the root URL
];

// Install event: Caches the app shell and takes control immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(FILES_TO_CACHE);
      })
      .then(() => self.skipWaiting()) // <-- ADD THIS LINE: Forces the new SW to activate
  );
});

// Fetch event: "Network First" strategy
self.addEventListener('fetch', (event) => {
  // Check if the request is for navigation (e.g., loading the page)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request) // 1. Try to get the file from the network first
        .then((response) => {
          // 2. If successful, cache the new version and return it
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, response.clone());
            return response;
          });
        })
        .catch(() => {
          // 3. If the network fails (offline), get the file from the cache
          return caches.match(event.request);
        })
    );
  } else {
    // For non-navigation requests (images, etc.), use a "cache-first" or "stale-while-revalidate"
    // For simplicity, we will keep your original cache-first for other assets
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
        if (key !== CACHE_NAME) {
          return caches.delete(key);
        }
      }));
    }).then(() => self.clients.claim()) // <-- ADD THIS: Makes the active SW control the page immediately
  );
});
