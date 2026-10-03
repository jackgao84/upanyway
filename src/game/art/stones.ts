/**
 * Cairn stones: rounded, hand-drawn pebbles with soft shading.
 *
 * Everything about a stone's look — outline, size, colour, pattern, its natural lean — is seeded
 * from its id ONLY (Decision 23). Never from the forecast, the "really", the outcome or the kind of
 * brave thing: a stone is a stone. A letter's bonus stone is the same kind and size of pebble with
 * one small painted heart on it.
 *
 * Units: "stone units", centre at (0, 0), y down. A stone is about 46–62 wide and 27–36 tall.
 * Line widths follow the canvas transform, so the same drawing works for a 30 px stone in the
 * cairn and a big one on a story card.
 */
import { createRng } from '../../model/rng'
import { ink, mix, pixelScale, rgba } from './rig'

export type StoneMark = 'letter' | null

export type StonePattern = 'plain' | 'speckled' | 'banded' | 'freckled' | 'ringed'

export interface StonePt {
  x: number
  y: number
}

export interface StoneLook {
  id: string
  /** Full width and height in stone units. */
  w: number
  h: number
  /** Outline control points around the centre (y down, clockwise from the right); a smooth closed curve. */
  pts: StonePt[]
  base: string
  light: string
  shade: string
  ink: string
  pattern: StonePattern
  /** Speckles / freckles (pattern detail), stone units. */
  dots: { x: number; y: number; r: number; light: boolean }[]
  /** A quartz-like vein across the stone ('banded'). */
  band: { y: number; tilt: number; width: number; wave: number } | null
  /** A slight natural lean (radians), used by the cairn when it settles. */
  lean: number
}

/** Size range (stone units): every stone, brave or letter, comes from the same range. */
export const STONE_SIZE = { minW: 46, maxW: 62, minH: 27, maxH: 36 } as const

/** Pebble colours: warm, soft, natural. */
const PEBBLES: readonly string[] = [
  '#e3c9a4', // sandstone
  '#aebdd0', // slate blue
  '#b9c8a6', // sage
  '#dfb5a8', // rose granite
  '#ece0c6', // cream
  '#c3b6d6', // lavender
  '#e0bd7f', // ochre
  '#c2bab0', // river grey
  '#d9a084', // terracotta
  '#a9cfc6', // seafoam
  '#cdb197', // driftwood
  '#e6bcc2', // dusty pink
]

const HEART = '#e8735a'

const looks = new Map<string, StoneLook>()

/** The look of the stone with this id (cached). */
export function stoneLook(id: string): StoneLook {
  const hit = looks.get(id)
  if (hit) return hit
  const r = createRng(`upanyway:stone:${id}`)
  const w = r.range(STONE_SIZE.minW, STONE_SIZE.maxW)
  // Flattish pebbles stack well: 1.45–1.95 times as wide as tall, inside the height range.
  const h = Math.max(STONE_SIZE.minH, Math.min(STONE_SIZE.maxH, w / r.range(1.45, 1.95)))
  const n = 9
  const phase = r.range(0, (Math.PI * 2) / n)
  const pts: StonePt[] = []
  for (let k = 0; k < n; k++) {
    const a = phase + (k * Math.PI * 2) / n + r.range(-0.12, 0.12)
    const wob = 1 + r.range(-0.07, 0.07)
    let x = Math.cos(a) * (w / 2) * wob
    let y = Math.sin(a) * (h / 2) * wob
    // Pebbles sit flat: squash the underside a little, and round the top.
    if (y > 0) y *= 0.86 + 0.1 * (1 - Math.abs(Math.cos(a)))
    else x *= 0.97
    pts.push({ x, y })
  }
  const base = r.pick(PEBBLES)
  const patterns: StonePattern[] = ['plain', 'plain', 'speckled', 'speckled', 'banded', 'freckled', 'ringed']
  const pattern = r.pick(patterns)
  const dots: StoneLook['dots'] = []
  if (pattern === 'speckled' || pattern === 'freckled') {
    const count = pattern === 'speckled' ? 10 + r.int(9) : 3 + r.int(3)
    for (let i = 0; i < count; i++) {
      dots.push({
        x: r.range(-0.4, 0.4) * w,
        y: r.range(-0.32, 0.36) * h,
        r: pattern === 'speckled' ? r.range(0.45, 1.0) : r.range(1.4, 2.6),
        light: r.next() < 0.35,
      })
    }
  }
  const band =
    pattern === 'banded'
      ? { y: r.range(-0.18, 0.2) * h, tilt: r.range(-0.35, 0.35), width: r.range(2.2, 4.2), wave: r.range(-3, 3) }
      : null
  const look: StoneLook = {
    id,
    w,
    h,
    pts,
    base,
    light: mix(base, '#fffaf0', 0.55),
    shade: mix(base, '#4a2f3a', 0.32),
    ink: ink(base),
    pattern,
    dots,
    band,
    lean: r.range(-0.06, 0.06),
  }
  looks.set(id, look)
  return look
}

