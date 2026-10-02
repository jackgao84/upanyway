/**
 * Deterministic climb physics. Pure functions, fixed timestep (TUNING.dt), no randomness.
 * The engine (game/engine.ts), the runtime ghost-beta and the level validator all step flights
 * through `stepFlight`, so "same input, same result" holds everywhere.
 *
 * World units, y-up. Body position = feet point (bottom centre of the climber).
 */
import { TUNING } from './tuning'
import { LEDGE_H, WORLD_W, type Hold, type Ledge, type Level, type LevelElement, type WindZone } from './types'

export interface Body {
  x: number
  y: number
  vx: number
  vy: number
}

/** Mutable per-run world state that physics reads. */
export interface WorldState {
  /** Ledge ids that have crumbled away (no collision). */
  crumbled: ReadonlySet<string>
  /** Hidden hold ids that have been revealed (collide normally). */
  revealed: ReadonlySet<string>
}

export type Contact =
  | { kind: 'land'; id: string; x: number; y: number }
  | { kind: 'catch'; id: string; x: number; y: number }
  | { kind: 'fall' }

export interface FlightContext {
  level: Level
  index: LevelIndex
  world: WorldState
  /** Element she launched from: holds are never re-caught by the launching hand. */
  launchId: string | null
  /** Below this altitude the rope catches her (last camp top − ropeSlack). */
  ropeLineY: number
}

const EMPTY: ReadonlySet<string> = new Set()
export const NO_WORLD: WorldState = { crumbled: EMPTY, revealed: EMPTY }

// ---------------------------------------------------------------------------------------------
// Level index: elements bucketed by altitude so each step only checks nearby elements.

const BUCKET = 100

export interface LevelIndex {
  byId: Map<string, LevelElement>
  ledges: Ledge[]
  holds: Hold[]
  /** bucket → element indices (ledges and holds separately) */
  ledgeBuckets: Map<number, Ledge[]>
  holdBuckets: Map<number, Hold[]>
}

const indexCache = new WeakMap<Level, LevelIndex>()

export function indexLevel(level: Level): LevelIndex {
  const cached = indexCache.get(level)
  if (cached) return cached
  const byId = new Map<string, LevelElement>()
  const ledges: Ledge[] = []
  const holds: Hold[] = []
  const ledgeBuckets = new Map<number, Ledge[]>()
  const holdBuckets = new Map<number, Hold[]>()
  const put = <T>(map: Map<number, T[]>, b: number, el: T) => {
    const list = map.get(b)
    if (list) list.push(el)
    else map.set(b, [el])
  }
  for (const el of level.elements) {
    if (byId.has(el.id)) throw new Error(`Duplicate element id ${el.id} in ${level.id}`)
    byId.set(el.id, el)
    if (el.kind === 'ledge') {
      ledges.push(el)
      const bottom = el.y - (el.h ?? LEDGE_H)
      for (let b = Math.floor(bottom / BUCKET); b <= Math.floor(el.y / BUCKET); b++) put(ledgeBuckets, b, el)
    } else {
      holds.push(el)
      put(holdBuckets, Math.floor(el.y / BUCKET), el)
    }
  }
  const index: LevelIndex = { byId, ledges, holds, ledgeBuckets, holdBuckets }
  indexCache.set(level, index)
  return index
}

// ---------------------------------------------------------------------------------------------
// Launch + wind

export function launchVelocity(angleDeg: number, power: number): { vx: number; vy: number } {
  const p = Math.max(0, Math.min(1, power))
  const a = (angleDeg * Math.PI) / 180
  const speed = p * TUNING.maxPower
  return { vx: Math.cos(a) * speed, vy: Math.sin(a) * speed }
}

function mod(a: number, n: number): number {
  return ((a % n) + n) % n
}

export function isGusting(zone: WindZone, t: number): boolean {
  return mod(t - zone.offset, zone.period) < zone.gust
}

/** Seconds until this zone's next gust starts (0 if gusting now). */
export function timeToGust(zone: WindZone, t: number): number {
  const phase = mod(t - zone.offset, zone.period)
  return phase < zone.gust ? 0 : zone.period - phase
}

