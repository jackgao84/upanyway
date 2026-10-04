/**
 * Loading, migrating and normalising the save document.
 *
 * Load rules (loadSave):
 * - no save            → fresh (the backup is never used for this)
 * - unreadable save    → the backup if it loads, else fresh; info 'recovered'
 * - older version      → backup the raw text, run MIGRATIONS up to current; info 'migrated'
 * - newer version      → best-effort normalize, raw text kept in the backup key; info 'newer'
 * Every path ends in normalize(), so the rest of the app can trust the shape completely.
 */
import { BADGES } from '../content/badges'
import { ideaById } from '../content/ideas'
import { PITCH_IDS, type LevelId, type ZoneId } from '../game/types'
import { downsampleArc } from '../model/attempts'
import { stonesBeforeSummitDay } from '../model/unlockables'
import { dayKey } from '../model/clock'
import { newId } from '../model/ids'
import { KEYS } from './keys'
import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_DAILY_MINUTES,
  MAX_STORED_ARCS,
  defaultLook,
  defaultSave,
  type Arc,
  type BraveOutcome,
  type BraveThing,
  type ClimberLook,
  type CustomIdea,
  type GrownupFlop,
  type Letter,
  type LooksScaryRecord,
  type PitchProgress,
  type PitchRun,
  type SaveData,
  type SendRecord,
} from './schema'
import type { StorageLike } from './store'

export type LoadKind = 'fresh' | 'loaded' | 'migrated' | 'recovered' | 'newer'

export interface LoadResult {
  data: SaveData
  info: {
    kind: LoadKind
    fromVersion?: number
    /** Grown-up-facing explanation (shown in parent mode) for anything but fresh/loaded. */
    message?: string
  }
}

/** Upper bound for the parent's daily climb minutes. */
export const MAX_DAILY_MINUTES = 240
/** Names she calls her grown-ups (first run offers up to 4 fields). */
export const MAX_PARENT_NAMES = 4

export const LOAD_MESSAGES = {
  migrated: 'The saved game was updated to work with this version. A copy of the old one was kept as a backup.',
  recoveredBackup: "The saved game couldn’t be read, so the most recent backup was loaded instead.",
  recoveredFresh: "The saved game couldn’t be read and there was no backup to load, so a new game was started.",
  newer:
    'This saved game came from a newer version of Up Anyway. It was opened as well as possible and the original was kept as a backup. Updating the app is the safest next step.',
} as const

export const NOT_A_SAVE = "This doesn’t look like an Up Anyway save."
export const NEWER_VERSION =
  'This save is from a newer version of Up Anyway. Update the app first, then try again.'

type Obj = Record<string, unknown>

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const obj = (v: unknown): Obj => (isObj(v) ? v : {})

// ---------------------------------------------------------------------------------------------
// Migrations: MIGRATIONS[v] turns a version-v document into a version-(v + 1) document.
// They only reshape; normalize() does the type checking afterwards.

/**
 * v0 → v1. v0 is any pre-versioned blob (no schemaVersion): the early prototype kept settings and
 * stats at the top level, called brave things `braveThings` (with `fear`, `howScary`, `done`), stored
 * pitch progress under `progress`, and badges/poses as plain id lists. It had no daily stone cap, so
 * every done brave thing keeps the stone it already showed (placed on the day it was done).
 */