/** The stone's outline as a smooth closed curve (quadratics through the midpoints). */
export function stonePath(look: StoneLook): Path2D {
  const p = new Path2D()
  const pts = look.pts
  const n = pts.length
  const mid = (a: StonePt, b: StonePt) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
  const start = mid(pts[n - 1], pts[0])
  p.moveTo(start.x, start.y)
  for (let i = 0; i < n; i++) {
    const c = pts[i]
    const m = mid(c, pts[(i + 1) % n])
    p.quadraticCurveTo(c.x, c.y, m.x, m.y)
  }
  p.closePath()
  return p
}

const paths = new Map<string, Path2D>()

function pathFor(look: StoneLook): Path2D {
  let p = paths.get(look.id)
  if (!p) {
    p = stonePath(look)
    paths.set(look.id, p)
  }
  return p
}

export interface DrawStoneOpts {
  /** A letter's bonus stone: one small painted heart. */
  mark?: StoneMark
}

/** Draw a stone centred at the origin (stone units, y down). The caller sets position, scale, rotation. */
export function drawStone(ctx: CanvasRenderingContext2D, look: StoneLook, opts: DrawStoneOpts = {}): void {
  const { w, h } = look
  const px = pixelScale(ctx)
  const lw = Math.max(0.7, Math.min(1.7, 2.6 / px))
  const path = pathFor(look)
  ctx.save()
  ctx.fillStyle = look.base
  ctx.fill(path)

  ctx.save()
  ctx.clip(path)
  // Soft light from the top left, shade underneath: a round pebble.
  const lg = ctx.createRadialGradient(-w * 0.2, -h * 0.32, h * 0.05, -w * 0.12, -h * 0.18, w * 0.62)
  lg.addColorStop(0, rgba(look.light, 0.95))
  lg.addColorStop(0.55, rgba(look.light, 0.25))
  lg.addColorStop(1, rgba(look.light, 0))
  ctx.fillStyle = lg
  ctx.fillRect(-w, -h, w * 2, h * 2)
  const sg = ctx.createRadialGradient(w * 0.12, h * 0.62, h * 0.1, w * 0.08, h * 0.5, w * 0.62)
  sg.addColorStop(0, rgba(look.shade, 0.75))
  sg.addColorStop(0.6, rgba(look.shade, 0.3))
  sg.addColorStop(1, rgba(look.shade, 0))
  ctx.fillStyle = sg
  ctx.fillRect(-w, -h, w * 2, h * 2)

  paintPattern(ctx, look, lw)

  // A light rim along the upper edge (the pebble catches the sky).
  ctx.translate(lw * 0.9, lw * 1.3)
  ctx.strokeStyle = rgba(look.light, 0.75)
  ctx.lineWidth = lw * 1.6
  ctx.stroke(path)
  ctx.restore()

  // Hand-drawn outline: a firm line, plus a faint second pass just off it.
  ctx.lineJoin = 'round'
  ctx.strokeStyle = look.ink
  ctx.lineWidth = lw
  ctx.stroke(path)
  ctx.save()
  ctx.translate(lw * 0.35, -lw * 0.3)
  ctx.globalAlpha = 0.22
  ctx.lineWidth = lw * 0.7
  ctx.stroke(path)
  ctx.restore()

  // Shine.
  ctx.lineCap = 'round'
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)'
  ctx.lineWidth = Math.max(lw * 1.4, h * 0.07)
  ctx.beginPath()
  ctx.moveTo(-w * 0.31, -h * 0.06)
  ctx.quadraticCurveTo(-w * 0.27, -h * 0.3, -w * 0.08, -h * 0.34)
  ctx.stroke()
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
  ctx.beginPath()
  ctx.arc(-w * 0.02, -h * 0.33, Math.max(lw * 0.7, h * 0.035), 0, Math.PI * 2)
  ctx.fill()

  if (opts.mark === 'letter') paintHeart(ctx, w * 0.16, h * 0.04, h * 0.3, lw)
  ctx.restore()
}

