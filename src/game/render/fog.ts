/**
 * Cloud Steps fog (p13–p15 thick, the summit lightly; no fog anywhere else).
 *
 * - Drifting bands: soft, tileable strips of fog, pre-rendered once per resize (DPR 1: it is soft),
 *   drifting slowly sideways and with a little vertical parallax against the rock, thin enough that
 *   ordinary next ledges stay readable.
 * - Big Leap banks: a thick bank over each Big Leap's landing, so she can't see where she will land
 *   from the take-off. It thins away once she stands at (or above) the landing and comes back when
 *   the rope brings her below it again.
 * - While she stands at a Big Leap's take-off (or is in the air on it) the landing's outline glows
 *   faintly ABOVE the fog: she always knows there is somewhere to land.
 *
 * Visual only — never affects physics. Draw it after the ledges; chalk, the ghost, the preview and
 * the climber go on top (the renderer orders that). ctx in CSS px.
 */
import { createRng } from '../../model/rng'
import { mix, rgba } from '../art/rig'
import type { Camera } from '../camera'
import type { ClimbSession } from '../engine'
import { LEDGE_H, type Ledge, type Level, type ZoneId } from '../types'
import { clamp01, freeCanvas, makeCanvas, smoothstep, softDot, View } from './effects'
import { paletteFor, type ZonePalette } from './palette'

export interface FogTarget {
  /** Left edge, top surface altitude and width of the Big Leap's landing ledge. */
  x: number
  y: number
  w: number
}

export interface FogInfo {
  /** The landing of the Big Leap she is standing at (or flying on); null otherwise. */
  bigLeapTarget: FogTarget | null
  /** Her feet (world). A Big Leap's bank thins once she is at or above its landing. */
  her?: { x: number; y: number } | null
  /**
   * Drawn on the fog, under the landing outline: pass `() => scary.drawOnFog(ctx, camera, t)` so the
   * Cloud Steps giant shadow (and its marmot) sit on the fog. ctx is in CSS px when it is called.
   */
  onFog?: (() => void) | null
}

export interface FogOptions {
  /** The pitch (for its Big Leap banks). Can also be set later with setLevel(). */
  level?: Level | null
  night?: boolean
}

interface Strength {
  /** Peak alpha of the drifting bands. */
  band: number
  /** Altitude between bands (parallax space). */
  spacing: number
  /** Peak alpha of a Big Leap bank (before it thins). */
  bank: number
}

const STRENGTH: Partial<Record<ZoneId, Strength>> = {
  cloud: { band: 0.5, spacing: 270, bank: 0.95 },
  summit: { band: 0.24, spacing: 380, bank: 0.5 },
}

/** Band tile size (world units). */
const TILE_W = 520
const BAND_H = 150
/** Bank texture size (world units). */
const BANK_W = 300
const BANK_H = 200

interface Bank {
  to: Ledge
  x0: number
  x1: number
  y0: number
  y1: number
  /** 1 = thick, eases towards ~0.15 while she is at or above the landing. */
  thick: number
  seed: number
}

/** The landing she is about to leap for, if she stands at a Big Leap's take-off or is flying on one. */
export function bigLeapTarget(session: ClimbSession): FogTarget | null {
  const s = session
  if (s.phase !== 'ready' && s.phase !== 'flying') return null
  const b = (s.level.bigLeaps ?? []).find((l) => l.from === s.elementId)
  if (!b) return null
  const el = s.index.byId.get(b.to)
  if (!el || el.kind !== 'ledge') return null
  return { x: el.x, y: el.y, w: el.w }
}

export class FogLayer {
  /** False outside Cloud Steps and the summit: every call is then a no-op. */
  readonly active: boolean
  private readonly pal: ZonePalette
  private readonly strength: Strength
  private readonly view = new View()
  private banks: Bank[] = []
  private band: HTMLCanvasElement | null = null
  private bank: HTMLCanvasElement | null = null
  private k = 0
  private clock = 0
  private outline = 0
  private lastTarget: FogTarget | null = null
  private readonly herAt = { x: 0, y: -1e9 }

