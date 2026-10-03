/**
 * ClimbSession: the climb's state machine. Fixed-timestep and deterministic — it steps flights with
 * the same `stepFlight` the level validator uses, so a saved solution replayed as a drag lands exactly
 * where the validator said it would.
 *
 * It knows nothing about the DOM, storage or sound: it emits typed events (game/events.ts) and the
 * climb screen turns those into saves, goat lines and sounds. The renderer reads its public state.
 */
import {
  hangPoint,
  indexLevel,
  isGusting,
  windAccelAt,
  launchVelocity,
  referenceFlightTime,
  restPoint,
  simulateLeap,
  standPoint,
  stepFlight,
  type Body,
  type FlightContext,
  type LevelIndex,
  type WorldState,
} from './physics'
import { Emitter, type WhipperKind } from './events'
import { TUNING } from './tuning'
import type { Hold, Ledge, Level, LevelElement, StepSolution } from './types'

export type Phase = 'ready' | 'flying' | 'settling' | 'roped' | 'flopped' | 'sent'

export interface Aim {
  /** Degrees, 0 = right, 90 = up. */
  angle: number
  /** 0..1 of max power. */
  power: number
  /** Releasing now would cancel (drag too short, or finger back on the climber). */
  cancel: boolean
  /** Raw drag in CSS px (for drawing the band). */
  dragX: number
  dragY: number
}

export interface SessionOptions {
  level: Level
  /** Camp to start (or resume) at. Defaults to route[0]. */
  startId?: string
  revealed?: string[]
  foundCrumbles?: string[]
  /** Picks the silly fall pose for a whipper (screen supplies a seeded, unseen-biased picker). */
  choosePose: () => string
}

interface Flight {
  ctx: FlightContext
  launchId: string
  launchRestY: number
  path: number[]
  steps: number
  crumbleFall: boolean
  bigLeap: boolean
  pendingReveal: Set<string>
  launch: { angle: number; power: number } | null
  gusted: boolean
}

export interface RopeAnim {
  t: number
  /** Where the rope caught her. */
  fromX: number
  fromY: number
  /** Rope anchor (above the camp's stand point). */
  anchorX: number
  anchorY: number
  /** Camp stand point she is reeled back to. */
  toX: number
  toY: number
  poseId: string
}

const PATH_EVERY = 3

export class ClimbSession {
  readonly level: Level
  readonly index: LevelIndex
  readonly events = new Emitter()

  phase: Phase = 'ready'
  /** Pitch clock (s). Advances only in fixed steps and only while not frozen. */
  t = 0
  body: Body
  /** Element she stands on / hangs from (while flying: the one she launched from). */
  elementId: string
  lastCampId: string
  highestRouteIndex: number
  facing: 1 | -1 = 1
  aim: Aim | null = null
  /** Blocking prompt open or app hidden: nothing advances. */
  frozen = false

  readonly crumbled = new Set<string>()
  readonly revealed = new Set<string>()
  readonly foundCrumbles = new Set<string>()
  /** Crumbly ledge id → seconds since she landed on it. */
  readonly crumbleTimers = new Map<string, number>()

  /** Recent failed arcs (renderer draws the last TUNING.chalkVisible, fading). */
  readonly chalk: { arc: number[]; at: number }[] = []
  /** Successful arcs since the last rope catch (beta map's bright line is built by the screen). */
  readonly routeArcs: number[][] = []

  settle: { fromX: number; toX: number; t: number; dur: number } | null = null
  rope: RopeAnim | null = null
  flop: { t: number; poseId: string } | null = null
  /** The pose currently being shown for a whipper (null when not in a fall pose). */
  poseId: string | null = null
  /** Pitch-clock time of the last launch / landing (for squash-and-stretch). */
  lastLaunchAt = -10
  lastLandAt = -10
  /** The flight currently in the air was launched with these. */
  lastLaunch: { angle: number; power: number } | null = null

  private flight: Flight | null = null
  private pendingLaunch: { angle: number; power: number } | null = null
  private acc = 0
  private gusting = new Map<string, boolean>()
  private readonly choosePose: () => string

