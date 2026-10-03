/**
 * The far world: sky, sun or moon, stars, distant clouds and four layers of paper-cut mountains.
 *
 * Everything is pre-rendered offscreen and only composited per frame:
 * - the sky is a 4-px-wide gradient strip stretched over the screen (no per-frame gradients);
 * - each mountain layer is ONE viewport-wide "ridge band" (the silhouette edge with its soft paper
 *   shadow, rim light and grain) at DPR 1; below the band the layer is a flat colour (fillRect);
 * - distant clouds live in viewport-wide tiles ≤ 2048 px tall, generated lazily as the camera rises
 *   and dropped when they scroll away;
 * - the sun/moon (with its glow) is the frame's one radial light sprite.
 * Layers scroll vertically with parallax factors; nothing scrolls sideways (the camera only moves up).
 * Rebuilt on resize. Seeded randomness only, so a zone always looks the same.
 */
import type { Camera } from '../camera'
import { createRng } from '../../model/rng'
import { mix, rgba } from '../art/rig'
import { freeCanvas, makeCanvas, type View } from './effects'
import type { ZonePalette } from './palette'

type LayerStyle = 'peaks' | 'soft' | 'hills' | 'trees' | 'forest' | 'mesa' | 'alpine' | 'cloudsea'

interface LayerSpec {
  style: LayerStyle
  /** Parallax factor (0 = fixed to the screen, 1 = moves with the rock face). */
  f: number
  /** Ridge base at the foot of the pitch, in units above the screen centre. */
  d0: number
  /** Ridge height above the base (units). */
  amp: number
  /** Snow caps on this layer. */
  snow: boolean
}

const FACTORS = [0.05, 0.12, 0.22, 0.36]

function specs(p: ZonePalette): LayerSpec[] {
  const snow = p.snowcap !== null
  const L = (style: LayerStyle, i: number, d0: number, amp: number, s = false): LayerSpec => ({ style, f: FACTORS[i], d0, amp, snow: s && snow })
  switch (p.zone) {
    case 'meadow':
      return [L('peaks', 0, 170, 170, true), L('peaks', 1, 100, 120), L('trees', 2, 0, 56), L('trees', 3, -120, 44)]
    case 'hollow':
      return [L('soft', 0, 220, 130), L('hills', 1, 120, 90), L('forest', 2, 0, 60), L('forest', 3, -120, 50)]
    case 'crumble':
      return [L('mesa', 0, 220, 120), L('mesa', 1, 120, 110), L('mesa', 2, 10, 80), L('hills', 3, -120, 40)]
    case 'ridge':
      return [L('alpine', 0, 240, 170, true), L('alpine', 1, 130, 150, true), L('alpine', 2, 0, 110, true), L('forest', 3, -130, 50)]
    case 'cloud':
      return [L('peaks', 0, 200, 170, true), L('alpine', 1, 80, 140, true), L('cloudsea', 2, -10, 40), L('cloudsea', 3, -140, 46)]
    case 'summit':
    default:
      return [L('alpine', 0, 120, 170, true), L('alpine', 1, 10, 140, true), L('peaks', 2, -110, 110, true), L('cloudsea', 3, -230, 50)]
  }
}

interface Band {
  canvas: HTMLCanvasElement | null
  /** Layer altitude range covered by the canvas. */
  aLo: number
  aHi: number
  /** Ridge base altitude (layer units). */
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

const BAND_PAD_BELOW = 60
const BAND_PAD_ABOVE = 50
const MAX_STRIP = 2048
const CLOUD_F = 0.09
/** Layer units per cloud tile. */
const CLOUD_TILE = 700

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
  private stars: HTMLCanvasElement | null = null
  private sun: HTMLCanvasElement | null = null
  private sunSize = 0
  private readonly layers: LayerSpec[]
  private bands: (Band | null)[] = [null, null, null, null]
  private readonly cloudTiles = new Map<number, CloudSprite[]>()
  private startC = 0
  private twinkle: Float32Array = new Float32Array(0)

  constructor(
    private readonly palette: ZonePalette,
    private readonly seed: string,
  ) {
    this.layers = specs(palette)
  }

