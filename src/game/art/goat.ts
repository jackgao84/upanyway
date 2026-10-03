/**
 * The companion: a fluffy baby mountain goat who is scared of heights and comes anyway.
 *
 * Local frame, y-down, 1 unit = 1 world unit, facing +x (pass `facing: -1` to flip):
 * - inBackpack: origin = the backpack rim centre. The goat rises out of the pack (everything
 *   below the rim is clipped away) and grips the rim with its front hooves.
 * - standing: origin = the ground between its hooves. About 26 units tall.
 */
import {
  DEG,
  blinkAt,
  inkStroke,
  paintShape,
  pixelScale,
  rgba,
  type Pt,
} from './rig'

export type GoatMood =
  | 'peek'
  | 'nervous'
  | 'cover-eyes'
  | 'gulp'
  | 'happy'
  | 'laugh'
  | 'wheee'
  | 'sleepy'
  | 'proud'
  | 'curious'
  | 'wobbly'

export const GOAT_MOODS: readonly GoatMood[] = [
  'peek',
  'nervous',
  'cover-eyes',
  'gulp',
  'happy',
  'laugh',
  'wheee',
  'sleepy',
  'proud',
  'curious',
  'wobbly',
]

export interface GoatState {
  mood: GoatMood
  /** Seconds (drives blinks, breathing, trembles, flaps). */
  t: number
  /** 0..1: ears flapping (she's falling). Defaults to 0.8 for 'wheee', else 0. */
  earFlap?: number
  /** Peeking over the backpack rim (true) or standing on its own hooves (finale, night climbs). */
  inBackpack: boolean
  /** Where it looks, −1..1 each (default: ahead). */
  lookX?: number
  lookY?: number
  facing?: 1 | -1
  /** In the backpack: how far it ducks down into the pack (units; ~3 hides all but eyes and ears). */
  sink?: number
}

const C = {
  fleece: '#fbf6ec',
  fleeceShade: '#ecdcc6',
  fleeceInk: '#a3876f',
  face: '#fdf8f0',
  muzzle: '#f8e3d8',
  nose: '#ec8f98',
  noseInk: '#a5525e',
  horn: '#e0cba9',
  hornShade: '#c7aa82',
  hornInk: '#8a6e50',
  earIn: '#f3b6b3',
  eye: '#33241f',
  hoof: '#7a5f52',
  hoofInk: '#45332b',
  mouth: '#8d3f45',
  tongue: '#ef8f9a',
  brow: '#b79a80',
  sweat: '#9fd3f0',
  blush: '#f39a9a',
}

interface Face {
  eyes: 'open' | 'wide' | 'happy' | 'closed'
  brow: number
  mouth: 'smile' | 'open' | 'o' | 'wobble' | 'tight' | 'grit' | 'smug' | 'small'
  /** Ear droop in degrees below horizontal for the back and front ear. */
  earB: number
  earF: number
  blush: number
  sweat: boolean
  /** Head centre height above the rim (in the backpack). */
  rise: number
  tilt: number
  tremble: number
}

const FACES: Record<GoatMood, Face> = {
  peek: { eyes: 'open', brow: 0.25, mouth: 'small', earB: 18, earF: 22, blush: 0.4, sweat: false, rise: 6.4, tilt: 0, tremble: 0 },
  nervous: { eyes: 'wide', brow: 1, mouth: 'wobble', earB: 68, earF: 72, blush: 0.5, sweat: true, rise: 8.6, tilt: -3, tremble: 0.35 },
  'cover-eyes': { eyes: 'wide', brow: 0.9, mouth: 'wobble', earB: 74, earF: 76, blush: 0.6, sweat: false, rise: 8.4, tilt: 5, tremble: 0.25 },
  gulp: { eyes: 'wide', brow: 0.95, mouth: 'tight', earB: 58, earF: 62, blush: 0.5, sweat: true, rise: 8.8, tilt: -2, tremble: 0.15 },
  happy: { eyes: 'open', brow: 0, mouth: 'smile', earB: 20, earF: 24, blush: 0.65, sweat: false, rise: 9.6, tilt: 0, tremble: 0 },
  laugh: { eyes: 'happy', brow: 0, mouth: 'open', earB: 12, earF: 16, blush: 0.9, sweat: false, rise: 10, tilt: 0, tremble: 0 },
  wheee: { eyes: 'happy', brow: 0, mouth: 'open', earB: 10, earF: 10, blush: 0.8, sweat: false, rise: 10.4, tilt: -6, tremble: 0 },
  sleepy: { eyes: 'closed', brow: 0.1, mouth: 'small', earB: 78, earF: 80, blush: 0.45, sweat: false, rise: 7.8, tilt: 12, tremble: 0 },
  proud: { eyes: 'happy', brow: -0.2, mouth: 'smug', earB: 6, earF: 10, blush: 0.8, sweat: false, rise: 10.2, tilt: -10, tremble: 0 },
  curious: { eyes: 'open', brow: -0.3, mouth: 'o', earB: 6, earF: 52, blush: 0.5, sweat: false, rise: 9.4, tilt: 14, tremble: 0 },
  wobbly: { eyes: 'wide', brow: 0.9, mouth: 'grit', earB: 48, earF: 54, blush: 0.6, sweat: true, rise: 9, tilt: 0, tremble: 0.3 },
}

