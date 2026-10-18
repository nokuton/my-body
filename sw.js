/* オフラインでも開けるように、アプリのファイルを端末に保存しておく。
 * ファイルを更新したら VERSION を上げる(古い保存分が入れ替わる)。 */
const VERSION = 'mbp-v2';
const FILES = [
  './',
  'index.html',
  'style.css',
  'manifest.webmanifest',
  'js/exercises.js',
  'js/session.js',
  'js/storage.js',
  'js/voice.js',
  'js/figures.js',
  'js/app.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// まずネットから最新を取り、つながらないときは保存分を使う
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
