/**
 * Leap solver: grid-searches angle × power with the REAL physics (simulateLeap) and finds a
 * forgiving input — one that still lands when the angle is off by ±angleTol and the power by
 * ±powerTol. Used by the level validator (tests/levels/validator.test.ts) to prove every route
 * step, and to precompute the ghost-beta arcs saved in solutions.json.
 *
 * The brief's thresholds (≤ 85% power, ±4°, ±6% power, ±0.25 s wind timing) are passed in as
 * `Thresholds` by the validator test, which keeps them as literal constants. Never loosen them to make a
 * level pass: fix the level.
 */
import { TUNING } from './tuning'
import { indexLevel, simulateLeap, type WorldState, NO_WORLD } from './physics'
import type { Level, StepSolution } from './types'

export interface Thresholds {
  /** Best input must be at or below this fraction of max power. */
  maxPower: number
  /** The input must still land at ± this many degrees… */
  angleTol: number
  /** …and ± this much power (absolute fraction of max power). */
  powerTol: number
  /** Wind steps: must still land if launched this many seconds early or late. */
  windTimingTol: number
}

/** The smallest leap a player can release on the smallest screen (shorter drags cancel). */
export const MIN_POWER = Math.ceil((TUNING.cancelPx / TUNING.maxDragPxMin) * 100) / 100

/** Search resolution (not a tolerance). */
const S = {
  angleMin: -20,
  angleMax: 200,
  angleStep: 1,
  powerStep: 0.01,
  windTimeStep: 0.05,
}

export interface Grid {
  angles: number[]
  powers: number[]
  /** ok[ai * powers.length + pj] = 1 when that input lands on the target. */
  ok: Uint8Array
}

export function gridAxes(th: Thresholds): { angles: number[]; powers: number[] } {
  const angles: number[] = []
  for (let a = S.angleMin; a <= S.angleMax + 1e-9; a += S.angleStep) angles.push(Math.round(a * 100) / 100)
  const powers: number[] = []
  const powerMax = Math.min(1, th.maxPower + th.powerTol)
  const n = Math.round((powerMax - MIN_POWER) / S.powerStep)
  for (let j = 0; j <= n; j++) powers.push(Math.round((MIN_POWER + j * S.powerStep) * 1000) / 1000)
  return { angles, powers }
}

export interface SolveContext {
  level: Level
  fromId: string
  toId: string
  ropeLineY: number
  /** Each world variant must succeed (e.g. hidden holds hidden AND revealed). */
  worlds?: WorldState[]
  th: Thresholds
}

/** Does this exact input land CLEANLY (no side/underside bumps) on the target in every world variant? */
export function lands(ctx: SolveContext, angle: number, power: number, t0: number): boolean {
  const worlds = ctx.worlds && ctx.worlds.length > 0 ? ctx.worlds : [NO_WORLD]
  for (const world of worlds) {
    const r = simulateLeap(ctx.level, { fromId: ctx.fromId, t0 }, angle, power, {
      world,
      ropeLineY: ctx.ropeLineY,
      targetId: ctx.toId,
      cleanOnly: true,
    })
    const c = r.contact
    if (!c || c.kind === 'fall' || c.id !== ctx.toId || r.bumped) return false
  }
  return true
}

export function buildGrid(ctx: SolveContext, t0: number): Grid {
  const { angles, powers } = gridAxes(ctx.th)
  const ok = new Uint8Array(angles.length * powers.length)
  const from = indexLevel(ctx.level).byId.get(ctx.fromId)
  const to = indexLevel(ctx.level).byId.get(ctx.toId)
  if (!from || !to) throw new Error(`Unknown step ${ctx.fromId} → ${ctx.toId} in ${ctx.level.id}`)
  for (let ai = 0; ai < angles.length; ai++) {
    for (let pj = 0; pj < powers.length; pj++) {
      ok[ai * powers.length + pj] = lands(ctx, angles[ai], powers[pj], t0) ? 1 : 0
    }
  }
  return { angles, powers, ok }
}