function paintPattern(ctx: CanvasRenderingContext2D, look: StoneLook, lw: number): void {
  const { w, h } = look
  switch (look.pattern) {
    case 'speckled':
    case 'freckled':
      for (const d of look.dots) {
        ctx.fillStyle = d.light ? rgba(look.light, 0.85) : rgba(look.ink, look.pattern === 'speckled' ? 0.4 : 0.16)
        ctx.beginPath()
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2)
        ctx.fill()
      }
      break
    case 'banded': {
      const b = look.band
      if (!b) break
      ctx.save()
      ctx.translate(0, b.y)
      ctx.rotate(b.tilt)
      ctx.strokeStyle = rgba('#fffaf0', 0.62)
      ctx.lineWidth = b.width
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(-w * 0.62, 0)
      ctx.bezierCurveTo(-w * 0.2, b.wave, w * 0.2, -b.wave, w * 0.62, 0)
      ctx.stroke()
      ctx.strokeStyle = rgba(look.ink, 0.16)
      ctx.lineWidth = lw * 0.6
      ctx.translate(0, b.width * 0.55)
      ctx.stroke()
      ctx.restore()
      break
    }
    case 'ringed':
      ctx.strokeStyle = rgba(look.ink, 0.18)
      ctx.lineWidth = lw * 0.8
      ctx.beginPath()
      ctx.ellipse(w * 0.05, h * 0.06, w * 0.3, h * 0.24, -0.08, 0, Math.PI * 2)
      ctx.stroke()
      ctx.strokeStyle = rgba(look.light, 0.6)
      ctx.beginPath()
      ctx.ellipse(w * 0.05, h * 0.06, w * 0.18, h * 0.13, -0.08, 0, Math.PI * 2)
      ctx.stroke()
      break
    case 'plain':
      break
  }
}

/** A small painted heart (the letter mark), centred at (x, y), `size` tall. */
function paintHeart(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, lw: number): void {
  const s = size / 2
  ctx.save()
  ctx.translate(x, y)
  ctx.beginPath()
  ctx.moveTo(0, s * 0.95)
  ctx.bezierCurveTo(-s * 1.25, s * 0.15, -s * 1.05, -s * 1.0, 0, -s * 0.42)
  ctx.bezierCurveTo(s * 1.05, -s * 1.0, s * 1.25, s * 0.15, 0, s * 0.95)
  ctx.closePath()
  ctx.fillStyle = HEART
  ctx.fill()
  ctx.strokeStyle = mix(HEART, '#2a1620', 0.45)
  ctx.lineWidth = lw * 0.8
  ctx.lineJoin = 'round'
  ctx.stroke()
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'
  ctx.beginPath()
  ctx.ellipse(-s * 0.42, -s * 0.28, s * 0.2, s * 0.13, -0.6, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/**
 * Paint one stone into a small canvas (story cards, lists): sized from the canvas's CSS size,
 * DPR capped at `maxDpr`. A soft shadow under it; `glow` adds the waiting stone's warm halo.
 */
export function renderStoneCanvas(
  canvas: HTMLCanvasElement,
  id: string,
  opts: { mark?: StoneMark; glow?: boolean; maxDpr?: number } = {},
): void {
  const cw = canvas.clientWidth
  const ch = canvas.clientHeight
  if (!cw || !ch) return
  const dpr = Math.min(opts.maxDpr ?? 2, Math.max(1, window.devicePixelRatio || 1))
  canvas.width = Math.round(cw * dpr)
  canvas.height = Math.round(ch * dpr)
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const look = stoneLook(id)
  // Fit the biggest possible stone, so every stone keeps its true size relative to the others.
  const s = Math.min((cw * 0.8) / STONE_SIZE.maxW, (ch * 0.72) / STONE_SIZE.maxH)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, cw, ch)
  if (opts.glow) {
    // The waiting stone's warm halo, kept inside the canvas (no square edges).
    const r = Math.min(cw, ch) / 2
    ctx.save()
    ctx.translate(cw / 2, ch * 0.47)
    ctx.scale(cw / Math.min(cw, ch), (ch * 0.94) / Math.min(cw, ch))
    const g = ctx.createRadialGradient(0, 0, r * 0.15, 0, 0, r)
    g.addColorStop(0, 'rgba(255, 226, 140, 0.8)')
    g.addColorStop(0.6, 'rgba(255, 214, 120, 0.3)')
    g.addColorStop(1, 'rgba(255, 214, 120, 0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(0, 0, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
  ctx.translate(cw / 2, ch * 0.47)
  ctx.scale(s, s)
  ctx.fillStyle = 'rgba(80, 50, 40, 0.16)'
  ctx.beginPath()
  ctx.ellipse(0, look.h * 0.5, look.w * 0.48, look.h * 0.14, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.rotate(look.lean)
  drawStone(ctx, look, { mark: opts.mark ?? null })
}

/** The warm halo of a waiting stone, around the origin (strength 0–1). */
export function paintGlow(ctx: CanvasRenderingContext2D, look: StoneLook, strength: number): void {
  const k = Math.max(0, Math.min(1, strength))
  const r = look.w * 1.05
  const g = ctx.createRadialGradient(0, 0, look.h * 0.2, 0, 0, r)
  g.addColorStop(0, `rgba(255, 236, 160, ${0.95 * k})`)
  g.addColorStop(0.5, `rgba(255, 214, 110, ${0.5 * k})`)
  g.addColorStop(1, 'rgba(255, 210, 120, 0)')
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.ellipse(0, 0, r, r * 0.8, 0, 0, Math.PI * 2)
  ctx.fill()
}