function v0to1(d: Obj): Obj {
  const out: Obj = { ...d }
  const first = (...vals: unknown[]): unknown => vals.find((v) => v !== undefined && v !== null)

  const pin = obj(d.pin)
  const parent: Obj = { ...obj(d.parent) }
  parent.pinHash = first(parent.pinHash, d.pinHash, pin.hash)
  parent.pinSalt = first(parent.pinSalt, d.pinSalt, pin.salt)
  parent.names = first(parent.names, d.parentNames, d.names)
  parent.dailyClimbMinutes = first(parent.dailyClimbMinutes, d.dailyClimbMinutes, d.dailyMinutes, d.climbMinutes)
  out.parent = parent

  const settings: Obj = { ...obj(d.settings) }
  settings.muted = first(settings.muted, d.muted, typeof d.sound === 'boolean' ? !d.sound : undefined)
  settings.music = first(settings.music, d.music)
  out.settings = settings

  const profile: Obj = { ...obj(d.profile) }
  profile.goatName = first(profile.goatName, d.goatName, d.goat)
  profile.mountainName = first(profile.mountainName, d.mountainName, d.mountain)
  profile.look = first(profile.look, d.look)
  out.profile = profile

  const stats: Obj = { ...obj(d.stats) }
  for (const k of ['whippers', 'sends', 'bigLeapsTried', 'betaAsked']) stats[k] = first(stats[k], d[k])
  out.stats = stats

  const brave = first(d.brave, d.braveThings)
  if (Array.isArray(brave)) out.brave = brave.map(v0Brave)

  const pitches = first(d.pitches, d.progress)
  if (isObj(pitches)) {
    const next: Obj = {}
    for (const [id, p] of Object.entries(pitches)) {
      if (!isObj(p)) continue
      next[id] = { ...p, totalAttempts: first(p.totalAttempts, p.attempts) }
    }
    out.pitches = next
  }

  const stamp = typeof d.createdAt === 'string' && Number.isFinite(Date.parse(d.createdAt)) ? d.createdAt : new Date(0).toISOString()
  if (Array.isArray(d.badges)) {
    const badges: Obj = {}
    for (const id of d.badges) if (typeof id === 'string') badges[id] = stamp
    out.badges = badges
  }
  if (Array.isArray(d.poses)) {
    const poses: Obj = {}
    for (const id of d.poses) if (typeof id === 'string') poses[id] = { firstAt: stamp, count: 1 }
    out.poses = poses
  }

  out.schemaVersion = 1
  return out
}

function v0Brave(item: unknown): unknown {
  if (!isObj(item)) return item
  const b: Obj = { ...item }
  if (b.forecast === undefined) b.forecast = item.fear ?? item.fearForecast
  if (b.really === undefined) b.really = item.howScary ?? item.reallyScary
  if (b.createdAt === undefined) b.createdAt = item.date ?? item.at
  if (b.whatHappened === undefined) b.whatHappened = item.happened
  if (b.status === undefined) b.status = item.done === true || b.doneAt !== undefined ? 'done' : 'planned'
  if (b.status === 'done' && b.stoneDay === undefined) {
    const when = isoOf(b.doneAt) ?? isoOf(b.createdAt)
    b.stoneDay = when ? dayKey(new Date(when)) : null
  }
  return b
}

/**
 * v1 → v2: grown-ups can hide built-in idea cards and Oops Missions (`hiddenIdeas`, the ids of the
 * hidden ones). Every v1 save showed every card, so the list starts empty; anything already there
 * (a hand-edited file) is kept for normalize() to check.
 */
function v1to2(d: Obj): Obj {
  return { ...d, hiddenIdeas: Array.isArray(d.hiddenIdeas) ? d.hiddenIdeas : [], schemaVersion: 2 }
}

export const MIGRATIONS: Record<number, (d: Record<string, unknown>) => Record<string, unknown>> = {
  0: v0to1,
  1: v1to2,
}

// ---------------------------------------------------------------------------------------------
// Coercion helpers

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

/** A string with something in it, else undefined. */
function optStr(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v : undefined
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback
}

function num(v: unknown, fallback: number, min = -Infinity, max = Infinity, int = false): number {
  let n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  if (!Number.isFinite(n)) return fallback
  if (int) n = Math.round(n)
  return Math.min(max, Math.max(min, n)) || 0
}

const count = (v: unknown, fallback = 0): number => num(v, fallback, 0, Number.MAX_SAFE_INTEGER, true)
const scale = (v: unknown, fallback: number): number => num(v, fallback, 0, 10, true)

function isoOf(v: unknown): string | undefined {
  return typeof v === 'string' && v !== '' && Number.isFinite(Date.parse(v)) ? v : undefined
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
function dayOf(v: unknown): string | null {
  return typeof v === 'string' && DAY_RE.test(v) ? v : null
}

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

/** Non-empty strings, duplicates removed. */
function strList(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  const out: string[] = []
  for (const s of v) if (typeof s === 'string' && s !== '' && !out.includes(s)) out.push(s)
  return out
}

function arcList(v: unknown): Arc[] {
  if (!Array.isArray(v)) return []
  const out: Arc[] = []
  for (const a of v) {
    if (!Array.isArray(a)) continue
    const arc = downsampleArc(a.filter((n): n is number => typeof n === 'number'))
    if (arc.length >= 2) out.push(arc)
  }
  return out.length > MAX_STORED_ARCS ? out.slice(out.length - MAX_STORED_ARCS) : out
}

/** Gives each kept entry a unique id (generating one when missing or repeated). */
function uniqueIds<T extends { id: string }>(items: (T | null)[], prefix: string): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const item of items) {
    if (!item) continue
    if (!item.id || seen.has(item.id)) item.id = newId(prefix)
    seen.add(item.id)
    out.push(item)
  }
  return out
}

