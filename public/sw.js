const CACHE = 'openclaw-v1';
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['/','/index.html','/style.css','/app.js'])));
  self.skipWaiting();
});
self.addEventListener('fetch', e => {
  if (e.request.url.includes('/api/')) return; // API 请求不缓存
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
});
