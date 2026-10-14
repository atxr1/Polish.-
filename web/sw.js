// Offline cache: files are cached after first use; each release uses a new cache name so updates replace old files.
const CACHE = 'arena-__V__';
const CORE = ['./', './index.html', './app.js?v=__V__', './app.css?v=__V__', './manifest.webmanifest', './apple-touch-icon.png', './favicon.png',
  './assets/ui/title.png', './assets/ui/fonts.json', './assets/fx/manifest.json', './assets/audio/manifest.json', './assets/fighters/_credits.json'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('arena-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin, font = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!sameOrigin && !font) return;
  // navigation: network first so a new release is picked up, cache as fallback (offline)
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => { const cp = r.clone(); caches.open(CACHE).then((c) => c.put('./index.html', cp)); return r; }).catch(() => caches.match('./index.html')));
    return;
  }
  e.respondWith(caches.open(CACHE).then((c) => c.match(req).then((hit) => hit || fetch(req).then((r) => { if (r.ok || r.type === 'opaque') c.put(req, r.clone()); return r; }))));
});
