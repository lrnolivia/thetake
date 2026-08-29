// The Take — minimal service worker.
// Just enough app-shell caching to make this installable and usable offline.
// Everything the app actually computes happens client-side already; this only
// caches static files so the page (and its OCR library) can load without a
// network round-trip once it's been visited.

var CACHE = 'thetake-shell-v2';
var SHELL = [
  './',
  './index.html',
  './manifest.json',
  './assets/chop-logo.png',
  './assets/chop-hero.jpg',
  './assets/netpay-bg-hq.jpg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png'
];

self.addEventListener('install', function(event){
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then(function(cache){
      return cache.addAll(SHELL).catch(function(){ /* ignore individual misses */ });
    })
  );
});

self.addEventListener('activate', function(event){
  event.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k !== CACHE; }).map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

// Network-first for same-origin navigations/assets, falling back to cache when offline.
// Everything else (fonts, CDN scripts) just passes through to the network untouched.
self.addEventListener('fetch', function(event){
  var req = event.request;
  if(req.method !== 'GET') return;

  var url = new URL(req.url);
  if(url.origin !== self.location.origin){
    return; // let third-party requests (fonts, tesseract CDN) go straight to network
  }

  event.respondWith(
    fetch(req).then(function(res){
      var copy = res.clone();
      caches.open(CACHE).then(function(cache){ cache.put(req, copy); });
      return res;
    }).catch(function(){
      return caches.match(req).then(function(cached){ return cached || caches.match('./index.html'); });
    })
  );
});
