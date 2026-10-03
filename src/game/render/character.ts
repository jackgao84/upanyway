/**
 * The character animator: turns ClimbSession state into the climber's pose and face and the goat's
 * mood, with the juice — anticipation (the crouch), squash-and-stretch on launch and landing, little
 * settle steps, a swing when she catches a hold, follow-through on the rope, and small reactions
 * (proud after a landing, laughing after a whipper, the goat gulping before a Big Leap).
 *
 * Render-only: it reads the session (and listens to its events) but never changes it. The Renderer
 * calls draw(ctx, session, camera, t) once a frame with ctx in CSS px (the DPR transform already set).
 * Art is drawn in its local frame (y-down, feet at 0,0, 1 unit = 1 world unit), translated to
 * camera.worldToScreen(feet) and scaled by camera.scale.
 *
 * Clocks: squash/stretch and fall poses follow the pitch clock (session.t, rope.t, flop.t), so they
 * freeze with the game; breathing, blinks, sways and the night goat follow the render clock `t`.
 */
import type { ClimberLook } from '../../storage/schema'
import type { Camera } from '../camera'
import type { ClimbSession } from '../engine'
import { standPoint } from '../physics'
import { TUNING } from '../tuning'
import type { Ledge, Level } from '../types'
import { climberGoatAnchor, drawClimber, type Expression } from '../art/climber'
import { drawGoat, goatHeadAnchor, type GoatMood, type GoatState } from '../art/goat'
import { fallPose, fallPoseExpression, fallPoseGoatMood, groundLift } from '../art/fallPosesAnim'
import { cheer, crouch, fall, fly, hang, idle, land, launch, peer, sit, stand, wobble } from '../art/poses'
import {
  DEG,
  RIG,
  aimArm,
  bump,
  clamp01,
  easeOutBack,
  easeOutQuad,
  hash01,
  lerp,
  lerpPose,
  pose,
  smoothstep,
  solvePose,
  type Pose,
  type Pt,
} from '../art/rig'

/** Harness height above her feet point (world units). The rope ties on here; while the rope has
 * her, the animator pins her hips exactly to this point. */
export const HARNESS_UP = -RIG.hipY

/** World position of her harness — where the renderer should end the rope. */
export function harnessPoint(session: ClimbSession): Pt {
  return { x: session.body.x, y: session.body.y + HARNESS_UP }
}

export interface CharacterOptions {
  look: ClimberLook
  /** Night climb: a cool moonlit tint on the climber and the goat. */
  night: boolean
  /** The goat stands on its own hooves beside her (night climbs, finale) instead of riding in the pack. */
  goatOutside: boolean
}

/** How she feels about what she's looking at (Looks Scary: 'nervous' before, 'happy' after the reveal). */
export type LookFeel = 'nervous' | 'surprised' | 'happy'

type Mode = 'ground' | 'aim' | 'hang' | 'hangAim' | 'flight' | 'rope' | 'flop' | 'sent'
type Reaction = 'none' | 'land' | 'bigLand' | 'camp' | 'hop' | 'catch' | 'whip' | 'back' | 'send'

/** Landing squash (pitch-clock seconds). */
const LAND_DUR = 0.34
/** Take-off stretch (pitch-clock seconds). */
const LAUNCH_DUR = 0.14
/** Settle walk: units per step (little steps). */
const STEP_LEN = 7
/** Idle seconds before she sits down for a rest (render clock). */
const SIT_AFTER = 24
/** The goat stands this far from her feet (units). */
const GOAT_GAP = 42
const NIGHT_TINT = 'rgba(30, 40, 92, 0.24)'

// ---------------------------------------------------------------------------------------------
// Pose helpers

function copyPose(dst: Pose, src: Pose): void {
  dst.rootX = src.rootX
  dst.rootY = src.rootY
  dst.rot = src.rot
  dst.lean = src.lean
  dst.headTilt = src.headTilt
  dst.armL[0] = src.armL[0]
  dst.armL[1] = src.armL[1]
  dst.armR[0] = src.armR[0]
  dst.armR[1] = src.armR[1]
  dst.legL[0] = src.legL[0]
  dst.legL[1] = src.legL[1]
  dst.legR[0] = src.legR[0]
  dst.legR[1] = src.legR[1]
  dst.reachL = src.reachL
  dst.reachR = src.reachR
  dst.squashX = src.squashX
  dst.squashY = src.squashY
  dst.hairFloat = src.hairFloat
  dst.noodle = src.noodle ?? 0
}

/** base + (a − ref) × w for every field (squash multiplies): lays one pose's motion over another. */
function layer(base: Pose, a: Pose, ref: Pose, w: number): Pose {
  return {
    rootX: base.rootX + (a.rootX - ref.rootX) * w,
    rootY: base.rootY + (a.rootY - ref.rootY) * w,
    rot: base.rot + (a.rot - ref.rot) * w,
    lean: base.lean + (a.lean - ref.lean) * w,
    headTilt: base.headTilt + (a.headTilt - ref.headTilt) * w,
    armL: [base.armL[0] + (a.armL[0] - ref.armL[0]) * w, base.armL[1] + (a.armL[1] - ref.armL[1]) * w],
    armR: [base.armR[0] + (a.armR[0] - ref.armR[0]) * w, base.armR[1] + (a.armR[1] - ref.armR[1]) * w],
    legL: [base.legL[0] + (a.legL[0] - ref.legL[0]) * w, base.legL[1] + (a.legL[1] - ref.legL[1]) * w],
    legR: [base.legR[0] + (a.legR[0] - ref.legR[0]) * w, base.legR[1] + (a.legR[1] - ref.legR[1]) * w],
    reachL: base.reachL + (a.reachL - ref.reachL) * w,
    reachR: base.reachR + (a.reachR - ref.reachR) * w,
    squashX: base.squashX * (1 + (a.squashX / ref.squashX - 1) * w),
    squashY: base.squashY * (1 + (a.squashY / ref.squashY - 1) * w),
    hairFloat: base.hairFloat + (a.hairFloat - ref.hairFloat) * w,
    noodle: (base.noodle ?? 0) + ((a.noodle ?? 0) - (ref.noodle ?? 0)) * w,
  }
}

const STAND = stand()

function near(a: number, b: number): number {
  let d = b - a
  while (d > 180) d -= 360
  while (d < -180) d += 360
  return a + d
}

/**
 * Blend two poses the short way round: limb and spin angles are unwrapped first, so an arm going
 * from "back" to "up" swings over the top instead of sweeping out stiffly through the front.
 */
function blend(a: Pose, b: Pose, t: number): Pose {
  const w: Pose = {
    ...b,
    rot: near(a.rot, b.rot),
    armL: [near(a.armL[0], b.armL[0]), b.armL[1]],
    armR: [near(a.armR[0], b.armR[0]), b.armR[1]],
    legL: [near(a.legL[0], b.legL[0]), b.legL[1]],
    legR: [near(a.legR[0], b.legR[0]), b.legR[1]],
  }
  return lerpPose(a, w, t)
}