export function windAccelAt(level: Level, x: number, y: number, t: number): number {
  const zones = level.wind
  if (!zones || zones.length === 0) return 0
  const cy = y + TUNING.bodyHeight / 2
  let ax = 0
  for (const z of zones) {
    if (x >= z.x && x <= z.x + z.w && cy >= z.y && cy <= z.y + z.h && isGusting(z, t)) {
      ax += z.dir * z.accel * TUNING.windScale
    }
  }
  return ax
}

// ---------------------------------------------------------------------------------------------
// Start positions

/** Where she stands on a ledge (feet point). */
export function standPoint(ledge: Ledge): { x: number; y: number } {
  const x = ledge.standX ?? ledge.x + ledge.w / 2
  return { x, y: ledge.y }
}

/** Feet point while hanging from a hold (hand at the hold centre). */
export function hangPoint(hold: Hold): { x: number; y: number } {
  return { x: hold.x, y: hold.y - TUNING.handOffset }
}

export function restPoint(el: LevelElement): { x: number; y: number } {
  return el.kind === 'ledge' ? standPoint(el) : hangPoint(el)
}

// ---------------------------------------------------------------------------------------------
// One fixed step of flight

function segPointDist2(ax: number, ay: number, bx: number, by: number, px: number, py: number): number {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0
  t = t < 0 ? 0 : t > 1 ? 1 : t
  const cx = ax + dx * t - px
  const cy = ay + dy * t - py
  return cx * cx + cy * cy
}

/**
 * Advance a flying body by one fixed step at global time `t` (the time at the START of the step).
 * Mutates `body`. Returns a contact if she landed, caught a hold, or dropped past the rope line.
 */
export function stepFlight(body: Body, ctx: FlightContext, t: number): Contact | null {
  const { dt, gravity, bodyHalfWidth: hw, bodyHeight: bh, handOffset, holdReach, landTolerance } = TUNING
  const { index, world } = ctx
  const px = body.x
  const py = body.y

  body.vx += windAccelAt(ctx.level, px, py, t) * dt
  body.vy -= gravity * dt
  body.x += body.vx * dt
  body.y += body.vy * dt

  // Side walls of the pitch: side contact stops horizontal motion.
  if (body.x - hw < 0) {
    body.x = hw
    body.vx = 0
  } else if (body.x + hw > WORLD_W) {
    body.x = WORLD_W - hw
    body.vx = 0
  }

  // Holds: the hand's swept path passing within reach of a hold catches it.
  const reach2 = holdReach * holdReach
  const hb = Math.floor((body.y + handOffset) / BUCKET)
  for (let b = hb - 1; b <= hb + 1; b++) {
    const holds = index.holdBuckets.get(b)
    if (!holds) continue
    for (const hold of holds) {
      if (hold.id === ctx.launchId) continue
      if (hold.hidden && !world.revealed.has(hold.id)) continue
      if (segPointDist2(px, py + handOffset, body.x, body.y + handOffset, hold.x, hold.y) <= reach2) {
        const p = hangPoint(hold)
        body.x = p.x
        body.y = p.y
        body.vx = 0
        body.vy = 0
        return { kind: 'catch', id: hold.id, x: p.x, y: p.y }
      }
    }
  }

  // Ledges: solid rectangles. Land on top; side contact stops vx; underside stops upward motion.
  const lb = Math.floor(body.y / BUCKET)
  for (let b = lb - 1; b <= lb + 1; b++) {
    const ledges = index.ledgeBuckets.get(b)
    if (!ledges) continue
    for (const ledge of ledges) {
      if (world.crumbled.has(ledge.id)) continue
      const L = ledge.x
      const R = ledge.x + ledge.w
      const T = ledge.y
      const B = ledge.y - (ledge.h ?? LEDGE_H)

      // Feet crossing the top surface while descending → land.
      if (body.vy <= 0 && py >= T && body.y <= T) {
        const span = py - body.y
        const f = span > 0 ? (py - T) / span : 0
        const cx = px + (body.x - px) * f
        if (cx >= L - landTolerance - hw && cx <= R + landTolerance + hw) {
          const x = Math.min(R, Math.max(L, cx))
          body.x = x
          body.y = T
          body.vx = 0
          body.vy = 0
          return { kind: 'land', id: ledge.id, x, y: T }
        }
      }

      // Box overlap → resolve against the side we came from.
      const overlaps = body.x + hw > L && body.x - hw < R && body.y + bh > B && body.y < T
      if (!overlaps) continue
      if (px + hw <= L) {
        body.x = L - hw
        body.vx = 0
      } else if (px - hw >= R) {
        body.x = R + hw
        body.vx = 0
      } else if (py + bh <= B) {
        body.y = B - bh
        if (body.vy > 0) body.vy = 0
      } else {
        // Already overlapping (numerical corner case): push out along the shallowest axis.
        const pushL = body.x + hw - L
        const pushR = R - (body.x - hw)
        const pushDown = body.y + bh - B
        const m = Math.min(pushL, pushR, pushDown)
        if (m === pushDown) {
          body.y = B - bh
          if (body.vy > 0) body.vy = 0
        } else if (m === pushL) {
          body.x = L - hw
          body.vx = 0
        } else {
          body.x = R + hw
          body.vx = 0
        }
      }
    }
  }

  if (body.y < ctx.ropeLineY) return { kind: 'fall' }
  return null
}

