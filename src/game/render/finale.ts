/**
 * The Sky Lake finale's pictures. Two scenes, both drawn from state the timeline hands over each
 * frame (screens/finale/timeline.ts) — nothing here keeps time of its own:
 *
 * - **The whole mountain** ('pano'): her mountain as one tall paper-cut picture, seen from the top —
 *   six zone bands stacked like layers of cut paper (meadow trees, firefly pines, crumbly mesas,
 *   snowy ridge peaks, a ring of clouds, the pink summit snow), the trail zig-zagging up through 16
 *   little camps that light up as the camera pulls out, and Sky Lake in a snowy cup on top, where she
 *   stands beside a little sign with her mountain's name on it. Drawn as vector paths, so it stays
 *   crisp across the big zoom — except the six zone bands, which never change: once the camera is out
 *   far enough, they come from one bitmap made per screen size (≤ 2048 px a side; ~265 fills and 67
 *   clips a frame otherwise). Sky Lake's cup, the clouds, camps, trail, flag and her stay live.
 *   Units: y-down, the mountain's foot at y = 0, the summit plateau at y ≈ −1012.
 * - **Sky Lake** ('lake'): a still, sky-reflecting mountain lake at sunset (or under the moon), with
 *   tiny ripples, a snowy shore and a diving rock. Units = climber units (she is ~52 tall), y-down,
 *   the water at the foot of the diving rock at y = 8. The far world (sky, sun or moon, peaks and
 *   their reflections) is ONE bitmap pre-rendered per resize at DPR ≤ 1.5 and drawn with a gentle
 *   parallax (it zooms less than the shore when the camera moves in), so close-ups get a soft,
 *   picture-book depth of field. The sun or moon glow inside it is the frame's one radial light.
 *
 * Crossfades (scene changes, and reduced motion's still frames) render the outgoing scene (a frozen
 * snapshot) into one screen-sized layer canvas ONCE per fade and lay it over the new one each frame.
 * Every canvas is released in destroy().
 */
import { createRng, type Rng } from '../../model/rng'
import type { ClimberLook } from '../../storage/schema'
import { climberGoatAnchor, drawClimber, type Expression } from '../art/climber'
import { drawGoat, goatHeadAnchor, type GoatState } from '../art/goat'
import { mix, rgba, shade, type Pose, type Pt } from '../art/rig'
import { freeCanvas, makeCanvas, softDot } from './effects'
import { paletteFor } from './palette'
import { paperCloud } from './parallax'

// ---------------------------------------------------------------------------------------------
// Framing

/** A rectangle in scene units (x0 < x1, y0 < y1; y-down). */
export interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** Part of the screen (CSS px) the camera box must fit inside (the rest is still drawn). */
export interface Region {
  left: number
  top: number
  right: number
  bottom: number
}

/** scene → screen (CSS px): screen = o + p · s. */
export interface Fit {
  s: number
  ox: number
  oy: number
}

export function fitBox(box: Box, r: Region): Fit {
  const bw = Math.max(1e-3, box.x1 - box.x0)
  const bh = Math.max(1e-3, box.y1 - box.y0)
  const aw = Math.max(1, r.right - r.left)
  const ah = Math.max(1, r.bottom - r.top)
  const s = Math.min(aw / bw, ah / bh)
  const cx = (box.x0 + box.x1) / 2
  const cy = (box.y0 + box.y1) / 2
  return { s, ox: (r.left + r.right) / 2 - cx * s, oy: (r.top + r.bottom) / 2 - cy * s }
}

export function lerpBox(a: Box, b: Box, k: number): Box {
  return {
    x0: a.x0 + (b.x0 - a.x0) * k,
    y0: a.y0 + (b.y0 - a.y0) * k,
    x1: a.x1 + (b.x1 - a.x1) * k,
    y1: a.y1 + (b.y1 - a.y1) * k,
  }
}

/**
 * A camera move between two boxes that feels like one smooth dolly: the size changes evenly in
 * log space (a big zoom doesn't rush at the start), and `anchor` keeps its place in the frame
 * sliding evenly from where it sits in `a` to where it sits in `b` — so a pull-out from the summit
 * never loses the summit on the way.
 */
export function zoomBox(a: Box, b: Box, anchor: Pt, k: number): Box {
  const lg = (u: number, v: number) => Math.exp(Math.log(u) + (Math.log(v) - Math.log(u)) * k)
  const w = lg(a.x1 - a.x0, b.x1 - b.x0)
  const h = lg(a.y1 - a.y0, b.y1 - b.y0)
  const fx = (anchor.x - a.x0) / (a.x1 - a.x0) + ((anchor.x - b.x0) / (b.x1 - b.x0) - (anchor.x - a.x0) / (a.x1 - a.x0)) * k
  const fy = (anchor.y - a.y0) / (a.y1 - a.y0) + ((anchor.y - b.y0) / (b.y1 - b.y0) - (anchor.y - a.y0) / (a.y1 - a.y0)) * k
  const x0 = anchor.x - fx * w
  const y0 = anchor.y - fy * h
  return { x0, y0, x1: x0 + w, y1: y0 + h }
}

// ---------------------------------------------------------------------------------------------
// Scene state (written by the timeline)

export interface HerFigure {
  /** Her feet (scene units). */
  x: number
  y: number
  pose: Pose
  expression: Expression
  facing: 1 | -1
  gaze?: Pt
  /** The goat riding in the backpack (null = an empty pack: it has climbed out). */
  goat: GoatState | null
  /** Drawing scale (1 at the lake; small on the whole-mountain picture). */
  scale?: number
  /** She is in the lake: the water surface's y (scene units). Drawn clipped there. */
  waterY?: number
  /** Seconds since lake water splashed her face (drips run down for a moment), or undefined. */
  wetFor?: number
  /** Not drawn (under the water for a moment). */
  hidden?: boolean
}

export interface GoatFigure {
  /** Standing: the ground between its hooves. Swimming: the point on the water it floats at. */
  x: number
  y: number
  /** inBackpack false = on its own hooves; true = swimming (head and shoulders above the water). */
  state: GoatState
  /** Radians, about the middle of its body (standing only). */
  rot?: number
  sx?: number
  sy?: number
  /** A standing goat going into the water: everything below this y is hidden (scene units). */
  clipBelow?: number
  /** 0..1: a little fountain of lake water from its mouth (it just popped up). */
  spout?: number
  /** 0..1: speed lines behind it (flying), drawn opposite `vel` (scene units/s). */
  whoosh?: number
  vel?: Pt
}

/** One splash: where it hit, when (scene time, s), how big (1 = the goat). */
export interface Splash {
  x: number
  y: number
  at: number
  size: number
  seed: number
  /** Some drops fly at her: [x, y] of her face when they get there (scene units). */
  toward?: Pt
}

export interface PanoScene {
  kind: 'pano'
  t: number
  box: Box
  /** Camps lit so far (0..16; the fraction is the next one popping on). */
  lit: number
  her: HerFigure
  /** 0..1: celebration twinkles round her at the top. */
  sparkle?: number
  /** 0..1: a warm flash of light over everything (diving into Sky Lake). */
  flash?: number
}

export interface LakeScene {
  kind: 'lake'
  t: number
  box: Box
  her: HerFigure
  goat: GoatFigure | null
  /** Draw the goat behind her (it is behind her back) instead of in front. */
  goatBehind?: boolean
  splashes: Splash[]
  /** Bubbles coming up where someone went under: [x, y, from, to] in scene units / seconds. */
  bubbles: [number, number, number, number][]
  /** 0..1: laughing sparkles around the two of them. */
  sparkle: number
  /** Where the sparkles gather (between the two faces). */
  sparkleAt?: Pt
  /** 0..1: a little wake behind a paddling goat. */
  wake?: number
  /** 0..1: a warm flash of light over everything (arriving from the whole-mountain picture). */
  flash?: number
}

export type FinaleScene = PanoScene | LakeScene

export interface FinaleArtOpts {
  night: boolean
  look: ClimberLook
  /** Her mountain's name, for the summit sign ('' → no name on the sign, just Sky Lake). */
  mountainName: string
  /** Which of the 16 pitch camps she has passed (sent): those glow on the whole-mountain picture. */
  camps: readonly boolean[]
}

// ---------------------------------------------------------------------------------------------
// Constants

/** Lake scene: the far shore line (top of the water), the diving rock's top and tip, the water at its foot. */
export const LAKE = {
  farY: -44,
  rockTop: -21,
  tipX: -6,
  waterY: 8,
} as const

/** Whole-mountain picture: where she stands on the summit and the scale she is drawn at. */
export const PANO = {
  herX: -34,
  herY: -1012.5,
  herScale: 0.42,
  signX: -64,
  lake: { x: 6, y: -1008, rx: 26, ry: 4.2 },
  top: -1040,
} as const

const FONT = "'Nunito Variable', 'Nunito', ui-rounded, system-ui, sans-serif"

const DAY_SKY = ['#6c5aa8', '#a77ab9', '#ef95a2', '#ffc08a'] as const
const NIGHT_SKY = ['#120f34', '#2c2462', '#55387a'] as const

interface LakeColours {
  water: string
  waterDeep: string
  ripple: string
  glint: string
  splash: string
  splashInk: string
  foam: string
  rock: string
  rockLight: string
  rockDark: string
  rockInk: string
  snow: string
  snowShade: string
  wood: string
  woodInk: string
  flag: string
}

function lakeColours(night: boolean): LakeColours {
  const p = paletteFor('summit', night)
  if (night) {
    return {
      water: '#2a3a78',
      waterDeep: '#141a44',
      ripple: '#c9d6ff',
      glint: '#f2f5ff',
      splash: '#d9e6ff',
      splashInk: '#7f93d8',
      foam: '#f4f7ff',
      rock: p.rock,
      rockLight: p.rockLight,
      rockDark: p.rockDark,
      rockInk: p.rockInk,
      snow: '#d9dcf5',
      snowShade: '#aeb3dc',
      wood: '#7d6a86',
      woodInk: '#3a2c48',
      flag: p.flag,
    }
  }
  return {
    water: '#f4a99a',
    waterDeep: '#6f6ab4',
    ripple: '#fff1e8',
    glint: '#fff6d6',
    splash: '#eaf8ff',
    splashInk: '#79b5cf',
    foam: '#ffffff',
    rock: p.rock,
    rockLight: p.rockLight,
    rockDark: p.rockDark,
    rockInk: p.rockInk,
    snow: '#fff2f5',
    snowShade: '#efcadb',
    wood: '#a8785f',
    woodInk: '#5a3a30',
    flag: p.flag,
  }
}

// ---------------------------------------------------------------------------------------------
// Small path helpers

/** A smooth closed/open curve through points (quadratics through the midpoints). */
function smooth(path: Path2D, pts: readonly Pt[], start = true): void {
  if (pts.length < 2) return
  if (start) path.moveTo(pts[0].x, pts[0].y)
  else path.lineTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    path.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2)
  }
  const last = pts[pts.length - 1]
  path.lineTo(last.x, last.y)
}

function star4(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x, y - r)
  ctx.quadraticCurveTo(x + r * 0.14, y - r * 0.14, x + r, y)
  ctx.quadraticCurveTo(x + r * 0.14, y + r * 0.14, x, y + r)
  ctx.quadraticCurveTo(x - r * 0.14, y + r * 0.14, x - r, y)
  ctx.quadraticCurveTo(x - r * 0.14, y - r * 0.14, x, y - r)
  ctx.closePath()
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)
const easeOutBack = (t: number, s = 1.9): number => {
  const k = clamp01(t) - 1
  return 1 + (s + 1) * k * k * k + s * k * k
}

// ---------------------------------------------------------------------------------------------
// The whole mountain: geometry (pano units, built once)

type BandStyle = 'summit' | 'clouds' | 'alpine' | 'mesa' | 'pines' | 'trees'

interface BandDef {
  style: BandStyle
  /** The band's top edge altitude (pano y). */
  edgeY: number
  fill: string
  light: string
  dark: string
}

/** Back (top of the mountain) to front (its foot). */
const BANDS: readonly BandDef[] = [
  { style: 'summit', edgeY: -1012, fill: '#f8e2ec', light: '#ffffff', dark: '#dcb3c9' },
  { style: 'clouds', edgeY: -878, fill: '#c6a6cf', light: '#e6d2ec', dark: '#9f82b4' },
  { style: 'alpine', edgeY: -740, fill: '#9cb7d6', light: '#d5e3f2', dark: '#7593b6' },
  { style: 'mesa', edgeY: -572, fill: '#e8b98a', light: '#f8d9ae', dark: '#c98b5c' },
  { style: 'pines', edgeY: -392, fill: '#5f9b7d', light: '#86bf9c', dark: '#3f7a60' },
  { style: 'trees', edgeY: -202, fill: '#9ccd80', light: '#c7e8a6', dark: '#6faa5c' },
]

