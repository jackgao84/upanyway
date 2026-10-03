/**
 * The Trail Map picture: her whole mountain as a cozy illustrated map, painted once per size and
 * per day/night (the screen keeps the bitmap). Paper-cut ranges behind, the mountain in five zone
 * bands plus the snowy summit, Sky Lake shining in its bowl at the top, a winding dotted trail
 * from camp at the foot, and soft fog over the part of the trail still hidden. The pitch markers,
 * labels and her climber marker are DOM on top (screens/map.ts).
 *
 * Units: CSS px with the origin top-left (the caller sets the DPR transform). Map positions come
 * in as normalised points (trail.ts) and are scaled by the frame's width and height.
 */
import { mix, rgba } from '../../game/art/rig'
import type { ZoneId } from '../../game/types'
import { createRng, type Rng } from '../../model/rng'
import { CAMP_PT, LAKE_PT, trailPoints, type MapPt } from './trail'

export interface MapPaintOpts {
  night: boolean
  /** The 16 pitch marker positions. */
  points: readonly MapPt[]
  /** Zone band boundaries (5 values, bottom → top). */
  bounds: readonly number[]
  /** The fog's lower edge (v), or null when nothing is hidden. */
  fogFrom: number | null
}

interface ZoneLook {
  base: string
  dark: string
  light: string
  detail: string
}

const DAY: Record<ZoneId, ZoneLook> = {
  meadow: { base: '#a3d389', dark: '#86bd6c', light: '#c4e6a6', detail: '#ffffff' },
  hollow: { base: '#6aa58a', dark: '#4f8a72', light: '#86bea0', detail: '#ffe27a' },
  crumble: { base: '#e6b083', dark: '#cf8f62', light: '#f3c99f', detail: '#b8744d' },
  ridge: { base: '#a8bfd8', dark: '#7f9cbd', light: '#c9d8e8', detail: '#5e7f9e' },
  cloud: { base: '#cbc4e8', dark: '#ab9fd6', light: '#e3def4', detail: '#ffffff' },
  summit: { base: '#f3f5fb', dark: '#d6dff0', light: '#ffffff', detail: '#b9c9e2' },
}

const NIGHT_INK = '#1c2152'

function zoneLook(zone: ZoneId, night: boolean): ZoneLook {
  const z = DAY[zone]
  if (!night) return z
  const k = zone === 'summit' ? 0.42 : 0.55
  return {
    base: mix(z.base, NIGHT_INK, k),
    dark: mix(z.dark, NIGHT_INK, k + 0.06),
    light: mix(z.light, NIGHT_INK, k - 0.08),
    detail: zone === 'hollow' ? '#fff0a0' : mix(z.detail, NIGHT_INK, k - 0.1),
  }
}

const ZONE_ORDER: ZoneId[] = ['meadow', 'hollow', 'crumble', 'ridge', 'cloud', 'summit']

// The mountain's outline, normalised: right side top → bottom; the left is drawn from its own list.
const RIGHT: readonly [number, number][] = [
  [0.648, 0.05],
  [0.668, 0.084],
  [0.7, 0.128],
  [0.728, 0.172],
  [0.762, 0.226],
  [0.796, 0.29],
  [0.826, 0.338],
  [0.86, 0.402],
  [0.9, 0.478],
  [0.932, 0.55],
  [0.962, 0.622],
  [1.0, 0.7],
  [1.05, 0.8],
  [1.1, 0.9],
  [1.12, 1.02],
]
const LEFT: readonly [number, number][] = [
  [0.352, 0.056],
  [0.33, 0.092],
  [0.302, 0.132],
  [0.272, 0.182],
  [0.238, 0.242],
  [0.2, 0.302],
  [0.168, 0.362],
  [0.138, 0.424],
  [0.1, 0.502],
  [0.068, 0.58],
  [0.03, 0.662],
  [-0.02, 0.742],
  [-0.08, 0.852],
  [-0.12, 1.02],
]

/** A smooth closed-ish path through points (quadratic curves through the midpoints). */
function smoothThrough(path: Path2D, pts: readonly [number, number][], start: boolean): void {
  if (start) path.moveTo(pts[0][0], pts[0][1])
  else path.lineTo(pts[0][0], pts[0][1])
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i]
    const [nx, ny] = pts[i + 1]
    path.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2)
  }
  const last = pts[pts.length - 1]
  path.lineTo(last[0], last[1])
}

