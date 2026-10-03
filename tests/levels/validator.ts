/**
 * Level validator: proves, with the REAL physics, that every step of every pitch's required route
 * has a forgiving leap, plus the structural rules from PROGRESS.md (camps, Looks Scary, hidden holds,
 * Big Leap previews, crumble timing, wind). Writes the solutions it finds.
 *
 * The thresholds below come straight from the brief. They are literals ON PURPOSE and are not imported
 * from tuning.ts: changing them (or skipping a pitch) to get green is rejected. Fix the LEVEL instead.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { TUNING } from '../../src/game/tuning'
import {
  indexLevel,
  NO_WORLD,
  referenceFlightTime,
  restPoint,
  simulateLeap,
  type WorldState,
} from '../../src/game/physics'
import { launchTimes, MIN_POWER, solveAnyStep, solveStep, type SolveContext, type Thresholds } from '../../src/game/solver'
import { hashLevel, type LevelSolutions } from '../../src/game/levels/solutions'
import type { Hold, Ledge, Level, LevelElement, StepSolution, ZoneId } from '../../src/game/types'

// ---- The brief's numbers. Do not edit. ------------------------------------------------------------
export const TH: Thresholds = {
  maxPower: 0.85, // a solution must exist at ≤ 85% of max power
  angleTol: 4, // …that still lands at ±4°
  powerTol: 0.06, // …and ±6% power
  windTimingTol: 0.25, // wind steps: and if she launches 0.25 s early or late
}
/** Seconds she needs to aim after settling on a crumbly ledge; must fit inside the crumble delay. */
export const AIM_ALLOWANCE = 1.2
/** Big Leap previews must stop at least this far short of the landing (she can't see it). */
export const BIG_LEAP_PREVIEW_GAP = 60
// ----------------------------------------------------------------------------------------------------

const SOLUTIONS_DIR = join(__dirname, '../../src/game/levels/solutions')

export const ZONE_OF_INDEX: ZoneId[] = [
  'meadow',
  'meadow', 'meadow', 'meadow',
  'hollow', 'hollow', 'hollow',
  'crumble', 'crumble', 'crumble',
  'ridge', 'ridge', 'ridge',
  'cloud', 'cloud', 'cloud',
  'summit',
]
export const LOOKS_SCARY_PITCHES = ['p02', 'p05', 'p08', 'p11', 'p14']
const LOOKS_SCARY_KIND: Partial<Record<ZoneId, string>> = {
  meadow: 'bigleap',
  hollow: 'eyes',
  crumble: 'rumble',
  ridge: 'bridge',
  cloud: 'shadow',
}

export interface LevelReport {
  id: string
  errors: string[]
  solutions: LevelSolutions
  stepFractions: number[]
}

function isLedge(el: LevelElement | undefined): el is Ledge {
  return !!el && el.kind === 'ledge'
}
function isHold(el: LevelElement | undefined): el is Hold {
  return !!el && el.kind === 'hold'
}

function inWind(level: Level, x: number, y: number): boolean {
  return (level.wind ?? []).some((z) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h)
}

/** Rope line for route step i: the last route camp at or before route[i]. */
export function ropeLineForStep(level: Level, i: number): number {
  const idx = indexLevel(level)
  for (let k = i; k >= 0; k--) {
    const el = idx.byId.get(level.route[k])
    if (isLedge(el) && el.camp) return el.y - TUNING.ropeSlack
  }
  return -Infinity
}

function worldsFor(level: Level): WorldState[] {
  const hidden = level.elements.filter((e) => isHold(e) && e.hidden).map((e) => e.id)
  if (hidden.length === 0) return [NO_WORLD]
  return [NO_WORLD, { crumbled: new Set(), revealed: new Set(hidden) }]
}