/** Little steps: legs swing in turn, arms swing against them, a small bob. */
function walkLayer(p: Pose, ph: number, amt: number): Pose {
  const s = Math.sin(ph)
  const liftR = Math.max(0, s)
  const liftL = Math.max(0, -s)
  return {
    ...p,
    rootY: p.rootY - Math.abs(s) * 0.7 * amt,
    lean: p.lean + 4 * amt,
    legR: [p.legR[0] + 24 * s * amt, p.legR[1] - 34 * liftR * amt],
    legL: [p.legL[0] - 24 * s * amt, p.legL[1] - 34 * liftL * amt],
    armR: [p.armR[0] - 18 * s * amt, p.armR[1] + 6 * amt],
    armL: [p.armL[0] + 18 * s * amt, p.armL[1] + 6 * amt],
  }
}

/** Being lowered back to camp: sitting in the harness, hands on the rope at her chest. */
function reelPose(t: number): Pose {
  const sw = Math.sin(t * 5)
  let p = pose({
    rootY: 1.5,
    lean: -10,
    headTilt: -6,
    legL: [62 + sw * 5, -58],
    legR: [74 - sw * 5, -66],
    hairFloat: 0.25,
  })
  p = aimArm(p, 'L', { x: 1.2, y: -28.5 }, 1, 1)
  p = aimArm(p, 'R', { x: 1.6, y: -35 }, 1, 1)
  return p
}

/** Hanging and curling up to spring: pulled up on her arms, knees tucked (power 0..1). */
/** Coming down toward a landing: arms out for balance, legs reaching for the ledge, eyes down. */
function descend(t: number): Pose {
  const w = Math.sin(t * 6) * 5
  return pose({
    lean: 3,
    headTilt: 10,
    armL: [-112 + w, -18],
    armR: [104 - w, 22],
    legL: [-8, -14],
    legR: [16, -26],
    hairFloat: 0.65,
  })
}

function hangAimPose(power: number, t: number): Pose {
  const k = clamp01(power)
  const sway = Math.sin(t * 1.6) * (1 - k)
  let p = pose({
    rootY: 11.5 - 6 * k,
    lean: -4 + 12 * k,
    headTilt: -14 - 4 * k,
    legL: [-10 + sway * 5 + 72 * k, 12 - 104 * k],
    legR: [16 + sway * 5 + 62 * k, -34 - 76 * k],
  })
  p = aimArm(p, 'L', { x: -1.8, y: -44.2 }, 1)
  p = aimArm(p, 'R', { x: 1.9, y: -44.4 }, 1)
  return p
}

/** Hanging on one hand, shaking out the other (real climbers do this to rest a tired arm). */
function shakeOut(t: number): Pose {
  const p = hang(1, t)
  return { ...p, armL: [-6 + Math.sin(t * 31) * 9, 8 + Math.sin(t * 31 + 1) * 10] }
}

// ---------------------------------------------------------------------------------------------
// Night tint: the figure is painted into one small reusable sprite, tinted there, then composited.

class TintSprite {
  private canvas: HTMLCanvasElement | null = null
  private g: CanvasRenderingContext2D | null = null

  constructor(private readonly color: string) {}

  /** Paint `paint` (which draws in ctx's own coordinates) tinted, inside a square of `half` around (cx, cy). */
  draw(ctx: CanvasRenderingContext2D, cx: number, cy: number, half: number, paint: (g: CanvasRenderingContext2D) => void): void {
    let a = 1
    let e = 0
    let f = 0
    try {
      const m = ctx.getTransform()
      if (Math.abs(m.b) > 1e-6 || Math.abs(m.c) > 1e-6) {
        paint(ctx)
        return
      }
      a = m.a
      e = m.e
      f = m.f
    } catch {
      paint(ctx)
      return
    }
    const size = Math.ceil(half * 2 * a)
    if (size <= 0 || size > 1400) {
      paint(ctx)
      return
    }
    if (!this.canvas) {
      this.canvas = document.createElement('canvas')
      this.g = this.canvas.getContext('2d')
    }
    const c = this.canvas
    const g = this.g
    if (!g) {
      paint(ctx)
      return
    }
    if (c.width < size || c.height < size) {
      const n = Math.ceil(size / 64) * 64
      c.width = n
      c.height = n
    }
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.globalCompositeOperation = 'source-over'
    g.globalAlpha = 1
    g.clearRect(0, 0, size + 2, size + 2)
    g.setTransform(a, 0, 0, a, a * (half - cx), a * (half - cy))
    paint(g)
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.globalCompositeOperation = 'source-atop'
    g.fillStyle = this.color
    g.fillRect(0, 0, size, size)
    g.globalCompositeOperation = 'source-over'
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.drawImage(c, 0, 0, size, size, Math.round(a * (cx - half) + e), Math.round(a * (cy - half) + f), size, size)
    ctx.restore()
  }

  release(): void {
    if (this.canvas) {
      this.canvas.width = 0
      this.canvas.height = 0
    }
    this.canvas = null
    this.g = null
  }
}

// ---------------------------------------------------------------------------------------------
// The standing goat is the priciest thing here to draw, and while it stands still it barely
// changes: it is cached in a small sprite and repainted at most 20 times a second (every frame
// while it hops or squashes, or when the zoom or its mood changes). Night tint is baked in.

const GOAT_BOX = { left: 22, right: 22, up: 44, down: 5 }

class GoatSprite {
  private canvas: HTMLCanvasElement | null = null
  private g: CanvasRenderingContext2D | null = null
  private paintedAt = -1
  private mood = ''
  private facing = 0
  private px = 0

  constructor(private readonly tint: string | null) {}

  draw(ctx: CanvasRenderingContext2D, sx: number, sy: number, sc: number, state: GoatState, sqx: number, sqy: number, live: boolean): void {
    let a = 1
    let e = 0
    let f = 0
    try {
      const m = ctx.getTransform()
      if (Math.abs(m.b) > 1e-6 || Math.abs(m.c) > 1e-6) return this.direct(ctx, sx, sy, sc, state, sqx, sqy)
      a = m.a
      e = m.e
      f = m.f
    } catch {
      return this.direct(ctx, sx, sy, sc, state, sqx, sqy)
    }
    const px = sc * a
    const w = Math.ceil((GOAT_BOX.left + GOAT_BOX.right) * px)
    const h = Math.ceil((GOAT_BOX.up + GOAT_BOX.down) * px)
    if (w <= 0 || h <= 0 || w > 1024 || h > 1024) return this.direct(ctx, sx, sy, sc, state, sqx, sqy)
    if (!this.canvas) {
      this.canvas = document.createElement('canvas')
      this.g = this.canvas.getContext('2d')
      this.paintedAt = -1
    }
    const c = this.canvas
    const g = this.g
    if (!g) return this.direct(ctx, sx, sy, sc, state, sqx, sqy)
    if (c.width < w || c.height < h) {
      c.width = Math.ceil(w / 32) * 32
      c.height = Math.ceil(h / 32) * 32
      this.paintedAt = -1
    }
    const stale =
      live ||
      this.paintedAt < 0 ||
      state.t - this.paintedAt > 0.05 ||
      state.t < this.paintedAt ||
      state.mood !== this.mood ||
      (state.facing ?? 1) !== this.facing ||
      Math.abs(px - this.px) > 0.01
    if (stale) {
      g.setTransform(1, 0, 0, 1, 0, 0)
      g.globalCompositeOperation = 'source-over'
      g.globalAlpha = 1
      g.clearRect(0, 0, w + 2, h + 2)
      g.setTransform(px * sqx, 0, 0, px * sqy, GOAT_BOX.left * px, GOAT_BOX.up * px)
      drawGoat(g, state)
      if (this.tint) {
        g.setTransform(1, 0, 0, 1, 0, 0)
        g.globalCompositeOperation = 'source-atop'
        g.fillStyle = this.tint
        g.fillRect(0, 0, w, h)
        g.globalCompositeOperation = 'source-over'
      }
      this.paintedAt = state.t
      this.mood = state.mood
      this.facing = state.facing ?? 1
      this.px = px
    }
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.drawImage(c, 0, 0, w, h, Math.round(a * sx + e - GOAT_BOX.left * px), Math.round(a * sy + f - GOAT_BOX.up * px), w, h)
    ctx.restore()
  }

