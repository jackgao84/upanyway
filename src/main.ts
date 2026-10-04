/**
 * Boot. Order matters: styles → store → keyboard avoidance → shell (mute) → audio unlock →
 * service worker → save-on-hide → router → debug hook.
 */
import './ui/components'
import { mountShell } from './app/shell'
import { requestPersistenceOnce } from './app/context'
import { Router } from './app/router'
import { NOT_FOUND, ROUTES, guard } from './app/screens'
import { applyUpdateIfSafe, registerServiceWorker } from './app/sw-register'
import { audio } from './audio/audio'
import { installDebugHook } from './debug'
import { initStore, MemoryStorage, type StorageLike } from './storage/store'
import { initKeyboardAvoidance } from './ui/keyboard'

/** localStorage, or (if the browser blocks it) an in-memory stand-in so the app still runs. */
function pickStorage(): StorageLike {
  try {
    const ls = window.localStorage
    if (ls) return ls
  } catch (err) {
    console.warn('[upanyway] localStorage unavailable; nothing will be kept', err)
  }
  return new MemoryStorage()
}

const store = initStore(pickStorage())

initKeyboardAvoidance()

mountShell(document.body, {
  getMuted: () => store.data.settings.muted,
  setMuted: (muted) => {
    store.update((d) => {
      d.settings.muted = muted
    })
    audio.setMuted(muted)
  },
  isTestMode: () => store.data.testMode,
  subscribe: (cb) => store.subscribe(() => cb()),
})

audio.init()
const syncSound = () => {
  audio.setMuted(store.data.settings.muted)
  audio.setMusic(store.data.settings.music)
}
syncSound()
store.subscribe(syncSound)

registerServiceWorker()
applyUpdateIfSafe()

// Save straight away when the app is hidden or closed (iPad apps are often swiped away). flush()
// writes only unsaved changes, so a second tab of the app never rewinds the save when it is hidden.
window.addEventListener('pagehide', () => store.flush())
// Another tab of the app saved: take its copy (Safari tabs, or a browser tab beside the installed app).
window.addEventListener('storage', (e) => {
  try {
    if (e.storageArea && e.storageArea !== window.localStorage) return
  } catch {
    return
  }
  store.externalWrite(e.key, e.newValue)
})
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') store.flush()
})

const app = document.getElementById('app')
if (app) {
  const router = new Router(app, ROUTES, NOT_FOUND, guard)
  router.start()
}

installDebugHook()

// Set up before this version could ask (or the answer never got saved): ask once now.
if (store.data.setup.complete) requestPersistenceOnce()