/** The outline lists were drawn for a lake at v 0.088: shift them down to where the lake is now. */
const OUTLINE_TOP = LAKE_PT.v - 0.088
const ov = (v: number): number => OUTLINE_TOP + v * (1 - OUTLINE_TOP)

function mountainPath(W: number, H: number): Path2D {
  const sx = (p: readonly [number, number]): [number, number] => [p[0] * W, ov(p[1]) * H]
  const right = RIGHT.map(sx)
  const left = LEFT.map(sx).reverse()
  const p = new Path2D()
  smoothThrough(p, left, true)
  // The summit bowl: the left horn, a dip where Sky Lake sits, the right horn.
  const lx = LEFT[0][0] * W
  const ly = ov(LEFT[0][1]) * H
  const rx = RIGHT[0][0] * W
  const ry = ov(RIGHT[0][1]) * H
  p.quadraticCurveTo(lx + W * 0.02, ly - H * 0.012, lx + W * 0.045, ly + H * 0.016)
  p.quadraticCurveTo(W * 0.5, LAKE_PT.v * H - H * 0.006, rx - W * 0.045, ry + H * 0.018)
  p.quadraticCurveTo(rx - W * 0.018, ry - H * 0.014, rx, ry)
  smoothThrough(p, right, false)
  p.closePath()
  return p
}

/** A wavy horizontal line at v across the width (zone band edges). */
function wavyY(W: number, H: number, v: number, seed: number): (x: number) => number {
  const amp = Math.min(9, H * 0.008)
  return (x: number) => v * H + Math.sin(x / (W * 0.11) + seed) * amp + Math.sin(x / (W * 0.037) + seed * 2.3) * amp * 0.35
}

function bandPath(W: number, H: number, top: number | null, bottom: number | null, seed: number): Path2D {
  const p = new Path2D()
  const step = Math.max(6, W / 60)
  const topY = top === null ? () => -10 : wavyY(W, H, top, seed)
  const botY = bottom === null ? () => H + 10 : wavyY(W, H, bottom, seed + 1.7)
  p.moveTo(-10, topY(-10))
  for (let x = -10; x <= W + 10; x += step) p.lineTo(x, topY(x))
  p.lineTo(W + 10, botY(W + 10))
  for (let x = W + 10; x >= -10; x -= step) p.lineTo(x, botY(x))
  p.closePath()
  return p
}

// ---------------------------------------------------------------------------------------------