/** Altitude fractions of the 16 pitch camps (pitch tops), bottom to top; the last is Sky Lake. */
const CAMP_H = [0.05, 0.11, 0.165, 0.245, 0.3, 0.355, 0.43, 0.485, 0.54, 0.6, 0.65, 0.7, 0.77, 0.815, 0.855] as const
/** Tent colours by zone (meadow → cloud), for the little camps. */
const CAMP_TENT = ['#f08c70', '#6aa7c9', '#5aa6a0', '#e8735a', '#f5b83d'] as const

function halfW(h: number): number {
  return 74 + 600 * Math.pow(Math.max(0, 1 - h), 1.3)
}

function edgeL(h: number): number {
  return -halfW(h) * (1 + 0.07 * Math.sin(h * 10.5 + 0.4))
}

function edgeR(h: number): number {
  return halfW(h) * (1 + 0.06 * Math.sin(h * 8.7 + 2.2))
}

interface PanoDeco {
  path: Path2D
  color: string
}

interface PanoBand {
  def: BandDef
  /** The mountain silhouette for this layer (each nearer layer a touch wider: paper layers). */
  clip: Path2D
  /** Everything below the band's top edge (clipped by `clip` when drawn). */
  fill: Path2D
  /** The top edge alone (rim light). */
  edge: Path2D
  /** Decorations drawn inside the clip. */
  deco: PanoDeco[]
}

interface PanoGeo {
  bands: PanoBand[]
  /** The mountain's shadow side (right of a wavy ridge line; the sun is on the left). */
  shade: Path2D
  hills: PanoDeco[]
  ranges: PanoDeco[]
  trail: Path2D
  camps: Pt[]
  fireflies: Pt[]
  skyClouds: { x: number; y: number; w: number; i: number }[]
  ringClouds: { x: number; y: number; w: number; i: number; front: boolean }[]
  /** The summit's lake cup (drawn over the summit band). */
  lakeRim: Path2D
  /** Rocks poking out of the summit snow (drawn over the summit band): rock, then its snow cap. */
  summitRocks: Path2D
  summitSnow: Path2D
}

/** A paper-cut cloud in unit size (width 1, base at y ≈ 0.18): the body and its shaded underside. */
interface CloudShape {
  body: Path2D
  shade: Path2D
}

function cloudShape(seed: number): CloudShape {
  const rng = createRng(`pano-cloud:${seed}`)
  const body = new Path2D()
  const bumps = 4 + rng.int(3)
  for (let i = 0; i < bumps; i++) {
    const k = (i + 0.5) / bumps
    const x = -0.5 + k
    const mid = 1 - Math.abs(k - 0.5) * 1.5
    const r = (0.1 + 0.15 * mid) * rng.range(0.85, 1.15)
    const y = 0.18 - r * 0.75 - mid * 0.06
    body.moveTo(x + r, y)
    body.arc(x, y, r, 0, Math.PI * 2)
  }
  body.moveTo(-0.42, 0.18)
  body.rect(-0.42, 0.04, 0.84, 0.14)
  const shade = new Path2D()
  shade.ellipse(0, 0.22, 0.6, 0.1, 0, 0, Math.PI * 2)
  return { body, shade }
}

/** Built on first use (never at import: the app's route table is imported by node tests). */
let cloudShapes: CloudShape[] | null = null

function clouds(): CloudShape[] {
  if (!cloudShapes) cloudShapes = [0, 1, 2, 3].map(cloudShape)
  return cloudShapes
}

function mountainSilhouette(widen: number): Path2D {
  const p = new Path2D()
  const pts: Pt[] = []
  pts.push({ x: edgeL(0) * widen - 40, y: 2400 })
  for (let h = 0; h <= 0.955; h += 0.012) pts.push({ x: edgeL(h) * widen, y: -h * 1000 })
  // The summit: a little plateau where she stands, Sky Lake's cup, a snowy horn on the right.
  const cap: Pt[] = [
    { x: -84, y: -968 },
    { x: -74, y: -992 },
    { x: -66, y: -1008 },
    { x: -58, y: -1013 },
    { x: -40, y: -1013 },
    { x: -26, y: -1011 },
    { x: -18, y: -1009 },
    { x: 28, y: -1009 },
    { x: 36, y: -1013 },
    { x: 44, y: -1024 },
    { x: 52, y: -1036 },
    { x: 58, y: -1026 },
    { x: 66, y: -1006 },
    { x: 76, y: -986 },
    { x: 84, y: -966 },
  ]
  for (const c of cap) pts.push({ x: c.x * (1 + (widen - 1) * 0.5), y: c.y })
  for (let h = 0.955; h >= 0; h -= 0.012) pts.push({ x: edgeR(h) * widen, y: -h * 1000 })
  pts.push({ x: edgeR(0) * widen + 40, y: 2400 })
  smooth(p, pts)
  p.closePath()
  return p
}

/** Points along a band's top edge, in its style (x from −900 to 900). */
function bandEdge(def: BandDef, rng: Rng): Pt[] {
  const y0 = def.edgeY
  const pts: Pt[] = []
  switch (def.style) {
    case 'trees':
    case 'clouds':
      for (let x = -900; x <= 900; x += 18) pts.push({ x, y: y0 + Math.sin(x / 47 + 1) * 7 + Math.sin(x / 19) * 2.5 })
      break
    case 'pines':
      for (let x = -900; x <= 900; ) {
        const w = rng.range(9, 15)
        pts.push({ x, y: y0 + rng.range(-2, 3) })
        pts.push({ x: x + w / 2, y: y0 - rng.range(14, 30) })
        x += w
      }
      break
    case 'mesa': {
      let y = y0
      for (let x = -900; x <= 900; ) {
        const run = rng.range(34, 86)
        pts.push({ x, y })
        pts.push({ x: x + run, y: y + rng.range(-1.5, 1.5) })
        const step = rng.range(9, 22) * (rng.next() < 0.5 ? -1 : 1)
        y = Math.max(y0 - 26, Math.min(y0 + 14, y + step))
        x += run + rng.range(5, 10)
      }
      break
    }
    case 'alpine':
      for (let x = -900; x <= 900; ) {
        const w = rng.range(30, 62)
        pts.push({ x, y: y0 + rng.range(2, 12) })
        pts.push({ x: x + w * rng.range(0.4, 0.6), y: y0 - rng.range(26, 62) })
        x += w
      }
      break
    case 'summit':
      break
  }
  return pts
}

function buildPano(): PanoGeo {
  const rng = createRng('finale:pano')
  const bands: PanoBand[] = []
  BANDS.forEach((def, i) => {
    const clip = mountainSilhouette(1 + i * 0.022)
    const deco: PanoDeco[] = []
    let fill: Path2D
    let edge: Path2D
    if (def.style === 'summit') {
      fill = clip
      edge = new Path2D()
      // Soft shadow pockets and wind-carved drifts in the summit snow.
      const pockets = new Path2D()
      const drifts = new Path2D()
      for (let k = 0; k < 16; k++) {
        const h = rng.range(0.885, 0.985)
        const x = rng.range(-0.8, 0.8) * halfW(h)
        const y = -h * 1000
        const w = rng.range(8, 20)
        pockets.moveTo(x + w, y)
        pockets.ellipse(x, y, w, w * 0.32, 0, 0, Math.PI * 2)
        const dw = w * rng.range(0.9, 1.5)
        const dh = rng.range(2, 4)
        drifts.moveTo(x - dw, y - 2)
        drifts.quadraticCurveTo(x, y - 2 - dh * 2, x + dw, y - 2)
        drifts.quadraticCurveTo(x, y - 2 - dh * 0.8, x - dw, y - 2)
        drifts.closePath()
      }
      deco.push({ path: pockets, color: '#efd2e1' }, { path: drifts, color: '#ffffff' })
    } else {
      const pts = bandEdge(def, rng)
      edge = new Path2D()
      if (def.style === 'clouds' || def.style === 'trees') smooth(edge, pts)
      else {
        edge.moveTo(pts[0].x, pts[0].y)
        for (const p of pts) edge.lineTo(p.x, p.y)
      }
      fill = new Path2D(edge)
      fill.lineTo(900, 2400)
      fill.lineTo(-900, 2400)
      fill.closePath()
      decorate(def, rng, deco)
    }
    bands.push({ def, clip, fill, edge, deco })
  })

  // The trail: from the foot of the mountain, zig-zagging through the camps to Sky Lake.
  const camps: Pt[] = CAMP_H.map((h, i) => {
    const side = i % 2 ? 1 : -1
    return { x: side * halfW(h) * rng.range(0.38, 0.52), y: -h * 1000 + 6 }
  })
  const route: Pt[] = [{ x: 0, y: 30 }]
  for (const c of camps) route.push(c)
  route.push({ x: -20, y: -936 })
  route.push({ x: PANO.herX + 4, y: PANO.herY })
  const trail = new Path2D()
  smooth(trail, route)

  // Fireflies in the hollow's pines.
  const fireflies: Pt[] = []
  for (let i = 0; i < 26; i++) {
    const h = rng.range(0.22, 0.38)
    fireflies.push({ x: rng.range(-0.85, 0.85) * halfW(h), y: -h * 1000 })
  }

  // The far ranges behind the mountain, and the valley's hills in front of its foot.
  const ranges: PanoDeco[] = []
  const rangeDefs = [
    { top: -640, var: 170, color: '#e7c3d9', base: 200 },
    { top: -430, var: 140, color: '#cf9fc4', base: 200 },
  ]
  for (const r of rangeDefs) {
    const p = new Path2D()
    p.moveTo(-3200, r.base + 400)
    for (let x = -3200; x <= 3200; ) {
      const w = rng.range(120, 260)
      p.lineTo(x, r.top + r.var + rng.range(0, 60))
      p.lineTo(x + w * 0.5, r.top + rng.range(0, r.var))
      x += w
    }
    p.lineTo(3200, r.base + 400)
    p.closePath()
    ranges.push({ path: p, color: r.color })
  }
  const hills: PanoDeco[] = []
  const hillDefs = [
    { y: -24, amp: 26, color: '#86bf6c', trees: '#5f9a52' },
    { y: 26, amp: 20, color: '#6faa5c', trees: '#4f8a48' },
  ]
  for (const hd of hillDefs) {
    const pts: Pt[] = []
    for (let x = -3200; x <= 3200; x += 70) pts.push({ x, y: hd.y + Math.sin(x / 140 + hd.y) * hd.amp + rng.range(-6, 6) })
    const p = new Path2D()
    smooth(p, pts)
    p.lineTo(3200, 2400)
    p.lineTo(-3200, 2400)
    p.closePath()
    hills.push({ path: p, color: hd.color })
    const trees = new Path2D()
    for (let x = -1400; x <= 1400; x += rng.range(28, 70)) {
      const y = hd.y + Math.sin(x / 140 + hd.y) * hd.amp + 3
      const r = rng.range(7, 12)
      trees.moveTo(x + r, y - r)
      trees.arc(x, y - r, r, 0, Math.PI * 2)
    }
    hills.push({ path: trees, color: hd.trees })
  }

  const skyClouds = [
    { x: -520, y: -1010, w: 190, i: 0 },
    { x: 470, y: -1090, w: 160, i: 1 },
    { x: 640, y: -700, w: 220, i: 2 },
    { x: -760, y: -560, w: 210, i: 3 },
    { x: 860, y: -330, w: 180, i: 0 },
    { x: -260, y: -1180, w: 140, i: 2 },
    // Little ones round the summit (in view at the very start).
    { x: -150, y: -1036, w: 58, i: 1 },
    { x: 128, y: -1058, w: 46, i: 3 },
    { x: 150, y: -1000, w: 64, i: 0 },
    { x: -128, y: -982, w: 40, i: 2 },
    { x: -96, y: -1056, w: 34, i: 0 },
    { x: 84, y: -1074, w: 30, i: 2 },
    { x: -20, y: -1092, w: 24, i: 3 },
    // High ones, for tall screens.
    { x: -380, y: -1400, w: 170, i: 3 },
    { x: 300, y: -1560, w: 150, i: 0 },
    { x: -120, y: -1800, w: 190, i: 1 },
    { x: 420, y: -1980, w: 160, i: 2 },
  ]
  // A ring of cloud round the mountain at Cloud Steps: some behind its sides, some in front.
  const ringClouds = [
    { x: 30, y: -896, w: 150, i: 2, front: false },
    { x: -235, y: -870, w: 170, i: 0, front: false },
    { x: 250, y: -884, w: 180, i: 1, front: false },
    { x: -150, y: -858, w: 150, i: 3, front: true },
    { x: 170, y: -850, w: 160, i: 0, front: true },
    { x: -300, y: -836, w: 120, i: 1, front: true },
    { x: 330, y: -830, w: 130, i: 2, front: true },
    { x: 10, y: -838, w: 110, i: 1, front: true },
  ]

  // The shadow side, right of a wavy ridge line from the horn down to the foot.
  const shade = new Path2D()
  const ridge: Pt[] = [
    { x: 52, y: -1040 },
    { x: 38, y: -996 },
    { x: 58, y: -940 },
    { x: 46, y: -880 },
    { x: 92, y: -800 },
    { x: 78, y: -720 },
    { x: 132, y: -620 },
    { x: 118, y: -520 },
    { x: 172, y: -400 },
    { x: 160, y: -300 },
    { x: 226, y: -180 },
    { x: 212, y: -60 },
    { x: 262, y: 60 },
  ]
  smooth(shade, ridge)
  shade.lineTo(1200, 60)
  shade.lineTo(1200, -1200)
  shade.closePath()

  // Rocks peeking out of the summit snow, each with a cap of snow.
  const summitRocks = new Path2D()
  const summitSnow = new Path2D()
  for (const [x, y, w, hh] of [
    [-76, -986, 9, 6],
    [-64, -1006, 6, 4],
    [-16, -1004, 5, 3],
    [62, -1008, 7, 5],
    [-48, -966, 11, 6],
    [30, -956, 9, 5],
    [-92, -952, 8, 5],
    [70, -940, 10, 6],
  ] as const) {
    summitRocks.moveTo(x - w / 2, y)
    summitRocks.quadraticCurveTo(x - w * 0.45, y - hh, x, y - hh)
    summitRocks.quadraticCurveTo(x + w * 0.45, y - hh * 0.9, x + w / 2, y)
    summitRocks.closePath()
    summitSnow.moveTo(x - w * 0.36, y - hh * 0.62)
    summitSnow.quadraticCurveTo(x - w * 0.3, y - hh * 1.08, x, y - hh * 1.06)
    summitSnow.quadraticCurveTo(x + w * 0.32, y - hh * 1.02, x + w * 0.38, y - hh * 0.55)
    summitSnow.quadraticCurveTo(x, y - hh * 0.76, x - w * 0.36, y - hh * 0.62)
    summitSnow.closePath()
  }

  const lakeRim = new Path2D()
  lakeRim.ellipse(PANO.lake.x, PANO.lake.y, PANO.lake.rx, PANO.lake.ry, 0, 0, Math.PI * 2)

  return { bands, shade, hills, ranges, trail, camps, fireflies, skyClouds, ringClouds, lakeRim, summitRocks, summitSnow }
}