  constructor(opts: SessionOptions) {
    this.level = opts.level
    this.index = indexLevel(opts.level)
    this.choosePose = opts.choosePose
    for (const id of opts.revealed ?? []) this.revealed.add(id)
    for (const id of opts.foundCrumbles ?? []) this.foundCrumbles.add(id)
    const start = opts.startId && this.index.byId.has(opts.startId) ? opts.startId : opts.level.route[0]
    const el = this.el(start)
    const p = restPoint(el)
    this.body = { x: p.x, y: p.y, vx: 0, vy: 0 }
    this.elementId = start
    this.lastCampId = isCamp(el) ? start : opts.level.route[0]
    this.highestRouteIndex = Math.max(0, opts.level.route.indexOf(start))
  }

  // ---------------------------------------------------------------------------------------------
  // Queries

  el(id: string): LevelElement {
    const el = this.index.byId.get(id)
    if (!el) throw new Error(`Unknown element ${id}`)
    return el
  }

  routeIndexOf(id: string): number | null {
    const i = this.level.route.indexOf(id)
    return i < 0 ? null : i
  }

  get world(): WorldState {
    return { crumbled: this.crumbled, revealed: this.revealed }
  }

  get lastCamp(): Ledge {
    return this.el(this.lastCampId) as Ledge
  }

  ropeLineY(): number {
    return this.lastCamp.y - TUNING.ropeSlack
  }

  /** The Big Leap that starts where she is standing, if any. */
  bigLeapHere(): { from: string; to: string } | null {
    if (this.phase !== 'ready') return null
    return (this.level.bigLeaps ?? []).find((b) => b.from === this.elementId) ?? null
  }

  isHanging(): boolean {
    return this.el(this.elementId).kind === 'hold' && this.phase !== 'flying' && this.phase !== 'roped'
  }

  /** The next route element she is heading for (beta target). */
  nextTargetId(): string | null {
    const next = this.level.route[this.highestRouteIndex + 1]
    return next ?? null
  }

  canAim(): boolean {
    return this.phase === 'ready' && !this.frozen
  }

  // ---------------------------------------------------------------------------------------------
  // Input (from game/input.ts). Drag is in CSS px, screen y-down.

  aimAt(dragX: number, dragY: number, maxDragPx: number, onClimber: boolean): Aim | null {
    if (!this.canAim()) return null
    const len = Math.hypot(dragX, dragY)
    // Launch opposite the drag. Screen y-down → world y-up: dragging down launches up.
    const angle = (Math.atan2(dragY, -dragX) * 180) / Math.PI
    const power = Math.min(1, len / maxDragPx)
    const cancel = len < TUNING.cancelPx || onClimber
    const first = this.aim === null
    this.aim = { angle, power, cancel, dragX, dragY }
    if (!cancel && Math.abs(dragX) > 2) this.facing = dragX < 0 ? 1 : -1
    if (first) this.events.emit('aimStart', { bigLeap: this.bigLeapHere() !== null })
    return this.aim
  }

  release(): void {
    const aim = this.aim
    this.aim = null
    if (!aim || aim.cancel || !this.canAim()) {
      this.events.emit('aimCancel', {})
      return
    }
    this.pendingLaunch = { angle: aim.angle, power: aim.power }
  }

  cancelAim(): void {
    if (this.aim) {
      this.aim = null
      this.events.emit('aimCancel', {})
    }
  }

  /** Launch directly (e2e/replay/tests). Same path as a drag release. */
  launch(angle: number, power: number): boolean {
    if (!this.canAim()) return false
    this.aim = null
    this.pendingLaunch = { angle, power }
    return true
  }

  // ---------------------------------------------------------------------------------------------
  // Previews

  /** Dotted preview: the first previewFraction of the reference flight, cut at first contact. */
  previewPath(angle: number, power: number): number[] {
    const big = this.bigLeapHere() !== null
    const fraction = big ? TUNING.bigLeapPreviewFraction : TUNING.previewFraction
    const maxTime = fraction * referenceFlightTime(angle, power)
    const r = simulateLeap(this.level, { fromId: this.elementId, t0: this.t }, angle, power, {
      world: this.world,
      ropeLineY: this.ropeLineY(),
      record: true,
      sampleEvery: 2,
      maxTime,
    })
    return r.contact ? r.path.slice(0, -2) : r.path
  }