function structural(level: Level, errors: string[]): void {
  const idx = indexLevel(level) // throws on duplicate ids
  const isPitch = level.id !== 'lesson'
  const route = level.route
  if (route.length < 2) errors.push('route needs at least 2 elements')
  for (const id of route) if (!idx.byId.has(id)) errors.push(`route id ${id} does not exist`)
  if (new Set(route).size !== route.length) errors.push('route repeats an element')

  const first = idx.byId.get(route[0])
  if (!isLedge(first) || !first.camp) errors.push(`route[0] (${route[0]}) must be a camp ledge`)
  else if (first.y > 100) errors.push(`route[0] must be at the bottom (y ≤ 100), got ${first.y}`)

  const top = idx.byId.get(route[route.length - 1])
  if (!isLedge(top)) errors.push('the pitch top must be a ledge')
  else if (!top.camp) errors.push('the pitch top must be marked as a camp (it anchors the rope)')

  if (isPitch) {
    if (level.index < 1 || level.index > 16) errors.push(`bad index ${level.index}`)
    const expectedId = `p${String(level.index).padStart(2, '0')}`
    if (level.id !== expectedId) errors.push(`id ${level.id} should be ${expectedId}`)
    if (level.zone !== ZONE_OF_INDEX[level.index]) errors.push(`zone ${level.zone} should be ${ZONE_OF_INDEX[level.index]}`)
    if (level.height < 1800 || level.height > 2400) errors.push(`height ${level.height} not in 1800–2400 (3–4 screens)`)
    if (isLedge(top) && top.y < level.height - 150) errors.push(`top ${top.id} y=${top.y} should be ≥ height − 150`)
    // A camp at least every screen along the route (including last camp → top).
    let lastCampY: number | null = null
    for (const id of route) {
      const el = idx.byId.get(id)
      if (isLedge(el) && el.camp) {
        if (lastCampY !== null && el.y - lastCampY > 600) errors.push(`camps ${lastCampY}→${el.y} more than 600 apart (before ${id})`)
        lastCampY = el.y
      }
    }
  }

  for (const el of level.elements) {
    if (el.x < 0 || el.x > 400) errors.push(`${el.id} x out of bounds`)
    if (isLedge(el)) {
      if (el.x + el.w > 400) errors.push(`${el.id} extends past the right wall`)
      if (el.camp && (el.crumble || inWind(level, el.x + el.w / 2, el.y + 20))) errors.push(`camp ${el.id} must not crumble or sit in wind`)
      if (el.crumble && el.bridge) errors.push(`${el.id}: a bridge never crumbles`)
    }
    if (isHold(el) && el.hidden && route.includes(el.id)) errors.push(`hidden hold ${el.id} is on the required route`)
  }

  const wind = level.wind ?? []
  if (wind.length > 0 && new Set(wind.map((z) => z.period)).size > 1) errors.push('all wind zones in a level must share one period')
  for (const z of wind) if (z.gust >= z.period) errors.push(`wind ${z.id}: gust must be shorter than period (needs a calm)`)

  // Big Leaps: consecutive route steps; none before p02.
  for (const bl of level.bigLeaps ?? []) {
    const i = route.indexOf(bl.from)
    if (i < 0 || route[i + 1] !== bl.to) errors.push(`big leap ${bl.from}→${bl.to} must be a route step`)
  }
  if ((level.id === 'lesson' || level.id === 'p01') && (level.bigLeaps ?? []).length > 0) errors.push('no Big Leaps before p02')

  // Looks Scary: exactly on the middle pitch of zones 1–5, kind matches zone, forecast camp before reveal.
  const shouldHave = LOOKS_SCARY_PITCHES.includes(level.id)
  if (shouldHave && !level.looksScary) errors.push('this pitch must have the zone’s Looks Scary moment')
  if (!shouldHave && level.looksScary) errors.push('Looks Scary belongs only on p02/p05/p08/p11/p14')
  if (level.looksScary) {
    const ls = level.looksScary
    if (LOOKS_SCARY_KIND[level.zone] !== ls.kind) errors.push(`looksScary kind ${ls.kind} doesn't match zone ${level.zone}`)
    const fi = route.indexOf(ls.forecastAt)
    const ri = route.indexOf(ls.revealAt)
    const f = idx.byId.get(ls.forecastAt)
    if (fi < 0 || ri < 0 || fi >= ri) errors.push('looksScary forecastAt must come before revealAt on the route')
    if (!isLedge(f) || !f.camp || f.crumble) errors.push('looksScary forecastAt must be a (non-crumble) camp')
    if (ls.kind === 'bigleap' && !(level.bigLeaps ?? []).some((b) => b.from === ls.forecastAt && b.to === ls.revealAt)) {
      errors.push('Meadow’s Looks Scary must be that pitch’s Big Leap')
    }
    if (ls.kind === 'bridge') {
      const r = idx.byId.get(ls.revealAt)
      if (!isLedge(r) || !r.bridge) errors.push('Gusty Ridge’s Looks Scary reveal must be the rope bridge ledge')
    }
  }

  // Crumble launches need time to aim.
  if (level.elements.some((e) => isLedge(e) && e.crumble)) {
    if (!(TUNING.settleTime + AIM_ALLOWANCE < TUNING.crumbleDelay)) {
      errors.push(`crumbleDelay ${TUNING.crumbleDelay}s leaves less than ${AIM_ALLOWANCE}s to aim`)
    }
  }
}