// ---------------------------------------------------------------------------------------------
// normalize

const LEVEL_IDS: readonly LevelId[] = ['lesson', ...PITCH_IDS]
const ZONE_IDS: readonly ZoneId[] = ['meadow', 'hollow', 'crumble', 'ridge', 'cloud', 'summit']
const OUTCOMES: readonly BraveOutcome[] = ['nailed', 'wobbly', 'flopped']

function normalizeLook(v: unknown): ClimberLook {
  const r = obj(v)
  const def = defaultLook()
  const pickStr = (k: Exclude<keyof ClimberLook, 'gear'>): string => optStr(r[k]) ?? def[k]
  return {
    hairStyle: pickStr('hairStyle'),
    hairColor: pickStr('hairColor'),
    skinTone: pickStr('skinTone'),
    outfit: pickStr('outfit'),
    outfitColor: pickStr('outfitColor'),
    helmet: pickStr('helmet'),
    helmetColor: pickStr('helmetColor'),
    backpack: pickStr('backpack'),
    backpackColor: pickStr('backpackColor'),
    gear: strList(r.gear),
  }
}

function normalizeRun(v: unknown, night: boolean, now: Date): PitchRun | null {
  if (!isObj(v)) return null
  const lastCampId = optStr(v.lastCampId)
  if (!lastCampId) return null
  let routeArcs = arcList(v.routeArcs)
  let routePath = Array.isArray(v.routePath) ? v.routePath.filter((s): s is string => typeof s === 'string' && s !== '') : []
  if (routePath.length !== routeArcs.length + 1 || !routePath.includes(lastCampId)) {
    routePath = [lastCampId]
    routeArcs = []
  }
  const fallsBySpot: Record<string, number> = {}
  for (const [k, n] of Object.entries(obj(v.fallsBySpot))) {
    if (UNSAFE_KEYS.has(k)) continue
    const c = count(n, -1)
    if (c > 0) fallsBySpot[k] = c
  }
  const lastMissBySpot: PitchRun['lastMissBySpot'] = {}
  for (const [k, m] of Object.entries(obj(v.lastMissBySpot))) {
    if (UNSAFE_KEYS.has(k) || !isObj(m)) continue
    const kind = m.kind === 'rope' || m.kind === 'slip' || m.kind === 'crumble' ? m.kind : null
    const arc = arcList([m.arc])[0]
    if (!kind || !arc) continue
    const l = obj(m.launch)
    const angle = num(l.angle, NaN, -360, 360)
    const power = num(l.power, NaN, 0, 1)
    lastMissBySpot[k] = {
      kind,
      launch: Number.isFinite(angle) && Number.isFinite(power) ? { angle, power } : null,
      bumped: bool(m.bumped, false),
      gusted: bool(m.gusted, false),
      arc,
    }
  }
  const lastCampRouteIndex = count(v.lastCampRouteIndex)
  return {
    startedAt: isoOf(v.startedAt) ?? now.toISOString(),
    lastCampId,
    lastCampRouteIndex,
    whippers: count(v.whippers),
    failedArcs: arcList(v.failedArcs),
    routeArcs,
    routePath,
    fallsBySpot,
    lastMissBySpot,
    highestRouteIndex: Math.max(count(v.highestRouteIndex), lastCampRouteIndex),
    night,
  }
}

function normalizeSend(v: unknown): SendRecord | null {
  if (!isObj(v)) return null
  const at = isoOf(v.at)
  if (!at) return null
  return {
    at,
    attempts: num(v.attempts, 1, 1, Number.MAX_SAFE_INTEGER, true),
    failedArcs: arcList(v.failedArcs),
    routeArcs: arcList(v.routeArcs),
    night: bool(v.night, false),
  }
}

