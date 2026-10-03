/**
 * The climber, drawn entirely with Canvas paths on the rig (rig.ts). Storybook style: rounded
 * shapes, two or three tones per fill, warm outlines in a deeper shade of each fill.
 *
 * Frame: local y-down, feet at (0, 0), 1 unit = 1 world unit (see rig.ts). Renderers translate +
 * scale to her feet and call drawClimber; it only changes the transform inside save/restore.
 */
import type { ClimberLook } from '../../storage/schema'
import { drawGoat, goatBounds, type GoatState } from './goat'
import { parseGearId } from './gear'
import {
  DEG,
  RIG,
  blinkAt,
  hash01,
  ink,
  inkStroke,
  limbDir,
  luma,
  mix,
  paintShape,
  pixelScale,
  rgba,
  roundRectPath,
  shade,
  solvePose,
  type Pose,
  type Pt,
  type Skeleton,
} from './rig'

export type Expression =
  | 'happy'
  | 'determined'
  | 'nervous'
  | 'scared-but-going'
  | 'surprised'
  | 'laughing'
  | 'proud'
  | 'focused'
  | 'sleepy'
  | 'oof'

export const EXPRESSIONS: readonly Expression[] = [
  'happy',
  'determined',
  'nervous',
  'scared-but-going',
  'surprised',
  'laughing',
  'proud',
  'focused',
  'sleepy',
  'oof',
]

export interface ClimberDrawOpts {
  look: ClimberLook
  pose: Pose
  expression: Expression
  facing: 1 | -1
  /** Seconds, for blinks, swaying hair and the goat. */
  t: number
  /** The goat riding in the backpack; null/undefined = an empty pack. */
  goat?: GoatState | null
  /** Where she looks, −1..1 each (default: ahead and a little up). */
  gaze?: Pt
}

// ---------------------------------------------------------------------------------------------
// Colours

const EYE_DARK = '#2f1d22'
const EYE_IRIS = '#6b4636'
const MOUTH = '#8a3640'
const TONGUE = '#ee8a8f'
const SOLE = '#f1e4c8'
const HARNESS = '#4f4866'
const CHALK = '#fbf8f2'

interface OutfitDef {
  top: string
  sleeve: 'short' | 'long' | 'puff'
  sleeveColor: string
  cuff: string | null
  /** Whole-leg cover (leggings, trousers); null = bare legs. */
  legs: string | null
  shorts: string | null
  socks: string | null
  /** Stripes on the top (stripy outfit). */
  stripes: string | null
}

function outfitDef(look: ClimberLook): OutfitDef {
  const c = look.outfitColor
  switch (look.outfit) {
    case 'hoodie':
      return { top: c, sleeve: 'long', sleeveColor: c, cuff: shade(c, -0.14), legs: '#4b4262', shorts: null, socks: null, stripes: null }
    case 'overalls':
      return { top: '#f7efe0', sleeve: 'short', sleeveColor: '#f7efe0', cuff: null, legs: c, shorts: null, socks: null, stripes: mix(c, '#ffffff', 0.35) }
    case 'dress':
      return { top: c, sleeve: 'puff', sleeveColor: c, cuff: null, legs: '#463f5c', shorts: null, socks: null, stripes: null }
    case 'raincoat':
      return { top: c, sleeve: 'long', sleeveColor: c, cuff: shade(c, -0.12), legs: '#3e4a6c', shorts: null, socks: null, stripes: null }
    case 'vest':
      return { top: '#d9dee8', sleeve: 'long', sleeveColor: '#d9dee8', cuff: '#c3cad8', legs: '#4a4a5f', shorts: null, socks: null, stripes: null }
    case 'stripes':
      return { top: '#f8f1e4', sleeve: 'long', sleeveColor: '#f8f1e4', cuff: c, legs: null, shorts: '#b28e5f', socks: c, stripes: c }
    case 'tee':
    default:
      return { top: c, sleeve: 'short', sleeveColor: c, cuff: null, legs: null, shorts: '#4f6a9c', socks: '#f7f2e8', stripes: null }
  }
}

interface Pal {
  /** Dark skin: lighter irises and rosier cheeks so the face keeps its contrast. */
  deep: boolean
  skin: string
  skinShade: string
  skinInk: string
  hair: string
  hairShade: string
  hairLight: string
  hairInk: string
  helmet: string
  pack: string
  shoe: string
  o: OutfitDef
  seed: number
}

const palCache = new Map<string, Pal>()

function palette(look: ClimberLook): Pal {
  const key = `${look.skinTone}|${look.hairColor}|${look.outfit}|${look.outfitColor}|${look.helmetColor}|${look.backpackColor}`
  const hit = palCache.get(key)
  if (hit) return hit
  const skin = look.skinTone
  const hair = look.hairColor
  const dark = luma(hair) < 0.22
  const p: Pal = {
    deep: luma(skin) < 0.42,
    skin,
    skinShade: shade(skin, -0.13),
    skinInk: mix(skin, '#3a1a1c', 0.58),
    hair,
    hairShade: shade(hair, -0.2),
    hairLight: dark ? mix(hair, '#8a7a90', 0.32) : shade(hair, 0.24),
    hairInk: dark ? mix(hair, '#140a10', 0.5) : ink(hair),
    helmet: look.helmetColor,
    pack: look.backpackColor,
    shoe: luma(look.helmetColor) > 0.85 ? '#7d6aa8' : shade(look.helmetColor, -0.08),
    o: outfitDef(look),
    seed: hash01(key),
  }
  if (palCache.size > 64) palCache.clear()
  palCache.set(key, p)
  return p
}

// ---------------------------------------------------------------------------------------------
// Gear (post-summit unlockables). Ids look like "gear-scarf", or a colour variant
// "gear-scarf~sky-blue" (model/unlockables.ts); gear.ts reads them (older spellings too).

const GEAR_BASE = [
  'gear-star-stickers',
  'gear-scarf',
  'gear-headlamp',
  'gear-rainbow-rope',
  'gear-sunglasses',
  'gear-chalk-bag',
  'gear-rainbow-laces',
  'gear-cape',
  'gear-bobble',
  'gear-bandana',
  'gear-gloves',
  'gear-stripy-socks',
  'gear-goggles',
  'gear-flower-crown',
  'gear-pebble-necklace',
  'gear-backpack-flag',
  'gear-bracelets',
  'gear-puffy-boots',
  'gear-face-paint',
  'gear-sleeping-roll',
] as const
type GearId = (typeof GEAR_BASE)[number]

const GEAR_DEFAULT: Record<GearId, string> = {
  'gear-star-stickers': '#ffd34d',
  'gear-scarf': '#e2725b',
  'gear-headlamp': '#4f4866',
  'gear-rainbow-rope': '#e4572e',
  'gear-sunglasses': '#3b2f4a',
  'gear-chalk-bag': '#b98bd9',
  'gear-rainbow-laces': '#e4572e',
  'gear-cape': '#c84b6a',
  'gear-bobble': '#f28fb0',
  'gear-bandana': '#d9473f',
  'gear-gloves': '#6fa8dc',
  'gear-stripy-socks': '#8c6bc8',
  'gear-goggles': '#5aa9e6',
  'gear-flower-crown': '#ffffff',
  'gear-pebble-necklace': '#9fb4c8',
  'gear-backpack-flag': '#f28c3a',
  'gear-bracelets': '#f2c14e',
  'gear-puffy-boots': '#f4ecdc',
  'gear-face-paint': '#ffcf4d',
  'gear-sleeping-roll': '#d9b98a',
}

const gearCache = new Map<string, Map<GearId, string>>()

function gearSet(ids: readonly string[]): Map<GearId, string> {
  const key = ids.join('|')
  const hit = gearCache.get(key)
  if (hit) return hit
  const out = new Map<GearId, string>()
  for (const raw of ids) {
    const worn = parseGearId(raw)
    const base = worn ? GEAR_BASE.find((b) => b === worn.baseId) : undefined
    if (!worn || !base) continue
    out.set(base, worn.tint ?? GEAR_DEFAULT[base])
  }
  if (gearCache.size > 32) gearCache.clear()
  gearCache.set(key, out)
  return out
}

const RAINBOW = ['#e4572e', '#f28c3a', '#f2c14e', '#7cb66a', '#5aa9e6', '#8c6bc8']

// ---------------------------------------------------------------------------------------------
// Expressions

interface FaceSpec {
  eyes: 'open' | 'wide' | 'happy' | 'squeeze' | 'closed'
  lid: number
  browLift: number
  browTilt: number
  mouth: 'smile' | 'set' | 'open' | 'o' | 'wobble' | 'teeth' | 'tongue' | 'smug' | 'yawn' | 'oof'
  blush: number
  sweat: boolean
  gaze: Pt
}

const FACES: Record<Expression, FaceSpec> = {
  happy: { eyes: 'open', lid: 0, browLift: 0.45, browTilt: 0.1, mouth: 'smile', blush: 0.55, sweat: false, gaze: { x: 0.3, y: 0 } },
  determined: { eyes: 'open', lid: 0.22, browLift: -0.1, browTilt: -0.55, mouth: 'set', blush: 0.4, sweat: false, gaze: { x: 0.7, y: -0.3 } },
  nervous: { eyes: 'open', lid: 0, browLift: 0.6, browTilt: 1, mouth: 'wobble', blush: 0.55, sweat: true, gaze: { x: -0.2, y: 0.5 } },
  'scared-but-going': { eyes: 'open', lid: 0.12, browLift: 0.3, browTilt: 0.95, mouth: 'teeth', blush: 0.6, sweat: true, gaze: { x: 0.7, y: -0.3 } },
  surprised: { eyes: 'wide', lid: 0, browLift: 1.3, browTilt: 0.15, mouth: 'o', blush: 0.4, sweat: false, gaze: { x: 0, y: 0 } },
  laughing: { eyes: 'happy', lid: 0, browLift: 0.7, browTilt: 0.25, mouth: 'open', blush: 0.85, sweat: false, gaze: { x: 0, y: 0 } },
  proud: { eyes: 'happy', lid: 0, browLift: 0.35, browTilt: -0.3, mouth: 'smug', blush: 0.8, sweat: false, gaze: { x: 0, y: 0 } },
  focused: { eyes: 'open', lid: 0.36, browLift: -0.25, browTilt: -0.45, mouth: 'tongue', blush: 0.3, sweat: false, gaze: { x: 0.75, y: -0.45 } },
  sleepy: { eyes: 'open', lid: 0.62, browLift: -0.3, browTilt: 0.35, mouth: 'yawn', blush: 0.45, sweat: false, gaze: { x: 0, y: 0.4 } },
  oof: { eyes: 'squeeze', lid: 0, browLift: 0.25, browTilt: 0.75, mouth: 'oof', blush: 0.75, sweat: false, gaze: { x: 0, y: 0 } },
}

// ---------------------------------------------------------------------------------------------
// Layout constants (torso frame: origin = hip, y up the spine is negative; head frame: origin =
// head centre, y-down, facing +x).

/** Backpack on her back, torso frame. Rim centre, width, height. */
const PACK = { x: -12.2, y: -12.8, w: 11, h: 12.4 }
/** The goat leans out of the pack to peek past her head, sitting a little lower in it. */
const GOAT_LEAN = -21
const GOAT_SINK = 1.6

const FACE = {
  eyeB: { x: -2.0, y: 3.7, rx: 1.72, ry: 2.4 },
  eyeF: { x: 6.3, y: 3.5, rx: 1.95, ry: 2.6 },
  mouth: { x: 2.9, y: 8.3 },
  nose: { x: 3.9, y: 6.4 },
  cheekB: { x: -4.0, y: 6.8 },
  cheekF: { x: 8.6, y: 6.5 },
}

/** The helmet's rim in the head frame: back point, front point, and the dip control. */
const RIM_B = { x: -12.1, y: -0.4 }
const RIM_F = { x: 12.2, y: -4.5 }
const RIM_C = { x: 0.4, y: -1.3 }

// ---------------------------------------------------------------------------------------------

function lineW(ctx: CanvasRenderingContext2D): { lw: number; small: boolean } {
  const px = pixelScale(ctx)
  return { lw: Math.max(0.6, 1.25 / px), small: px < 1.9 }
}

function lerpPt(a: Pt, b: Pt, t: number): Pt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

/** Point on the helmet rim curve, u = 0 (back) … 1 (front). */
function rimAt(u: number): Pt {
  const a = lerpPt(RIM_B, RIM_C, u)
  const b = lerpPt(RIM_C, RIM_F, u)
  return lerpPt(a, b, u)
}

function enterTorso(ctx: CanvasRenderingContext2D, sk: Skeleton): void {
  ctx.translate(sk.hip.x, sk.hip.y)
  ctx.rotate(sk.torsoAngle * DEG)
}

function enterHead(ctx: CanvasRenderingContext2D, sk: Skeleton): void {
  ctx.translate(sk.head.x, sk.head.y)
  ctx.rotate(sk.headAngle * DEG)
}

/** Smooth closed/open path through points using midpoint quadratics. */
function smoothPath(path: Path2D, pts: readonly Pt[], start = true): void {
  if (pts.length < 2) return
  if (start) path.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length - 1; i++) {
    const m = lerpPt(pts[i], pts[i + 1], 0.5)
    path.quadraticCurveTo(pts[i].x, pts[i].y, m.x, m.y)
  }
  const last = pts[pts.length - 1]
  path.lineTo(last.x, last.y)
}

// ---------------------------------------------------------------------------------------------
// Public API

