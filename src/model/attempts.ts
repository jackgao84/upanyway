/**
 * Attempts, whippers and sends (Decision 15). Attempts = whippers + sends; the attempts for one send
 * = that run's whippers + 1. Pure functions that mutate SaveData — call them inside store().update().
 *
 * Engine call order for a climb:
 *   startRun()                  on entering the pitch (returns the run in progress to resume, if any)
 *   recordLanding()             every landing/catch that isn't a whipper (including the pitch top)
 *   recordWhipper()             every whipper (rope catch, slip, crumble), then recordPose()
 *   recordRopeCatch()           whenever the rope reels her back to camp (after recordWhipper)
 *   recordSend()                after recordLanding() on the pitch top
 *   evaluateBadges()            (model/badges.ts) after any of the above, to pop new badges
 *
 * Test mode writes nothing to her record (Decision 21): stats, poses, pitch progress and badges stay
 * untouched. Runs still work there — they live in a scratch map beside the document (never saved),
 * so chalk, beta hints and the beta map behave normally while a grown-up tries things out.
 */
import {
  ARC_POINTS,
  MAX_STORED_ARCS,
  defaultPitchProgress,
  type Arc,
  type PitchProgress,
  type PitchRun,
  type SaveData,
  type SendRecord,
} from '../storage/schema'
import { PITCH_IDS, type LevelId, type ZoneId } from '../game/types'
import { totalStones } from './stones'

/** The pitch whose first day send reaches the summit (Sky Lake). */
export const SUMMIT_PITCH: LevelId = PITCH_IDS[PITCH_IDS.length - 1]

/**
 * Reduce a flattened [x0, y0, x1, y1, …] path to at most `maxPoints` points, keeping the first and
 * last, rounded to integers. Pairs with a non-finite coordinate are dropped.
 */
export function downsampleArc(points: readonly number[], maxPoints: number = ARC_POINTS): Arc {
  const xs: number[] = []
  const ys: number[] = []
  for (let i = 0; i + 1 < points.length; i += 2) {
    const x = points[i]
    const y = points[i + 1]
    if (Number.isFinite(x) && Number.isFinite(y)) {
      xs.push(Math.round(x) || 0)
      ys.push(Math.round(y) || 0)
    }
  }
  const n = xs.length
  const max = Math.max(2, Math.floor(maxPoints))
  const out: Arc = []
  if (n <= max) {
    for (let i = 0; i < n; i++) out.push(xs[i], ys[i])
    return out
  }
  for (let k = 0; k < max; k++) {
    const i = Math.round((k * (n - 1)) / (max - 1))
    out.push(xs[i], ys[i])
  }
  return out
}

// ---------------------------------------------------------------------------------------------
// Runs

const scratchRuns = new WeakMap<SaveData, Map<string, PitchRun>>()

function scratch(d: SaveData): Map<string, PitchRun> {
  let map = scratchRuns.get(d)
  if (!map) {
    map = new Map()
    scratchRuns.set(d, map)
  }
  return map
}

const runKey = (levelId: LevelId, night: boolean): string => `${levelId}:${night ? 'night' : 'day'}`

function ensurePitch(d: SaveData, levelId: LevelId): PitchProgress {
  let p = d.pitches[levelId]
  if (!p) {
    p = defaultPitchProgress()
    d.pitches[levelId] = p
  }
  return p
}

/** The run in progress (day or night), or null. In test mode, the scratch run. */
export function currentRun(d: SaveData, levelId: LevelId, night: boolean): PitchRun | null {
  if (d.testMode) return scratch(d).get(runKey(levelId, night)) ?? null
  const p = d.pitches[levelId]
  if (!p) return null
  return (night ? p.nightRun : p.run) ?? null
}

function setRun(d: SaveData, levelId: LevelId, night: boolean, run: PitchRun | null): void {
  if (d.testMode) {
    if (run) scratch(d).set(runKey(levelId, night), run)
    else scratch(d).delete(runKey(levelId, night))
    return
  }
  if (!run && !d.pitches[levelId]) return
  const p = ensurePitch(d, levelId)
  if (night) p.nightRun = run
  else p.run = run
}

export function newRun(startCampId: string, night: boolean, now: Date): PitchRun {
  return {
    startedAt: now.toISOString(),
    lastCampId: startCampId,
    lastCampRouteIndex: 0,
    whippers: 0,
    failedArcs: [],
    routeArcs: [],
    routePath: [startCampId],
    fallsBySpot: {},
    lastMissBySpot: {},
    highestRouteIndex: 0,
    night,
  }
}