function normalizePitch(v: Obj, now: Date): PitchProgress {
  const sends = count(v.sends)
  const nightSends = count(v.nightSends)
  const p: PitchProgress = {
    sends,
    nightSends,
    totalAttempts: Math.max(count(v.totalAttempts), sends + nightSends),
    run: normalizeRun(v.run, false, now),
    nightRun: normalizeRun(v.nightRun, true, now),
    lastSend: normalizeSend(v.lastSend),
    revealedHolds: strList(v.revealedHolds),
    foundCrumbles: strList(v.foundCrumbles),
  }
  const firstSentAt = isoOf(v.firstSentAt)
  if (firstSentAt) p.firstSentAt = firstSentAt
  return p
}

function normalizeBraveThing(v: unknown, now: Date): BraveThing | null {
  if (!isObj(v)) return null
  const text = optStr(v.text)
  if (!text) return null
  const stoneDay = dayOf(v.stoneDay)
  const doneAt = isoOf(v.doneAt)
  const outcome = OUTCOMES.find((o) => o === v.outcome)
  let status: BraveThing['status'] =
    v.status === 'done' || v.status === 'planned' ? v.status : doneAt || outcome ? 'done' : 'planned'
  // A stone on the cairn means it was done: never lose a stone over a bad status.
  if (stoneDay) status = 'done'
  const createdAt = isoOf(v.createdAt) ?? now.toISOString()
  const b: BraveThing = {
    id: str(v.id),
    createdAt,
    text,
    oops: bool(v.oops, false),
    forecast: scale(v.forecast, 5),
    status,
    notTodayCount: count(v.notTodayCount),
    stoneDay: status === 'done' ? stoneDay : null,
  }
  const ideaId = optStr(v.ideaId)
  if (ideaId) b.ideaId = ideaId
  const worry = optStr(v.worry)
  if (worry) b.worry = worry
  const smallerOf = optStr(v.smallerOf)
  if (smallerOf) b.smallerOf = smallerOf
  if (smallerOf && v.afterNotToday === true) b.afterNotToday = true
  if (status === 'done') {
    b.doneAt = doneAt ?? createdAt
    const really = num(v.really, NaN, 0, 10, true)
    if (Number.isFinite(really)) b.really = really
    const happened = optStr(v.whatHappened)
    if (happened) b.whatHappened = happened
    if (outcome) b.outcome = outcome
    const learned = optStr(v.learned)
    if (learned) b.learned = learned
  }
  return b
}

function normalizeLetter(v: unknown, now: Date): Letter | null {
  if (!isObj(v)) return null
  const text = optStr(v.text)
  if (!text) return null
  const createdAt = isoOf(v.createdAt) ?? now.toISOString()
  const stoneDay = dayOf(v.stoneDay)
  const l: Letter = { id: str(v.id), createdAt, from: str(v.from), text, stoneDay }
  const openedAt = isoOf(v.openedAt) ?? (stoneDay ? createdAt : undefined)
  if (openedAt) l.openedAt = openedAt
  return l
}

function normalizeFlop(v: unknown, now: Date): GrownupFlop | null {
  if (!isObj(v)) return null
  const what = optStr(v.what)
  if (!what) return null
  return { id: str(v.id), createdAt: isoOf(v.createdAt) ?? now.toISOString(), who: str(v.who), what, learned: str(v.learned) }
}

/** Hidden built-in idea cards: only ids that are still built-in cards, each once, in the order hidden. */
function hiddenIdeaList(v: unknown): string[] {
  return strList(v).filter((id) => ideaById(id) !== undefined)
}

function normalizeIdea(v: unknown, now: Date): CustomIdea | null {
  if (!isObj(v)) return null
  const text = optStr(v.text)
  if (!text) return null
  return { id: str(v.id), createdAt: isoOf(v.createdAt) ?? now.toISOString(), text, oops: bool(v.oops, false) }
}

/**
 * Coerce anything into a valid, current SaveData: missing fields come from defaultSave(), wrong types
 * are replaced, numbers are clamped (forecasts 0–10, counts ≥ 0), broken list entries are dropped and
 * unknown fields are left out. Valid data passes through unchanged.
 */