function paintSky(g: CanvasRenderingContext2D, W: number, H: number, night: boolean, rng: Rng): void {
  const sky = g.createLinearGradient(0, 0, 0, H)
  if (night) {
    sky.addColorStop(0, '#141943')
    sky.addColorStop(0.45, '#262c66')
    sky.addColorStop(1, '#4a4886')
  } else {
    sky.addColorStop(0, '#97cdee')
    sky.addColorStop(0.45, '#cfe7f3')
    sky.addColorStop(1, '#ffe4c8')
  }
  g.fillStyle = sky
  g.fillRect(0, 0, W, H)

  if (night) {
    // Stars, a few bigger twinkly ones, and the moon.
    for (let i = 0; i < 90; i++) {
      const x = rng.next() * W
      const y = rng.next() * H * 0.75
      const r = rng.next() < 0.12 ? 1.6 : 0.6 + rng.next() * 0.7
      g.fillStyle = `rgba(255, 250, 225, ${0.45 + rng.next() * 0.5})`
      g.beginPath()
      g.arc(x, y, r, 0, Math.PI * 2)
      g.fill()
    }
    const mx = W * 0.84
    const my = H * 0.065
    const mr = Math.max(14, Math.min(26, W * 0.04))
    const glow = g.createRadialGradient(mx, my, mr * 0.6, mx, my, mr * 3.2)
    glow.addColorStop(0, 'rgba(255, 246, 210, 0.35)')
    glow.addColorStop(1, 'rgba(255, 246, 210, 0)')
    g.fillStyle = glow
    g.fillRect(mx - mr * 3.2, my - mr * 3.2, mr * 6.4, mr * 6.4)
    g.fillStyle = '#fff6d6'
    g.beginPath()
    g.arc(mx, my, mr, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = 'rgba(214, 200, 160, 0.45)'
    for (const [dx, dy, r] of [
      [-0.3, -0.2, 0.22],
      [0.25, 0.15, 0.16],
      [-0.05, 0.4, 0.12],
    ]) {
      g.beginPath()
      g.arc(mx + dx * mr, my + dy * mr, r * mr, 0, Math.PI * 2)
      g.fill()
    }
  } else {
    // The sun, low and warm, and a few soft clouds.
    const sx = W * 0.14
    const sy = H * 0.075
    const sr = Math.max(14, Math.min(26, W * 0.04))
    const glow = g.createRadialGradient(sx, sy, sr * 0.5, sx, sy, sr * 3.4)
    glow.addColorStop(0, 'rgba(255, 228, 150, 0.6)')
    glow.addColorStop(1, 'rgba(255, 228, 150, 0)')
    g.fillStyle = glow
    g.fillRect(sx - sr * 3.4, sy - sr * 3.4, sr * 6.8, sr * 6.8)
    g.fillStyle = '#ffd56b'
    g.beginPath()
    g.arc(sx, sy, sr, 0, Math.PI * 2)
    g.fill()
    const cloud = (x: number, y: number, s: number) => {
      g.fillStyle = 'rgba(255, 255, 255, 0.85)'
      g.beginPath()
      g.ellipse(x, y, 26 * s, 9 * s, 0, 0, Math.PI * 2)
      g.ellipse(x - 12 * s, y - 6 * s, 12 * s, 9 * s, 0, 0, Math.PI * 2)
      g.ellipse(x + 9 * s, y - 8 * s, 14 * s, 11 * s, 0, 0, Math.PI * 2)
      g.fill()
    }
    const s = Math.max(0.8, Math.min(1.5, W / 500))
    cloud(W * 0.86, H * 0.12, s)
    cloud(W * 0.1, H * 0.26, s * 0.8)
    cloud(W * 0.9, H * 0.36, s * 0.7)
  }
}

/** Two paper-cut ranges behind her mountain. */
function paintRanges(g: CanvasRenderingContext2D, W: number, H: number, night: boolean): void {
  const ranges: { color: string; peaks: [number, number][] }[] = [
    {
      color: night ? '#383d7a' : '#dcd4ee',
      peaks: [
        [-0.05, 0.5],
        [0.08, 0.36],
        [0.22, 0.5],
        [0.78, 0.48],
        [0.92, 0.33],
        [1.05, 0.46],
      ],
    },
    {
      color: night ? '#2f3470' : '#c9d7ec',
      peaks: [
        [-0.05, 0.62],
        [0.06, 0.5],
        [0.18, 0.62],
        [0.82, 0.6],
        [0.95, 0.47],
        [1.05, 0.58],
      ],
    },
  ]
  for (const r of ranges) {
    g.fillStyle = r.color
    g.beginPath()
    g.moveTo(-10, H)
    for (const [u, v] of r.peaks) g.lineTo(u * W, v * H)
    g.lineTo(W + 10, H)
    g.closePath()
    g.fill()
  }
}

function paintMeadow(g: CanvasRenderingContext2D, W: number, H: number, z: ZoneLook, top: number, rng: Rng): void {
  for (let i = 0; i < 70; i++) {
    const x = rng.next() * W
    const y = (top + 0.02 + rng.next() * (1 - top)) * H
    const c = rng.pick(['#ffffff', '#ffd3df', '#ffe680', '#ffffff'])
    g.fillStyle = c
    g.beginPath()
    g.arc(x, y, 1.4 + rng.next() * 1.2, 0, Math.PI * 2)
    g.fill()
  }
  for (let i = 0; i < 8; i++) {
    const x = rng.next() * W
    const y = (top + 0.03 + rng.next() * (0.98 - top)) * H
    const r = 6 + rng.next() * 6
    g.fillStyle = z.dark
    g.beginPath()
    g.arc(x, y, r, Math.PI, 0)
    g.arc(x + r * 0.9, y, r * 0.75, Math.PI, 0)
    g.closePath()
    g.fill()
  }
}

function paintHollow(g: CanvasRenderingContext2D, W: number, H: number, z: ZoneLook, top: number, bottom: number, rng: Rng, night: boolean): void {
  // Rows of round tree crowns.
  const rows = 3
  for (let r = 0; r < rows; r++) {
    const y0 = (top + ((bottom - top) * (r + 0.6)) / rows) * H
    for (let x = -10; x < W + 10; x += 16 + rng.next() * 18) {
      if (rng.next() < 0.35) continue
      const rad = 8 + rng.next() * 7
      g.fillStyle = rng.next() < 0.5 ? z.dark : z.light
      g.beginPath()
      g.arc(x, y0 + (rng.next() - 0.5) * 10, rad, 0, Math.PI * 2)
      g.fill()
    }
  }
  // Fireflies.
  for (let i = 0; i < 26; i++) {
    const x = rng.next() * W
    const y = (top + rng.next() * (bottom - top)) * H
    if (night) {
      const glow = g.createRadialGradient(x, y, 0, x, y, 7)
      glow.addColorStop(0, 'rgba(255, 236, 140, 0.75)')
      glow.addColorStop(1, 'rgba(255, 236, 140, 0)')
      g.fillStyle = glow
      g.fillRect(x - 7, y - 7, 14, 14)
    }
    g.fillStyle = night ? '#fff6b8' : rgba(z.detail, 0.9)
    g.beginPath()
    g.arc(x, y, 1.5, 0, Math.PI * 2)
    g.fill()
  }
}

function paintCrumble(g: CanvasRenderingContext2D, W: number, H: number, z: ZoneLook, top: number, bottom: number, rng: Rng): void {
  g.strokeStyle = rgba(z.dark, 0.9)
  g.lineWidth = 2
  g.lineCap = 'round'
  for (let k = 1; k <= 3; k++) {
    const v = top + ((bottom - top) * k) / 4
    g.beginPath()
    for (let x = -10; x <= W + 10; x += 10) {
      const y = v * H + Math.sin(x / 40 + k * 2) * 3
      if (x === -10) g.moveTo(x, y)
      else g.lineTo(x, y)
    }
    g.stroke()
  }
  // Boulders and little cracks.
  for (let i = 0; i < 12; i++) {
    const x = rng.next() * W
    const y = (top + 0.15 * (bottom - top) + rng.next() * 0.75 * (bottom - top)) * H
    const r = 4 + rng.next() * 6
    g.fillStyle = z.dark
    g.beginPath()
    g.ellipse(x, y, r * 1.3, r, 0, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = rgba(z.light, 0.8)
    g.beginPath()
    g.ellipse(x - r * 0.4, y - r * 0.35, r * 0.5, r * 0.3, 0, 0, Math.PI * 2)
    g.fill()
  }
  g.strokeStyle = rgba(z.detail, 0.7)
  g.lineWidth = 1.4
  for (let i = 0; i < 8; i++) {
    const x = rng.next() * W
    const y = (top + rng.next() * (bottom - top)) * H
    g.beginPath()
    g.moveTo(x, y)
    g.lineTo(x + 4, y + 5)
    g.lineTo(x + 1, y + 9)
    g.lineTo(x + 6, y + 14)
    g.stroke()
  }
}

function paintRidge(g: CanvasRenderingContext2D, W: number, H: number, z: ZoneLook, top: number, bottom: number, rng: Rng, night: boolean): void {
  // Little pines.
  for (let i = 0; i < 20; i++) {
    const x = rng.next() * W
    const y = (top + 0.25 * (bottom - top) + rng.next() * 0.7 * (bottom - top)) * H
    const s = 5 + rng.next() * 4
    g.fillStyle = z.detail
    g.beginPath()
    g.moveTo(x, y - s * 2.2)
    g.lineTo(x + s, y)
    g.lineTo(x - s, y)
    g.closePath()
    g.fill()
    g.beginPath()
    g.moveTo(x, y - s * 3)
    g.lineTo(x + s * 0.75, y - s * 1.2)
    g.lineTo(x - s * 0.75, y - s * 1.2)
    g.closePath()
    g.fill()
  }
  // Wind swirls.
  g.strokeStyle = night ? 'rgba(220, 225, 255, 0.45)' : 'rgba(255, 255, 255, 0.85)'
  g.lineWidth = 2
  g.lineCap = 'round'
  for (let i = 0; i < 6; i++) {
    const x = rng.next() * W
    const y = (top + 0.1 * (bottom - top) + rng.next() * 0.6 * (bottom - top)) * H
    const len = 26 + rng.next() * 22
    g.beginPath()
    g.moveTo(x - len, y)
    g.quadraticCurveTo(x - len * 0.4, y - 5, x, y)
    g.arc(x, y - 5, 5, Math.PI / 2, -Math.PI * 0.9, true)
    g.stroke()
  }
}

function paintCloud(g: CanvasRenderingContext2D, W: number, H: number, top: number, bottom: number, rng: Rng, night: boolean): void {
  const puff = night ? 'rgba(190, 196, 240, 0.55)' : 'rgba(255, 255, 255, 0.92)'
  g.fillStyle = puff
  for (let row = 0; row < 2; row++) {
    const v = top + (bottom - top) * (0.35 + row * 0.38)
    for (let x = -20; x < W + 20; x += 22 + rng.next() * 16) {
      if (rng.next() < 0.3) continue
      const r = 9 + rng.next() * 9
      g.beginPath()
      g.arc(x, v * H + (rng.next() - 0.5) * 8, r, 0, Math.PI * 2)
      g.fill()
    }
  }
}

function paintSummit(g: CanvasRenderingContext2D, W: number, H: number, z: ZoneLook, bottom: number): void {
  // Soft blue shading strokes on the snow.
  g.strokeStyle = rgba(z.detail, 0.55)
  g.lineWidth = 2
  g.lineCap = 'round'
  for (let k = 0; k < 5; k++) {
    const x = W * (0.38 + k * 0.06)
    const y = H * (bottom - 0.02 - (k % 2) * 0.018)
    g.beginPath()
    g.moveTo(x, y)
    g.quadraticCurveTo(x + 10, y - 8, x + 4, y - 18)
    g.stroke()
  }
}

/** Sky Lake in its bowl at the top, shining. */
function paintLake(g: CanvasRenderingContext2D, W: number, H: number, night: boolean): void {
  const cx = LAKE_PT.u * W
  const cy = LAKE_PT.v * H
  const rx = W * 0.105
  const ry = Math.max(7, H * 0.016)
  const glowR = rx * 1.9
  const glow = g.createRadialGradient(cx, cy, rx * 0.3, cx, cy, glowR)
  glow.addColorStop(0, night ? 'rgba(170, 230, 255, 0.45)' : 'rgba(170, 240, 255, 0.7)')
  glow.addColorStop(1, 'rgba(170, 240, 255, 0)')
  g.fillStyle = glow
  g.fillRect(cx - glowR, cy - glowR, glowR * 2, glowR * 2)
  // Snowy rim, then the water.
  g.fillStyle = night ? '#c9d0ee' : '#ffffff'
  g.beginPath()
  g.ellipse(cx, cy + 1.5, rx + 5, ry + 4, 0, 0, Math.PI * 2)
  g.fill()
  const water = g.createLinearGradient(0, cy - ry, 0, cy + ry)
  water.addColorStop(0, night ? '#3d86a8' : '#7fd8e8')
  water.addColorStop(1, night ? '#24607f' : '#3aa7c2')
  g.fillStyle = water
  g.beginPath()
  g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2)
  g.fill()
  // Shine.
  g.strokeStyle = night ? 'rgba(255, 246, 214, 0.75)' : 'rgba(255, 255, 255, 0.9)'
  g.lineWidth = 2
  g.lineCap = 'round'
  g.beginPath()
  g.moveTo(cx - rx * 0.55, cy - ry * 0.25)
  g.lineTo(cx - rx * 0.15, cy - ry * 0.25)
  g.moveTo(cx + rx * 0.1, cy + ry * 0.2)
  g.lineTo(cx + rx * 0.4, cy + ry * 0.2)
  g.stroke()
  if (night) {
    g.fillStyle = 'rgba(255, 246, 214, 0.6)'
    g.beginPath()
    g.ellipse(cx + rx * 0.45, cy - ry * 0.05, rx * 0.14, ry * 0.3, 0, 0, Math.PI * 2)
    g.fill()
  }
}

/** Catmull-Rom through the points (px), as a path. */
function splinePath(pts: readonly { x: number; y: number }[]): Path2D {
  const p = new Path2D()
  p.moveTo(pts[0].x, pts[0].y)
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[Math.min(pts.length - 1, i + 2)]
    const k = 1 / 6
    p.bezierCurveTo(p1.x + (p2.x - p0.x) * k, p1.y + (p2.y - p0.y) * k, p2.x - (p3.x - p1.x) * k, p2.y - (p3.y - p1.y) * k, p2.x, p2.y)
  }
  return p
}

