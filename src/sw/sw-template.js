/* Up Anyway service worker. Generated at build time from src/sw/sw-template.js.
 * Shares a web origin with another family app, so:
 *  - every cache name starts with "upanyway:"
 *  - only caches with that prefix are ever deleted
 *  - it is registered with scope = this app's path and ignores requests outside it. */
const VERSION = __VERSION__
const PRECACHE = __PRECACHE__
const PREFIX = 'upanyway:'
const CACHE = PREFIX + 'precache:' + VERSION
const SCOPE = self.registration.scope

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll(PRECACHE.map((path) => new Request(new URL(path, SCOPE).href, { cache: 'reload' }))),
    ),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((n) => n.startsWith(PREFIX) && n !== CACHE).map((n) => caches.delete(n))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  if (!request.url.startsWith(SCOPE)) return

  if (request.mode === 'navigate') {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const shell = (await cache.match(new URL('index.html', SCOPE).href)) || (await cache.match(SCOPE))
        return shell || fetch(request)
      }),
    )
    return
  }

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(request, { ignoreSearch: true })
      return hit || fetch(request)
    }),
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'upanyway:skip-waiting') self.skipWaiting()
})
