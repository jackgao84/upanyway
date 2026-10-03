/**
 * Where each stone sits on the cairn. Pure and deterministic: the same stones in the same order
 * always make the same cairn, and adding a stone never moves the ones already there (stone i's spot
 * depends only on stones 0…i). No DOM.
 *
 * Each stone looks for the lowest nook on the pile, preferring spots near the middle (a nook further
 * out has to be lower by SLOPE × the distance to win), then leans the way its support tips it. So the
 * first stones make a little stack, later ones build a pointed mound around it like a real trail
 * cairn, and once the mound is as wide as REACH_MAX it grows upward (the view scrolls). A tiny
 * seeded nudge per stone keeps it from looking machine-made. Sizes come from stoneLook(id) — never
 * from anything she answered.
 *
 * Units: "cairn units" = stone units. x across (0 = the middle of the hilltop), y UP (0 = the top of
 * the hill). `rot` is counter-clockwise in this y-up frame (draw with −rot on a y-down canvas).
 */
import { stoneLook } from '../../game/art/stones'

export type StoneKindRef = 'brave' | 'letter'

export interface StoneInput {
  id: string
  kind: StoneKindRef
}

export interface PlacedStone {
  id: string
  kind: StoneKindRef
  /** Position in the cairn order (0 = the first stone). */
  index: number
  /** Centre (cairn units, y up). */
  x: number
  y: number
  /** Lean in radians (counter-clockwise, y up). */
  rot: number
  w: number
  h: number
}

export interface CairnLayout {
  stones: PlacedStone[]
  /** Highest point of the pile, cairn units (0 when empty). */
  top: number
  /** Outer edges of the pile at the bottom (±24 when empty: the spot the first stone goes). */
  left: number
  right: number
}

/** The hilltop is a gentle dome: radius of curvature in cairn units. */
export const HILL_R = 760
/** Half-width of the ground the heightmap covers. */
const XMAX = 440
const STEP = 2
const SAMPLES = Math.round((XMAX * 2) / STEP) + 1
/** How far from the middle a stone's centre may go: opens up as the cairn grows, then stops. */
const REACH_MIN = 30
const REACH_K = 28
const REACH_MAX = 165
/** How much a well-bridged spot is worth (× half-height per unit of support span). */
const BOND = 0.9
/** Tall cairns taper: the allowed reach shrinks to TAPER_MIN × REACH_MAX at TAPER_H units up. */
const TAPER_H = 1400
const TAPER_MIN = 0.28
/** How much lower a nook further out must be to win (height per unit out): the mound's steepness. */
const SLOPE = 0.72
/** Collision is a touch smaller than the drawing, so stones look nestled, not perched. */
const SHRINK_W = 0.9
const SHRINK_H = 0.86
/** Exponents of the stone profiles: flatter bottoms, rounder tops. */
const P_BOTTOM = 2.6
const P_TOP = 2.1
const MAX_LEAN = 0.2
/** A stone rolls off when everything holding it up is further than this (× half-width) to one side. */
const HANG = 0.3
/** How close (units) counts as touching. */
const CONTACT = 1.5
const ROLL_STEPS = 120
const GOLDEN = 0.6180339887498949

/** Height of the hill at x (y up; 0 at the top). */
export function hillY(x: number): number {
  return -(x * x) / (2 * HILL_R)
}

function profile(u: number, p: number): number {
  const a = Math.min(1, Math.abs(u))
  return Math.pow(1 - Math.pow(a, p), 1 / p)
}

class Ground {
  readonly h = new Float64Array(SAMPLES)

  constructor() {
    for (let i = 0; i < SAMPLES; i++) this.h[i] = hillY(-XMAX + i * STEP)
  }

  at(x: number): number {
    const i = Math.round((x + XMAX) / STEP)
    if (i < 0 || i >= SAMPLES) return hillY(x)
    return this.h[i]
  }

  /** Where a stone's centre comes to rest if let down at cx (half-sizes a, b). */
  rest(cx: number, a: number, b: number): number {
    let y = -Infinity
    for (let dx = -a; dx <= a; dx += STEP) {
      const v = this.at(cx + dx) + b * profile(dx / a, P_BOTTOM)
      if (v > y) y = v
    }
    return y
  }

  /** Highest support under one side of the stone: [from, to] as fractions of the half-width. */
  support(cx: number, a: number, b: number, from: number, to: number): number {
    let y = -Infinity
    for (let u = from; u <= to + 1e-9; u += STEP / a) {
      const v = this.at(cx + u * a) + b * profile(u, P_BOTTOM)
      if (v > y) y = v
    }
    return y
  }

  /**
   * Where a stone resting at height y touches what's under it: the leftmost and rightmost contact
   * points, as fractions of its half-width (−1…1).
   */
  contacts(cx: number, a: number, b: number, y: number): [number, number] {
    let lo = Infinity
    let hi = -Infinity
    for (let dx = -a; dx <= a; dx += STEP) {
      const v = this.at(cx + dx) + b * profile(dx / a, P_BOTTOM)
      if (v >= y - CONTACT) {
        lo = Math.min(lo, dx / a)
        hi = Math.max(hi, dx / a)
      }
    }
    return [lo, hi]
  }

  /** Raise the ground to the stone's top. */
  add(cx: number, cy: number, a: number, b: number, rot: number): void {
    const slope = Math.tan(rot)
    for (let dx = -a; dx <= a; dx += STEP) {
      const i = Math.round((cx + dx + XMAX) / STEP)
      if (i < 0 || i >= SAMPLES) continue
      const top = cy + dx * slope + b * profile(dx / a, P_TOP)
      if (top > this.h[i]) this.h[i] = top
    }
  }
}

