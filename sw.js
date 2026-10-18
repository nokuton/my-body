/* オフラインでも開けるように、アプリのファイルを端末に保存しておく。
 * アプリのファイルを更新したら VERSION を上げる(古い保存分が入れ替わる)。
 * 見本の動画・画像(media/ 以下)は大きいので別の保存場所に分け、初めて表示したときに保存する。
 * 動画はアプリ更新のたびに消さない(MEDIA_CACHE の名前を変えたときだけ入れ替わる)。
 * APP_VERSION は設定画面に「アプリの版」として表示される。公開のたびに日付と番号を上げる。 */
const APP_VERSION = '2026.10.19-2';
const VERSION = 'mbp-' + APP_VERSION;
const MEDIA_CACHE = 'mbp-media-v1';
const FILES = [
  './',
  'index.html',
  'style.css',
  'manifest.webmanifest',
  'js/exercises.js',
  'js/session.js',
  'js/storage.js',
  'js/voice.js',
  'js/poses.js',
  'js/figures.js',
  'js/app.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  // cache: 'reload' でブラウザの一時保存を通さず、必ず最新のファイルを保存する
  const reqs = FILES.map((f) => new Request(f, { cache: 'reload' }));
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(reqs)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== MEDIA_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// 画面から「今の版は?」と聞かれたら答える
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'version' && e.ports && e.ports[0]) e.ports[0].postMessage({ version: APP_VERSION });
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.includes('/media/')) {
    e.respondWith(mediaResponse(e.request));
    return;
  }
  // アプリ本体: まずネットから最新を取り、つながらないときは保存分を使う。
  // no-cache = ブラウザの一時保存を使わずサーバーに更新を確かめる(新旧のファイルが混ざらないように)
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
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

// 見本の動画・画像: 保存分があればそれを使い、なければ取りに行って保存する。
// 動画は「途中から読む」要求(Range)が来るので、保存した全体から必要な部分を切り出して返す
// (iPhone の Safari はこれがないと保存した動画を再生できない)。
async function mediaResponse(req) {
  const key = req.url.split('#')[0];
  const cache = await caches.open(MEDIA_CACHE);
  let full = await cache.match(key);
  if (!full) {
    try {
      const res = await fetch(key); // Range を付けずに全体を取る
      if (!res.ok) return res;
      await cache.put(key, res.clone());
      full = res;
    } catch (err) {
      return new Response('', { status: 504, statusText: 'offline' });
    }
  }
  const range = req.headers.get('range');
  if (!range) return full;
  const buf = await full.arrayBuffer();
  const size = buf.byteLength;
  const m = /bytes=(\d*)-(\d*)/.exec(range);
  let start = m && m[1] ? parseInt(m[1], 10) : 0;
  let end = m && m[2] ? parseInt(m[2], 10) : size - 1;
  if (!m || (m[1] === '' && m[2] !== '')) { start = Math.max(0, size - parseInt(m ? m[2] : '0', 10)); end = size - 1; }
  if (start >= size || start > end) {
    return new Response('', { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }
  end = Math.min(end, size - 1);
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': full.headers.get('Content-Type') || 'video/mp4',
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
    },
  });
}
