/**
 * Dev-only character animator lab (served at /upanyway/dev/character.html by `vite`; not in the build).
 * Every state side by side at phone and iPad scale, driven by real ClimbSessions through their public
 * methods (aimAt / release / update), plus filmstrips of the key moves.
 *
 * ?t=2.4        freeze every cell at that many seconds (deterministic: for screenshots)
 * ?only=states  or ?only=strips
 * ?scale=phone  or ?scale=ipad (states section)
 * ?only=close   close-ups of chosen moments at a large scale
 * ?strips=a,b   only the filmstrips of these scenario ids
 */
import { defaultLook, type ClimberLook } from '../src/storage/schema'
import { randomLook } from '../src/content/wardrobe'
import { Camera } from '../src/game/camera'
import { ClimbSession } from '../src/game/engine'
import { getLevel } from '../src/game/levels'
import { solutionsFor } from '../src/game/levels/solutions'
import { restPoint, simulateLeap } from '../src/game/physics'
import { CharacterAnimator, harnessPoint } from '../src/game/render/character'
import { FALL_POSE_IDS } from '../src/game/art/fallPosesAnim'
import { TUNING } from '../src/game/tuning'
import { LEDGE_H, type Level, type LevelId, type StepSolution } from '../src/game/types'

const params = new URLSearchParams(location.search)
const FREEZE = params.has('t') ? Number(params.get('t')) : null
const ONLY = params.get('only')
const SCALE_ONLY = params.get('scale')
/** ?strips=leap,wind — only these filmstrips (by scenario id). */
const STRIP_FILTER = (params.get('strips') ?? '').split(',').filter(Boolean)
const lab = document.getElementById('lab') as HTMLElement
const DPR = Math.min(2, window.devicePixelRatio || 1)
const STEP = 1 / 60
const MAX_DRAG = 160

/** Real game scales: camera.baseScale = min(viewW / 420, viewH / 640). */
const SCALES = {
  phone: Math.min(390 / 420, 844 / 640),
  ipad: Math.min(820 / 420, 1180 / 640),
}