export function drawClimber(ctx: CanvasRenderingContext2D, o: ClimberDrawOpts): void {
  const look = o.look
  const pal = palette(look)
  const gear = gearSet(look.gear ?? [])
  const sk = solvePose(o.pose)
  ctx.save()
  ctx.scale(o.facing, 1)
  ctx.scale(o.pose.squashX, o.pose.squashY)
  const { lw, small } = lineW(ctx)
  const face = FACES[o.expression] ?? FACES.happy
  const floatH = Math.max(0, Math.min(1, o.pose.hairFloat))
  const noodle = Math.max(0, Math.min(1, o.pose.noodle ?? 0))
  const d: Draw = { ctx, look, pal, gear, sk, lw, small, t: o.t, face, floatH, noodle, gaze: o.gaze ?? face.gaze }

  if (gear.has('gear-cape')) cape(d)
  backpack(d, o.goat ?? null)
  hairBack(d)
  if (o.goat) {
    ctx.save()
    enterTorso(ctx, sk)
    ctx.translate(PACK.x, PACK.y)
    ctx.rotate(GOAT_LEAN * DEG)
    drawGoat(ctx, { ...o.goat, inBackpack: true, facing: 1, sink: (o.goat.sink ?? 0) + GOAT_SINK })
    ctx.restore()
  }
  hood(d)
  leg(d, 'L')
  leg(d, 'R')
  arm(d, 'L')
  torso(d)
  // The big head sits in front of both arms, except a hand held to the face (a swoon, a facepalm).
  const onFace = Math.hypot(sk.wristR.x - sk.head.x, sk.wristR.y - sk.head.y) < RIG.headR - 1.5
  if (!onFace) arm(d, 'R')
  neckGear(d)
  head(d)
  if (onFace) arm(d, 'R')
  ctx.restore()
}

/** Bounds of the drawing in the local frame (facing applied), for fitting previews. */
export function climberBounds(
  pose: Pose,
  facing: 1 | -1 = 1,
  withGoat = false,
): { minX: number; minY: number; maxX: number; maxY: number } {
  const sk = solvePose(pose)
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const add = (x: number, y: number, r: number) => {
    minX = Math.min(minX, x - r)
    maxX = Math.max(maxX, x + r)
    minY = Math.min(minY, y - r)
    maxY = Math.max(maxY, y + r)
  }
  add(sk.head.x, sk.head.y - 1.5, RIG.headR + 3.8)
  for (const p of [sk.wristL, sk.wristR, sk.elbowL, sk.elbowR]) add(p.x, p.y, 3)
  for (const p of [sk.ankleL, sk.ankleR]) add(p.x, p.y, 5)
  for (const p of [sk.kneeL, sk.kneeR, sk.hip]) add(p.x, p.y, 4.5)
  const a = sk.torsoAngle * DEG
  const toWorld = (x: number, y: number): Pt => ({
    x: sk.hip.x + x * Math.cos(a) - y * Math.sin(a),
    y: sk.hip.y + x * Math.sin(a) + y * Math.cos(a),
  })
  const corners: Pt[] = [
    toWorld(PACK.x - PACK.w / 2 - 1, PACK.y - 2),
    toWorld(PACK.x - PACK.w / 2 - 1, PACK.y + PACK.h + 1),
    toWorld(PACK.x + PACK.w / 2, PACK.y + PACK.h + 1),
  ]
  for (const c of corners) add(c.x, c.y, 1)
  // Long hair, ponytails and braids reach below and behind the head.
  add(sk.head.x - 12, sk.head.y + 14, 6)
  if (withGoat) {
    const gb = goatBounds({ inBackpack: true })
    const g = toWorld(PACK.x, PACK.y)
    const r = GOAT_LEAN * DEG
    for (const [gx, gy] of [
      [gb.minX, gb.minY],
      [gb.maxX, gb.minY],
      [gb.minX, 0],
    ] as const) {
      const lx = gx * Math.cos(r) - gy * Math.sin(r)
      const ly = gx * Math.sin(r) + gy * Math.cos(r)
      add(g.x + lx * Math.cos(a) - ly * Math.sin(a), g.y + lx * Math.sin(a) + ly * Math.cos(a), 1)
    }
  }
  minX *= pose.squashX
  maxX *= pose.squashX
  minY *= pose.squashY
  maxY *= pose.squashY
  return facing === 1 ? { minX, minY, maxX, maxY } : { minX: -maxX, minY, maxX: -minX, maxY }
}

/** Where her near hand is (local frame, facing applied, squash applied). */
export function climberHand(pose: Pose, facing: 1 | -1 = 1): Pt {
  const sk = solvePose(pose)
  return { x: sk.wristR.x * pose.squashX * facing, y: sk.wristR.y * pose.squashY }
}

/** Where the goat's head is (local frame, facing applied), for speech bubbles. */
export function climberGoatAnchor(pose: Pose, facing: 1 | -1 = 1): Pt {
  const sk = solvePose(pose)
  const a = sk.torsoAngle * DEG
  const lx = PACK.x - 2.5
  const ly = PACK.y - 7.8
  return {
    x: (sk.hip.x + lx * Math.cos(a) - ly * Math.sin(a)) * pose.squashX * facing,
    y: (sk.hip.y + lx * Math.sin(a) + ly * Math.cos(a)) * pose.squashY,
  }
}

