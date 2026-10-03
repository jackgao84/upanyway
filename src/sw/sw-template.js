/* Up Anyway service worker. Generated at build time from src/sw/sw-template.js by the plugin in
 * vite.config.ts, which fills in the precache list, the build hash and the names from
 * src/storage/keys.ts. The web origin is shared with another family app, so:
 *  - every cache name starts with "upanyway:"
 *  - only caches with that prefix are ever deleted
 *  - it is registered with scope = this app's path and ignores requests outside it
 *  - an update waits until the page asks it to take over (never mid-climb). */
const VERSION = __VERSION__
const PRECACHE = __PRECACHE__
const PREFIX = __PREFIX__
const CACHE = __CACHE_PREFIX__ + VERSION
const SKIP_WAITING = __SKIP_WAITING__
const SCOPE = self.registration.scope
const SHELL = new URL('index.html', SCOPE).href
/** One response per URL is precached, so query strings and Vary (e.g. "Vary: Origin") never matter. */
const MATCH = { ignoreSearch: true, ignoreVary: true }

self.addEventListener('install', (event) => {
  // GitHub Pages sends max-age=600: bypass the HTTP cache so a new version never mixes in old files.
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
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

/** Safari refuses redirected responses for navigations; rebuild one without the redirect flag. */
function clean(response) {
  if (!response || !response.redirected) return response
  return response.blob().then(
    (body) => new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers }),
  )
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  if (!request.url.startsWith(SCOPE)) return

  if (request.mode === 'navigate') {
    // Hash routing: every in-scope page is the app shell, whatever its query string.
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const shell = (await cache.match(SHELL, MATCH)) || (await cache.match(SCOPE, MATCH))
        return shell ? clean(shell) : fetch(request)
      }),
    )
    return
  }

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(request, MATCH)
      return hit || fetch(request)
    }),
  )
})

self.addEventListener('message', (event) => {
  if (event.data === SKIP_WAITING) self.skipWaiting()
})