function seeded(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let x = s
    x = Math.imul(x ^ (x >>> 15), x | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

const LOOKS: ClimberLook[] = [defaultLook(), randomLook(seeded(7)), randomLook(seeded(21)), randomLook(seeded(3))]

function level(id: LevelId): Level {
  const l = getLevel(id)
  if (!l) throw new Error(`no level ${id}`)
  return l
}

function steps(id: LevelId): StepSolution[] {
  return solutionsFor(id)?.steps ?? []
}

function stepFrom(id: LevelId, from: string): StepSolution {
  const st = steps(id).find((s) => s.from === from)
  if (!st) throw new Error(`no step from ${from} on ${id}`)
  return st
}

/** Grid-search a leap whose outcome satisfies `ok` (for staged whippers and flops). */
function findLeap(
  lv: Level,
  fromId: string,
  ropeCampId: string,
  ok: (contactId: string | null, kind: string) => boolean,
  angles: [number, number],
  powers: [number, number],
): { angle: number; power: number } {
  const camp = lv.elements.find((e) => e.id === ropeCampId)
  const ropeLineY = (camp ? camp.y : 0) - TUNING.ropeSlack
  const seen = new Map<string, number>()
  for (let p = powers[0]; p <= powers[1] + 1e-9; p += 0.02) {
    for (let a = angles[0]; a <= angles[1]; a += 2) {
      const r = simulateLeap(lv, { fromId, t0: 0 }, a, p, { ropeLineY })
      const c = r.contact
      const key = c ? (c.kind === 'fall' ? 'fall' : `${c.kind}:${c.id}`) : 'none'
      seen.set(key, (seen.get(key) ?? 0) + 1)
      if (!c) continue
      if (ok(c.kind === 'fall' ? null : c.id, c.kind)) return { angle: a, power: Math.round(p * 100) / 100 }
    }
  }
  throw new Error(`no leap from ${fromId}: ${[...seen].map(([k, v]) => `${k}×${v}`).join(' ')}`)
}

// ---------------------------------------------------------------------------------------------
// A camera that frames a small crop around her at a real game scale.

class LabCamera extends Camera {
  fx = 200
  fy = 100
  /** Where her focus point sits, as a fraction of the cell height. */
  ay = 0.66
  private placed = false

  setView(w: number, h: number, scale: number): void {
    this.resize(w, h, { top: 0, right: 0, bottom: 0, left: 0 }, DPR)
    this.baseScale = scale
    this.zoom = 1
  }

  follow(x: number, y: number, dt: number, still: boolean): void {
    if (!this.placed || still) {
      this.fx = x
      this.fy = y
      this.placed = true
      return
    }
    const k = 1 - Math.exp(-5 * dt)
    this.fx += (x - this.fx) * k
    this.fy += (y - this.fy) * k
  }

  override worldToScreen(x: number, y: number): { x: number; y: number } {
    const s = this.scale
    return { x: this.viewW / 2 + (x - this.fx) * s, y: this.viewH * this.ay - (y - this.fy) * s }
  }
}

// ---------------------------------------------------------------------------------------------
// Scenarios

interface Driver {
  session: ClimbSession
  anim: CharacterAnimator
  time: number
  flags: Record<string, number>
}

interface Scenario {
  id: string
  label: string
  level: LevelId
  start?: string
  night?: boolean
  goatOutside?: boolean
  look?: number
  /** Restart every `loop` seconds (live mode). */
  loop?: number
  /** Camera holds still on the start point instead of following. */
  still?: boolean
  /** Camera locks onto her (no smoothing). */
  snap?: boolean
  /** Extra seconds simulated before the clock starts (long-idle states). */
  pre?: number
  script?: (d: Driver) => void
  setup?: (d: Driver) => void
  /** Every whipper plays this fall pose. */
  pose?: string
  /** Frozen mode: simulate until this is true (instead of to ?t). */
  until?: (d: Driver) => boolean
}

interface Close {
  id: string
  at: number
  label?: string
}

/** Close-ups (large scale) of chosen scenarios at chosen times, to judge faces and the goat. */
const CLOSE: Close[] = [
  { id: 'idle', at: 1.5 },
  { id: 'turn', at: 1.5 },
  { id: 'aim-low', at: 1.2 },
  { id: 'aim-full', at: 1.2 },
  { id: 'aim-pump', at: 1.0 },
  { id: 'aim-cancel', at: 1.0 },
  { id: 'big-idle', at: 0.8, label: 'big idle: peering (nervous)' },
  { id: 'big-idle', at: 3.4, label: 'big idle: determined' },
  { id: 'big-aim', at: 0.6, label: 'big aim: gulp' },
  { id: 'big-aim', at: 2.0, label: 'big aim: cover eyes' },
  { id: 'leap', at: 1.06, label: 'launch stretch' },
  { id: 'leap', at: 1.3, label: 'rising' },
  { id: 'leap', at: 1.8, label: 'coming down' },
  { id: 'leap', at: 2.02, label: 'landing squash' },
  { id: 'leap', at: 2.4, label: 'proud' },
  { id: 'whip', at: 1.36, label: 'falling' },
  { id: 'whip', at: 1.62, label: 'rope swing' },
  { id: 'whip', at: 1.95, label: 'reeled in' },
  { id: 'flop', at: 1.75, label: 'flop' },
  { id: 'hang', at: 1.0 },
  { id: 'hang-aim', at: 1.6 },
  { id: 'catch', at: 1.84, label: 'catch: one hand' },
  { id: 'sent', at: 2.3 },
  { id: 'crumble', at: 3.6, label: 'crumble warning' },
  { id: 'rest', at: 1.0 },
  { id: 'night-climb', at: 4.4, label: 'night: goat beside her' },
  { id: 'wind', at: 4.6, label: 'bracing in a gust' },
  { id: 'look-scary', at: 1.2 },
  { id: 'look-relieved', at: 1.2 },
  { id: 'night-big', at: 2.0 },
  { id: 'climb-out', at: 1.3, label: 'goat hops out' },
]

function aimAt(d: Driver, angle: number, power: number, onClimber = false): void {
  const a = (angle * Math.PI) / 180
  const len = power * MAX_DRAG
  d.session.aimAt(-Math.cos(a) * len, Math.sin(a) * len, MAX_DRAG, onClimber)
}

/** Aim from a little short of the solution up to it over `dur`, then release. Once per run. */
function aimThenGo(d: Driver, at: number, dur: number, sol: { angle: number; power: number }, key = 'go'): void {
  if (d.flags[key]) return
  if (d.time < at || !d.session.canAim()) return
  const k = Math.min(1, (d.time - at) / (dur * 0.75))
  const e = k * k * (3 - 2 * k)
  if (d.time < at + dur) {
    aimAt(d, sol.angle + (1 - e) * 10, sol.power * (0.12 + 0.88 * e))
    return
  }
  aimAt(d, sol.angle, sol.power)
  d.session.release()
  d.flags[key] = 1
}

/** Climb the saved route on its own: pause, aim, leap, again. */
function autoClimb(id: LevelId, pause = 0.9, aimDur = 0.6): (d: Driver) => void {
  const route = steps(id)
  return (d) => {
    const s = d.session
    if (s.phase !== 'ready' || s.frozen) {
      d.flags.readyAt = -1
      return
    }
    if (d.flags.readyAt === undefined || d.flags.readyAt < 0) d.flags.readyAt = d.time
    const since = d.time - d.flags.readyAt
    const st = route.find((r) => r.from === s.elementId)
    if (!st || since < pause) return
    const k = Math.min(1, (since - pause) / (aimDur * 0.75))
    if (since < pause + aimDur) {
      aimAt(d, st.angle + (1 - k) * 8, st.power * (0.15 + 0.85 * k))
      return
    }
    aimAt(d, st.angle, st.power)
    s.release()
    d.flags.readyAt = -1
  }
}

const p01 = level('p01')
const p04 = level('p04')
const WHIP_ROPE = findLeap(p01, 'c1', 'c1', (id) => id === null, [20, 70], [0.4, 0.8])
const FLOP = findLeap(p01, 'a2', 'c0', (id, kind) => id === 'a1' && kind === 'land', [96, 170], [0.2, 0.7])
const HANG_FALL = findLeap(p04, 'h1', 'c0', (id) => id !== 'a4' && id !== 'h1', [100, 200], [0.2, 0.6])

const SCENARIOS: Scenario[] = [
  { id: 'idle', label: 'Idle — looks at next ledge', level: 'p01', still: true },
  { id: 'turn', label: 'Idle — turns to the target', level: 'p01', start: 'a2', still: true, look: 1 },
  {
    id: 'aim-low',
    label: 'Aim 30%',
    level: 'p01',
    still: true,
    script: (d) => {
      if (d.time > 0.3) aimAt(d, 64, 0.3)
    },
  },
  {
    id: 'aim-full',
    label: 'Aim 100%',
    level: 'p01',
    still: true,
    script: (d) => {
      if (d.time > 0.3) aimAt(d, 52, 1)
    },
  },
  {
    id: 'aim-pump',
    label: 'Aim pumping',
    level: 'p01',
    still: true,
    look: 2,
    script: (d) => {
      if (d.time > 0.2) aimAt(d, 120, 0.5 + 0.5 * Math.sin(d.time * 2.4))
    },
  },
  {
    id: 'aim-cancel',
    label: 'Drag back on her (cancel)',
    level: 'p01',
    still: true,
    script: (d) => {
      if (d.time > 0.3) aimAt(d, 60, 0.15, true)
    },
  },
  { id: 'big-idle', label: 'Big Leap spot (idle)', level: 'p02', start: 'c1', still: true },
  {
    id: 'big-aim',
    label: 'Big Leap aim (wobble, gulp → cover)',
    level: 'p02',
    start: 'c1',
    still: true,
    script: (d) => {
      if (d.time > 0.2) aimAt(d, 40, 0.55 + 0.15 * Math.min(1, d.time / 2))
    },
  },
  {
    id: 'big-leap',
    label: 'Big Leap (p02 c1 → gap)',
    level: 'p02',
    start: 'c1',
    loop: 4.5,
    script: (d) => aimThenGo(d, 0.3, 1.6, stepFrom('p02', 'c1')),
  },
  {
    id: 'leap',
    label: 'Leap c0 → a1',
    level: 'p01',
    loop: 3,
    script: (d) => aimThenGo(d, 0.4, 0.6, stepFrom('p01', 'c0')),
  },
  {
    id: 'whip',
    label: 'Whipper → rope',
    level: 'p01',
    start: 'c1',
    loop: 3.2,
    script: (d) => aimThenGo(d, 0.4, 0.5, WHIP_ROPE),
  },
  {
    id: 'flop',
    label: 'Slip → flop on a lower ledge',
    level: 'p01',
    start: 'a2',
    loop: 3.4,
    script: (d) => aimThenGo(d, 0.4, 0.5, FLOP),
  },
  { id: 'hang', label: 'Hanging', level: 'p04', start: 'h1', still: true, look: 3 },
  {
    id: 'hang-aim',
    label: 'Hanging aim',
    level: 'p04',
    start: 'h1',
    still: true,
    look: 3,
    script: (d) => {
      if (d.time > 0.3) aimAt(d, 61, 0.35 + 0.4 * Math.min(1, d.time))
    },
  },
  {
    id: 'catch',
    label: 'Catch a hold (a3 → h1)',
    level: 'p04',
    start: 'a3',
    loop: 3,
    look: 3,
    script: (d) => aimThenGo(d, 0.4, 0.55, stepFrom('p04', 'a3')),
  },
  {
    id: 'hang-fall',
    label: 'Let go of a hold → rope',
    level: 'p04',
    start: 'h1',
    loop: 3,
    look: 3,
    script: (d) => aimThenGo(d, 0.5, 0.4, HANG_FALL),
  },
  {
    id: 'sent',
    label: 'Send! (d5 → top)',
    level: 'p01',
    start: 'd5',
    loop: 4,
    script: (d) => aimThenGo(d, 0.4, 0.5, stepFrom('p01', 'd5')),
  },
  {
    id: 'crumble',
    label: 'Crumbly ledge (p07 a2 → a3)',
    level: 'p07',
    start: 'a2',
    loop: 6,
    look: 2,
    script: (d) => aimThenGo(d, 0.3, 0.45, stepFrom('p07', 'a2')),
  },
  { id: 'wind', label: 'Gusty Ridge: braces in each gust', level: 'p10', start: 'b1', still: true, look: 1 },
  {
    id: 'wind-leap',
    label: 'Leaping into a gust',
    level: 'p10',
    start: 'b1',
    loop: 4.5,
    look: 1,
    script: (d) => aimThenGo(d, 3.4, 0.5, stepFrom('p10', 'b1')),
  },
  {
    id: 'look-scary',
    label: 'Looks Scary: glowing eyes (nervous)',
    level: 'p05',
    start: level('p05').looksScary!.forecastAt,
    still: true,
    look: 2,
    setup: (d) => {
      const ls = d.session.level.looksScary!
      d.anim.lookAt(ls.x, ls.y, 99, 'nervous')
    },
  },
  {
    id: 'look-relieved',
    label: 'Looks Scary: only fireflies (happy)',
    level: 'p05',
    start: level('p05').looksScary!.revealAt,
    still: true,
    look: 2,
    setup: (d) => {
      const ls = d.session.level.looksScary!
      d.anim.lookAt(ls.x, ls.y, 99, 'happy')
    },
  },
  { id: 'rest', label: 'Long idle: sits, goat dozes', level: 'p01', still: true, pre: 30, look: 1 },
  {
    id: 'night-climb',
    label: 'Night: goat hops after her',
    level: 'p01',
    night: true,
    goatOutside: true,
    loop: 9,
    script: autoClimb('p01'),
  },
  {
    id: 'night-whip',
    label: 'Night: goat watches a whipper',
    level: 'p01',
    start: 'c1',
    night: true,
    goatOutside: true,
    loop: 4,
    script: (d) => aimThenGo(d, 0.8, 0.5, WHIP_ROPE),
  },
  {
    id: 'night-big',
    label: 'Night: Big Leap aim',
    level: 'p02',
    start: 'c1',
    night: true,
    goatOutside: true,
    still: true,
    script: (d) => {
      if (d.time > 0.4) aimAt(d, 40, 0.6)
    },
  },
  {
    id: 'climb-out',
    label: 'Goat climbs out of the pack',
    level: 'p01',
    look: 2,
    still: true,
    loop: 4,
    setup: (d) => {
      d.flags.out = 0
    },
    script: (d) => {
      if (!d.flags.out && d.time > 0.8) {
        d.anim.setGoatOutside(true)
        d.flags.out = 1
      }
    },
  },
]

// Every fall pose, frozen mid-whipper on the rope.
const POSE_SCENARIOS: Scenario[] = FALL_POSE_IDS.map((id, i) => ({
  id: `pose-${id}`,
  label: id,
  level: 'p01' as LevelId,
  start: 'c1',
  look: i % LOOKS.length,
  loop: 3,
  pose: id,
  snap: true,
  script: (d: Driver) => aimThenGo(d, 0.1, 0.2, WHIP_ROPE),
  until: (d: Driver) => !!d.session.rope && d.session.rope.t >= 0.36,
}))

// ---------------------------------------------------------------------------------------------
// Running a scenario

class Cell {
  readonly canvas: HTMLCanvasElement
  readonly ctx: CanvasRenderingContext2D
  readonly cam = new LabCamera()
  private d!: Driver
  private runStart = 0

  constructor(
    readonly sc: Scenario,
    readonly w: number,
    readonly h: number,
    readonly scale: number,
  ) {
    this.canvas = document.createElement('canvas')
    this.canvas.width = Math.round(w * DPR)
    this.canvas.height = Math.round(h * DPR)
    this.canvas.style.width = `${w}px`
    this.canvas.style.height = `${h}px`
    this.ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D
    this.cam.setView(w, h, scale)
    this.reset(0)
  }

  reset(now: number): void {
    const sc = this.sc
    const lv = level(sc.level)
    const pose = sc.pose
    let n = 0
    const session = new ClimbSession({
      level: lv,
      startId: sc.start,
      choosePose: () => pose ?? FALL_POSE_IDS[n++ % FALL_POSE_IDS.length],
    })
    const anim = new CharacterAnimator({
      look: LOOKS[sc.look ?? 0],
      night: !!sc.night,
      goatOutside: !!sc.goatOutside,
    })
    this.d?.anim.destroy()
    this.d = { session, anim, time: 0, flags: {} }
    sc.setup?.(this.d)
    this.runStart = now
    const p = restPoint(lv.elements.find((e) => e.id === session.elementId)!)
    this.cam.follow(p.x, p.y + 30, 0, true)
    if (sc.pre) {
      // Simulate quietly (drawing each frame so the animator's own state advances).
      for (let t = 0; t < sc.pre; t += STEP) this.step(-sc.pre + t, STEP)
    }
  }

  /** One lab frame: script → physics → draw. `t` is the render clock. */
  step(t: number, dt: number): void {
    const d = this.d
    this.sc.script?.(d)
    d.session.update(dt)
    d.time += dt
    const s = d.session
    if (!this.sc.still) this.cam.follow(s.body.x, s.body.y + 30, dt, !!this.sc.snap)
    this.draw(t)
  }

  done(): boolean {
    return this.sc.until ? this.sc.until(this.d) : false
  }

  tick(now: number, dt: number): void {
    if (this.sc.loop && now - this.runStart >= this.sc.loop) this.reset(now)
    this.step(now, dt)
  }

  draw(t: number): void {
    const c = this.ctx
    const s = this.d.session
    const night = !!this.sc.night
    c.setTransform(DPR, 0, 0, DPR, 0, 0)
    const g = c.createLinearGradient(0, 0, 0, this.h)
    g.addColorStop(0, night ? '#1d2546' : zoneSky(s.level.zone)[0])
    g.addColorStop(1, night ? '#3d3a63' : zoneSky(s.level.zone)[1])
    c.fillStyle = g
    c.fillRect(0, 0, this.w, this.h)
    drawWorld(c, this.cam, s, night)
    this.d.anim.draw(c, s, this.cam, t)
  }
}

function zoneSky(zone: string): [string, string] {
  switch (zone) {
    case 'hollow':
      return ['#cfe9cf', '#8fbf9a']
    case 'crumble':
      return ['#f6dcb0', '#e3b07c']
    case 'ridge':
      return ['#bfe0f5', '#e4eef5']
    case 'cloud':
      return ['#f6d6a8', '#d8bfe0']
    default:
      return ['#fbd9c4', '#f6ecd0']
  }
}

/** A plain stand-in world (the real one is the renderer's): ledges, holds, wall lines, the rope. */
function drawWorld(c: CanvasRenderingContext2D, cam: LabCamera, s: ClimbSession, night: boolean): void {
  const sc = cam.scale
  for (const el of s.level.elements) {
    if (el.kind === 'ledge') {
      if (s.crumbled.has(el.id)) continue
      const p = cam.worldToScreen(el.x, el.y)
      const shake = s.crumbleProgress(el.id) ?? 0
      const jx = shake > 0.5 ? Math.sin(performance.now() / 30) * 1.2 : 0
      c.fillStyle = night ? '#5b5672' : el.crumble ? '#c79b6c' : '#b39a86'
      c.fillRect(p.x + jx, p.y, el.w * sc, (el.h ?? LEDGE_H) * sc)
      c.fillStyle = night ? '#4c6a5a' : el.camp ? '#86b86a' : '#9ccc7a'
      c.fillRect(p.x + jx, p.y - 2 * sc, el.w * sc, 6 * sc)
    } else {
      if (el.hidden && !s.revealed.has(el.id)) continue
      const p = cam.worldToScreen(el.x, el.y)
      c.fillStyle = night ? '#a58f7a' : '#9a6b4a'
      c.beginPath()
      c.arc(p.x, p.y, 6 * sc, 0, Math.PI * 2)
      c.fill()
    }
  }
  // The rope: anchor above the last camp → her harness.
  const camp = s.lastCamp
  const sp = restPoint(camp)
  const ax = s.rope ? s.rope.anchorX : sp.x
  const ay = s.rope ? s.rope.anchorY : sp.y + 70
  const a = cam.worldToScreen(ax, ay)
  const hp = harnessPoint(s)
  const b = cam.worldToScreen(hp.x, hp.y)
  c.strokeStyle = night ? '#f2c14e' : '#d9473f'
  c.lineWidth = 1.6
  c.beginPath()
  c.moveTo(a.x, a.y)
  if (s.rope) c.lineTo(b.x, b.y)
  else c.quadraticCurveTo((a.x + b.x) / 2, Math.max(a.y, b.y) + 30 * sc, b.x, b.y)
  c.stroke()
  c.fillStyle = '#6b5a50'
  c.beginPath()
  c.arc(a.x, a.y, 2.5, 0, Math.PI * 2)
  c.fill()
}

// ---------------------------------------------------------------------------------------------
// Page

const cells: Cell[] = []

function section(title: string): HTMLElement {
  const s = document.createElement('section')
  const h = document.createElement('h2')
  h.textContent = title
  const g = document.createElement('div')
  g.className = 'grid'
  s.append(h, g)
  lab.appendChild(s)
  return g
}

function addCell(grid: HTMLElement, sc: Scenario, w: number, h: number, scale: number, label = sc.label): Cell {
  const cell = new Cell(sc, w, h, scale)
  const f = document.createElement('figure')
  const cap = document.createElement('figcaption')
  cap.textContent = label
  f.append(cell.canvas, cap)
  grid.appendChild(f)
  cells.push(cell)
  return cell
}

if (ONLY === 'poses') {
  const g = section('Fall poses on the rope (iPad scale ×1.5, t ≈ 0.36 s after the catch)')
  for (const sc of POSE_SCENARIOS) addCell(g, sc, 170, 190, SCALES.ipad * 1.5)
}
if (ONLY !== 'strips' && ONLY !== 'close' && ONLY !== 'poses' && ONLY !== 'perf') {
  if (SCALE_ONLY !== 'ipad') {
    const g = section('States — phone scale (0.93 px/unit)')
    for (const sc of SCENARIOS) addCell(g, sc, 150, 170, SCALES.phone)
  }
  if (SCALE_ONLY !== 'phone') {
    const g = section('States — iPad portrait scale (1.84 px/unit)')
    for (const sc of SCENARIOS) addCell(g, sc, 230, 250, SCALES.ipad)
  }
  const g = section('Fall poses on the rope (iPad scale, t ≈ 0.35 s after the catch)')
  for (const sc of POSE_SCENARIOS) addCell(g, sc, 150, 170, SCALES.ipad)
}

const closeCells: { cell: Cell; t: number }[] = []
if (ONLY === 'close') {
  const g = section('Close-ups (3.4 px/unit)')
  for (const c of CLOSE) {
    const sc = SCENARIOS.find((s) => s.id === c.id)!
    const cell = addCell(g, { ...sc, loop: undefined, snap: true, still: false }, 260, 260, 3.4, c.label ?? sc.label)
    cell.cam.ay = 0.42
    cells.pop()
    closeCells.push({ cell, t: c.at })
  }
}
for (const { cell, t } of closeCells) {
  for (let tt = 0; tt < t - 1e-6; tt += STEP) cell.step(tt, STEP)
}

// Filmstrips: one scenario, many frames, each its own deterministic run frozen at a time.
interface Strip {
  sc: Scenario
  from: number
  to: number
  frames: number
  scale?: number
  size?: [number, number, number]
}

function stripSize(st: Strip): [number, number, number] {
  if (st.size) return st.size
  const sc = st.scale ?? 1.3
  return sc > 2 ? [150, 200, 0.5] : [120, 150, 0.66]
}

const STRIPS: Strip[] = [
  { sc: SCENARIOS.find((s) => s.id === 'wind')!, from: 3.6, to: 5.6, frames: 11, scale: 2.0, size: [150, 190, 0.5] },
  { sc: SCENARIOS.find((s) => s.id === 'wind-leap')!, from: 3.9, to: 5.3, frames: 8, scale: 1.6, size: [150, 190, 0.55] },
  { sc: SCENARIOS.find((s) => s.id === 'big-leap')!, from: 1.4, to: 3.4, frames: 14, scale: 1.6, size: [150, 190, 0.55] },
  { sc: SCENARIOS.find((s) => s.id === 'big-aim')!, from: 1.0, to: 1.21, frames: 8, scale: 2.4 },
  { sc: SCENARIOS.find((s) => s.id === 'catch')!, from: 1.72, to: 2.4, frames: 12, scale: 2.4 },
  { sc: SCENARIOS.find((s) => s.id === 'crumble')!, from: 3.3, to: 3.52, frames: 8, scale: 2.4 },
  { sc: SCENARIOS.find((s) => s.id === 'night-climb')!, from: 2.6, to: 4.2, frames: 12, scale: 1.1, size: [200, 200, 0.6] },
  { sc: SCENARIOS.find((s) => s.id === 'leap')!, from: 0.8, to: 2.6, frames: 19 },
  { sc: SCENARIOS.find((s) => s.id === 'leap')!, from: 0.96, to: 1.2, frames: 9, scale: 2.4 },
  { sc: SCENARIOS.find((s) => s.id === 'leap')!, from: 1.96, to: 2.36, frames: 11, scale: 2.4 },
  { sc: SCENARIOS.find((s) => s.id === 'whip')!, from: 0.85, to: 2.2, frames: 15 },
  { sc: SCENARIOS.find((s) => s.id === 'flop')!, from: 0.85, to: 2.5, frames: 15 },
  { sc: SCENARIOS.find((s) => s.id === 'catch')!, from: 0.85, to: 2.0, frames: 13 },
  { sc: SCENARIOS.find((s) => s.id === 'sent')!, from: 0.85, to: 2.4, frames: 13 },
  { sc: SCENARIOS.find((s) => s.id === 'crumble')!, from: 1.0, to: 4.6, frames: 15 },
  { sc: SCENARIOS.find((s) => s.id === 'big-aim')!, from: 0.2, to: 2.4, frames: 12 },
  { sc: SCENARIOS.find((s) => s.id === 'night-climb')!, from: 1.6, to: 4.2, frames: 14 },
  { sc: SCENARIOS.find((s) => s.id === 'climb-out')!, from: 0.8, to: 2.4, frames: 12 },
]

const stripCells: { cell: Cell; t: number }[] = []
if (ONLY !== 'states' && ONLY !== 'close' && ONLY !== 'poses' && ONLY !== 'perf') {
  for (const st of STRIPS) {
    if (STRIP_FILTER.length && !STRIP_FILTER.includes(st.sc.id)) continue
    const g = section(`Filmstrip — ${st.sc.label} (${st.from}s → ${st.to}s)`)
    for (let i = 0; i < st.frames; i++) {
      const t = st.from + ((st.to - st.from) * i) / Math.max(1, st.frames - 1)
      const [cw, ch, ay] = stripSize(st)
      const cell = addCell(g, { ...st.sc, loop: undefined, snap: true, still: false }, cw, ch, st.scale ?? 1.3, t.toFixed(2))
      cell.cam.ay = ay
      cells.pop()
      stripCells.push({ cell, t })
    }
  }
}

// Strips always render frozen.
for (const { cell, t } of stripCells) {
  for (let tt = 0; tt < t - 1e-6; tt += STEP) cell.step(tt, STEP)
}

if (FREEZE !== null) {
  for (const cell of cells) {
    if (cell.sc.until) {
      for (let t = 0; t < 6 && !cell.done(); t += STEP) cell.tick(t, STEP)
      continue
    }
    for (let t = 0; t < FREEZE - 1e-6; t += STEP) cell.tick(t, STEP)
  }
} else {
  let last = -1
  let clock = 0
  const loop = (now: number) => {
    const dt = last < 0 ? STEP : Math.min(0.1, (now - last) / 1000)
    last = now
    clock += dt
    for (const cell of cells) cell.tick(clock, dt)
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
}

;(window as unknown as { __labReady: boolean }).__labReady = true

/** Rough cost of CharacterAnimator.draw per frame (ms), for ?only=perf runs from the console. */
;(window as unknown as { __perf: (id: string, frames: number, o?: Partial<Scenario>) => number }).__perf = (id, frames, o) => {
  const sc = SCENARIOS.find((s) => s.id === id)!
  const cell = new Cell({ ...sc, loop: 3, ...(o ?? {}) }, 820, 1180, SCALES.ipad)
  const anim = (cell as unknown as { d: Driver }).d.anim
  const orig = anim.draw.bind(anim)
  let total = 0
  anim.draw = (ctx, s, cam, t) => {
    const t0 = performance.now()
    orig(ctx, s, cam, t)
    total += performance.now() - t0
  }
  for (let i = 0; i < frames; i++) cell.tick(i * STEP, STEP)
  cell.canvas.width = 0
  cell.canvas.height = 0
  return total / frames
}
