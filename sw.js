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
      .then(() => self.skipWaiting()) // <-- Forces the new SW to activate
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
    }).then(() => self.clients.claim()) // <-- Makes the active SW control the page immediately
  );
});

// --- NEW: NOTIFICATION CLICK HANDLER ---

self.addEventListener('notificationclick', (event) => {
  const notification = event.notification;
  const data = notification.data;
  const action = event.action;

  notification.close();

  if (action === 'mark-as-taken') {
    // --- Action Button Clicked (Android) ---
    // Send a message to any open app clients
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then((clientList) => {
        for (const client of clientList) {
          client.postMessage({
            type: 'mark-as-taken',
            medId: data.medId,
            date: data.date
          });
        }
      })
    );
  } else {
    // --- Notification Body Clicked (All Devices) ---
    // Open the app, adding URL params for the in-app fallback
    event.waitUntil(
      clients.openWindow(`/?source=notification&medId=${data.medId}&date=${data.date}`)
    );
  }
});

// --- NEW: NOTIFICATION CLOSE HANDLER ---
// This listener is mostly for logging, but ensures the
// service worker handles all notification events.
self.addEventListener('notificationclose', (event) => {
  // You can add logging here later if needed
  console.log('Notification was closed.', event.notification.tag);
});