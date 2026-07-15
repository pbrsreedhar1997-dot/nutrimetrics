/* NutriMetrics service worker — minimal app-shell cache for PWA installability.
   Network-first for navigation so the app stays current; never caches /api. */
const CACHE = 'nutrimetrics-v2'

self.addEventListener('install', e => { self.skipWaiting() })
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))))
  self.clients.claim()
})
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)
  // Always live — never cache: API calls, the websocket, and the APK download
  // (a cached APK would silently keep serving a stale/mis-signed build forever).
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/ws') || url.pathname.startsWith('/downloads/')) return
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).catch(() => caches.match('/')))
    return
  }
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      if (res.ok && e.request.method === 'GET') { const cp = res.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)) }
      return res
    }).catch(() => cached))
  )
})