  private direct(ctx: CanvasRenderingContext2D, sx: number, sy: number, sc: number, state: GoatState, sqx: number, sqy: number): void {
    ctx.save()
    ctx.translate(sx, sy)
    ctx.scale(sc * sqx, sc * sqy)
    drawGoat(ctx, state)
    ctx.restore()
  }

  release(): void {
    if (this.canvas) {
      this.canvas.width = 0
      this.canvas.height = 0
    }
    this.canvas = null
    this.g = null
  }
}

// ---------------------------------------------------------------------------------------------
// The goat outside the pack (night climbs, finale): render-only, a delayed mirror of her leaps.

interface GoatHop {
  fx: number
  fy: number
  tx: number
  ty: number
  start: number
  dur: number
  h: number
  ledgeId: string | null
  intoPack: boolean
  long: boolean
}

function goatSpot(ledge: Ledge, herX: number, side: 1 | -1): number {
  const minX = ledge.x + 8
  const maxX = ledge.x + ledge.w - 8
  let gx = herX + side * GOAT_GAP
  if (gx < minX || gx > maxX) gx = herX - side * GOAT_GAP
  return Math.max(minX, Math.min(maxX, gx))
}

class OutsideGoat {
  x = 0
  y = 0
  ledgeId: string | null = null
  inPack = false
  hop: GoatHop | null = null
  waitSince = -1
  waitLong = false
  landedAt = -99
  hopEndedAt = -99
  facing: 1 | -1 = 1
  private packX = 0
  private packY = 0

  /** Start beside her if she stands on a ledge, else in the pack. `fromPack`: climb out of it first. */
  reset(s: ClimbSession, fromPack: boolean): void {
    this.hop = null
    this.waitSince = -1
    this.landedAt = -99
    this.hopEndedAt = -99
    const el = s.el(s.elementId)
    if (el.kind === 'ledge' && !fromPack) {
      this.inPack = false
      this.ledgeId = el.id
      this.y = el.y
      this.x = goatSpot(el, standPoint(el).x, s.facing === 1 ? -1 : 1)
      this.facing = this.x < s.body.x ? 1 : -1
    } else {
      this.inPack = true
      this.ledgeId = null
    }
  }

  private startHop(tx: number, ty: number, ledgeId: string | null, intoPack: boolean, t: number): void {
    const fx = this.inPack ? this.packX : this.x
    const fy = this.inPack ? this.packY : this.y
    const dist = Math.hypot(tx - fx, ty - fy)
    const rise = ty - fy
    const h = Math.max(14 + dist * 0.12, rise * 0.62 + 20)
    this.hop = {
      fx,
      fy,
      tx,
      ty,
      start: t,
      dur: Math.min(0.95, 0.34 + dist / 950),
      h,
      ledgeId,
      intoPack,
      long: dist > 80,
    }
    this.inPack = false
    this.ledgeId = null
    if (Math.abs(tx - fx) > 3) this.facing = tx > fx ? 1 : -1
  }

  /** Advance on the render clock. `pack` is where her backpack rim is (world). */
  update(s: ClimbSession, t: number, pack: Pt): void {
    this.packX = pack.x
    this.packY = pack.y
    const h = this.hop
    if (h) {
      if (t - h.start < h.dur) return
      this.hop = null
      this.hopEndedAt = t
      if (h.intoPack) {
        this.inPack = true
        this.ledgeId = null
      } else {
        this.x = h.tx
        this.y = h.ty
        this.ledgeId = h.ledgeId
        this.landedAt = t
      }
    }

    const el = s.el(s.elementId)
    const settled = (s.phase === 'ready' || s.phase === 'settling' || s.phase === 'sent') && el.kind === 'ledge'
    if (settled && !s.crumbled.has(el.id)) {
      const ledge = el as Ledge
      const herX = s.phase === 'settling' && s.settle ? s.settle.toX : s.body.x
      const here =
        !this.inPack &&
        this.ledgeId === ledge.id &&
        Math.abs(this.x - herX) >= GOAT_GAP - 9 &&
        this.x >= ledge.x + 4 &&
        this.x <= ledge.x + ledge.w - 4
      if (here) {
        this.waitSince = -1
        this.facing = herX >= this.x ? 1 : -1
        return
      }
      const side: 1 | -1 = !this.inPack && this.ledgeId === ledge.id ? (this.x < herX ? -1 : 1) : s.facing === 1 ? -1 : 1
      const tx = goatSpot(ledge, herX, side)
      const fx = this.inPack ? pack.x : this.x
      const fy = this.inPack ? pack.y : this.y
      const dist = Math.hypot(tx - fx, ledge.y - fy)
      if (this.waitSince < 0) this.waitSince = t
      this.waitLong = !this.inPack && dist > 80
      // A short beat before following; a longer one (knees knocking) before a big hop.
      const delay = this.inPack ? 0.3 : this.waitLong ? 0.5 : 0.28
      if (t - this.waitSince >= delay) {
        this.waitSince = -1
        this.waitLong = false
        this.startHop(tx, ledge.y, ledge.id, false, t)
      }
      return
    }
    this.waitSince = -1
    this.waitLong = false
    // She's in the air, hanging, or on the rope. The goat waits where it is — unless its ledge is
    // crumbling away, or she has climbed far off on holds: then it hops into her pack for a ride.
    if (!this.inPack && this.ledgeId) {
      const crumbling = s.crumbled.has(this.ledgeId) || (s.crumbleProgress(this.ledgeId) ?? 0) > 0.8
      const far = s.isHanging() && Math.hypot(pack.x - this.x, pack.y - this.y) > 170
      if (crumbling || far) this.startHop(pack.x, pack.y, null, true, t)
    }
  }

  /** Where the goat is drawn (world feet), or null while it rides in the pack. */
  position(t: number, out: Pt): Pt | null {
    const h = this.hop
    if (h) {
      const k = clamp01((t - h.start) / h.dur)
      const tx = h.intoPack ? this.packX : h.tx
      const ty = h.intoPack ? this.packY : h.ty
      out.x = lerp(h.fx, tx, k)
      out.y = lerp(h.fy, ty, k) + h.h * 4 * k * (1 - k)
      return out
    }
    if (this.inPack) return null
    out.x = this.x
    out.y = this.y
    return out
  }
}

// ---------------------------------------------------------------------------------------------

export class CharacterAnimator {
  private look: ClimberLook
  private goatOutside: boolean
  private session: ClimbSession | null = null
  private unsubs: (() => void)[] = []
  private readonly seed: number