export function normalize(raw: unknown, now: Date = new Date()): SaveData {
  const r = obj(raw)
  const def = defaultSave(now)
  const setup = obj(r.setup)
  const parent = obj(r.parent)
  const settings = obj(r.settings)
  const profile = obj(r.profile)
  const stats = obj(r.stats)
  const climbTime = obj(r.climbTime)
  const summit = obj(r.summit)
  const flags = obj(r.flags)

  const pitches: SaveData['pitches'] = {}
  const rawPitches = obj(r.pitches)
  for (const id of LEVEL_IDS) {
    const p = rawPitches[id]
    if (isObj(p)) pitches[id] = normalizePitch(p, now)
  }

  const poses: SaveData['poses'] = {}
  for (const [id, v] of Object.entries(obj(r.poses))) {
    if (UNSAFE_KEYS.has(id) || !isObj(v)) continue
    poses[id] = { firstAt: isoOf(v.firstAt) ?? now.toISOString(), count: num(v.count, 1, 1, Number.MAX_SAFE_INTEGER, true) }
  }

  const badges: SaveData['badges'] = {}
  const rawBadges = obj(r.badges)
  for (const badge of BADGES) {
    const v = rawBadges[badge.id]
    const at = isoOf(v) ?? (v === true ? now.toISOString() : undefined)
    if (at) badges[badge.id] = at
  }

  const looksScary: SaveData['looksScary'] = {}
  const rawScary = obj(r.looksScary)
  for (const zone of ZONE_IDS) {
    const v = rawScary[zone]
    if (!isObj(v)) continue
    const forecast = num(v.forecast, NaN, 0, 10, true)
    if (!Number.isFinite(forecast)) continue
    const really = num(v.really, NaN, 0, 10, true)
    const rec: LooksScaryRecord = {
      forecast,
      really: Number.isFinite(really) ? really : null,
      at: isoOf(v.at) ?? now.toISOString(),
    }
    looksScary[zone] = rec
  }

  const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
  const names = list(parent.names)
    .filter((n): n is string => typeof n === 'string' && n.trim() !== '')
    .slice(0, MAX_PARENT_NAMES)

  const summitAt = isoOf(summit.at)
  const stonesAt = num(summit.stonesAt, NaN, 0, Number.MAX_SAFE_INTEGER, true)
  const out: SaveData = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    createdAt: isoOf(r.createdAt) ?? def.createdAt,
    setup: {
      parentDone: bool(setup.parentDone, def.setup.parentDone),
      // Saves from before the flag: past the designer once the goat has a name.
      lookDone: bool(setup.lookDone, bool(setup.complete, false) || str(profile.goatName) !== ''),
      complete: bool(setup.complete, def.setup.complete),
    },
    parent: {
      pinHash: str(parent.pinHash),
      pinSalt: str(parent.pinSalt),
      names,
      dailyClimbMinutes: num(parent.dailyClimbMinutes, DEFAULT_DAILY_MINUTES, 0, MAX_DAILY_MINUTES, true),
    },
    settings: {
      muted: bool(settings.muted, def.settings.muted),
      music: bool(settings.music, def.settings.music),
    },
    profile: {
      look: normalizeLook(profile.look),
      goatName: str(profile.goatName),
      mountainName: str(profile.mountainName),
    },
    lessonDone: bool(r.lessonDone, false),
    pitches,
    stats: {
      whippers: count(stats.whippers),
      sends: count(stats.sends),
      bigLeapsTried: count(stats.bigLeapsTried),
      betaAsked: count(stats.betaAsked),
    },
    poses,
    brave: uniqueIds(list(r.brave).map((v) => normalizeBraveThing(v, now)), 'b'),
    letters: uniqueIds(list(r.letters).map((v) => normalizeLetter(v, now)), 'l'),
    grownupFlops: uniqueIds(list(r.grownupFlops).map((v) => normalizeFlop(v, now)), 'f'),
    customIdeas: uniqueIds(list(r.customIdeas).map((v) => normalizeIdea(v, now)), 'i'),
    hiddenIdeas: hiddenIdeaList(r.hiddenIdeas),
    badges,
    glossarySeen: strList(r.glossarySeen),
    looksScary,
    climbTime: { day: dayOf(climbTime.day) ?? '', seconds: num(climbTime.seconds, 0, 0, 86_400) },
    summit: {
      reached: bool(summit.reached, false),
      ...(summitAt ? { at: summitAt } : {}),
      finaleSeen: bool(summit.finaleSeen, false),
      ...(Number.isFinite(stonesAt) ? { stonesAt } : {}),
    },
    flags: {
      ropeExplained: bool(flags.ropeExplained, false),
      firstCampVisit: bool(flags.firstCampVisit, false),
      braveVsDangerousSeen: bool(flags.braveVsDangerousSeen, false),
      persistGranted: typeof flags.persistGranted === 'boolean' ? flags.persistGranted : null,
    },
    testMode: bool(r.testMode, false),
  }
  // A summit reached before `stonesAt` was kept: the cairn size then, by the day rule, once.
  if (out.summit.reached && out.summit.stonesAt === undefined) out.summit.stonesAt = stonesBeforeSummitDay(out)
  return out
}

