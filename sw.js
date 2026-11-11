// Changer ce numéro à chaque modification d'un fichier de l'application :
// c'est ce qui force les téléphones à télécharger la nouvelle version.
const VERSION_CACHE = 'vehicle-log-v2';

const FICHIERS_APPLICATION = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION_CACHE).then((cache) => cache.addAll(FICHIERS_APPLICATION)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cles) =>
      Promise.all(cles.filter((cle) => cle !== VERSION_CACHE).map((cle) => caches.delete(cle)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Seuls les fichiers de l'application passent par le cache, jamais les envois vers Apps Script.
  if (new URL(event.request.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request, { ignoreSearch: true })
      .then((enCache) => enCache || fetch(event.request))
  );
});