/** The backpack on its own (front view) with the goat peeking out. Origin: ground under its middle. */
export function drawPackWithGoat(ctx: CanvasRenderingContext2D, look: ClimberLook, goat: GoatState | null): void {
  const { lw, small } = lineW(ctx)
  const w = 19
  const h = 17
  ctx.save()
  ctx.fillStyle = 'rgba(60,40,50,0.16)'
  ctx.beginPath()
  ctx.ellipse(0, 0.2, w * 0.6, 1.5, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.translate(0, -h)
  packShape(ctx, look.backpack, look.backpackColor, w, h, lw, small, !!goat, true)
  if (goat) drawGoat(ctx, { ...goat, inBackpack: true, facing: goat.facing ?? 1 })
  ctx.restore()
}

// ---------------------------------------------------------------------------------------------

interface Draw {
  ctx: CanvasRenderingContext2D
  look: ClimberLook
  pal: Pal
  gear: Map<GearId, string>
  sk: Skeleton
  lw: number
  small: boolean
  t: number
  face: FaceSpec
  floatH: number
  noodle: number
  gaze: Pt
}

// ---------------------------------------------------------------------------------------------
// Limbs

function shoe(d: Draw, ankle: Pt, shinAngle: number, far: boolean): void {
  const { ctx, lw, pal } = d
  const boots = d.gear.get('gear-puffy-boots')
  const laces = d.gear.has('gear-rainbow-laces')
  const base = boots ?? pal.shoe
  const fill = far ? shade(base, -0.1) : base
  ctx.save()
  ctx.translate(ankle.x, ankle.y)
  ctx.rotate(-shinAngle * DEG)
  if (boots) {
    const p = new Path2D()
    p.moveTo(-2.4, -3.2)
    p.quadraticCurveTo(0.5, -4.2, 2.6, -2.8)
    p.quadraticCurveTo(5.4, -1.4, 5.0, 0.6)
    p.quadraticCurveTo(4.8, 2.0, 2.4, 2.0)
    p.lineTo(-1.8, 2.0)
    p.quadraticCurveTo(-3.4, 1.4, -2.4, -3.2)
    p.closePath()
    paintShape(ctx, p, fill, lw, (c) => {
      c.fillStyle = shade(fill, -0.12)
      c.fillRect(-4, 1.0, 10, 2)
      c.strokeStyle = shade(fill, -0.15)
      c.lineWidth = 0.45
      c.beginPath()
      c.moveTo(-2.2, -1.2)
      c.quadraticCurveTo(1, -0.4, 4.6, -0.6)
      c.stroke()
    })
  } else {
    const p = new Path2D()
    p.moveTo(-1.7, -0.9)
    p.lineTo(1.0, -1.3)
    p.quadraticCurveTo(3.7, -0.9, 4.3, 0.6)
    p.quadraticCurveTo(4.6, 1.7, 3.4, 1.75)
    p.lineTo(-1.4, 1.75)
    p.quadraticCurveTo(-2.3, 1.5, -2.1, 0.4)
    p.quadraticCurveTo(-2.0, -0.6, -1.7, -0.9)
    p.closePath()
    paintShape(ctx, p, fill, lw, (c) => {
      c.fillStyle = SOLE
      c.fillRect(-3, 0.9, 8, 2)
      c.fillStyle = shade(fill, 0.3)
      c.beginPath()
      c.ellipse(2.4, -0.3, 1.0, 0.45, 0.3, 0, Math.PI * 2)
      c.fill()
    })
    if (!d.small || laces) {
      // Velcro strap / laces across the top.
      ctx.strokeStyle = laces ? RAINBOW[Math.floor(d.t * 2) % RAINBOW.length] : shade(fill, -0.22)
      ctx.lineWidth = laces ? 0.75 : 0.6
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(0.1, -1.2)
      ctx.lineTo(1.0, 0.7)
      if (laces) {
        ctx.moveTo(1.4, -1.0)
        ctx.lineTo(2.2, 0.5)
      }
      ctx.stroke()
    }
  }
  ctx.restore()
}

function leg(d: Draw, side: 'L' | 'R'): void {
  const { ctx, sk, pal, lw } = d
  const far = side === 'L'
  const hip = far ? sk.hipL : sk.hipR
  const knee = far ? sk.kneeL : sk.kneeR
  const ankle = far ? sk.ankleL : sk.ankleR
  const shin = far ? sk.shinL : sk.shinR
  const tone = (c: string) => (far ? shade(c, -0.1) : c)
  const o = pal.o
  const hipUp = { x: hip.x, y: hip.y - 1.5 }
  inkStroke(ctx, [hipUp, knee, ankle], 4.5, tone(o.legs ?? pal.skin), lw, o.legs ? undefined : pal.skinInk)
  if (!o.legs && !d.small) {
    // Knee shine.
    ctx.fillStyle = rgba(shade(pal.skin, 0.3), 0.6)
    ctx.beginPath()
    ctx.arc(knee.x + 0.6, knee.y - 0.2, 0.7, 0, Math.PI * 2)
    ctx.fill()
  }
  const socks = d.gear.get('gear-stripy-socks') ?? o.socks
  if (socks && !d.gear.has('gear-puffy-boots')) {
    const long = d.gear.has('gear-stripy-socks') || d.look.outfit === 'stripes'
    const top = lerpPt(knee, ankle, long ? 0.18 : 0.74)
    inkStroke(ctx, [top, ankle], 4.7, tone(socks), lw)
    if (d.gear.has('gear-stripy-socks') && !d.small) {
      ctx.strokeStyle = '#fff6e6'
      ctx.lineWidth = 0.8
      const dir = { x: ankle.x - top.x, y: ankle.y - top.y }
      const nx = -dir.y
      const ny = dir.x
      const nl = Math.hypot(nx, ny) || 1
      for (const k of [0.3, 0.6]) {
        const c = lerpPt(top, ankle, k)
        ctx.beginPath()
        ctx.moveTo(c.x - (nx / nl) * 2.2, c.y - (ny / nl) * 2.2)
        ctx.lineTo(c.x + (nx / nl) * 2.2, c.y + (ny / nl) * 2.2)
        ctx.stroke()
      }
    }
  }
  if (o.legs && d.look.outfit === 'overalls') {
    // Rolled cuffs.
    inkStroke(ctx, [lerpPt(knee, ankle, 0.72), lerpPt(knee, ankle, 0.9)], 5.4, tone(shade(o.legs, 0.22)), lw)
  }
  if (o.legs && d.look.outfit === 'vest' && !d.small) {
    ctx.strokeStyle = tone(d.look.outfitColor)
    ctx.lineWidth = 0.9
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(hip.x + 1.2, hip.y + 1)
    ctx.lineTo(knee.x + 1.4, knee.y)
    ctx.lineTo(ankle.x + 1.2, ankle.y - 1)
    ctx.stroke()
  }
  if (o.shorts) {
    inkStroke(ctx, [hipUp, lerpPt(hip, knee, 0.55)], 6.0, tone(o.shorts), lw)
    if (!d.small) {
      // Little turned-up hem.
      const hem = lerpPt(hip, knee, 0.55)
      ctx.fillStyle = tone(shade(o.shorts, 0.18))
      ctx.beginPath()
      ctx.arc(hem.x, hem.y, 2.0, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  shoe(d, ankle, shin, far)
}

function hand(d: Draw, wrist: Pt, foreAngle: number, far: boolean): void {
  const { ctx, pal, lw } = d
  const dir = limbDir(foreAngle)
  const c = { x: wrist.x + dir.x * 0.5, y: wrist.y + dir.y * 0.5 }
  const gloves = d.gear.get('gear-gloves')
  const skin = far ? shade(pal.skin, -0.08) : pal.skin
  const fill = gloves ? (far ? shade(gloves, -0.1) : gloves) : skin
  const line = gloves ? ink(gloves) : pal.skinInk
  // Thumb, then the mitten.
  const th = { x: c.x + dir.y * 1.5 + dir.x * 0.2, y: c.y - dir.x * 1.5 + dir.y * 0.2 }
  ctx.beginPath()
  ctx.arc(th.x, th.y, 0.95, 0, Math.PI * 2)
  ctx.fillStyle = skin
  ctx.fill()
  ctx.strokeStyle = pal.skinInk
  ctx.lineWidth = lw
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(c.x, c.y, 2.05, 0, Math.PI * 2)
  ctx.fillStyle = fill
  ctx.fill()
  ctx.strokeStyle = line
  ctx.stroke()
  if (gloves) {
    // Fingertips poke out.
    ctx.fillStyle = skin
    ctx.beginPath()
    ctx.arc(c.x + dir.x * 1.5, c.y + dir.y * 1.5, 1.0, 0, Math.PI * 2)
    ctx.fill()
  }
  const brace = d.gear.get('gear-bracelets')
  if (brace) {
    ctx.lineWidth = 0.75
    ctx.lineCap = 'round'
    const nx = dir.y
    const ny = -dir.x
    ;[brace, '#7cb66a', '#e98fb0'].forEach((col, i) => {
      const p = { x: wrist.x - dir.x * (0.6 + i * 0.7), y: wrist.y - dir.y * (0.6 + i * 0.7) }
      ctx.strokeStyle = col
      ctx.beginPath()
      ctx.moveTo(p.x - nx * 1.9, p.y - ny * 1.9)
      ctx.lineTo(p.x + nx * 1.9, p.y + ny * 1.9)
      ctx.stroke()
    })
  }
}

/**
 * The arm as a polyline: shoulder → elbow → wrist, or a wiggly noodle when pose.noodle > 0.
 * Returns points with their fraction along the arm.
 */
function armPoints(d: Draw, sh: Pt, el: Pt, wr: Pt, far: boolean): { pts: Pt[]; at: number[] } {
  if (d.noodle <= 0) return { pts: [sh, el, wr], at: [0, 0.5, 1] }
  const pts: Pt[] = []
  const at: number[] = []
  const n = 18
  const amp = 1.7 * d.noodle
  for (let i = 0; i <= n; i++) {
    const k = i / n
    const a = k < 0.5 ? sh : el
    const b = k < 0.5 ? el : wr
    const u = k < 0.5 ? k * 2 : (k - 0.5) * 2
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy) || 1
    const w = Math.sin(k * Math.PI * 3 + d.t * 9 + (far ? 1.7 : 0)) * amp * Math.sin(k * Math.PI)
    pts.push({ x: a.x + dx * u - (dy / len) * w, y: a.y + dy * u + (dx / len) * w })
    at.push(k)
  }
  return { pts, at }
}

function slicePts(pts: Pt[], at: number[], from: number, to: number): Pt[] {
  const out: Pt[] = []
  if (pts.length === 3) {
    const along = (k: number) => (k <= 0.5 ? lerpPt(pts[0], pts[1], k * 2) : lerpPt(pts[1], pts[2], (k - 0.5) * 2))
    out.push(along(from))
    if (from < 0.5 && to > 0.5) out.push(pts[1])
    out.push(along(to))
    return out
  }
  for (let i = 0; i < pts.length; i++) if (at[i] >= from - 1e-6 && at[i] <= to + 1e-6) out.push(pts[i])
  return out
}

function arm(d: Draw, side: 'L' | 'R'): void {
  const { ctx, sk, pal, lw } = d
  const far = side === 'L'
  const sh = far ? sk.shoulderL : sk.shoulderR
  const el = far ? sk.elbowL : sk.elbowR
  const wr = far ? sk.wristL : sk.wristR
  let fore = far ? sk.foreL : sk.foreR
  const tone = (c: string) => (far ? shade(c, -0.1) : c)
  const o = pal.o
  const { pts, at } = armPoints(d, sh, el, wr, far)
  const end = pts[pts.length - 1]
  if (pts.length > 3) {
    const prev = pts[pts.length - 3]
    fore = Math.atan2(end.x - prev.x, end.y - prev.y) / DEG
  }
  if (o.sleeve === 'long') {
    inkStroke(ctx, pts, 4.3, tone(o.sleeveColor), lw)
    if (o.stripes && !d.small) {
      // Stripy sleeves: dashes of the stripe colour along the sleeve.
      ctx.save()
      ctx.setLineDash([1.1, 1.3])
      ctx.lineCap = 'butt'
      ctx.strokeStyle = tone(o.stripes)
      ctx.lineWidth = 4.3
      ctx.beginPath()
      ctx.moveTo(pts[0].x, pts[0].y)
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
      ctx.stroke()
      ctx.restore()
    }
    if (o.cuff) inkStroke(ctx, slicePts(pts, at, 0.89, 0.96), 4.7, tone(o.cuff), lw)
  } else {
    inkStroke(ctx, pts, 3.6, tone(pal.skin), lw, pal.skinInk)
    if (o.sleeve === 'puff') {
      const m = lerpPt(sh, el, 0.3)
      const p = new Path2D()
      p.arc(m.x, m.y, 2.6, 0, Math.PI * 2)
      paintShape(ctx, p, tone(o.sleeveColor), lw, (c) => {
        c.fillStyle = tone(shade(o.sleeveColor, -0.12))
        c.beginPath()
        c.arc(m.x - 0.6, m.y + 1.6, 2.2, 0, Math.PI * 2)
        c.fill()
      })
    } else {
      inkStroke(ctx, slicePts(pts, at, 0, 0.31), 5.0, tone(o.sleeveColor), lw)
    }
  }
  hand(d, end, fore, far)
}

// ---------------------------------------------------------------------------------------------
// Torso

function torsoPath(hem: number): Path2D {
  const p = new Path2D()
  p.moveTo(-5.3, hem)
  p.lineTo(-5.8, -7.8)
  p.quadraticCurveTo(-6.1, -12.6, -2.6, -13.4)
  p.lineTo(2.6, -13.4)
  p.quadraticCurveTo(6.2, -12.6, 5.8, -7.8)
  p.lineTo(5.4, hem)
  p.quadraticCurveTo(0, hem + 1.1, -5.3, hem)
  p.closePath()
  return p
}

function torso(d: Draw): void {
  const { ctx, sk, pal, lw, look, small } = d
  const o = pal.o
  const c = look.outfitColor
  ctx.save()
  enterTorso(ctx, sk)

  if (look.outfit === 'dress') {
    // A-line skirt over the leggings.
    const sway = Math.sin(d.t * 2.1) * 0.3
    const p = new Path2D()
    p.moveTo(-5.4, -3.5)
    p.lineTo(5.6, -3.5)
    p.quadraticCurveTo(7.6, 1.5, 8.8 + sway, 5.8)
    const scallops = 5
    for (let i = 0; i < scallops; i++) {
      const x0 = 8.8 - (17.8 / scallops) * i + sway
      const x1 = 8.8 - (17.8 / scallops) * (i + 1) + sway
      p.quadraticCurveTo((x0 + x1) / 2, 7.6, x1, 5.8)
    }
    p.quadraticCurveTo(-7.4, 1.5, -5.4, -3.5)
    p.closePath()
    paintShape(ctx, p, c, lw, (g) => {
      g.fillStyle = shade(c, -0.14)
      g.beginPath()
      g.ellipse(-8.5, 3, 4, 7, 0.2, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = shade(c, 0.4)
      for (const [x, y] of [[-4.5, 3.4], [-0.5, 1.6], [3.5, 3.6], [6.2, 0.4], [-2.6, -1.2], [1.4, 4.6]] as const) {
        g.beginPath()
        g.arc(x, y, 0.75, 0, Math.PI * 2)
        g.fill()
      }
    })
  }

  const hem = look.outfit === 'raincoat' ? 4.2 : look.outfit === 'hoodie' ? 1.4 : 0.7
  const body = torsoPath(hem)
  paintShape(ctx, body, o.top, lw, (g) => {
    if (o.stripes && look.outfit === 'stripes') {
      g.fillStyle = o.stripes
      for (let y = -12.2; y < hem; y += 2.6) g.fillRect(-7, y, 14, 1.25)
    }
    if (look.outfit === 'overalls' && o.stripes) {
      g.fillStyle = o.stripes
      for (let y = -12.6; y < -8; y += 1.7) g.fillRect(-7, y, 14, 0.7)
    }
    if (look.outfit === 'vest') {
      // Puffy vest over a long-sleeve top.
      const v = new Path2D()
      v.moveTo(-5.6, -12.2)
      v.quadraticCurveTo(-4.8, -13.6, -1.6, -13.6)
      v.lineTo(-0.2, -11)
      v.lineTo(1.4, -13.6)
      v.quadraticCurveTo(4.8, -13.6, 5.4, -12.2)
      v.lineTo(6.4, hem + 1)
      v.lineTo(-6.4, hem + 1)
      v.closePath()
      g.fillStyle = c
      g.fill(v)
      g.strokeStyle = shade(c, -0.18)
      g.lineWidth = 0.55
      for (const y of [-10, -6.8, -3.6, -0.6]) {
        g.beginPath()
        g.moveTo(-6, y)
        g.quadraticCurveTo(0, y + 1, 6, y)
        g.stroke()
      }
      g.strokeStyle = ink(c)
      g.lineWidth = 0.6
      g.beginPath()
      g.moveTo(1.4, -12.6)
      g.lineTo(1.6, hem)
      g.stroke()
    }
    if (look.outfit === 'overalls') {
      g.fillStyle = c
      g.fill(roundRectPath(-3.3, -9.4, 7.6, 12, 1.2))
      g.fillRect(-7, -3.2, 14, 6)
      g.strokeStyle = ink(c)
      g.lineWidth = lw * 0.8
      g.stroke(roundRectPath(-3.3, -9.4, 7.6, 12, 1.2))
      g.fillStyle = shade(c, -0.12)
      g.fill(roundRectPath(-1.2, -7.6, 3.6, 2.6, 0.6))
    }
    if (look.outfit === 'tee') {
      g.fillStyle = o.shorts ?? '#4f6a9c'
      g.fillRect(-7, -2.8, 14, 5)
    }
    if (look.outfit === 'stripes') {
      g.fillStyle = o.shorts ?? '#b28e5f'
      g.fillRect(-7, -2.4, 14, 5)
    }
    // Shadow on the back side, light on the chest.
    g.fillStyle = rgba('#3b2335', 0.16)
    g.beginPath()
    g.ellipse(-7.2, -5, 3.6, 11, 0.05, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = rgba('#fff6e6', 0.28)
    g.beginPath()
    g.ellipse(2.8, -9.4, 1.6, 2.6, 0.2, 0, Math.PI * 2)
    g.fill()
  })

  if (!small) {
    if (look.outfit === 'tee') {
      // A little mountain print.
      ctx.fillStyle = shade(c, 0.45)
      ctx.beginPath()
      ctx.moveTo(-0.4, -5.6)
      ctx.lineTo(1.9, -9.0)
      ctx.lineTo(3.0, -7.6)
      ctx.lineTo(3.8, -8.4)
      ctx.lineTo(5.0, -5.6)
      ctx.closePath()
      ctx.fill()
    }
    if (look.outfit === 'hoodie') {
      const pocket = roundRectPath(-2.6, -5.8, 7.2, 4.0, 1.4)
      paintShape(ctx, pocket, shade(c, -0.08), lw * 0.75)
      ctx.strokeStyle = '#fbf3e6'
      ctx.lineWidth = 0.55
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(0.6, -11.6)
      ctx.lineTo(0.4, -8.6)
      ctx.moveTo(2.8, -11.6)
      ctx.lineTo(3.0, -8.8)
      ctx.stroke()
      ctx.fillStyle = shade(c, -0.14)
      ctx.fillRect(-5.3, hem - 1.6, 10.7, 1.4)
    }
    if (look.outfit === 'raincoat') {
      ctx.strokeStyle = shade(c, -0.25)
      ctx.lineWidth = 0.5
      ctx.beginPath()
      ctx.moveTo(1.5, -12.6)
      ctx.lineTo(1.7, hem + 0.6)
      ctx.stroke()
      for (const y of [-9.8, -6.6, -3.4, -0.2]) {
        ctx.fillStyle = '#f7efe0'
        ctx.strokeStyle = '#8a6a4a'
        ctx.lineWidth = 0.4
        ctx.beginPath()
        ctx.ellipse(2.9, y, 0.95, 0.5, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      }
      // Glossy streak.
      ctx.strokeStyle = rgba('#ffffff', 0.5)
      ctx.lineWidth = 0.7
      ctx.beginPath()
      ctx.moveTo(4.4, -11)
      ctx.quadraticCurveTo(5, -7, 4.6, -3.6)
      ctx.stroke()
    }
    if (look.outfit === 'overalls') {
      for (const x of [-2.5, 3.5]) {
        ctx.fillStyle = '#f2c14e'
        ctx.strokeStyle = '#a07a20'
        ctx.lineWidth = 0.35
        ctx.beginPath()
        ctx.arc(x, -8.5, 0.7, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      }
    }
  }
  if (look.outfit === 'overalls') {
    // Straps over the shoulders.
    inkStroke(ctx, [{ x: -2.5, y: -9 }, { x: -3.6, y: -13.3 }], 1.5, c, lw * 0.8)
    inkStroke(ctx, [{ x: 3.5, y: -9 }, { x: 2.8, y: -13.3 }], 1.5, c, lw * 0.8)
  }

  // Harness belt + belay loop.
  const belt = look.outfit === 'raincoat' ? 1.2 : -2.6
  inkStroke(ctx, [{ x: -5.6, y: belt }, { x: 5.6, y: belt - 0.3 }], 1.2, HARNESS, lw * 0.8)
  if (!small) {
    ctx.fillStyle = '#e8d38a'
    ctx.strokeStyle = '#8a7330'
    ctx.lineWidth = 0.35
    ctx.fillRect(2.2, belt - 0.9, 1.6, 1.5)
    ctx.strokeRect(2.2, belt - 0.9, 1.6, 1.5)
  }
  chalkBag(d, belt)

  // Backpack straps.
  const strap = shade(pal.pack, -0.12)
  inkStroke(ctx, [{ x: -2.6, y: -13.6 }, { x: -4.6, y: -9.8 }, { x: -5.4, y: -6.6 }], 1.5, shade(strap, -0.08), lw * 0.8)
  inkStroke(ctx, [{ x: 0.6, y: -13.8 }, { x: 3.6, y: -10.5 }, { x: 5.4, y: -6.4 }], 1.6, strap, lw * 0.8)
  if (!small) {
    ctx.fillStyle = shade(pal.pack, 0.25)
    ctx.beginPath()
    ctx.arc(3.9, -9.6, 0.55, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function chalkBag(d: Draw, belt: number): void {
  const { ctx, lw, small, pal } = d
  const sparkly = d.gear.get('gear-chalk-bag')
  const col = sparkly ?? mix(pal.pack, '#f4ecdc', 0.35)
  ctx.save()
  ctx.translate(-6.4, belt + 0.6)
  ctx.rotate(0.12)
  const p = new Path2D()
  p.moveTo(-1.9, -1.2)
  p.lineTo(1.9, -1.2)
  p.quadraticCurveTo(2.2, 2.4, 1.2, 2.8)
  p.lineTo(-1.2, 2.8)
  p.quadraticCurveTo(-2.2, 2.4, -1.9, -1.2)
  p.closePath()
  paintShape(ctx, p, col, lw * 0.85, (g) => {
    g.fillStyle = shade(col, -0.16)
    g.fillRect(-2.4, 1.2, 5, 2)
    g.fillStyle = shade(col, 0.3)
    g.fillRect(-2.4, -1.4, 5, 0.9)
  })
  // Chalk poofing out of the top.
  ctx.fillStyle = CHALK
  ctx.beginPath()
  ctx.arc(-0.9, -1.4, 0.9, 0, Math.PI * 2)
  ctx.arc(0.5, -1.7, 1.0, 0, Math.PI * 2)
  ctx.arc(1.5, -1.3, 0.7, 0, Math.PI * 2)
  ctx.fill()
  if (sparkly && !small) {
    ctx.fillStyle = '#fff7c2'
    for (const [x, y] of [[-0.8, 0.8], [0.9, 1.6], [0.2, 0.2]] as const) {
      ctx.beginPath()
      ctx.arc(x, y, 0.32 + 0.15 * Math.sin(d.t * 6 + x * 3), 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.restore()
}

function hood(d: Draw): void {
  const { ctx, sk, look, lw } = d
  if (look.outfit !== 'hoodie' && look.outfit !== 'raincoat') return
  const c = shade(look.outfitColor, -0.06)
  ctx.save()
  enterTorso(ctx, sk)
  const p = new Path2D()
  p.moveTo(-1, -12.4)
  p.quadraticCurveTo(-8.8, -15.6, -8.0, -9.2)
  p.quadraticCurveTo(-6.6, -6.8, -3.2, -9.6)
  p.closePath()
  paintShape(ctx, p, c, lw, (g) => {
    g.fillStyle = shade(c, -0.16)
    g.beginPath()
    g.ellipse(-4.6, -11.4, 2.6, 1.6, 0.3, 0, Math.PI * 2)
    g.fill()
  })
  ctx.restore()
}

// ---------------------------------------------------------------------------------------------
// Backpack

/**
 * A backpack, front view, origin = rim centre (body spans y 0..h). `open`: the top gapes for the
 * goat; otherwise it is buckled shut.
 */
function packShape(
  ctx: CanvasRenderingContext2D,
  style: string,
  color: string,
  w: number,
  h: number,
  lw: number,
  small: boolean,
  open: boolean,
  standalone: boolean,
): void {
  const c = color
  const dk = shade(c, -0.16)
  const lt = shade(c, 0.22)
  const hw = w / 2
  const body = new Path2D()
  const r = style === 'bear' ? hw * 0.75 : style === 'daypack' ? hw * 0.6 : 2.4
  if (style === 'basket') {
    body.moveTo(-hw - 0.4, 0)
    body.lineTo(hw + 0.4, 0)
    body.lineTo(hw - 0.6, h - 1.4)
    body.quadraticCurveTo(hw - 0.8, h, hw - 2.2, h)
    body.lineTo(-hw + 2.2, h)
    body.quadraticCurveTo(-hw + 0.8, h, -hw + 0.6, h - 1.4)
    body.closePath()
  } else {
    body.moveTo(-hw, r)
    body.quadraticCurveTo(-hw, 0, -hw + r, 0)
    body.lineTo(hw - r, 0)
    body.quadraticCurveTo(hw, 0, hw, r)
    body.lineTo(hw, h - 2)
    body.quadraticCurveTo(hw, h, hw - 2, h)
    body.lineTo(-hw + 2, h)
    body.quadraticCurveTo(-hw, h, -hw, h - 2)
    body.closePath()
  }

  if (style === 'bear') {
    for (const sx of [-1, 1]) {
      const ear = new Path2D()
      ear.arc(sx * (hw - 1.4), 0.6, hw * 0.34, 0, Math.PI * 2)
      paintShape(ctx, ear, c, lw, (g) => {
        g.fillStyle = lt
        g.beginPath()
        g.arc(sx * (hw - 1.4), 0.9, hw * 0.18, 0, Math.PI * 2)
        g.fill()
      })
    }
  }
  if (style === 'frame') {
    // Frame rods poke up above the pack.
    for (const sx of [-1, 1]) inkStroke(ctx, [{ x: sx * (hw - 0.6), y: h - 1 }, { x: sx * (hw - 0.4), y: -2.6 }], 0.9, '#8a8f99', lw * 0.7)
    for (const sx of [-1, 1]) {
      ctx.fillStyle = '#c8ccd4'
      ctx.beginPath()
      ctx.arc(sx * (hw - 0.4), -2.8, 0.7, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  paintShape(ctx, body, c, lw, (g) => {
    g.fillStyle = dk
    g.beginPath()
    g.ellipse(-hw - 1.2, h * 0.6, hw * 0.5, h * 0.9, 0, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = rgba(lt, 0.7)
    g.beginPath()
    g.ellipse(hw * 0.45, h * 0.2, hw * 0.22, h * 0.12, 0, 0, Math.PI * 2)
    g.fill()
    if (style === 'basket') {
      g.strokeStyle = dk
      g.lineWidth = 0.45
      for (let y = 2.2; y < h; y += 1.8) {
        g.beginPath()
        g.moveTo(-hw - 1, y)
        for (let x = -hw; x <= hw + 1; x += 1.6) g.quadraticCurveTo(x + 0.4, y + 0.7 * (Math.round(x) % 2 ? 1 : -1), x + 0.8, y)
        g.stroke()
      }
      g.strokeStyle = shade(c, -0.08)
      g.lineWidth = 0.6
      for (let x = -hw + 1.4; x < hw; x += 2.2) {
        g.beginPath()
        g.moveTo(x, 0)
        g.lineTo(x * 0.9, h)
        g.stroke()
      }
    }
  })

  if (!small || standalone) {
    switch (style) {
      case 'roll-top': {
        for (const sx of [-0.32, 0.32]) {
          inkStroke(ctx, [{ x: sx * w, y: 1.6 }, { x: sx * w, y: h * 0.58 }], 1.1, dk, lw * 0.7)
          ctx.fillStyle = '#e8d38a'
          ctx.fillRect(sx * w - 0.8, h * 0.5, 1.6, 1.2)
        }
        const pocket = roundRectPath(-hw + 1.4, h * 0.62, w - 2.8, h * 0.3, 1.2)
        paintShape(ctx, pocket, shade(c, -0.06), lw * 0.7)
        break
      }
      case 'daypack': {
        const pocket = roundRectPath(-hw + 1.2, h * 0.45, w - 2.4, h * 0.45, 2)
        paintShape(ctx, pocket, lt, lw * 0.75)
        ctx.strokeStyle = dk
        ctx.lineWidth = 0.45
        ctx.beginPath()
        ctx.moveTo(-hw + 2, h * 0.53)
        ctx.quadraticCurveTo(0, h * 0.47, hw - 2, h * 0.53)
        ctx.stroke()
        ctx.fillStyle = '#f2c14e'
        ctx.beginPath()
        ctx.arc(hw - 2.4, h * 0.56, 0.6, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = '#a07a20'
        ctx.lineWidth = 0.3
        ctx.stroke()
        break
      }
      case 'frame': {
        const pocket = roundRectPath(-hw + 1.6, h * 0.3, w - 3.2, h * 0.32, 1.2)
        paintShape(ctx, pocket, shade(c, -0.07), lw * 0.7)
        // Sleeping mat strapped underneath.
        const mat = roundRectPath(-hw - 0.8, h - 1.2, w + 1.6, 3.2, 1.6)
        paintShape(ctx, mat, '#e7c98f', lw * 0.8, (g) => {
          g.fillStyle = '#d06b4b'
          g.fillRect(-hw - 1, h - 0.1, w + 2, 0.7)
        })
        break
      }
      case 'bear': {
        // A sleepy bear face on the front.
        ctx.fillStyle = lt
        ctx.beginPath()
        ctx.ellipse(0, h * 0.66, hw * 0.42, h * 0.17, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#3a2620'
        ctx.beginPath()
        ctx.ellipse(0, h * 0.6, 0.85, 0.55, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = '#3a2620'
        ctx.lineWidth = 0.45
        ctx.lineCap = 'round'
        for (const sx of [-1, 1]) {
          ctx.beginPath()
          ctx.arc(sx * hw * 0.42, h * 0.43, 0.7, 0.2, Math.PI - 0.2)
          ctx.stroke()
        }
        break
      }
      case 'patches': {
        // Star, heart and a little mountain, stitched on.
        ctx.save()
        ctx.translate(-hw * 0.35, h * 0.38)
        starPath(ctx, 2.0)
        ctx.fillStyle = '#ffd34d'
        ctx.fill()
        ctx.strokeStyle = '#b8862a'
        ctx.lineWidth = 0.4
        ctx.stroke()
        ctx.restore()
        ctx.save()
        ctx.translate(hw * 0.38, h * 0.7)
        ctx.fillStyle = '#f28fb0'
        ctx.beginPath()
        ctx.moveTo(0, 1.4)
        ctx.bezierCurveTo(-2.6, -0.4, -1.2, -2.2, 0, -0.8)
        ctx.bezierCurveTo(1.2, -2.2, 2.6, -0.4, 0, 1.4)
        ctx.fill()
        ctx.strokeStyle = '#b0506e'
        ctx.lineWidth = 0.4
        ctx.stroke()
        ctx.restore()
        const m = roundRectPath(-hw + 1.2, h * 0.68, 3.6, 3.2, 0.6)
        paintShape(ctx, m, '#7cb66a', 0.4, (g) => {
          g.fillStyle = '#ffffff'
          g.beginPath()
          g.moveTo(-hw + 1.6, h * 0.68 + 3)
          g.lineTo(-hw + 3, h * 0.68 + 0.7)
          g.lineTo(-hw + 4.4, h * 0.68 + 3)
          g.fill()
        })
        break
      }
      case 'basket': {
        // Leather straps.
        for (const sx of [-0.3, 0.3]) inkStroke(ctx, [{ x: sx * w, y: 0.8 }, { x: sx * w * 0.9, y: h * 0.45 }], 1.0, '#8a5a3a', lw * 0.6)
        break
      }
    }
  }

  // The opening (or a closed lid).
  if (open) {
    const rim = new Path2D()
    rim.ellipse(0, 0.2, hw - 0.4, 1.35, 0, 0, Math.PI * 2)
    ctx.fillStyle = '#3d2a36'
    ctx.fill(rim)
    const lip = style === 'basket' ? shade(c, -0.22) : style === 'roll-top' ? dk : shade(c, -0.05)
    ctx.strokeStyle = lip
    ctx.lineWidth = style === 'roll-top' || style === 'basket' ? 1.6 : 1.0
    ctx.beginPath()
    ctx.ellipse(0, 0.2, hw - 0.4, 1.35, 0, 0.05, Math.PI - 0.05)
    ctx.stroke()
    ctx.strokeStyle = ink(c)
    ctx.lineWidth = lw * 0.8
    ctx.stroke(rim)
  } else {
    const lid = new Path2D()
    lid.moveTo(-hw + 0.4, 0.6)
    lid.quadraticCurveTo(0, -2.0, hw - 0.4, 0.6)
    lid.lineTo(hw - 1, 3.2)
    lid.quadraticCurveTo(0, 4.0, -hw + 1, 3.2)
    lid.closePath()
    paintShape(ctx, lid, dk, lw * 0.85)
    ctx.fillStyle = '#e8d38a'
    ctx.fillRect(-0.8, 2.6, 1.6, 1.4)
  }
}

function starPath(ctx: CanvasRenderingContext2D, r: number): void {
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const rr = i % 2 ? r * 0.48 : r
    if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr)
    else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr)
  }
  ctx.closePath()
}

function backpack(d: Draw, goat: GoatState | null): void {
  const { ctx, sk, look, lw, small } = d
  ctx.save()
  enterTorso(ctx, sk)
  ctx.translate(PACK.x, PACK.y)
  ctx.rotate(-0.06)
  if (d.gear.has('gear-sleeping-roll')) {
    const col = d.gear.get('gear-sleeping-roll') ?? '#d9b98a'
    const mat = roundRectPath(-PACK.w / 2 - 1.2, PACK.h - 1.6, PACK.w + 2.4, 3.6, 1.8)
    paintShape(ctx, mat, col, lw, (g) => {
      g.fillStyle = shade(col, -0.18)
      g.fillRect(-PACK.w, PACK.h - 0.4, PACK.w * 2, 0.8)
    })
  }
  if (d.gear.has('gear-backpack-flag')) {
    const col = d.gear.get('gear-backpack-flag') ?? '#f28c3a'
    const px = -PACK.w / 2 + 1.2
    inkStroke(ctx, [{ x: px, y: 4 }, { x: px - 1.6, y: -19 }], 0.55, '#8a6a4a', lw * 0.6)
    const wave = Math.sin(d.t * 5) * 0.9
    const f = new Path2D()
    f.moveTo(px - 1.6, -19)
    f.quadraticCurveTo(px - 5, -18.6 + wave, px - 8.4, -17.2 + wave)
    f.quadraticCurveTo(px - 5, -16.2 - wave * 0.5, px - 1.3, -15.6)
    f.closePath()
    paintShape(ctx, f, col, lw * 0.7)
  }
  packShape(ctx, look.backpack, look.backpackColor, PACK.w, PACK.h, lw, small, !!goat, false)
  if (d.gear.has('gear-rainbow-rope')) {
    ctx.save()
    ctx.translate(-PACK.w / 2 + 0.6, PACK.h * 0.55)
    ctx.lineWidth = 0.9
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = RAINBOW[i % RAINBOW.length]
      ctx.beginPath()
      ctx.ellipse(-0.4 + i * 0.25, 0, 2.2 - i * 0.25, 3.4 - i * 0.3, 0.15, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.restore()
  }
  ctx.restore()
}

// ---------------------------------------------------------------------------------------------
// Hair

function hairPaint(d: Draw, path: Path2D, strands?: (g: CanvasRenderingContext2D) => void): void {
  const { ctx, pal, lw, small } = d
  paintShape(ctx, path, pal.hair, lw, (g) => {
    g.fillStyle = pal.hairShade
    g.beginPath()
    g.ellipse(-12, 8, 8, 18, 0.2, 0, Math.PI * 2)
    g.fill()
    if (!small && strands) strands(g)
  }, pal.hairInk)
}

function strandLines(d: Draw, g: CanvasRenderingContext2D, lines: readonly (readonly Pt[])[]): void {
  g.strokeStyle = d.pal.hairLight
  g.lineWidth = 0.7
  g.lineCap = 'round'
  for (const ln of lines) {
    g.beginPath()
    g.moveTo(ln[0].x, ln[0].y)
    if (ln.length === 3) g.quadraticCurveTo(ln[1].x, ln[1].y, ln[2].x, ln[2].y)
    else g.lineTo(ln[1].x, ln[1].y)
    g.stroke()
  }
}

/** A hanging piece of hair that sways, and floats up when she falls. Rotates about `root`. */
function swayAngle(d: Draw, speed: number, amp: number, phase = 0): number {
  return Math.sin(d.t * speed + phase) * amp
}

function braidChain(d: Draw, from: Pt, to: Pt, links: number, wid: number, tie: string): void {
  const { ctx, pal, lw } = d
  const dx = to.x - from.x
  const dy = to.y - from.y
  const ang = Math.atan2(dy, dx)
  for (let i = 0; i < links; i++) {
    const k = (i + 0.5) / links
    const p = { x: from.x + dx * k, y: from.y + dy * k }
    const w = wid * (1 - k * 0.3)
    const path = new Path2D()
    path.ellipse(p.x, p.y, (Math.hypot(dx, dy) / links) * 0.72, w, ang + (i % 2 ? 0.35 : -0.35), 0, Math.PI * 2)
    paintShape(ctx, path, i % 2 ? pal.hair : shade(pal.hair, -0.06), lw, (g) => {
      g.fillStyle = pal.hairLight
      g.beginPath()
      g.ellipse(p.x + 0.4, p.y - 0.5, w * 0.5, w * 0.25, ang, 0, Math.PI * 2)
      g.fill()
    }, pal.hairInk)
  }
  // Tie and a little tuft.
  const end = to
  const tuft = new Path2D()
  tuft.moveTo(end.x - 1.4, end.y)
  tuft.quadraticCurveTo(end.x - 1.8, end.y + 2.6, end.x, end.y + 3.4)
  tuft.quadraticCurveTo(end.x + 1.8, end.y + 2.6, end.x + 1.4, end.y)
  tuft.closePath()
  paintShape(ctx, tuft, pal.hair, lw, undefined, pal.hairInk)
  inkStroke(ctx, [{ x: end.x - 1.2, y: end.y }, { x: end.x + 1.2, y: end.y }], 1.0, tie, lw * 0.7)
}

function hairBack(d: Draw): void {
  const { ctx, sk, pal, lw, look, floatH } = d
  ctx.save()
  enterHead(ctx, sk)
  const tie = shade(look.outfitColor, 0.05)
  switch (look.hairStyle) {
    case 'ponytail': {
      // A high, bouncy ponytail out of the helmet's ponytail port.
      ctx.save()
      ctx.translate(-11.0, -9.2)
      ctx.rotate((swayAngle(d, 2.3, 6) + floatH * 90 - 10) * DEG)
      const p = new Path2D()
      p.moveTo(0.8, -1.7)
      p.bezierCurveTo(-3.4, -4.8, -9.4, -4.6, -11.8, -1.2)
      p.bezierCurveTo(-13.4, 1.2, -13.0, 4.2, -11.4, 6.0)
      p.bezierCurveTo(-11.2, 4.0, -10.4, 2.2, -8.6, 1.6)
      p.bezierCurveTo(-6.4, 0.9, -3.0, 2.2, 0.8, 1.6)
      p.closePath()
      hairPaint(d, p, (g) =>
        strandLines(d, g, [
          [{ x: -1.4, y: -1.8 }, { x: -7.6, y: -3.6 }, { x: -10.8, y: 0.4 }],
          [{ x: -2.2, y: 0.2 }, { x: -7.4, y: -1.2 }, { x: -10.6, y: 3.0 }],
        ]),
      )
      // Scrunchie.
      const s = new Path2D()
      s.ellipse(0.4, 0, 1.5, 2.3, 0.2, 0, Math.PI * 2)
      paintShape(ctx, s, tie, lw * 0.8, (g) => {
        g.fillStyle = shade(tie, 0.3)
        g.beginPath()
        g.arc(0.8, -0.8, 0.6, 0, Math.PI * 2)
        g.fill()
      })
      ctx.restore()
      // Hair under the back of the helmet.
      const nape = new Path2D()
      nape.moveTo(-12.4, -1.6)
      nape.quadraticCurveTo(-13.2, 4.4, -9.6, 7.6)
      nape.lineTo(-6, 4)
      nape.closePath()
      hairPaint(d, nape)
      break
    }
    case 'buns': {
      const nape = new Path2D()
      nape.moveTo(-12.4, -1.6)
      nape.quadraticCurveTo(-13.4, 4.6, -9.4, 8)
      nape.lineTo(-6, 4)
      nape.closePath()
      hairPaint(d, nape)
      const bob = Math.sin(d.t * 2.6) * 0.25
      for (const [x, y, r] of [[-12.6, -0.8, 4.0], [12.0, -0.2, 3.9]] as const) {
        const b = new Path2D()
        b.arc(x, y + bob, r, 0, Math.PI * 2)
        hairPaint(d, b, (g) => {
          g.strokeStyle = pal.hairLight
          g.lineWidth = 0.6
          g.beginPath()
          g.arc(x + 0.3, y + bob - 0.2, r * 0.55, -2.4, 0.4)
          g.stroke()
        })
        inkStroke(ctx, [{ x: x + r * 0.55, y: y + bob - r * 0.75 }, { x: x + r * 0.9, y: y + bob - r * 0.1 }], 1.0, tie, lw * 0.7)
      }
      break
    }
    case 'bob': {
      const lift = floatH * 5
      const p = new Path2D()
      p.moveTo(-11.6, -5)
      p.bezierCurveTo(-14.6, -1, -14.4, 6, -13.6, 9.6 - lift)
      p.quadraticCurveTo(-11.4, 11.6 - lift, -8.6, 10.2 - lift)
      p.lineTo(8.6, 10.6 - lift)
      p.quadraticCurveTo(11.8, 11 - lift, 13.0, 8.6 - lift)
      p.bezierCurveTo(13.8, 4, 13.6, -1, 12.0, -4.6)
      p.closePath()
      hairPaint(d, p)
      break
    }
    case 'long': {
      const f = floatH
      const sway = swayAngle(d, 1.8, 1)
      const tipY = 23 - f * 26
      const p = new Path2D()
      p.moveTo(-11.8, -5)
      p.bezierCurveTo(-15, 0, -15.6 + sway, 10 - f * 8, -15 + sway - f * 2, tipY - 3)
      p.quadraticCurveTo(-14 + sway, tipY + 1, -11.4 + sway, tipY)
      p.quadraticCurveTo(-10.2 + sway, tipY + 1.6, -8.4 + sway, tipY - 0.4)
      p.quadraticCurveTo(-6.8 + sway, tipY + 0.8, -5.6 + sway, tipY - 2)
      p.bezierCurveTo(-4.4, 14 - f * 10, -2, 11, 2, 11)
      p.lineTo(9.6, 10.4)
      p.bezierCurveTo(11.8, 14 - f * 10, 12.6 + sway, 15 - f * 14, 12.2 + sway, 17 - f * 16)
      p.quadraticCurveTo(13.8 + sway, 13 - f * 12, 13.4, 6)
      p.bezierCurveTo(13.8, 2, 13.4, -2, 12.0, -4.6)
      p.closePath()
      hairPaint(d, p, (g) =>
        strandLines(d, g, [
          [{ x: -13, y: 0 }, { x: -14, y: 8 }, { x: -12.6 + sway, y: tipY - 4 }],
          [{ x: -10.6, y: 6 }, { x: -9.4, y: 12 }, { x: -8.8 + sway, y: tipY - 3 }],
        ]),
      )
      break
    }
    case 'curly': {
      const puffs: [number, number, number][] = [
        [-11.6, -4.2, 3.6],
        [-13.8, 0.6, 3.9],
        [-13.6, 5.8, 3.8],
        [-11.4, 10.0, 3.6],
        [-7.4, 11.6, 3.2],
        [-14.4, -8.6 + floatH * -2, 3.0],
        [12.2, -3.4, 3.0],
        [13.4, 1.6, 3.2],
        [12.4, 6.4, 3.0],
        [9.6, 9.6, 2.6],
      ]
      curlCloud(d, puffs)
      break
    }
    case 'braids': {
      const nape = new Path2D()
      nape.moveTo(-12.4, -1.8)
      nape.quadraticCurveTo(-13.4, 4.6, -9.8, 8.4)
      nape.lineTo(-6, 4)
      nape.closePath()
      hairPaint(d, nape)
      const sw = swayAngle(d, 2, 1.2)
      braidChain(d, { x: -11.0, y: 4 }, { x: -12.6 + sw - floatH * 6, y: 21 - floatH * 24 }, 6, 2.0, tie)
      break
    }
    case 'crop': {
      const near = new Path2D()
      near.moveTo(10.4, -4.6)
      near.quadraticCurveTo(13.4, -1.6, 12.0, 2.6)
      near.lineTo(10.2, 0.4)
      near.closePath()
      hairPaint(d, near)
      const p = new Path2D()
      p.moveTo(-12.2, -2.6)
      p.quadraticCurveTo(-13.4, 2.8, -11.4, 6.4)
      p.quadraticCurveTo(-10.4, 5.4, -10.0, 6.8)
      p.quadraticCurveTo(-8.6, 5.6, -7.4, 6.2)
      p.lineTo(-6, 0)
      p.closePath()
      hairPaint(d, p)
      break
    }
    case 'pigtails': {
      const nape = new Path2D()
      nape.moveTo(-12.4, -1.6)
      nape.quadraticCurveTo(-13.2, 4, -9.8, 7)
      nape.lineTo(-6, 3)
      nape.closePath()
      hairPaint(d, nape)
      ctx.save()
      ctx.translate(-11.6, 1.6)
      ctx.rotate((swayAngle(d, 3, 6) + floatH * 80) * DEG)
      pigtail(d, -1, tie)
      ctx.restore()
      break
    }
    case 'locs': {
      locStrands(d, [
        [-11.6, -3.6, -14.4, 13],
        [-12.6, -0.6, -13.0, 15],
        [-11.4, 2.4, -10.6, 15.6],
        [-9.2, 4.4, -8.0, 14.6],
        [-6.4, 6, -5.2, 13.6],
        [11.8, -2.6, 13.2, 12.4],
        [10.6, 1.6, 10.8, 13.4],
      ])
      break
    }
  }
  ctx.restore()
}

function curlCloud(d: Draw, puffs: readonly (readonly [number, number, number])[]): void {
  const { ctx, pal, lw, small } = d
  const path = new Path2D()
  for (const [x, y, r] of puffs) {
    path.moveTo(x + r, y)
    path.arc(x, y, r, 0, Math.PI * 2)
  }
  ctx.strokeStyle = pal.hairInk
  ctx.lineWidth = lw * 2
  ctx.stroke(path)
  ctx.fillStyle = pal.hair
  ctx.fill(path)
  ctx.save()
  ctx.clip(path)
  ctx.fillStyle = pal.hairShade
  for (const [x, y, r] of puffs) {
    ctx.beginPath()
    ctx.arc(x - r * 0.25, y + r * 0.5, r * 0.75, 0, Math.PI * 2)
    ctx.fill()
  }
  if (!small) {
    ctx.strokeStyle = pal.hairLight
    ctx.lineWidth = 0.6
    ctx.lineCap = 'round'
    for (const [x, y, r] of puffs) {
      ctx.beginPath()
      ctx.arc(x + r * 0.1, y - r * 0.1, r * 0.45, -2.6, -0.6)
      ctx.stroke()
    }
  }
  ctx.restore()
}

function locStrands(d: Draw, strands: readonly (readonly [number, number, number, number])[]): void {
  const { ctx, pal, lw, floatH } = d
  strands.forEach(([x0, y0, x1, y1], i) => {
    const sway = Math.sin(d.t * 2 + i) * 0.6
    const ex = x1 + sway + (x1 < 0 ? -1 : 1) * floatH * 4
    const ey = y1 - floatH * (y1 - y0 + 6)
    const mid = { x: (x0 + ex) / 2 + (x1 < 0 ? -1.2 : 1.2), y: (y0 + ey) / 2 }
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.quadraticCurveTo(mid.x, mid.y, ex, ey)
    ctx.strokeStyle = pal.hairInk
    ctx.lineWidth = 2.5 + lw * 2
    ctx.stroke()
    ctx.strokeStyle = i % 2 ? pal.hair : shade(pal.hair, -0.08)
    ctx.lineWidth = 2.5
    ctx.stroke()
    if (!d.small) {
      ctx.strokeStyle = pal.hairLight
      ctx.lineWidth = 0.5
      ctx.setLineDash([0.9, 1.4])
      ctx.stroke()
      ctx.setLineDash([])
    }
    if (i === 1 || i === 5) {
      const b = lerpPt(mid, { x: ex, y: ey }, 0.4)
      ctx.fillStyle = '#f2c14e'
      ctx.strokeStyle = '#a07a20'
      ctx.lineWidth = 0.35
      ctx.beginPath()
      ctx.ellipse(b.x, b.y, 1.5, 0.8, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
  })
}

/** A pigtail sprouting at the origin, pointing outward (dir −1 back, +1 front) and down. */
function pigtail(d: Draw, dir: 1 | -1, tie: string): void {
  const { ctx, lw } = d
  const p = new Path2D()
  p.moveTo(0, -1.6)
  p.bezierCurveTo(dir * 5, -2.6, dir * 7.4, 2.4, dir * 6.4, 8.4)
  p.quadraticCurveTo(dir * 5.6, 10, dir * 4.4, 8.6)
  p.bezierCurveTo(dir * 4.6, 4, dir * 2.6, 1.8, 0, 1.6)
  p.closePath()
  hairPaint(d, p, (g) => strandLines(d, g, [[{ x: dir * 1.4, y: -0.4 }, { x: dir * 5.2, y: 0.6 }, { x: dir * 5.4, y: 7 }]]))
  const s = new Path2D()
  s.ellipse(0, 0, 1.3, 2.0, 0, 0, Math.PI * 2)
  paintShape(ctx, s, tie, lw * 0.8)
}

/** Fringe + side locks, drawn over the face, under the helmet. */
function hairFront(d: Draw): void {
  const { ctx, look, pal, lw } = d
  const tie = shade(look.outfitColor, 0.05)
  const fringe = (pts: readonly (readonly [number, number])[]) => {
    const p = new Path2D()
    p.moveTo(-6.4, -9)
    p.lineTo(pts[0][0], pts[0][1])
    smoothPath(
      p,
      pts.map(([x, y]) => ({ x, y })),
      false,
    )
    p.lineTo(12.8, -9)
    p.closePath()
    hairPaint(d, p, (g) =>
      strandLines(d, g, [
        [{ x: 2.6, y: -4.6 }, { x: 1.6, y: -2.6 }, { x: 0.2, y: -1.2 }],
        [{ x: 7.4, y: -5.2 }, { x: 7.2, y: -3.6 }, { x: 6.4, y: -2.4 }],
      ]),
    )
  }
  const sideLock = (long: boolean) => {
    const p = new Path2D()
    p.moveTo(-12.4, -2)
    p.quadraticCurveTo(-11.4, long ? 7 : 4, -9.2, long ? 9.6 : 6.4)
    p.quadraticCurveTo(-8.6, 4, -9.2, -1.2)
    p.closePath()
    hairPaint(d, p)
  }
  switch (look.hairStyle) {
    case 'ponytail':
      fringe([[-5.6, -2.2], [-3.8, 1.1], [-1.2, -0.8], [1.6, 1.3], [4.4, -1.0], [7.2, 0.7], [9.8, -1.8], [11.8, -3.6]])
      break
    case 'buns':
    case 'braids':
      fringe([[-5.6, -1.6], [-3.6, 0.8], [-0.6, -0.8], [2.2, -3.6], [4.8, -1.2], [8.6, 0.6], [11.8, -2.8]])
      sideLock(look.hairStyle === 'braids')
      if (look.hairStyle === 'braids') {
        const sw = Math.sin(d.t * 2 + 1) * 0.8
        braidChain(d, { x: 10.6, y: 4.2 }, { x: 11.8 + sw + d.floatH * 4, y: 19 - d.floatH * 22 }, 5, 1.9, tie)
      }
      break
    case 'bob':
      fringe([[-5.6, -1.8], [-4.4, 1.0], [-1.6, 1.1], [-0.4, 0.3], [1.2, 1.2], [4.6, 1.0], [5.9, 0.3], [7.4, 1.0], [10.6, 0.4], [11.9, -2.8]])
      sideLock(true)
      break
    case 'long':
      fringe([[-5.6, -2.0], [-4.4, 1.2], [-1.6, 0.6], [2.0, -0.6], [6.0, -1.9], [9.6, -2.8], [11.8, -3.8]])
      sideLock(true)
      break
    case 'curly': {
      curlCloud(d, [
        [-4.6, -2.2, 2.0],
        [-1.6, -2.6, 2.1],
        [1.6, -3.2, 2.0],
        [4.8, -3.6, 1.9],
        [8.0, -3.8, 1.8],
        [10.8, -3.4, 1.6],
        [-8.4, -1.8, 2.2],
        [-11.2, 1.4, 2.4],
      ])
      break
    }
    case 'crop':
      fringe([[-5.6, -2.4], [-4.4, 0.4], [-2.6, -1.6], [-0.8, 1.0], [1.2, -1.5], [3.2, 0.8], [5.4, -1.6], [7.6, 0.4], [9.6, -2.2], [11.8, -3.8]])
      {
        const p = new Path2D()
        p.moveTo(-12.3, -1.8)
        p.quadraticCurveTo(-11.6, 2.4, -10.0, 3.6)
        p.quadraticCurveTo(-9.4, 1.2, -9.4, -1.2)
        p.closePath()
        hairPaint(d, p)
      }
      break
    case 'pigtails':
      fringe([[-5.6, -2.0], [-4.4, 0.6], [-2.0, -0.4], [0.4, 0.8], [3.0, -0.6], [5.6, 0.6], [8.4, -0.8], [10.4, -0.2], [11.9, -3.2]])
      ctx.save()
      ctx.translate(10.6, 1.0)
      ctx.rotate((Math.sin(d.t * 3 + 0.8) * 6 - d.floatH * 80) * DEG)
      pigtail(d, 1, tie)
      ctx.restore()
      break
    case 'locs':
      fringe([[-5.6, -2.0], [-4.4, -0.6], [-2, -2.4], [0, -2.6], [3, -3.4], [6, -3.8], [11.8, -4.2]])
      locStrands(d, [
        [-2.6, -3, -3.2, 1.4],
        [1.4, -3.6, 1.0, 0.9],
        [-10.8, -1.4, -11.4, 7.6],
      ])
      break
    default:
      fringe([[-5.6, -2.4], [-1, 0.5], [4.4, -1.4], [11.8, -3.6]])
  }
  void pal
  void lw
}

// ---------------------------------------------------------------------------------------------
// Head, helmet, face

function headPath(): Path2D {
  const p = new Path2D()
  p.moveTo(0.3, -10.6)
  p.bezierCurveTo(6.6, -10.6, 11.5, -5.8, 11.5, 0.4)
  p.bezierCurveTo(11.5, 6.6, 8.2, 11.0, 3.0, 11.0)
  p.bezierCurveTo(-3.8, 11.0, -10.9, 7.6, -10.9, 0.4)
  p.bezierCurveTo(-10.9, -6.0, -5.9, -10.6, 0.3, -10.6)
  p.closePath()
  return p
}

function head(d: Draw): void {
  const { ctx, sk, pal, lw, small } = d
  ctx.save()
  enterHead(ctx, sk)

  // Ear.
  const ear = new Path2D()
  ear.ellipse(-10.3, 3.6, 2.1, 2.8, -0.15, 0, Math.PI * 2)
  paintShape(ctx, ear, pal.skin, lw, (g) => {
    g.fillStyle = pal.skinShade
    g.beginPath()
    g.ellipse(-10.0, 3.9, 1.0, 1.6, -0.15, 0, Math.PI * 2)
    g.fill()
  }, pal.skinInk)

  const hp = headPath()
  paintShape(ctx, hp, pal.skin, lw, (g) => {
    g.fillStyle = pal.skinShade
    g.beginPath()
    g.ellipse(-11.6, 2.6, 4.4, 12, 0.08, 0, Math.PI * 2)
    g.fill()
    // Soft shadow under the helmet rim.
    g.strokeStyle = rgba(pal.skinShade, 0.9)
    g.lineWidth = 2.2
    g.beginPath()
    g.moveTo(RIM_B.x, RIM_B.y + 1)
    g.quadraticCurveTo(RIM_C.x, RIM_C.y + 1.2, RIM_F.x, RIM_F.y + 1)
    g.stroke()
  }, pal.skinInk)

  // Cheeks.
  const f = d.face
  if (f.blush > 0) {
    ctx.fillStyle = pal.deep ? rgba('#ff8f8f', 0.3 + 0.32 * f.blush) : rgba('#ff7f86', 0.18 + 0.3 * f.blush)
    ctx.beginPath()
    ctx.ellipse(FACE.cheekB.x, FACE.cheekB.y, 1.9, 1.15, 0, 0, Math.PI * 2)
    ctx.ellipse(FACE.cheekF.x, FACE.cheekF.y, 1.8, 1.1, 0, 0, Math.PI * 2)
    ctx.fill()
    if (!small && f.blush > 0.7) {
      ctx.strokeStyle = rgba('#ffffff', 0.7)
      ctx.lineWidth = 0.35
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(FACE.cheekF.x - 0.9, FACE.cheekF.y + 0.3)
      ctx.lineTo(FACE.cheekF.x - 0.4, FACE.cheekF.y - 0.4)
      ctx.moveTo(FACE.cheekF.x + 0.1, FACE.cheekF.y + 0.3)
      ctx.lineTo(FACE.cheekF.x + 0.6, FACE.cheekF.y - 0.4)
      ctx.stroke()
    }
  }
  const paint = d.gear.get('gear-face-paint')
  if (paint) {
    // On the open cheek (the front one sits under braids and side hair), outlined so a pale
    // colour still reads at thumbnail size.
    ctx.save()
    ctx.translate(FACE.cheekB.x - 0.4, FACE.cheekB.y - 0.3)
    ctx.rotate(-0.15)
    starPath(ctx, 1.75)
    ctx.fillStyle = paint
    ctx.fill()
    ctx.strokeStyle = rgba(shade(paint, -0.45), 0.75)
    ctx.lineWidth = 0.32
    ctx.lineJoin = 'round'
    ctx.stroke()
    ctx.restore()
  }

  hairFront(d)
  helmet(d)
  faceFeatures(d)
  faceGear(d)
  ctx.restore()
}

function helmet(d: Draw): void {
  const { ctx, pal, lw, small, look, t } = d
  const c = pal.helmet
  const style = look.helmet
  const dk = shade(c, -0.18)

  if (style === 'cat') {
    for (const [x, y, a] of [[-6.6, -11.4, -0.5], [4.6, -13.0, 0.3]] as const) {
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(a)
      const p = new Path2D()
      p.moveTo(-2.8, 1.6)
      p.quadraticCurveTo(-1.4, -3.4, 0, -4.6)
      p.quadraticCurveTo(1.4, -3.4, 2.8, 1.6)
      p.closePath()
      paintShape(ctx, p, c, lw, (g) => {
        g.fillStyle = '#f7b3c2'
        g.beginPath()
        g.moveTo(-1.3, 1.2)
        g.quadraticCurveTo(-0.6, -1.8, 0, -2.8)
        g.quadraticCurveTo(0.6, -1.8, 1.3, 1.2)
        g.fill()
      })
      ctx.restore()
    }
  }

  const dome = new Path2D()
  dome.moveTo(RIM_B.x, RIM_B.y)
  if (style === 'vented') {
    dome.lineTo(-14.2, -2.6)
    dome.bezierCurveTo(-13.4, -9.6, -7.0, -14.2, 0.6, -14.1)
  } else {
    dome.bezierCurveTo(-12.9, -8.6, -6.9, -14.1, 0.6, -14.1)
  }
  dome.bezierCurveTo(7.4, -14.1, 12.7, -10.2, RIM_F.x, RIM_F.y)
  dome.quadraticCurveTo(RIM_C.x, RIM_C.y, RIM_B.x, RIM_B.y)
  dome.closePath()

  paintShape(ctx, dome, c, lw, (g) => {
    if (style === 'dotty') {
      g.fillStyle = shade(c, 0.6)
      for (const [x, y, r] of [[-7.6, -8.2, 1.5], [-2.2, -11.6, 1.3], [3.8, -9.0, 1.6], [8.6, -9.8, 1.1], [-1.6, -5.4, 1.1], [-10.6, -3.4, 1.0], [9.8, -5.6, 1.0]] as const) {
        g.beginPath()
        g.arc(x, y, r, 0, Math.PI * 2)
        g.fill()
      }
    }
    if (style === 'vented') {
      g.fillStyle = shade(c, 0.35)
      g.beginPath()
      g.moveTo(-14, -3.4)
      g.bezierCurveTo(-10, -12.6, 2, -14.6, 12.8, -8.6)
      g.lineTo(12.8, -6.8)
      g.bezierCurveTo(2, -12.4, -9.6, -10.8, -14, -1.4)
      g.closePath()
      g.fill()
    }
    g.fillStyle = dk
    g.beginPath()
    g.ellipse(-12.8, -3.2, 5.2, 13, 0.1, 0, Math.PI * 2)
    g.fill()
    // Shine.
    g.fillStyle = rgba('#ffffff', luma(c) > 0.8 ? 0.85 : 0.45)
    g.beginPath()
    g.ellipse(4.4, -10.8, 3.4, 1.25, 0.36, 0, Math.PI * 2)
    g.fill()
    g.beginPath()
    g.arc(8.6, -8.4, 0.7, 0, Math.PI * 2)
    g.fill()
  })

  // Vents / stickers.
  if (style === 'classic') {
    ctx.fillStyle = dk
    for (const [x, y, a] of [[-5.6, -11.2, -0.5], [-0.6, -12.6, 0], [4.4, -11.9, 0.45]] as const) {
      ctx.beginPath()
      ctx.ellipse(x, y, 1.5, 0.75, a, 0, Math.PI * 2)
      ctx.fill()
    }
  } else if (style === 'vented') {
    ctx.strokeStyle = ink(c)
    ctx.lineCap = 'round'
    ctx.lineWidth = 1.2
    for (const [x0, y0, x1, y1] of [[-9.6, -8.6, -6.2, -11.6], [-3.6, -12.4, 0.6, -13.0], [4.2, -12.6, 7.6, -11.0]] as const) {
      ctx.beginPath()
      ctx.moveTo(x0, y0)
      ctx.lineTo(x1, y1)
      ctx.stroke()
    }
  } else if (style === 'star') {
    ctx.save()
    ctx.translate(-4.2, -7.6)
    ctx.rotate(-0.2)
    starPath(ctx, 3.6)
    ctx.fillStyle = '#ffe07a'
    ctx.fill()
    ctx.strokeStyle = '#c4902a'
    ctx.lineWidth = lw * 0.8
    ctx.stroke()
    ctx.fillStyle = '#fff6c8'
    ctx.beginPath()
    ctx.arc(-0.9, -1.1, 0.7, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  } else if (style === 'cat' && !small) {
    // Whisker stickers.
    ctx.strokeStyle = dk
    ctx.lineWidth = 0.5
    ctx.lineCap = 'round'
    for (const dy of [-0.8, 0.8]) {
      ctx.beginPath()
      ctx.moveTo(-9.6, -5.4 + dy)
      ctx.lineTo(-6.6, -5.8 + dy * 1.4)
      ctx.stroke()
    }
  }
  if (style === 'lamp' || d.gear.has('gear-headlamp')) headlamp(d)

  // Brim band.
  ctx.lineCap = 'round'
  ctx.strokeStyle = ink(c)
  ctx.lineWidth = 1.8 + lw * 2
  ctx.beginPath()
  ctx.moveTo(RIM_B.x + 0.3, RIM_B.y - 0.5)
  ctx.quadraticCurveTo(RIM_C.x, RIM_C.y - 0.6, RIM_F.x - 0.2, RIM_F.y - 0.6)
  ctx.stroke()
  ctx.strokeStyle = shade(c, -0.1)
  ctx.lineWidth = 1.8
  ctx.stroke()

  // Chin strap.
  if (!small) {
    ctx.strokeStyle = shade(c, -0.32)
    ctx.lineWidth = 0.75
    ctx.beginPath()
    ctx.moveTo(-8.6, -0.4)
    ctx.quadraticCurveTo(-8.4, 6.4, -4.4, 9.4)
    ctx.quadraticCurveTo(-1, 11.2, 1.8, 10.9)
    ctx.stroke()
    ctx.fillStyle = shade(c, -0.25)
    ctx.beginPath()
    ctx.arc(-8.5, 3.6, 0.65, 0, Math.PI * 2)
    ctx.fill()
  }
  helmetGear(d)
  void t
}

function headlamp(d: Draw): void {
  const { ctx, lw, t } = d
  // A colour variant of the headlamp gear tints its case; the plain one (and the helmet style) is grey.
  const lampTint = d.gear.get('gear-headlamp')
  const lampCase = lampTint && lampTint !== GEAR_DEFAULT['gear-headlamp'] ? lampTint : '#5d5676'
  ctx.strokeStyle = '#4f4866'
  ctx.lineWidth = 1.1
  ctx.beginPath()
  ctx.moveTo(-12.4, -2.6)
  ctx.quadraticCurveTo(0, -8.8, 11.2, -7.2)
  ctx.stroke()
  ctx.save()
  ctx.translate(9.0, -8.2)
  ctx.rotate(0.35)
  const body = roundRectPath(-2.0, -1.6, 4.0, 3.2, 1)
  paintShape(ctx, body, lampCase, lw * 0.85)
  const glow = 0.55 + 0.15 * Math.sin(t * 3)
  ctx.fillStyle = rgba('#fff3b0', 0.35 * glow)
  ctx.beginPath()
  ctx.arc(1.0, 0, 3.6, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#fff6c9'
  ctx.strokeStyle = '#c9a640'
  ctx.lineWidth = 0.45
  ctx.beginPath()
  ctx.arc(0.6, 0, 1.15, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

function helmetGear(d: Draw): void {
  const { ctx, gear, lw, t } = d
  const stars = gear.get('gear-star-stickers')
  if (stars) {
    for (const [x, y, r, a] of [[-8.4, -7.0, 1.5, 0.3], [-1.0, -11.4, 1.2, -0.2], [6.4, -9.6, 1.0, 0.5]] as const) {
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(a)
      starPath(ctx, r)
      ctx.fillStyle = stars
      ctx.fill()
      ctx.strokeStyle = ink(stars)
      ctx.lineWidth = 0.35
      ctx.stroke()
      ctx.restore()
    }
  }
  const bobble = gear.get('gear-bobble')
  if (bobble) {
    const wob = Math.sin(t * 3) * 0.3
    const p = new Path2D()
    for (const [x, y, r] of [[0.4 + wob, -16.4, 2.4], [-1.2 + wob, -15.6, 1.4], [1.9 + wob, -15.5, 1.4]] as const) {
      p.moveTo(x + r, y)
      p.arc(x, y, r, 0, Math.PI * 2)
    }
    ctx.strokeStyle = ink(bobble)
    ctx.lineWidth = lw * 2
    ctx.stroke(p)
    ctx.fillStyle = bobble
    ctx.fill(p)
    ctx.fillStyle = shade(bobble, 0.35)
    ctx.beginPath()
    ctx.arc(-0.2 + wob, -17.2, 0.8, 0, Math.PI * 2)
    ctx.fill()
  }
  const crown = gear.get('gear-flower-crown')
  if (crown) {
    for (let i = 0; i <= 6; i++) {
      const p = rimAt(i / 6)
      const x = p.x
      const y = p.y - 1.4
      ctx.fillStyle = i % 2 ? '#ffd1dc' : crown
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2
        ctx.beginPath()
        ctx.arc(x + Math.cos(a) * 0.85, y + Math.sin(a) * 0.85, 0.7, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.fillStyle = '#f2c14e'
      ctx.beginPath()
      ctx.arc(x, y, 0.55, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  const goggles = gear.get('gear-goggles')
  if (goggles) {
    ctx.strokeStyle = shade(goggles, -0.3)
    ctx.lineWidth = 1.3
    ctx.beginPath()
    ctx.moveTo(-12.6, -4.8)
    ctx.quadraticCurveTo(0, -11, 12.2, -8.6)
    ctx.stroke()
    for (const x of [3.4, 8.2]) {
      const g = new Path2D()
      g.ellipse(x, -9.2 + (x - 3.4) * 0.1, 2.5, 1.9, 0.2, 0, Math.PI * 2)
      paintShape(ctx, g, goggles, lw, (c) => {
        c.fillStyle = rgba('#ffffff', 0.6)
        c.beginPath()
        c.ellipse(x - 0.8, -9.8, 0.9, 0.5, 0.4, 0, Math.PI * 2)
        c.fill()
      }, '#4f4866')
    }
  }
}

function faceGear(d: Draw): void {
  const { ctx, gear, lw } = d
  const sun = gear.get('gear-sunglasses')
  if (!sun) return
  ctx.strokeStyle = '#4f3a3a'
  ctx.lineWidth = 0.6
  ctx.beginPath()
  ctx.moveTo(FACE.eyeB.x + 2.2, FACE.eyeB.y - 0.6)
  ctx.quadraticCurveTo(2.2, FACE.eyeB.y - 1.6, FACE.eyeF.x - 2.4, FACE.eyeF.y - 0.6)
  ctx.moveTo(FACE.eyeB.x - 2.4, FACE.eyeB.y - 0.8)
  ctx.lineTo(-9.8, 2.2)
  ctx.stroke()
  for (const e of [FACE.eyeB, FACE.eyeF]) {
    const r = e === FACE.eyeF ? 2.7 : 2.4
    const p = new Path2D()
    p.arc(e.x, e.y, r, 0, Math.PI * 2)
    paintShape(ctx, p, sun, lw, (c) => {
      c.fillStyle = rgba('#ffffff', 0.45)
      c.beginPath()
      c.ellipse(e.x + 0.8, e.y - 1, 0.9, 0.45, -0.5, 0, Math.PI * 2)
      c.fill()
    }, '#2f2130')
  }
}

function neckGear(d: Draw): void {
  const { ctx, sk, gear, lw, t, floatH } = d
  const scarf = gear.get('gear-scarf')
  const bandana = gear.get('gear-bandana')
  const pebbles = gear.get('gear-pebble-necklace')
  if (!scarf && !bandana && !pebbles) return
  ctx.save()
  enterTorso(ctx, sk)
  if (pebbles) {
    ctx.strokeStyle = '#8a6a4a'
    ctx.lineWidth = 0.35
    ctx.beginPath()
    ctx.moveTo(-3.6, -11.6)
    ctx.quadraticCurveTo(1, -6.6, 4.6, -11.4)
    ctx.stroke()
    ;[pebbles, '#d6c3a5', '#a9c7b5', pebbles, '#e2b4a0'].forEach((col, i) => {
      const k = (i + 0.5) / 5
      const x = -3.6 + 8.2 * k
      const y = -11.6 + Math.sin(k * Math.PI) * 3.4
      ctx.fillStyle = col
      ctx.strokeStyle = ink(col)
      ctx.lineWidth = 0.3
      ctx.beginPath()
      ctx.ellipse(x, y, 0.85, 0.65, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    })
  }
  if (bandana) {
    const p = new Path2D()
    p.moveTo(-4.4, -13.2)
    p.quadraticCurveTo(1, -12, 5, -13.2)
    p.lineTo(1.6, -7.4)
    p.closePath()
    paintShape(ctx, p, bandana, lw, (g) => {
      g.fillStyle = '#ffffff'
      for (const [x, y] of [[-1.6, -12], [1.4, -11.6], [3.4, -12.4], [0.6, -9.6], [-0.2, -12.6]] as const) {
        g.beginPath()
        g.arc(x, y, 0.42, 0, Math.PI * 2)
        g.fill()
      }
    })
  }
  if (scarf) {
    const flap = Math.sin(t * 7) * 1.2
    const up = floatH * 8
    const tail = new Path2D()
    tail.moveTo(-3.2, -12.6)
    tail.quadraticCurveTo(-9, -12 - up + flap, -13.4, -9.6 - up * 1.4 + flap)
    tail.lineTo(-12.6, -7.4 - up * 1.2 + flap)
    tail.quadraticCurveTo(-8.2, -9.8 - up, -3.4, -10.2)
    tail.closePath()
    paintShape(ctx, tail, shade(scarf, -0.08), lw, (g) => {
      g.fillStyle = '#fff6e6'
      g.fillRect(-9.6, -14, 1.2, 8)
      g.fillRect(-6.4, -14, 1.2, 8)
    })
    const wrap = roundRectPath(-4.6, -14.2, 10.2, 3.6, 1.8)
    paintShape(ctx, wrap, scarf, lw, (g) => {
      g.fillStyle = '#fff6e6'
      for (let x = -3.4; x < 6; x += 2.8) g.fillRect(x, -15, 1.1, 6)
    })
  }
  ctx.restore()
}

function cape(d: Draw): void {
  const { ctx, sk, gear, lw, t, floatH } = d
  const col = gear.get('gear-cape') ?? '#c84b6a'
  ctx.save()
  enterTorso(ctx, sk)
  const flap = Math.sin(t * 5) * 1.2
  const up = floatH * 10
  const p = new Path2D()
  p.moveTo(-3.4, -13.4)
  p.quadraticCurveTo(-12.6, -10 - up, -18.4 + flap, 5.2 - up * 2)
  p.quadraticCurveTo(-15.6, 7.2 - up * 1.6, -12.8 + flap * 0.6, 5.6 - up * 1.4)
  p.quadraticCurveTo(-10.2, 7.6 - up * 1.2, -7.4, 5.0 - up)
  p.quadraticCurveTo(-5.8, -5, -1.8, -12.4)
  p.closePath()
  paintShape(ctx, p, col, lw, (g) => {
    g.fillStyle = shade(col, -0.16)
    g.beginPath()
    g.ellipse(-12, 2, 4, 9, 0.4, 0, Math.PI * 2)
    g.fill()
  })
  ctx.restore()
}

// ---------------------------------------------------------------------------------------------
// The face

function faceFeatures(d: Draw): void {
  const { ctx, pal, lw, small, t } = d
  const f = d.face
  const blink = f.eyes === 'open' || f.eyes === 'wide' ? blinkAt(t, pal.seed) : 0
  const gz = d.gaze
  eye(d, FACE.eyeB, f, blink, gz, false)
  eye(d, FACE.eyeF, f, blink, gz, true)
  brows(d)

  // Nose: a tiny soft curve.
  ctx.strokeStyle = rgba(pal.skinInk, 0.75)
  ctx.lineWidth = Math.max(0.45, lw * 0.75)
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(FACE.nose.x - 0.2, FACE.nose.y - 0.7)
  ctx.quadraticCurveTo(FACE.nose.x + 0.9, FACE.nose.y, FACE.nose.x - 0.1, FACE.nose.y + 0.5)
  ctx.stroke()

  mouth(d)
  if (f.sweat) {
    const k = (t * 0.8) % 1
    ctx.save()
    ctx.globalAlpha = k < 0.75 ? 1 : (1 - k) * 4
    const x = -8.4
    const y = -0.4 + k * 2.4
    const p = new Path2D()
    p.moveTo(x, y - 2)
    p.quadraticCurveTo(x + 1.4, y + 0.2, x, y + 1.1)
    p.quadraticCurveTo(x - 1.4, y + 0.2, x, y - 2)
    paintShape(ctx, p, '#a8dcf4', lw * 0.8, (g) => {
      g.fillStyle = '#ffffff'
      g.beginPath()
      g.arc(x - 0.35, y - 0.1, 0.35, 0, Math.PI * 2)
      g.fill()
    }, '#5b9cc4')
    ctx.restore()
  }
  void small
}

function eye(d: Draw, e: { x: number; y: number; rx: number; ry: number }, f: FaceSpec, blink: number, gz: Pt, near: boolean): void {
  const { ctx, pal, lw, small } = d
  const { x, y, rx, ry } = e
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const lashW = Math.max(0.6, lw * 1.15)
  if (f.eyes === 'happy') {
    ctx.strokeStyle = EYE_DARK
    ctx.lineWidth = lashW * 1.15
    ctx.beginPath()
    ctx.moveTo(x - rx * 1.1, y + ry * 0.35)
    ctx.quadraticCurveTo(x, y - ry * 1.0, x + rx * 1.1, y + ry * 0.35)
    ctx.stroke()
    return
  }
  if (f.eyes === 'squeeze') {
    const s = near ? -1 : 1 // chevrons point toward the nose
    ctx.strokeStyle = EYE_DARK
    ctx.lineWidth = lashW * 1.1
    ctx.beginPath()
    ctx.moveTo(x - s * rx * 1.0, y - ry * 0.6)
    ctx.lineTo(x + s * rx * 0.9, y + ry * 0.05)
    ctx.lineTo(x - s * rx * 1.0, y + ry * 0.6)
    ctx.stroke()
    return
  }
  if (f.eyes === 'closed' || blink > 0.82) {
    ctx.strokeStyle = EYE_DARK
    ctx.lineWidth = lashW
    ctx.beginPath()
    ctx.moveTo(x - rx * 1.1, y + ry * 0.1)
    ctx.quadraticCurveTo(x, y + ry * 0.75, x + rx * 1.1, y + ry * 0.1)
    ctx.stroke()
    if (!small) {
      ctx.lineWidth = lashW * 0.7
      ctx.beginPath()
      ctx.moveTo(x + rx * 1.0, y + ry * 0.15)
      ctx.lineTo(x + rx * 1.6, y - ry * 0.1)
      ctx.stroke()
    }
    return
  }
  const open = 1 - blink
  const ox = gz.x * rx * 0.28
  const oy = gz.y * ry * 0.2
  ctx.save()
  if (f.eyes === 'wide') {
    const white = new Path2D()
    white.ellipse(x, y, rx * 1.18, ry * 1.08 * open, 0, 0, Math.PI * 2)
    ctx.fillStyle = '#ffffff'
    ctx.fill(white)
    ctx.strokeStyle = EYE_DARK
    ctx.lineWidth = lw * 0.9
    ctx.stroke(white)
    ctx.clip(white)
    ctx.fillStyle = EYE_DARK
    ctx.beginPath()
    ctx.ellipse(x + ox * 1.4, y + oy * 1.4, rx * 0.7, ry * 0.72, 0, 0, Math.PI * 2)
    ctx.fill()
  } else {
    const ball = new Path2D()
    ball.ellipse(x + ox * 0.35, y + oy * 0.35, rx, ry * open, 0, 0, Math.PI * 2)
    ctx.fillStyle = EYE_DARK
    ctx.fill(ball)
    ctx.clip(ball)
    if (!small || pal.deep) {
      ctx.fillStyle = pal.deep ? '#9a6a4c' : EYE_IRIS
      ctx.beginPath()
      ctx.ellipse(x + ox * 0.35, y + oy * 0.35 + ry * 0.62 * open, rx * 0.85, ry * 0.5 * open, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    if (f.lid > 0) {
      // Top lid lowered (focused / determined / sleepy).
      ctx.fillStyle = pal.skin
      ctx.fillRect(x - rx * 2, y - ry * 2, rx * 4, ry * (1 + f.lid * 1.7) * open)
    }
  }
  ctx.restore()

  // Lash line on the upper lid.
  const lidY = y - ry * open + (f.lid > 0 && f.eyes !== 'wide' ? ry * f.lid * 1.7 * open : 0)
  ctx.strokeStyle = EYE_DARK
  ctx.lineWidth = lashW
  ctx.beginPath()
  if (f.lid > 0 && f.eyes !== 'wide') {
    ctx.moveTo(x - rx * 1.05, lidY + 0.15)
    ctx.quadraticCurveTo(x, lidY - 0.25, x + rx * 1.05, lidY + 0.15)
  } else {
    ctx.ellipse(x + ox * 0.35, y + oy * 0.35, rx * (f.eyes === 'wide' ? 1.18 : 1), ry * open * (f.eyes === 'wide' ? 1.08 : 1), 0, Math.PI * 1.08, Math.PI * 1.92)
  }
  ctx.stroke()
  if (!small) {
    // An outer lash flick.
    ctx.lineWidth = lashW * 0.8
    ctx.beginPath()
    const lx = x + rx * 0.95
    ctx.moveTo(lx, lidY + ry * 0.35 * open)
    ctx.lineTo(lx + rx * 0.62, lidY + ry * 0.05 * open - 0.2)
    ctx.stroke()
  }

  // Highlights.
  if (open > 0.35) {
    const hx = x + ox * 1.1 + rx * 0.3
    const hy = y + oy - ry * 0.32 * open + (f.lid > 0.3 ? ry * f.lid * 0.8 : 0)
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(hx, hy, Math.max(0.5, rx * (f.eyes === 'wide' ? 0.3 : 0.42)), 0, Math.PI * 2)
    ctx.fill()
    if (!small && f.eyes !== 'wide') {
      ctx.beginPath()
      ctx.arc(x + ox * 0.6 - rx * 0.35, y + oy * 0.5 + ry * 0.42 * open, rx * 0.18, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

function brows(d: Draw): void {
  const { ctx, pal, lw } = d
  const f = d.face
  ctx.strokeStyle = mix(pal.hairShade, '#3b2335', 0.25)
  ctx.lineWidth = Math.max(0.7, lw * 1.35)
  ctx.lineCap = 'round'
  for (const [e, inner] of [[FACE.eyeB, 1], [FACE.eyeF, -1]] as const) {
    const by = e.y - e.ry - 1.5 - f.browLift
    const ix = e.x + inner * 1.5
    const ox = e.x - inner * 1.7
    const iy = by - f.browTilt * 0.85
    const oy = by + f.browTilt * 0.35
    ctx.beginPath()
    ctx.moveTo(ox, oy)
    ctx.quadraticCurveTo(e.x, Math.min(iy, oy) - 0.5, ix, iy)
    ctx.stroke()
  }
}

function mouth(d: Draw): void {
  const { ctx, pal, lw, t } = d
  const { x, y } = FACE.mouth
  const line = pal.skinInk
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = Math.max(0.5, lw * 0.95)
  ctx.strokeStyle = line
  const openShape = (w: number, dep: number, tongue: boolean) => {
    const p = new Path2D()
    p.moveTo(x - w, y - 0.3)
    p.quadraticCurveTo(x, y + 0.2, x + w, y - 0.5)
    p.bezierCurveTo(x + w * 0.8, y + dep, x - w * 0.8, y + dep, x - w, y - 0.3)
    p.closePath()
    ctx.fillStyle = MOUTH
    ctx.fill(p)
    if (tongue) {
      ctx.save()
      ctx.clip(p)
      ctx.fillStyle = TONGUE
      ctx.beginPath()
      ctx.ellipse(x + 0.3, y + dep * 0.85, w * 0.6, dep * 0.4, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(x - w, y - 1, w * 2, 0.75)
      ctx.restore()
    }
    ctx.stroke(p)
  }
  switch (d.face.mouth) {
    case 'smile':
      openShape(1.9, 2.4, true)
      break
    case 'open':
      openShape(2.5, 3.8 + Math.sin(t * 13) * 0.4, true)
      break
    case 'set':
      ctx.beginPath()
      ctx.moveTo(x - 1.4, y + 0.3)
      ctx.quadraticCurveTo(x, y + 0.7, x + 1.6, y - 0.1)
      ctx.stroke()
      break
    case 'o': {
      const p = new Path2D()
      p.ellipse(x, y + 0.5, 1.05, 1.4, 0, 0, Math.PI * 2)
      ctx.fillStyle = MOUTH
      ctx.fill(p)
      ctx.stroke(p)
      break
    }
    case 'yawn': {
      const s = 1 + 0.15 * Math.sin(t * 1.6)
      const p = new Path2D()
      p.ellipse(x, y + 0.4, 0.8 * s, 1.0 * s, 0, 0, Math.PI * 2)
      ctx.fillStyle = MOUTH
      ctx.fill(p)
      ctx.stroke(p)
      break
    }
    case 'wobble': {
      ctx.beginPath()
      const w = 3.6
      ctx.moveTo(x - w / 2, y + 0.4)
      for (let i = 1; i <= 6; i++) ctx.lineTo(x - w / 2 + (w / 6) * i, y + 0.4 + (i % 2 ? -0.55 : 0.1))
      ctx.stroke()
      break
    }
    case 'teeth': {
      const p = new Path2D()
      p.moveTo(x - 2.2, y - 0.5)
      p.quadraticCurveTo(x, y - 0.1, x + 2.4, y - 0.8)
      p.quadraticCurveTo(x + 2.3, y + 1.9, x + 0.2, y + 1.8)
      p.quadraticCurveTo(x - 2.2, y + 1.7, x - 2.2, y - 0.5)
      p.closePath()
      ctx.fillStyle = '#ffffff'
      ctx.fill(p)
      ctx.stroke(p)
      ctx.lineWidth = Math.max(0.35, lw * 0.55)
      ctx.beginPath()
      ctx.moveTo(x - 2.0, y + 0.55)
      ctx.quadraticCurveTo(x, y + 0.75, x + 2.2, y + 0.4)
      ctx.moveTo(x - 0.7, y - 0.3)
      ctx.lineTo(x - 0.75, y + 1.7)
      ctx.moveTo(x + 0.9, y - 0.4)
      ctx.lineTo(x + 0.85, y + 1.7)
      ctx.stroke()
      break
    }
    case 'tongue': {
      ctx.beginPath()
      ctx.moveTo(x - 1.4, y + 0.2)
      ctx.quadraticCurveTo(x, y + 0.6, x + 1.5, y)
      ctx.stroke()
      const p = new Path2D()
      p.ellipse(x + 1.3, y + 0.7, 0.75, 0.95, -0.5, 0, Math.PI * 2)
      ctx.fillStyle = TONGUE
      ctx.fill(p)
      ctx.lineWidth = Math.max(0.4, lw * 0.7)
      ctx.stroke(p)
      break
    }
    case 'smug':
      ctx.beginPath()
      ctx.moveTo(x - 1.8, y + 0.1)
      ctx.quadraticCurveTo(x - 0.2, y + 1.5, x + 2.0, y - 0.9)
      ctx.stroke()
      break
    case 'oof': {
      ctx.beginPath()
      ctx.moveTo(x - 1.9, y + 0.6)
      ctx.quadraticCurveTo(x - 1.2, y - 0.5, x - 0.4, y + 0.5)
      ctx.quadraticCurveTo(x + 0.4, y + 1.4, x + 1.1, y + 0.3)
      ctx.quadraticCurveTo(x + 1.6, y - 0.4, x + 2.0, y + 0.2)
      ctx.stroke()
      break
    }
  }
}