  constructor(zone: ZoneId, opts: FogOptions = {}) {
    const st = STRENGTH[zone]
    this.active = !!st
    this.strength = st ?? { band: 0, spacing: 1000, bank: 0 }
    this.pal = paletteFor(zone, !!opts.night)
    if (opts.level) this.setLevel(opts.level)
  }

  /** The pitch whose Big Leap landings get a thick bank. */
  setLevel(level: Level | null): void {
    this.banks = []
    if (!level || !this.active) return
    let i = 0
    for (const b of level.bigLeaps ?? []) {
      const from = level.elements.find((e) => e.id === b.from)
      const to = level.elements.find((e) => e.id === b.to)
      if (!from || !to || from.kind !== 'ledge' || to.kind !== 'ledge') continue
      const right = to.x + to.w / 2 > from.x + from.w / 2
      // From just past the take-off edge over the whole landing (and a little beyond it).
      const x0 = right ? Math.min(from.x + from.w + 6, to.x - 20) : to.x - 46
      const x1 = right ? to.x + to.w + 46 : Math.max(from.x - 6, to.x + to.w + 20)
      this.banks.push({ to, x0, x1, y0: to.y - 96, y1: to.y + 92, thick: 1, seed: i++ * 1.7 })
    }
  }

  /** Rebuild the pre-rendered textures for a new size. */
  resize(camera: Camera): void {
    if (!this.active) return
    this.view.from(camera)
    const k = this.view.base
    if (this.band && Math.abs(k - this.k) < 1e-3) return
    this.free()
    this.k = k
  }

  update(dt: number): void {
    if (!this.active) return
    const d = Math.min(0.1, Math.max(0, dt))
    this.clock += d
    const ease = 1 - Math.exp(-1.8 * d)
    for (const b of this.banks) {
      // Thin once she is standing at or above the landing.
      const above = this.herAt.y >= b.to.y - 8
      b.thick += ((above ? 0 : 1) - b.thick) * ease
    }
    const want = this.lastTarget ? 1 : 0
    this.outline += (want - this.outline) * (1 - Math.exp(-4 * d))
  }

  draw(ctx: CanvasRenderingContext2D, camera: Camera, t: number, info: FogInfo): void {
    if (!this.active) return
    const v = this.view.from(camera)
    if (Math.abs(v.base - this.k) > 1e-3 || !this.band) this.resize(camera)
    if (info.her) {
      this.herAt.x = info.her.x
      this.herAt.y = info.her.y
    }
    if (info.bigLeapTarget) this.lastTarget = info.bigLeapTarget
    else if (this.outline < 0.01) this.lastTarget = null
    const want = info.bigLeapTarget !== null
    ctx.save()
    v.applyScreen(ctx)
    this.drawBands(ctx, v, t)
    this.drawBanks(ctx, v, t)
    if (info.onFog) {
      ctx.save()
      info.onFog()
      ctx.restore()
      v.applyScreen(ctx)
    }
    if (this.lastTarget && (want || this.outline > 0.01)) this.drawOutline(ctx, v, t, this.lastTarget, want ? Math.max(this.outline, 0.05) : this.outline)
    ctx.restore()
  }

  /** Cached offscreen pixels (lab/debug). */
  cachedPixels(): number {
    return (this.band ? this.band.width * this.band.height : 0) + (this.bank ? this.bank.width * this.bank.height : 0)
  }

  destroy(): void {
    this.free()
    this.banks = []
  }

  // -------------------------------------------------------------------------------------------

  private free(): void {
    freeCanvas(this.band)
    freeCanvas(this.bank)
    this.band = null
    this.bank = null
  }

  private fogColor(): string {
    return mix(this.pal.mist, '#ffffff', 0.2)
  }