  // Mode + crossfade (render clock).
  private mode: Mode = 'ground'
  private modeAt = 0
  private blendDur = 0
  private readonly blendFrom: Pose = pose()
  private readonly last: Pose = pose()
  private hasLast = false

  // Reactions (pitch clock).
  private react: Reaction = 'none'
  private reactAt = -99
  private aimStartAt = -99
  private revealAt = -99
  private flightBig = false
  private flightCrumble = false
  private flightFromY = 0
  private flightVx = 0
  private flightVy = 0
  private impact = 0.7
  private catchAt = -99
  private catchSwing = 0

  // Facing: she turns to look at the next target while idle (render-only).
  private facing: 1 | -1 = 1
  private turnAt = -99
  private idleSince = 0

  // A scripted look (Looks Scary moments): world point, feeling, render-clock window.
  private lookTarget: { x: number; y: number; feel: LookFeel; dur: number; from: number } | null = null

  private readonly goat = new OutsideGoat()
  private readonly goatSprite: GoatSprite
  private readonly tint: TintSprite | null
  private goatAt: Pt | null = null
  private readonly tmp: Pt = { x: 0, y: 0 }

  constructor(opts: CharacterOptions) {
    this.look = opts.look
    this.goatOutside = opts.goatOutside
    this.tint = opts.night ? new TintSprite(NIGHT_TINT) : null
    this.goatSprite = new GoatSprite(opts.night ? NIGHT_TINT : null)
    this.seed = hash01(`${opts.look.hairStyle}|${opts.look.outfit}|${opts.look.skinTone}`)
  }

  setLook(look: ClimberLook): void {
    this.look = look
  }

  /** Let the goat out of the pack (it climbs out and hops down beside her) or back in. */
  setGoatOutside(on: boolean): void {
    if (on === this.goatOutside) return
    this.goatOutside = on
    if (on && this.session) this.goat.reset(this.session, true)
  }

  /**
   * For `seconds`, she and the goat look at a world point (the Looks Scary thing: the glowing eyes,
   * the snoring cave, the big shadow) with that feeling. Only while she stands or hangs.
   */
  lookAt(x: number, y: number, seconds: number, feel: LookFeel = 'nervous'): void {
    this.lookTarget = { x, y, feel, dur: Math.max(0, seconds), from: Number.NaN }
  }

  /** Screen position (CSS px) of the goat's head at the last draw — for the goat's speech bubble. */
  goatScreen(): Pt | null {
    return this.goatAt ? { x: this.goatAt.x, y: this.goatAt.y } : null
  }

  destroy(): void {
    this.detach()
    this.tint?.release()
    this.goatSprite.release()
  }

  // -------------------------------------------------------------------------------------------

  draw(ctx: CanvasRenderingContext2D, session: ClimbSession, camera: Camera, t: number): void {
    const s = session
    if (s !== this.session) this.attach(s, t)
    if (s.phase === 'flying') {
      this.flightVx = s.body.vx
      this.flightVy = s.body.vy
    }

    const mode = this.modeOf(s)
    if (mode !== this.mode) this.enterMode(mode, s, t)
    const lk = this.lookTarget
    if (lk) {
      if (Number.isNaN(lk.from)) lk.from = t
      if (t - lk.from > lk.dur) this.lookTarget = null
    }
    const facing = this.facingFor(mode, s, t)

    let p = this.poseFor(mode, s, t, facing)
    if (this.blendDur > 0) {
      const k = (t - this.modeAt) / this.blendDur
      if (k < 1) p = blend(this.blendFrom, p, smoothstep(k))
    }
    // A quick squash as she turns round.
    const turn = (t - this.turnAt) / 0.16
    if (turn >= 0 && turn < 1) p = { ...p, squashX: p.squashX * (0.84 + 0.16 * easeOutBack(turn)) }
    copyPose(this.last, p)
    this.hasLast = true

    const expression = this.expressionFor(mode, s, t)
    const gaze = this.gazeFor(mode, s, facing, expression)

    // Where to stand her, and any swing about a pivot (local units).
    let wx = s.body.x
    let wy = s.body.y
    let rot = 0
    const pivotX = 0
    let pivotY = 0
    let offX = 0
    let offY = 0
    const el = s.el(s.elementId)
    if ((mode === 'hang' || mode === 'hangAim') && el.kind === 'hold') {
      // Hands on the hold, always (a flop onto a hold leaves the body where the hand met it).
      wx = el.x
      wy = el.y - TUNING.handOffset
      pivotY = -TUNING.handOffset
      const since = s.t - this.catchAt
      if (since >= 0 && since < 2) rot -= this.catchSwing * 15 * Math.exp(-2.6 * since) * Math.sin(since * 8.5)
      if (mode === 'hangAim' && s.aim && !s.aim.cancel) rot += Math.cos(s.aim.angle * DEG) * 11 * s.aim.power
    } else if (mode === 'rope' && s.rope) {
      // Pin her hips to the harness, tip her along the rope.
      const sk = solvePose(p)
      offX = -sk.hip.x * p.squashX * facing
      offY = RIG.hipY - sk.hip.y * p.squashY
      pivotY = RIG.hipY
      const ang = Math.atan2(s.rope.anchorX - s.body.x, s.rope.anchorY - s.body.y) / DEG
      rot = Math.max(-50, Math.min(50, ang * 0.55))
    } else if (mode === 'flop' && el.kind === 'ledge') {
      // Keep the flop on top of the ledge, not sunk into it.
      offY = Math.min(0, groundLift(p))
    }
    const grounded = el.kind === 'ledge' && (mode === 'ground' || mode === 'aim' || mode === 'sent' || mode === 'flop')

    const sp = camera.worldToScreen(wx, wy)
    const sc = camera.scale

    // The goat beside her (night/finale), or riding in the pack.
    let goatInPack: GoatState | null = null
    let goatWorld: Pt | null = null
    if (this.goatOutside) {
      const anchor = climberGoatAnchor(p, facing)
      this.tmp.x = wx + anchor.x
      this.tmp.y = wy - anchor.y - 4
      this.goat.update(s, t, this.tmp)
      goatWorld = this.goat.position(t, this.tmp)
      if (!goatWorld && !this.goat.hop) goatInPack = this.packGoat(mode, s, t, facing)
    } else {
      goatInPack = this.packGoat(mode, s, t, facing)
    }

    if (goatWorld) this.drawOutsideGoat(ctx, s, camera, t, goatWorld, mode)

    const look = this.look
    const paint = (g: CanvasRenderingContext2D) => {
      g.save()
      g.translate(sp.x, sp.y)
      g.scale(sc, sc)
      if (grounded) {
        const hopUp = Math.max(0, -p.rootY) * 0.04
        g.fillStyle = 'rgba(52, 30, 46, 0.2)'
        g.beginPath()
        g.ellipse(0, 0.6, Math.max(4, 9.5 - hopUp * 30) * p.squashX, 2.1, 0, 0, Math.PI * 2)
        g.fill()
      }
      if (rot !== 0) {
        g.translate(pivotX, pivotY)
        g.rotate(rot * DEG)
        g.translate(-pivotX, -pivotY)
      }
      if (offX !== 0 || offY !== 0) g.translate(offX, offY)
      drawClimber(g, { look, pose: p, expression, facing, t, goat: goatInPack, gaze })
      g.restore()
    }
    if (this.tint) this.tint.draw(ctx, sp.x, sp.y - 24 * sc, 62 * sc, paint)
    else paint(ctx)

    // Goat head on screen (for the speech bubble).
    if (goatInPack) {
      const a = climberGoatAnchor(p, facing)
      const r = rot * DEG
      const lx = a.x + offX - pivotX
      const ly = a.y + offY - pivotY
      const rx = lx * Math.cos(r) - ly * Math.sin(r) + pivotX
      const ry = lx * Math.sin(r) + ly * Math.cos(r) + pivotY
      this.goatAt = { x: sp.x + rx * sc, y: sp.y + ry * sc }
    } else if (goatWorld) {
      const gs = camera.worldToScreen(goatWorld.x, goatWorld.y)
      const mood = this.outsideMood(s, t)
      const a = goatHeadAnchor({ inBackpack: false, mood, facing: this.goat.facing })
      this.goatAt = { x: gs.x + a.x * sc, y: gs.y + a.y * sc }
    } else {
      this.goatAt = null
    }
  }