/**
 * Begin climbing a pitch. If a run is already in progress it is returned unchanged (resume at its
 * lastCampId); otherwise a new run starts at `startCampId` (level.route[0]).
 */
export function startRun(d: SaveData, levelId: LevelId, startCampId: string, night: boolean, now: Date): PitchRun {
  const existing = currentRun(d, levelId, night)
  if (existing) return existing
  const run = newRun(startCampId, night, now)
  setRun(d, levelId, night, run)
  return run
}

/** Drop the run in progress so the next climb starts from the bottom. */
export function abandonRun(d: SaveData, levelId: LevelId, night: boolean): void {
  setRun(d, levelId, night, null)
}

/** Forget every test-mode scratch run (e.g. when test mode is switched off). */
export function clearTestRuns(d: SaveData): void {
  scratchRuns.delete(d)
}

/** Index in routePath of the last camp; the bright route is never cut below it except by a rope catch. */
function campCut(run: PitchRun): number {
  const i = run.routePath.lastIndexOf(run.lastCampId)
  return i < 0 ? 0 : i
}

/** Cut the bright route back so that routePath[k] is where she now is. */
function truncateTo(run: PitchRun, k: number): void {
  run.routePath.length = k + 1
  run.routeArcs.length = k
}

export interface LandingInfo {
  elementId: string
  /** Index of the element in level.route, or null when it isn't on the route. */
  routeIndex: number | null
  /** The element is a camp ledge. */
  isCamp: boolean
  /** The leap's path (any length; downsampled here). */
  arc: Arc
}

/**
 * A landing or catch that isn't a whipper. Extends the bright route — or, when she is back on an
 * element already on it above the last camp (a hop or a step back down), drops that loop so the beta
 * map shows a clean line. A camp further up the route becomes her new last camp (`newCamp`).
 */
export function recordLanding(d: SaveData, levelId: LevelId, night: boolean, info: LandingInfo): { newCamp: boolean } {
  const run = currentRun(d, levelId, night)
  if (!run) return { newCamp: false }
  const k = run.routePath.lastIndexOf(info.elementId)
  if (k >= 0 && k >= campCut(run)) {
    truncateTo(run, k)
  } else {
    run.routeArcs.push(downsampleArc(info.arc))
    run.routePath.push(info.elementId)
  }
  const ri = info.routeIndex
  if (ri !== null && Number.isFinite(ri)) {
    if (ri > run.highestRouteIndex) run.highestRouteIndex = ri
    if (info.isCamp && ri > run.lastCampRouteIndex) {
      run.lastCampId = info.elementId
      run.lastCampRouteIndex = ri
      return { newCamp: true }
    }
  }
  return { newCamp: false }
}

export interface WhipperInfo {
  /** Element she launched from (beta counts falls per spot). */
  spotId: string
  /** The failed leap's full path (launch → rest); becomes chalk. */
  arc: Arc
  kind: 'rope' | 'slip' | 'crumble'
  /** Slips: the element she ended up on, so the bright route can be cut back if it's on it. */
  restId?: string | null
  /** For the beta hint (kept per spot as the run's last miss there). */
  launch?: { angle: number; power: number } | null
  bumped?: boolean
  gusted?: boolean
}

/** A whipper: counts as an attempt. Returns this run's whipper count and the falls from this spot. */
export function recordWhipper(
  d: SaveData,
  levelId: LevelId,
  night: boolean,
  info: WhipperInfo,
): { whippersThisRun: number; fallsAtSpot: number } {
  if (!d.testMode) {
    d.stats.whippers++
    ensurePitch(d, levelId).totalAttempts++
  }
  const run = currentRun(d, levelId, night)
  if (!run) return { whippersThisRun: 0, fallsAtSpot: 0 }
  run.whippers++
  const falls = (run.fallsBySpot[info.spotId] ?? 0) + 1
  run.fallsBySpot[info.spotId] = falls
  const arc = downsampleArc(info.arc)
  run.lastMissBySpot[info.spotId] = {
    kind: info.kind,
    launch: info.launch ? { angle: info.launch.angle, power: info.launch.power } : null,
    bumped: info.bumped === true,
    gusted: info.gusted === true,
    arc,
  }
  run.failedArcs.push(arc)
  if (run.failedArcs.length > MAX_STORED_ARCS) run.failedArcs.splice(0, run.failedArcs.length - MAX_STORED_ARCS)
  if (info.restId) {
    const k = run.routePath.lastIndexOf(info.restId)
    if (k >= 0 && k >= campCut(run)) truncateTo(run, k)
  }
  return { whippersThisRun: run.whippers, fallsAtSpot: falls }
}