// ---------------------------------------------------------------------------------------------
// Whole-leap simulation (validator, solver, preview, ghost)

export interface LeapStart {
  /** Element she launches from. */
  fromId: string
  /** Global pitch clock at launch. */
  t0: number
}

export interface SimOptions {
  world?: WorldState
  ropeLineY: number
  /** Record the path (flattened x,y every `sampleEvery` steps). */
  record?: boolean
  sampleEvery?: number
  /** Stop early once the leap can no longer reach this element (solver speed-up). */
  targetId?: string
  /** Stop after this many seconds of flight (preview). */
  maxTime?: number
}

export interface SimResult {
  contact: Contact | null
  /** Flight time (s). */
  time: number
  path: number[]
}

export function startBody(level: Level, fromId: string, angleDeg: number, power: number): Body {
  const el = indexLevel(level).byId.get(fromId)
  if (!el) throw new Error(`Unknown element ${fromId} in ${level.id}`)
  const p = restPoint(el)
  const v = launchVelocity(angleDeg, power)
  return { x: p.x, y: p.y, vx: v.vx, vy: v.vy }
}

export function simulateLeap(
  level: Level,
  start: LeapStart,
  angleDeg: number,
  power: number,
  opts: SimOptions,
): SimResult {
  const index = indexLevel(level)
  const body = startBody(level, start.fromId, angleDeg, power)
  const ctx: FlightContext = {
    level,
    index,
    world: opts.world ?? NO_WORLD,
    launchId: start.fromId,
    ropeLineY: opts.ropeLineY,
  }
  const sampleEvery = opts.sampleEvery ?? 3
  const path: number[] = opts.record ? [body.x, body.y] : []
  const maxSteps = Math.ceil((opts.maxTime ?? TUNING.maxFlightTime) / TUNING.dt)
  const target = opts.targetId ? index.byId.get(opts.targetId) : undefined
  let t = start.t0
  for (let i = 1; i <= maxSteps; i++) {
    const contact = stepFlight(body, ctx, t)
    t += TUNING.dt
    if (opts.record && (i % sampleEvery === 0 || contact)) path.push(body.x, body.y)
    if (contact) return { contact, time: i * TUNING.dt, path }
    if (target && body.vy < 0) {
      // Descending and already below what could still reach the target → it's a miss.
      const limit = target.kind === 'ledge' ? target.y : target.y - TUNING.handOffset - TUNING.holdReach
      if (body.y < limit - 1) return { contact: null, time: i * TUNING.dt, path }
    }
  }
  if (opts.maxTime !== undefined) return { contact: null, time: maxSteps * TUNING.dt, path }
  return { contact: { kind: 'fall' }, time: maxSteps * TUNING.dt, path }
}

/** Reference flight time used by the dotted preview: time to come back to launch height. */
export function referenceFlightTime(angleDeg: number, power: number): number {
  const { vy } = launchVelocity(angleDeg, power)
  return Math.max((2 * Math.max(0, vy)) / TUNING.gravity, TUNING.previewMinTime)
}

/** The rope line for a camp: falls below this are caught. */
export function ropeLineFor(camp: Ledge): number {
  return camp.y - TUNING.ropeSlack
}