  // -------------------------------------------------------------------------------------------
  // Session wiring

  private attach(s: ClimbSession, t: number): void {
    this.detach()
    this.session = s
    this.mode = this.modeOf(s)
    this.modeAt = t
    this.idleSince = t
    this.hasLast = false
    this.blendDur = 0
    this.react = 'none'
    this.reactAt = -99
    this.facing = s.facing
    this.turnAt = -99
    this.catchAt = -99
    this.goat.reset(s, false)
    const ev = s.events
    this.unsubs.push(
      ev.on('aimStart', () => {
        this.aimStartAt = s.t
      }),
      ev.on('launch', (e) => {
        this.flightBig = e.bigLeap
        this.flightCrumble = false
        this.flightFromY = s.body.y
      }),
      ev.on('land', (e) => {
        this.impact = clamp01(0.4 + -this.flightVy / 950)
        if (e.kind === 'hold') {
          this.catchAt = s.t
          this.catchSwing = Math.max(-1, Math.min(1, this.flightVx / 480))
          this.setReact('catch', s)
        } else this.setReact(e.bigLeap ? 'bigLand' : e.newCamp ? 'camp' : 'land', s)
      }),
      ev.on('hop', () => {
        this.impact = clamp01(0.3 + -this.flightVy / 1100)
        this.setReact('hop', s)
      }),
      ev.on('whipper', () => {
        this.impact = 1
        this.setReact('whip', s)
      }),
      ev.on('reveal', () => {
        this.revealAt = s.t
      }),
      ev.on('ready', () => {
        if (this.react === 'whip') this.setReact('back', s)
      }),
      ev.on('send', () => this.setReact('send', s)),
    )
  }

  private detach(): void {
    for (const off of this.unsubs) off()
    this.unsubs = []
    this.session = null
  }

  private setReact(r: Reaction, s: ClimbSession): void {
    this.react = r
    this.reactAt = s.t
  }

  private since(r: Reaction, s: ClimbSession): number {
    return this.react === r ? s.t - this.reactAt : Infinity
  }

  // -------------------------------------------------------------------------------------------
  // Modes

  private modeOf(s: ClimbSession): Mode {
    switch (s.phase) {
      case 'sent':
        return 'sent'
      case 'roped':
        return 'rope'
      case 'flopped':
        return 'flop'
      case 'flying':
        return 'flight'
      case 'settling':
        return 'ground'
      default: {
        const hanging = s.isHanging()
        if (s.aim) return hanging ? 'hangAim' : 'aim'
        return hanging ? 'hang' : 'ground'
      }
    }
  }

  private enterMode(next: Mode, s: ClimbSession, t: number): void {
    const prev = this.mode
    this.blendDur = this.hasLast ? blendTime(prev, next) : 0
    if (this.hasLast) copyPose(this.blendFrom, this.last)
    this.mode = next
    this.modeAt = t
    if (next === 'ground' || next === 'hang') this.idleSince = t
    if (next === 'flight' && s.t - s.lastLaunchAt > 0.05) {
      // No launch: the crumbly ledge gave way under her.
      this.flightBig = false
      this.flightCrumble = true
      this.flightFromY = s.body.y
    }
  }

  private facingFor(mode: Mode, s: ClimbSession, t: number): 1 | -1 {
    let want: 1 | -1 = s.facing
    if ((mode === 'ground' && s.phase === 'ready') || mode === 'hang') {
      want = this.facing
      const tgt = this.lookTarget ?? this.targetPos(s)
      if (tgt && t - this.idleSince > 0.45) {
        const dx = tgt.x - s.body.x
        if (Math.abs(dx) > 22) want = dx > 0 ? 1 : -1
      }
    } else if ((mode === 'aim' || mode === 'hangAim') && s.aim?.cancel) {
      want = this.facing
    }
    if (want !== this.facing) {
      this.facing = want
      this.turnAt = t
    }
    return this.facing
  }

  private targetPos(s: ClimbSession): Pt | null {
    const id = s.nextTargetId()
    if (!id) return null
    const el = s.index.byId.get(id)
    if (!el) return null
    return el.kind === 'ledge' ? standPoint(el) : { x: el.x, y: el.y }
  }

  private bigLeapSpot(s: ClimbSession): boolean {
    return s.bigLeapHere() !== null
  }

  /** The gust where she is (see gustAt). */
  private windAt(s: ClimbSession): number {
    return gustAt(s.level, s.body.x, s.body.y, s.t)
  }

  /** 0..1 while the ledge under her is about to give way. */
  private crumbleWarn(s: ClimbSession): number {
    if (s.phase !== 'ready' && s.phase !== 'settling') return 0
    const pr = s.crumbleProgress(s.elementId)
    if (pr === null) return 0
    const w0 = 1 - TUNING.crumbleWarn / TUNING.crumbleDelay
    return clamp01((pr - w0) / (1 - w0))
  }

  // -------------------------------------------------------------------------------------------
  // Poses

  private poseFor(mode: Mode, s: ClimbSession, t: number, facing: 1 | -1): Pose {
    switch (mode) {
      case 'aim':
        return this.aimPose(s, t, facing)
      case 'hangAim': {
        const a = s.aim
        return hangAimPose(a && !a.cancel ? a.power : 0, t)
      }
      case 'hang':
        return this.hangPose(s, t)
      case 'flight':
        return this.flightPose(s, t, facing)
      case 'rope':
        return this.ropePose(s, t)
      case 'flop':
        return this.flopPose(s, t)
      case 'sent':
        return this.sentPose(s, t)
      default:
        return this.groundPose(s, t, facing)
    }
  }

  private landLayer(p: Pose, s: ClimbSession): Pose {
    const dl = s.t - s.lastLandAt
    if (dl < 0 || dl >= LAND_DUR) return p
    return layer(p, land(dl / LAND_DUR), STAND, 0.45 + 0.75 * this.impact)
  }

