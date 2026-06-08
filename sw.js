const CACHE_NAME = 'goratrack-pwa-v11'; // Versión actualizada para forzar la recarga

// Archivos estáticos locales fundamentales (Íconos y Sonido añadidos)
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './prip.mp3'
];

// Instalación: Guardar el cascarón local
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[Service Worker] Cacheando App Shell');
        return cache.addAll(APP_SHELL);
      })
      .then(() => self.skipWaiting())
  );
});

// Activación: Limpiar cachés antiguos si actualizamos la versión
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Borrando caché antiguo:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Intercepción de Peticiones: Estrategia Stale-While-Revalidate para UI
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. IGNORAR llamadas a la API (Dejar que la App y el LocalStorage las manejen)
  if (url.pathname.includes('/api/')) {
    return;
  }

  // 2. CACHEAR librerías externas y archivos locales dinámicamente
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // Si está en caché, lo devuelve inmediatamente
      if (cachedResponse) {
        // En segundo plano, intenta actualizar el caché para la próxima vez
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
          }
        }).catch(() => { }); // Si no hay red, no importa, ya devolvimos el caché
        return cachedResponse;
      }

      // Si no está en caché, lo busca en internet y lo guarda
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || (networkResponse.type !== 'basic' && networkResponse.type !== 'cors')) {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
        return networkResponse;
      }).catch(() => {
        // Fallback si no hay red y no está en caché
        console.log('[Service Worker] Fallo de red detectado.');
      });
    })
  );
});