function outlineWidth(ctx: CanvasRenderingContext2D): number {
  return Math.max(0.55, 1.15 / pixelScale(ctx))
}

/** A fleece cloud: overlapping puffs sharing one merged outline, shaded on the underside. */
function fleece(
  ctx: CanvasRenderingContext2D,
  puffs: readonly (readonly [number, number, number])[],
  lw: number,
  shadeBelow: number,
  fill = C.fleece,
): void {
  const path = new Path2D()
  for (const [x, y, r] of puffs) {
    path.moveTo(x + r, y)
    path.arc(x, y, r, 0, Math.PI * 2)
  }
  ctx.strokeStyle = C.fleeceInk
  ctx.lineWidth = lw * 2
  ctx.lineJoin = 'round'
  ctx.stroke(path)
  ctx.fillStyle = fill
  ctx.fill(path)
  ctx.save()
  ctx.clip(path)
  ctx.fillStyle = C.fleeceShade
  for (const [x, y, r] of puffs) {
    if (y + r * 0.2 < shadeBelow) continue
    ctx.beginPath()
    ctx.arc(x + r * 0.15, y + r * 0.55, r * 0.9, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function hoof(ctx: CanvasRenderingContext2D, x: number, y: number, ang: number, lw: number): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(ang)
  const p = new Path2D()
  p.moveTo(-1.25, -0.9)
  p.lineTo(1.25, -0.9)
  p.quadraticCurveTo(1.45, 0.9, 0.9, 1.05)
  p.lineTo(-0.9, 1.05)
  p.quadraticCurveTo(-1.45, 0.9, -1.25, -0.9)
  p.closePath()
  paintShape(ctx, p, C.hoof, lw, (c) => {
    c.fillStyle = '#92766a'
    c.fillRect(-1.4, -1.1, 2.8, 0.7)
  }, C.hoofInk)
  ctx.strokeStyle = C.hoofInk
  ctx.lineWidth = lw * 0.7
  ctx.beginPath()
  ctx.moveTo(0.1, 0)
  ctx.lineTo(0.1, 1)
  ctx.stroke()
  ctx.restore()
}

/** A front leg (fleecy) ending in a hoof. */
function foreleg(ctx: CanvasRenderingContext2D, from: Pt, to: Pt, lw: number): void {
  const ang = Math.atan2(to.y - from.y, to.x - from.x) - Math.PI / 2
  inkStroke(ctx, [from, to], 2.5, C.fleece, lw, C.fleeceInk)
  hoof(ctx, to.x, to.y, ang, lw)
}

function ear(ctx: CanvasRenderingContext2D, x: number, y: number, dirRad: number, lw: number, len = 7.2): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(dirRad)
  const p = new Path2D()
  p.moveTo(0, -1.25)
  p.bezierCurveTo(len * 0.45, -2.1, len * 0.95, -1.1, len, 0.15)
  p.bezierCurveTo(len * 0.9, 1.35, len * 0.4, 1.55, 0, 1.2)
  p.closePath()
  paintShape(ctx, p, C.fleece, lw, (c) => {
    c.fillStyle = C.earIn
    c.beginPath()
    c.ellipse(len * 0.52, 0.35, len * 0.36, 0.72, 0.04, 0, Math.PI * 2)
    c.fill()
    c.fillStyle = C.fleeceShade
    c.fillRect(-1, 1.0, len + 2, 1)
  }, C.fleeceInk)
  ctx.restore()
}

function eye(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  f: Face,
  blink: number,
  look: Pt,
  lw: number,
  small: boolean,
): void {
  ctx.lineCap = 'round'
  if (f.eyes === 'happy') {
    ctx.strokeStyle = C.eye
    ctx.lineWidth = Math.max(0.55, lw * 1.05)
    ctx.beginPath()
    ctx.moveTo(x - rx * 1.05, y + ry * 0.25)
    ctx.quadraticCurveTo(x, y - ry * 1.05, x + rx * 1.05, y + ry * 0.25)
    ctx.stroke()
    return
  }
  if (f.eyes === 'closed' || blink > 0.85) {
    ctx.strokeStyle = C.eye
    ctx.lineWidth = Math.max(0.5, lw * 0.95)
    ctx.beginPath()
    ctx.moveTo(x - rx * 1.05, y - ry * 0.05)
    ctx.quadraticCurveTo(x, y + ry * 0.75, x + rx * 1.05, y - ry * 0.05)
    ctx.stroke()
    return
  }
  const open = 1 - blink
  const lx = look.x * rx * 0.32
  const ly = look.y * ry * 0.25
  if (f.eyes === 'wide') {
    // White ring = startled.
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.ellipse(x, y, rx * 1.18, ry * 1.12 * open, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = C.eye
    ctx.lineWidth = lw * 0.75
    ctx.stroke()
    ctx.fillStyle = C.eye
    ctx.beginPath()
    ctx.ellipse(x + lx * 1.3, y + ly, rx * 0.68, ry * 0.7 * open, 0, 0, Math.PI * 2)
    ctx.fill()
  } else {
    ctx.fillStyle = C.eye
    ctx.beginPath()
    ctx.ellipse(x + lx * 0.4, y + ly * 0.4, rx, ry * open, 0, 0, Math.PI * 2)
    ctx.fill()
    if (!small) {
      ctx.fillStyle = '#5a4038'
      ctx.beginPath()
      ctx.ellipse(x + lx * 0.4, y + ly * 0.4 + ry * 0.45 * open, rx * 0.62, ry * 0.32 * open, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  if (open > 0.3) {
    ctx.fillStyle = '#ffffff'
    const hx = x + lx + rx * 0.32
    const hy = y + ly - ry * 0.34 * open
    ctx.beginPath()
    ctx.arc(hx, hy, Math.max(0.42, rx * 0.4), 0, Math.PI * 2)
    ctx.fill()
    if (!small) {
      ctx.beginPath()
      ctx.arc(x + lx - rx * 0.32, y + ly + ry * 0.4 * open, rx * 0.17, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

function brows(ctx: CanvasRenderingContext2D, eyes: readonly Pt[], f: Face, lw: number): void {
  if (Math.abs(f.brow) < 0.15) return
  ctx.strokeStyle = C.brow
  ctx.lineWidth = Math.max(0.5, lw * 1.1)
  ctx.lineCap = 'round'
  eyes.forEach((e, i) => {
    const inner = i === 0 ? 1 : -1 // back eye's inner end is toward +x
    const y = e.y - 2.6
    const tilt = f.brow * 0.9
    ctx.beginPath()
    ctx.moveTo(e.x - inner * 1.1, y + tilt * 0.35)
    ctx.lineTo(e.x + inner * 1.0, y - tilt * 0.55)
    ctx.stroke()
  })
}

function mouth(ctx: CanvasRenderingContext2D, x: number, y: number, f: Face, t: number, lw: number): void {
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = C.noseInk
  ctx.lineWidth = Math.max(0.42, lw * 0.85)
  switch (f.mouth) {
    case 'smile':
    case 'smug': {
      const w = f.mouth === 'smug' ? 1.5 : 1.2
      ctx.beginPath()
      ctx.moveTo(x - w, y - 0.2)
      ctx.quadraticCurveTo(x - w * 0.5, y + 0.9, x, y + 0.1)
      ctx.quadraticCurveTo(x + w * 0.5, y + 0.9, x + w, f.mouth === 'smug' ? y - 0.55 : y - 0.2)
      ctx.stroke()
      return
    }
    case 'open': {
      const wob = Math.sin(t * 14) * 0.25
      const p = new Path2D()
      p.moveTo(x - 1.5, y - 0.2)
      p.quadraticCurveTo(x, y + 0.1, x + 1.5, y - 0.2)
      p.quadraticCurveTo(x + 1.3, y + 2.4 + wob, x, y + 2.6 + wob)
      p.quadraticCurveTo(x - 1.3, y + 2.4 + wob, x - 1.5, y - 0.2)
      p.closePath()
      ctx.fillStyle = C.mouth
      ctx.fill(p)
      ctx.save()
      ctx.clip(p)
      ctx.fillStyle = C.tongue
      ctx.beginPath()
      ctx.ellipse(x + 0.2, y + 2.5 + wob, 1.1, 0.9, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
      ctx.stroke(p)
      return
    }
    case 'o': {
      ctx.fillStyle = C.mouth
      ctx.beginPath()
      ctx.ellipse(x, y + 0.6, 0.6, 0.75, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      return
    }
    case 'small': {
      ctx.beginPath()
      ctx.moveTo(x - 0.6, y + 0.2)
      ctx.quadraticCurveTo(x, y + 0.65, x + 0.6, y + 0.2)
      ctx.stroke()
      return
    }
    case 'wobble': {
      ctx.beginPath()
      ctx.moveTo(x - 1.4, y + 0.5)
      for (let i = 1; i <= 4; i++) ctx.lineTo(x - 1.4 + i * 0.7, y + 0.5 + (i % 2 ? -0.4 : 0.15))
      ctx.stroke()
      return
    }
    case 'tight': {
      ctx.beginPath()
      ctx.moveTo(x - 1, y + 0.45)
      ctx.quadraticCurveTo(x, y + 0.2, x + 1, y + 0.45)
      ctx.stroke()
      return
    }
    case 'grit': {
      const p = new Path2D()
      p.moveTo(x - 1.5, y)
      p.quadraticCurveTo(x, y - 0.3, x + 1.5, y)
      p.quadraticCurveTo(x + 1.6, y + 1.3, x, y + 1.35)
      p.quadraticCurveTo(x - 1.6, y + 1.3, x - 1.5, y)
      p.closePath()
      ctx.fillStyle = '#ffffff'
      ctx.fill(p)
      ctx.stroke(p)
      ctx.beginPath()
      ctx.moveTo(x - 1.4, y + 0.65)
      ctx.lineTo(x + 1.4, y + 0.65)
      ctx.moveTo(x - 0.4, y)
      ctx.lineTo(x - 0.4, y + 1.3)
      ctx.moveTo(x + 0.5, y)
      ctx.lineTo(x + 0.5, y + 1.3)
      ctx.lineWidth = Math.max(0.3, lw * 0.5)
      ctx.stroke()
      return
    }
  }
}

function sweatDrop(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, lw: number): void {
  const k = (t * 0.9) % 1
  const dy = k * 2.2
  ctx.save()
  ctx.globalAlpha = k < 0.8 ? 1 : (1 - k) * 5
  const p = new Path2D()
  p.moveTo(x, y + dy - 1.6)
  p.quadraticCurveTo(x + 1.1, y + dy, x, y + dy + 0.9)
  p.quadraticCurveTo(x - 1.1, y + dy, x, y + dy - 1.6)
  paintShape(ctx, p, C.sweat, lw * 0.7, undefined, '#5b9cc4')
  ctx.restore()
}

function zzz(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, lw: number): void {
  ctx.save()
  ctx.strokeStyle = '#8f8fc8'
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (let i = 0; i < 2; i++) {
    const k = (t * 0.35 + i * 0.5) % 1
    const s = 1.1 + k * 1.2
    const zx = x + k * 3 + i * 0.6
    const zy = y - k * 6
    ctx.globalAlpha = Math.sin(k * Math.PI)
    ctx.lineWidth = Math.max(0.4, lw * 0.9)
    ctx.beginPath()
    ctx.moveTo(zx - s / 2, zy - s / 2)
    ctx.lineTo(zx + s / 2, zy - s / 2)
    ctx.lineTo(zx - s / 2, zy + s / 2)
    ctx.lineTo(zx + s / 2, zy + s / 2)
    ctx.stroke()
  }
  ctx.restore()
}

function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
  const s = 1 + 0.35 * Math.sin(t * 5)
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s, s)
  ctx.fillStyle = '#ffe08a'
  ctx.strokeStyle = '#c99a2e'
  ctx.lineWidth = 0.35
  ctx.beginPath()
  ctx.moveTo(0, -1.8)
  ctx.quadraticCurveTo(0.25, -0.25, 1.8, 0)
  ctx.quadraticCurveTo(0.25, 0.25, 0, 1.8)
  ctx.quadraticCurveTo(-0.25, 0.25, -1.8, 0)
  ctx.quadraticCurveTo(-0.25, -0.25, 0, -1.8)
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

interface HeadOpts {
  f: Face
  t: number
  flap: number
  look: Pt
  lw: number
  small: boolean
  /** Hide the eyes (hooves are over them). Returns where the eyes are so hooves can cover them. */
  coverEyes: boolean
}

/** Eye centres in head space. */
const EYE_B = { x: -1.7, y: 0.5 }
const EYE_F = { x: 3.0, y: 0.35 }

/** The goat's head, centred on (0, 0). */
function head(ctx: CanvasRenderingContext2D, o: HeadOpts): void {
  const { f, t, lw, small } = o
  // Ears: droop in degrees below horizontal; flapping lifts and waggles them.
  // Flapping blends the ears toward a high, fluttering "wings up" position.
  const bob = f.mouth === 'open' ? Math.sin(t * 12) * 6 : 0
  const droopB = f.earB + bob + o.flap * (-42 + 34 * Math.sin(t * 27) - f.earB - bob)
  const droopF = f.earF - bob + o.flap * (-40 + 34 * Math.sin(t * 27 + 1.3) - f.earF + bob)
  ear(ctx, -4.9, -1.6, Math.PI - droopB * DEG, lw)
  ear(ctx, 5.0, -1.9, droopF * DEG, lw, 6.8)

  // Horn nubs.
  for (const [hx, lean] of [[-3.1, -0.25], [2.6, 0.12]] as const) {
    ctx.save()
    ctx.translate(hx, -5.2)
    ctx.rotate(lean)
    const p = new Path2D()
    p.moveTo(-1.15, 0.6)
    p.quadraticCurveTo(-1.2, -2.2, -0.2, -3.1)
    p.quadraticCurveTo(1.0, -2.5, 1.15, 0.6)
    p.closePath()
    paintShape(ctx, p, C.horn, lw, (c) => {
      c.fillStyle = C.hornShade
      c.fillRect(-1.3, -1.2, 0.9, 2)
      c.fillRect(-1.3, -0.6, 3, 0.35)
      c.fillRect(-1.3, -1.6, 3, 0.3)
    }, C.hornInk)
    ctx.restore()
  }

  // Head silhouette: cranium + muzzle share one outline.
  const headPath = new Path2D()
  headPath.ellipse(0, -0.5, 6.1, 5.5, 0, 0, Math.PI * 2)
  headPath.moveTo(1.6 + 4.2, 2.9)
  headPath.ellipse(1.6, 2.9, 4.2, 3.1, 0, 0, Math.PI * 2)
  headPath.moveTo(2.2 + 1.1, 5.6)
  headPath.ellipse(2.2, 5.6, 1.1, 1.0, 0, 0, Math.PI * 2)
  ctx.strokeStyle = C.fleeceInk
  ctx.lineWidth = lw * 2
  ctx.stroke(headPath)
  ctx.fillStyle = C.face
  ctx.fill(headPath)
  ctx.save()
  ctx.clip(headPath)
  ctx.fillStyle = C.fleeceShade
  ctx.beginPath()
  ctx.ellipse(-5.2, 1.2, 3.2, 6, 0.2, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = C.muzzle
  ctx.beginPath()
  ctx.ellipse(1.9, 3.3, 3.3, 2.3, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  // Fleece tuft on the crown.
  fleece(ctx, [[-1.9, -4.9, 2.1], [0.2, -5.7, 2.4], [2.3, -5.0, 1.9], [-0.4, -4.2, 1.8]], lw, 99)

  // Blush.
  if (f.blush > 0) {
    ctx.fillStyle = rgba(C.blush, 0.42 * f.blush + 0.1)
    ctx.beginPath()
    ctx.ellipse(-3.6, 2.6, 1.35, 0.85, 0, 0, Math.PI * 2)
    ctx.ellipse(5.2, 2.2, 1.0, 0.8, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  // Nose: a soft pink heart-ish button.
  const nose = new Path2D()
  nose.moveTo(1.3, 2.0)
  nose.quadraticCurveTo(2.4, 1.6, 3.5, 2.0)
  nose.quadraticCurveTo(3.4, 3.1, 2.4, 3.3)
  nose.quadraticCurveTo(1.4, 3.1, 1.3, 2.0)
  nose.closePath()
  paintShape(ctx, nose, C.nose, lw * 0.8, (c) => {
    c.fillStyle = '#f7b8bd'
    c.beginPath()
    c.ellipse(2.0, 2.15, 0.45, 0.25, 0, 0, Math.PI * 2)
    c.fill()
  }, C.noseInk)
  mouth(ctx, 2.4, 3.8, f, t, lw)

  if (!o.coverEyes) {
    const blink = blinkAt(t, 0.37)
    eye(ctx, EYE_B.x, EYE_B.y, 1.3, 1.75, f, blink, o.look, lw, small)
    eye(ctx, EYE_F.x, EYE_F.y, 1.45, 1.85, f, blink, o.look, lw, small)
    brows(ctx, [EYE_B, EYE_F], f, lw)
  } else {
    brows(ctx, [EYE_B, EYE_F], f, lw)
  }
  if (f.sweat) sweatDrop(ctx, -5.6, -2.2, t, lw)
}

/** Draw the goat (see the frame notes at the top of this file). */
export function drawGoat(ctx: CanvasRenderingContext2D, state: GoatState): void {
  const f = FACES[state.mood] ?? FACES.peek
  const t = state.t
  const lw = outlineWidth(ctx)
  const small = pixelScale(ctx) < 2.2
  const flap = Math.max(0, Math.min(1, state.earFlap ?? (state.mood === 'wheee' ? 0.8 : 0)))
  const look = { x: state.lookX ?? 0.55, y: state.lookY ?? 0 }
  ctx.save()
  if (state.facing === -1) ctx.scale(-1, 1)
  if (state.inBackpack) drawInPack(ctx, state, f, t, lw, small, flap, look)
  else drawStanding(ctx, state, f, t, lw, small, flap, look)
  ctx.restore()
}

function tremble(f: Face, t: number): number {
  return f.tremble ? Math.sin(t * 47) * f.tremble : 0
}

function drawInPack(
  ctx: CanvasRenderingContext2D,
  state: GoatState,
  f: Face,
  t: number,
  lw: number,
  small: boolean,
  flap: number,
  look: Pt,
): void {
  const mood = state.mood
  const breathe = Math.sin(t * 2.4) * 0.25
  let rise = f.rise + breathe - (state.sink ?? 0)
  if (mood === 'happy') rise += Math.abs(Math.sin(t * 4)) * 0.8
  if (mood === 'laugh') rise += Math.abs(Math.sin(t * 9)) * 1.0
  const jx = tremble(f, t)
  let tilt = f.tilt
  if (mood === 'laugh') tilt += Math.sin(t * 9) * 6
  if (mood === 'sleepy') tilt += Math.sin(t * 1.2) * 3
  if (mood === 'curious') tilt += Math.sin(t * 1.5) * 2

  const hx = 0.4 + jx
  const hy = -rise

  // Body + neck rise out of the pack: clip at the rim.
  ctx.save()
  ctx.beginPath()
  ctx.rect(-40, -60, 80, 60.4)
  ctx.clip()
  const gulpK = mood === 'gulp' ? (t * 1.1) % 1 : -1
  fleece(
    ctx,
    [
      [-3.6 + jx * 0.5, -1.6, 3.0],
      [0.2 + jx * 0.5, -2.4, 3.5],
      [3.9 + jx * 0.5, -1.5, 2.9],
      [hx - 0.6, hy + 4.6, 3.1],
      [hx + 2.0, hy + 5.0, 2.6],
    ],
    lw,
    -2.2,
  )
  if (gulpK >= 0 && gulpK < 0.7) {
    // A gulp travelling down the throat.
    const k = gulpK / 0.7
    ctx.fillStyle = C.fleeceShade
    ctx.strokeStyle = C.fleeceInk
    ctx.lineWidth = lw * 0.8
    ctx.beginPath()
    ctx.arc(hx + 1.2, hy + 6.4 + k * 3.2, 1.05 * Math.sin(k * Math.PI) + 0.2, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }
  ctx.restore()

  ctx.save()
  ctx.translate(hx, hy)
  ctx.rotate(tilt * DEG)
  head(ctx, { f, t, flap, look, lw, small, coverEyes: mood === 'cover-eyes' })
  ctx.restore()

  // Front hooves.
  if (mood === 'cover-eyes') {
    const a = tilt * DEG
    const toWorld = (p: Pt): Pt => ({
      x: hx + p.x * Math.cos(a) - p.y * Math.sin(a),
      y: hy + p.x * Math.sin(a) + p.y * Math.cos(a),
    })
    // Every few seconds the front hoof slips down for a peek.
    const ph = t % 3.2
    const peek = ph > 2.1 && ph < 2.9 ? Math.sin(((ph - 2.1) / 0.8) * Math.PI) : 0
    const eb = toWorld(EYE_B)
    const ef = toWorld({ x: EYE_F.x, y: EYE_F.y + peek * 2.4 })
    if (peek > 0.4) {
      ctx.save()
      ctx.translate(hx, hy)
      ctx.rotate(a)
      eye(ctx, EYE_F.x, EYE_F.y, 1.45, 1.85, { ...f, eyes: 'wide' }, 0, { x: 0.6, y: 0.5 }, lw, small)
      ctx.restore()
    }
    foreleg(ctx, { x: -2.6, y: -1 }, { x: eb.x - 0.1, y: eb.y + 0.3 }, lw)
    foreleg(ctx, { x: 2.8, y: -1 }, { x: ef.x + 0.1, y: ef.y + 0.3 }, lw)
  } else if (mood === 'wheee') {
    const w = Math.sin(t * 10) * 0.6
    foreleg(ctx, { x: -2.6, y: -2 }, { x: hx - 7.2, y: hy - 5.5 + w }, lw)
    foreleg(ctx, { x: 2.8, y: -2 }, { x: hx + 7.4, y: hy - 5.8 - w }, lw)
  } else if (mood === 'proud') {
    // One hoof on the rim, one on its chest: "I'm still here."
    foreleg(ctx, { x: -2.8, y: -1.4 }, { x: -3.9, y: 0.5 }, lw)
    foreleg(ctx, { x: 3.4, y: -1.6 }, { x: 0.4, y: -3.9 }, lw)
  } else {
    const grip = mood === 'gulp' || mood === 'nervous' || mood === 'wobbly' ? 0.35 : 0
    foreleg(ctx, { x: -2.8 + jx, y: -2.2 }, { x: -3.9 + jx, y: 0.45 + grip }, lw)
    foreleg(ctx, { x: 2.8 + jx, y: -2.2 }, { x: 4.0 + jx, y: 0.45 + grip }, lw)
  }
  if (mood === 'sleepy') zzz(ctx, hx + 6.5, hy - 6, t, lw)
  if (mood === 'proud') sparkle(ctx, hx - 7.5, hy - 6.5, t)
}

function drawStanding(
  ctx: CanvasRenderingContext2D,
  state: GoatState,
  f: Face,
  t: number,
  lw: number,
  small: boolean,
  flap: number,
  look: Pt,
): void {
  const mood = state.mood
  const jx = tremble(f, t)
  let lift = 0
  let bodyRot = 0
  let headTilt = f.tilt
  if (mood === 'happy') lift = Math.abs(Math.sin(t * 5)) * 1.6
  if (mood === 'laugh') {
    lift = Math.abs(Math.sin(t * 9)) * 1.0
    headTilt += -8 + Math.sin(t * 9) * 5
  }
  if (mood === 'wheee') {
    lift = 2.5
    bodyRot = -12
  }
  if (mood === 'proud') bodyRot = -5
  const sitting = mood === 'cover-eyes'
  const lying = mood === 'sleepy'
  const breathe = Math.sin(t * 2.4) * 0.3

  // Ground shadow.
  ctx.fillStyle = 'rgba(60,40,50,0.16)'
  ctx.beginPath()
  ctx.ellipse(-1, 0.3, (sitting ? 7.5 : 10) - lift, 1.4, 0, 0, Math.PI * 2)
  ctx.fill()

  if (sitting) {
    drawSitting(ctx, f, t, lw, small, flap, look, jx, breathe)
    return
  }

  ctx.save()
  ctx.translate(jx, -lift)
  const bodyY = lying ? -6.2 : -11.2
  ctx.translate(-1.6, bodyY)
  ctx.rotate(bodyRot * DEG)

  // Legs: slim, a little knee, tiny hooves. Far legs first (in shade), near legs after the body.
  const wob = (i: number) => (mood === 'wobbly' ? Math.sin(t * 22 + i * 1.7) * 1.1 : 0)
  const legLen = 10.6
  const leg = (hx: number, i: number, far: boolean, splay: number, front: boolean) => {
    const fillC = far ? C.fleeceShade : C.fleece
    if (lying) {
      // Tucked under: just a folded knee and a hoof peeking out.
      inkStroke(ctx, [{ x: hx, y: 2.6 }, { x: hx + 2.4, y: 4.4 }], 2.3, fillC, lw, C.fleeceInk)
      hoof(ctx, hx + 3.2, 4.6, -Math.PI / 2, lw)
      return
    }
    const knock = mood === 'wobbly' ? (i % 2 ? 1 : -1) * 1.0 : 0
    const knee = { x: hx + splay * 0.45 + wob(i) + knock + (front ? 0.5 : -0.5), y: legLen * 0.5 }
    const foot = { x: hx + splay + wob(i) * 0.5, y: legLen }
    inkStroke(ctx, [{ x: hx, y: 2.2 }, knee, foot], 2.4, fillC, lw, C.fleeceInk)
    hoof(ctx, foot.x, foot.y - 0.6, 0, lw)
  }
  const splayF = mood === 'wheee' ? 3.4 : 0
  const splayB = mood === 'wheee' ? -3.2 : 0
  leg(-5.6, 0, true, splayB, false)
  leg(3.4, 1, true, splayF, true)

  // Body cloud.
  const puffs: [number, number, number][] = []
  const n = 9
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    puffs.push([Math.cos(a) * 6.6, Math.sin(a) * 3.6 + breathe * 0.5, 3.1])
  }
  puffs.push([0, 0, 4.6])
  fleece(ctx, puffs, lw, 0.5)
  // Tail puff.
  const wag = Math.sin(t * (mood === 'happy' || mood === 'laugh' ? 14 : 5)) * 0.5
  fleece(ctx, [[-9.6, -2.6 + wag, 1.8], [-10.4, -3.9 + wag, 1.2]], lw, 99)

  leg(-3.2, 2, false, splayB * 1.1, false)
  leg(5.6, 3, false, splayF * 1.1, true)
  ctx.restore()

  // Neck + head (kept upright-ish so the face always reads).
  const neckX = 4.4 + jx
  const neckY = (lying ? -8.6 : -16.4) - lift
  const headX = neckX + (lying ? 3.8 : 2.2)
  const headY = neckY - (lying ? 1.4 : 4.8) + breathe * 0.4
  fleece(ctx, [[neckX - 1.6, neckY + 2.6, 3.1], [neckX + 0.6, neckY, 2.8]], lw, neckY + 1)
  ctx.save()
  ctx.translate(headX, headY)
  ctx.rotate((headTilt + (lying ? 10 : 0)) * DEG)
  head(ctx, { f, t, flap, look, lw, small, coverEyes: false })
  ctx.restore()

  if (mood === 'sleepy') zzz(ctx, headX + 6, headY - 6, t, lw)
  if (mood === 'proud') sparkle(ctx, headX - 8, headY - 7, t)
}

/** Sitting back on its haunches with both front hooves over its eyes (and the odd peek). */
function drawSitting(
  ctx: CanvasRenderingContext2D,
  f: Face,
  t: number,
  lw: number,
  small: boolean,
  flap: number,
  look: Pt,
  jx: number,
  breathe: number,
): void {
  ctx.save()
  ctx.translate(jx, 0)
  // Round sitting body (leaning back), haunch and folded hooves in front.
  hoof(ctx, 4.6, -0.9, -Math.PI / 2, lw)
  const puffs: [number, number, number][] = []
  const tilt0 = -0.95
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2
    const ex = Math.cos(a) * 6.0
    const ey = Math.sin(a) * 4.0
    puffs.push([-2.2 + ex * Math.cos(tilt0) - ey * Math.sin(tilt0), -6.6 + ex * Math.sin(tilt0) + ey * Math.cos(tilt0) + breathe * 0.4, 3.0])
  }
  puffs.push([-2.2, -6.6, 4.6], [1.0, -3.2, 3.2])
  fleece(ctx, puffs, lw, -5)
  fleece(ctx, [[-8.0, -1.8, 1.7], [-8.8, -2.9, 1.1]], lw, 99)
  hoof(ctx, 5.0, -2.2, -Math.PI / 2, lw)

  const headX = 1.4
  const headY = -16.4 + breathe * 0.4
  const tilt = f.tilt
  fleece(ctx, [[-0.2, -11.4, 3.0], [1.4, -12.6, 2.6]], lw, -11)
  ctx.save()
  ctx.translate(headX, headY)
  ctx.rotate(tilt * DEG)
  head(ctx, { f, t, flap, look, lw, small, coverEyes: true })
  ctx.restore()

  const ph = t % 3.2
  const peek = ph > 2.1 && ph < 2.9 ? Math.sin(((ph - 2.1) / 0.8) * Math.PI) : 0
  const a = tilt * DEG
  const toWorld = (p: Pt): Pt => ({
    x: headX + p.x * Math.cos(a) - p.y * Math.sin(a),
    y: headY + p.x * Math.sin(a) + p.y * Math.cos(a),
  })
  if (peek > 0.4) {
    ctx.save()
    ctx.translate(headX, headY)
    ctx.rotate(a)
    eye(ctx, EYE_F.x, EYE_F.y, 1.45, 1.85, { ...f, eyes: 'wide' }, 0, { x: 0.6, y: 0.5 }, lw, small)
    ctx.restore()
  }
  const eb = toWorld(EYE_B)
  const ef = toWorld({ x: EYE_F.x, y: EYE_F.y + peek * 2.4 })
  foreleg(ctx, { x: -2.6, y: -9.4 }, { x: eb.x, y: eb.y + 0.3 }, lw)
  foreleg(ctx, { x: 2.0, y: -9.0 }, { x: ef.x, y: ef.y + 0.3 }, lw)
  ctx.restore()
}

/** Unscaled bounds of the goat drawing (local frame), for previews. */
export function goatBounds(state: Pick<GoatState, 'inBackpack' | 'facing'>): {
  minX: number
  minY: number
  maxX: number
  maxY: number
} {
  const b = state.inBackpack
    ? { minX: -13, minY: -24, maxX: 14, maxY: 2.5 }
    : { minX: -13.5, minY: -32, maxX: 17, maxY: 1.8 }
  return state.facing === -1 ? { minX: -b.maxX, minY: b.minY, maxX: -b.minX, maxY: b.maxY } : b
}

/** Approximate head centre of the goat in its local frame (for speech bubbles / camera). */
export function goatHeadAnchor(state: Pick<GoatState, 'inBackpack' | 'mood' | 'facing' | 'sink'>): Pt {
  const f = FACES[state.mood] ?? FACES.peek
  const p = state.inBackpack ? { x: 0.4, y: -f.rise + (state.sink ?? 0) } : { x: 6.6, y: -21.2 }
  return state.facing === -1 ? { x: -p.x, y: p.y } : p
}