function pathTouchesWind(level: Level, path: number[]): boolean {
  for (let i = 0; i < path.length; i += 2) if (inWind(level, path[i], path[i + 1] + TUNING.bodyHeight / 2)) return true
  return false
}

function previewTime(level: Level, s: StepSolution): number {
  const big = (level.bigLeaps ?? []).some((b) => b.from === s.from && b.to === s.to)
  const fraction = big ? TUNING.bigLeapPreviewFraction : TUNING.previewFraction
  return fraction * referenceFlightTime(s.angle, s.power)
}

function checkSolutionExtras(level: Level, s: StepSolution, i: number, errors: string[]): void {
  const idx = indexLevel(level)
  const from = idx.byId.get(s.from)
  const to = idx.byId.get(s.to)!
  const sim = simulateLeap(level, { fromId: s.from, t0: s.launchTime }, s.angle, s.power, {
    ropeLineY: ropeLineForStep(level, i),
    record: true,
    sampleEvery: 1,
  })
  const pt = previewTime(level, s)
  if (sim.time <= pt) errors.push(`step ${s.from}→${s.to}: the preview (${pt.toFixed(2)}s) would show the landing (${sim.time.toFixed(2)}s)`)
  const big = (level.bigLeaps ?? []).some((b) => b.from === s.from && b.to === s.to)
  if (big) {
    const steps = Math.floor(pt / TUNING.dt)
    const k = Math.min(steps, sim.path.length / 2 - 1)
    const px = sim.path[k * 2]
    const py = sim.path[k * 2 + 1]
    const dist = isLedge(to)
      ? Math.hypot(Math.max(to.x - px, px - (to.x + to.w), 0), py - to.y)
      : Math.hypot(px - to.x, py + TUNING.handOffset - to.y)
    if (dist < BIG_LEAP_PREVIEW_GAP) errors.push(`big leap ${s.from}→${s.to}: preview ends only ${dist.toFixed(0)} from the landing`)
  }
  if (isLedge(from) && from.crumble && pathTouchesWind(level, sim.path)) {
    errors.push(`step ${s.from}→${s.to}: a crumble launch must not need wind timing`)
  }
}

/**
 * A Big Leap must be the way on: from its take-off, no FORGIVING leap may reach anything else at or
 * above the take-off (other than the Big Leap's own landing). A pinpoint lucky shot is fine; an easy
 * way around the moment is not.
 */