  /** Full path of a saved solution (ghost beta). */
  ghostPath(sol: StepSolution): number[] {
    const period = this.level.wind?.[0]?.period
    const t0 = period ? sol.launchTime : this.t
    return simulateLeap(this.level, { fromId: sol.from, t0 }, sol.angle, sol.power, {
      world: this.world,
      ropeLineY: this.ropeLineY(),
      record: true,
      sampleEvery: 2,
    }).path
  }

  // ---------------------------------------------------------------------------------------------
  // Time

  /** Advance by a real frame delta (s). Physics runs in fixed steps; the delta is clamped. */
  update(frameDt: number): void {
    if (this.frozen) return
    this.acc += Math.min(Math.max(frameDt, 0), 0.1)
    while (this.acc >= TUNING.dt) {
      this.acc -= TUNING.dt
      this.fixedStep()
    }
  }

  /** Exactly one fixed step (tests drive this directly). */
  fixedStep(): void {
    const dt = TUNING.dt
    const t = this.t

    if (this.pendingLaunch) {
      const { angle, power } = this.pendingLaunch
      this.pendingLaunch = null
      this.startLeap(angle, power)
    }

    switch (this.phase) {
      case 'flying':
        this.stepFlying(t)
        break
      case 'settling':
        this.stepSettle(dt)
        break
      case 'roped':
        this.stepRope(dt)
        break
      case 'flopped':
        this.stepFlop(dt)
        break
      default:
        break
    }

    this.stepCrumbles(dt)
    this.stepWind(t)
    this.t = Math.round((t + dt) * 1e6) / 1e6
  }

  // ---------------------------------------------------------------------------------------------
  // Leaps

  private startLeap(angle: number, power: number): void {
    const fromId = this.elementId
    const from = this.el(fromId)
    const p = restPoint(from)
    const v = launchVelocity(angle, power)
    this.body = { x: p.x, y: p.y, vx: v.vx, vy: v.vy }
    const bl = (this.level.bigLeaps ?? []).find((b) => b.from === fromId) ?? null
    let toward = false
    if (bl) {
      const to = restPoint(this.el(bl.to))
      toward = Math.sign(v.vx) === Math.sign(to.x - p.x) || Math.abs(to.x - p.x) < 1
    }
    this.flight = {
      ctx: this.flightCtx(fromId),
      launchId: fromId,
      launchRestY: p.y,
      path: [p.x, p.y],
      steps: 0,
      crumbleFall: false,
      bigLeap: bl !== null,
      pendingReveal: new Set(),
      launch: { angle, power },
      gusted: false,
    }
    this.phase = 'flying'
    this.poseId = null
    this.lastLaunchAt = this.t
    this.lastLaunch = { angle, power }
    if (Math.abs(v.vx) > 1) this.facing = v.vx > 0 ? 1 : -1
    this.events.emit('launch', { fromId, angle, power, bigLeap: bl !== null, towardBigLeapTarget: toward })
  }

  private flightCtx(launchId: string): FlightContext {
    return {
      level: this.level,
      index: this.index,
      world: this.world,
      launchId,
      ropeLineY: this.ropeLineY(),
      passing: new Set(),
      surfaceId: this.el(launchId).kind === 'ledge' ? launchId : null,
      bump: { sides: [] },
    }
  }

