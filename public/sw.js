// Otto Perso — service worker
// Caches the app shell for offline use. API requests always go to network.
const CACHE_NAME = 'otto-perso-v0.1.0'
const APP_SHELL = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-180.png',
  '/favicon.ico',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  // Only handle GET
  if (req.method !== 'GET') return

  const url = new URL(req.url)

  // Never cache API or socket.io — always go to network
  if (url.pathname.startsWith('/api/') || url.pathname.includes('socket.io')) {
    return
  }

  // Same-origin only
  if (url.origin !== self.location.origin) return

  // Network-first for navigation, fallback to cached shell
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE_NAME).then((c) => c.put('/', copy))
          return res
        })
        .catch(() => caches.match('/').then((r) => r || new Response('Offline', { status: 503 })))
    )
    return
  }

  // Cache-first for static assets
  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE_NAME).then((c) => c.put(req, copy))
          }
          return res
        })
    )
  )
})