  /** (Re)build for a new viewport. `startCenterY` = the camera's lowest centre (foot of the pitch). */
  resize(view: View, startCenterY: number): void {
    this.release()
    this.w = view.w
    this.h = view.h
    this.base = view.base
    this.dpr = view.dpr
    this.startC = startCenterY
    this.sky = this.buildSky()
    const rng = createRng(`${this.seed}:twinkle`)
    const n = this.palette.stars > 0 ? 14 : 0
    this.twinkle = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      this.twinkle[i * 3] = rng.next()
      this.twinkle[i * 3 + 1] = rng.range(0.05, 0.55)
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

    if (this.sky) ctx.drawImage(this.sky, 0, 0, w, h)
    this.drawStars(ctx, camera, t)
    this.drawSun(ctx, camera)
    this.drawLayer(ctx, 0, camera, cy0)
    this.drawClouds(ctx, camera, cy0)
    for (let i = 1; i < this.layers.length; i++) this.drawLayer(ctx, i, camera, cy0)

    if (clipped) ctx.restore()
  }

  // -------------------------------------------------------------------------------------------
  // Sky, stars, sun

  private buildSky(): HTMLCanvasElement {
    const h = Math.max(2, Math.round(this.h))
    const c = makeCanvas(4, h)
    const g = c.getContext('2d')
    if (g) {
      const grad = g.createLinearGradient(0, 0, 0, h)
      for (const s of this.palette.sky) grad.addColorStop(s.at, s.color)
      g.fillStyle = grad
      g.fillRect(0, 0, 4, h)
    }
    return c
  }

  private drawStars(ctx: CanvasRenderingContext2D, camera: Camera, t: number): void {
    const p = this.palette
    if (p.stars <= 0) return
    if (!this.stars) this.stars = this.buildStars()
    const s = this.stars
    if (!s) return
    const h = this.h
    // Stars drift down very slowly as she climbs; the field wraps.
    let off = (camera.centerY * 0.02 * this.base) % h
    if (off < 0) off += h
    ctx.globalAlpha = p.night ? 1 : 0.5
    ctx.drawImage(s, 0, off, this.w, h)
    ctx.drawImage(s, 0, off - h, this.w, h)
    // A few twinkling ones.
    const tw = this.twinkle
    ctx.fillStyle = '#ffffff'
    for (let i = 0; i < tw.length; i += 3) {
      const a = 0.5 + 0.5 * Math.sin(t * (1.3 + tw[i + 2] * 0.15) + tw[i + 2])
      ctx.globalAlpha = a * (p.night ? 0.95 : 0.45)
      const x = tw[i] * this.w
      let y = tw[i + 1] * h + off
      if (y > h) y -= h
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
      const y = Math.pow(rng.next(), 1.6) * this.h * 0.8
      const r = rng.next() < 0.12 ? rng.range(1.1, 1.6) : rng.range(0.4, 0.9)
      g.globalAlpha = rng.range(0.35, 0.95)
      g.fillStyle = rng.next() < 0.2 ? '#ffe9c4' : '#ffffff'
      g.beginPath()
      g.arc(x, y, r, 0, Math.PI * 2)
      g.fill()
    }
    return c
  }

  private drawSun(ctx: CanvasRenderingContext2D, camera: Camera): void {
    const cel = this.palette.celestial
    if (!this.sun) this.buildSun()
    if (!this.sun) return
    const size = this.sunSize
    const x = cel.x * this.w
    // Sinks very slowly as she climbs.
    const y = cel.y * this.h + (camera.centerY - this.startC) * 0.03 * this.base
    if (y - size / 2 > this.h) return
    ctx.drawImage(this.sun, x - size / 2, y - size / 2, size, size)
  }