function decorate(def: BandDef, rng: Rng, deco: PanoDeco[]): void {
  const y0 = def.edgeY
  // Inside the band: things that grow (or stripe) on the slope below the edge, between this edge and
  // the next band's edge (≈ 180 units further down).
  switch (def.style) {
    case 'trees': {
      const crowns = new Path2D()
      const dark = new Path2D()
      for (let x = -880; x <= 880; x += rng.range(16, 30)) {
        const y = y0 + Math.sin(x / 47 + 1) * 7 + Math.sin(x / 19) * 2.5
        const r = rng.range(8, 13)
        crowns.moveTo(x + r, y - r * 0.55)
        crowns.arc(x, y - r * 0.55, r, 0, Math.PI * 2)
        dark.moveTo(x + r * 0.7 + 2, y - r * 0.25)
        dark.arc(x + 2, y - r * 0.25, r * 0.7, 0, Math.PI)
      }
      deco.push({ path: crowns, color: '#7cbc65' }, { path: dark, color: '#68a656' })
      const dots = new Path2D()
      const flowers = ['#ff9db0', '#ffd36b', '#ffffff']
      const fl: Path2D[] = flowers.map(() => new Path2D())
      for (let i = 0; i < 70; i++) {
        const x = rng.range(-640, 640)
        const y = rng.range(y0 + 26, y0 + 190)
        const f = fl[i % fl.length]
        f.moveTo(x + 2.4, y)
        f.arc(x, y, 2.4, 0, Math.PI * 2)
      }
      for (let i = 0; i < 26; i++) {
        const x = rng.range(-600, 600)
        const y = rng.range(y0 + 40, y0 + 190)
        const r = rng.range(6, 10)
        dots.moveTo(x + r, y)
        dots.arc(x, y, r, 0, Math.PI * 2)
      }
      deco.push({ path: dots, color: '#83c06b' })
      flowers.forEach((c, i) => deco.push({ path: fl[i], color: c }))
      break
    }
    case 'pines': {
      const pines = new Path2D()
      for (let i = 0; i < 46; i++) {
        const x = rng.range(-560, 560)
        const y = rng.range(y0 + 30, y0 + 185)
        const hgt = rng.range(16, 28)
        pines.moveTo(x - hgt * 0.36, y)
        pines.lineTo(x, y - hgt)
        pines.lineTo(x + hgt * 0.36, y)
        pines.closePath()
      }
      deco.push({ path: pines, color: def.dark })
      break
    }
    case 'mesa': {
      for (let k = 0; k < 4; k++) {
        const stripe = new Path2D()
        const yy = y0 + 34 + k * 40
        const pts: Pt[] = []
        for (let x = -800; x <= 800; x += 40) pts.push({ x, y: yy + Math.sin(x / 60 + k * 2) * 5 })
        smooth(stripe, pts)
        for (let i = pts.length - 1; i >= 0; i--) stripe.lineTo(pts[i].x, pts[i].y + 5 + Math.sin(i) * 1.5)
        stripe.closePath()
        deco.push({ path: stripe, color: k % 2 ? '#d99f6b' : '#f1c99a' })
      }
      const rocks = new Path2D()
      for (let i = 0; i < 18; i++) {
        const x = rng.range(-460, 460)
        const y = rng.range(y0 + 30, y0 + 175)
        const r = rng.range(4, 8)
        rocks.moveTo(x + r, y)
        rocks.ellipse(x, y, r, r * 0.7, 0, 0, Math.PI * 2)
      }
      deco.push({ path: rocks, color: '#c47f50' })
      break
    }
    case 'alpine': {
      // Snow caps on the peaks along the edge, and snow streaks below.
      const snow = new Path2D()
      for (let x = -880; x <= 880; x += rng.range(40, 80)) {
        const y = y0 - rng.range(20, 44)
        snow.moveTo(x - 10, y + 12)
        snow.lineTo(x, y - 4)
        snow.lineTo(x + 11, y + 12)
        snow.lineTo(x + 5, y + 9)
        snow.lineTo(x, y + 14)
        snow.lineTo(x - 5, y + 9)
        snow.closePath()
      }
      for (let i = 0; i < 22; i++) {
        const x = rng.range(-380, 380)
        const y = rng.range(y0 + 26, y0 + 150)
        snow.moveTo(x, y)
        snow.lineTo(x + rng.range(8, 16), y + rng.range(10, 18))
        snow.lineTo(x + 3, y + 4)
        snow.closePath()
      }
      deco.push({ path: snow, color: '#f4f8ff' })
      break
    }
    case 'clouds': {
      const streak = new Path2D()
      for (let i = 0; i < 14; i++) {
        const x = rng.range(-260, 260)
        const y = rng.range(y0 + 26, y0 + 130)
        streak.moveTo(x, y)
        streak.lineTo(x + rng.range(10, 20), y + rng.range(8, 16))
        streak.lineTo(x + 4, y + 4)
        streak.closePath()
      }
      deco.push({ path: streak, color: '#e5d3ea' })
      break
    }
    case 'summit':
      break
  }
}

// ---------------------------------------------------------------------------------------------
// Sky Lake: geometry (scene units, built once)

interface LakeGeo {
  land: Path2D
  snowTop: Path2D
  wetBand: Path2D
  cracks: Path2D
  pebbles: Path2D
  front: Path2D
  frontTufts: Path2D
  /** Ambient ripple lines: x, y, length, phase. */
  ripples: number[]
}

/** The shoreline's x at a given y (the diagonal edge of the land, below the rock's tip). */
function shoreX(y: number): number {
  if (y <= 6) return 2
  // (0, 6) → (−200, 420): a gentle curve down to the bottom-left.
  const k = (y - 6) / 414
  return -k * 200 - Math.sin(k * Math.PI) * 18
}

/** The land's top surface: the diving rock is flat; further back the snowy bank rolls a little higher. */
function shoreTop(x: number): number {
  const back = Math.min(1, Math.max(0, (-110 - x) / 40))
  return LAKE.rockTop - back * (3 - Math.sin(x / 31) * 1.6)
}

function buildLake(): LakeGeo {
  const rng = createRng('finale:lake')
  const top: Pt[] = []
  for (let x = -700; x <= -12; x += 14) top.push({ x, y: shoreTop(x) })
  const land = new Path2D()
  land.moveTo(-700, 460)
  for (const p of top) land.lineTo(p.x, p.y)
  land.lineTo(LAKE.tipX, LAKE.rockTop)
  land.quadraticCurveTo(LAKE.tipX + 7, LAKE.rockTop, LAKE.tipX + 8, LAKE.rockTop + 6)
  land.quadraticCurveTo(LAKE.tipX + 9, LAKE.waterY - 6, LAKE.tipX + 6, LAKE.waterY - 2)
  for (let y = LAKE.waterY - 2; y <= 460; y += 12) land.lineTo(shoreX(y), y)
  land.lineTo(-700, 460)
  land.closePath()

  // A thick layer of snow on top, with soft drips over the edge.
  const snowTop = new Path2D()
  snowTop.moveTo(-700, LAKE.rockTop - 9)
  for (const p of top) snowTop.lineTo(p.x, p.y - 2.2)
  snowTop.lineTo(LAKE.tipX, LAKE.rockTop - 2.2)
  snowTop.quadraticCurveTo(LAKE.tipX + 6.5, LAKE.rockTop - 2, LAKE.tipX + 7.5, LAKE.rockTop + 2.5)
  snowTop.quadraticCurveTo(LAKE.tipX + 5, LAKE.rockTop + 6, LAKE.tipX + 2, LAKE.rockTop + 3.5)
  for (let x = LAKE.tipX; x >= -700; x -= 9) {
    const drip = Math.max(0, Math.sin(x * 0.37) * 2.6 + Math.sin(x * 0.11) * 1.4)
    snowTop.lineTo(x, shoreTop(x) + 3 + drip)
  }
  snowTop.closePath()

  // The wet, darker rock just above the water at the tip.
  const wetBand = new Path2D()
  wetBand.moveTo(LAKE.tipX + 9, LAKE.waterY - 9)
  wetBand.quadraticCurveTo(LAKE.tipX + 9.5, LAKE.waterY - 4, LAKE.tipX + 6, LAKE.waterY - 2)
  wetBand.lineTo(-30, 60)
  wetBand.lineTo(-44, 60)
  wetBand.lineTo(LAKE.tipX - 2, LAKE.waterY - 9)
  wetBand.closePath()

  const cracks = new Path2D()
  for (const [x, y, l] of [
    [-22, -8, 9],
    [-48, -12, 7],
    [-78, 4, 11],
    [-110, -4, 8],
    [-60, 30, 12],
    [-140, 40, 10],
  ] as const) {
    cracks.moveTo(x, y)
    cracks.lineTo(x + l * 0.4, y + l * 0.5)
    cracks.lineTo(x + l * 0.2, y + l)
  }

  const pebbles = new Path2D()
  for (const [x, r] of [
    [-128, 3.2],
    [-123, 2.2],
    [-47, 2.4],
    [-18, 1.8],
    [-160, 3.6],
  ] as const) {
    pebbles.moveTo(x + r, LAKE.rockTop - r * 0.6 - 0.4)
    pebbles.ellipse(x, LAKE.rockTop - r * 0.6 - 0.4, r, r * 0.65, 0, 0, Math.PI * 2)
  }

  // A darker paper-cut bank in the very front (bottom-left corner) for depth.
  const front = new Path2D()
  const fpts: Pt[] = []
  for (let x = -700; x <= -40; x += 22) fpts.push({ x, y: 96 + Math.sin(x / 26) * 6 + Math.max(0, x + 120) * 0.9 })
  smooth(front, fpts)
  front.lineTo(-40, 460)
  front.lineTo(-700, 460)
  front.closePath()
  const frontTufts = new Path2D()
  for (let x = -260; x <= -60; x += 13) {
    const y = 96 + Math.sin(x / 26) * 6 + Math.max(0, x + 120) * 0.9 + 1
    frontTufts.moveTo(x - 3, y)
    frontTufts.lineTo(x - 1, y - rng.range(6, 11))
    frontTufts.lineTo(x + 1, y)
    frontTufts.lineTo(x + 3, y - rng.range(4, 8))
    frontTufts.lineTo(x + 5, y)
    frontTufts.closePath()
  }

  const ripples: number[] = []
  for (let i = 0; i < 34; i++) {
    const y = LAKE.farY + 10 + Math.pow(rng.next(), 1.4) * 170
    const x = rng.range(-120, 320)
    if (x < shoreX(y) + 8) continue
    ripples.push(x, y, 5 + (y - LAKE.farY) * 0.16 * rng.range(0.6, 1.3), rng.range(0, Math.PI * 2))
  }
  return { land, snowTop, wetBand, cracks, pebbles, front, frontTufts, ripples }
}

