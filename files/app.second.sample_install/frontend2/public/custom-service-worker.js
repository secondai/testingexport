var dataCacheName = 'second-pwa-2';
var cacheName = 'second-pwa-5';
var filesToCache = [
//   '/app/app.second.sample_pwa',
// // "./static",
//  "./static/icon-128x128.png",
//  "./static/icon-144x144.png",
//  "./static/icon-152x152.png",
//  "./static/icon-192x192.png",
//  "./static/icon-256x256.png",
// // "./",
//  "./manifest.json",
//  "./service-worker.js"
];

self.addEventListener('install', function(e) {
  console.log('[ServiceWorker] Install');
  e.waitUntil(
    caches.open(cacheName).then(function(cache) {
      console.log('[ServiceWorker] Caching app shell');
      return cache.addAll(filesToCache);
    })
  );
});

self.addEventListener('activate', function(e) {
  console.log('[ServiceWorker] Activate');
  e.waitUntil(
    caches.keys().then(function(keyList) {
      return Promise.all(keyList.map(function(key) {
        if (key !== cacheName && key !== dataCacheName) {
          console.log('[ServiceWorker] Removing old cache', key);
          return caches.delete(key);
        }
      }));
    })
  );
  return self.clients.claim();
});

self.addEventListener('fetch', function(e) {
  console.log('[Service Worker] Fetch', e.request.url);
  e.respondWith(
    caches.match(e.request).then(function(response) {
      return response || fetch(e.request);
    })
  );
});