  private stepFlying(t: number): void {
    const f = this.flight
    if (!f) return
    if (!f.gusted && windAccelAt(this.level, this.body.x, this.body.y, t) !== 0) f.gusted = true
    const contact = stepFlight(this.body, f.ctx, t)
    f.steps++
    if (f.steps % PATH_EVERY === 0 || contact) f.path.push(round1(this.body.x), round1(this.body.y))
    this.checkReveal(f)
    if (!contact && f.steps * TUNING.dt > TUNING.maxFlightTime) {
      this.endAsWhipper(f, f.crumbleFall ? 'crumble' : 'rope', null)
      return
    }
    if (!contact) return

    if (contact.kind === 'fall') {
      this.endAsWhipper(f, f.crumbleFall ? 'crumble' : 'rope', null)
      return
    }
    const target = this.el(contact.id)
    if (f.crumbleFall) {
      this.endAsWhipper(f, 'crumble', target)
      return
    }
    if (contact.id === f.launchId) {
      this.flight = null
      this.events.emit('hop', { id: contact.id })
      this.arrive(target, contact.x, false)
      return
    }
    const launchIdx = this.routeIndexOf(f.launchId)
    const targetIdx = this.routeIndexOf(target.id)
    const isNextRoute = launchIdx !== null && targetIdx === launchIdx + 1
    const restY = restPoint(target).y
    if (!isNextRoute && restY < f.launchRestY - TUNING.slipDrop) {
      this.endAsWhipper(f, 'slip', target)
      return
    }
    this.endAsSuccess(f, target, contact.x)
  }

  private checkReveal(f: Flight): void {
    if (this.body.vy >= 0) return
    const r2 = TUNING.hiddenRevealRadius * TUNING.hiddenRevealRadius
    const hx = this.body.x
    const hy = this.body.y + TUNING.handOffset
    for (const h of this.index.holds) {
      if (!h.hidden || this.revealed.has(h.id) || f.pendingReveal.has(h.id)) continue
      const dx = h.x - hx
      const dy = h.y - hy
      if (dx * dx + dy * dy <= r2) f.pendingReveal.add(h.id)
    }
  }

  private endAsSuccess(f: Flight, target: LevelElement, landX: number): void {
    this.flight = null
    const arc = f.path
    this.routeArcs.push(arc)
    const routeIndex = this.routeIndexOf(target.id)
    if (routeIndex !== null && routeIndex > this.highestRouteIndex) this.highestRouteIndex = routeIndex
    let newCamp = false
    if (isCamp(target) && (target as Ledge).y > this.lastCamp.y) {
      this.lastCampId = target.id
      newCamp = true
    }
    const isTop = target.id === this.level.route[this.level.route.length - 1]
    this.restoreCrumbled(target.id)
    this.events.emit('land', {
      id: target.id,
      kind: target.kind,
      x: this.body.x,
      y: this.body.y,
      routeIndex,
      isCamp: isCamp(target),
      isTop,
      arc,
      bigLeap: f.bigLeap,
      newCamp,
    })
    if (isTop) {
      this.elementId = target.id
      this.lastLandAt = this.t
      this.settleTo(target, landX)
      this.phase = 'sent'
      this.events.emit('send', { arc })
      return
    }
    this.arrive(target, landX, true)
  }

  private endAsWhipper(f: Flight, kind: WhipperKind, landed: LevelElement | null): void {
    this.flight = null
    const arc = f.path
    const poseId = this.choosePose()
    this.poseId = poseId
    this.chalk.push({ arc, at: this.t })
    if (this.chalk.length > 12) this.chalk.splice(0, this.chalk.length - 12)
    if (f.pendingReveal.size > 0) {
      const ids = [...f.pendingReveal]
      for (const id of ids) this.revealed.add(id)
      this.events.emit('reveal', { ids })
    }
    const target = this.nextTargetId()
    const bumped = (f.ctx.bump?.sides ?? []).some((id) => id !== 'wall' && id !== target)
    this.events.emit('whipper', {
      kind,
      spotId: f.launchId,
      arc,
      poseId,
      landedId: landed ? landed.id : null,
      launch: f.launch,
      bumped,
      gusted: f.gusted,
    })
    if (landed) {
      // A flop onto a lower ledge/hold: hold the silly pose a moment, then get up.
      this.restoreCrumbled(landed.id)
      this.elementId = landed.id
      this.lastLandAt = this.t
      if (landed.kind === 'ledge') this.body.y = landed.y
      this.flop = { t: 0, poseId }
      this.phase = 'flopped'
      this.startCrumbleIfNeeded(landed)
      return
    }
    this.startRope(poseId)
  }