function bigLeapBypass(level: Level, from: string, to: string, i: number): string | null {
  const idx = indexLevel(level)
  const fromY = restPoint(idx.byId.get(from)!).y
  const rope = ropeLineForStep(level, i)
  const candidates = new Set<string>()
  for (const world of worldsFor(level)) {
    for (let a = -20; a <= 200; a += 2) {
      for (let p = MIN_POWER; p <= 1.0001; p += 0.02) {
        const c = simulateLeap(level, { fromId: from, t0: 0 }, a, p, { world, ropeLineY: rope }).contact
        if (!c || c.kind === 'fall' || c.id === from || c.id === to) continue
        if (restPoint(idx.byId.get(c.id)!).y >= fromY - TUNING.slipDrop) candidates.add(c.id)
      }
    }
  }
  for (const id of candidates) {
    const r = solveStep({ level, fromId: from, toId: id, ropeLineY: rope, worlds: worldsFor(level), th: TH })
    if (r.solution) return `${id} (forgiving: angle ${r.solution.angle}, power ${r.solution.power})`
  }
  return null
}

/**
 * Ways to skip route element `k` entirely: a FORGIVING leap from any route element before it that lands
 * on a route element after it. Used for the Fear Forecast camp (she must stand on it to be asked) and
 * for each Big Leap's take-off (the leap can't be dodged from below either). Lucky pinpoint shots are
 * allowed; easy ways around are not. Returns "from → to" for each, empty when `k` can't be skipped.
 */
export function routeSkips(level: Level, k: number): string[] {
  const route = level.route
  const worlds = worldsFor(level)
  // A forgiving wind-timed solution lands across ±0.25 s, so sampling launch times every 0.25 s meets it.
  const times = launchTimes(level, TH).filter((_, n) => n % 5 === 0)
  const angles: number[] = []
  for (let a = -20; a <= 200; a += 2) angles.push(a)
  const powers: number[] = []
  for (let p = MIN_POWER; p <= TH.maxPower + TH.powerTol + 1e-9; p += 0.02) powers.push(p)
  const NP = powers.length
  // A forgiving ±4° × ±0.06 box always contains a 4 × 6 block of these coarse cells.
  const BA = 4
  const BP = 6
  const idx = indexLevel(level)
  const restY = (id: string): number => restPoint(idx.byId.get(id)!).y
  // Nothing can land more than this far above its launch (full power straight up, plus a hand's reach).
  const v = (TH.maxPower + TH.powerTol) * TUNING.maxPower
  const reach = (v * v) / (2 * TUNING.gravity) + TUNING.handOffset + TUNING.holdReach
  const lowestAfter = Math.min(...route.slice(k + 1).map(restY))
  const out: string[] = []
  for (let i = 0; i < k; i++) {
    if (restY(route[i]) + reach < lowestAfter) continue
    const rope = ropeLineForStep(level, i)
    // Coarse scan first (cheap, necessary condition), then prove each candidate with the real solver.
    const candidates = new Set<number>()
    for (const t0 of times) {
      // hit[cell] = route index landed on in EVERY world variant, or -1.
      const hit = new Int16Array(angles.length * NP).fill(-2)
      for (const world of worlds) {
        for (let ai = 0; ai < angles.length; ai++) {
          for (let pj = 0; pj < NP; pj++) {
            const cell = ai * NP + pj
            if (hit[cell] === -1) continue
            const c = simulateLeap(level, { fromId: route[i], t0 }, angles[ai], powers[pj], { world, ropeLineY: rope }).contact
            const j = c && c.kind !== 'fall' ? route.indexOf(c.id) : -1
            hit[cell] = j > k && (hit[cell] === -2 || hit[cell] === j) ? j : -1
          }
        }
      }
      for (let ai = 0; ai + BA <= angles.length; ai++) {
        for (let pj = 0; pj + BP <= NP; pj++) {
          const j = hit[ai * NP + pj]
          if (j <= k || candidates.has(j)) continue
          let all = true
          for (let da = 0; da < BA && all; da++) for (let dp = 0; dp < BP && all; dp++) all = hit[(ai + da) * NP + pj + dp] === j
          if (all) candidates.add(j)
        }
      }
    }
    for (const j of [...candidates].sort((a, b) => a - b)) {
      const r = solveStep({ level, fromId: route[i], toId: route[j], ropeLineY: rope, worlds, th: TH })
      if (r.solution) out.push(`${route[i]} → ${route[j]} (angle ${r.solution.angle}, power ${r.solution.power})`)
    }
  }
  return out
}

