// Paisley Studio Service Worker
// Caches the site shell so the app opens fast. Never caches Firebase calls.

const CACHE_NAME = 'paisley-studio-v5-boards'; // bumped: audience-aware client + Cloud Function calls must not be intercepted
const CACHE_URLS = ['./', './index.html'];

// Hosts that must NEVER be intercepted by the service worker.
// These handle their own CORS and caching; intercepting them breaks
// cross-origin requests (Firebase Functions in particular).
const BYPASS_HOSTS = [
  'firebase',
  'cloudfunctions.net',
  'firebaseio.com',
  'firebaseapp.com',
  'googleapis.com',
  'gstatic.com',
  'identitytoolkit',
  'firebasestorage',
  'flagcdn.com'
];

function shouldBypass(url) {
  for (var i = 0; i < BYPASS_HOSTS.length; i++) {
    if (url.indexOf(BYPASS_HOSTS[i]) !== -1) return true;
  }
  return false;
}

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CACHE_URLS).catch(() => {}))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = event.request.url;

  // 1) Never touch Firebase / Google APIs / flag CDN — always go live
  if (shouldBypass(url)) {
    return;
  }

  // 2) Only handle requests to our own origin. Anything cross-origin
  //    (fonts, CDNs, third-party embeds) is left to the browser so we
  //    can never interfere with CORS preflight or response headers.
  let origin;
  try {
    origin = new URL(url).origin;
  } catch (e) {
    return;
  }
  if (origin !== self.location.origin) {
    return;
  }

  // 3) Only cache safe GET requests. Everything else (POST, PUT, etc.)
  //    goes straight to the network.
  if (event.request.method !== 'GET') {
    return;
  }

  // 4) Network-first for HTML so pages stay fresh
  if (event.request.destination === 'document') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request).then(c => c || caches.match('./index.html')))
    );
    return;
  }

  // 5) Cache-first for same-origin assets
  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return response;
      });
    })
  );
});