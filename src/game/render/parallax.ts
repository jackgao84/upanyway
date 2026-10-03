/**
 * The far world: sky, sun or moon, stars, distant clouds, a few birds and five layers of paper-cut
 * landscape.
 *
 * Everything is pre-rendered offscreen and only composited per frame:
 * - the sky is ONE small low-resolution picture (gradient, the broad glow around the sun or moon,
 *   long cloud streaks, light shafts, a milky way at night) stretched over the screen. It is a little
 *   taller than the screen and slides down with the sun as she climbs (the day gets later);
 * - each paper layer is ONE viewport-wide strip (≤ 2048 px tall, DPR 1): its skyline with a soft
 *   paper shadow and a light cut edge, shading and snow on its peaks, and below the skyline a body of
 *   receding rows — rolling hills with round trees, pine woods, desert terraces, snowfields, a sea of
 *   clouds — each row a cut-paper edge with mist settling at its foot. So wherever the camera is, the
 *   sides of the face show a landscape, never a flat colour. Below the strip the layer is a flat fill;
 *   each layer is only painted down to where the next, nearer layer covers it (no overdraw);
 * - distant clouds live in small sprites generated lazily per altitude tile;
 * - the sun/moon (with its glow) is the frame's one radial light sprite.
 * Layers scroll vertically with parallax factors; nothing scrolls sideways (the camera only moves up).
 * Rebuilt on resize. Seeded randomness only, so a zone always looks the same.
 */
import type { Camera } from '../camera'
import { createRng, type Rng } from '../../model/rng'
import { mix, rgba } from '../art/rig'
import { freeCanvas, makeCanvas, type View } from './effects'
import type { ZonePalette } from './palette'

type LayerStyle = 'peaks' | 'alpine' | 'soft' | 'hills' | 'trees' | 'forest' | 'mesa' | 'dunes' | 'cloudsea'
/** What the receding rows inside a layer's body look like. */
type BodyStyle = 'meadow' | 'woods' | 'desert' | 'snowy' | 'clouds'

interface LayerSpec {
  style: LayerStyle
  body: BodyStyle
  /** Parallax factor (0 = fixed to the screen, 1 = moves with the rock face). */
  f: number
  /** Ridge base at the foot of the pitch, in units above the screen centre. */
  d0: number
  /** Ridge height above the base (units). */
  amp: number
  /** Snow caps on this layer. */
  snow: boolean
}

const FACTORS = [0.04, 0.09, 0.16, 0.25, 0.38]
/** Units of body (receding rows) below each layer's skyline, far → near. */
const BODY_DEPTH = [260, 300, 360, 430, 500]
/** Row spacing and roll per layer (units), far → near. */
const ROW_GAP = [46, 58, 72, 88, 104]
const ROW_AMP = [14, 18, 24, 30, 36]
/** Size of the things on the rows (trees, shrubs, puffs), units, far → near. */
const ROW_THING = [2.6, 3.4, 4.6, 6, 7.6]

function specs(p: ZonePalette): LayerSpec[] {
  const snow = p.snowcap !== null
  const L = (style: LayerStyle, body: BodyStyle, i: number, d0: number, amp: number, s = false): LayerSpec => ({ style, body, f: FACTORS[i], d0, amp, snow: s && snow })
  switch (p.zone) {
    case 'meadow':
      return [
        L('peaks', 'meadow', 0, 105, 150, true),
        L('soft', 'meadow', 1, 50, 105),
        L('trees', 'meadow', 2, -15, 62),
        L('trees', 'meadow', 3, -95, 52),
        L('trees', 'meadow', 4, -185, 44),
      ]
    case 'hollow':
      return [
        L('soft', 'woods', 0, 120, 120),
        L('hills', 'woods', 1, 55, 90),
        L('forest', 'woods', 2, -10, 60),
        L('forest', 'woods', 3, -90, 52),
        L('forest', 'woods', 4, -180, 46),
      ]
    case 'crumble':
      return [
        L('mesa', 'desert', 0, 110, 120),
        L('mesa', 'desert', 1, 50, 115),
        L('mesa', 'desert', 2, -20, 95),
        L('mesa', 'desert', 3, -100, 80),
        L('dunes', 'desert', 4, -190, 40),
      ]
    case 'ridge':
      return [
        L('alpine', 'snowy', 0, 120, 175, true),
        L('alpine', 'snowy', 1, 55, 150, true),
        L('alpine', 'snowy', 2, -20, 115, true),
        L('forest', 'snowy', 3, -100, 52),
        L('forest', 'snowy', 4, -190, 46),
      ]
    case 'cloud':
      return [
        L('peaks', 'clouds', 0, 95, 175, true),
        L('alpine', 'clouds', 1, 25, 145, true),
        L('cloudsea', 'clouds', 2, -40, 40),
        L('cloudsea', 'clouds', 3, -120, 44),
        L('cloudsea', 'clouds', 4, -210, 50),
      ]
    case 'summit':
    default:
      return [
        L('alpine', 'clouds', 0, 70, 175, true),
        L('alpine', 'clouds', 1, -5, 150, true),
        L('peaks', 'clouds', 2, -85, 115, true),
        L('cloudsea', 'clouds', 3, -160, 46),
        L('cloudsea', 'clouds', 4, -240, 52),
      ]
  }
}

interface Band {
  canvas: HTMLCanvasElement | null
  /** Layer altitude range covered by the canvas. */
  aLo: number
  aHi: number
  /** Skyline base altitude (layer units). */
  base: number
  /** Colour below the band. */
  below: string
}

/** Clip region for the far world (the rock face covers the rest). Screen CSS px. */
export interface FarClip {
  /** The face covers x ∈ [x0, x1] for y > topY (and the ground covers y > groundY). */
  x0: number
  x1: number
  topY: number
  groundY: number
}

const BAND_PAD_ABOVE = 50
const MAX_STRIP = 2048
const CLOUD_F = 0.07
/** Layer units per cloud tile. */
const CLOUD_TILE = 700
/** The sky picture is drawn at this fraction of CSS px (it is all soft gradients). */
const SKY_RES = 0.25
/** How fast the sun (and the sky with it) sinks per unit she climbs, × the base scale. */
const SUN_SINK = 0.03
const BIRDS = 5

interface CloudSprite {
  canvas: HTMLCanvasElement
  /** Layer coords: u from the screen centre, a altitude. */
  u: number
  a: number
  w: number
  h: number
}

export class Parallax {
  private w = 1
  private h = 1
  private base = 1
  private dpr = 1
  private sky: HTMLCanvasElement | null = null
  /** CSS px of extra sky above the screen (it slides down as the sun sinks). */
  private skyExtra = 0
  private stars: HTMLCanvasElement | null = null
  private sun: HTMLCanvasElement | null = null
  private sunSize = 0
  private readonly layers: LayerSpec[]
  private bands: (Band | null)[] = []
  /** Screen y of each layer's skyline base this frame (reused). */
  private readonly baseY: Float64Array
  private readonly cloudTiles = new Map<number, CloudSprite[]>()
  private startC = 0
  private twinkle: Float32Array = new Float32Array(0)
  private readonly birdColor: string
  private readonly birds: Float32Array