  private groundPose(s: ClimbSession, t: number, facing: 1 | -1): Pose {
    const tt = t + this.seed * 9
    let p = idle(tt)
    const idleFor = s.phase === 'ready' ? t - this.idleSince : 0

    if (this.bigLeapSpot(s)) {
      // Looks over the edge (gulp), then sets her eyes on the far side — and back again.
      const cyc = (t - this.idleSince) % 4.6
      const w = smoothstep(cyc / 0.35) * (1 - smoothstep((cyc - 1.9) / 0.35))
      if (w > 0) p = blend(p, peer(tt), w)
      p = wobble(tt, p, 0.28)
    } else if (idleFor > SIT_AFTER) {
      // A rest: she sits down on the ledge until she's ready to go again.
      p = blend(p, sit(tt), smoothstep((idleFor - SIT_AFTER) / 0.6))
    }

    const warn = this.crumbleWarn(s)
    if (warn > 0) p = wobble(tt, p, 0.25 + 0.6 * warn)

    // Bracing into a gust: lean toward where it comes from, arms pulled in.
    const wind = this.windAt(s)
    if (wind !== 0) {
      const into = -wind * facing
      const k = Math.abs(wind)
      p = {
        ...p,
        lean: p.lean + into * 14 * k,
        headTilt: p.headTilt + into * 4 * k,
        armL: [p.armL[0] - 12 * k, p.armL[1] + 40 * k],
        armR: [p.armR[0] - 8 * k, p.armR[1] + 46 * k],
        rootX: p.rootX - into * 1.4 * k,
        rootY: p.rootY + 1.6 * k,
        squashY: p.squashY * (1 - 0.03 * k),
        hairFloat: Math.max(p.hairFloat, 0.35 * k),
      }
    }

    // Settle: little steps to her stand point.
    const st = s.settle
    if (s.phase === 'settling' && st) {
      const total = Math.abs(st.toX - st.fromX)
      if (total > 1.5) {
        const k = clamp01(st.t / st.dur)
        const dist = Math.abs(s.body.x - st.fromX)
        const amt = Math.min(1, total / 8) * Math.min(1, bump(k) * 1.6)
        p = walkLayer(p, (dist / STEP_LEN) * Math.PI, amt)
      }
    }

    // Look up toward the next target (or whatever she's been asked to look at).
    const tgt = this.lookTarget ?? this.targetPos(s)
    if (tgt && s.phase === 'ready' && idleFor <= SIT_AFTER) {
      const dx = (tgt.x - s.body.x) * facing
      const dy = tgt.y - (s.body.y + 40)
      if (dx > -10) {
        const elev = Math.atan2(dy, Math.max(20, Math.abs(dx))) / DEG
        p = { ...p, headTilt: p.headTilt - Math.max(-10, Math.min(16, elev * 0.32)) }
      }
    }

    // Proud: chest out, chin up, for a moment after a good landing.
    const proud = this.proudAmount(s)
    if (proud > 0) p = { ...p, lean: p.lean - 4 * proud, headTilt: p.headTilt - 6 * proud }

    return this.landLayer(p, s)
  }

  private proudAmount(s: ClimbSession): number {
    const r = this.react
    if (r !== 'land' && r !== 'camp' && r !== 'bigLand' && r !== 'catch') return 0
    const d = s.t - this.reactAt
    const dur = r === 'land' || r === 'catch' ? 1.2 : 1.9
    if (d < 0.18 || d > dur) return 0
    return smoothstep((d - 0.18) / 0.2) * (1 - smoothstep((d - dur + 0.3) / 0.3))
  }

  private aimPose(s: ClimbSession, t: number, facing: 1 | -1): Pose {
    const a = s.aim
    if (!a) return idle(t)
    const pw = a.cancel ? Math.min(a.power, 0.3) * 0.4 : a.power
    let p = crouch(pw, a.angle, facing)
    // Pulled back like a slingshot: a squat with the chest kept up, leaning away from where she'll
    // fly (and so the goat can still peek out over her shoulder).
    const fwd = Math.cos(a.angle * DEG) * facing
    const lean = p.lean * 0.42 - fwd * 7 * pw
    p = { ...p, rootX: p.rootX - fwd * 1.8 * pw, lean, headTilt: p.headTilt + (p.lean - lean) * 0.7 }
    if (pw > 0.82) {
      // Straining at full stretch.
      const k = (pw - 0.82) / 0.18
      p = { ...p, rootX: p.rootX + Math.sin(t * 52) * 0.22 * k }
    }
    if (this.bigLeapSpot(s)) {
      // Knees knocking (visual only — the leap itself is exactly as accurate).
      p = wobble(t, p, 1)
      p = { ...p, rootY: p.rootY + Math.abs(Math.sin(t * 13)) * 0.9, squashY: p.squashY * (1 - 0.02 * Math.abs(Math.sin(t * 13))) }
    }
    const warn = this.crumbleWarn(s)
    if (warn > 0) p = wobble(t, p, 0.4 * warn)
    const wind = this.windAt(s)
    if (wind !== 0) p = { ...p, lean: p.lean - wind * facing * 6 * Math.abs(wind) }
    return p
  }

  private hangPose(s: ClimbSession, t: number): Pose {
    const since = s.t - this.catchAt
    if (since >= 0 && since < 0.4) {
      // Catches with one hand, the other hand slaps on a beat later.
      const k = smoothstep((since - 0.1) / 0.22)
      return k <= 0 ? hang(1, t) : blend(hang(1, t), hang(2, t), k)
    }
    const cyc = (t + this.seed * 5) % 8
    if (cyc > 5.8 && cyc < 7.2) {
      const so = smoothstep(bump((cyc - 5.8) / 1.4) * 2.2)
      return blend(hang(2, t), shakeOut(t), so)
    }
    return hang(2, t)
  }

  private flightPose(s: ClimbSession, t: number, facing: 1 | -1): Pose {
    const vy = s.body.vy
    const vx = s.body.vx
    const rise = smoothstep((vy + 140) / 380)
    // Descending: ready to land, unless she's dropping well below where she leapt from (a real fall).
    const drop = this.flightCrumble ? 1 : smoothstep((this.flightFromY - 25 - s.body.y) / 60) * smoothstep((-vy - 250) / 200)
    const down = drop <= 0 ? descend(t) : drop >= 1 ? fall(t) : blend(descend(t), fall(t), drop)
    let p = rise >= 1 ? fly(t) : rise <= 0 ? down : blend(down, fly(t), rise)
    const since = s.t - s.lastLaunchAt
    if (!this.flightCrumble && since >= 0 && since < LAUNCH_DUR) {
      const k = since / LAUNCH_DUR
      p = blend(launch(), p, easeOutQuad(k))
      const pw = s.lastLaunch?.power ?? 0.6
      const amp = 0.5 + 0.8 * pw
      p = { ...p, squashX: 1 + (p.squashX - 1) * amp, squashY: 1 + (p.squashY - 1) * amp }
    } else {
      // A touch of stretch along fast flight.
      const speed = Math.hypot(vx, vy)
      const st = Math.max(0, Math.min(0.05, (speed - 450) / 6000))
      p = { ...p, squashY: p.squashY * (1 + st), squashX: p.squashX * (1 - st * 0.6) }
    }
    // Lean into the leap while rising; tip back as she drops.
    const fwd = (vx * facing) / TUNING.maxPower
    const lean = rise * Math.max(-0.5, Math.min(1, fwd)) * 9 - (1 - rise) * 5
    // A gust shoves her sideways: her body tips with the push.
    const wind = this.windAt(s)
    return { ...p, rot: p.rot + lean + wind * facing * 10 * Math.abs(wind) }
  }