/** The rope reeled her back to her last camp: the bright route goes back to that camp, exactly. */
export function recordRopeCatch(d: SaveData, levelId: LevelId, night: boolean): void {
  const run = currentRun(d, levelId, night)
  if (run) truncateTo(run, campCut(run))
}

/**
 * She reached the pitch top (call recordLanding for that landing first). Returns the send for the
 * beta map ("Sent in N attempts"), stores it as lastSend and ends the run. The first day send of the
 * summit pitch also marks the summit reached (the finale plays until summit.finaleSeen).
 */
export function recordSend(d: SaveData, levelId: LevelId, night: boolean, now: Date): SendRecord {
  const run = currentRun(d, levelId, night)
  const send: SendRecord = {
    at: now.toISOString(),
    attempts: (run ? run.whippers : 0) + 1,
    failedArcs: run ? run.failedArcs.slice() : [],
    routeArcs: run ? run.routeArcs.slice() : [],
    night,
  }
  setRun(d, levelId, night, null)
  if (d.testMode) return send
  const p = ensurePitch(d, levelId)
  d.stats.sends++
  p.totalAttempts++
  if (night) p.nightSends++
  else p.sends++
  if (!p.firstSentAt) p.firstSentAt = send.at
  p.lastSend = send
  if (levelId === SUMMIT_PITCH && !night && !d.summit.reached) {
    d.summit.reached = true
    d.summit.at = send.at
    // Every stone after these unlocks a camp treasure (stones from earlier today don't).
    d.summit.stonesAt = totalStones(d)
  }
  return send
}

// ---------------------------------------------------------------------------------------------
// Other climbing records

/** Count a fall pose for the Hall of Flops. `isNew` → "New flop unlocked!". */
export function recordPose(d: SaveData, poseId: string, now: Date): { isNew: boolean } {
  if (d.testMode) return { isNew: false }
  const existing = d.poses[poseId]
  if (existing) {
    existing.count++
    return { isNew: false }
  }
  d.poses[poseId] = { firstAt: now.toISOString(), count: 1 }
  return { isNew: true }
}

/** A non-cancelled launch from a Big Leap's start toward its target — brave whether or not it lands. */
export function recordBigLeapTried(d: SaveData): void {
  if (!d.testMode) d.stats.bigLeapsTried++
}

/** She accepted a hint or tapped the ghost arc. */
export function recordBetaAsked(d: SaveData): void {
  if (!d.testMode) d.stats.betaAsked++
}

/** A hidden hold spotted on the way down stays found on this pitch. */
export function revealHold(d: SaveData, levelId: LevelId, holdId: string): void {
  if (d.testMode) return
  const p = ensurePitch(d, levelId)
  if (!p.revealedHolds.includes(holdId)) p.revealedHolds.push(holdId)
}

/** A crumbly ledge she has landed on is drawn cracked from then on. */
export function markCrumbleFound(d: SaveData, levelId: LevelId, ledgeId: string): void {
  if (d.testMode) return
  const p = ensurePitch(d, levelId)
  if (!p.foundCrumbles.includes(ledgeId)) p.foundCrumbles.push(ledgeId)
}

// ---------------------------------------------------------------------------------------------
// Looks Scary (Decision 14): the forecast is asked the first time a zone's moment is met; replays
// show the reveal only. If she left before the reveal, "How scary was it really?" is asked next time.

const clampScale = (n: number): number => (Number.isFinite(n) ? Math.max(0, Math.min(10, Math.round(n))) : 0)

/** True when this zone's Fear Forecast should be asked (never asked before). */
export function needsScaryForecast(d: SaveData, zone: ZoneId): boolean {
  return !d.looksScary[zone]
}

/** True when the forecast was given but "How scary was it really?" wasn't answered yet. */
export function needsScaryReally(d: SaveData, zone: ZoneId): boolean {
  const rec = d.looksScary[zone]
  return Boolean(rec && rec.really === null)
}

export function recordScaryForecast(d: SaveData, zone: ZoneId, forecast: number, now: Date): void {
  if (d.testMode || d.looksScary[zone]) return
  d.looksScary[zone] = { forecast: clampScale(forecast), really: null, at: now.toISOString() }
}

export function recordScaryReally(d: SaveData, zone: ZoneId, really: number): void {
  if (d.testMode) return
  const rec = d.looksScary[zone]
  if (rec && rec.really === null) rec.really = clampScale(really)
}

/** Every attempt ever: whippers + sends. */
export function totalAttempts(d: SaveData): number {
  return d.stats.whippers + d.stats.sends
}