/** Some failing leap from a route element passes the hidden hold (descending, above the rope line). */
function hiddenRevealable(level: Level, holdEl: Hold): boolean {
  const r2 = TUNING.hiddenRevealRadius * TUNING.hiddenRevealRadius
  for (let i = 0; i < level.route.length - 1; i++) {
    const rope = ropeLineForStep(level, i)
    if (holdEl.y < rope) continue
    for (let a = -10; a <= 190; a += 5) {
      for (let p = MIN_POWER; p <= 1; p += 0.05) {
        const sim = simulateLeap(level, { fromId: level.route[i], t0: 0 }, a, p, { ropeLineY: rope, record: true, sampleEvery: 1 })
        const c = sim.contact
        if (c && c.kind !== 'fall' && c.id === level.route[i + 1]) continue
        const path = sim.path
        for (let k = 2; k < path.length; k += 2) {
          const descending = path[k + 1] < path[k - 1]
          if (!descending) continue
          const dx = path[k] - holdEl.x
          const dy = path[k + 1] + TUNING.handOffset - holdEl.y
          if (dx * dx + dy * dy <= r2) return true
        }
      }
    }
  }
  return false
}

export function validateLevel(level: Level): LevelReport {
  const errors: string[] = []
  try {
    structural(level, errors)
  } catch (err) {
    errors.push(String(err))
  }
  const steps: StepSolution[] = []
  const stepFractions: number[] = []
  const margins: number[] = []
  const worlds = worldsFor(level)

  if (errors.length === 0) {
    for (let i = 0; i < level.route.length - 1; i++) {
      const ctx: SolveContext = {
        level,
        fromId: level.route[i],
        toId: level.route[i + 1],
        ropeLineY: ropeLineForStep(level, i),
        worlds,
        th: TH,
      }
      const report = solveStep(ctx)
      stepFractions.push(report.successFraction)
      if (!report.solution) {
        errors.push(`step ${i} ${ctx.fromId}→${ctx.toId}: no forgiving leap at ≤ ${TH.maxPower * 100}% power (success ${(report.successFraction * 100).toFixed(1)}%)`)
        continue
      }
      steps.push(report.solution)
      margins.push(report.solution.marginAngle / TH.angleTol)
      checkSolutionExtras(level, report.solution, i, errors)
      if ((level.bigLeaps ?? []).some((b) => b.from === ctx.fromId && b.to === ctx.toId)) {
        const bypass = bigLeapBypass(level, ctx.fromId, ctx.toId, i)
        if (bypass) errors.push(`big leap ${ctx.fromId}→${ctx.toId} can be skipped: a leap from ${ctx.fromId} lands on ${bypass}`)
      }
    }
  }

  // The Looks Scary story moment must be met: no forgiving leap from below the Fear Forecast camp may land
  // past it on the route (she'd skip the forecast and the gentle reveal). Ordinary Big Leap landings MAY be
  // reached from further down — a shortcut is her choice, and still a big leap (Decision 41).
  if (errors.length === 0 && level.looksScary) {
    const id = level.looksScary.forecastAt
    for (const skip of routeSkips(level, level.route.indexOf(id))) {
      errors.push(`the Fear Forecast camp ${id} can be skipped: ${skip}`)
    }
  }

  // Hidden holds: revealable, reachable from the route, and a real shortcut.
  const idx = indexLevel(level)
  const revealedAll: WorldState = { crumbled: new Set(), revealed: new Set(level.elements.filter((e) => isHold(e) && e.hidden).map((e) => e.id)) }
  for (const el of level.elements) {
    if (!isHold(el) || !el.hidden || errors.length > 0) continue
    if (!hiddenRevealable(level, el)) errors.push(`hidden hold ${el.id}: no falling leap ever passes it, so it can never be spotted`)
    let reachFrom = -1
    for (let i = 0; i < level.route.length - 1 && reachFrom < 0; i++) {
      const r = solveStep({ level, fromId: level.route[i], toId: el.id, ropeLineY: ropeLineForStep(level, i), worlds: [revealedAll], th: TH })
      if (r.solution) reachFrom = i
    }
    if (reachFrom < 0) {
      errors.push(`hidden hold ${el.id}: no forgiving leap reaches it from the route`)
      continue
    }
    let shortcut = false
    for (let j = reachFrom + 2; j < level.route.length && !shortcut; j++) {
      const r = solveStep({ level, fromId: el.id, toId: level.route[j], ropeLineY: ropeLineForStep(level, reachFrom), worlds: [revealedAll], th: TH })
      if (r.solution) shortcut = true
    }
    if (!shortcut) errors.push(`hidden hold ${el.id}: from it no forgiving leap skips ahead on the route`)
  }

  // Lesson: from the fall-practice ledge nothing else is reachable.
  if (level.id === 'lesson' && errors.length === 0) {
    const spot = level.route[level.route.length - 1]
    const rope = (idx.byId.get(spot) as Ledge).y - TUNING.ropeSlack
    for (let a = -20; a <= 200; a += 2) {
      for (let p = MIN_POWER; p <= 1.0001; p += 0.02) {
        const c = simulateLeap(level, { fromId: spot, t0: 0 }, a, p, { ropeLineY: rope }).contact
        if (c && c.kind !== 'fall' && c.id !== spot) {
          errors.push(`lesson: fall practice can land on ${c.id} (angle ${a}, power ${p.toFixed(2)})`)
          a = 999
          break
        }
      }
    }
  }

  // Ghost arcs from every off-route element to a route element above it.
  const ghosts: Record<string, StepSolution> = {}
  if (errors.length === 0) {
    for (const el of level.elements) {
      if (level.route.includes(el.id)) continue
      const restY = restPoint(el).y
      const above = level.route
        .map((id, i) => ({ id, i, el: idx.byId.get(id)! }))
        .filter((r) => restPoint(r.el).y > restY + 10)
        .sort((a, b) => restPoint(a.el).y - restPoint(b.el).y)
        .slice(0, 3)
      for (const target of above) {
        const s = solveAnyStep({ level, fromId: el.id, toId: target.id, ropeLineY: ropeLineForStep(level, Math.max(0, target.i - 1)), worlds: [revealedAll], th: TH })
        if (s) {
          ghosts[el.id] = s
          break
        }
      }
    }
  }

  const solutions: LevelSolutions = {
    levelId: level.id,
    levelHash: hashLevel(level),
    steps,
    ghosts,
    difficulty: {
      minMargin: margins.length ? Math.min(...margins) : 0,
      minSuccessFraction: stepFractions.length ? Math.min(...stepFractions) : 0,
      meanSuccessFraction: stepFractions.length ? round(stepFractions.reduce((a, b) => a + b, 0) / stepFractions.length) : 0,
    },
  }
  return { id: level.id, errors, solutions, stepFractions }
}

function round(n: number): number {
  return Math.round(n * 10000) / 10000
}

/** Write solutions/<id>.json only when its content changed (keeps git diffs quiet). */
export function writeSolutions(report: LevelReport): void {
  const file = join(SOLUTIONS_DIR, `${report.id}.json`)
  const text = JSON.stringify(report.solutions, null, 1) + '\n'
  if (existsSync(file) && readFileSync(file, 'utf8') === text) return
  writeFileSync(file, text)
}

export function describeReport(level: Level, report: LevelReport): string {
  const d = report.solutions.difficulty
  return `${level.id} "${level.title}": ${report.solutions.steps.length}/${level.route.length - 1} steps, minMargin ×${d.minMargin.toFixed(2)}, success min ${(d.minSuccessFraction * 100).toFixed(1)}% mean ${(d.meanSuccessFraction * 100).toFixed(1)}%`
}