// ---------------------------------------------------------------------------------------------
// The renderer

const WIDE_LAKE: Box = { x0: -122, y0: -116, x1: 100, y1: 34 }

/**
 * The whole-mountain shot's band-stack bitmap covers this (pano units): the summit horn down to just
 * below the mountain's foot, and the mountain's full width there. Below y ≈ 60 the valley's hills
 * (drawn in front, opaque, edge to edge) always cover the bands, so nothing past y1 ever shows.
 */
const STACK_BOX: Box = { x0: -800, y0: -1080, x1: 800, y1: 120 }
const STACK_MAX_PX = 2048
/** Use the bitmap while it is drawn at most this much larger than it was made (it stays crisp). */
const STACK_SHARP = 1.15

export class FinaleRenderer {
  private w = 1
  private h = 1
  private dpr = 1
  private readonly opts: FinaleArtOpts
  private readonly c: LakeColours
  private readonly pano: PanoGeo
  private readonly lake: LakeGeo
  private skyStrip: HTMLCanvasElement | null = null
  private lakeBg: HTMLCanvasElement | null = null
  /** The fit the lake background was painted with, and its margin (CSS px). */
  private bgFit: Fit = { s: 1, ox: 0, oy: 0 }
  private bgPad = { x: 0, y: 0 }
  private glow: HTMLCanvasElement | null = null
  private warm: HTMLCanvasElement | null = null
  private sunGlow: HTMLCanvasElement | null = null
  private layer: HTMLCanvasElement | null = null
  /** The outgoing scene already painted into `layer` (a fade's `from` is a frozen snapshot). */
  private layerScene: FinaleScene | null = null
  /** The whole-mountain shot's zone bands, pre-rendered (see bandStack()). */
  private stack: { canvas: HTMLCanvasElement; k: number } | null = null

  constructor(opts: FinaleArtOpts) {
    this.opts = opts
    this.c = lakeColours(opts.night)
    this.pano = buildPano()
    this.lake = buildLake()
  }

  /** The lake's wide framing (the timeline's default camera box there). */
  static wideLakeBox(): Box {
    return { ...WIDE_LAKE }
  }

  /** (Re)build the cached bitmaps for a new viewport (CSS px). */
  resize(w: number, h: number, dpr: number): void {
    this.releaseBitmaps()
    this.w = Math.max(1, w)
    this.h = Math.max(1, h)
    this.dpr = dpr
    this.glow = softDot(64, '#fff6dc', 0.2)
    this.warm = softDot(64, '#ffd27a', 0.3)
    this.skyStrip = this.paintSkyStrip()
    this.lakeBg = this.paintLakeBackground()
  }

  /**
   * Draw one frame. `region` = where the camera box goes (CSS px); `fade` lays the outgoing scene
   * over this one at alpha (1 − k).
   */
  render(ctx: CanvasRenderingContext2D, scene: FinaleScene, region: Region, fade?: { from: FinaleScene; k: number; region: Region }): void {
    this.drawScene(ctx, scene, region)
    if (fade && fade.k < 1) {
      // The outgoing scene is a frozen snapshot: paint it into the layer once per fade, then each
      // frame is one blit at the fading alpha.
      const layer = this.layerCanvas()
      if (layer && this.layerScene !== fade.from) {
        const g = layer.getContext('2d')
        if (g) {
          this.drawScene(g, fade.from, fade.region)
          this.layerScene = fade.from
        }
      }
      if (layer && this.layerScene === fade.from) {
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.globalAlpha = 1 - clamp01(fade.k)
        ctx.drawImage(layer, 0, 0)
        ctx.globalAlpha = 1
      }
    } else if (this.layer && !fade) {
      freeCanvas(this.layer)
      this.layer = null
      this.layerScene = null
    }
  }

  /** Where a scene point lands on screen (CSS px) for this scene's camera in `region`. */
  toScreen(scene: FinaleScene, region: Region, p: Pt): Pt {
    const f = fitBox(scene.box, region)
    return { x: f.ox + p.x * f.s, y: f.oy + p.y * f.s }
  }

  destroy(): void {
    this.releaseBitmaps()
  }

  // -------------------------------------------------------------------------------------------

  private releaseBitmaps(): void {
    for (const c of [this.skyStrip, this.lakeBg, this.glow, this.warm, this.sunGlow, this.layer, this.stack?.canvas]) freeCanvas(c)
    this.stack = null
    this.skyStrip = null
    this.lakeBg = null
    this.glow = null
    this.warm = null
    this.sunGlow = null
    this.layer = null
    this.layerScene = null
  }

  private layerCanvas(): HTMLCanvasElement | null {
    const bw = Math.round(this.w * this.dpr)
    const bh = Math.round(this.h * this.dpr)
    if (!this.layer) {
      this.layer = makeCanvas(bw, bh)
      this.layerScene = null
    }
    if (this.layer.width !== bw || this.layer.height !== bh) {
      // Resizing a canvas clears it.
      this.layer.width = bw
      this.layer.height = bh
      this.layerScene = null
    }
    return this.layer
  }

  private drawScene(ctx: CanvasRenderingContext2D, scene: FinaleScene, region: Region): void {
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    if (scene.kind === 'pano') this.drawPano(ctx, scene, region)
    else this.drawLake(ctx, scene, region)
    const flash = scene.flash ?? 0
    if (flash > 0.002) {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.globalAlpha = 1
      ctx.fillStyle = `rgba(255, 243, 234, ${Math.min(1, flash).toFixed(3)})`
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
    }
  }

  private applyFit(ctx: CanvasRenderingContext2D, f: Fit): void {
    const d = this.dpr
    ctx.setTransform(d * f.s, 0, 0, d * f.s, d * f.ox, d * f.oy)
  }

  // -------------------------------------------------------------------------------------------
  // Pre-rendered bitmaps

  /** A 4-px-wide sky gradient, stretched over the screen behind the whole-mountain picture. */
  private paintSkyStrip(): HTMLCanvasElement {
    const c = makeCanvas(4, 256)
    const g = c.getContext('2d')
    if (g) {
      const grad = g.createLinearGradient(0, 0, 0, 256)
      grad.addColorStop(0, DAY_SKY[0])
      grad.addColorStop(0.36, DAY_SKY[1])
      grad.addColorStop(0.72, DAY_SKY[2])
      grad.addColorStop(1, DAY_SKY[3])
      g.fillStyle = grad
      g.fillRect(0, 0, 4, 256)
    }
    return c
  }