  constructor(
    private readonly palette: ZonePalette,
    private readonly seed: string,
  ) {
    this.layers = specs(palette)
    this.bands = this.layers.map(() => null)
    this.baseY = new Float64Array(this.layers.length)
    this.birdColor = mix(palette.ink, palette.sky[Math.min(1, palette.sky.length - 1)].color, 0.35)
    // Birds: offset x, offset y, flap phase, size (a loose V that drifts across the sky).
    const rng = createRng(`${seed}:birds`)
    this.birds = new Float32Array(BIRDS * 4)
    for (let i = 0; i < BIRDS; i++) {
      const side = i === 0 ? 0 : i % 2 ? -1 : 1
      const rank = Math.ceil(i / 2)
      this.birds[i * 4] = -rank * rng.range(10, 15)
      this.birds[i * 4 + 1] = side * rank * rng.range(6, 9) + rng.range(-2, 2)
      this.birds[i * 4 + 2] = rng.next() * 6
      this.birds[i * 4 + 3] = rng.range(3.4, 4.8)
    }
  }

  /** (Re)build for a new viewport. `startCenterY` = the camera's lowest centre (foot of the pitch). */
  resize(view: View, startCenterY: number): void {
    this.release()
    this.w = view.w
    this.h = view.h
    this.base = view.base
    this.dpr = view.dpr
    this.startC = startCenterY
    this.skyExtra = Math.round(this.h * 0.16)
    this.sky = this.buildSky()
    const rng = createRng(`${this.seed}:twinkle`)
    const n = this.palette.stars > 0 ? 14 : 0
    this.twinkle = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      this.twinkle[i * 3] = rng.next()
      this.twinkle[i * 3 + 1] = rng.range(0.05, 0.5)
      this.twinkle[i * 3 + 2] = rng.next() * 10
    }
  }

  /** Screen y (CSS px) of layer altitude `a` for a layer with factor f. */
  private layerY(a: number, f: number, camera: Camera, cy0: number): number {
    return cy0 - (a - camera.centerY * f) * this.base
  }

  draw(ctx: CanvasRenderingContext2D, camera: Camera, view: View, t: number, clip: FarClip | null): void {
    const w = this.w
    const h = this.h
    view.applyScreen(ctx)
    // Nothing of the far world is visible when the face fills the screen.
    let clipped = false
    if (clip) {
      const sides = clip.x0 > 0 || clip.x1 < w
      const above = clip.topY > 0
      if (!sides && !above) return
      if (clip.x0 > 0 || clip.x1 < w || clip.topY < h) {
        ctx.save()
        ctx.beginPath()
        const gy = Math.min(h, clip.groundY)
        if (clip.x0 > 0) ctx.rect(0, 0, clip.x0, gy)
        if (clip.x1 < w) ctx.rect(clip.x1, 0, w - clip.x1, gy)
        if (above) ctx.rect(Math.max(0, clip.x0), 0, Math.min(w, clip.x1) - Math.max(0, clip.x0), Math.min(gy, clip.topY))
        ctx.clip()
        clipped = true
      }
    }

    // Screen y of the camera centre altitude.
    const cy0 = view.oy - camera.centerY * view.s
    // Where each layer's skyline base is: everything below it is covered by that layer.
    const n = this.layers.length
    for (let i = 0; i < n; i++) {
      const band = this.bands[i] ?? (this.bands[i] = this.buildBand(i))
      this.baseY[i] = this.layerY(band.base, this.layers[i].f, camera, cy0)
    }
    const sink = Math.max(0, Math.min(this.skyExtra, (camera.centerY - this.startC) * SUN_SINK * this.base))
    const skyLimit = Math.min(h, this.baseY[0] + 2)

    this.drawSky(ctx, sink, skyLimit)
    this.drawStars(ctx, camera, t, skyLimit)
    this.drawSun(ctx, sink)
    this.drawLayer(ctx, 0, camera, cy0)
    this.drawClouds(ctx, camera, cy0)
    this.drawBirds(ctx, t, sink)
    for (let i = 1; i < n; i++) this.drawLayer(ctx, i, camera, cy0)

    if (clipped) ctx.restore()
  }

  // -------------------------------------------------------------------------------------------
  // Sky, stars, sun, birds

  private drawSky(ctx: CanvasRenderingContext2D, sink: number, limit: number): void {
    const sky = this.sky
    if (!sky || limit <= 0) return
    // The picture covers screen y ∈ [−extra + sink, h + sink]; only paint down to the far layer.
    const top = -this.skyExtra + sink
    const full = this.h + this.skyExtra
    const y0 = Math.max(0, top)
    const y1 = Math.min(limit, top + full)
    if (y1 <= y0) return
    const k = sky.height / full
    ctx.drawImage(sky, 0, (y0 - top) * k, sky.width, (y1 - y0) * k, 0, y0, this.w, y1 - y0)
  }

  private buildSky(): HTMLCanvasElement {
    const p = this.palette
    const E = this.skyExtra
    const w = this.w
    const h = this.h
    const c = makeCanvas(Math.max(16, w * SKY_RES), Math.max(16, (h + E) * SKY_RES))
    const g = c.getContext('2d')
    if (!g) return c
    g.scale(c.width / w, c.height / (h + E))
    g.translate(0, E)
    // Gradient over [−E, h]: the stops are authored for the screen; the extra above is a touch deeper.
    const grad = g.createLinearGradient(0, -E, 0, h)
    const total = h + E
    grad.addColorStop(0, mix(p.sky[0].color, p.night ? '#060a1e' : p.ink, p.night ? 0.3 : 0.1))
    for (const st of p.sky) grad.addColorStop((E + st.at * h) / total, st.color)
    g.fillStyle = grad
    g.fillRect(0, -E, w, total)

    const cel = p.celestial
    const sx = cel.x * w
    const sy = cel.y * h
    const R = Math.max(w, h) * (p.night ? 0.42 : 0.62)
    // The broad glow around the sun (or moon), and a warm band along the horizon under it.
    const glow = g.createRadialGradient(sx, sy, 0, sx, sy, R)
    glow.addColorStop(0, rgba(p.skyGlow, p.skyGlowAlpha))
    glow.addColorStop(0.3, rgba(p.skyGlow, p.skyGlowAlpha * 0.45))
    glow.addColorStop(1, rgba(p.skyGlow, 0))
    g.fillStyle = glow
    g.fillRect(0, -E, w, total)
    if (!p.night) {
      const band = g.createLinearGradient(0, h * 0.35, 0, h)
      band.addColorStop(0, rgba(p.skyGlow, 0))
      band.addColorStop(1, rgba(p.skyGlow, p.skyGlowAlpha * 0.35))
      g.fillStyle = band
      g.fillRect(0, h * 0.35, w, h * 0.65)
    }

    const rng = createRng(`${this.seed}:sky`)
    if (p.rays) {
      // Soft shafts of morning light fanning out from the sun.
      g.save()
      g.translate(sx, sy)
      for (let i = 0; i < 7; i++) {
        const a = (cel.x < 0.5 ? 0.25 : Math.PI - 1.25) + i * 0.16 + rng.range(-0.04, 0.04)
        const len = Math.max(w, h) * rng.range(0.8, 1.2)
        const half = rng.range(0.025, 0.05)
        g.fillStyle = rgba('#fffbe0', rng.range(0.07, 0.13))
        g.beginPath()
        g.moveTo(0, 0)
        g.lineTo(Math.cos(a - half) * len, Math.sin(a - half) * len)
        g.lineTo(Math.cos(a + half) * len, Math.sin(a + half) * len)
        g.closePath()
        g.fill()
      }
      g.restore()
    }
    if (p.streaks) {
      // Long soft cloud streaks, lit from underneath on the sun's side.
      const lit = mix(p.streaks, p.skyGlow, 0.45)
      for (let i = 0; i < 9; i++) {
        const y = rng.range(-E * 0.6, h * 0.42)
        const x = rng.range(-0.1, 1.1) * w
        const rx = rng.range(0.12, 0.3) * w + 40
        const ry = rng.range(3, 7) * Math.max(1, this.base * 0.8)
        const near = 1 - Math.min(1, Math.abs(x - sx) / w)
        g.globalAlpha = rng.range(0.3, 0.55)
        g.fillStyle = p.streaks
        g.beginPath()
        g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
        g.fill()
        g.globalAlpha = 0.35 + 0.4 * near
        g.fillStyle = lit
        g.beginPath()
        g.ellipse(x + rx * 0.08, y + ry * 0.45, rx * 0.8, ry * 0.5, 0, 0, Math.PI * 2)
        g.fill()
      }
      g.globalAlpha = 1
    }
    if (p.night) {
      // A faint, patchy milky way curving across the top of the sky.
      for (let i = 0; i < 46; i++) {
        const k = rng.next()
        const x = (k * 1.3 - 0.15) * w
        const y = h * (0.04 + 0.32 * k * k) + rng.range(-1, 1) * h * 0.045
        g.globalAlpha = rng.range(0.025, 0.055)
        g.fillStyle = i % 3 ? '#c9d4ff' : '#eadcff'
        g.beginPath()
        g.ellipse(x, y, w * rng.range(0.05, 0.14), h * rng.range(0.025, 0.05), 0.35 + k * 0.3, 0, Math.PI * 2)
        g.fill()
      }
      g.globalAlpha = 1
    }
    return c
  }

  private drawStars(ctx: CanvasRenderingContext2D, camera: Camera, t: number, limit: number): void {
    const p = this.palette
    if (p.stars <= 0 || limit <= 0) return
    if (!this.stars) this.stars = this.buildStars()
    const s = this.stars
    if (!s) return
    const h = this.h
    // Stars drift down very slowly as she climbs; the field wraps.
    let off = (camera.centerY * 0.02 * this.base) % h
    if (off < 0) off += h
    ctx.globalAlpha = p.night ? 1 : 0.5
    // Two copies (wrapped), each only down to the far layer.
    const k = s.height / h
    const a1 = Math.min(limit, h) - off
    if (a1 > 0) ctx.drawImage(s, 0, 0, s.width, a1 * k, 0, off, this.w, a1)
    const a0 = Math.min(limit, off)
    if (a0 > 0) ctx.drawImage(s, 0, (h - off) * k, s.width, a0 * k, 0, 0, this.w, a0)
    // A few twinkling ones.
    const tw = this.twinkle
    ctx.fillStyle = '#ffffff'
    for (let i = 0; i < tw.length; i += 3) {
      const x = tw[i] * this.w
      let y = tw[i + 1] * h + off
      if (y > h) y -= h
      if (y > limit) continue
      const a = 0.5 + 0.5 * Math.sin(t * (1.3 + tw[i + 2] * 0.15) + tw[i + 2])
      ctx.globalAlpha = a * (p.night ? 0.95 : 0.45)
      const r = 1.1 + a * 1.2
      ctx.beginPath()
      ctx.moveTo(x, y - r * 2)
      ctx.lineTo(x + r * 0.5, y - r * 0.5)
      ctx.lineTo(x + r * 2, y)
      ctx.lineTo(x + r * 0.5, y + r * 0.5)
      ctx.lineTo(x, y + r * 2)
      ctx.lineTo(x - r * 0.5, y + r * 0.5)
      ctx.lineTo(x - r * 2, y)
      ctx.lineTo(x - r * 0.5, y - r * 0.5)
      ctx.closePath()
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  private buildStars(): HTMLCanvasElement | null {
    const c = makeCanvas(this.w, this.h)
    const g = c.getContext('2d')
    if (!g) return null
    const rng = createRng(`${this.seed}:stars`)
    const n = Math.round(this.palette.stars * Math.min(2.2, (this.w * this.h) / (820 * 1180)) + 10)
    for (let i = 0; i < n; i++) {
      const x = rng.next() * this.w
      // Denser high up.
      const y = Math.pow(rng.next(), 1.4) * this.h * 0.85
      const r = rng.next() < 0.12 ? rng.range(1.1, 1.6) : rng.range(0.4, 0.9)
      g.globalAlpha = rng.range(0.35, 0.95)
      g.fillStyle = rng.next() < 0.2 ? '#ffe9c4' : '#ffffff'
      g.beginPath()
      g.arc(x, y, r, 0, Math.PI * 2)
      g.fill()
    }
    return c
  }

  private drawSun(ctx: CanvasRenderingContext2D, sink: number): void {
    const cel = this.palette.celestial
    if (!this.sun) this.buildSun()
    if (!this.sun) return
    const size = this.sunSize
    const x = cel.x * this.w
    // Sinks very slowly as she climbs (with the sky picture).
    const y = cel.y * this.h + sink
    if (y - size / 2 > this.h) return
    ctx.drawImage(this.sun, x - size / 2, y - size / 2, size, size)
  }

  private buildSun(): void {
    const cel = this.palette.celestial
    const r = cel.r * Math.max(0.8, Math.min(1.4, this.base))
    const size = r * 6
    const px = Math.ceil(size * this.dpr)
    const c = makeCanvas(px, px)
    const g = c.getContext('2d')
    this.sun = c
    this.sunSize = size
    if (!g) return
    g.scale(this.dpr, this.dpr)
    const m = size / 2
    const glow = g.createRadialGradient(m, m, r * 0.6, m, m, m)
    glow.addColorStop(0, rgba(cel.glow, cel.kind === 'sun' ? 0.6 : 0.45))
    glow.addColorStop(0.35, rgba(cel.glow, 0.18))
    glow.addColorStop(1, rgba(cel.glow, 0))
    g.fillStyle = glow
    g.fillRect(0, 0, size, size)
    // A soft paper ring, then the disc.
    g.fillStyle = rgba(cel.color, 0.35)
    g.beginPath()
    g.arc(m, m, r * 1.22, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = cel.color
    g.beginPath()
    g.arc(m, m, r, 0, Math.PI * 2)
    g.fill()
    if (cel.kind === 'moon') {
      // Soft friendly craters.
      g.fillStyle = rgba('#d9d2c0', 0.55)
      for (const [dx, dy, rr] of [
        [-0.35, -0.2, 0.22],
        [0.28, 0.25, 0.16],
        [0.1, -0.42, 0.1],
        [-0.12, 0.42, 0.12],
      ]) {
        g.beginPath()
        g.arc(m + dx * r, m + dy * r, rr * r, 0, Math.PI * 2)
        g.fill()
      }
    } else {
      // A lighter top-left: a cut-paper disc catching light.
      g.fillStyle = rgba('#ffffff', 0.35)
      g.beginPath()
      g.arc(m - r * 0.18, m - r * 0.2, r * 0.62, 0, Math.PI * 2)
      g.fill()
    }
  }

  /** A little flock drifting across the sky (by day): a few strokes, no sprites. */
  private drawBirds(ctx: CanvasRenderingContext2D, t: number, sink: number): void {
    const p = this.palette
    if (p.night) return
    const span = this.w + 260
    const cx = ((t * 14 + this.w * 0.3) % span) - 130
    const cy = this.h * (p.celestial.y * 0.55 + 0.08) + sink * 0.5 + Math.sin(t * 0.4) * 6
    const k = Math.max(0.8, Math.min(1.3, this.base * 0.7))
    const b = this.birds
    ctx.strokeStyle = this.birdColor
    ctx.lineWidth = 1.3
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    for (let i = 0; i < BIRDS; i++) {
      const x = cx + b[i * 4] * k
      const y = cy + b[i * 4 + 1] * k + Math.sin(t * 1.3 + i) * 1.5
      const s = b[i * 4 + 3] * k
      const flap = Math.sin(t * 7 + b[i * 4 + 2]) * 0.6
      ctx.moveTo(x - s, y - s * (0.2 + flap * 0.5))
      ctx.quadraticCurveTo(x - s * 0.45, y - s * (0.55 + flap * 0.3), x, y)
      ctx.quadraticCurveTo(x + s * 0.45, y - s * (0.55 + flap * 0.3), x + s, y - s * (0.2 + flap * 0.5))
    }
    ctx.stroke()
  }

  // -------------------------------------------------------------------------------------------
  // Paper layers

  private drawLayer(ctx: CanvasRenderingContext2D, i: number, camera: Camera, cy0: number): void {
    const spec = this.layers[i]
    const band = this.bands[i]
    if (!band) return
    // Only down to where the next (nearer) layer covers everything.
    const limit = i + 1 < this.layers.length ? Math.min(this.h, this.baseY[i + 1] + 2) : this.h
    const yTop = this.layerY(band.aHi, spec.f, camera, cy0)
    const yBot = this.layerY(band.aLo, spec.f, camera, cy0)
    if (yTop >= limit || limit <= 0) return
    const c = band.canvas
    if (c && yBot > 0) {
      const y0 = Math.max(0, yTop)
      const y1 = Math.min(limit, yBot)
      if (y1 > y0) {
        const k = c.height / (yBot - yTop)
        ctx.drawImage(c, 0, (y0 - yTop) * k, c.width, (y1 - y0) * k, -16, y0, this.w + 32, y1 - y0)
      }
    }
    if (yBot < limit) {
      ctx.fillStyle = band.below
      const y = Math.max(0, yBot - 1)
      ctx.fillRect(0, y, this.w, limit - y)
    }
  }

  private buildBand(i: number): Band {
    const spec = this.layers[i]
    const p = this.palette
    const n = this.layers.length
    const color = p.mountains[Math.min(i, p.mountains.length - 1)]
    const toward = i + 1 < n ? p.mountains[Math.min(i + 1, p.mountains.length - 1)] : p.deep
    const s = this.base
    const base = spec.d0 + this.startC * spec.f
    const aHi = base + spec.amp + BAND_PAD_ABOVE
    let depth = BODY_DEPTH[i] ?? 400
    if ((aHi - base + depth) * s > MAX_STRIP) depth = Math.max(40, MAX_STRIP / s - (aHi - base) - 1)
    const aLo = base - depth
    const band: Band = { canvas: null, aLo, aHi, base, below: mix(color, toward, 0.5) }
    const W = Math.ceil(this.w + 32)
    const H = Math.ceil((aHi - aLo) * s)
    const c = makeCanvas(W, H)
    const g = c.getContext('2d')
    if (!g) return band
    band.canvas = c
    const rng = createRng(`${this.seed}:layer:${i}`)
    // Band coords: x px from the band's left edge; layer unit u = (x − W/2) / s.
    const yOf = (a: number) => (aHi - a) * s
    const ridge = makeRidge(spec, rng.next() * 1000, p.zone)
    const sil = new Path2D()
    const step = 4
    sil.moveTo(-2, H + 2)
    for (let x = -2; x <= W + step; x += step) {
      const u = (x - W / 2) / s
      sil.lineTo(x, yOf(base + ridge.height(u)))
    }
    sil.lineTo(W + 2, H + 2)
    sil.closePath()
    // Extras sticking up from the skyline (trees, cloud puffs) joined into the same silhouette.
    ridge.extras(sil, W, s, yOf, base, rng, i)

    // Paper shadow: a soft halo the layer casts on the one behind it, then a light cut edge (the
    // same silhouette, lighter, nudged up under the main fill).
    paperEdge(g, sil, p.shadow, mix(color, p.rim, 0.55), 1.5 + i * 0.3, 10 + i * 2)
    const top = yOf(base + spec.amp)
    const hazeAt = mix(color, p.haze, spec.style === 'cloudsea' ? 0.12 : 0.24)
    const grad = g.createLinearGradient(0, top, 0, yOf(base))
    grad.addColorStop(0, color)
    grad.addColorStop(1, hazeAt)
    g.fillStyle = grad
    g.fill(sil)

    g.save()
    g.clip(sil)
    const shadowSide = p.celestial.x < 0.5 ? 1 : -1
    if (spec.style === 'peaks' || spec.style === 'alpine') {
      if (spec.snow && p.snowcap) snowCaps(g, ridge, spec, p, W, s, yOf, base, shadowSide)
      peakFacets(g, ridge, spec, p, color, W, s, yOf, base, shadowSide)
    } else if (spec.style === 'mesa') {
      mesaDetail(g, ridge, spec, p, color, W, s, yOf, base, shadowSide, rng)
    } else if (spec.style === 'cloudsea') {
      // Lit tops on the sun's side.
      g.globalAlpha = p.night ? 0.25 : 0.35
      g.fillStyle = mix(p.rim, p.skyGlow, 0.4)
      g.fillRect(0, top - 30 * s, W, 14 * s)
      g.globalAlpha = 1
    }
    g.restore()

    // The body: receding rows, each a paper edge with mist settling at its foot.
    const gap = (ROW_GAP[i] ?? 50) * (spec.body === 'clouds' ? 1.35 : 1)
    const ramp = ROW_AMP[i] ?? 14
    const rows = Math.ceil((depth + gap) / gap)
    let last = hazeAt
    let mean = base + gap * 0.25
    for (let r = 1; r <= rows + 1; r++) {
      if (mean < aLo - gap * 0.6) break
      const k = Math.min(1, r / rows)
      const rowColor = mix(color, toward, 0.12 + 0.6 * k)
      last = this.drawRow(g, spec, i, r, mean, ramp, gap, rowColor, W, H, s, yOf, rng)
      mean -= gap * rng.range(0.75, 1.2)
    }
    band.below = last
    // Light from the sun's side of the sky warms (or, by moonlight, cools) everything a little.
    const sunX = p.celestial.x * this.w + 16
    const warm = g.createLinearGradient(sunX, 0, sunX + (p.celestial.x < 0.5 ? 1 : -1) * W * 0.7, 0)
    const wa = p.skyGlowAlpha * (p.night ? 0.22 : 0.3) * (1 - i * 0.18)
    warm.addColorStop(0, rgba(p.skyGlow, wa))
    warm.addColorStop(1, rgba(p.skyGlow, 0))
    g.save()
    g.globalCompositeOperation = 'source-atop'
    g.fillStyle = warm
    g.fillRect(0, 0, W, H)
    g.restore()
    // Paper grain over the whole strip (drawn once).
    g.save()
    g.clip(sil)
    const grain = Math.round((W * H) / 900)
    const dark = mix(color, p.ink, 0.35)
    const light = mix(color, '#ffffff', 0.45)
    g.globalAlpha = 0.08
    g.fillStyle = dark
    for (let k = 0; k < grain; k++) {
      if (k === grain >> 1) g.fillStyle = light
      g.fillRect(rng.next() * W, rng.next() * H, 1, 1)
    }
    g.restore()
    return band
  }

  /** One receding row inside a layer's body. Returns the colour at its foot (the band's fill below). */
  private drawRow(
    g: CanvasRenderingContext2D,
    spec: LayerSpec,
    i: number,
    r: number,
    mean: number,
    ramp: number,
    gap: number,
    color: string,
    W: number,
    H: number,
    s: number,
    yOf: (a: number) => number,
    rng: Rng,
  ): string {
    const p = this.palette
    const ph1 = rng.next() * 10
    const ph2 = rng.next() * 10
    const wl1 = rng.range(45, 80) * (1 + i * 0.3)
    const wl2 = rng.range(16, 26) * (1 + i * 0.25)
    const body = spec.body
    const flat = body === 'desert' ? 0.45 : body === 'clouds' ? 0.35 : 1
    const rowTop = (u: number) => mean + ramp * flat * (0.5 + 0.38 * Math.sin(u / wl1 + ph1) + 0.12 * Math.sin(u / wl2 + ph2))
    const path = new Path2D()
    const step = 5
    path.moveTo(-2, H + 2)
    for (let x = -2; x <= W + step; x += step) path.lineTo(x, yOf(rowTop((x - W / 2) / s)))
    path.lineTo(W + 2, H + 2)
    path.closePath()
    const size = (ROW_THING[i] ?? 4) * (0.85 + 0.04 * r)
    if (body === 'clouds') {
      // Billows: mounds of puffs (a big one in the middle, smaller ones down its shoulders) with
      // lower, flatter stretches between them.
      for (let x = rng.range(-60, 0); x < W + 60; ) {
        const mw = gap * rng.range(1.2, 2.6) * s
        const bumps = 3 + rng.int(3)
        for (let b = 0; b < bumps; b++) {
          const k = (b + 0.5) / bumps
          const mid = 1 - Math.abs(k - 0.5) * 1.5
          const rr = gap * (0.16 + 0.3 * mid) * rng.range(0.85, 1.15) * s
          const bx = x + k * mw
          const y = yOf(rowTop((bx - W / 2) / s)) + rr * 0.4
          path.moveTo(bx + rr, y)
          path.arc(bx, y, rr, 0, Math.PI * 2)
        }
        x += mw * rng.range(0.85, 1.4)
      }
    }
    if (body === 'woods') {
      // A skyline of pines, shoulder to shoulder: the row IS the forest.
      for (let x = rng.range(-12, 0); x < W + 16; ) {
        const u = (x - W / 2) / s
        const ph = gap * rng.range(0.22, 0.48) * s
        const pw = ph * rng.range(0.3, 0.38)
        pine(path, x, yOf(rowTop(u)) + ph * 0.12, ph, pw)
        x += pw * rng.range(0.75, 1.25)
      }
    }
    // Mist settles at the foot of each row; clouds are shaded underneath instead.
    const foot =
      body === 'clouds' || body === 'snowy' ? mix(color, p.deep, p.night ? 0.32 : 0.3) : mix(color, p.haze, i < 2 ? 0.26 : 0.18)
    const halo = 6 + i * 1.6
    const rim = body === 'clouds' ? mix(p.rim, p.skyGlow, p.night ? 0.1 : 0.4) : mix(color, p.rim, 0.45)
    paperEdge(g, path, p.shadow, rim, body === 'clouds' ? 1.4 + i * 0.3 : 1 + i * 0.25, halo)
    const yT = yOf(mean + ramp + (body === 'clouds' ? gap * 0.45 : 0))
    const grad = g.createLinearGradient(0, yT, 0, yOf(mean - gap * (body === 'clouds' ? 0.7 : 1.05)))
    const lit = body === 'clouds' ? mix(color, p.rim, p.night ? 0.12 : 0.3) : body === 'snowy' ? mix(color, p.snowcap ?? '#ffffff', p.night ? 0.3 : 0.55) : color
    grad.addColorStop(0, lit)
    if (body === 'clouds' || body === 'snowy') grad.addColorStop(0.45, color)
    grad.addColorStop(1, foot)
    g.fillStyle = grad
    g.fill(path)

    // Things on the row: trees, pines, shrubs and little buttes, snowy pines, light on cloud tops.
    const things = new Path2D()
    const thingColor = body === 'clouds' ? mix(color, p.deep, 0.12) : mix(color, p.deep, body === 'snowy' ? 0.42 : 0.3)
    let any = false
    switch (body) {
      case 'meadow': {
        if (i < 1) break
        for (let x = rng.range(0, 30); x < W; x += rng.range(14, 40) * s * 0.6) {
          // Groves on the hill tops, open fields between.
          if (Math.sin(((x - W / 2) / s) / wl1 + ph1) < 0.1 || rng.next() < 0.25) continue
          const u = (x - W / 2) / s
          const y = yOf(rowTop(u))
          const clump = 1 + rng.int(3)
          for (let q = 0; q < clump; q++) {
            const rr = size * rng.range(0.8, 1.25) * s
            const bx = x + q * rr * 1.3
            const by = y - rr * 0.6 + rng.range(-0.3, 0.3) * rr
            things.moveTo(bx + rr, by)
            things.arc(bx, by, rr, 0, Math.PI * 2)
          }
          any = true
        }
        break
      }
      case 'woods':
        break
      case 'snowy': {
        // Clumps of snowy pines on the snowfields.
        for (let x = rng.range(-6, 0); x < W + 8; ) {
          if (rng.next() < 0.4) {
            x += size * s * rng.range(4, 10)
            continue
          }
          const clump = 2 + rng.int(5)
          for (let q = 0; q < clump; q++) {
            const u = (x - W / 2) / s
            const ph = size * rng.range(3.6, 6) * s
            const pw = ph * rng.range(0.3, 0.38)
            pine(things, x, yOf(rowTop(u)) + size * 0.3 * s, ph, pw)
            x += pw * rng.range(0.8, 1.3)
          }
          any = true
        }
        break
      }
      case 'desert': {
        for (let x = rng.range(0, 60); x < W; x += rng.range(40, 150) * s * 0.55) {
          const u = (x - W / 2) / s
          const y = yOf(rowTop(u))
          if (rng.next() < 0.3) {
            // A little butte with a sloping apron.
            const bw = size * rng.range(3, 7) * s
            const bh = size * rng.range(2, 4.5) * s
            things.moveTo(x - bw / 2 - bh * 0.45, y + 2)
            things.quadraticCurveTo(x - bw / 2 - bh * 0.1, y - bh * 0.35, x - bw / 2, y - bh)
            things.lineTo(x + bw / 2, y - bh)
            things.quadraticCurveTo(x + bw / 2 + bh * 0.1, y - bh * 0.35, x + bw / 2 + bh * 0.45, y + 2)
            things.closePath()
          } else if (rng.next() < 0.5) {
            // A clump of round desert shrubs.
            const clump = 1 + rng.int(3)
            for (let q = 0; q < clump; q++) {
              const rr = size * rng.range(0.4, 0.8) * s
              const bx = x + q * rr * 1.6
              things.moveTo(bx + rr, y)
              things.arc(bx, y - rr * 0.35, rr, 0, Math.PI * 2)
            }
          }
          any = true
        }
        break
      }
      case 'clouds':
        break
    }
    if (any) {
      if (body === 'snowy' || body === 'meadow') {
        // A lit edge: the shape in a light colour, then the shape again nudged away from the light.
        g.fillStyle = body === 'snowy' ? mix(p.snowcap ?? '#ffffff', color, 0.12) : mix(thingColor, p.rim, 0.42)
        g.fill(things)
        g.save()
        g.clip(things)
        const dx = body === 'snowy' ? 0 : (p.celestial.x < 0.5 ? 1 : -1) * size * 0.3 * s
        g.translate(dx, (body === 'snowy' ? 0.9 : 0.35) * size * s)
        g.fillStyle = thingColor
        g.fill(things)
        g.restore()
      } else {
        g.fillStyle = thingColor
        g.fill(things)
      }
    }
    // Specks of colour in meadows (flowers) and sparkle on snow.
    if (body === 'meadow' && i >= 2 && !p.night) {
      g.save()
      g.clip(path)
      for (let k = 0; k < W / (18 * s); k++) {
        const x = rng.next() * W
        const u = (x - W / 2) / s
        const y = yOf(rowTop(u) - rng.range(2, gap * 0.8))
        g.globalAlpha = rng.range(0.5, 0.85)
        g.fillStyle = p.accents[rng.int(Math.min(3, p.accents.length))]
        g.fillRect(x, y, Math.max(1, s * 0.9), Math.max(1, s * 0.9))
      }
      g.restore()
      g.globalAlpha = 1
    }
    return foot
  }

  // -------------------------------------------------------------------------------------------
  // Distant clouds: small sprites placed per altitude tile, generated lazily as the camera rises

  private drawClouds(ctx: CanvasRenderingContext2D, camera: Camera, cy0: number): void {
    const f = CLOUD_F
    const T = CLOUD_TILE
    const s = this.base
    const aTop = camera.centerY * f + cy0 / s
    const aBot = camera.centerY * f - (this.h - cy0) / s
    const k0 = Math.floor((aBot - 80) / T)
    const k1 = Math.floor((aTop + 80) / T)
    this.cloudTiles.forEach((list, k) => {
      if (k < k0 - 1 || k > k1 + 1) {
        for (const c of list) freeCanvas(c.canvas)
        this.cloudTiles.delete(k)
      }
    })
    const cx = this.w / 2
    for (let k = k0; k <= k1; k++) {
      let list = this.cloudTiles.get(k)
      if (!list) {
        list = this.buildCloudTile(k)
        this.cloudTiles.set(k, list)
      }
      for (let q = 0; q < list.length; q++) {
        const c = list[q]
        const y = this.layerY(c.a, f, camera, cy0)
        if (y - c.h / 2 > this.baseY[1] || y + c.h / 2 < 0) continue
        ctx.drawImage(c.canvas, cx + c.u * s - c.w / 2, y - c.h / 2, c.w, c.h)
      }
    }
  }

  private buildCloudTile(k: number): CloudSprite[] {
    const p = this.palette
    const s = this.base
    const rng = createRng(`${this.seed}:clouds:${k}`)
    const out: CloudSprite[] = []
    // Clouds only float above the far range's feet.
    const floor = this.layers[0].d0 + this.startC * this.layers[0].f - 40
    const count = 1 + rng.int(p.zone === 'cloud' || p.zone === 'meadow' ? 4 : 3)
    const halfU = this.w / 2 / s + 60
    for (let i = 0; i < count; i++) {
      const a = (k + rng.next()) * CLOUD_TILE
      const u = rng.range(-halfU, halfU)
      if (a < floor) continue
      const size = rng.range(20, 38)
      const stretch = rng.range(1.8, 3)
      const cw = size * stretch * 1.5 * s
      const chh = size * 2.1 * s
      const c = makeCanvas(cw, chh)
      const g = c.getContext('2d')
      if (g) paperCloud(g, cw / 2, chh * 0.5, size * s, stretch, p.cloud, p.cloudShade, p.shadow, rng.next() * 100)
      out.push({ canvas: c, u, a, w: cw, h: chh })
    }
    return out
  }

  // -------------------------------------------------------------------------------------------

  private release(): void {
    freeCanvas(this.sky)
    freeCanvas(this.stars)
    freeCanvas(this.sun)
    this.sky = this.stars = this.sun = null
    for (const b of this.bands) freeCanvas(b?.canvas)
    this.bands = this.layers.map(() => null)
    for (const list of this.cloudTiles.values()) for (const c of list) freeCanvas(c.canvas)
    this.cloudTiles.clear()
  }

  /** Offscreen pixels held (lab/debug). */
  cachedPixels(): number {
    let n = 0
    const add = (c: HTMLCanvasElement | null | undefined) => {
      if (c) n += c.width * c.height
    }
    add(this.sky)
    add(this.stars)
    add(this.sun)
    for (const b of this.bands) add(b?.canvas)
    for (const list of this.cloudTiles.values()) for (const c of list) add(c.canvas)
    return n
  }

  destroy(): void {
    this.release()
  }
}

// ---------------------------------------------------------------------------------------------
// Paper edges

/**
 * A cut-paper edge for a filled shape: a soft shadow halo around it (cast on whatever is behind),
 * then the shape in a light rim colour nudged up by `lift` px — the main fill drawn afterwards
 * leaves that sliver showing as a lit edge. Cheap at build time (strokes, no shadowBlur).
 */
function paperEdge(g: CanvasRenderingContext2D, path: Path2D, shadow: string, rim: string, lift: number, halo: number): void {
  g.save()
  g.lineJoin = 'round'
  g.strokeStyle = shadow
  g.globalAlpha = 0.16
  g.lineWidth = halo * 1.4
  g.stroke(path)
  g.globalAlpha = 0.22
  g.lineWidth = halo * 0.6
  g.stroke(path)
  g.globalAlpha = 1
  g.translate(0, -lift)
  g.fillStyle = rim
  g.fill(path)
  g.restore()
}

/** A storybook pine (three soft tiers) with its foot at (x, y), height ph, half-width pw. */
function pine(path: Path2D, x: number, y: number, ph: number, pw: number): void {
  path.moveTo(x - pw, y)
  path.lineTo(x - pw * 0.3, y - ph * 0.36)
  path.lineTo(x - pw * 0.72, y - ph * 0.34)
  path.lineTo(x - pw * 0.22, y - ph * 0.68)
  path.lineTo(x - pw * 0.48, y - ph * 0.66)
  path.lineTo(x, y - ph)
  path.lineTo(x + pw * 0.48, y - ph * 0.66)
  path.lineTo(x + pw * 0.22, y - ph * 0.68)
  path.lineTo(x + pw * 0.72, y - ph * 0.34)
  path.lineTo(x + pw * 0.3, y - ph * 0.36)
  path.lineTo(x + pw, y)
  path.closePath()
}

// ---------------------------------------------------------------------------------------------
// Ridge shapes

interface Peak {
  u: number
  w: number
  h: number
  /** Mesas: 0 table, 1 butte, 2 spire. */
  kind: number
}

interface Ridge {
  peaks: Peak[]
  sharp: number
  height(u: number): number
  extras(path: Path2D, W: number, s: number, yOf: (a: number) => number, base: number, rng: Rng, layer: number): void
}

function makeRidge(spec: LayerSpec, seed: number, zone: string): Ridge {
  const rng = createRng(`ridge:${zone}:${spec.style}:${seed.toFixed(3)}`)
  const amp = spec.amp
  const peaks: Peak[] = []
  const style = spec.style
  // Peaks on a jittered lattice wide enough for any screen (±1500 units).
  const spacing = style === 'mesa' ? 125 : style === 'alpine' ? 92 : style === 'peaks' ? 118 : 140
  for (let u = -1500; u <= 1500; u += spacing * rng.range(0.65, 1.35)) {
    const h = amp * rng.range(0.45, 1)
    const w = spacing * rng.range(0.75, 1.3) * (style === 'alpine' ? 0.95 : 1)
    const pu = u + rng.range(-0.25, 0.25) * spacing
    let kind = 0
    if (style === 'mesa') {
      const roll = rng.next()
      kind = roll < 0.5 ? 0 : roll < 0.82 ? 1 : 2
    }
    peaks.push({ u: pu, w: kind === 1 ? w * 0.55 : kind === 2 ? w * 0.18 : w, h: kind === 2 ? h * 0.9 : h, kind })
    // A smaller shoulder peak now and then, so ranges don't look like a saw.
    if ((style === 'alpine' || style === 'peaks') && rng.next() < 0.55) {
      const side = rng.next() < 0.5 ? -1 : 1
      peaks.push({ u: pu + side * w * rng.range(0.3, 0.5), w: w * 0.6, h: h * rng.range(0.5, 0.72), kind: 0 })
    }
  }
  const ph1 = rng.next() * 10
  const ph2 = rng.next() * 10

  const roll = (u: number) => amp * (0.28 + 0.12 * Math.sin(u / 61 + ph1) + 0.06 * Math.sin(u / 23 + ph2))
  const sharp = style === 'alpine' ? 1.25 : 1.7

  let height: (u: number) => number
  switch (style) {
    case 'peaks':
    case 'alpine': {
      height = (u) => {
        let best = roll(u) * 0.6
        for (const pk of peaks) {
          const d = Math.abs(u - pk.u) / pk.w
          if (d >= 1) continue
          // Rounded tip, straight-ish flanks.
          const k = Math.pow(1 - d, sharp) * (1 - (0.18 * Math.max(0, 0.12 - d)) / 0.12)
          const v = pk.h * k
          if (v > best) best = v
        }
        return best
      }
      break
    }
    case 'soft': {
      height = (u) => {
        let best = roll(u)
        for (const pk of peaks) {
          const d = (u - pk.u) / (pk.w * 0.9)
          if (d <= -1 || d >= 1) continue
          const v = pk.h * 0.85 * (0.5 + 0.5 * Math.cos(Math.PI * d))
          if (v > best) best = v
        }
        return best
      }
      break
    }
    case 'mesa': {
      height = (u) => {
        let best = roll(u) * 0.45
        for (const pk of peaks) {
          const d = Math.abs(u - pk.u) / (pk.w * 0.5)
          if (d >= 1.25) continue
          let v: number
          if (pk.kind === 2) {
            // A hoodoo: a thin spire with a cap rock.
            const k = d < 0.55 ? 1 - 0.25 * d : d < 1 ? 0.86 * Math.cos((Math.PI / 2) * ((d - 0.55) / 0.45)) : 0
            v = pk.h * k
          } else {
            // Flat top, steep sides with a little apron at the foot.
            const top = pk.h * (0.72 + 0.05 * Math.sin(pk.u))
            const k = d < 0.7 ? 1 : d < 0.95 ? 1 - ((d - 0.7) / 0.25) * 0.75 : Math.max(0, 0.25 - (d - 0.95) * 0.8)
            v = top * k
            // A step on one shoulder of the wide ones.
            if (pk.kind === 0 && d > 0.45 && d < 0.7 && u > pk.u) v = top * 0.86
          }
          if (v > best) best = v
        }
        return best
      }
      break
    }
    case 'cloudsea': {
      height = (u) => amp * (0.45 + 0.08 * Math.sin(u / 40 + ph1))
      break
    }
    case 'dunes': {
      height = (u) => {
        // Soft asymmetric dunes: long gentle backs, steeper fronts.
        const x = u / 120 + ph1
        const saw = x - Math.floor(x)
        const shape = saw < 0.7 ? saw / 0.7 : 1 - (saw - 0.7) / 0.3
        return amp * (0.35 + 0.45 * (0.5 - 0.5 * Math.cos(Math.PI * shape)) + 0.1 * Math.sin(u / 37 + ph2))
      }
      break
    }
    default: {
      // hills, trees, forest: rolling.
      height = (u) => amp * (0.55 + 0.25 * Math.sin(u / 83 + ph1) + 0.14 * Math.sin(u / 37 + ph2))
      break
    }
  }

  const extras: Ridge['extras'] = (path, W, s, yOf, base, r, layer) => {
    const k = Math.max(0.6, s * 0.6)
    if (style === 'trees') {
      // Round storybook trees dotted along the hill top, in clumps.
      for (let x = r.range(0, 30); x < W; x += r.range(26, 64) * k) {
        const u = (x - W / 2) / s
        const top = yOf(base + height(u))
        const rr = r.range(8, 13) * s * (0.7 + layer * 0.1)
        path.moveTo(x + rr, top - rr * 0.5)
        path.arc(x, top - rr * 0.5, rr, 0, Math.PI * 2)
        if (r.next() < 0.6) {
          const r2 = rr * r.range(0.6, 0.8)
          path.moveTo(x + rr * 0.85 + r2, top - r2 * 0.25)
          path.arc(x + rr * 0.85, top - r2 * 0.25, r2, 0, Math.PI * 2)
        }
      }
    } else if (style === 'forest') {
      // Pines shoulder to shoulder.
      for (let x = r.range(-10, 10); x < W + 20; x += r.range(8, 14) * Math.max(0.7, s * 0.7)) {
        const u = (x - W / 2) / s
        const top = yOf(base + height(u))
        const ph = r.range(18, 34) * s * (0.6 + layer * 0.1)
        const pw = ph * r.range(0.34, 0.44)
        path.moveTo(x - pw, top + 3)
        path.lineTo(x - pw * 0.25, top - ph * 0.55)
        path.lineTo(x - pw * 0.55, top - ph * 0.5)
        path.quadraticCurveTo(x, top - ph * 1.06, x + pw * 0.55, top - ph * 0.5)
        path.lineTo(x + pw * 0.25, top - ph * 0.55)
        path.lineTo(x + pw, top + 3)
        path.closePath()
      }
    } else if (style === 'cloudsea') {
      // Puffy cloud tops.
      for (let x = r.range(-20, 0); x < W + 30; x += r.range(22, 40) * Math.max(0.7, s * 0.7)) {
        const u = (x - W / 2) / s
        const top = yOf(base + height(u))
        const rr = r.range(12, 24) * s * 0.8
        path.moveTo(x + rr, top + rr * 0.3)
        path.arc(x, top + rr * 0.3, rr, 0, Math.PI * 2)
      }
    } else if (style === 'dunes') {
      // A few desert shrubs and a cactus-free scrub line.
      for (let x = r.range(0, 60); x < W; x += r.range(60, 160) * k) {
        const u = (x - W / 2) / s
        const top = yOf(base + height(u))
        const rr = r.range(3, 6) * s
        path.moveTo(x + rr, top)
        path.arc(x, top, rr, 0, Math.PI * 2)
      }
    }
  }

  return { peaks, sharp, height, extras }
}

/** Snow on the peaks: a jagged line with drips, a little bluer on the shadow side. */
function snowCaps(
  g: CanvasRenderingContext2D,
  ridge: Ridge,
  spec: LayerSpec,
  p: ZonePalette,
  W: number,
  s: number,
  yOf: (a: number) => number,
  base: number,
  shadowSide: number,
): void {
  const snow = p.snowcap ?? '#ffffff'
  g.fillStyle = snow
  g.globalAlpha = 0.92
  g.beginPath()
  g.moveTo(-2, 0)
  for (let x = -2; x <= W + 4; x += 3) {
    const u = (x - W / 2) / s
    const drip = Math.abs(Math.sin(u / 3.3)) * 7 + Math.max(0, Math.sin(u / 1.7)) * 5
    const line = base + spec.amp * 0.6 + Math.sin(u / 7) * 5 + Math.sin(u / 2.3) * 2.5 - drip
    g.lineTo(x, yOf(Math.min(line, ridge.height(u) + base - 2)))
  }
  g.lineTo(W + 4, 0)
  g.closePath()
  g.fill()
  g.globalAlpha = 1
  // Snow in shade (the far flank of each peak) is a little bluer.
  g.fillStyle = mix(snow, p.deep, 0.2)
  g.globalAlpha = 0.6
  for (const pk of ridge.peaks) {
    if (pk.h < spec.amp * 0.6) continue
    const tx = W / 2 + pk.u * s
    const ty = yOf(base + pk.h)
    g.beginPath()
    g.moveTo(tx, ty)
    g.lineTo(tx + shadowSide * pk.w * 0.8 * s, yOf(base + pk.h * 0.1))
    g.lineTo(tx + shadowSide * pk.w * 0.05 * s, yOf(base + pk.h * 0.35))
    g.closePath()
    g.fill()
  }
  g.globalAlpha = 1
}

/** Paper folds on the mountains: the flank away from the sun in shade, a lit crease down each peak. */
function peakFacets(
  g: CanvasRenderingContext2D,
  ridge: Ridge,
  spec: LayerSpec,
  p: ZonePalette,
  color: string,
  W: number,
  s: number,
  yOf: (a: number) => number,
  base: number,
  shadowSide: number,
): void {
  const shade = mix(color, p.deep, 0.35)
  g.fillStyle = shade
  for (const pk of ridge.peaks) {
    const tx = W / 2 + pk.u * s
    const ty = yOf(base + pk.h)
    g.globalAlpha = pk.h > spec.amp * 0.6 ? 0.42 : 0.3
    g.beginPath()
    g.moveTo(tx, ty)
    g.lineTo(tx + shadowSide * pk.w * 1.05 * s, yOf(base - 10))
    g.lineTo(tx + shadowSide * pk.w * 0.12 * s, yOf(base - 10))
    g.quadraticCurveTo(tx - shadowSide * pk.w * 0.05 * s, yOf(base + pk.h * 0.5), tx, ty)
    g.closePath()
    g.fill()
  }
  // A lit crease running down from each big peak on the sun side.
  g.strokeStyle = mix(color, p.rim, 0.6)
  g.lineWidth = 1.2
  g.globalAlpha = 0.5
  g.beginPath()
  for (const pk of ridge.peaks) {
    if (pk.h < spec.amp * 0.55) continue
    const tx = W / 2 + pk.u * s
    g.moveTo(tx, yOf(base + pk.h) + 2)
    g.quadraticCurveTo(tx - shadowSide * pk.w * 0.12 * s, yOf(base + pk.h * 0.55), tx - shadowSide * pk.w * 0.3 * s, yOf(base + pk.h * 0.1))
  }
  g.stroke()
  g.globalAlpha = 1
}

/** Sandstone mesas: stripes in warm tones, the shadow side of each tower, a lit cap. */
function mesaDetail(
  g: CanvasRenderingContext2D,
  ridge: Ridge,
  spec: LayerSpec,
  p: ZonePalette,
  color: string,
  W: number,
  s: number,
  yOf: (a: number) => number,
  base: number,
  shadowSide: number,
  rng: Rng,
): void {
  const tones = [mix(color, p.rim, 0.25), mix(color, p.deep, 0.18), mix(color, '#ff9a6a', 0.12), mix(color, p.deep, 0.08)]
  const stripe = Math.max(5, spec.amp * 0.1)
  for (let a = base - 10, q = 0; a < base + spec.amp; a += stripe * rng.range(0.7, 1.3), q++) {
    g.fillStyle = tones[q % tones.length]
    g.globalAlpha = 0.4
    g.beginPath()
    const ph = rng.next() * 9
    g.moveTo(-2, yOf(a))
    for (let x = -2; x <= W + 8; x += 8) g.lineTo(x, yOf(a + Math.sin(x / 40 + ph) * 1.2))
    for (let x = W + 8; x >= -2; x -= 8) g.lineTo(x, yOf(a + stripe * 0.5 + Math.sin(x / 40 + ph) * 1.2))
    g.closePath()
    g.fill()
  }
  g.globalAlpha = 0.38
  g.fillStyle = mix(color, p.deep, 0.4)
  for (const pk of ridge.peaks) {
    const cx = W / 2 + pk.u * s
    const half = pk.w * 0.5 * s
    const x0 = shadowSide > 0 ? cx + half * 0.35 : cx - half * 1.3
    g.fillRect(x0, yOf(base + pk.h + 4), half * 0.95, (pk.h + 14) * s)
  }
  g.globalAlpha = 1
}

/** A puffy paper-cut cloud: flat bottom, three to five bumps, a shaded underside, a soft shadow. */
export function paperCloud(
  g: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  stretch: number,
  color: string,
  shade: string,
  shadow: string,
  seed: number,
): void {
  const rng = createRng(`cloud:${seed.toFixed(3)}`)
  const w = size * stretch
  const bumps = 3 + rng.int(3)
  const path = new Path2D()
  const bottom = cy + size * 0.35
  path.moveTo(cx - w / 2, bottom)
  for (let i = 0; i < bumps; i++) {
    const k = (i + 0.5) / bumps
    const bx = cx - w / 2 + k * w
    const mid = 1 - Math.abs(k - 0.5) * 1.4
    const r = size * (0.32 + 0.38 * mid) * rng.range(0.85, 1.12)
    path.moveTo(bx + r, bottom - r * 0.55)
    path.arc(bx, bottom - r * 0.55, r, 0, Math.PI * 2)
  }
  path.moveTo(cx - w / 2 + size * 0.2, bottom)
  path.rect(cx - w / 2 + size * 0.2, bottom - size * 0.4, w - size * 0.4, size * 0.4)
  g.save()
  g.shadowColor = shadow
  g.shadowBlur = size * 0.35
  g.shadowOffsetY = size * 0.08
  g.fillStyle = color
  g.fill(path)
  g.restore()
  g.save()
  g.clip(path)
  g.globalAlpha = 0.55
  g.fillStyle = shade
  g.beginPath()
  g.ellipse(cx, bottom + size * 0.1, w * 0.62, size * 0.32, 0, 0, Math.PI * 2)
  g.fill()
  g.restore()
}
