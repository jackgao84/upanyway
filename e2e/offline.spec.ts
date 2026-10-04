/**
 * Fully offline after the first load, on every project — run, not claimed.
 *
 * 1. Before the app has ever loaded, another app on the same origin owns caches ("v1",
 *    "otherapp:precache:1") and storage keys ("state", "otherapp:save"), and an old Up Anyway cache
 *    is lying around ("upanyway:precache:stale").
 * 2. The first visit installs the service worker (scoped to /upanyway/), which takes control and
 *    precaches every file, both bundled Nunito fonts included. Only the stale "upanyway:" cache is
 *    deleted; the other app's caches and keys are untouched.
 * 3. The network goes away for real: this spec runs its own preview server and stops it (Playwright's
 *    WebKit can't drive `setOffline` or request interception through a service-worker reload — both
 *    end in "Blocked by Web Inspector" — while a stopped server is exactly airplane mode). Reloading
 *    camp, a deep link into a climb, a URL with a query string and index.html all open the app with
 *    its own font, from the worker's cache.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { KEYS } from '../src/storage/keys'
import { CLIMB_CANVAS, climberSave, expect, expectRoute, test } from './helpers'

/** One private server per device project, so parallel projects never share (or stop) a port. */
const PORTS: Record<string, number> = { 'ipad-portrait': 4191, 'ipad-landscape': 4192, phone: 4193 }
const portFor = (project: string): number => PORTS[project] ?? 4194
test.use({ baseURL: async ({}, use, testInfo) => use(`http://localhost:${portFor(testInfo.project.name)}/upanyway/`) })

async function reachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url)
    return res.ok
  } catch {
    return false
  }
}

/** `vite preview` of the dist/ the main web server already built (node directly, so kill() stops it). */
async function startServer(port: number): Promise<ChildProcess> {
  const root = fileURLToPath(new URL('..', import.meta.url))
  const child = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(port), '--strictPort'], {
    cwd: root,
    stdio: 'ignore',
  })
  const url = `http://localhost:${port}/upanyway/`
  for (let i = 0; i < 150 && !(await reachable(url)); i++) await new Promise((r) => setTimeout(r, 200))
  expect(await reachable(url), `preview server on ${port}`).toBe(true)
  return child
}

async function stopServer(child: ChildProcess, port: number): Promise<void> {
  if (child.exitCode === null) {
    const exited = new Promise((r) => child.once('exit', r))
    child.kill('SIGTERM')
    await exited
  }
  const url = `http://localhost:${port}/upanyway/`
  for (let i = 0; i < 50 && (await reachable(url)); i++) await new Promise((r) => setTimeout(r, 100))
  expect(await reachable(url), 'the server is really gone').toBe(false)
}

/** Requests that failed because the test cut the network (not app errors). */
const CUT = /Failed to load resource|network connection was lost|could not connect|Load failed|NetworkError|sw\.js/i

test('plays offline after the first load, and leaves the other app alone', async ({ page, problems }, testInfo) => {
  const port = portFor(testInfo.project.name)
  const server = await startServer(port)
  try {
    await offlineJourney(page, problems, server, port)
  } finally {
    if (server.exitCode === null) server.kill('SIGTERM')
  }
})

async function offlineJourney(page: import('@playwright/test').Page, problems: string[], server: ChildProcess, port: number): Promise<void> {
  // 1. The other app (and an old Up Anyway cache) on this origin, before Up Anyway ever runs. The
  //    manifest is a plain file in the app's folder: no app script, no service worker yet.
  await page.goto('./manifest.webmanifest')
  await page.evaluate(
    async ({ save, json }) => {
      for (const name of ['v1', 'otherapp:precache:1', 'upanyway:precache:stale']) {
        const c = await caches.open(name)
        await c.put(new Request(`/${name.replace(/:/g, '-')}/probe.txt`), new Response(name))
      }
      localStorage.setItem('state', 'theirs')
      localStorage.setItem('otherapp:save', '{"theirs":true}')
      localStorage.setItem(save, json)
    },
    { save: KEYS.save, json: JSON.stringify(climberSave()) },
  )

  // 2. The first visit: the worker installs, activates and takes control.
  await page.goto('./#/camp')
  await expectRoute(page, '/camp')
  await expect(page.locator('.camp__tiles')).toBeVisible()
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, undefined, { timeout: 30_000 })
  const sw = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready
    const names = await caches.keys()
    const ours = names.filter((n) => n.startsWith('upanyway:precache:'))
    const files = ours.length === 1 ? (await (await caches.open(ours[0])).keys()).map((r) => new URL(r.url).pathname) : []
    return { scope: new URL(reg.scope).pathname, names, ours, files }
  })
  expect(sw.scope).toBe('/upanyway/')
  expect(sw.ours, 'one current Up Anyway cache; the stale one is gone').toHaveLength(1)
  expect(sw.ours[0]).not.toBe('upanyway:precache:stale')
  expect(sw.names).toContain('v1')
  expect(sw.names).toContain('otherapp:precache:1')
  expect(sw.files).toContain('/upanyway/index.html')
  expect(sw.files).toContain('/upanyway/manifest.webmanifest')
  expect(sw.files.filter((f) => f.endsWith('.woff2')).length, 'both bundled fonts').toBeGreaterThanOrEqual(2)
  expect(sw.files.some((f) => f.endsWith('.js')), 'the app').toBe(true)
  expect(sw.files.every((f) => f.startsWith('/upanyway/')), 'nothing outside the app').toBe(true)
  const theirs = await page.evaluate(() => [localStorage.getItem('state'), localStorage.getItem('otherapp:save')])
  expect(theirs).toEqual(['theirs', '{"theirs":true}'])

  // 3. No network from here on: the server is stopped.
  await stopServer(server, port)

  const fontLoaded = () =>
    page.evaluate(async () => {
      await document.fonts.ready
      return [...document.fonts].some((f) => /Nunito/.test(f.family) && f.status === 'loaded')
    })

  // Camp again, from a cold reload.
  await page.reload()
  await expectRoute(page, '/camp')
  await expect(page.locator('.camp__tiles')).toBeVisible()
  await expect.poll(fontLoaded, { message: 'the bundled font, from the cache' }).toBe(true)

  // A deep link into a climb (a real navigation: the query string changes).
  await page.goto('./?from=icon#/climb/p01')
  await expectRoute(page, '/climb/p01')
  await expect(page.locator(CLIMB_CANVAS)).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.__upanyway?.climb.levelId() ?? null), { message: 'climbing Pitch 1' }).toBe('p01')
  await page.reload()
  await expect(page.locator(CLIMB_CANVAS)).toBeVisible()

  // A link with a query string, and index.html itself.
  await page.goto('./?utm=x#/weather')
  await expectRoute(page, '/weather')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await page.goto('./index.html#/camp')
  await expectRoute(page, '/camp')
  await expect(page.locator('.camp__tiles')).toBeVisible()
  await expect.poll(fontLoaded).toBe(true)

  // Everything above came from the worker's cache (the server was gone). Failed loads caused by the
  // missing server (the browser's own update check for sw.js) are expected; anything else still fails.
  for (let i = problems.length - 1; i >= 0; i--) if (CUT.test(problems[i])) problems.splice(i, 1)
}