  /** The lake's far world for the wide framing of the full screen, with a margin for camera moves. */
  private paintLakeBackground(): HTMLCanvasElement | null {
    const w = this.w
    const h = this.h
    const padX = Math.round(w * 0.3)
    const padY = Math.round(h * 0.3)
    const cw = w + padX * 2
    const ch = h + padY * 2
    const bd = Math.max(0.5, Math.min(1.5, this.dpr, 2048 / cw, 2048 / ch))
    const canvas = makeCanvas(cw * bd, ch * bd)
    const g = canvas.getContext('2d')
    if (!g) return canvas
    this.bgPad = { x: padX, y: padY }
    const fit = fitBox(WIDE_LAKE, { left: 0, top: 0, right: w, bottom: h })
    this.bgFit = fit
    g.setTransform(bd, 0, 0, bd, bd * padX, bd * padY)
    const X = (x: number) => fit.ox + x * fit.s
    const Y = (y: number) => fit.oy + y * fit.s
    const S = fit.s
    const night = this.opts.night
    const horizon = Y(LAKE.farY)
    const top = -padY
    const bottom = h + padY
    const left = -padX
    const right = w + padX

    // Sky.
    const sky = g.createLinearGradient(0, top, 0, horizon)
    if (night) {
      sky.addColorStop(0, NIGHT_SKY[0])
      sky.addColorStop(0.55, NIGHT_SKY[1])
      sky.addColorStop(1, NIGHT_SKY[2])
    } else {
      sky.addColorStop(0, DAY_SKY[0])
      sky.addColorStop(0.4, DAY_SKY[1])
      sky.addColorStop(0.78, DAY_SKY[2])
      sky.addColorStop(1, DAY_SKY[3])
    }
    g.fillStyle = sky
    g.fillRect(left, top, right - left, horizon - top + 1)

    const rng = createRng(night ? 'finale:night' : 'finale:day')
    if (night) {
      for (let i = 0; i < 180; i++) {
        const x = rng.range(left, right)
        const y = rng.range(top, horizon - 20)
        const r = rng.range(0.5, 1.5) * (rng.next() < 0.1 ? 1.6 : 1)
        g.fillStyle = rgba('#fff8e6', rng.range(0.4, 0.95))
        g.beginPath()
        g.arc(x, y, r, 0, Math.PI * 2)
        g.fill()
      }
    }

    // Sun (setting, in a saddle between the far peaks) or moon.
    const sun = night ? { x: 56, y: -96, r: 9 } : { x: 74, y: -72, r: 10.5 }
    const glowR = (night ? 64 : 92) * S
    const grad = g.createRadialGradient(X(sun.x), Y(sun.y), sun.r * S * 0.6, X(sun.x), Y(sun.y), glowR)
    grad.addColorStop(0, rgba(night ? '#d9e2ff' : '#fff1c4', night ? 0.5 : 0.85))
    grad.addColorStop(0.35, rgba(night ? '#9fb0f0' : '#ffd08a', night ? 0.18 : 0.38))
    grad.addColorStop(1, rgba(night ? '#9fb0f0' : '#ff9f8a', 0))
    g.fillStyle = grad
    g.fillRect(X(sun.x) - glowR, Y(sun.y) - glowR, glowR * 2, glowR * 2)
    g.fillStyle = night ? '#fbf5de' : '#fff4cf'
    g.beginPath()
    g.arc(X(sun.x), Y(sun.y), sun.r * S, 0, Math.PI * 2)
    g.fill()
    if (night) {
      // A few soft craters.
      g.fillStyle = 'rgba(200, 196, 170, 0.35)'
      for (const [dx, dy, r] of [
        [-4, -3, 3],
        [3, 4, 2.2],
        [5, -5, 1.6],
      ] as const) {
        g.beginPath()
        g.arc(X(sun.x + dx), Y(sun.y + dy), r * S, 0, Math.PI * 2)
        g.fill()
      }
    }

    // Clouds.
    const cloudSpots = night
      ? [
          { x: -150, y: -210, s: 22 },
          { x: 170, y: -230, s: 18 },
        ]
      : [
          { x: -90, y: -232, s: 26 },
          { x: 160, y: -262, s: 22 },
          { x: -250, y: -190, s: 28 },
          { x: 250, y: -168, s: 18 },
        ]
    cloudSpots.forEach((cs, i) => {
      paperCloud(g, X(cs.x), Y(cs.y), cs.s * S, 2.4, night ? '#3f3e78' : '#ffe1e6', night ? '#2f2e62' : '#f0b9cc', night ? 'rgba(5,5,30,0.3)' : 'rgba(150,80,120,0.2)', 30 + i * 3.7)
    })

    // Far peaks (two layers), their snow caps, the far shore. Kept as paths for the reflection too.
    const back: Pt[] = [
      { x: -460, y: -50 },
      { x: -384, y: -126 },
      { x: -322, y: -94 },
      { x: -252, y: -152 },
      { x: -182, y: -92 },
      { x: -124, y: -122 },
      { x: -64, y: -80 },
      { x: -6, y: -108 },
      { x: 40, y: -70 },
      { x: 76, y: -58 },
      { x: 114, y: -76 },
      { x: 164, y: -132 },
      { x: 232, y: -94 },
      { x: 294, y: -150 },
      { x: 364, y: -90 },
      { x: 470, y: -55 },
    ]
    const near: Pt[] = [
      { x: -460, y: -46 },
      { x: -402, y: -84 },
      { x: -342, y: -62 },
      { x: -282, y: -100 },
      { x: -216, y: -60 },
      { x: -152, y: -80 },
      { x: -92, y: -54 },
      { x: -32, y: -68 },
      { x: 28, y: -49 },
      { x: 92, y: -47 },
      { x: 138, y: -62 },
      { x: 184, y: -94 },
      { x: 242, y: -64 },
      { x: 304, y: -106 },
      { x: 372, y: -58 },
      { x: 470, y: -48 },
    ]
    const backCol = night ? '#3d3a78' : '#dba7c6'
    const nearCol = night ? '#2c2a60' : '#b886b6'
    const snowCol = night ? '#b9c2ee' : '#fff0f4'
    const peaks = (pts: Pt[], baseY: number, mirror: boolean): Path2D => {
      const p = new Path2D()
      const yy = (y: number) => (mirror ? Y(LAKE.farY + (LAKE.farY - y) * 0.82) : Y(y))
      p.moveTo(X(pts[0].x), yy(baseY))
      for (const q of pts) p.lineTo(X(q.x), yy(q.y))
      p.lineTo(X(pts[pts.length - 1].x), yy(baseY))
      p.closePath()
      return p
    }
    const caps = (pts: Pt[], mirror: boolean): Path2D => {
      const p = new Path2D()
      const yy = (y: number) => (mirror ? Y(LAKE.farY + (LAKE.farY - y) * 0.82) : Y(y))
      for (let i = 1; i < pts.length - 1; i++) {
        const a = pts[i - 1]
        const q = pts[i]
        const b = pts[i + 1]
        if (q.y > a.y || q.y > b.y || q.y > -74) continue
        const k = 0.28
        const l = { x: q.x + (a.x - q.x) * k, y: q.y + (a.y - q.y) * k }
        const r = { x: q.x + (b.x - q.x) * k, y: q.y + (b.y - q.y) * k }
        p.moveTo(X(l.x), yy(l.y))
        p.lineTo(X(q.x), yy(q.y))
        p.lineTo(X(r.x), yy(r.y))
        p.lineTo(X(r.x - (r.x - q.x) * 0.35), yy(r.y - 5))
        p.lineTo(X((l.x + r.x) / 2), yy(Math.max(l.y, r.y) + 3))
        p.lineTo(X(l.x + (q.x - l.x) * 0.35), yy(l.y - 5))
        p.closePath()
      }
      return p
    }
    g.fillStyle = backCol
    g.fill(peaks(back, LAKE.farY + 2, false))
    g.fillStyle = rgba(snowCol, 0.85)
    g.fill(caps(back, false))
    // Haze between the layers.
    const haze = g.createLinearGradient(0, Y(-150), 0, horizon)
    haze.addColorStop(0, rgba(night ? '#55387a' : '#ffc9b4', 0))
    haze.addColorStop(1, rgba(night ? '#55387a' : '#ffc9b4', 0.55))
    g.fillStyle = haze
    g.fillRect(left, Y(-150), right - left, horizon - Y(-150))
    g.fillStyle = nearCol
    g.fill(peaks(near, LAKE.farY + 2, false))
    g.fillStyle = rgba(snowCol, 0.9)
    g.fill(caps(near, false))

    // Water: the sky's colours, upside down, deepening toward us.
    const water = g.createLinearGradient(0, horizon, 0, bottom)
    if (night) {
      water.addColorStop(0, '#4b4886')
      water.addColorStop(0.25, '#2c3a7a')
      water.addColorStop(1, '#10163c')
    } else {
      water.addColorStop(0, '#ffcfa0')
      water.addColorStop(0.18, '#f6a7a4')
      water.addColorStop(0.55, '#b28bc4')
      water.addColorStop(1, '#6a64b0')
    }
    g.fillStyle = water
    g.fillRect(left, horizon, right - left, bottom - horizon)

    // Reflections of the peaks (softer, a little squashed), broken by fine ripple lines.
    g.save()
    g.beginPath()
    g.rect(left, horizon, right - left, bottom - horizon)
    g.clip()
    g.globalAlpha = 0.42
    g.fillStyle = mix(backCol, night ? '#2c3a7a' : '#f6a7a4', 0.35)
    g.fill(peaks(back, LAKE.farY - 2, true))
    g.globalAlpha = 0.5
    g.fillStyle = mix(nearCol, night ? '#2c3a7a' : '#f6a7a4', 0.3)
    g.fill(peaks(near, LAKE.farY - 2, true))
    g.globalAlpha = 0.35
    g.fillStyle = snowCol
    g.fill(caps(near, true))
    g.globalAlpha = 1
    // The sun's (or moon's) soft reflection, straight below it.
    const rg = g.createRadialGradient(X(sun.x), horizon + 4 * S, 0, X(sun.x), horizon + 4 * S, 60 * S)
    rg.addColorStop(0, rgba(night ? '#cfd8ff' : '#fff0c0', night ? 0.4 : 0.7))
    rg.addColorStop(1, rgba(night ? '#cfd8ff' : '#fff0c0', 0))
    g.fillStyle = rg
    g.save()
    g.translate(X(sun.x), horizon + 4 * S)
    g.scale(0.55, 1.6)
    g.translate(-X(sun.x), -(horizon + 4 * S))
    g.fillRect(X(sun.x) - 60 * S, horizon - 60 * S, 120 * S, 120 * S)
    g.restore()
    // Fine horizontal ripple lines across the reflections.
    for (let y = horizon + 2; y < Y(60); y += Math.max(2.2, (y - horizon) * 0.08 + 2)) {
      g.fillStyle = rgba(night ? '#2c3a7a' : '#f8b4a6', rng.range(0.15, 0.4))
      g.fillRect(left, y, right - left, Math.max(0.6, S * 0.35))
    }
    g.restore()

    // The far shore: a thin snowy strip with tiny pines, and its glow line on the water.
    g.fillStyle = night ? '#8f95c8' : '#fbe3ec'
    g.beginPath()
    g.moveTo(left, horizon + 1)
    for (let x = -480; x <= 480; x += 16) g.lineTo(X(x), Y(LAKE.farY - 2.5 - Math.abs(Math.sin(x / 23)) * 2.2))
    g.lineTo(right, horizon + 1)
    g.closePath()
    g.fill()
    g.fillStyle = night ? '#1f1d4c' : '#8c6496'
    for (let x = -460; x <= 460; ) {
      const clump = rng.int(4) + 1
      for (let i = 0; i < clump; i++) {
        const hgt = rng.range(4, 9)
        const px = x + i * rng.range(3, 5)
        g.beginPath()
        g.moveTo(X(px - hgt * 0.32), Y(LAKE.farY - 2))
        g.lineTo(X(px), Y(LAKE.farY - 2 - hgt))
        g.lineTo(X(px + hgt * 0.32), Y(LAKE.farY - 2))
        g.closePath()
        g.fill()
      }
      x += rng.range(26, 70)
    }
    g.fillStyle = rgba(night ? '#c9d6ff' : '#fff5ee', 0.55)
    g.fillRect(left, horizon + 1, right - left, Math.max(1, S * 0.5))
    return canvas
  }

  // -------------------------------------------------------------------------------------------
  // The whole mountain

  private drawPano(ctx: CanvasRenderingContext2D, scene: PanoScene, region: Region): void {
    const f = fitBox(scene.box, region)
    const t = scene.t
    const d = this.dpr
    // Sky behind everything (screen space).
    ctx.setTransform(d, 0, 0, d, 0, 0)
    if (this.skyStrip) ctx.drawImage(this.skyStrip, 0, 0, 4, 256, 0, 0, this.w, this.h)
    this.applyFit(ctx, f)
    const s = f.s
    const geo = this.pano

    // The sun, low on the left (the frame's one light sprite).
    const sun = { x: -560, y: -760 }
    if (this.sunGlow === null) this.sunGlow = softDot(128, '#ffd08a', 0.15)
    ctx.globalAlpha = 0.85
    ctx.drawImage(this.sunGlow, sun.x - 260, sun.y - 260, 520, 520)
    ctx.globalAlpha = 1
    ctx.fillStyle = '#fff1c9'
    ctx.beginPath()
    ctx.arc(sun.x, sun.y, 46, 0, Math.PI * 2)
    ctx.fill()

    // Far ranges, sky clouds, the clouds behind the mountain's sides.
    for (const r of geo.ranges) {
      ctx.fillStyle = r.color
      ctx.fill(r.path)
    }
    for (const cl of geo.skyClouds) this.paperCloud(ctx, cl.x + Math.sin(t * 0.2 + cl.i) * cl.w * 0.04, cl.y, cl.w, cl.i, s)
    for (const cl of geo.ringClouds) if (!cl.front) this.paperCloud(ctx, cl.x + Math.sin(t * 0.3 + cl.i) * 5, cl.y, cl.w, cl.i, s)

    // The zone bands (they never change): from the bitmap made for this screen size when the camera is
    // out far enough for it to stay crisp — the pull-out after its close start, the camps lighting up,
    // most of the zoom in — else as vector paths. Sky Lake's cup animates, so it is always drawn live.
    const stack = s * d <= STACK_SHARP * this.stackScale() ? this.bandStack() : null
    if (stack) {
      ctx.drawImage(stack.canvas, STACK_BOX.x0, STACK_BOX.y0, stack.canvas.width / stack.k, stack.canvas.height / stack.k)
      this.drawSummitLake(ctx, t, s, scene.lit)
    } else this.drawBands(ctx, s, { t, lit: scene.lit }, (this.h - f.oy) / s)
    for (const cl of geo.ringClouds) if (cl.front) this.paperCloud(ctx, cl.x + Math.sin(t * 0.3 + cl.i) * 5, cl.y, cl.w, cl.i, s)

    // The valley's hills in front of the mountain's foot.
    for (const hh of geo.hills) {
      ctx.fillStyle = hh.color
      ctx.fill(hh.path)
    }

    // Fireflies in the hollow.
    if (this.glow) {
      geo.fireflies.forEach((p, i) => {
        const a = 0.45 + 0.55 * Math.sin(t * 2.3 + i * 1.7)
        if (a <= 0.05) return
        const r = Math.max(5, 3.5 / s)
        ctx.globalAlpha = a
        ctx.drawImage(this.glow as HTMLCanvasElement, p.x - r * 2, p.y - r * 2, r * 4, r * 4)
        ctx.fillStyle = '#fbffcf'
        ctx.beginPath()
        ctx.arc(p.x, p.y, Math.max(1.2, 0.9 / s), 0, Math.PI * 2)
        ctx.fill()
      })
      ctx.globalAlpha = 1
    }

    // The trail (a few CSS px wide at any zoom) and the camps along it.
    const px = (v: number) => v / s
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = 'rgba(70, 40, 60, 0.26)'
    ctx.lineWidth = px(4.4)
    ctx.stroke(geo.trail)
    ctx.strokeStyle = '#fff6e8'
    ctx.lineWidth = px(2.2)
    ctx.setLineDash([px(6), px(6)])
    ctx.stroke(geo.trail)
    ctx.setLineDash([])
    geo.camps.forEach((p, i) => this.camp(ctx, p, i, scene.lit, s, t))

    // The summit flag on the horn, the sign with her mountain's name, then her.
    this.flag(ctx, 50, -1034, t, 0.55)
    this.summitSign(ctx, PANO.signX, -1010)
    this.drawHer(ctx, scene.her, t)
    if (scene.sparkle && scene.sparkle > 0) this.sparkles(ctx, { x: PANO.herX, y: PANO.herY - 14 }, scene.sparkle, t, PANO.herScale * 0.9)
  }

  /**
   * The zone bands, back to front: paper shadow on the layer behind, the band, its shadow side, what
   * grows on it, and a rim of light along its top edge. `lake`: draw Sky Lake's (animated) cup right
   * after the summit band; null for the pre-rendered bitmap (the cup is drawn live over it).
   * `bottom`: the lowest pano y on screen — bands whose top edge (with its peaks and paper shadow) is
   * below it are skipped (close in on the summit, most of the mountain is out of the picture).
   */
  private drawBands(ctx: CanvasRenderingContext2D, s: number, lake: { t: number; lit: number } | null, bottom = Infinity): void {
    const geo = this.pano
    const shadow = 'rgba(70, 36, 80, 0.16)'
    geo.bands.forEach((b, i) => {
      if (b.def.edgeY - 80 > bottom) return
      if (i > 0) {
        const behind = geo.bands[i - 1]
        ctx.save()
        ctx.clip(behind.clip)
        ctx.fillStyle = shadow
        ctx.translate(0, -7)
        ctx.fill(b.fill)
        ctx.translate(0, 3.5)
        ctx.fill(b.fill)
        ctx.restore()
      }
      ctx.save()
      ctx.clip(b.clip)
      ctx.fillStyle = b.def.fill
      ctx.fill(b.fill)
      for (const dd of b.deco) {
        ctx.fillStyle = dd.color
        ctx.fill(dd.path)
      }
      ctx.save()
      ctx.clip(b.fill)
      ctx.fillStyle = rgba(b.def.dark, 0.34)
      ctx.fill(geo.shade)
      ctx.restore()
      ctx.strokeStyle = rgba(b.def.light, 0.9)
      ctx.lineWidth = Math.max(1.6 / s, 1.2)
      ctx.lineJoin = 'round'
      ctx.stroke(b.edge)
      ctx.restore()
      if (b.def.style === 'summit') {
        ctx.fillStyle = '#b48aa6'
        ctx.fill(geo.summitRocks)
        ctx.fillStyle = '#ffffff'
        ctx.fill(geo.summitSnow)
        if (lake) this.drawSummitLake(ctx, lake.t, s, lake.lit)
      }
    })
  }

