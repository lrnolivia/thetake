var CACHE_PREFIX = 'thetake-shell-';
var CACHE = CACHE_PREFIX + 'v7';
var SHELL = [
  '/',
  '/manifest.webmanifest',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png'
];

self.addEventListener('install', function(event){
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then(function(cache){
      return cache.addAll(SHELL).catch(function(){ /* runtime caching still works */ });
    })
  );
});

self.addEventListener('activate', function(event){
  event.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(key){ return key.indexOf(CACHE_PREFIX) === 0 && key !== CACHE; }).map(function(key){ return caches.delete(key); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(event){
  var request = event.request;
  if(request.method !== 'GET') return;
  var url = new URL(request.url);
  if(url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request).then(function(response){
      if(response.ok){
        var copy = response.clone();
        caches.open(CACHE).then(function(cache){ cache.put(request, copy); });
      }
      return response;
    }).catch(function(){
      return caches.match(request).then(function(cached){
        if(cached) return cached;
        if(request.mode === 'navigate') return caches.match('/');
        return Response.error();
      });
    })
  );
});