  private buildBand(): HTMLCanvasElement {
    const k = Math.max(0.5, this.k)
    const w = Math.round(TILE_W * k)
    const h = Math.round(BAND_H * k)
    const c = makeCanvas(w, h)
    const g = c.getContext('2d')
    if (!g) return c
    g.scale(k, k)
    const dot = softDot(64, this.fogColor(), 0.16)
    const shade = softDot(64, mix(this.pal.mist, this.pal.faceDark, 0.25), 0.2)
    const rng = createRng(`fog-band:${this.pal.zone}`)
    // Soft puffs packed along the middle, tileable (each is also drawn one tile left and right).
    for (let i = 0; i < 26; i++) {
      const x = rng.range(0, TILE_W)
      const pw = rng.range(90, 190)
      const ph = pw * rng.range(0.32, 0.5)
      const y = BAND_H / 2 + rng.range(-BAND_H * 0.16, BAND_H * 0.16)
      const sprite = i % 5 === 0 ? shade : dot
      g.globalAlpha = rng.range(0.45, 0.85) * (sprite === shade ? 0.4 : 1)
      for (const dx of [-TILE_W, 0, TILE_W]) g.drawImage(sprite, x + dx - pw / 2, y - ph / 2, pw, ph)
    }
    g.globalAlpha = 1
    freeCanvas(dot)
    freeCanvas(shade)
    return c
  }

  private buildBank(): HTMLCanvasElement {
    const k = Math.max(0.5, this.k * 0.8)
    const w = Math.round(BANK_W * k)
    const h = Math.round(BANK_H * k)
    const c = makeCanvas(w, h)
    const g = c.getContext('2d')
    if (!g) return c
    g.scale(k, k)
    const dot = softDot(64, this.fogColor(), 0.22)
    const rng = createRng(`fog-bank:${this.pal.zone}`)
    // A thick, rounded cloud mass: dense in the middle, soft all round the edge.
    for (let i = 0; i < 46; i++) {
      const a = rng.range(0, Math.PI * 2)
      const r = Math.sqrt(rng.next()) * 0.62
      const x = BANK_W / 2 + Math.cos(a) * r * BANK_W * 0.62
      const y = BANK_H / 2 + Math.sin(a) * r * BANK_H * 0.6
      const pw = rng.range(80, 150) * (1 - r * 0.5)
      const ph = pw * rng.range(0.55, 0.8)
      g.globalAlpha = rng.range(0.55, 0.95)
      g.drawImage(dot, x - pw / 2, y - ph / 2, pw, ph)
    }
    g.globalAlpha = 1
    freeCanvas(dot)
    return c
  }

  /** Drifting bands, with a little vertical parallax (two depths). */
  private drawBands(ctx: CanvasRenderingContext2D, v: View, t: number): void {
    const st = this.strength
    if (st.band <= 0) return
    if (!this.band) this.band = this.buildBand()
    const tex = this.band
    const camY = (v.top + v.bottom) / 2
    const tileW = TILE_W * v.s
    const bandH = BAND_H * v.s
    for (let layer = 0; layer < 2; layer++) {
      const f = layer === 0 ? 0.86 : 1.1
      const shift = camY * (1 - f)
      const spacing = st.spacing
      const phase = layer * spacing * 0.5
      const lo = Math.floor((v.bottom - BAND_H - shift - phase) / spacing)
      const hi = Math.ceil((v.top + BAND_H - shift - phase) / spacing)
      for (let i = lo; i <= hi; i++) {
        const alt = i * spacing + phase + shift
        const y = v.y(alt) - bandH / 2 + Math.sin(t * 0.21 + i * 1.3) * 3 * v.s
        if (y > v.h || y + bandH < 0) continue
        const speed = (layer === 0 ? 5 : 8) * (i % 2 === 0 ? 1 : -1)
        const drift = (((t * speed + i * 137) % TILE_W) + TILE_W) % TILE_W
        const a = st.band * (layer === 0 ? 0.8 : 1) * (0.75 + 0.25 * Math.sin(i * 2.7 + 1))
        ctx.globalAlpha = a
        let x = v.x(-TILE_W + drift)
        while (x > 0) x -= tileW
        for (; x < v.w; x += tileW) ctx.drawImage(tex, x, y, tileW, bandH)
      }
    }
    ctx.globalAlpha = 1
  }