  /** Device px per pano unit for the band-stack bitmap (each side ≤ 2048 px). */
  private stackScale(): number {
    const bw = STACK_BOX.x1 - STACK_BOX.x0
    const bh = STACK_BOX.y1 - STACK_BOX.y0
    return Math.min(STACK_MAX_PX / bw, STACK_MAX_PX / bh, this.dpr * 0.8)
  }

  /** The whole band stack as one bitmap, made on first use after a resize (freed in releaseBitmaps). */
  private bandStack(): { canvas: HTMLCanvasElement; k: number } | null {
    if (this.stack) return this.stack
    const k = this.stackScale()
    const c = makeCanvas((STACK_BOX.x1 - STACK_BOX.x0) * k, (STACK_BOX.y1 - STACK_BOX.y0) * k)
    const g = c.getContext('2d')
    if (!g) {
      freeCanvas(c)
      return null
    }
    g.setTransform(k, 0, 0, k, -STACK_BOX.x0 * k, -STACK_BOX.y0 * k)
    this.drawBands(g, k / this.dpr, null)
    this.stack = { canvas: c, k }
    return this.stack
  }

  /** A paper-cut cloud (vector, so it stays crisp at any zoom): a crisp offset shadow, the body, a shaded underside. */
  private paperCloud(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, i: number, s: number): void {
    const all = clouds()
    const shape = all[i % all.length]
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(w, w)
    ctx.fillStyle = 'rgba(150, 80, 130, 0.2)'
    ctx.translate(0, Math.max(0.035, 3 / (s * w)))
    ctx.fill(shape.body)
    ctx.translate(0, -Math.max(0.035, 3 / (s * w)))
    ctx.fillStyle = '#fff1f3'
    ctx.fill(shape.body)
    ctx.save()
    ctx.clip(shape.body)
    ctx.fillStyle = 'rgba(232, 176, 204, 0.75)'
    ctx.fill(shape.shade)
    ctx.restore()
    ctx.restore()
  }