  private buildSun(): void {
    const cel = this.palette.celestial
    const r = cel.r * Math.max(0.8, Math.min(1.4, this.base))
    const size = r * 7
    const px = Math.ceil(size * this.dpr)
    const c = makeCanvas(px, px)
    const g = c.getContext('2d')
    this.sun = c
    this.sunSize = size
    if (!g) return
    g.scale(this.dpr, this.dpr)
    const m = size / 2
    const glow = g.createRadialGradient(m, m, r * 0.6, m, m, m)
    glow.addColorStop(0, rgba(cel.glow, cel.kind === 'sun' ? 0.55 : 0.4))
    glow.addColorStop(0.35, rgba(cel.glow, 0.16))
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

  // -------------------------------------------------------------------------------------------
  // Mountain layers

  private drawLayer(ctx: CanvasRenderingContext2D, i: number, camera: Camera, cy0: number): void {
    const spec = this.layers[i]
    let band = this.bands[i]
    if (!band) {
      band = this.buildBand(i)
      this.bands[i] = band
    }
    const yTop = this.layerY(band.aHi, spec.f, camera, cy0)
    const yBot = this.layerY(band.aLo, spec.f, camera, cy0)
    if (yTop > this.h) return
    if (band.canvas && yBot > 0) ctx.drawImage(band.canvas, -16, yTop, this.w + 32, yBot - yTop)
    if (yBot < this.h) {
      ctx.fillStyle = band.below
      ctx.fillRect(0, Math.max(0, yBot - 1), this.w, this.h - Math.max(0, yBot - 1))
    }
  }

  private buildBand(i: number): Band {
    const spec = this.layers[i]
    const p = this.palette
    const color = p.mountains[i]
    const below = mix(color, p.haze, 0.18 + 0.08 * (3 - i))
    const base = spec.d0 + this.startC * spec.f
    const aLo = base - BAND_PAD_BELOW
    const aHi = base + spec.amp + BAND_PAD_ABOVE
    const band: Band = { canvas: null, aLo, aHi, base, below }
    const s = this.base
    const W = this.w + 32
    const H = Math.min(MAX_STRIP, (aHi - aLo) * s)
    const c = makeCanvas(W, H)
    const g = c.getContext('2d')
    if (!g) return band
    band.canvas = c
    const rng = createRng(`${this.seed}:layer:${i}`)
    // Band coords: x px from the band's left edge; layer unit u = (x − W/2) / s.
    const yOf = (a: number) => (aHi - a) * s
    const ridge = makeRidge(spec, rng.next() * 1000, p.zone)
    const path = new Path2D()
    const step = 5
    path.moveTo(0, H + 2)
    for (let x = 0; x <= W + step; x += step) {
      const u = (x - W / 2) / s
      path.lineTo(x, yOf(base + ridge.height(u)))
    }
    path.lineTo(W, H + 2)
    path.closePath()
    // Extras sticking up from the ridge (trees, cloud puffs) joined into the same silhouette.
    ridge.extras(path, W, s, yOf, base, rng)

    // Paper shadow: a soft halo the layer casts on the one behind it, and a light cut edge (the
    // same silhouette, lighter, nudged up 1.5 px under the main fill).
    g.save()
    g.shadowColor = p.shadow
    g.shadowBlur = 14
    g.shadowOffsetY = -3
    g.translate(0, -1.5)
    g.fillStyle = mix(color, '#ffffff', 0.38)
    g.fill(path)
    g.restore()
    const grad = g.createLinearGradient(0, yOf(base + spec.amp), 0, H)
    grad.addColorStop(0, color)
    grad.addColorStop(1, below)
    g.fillStyle = grad
    g.fill(path)

    // Snow caps (clipped to the silhouette).
    if (spec.snow && p.snowcap) {
      g.save()
      g.clip(path)
      g.fillStyle = p.snowcap
      g.beginPath()
      g.moveTo(0, 0)
      for (let x = 0; x <= W + step; x += step) {
        const u = (x - W / 2) / s
        const line = base + spec.amp * 0.68 + Math.sin(u / 7) * 5 + Math.sin(u / 2.3) * 2.5
        g.lineTo(x, yOf(line))
      }
      g.lineTo(W, 0)
      g.closePath()
      g.globalAlpha = 0.9
      g.fill()
      g.restore()
    }

    g.save()
    g.clip(path)
    // Paper grain: speckles drawn once.
    const n = Math.round((W * H) / 260)
    const dark = mix(color, p.ink, 0.35)
    const light = mix(color, '#ffffff', 0.45)
    for (let k = 0; k < n; k++) {
      g.globalAlpha = rng.range(0.05, 0.12)
      g.fillStyle = k % 2 ? dark : light
      g.fillRect(rng.next() * W, rng.next() * H, 1, 1)
    }
    g.restore()
    return band
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
    for (const [k, list] of this.cloudTiles) {
      if (k < k0 - 1 || k > k1 + 1) {
        for (const c of list) freeCanvas(c.canvas)
        this.cloudTiles.delete(k)
      }
    }
    const cx = this.w / 2
    for (let k = k0; k <= k1; k++) {
      let list = this.cloudTiles.get(k)
      if (!list) {
        list = this.buildCloudTile(k)
        this.cloudTiles.set(k, list)
      }
      for (const c of list) {
        const y = this.layerY(c.a, f, camera, cy0)
        const x = cx + c.u * s
        ctx.drawImage(c.canvas, x - c.w / 2, y - c.h / 2, c.w, c.h)
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
    const count = 1 + rng.int(3)
    const halfU = this.w / 2 / s + 60
    for (let i = 0; i < count; i++) {
      const a = (k + rng.next()) * CLOUD_TILE
      const u = rng.range(-halfU, halfU)
      if (a < floor) continue
      const size = rng.range(22, 40)
      const stretch = rng.range(1.7, 2.8)
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
    this.bands = [null, null, null, null]
    for (const list of this.cloudTiles.values()) for (const c of list) freeCanvas(c.canvas)
    this.cloudTiles.clear()
  }

  destroy(): void {
    this.release()
  }
}

// ---------------------------------------------------------------------------------------------
// Ridge shapes

interface Peak {
  u: number
  w: number
  h: number
}

interface Ridge {
  height(u: number): number
  extras(path: Path2D, W: number, s: number, yOf: (a: number) => number, base: number, rng: ReturnType<typeof createRng>): void
}

function makeRidge(spec: LayerSpec, seed: number, zone: string): Ridge {
  const rng = createRng(`ridge:${zone}:${spec.style}:${seed.toFixed(3)}`)
  const amp = spec.amp
  const peaks: Peak[] = []
  // Peaks on a jittered lattice wide enough for any screen (±1400 units).
  const spacing = spec.style === 'mesa' ? 150 : spec.style === 'alpine' ? 95 : spec.style === 'peaks' ? 120 : 140
  for (let u = -1500; u <= 1500; u += spacing * rng.range(0.65, 1.35)) {
    const h = amp * rng.range(0.45, 1)
    const w = spacing * rng.range(0.75, 1.3) * (spec.style === 'alpine' ? 0.95 : 1)
    const pu = u + rng.range(-0.25, 0.25) * spacing
    peaks.push({ u: pu, w, h })
    // A smaller shoulder peak now and then, so ranges don't look like a saw.
    if ((spec.style === 'alpine' || spec.style === 'peaks') && rng.next() < 0.55) {
      const side = rng.next() < 0.5 ? -1 : 1
      peaks.push({ u: pu + side * w * rng.range(0.3, 0.5), w: w * 0.6, h: h * rng.range(0.5, 0.72) })
    }
  }
  const ph1 = rng.next() * 10
  const ph2 = rng.next() * 10

  const roll = (u: number) => amp * (0.28 + 0.12 * Math.sin(u / 61 + ph1) + 0.06 * Math.sin(u / 23 + ph2))

  let height: (u: number) => number
  switch (spec.style) {
    case 'peaks':
    case 'alpine': {
      const sharp = spec.style === 'alpine' ? 1.25 : 1.7
      height = (u) => {
        let best = roll(u) * 0.6
        for (const pk of peaks) {
          const d = Math.abs(u - pk.u) / pk.w
          if (d >= 1) continue
          // Rounded tip, straight-ish flanks.
          const k = Math.pow(1 - d, sharp) * (1 - 0.18 * Math.max(0, 0.12 - d) / 0.12)
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
        let best = roll(u) * 0.5
        for (const pk of peaks) {
          const d = Math.abs(u - pk.u) / (pk.w * 0.5)
          if (d >= 1) continue
          // Flat top with rounded shoulders.
          const k = d < 0.62 ? 1 : 0.5 + 0.5 * Math.cos(Math.PI * (d - 0.62) / 0.38)
          const v = pk.h * (0.72 + 0.04 * Math.sin(pk.u)) * k
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
    default: {
      // hills, trees, forest: rolling.
      height = (u) => amp * (0.55 + 0.25 * Math.sin(u / 83 + ph1) + 0.14 * Math.sin(u / 37 + ph2))
      break
    }
  }

  const extras: Ridge['extras'] = (path, W, s, yOf, base, r) => {
    const style = spec.style
    if (style === 'trees') {
      // Round storybook trees dotted along the hill top.
      for (let x = r.range(0, 30); x < W; x += r.range(28, 70) * Math.max(0.6, s * 0.6)) {
        const u = (x - W / 2) / s
        const top = yOf(base + height(u))
        const rr = r.range(9, 15) * s
        path.moveTo(x + rr, top - rr * 0.5)
        path.arc(x, top - rr * 0.5, rr, 0, Math.PI * 2)
        if (r.next() < 0.5) {
          const r2 = rr * 0.7
          path.moveTo(x + rr * 0.8 + r2, top - r2 * 0.2)
          path.arc(x + rr * 0.8, top - r2 * 0.2, r2, 0, Math.PI * 2)
        }
      }
    } else if (style === 'forest') {
      // Pines shoulder to shoulder.
      for (let x = r.range(-10, 10); x < W + 20; x += r.range(9, 15) * Math.max(0.7, s * 0.7)) {
        const u = (x - W / 2) / s
        const top = yOf(base + height(u))
        const ph = r.range(18, 34) * s * (spec.f < 0.3 ? 0.75 : 1)
        const pw = ph * r.range(0.36, 0.46)
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
    }
  }

  return { height, extras }
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