  private ropePose(s: ClimbSession, t: number): Pose {
    const r = s.rope
    if (!r) return fall(t)
    let p = fallPose(s.poseId ?? r.poseId, r.t)
    const reel = (r.t - TUNING.ropeSwingTime) / TUNING.ropeReelTime
    if (reel > 0) p = blend(p, reelPose(t), smoothstep(reel * 1.4))
    return p
  }

  private flopPose(s: ClimbSession, t: number): Pose {
    const f = s.flop
    if (!f) return fall(t)
    let p = fallPose(s.poseId ?? f.poseId, f.t)
    // Flat on her back for a moment (the pose's own spin wins if it has one), then up she gets.
    const lie = Math.abs(p.rot) < 45 ? -62 * smoothstep(f.t / 0.12) : 0
    p = { ...p, rot: p.rot + lie }
    if (f.t < 0.22) {
      const k = easeOutBack(f.t / 0.22, 2.4)
      p = { ...p, squashY: p.squashY * (0.78 + 0.22 * k), squashX: p.squashX * (1.16 - 0.16 * k) }
    }
    const up = smoothstep((f.t - 0.42) / 0.28)
    if (up > 0) p = blend(p, STAND, up)
    return p
  }

  private sentPose(s: ClimbSession, t: number): Pose {
    const dl = s.t - s.lastLandAt
    let p = cheer(t)
    if (dl >= 0 && dl < 0.3) p = blend(STAND, p, smoothstep(dl / 0.3))
    return this.landLayer(p, s)
  }

  // -------------------------------------------------------------------------------------------
  // Faces

  private expressionFor(mode: Mode, s: ClimbSession, t: number): Expression {
    switch (mode) {
      case 'sent':
        return 'laughing'
      case 'rope': {
        const r = s.rope
        if (!r) return 'laughing'
        if (r.t < 0.14) return 'surprised'
        // Each flop has its own face; being lowered back to camp, she's laughing.
        return r.t < TUNING.ropeSwingTime + 0.08 ? fallPoseExpression(s.poseId ?? r.poseId, r.t) : 'laughing'
      }
      case 'flop': {
        const f = s.flop
        if (!f) return 'laughing'
        if (f.t < 0.16) return 'oof'
        return f.t < 0.45 ? fallPoseExpression(s.poseId ?? f.poseId, f.t) : 'laughing'
      }
      case 'flight': {
        if (this.flightCrumble) return 'surprised'
        if (Math.abs(this.windAt(s)) > 0.6) return 'surprised'
        if (s.body.vy < -260 && s.body.y < this.flightFromY - 45) return 'surprised'
        if (this.flightBig) return 'scared-but-going'
        return s.body.vy > 60 ? 'determined' : 'focused'
      }
      case 'aim':
      case 'hangAim': {
        const a = s.aim
        const big = this.bigLeapSpot(s)
        if (!a || a.cancel) return big ? 'nervous' : 'happy'
        if (big) return 'scared-but-going'
        if (this.crumbleWarn(s) > 0.3) return 'scared-but-going'
        return a.power > 0.32 ? 'determined' : 'focused'
      }
      case 'hang': {
        if (this.lookTarget) return this.lookTarget.feel
        if (this.since('catch', s) < 1.0) return 'proud'
        return 'determined'
      }
      default:
        return this.groundExpression(s, t)
    }
  }

  private groundExpression(s: ClimbSession, t: number): Expression {
    if (this.lookTarget && s.phase === 'ready') return this.lookTarget.feel
    const d = s.t - this.reactAt
    switch (this.react) {
      case 'land':
      case 'camp':
        if (d < 0.14 && this.impact > 0.8) return 'oof'
        if (d < (this.react === 'camp' ? 1.7 : 1.2)) return 'proud'
        break
      case 'bigLand':
        if (d < 0.75) return 'laughing'
        if (d < 1.9) return 'proud'
        break
      case 'hop':
        if (d < 0.7) return 'happy'
        break
      case 'whip':
        // A flop: getting up and settling.
        return 'laughing'
      case 'back':
        if (d < 0.6) return 'laughing'
        break
      default:
        break
    }
    if (this.crumbleWarn(s) > 0) return 'nervous'
    if (Math.abs(this.windAt(s)) > 0.5) return 'focused'
    if (this.bigLeapSpot(s)) {
      const cyc = (t - this.idleSince) % 4.6
      return cyc < 2.1 ? 'nervous' : 'determined'
    }
    if (s.phase === 'ready') {
      const idleFor = t - this.idleSince
      if (idleFor > SIT_AFTER) return 'happy'
      // The odd yawn while she waits.
      if (idleFor > 14 && (idleFor - 14) % 9 < 1.5) return 'sleepy'
    }
    return 'happy'
  }

  /** Where her eyes look (local −1..1), or undefined for the expression's own gaze. */
  private gazeFor(mode: Mode, s: ClimbSession, facing: 1 | -1, expression: Expression): Pt | undefined {
    if (mode === 'ground' || mode === 'hang') {
      if (s.phase !== 'ready') return undefined
      const lk = this.lookTarget
      if (lk) return this.dirGaze(lk.x - s.body.x, lk.y - (s.body.y + 40), facing)
      // At a Big Leap she peers down into the gap when she's nervous.
      if (expression === 'nervous' && this.bigLeapSpot(s)) return { x: 0.55, y: 0.8 }
      const tgt = this.targetPos(s)
      if (!tgt) return undefined
      return this.dirGaze(tgt.x - s.body.x, tgt.y - (s.body.y + 40), facing)
    }
    if (mode === 'aim' || mode === 'hangAim') {
      const a = s.aim
      if (!a || a.cancel) return undefined
      return { x: Math.cos(a.angle * DEG) * facing * 0.9, y: -Math.sin(a.angle * DEG) * 0.8 }
    }
    if (mode === 'flight') {
      const v = s.body
      return this.dirGaze(v.vx, v.vy, facing)
    }
    return undefined
  }

  private dirGaze(dx: number, dy: number, facing: 1 | -1): Pt {
    const d = Math.max(1e-3, Math.hypot(dx, dy))
    return { x: ((dx * facing) / d) * 0.85, y: (-dy / d) * 0.8 }
  }

  // -------------------------------------------------------------------------------------------
  // The goat

