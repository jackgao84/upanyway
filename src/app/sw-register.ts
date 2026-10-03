/**
 * Service worker registration and safe updates (PROGRESS.md decision 11).
 *
 * A new deploy installs in the background and waits. It is switched on only at a safe moment —
 * at boot and when Camp opens, never mid-climb — by `applyUpdateIfSafe()`, which tells the waiting
 * worker to take over and reloads the page once when it has.
 */
import { SW_SKIP_WAITING } from '../storage/keys'

/** A boot-time request made before registration resolves is honoured only this soon after. */
const BOOT_APPLY_WINDOW_MS = 3000
/** If the new worker hasn't taken control by then, stop reporting "update in progress". */
const APPLY_TIMEOUT_MS = 5000

let registration: ServiceWorkerRegistration | null = null
let applyRequestedAt = -1
let applying = false
let reloaded = false
const listeners = new Set<() => void>()

function enabled(): boolean {
  return import.meta.env.PROD && 'serviceWorker' in navigator
}

/** The waiting worker of an update (never the very first install, which activates on its own). */
function waitingWorker(): ServiceWorker | null {
  const reg = registration
  if (!reg || !reg.active) return null
  const waiting = reg.waiting
  return waiting && waiting.state === 'installed' ? waiting : null
}

function notify(): void {
  if (!waitingWorker()) return
  for (const cb of [...listeners]) cb()
}

function watchInstalling(worker: ServiceWorker | null): void {
  if (!worker) return
  worker.addEventListener('statechange', () => {
    if (worker.state === 'installed') notify()
  })
}

function track(reg: ServiceWorkerRegistration | undefined): void {
  if (!reg || registration) return
  registration = reg
  watchInstalling(reg.installing)
  reg.addEventListener('updatefound', () => watchInstalling(reg.installing))
  const requested = applyRequestedAt >= 0 && performance.now() - applyRequestedAt < BOOT_APPLY_WINDOW_MS
  applyRequestedAt = -1
  if (requested && applyUpdateIfSafe()) return
  notify()
}

/** Registers `sw.js` for this app's path only (production builds; a no-op in dev). Call once at boot. */
export function registerServiceWorker(): void {
  if (!enabled()) return
  const base = import.meta.env.BASE_URL
  const sw = navigator.serviceWorker
  sw.addEventListener('controllerchange', () => {
    // Reload only for an update we switched on (not the first install's clients.claim), and only once.
    if (!applying || reloaded) return
    reloaded = true
    window.location.reload()
  })
  sw.register(base + 'sw.js', { scope: base, updateViaCache: 'none' }).then(track, (err: unknown) => {
    // A failed (e.g. offline) script fetch lands here; keep managing the registration we already have.
    console.warn('Service worker registration failed', err)
    sw.getRegistration(base).then(track, () => undefined)
  })
}

/** True when a new version has installed and is waiting to be switched on. */
export function updateReady(): boolean {
  return enabled() && waitingWorker() !== null
}

/**
 * Switches on a waiting update; the page reloads once when the new worker takes control.
 * Call ONLY at a safe moment: at boot (main.ts, after `registerServiceWorker()`) and on Camp entry —
 * never during a climb. Returns true when an update is being applied (a reload is coming).
 * At boot the registration may not have resolved yet: the request is remembered and honoured if it
 * resolves within a few seconds, and this returns false.
 */
export function applyUpdateIfSafe(): boolean {
  if (!enabled()) return false
  if (applying) return true
  if (!registration) {
    applyRequestedAt = performance.now()
    return false
  }
  const waiting = waitingWorker()
  if (!waiting) return false
  applying = true
  window.setTimeout(() => {
    if (!reloaded) applying = false
  }, APPLY_TIMEOUT_MS)
  waiting.postMessage(SW_SKIP_WAITING)
  return true
}

/**
 * Calls `cb` whenever an update has installed and is waiting — straight away if one already is.
 * Camp uses it to apply an update that arrives while she is there. Returns an unsubscribe function.
 */
export function onUpdateReady(cb: () => void): () => void {
  listeners.add(cb)
  if (enabled() && waitingWorker()) cb()
  return () => {
    listeners.delete(cb)
  }
}
