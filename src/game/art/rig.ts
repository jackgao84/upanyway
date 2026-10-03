/**
 * The climber's 2D skeleton, plus the small paint helpers shared by climber.ts and goat.ts.
 *
 * Local frame: y-down, feet at (0, 0), facing +x (drawClimber mirrors for facing −1).
 * 1 unit = 1 world unit. Standing, she is ~52 units tall (hips at 14.5, neck at 27.5, head
 * radius 11, helmet on top).
 *
 * Angles are degrees.
 * - Limbs: measured from straight down, + toward the front. 0 = hanging, 90 = pointing forward,
 *   180 = straight up, −90 = pointing back. `lower` is relative to `upper` (elbows bend +,
 *   knees bend −). Limb angles live in the body frame: they turn with `rot`, not with `lean`.
 * - `rot`: the whole figure spins about (0, RIG.pivotY); + tips forward (head toward the facing side).
 * - `lean`: the torso (and head, shoulders) bends at the hips; + leans forward.
 * - `headTilt`: on top of lean; + nods forward/down, − looks up.
 * L limbs are the far side (drawn behind the body), R limbs the near side (drawn in front).
 */

export type Limb = [upper: number, lower: number]

export interface Pose {
  /** Hip offset from its standing place (units, y-down: + is lower). */
  rootX: number
  rootY: number
  rot: number
  lean: number
  headTilt: number
  armL: Limb
  armR: Limb
  legL: Limb
  legR: Limb
  /** Arm length multipliers: 1 = normal, > 1 = cartoon stretch (hanging, Spaghetti Arms). */
  reachL: number
  reachR: number
  /** Scale about the feet: squash on landing (x > 1, y < 1), stretch on launch. */
  squashX: number
  squashY: number
  /** 0 = hair hangs, 1 = hair streams upward (falling). */
  hairFloat: number
  /** 0 = normal arms, 1 = floppy noodle arms drawn as wiggly curves (The Spaghetti Arms). */
  noodle?: number
}

export const RIG = {
  hipY: -14.5,
  hipHalf: 2.9,
  thigh: 6.8,
  shin: 6.2,
  /** Ankle sits this far above the sole. */
  ankleLift: 1.5,
  torso: 13,
  shoulderDrop: 1.8,
  shoulderHalf: 4.5,
  upperArm: 6.9,
  forearm: 6.5,
  /** Neck → head centre: up along the head's axis, and a little toward the face (3/4 view). */
  headUp: 9.6,
  headFwd: 1.4,
  headR: 11,
  /** `rot` spins the figure about this point (roughly the middle of her). */
  pivotY: -24,
} as const

export interface Pt {
  x: number
  y: number
}

/** Joint positions in the local frame (after `rot`, before squash), plus segment angles. */
export interface Skeleton {
  hip: Pt
  neck: Pt
  head: Pt
  /** Clockwise screen rotation (deg) of the torso and the head. */
  torsoAngle: number
  headAngle: number
  shoulderL: Pt
  elbowL: Pt
  wristL: Pt
  shoulderR: Pt
  elbowR: Pt
  wristR: Pt
  hipL: Pt
  kneeL: Pt
  ankleL: Pt
  hipR: Pt
  kneeR: Pt
  ankleR: Pt
  /** Absolute limb-convention angle of each lower segment (forearm / shin). */
  foreL: number
  foreR: number
  shinL: number
  shinR: number
}

export const DEG = Math.PI / 180

export function pose(p: Partial<Pose> = {}): Pose {
  return {
    rootX: 0,
    rootY: 0,
    rot: 0,
    lean: 0,
    headTilt: 0,
    armL: [-8, 14],
    armR: [8, 16],
    legL: [-3, 1],
    legR: [4, -2],
    reachL: 1,
    reachR: 1,
    squashX: 1,
    squashY: 1,
    hairFloat: 0,
    ...p,
  }
}

/** Unit vector for a limb-convention angle (0 = down, + toward the front). */
export function limbDir(deg: number): Pt {
  const a = deg * DEG
  return { x: Math.sin(a), y: Math.cos(a) }
}

function rotAbout(p: Pt, c: Pt, deg: number): Pt {
  if (deg === 0) return p
  const a = deg * DEG
  const s = Math.sin(a)
  const co = Math.cos(a)
  const dx = p.x - c.x
  const dy = p.y - c.y
  return { x: c.x + dx * co - dy * s, y: c.y + dx * s + dy * co }
}