/** Summed-area table for O(1) "is this whole box successful?" queries. */
class Boxes {
  private sat: Int32Array
  constructor(private grid: Grid) {
    const NA = grid.angles.length
    const NP = grid.powers.length
    this.sat = new Int32Array((NA + 1) * (NP + 1))
    for (let i = 0; i < NA; i++) {
      let row = 0
      for (let j = 0; j < NP; j++) {
        row += grid.ok[i * NP + j]
        this.sat[(i + 1) * (NP + 1) + (j + 1)] = this.sat[i * (NP + 1) + (j + 1)] + row
      }
    }
  }
  /** All cells in [ai-ra, ai+ra] × [pj-rp, pj+rp] succeed (and the box is inside the grid). */
  all(ai: number, pj: number, ra: number, rp: number): boolean {
    const NA = this.grid.angles.length
    const NP = this.grid.powers.length
    const i0 = ai - ra
    const i1 = ai + ra
    const j0 = pj - rp
    const j1 = pj + rp
    if (i0 < 0 || j0 < 0 || i1 >= NA || j1 >= NP) return false
    const W = NP + 1
    const sum =
      this.sat[(i1 + 1) * W + (j1 + 1)] - this.sat[i0 * W + (j1 + 1)] - this.sat[(i1 + 1) * W + j0] + this.sat[i0 * W + j0]
    return sum === (i1 - i0 + 1) * (j1 - j0 + 1)
  }
}

export interface Candidate {
  angle: number
  power: number
  /** Forgiveness scale: the box ±(angleTol·s, powerTol·s) all lands. s ≥ 1 means forgiving. */
  scale: number
}

function radii(th: Thresholds): { RA: number; RP: number } {
  return { RA: Math.round(th.angleTol / S.angleStep), RP: Math.round(th.powerTol / S.powerStep) }
}

/** Forgiving inputs at ≤ th.maxPower, best first (most forgiving, then lowest power). */
export function forgivingCandidates(grid: Grid, th: Thresholds, limit = 8): Candidate[] {
  const { RA, RP } = radii(th)
  const boxes = new Boxes(grid)
  const NP = grid.powers.length
  const out: Candidate[] = []
  for (let ai = 0; ai < grid.angles.length; ai++) {
    for (let pj = 0; pj < NP; pj++) {
      if (grid.powers[pj] > th.maxPower + 1e-9) continue
      if (!grid.ok[ai * NP + pj]) continue
      if (!boxes.all(ai, pj, RA, RP)) continue
      let scale = 1
      for (let s = 1.25; s <= 4; s += 0.25) {
        if (boxes.all(ai, pj, Math.round(RA * s), Math.round(RP * s))) scale = s
        else break
      }
      out.push({ angle: grid.angles[ai], power: grid.powers[pj], scale })
    }
  }
  out.sort((a, b) => b.scale - a.scale || a.power - b.power || Math.abs(a.angle - 90) - Math.abs(b.angle - 90))
  return out.slice(0, limit)
}

/** The whole ±tolerance box around a candidate lands at launch time t0. */
export function boxLands(ctx: SolveContext, c: Candidate, t0: number): boolean {
  const { RA, RP } = radii(ctx.th)
  for (let da = -RA; da <= RA; da++) {
    for (let dp = -RP; dp <= RP; dp++) {
      const angle = c.angle + da * S.angleStep
      const power = Math.round((c.power + dp * S.powerStep) * 1000) / 1000
      if (!lands(ctx, angle, power, t0)) return false
    }
  }
  return true
}

export interface StepReport {
  solution: StepSolution | null
  /** Fraction of the searched input space that lands (difficulty indicator, not asserted). */
  successFraction: number
  windTimed: boolean
}

function round(n: number, d = 3): number {
  const f = 10 ** d
  return Math.round(n * f) / f
}