  private arrive(target: LevelElement, landX: number, counted: boolean): void {
    this.elementId = target.id
    this.lastLandAt = this.t
    this.startCrumbleIfNeeded(target)
    if (target.kind === 'hold') {
      const p = hangPoint(target as Hold)
      this.body = { x: p.x, y: p.y, vx: 0, vy: 0 }
      this.phase = 'ready'
      this.events.emit('ready', { id: target.id })
      return
    }
    void counted
    this.settleTo(target, landX)
    this.phase = 'settling'
  }

  private settleTo(target: LevelElement, landX: number): void {
    if (target.kind !== 'ledge') return
    const sp = standPoint(target)
    this.body = { x: landX, y: target.y, vx: 0, vy: 0 }
    const dx = Math.abs(sp.x - landX)
    this.settle = { fromX: landX, toX: sp.x, t: 0, dur: Math.min(0.55, TUNING.settleTime + dx / 320) }
  }

  private stepSettle(dt: number): void {
    const s = this.settle
    if (!s) {
      this.phase = 'ready'
      return
    }
    s.t += dt
    const k = Math.min(1, s.t / s.dur)
    const e = k * k * (3 - 2 * k)
    this.body.x = s.fromX + (s.toX - s.fromX) * e
    if (s.toX !== s.fromX) this.facing = s.toX > s.fromX ? 1 : -1
    if (k >= 1) {
      this.settle = null
      this.body.x = s.toX
      this.phase = 'ready'
      this.events.emit('ready', { id: this.elementId })
    }
  }

  // ---------------------------------------------------------------------------------------------
  // The rope

  private startRope(poseId: string): void {
    const camp = this.lastCamp
    const sp = standPoint(camp)
    this.rope = {
      t: 0,
      fromX: this.body.x,
      fromY: this.body.y,
      anchorX: sp.x,
      anchorY: sp.y + 70,
      toX: sp.x,
      toY: sp.y,
      poseId,
    }
    this.phase = 'roped'
    this.events.emit('ropeCatch', { campId: camp.id })
  }

  /** Where the rope animation has her right now (pendulum swing, then reel in). */
  ropePosition(r: RopeAnim): { x: number; y: number } {
    const swing = TUNING.ropeSwingTime
    const reel = TUNING.ropeReelTime
    const len = Math.max(30, Math.hypot(r.fromX - r.anchorX, r.fromY - r.anchorY))
    const a0 = Math.atan2(r.fromX - r.anchorX, r.anchorY - r.fromY)
    if (r.t <= swing) {
      const k = r.t / swing
      const a = a0 * Math.cos(k * Math.PI * 1.5) * (1 - 0.55 * k)
      return { x: r.anchorX + Math.sin(a) * len, y: r.anchorY - Math.cos(a) * len }
    }
    const kEnd = 1
    const aEnd = a0 * Math.cos(kEnd * Math.PI * 1.5) * 0.45
    const sx = r.anchorX + Math.sin(aEnd) * len
    const sy = r.anchorY - Math.cos(aEnd) * len
    const k = Math.min(1, (r.t - swing) / reel)
    const e = 1 - (1 - k) * (1 - k)
    return { x: sx + (r.toX - sx) * e, y: sy + (r.toY - sy) * e + Math.sin(k * Math.PI) * 18 }
  }

  private stepRope(dt: number): void {
    const r = this.rope
    if (!r) return
    r.t += dt
    const p = this.ropePosition(r)
    this.body.x = p.x
    this.body.y = p.y
    if (r.t >= TUNING.ropeSwingTime + TUNING.ropeReelTime) {
      this.rope = null
      this.poseId = null
      this.elementId = this.lastCampId
      this.body = { x: r.toX, y: r.toY, vx: 0, vy: 0 }
      // Routes are learnable: everything that crumbled is back, and the bright line restarts at camp.
      const restored = [...this.crumbled]
      this.crumbled.clear()
      this.crumbleTimers.clear()
      if (restored.length) this.events.emit('crumbleRestored', { ids: restored })
      this.phase = 'ready'
      this.lastLandAt = this.t
      this.events.emit('ready', { id: this.elementId })
    }
  }

