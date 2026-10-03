/**
 * `window.__upanyway`: a read-only window into the app for end-to-end tests and for a grown-up
 * poking at the console. It never writes to the save.
 *
 * `climb` is always there; while a climb (or the first-run lesson) is on screen it answers from that
 * climb, otherwise its getters return null (a pitch that isn't open yet answers levelId() and
 * pendingPrompt() 'locked', and null for the rest):
 *   state()          session.snapshot() — phase, elementId, x, y, frozen…
 *   climberClient()  her centre in client (CSS) px, plus `r`, the radius inside which a release cancels
 *   maxDragPx()      drag length (CSS px) that means full power
 *   worldToClient()  a world point (units, y-up) in client px
 *   levelId()        'p01'… or 'lesson'
 *   pendingPrompt()  the open blocking prompt: 'forecast' | 'really' | 'reveal' | 'betamap' | 'sunset' | 'locked'
 */
import { version } from '../package.json'
import { store } from './storage/store'
import type { SaveData } from './storage/schema'

export interface ClimbSnapshot {
  phase: string
  elementId: string
  lastCampId: string
  highestRouteIndex: number
  t: number
  x: number
  y: number
  frozen: boolean
  bigLeap: boolean
}

/** What a mounted climb provides (climb screen or lesson; a locked pitch has no climb, only its card). */
export interface ClimbDebugProvider {
  state(): ClimbSnapshot | null
  climberClient(): { x: number; y: number; r: number } | null
  maxDragPx(): number
  worldToClient(x: number, y: number): { x: number; y: number } | null
  levelId(): string
  pendingPrompt(): string | null
}

export interface ClimbDebug {
  state(): ClimbSnapshot | null
  climberClient(): { x: number; y: number; r: number } | null
  maxDragPx(): number
  worldToClient(x: number, y: number): { x: number; y: number } | null
  levelId(): string | null
  pendingPrompt(): string | null
}

export interface DebugApi {
  /** App version (package.json). */
  version: string
  /** A deep copy of the save right now (changing it changes nothing). */
  store(): SaveData
  /** The current hash route, e.g. "/camp". */
  route(): string
  /** The climb on screen (see the file comment). */
  climb: ClimbDebug
  [extra: string]: unknown
}

declare global {
  interface Window {
    __upanyway?: DebugApi
  }
}

export const APP_VERSION: string = version

let climbProvider: ClimbDebugProvider | null = null

/** The mounted climb registers itself here (null on unmount). */
export function setClimbDebug(provider: ClimbDebugProvider | null): void {
  climbProvider = provider
}

const climb: ClimbDebug = {
  state: () => (climbProvider ? climbProvider.state() : null),
  climberClient: () => (climbProvider ? climbProvider.climberClient() : null),
  maxDragPx: () => (climbProvider ? climbProvider.maxDragPx() : 0),
  worldToClient: (x, y) => (climbProvider ? climbProvider.worldToClient(x, y) : null),
  levelId: () => (climbProvider ? climbProvider.levelId() : null),
  pendingPrompt: () => (climbProvider ? climbProvider.pendingPrompt() : null),
}

export function installDebugHook(): DebugApi {
  const existing = window.__upanyway
  const api: DebugApi = {
    // Helpers added before the hook was installed (a screen mounted first) are kept.
    ...(existing ?? {}),
    version: APP_VERSION,
    store: () => JSON.parse(JSON.stringify(store().data)) as SaveData,
    route: () => (location.hash.replace(/^#/, '').split('?')[0] || '/'),
    climb,
  }
  window.__upanyway = api
  return api
}

/** Add a named group of helpers to window.__upanyway. */
export function extendDebug(name: string, helpers: unknown): void {
  const api = window.__upanyway ?? installDebugHook()
  api[name] = helpers
}