  private drawSummitLake(ctx: CanvasRenderingContext2D, t: number, s: number, lit: number): void {
    const L = PANO.lake
    // A snowy lip behind, the water reflecting the sunset, a bright ripple or two.
    const g = ctx.createLinearGradient(0, L.y - L.ry, 0, L.y + L.ry)
    g.addColorStop(0, '#7f74c4')
    g.addColorStop(0.55, '#f2a3a8')
    g.addColorStop(1, '#ffd1a1')
    ctx.fillStyle = '#e8c6d8'
    ctx.beginPath()
    ctx.ellipse(L.x, L.y + 0.8, L.rx + 2.6, L.ry + 1.6, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = g
    ctx.fill(this.pano.lakeRim)
    ctx.strokeStyle = 'rgba(255, 248, 240, 0.9)'
    ctx.lineWidth = Math.max(0.8 / s, 0.35)
    for (let i = 0; i < 3; i++) {
      const k = (t * 0.35 + i / 3) % 1
      ctx.globalAlpha = Math.sin(k * Math.PI) * 0.8
      ctx.beginPath()
      ctx.ellipse(L.x + (i - 1) * 9, L.y + (i - 1) * 0.8, 3 + k * 6, 0.6 + k * 0.9, 0, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
    // Sky Lake is the sixteenth light: once every camp below is lit, it glows too.
    const on = clamp01(lit - 15)
    if (on > 0 && this.warm) {
      const r = Math.max(L.rx * 1.6, 26 / s) * (0.7 + 0.3 * easeOutBack(on))
      ctx.globalAlpha = 0.7 * on
      ctx.drawImage(this.warm, L.x - r, L.y - r * 0.7, r * 2, r * 1.4)
      ctx.globalAlpha = 1
    }
    ctx.fillStyle = '#ffffff'
    star4(ctx, L.x + 12, L.y - 1.2, (1.4 + Math.sin(t * 4) * 0.5) * (1 + on * 1.4))
    ctx.fill()
    if (on > 0) {
      star4(ctx, L.x - 9, L.y - 2.2, 1.1 + Math.sin(t * 3 + 1) * 0.5)
      ctx.fill()
    }
  }

  /** One pitch camp: a little tent, and once lit, a lantern glow with a pop. */
  private camp(ctx: CanvasRenderingContext2D, p: Pt, i: number, lit: number, s: number, t: number): void {
    const passed = this.opts.camps[i] !== false
    const on = passed ? clamp01(lit - i) : 0
    const pop = on > 0 ? easeOutBack(Math.min(1, on * 1.25)) : 0
    // At least ~13 CSS px across, however far out the camera is.
    const size = Math.max(16, 13 / s)
    const zone = Math.min(4, Math.floor(i / 3))
    const tent = CAMP_TENT[zone]
    if (on > 0 && this.warm) {
      const r = size * (1.7 + 0.25 * Math.sin(t * 3 + i)) * (0.6 + 0.4 * pop)
      ctx.globalAlpha = 0.85 * on
      ctx.drawImage(this.warm, p.x - r, p.y - r - size * 0.3, r * 2, r * 2)
      ctx.globalAlpha = 1
    }
    ctx.save()
    ctx.translate(p.x, p.y)
    const sc = 1 + 0.35 * Math.max(0, pop - 1) + (on > 0 && on < 1 ? 0.25 * Math.sin(on * Math.PI) : 0)
    ctx.scale(sc, sc)
    ctx.fillStyle = 'rgba(60, 30, 50, 0.25)'
    ctx.beginPath()
    ctx.ellipse(0, size * 0.03, size * 0.62, size * 0.12, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = passed ? tent : mix(tent, '#9b8aa6', 0.55)
    ctx.beginPath()
    ctx.moveTo(-size * 0.5, 0)
    ctx.lineTo(0, -size * 0.66)
    ctx.lineTo(size * 0.5, 0)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = shade(passed ? tent : '#9b8aa6', -0.25)
    ctx.beginPath()
    ctx.moveTo(-size * 0.12, 0)
    ctx.lineTo(0, -size * 0.4)
    ctx.lineTo(size * 0.12, 0)
    ctx.closePath()
    ctx.fill()
    if (on > 0) {
      ctx.fillStyle = '#fff3b0'
      ctx.beginPath()
      ctx.arc(size * 0.62, -size * 0.2, size * 0.13 * (0.7 + 0.3 * pop), 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }

  private summitSign(ctx: CanvasRenderingContext2D, x: number, groundY: number): void {
    const name = this.opts.mountainName.trim()
    const c = this.c
    ctx.save()
    ctx.translate(x, groundY)
    ctx.scale(1.3, 1.3)
    // Post.
    ctx.fillStyle = c.wood
    ctx.strokeStyle = c.woodInk
    ctx.lineWidth = 0.35
    ctx.beginPath()
    ctx.rect(-0.7, -12, 1.4, 12)
    ctx.fill()
    ctx.stroke()
    // Board, sized to the name.
    const fs = 3.1
    ctx.font = `800 ${fs}px ${FONT}`
    const label = name || 'Sky Lake'
    const tw = Math.min(30, Math.max(14, ctx.measureText(label).width + 4))
    const bh = name ? 8.6 : 5.4
    const by = -12 - bh + 1.4
    ctx.fillStyle = shade(c.wood, 0.12)
    ctx.beginPath()
    ctx.moveTo(-tw / 2, by)
    ctx.lineTo(tw / 2, by)
    ctx.lineTo(tw / 2 + 1.2, by + bh / 2)
    ctx.lineTo(tw / 2, by + bh)
    ctx.lineTo(-tw / 2, by + bh)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#fff6e6'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const fit = Math.min(1, (tw - 3) / Math.max(1, ctx.measureText(label).width))
    ctx.save()
    ctx.translate(0, by + (name ? 2.9 : bh / 2))
    ctx.scale(fit, 1)
    ctx.fillText(label, 0, 0)
    ctx.restore()
    if (name) {
      ctx.font = `700 ${fs * 0.62}px ${FONT}`
      ctx.fillStyle = 'rgba(255, 240, 220, 0.85)'
      ctx.fillText('Sky Lake', 0, by + 6.2)
    }
    // A little snow on top of the board.
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.ellipse(-tw * 0.18, by, tw * 0.3, 0.7, 0, Math.PI, 0)
    ctx.fill()
    ctx.restore()
  }

  // -------------------------------------------------------------------------------------------
  // Sky Lake

  private drawLake(ctx: CanvasRenderingContext2D, scene: LakeScene, region: Region): void {
    const f = fitBox(scene.box, region)
    const t = scene.t
    const d = this.dpr
    const c = this.c
    const geo = this.lake
    const night = this.opts.night

    // Fallback fill (the bitmap's margin covers normal camera moves; this covers the rest).
    ctx.setTransform(d, 0, 0, d, 0, 0)
    const horizonY = f.oy + LAKE.farY * f.s
    ctx.fillStyle = night ? NIGHT_SKY[1] : DAY_SKY[1]
    ctx.fillRect(0, 0, this.w, Math.max(0, horizonY))
    ctx.fillStyle = night ? '#1b2456' : '#b28bc4'
    ctx.fillRect(0, Math.max(0, horizonY), this.w, this.h)

    // The far world, with parallax: it zooms less than the shore, about the camera's focus.
    const bf = this.bgFit
    const cx = (scene.box.x0 + scene.box.x1) / 2
    const cy = (scene.box.y0 + scene.box.y1) / 2
    const zoom = f.s / bf.s
    const bz = Math.pow(Math.max(0.2, zoom), 0.42)
    const sx = f.ox + cx * f.s
    const sy = f.oy + cy * f.s
    const rx = bf.ox + cx * bf.s
    const ry = bf.oy + cy * bf.s
    const bgPt = (p: Pt): Pt => ({ x: sx + (bf.ox + p.x * bf.s - rx) * bz, y: sy + (bf.oy + p.y * bf.s - ry) * bz })
    if (this.lakeBg) {
      ctx.setTransform(d * bz, 0, 0, d * bz, d * (sx - rx * bz), d * (sy - ry * bz))
      ctx.drawImage(this.lakeBg, -this.bgPad.x, -this.bgPad.y, this.w + this.bgPad.x * 2, this.h + this.bgPad.y * 2)
    }

    // The sun's (or moon's) glitter path on the water, shimmering.
    ctx.setTransform(d, 0, 0, d, 0, 0)
    const sunX = night ? 56 : 74
    const bs = bf.s * bz
    ctx.strokeStyle = c.glint
    ctx.lineCap = 'round'
    for (let i = 0; i < 30; i++) {
      const k = i / 30
      const y = LAKE.farY + 2 + Math.pow(k, 1.6) * 150
      const half = 1.5 + 10 * k
      const wob = Math.sin(i * 7.3 + t * 1.2) * half * 0.5
      const a = 0.25 + 0.45 * (0.5 + 0.5 * Math.sin(t * (2.2 + (i % 5) * 0.4) + i * 2.1))
      const p = bgPt({ x: sunX + wob, y })
      ctx.globalAlpha = a * (1 - k * 0.5) * (night ? 0.8 : 1)
      ctx.lineWidth = Math.max(1, bs * (0.4 + k * 0.6))
      ctx.beginPath()
      ctx.moveTo(p.x - half * bs * 0.5, p.y)
      ctx.lineTo(p.x + half * bs * 0.5, p.y)
      ctx.stroke()
    }
    ctx.globalAlpha = 1

    this.applyFit(ctx, f)
    const s = f.s

    // Tiny ripples drifting on the still water.
    ctx.strokeStyle = c.ripple
    ctx.lineCap = 'round'
    const r = geo.ripples
    for (let i = 0; i < r.length; i += 4) {
      const a = 0.5 + 0.5 * Math.sin(t * 0.9 + r[i + 3])
      if (a < 0.1) continue
      const x = r[i] + Math.sin(t * 0.25 + r[i + 3]) * 6
      const y = r[i + 1]
      const len = r[i + 2]
      ctx.globalAlpha = a * 0.5
      ctx.lineWidth = Math.max(0.8 / s, 0.25 + (y - LAKE.farY) * 0.004)
      ctx.beginPath()
      ctx.moveTo(x - len / 2, y)
      ctx.quadraticCurveTo(x, y - 0.6, x + len / 2, y)
      ctx.stroke()
    }
    ctx.globalAlpha = 1

    // Rings from splashes and things floating (behind what floats).
    for (const sp of scene.splashes) this.rings(ctx, sp, t, s)
    if (scene.her.waterY !== undefined) this.floatRing(ctx, scene.her.x + 2, scene.her.waterY, 15, t, s)
    if (scene.goat?.state.inBackpack) this.floatRing(ctx, scene.goat.x, scene.goat.y, 10, t, s)
    if (scene.goat && scene.wake) this.wakeLines(ctx, scene.goat, scene.wake, t, s)

    // The shore and the diving rock.
    this.shore(ctx, t, s)

    // Bubbles where someone went under.
    for (const [bx, by, from, to] of scene.bubbles) this.bubbles(ctx, bx, by, from, to, t, s)

    // The two of them.
    if (scene.goat && scene.goatBehind) this.drawGoatFig(ctx, scene.goat)
    this.drawHer(ctx, scene.her, t)
    if (scene.goat && !scene.goatBehind) this.drawGoatFig(ctx, scene.goat)

    // Splashes in front of everything, then drips and sparkles.
    for (const sp of scene.splashes) this.splash(ctx, sp, t, s)
    if (scene.her.wetFor !== undefined) this.drips(ctx, scene.her, scene.her.wetFor)
    if (scene.sparkle > 0 && scene.sparkleAt) this.sparkles(ctx, scene.sparkleAt, scene.sparkle, t)
    if (night) this.fireflies(ctx, t, s)

    // The dark paper-cut bank in the very front.
    ctx.fillStyle = night ? '#1d1840' : '#6f4f78'
    ctx.fill(geo.front)
    ctx.fillStyle = night ? '#2a2352' : '#7f5f88'
    ctx.fill(geo.frontTufts)
  }

  private shore(ctx: CanvasRenderingContext2D, t: number, s: number): void {
    const c = this.c
    const g = this.lake
    const night = this.opts.night
    ctx.fillStyle = c.rock
    ctx.fill(g.land)
    // Shading: lighter face up top, darker toward the water.
    ctx.save()
    ctx.clip(g.land)
    ctx.fillStyle = rgba(c.rockLight, 0.55)
    ctx.fillRect(-700, LAKE.rockTop, 720, 10)
    ctx.fillStyle = rgba(c.rockDark, 0.75)
    ctx.beginPath()
    ctx.moveTo(-700, 30)
    ctx.quadraticCurveTo(-200, 18, 10, 0)
    ctx.lineTo(10, 460)
    ctx.lineTo(-700, 460)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = rgba(c.rockInk, 0.35)
    ctx.fill(g.wetBand)
    ctx.strokeStyle = rgba(c.rockInk, 0.5)
    ctx.lineWidth = Math.max(0.9 / s, 0.5)
    ctx.lineCap = 'round'
    ctx.stroke(g.cracks)
    ctx.restore()
    // Outline of the rock against the water.
    ctx.strokeStyle = rgba(c.rockInk, 0.8)
    ctx.lineWidth = Math.max(1.1 / s, 0.6)
    ctx.stroke(g.land)
    // Snow on top.
    ctx.fillStyle = c.snow
    ctx.fill(g.snowTop)
    ctx.save()
    ctx.clip(g.snowTop)
    ctx.fillStyle = c.snowShade
    ctx.fillRect(-700, LAKE.rockTop + 1.2, 720, 8)
    ctx.restore()
    ctx.fillStyle = rgba(c.rockInk, 0.85)
    ctx.fill(g.pebbles)

    // The little cairn (stones on top of each other), the Sky Lake sign and the summit flag.
    this.cairn(ctx, -80, LAKE.rockTop)
    this.lakeSign(ctx, -104, LAKE.rockTop)
    this.flag(ctx, -146, shoreTop(-146), t)
    // Flowers poking through the snow.
    const flowers = night ? ['#c3a6e0', '#e8e3ff', '#9fb4ff'] : ['#ffd36b', '#ff9db0', '#bfa6ff']
    for (const [x, i] of [
      [-121, 0],
      [-118, 1],
      [-47, 2],
      [-44, 0],
      [-156, 1],
      [-92, 2],
    ] as const) {
      const gy = shoreTop(x)
      ctx.strokeStyle = night ? '#4c6a6a' : '#6aa257'
      ctx.lineWidth = 0.6
      ctx.beginPath()
      ctx.moveTo(x, gy - 1)
      ctx.lineTo(x + 0.4, gy - 4.5)
      ctx.stroke()
      ctx.fillStyle = flowers[i]
      ctx.beginPath()
      ctx.arc(x + 0.4, gy - 5, 1.4, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#fff6d0'
      ctx.beginPath()
      ctx.arc(x + 0.4, gy - 5, 0.5, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  private cairn(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    const stones: [number, number, number, number, string][] = [
      [0, -2.6, 6.4, 2.8, '#cfc6ba'],
      [-0.6, -7.2, 5, 2.4, '#b9b2cc'],
      [0.4, -11, 3.8, 2, '#d8c4a6'],
      [0, -14, 2.4, 1.5, '#aebdb2'],
    ]
    for (const [dx, dy, rx, ry, col] of stones) {
      ctx.fillStyle = this.opts.night ? mix(col, '#2c3a7a', 0.45) : col
      ctx.strokeStyle = rgba(this.c.rockInk, 0.75)
      ctx.lineWidth = 0.5
      ctx.beginPath()
      ctx.ellipse(x + dx, y + dy, rx, ry, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
  }

  private lakeSign(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    const c = this.c
    ctx.save()
    ctx.translate(x, y)
    ctx.fillStyle = c.wood
    ctx.strokeStyle = c.woodInk
    ctx.lineWidth = 0.6
    ctx.beginPath()
    ctx.rect(-1.2, -22, 2.4, 22)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = shade(c.wood, 0.1)
    ctx.beginPath()
    ctx.moveTo(-17, -30)
    ctx.lineTo(15, -30)
    ctx.lineTo(19, -24.5)
    ctx.lineTo(15, -19)
    ctx.lineTo(-17, -19)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#fff6e6'
    ctx.font = `800 6.4px ${FONT}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('Sky Lake', -0.5, -24.3)
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.ellipse(-6, -30, 9, 1.4, 0, Math.PI, 0)
    ctx.fill()
    ctx.restore()
  }

  private flag(ctx: CanvasRenderingContext2D, x0: number, y0: number, t: number, sc = 1): void {
    ctx.save()
    ctx.translate(x0, y0)
    ctx.scale(sc, sc)
    const x = 0
    const y = 0
    ctx.strokeStyle = this.c.woodInk
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x, y - 40)
    ctx.stroke()
    ctx.fillStyle = this.c.flag
    ctx.beginPath()
    ctx.moveTo(x, y - 40)
    for (let i = 0; i <= 6; i++) {
      const u = i / 6
      ctx.lineTo(x + u * 17, y - 40 + Math.sin(t * 4 - u * 4) * 1.4 * u + u * 1)
    }
    for (let i = 6; i >= 0; i--) {
      const u = i / 6
      ctx.lineTo(x + u * 17, y - 29 + Math.sin(t * 4 - u * 4) * 1.4 * u - u * 1)
    }
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#fff3c9'
    ctx.beginPath()
    ctx.arc(x + 6.5, y - 34.6 + Math.sin(t * 4 - 1.5) * 0.5, 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  private floatRing(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, t: number, s: number): void {
    ctx.strokeStyle = this.c.ripple
    ctx.lineWidth = Math.max(1 / s, 0.45)
    ctx.globalAlpha = 0.85
    ctx.beginPath()
    ctx.ellipse(x, y + 0.6, rx, rx * 0.24, 0, 0, Math.PI * 2)
    ctx.stroke()
    for (let i = 0; i < 2; i++) {
      const k = (t * 0.6 + i * 0.5) % 1
      ctx.globalAlpha = (1 - k) * 0.45
      ctx.beginPath()
      ctx.ellipse(x, y + 0.6, rx + k * rx * 1.4, (rx + k * rx * 1.4) * 0.24, 0, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }

  private wakeLines(ctx: CanvasRenderingContext2D, g: GoatFigure, amount: number, t: number, s: number): void {
    ctx.strokeStyle = this.c.ripple
    ctx.lineWidth = Math.max(0.9 / s, 0.4)
    for (let i = 1; i <= 3; i++) {
      const k = (t * 1.6 + i / 3) % 1
      ctx.globalAlpha = amount * (1 - k) * 0.7
      const back = g.state.facing === -1 ? 1 : -1
      const x = g.x + back * (9 + k * 16)
      ctx.beginPath()
      ctx.moveTo(x, g.y - 0.4 - k * 2.6)
      ctx.lineTo(x + back * 6, g.y + 0.2)
      ctx.lineTo(x, g.y + 1 + k * 2.8)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }

  private rings(ctx: CanvasRenderingContext2D, sp: Splash, t: number, s: number): void {
    const tau = t - sp.at
    if (tau < 0 || tau > 3.2) return
    ctx.strokeStyle = this.c.ripple
    for (let i = 0; i < 3; i++) {
      const k = tau - i * 0.32
      if (k <= 0) continue
      const r = sp.size * (8 + 34 * Math.pow(k, 0.6))
      ctx.globalAlpha = Math.max(0, 1 - k / 2.6) * 0.8
      ctx.lineWidth = Math.max(1.2 / s, 0.6) * (1.4 - Math.min(1, k / 2.6))
      ctx.beginPath()
      ctx.ellipse(sp.x, sp.y + 0.6, r, r * 0.26, 0, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
  }

  private splash(ctx: CanvasRenderingContext2D, sp: Splash, t: number, s: number): void {
    const tau = t - sp.at
    if (tau < 0 || tau > 1.8) return
    const c = this.c
    const S = sp.size
    const lw = Math.max(1 / s, 0.45)
    // The crown: petals of water standing up round the splash, then falling back.
    if (tau < 0.75) {
      const k = tau / 0.75
      const hgt = S * 36 * Math.sin(Math.PI * Math.min(1, k * 1.15)) * (1 - k * 0.25)
      const spread = S * (10 + k * 10)
      const n = 9
      ctx.lineJoin = 'round'
      for (let i = 0; i < n; i++) {
        const u = (i / (n - 1)) * 2 - 1
        const bx = sp.x + u * spread
        const tipH = hgt * (1 - 0.55 * u * u) * (0.85 + 0.3 * ((i * 37) % 7) / 7)
        const tx = bx + u * S * (6 + k * 10)
        const ty = sp.y - tipH
        const wdt = S * (3.4 - Math.abs(u) * 1.2)
        ctx.fillStyle = c.splash
        ctx.strokeStyle = c.splashInk
        ctx.lineWidth = lw
        ctx.beginPath()
        ctx.moveTo(bx - wdt, sp.y)
        ctx.quadraticCurveTo(bx - wdt * 0.3, sp.y - tipH * 0.55, tx, ty)
        ctx.quadraticCurveTo(bx + wdt * 0.5, sp.y - tipH * 0.45, bx + wdt, sp.y)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
        if (k < 0.8) {
          ctx.fillStyle = c.foam
          ctx.beginPath()
          ctx.arc(tx, ty, S * 1.5 * (1 - k * 0.6), 0, Math.PI * 2)
          ctx.fill()
          ctx.stroke()
        }
      }
      // Foam at the base.
      ctx.fillStyle = c.foam
      ctx.beginPath()
      ctx.ellipse(sp.x, sp.y, S * (13 + k * 12), S * (4.2 - k * 2), 0, 0, Math.PI * 2)
      ctx.fill()
    }
    // Droplets flying out and dropping back into the lake (and a few at her).
    const rng = createRng(`splash:${sp.seed}`)
    const g = 260
    for (let i = 0; i < 18; i++) {
      const toHer = sp.toward && i < 3
      let vx = rng.range(-70, 70) * S
      let vy = rng.range(55, 125) * S
      if (toHer && sp.toward) {
        const T = 0.74 + i * 0.03
        vx = (sp.toward.x - sp.x) / T
        vy = (sp.y - sp.toward.y + 0.5 * g * T * T) / T
      }
      const delay = rng.range(0, 0.08)
      const tt = tau - delay
      if (tt <= 0) continue
      const x = sp.x + vx * tt
      const y = sp.y - vy * tt + 0.5 * g * tt * tt
      const endT = toHer ? 0.74 + i * 0.03 : (2 * vy) / g
      if (tt > endT) continue
      const r = S * rng.range(1.0, 2.1)
      ctx.fillStyle = c.splash
      ctx.strokeStyle = c.splashInk
      ctx.lineWidth = lw * 0.8
      ctx.beginPath()
      ctx.ellipse(x, y, r * 0.85, r, Math.atan2(vy - g * tt, vx) + Math.PI / 2, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(x - r * 0.3, y - r * 0.35, r * 0.3, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  private bubbles(ctx: CanvasRenderingContext2D, x: number, y: number, from: number, to: number, t: number, s: number): void {
    if (t < from || t > to + 0.4) return
    const rng = createRng(`bubbles:${from.toFixed(2)}`)
    ctx.strokeStyle = this.c.splashInk
    ctx.lineWidth = Math.max(0.8 / s, 0.35)
    for (let i = 0; i < 6; i++) {
      const at = from + rng.range(0, to - from)
      const k = (t - at) / 0.42
      const bx = x + rng.range(-7, 7)
      const by = y + rng.range(-1, 2)
      if (k < 0 || k > 1.4) continue
      if (k <= 1) {
        const r = 0.6 + k * 2
        ctx.fillStyle = rgba(this.c.splash, 0.9)
        ctx.beginPath()
        ctx.arc(bx, by - r * 0.7, r, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
        ctx.fillStyle = '#ffffff'
        ctx.beginPath()
        ctx.arc(bx - r * 0.35, by - r * 1.05, r * 0.28, 0, Math.PI * 2)
        ctx.fill()
      } else {
        const q = (k - 1) / 0.4
        ctx.globalAlpha = 1 - q
        ctx.beginPath()
        ctx.ellipse(bx, by, 2 + q * 4, (2 + q * 4) * 0.3, 0, 0, Math.PI * 2)
        ctx.stroke()
        ctx.globalAlpha = 1
      }
    }
  }

  private drips(ctx: CanvasRenderingContext2D, her: HerFigure, wet: number): void {
    if (wet < 0 || wet > 2.2) return
    const sc = her.scale ?? 1
    const a = wet < 0.15 ? wet / 0.15 : wet > 1.6 ? 1 - (wet - 1.6) / 0.6 : 1
    ctx.save()
    ctx.translate(her.x, her.y)
    ctx.scale(sc * her.facing, sc)
    ctx.globalAlpha = clamp01(a)
    for (const [x, y, sp] of [
      [-5, -58, 1],
      [7, -54, 0.8],
      [1, -47, 1.2],
      [-9, -44, 0.9],
    ] as const) {
      const dy = Math.min(7, wet * 4 * sp)
      ctx.fillStyle = this.c.splash
      ctx.strokeStyle = this.c.splashInk
      ctx.lineWidth = 0.4
      ctx.beginPath()
      ctx.moveTo(x, y + dy - 1.8)
      ctx.quadraticCurveTo(x + 1.2, y + dy, x, y + dy + 0.9)
      ctx.quadraticCurveTo(x - 1.2, y + dy, x, y + dy - 1.8)
      ctx.fill()
      ctx.stroke()
    }
    ctx.restore()
    ctx.globalAlpha = 1
  }

  private sparkles(ctx: CanvasRenderingContext2D, at: Pt, amount: number, t: number, sc = 1): void {
    const colors = this.opts.night ? ['#fff6cf', '#d9e2ff', '#ffd6ec'] : ['#ffe08a', '#ffffff', '#ffc4d8']
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + t * 0.4
      const r = (26 + 8 * Math.sin(t * 1.3 + i)) * sc
      const x = at.x + Math.cos(a) * r * 1.25
      const y = at.y + Math.sin(a) * r * 0.75
      const tw = 0.5 + 0.5 * Math.sin(t * 5 + i * 2.3)
      ctx.globalAlpha = amount * (0.35 + 0.65 * tw)
      ctx.fillStyle = colors[i % colors.length]
      star4(ctx, x, y, (1.6 + 1.6 * tw) * sc)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  private fireflies(ctx: CanvasRenderingContext2D, t: number, s: number): void {
    if (!this.glow) return
    for (let i = 0; i < 9; i++) {
      const x = -150 + ((i * 53) % 260) + Math.sin(t * 0.5 + i) * 14
      const y = -70 - ((i * 31) % 50) + Math.sin(t * 0.7 + i * 2) * 8
      const a = 0.5 + 0.5 * Math.sin(t * 2 + i * 1.9)
      if (a < 0.1) continue
      const r = Math.max(2, 2.5 / s)
      ctx.globalAlpha = a * 0.8
      ctx.drawImage(this.glow, x - r * 2, y - r * 2, r * 4, r * 4)
      ctx.fillStyle = '#fbffcf'
      ctx.beginPath()
      ctx.arc(x, y, Math.max(0.7, 0.8 / s), 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  // -------------------------------------------------------------------------------------------
  // Characters

  private drawHer(ctx: CanvasRenderingContext2D, her: HerFigure, t: number): void {
    if (her.hidden) return
    const sc = her.scale ?? 1
    const draw = () =>
      drawClimber(ctx, { look: this.opts.look, pose: her.pose, expression: her.expression, facing: her.facing, t, goat: her.goat, gaze: her.gaze })
    ctx.save()
    ctx.translate(her.x, her.y)
    ctx.scale(sc, sc)
    if (her.waterY === undefined) {
      draw()
      ctx.restore()
      return
    }
    // In the lake: what's under the water shows faintly, the rest as usual.
    const wy = (her.waterY - her.y) / sc
    ctx.save()
    ctx.beginPath()
    ctx.rect(-80, wy + 0.4, 160, 120)
    ctx.clip()
    // Fainter the deeper she is (a dive), a hint of her when she's treading water.
    const deep = Math.max(0, Math.min(1, ((her.y - her.waterY) / sc - 30) / 30))
    ctx.globalAlpha = (this.opts.night ? 0.16 : 0.2) * (1 - deep)
    if (ctx.globalAlpha > 0.01) draw()
    ctx.restore()
    ctx.save()
    ctx.beginPath()
    ctx.rect(-80, wy - 160, 160, 160.4)
    ctx.clip()
    draw()
    ctx.restore()
    this.waterLip(ctx, 2, wy, 16)
    ctx.restore()
  }

  private drawGoatFig(ctx: CanvasRenderingContext2D, g: GoatFigure): void {
    ctx.save()
    ctx.translate(g.x, g.y)
    if (g.state.inBackpack) {
      // Swimming: its body faintly under the water, head and shoulders above it.
      ctx.fillStyle = rgba('#fbf6ec', this.opts.night ? 0.14 : 0.26)
      ctx.beginPath()
      ctx.ellipse(-1, 6, 10, 4.6, 0, 0, Math.PI * 2)
      ctx.fill()
      drawGoat(ctx, g.state)
      this.waterLip(ctx, 0, 0, 11.5)
      if (g.spout && g.spout > 0 && g.spout < 1) this.spout(ctx, g, g.spout)
      ctx.restore()
      return
    }
    if (g.clipBelow !== undefined) {
      ctx.beginPath()
      ctx.rect(-60, -120, 120, g.clipBelow - g.y + 120)
      ctx.clip()
    }
    const rot = g.rot ?? 0
    if (g.whoosh && g.vel) this.whooshLines(ctx, g.vel, g.whoosh)
    ctx.translate(0, -11)
    ctx.rotate(rot)
    ctx.translate(0, 11)
    ctx.scale(g.sx ?? 1, g.sy ?? 1)
    drawGoat(ctx, g.state)
    ctx.restore()
  }

  /** The near half of a ring of water round something floating: it sits IN the lake, not on it. */
  private waterLip(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number): void {
    const c = this.c
    ctx.fillStyle = this.opts.night ? 'rgba(52, 64, 126, 0.72)' : 'rgba(232, 180, 200, 0.72)'
    ctx.beginPath()
    ctx.ellipse(x, y + 0.5, rx, rx * 0.24, 0, 0, Math.PI)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = rgba(c.ripple, 0.95)
    ctx.lineWidth = 0.7
    ctx.beginPath()
    ctx.ellipse(x, y + 0.5, rx, rx * 0.24, 0, 0.15, Math.PI - 0.15)
    ctx.stroke()
  }

  /** Comic speed lines behind something flying (in its local frame, before rotation). */
  private whooshLines(ctx: CanvasRenderingContext2D, vel: Pt, amount: number): void {
    const len = Math.hypot(vel.x, vel.y) || 1
    const ux = vel.x / len
    const uy = vel.y / len
    ctx.strokeStyle = rgba('#ffffff', 0.75 * amount)
    ctx.lineCap = 'round'
    ctx.lineWidth = 1.1
    for (let i = -1; i <= 1; i++) {
      const back = 16 + Math.abs(i) * 4
      const ox = -ux * back - uy * i * 6
      const oy = -11 - uy * back + ux * i * 6
      ctx.beginPath()
      ctx.moveTo(ox, oy)
      ctx.lineTo(ox - ux * (9 - Math.abs(i) * 2), oy - uy * (9 - Math.abs(i) * 2))
      ctx.stroke()
    }
  }

  /** A little arc of lake water from the goat's mouth. */
  private spout(ctx: CanvasRenderingContext2D, g: GoatFigure, k: number): void {
    const head = goatHeadAnchor({ inBackpack: true, mood: g.state.mood, facing: g.state.facing })
    const dir = g.state.facing === -1 ? -1 : 1
    const mx = head.x + dir * 3
    const my = head.y + 3.5
    ctx.fillStyle = this.c.splash
    ctx.strokeStyle = this.c.splashInk
    ctx.lineWidth = 0.4
    for (let i = 0; i < 8; i++) {
      const u = k * 1.4 - i * 0.07
      if (u <= 0 || u > 1) continue
      const x = mx + dir * u * 20
      const y = my - Math.sin(u * Math.PI) * 17 + u * 6
      const r = 1.8 - i * 0.14
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
  }
}

// ---------------------------------------------------------------------------------------------
// The goat's own moves (used by the finale's timeline; reusable for any scene with water)

/**
 * The goat's wobbly leap: an arc from `from` (standing) to `to` (the water), legs going everywhere.
 * The first half is gritted-teeth wobbly, the second half pure wheee; the body wobbles about its
 * middle and tips nose-down for a belly flop; a stretch at take-off and speed lines in flight.
 * `k` 0..1 through the flight, `apex` = how high above the straight line it goes (scene units).
 */
export function goatWobblyLeap(k: number, from: Pt, to: Pt, t: number, apex = 42): GoatFigure {
  const q = clamp01(k)
  const x = from.x + (to.x - from.x) * q
  const y = from.y + (to.y - from.y) * q - 4 * apex * q * (1 - q)
  const rot = Math.sin(q * Math.PI * 3.4) * 0.34 * (1 - q * 0.6) + q * q * 0.5
  const st = q < 0.18 ? 1 + 0.22 * (1 - q / 0.18) : 1
  const wobbly = q < 0.45
  return {
    x,
    y,
    state: { mood: wobbly ? 'wobbly' : 'wheee', t, inBackpack: false, facing: to.x >= from.x ? 1 : -1, earFlap: 1, lookY: wobbly ? 0.5 : 0.6 },
    rot,
    sx: 1 / Math.sqrt(st),
    sy: st,
    whoosh: Math.sin(Math.PI * q),
    vel: { x: to.x - from.x, y: to.y - from.y - 4 * apex * (1 - 2 * q) },
  }
}

/** The flop itself: squashed flat, going under at `at` (k 0..1 over a moment). Hidden below the water. */
export function goatFlopIn(k: number, at: Pt, t: number, facing: 1 | -1 = 1): GoatFigure {
  const q = clamp01(k)
  return {
    x: at.x + 2 * facing,
    y: at.y + 13 * q,
    state: { mood: 'wheee', t, inBackpack: false, facing, earFlap: 1 },
    rot: 0.5 * facing,
    sx: 1.25,
    sy: 0.78,
    clipBelow: at.y,
  }
}

/**
 * Popping back up out of the lake, laughing: rises with a little overshoot (k 0..1), then bobs.
 * `spout` 0..1 = a fountain of lake water from its mouth.
 */
export function goatPopUp(k: number, at: Pt, t: number, mood: GoatState['mood'], facing: 1 | -1, spout = 0): GoatFigure {
  const q = clamp01(k) - 1
  const back = 1 + 3.4 * q * q * q + 2.4 * q * q
  return {
    x: at.x,
    y: at.y + Math.sin(t * 2.6) * 0.5,
    state: { mood, t, inBackpack: true, facing, sink: 11 * (1 - back), lookX: 0.6, lookY: -0.7, earFlap: k < 1 ? 0.4 : 0 },
    spout,
  }
}

/** Where the goat's rim is in her backpack (scene units), for climbing out: feet + pose → point. */
export function packRim(her: HerFigure): Pt {
  const sc = her.scale ?? 1
  const a = climberGoatAnchor(her.pose, her.facing)
  return { x: her.x + (a.x + 2.5 * her.facing) * sc, y: her.y + (a.y + 7.8) * sc }
}
