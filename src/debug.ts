/**
 * `window.__upanyway`: a read-only window into the app for end-to-end tests and for a grown-up
 * poking at the console. It never writes to the save. Stage 3 adds `climb` helpers with extendDebug().
 */
import { version } from '../package.json'
import { store } from './storage/store'
import type { SaveData } from './storage/schema'

export interface DebugApi {
  /** App version (package.json). */
  version: string
  /** A deep copy of the save right now (changing it changes nothing). */
  store(): SaveData
  /** The current hash route, e.g. "/camp". */
  route(): string
  [extra: string]: unknown
}

declare global {
  interface Window {
    __upanyway?: DebugApi
  }
}

export const APP_VERSION: string = version

export function installDebugHook(): DebugApi {
  const api: DebugApi = {
    version: APP_VERSION,
    store: () => JSON.parse(JSON.stringify(store().data)) as SaveData,
    route: () => (location.hash.replace(/^#/, '').split('?')[0] || '/'),
  }
  window.__upanyway = api
  return api
}

/** Add a named group of helpers (e.g. `climb`) to window.__upanyway. */
export function extendDebug(name: string, helpers: unknown): void {
  const api = window.__upanyway ?? installDebugHook()
  api[name] = helpers
}
