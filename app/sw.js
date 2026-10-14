/**
 * sw.js — service worker de Deep Op.
 *
 * Qué hace:
 *  - Guarda una copia de la app al instalarse (precache), para que abra sin conexión.
 *  - Con conexión, SIEMPRE pide la versión más reciente a la red y actualiza la copia.
 *    Sin conexión (o si la red tarda más de NETWORK_TIMEOUT_MS), responde con la copia.
 *
 * Para publicar una versión nueva no hace falta tocar nada: la próxima visita con
 * conexión ya trae los archivos nuevos. Cambia VERSION solo si cambias la lista PRECACHE
 * o quieres vaciar las copias antiguas de todos los usuarios.
 *
 * Debe estar en la raíz de la app (junto a index.html): su alcance (scope) es su carpeta.
 * Las rutas son relativas al propio sw.js, así funciona igual en /app/ que en la raíz del sitio.
 */

const VERSION = 'v7';
const CACHE = `deepop-${VERSION}`;
const NETWORK_TIMEOUT_MS = 4000;

const PRECACHE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'src/styles/tokens.css',
  'src/styles/base.css',
  'src/styles/layout.css',
  'src/styles/motion.css',
  'src/styles/components/nav-items.css',
  'src/styles/components/rail.css',
  'src/styles/components/drawer.css',
  'src/styles/components/handle.css',
  'src/styles/components/dock.css',
  'src/styles/components/home.css',
  'src/styles/components/intro.css',
  'src/scripts/main.js',
  'src/scripts/menu.js',
  'src/scripts/nav.js',
  'src/scripts/home.js',
  'src/depthstyle/index.js',
  'src/depthstyle/config.js',
  'src/depthstyle/model.js',
  'src/depthstyle/worker.js',
  'src/depthstyle/look.js',
  'src/depthstyle/video.js',
  'src/depthstyle/convert.js',
  'src/depthstyle/version.js',
  'src/scripts/intro.js',
  'src/scripts/session.js',
  'src/scripts/storage.js',
  'src/scripts/pwa.js',
  'src/icons/icons.svg',
  'src/icons/app/icon-192.png',
  'src/icons/app/icon-512.png',
  'src/icons/app/icon-maskable-512.png',
  'src/icons/app/apple-touch-icon.png',
  'src/icons/app/favicon.svg',
  'src/media/hero-poster.jpg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('deepop-') && k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  // Solo se gestionan archivos propios. Las fuentes de Google las resuelve el navegador
  // (sin conexión se usa la tipografía del sistema, como en el CSS: var(--font)).
  if (new URL(request.url).origin !== self.location.origin) return;

  // El video del carrusel se pide por tramos (cabecera Range) y la caché no admite respuestas
  // parciales: lo gestiona el navegador. Sin conexión se ve el póster (que sí está en PRECACHE).
  if (request.headers.has('range')) return;

  event.respondWith(networkFirst(request));
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);

  // cache: 'no-cache' obliga a revalidar con el servidor: así no se mezclan archivos de versiones distintas
  // (GitHub Pages permite al navegador reutilizar una copia ~10 min).
  const network = fetch(request, { cache: 'no-cache' }).then((response) => {
    // Las respuestas con redirección no se guardan: el navegador las rechaza al reutilizarlas.
    if (response.status === 200 && !response.redirected) cache.put(request, response.clone()).catch(() => {});
    return response;
  });
  network.catch(() => {});   // evita "unhandled rejection" si pierde la carrera contra el timeout

  try {
    return await Promise.race([network, timeout(NETWORK_TIMEOUT_MS)]);
  } catch {
    const cached =
      (await cache.match(request, { ignoreSearch: request.mode === 'navigate' })) ||
      (request.mode === 'navigate' ? await cache.match('./') : undefined);
    return cached || network;   // sin copia: se espera a la red (si falla, falla de verdad)
  }
}