export function solvePose(p: Pose): Skeleton {
  const hip = { x: p.rootX, y: RIG.hipY + p.rootY }
  const ta = p.lean * DEG
  const up = { x: Math.sin(ta), y: -Math.cos(ta) }
  const side = { x: Math.cos(ta), y: Math.sin(ta) }
  const neck = { x: hip.x + up.x * RIG.torso, y: hip.y + up.y * RIG.torso }
  const ha = (p.lean + p.headTilt) * DEG
  const head = {
    x: neck.x + Math.sin(ha) * RIG.headUp + Math.cos(ha) * RIG.headFwd,
    y: neck.y - Math.cos(ha) * RIG.headUp + Math.sin(ha) * RIG.headFwd,
  }
  const shoulder = (s: number): Pt => ({
    x: neck.x + side.x * s * RIG.shoulderHalf - up.x * RIG.shoulderDrop,
    y: neck.y + side.y * s * RIG.shoulderHalf - up.y * RIG.shoulderDrop,
  })
  const shoulderL = shoulder(-1)
  const shoulderR = shoulder(1)
  const arm = (sh: Pt, l: Limb, reach: number) => {
    const d1 = limbDir(l[0])
    const d2 = limbDir(l[0] + l[1])
    const e = { x: sh.x + d1.x * RIG.upperArm * reach, y: sh.y + d1.y * RIG.upperArm * reach }
    const w = { x: e.x + d2.x * RIG.forearm * reach, y: e.y + d2.y * RIG.forearm * reach }
    return [e, w] as const
  }
  const [elbowL, wristL] = arm(shoulderL, p.armL, p.reachL)
  const [elbowR, wristR] = arm(shoulderR, p.armR, p.reachR)
  const hipL = { x: hip.x - RIG.hipHalf, y: hip.y }
  const hipR = { x: hip.x + RIG.hipHalf, y: hip.y }
  const leg = (h: Pt, l: Limb) => {
    const d1 = limbDir(l[0])
    const d2 = limbDir(l[0] + l[1])
    const k = { x: h.x + d1.x * RIG.thigh, y: h.y + d1.y * RIG.thigh }
    const a = { x: k.x + d2.x * RIG.shin, y: k.y + d2.y * RIG.shin }
    return [k, a] as const
  }
  const [kneeL, ankleL] = leg(hipL, p.legL)
  const [kneeR, ankleR] = leg(hipR, p.legR)

  const c = { x: 0, y: RIG.pivotY }
  const r = (q: Pt) => rotAbout(q, c, p.rot)
  return {
    hip: r(hip),
    neck: r(neck),
    head: r(head),
    torsoAngle: p.rot + p.lean,
    headAngle: p.rot + p.lean + p.headTilt,
    shoulderL: r(shoulderL),
    elbowL: r(elbowL),
    wristL: r(wristL),
    shoulderR: r(shoulderR),
    elbowR: r(elbowR),
    wristR: r(wristR),
    hipL: r(hipL),
    kneeL: r(kneeL),
    ankleL: r(ankleL),
    hipR: r(hipR),
    kneeR: r(kneeR),
    ankleR: r(ankleR),
    foreL: p.armL[0] + p.armL[1] - p.rot,
    foreR: p.armR[0] + p.armR[1] - p.rot,
    shinL: p.legL[0] + p.legL[1] - p.rot,
    shinR: p.legR[0] + p.legR[1] - p.rot,
  }
}

/** Limb-convention angle (deg) of the vector from a to b. */
export function angleTo(a: Pt, b: Pt): number {
  return Math.atan2(b.x - a.x, b.y - a.y) / DEG
}

/**
 * Two-bone IK in limb convention. `bend` +1 puts the middle joint behind the root→target line
 * (elbows), −1 in front of it (knees). Out of reach → straight toward the target.
 */
export function solveLimb(root: Pt, target: Pt, l1: number, l2: number, bend: 1 | -1): Limb {
  const dx = target.x - root.x
  const dy = target.y - root.y
  const d = Math.max(1e-6, Math.min(Math.hypot(dx, dy), l1 + l2 - 1e-4))
  const base = Math.atan2(dx, dy) / DEG
  const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)
  const a = Math.acos(Math.max(-1, Math.min(1, cosA))) / DEG
  const cosB = (l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2)
  const b = 180 - Math.acos(Math.max(-1, Math.min(1, cosB))) / DEG
  return [base - bend * a, bend * b]
}

/**
 * Point an arm's hand at `target` (local frame, after rot). Stretches the arm (reach) when the
 * target is out of normal reach, so a hand can always meet a hold.
 */
