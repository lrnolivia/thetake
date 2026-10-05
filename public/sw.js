var CACHE_PREFIX = 'thetake-shell-';
var CACHE = CACHE_PREFIX + 'v8';
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
  // Authenticated inventory and identity responses must never enter the pay-app cache.
  if(url.pathname.startsWith('/inventory') || url.pathname.startsWith('/cdn-cgi/access') || url.pathname.startsWith('/api/')) return;

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


self.addEventListener('message', function(event){
  if(event.data && event.data.type === 'INVENTORY_CACHE_SAFE' && event.ports[0]) event.ports[0].postMessage({safe:true,version:8});
});