// ---------------------------------------------------------------------------------------------
// Versions

/** The document's schemaVersion: 0 when absent (pre-versioned), null when unreadable. */
export function versionOf(raw: Record<string, unknown>): number | null {
  const v = raw.schemaVersion
  if (v === undefined || v === null) return 0
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return Number.isInteger(n) && n >= 0 ? n : null
}

/**
 * Run every migration from the document's version up to the current one, then normalize.
 * Throws a friendly Error for non-objects, unreadable versions and newer versions.
 */
export function migrateToCurrent(raw: unknown, now: Date = new Date()): { data: SaveData; fromVersion: number } {
  if (!isObj(raw)) throw new Error(NOT_A_SAVE)
  const fromVersion = versionOf(raw)
  if (fromVersion === null) throw new Error(NOT_A_SAVE)
  if (fromVersion > CURRENT_SCHEMA_VERSION) throw new Error(NEWER_VERSION)
  let doc = JSON.parse(JSON.stringify(raw)) as Obj
  for (let v = fromVersion; v < CURRENT_SCHEMA_VERSION; v++) {
    const step = MIGRATIONS[v]
    if (!step) throw new Error(NOT_A_SAVE)
    doc = step(doc)
  }
  return { data: normalize(doc, now), fromVersion }
}

// ---------------------------------------------------------------------------------------------
// loadSave

function safeGet(storage: StorageLike, key: string): string | null {
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

function safeSet(storage: StorageLike, key: string, value: string): void {
  try {
    storage.setItem(key, value)
  } catch (err) {
    console.warn('[upanyway] could not write', key, err)
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

/** Load from a readable document, or null when it can't be used. */
function fromDocument(parsed: unknown, now: Date): { data: SaveData; fromVersion: number; newer: boolean } | null {
  if (!isObj(parsed)) return null
  const version = versionOf(parsed)
  if (version === null) return null
  if (version > CURRENT_SCHEMA_VERSION) return { data: normalize(parsed, now), fromVersion: version, newer: true }
  try {
    return { ...migrateToCurrent(parsed, now), newer: false }
  } catch {
    return null
  }
}

export function loadSave(storage: StorageLike, now: Date = new Date()): LoadResult {
  const text = safeGet(storage, KEYS.save)
  if (text === null) return { data: defaultSave(now), info: { kind: 'fresh' } }

  const main = fromDocument(parseJson(text), now)
  if (main) {
    const { data, fromVersion } = main
    if (main.newer) {
      safeSet(storage, KEYS.backup, text)
      return { data, info: { kind: 'newer', fromVersion, message: LOAD_MESSAGES.newer } }
    }
    if (fromVersion === CURRENT_SCHEMA_VERSION) return { data, info: { kind: 'loaded', fromVersion } }
    safeSet(storage, KEYS.backup, text)
    return { data, info: { kind: 'migrated', fromVersion, message: LOAD_MESSAGES.migrated } }
  }

  const backupText = safeGet(storage, KEYS.backup)
  const backup = backupText === null ? null : fromDocument(parseJson(backupText), now)
  if (backup) {
    return { data: backup.data, info: { kind: 'recovered', fromVersion: backup.fromVersion, message: LOAD_MESSAGES.recoveredBackup } }
  }
  // Nothing usable: keep the unreadable text where a grown-up could still rescue it by hand.
  safeSet(storage, KEYS.backup, text)
  return { data: defaultSave(now), info: { kind: 'recovered', message: LOAD_MESSAGES.recoveredFresh } }
}
