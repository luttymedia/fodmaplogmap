const CACHE_NAME = 'fodmap-logmap-v1';
const FILES_TO_CACHE = [
  'index.html',
  'manifest.json',
  'icon-192.png',
  'icon-512.png',
  '/' // Caches the root URL
];

// Install event: Caches the app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        // We are caching the CDN URLs here too
        return cache.addAll([
          ...FILES_TO_CACHE,
          'https://cdn.tailwindcss.com',
          'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
          'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
        ]);
      })
  );
});

// Fetch event: Serves from cache, falls back to network
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // If the request is in the cache, return it.
        // Otherwise, fetch it from the network.
        return response || fetch(event.request);
      })
  );
});