export function aimArm(p: Pose, side: 'L' | 'R', target: Pt, bend: 1 | -1 = 1, maxStretch = 2.2): Pose {
  const sk = solvePose(p)
  const sh = side === 'L' ? sk.shoulderL : sk.shoulderR
  const full = RIG.upperArm + RIG.forearm
  const d = Math.hypot(target.x - sh.x, target.y - sh.y)
  const reach = Math.min(maxStretch, Math.max(1, d / (full * 0.98)))
  const limb = solveLimb(sh, target, RIG.upperArm * reach, RIG.forearm * reach, bend)
  const out: Limb = [limb[0] + p.rot, limb[1]]
  return side === 'L' ? { ...p, armL: out, reachL: reach } : { ...p, armR: out, reachR: reach }
}

/** Bend the legs so both ankles land at the given x on the ground (rot is assumed 0). */
export function plantFeet(p: Pose, footL = -2.6, footR = 2.8): Pose {
  const sk = solvePose({ ...p, rot: 0 })
  const ground = -RIG.ankleLift
  const legL = solveLimb(sk.hipL, { x: footL, y: ground }, RIG.thigh, RIG.shin, -1)
  const legR = solveLimb(sk.hipR, { x: footR, y: ground }, RIG.thigh, RIG.shin, -1)
  return { ...p, legL, legR }
}

// ---------------------------------------------------------------------------------------------
// Blending

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t)

function lerpLimb(a: Limb, b: Limb, t: number): Limb {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t)]
}

export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  return {
    rootX: lerp(a.rootX, b.rootX, t),
    rootY: lerp(a.rootY, b.rootY, t),
    rot: lerp(a.rot, b.rot, t),
    lean: lerp(a.lean, b.lean, t),
    headTilt: lerp(a.headTilt, b.headTilt, t),
    armL: lerpLimb(a.armL, b.armL, t),
    armR: lerpLimb(a.armR, b.armR, t),
    legL: lerpLimb(a.legL, b.legL, t),
    legR: lerpLimb(a.legR, b.legR, t),
    reachL: lerp(a.reachL, b.reachL, t),
    reachR: lerp(a.reachR, b.reachR, t),
    squashX: lerp(a.squashX, b.squashX, t),
    squashY: lerp(a.squashY, b.squashY, t),
    hairFloat: lerp(a.hairFloat, b.hairFloat, t),
    noodle: lerp(a.noodle ?? 0, b.noodle ?? 0, t),
  }
}

/** Flip left/right within the same facing: near and far limbs swap, every angle negates. */
export function mirrorPose(p: Pose): Pose {
  const neg = (l: Limb): Limb => [-l[0], -l[1]]
  return {
    ...p,
    rootX: -p.rootX,
    rot: -p.rot,
    lean: -p.lean,
    headTilt: -p.headTilt,
    armL: neg(p.armR),
    armR: neg(p.armL),
    legL: neg(p.legR),
    legR: neg(p.legL),
    reachL: p.reachR,
    reachR: p.reachL,
  }
}

// Easing (t in 0..1)
export const easeInQuad = (t: number): number => t * t
export const easeOutQuad = (t: number): number => 1 - (1 - t) * (1 - t)
export const easeInOutSine = (t: number): number => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(t))
export const smoothstep = (t: number): number => {
  const x = clamp01(t)
  return x * x * (3 - 2 * x)
}
export function easeOutBack(t: number, s = 1.70158): number {
  const x = clamp01(t) - 1
  return 1 + x * x * ((s + 1) * x + s)
}
/** Springy settle: overshoots and wobbles back to 1. */
export function easeOutElastic(t: number): number {
  const x = clamp01(t)
  if (x === 0 || x === 1) return x
  return Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1
}
/** 0 → 1 → 0 over t in 0..1. */
export const bump = (t: number): number => Math.sin(Math.PI * clamp01(t))

// ---------------------------------------------------------------------------------------------
// Paint helpers (shared by climber.ts and goat.ts)

const rgbCache = new Map<string, [number, number, number]>()

function rgb(hex: string): [number, number, number] {
  const hit = rgbCache.get(hex)
  if (hit) return hit
  let h = hex.trim().replace('#', '')
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  const n = /^[0-9a-f]{6}$/i.test(h) ? parseInt(h, 16) : 0x999999
  const out: [number, number, number] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  rgbCache.set(hex, out)
  return out
}

function toHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

const mixCache = new Map<string, string>()

/** Mix two hex colours (t = 0 → a, 1 → b). */
export function mix(a: string, b: string, t: number): string {
  const key = `${a}|${b}|${t}`
  const hit = mixCache.get(key)
  if (hit) return hit
  const [r1, g1, b1] = rgb(a)
  const [r2, g2, b2] = rgb(b)
  const out = toHex(lerp(r1, r2, t), lerp(g1, g2, t), lerp(b1, b2, t))
  if (mixCache.size > 4000) mixCache.clear()
  mixCache.set(key, out)
  return out
}