/** The common gust period of a level's wind zones (validator asserts they share one). */
export function windPeriod(level: Level): number | null {
  if (!level.wind || level.wind.length === 0) return null
  return level.wind[0].period
}

/** Launch-time candidates for wind levels: calm moments first (just after a gust has passed). */
export function launchTimes(level: Level, th: Thresholds): number[] {
  const period = windPeriod(level)
  if (period === null) return [0]
  const zone = level.wind![0]
  const gustEnd = zone.offset + zone.gust
  const times: number[] = []
  const n = Math.round(period / S.windTimeStep)
  for (let k = 0; k < n; k++) {
    const t = round(gustEnd + th.windTimingTol + k * S.windTimeStep, 4)
    times.push(round((((t % period) + period) % period) + period * 2, 4))
  }
  return times
}

/**
 * Solve one route step. For wind levels, search launch times (calm first) and require the whole
 * forgiving box to also land if she launches up to ±windTimingTol early/late.
 */
export function solveStep(ctx: SolveContext): StepReport {
  const times = launchTimes(ctx.level, ctx.th)
  const windTimed = times.length > 1
  let firstFraction = -1
  for (const t0 of times) {
    const grid = buildGrid(ctx, t0)
    if (firstFraction < 0) firstFraction = grid.ok.reduce((a, b) => a + b, 0) / grid.ok.length
    const candidates = forgivingCandidates(grid, ctx.th)
    for (const c of candidates) {
      if (windTimed) {
        let robust = true
        const k = Math.round(ctx.th.windTimingTol / S.windTimeStep)
        for (let j = -k; j <= k && robust; j++) {
          if (j === 0) continue
          robust = boxLands(ctx, c, round(t0 + j * S.windTimeStep, 4))
        }
        if (!robust) continue
      }
      return {
        solution: {
          from: ctx.fromId,
          to: ctx.toId,
          angle: c.angle,
          power: c.power,
          launchTime: t0,
          marginAngle: round(ctx.th.angleTol * c.scale, 2),
          marginPower: round(ctx.th.powerTol * c.scale, 3),
        },
        successFraction: round(firstFraction, 4),
        windTimed,
      }
    }
  }
  return { solution: null, successFraction: round(Math.max(0, firstFraction), 4), windTimed }
}

/**
 * Any landing input from `fromId` to `toId` (not necessarily forgiving): used for ghost arcs from
 * off-route spots. Returns the most central successful cell, or null.
 */
export function solveAnyStep(ctx: SolveContext, t0 = 0): StepSolution | null {
  const grid = buildGrid(ctx, t0)
  const forgiving = forgivingCandidates(grid, ctx.th, 1)
  if (forgiving.length > 0) {
    const c = forgiving[0]
    return {
      from: ctx.fromId,
      to: ctx.toId,
      angle: c.angle,
      power: c.power,
      launchTime: t0,
      marginAngle: round(ctx.th.angleTol * c.scale, 2),
      marginPower: round(ctx.th.powerTol * c.scale, 3),
    }
  }
  // Fall back to the successful cell with the most successful neighbours.
  const NP = grid.powers.length
  let best: { ai: number; pj: number; n: number } | null = null
  for (let ai = 0; ai < grid.angles.length; ai++) {
    for (let pj = 0; pj < NP; pj++) {
      if (!grid.ok[ai * NP + pj] || grid.powers[pj] > ctx.th.maxPower) continue
      let n = 0
      for (let da = -2; da <= 2; da++)
        for (let dp = -2; dp <= 2; dp++) {
          const i = ai + da
          const j = pj + dp
          if (i >= 0 && j >= 0 && i < grid.angles.length && j < NP) n += grid.ok[i * NP + j]
        }
      if (!best || n > best.n) best = { ai, pj, n }
    }
  }
  if (!best) return null
  return {
    from: ctx.fromId,
    to: ctx.toId,
    angle: grid.angles[best.ai],
    power: grid.powers[best.pj],
    launchTime: t0,
    marginAngle: 0,
    marginPower: 0,
  }
}