function paintTrail(g: CanvasRenderingContext2D, W: number, H: number, points: readonly MapPt[], night: boolean): void {
  const pts = trailPoints(points).map((q) => ({ x: q.u * W, y: q.v * H }))
  const path = splinePath(pts)
  g.lineCap = 'round'
  g.lineJoin = 'round'
  g.strokeStyle = night ? 'rgba(10, 12, 40, 0.3)' : 'rgba(110, 72, 44, 0.16)'
  g.lineWidth = 11
  g.stroke(path)
  g.strokeStyle = night ? 'rgba(214, 214, 255, 0.55)' : 'rgba(255, 247, 228, 0.95)'
  g.lineWidth = 6.5
  g.stroke(path)
  g.setLineDash([1, 8])
  g.strokeStyle = night ? '#ffe9a6' : '#b98258'
  g.lineWidth = 3
  g.stroke(path)
  g.setLineDash([])
}

/** Her camp at the foot of the trail: a tiny tent and a fire. */
function paintCamp(g: CanvasRenderingContext2D, W: number, H: number, night: boolean): void {
  const x = CAMP_PT.u * W
  const y = CAMP_PT.v * H + 10
  const s = Math.max(0.9, Math.min(1.4, W / 520))
  const fx = x + 22 * s
  const glow = g.createRadialGradient(fx, y - 4 * s, 1, fx, y - 4 * s, 26 * s)
  glow.addColorStop(0, night ? 'rgba(255, 196, 110, 0.6)' : 'rgba(255, 196, 110, 0.4)')
  glow.addColorStop(1, 'rgba(255, 196, 110, 0)')
  g.fillStyle = glow
  g.fillRect(fx - 26 * s, y - 30 * s, 52 * s, 52 * s)
  g.fillStyle = '#f08c70'
  g.beginPath()
  g.moveTo(x - 20 * s, y)
  g.quadraticCurveTo(x - 6 * s, y - 12 * s, x - 2 * s, y - 24 * s)
  g.quadraticCurveTo(x + 2 * s, y - 12 * s, x + 14 * s, y)
  g.closePath()
  g.fill()
  g.fillStyle = '#5e3a2e'
  g.beginPath()
  g.moveTo(x - 7 * s, y)
  g.quadraticCurveTo(x - 3 * s, y - 7 * s, x - 2 * s, y - 12 * s)
  g.quadraticCurveTo(x - 1 * s, y - 7 * s, x + 3 * s, y)
  g.closePath()
  g.fill()
  g.fillStyle = '#f5b83d'
  g.beginPath()
  g.moveTo(fx - 5 * s, y)
  g.quadraticCurveTo(fx - 5 * s, y - 6 * s, fx, y - 12 * s)
  g.quadraticCurveTo(fx + 5 * s, y - 6 * s, fx + 5 * s, y)
  g.closePath()
  g.fill()
  g.fillStyle = '#fff2c4'
  g.beginPath()
  g.ellipse(fx, y - 3 * s, 2.2 * s, 3.6 * s, 0, 0, Math.PI * 2)
  g.fill()
}