  /** Thick fog over each Big Leap's landing. */
  private drawBanks(ctx: CanvasRenderingContext2D, v: View, t: number): void {
    if (!this.banks.length) return
    for (const b of this.banks) {
      if (b.y1 + 40 < v.bottom || b.y0 - 40 > v.top) continue
      if (!this.bank) this.bank = this.buildBank()
      const tex = this.bank
      const alpha = this.strength.bank * (0.15 + 0.85 * b.thick)
      if (alpha <= 0.01) continue
      const w = b.x1 - b.x0
      const h = b.y1 - b.y0
      // Two overlapping copies breathing past each other.
      for (let i = 0; i < 2; i++) {
        const dx = Math.sin(t * (0.23 + i * 0.07) + b.seed + i * 2) * 14
        const dy = Math.cos(t * (0.17 + i * 0.05) + b.seed) * 6
        const grow = i === 0 ? 1.08 : 0.9
        const cx = (b.x0 + b.x1) / 2 + dx
        const cy = (b.y0 + b.y1) / 2 + dy
        ctx.globalAlpha = alpha * (i === 0 ? 0.9 : 0.75)
        ctx.drawImage(tex, v.x(cx - (w * grow) / 2), v.y(cy + (h * grow) / 2), w * grow * v.s, h * grow * v.s)
      }
    }
    ctx.globalAlpha = 1
  }

  /** The landing's outline, faint and steady, above the fog. */
  private drawOutline(ctx: CanvasRenderingContext2D, v: View, t: number, target: FogTarget, a: number): void {
    const alpha = clamp01(a) * (0.82 + 0.18 * Math.sin(t * 2.4))
    if (alpha <= 0.01) return
    const p = this.pal
    const x0 = v.x(target.x)
    const x1 = v.x(target.x + target.w)
    const top = v.y(target.y)
    const s = v.s
    const depth = LEDGE_H * s
    const r = 9 * s
    ctx.save()
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    // A soft silhouette of the slab.
    ctx.beginPath()
    ctx.moveTo(x0 + r * 0.4, top)
    ctx.lineTo(x1 - r * 0.4, top)
    ctx.quadraticCurveTo(x1 + 2 * s, top + 2 * s, x1 - r * 0.6, top + depth * 0.6)
    ctx.quadraticCurveTo((x0 + x1) / 2, top + depth * 1.25, x0 + r * 0.6, top + depth * 0.6)
    ctx.quadraticCurveTo(x0 - 2 * s, top + 2 * s, x0 + r * 0.4, top)
    ctx.closePath()
    ctx.fillStyle = rgba(mix(p.rockDark, p.mist, 0.3), 0.32 * alpha)
    ctx.fill()
    ctx.setLineDash([5 * s, 4 * s])
    ctx.lineDashOffset = -t * 6 * s
    ctx.strokeStyle = rgba(mix(p.ink, p.rockDark, 0.4), 0.6 * alpha)
    ctx.lineWidth = Math.max(1, 1.4 * s)
    ctx.stroke()
    ctx.setLineDash([])
    // The landing surface: a warm, steady line to aim for.
    const glow = smoothstep(alpha)
    ctx.beginPath()
    ctx.moveTo(x0 + r * 0.4, top)
    ctx.lineTo(x1 - r * 0.4, top)
    ctx.strokeStyle = rgba(p.lanternGlow, 0.45 * glow)
    ctx.lineWidth = Math.max(4, 7 * s)
    ctx.stroke()
    ctx.strokeStyle = rgba(mix(p.lantern, p.flag, 0.25), 0.95 * alpha)
    ctx.lineWidth = Math.max(1.5, 2.4 * s)
    ctx.stroke()
    ctx.restore()
  }
}