/** Warm storybook shadow/highlight tones: amt < 0 darkens toward plum-brown, > 0 lightens toward cream. */
export function shade(hex: string, amt: number): string {
  return amt < 0 ? mix(hex, '#3b2335', -amt) : mix(hex, '#fff6e6', amt)
}

/** Outline colour for a fill: a deep, warm version of itself (never pure black). */
export function ink(hex: string): string {
  return mix(hex, '#2a1620', 0.62)
}

export function rgba(hex: string, a: number): string {
  const [r, g, b] = rgb(hex)
  return `rgba(${r},${g},${b},${a})`
}

/** Relative luminance 0..1 (rough, for picking contrasting details). */
export function luma(hex: string): number {
  const [r, g, b] = rgb(hex)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

/** Device pixels per local unit at the current transform (2 when unknown). */
export function pixelScale(ctx: CanvasRenderingContext2D): number {
  try {
    if (typeof ctx.getTransform !== 'function') return 2
    const m = ctx.getTransform()
    return Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 2
  } catch {
    return 2
  }
}

/** Fill a path, then stroke it with its ink colour. */
export function fillInk(ctx: CanvasRenderingContext2D, path: Path2D, fill: string, lw: number, line?: string): void {
  ctx.fillStyle = fill
  ctx.fill(path)
  ctx.strokeStyle = line ?? ink(fill)
  ctx.lineWidth = lw
  ctx.stroke(path)
}

/**
 * Fill + shade + outline: `shadow` is painted inside the shape (clipped), so one call gives the
 * 2–3 tone storybook look.
 */
export function paintShape(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  fill: string,
  lw: number,
  shadow?: (ctx: CanvasRenderingContext2D) => void,
  line?: string,
): void {
  ctx.fillStyle = fill
  ctx.fill(path)
  if (shadow) {
    ctx.save()
    ctx.clip(path)
    shadow(ctx)
    ctx.restore()
  }
  ctx.strokeStyle = line ?? ink(fill)
  ctx.lineWidth = lw
  ctx.stroke(path)
}

export function ellipsePath(cx: number, cy: number, rx: number, ry: number, rot = 0): Path2D {
  const p = new Path2D()
  p.ellipse(cx, cy, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, Math.PI * 2)
  return p
}

export function circlePath(cx: number, cy: number, r: number): Path2D {
  const p = new Path2D()
  p.arc(cx, cy, Math.max(0.01, r), 0, Math.PI * 2)
  return p
}

export function roundRectPath(x: number, y: number, w: number, h: number, r: number): Path2D {
  const p = new Path2D()
  const rr = Math.max(0, Math.min(r, w / 2, h / 2))
  p.moveTo(x + rr, y)
  p.lineTo(x + w - rr, y)
  p.quadraticCurveTo(x + w, y, x + w, y + rr)
  p.lineTo(x + w, y + h - rr)
  p.quadraticCurveTo(x + w, y + h, x + w - rr, y + h)
  p.lineTo(x + rr, y + h)
  p.quadraticCurveTo(x, y + h, x, y + h - rr)
  p.lineTo(x, y + rr)
  p.quadraticCurveTo(x, y, x + rr, y)
  p.closePath()
  return p
}

/** A thick rounded stroke with an ink outline (limbs, straps, strands). */
export function inkStroke(
  ctx: CanvasRenderingContext2D,
  pts: readonly Pt[],
  width: number,
  fill: string,
  lw: number,
  line?: string,
): void {
  if (pts.length < 2) return
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
  ctx.strokeStyle = line ?? ink(fill)
  ctx.lineWidth = width + lw * 2
  ctx.stroke()
  ctx.strokeStyle = fill
  ctx.lineWidth = width
  ctx.stroke()
}

/** Small deterministic hash → 0..1 (for per-look variety like blink timing). */
export function hash01(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 10000) / 10000
}

/** 0 = open, 1 = shut. Natural blinking with the odd double blink. */
export function blinkAt(t: number, seed: number): number {
  const period = 3.1 + seed * 1.6
  const k = Math.floor((t + seed * 7) / period)
  const ph = t + seed * 7 - k * period
  const dur = 0.15
  if (ph < dur) return Math.sin((ph / dur) * Math.PI)
  if (k % 3 === 1 && ph > 0.24 && ph < 0.24 + dur) return Math.sin(((ph - 0.24) / dur) * Math.PI)
  return 0
}