/**
 * Soft fog over the hidden part of the trail: from `from` (its puffy lower edge) up to just below
 * Sky Lake, which always shines above it.
 */
function paintFog(g: CanvasRenderingContext2D, W: number, H: number, from: number, rng: Rng): void {
  const bottom = from * H
  const top = (LAKE_PT.v + 0.045) * H
  if (bottom <= top) return
  // The body of the fog bank.
  const body = g.createLinearGradient(0, top - 24, 0, bottom)
  body.addColorStop(0, 'rgba(255, 255, 255, 0)')
  body.addColorStop(0.12, 'rgba(250, 250, 255, 0.82)')
  body.addColorStop(1, 'rgba(248, 248, 255, 0.9)')
  g.fillStyle = body
  g.fillRect(0, top - 24, W, bottom - top + 24)
  // Puffy edges: a row along the bottom and a softer row along the top.
  for (let x = -20; x < W + 30; x += 18 + rng.next() * 12) {
    const r = 16 + rng.next() * 14
    g.fillStyle = 'rgba(250, 250, 255, 0.92)'
    g.beginPath()
    g.arc(x, bottom - r * 0.35 + rng.next() * 6, r, 0, Math.PI * 2)
    g.fill()
  }
  for (let i = 0; i < 18; i++) {
    const x = rng.next() * W
    const y = top + rng.next() * (bottom - top)
    const r = 18 + rng.next() * 26
    g.fillStyle = 'rgba(255, 255, 255, 0.35)'
    g.beginPath()
    g.ellipse(x, y, r * 1.6, r, 0, 0, Math.PI * 2)
    g.fill()
  }
}