  private stepFlop(dt: number): void {
    const f = this.flop
    if (!f) return
    f.t += dt
    if (f.t >= 0.7) {
      this.flop = null
      this.poseId = null
      const el = this.el(this.elementId)
      if (el.kind === 'ledge') {
        this.settleTo(el, this.body.x)
        this.phase = 'settling'
      } else {
        this.phase = 'ready'
        this.events.emit('ready', { id: this.elementId })
      }
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Crumbly ledges

  private startCrumbleIfNeeded(el: LevelElement): void {
    if (el.kind !== 'ledge' || !el.crumble || this.crumbled.has(el.id)) return
    if (!this.crumbleTimers.has(el.id)) {
      this.crumbleTimers.set(el.id, 0)
      this.events.emit('crumbleStart', { id: el.id })
    }
    if (!this.foundCrumbles.has(el.id)) {
      this.foundCrumbles.add(el.id)
      this.events.emit('crumbleFound', { id: el.id })
    }
  }

  private stepCrumbles(dt: number): void {
    for (const [id, elapsed] of this.crumbleTimers) {
      const next = elapsed + dt
      if (next < TUNING.crumbleDelay) {
        this.crumbleTimers.set(id, next)
        continue
      }
      this.crumbleTimers.delete(id)
      this.crumbled.add(id)
      this.events.emit('crumbled', { id })
      const standingHere = this.elementId === id && (this.phase === 'ready' || this.phase === 'settling')
      if (standingHere) {
        this.cancelAim()
        this.pendingLaunch = null
        this.settle = null
        this.body.vx = 0
        this.body.vy = 0
        this.flight = {
          ctx: this.flightCtx(id),
          launchId: id,
          launchRestY: this.body.y,
          path: [round1(this.body.x), round1(this.body.y)],
          steps: 0,
          crumbleFall: true,
          bigLeap: false,
          pendingReveal: new Set(),
          launch: null,
          gusted: false,
        }
        this.phase = 'flying'
      }
    }
  }

  /** Landing anywhere else brings crumbled ledges back (never the one under her). */
  private restoreCrumbled(exceptId: string): void {
    if (this.crumbled.size === 0) return
    const ids = [...this.crumbled].filter((id) => id !== exceptId)
    if (ids.length === 0) return
    for (const id of ids) {
      this.crumbled.delete(id)
      this.crumbleTimers.delete(id)
    }
    this.events.emit('crumbleRestored', { ids })
  }

  /** Seconds left before the ledge she's on gives way (renderer shakes it during crumbleWarn). */
  crumbleProgress(id: string): number | null {
    const e = this.crumbleTimers.get(id)
    return e === undefined ? null : e / TUNING.crumbleDelay
  }

  // ---------------------------------------------------------------------------------------------
  // Wind

  private stepWind(t: number): void {
    for (const z of this.level.wind ?? []) {
      const now = isGusting(z, t)
      const was = this.gusting.get(z.id) ?? false
      if (now !== was) {
        this.gusting.set(z.id, now)
        this.events.emit('gust', { zoneId: z.id, starting: now })
      }
    }
  }

  // ---------------------------------------------------------------------------------------------
  // After the send (the lesson keeps going for fall practice)

  resumeAfterSend(): void {
    if (this.phase !== 'sent') return
    this.settle = null
    const el = this.el(this.elementId)
    const p = restPoint(el)
    this.body = { x: p.x, y: p.y, vx: 0, vy: 0 }
    this.phase = 'ready'
    this.events.emit('ready', { id: this.elementId })
  }

  /** Snapshot for the debug hook / tests. */
  snapshot(): {
    phase: Phase
    elementId: string
    lastCampId: string
    highestRouteIndex: number
    t: number
    x: number
    y: number
    frozen: boolean
    bigLeap: boolean
  } {
    return {
      phase: this.phase,
      elementId: this.elementId,
      lastCampId: this.lastCampId,
      highestRouteIndex: this.highestRouteIndex,
      t: this.t,
      x: this.body.x,
      y: this.body.y,
      frozen: this.frozen,
      bigLeap: this.bigLeapHere() !== null,
    }
  }
}

function isCamp(el: LevelElement): boolean {
  return el.kind === 'ledge' && !!el.camp
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}