  /** The goat riding in her pack. */
  private packGoat(mode: Mode, s: ClimbSession, t: number, facing: 1 | -1): GoatState {
    let mood: GoatMood = 'peek'
    let earFlap = 0
    let lookX = 0.55
    let lookY = -0.1
    let sink = 0
    switch (mode) {
      case 'sent':
        mood = 'proud'
        break
      case 'rope': {
        // Ears flapping all the way down; the flop decides the face (mostly WHEEE).
        const r = s.rope
        const swinging = !r || r.t < TUNING.ropeSwingTime
        mood = !r || r.t < 0.18 ? 'wheee' : swinging ? fallPoseGoatMood(s.poseId ?? r.poseId) : 'laugh'
        earFlap = swinging ? 1 : 0.4
        break
      }
      case 'flop': {
        const f = s.flop
        const early = !f || f.t < 0.35
        mood = early ? 'wheee' : 'laugh'
        earFlap = early ? 1 : 0
        break
      }
      case 'flight':
        if (this.flightBig) mood = 'cover-eyes'
        else {
          mood = 'wheee'
          earFlap = s.body.vy < 0 ? clamp01(0.35 + -s.body.vy / 700) : 0.25
        }
        break
      case 'aim':
      case 'hangAim': {
        if (this.bigLeapSpot(s)) mood = s.t - this.aimStartAt < 1.1 ? 'gulp' : 'cover-eyes'
        else mood = 'nervous'
        // It pops up over her shoulder to see what she's about to do.
        const k = clamp01((s.t - this.aimStartAt) / 0.25)
        sink = -(mood === 'nervous' ? 2.6 : 3.4) * k
        break
      }
      case 'hang':
        mood = this.since('catch', s) < 1.2 ? 'happy' : 'nervous'
        break
      default:
        mood = this.restingGoatMood(s, t)
    }
    // Gusts flap its ears and make it hang on tight.
    const wind = Math.abs(this.windAt(s))
    if (wind > 0.5) {
      earFlap = Math.max(earFlap, wind)
      if (mood === 'peek' || mood === 'happy' || mood === 'sleepy') mood = 'nervous'
    }
    const lk = this.lookTarget
    if (lk && (mode === 'ground' || mode === 'hang') && s.phase === 'ready') mood = lookGoatMood(lk.feel)
    const tgt = lk ?? this.targetPos(s)
    if (tgt && (mode === 'ground' || mode === 'hang' || mode === 'aim')) {
      const g = this.dirGaze(tgt.x - s.body.x, tgt.y - (s.body.y + 50), facing)
      lookX = g.x
      lookY = g.y
    }
    return { mood, t: t + 1.7, earFlap, inBackpack: true, lookX, lookY, sink }
  }

  /** Mood while she's standing about (shared by the pack goat and the goat outside). */
  private restingGoatMood(s: ClimbSession, t: number): GoatMood {
    const d = s.t - this.reactAt
    switch (this.react) {
      case 'bigLand':
        if (d < 1.6) return 'laugh'
        break
      case 'land':
      case 'camp':
      case 'hop':
        if (d < 1.3) return 'happy'
        break
      case 'whip':
        return 'laugh'
      case 'back':
        if (d < 1.4) return 'laugh'
        break
      default:
        break
    }
    if (s.t - this.revealAt < 2.6 && s.t >= this.revealAt) return 'curious'
    if (this.crumbleWarn(s) > 0) return 'gulp'
    if (this.bigLeapSpot(s)) return 'nervous'
    if (s.phase === 'ready' && t - this.idleSince > 18) return 'sleepy'
    return 'peek'
  }

  private outsideMood(s: ClimbSession, t: number): GoatMood {
    const g = this.goat
    if (g.hop) return g.hop.long ? 'wheee' : 'happy'
    if (g.waitLong) return 'wobbly'
    if (t - g.landedAt < 0.9) return 'happy'
    switch (s.phase) {
      case 'sent':
        return 'proud'
      case 'roped':
      case 'flopped':
        return s.t - this.reactAt < 0.3 ? 'gulp' : 'laugh'
      case 'flying':
        return this.flightBig ? 'cover-eyes' : 'nervous'
      default:
        break
    }
    if (s.aim) {
      if (this.bigLeapSpot(s)) return s.t - this.aimStartAt < 1.1 ? 'gulp' : 'cover-eyes'
      return 'nervous'
    }
    if (this.lookTarget && s.phase === 'ready') return lookGoatMood(this.lookTarget.feel)
    if (s.isHanging()) return this.since('catch', s) < 1.2 ? 'happy' : 'nervous'
    return this.restingGoatMood(s, t)
  }

  private drawOutsideGoat(
    ctx: CanvasRenderingContext2D,
    s: ClimbSession,
    camera: Camera,
    t: number,
    at: Pt,
    mode: Mode,
  ): void {
    const g = this.goat
    const mood = this.outsideMood(s, t)
    // Watch her.
    const her = s.body
    const dx = her.x - at.x
    const dy = her.y + 30 - (at.y + 20)
    const d = Math.max(1, Math.hypot(dx, dy))
    if (!g.hop && Math.abs(dx) > 4 && mode !== 'rope') g.facing = dx > 0 ? 1 : -1
    const lookX = ((dx * g.facing) / d) * 0.8
    const lookY = (-dy / d) * 0.8
    // Squash and stretch on its own hops.
    let sx = 1
    let sy = 1
    let live = false
    if (g.hop) {
      live = true
      const k = (t - g.hop.start) / g.hop.dur
      if (k < 0.18) {
        sy = 1 + 0.14 * (1 - k / 0.18)
        sx = 1 - 0.08 * (1 - k / 0.18)
      }
    } else {
      const k = (t - g.landedAt) / 0.24
      if (k >= 0 && k < 1) {
        live = true
        const e = easeOutBack(k, 2.6)
        sy = 0.76 + 0.24 * e
        sx = 1.18 - 0.18 * e
      }
    }
    const sp = camera.worldToScreen(at.x, at.y)
    const state: GoatState = {
      mood,
      t: t + 0.6,
      inBackpack: false,
      facing: g.facing,
      lookX,
      lookY,
      earFlap: mood === 'wheee' ? 0.9 : Math.abs(gustAt(s.level, at.x, at.y, s.t)) > 0.5 ? 0.8 : 0,
    }
    this.goatSprite.draw(ctx, sp.x, sp.y, camera.scale, state, sx, sy, live)
  }
}

function lookGoatMood(feel: LookFeel): GoatMood {
  return feel === 'happy' ? 'laugh' : feel === 'surprised' ? 'curious' : 'nervous'
}

/**
 * The gust at a feet point: −1..1 (sign = which way it blows), easing in over the telegraph so she
 * braces just before it hits — the gust rhythm shows on her, not only on the grass.
 */
function gustAt(level: Level, x: number, y: number, t: number): number {
  const zones = level.wind
  if (!zones || zones.length === 0) return 0
  const cy = y + TUNING.bodyHeight / 2
  let w = 0
  for (const z of zones) {
    if (x < z.x || x > z.x + z.w || cy < z.y || cy > z.y + z.h) continue
    const ph = (((t - z.offset) % z.period) + z.period) % z.period
    let k: number
    if (ph < z.gust) k = smoothstep(ph / 0.18) * (1 - smoothstep((ph - z.gust + 0.3) / 0.3) * 0.7)
    else k = 0.3 * smoothstep(1 - (z.period - ph) / TUNING.windTelegraph)
    w += z.dir * k
  }
  return Math.max(-1, Math.min(1, w))
}

function blendTime(prev: Mode, next: Mode): number {
  if (next === 'flight') return prev === 'aim' || prev === 'hangAim' ? 0.035 : 0.1
  if (prev === 'flight') {
    if (next === 'ground' || next === 'sent' || next === 'flop') return 0.03
    if (next === 'hang') return 0.05
    if (next === 'rope') return 0.12
  }
  if (prev === 'rope' && next === 'ground') return 0.07
  if (next === 'aim' || next === 'hangAim') return 0.09
  if (prev === 'aim' && next === 'ground') return 0.2
  if (prev === 'hangAim' && next === 'hang') return 0.2
  if (prev === 'flop' && next === 'ground') return 0.1
  return 0.15
}