/** Paint the whole map into `g` (CSS px; the caller has set the DPR transform and cleared). */
export function paintMap(g: CanvasRenderingContext2D, W: number, H: number, o: MapPaintOpts): void {
  const rng = createRng(`upanyway:map:${Math.round(W)}x${Math.round(H)}`)
  paintSky(g, W, H, o.night, rng)
  paintRanges(g, W, H, o.night)

  const mountain = mountainPath(W, H)
  g.save()
  g.clip(mountain)
  // Zone bands: bounds are bottom → top; the meadow runs to the foot, the summit to the top.
  for (let z = 0; z < ZONE_ORDER.length; z++) {
    const zone = ZONE_ORDER[z]
    const look = zoneLook(zone, o.night)
    const bottom = z === 0 ? null : o.bounds[z - 1]
    const top = z === ZONE_ORDER.length - 1 ? null : o.bounds[z]
    g.fillStyle = look.base
    g.fill(bandPath(W, H, top, bottom, z * 1.3))
    const tv = top ?? 0
    const bv = bottom ?? 1
    g.save()
    g.clip(bandPath(W, H, top, bottom, z * 1.3))
    if (zone === 'meadow') paintMeadow(g, W, H, look, tv, rng)
    else if (zone === 'hollow') paintHollow(g, W, H, look, tv, bv, rng, o.night)
    else if (zone === 'crumble') paintCrumble(g, W, H, look, tv, bv, rng)
    else if (zone === 'ridge') paintRidge(g, W, H, look, tv, bv, rng, o.night)
    else if (zone === 'cloud') paintCloud(g, W, H, tv, bv, rng, o.night)
    else paintSummit(g, W, H, look, bv)
    g.restore()
  }
  // Light from the left: the right flank in soft shade.
  const shadeGrad = g.createLinearGradient(W * 0.45, 0, W, 0)
  shadeGrad.addColorStop(0, 'rgba(40, 30, 70, 0)')
  shadeGrad.addColorStop(1, o.night ? 'rgba(10, 10, 40, 0.22)' : 'rgba(60, 40, 90, 0.12)')
  g.fillStyle = shadeGrad
  g.fillRect(W * 0.45, 0, W * 0.6, H)
  g.restore()

  // The paper-cut edge.
  g.strokeStyle = o.night ? 'rgba(200, 205, 255, 0.35)' : 'rgba(255, 255, 255, 0.75)'
  g.lineWidth = 3
  g.stroke(mountain)

  // The foot of the mountain: a meadow hill right across the bottom, where camp is.
  const foot = zoneLook('meadow', o.night)
  g.fillStyle = foot.base
  g.beginPath()
  g.moveTo(-10, H + 10)
  g.lineTo(-10, H * 0.93)
  g.quadraticCurveTo(W * 0.25, H * 0.905, W * 0.5, H * 0.925)
  g.quadraticCurveTo(W * 0.78, H * 0.945, W + 10, H * 0.915)
  g.lineTo(W + 10, H + 10)
  g.closePath()
  g.fill()
  g.fillStyle = foot.dark
  g.beginPath()
  g.moveTo(-10, H + 10)
  g.lineTo(-10, H * 0.975)
  g.quadraticCurveTo(W * 0.5, H * 0.955, W + 10, H * 0.98)
  g.lineTo(W + 10, H + 10)
  g.closePath()
  g.fill()

  paintTrail(g, W, H, o.points, o.night)
  paintCamp(g, W, H, o.night)
  if (o.fogFrom !== null && !o.night) paintFog(g, W, H, o.fogFrom, rng)
  paintLake(g, W, H, o.night)
}