interface Settled {
  x: number
  y: number
  rot: number
}

/**
 * Let a stone down: it nestles into the best nook within `reach` of the middle — the lowest, once
 * `slope` × its distance from `centre` is added — then leans.
 */
function settle(
  ground: Ground,
  centre: number,
  reach: number,
  slope: number,
  w: number,
  h: number,
  lean: number,
): Settled {
  const a = (w / 2) * SHRINK_W
  const b = (h / 2) * SHRINK_H
  const lo = Math.max(-XMAX + a, centre - reach)
  const hi = Math.min(XMAX - a, centre + reach)
  let bestX = Math.max(lo, Math.min(hi, centre))
  let bestScore = Infinity
  // Snap the search to the ground's grid so every stone sees the same samples.
  const start = lo + ((((centre - lo) % STEP) + STEP) % STEP) - STEP
  for (let cx = start; cx <= hi + 1e-9; cx += STEP) {
    if (cx < lo - 1e-9) continue
    const y = ground.rest(cx, a, b)
    // A tall cairn tapers: the higher a stone sits, the closer to the middle it must be.
    if (Math.abs(cx - centre) > taper(y) && Math.abs(cx - centre) > a) continue
    // Brick bond: a stone bridging two below (support on both sides) beats one perched on a single top.
    const [c0, c1] = ground.contacts(cx, a, b, y)
    const span = Number.isFinite(c0) ? Math.max(0, c1 - c0) : 0
    const score = y + Math.abs(cx - centre) * slope - span * b * BOND
    if (score < bestScore - 1e-9) {
      bestScore = score
      bestX = cx
    }
  }
  // A stone held up on one side only (its middle isn't over anything) tips off toward the other
  // side and rolls until it settles into a nook it can sit in.
  for (let k = 0; k < ROLL_STEPS; k++) {
    const y0 = ground.rest(bestX, a, b)
    const [c0, c1] = ground.contacts(bestX, a, b, y0)
    let dir = 0
    if (c0 > HANG) dir = -1
    else if (c1 < -HANG) dir = 1
    const next = bestX + dir * STEP
    // It may roll a little past the reach (a stone tumbling to the foot), never far out.
    if (!dir || next < Math.max(-XMAX + a, lo - a) || next > Math.min(XMAX - a, hi + a)) break
    bestX = next
  }
  const y = ground.rest(bestX, a, b)
  // The side with the bigger gap underneath tips down a little.
  const gapL = y - ground.support(bestX, a, b, -1, -0.3)
  const gapR = y - ground.support(bestX, a, b, 0.3, 1)
  const tip = Math.max(-MAX_LEAN, Math.min(MAX_LEAN, (gapL - gapR) / (1.4 * a)))
  const rot = tip + lean
  // Leaning drops the centre a touch onto the low side.
  const sink = Math.min(Math.abs(gapL - gapR) * 0.25, b * 0.2)
  ground.add(bestX, y - sink, a, b, rot)
  return { x: bestX, y: y - sink, rot }
}

/** How far from the middle a stone resting at height y may sit (a tall cairn tapers). */
function taper(y: number): number {
  return REACH_MAX * Math.max(TAPER_MIN, 1 - y / TAPER_H)
}

/** How far from the middle stone i's centre may go. */
export function reachFor(i: number): number {
  return Math.min(REACH_MAX, REACH_MIN + REACH_K * Math.sqrt(i))
}

/** A small nudge to where stone i prefers to be (golden-ratio sequence: no two alike in a row). */
function nudge(i: number): number {
  const f = (0.5 + i * GOLDEN) % 1
  return (2 * f - 1) * 9
}

/** The cairn: every placed stone, in cairn order. */
export function layoutCairn(stones: readonly StoneInput[]): CairnLayout {
  const ground = new Ground()
  const out: PlacedStone[] = []
  let top = 0
  let left = Infinity
  let right = -Infinity
  stones.forEach((s, index) => {
    const look = stoneLook(s.id)
    const p = settle(ground, nudge(index), reachFor(index), SLOPE, look.w, look.h, look.lean)
    out.push({ id: s.id, kind: s.kind, index, x: p.x, y: p.y, rot: p.rot, w: look.w, h: look.h })
    top = Math.max(top, p.y + look.h / 2)
    left = Math.min(left, p.x - look.w / 2)
    right = Math.max(right, p.x + look.w / 2)
  })
  if (!out.length) return { stones: out, top: 0, left: -24, right: 24 }
  return { stones: out, top, left, right }
}

/**
 * Waiting stones (over the daily cap) sit on the ground beside the pile, starting at `fromX`: a
 * little row, then a small heap. Same rules, their own ground.
 */
export function layoutWaiting(stones: readonly StoneInput[], fromX: number): PlacedStone[] {
  const ground = new Ground()
  return stones.map((s, index) => {
    const look = stoneLook(s.id)
    // Two side by side, one on top between them, then the next pair further out.
    const col = [0, 1, 0.5, 2, 1.5, 1][index % 6] + Math.floor(index / 6) * 0.5
    const p = settle(ground, fromX + col * 46, 6, 0.3, look.w, look.h, look.lean)
    return { id: s.id, kind: s.kind, index, x: p.x, y: p.y, rot: p.rot, w: look.w, h: look.h }
  })
}
