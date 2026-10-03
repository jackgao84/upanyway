/**
 * Looks Scary set-pieces: the one thing in each zone that looks scary from the camp below and turns
 * out gentle up close.
 *
 *   bigleap  Meadow          a misty drop under the first Big Leap → the mist parts on a meadow pool
 *   eyes     Firefly Hollow  glowing eyes blinking in a cave → they lift off as fireflies, the cave glows
 *   rumble   Crumble Cliffs  a rumbling cliff and a dark cave → a big fluffy bear, fast asleep, snoring
 *   bridge   Gusty Ridge     a rickety rope bridge creaking in the wind → it sways, and it holds
 *   shadow   Cloud Steps     a giant horned shadow on the fog → a tiny backlit marmot, waving
 *
 * Phases: 'looming' (not met up close yet), 'revealing' (the gentle reveal is playing; it becomes
 * 'revealed' by itself after revealDuration()), 'revealed' (seen before: always drawn gentle), and
 * 'hidden' (draws nothing). The climb screen picks the phase; this layer only draws, asks for sounds
 * (onCue) and gives the camera a gentle rumble (Camera.shake, which does nothing under reduced motion).
 * It never touches physics.
 *
 * Draw slots (ctx in CSS px, like the renderer's hooks):
 * - draw()      behind the ledges (the drop, the caves, the bear, the bridge's loose planks)
 * - drawOnFog() on the Cloud Steps fog, under the Big Leap landing outline — pass it as the fog's
 *               `onFog` (the giant shadow, the sun behind the marmot, the marmot)
 * - drawFront() over everything (fireflies, wisps, pebbles, Zzz, sparkles)
 * Per frame: update(dt, camera, herFeet) once, then the three draws. The camera eases to focus()
 * during the reveal and to forecastFocus() during the Fear Forecast. The rope bridge's missing
 * planks are bridgeGaps() (the terrain's bridge leaves them out). destroy() on unmount.
 *
 * Static art is pre-rendered into world-locked sprites (rebuilt when the scale changes, e.g. on a
 * resize); per frame it is a few drawImage calls and small vector bits. At most one radial light
 * sprite per frame (the warm cave glow, or the sun behind the marmot).
 */
import { createRng, type Rng } from '../../model/rng'
import { ink, mix, rgba } from '../art/rig'
import type { Camera } from '../camera'
import { TUNING } from '../tuning'
import { WORLD_W, type Ledge, type Level, type LevelElement, type LooksScary, type LooksScaryKind } from '../types'
import { bump, clamp01, easeInOutSine, easeOutBack, easeOutCubic, freeCanvas, lerp, makeCanvas, smoothstep, softDot, View } from './effects'
import { paletteFor, type ZonePalette } from './palette'

const TAU = Math.PI * 2
const MAX_PX = 2048

export type ScaryPhase = 'hidden' | 'looming' | 'revealing' | 'revealed'

/**
 * Sounds the layer asks for: rumble → sfx.rumble() (the bear's snore heard from far off — never the
 * crumbly-ledge sound, which means something else in that zone), snore → sfx.snore(),
 * creak → sfx.creak(), sparkle → sfx.reveal(). Ambient cues (the rumble, the creaks, the snores) only
 * fire while the thing is near the view.
 */
export type ScaryCue = 'rumble' | 'snore' | 'creak' | 'sparkle'

export interface ScaryPoint {
  x: number
  y: number
}

export interface ScaryOptions {
  /** Night climb: palette colours come from the zone's night palette. */
  night?: boolean
}

type CueFn = (cue: ScaryCue) => void

const NO_GAPS: readonly number[] = []

// ---------------------------------------------------------------------------------------------
// The layer

export class ScaryLayer {
  /** null when the level has no Looks Scary moment (then every call is a no-op). */
  readonly kind: LooksScaryKind | null
  /** Called when the scene wants a sound. */
  onCue: ((cue: ScaryCue) => void) | null = null

  private readonly scene: Scene | null
  private current: ScaryPhase = 'hidden'
  /** Render-clock time the reveal started. */
  private revealT = 0
  /** Revealed without playing the reveal (seen on an earlier climb). */
  private settled = true
  private lastT = 0
  private clock = 0
  private readonly view = new View()
  private readonly herPt: ScaryPoint = { x: 0, y: 0 }
  private hasHer = false
  private readonly frame: Frame

  constructor(level: Level, opts: ScaryOptions = {}) {
    const ls = level.looksScary
    this.kind = ls ? ls.kind : null
    const pal = paletteFor(level.zone, !!opts.night)
    this.scene = ls ? makeScene(level, ls, pal) : null
    this.frame = { view: this.view, t: 0, clock: 0, p: 0, since: 0, phase: 'looming', her: null }
  }

  get phase(): ScaryPhase {
    return this.current
  }

  /**
   * `t` is the render clock (the same `t` later passed to draw). Once revealed, it stays gentle: a
   * later setPhase('revealing') is ignored (a replay never darkens the bear's cave again); go through
   * 'looming' first to play the reveal again (the lab does).
   */
  setPhase(phase: ScaryPhase, t: number): void {
    if (phase === this.current) return
    const from = this.current
    if (from === 'revealed' && phase === 'revealing') return
    this.current = phase
    this.lastT = t
    if (phase === 'revealing') {
      this.revealT = t
      this.settled = false
      this.scene?.startReveal(this.cue)
    } else if (phase === 'revealed') {
      // Straight to revealed (a replay): no animation left to play. From 'revealing' the reveal
      // keeps playing to its end.
      if (from !== 'revealing') this.settled = true
    } else {
      this.settled = true
    }
  }

  /** Seconds the screen should wait after setPhase('revealing') before asking "How scary was it really?". */
  revealDuration(): number {
    return this.scene ? this.scene.duration : 0
  }

  /** World point the camera should ease to during the reveal. */
  focus(): ScaryPoint {
    if (this.scene) return this.scene.focus()
    return { x: 200, y: 300 }
  }

  /**
   * The middle of the scary thing as seen from the forecast camp (frame it while the Fear Forecast
   * is up, e.g. stage.lookAt(p.y, 1, 0.4)): the giant shadow stands well above the moment's point.
   */
  forecastFocus(): ScaryPoint {
    if (this.scene) return this.scene.forecastFocus()
    return { x: 200, y: 300 }
  }

  /** Once per frame (dt = real seconds). `her` = her feet point (fireflies swirl around her). */
  update(dt: number, camera: Camera, her?: ScaryPoint | null): void {
    if (!this.scene || this.current === 'hidden') return
    const d = Math.min(0.1, Math.max(0, dt))
    this.clock += d
    if (her) {
      this.herPt.x = her.x
      this.herPt.y = her.y
      this.hasHer = true
    }
    this.lastT += d
    const f = this.frameAt(camera, this.lastT)
    this.scene.update(d, f, camera, this.cue)
  }

  /** Behind the ledges. */
  draw(ctx: CanvasRenderingContext2D, camera: Camera, t: number): void {
    const f = this.prepare(camera, t)
    if (f) this.paint(ctx, f, 0)
  }

  /** Right after the fog (Cloud Steps): the giant shadow and the marmot. */
  drawOnFog(ctx: CanvasRenderingContext2D, camera: Camera, t: number): void {
    const f = this.prepare(camera, t)
    if (f) this.paint(ctx, f, 1)
  }

  /** In front of everything. */
  drawFront(ctx: CanvasRenderingContext2D, camera: Camera, t: number): void {
    const f = this.prepare(camera, t)
    if (f) this.paint(ctx, f, 2)
  }

  /**
   * The rope bridge's missing deck planks right now (terrain plank indices, 0 = leftmost; terrain
   * draws round(w / 13) planks). The terrain's bridge should leave these out: two planks are missing
   * while it looks rickety, and they swing back into place in the reveal. Empty for other moments.
   */
  bridgeGaps(): readonly number[] {
    const s = this.scene
    if (!(s instanceof BridgeScene) || this.current === 'hidden') return NO_GAPS
    return s.gaps(this.frame)
  }

  /** Cached offscreen pixels (lab/debug). */
  cachedPixels(): number {
    return this.scene ? this.scene.pixels() : 0
  }

  /** Release every canvas (call on unmount). */
  destroy(): void {
    this.scene?.destroy()
    this.onCue = null
    this.current = 'hidden'
  }

  // -------------------------------------------------------------------------------------------

  private readonly cue: CueFn = (c) => {
    this.onCue?.(c)
  }

  private prepare(camera: Camera, t: number): Frame | null {
    if (!this.scene || this.current === 'hidden') return null
    this.lastT = t
    const f = this.frameAt(camera, t)
    if (this.current === 'revealing' && f.p >= 1) this.current = 'revealed'
    this.scene.sprites.sync(this.view)
    return f
  }

  private frameAt(camera: Camera, t: number): Frame {
    const f = this.frame
    this.view.from(camera)
    f.t = t
    f.clock = this.clock
    f.her = this.hasHer ? this.herPt : null
    const dur = this.scene ? this.scene.duration : 1
    if (this.current === 'looming' || this.current === 'hidden') {
      f.p = 0
      f.since = -1
      f.phase = 'looming'
    } else if (this.settled) {
      f.p = 1
      f.since = 1e4
      f.phase = 'revealed'
    } else {
      f.since = Math.max(0, t - this.revealT)
      f.p = clamp01(f.since / dur)
      f.phase = f.p >= 1 ? 'revealed' : 'revealing'
    }
    return f
  }

  private paint(ctx: CanvasRenderingContext2D, f: Frame, slot: 0 | 1 | 2): void {
    const s = this.scene
    if (!s) return
    const v = this.view
    // Skip work when the whole set-piece is far off screen.
    if (!s.near(v, 260)) return
    ctx.save()
    v.applyScreen(ctx)
    if (slot === 0) s.draw(ctx, f)
    else if (slot === 1) s.drawOnFog(ctx, f)
    else s.drawFront(ctx, f)
    ctx.restore()
  }
}

function makeScene(level: Level, ls: LooksScary, pal: ZonePalette): Scene {
  switch (ls.kind) {
    case 'bigleap':
      return new DropScene(level, ls, pal)
    case 'eyes':
      return new EyesScene(level, ls, pal)
    case 'rumble':
      return new BearScene(level, ls, pal)
    case 'bridge':
      return new BridgeScene(level, ls, pal)
    case 'shadow':
    default:
      return new ShadowScene(level, ls, pal)
  }
}

// ---------------------------------------------------------------------------------------------
// Shared bits

interface Frame {
  view: View
  /** Render clock (s). */
  t: number
  /** Layer clock (s): advances in update() — the rumble/snore/creak rhythm. */
  clock: number
  /** Reveal progress: 0 looming → 1 revealed. */
  p: number
  /** Seconds since the reveal started (−1 while looming, large when seen on an earlier climb). */
  since: number
  phase: Exclude<ScaryPhase, 'hidden'>
  her: ScaryPoint | null
}

interface Box {
  x0: number
  x1: number
  /** Bottom and top altitude. */
  y0: number
  y1: number
}

interface Sprite {
  canvas: HTMLCanvasElement
  x0: number
  /** Top altitude (world). */
  y1: number
  w: number
  h: number
}

/** World-locked sprites painted in art coords (x, −y); dropped when the view's resolution changes. */
class SpriteSet {
  private k = 0
  private readonly map = new Map<string, Sprite>()

  sync(view: View): void {
    const k = view.base * view.dpr
    if (Math.abs(k - this.k) > 1e-3) {
      this.clear()
      this.k = k
    }
  }

  /** Device px per world unit of a sprite built now at `res`. */
  scaleFor(res = 1): number {
    return Math.max(0.25, this.k * res)
  }

  get(key: string, x0: number, y1: number, w: number, h: number, paint: (g: CanvasRenderingContext2D, k: number) => void, res = 1): Sprite {
    const hit = this.map.get(key)
    if (hit) return hit
    const k = Math.min(this.scaleFor(res), MAX_PX / w, MAX_PX / h)
    const pw = Math.max(1, Math.ceil(w * k))
    const ph = Math.max(1, Math.ceil(h * k))
    const canvas = makeCanvas(pw, ph)
    const sp: Sprite = { canvas, x0, y1, w, h }
    const g = canvas.getContext('2d')
    if (g) {
      g.setTransform(pw / w, 0, 0, ph / h, (-x0 * pw) / w, (y1 * ph) / h)
      g.lineCap = 'round'
      g.lineJoin = 'round'
      paint(g, pw / w)
    }
    this.map.set(key, sp)
    return sp
  }

  pixels(): number {
    let n = 0
    for (const sp of this.map.values()) n += sp.canvas.width * sp.canvas.height
    return n
  }

  clear(): void {
    for (const sp of this.map.values()) freeCanvas(sp.canvas)
    this.map.clear()
  }
}

function blit(ctx: CanvasRenderingContext2D, v: View, sp: Sprite, alpha = 1, dx = 0, dy = 0): void {
  if (alpha <= 0.004) return
  ctx.globalAlpha = Math.min(1, alpha)
  ctx.drawImage(sp.canvas, v.x(sp.x0 + dx), v.y(sp.y1 + dy), sp.w * v.s, sp.h * v.s)
  ctx.globalAlpha = 1
}

/** Blit scaled (and turned) about a world pivot. */
function blitAbout(ctx: CanvasRenderingContext2D, v: View, sp: Sprite, alpha: number, px: number, py: number, sx: number, sy: number, rot = 0): void {
  if (alpha <= 0.004) return
  const cx = v.x(px)
  const cy = v.y(py)
  ctx.save()
  ctx.globalAlpha = Math.min(1, alpha)
  ctx.translate(cx, cy)
  if (rot) ctx.rotate(rot)
  ctx.scale(sx, sy)
  ctx.drawImage(sp.canvas, v.x(sp.x0) - cx, v.y(sp.y1) - cy, sp.w * v.s, sp.h * v.s)
  ctx.restore()
}

/** A soft glow dot centred on a world point, radius in world units. */
function glowAt(ctx: CanvasRenderingContext2D, v: View, dot: HTMLCanvasElement, x: number, y: number, r: number, alpha: number): void {
  if (alpha <= 0.004) return
  const rr = r * v.s
  ctx.globalAlpha = Math.min(1, alpha)
  ctx.drawImage(dot, v.x(x) - rr, v.y(y) - rr, rr * 2, rr * 2)
  ctx.globalAlpha = 1
}

/** A four-point twinkle (screen px). */
function twinkle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  if (r <= 0.2) return
  const k = r * 0.2
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(x, y - r)
  ctx.quadraticCurveTo(x + k, y - k, x + r, y)
  ctx.quadraticCurveTo(x + k, y + k, x, y + r)
  ctx.quadraticCurveTo(x - k, y + k, x - r, y)
  ctx.quadraticCurveTo(x - k, y - k, x, y - r)
  ctx.fill()
}

const window01 = (p: number, a: number, b: number): number => clamp01((p - a) / (b - a))

function findLedge(level: Level, id: string): Ledge | null {
  const el = level.elements.find((e) => e.id === id)
  return el && el.kind === 'ledge' ? el : null
}

function findElement(level: Level, id: string): LevelElement | null {
  return level.elements.find((e) => e.id === id) ?? null
}

/** The Big Leap the moment belongs to (from the forecast camp, or onto the reveal spot). */
function leapFor(level: Level, ls: LooksScary): { from: Ledge; to: Ledge } | null {
  const leaps = level.bigLeaps ?? []
  const b = leaps.find((l) => l.to === ls.revealAt) ?? leaps.find((l) => l.from === ls.forecastAt) ?? null
  if (!b) return null
  const from = findLedge(level, b.from)
  const to = findLedge(level, b.to)
  return from && to ? { from, to } : null
}

/** Soft puffs (a mist mass) into a sprite: n puffs inside the rect, art coords. */
function puffs(g: CanvasRenderingContext2D, rng: Rng, dot: HTMLCanvasElement, x0: number, y0: number, w: number, h: number, n: number, size: [number, number], alpha: [number, number]): void {
  for (let i = 0; i < n; i++) {
    const pw = rng.range(size[0], size[1])
    const ph = pw * rng.range(0.42, 0.7)
    const x = x0 + rng.range(0, w)
    const y = y0 + rng.range(0, h)
    g.globalAlpha = rng.range(alpha[0], alpha[1])
    g.drawImage(dot, x - pw / 2, y - ph / 2, pw, ph)
  }
  g.globalAlpha = 1
}

abstract class Scene {
  abstract readonly duration: number
  readonly sprites = new SpriteSet()
  private readonly dots = new Map<string, HTMLCanvasElement>()

  constructor(
    protected readonly level: Level,
    protected readonly ls: LooksScary,
    protected readonly pal: ZonePalette,
  ) {}

  abstract focus(): ScaryPoint

  /** The middle of the looming thing (default: where the moment is). */
  forecastFocus(): ScaryPoint {
    return { x: this.ls.x, y: this.ls.y }
  }

  /** World box of the set-piece (sounds and the rumble only happen near the view). */
  protected abstract box(): Box

  near(view: View, margin: number): boolean {
    const b = this.box()
    return b.x1 > view.left - margin && b.x0 < view.right + margin && b.y1 > view.bottom - margin && b.y0 < view.top + margin
  }

  startReveal(_cue: CueFn): void {}
  update(_dt: number, _f: Frame, _camera: Camera, _cue: CueFn): void {}
  draw(_ctx: CanvasRenderingContext2D, _f: Frame): void {}
  drawOnFog(_ctx: CanvasRenderingContext2D, _f: Frame): void {}
  drawFront(_ctx: CanvasRenderingContext2D, _f: Frame): void {}

  pixels(): number {
    let n = this.sprites.pixels()
    for (const c of this.dots.values()) n += c.width * c.height
    return n
  }

  destroy(): void {
    this.sprites.clear()
    for (const c of this.dots.values()) freeCanvas(c)
    this.dots.clear()
  }

  /** A cached soft dot (64 px) of a colour. */
  protected dot(color: string, hardness = 0.22): HTMLCanvasElement {
    const key = `${color}|${hardness}`
    let c = this.dots.get(key)
    if (!c) {
      c = softDot(64, color, hardness)
      this.dots.set(key, c)
    }
    return c
  }
}

// =============================================================================================
// Meadow: the misty drop under the first Big Leap

class DropScene extends Scene {
  readonly duration = 3
  private readonly cx: number
  /** Top of the hollow (just under the ledge tops). */
  private readonly topY: number
  private readonly halfTop: number
  private readonly halfMid: number
  /** Depth of the hollow (units). */
  private readonly depth: number
  /** The grassy floor's top surface, revealed (altitude). */
  private readonly floorY: number
  private readonly gx0: number
  private readonly gx1: number
  private readonly seed: string

  constructor(level: Level, ls: LooksScary, pal: ZonePalette) {
    super(level, ls, pal)
    this.seed = `drop:${level.id}`
    const pair = leapFor(level, ls)
    let gx0 = ls.x - 40
    let gx1 = ls.x + 40
    let top = ls.y
    let ropeY = ls.y - 120
    if (pair) {
      const { from: F, to: T } = pair
      const right = T.x + T.w / 2 > F.x + F.w / 2
      gx0 = right ? F.x + F.w : T.x + T.w
      gx1 = right ? T.x : F.x
      top = Math.min(F.y, T.y)
      ropeY = F.y - TUNING.ropeSlack
    }
    if (gx1 - gx0 < 60) {
      const c = (gx0 + gx1) / 2
      gx0 = c - 36
      gx1 = c + 36
    }
    this.gx0 = gx0
    this.gx1 = gx1
    this.cx = (gx0 + gx1) / 2
    this.halfTop = Math.max(50, Math.min(96, (gx1 - gx0) / 2 + 24))
    this.halfMid = this.halfTop * 1.16
    this.topY = top - 6
    this.depth = 146
    // The floor stays under the rope's catch line: a miss never seems to fall "through" it.
    this.floorY = Math.min(this.topY - this.depth + 34, ropeY - 20)
  }

  focus(): ScaryPoint {
    return { x: this.cx, y: this.floorY + 30 }
  }

  override forecastFocus(): ScaryPoint {
    return { x: this.cx, y: this.topY - this.depth * 0.5 }
  }

  protected box(): Box {
    return { x0: this.cx - this.halfMid * 2.2, x1: this.cx + this.halfMid * 2.2, y0: this.topY - this.depth - 260, y1: this.topY + 60 }
  }

  override startReveal(cue: CueFn): void {
    cue('sparkle')
  }

  /** The hollow under the gap (art coords): a rounded pocket in the rock. */
  private hollow(): Path2D {
    const { cx, halfTop, halfMid, depth } = this
    const T = -this.topY
    const B = T + depth
    const L = cx - halfTop
    const R = cx + halfTop
    const p = new Path2D()
    p.moveTo(L, T)
    p.bezierCurveTo(L + halfTop * 0.6, T - 4, R - halfTop * 0.6, T + 2, R, T)
    p.bezierCurveTo(cx + halfMid + 3, T + depth * 0.22, cx + halfMid + 2, T + depth * 0.62, cx + halfMid * 0.7, T + depth * 0.88)
    p.bezierCurveTo(cx + halfMid * 0.36, B + 3, cx - halfMid * 0.36, B + 3, cx - halfMid * 0.7, T + depth * 0.88)
    p.bezierCurveTo(cx - halfMid - 2, T + depth * 0.62, cx - halfMid - 3, T + depth * 0.22, L, T)
    p.closePath()
    return p
  }

  private rect(): [number, number, number, number] {
    const x0 = this.cx - this.halfMid - 16
    return [x0, this.topY + 14, (this.halfMid + 16) * 2, this.depth + 34]
  }

  /** Inner walls converging as they go down (perspective): the hollow looks bottomless. */
  private wall(side: -1 | 1, frac: number, rng: Rng): { path: Path2D; edge: [number, number][] } {
    const { cx, halfTop, halfMid, depth } = this
    const T = -this.topY
    const n = 7
    const edge: [number, number][] = []
    for (let j = 0; j <= n; j++) {
      const k = j / n
      const y = T + depth * frac * k
      const inner = lerp(halfTop * 0.84, 8, Math.pow(k, 0.7))
      const jitter = j === 0 || j === n ? 0 : rng.range(-4, 4)
      edge.push([cx + side * (inner + jitter), y])
    }
    const p = new Path2D()
    const outer = cx + side * (halfMid + 30)
    p.moveTo(outer, T - 20)
    p.lineTo(edge[0][0], T - 20)
    for (const [x, y] of edge) p.lineTo(x, y)
    p.lineTo(outer, edge[n][1] + 40)
    p.closePath()
    return { path: p, edge }
  }

  private colors(): { lip: string; mid: string; deep: string; mistC: string; pine: string } {
    const pal = this.pal
    const deep = mix(pal.ink, '#26305a', 0.85)
    return {
      lip: mix(pal.faceDark, '#5f6b93', 0.6),
      mid: mix(pal.haze, '#7d8db5', 0.85),
      deep,
      mistC: mix(pal.mist, '#dde4f2', 0.75),
      pine: mix(deep, '#1c2240', 0.5),
    }
  }

  /** Looming: looking down into a misty drop, tiny pine tops far below. */
  private paintDeep(g: CanvasRenderingContext2D): void {
    const pal = this.pal
    const rng = createRng(`${this.seed}:deep`)
    const { cx, halfMid, depth } = this
    const T = -this.topY
    const B = T + depth
    const c = this.colors()
    g.save()
    g.clip(this.hollow())
    const gr = g.createLinearGradient(0, T, 0, B)
    gr.addColorStop(0, c.lip)
    gr.addColorStop(0.3, c.mid)
    gr.addColorStop(0.62, mix(c.mid, c.deep, 0.55))
    gr.addColorStop(1, c.deep)
    g.fillStyle = gr
    g.fillRect(cx - halfMid - 20, T - 20, halfMid * 2 + 40, depth + 40)
    const fog = this.dot(c.mistC, 0.18)
    // Far, far below: a pale band of mist with tiny dark pine tops standing in front of it …
    const seaY = T + depth * 0.66
    puffs(g, rng, fog, cx - halfMid * 0.8, seaY - 10, halfMid * 1.6, 14, 12, [30, 60], [0.45, 0.8])
    for (let i = 0; i < 13; i++) {
      const x = cx + rng.range(-halfMid * 0.55, halfMid * 0.55)
      tinyPine(g, x, seaY + rng.range(0, 10), rng.range(3.5, 7), c.pine)
    }
    // … sinking into darker mist further down still.
    puffs(g, rng, this.dot(mix(c.mid, c.deep, 0.5), 0.2), cx - halfMid * 0.7, seaY + 10, halfMid * 1.4, depth * 0.3, 10, [30, 60], [0.35, 0.6])
    // The walls of the drop, with pines on their edges, smaller and bluer the deeper they are.
    for (const side of [-1, 1] as const) {
      const w = this.wall(side, 0.8, rng)
      const near = side < 0 ? mix(pal.faceDark, pal.ink, 0.3) : mix(pal.face, pal.faceDark, 0.55)
      const wg = g.createLinearGradient(0, T, 0, T + depth * 0.8)
      wg.addColorStop(0, near)
      wg.addColorStop(0.5, mix(near, c.mid, 0.55))
      wg.addColorStop(1, mix(near, c.mid, 0.9))
      g.fillStyle = wg
      g.fill(w.path)
      for (let j = 1; j < w.edge.length - 1; j++) {
        const [x, y] = w.edge[j]
        const k = j / (w.edge.length - 1)
        tinyPine(g, x - side * 1.5, y + 1, lerp(12, 4, k), mix(mix(near, pal.ink, 0.3), c.mid, k * 0.85))
      }
    }
    puffs(g, rng, fog, cx - halfMid, T + depth * 0.3, halfMid * 2, depth * 0.12, 8, [30, 64], [0.18, 0.38])
    puffs(g, rng, fog, cx - halfMid, T + depth * 0.52, halfMid * 2, depth * 0.14, 10, [34, 72], [0.25, 0.5])
    const sh = g.createLinearGradient(0, T - 4, 0, T + 22)
    sh.addColorStop(0, rgba(pal.ink, 0.6))
    sh.addColorStop(1, rgba(pal.ink, 0))
    g.fillStyle = sh
    g.fillRect(cx - halfMid - 20, T - 10, halfMid * 2 + 40, 34)
    g.restore()
  }

  /** Revealed: a sunny little grotto with a pool, lily pads, a frog and flowers. */
  private paintSunny(g: CanvasRenderingContext2D): void {
    const pal = this.pal
    const rng = createRng(`${this.seed}:sunny`)
    const { cx, halfMid, halfTop, depth } = this
    const T = -this.topY
    const B = T + depth
    const FY = -this.floorY
    g.save()
    g.clip(this.hollow())
    // The back wall: the rock, a shade deeper, lit warm.
    const back = mix(pal.faceDark, pal.face, 0.35)
    const gr = g.createLinearGradient(0, T, 0, FY)
    gr.addColorStop(0, mix(back, pal.ink, 0.12))
    gr.addColorStop(1, mix(back, '#fff1d6', 0.25))
    g.fillStyle = gr
    g.fillRect(cx - halfMid - 20, T - 20, halfMid * 2 + 40, depth + 40)
    const night = pal.night
    const sun = this.dot(night ? '#dfe6ff' : '#fff3d0', 0.1)
    g.globalAlpha = night ? 0.22 : 0.5
    g.drawImage(sun, cx - halfMid * 0.9, T + depth * 0.05, halfMid * 1.8, depth * 0.8)
    g.globalAlpha = 1
    // Soft rays of sun (moonbeams at night) slanting in.
    g.fillStyle = night ? rgba('#dfe6ff', 0.14) : rgba('#fff6dc', 0.35)
    for (let i = 0; i < 3; i++) {
      const x = cx - halfTop * 0.6 + i * halfTop * 0.55
      g.beginPath()
      g.moveTo(x, T - 4)
      g.lineTo(x + 9, T - 4)
      g.lineTo(x + 26, FY)
      g.lineTo(x + 12, FY)
      g.closePath()
      g.fill()
    }
    // Flowering clumps on the side walls.
    for (const side of [-1, 1]) {
      for (let k = 0; k < 2; k++) {
        const y = T + depth * (0.28 + k * 0.22)
        const x = cx + side * (halfMid * (0.92 - k * 0.04))
        bush(g, x, y, 5.5 - k, pal, rng)
      }
    }
    // Hanging vines with flowers from the top edge.
    for (let i = 0; i < 6; i++) {
      const x = cx - halfTop * 0.82 + (halfTop * 1.64 * i) / 5 + rng.range(-4, 4)
      const len = rng.range(14, 38)
      g.strokeStyle = mix(pal.topDark, pal.ink, 0.15)
      g.lineWidth = 1.1
      g.beginPath()
      g.moveTo(x, T - 2)
      g.quadraticCurveTo(x + rng.range(-5, 5), T + len * 0.6, x + rng.range(-3, 3), T + len)
      g.stroke()
      for (let k = 0; k < 3; k++) {
        const ly = T + len * (0.3 + k * 0.3)
        g.fillStyle = pal.top
        g.beginPath()
        g.ellipse(x + (k % 2 ? 2 : -2), ly, 2.2, 1.2, k % 2 ? 0.6 : -0.6, 0, TAU)
        g.fill()
      }
      flowerDot(g, x, T + len + 1, pal.accents[i % pal.accents.length], 0.9)
    }
    // The grassy floor.
    const floor = new Path2D()
    floor.moveTo(cx - halfMid - 20, FY + 3)
    for (let i = 0; i <= 14; i++) {
      const x = cx - halfMid - 20 + ((halfMid + 20) * 2 * i) / 14
      floor.lineTo(x, FY + Math.sin(i * 1.9) * 1.2 - (i % 2 === 0 ? 1.2 : 0))
    }
    floor.lineTo(cx + halfMid + 20, B + 20)
    floor.lineTo(cx - halfMid - 20, B + 20)
    floor.closePath()
    const fg = g.createLinearGradient(0, FY, 0, B)
    fg.addColorStop(0, pal.topLight)
    fg.addColorStop(0.3, pal.top)
    fg.addColorStop(1, pal.topDark)
    g.fillStyle = fg
    g.fill(floor)
    g.strokeStyle = pal.topDark
    g.lineWidth = 1.1
    g.stroke(floor)
    // Bushes at the sides.
    bush(g, cx - halfMid * 0.78, FY + 2, 8, pal, rng)
    bush(g, cx + halfMid * 0.8, FY + 3, 7, pal, rng)
    // The pool.
    const pr = Math.min(halfTop * 0.56, 38)
    const py = FY + 12
    g.fillStyle = mix(pal.topDark, '#3f8fb0', 0.55)
    g.beginPath()
    g.ellipse(cx, py + 0.9, pr + 2.6, 7.8, 0, 0, TAU)
    g.fill()
    g.fillStyle = '#86cfe9'
    g.beginPath()
    g.ellipse(cx, py, pr, 6.6, 0, 0, TAU)
    g.fill()
    g.fillStyle = '#c2ecf8'
    g.beginPath()
    g.ellipse(cx - pr * 0.1, py - 1.5, pr * 0.74, 3.6, 0, 0, TAU)
    g.fill()
    g.strokeStyle = 'rgba(255,255,255,0.9)'
    g.lineWidth = 0.9
    g.beginPath()
    g.ellipse(cx + pr * 0.36, py - 2, pr * 0.2, 1.1, 0, Math.PI * 1.1, Math.PI * 1.9)
    g.stroke()
    // Lily pads, a water lily and a little frog.
    for (const [dx, dy, r] of [
      [-0.48, 1.4, 3.4],
      [0.42, 2.3, 3],
      [0.1, -1.6, 2.4],
    ]) {
      const x = cx + pr * dx
      const y = py + dy
      const lc = mix(pal.top, '#3e9a54', 0.45)
      g.fillStyle = lc
      g.strokeStyle = ink(lc)
      g.lineWidth = 0.7
      g.beginPath()
      g.ellipse(x, y, r, r * 0.45, 0, 0.35, TAU - 0.05)
      g.lineTo(x, y)
      g.closePath()
      g.fill()
      g.stroke()
    }
    lily(g, cx - pr * 0.48, py + 0.6, pal.accents[0] ?? '#ff9db0')
    frog(g, cx + pr * 0.42, py + 1.6)
    // Flowers dotted on the bank in front.
    for (let i = 0; i < 9; i++) {
      const x = cx + rng.range(-halfMid * 0.85, halfMid * 0.85)
      const y = FY + rng.range(5, 26)
      if (Math.abs(x - cx) < pr + 3 && Math.abs(y - py) < 8) continue
      flowerDot(g, x, y, pal.accents[i % pal.accents.length], 0.9)
    }
    for (const sx of [-1, 1]) {
      const x = cx + sx * (pr + 4)
      g.strokeStyle = mix(pal.topDark, pal.ink, 0.2)
      g.lineWidth = 1
      for (let r = 0; r < 3; r++) {
        g.beginPath()
        g.moveTo(x + r * 1.6 * sx, py + 2)
        g.quadraticCurveTo(x + r * 1.6 * sx + sx * 1.5, py - 6, x + r * 2.2 * sx + sx * 2.5, py - 12 + r * 2)
        g.stroke()
      }
      g.fillStyle = mix(pal.wood, pal.ink, 0.25)
      g.beginPath()
      g.ellipse(x + sx * 2.6, py - 10, 1, 2.6, sx * 0.2, 0, TAU)
      g.fill()
    }
    const sh = g.createLinearGradient(0, T - 4, 0, T + 16)
    sh.addColorStop(0, rgba(pal.ink, 0.3))
    sh.addColorStop(1, rgba(pal.ink, 0))
    g.fillStyle = sh
    g.fillRect(cx - halfMid - 20, T - 10, halfMid * 2 + 40, 28)
    g.restore()
  }

  private paintRim(g: CanvasRenderingContext2D, sunny: boolean): void {
    const pal = this.pal
    const path = this.hollow()
    g.strokeStyle = mix(pal.faceEdge, pal.ink, 0.25)
    g.lineWidth = 2
    g.stroke(path)
    g.save()
    g.translate(0.8, 1.8)
    g.strokeStyle = rgba(pal.faceLight, 0.75)
    g.lineWidth = 1.2
    g.stroke(path)
    g.restore()
    if (!sunny) return
    // Grass and flowers spilling over the bottom lip.
    const rng = createRng(`${this.seed}:lip`)
    const { cx, halfMid, depth } = this
    const B = -this.topY + depth
    // Grass blades and flowers along the lower lip.
    const blade = mix(pal.tuft, pal.topDark, 0.3)
    g.strokeStyle = blade
    g.lineWidth = 1
    for (let i = 0; i < 14; i++) {
      const u = (i + 0.5) / 14
      const x = cx - halfMid * 0.62 + u * halfMid * 1.24
      const y = B - Math.pow(Math.abs(u - 0.5) * 2, 2.2) * 15 - 1
      const h = rng.range(3, 6)
      g.beginPath()
      g.moveTo(x, y)
      g.quadraticCurveTo(x + 0.6, y - h * 0.6, x + rng.range(-1.5, 1.5), y - h)
      g.stroke()
      if (i % 3 === 1) flowerDot(g, x + 1, y - h * 0.6, pal.accents[i % pal.accents.length], 0.8)
    }
  }

  /** Mist pouring out of the hollow and down the rock: you can't see the bottom. */
  private paintPour(g: CanvasRenderingContext2D, top: number, h: number): void {
    const rng = createRng(`${this.seed}:pour`)
    const c = this.colors()
    const light = this.dot(c.mistC, 0.2)
    const blue = this.dot(mix(c.mid, c.mistC, 0.45), 0.2)
    const { cx, halfMid } = this
    for (let i = 0; i < 64; i++) {
      const v = Math.pow(rng.next(), 0.9)
      const spread = halfMid * (0.75 + 1.25 * v)
      const x = cx + rng.range(-1, 1) * spread * 0.8
      const y = top + 8 + v * (h - 60)
      const pw = 46 + 64 * v + rng.range(-8, 8)
      const ph = pw * rng.range(0.6, 0.85)
      g.globalAlpha = Math.min(1, Math.pow(1 - v, 0.8) * rng.range(0.8, 1.2))
      g.drawImage(i % 3 === 0 ? blue : light, x - pw / 2, y - ph / 2, pw, ph)
    }
    g.globalAlpha = 1
  }

  private paintCurtain(g: CanvasRenderingContext2D): void {
    const rng = createRng(`${this.seed}:curtain`)
    const { cx, halfMid, depth } = this
    const T = -this.topY
    const fog = this.dot(mix(this.pal.mist, '#e6ecf6', 0.6), 0.2)
    puffs(g, rng, fog, cx - halfMid, T + 4, halfMid * 2, depth * 0.95, 30, [44, 90], [0.55, 0.95])
  }

  override draw(ctx: CanvasRenderingContext2D, f: Frame): void {
    const v = f.view
    const S = this.sprites
    const [x0, y1, w, h] = this.rect()
    const p = f.p
    const mist = 1 - smoothstep(window01(p, 0.12, 0.72))
    if (p > 0) blit(ctx, v, S.get('sunny', x0, y1, w, h, (g) => this.paintSunny(g)))
    if (mist > 0.004) blit(ctx, v, S.get('deep', x0, y1, w, h, (g) => this.paintDeep(g)), mist)
    // The mist parting.
    if (f.phase === 'revealing') {
      const c = S.get('curtain', x0 - 40, y1, w + 80, h, (g) => this.paintCurtain(g), 0.7)
      const open = easeInOutSine(window01(p, 0.05, 0.85))
      const a = 0.95 * (1 - smoothstep(window01(p, 0.3, 0.95))) * smoothstep(window01(p, 0, 0.1))
      if (a > 0.004) {
        const half = c.canvas.width / 2
        const dx = open * this.halfMid * 1.4 * v.s
        ctx.save()
        v.applyWorld(ctx)
        ctx.clip(this.hollow())
        v.applyScreen(ctx)
        ctx.globalAlpha = a
        const sw = (c.w / 2) * v.s
        const sx = v.x(c.x0)
        const sy = v.y(c.y1)
        const sh = c.h * v.s
        ctx.drawImage(c.canvas, 0, 0, half, c.canvas.height, sx - dx, sy, sw, sh)
        ctx.drawImage(c.canvas, half, 0, c.canvas.width - half, c.canvas.height, sx + sw + dx, sy, sw, sh)
        ctx.globalAlpha = 1
        ctx.restore()
      }
    }
    blit(ctx, v, S.get(p > 0.5 ? 'rimSunny' : 'rim', x0, y1, w, h + 6, (g) => this.paintRim(g, p > 0.5)))
    // Mist pouring down out of the hollow, slowly (two copies crossfading as they slide).
    const pourA = mist
    if (pourA > 0.004) {
      const top = this.topY - this.depth * 0.55
      const ph = 290
      const pw = this.halfMid * 4.4
      const sp = S.get('pour', this.cx - pw / 2, top, pw, ph, (g) => this.paintPour(g, -top, ph), 0.55)
      const u = (f.clock * 0.12) % 1
      const fall = (1 - mist) * 40
      blit(ctx, v, sp, pourA * (0.45 + 0.55 * (1 - u)), 0, -u * 26 - fall)
      blit(ctx, v, sp, pourA * 0.55 * u, 0, (1 - u) * 26 - fall)
    }
    // Butterflies over the pool once it's sunny.
    const sunny = smoothstep(window01(p, 0.55, 1))
    if (sunny > 0.01) {
      v.applyWorld(ctx)
      for (let i = 0; i < 2; i++) {
        const t = f.clock * (0.5 + i * 0.13) + i * 2.4
        const x = this.cx + Math.sin(t) * this.halfTop * 0.5 + Math.sin(t * 2.3) * 5
        const y = this.floorY + 22 + Math.sin(t * 1.7 + i) * 8 + i * 9
        butterfly(ctx, x, -y, f.clock * 9 + i * 1.3, i === 0 ? (this.pal.accents[0] ?? '#ff9db0') : (this.pal.accents[1] ?? '#ffd36b'), sunny, Math.cos(t) >= 0 ? 1 : -1)
      }
      v.applyScreen(ctx)
    }
  }

  override drawFront(ctx: CanvasRenderingContext2D, f: Frame): void {
    const v = f.view
    const p = f.p
    // Wind-blown wisps across the gap (looming), blown away by the reveal.
    const wispA = 0.6 * (1 - smoothstep(window01(p, 0, 0.5)))
    if (wispA > 0.004) {
      const sp = this.sprites.get(
        'wisp',
        -40,
        9,
        80,
        18,
        (g) => {
          const fog = this.dot('#ffffff', 0.15)
          const rng = createRng(`${this.seed}:wisp`)
          for (let i = 0; i < 6; i++) {
            const x = -30 + i * 12 + rng.range(-3, 3)
            g.globalAlpha = rng.range(0.4, 0.75)
            g.drawImage(fog, x - 16, -9 + rng.range(2, 6), 32, 10)
          }
          g.globalAlpha = 1
        },
        0.6,
      )
      const span = this.gx1 - this.gx0 + 90
      for (let i = 0; i < 3; i++) {
        const speed = 16 + i * 5
        const u = ((f.clock * speed + i * 57) % span) / span
        const x = this.gx0 - 45 + u * span
        const y = this.topY - 16 - i * 30 + Math.sin(f.clock * 0.9 + i * 2) * 4
        const a = wispA * bump(u) * (i === 1 ? 0.8 : 1)
        // The reveal stretches them out as they blow away.
        const blow = 1 + window01(p, 0, 0.5) * 2
        if (a <= 0.004) continue
        ctx.globalAlpha = a
        ctx.drawImage(sp.canvas, v.x(x - 40 * blow), v.y(y + 9), 80 * blow * v.s, 18 * v.s)
        ctx.globalAlpha = 1
      }
    }
    // Sparkles over the pool as the mist clears.
    if (f.phase === 'revealing') {
      const k = window01(p, 0.3, 1)
      if (k > 0 && k < 1) {
        const rng = createRng(`${this.seed}:sparkle`)
        for (let i = 0; i < 12; i++) {
          const a = rng.range(0, TAU)
          const r = rng.range(8, this.halfTop * 0.8) * easeOutCubic(k)
          const x = this.cx + Math.cos(a) * r
          const y = this.floorY + 12 + Math.abs(Math.sin(a)) * r * 0.7 + k * 26
          const s = (2.2 + rng.range(0, 2.4)) * bump(k) * v.s
          twinkle(ctx, v.x(x), v.y(y), s, i % 3 === 0 ? '#ffffff' : '#fff1b8')
        }
      }
    }
  }
}

function tinyPine(g: CanvasRenderingContext2D, x: number, y: number, h: number, color: string): void {
  g.fillStyle = color
  g.beginPath()
  const w = h * 0.42
  g.moveTo(x, y - h)
  g.lineTo(x + w * 0.62, y - h * 0.45)
  g.lineTo(x + w * 0.38, y - h * 0.45)
  g.lineTo(x + w, y)
  g.lineTo(x - w, y)
  g.lineTo(x - w * 0.38, y - h * 0.45)
  g.lineTo(x - w * 0.62, y - h * 0.45)
  g.closePath()
  g.fill()
}

function bush(g: CanvasRenderingContext2D, x: number, y: number, r: number, pal: ZonePalette, rng: Rng): void {
  const c = mix(pal.top, pal.tuft, 0.4)
  g.fillStyle = c
  g.strokeStyle = ink(c)
  g.lineWidth = 0.9
  g.beginPath()
  g.arc(x - r * 0.55, y - r * 0.55, r * 0.62, 0, TAU)
  g.arc(x + r * 0.5, y - r * 0.5, r * 0.58, 0, TAU)
  g.arc(x, y - r * 0.95, r * 0.7, 0, TAU)
  g.fill()
  g.stroke()
  g.fillStyle = c
  g.beginPath()
  g.ellipse(x, y - r * 0.5, r * 0.9, r * 0.45, 0, 0, TAU)
  g.fill()
  for (let i = 0; i < 3; i++) flowerDot(g, x + rng.range(-r * 0.7, r * 0.7), y - rng.range(r * 0.4, r * 1.3), pal.accents[i % pal.accents.length], 0.8)
}

function flowerDot(g: CanvasRenderingContext2D, x: number, y: number, color: string, s = 1): void {
  g.fillStyle = color
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU
    g.beginPath()
    g.arc(x + Math.cos(a) * 1.3 * s, y + Math.sin(a) * 1.3 * s, 1 * s, 0, TAU)
    g.fill()
  }
  g.fillStyle = '#ffe28a'
  g.beginPath()
  g.arc(x, y, 0.8 * s, 0, TAU)
  g.fill()
}

function lily(g: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  g.fillStyle = '#ffffff'
  for (let i = 0; i < 6; i++) {
    const a = Math.PI + (i / 5) * Math.PI
    g.beginPath()
    g.ellipse(x + Math.cos(a) * 1.8, y - 1 + Math.sin(a) * 1.4, 1.5, 0.8, a, 0, TAU)
    g.fill()
  }
  g.fillStyle = color
  for (let i = 0; i < 5; i++) {
    const a = Math.PI * 1.1 + (i / 4) * Math.PI * 0.8
    g.beginPath()
    g.ellipse(x + Math.cos(a) * 1, y - 1.6 + Math.sin(a) * 1.2, 1.2, 0.6, a, 0, TAU)
    g.fill()
  }
  g.fillStyle = '#ffe28a'
  g.beginPath()
  g.arc(x, y - 1.8, 0.7, 0, TAU)
  g.fill()
}

/** A small, smiling frog sitting on a lily pad (art coords). */
function frog(g: CanvasRenderingContext2D, x: number, y: number): void {
  const c = '#7fc86a'
  g.fillStyle = c
  g.strokeStyle = ink(c)
  g.lineWidth = 0.6
  g.beginPath()
  g.ellipse(x, y - 1.8, 3, 2.1, 0, 0, TAU)
  g.fill()
  g.stroke()
  for (const s of [-1, 1]) {
    g.fillStyle = c
    g.beginPath()
    g.arc(x + s * 1.5, y - 3.8, 1.2, 0, TAU)
    g.fill()
    g.stroke()
    g.fillStyle = '#2d1a16'
    g.beginPath()
    g.arc(x + s * 1.5, y - 3.9, 0.5, 0, TAU)
    g.fill()
  }
  g.strokeStyle = ink(c)
  g.beginPath()
  g.arc(x, y - 2.4, 1.4, 0.2 * Math.PI, 0.8 * Math.PI)
  g.stroke()
  g.fillStyle = rgba('#ff9b8a', 0.5)
  g.beginPath()
  g.ellipse(x - 2, y - 1.8, 0.7, 0.45, 0, 0, TAU)
  g.ellipse(x + 2, y - 1.8, 0.7, 0.45, 0, 0, TAU)
  g.fill()
}

/** A little butterfly in art coords (world transform). */
function butterfly(ctx: CanvasRenderingContext2D, x: number, y: number, flap: number, color: string, alpha: number, dir: number): void {
  const k = 0.25 + 0.75 * Math.abs(Math.sin(flap))
  ctx.globalAlpha = alpha
  ctx.fillStyle = color
  ctx.strokeStyle = ink(color)
  ctx.lineWidth = 0.5
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.ellipse(x + s * 2 * k, y - 1, 2.2 * k, 1.8, s * 0.4 * dir, 0, TAU)
    ctx.fill()
    ctx.stroke()
    ctx.beginPath()
    ctx.ellipse(x + s * 1.5 * k, y + 1.2, 1.4 * k, 1.2, -s * 0.3 * dir, 0, TAU)
    ctx.fill()
  }
  ctx.fillStyle = ink(color)
  ctx.beginPath()
  ctx.ellipse(x, y, 0.5, 1.8, 0, 0, TAU)
  ctx.fill()
  ctx.globalAlpha = 1
}

// =============================================================================================
// Firefly Hollow: glowing eyes in a dark cave → fireflies

interface Firefly {
  /** Live position (world). */
  x: number
  y: number
  /** The eye it starts as. */
  ex: number
  ey: number
  /** Where it settles in the warm cave (world). */
  hx: number
  hy: number
  ph: number
  orbit: number
  speed: number
  delay: number
  /** Eye radius (it shrinks into a firefly). */
  r: number
  /** Left or right eye of a pair (eye tilt). */
  side: -1 | 1
  tilt: number
  /** A short glowing trail (recent positions, newest first). */
  tx: Float32Array
  ty: Float32Array
}

interface EyePair {
  x: number
  y: number
  r: number
  tilt: number
  seed: number
}

class EyesScene extends Scene {
  readonly duration = 3.6
  private readonly cave: { x: number; y: number; w: number; h: number; own: boolean }
  private readonly pairs: EyePair[] = []
  private readonly flies: Firefly[] = []
  private readonly dir: number
  private firstUpdate = true
  private trailAcc = 0

  constructor(level: Level, ls: LooksScary, pal: ZonePalette) {
    super(level, ls, pal)
    // The cave is the level's 'cave' decoration nearest the moment (terrain draws it); without one,
    // this scene draws its own.
    let best: { x: number; y: number; s: number } | null = null
    let bestD = 160
    for (const d of level.decor ?? []) {
      if (d.kind !== 'cave') continue
      const dist = Math.hypot(d.x - ls.x, d.y - ls.y)
      if (dist < bestD) {
        bestD = dist
        best = { x: d.x, y: d.y, s: d.scale ?? 1 }
      }
    }
    const reveal = findElement(level, ls.revealAt)
    const s = best ? best.s : 1.3
    const cx = best ? best.x : ls.x
    const cy = best ? best.y : reveal && reveal.kind === 'ledge' ? reveal.y : ls.y - 40
    this.cave = { x: cx, y: cy, w: 50 * s, h: 46 * s, own: !best }
    const standX = reveal ? (reveal.kind === 'ledge' ? reveal.standX ?? reveal.x + reveal.w / 2 : reveal.x) : cx - 60
    this.dir = standX < cx ? -1 : 1
    const rng = createRng(`eyes:${level.id}`)
    const { w, h } = this.cave
    const spots: [number, number, number][] = [
      [-0.26, 0.5, 1],
      [0.22, 0.3, 0.85],
      [0.04, 0.7, 0.72],
      [-0.3, 0.2, 0.62],
      [0.3, 0.6, 0.58],
    ]
    for (let i = 0; i < spots.length; i++) {
      const [fx, fy, size] = spots[i]
      this.pairs.push({
        x: cx + fx * w + rng.range(-1.5, 1.5),
        y: cy + fy * h + rng.range(-1.5, 1.5),
        r: 2.9 * size * (s / 1.3) + 0.5,
        tilt: rng.range(-0.12, 0.12),
        seed: rng.range(0, 10),
      })
    }
    // Each eye becomes a firefly; a few more were hiding in the dark too.
    let n = 0
    for (const pr of this.pairs) {
      for (const side of [-1, 1] as const) {
        const gap = pr.r * 1.45
        this.flies.push(this.makeFly(rng, pr.x + side * gap, pr.y, pr.r, side, pr.tilt, n++))
      }
    }
    for (let i = 0; i < 4; i++) {
      const x = cx + rng.range(-w * 0.35, w * 0.35)
      const y = cy + rng.range(h * 0.15, h * 0.75)
      this.flies.push(this.makeFly(rng, x, y, 0, 1, 0, n++))
    }
  }

  private makeFly(rng: Rng, ex: number, ey: number, r: number, side: -1 | 1, tilt: number, i: number): Firefly {
    const { x: cx, y: cy, w, h } = this.cave
    // Home: half inside the cave mouth, half drifting just outside it.
    const inside = i % 2 === 0
    const hx = inside ? cx + rng.range(-w * 0.38, w * 0.38) : cx + rng.range(-w * 1.1, w * 1.1)
    const hy = inside ? cy + rng.range(h * 0.18, h * 0.8) : cy + rng.range(h * 0.2, h * 1.6)
    return {
      x: ex,
      y: ey,
      ex,
      ey,
      hx,
      hy,
      ph: rng.range(0, TAU),
      orbit: rng.range(20, 44),
      speed: (i % 2 === 0 ? 1 : -1) * rng.range(1.8, 2.8),
      delay: 0.06 + rng.range(0, 0.16),
      r,
      side,
      tilt,
      tx: new Float32Array(5).fill(ex),
      ty: new Float32Array(5).fill(ey),
    }
  }

  focus(): ScaryPoint {
    return { x: this.cave.x + this.dir * 20, y: this.cave.y + this.cave.h * 0.45 }
  }

  override forecastFocus(): ScaryPoint {
    return { x: this.cave.x, y: this.cave.y + this.cave.h * 0.5 }
  }

  protected box(): Box {
    const { x, y, w, h } = this.cave
    return { x0: x - w * 1.4, x1: x + w * 1.4, y0: y - 30, y1: y + h * 2 }
  }

  override startReveal(cue: CueFn): void {
    cue('sparkle')
  }

  /** Where a firefly wants to be now. */
  private target(fl: Firefly, f: Frame, out: ScaryPoint): ScaryPoint {
    const c = f.clock
    const wx = fl.hx + Math.sin(c * 0.9 + fl.ph) * 7 + Math.sin(c * 2.3 + fl.ph * 2) * 2
    const wy = fl.hy + Math.cos(c * 0.7 + fl.ph) * 5 + Math.sin(c * 1.9 + fl.ph) * 2
    const her = f.her
    if (f.phase === 'looming') {
      out.x = fl.ex
      out.y = fl.ey
      return out
    }
    let ox = wx
    let oy = wy
    if (her) {
      const a = fl.ph + c * fl.speed
      ox = her.x + Math.cos(a) * fl.orbit
      oy = her.y + 26 + Math.sin(a) * fl.orbit * 0.7 + Math.sin(c * 3 + fl.ph) * 3
    }
    if (f.phase === 'revealing') {
      const toOrbit = smoothstep(window01(f.p, fl.delay, fl.delay + 0.3))
      const toHome = smoothstep(window01(f.p, 0.66, 1))
      const ax = lerp(fl.ex, ox, toOrbit)
      const ay = lerp(fl.ey, oy, toOrbit)
      out.x = lerp(ax, wx, toHome)
      out.y = lerp(ay, wy, toHome)
      return out
    }
    // Revealed: a few of them come and say hello when she is close by.
    if (her && fl.side === 1 && fl.r > 0) {
      const d = Math.hypot(her.x - this.cave.x, her.y - this.cave.y)
      const k = 1 - smoothstep((d - 70) / 90)
      out.x = lerp(wx, ox, k * 0.85)
      out.y = lerp(wy, oy, k * 0.85)
      return out
    }
    out.x = wx
    out.y = wy
    return out
  }

  override update(dt: number, f: Frame): void {
    const tmp: ScaryPoint = { x: 0, y: 0 }
    const rate = f.phase === 'revealing' ? 14 : 5
    const k = this.firstUpdate ? 1 : 1 - Math.exp(-rate * dt)
    this.firstUpdate = false
    this.trailAcc += dt
    const shift = this.trailAcc >= 1 / 30
    if (shift) this.trailAcc = 0
    for (const fl of this.flies) {
      this.target(fl, f, tmp)
      fl.x += (tmp.x - fl.x) * k
      fl.y += (tmp.y - fl.y) * k
      if (shift) {
        fl.tx.copyWithin(1, 0)
        fl.ty.copyWithin(1, 0)
        fl.tx[0] = fl.x
        fl.ty[0] = fl.y
      }
    }
  }

  private paintCave(g: CanvasRenderingContext2D): void {
    const pal = this.pal
    const { x, w, h } = this.cave
    const y = -this.cave.y
    const rim = new Path2D()
    rim.moveTo(x - w / 2 - 7, y + 1)
    rim.quadraticCurveTo(x - w / 2 - 8, y - h - 6, x, y - h - 9)
    rim.quadraticCurveTo(x + w / 2 + 8, y - h - 6, x + w / 2 + 7, y + 1)
    rim.closePath()
    g.fillStyle = mix(pal.faceDark, pal.rockDark, 0.4)
    g.fill(rim)
    g.strokeStyle = mix(pal.faceEdge, pal.ink, 0.3)
    g.lineWidth = 1.4
    g.stroke(rim)
    g.fillStyle = mix(pal.ink, '#120c18', 0.6)
    g.fill(this.mouth())
  }

  private mouth(): Path2D {
    const { x, w, h } = this.cave
    const y = -this.cave.y
    const m = new Path2D()
    m.moveTo(x - w / 2, y + 1)
    m.quadraticCurveTo(x - w / 2, y - h, x, y - h)
    m.quadraticCurveTo(x + w / 2, y - h, x + w / 2, y + 1)
    m.closePath()
    return m
  }

  /** The cave lit warm by its fireflies: moss, glowing mushrooms, a soft amber glow. */
  private paintWarm(g: CanvasRenderingContext2D): void {
    const pal = this.pal
    const { x, w, h } = this.cave
    const y = -this.cave.y
    const rng = createRng(`eyes-warm:${this.level.id}`)
    g.save()
    g.clip(this.mouth())
    const gr = g.createRadialGradient(x, y - h * 0.4, 2, x, y - h * 0.35, w * 0.7)
    gr.addColorStop(0, '#f3cf86')
    gr.addColorStop(0.5, '#b98447')
    gr.addColorStop(1, mix(pal.faceDark, '#4f3620', 0.55))
    g.fillStyle = gr
    g.fillRect(x - w, y - h - 4, w * 2, h + 8)
    // Back wall stones, lit.
    g.strokeStyle = rgba('#7a5230', 0.3)
    g.lineWidth = 0.9
    for (let i = 0; i < 3; i++) {
      g.beginPath()
      g.ellipse(x + rng.range(-w * 0.4, w * 0.4), y - rng.range(h * 0.3, h * 0.85), rng.range(5, 9), rng.range(3, 5), 0, 0, TAU)
      g.stroke()
    }
    // A mossy floor.
    g.fillStyle = mix(pal.top, '#c9b45a', 0.35)
    g.beginPath()
    g.ellipse(x, y + 2, w * 0.55, 7, 0, Math.PI, TAU)
    g.fill()
    // Glowing mushrooms.
    for (const [dx, s] of [
      [-0.28, 1],
      [-0.18, 0.7],
      [0.3, 0.85],
    ]) {
      const mx = x + dx * w
      const glow = this.dot('#d8ffbf', 0.2)
      g.globalAlpha = 0.6
      g.drawImage(glow, mx - 9 * s, y - 14 * s, 18 * s, 18 * s)
      g.globalAlpha = 1
      g.fillStyle = '#fbf0dc'
      g.fillRect(mx - 0.8 * s, y - 7 * s, 1.6 * s, 7 * s)
      g.fillStyle = '#9ff0d0'
      g.strokeStyle = ink('#9ff0d0')
      g.lineWidth = 0.6
      g.beginPath()
      g.ellipse(mx, y - 7 * s, 3.6 * s, 2.4 * s, 0, Math.PI, TAU)
      g.closePath()
      g.fill()
      g.stroke()
    }
    // An inner shade along the arch.
    g.strokeStyle = rgba(pal.ink, 0.35)
    g.lineWidth = 5
    g.stroke(this.mouth())
    g.restore()
  }

  override draw(ctx: CanvasRenderingContext2D, f: Frame): void {
    const v = f.view
    const S = this.sprites
    const { x, y, w, h } = this.cave
    const x0 = x - w / 2 - 12
    const y1 = y + h + 14
    if (this.cave.own) blit(ctx, v, S.get('cave', x0, y1, w + 24, h + 18, (g) => this.paintCave(g)))
    const warm = f.phase === 'looming' ? 0 : smoothstep(window01(f.p, 0.2, 0.7))
    if (warm > 0) {
      blit(ctx, v, S.get('warm', x0, y1, w + 24, h + 18, (g) => this.paintWarm(g)), warm)
      // The frame's one radial light: warm light spilling out of the cave.
      ctx.globalCompositeOperation = 'lighter'
      glowAt(ctx, v, this.dot('#ffd877', 0.05), x, y + h * 0.45, w * 1.2, 0.2 * warm * (0.92 + 0.08 * Math.sin(f.clock * 2.1)))
      ctx.globalCompositeOperation = 'source-over'
    }
    if (f.phase !== 'looming') return
    // Looming: pairs of eyes, blinking in the dark, glancing towards her now and then.
    const her = f.her
    const glow = this.dot('#d9ff8a', 0.15)
    for (const pr of this.pairs) {
      const blink = eyeBlink(f.clock, pr.seed)
      const look = her ? Math.max(-1, Math.min(1, (her.x - pr.x) / 120)) : 0
      const glance = Math.sin(f.clock * 0.37 + pr.seed) > 0.6 ? 0.8 : 0
      const dx = look * pr.r * 0.35 + glance * pr.r * 0.3
      for (const side of [-1, 1]) {
        const ex = pr.x + side * pr.r * 1.45 + dx
        const ey = pr.y
        glowAt(ctx, v, glow, ex, ey, pr.r * 3.4, 0.5 * (1 - blink * 0.7))
        drawEye(ctx, v, ex, ey, pr.r, blink, pr.tilt * side - side * 0.18)
      }
    }
  }

  override drawFront(ctx: CanvasRenderingContext2D, f: Frame): void {
    if (f.phase === 'looming') return
    const v = f.view
    const glow = this.dot('#e4ff7a', 0.12)
    const morph = f.phase === 'revealing' ? smoothstep(window01(f.p, 0, 0.22)) : 1
    const swirl = f.phase === 'revealing' ? bump(window01(f.p, 0.08, 0.95)) : 0
    // Glows first (added light), then the bright little bodies on top.
    ctx.globalCompositeOperation = 'lighter'
    for (let i = 0; i < this.flies.length; i++) {
      const fl = this.flies[i]
      const a = this.flyAlpha(fl, f)
      if (a <= 0) continue
      const pulse = 0.7 + 0.3 * Math.sin(f.clock * (2.4 + (i % 3) * 0.6) + fl.ph)
      const r = (fl.r > 0 && morph < 1 ? lerp(fl.r * 3.4, 9, morph) : 9) * (1 - swirl * 0.3)
      glowAt(ctx, v, glow, fl.x, fl.y, r, 0.7 * pulse * a * (1 - swirl * 0.25))
      // A short trail while they swirl.
      if (swirl > 0.05 || (f.phase === 'revealed' && fl.side === 1 && fl.r > 0)) {
        for (let k = 1; k < fl.tx.length; k++) {
          glowAt(ctx, v, glow, fl.tx[k], fl.ty[k], 4.5 - k * 0.6, (0.4 - k * 0.07) * a * Math.max(swirl, 0.5))
        }
      }
    }
    ctx.globalCompositeOperation = 'source-over'
    for (let i = 0; i < this.flies.length; i++) {
      const fl = this.flies[i]
      const a = this.flyAlpha(fl, f)
      if (a <= 0) continue
      if (fl.r > 0 && morph < 1) {
        // Still an eye, turning into a firefly.
        drawEye(ctx, v, fl.x, fl.y, lerp(fl.r, 1.2, morph), 0, (fl.tilt - 0.18) * fl.side * (1 - morph))
        continue
      }
      drawFirefly(ctx, v, fl.x, fl.y, f.clock * 30 + fl.ph, a)
    }
  }

  /** The ones that were hiding in the dark wake up a little later. */
  private flyAlpha(fl: Firefly, f: Frame): number {
    if (fl.r > 0 || f.phase !== 'revealing') return 1
    return smoothstep(window01(f.p, 0.3, 0.6))
  }
}

/** 0 = open, 1 = shut. Slow blinks, now and then a double one. */
function eyeBlink(t: number, seed: number): number {
  const period = 3.4 + (seed % 2.2)
  const ph = (t + seed * 1.7) % period
  const one = (u: number) => (u >= 0 && u < 0.2 ? Math.sin((u / 0.2) * Math.PI) : 0)
  return Math.max(one(ph), seed % 3 < 1 ? one(ph - 0.32) : 0)
}

/** A glowing eye (an almond of light), screen px from world. */
function drawEye(ctx: CanvasRenderingContext2D, v: View, x: number, y: number, r: number, blink: number, tilt: number): void {
  const sx = v.x(x)
  const sy = v.y(y)
  const rx = r * v.s
  const ry = r * 0.8 * v.s * (1 - blink * 0.92)
  if (ry <= 0.15) return
  ctx.save()
  ctx.translate(sx, sy)
  ctx.rotate(tilt)
  ctx.fillStyle = '#f4ffc4'
  ctx.beginPath()
  ctx.ellipse(0, 0, rx, ry, 0, 0, TAU)
  ctx.fill()
  ctx.fillStyle = '#d6f57a'
  ctx.beginPath()
  ctx.ellipse(0, ry * 0.25, rx * 0.8, ry * 0.55, 0, 0, TAU)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.ellipse(-rx * 0.25, -ry * 0.25, rx * 0.3, ry * 0.3, 0, 0, TAU)
  ctx.fill()
  ctx.restore()
}

/** A firefly: a bright little body with flickering wings. */
function drawFirefly(ctx: CanvasRenderingContext2D, v: View, x: number, y: number, flap: number, alpha: number): void {
  const sx = v.x(x)
  const sy = v.y(y)
  const s = Math.max(0.9, v.s)
  const k = 0.35 + 0.65 * Math.abs(Math.sin(flap))
  ctx.globalAlpha = alpha * 0.55
  ctx.fillStyle = '#f4fff0'
  ctx.beginPath()
  ctx.ellipse(sx - 1.4 * s, sy - 1.3 * s, 1.5 * s, 0.75 * s * k, -0.55, 0, TAU)
  ctx.ellipse(sx + 1.4 * s, sy - 1.3 * s, 1.5 * s, 0.75 * s * k, 0.55, 0, TAU)
  ctx.fill()
  ctx.globalAlpha = alpha
  ctx.fillStyle = '#eaff7a'
  ctx.beginPath()
  ctx.arc(sx, sy, 1.5 * s, 0, TAU)
  ctx.fill()
  ctx.fillStyle = '#ffffe8'
  ctx.beginPath()
  ctx.arc(sx - 0.3 * s, sy - 0.3 * s, 0.8 * s, 0, TAU)
  ctx.fill()
  ctx.globalAlpha = 1
}

// =============================================================================================
// Crumble Cliffs: the rumbling cliff → a big fluffy bear, asleep and snoring

interface Pebble {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  rot: number
  vr: number
  age: number
  life: number
  dark: boolean
}

interface Zee {
  x: number
  y: number
  age: number
  size: number
  ph: number
}

interface Puff {
  x: number
  y: number
  age: number
  size: number
}

const SNORE_PERIOD = 4.4

class BearScene extends Scene {
  readonly duration = 3.4
  private readonly den: { x0: number; x1: number; y: number }
  private readonly cx: number
  private readonly W: number
  private readonly H: number
  private readonly dir: 1 | -1
  private readonly bearS = 0.96
  private readonly pebbles: Pebble[] = []
  private readonly zees: Zee[] = []
  private readonly dust: Puff[] = []
  private cycle = -1
  private zeeDue = -1
  private readonly rng: Rng
  private revealStarted = false

  constructor(level: Level, ls: LooksScary, pal: ZonePalette) {
    super(level, ls, pal)
    this.rng = createRng(`bear:${level.id}`)
    const den = findLedge(level, ls.revealAt)
    const dy = den ? den.y : ls.y
    const dx0 = den ? den.x : ls.x - 40
    const dx1 = den ? den.x + den.w : ls.x + 120
    this.den = { x0: dx0, x1: dx1, y: dy }
    const standX = den ? den.standX ?? den.x + den.w / 2 : ls.x + 80
    this.W = 122
    this.H = 94
    // The cave sits at the end of the ledge away from her stand point, around the moment's x, and
    // never past the pitch's side walls.
    const half = this.W / 2
    let cx = ls.x + 14
    if (standX > cx) cx = Math.min(cx, standX - half - 2)
    else cx = Math.max(cx, standX + half + 2)
    this.cx = Math.max(half + 2, Math.min(WORLD_W - half - 2, cx))
    this.dir = standX >= cx ? 1 : -1
  }

  focus(): ScaryPoint {
    return { x: this.cx + this.dir * 12, y: this.den.y + this.H * 0.5 }
  }

  override forecastFocus(): ScaryPoint {
    return { x: this.cx, y: this.den.y + this.H * 0.5 }
  }

  protected box(): Box {
    return { x0: this.cx - this.W / 2 - 40, x1: this.cx + this.W / 2 + 40, y0: this.den.y - 60, y1: this.den.y + this.H + 80 }
  }

  override startReveal(cue: CueFn): void {
    cue('snore')
    this.revealStarted = true
  }

  /** Breathing 0..1 within a snore cycle (local seconds). */
  private breath(local: number): number {
    if (local < 0.8) return easeInOutSine(local / 0.8)
    if (local < 1.0) return 1
    if (local < 2.2) return 1 - easeInOutSine((local - 1) / 1.2)
    return 0
  }

  /** Just above the bear's head: where its Zzz float up from. */
  private headTop(): ScaryPoint {
    const s = this.bearS
    return { x: this.cx - this.dir * 4 + this.dir * 34 * s, y: this.den.y + 38 * s }
  }

  override update(dt: number, f: Frame, camera: Camera, cue: CueFn): void {
    const c = Math.floor(f.clock / SNORE_PERIOD)
    const local = f.clock - c * SNORE_PERIOD
    const near = this.near(f.view, 140)
    const awake = f.phase !== 'looming'
    if (c !== this.cycle && local < 0.4) {
      this.cycle = c
      if (near) {
        if (!awake) {
          cue('rumble')
          camera.shake(2.6, 0.9)
          this.spawnPebbles(5)
          this.spawnDust(3)
        } else {
          // The reveal's own snore was just cued: the next one comes with the rhythm.
          if (!(f.phase === 'revealing' && f.since < 1)) cue('snore')
          camera.shake(1.1, 0.7)
          this.spawnPebbles(1)
          this.zeeDue = f.clock + 0.85
        }
      }
    }
    if (this.revealStarted) {
      // The reveal: a snore now (cued in startReveal), the Zzz right after.
      this.revealStarted = false
      this.zeeDue = f.clock + 0.85
      camera.shake(1.1, 0.7)
    }
    if (this.zeeDue > 0 && f.clock >= this.zeeDue) {
      this.zeeDue = -1
      const n = this.headTop()
      for (let i = 0; i < 3; i++) this.zees.push({ x: n.x, y: n.y, age: -i * 0.34, size: 0.7 + i * 0.25, ph: this.rng.range(0, TAU) })
    }
    for (let i = this.pebbles.length - 1; i >= 0; i--) {
      const pb = this.pebbles[i]
      pb.age += dt
      if (pb.age < 0) continue
      pb.vy -= 420 * dt
      pb.x += pb.vx * dt
      pb.y += pb.vy * dt
      pb.rot += pb.vr * dt
      if (pb.age > pb.life) this.pebbles.splice(i, 1)
    }
    for (let i = this.zees.length - 1; i >= 0; i--) {
      const z = this.zees[i]
      z.age += dt
      if (z.age < 0) continue
      z.x -= this.dir * 7 * dt
      z.y += 17 * dt
      if (z.age > 2.8) this.zees.splice(i, 1)
    }
    for (let i = this.dust.length - 1; i >= 0; i--) {
      const d = this.dust[i]
      d.age += dt
      if (d.age > 1.4) this.dust.splice(i, 1)
    }
  }

  private spawnPebbles(n: number): void {
    const r = this.rng
    for (let i = 0; i < n; i++) {
      if (this.pebbles.length > 24) break
      this.pebbles.push({
        x: this.cx + r.range(-this.W / 2 - 18, this.W / 2 + 26),
        y: this.den.y + this.H + r.range(-4, 46),
        vx: r.range(-10, 10),
        vy: r.range(0, 30),
        r: r.range(1.3, 2.8),
        rot: r.range(0, TAU),
        vr: r.range(-6, 6),
        age: -r.range(0, 0.5),
        life: r.range(1.1, 1.6),
        dark: r.next() < 0.5,
      })
    }
  }

  private spawnDust(n: number): void {
    const r = this.rng
    for (let i = 0; i < n; i++) {
      this.dust.push({ x: this.cx + r.range(-this.W * 0.4, this.W * 0.4), y: this.den.y + this.H * r.range(0.7, 1.05), age: -r.range(0, 0.3), size: r.range(10, 18) })
    }
  }

  private mouth(): Path2D {
    const { cx, W, H } = this
    const L = cx - W / 2
    const R = cx + W / 2
    const b = -this.den.y + 2
    const m = new Path2D()
    m.moveTo(L, b)
    m.bezierCurveTo(L - 2, b - H * 0.72, L + W * 0.14, b - H, cx, b - H)
    m.bezierCurveTo(R - W * 0.14, b - H, R + 2, b - H * 0.72, R, b)
    m.closePath()
    return m
  }

  private spriteRect(): [number, number, number, number] {
    return [this.cx - this.W / 2 - 22, this.den.y + this.H + 24, this.W + 44, this.H + 32]
  }

  private paintInterior(g: CanvasRenderingContext2D, lit: boolean): void {
    const pal = this.pal
    const { cx, W, H } = this
    const b = -this.den.y
    const rng = createRng(`bear-cave:${this.level.id}`)
    g.save()
    g.clip(this.mouth())
    const gr = g.createLinearGradient(0, b - H, 0, b)
    if (lit) {
      gr.addColorStop(0, mix(pal.rockDark, '#5a3424', 0.4))
      gr.addColorStop(0.55, mix(pal.rock, '#e0a36c', 0.35))
      gr.addColorStop(1, mix(pal.rockLight, '#ffd9a0', 0.4))
    } else {
      gr.addColorStop(0, '#1d120e')
      gr.addColorStop(1, mix('#2a1912', pal.rockDark, 0.18))
    }
    g.fillStyle = gr
    g.fillRect(cx - W, b - H - 10, W * 2, H + 20)
    // Sandstone layers in the back wall.
    g.strokeStyle = lit ? rgba('#7a4528', 0.28) : rgba('#000000', 0.2)
    g.lineWidth = 1.2
    for (let i = 0; i < 5; i++) {
      const y = b - H * (0.22 + i * 0.15) + rng.range(-2, 2)
      g.beginPath()
      g.moveTo(cx - W * 0.6, y)
      g.bezierCurveTo(cx - W * 0.2, y - rng.range(2, 5), cx + W * 0.2, y + rng.range(2, 5), cx + W * 0.6, y - rng.range(-2, 2))
      g.stroke()
    }
    if (lit) {
      // A bed of leaves and straw.
      for (let i = 0; i < 26; i++) {
        const x = cx + rng.range(-W * 0.46, W * 0.46)
        const y = b - rng.range(0, 7)
        g.fillStyle = i % 3 === 0 ? '#e9b45a' : i % 3 === 1 ? '#c98a3e' : '#d9a14b'
        g.beginPath()
        g.ellipse(x, y, rng.range(3, 6), rng.range(1, 2), rng.range(-0.5, 0.5), 0, TAU)
        g.fill()
      }
      // Light falling in through the mouth.
      const sun = this.dot('#fff0c8', 0.1)
      g.globalAlpha = 0.35
      g.drawImage(sun, cx + this.dir * W * 0.15 - W * 0.45, b - H * 0.8, W * 0.9, H * 0.9)
      g.globalAlpha = 1
    }
    // Shade inside the arch.
    g.strokeStyle = rgba('#140b08', lit ? 0.35 : 0.6)
    g.lineWidth = 7
    g.stroke(this.mouth())
    g.restore()
  }

  private paintArch(g: CanvasRenderingContext2D): void {
    const pal = this.pal
    const { cx, W, H } = this
    const b = -this.den.y
    g.strokeStyle = mix(pal.faceEdge, pal.ink, 0.35)
    g.lineWidth = 1.8
    g.stroke(this.mouth())
    // Big rounded stones around the arch.
    const rng = createRng(`bear-arch:${this.level.id}`)
    const n = 11
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1)
      const a = Math.PI + u * Math.PI
      const x = cx + Math.cos(a) * (W / 2 + 3)
      const y = b + 2 - Math.max(0, -Math.sin(a)) * (H + 3) * (0.84 + 0.16 * Math.sin(u * Math.PI))
      const r = rng.range(4.5, 7)
      const c = mix(pal.rockLight, pal.faceLight, rng.range(0.2, 0.6))
      g.fillStyle = c
      g.strokeStyle = ink(c)
      g.lineWidth = 1.1
      g.beginPath()
      g.ellipse(x, y, r * 1.15, r * 0.9, a + Math.PI / 2, 0, TAU)
      g.fill()
      g.stroke()
      g.fillStyle = rgba('#ffffff', 0.25)
      g.beginPath()
      g.ellipse(x - r * 0.3, y - r * 0.3, r * 0.45, r * 0.3, 0, 0, TAU)
      g.fill()
    }
  }

  /** The bear, lying on its tummy with its head on its paws, facing her (art coords). */
  private paintBear(g: CanvasRenderingContext2D, silhouette: boolean): void {
    const s = this.bearS
    const d = this.dir
    const ox = this.cx - d * 4
    const oy = -this.den.y + 1
    const P = (x: number, y: number): [number, number] => [ox + d * x * s, oy + y * s]
    const fur = silhouette ? '#24150f' : '#9a6440'
    const furDark = silhouette ? '#1c100b' : '#7c4e31'
    const light = silhouette ? '#2a1912' : '#d9a877'
    const line = silhouette ? '#120a07' : '#4a2c1c'
    const lw = 1.5 * s
    const path = (pts: () => void) => {
      g.beginPath()
      pts()
    }
    // Body: a big soft loaf with fluffy scallops along the back.
    path(() => {
      const [ax, ay] = P(-50, 0)
      g.moveTo(ax, ay)
      const steps = 14
      const loaf = (u: number): number => Math.max(6, Math.pow(Math.sin(Math.PI * clamp01(u * 0.92 + 0.04)), 0.55) * 42)
      for (let i = 0; i <= steps; i++) {
        const u = i / steps
        const bx = lerp(-52, 34, u)
        const [x, y] = P(bx, -loaf(u))
        if (i === 0) g.lineTo(x, y)
        else {
          // Fluffy scallops along the back.
          const um = u - 0.5 / steps
          const [mx, my] = P(lerp(-52, 34, um), -loaf(um) - 3.4)
          g.quadraticCurveTo(mx, my, x, y)
        }
      }
      const [ex, ey] = P(34, 0)
      g.lineTo(ex, ey)
      g.closePath()
    })
    g.fillStyle = fur
    g.fill()
    g.strokeStyle = line
    g.lineWidth = lw
    g.stroke()
    if (!silhouette) {
      // Lighter tummy fluff along the bottom.
      g.fillStyle = mix(fur, light, 0.35)
      g.beginPath()
      const [tx, ty] = P(-8, -5)
      g.ellipse(tx, ty, 36 * s, 6 * s, 0, 0, TAU)
      g.fill()
      // Fur ticks on the back.
      g.strokeStyle = furDark
      g.lineWidth = 1 * s
      for (let i = 0; i < 9; i++) {
        const u = 0.12 + i * 0.09
        const bx = lerp(-52, 34, u)
        const hump = Math.pow(Math.sin(Math.PI * clamp01(u * 0.92 + 0.04)), 0.55) * 42
        const [x1, y1] = P(bx, -hump + 7)
        const [x2, y2] = P(bx + 2.5, -hump + 12)
        g.beginPath()
        g.moveTo(x1, y1)
        g.lineTo(x2, y2)
        g.stroke()
      }
    }
    // Back foot, sole towards us (little pads).
    {
      const [fx, fy] = P(-44, -7)
      g.fillStyle = furDark
      g.strokeStyle = line
      g.lineWidth = lw
      g.beginPath()
      g.ellipse(fx, fy, 7 * s, 9 * s, d * 0.15, 0, TAU)
      g.fill()
      g.stroke()
      if (!silhouette) {
        g.fillStyle = '#e3a08a'
        g.beginPath()
        g.ellipse(fx, fy + 2 * s, 3.6 * s, 4.2 * s, 0, 0, TAU)
        g.fill()
        for (let i = 0; i < 3; i++) {
          g.beginPath()
          g.arc(fx + (i - 1) * 2.8 * s, fy - 4.6 * s, 1.3 * s, 0, TAU)
          g.fill()
        }
      }
    }
    // Front paws under the chin.
    for (const [px, rx] of [
      [30, 9],
      [44, 9.5],
    ]) {
      const [x, y] = P(px, -3.6)
      g.fillStyle = fur
      g.strokeStyle = line
      g.lineWidth = lw
      g.beginPath()
      g.ellipse(x, y, rx * s, 4.6 * s, 0, 0, TAU)
      g.fill()
      g.stroke()
      if (!silhouette) {
        g.strokeStyle = furDark
        g.lineWidth = 0.9 * s
        for (let k = -1; k <= 1; k++) {
          g.beginPath()
          g.moveTo(x + d * (rx * 0.6) * s + k * 0.1, y - 2 * s + k * 1.6 * s)
          g.lineTo(x + d * (rx * 0.95) * s, y - 1.6 * s + k * 1.6 * s)
          g.stroke()
        }
      }
    }
    // Head resting on the paws.
    const [hx, hy] = P(38, -19)
    for (const [ex, ey, er] of [
      [28, -32, 6],
      [46, -33, 5.6],
    ]) {
      const [x, y] = P(ex, ey)
      g.fillStyle = fur
      g.strokeStyle = line
      g.lineWidth = lw
      g.beginPath()
      g.arc(x, y, er * s, 0, TAU)
      g.fill()
      g.stroke()
      if (!silhouette) {
        g.fillStyle = '#d98c78'
        g.beginPath()
        g.arc(x, y + 0.6 * s, er * 0.5 * s, 0, TAU)
        g.fill()
      }
    }
    g.fillStyle = fur
    g.strokeStyle = line
    g.lineWidth = lw
    g.beginPath()
    g.ellipse(hx, hy, 16 * s, 14.5 * s, 0, 0, TAU)
    g.fill()
    g.stroke()
    // Cheek fluff.
    if (!silhouette) {
      g.strokeStyle = furDark
      g.lineWidth = 1 * s
      for (let k = 0; k < 3; k++) {
        const [x1, y1] = P(24 + k * 1.2, -12 + k * 3)
        const [x2, y2] = P(22.5 + k * 1.2, -10 + k * 3)
        g.beginPath()
        g.moveTo(x1, y1)
        g.lineTo(x2, y2)
        g.stroke()
      }
    }
    // Muzzle, nose, sleepy eyes, a little smile.
    const [mx, my] = P(48, -13)
    g.fillStyle = light
    g.beginPath()
    g.ellipse(mx, my, 8.5 * s, 6.5 * s, 0, 0, TAU)
    g.fill()
    if (silhouette) return
    g.strokeStyle = mix(light, line, 0.5)
    g.lineWidth = 0.9 * s
    g.stroke()
    const [nx, ny] = P(54, -15.5)
    g.fillStyle = '#3a2420'
    g.beginPath()
    g.ellipse(nx, ny, 3.4 * s, 2.5 * s, 0, 0, TAU)
    g.fill()
    g.fillStyle = 'rgba(255,255,255,0.6)'
    g.beginPath()
    g.ellipse(nx - d * 1 * s, ny - 0.9 * s, 1 * s, 0.6 * s, 0, 0, TAU)
    g.fill()
    g.strokeStyle = '#3a2420'
    g.lineWidth = 1.2 * s
    for (const ex of [32, 44]) {
      const [x, y] = P(ex, -22)
      g.beginPath()
      g.arc(x, y - 1.2 * s, 3 * s, 0.25 * Math.PI, 0.75 * Math.PI)
      g.stroke()
    }
    const [sx, sy] = P(50, -8.6)
    g.beginPath()
    g.arc(sx, sy - 2 * s, 2.4 * s, 0.2 * Math.PI, 0.8 * Math.PI)
    g.stroke()
    g.fillStyle = rgba('#ff9b8a', 0.45)
    const [cxp, cyp] = P(29, -14)
    g.beginPath()
    g.ellipse(cxp, cyp, 3.4 * s, 2.2 * s, 0, 0, TAU)
    g.fill()
  }

  override draw(ctx: CanvasRenderingContext2D, f: Frame): void {
    const v = f.view
    const S = this.sprites
    const [x0, y1, w, h] = this.spriteRect()
    const lit = f.phase === 'looming' ? 0 : smoothstep(window01(f.p, 0.05, 0.5))
    const c = Math.floor(f.clock / SNORE_PERIOD)
    const local = f.clock - c * SNORE_PERIOD
    const br = this.breath(local)
    // The cliff jitters a touch while it rumbles.
    const env = local < 0.9 ? bump(local / 0.9) : 0
    const jx = f.phase === 'looming' ? Math.sin(f.clock * 47) * 0.7 * env : 0
    if (lit < 1) blit(ctx, v, S.get('dark', x0, y1, w, h, (g) => this.paintInterior(g, false)), 1, jx)
    if (lit > 0) blit(ctx, v, S.get('lit', x0, y1, w, h, (g) => this.paintInterior(g, true)), lit, jx)
    // The bear: a dark shape breathing in the dark … then, in the light, a bear.
    const bx0 = this.cx - 66
    const bw = 132
    const by1 = this.den.y + 52
    const bh = 54
    const pivotX = this.cx
    const pivotY = this.den.y
    const sy = 1 + 0.045 * br
    const sx = 1 + 0.012 * br
    ctx.save()
    v.applyWorld(ctx)
    ctx.clip(this.mouth())
    v.applyScreen(ctx)
    if (lit < 1) blitAbout(ctx, v, S.get('bearDark', bx0, by1, bw, bh, (g) => this.paintBear(g, true)), 0.55 * (1 - lit), pivotX + jx, pivotY, sx, sy)
    if (lit > 0) blitAbout(ctx, v, S.get('bear', bx0, by1, bw, bh, (g) => this.paintBear(g, false)), lit, pivotX, pivotY, sx, sy)
    ctx.restore()
    blit(ctx, v, S.get('arch', x0, y1, w, h, (g) => this.paintArch(g)), 1, jx)
  }

  override drawFront(ctx: CanvasRenderingContext2D, f: Frame): void {
    const v = f.view
    const pal = this.pal
    // Dust puffs shaken loose by the rumble.
    if (this.dust.length) {
      const dot = this.dot(mix(pal.faceLight, '#ffffff', 0.3), 0.2)
      for (const d of this.dust) {
        if (d.age < 0) continue
        const k = d.age / 1.4
        glowAt(ctx, v, dot, d.x, d.y - k * 10, d.size * (0.6 + k), 0.45 * (1 - k))
      }
    }
    // Pebbles skittering down.
    for (const pb of this.pebbles) {
      if (pb.age < 0) continue
      const a = 1 - smoothstep((pb.age - pb.life + 0.35) / 0.35)
      const c = pb.dark ? pal.rockDark : pal.rockLight
      ctx.globalAlpha = a
      ctx.save()
      ctx.translate(v.x(pb.x), v.y(pb.y))
      ctx.rotate(pb.rot)
      ctx.fillStyle = c
      ctx.strokeStyle = ink(c)
      ctx.lineWidth = Math.max(0.8, 0.6 * v.s)
      ctx.beginPath()
      ctx.ellipse(0, 0, pb.r * v.s * 1.2, pb.r * v.s * 0.85, 0, 0, TAU)
      ctx.fill()
      ctx.stroke()
      ctx.restore()
    }
    ctx.globalAlpha = 1
    // Zzz bubbles.
    for (const z of this.zees) {
      if (z.age < 0) continue
      const k = z.age / 2.8
      const a = smoothstep(z.age / 0.25) * (1 - smoothstep((k - 0.6) / 0.4))
      const x = z.x + Math.sin(z.age * 2.2 + z.ph) * 3
      const size = (5 + 4 * easeOutCubic(Math.min(1, z.age / 1.2))) * z.size
      drawZee(ctx, v.x(x), v.y(z.y), size * v.s, a, pal)
    }
  }
}

/** A "Z" in a soft bubble (screen px). */
function drawZee(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, alpha: number, pal: ZonePalette): void {
  if (alpha <= 0.01 || r < 1) return
  ctx.globalAlpha = alpha
  ctx.fillStyle = 'rgba(255,255,255,0.75)'
  ctx.strokeStyle = rgba(pal.ink, 0.35)
  ctx.lineWidth = Math.max(1, r * 0.08)
  ctx.beginPath()
  ctx.arc(x, y, r, 0, TAU)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.beginPath()
  ctx.ellipse(x - r * 0.42, y - r * 0.42, r * 0.22, r * 0.14, -0.7, 0, TAU)
  ctx.fill()
  const z = r * 0.46
  ctx.strokeStyle = mix(pal.ink, '#5a6fb0', 0.4)
  ctx.lineWidth = Math.max(1.2, r * 0.17)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(x - z, y - z)
  ctx.lineTo(x + z, y - z)
  ctx.lineTo(x - z, y + z)
  ctx.lineTo(x + z, y + z)
  ctx.stroke()
  ctx.globalAlpha = 1
}

// =============================================================================================
// Gusty Ridge: the rickety rope bridge (terrain draws the bridge itself)

class BridgeScene extends Scene {
  readonly duration = 2.6
  private readonly x0: number
  private readonly x1: number
  private readonly top: number
  private readonly n: number
  private readonly loose: number[]
  private readonly windDir: number
  private nextCreak = 2.2
  private creakAt = -10
  private readonly rng: Rng
  private landX: number | null = null

  constructor(level: Level, ls: LooksScary, pal: ZonePalette) {
    super(level, ls, pal)
    this.rng = createRng(`bridge:${level.id}`)
    const b = findLedge(level, ls.revealAt)
    this.x0 = b ? b.x : ls.x - 110
    this.x1 = b ? b.x + b.w : ls.x + 110
    this.top = b ? b.y : ls.y
    this.n = Math.max(4, Math.round((this.x1 - this.x0) / 13))
    this.loose = [Math.floor(this.n * 0.34), Math.floor(this.n * 0.66)]
    const zone = (level.wind ?? []).find((z) => this.top >= z.y && this.top <= z.y + z.h)
    this.windDir = zone ? zone.dir : 1
  }

  focus(): ScaryPoint {
    return { x: (this.x0 + this.x1) / 2, y: this.top + 22 }
  }

  override forecastFocus(): ScaryPoint {
    return { x: (this.x0 + this.x1) / 2, y: this.top }
  }

  /** Deck planks (terrain's plank indices) that are missing right now. */
  gaps(f: Frame): number[] {
    if (f.phase === 'looming') return this.loose
    return f.phase === 'revealing' && f.p < 0.5 ? this.loose : []
  }

  protected box(): Box {
    return { x0: this.x0 - 40, x1: this.x1 + 40, y0: this.top - 120, y1: this.top + 60 }
  }

  override startReveal(cue: CueFn): void {
    cue('creak')
    this.landX = null
  }

  /** Approximate deck sag (matches the terrain's bridge closely enough for things hung on it). */
  private dip(x: number): number {
    const span = (x - this.x0) / (this.x1 - this.x0)
    return Math.sin(Math.PI * clamp01(span)) * 1.8
  }

  /** World altitude of the hand rope at x. */
  private handY(x: number): number {
    const span = clamp01((x - this.x0) / (this.x1 - this.x0))
    return this.top + 24 - Math.sin(Math.PI * span) * (12 + this.dip(x) * 0.5)
  }

  override update(_dt: number, f: Frame, _camera: Camera, cue: CueFn): void {
    if (f.phase === 'revealing' && this.landX === null && f.her) this.landX = f.her.x
    if (f.phase !== 'looming') return
    if (f.clock >= this.nextCreak) {
      this.nextCreak = f.clock + this.rng.range(3.2, 5.4)
      if (this.near(f.view, 60)) {
        this.creakAt = f.clock
        cue('creak')
      }
    }
  }

  private paintMist(g: CanvasRenderingContext2D): void {
    const rng = createRng(`bridge-mist:${this.level.id}`)
    const fog = this.dot(mix(this.pal.mist, '#ffffff', 0.4), 0.2)
    puffs(g, rng, fog, this.x0 - 10, -this.top + 26, this.x1 - this.x0 + 20, 80, 22, [40, 90], [0.35, 0.75])
  }

  override draw(ctx: CanvasRenderingContext2D, f: Frame): void {
    const v = f.view
    const p = f.p
    // A misty gap under the bridge.
    const mist = this.sprites.get('mist', this.x0 - 50, this.top - 10, this.x1 - this.x0 + 100, 130, (g) => this.paintMist(g), 0.6)
    blit(ctx, v, mist, f.phase === 'looming' ? 0.8 : lerp(0.8, 0.45, smoothstep(p)), Math.sin(f.clock * 0.3) * 6)
    v.applyWorld(ctx)
    // Loose planks dangling under the deck (rickety!) — the reveal swings them back up into place.
    const pw = (this.x1 - this.x0) / this.n
    const kick = Math.exp(-(f.clock - this.creakAt) * 2.5)
    const back = f.phase === 'looming' ? 0 : easeOutBack(window01(p, 0.1, 0.5), 1.4)
    const gone = f.phase === 'looming' ? 0 : smoothstep(window01(p, 0.42, 0.56))
    if (gone < 1) {
      for (let i = 0; i < this.loose.length; i++) {
        const k = this.loose[i]
        const px = this.x0 + (k + 0.5) * pw
        const ay = this.top - this.dip(px) - 4.2
        const swing = Math.sin(f.clock * (1.6 + i * 0.3) + i * 2) * (0.22 + 0.35 * kick) + (i === 0 ? 0.1 : -0.12)
        const hang = Math.PI / 2 - 0.25 + swing
        const ang = lerp(hang, 0, back)
        const dy = lerp(-7, 4.4, back)
        ctx.globalAlpha = 1 - gone
        ctx.save()
        ctx.translate(px - pw * 0.42, -(ay + dy))
        ctx.rotate(ang)
        ctx.strokeStyle = mix(this.pal.wood, '#f3e2c0', 0.5)
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(0, -dy * 0.9)
        ctx.lineTo(0, 0)
        ctx.stroke()
        ctx.fillStyle = mix(this.pal.wood, '#ffffff', 0.08)
        ctx.strokeStyle = ink(this.pal.wood)
        ctx.lineWidth = 1.1
        ctx.beginPath()
        roundRectPath(ctx, 0, -2.6, pw - 2, 5.4, 1.5)
        ctx.fill()
        ctx.stroke()
        ctx.strokeStyle = rgba(ink(this.pal.wood), 0.5)
        ctx.lineWidth = 0.6
        ctx.beginPath()
        ctx.moveTo(2, -0.6)
        ctx.lineTo(pw - 5, -0.2)
        ctx.stroke()
        ctx.restore()
      }
      ctx.globalAlpha = 1
    }
    // Revealed: a garland of little pennants on the hand rope (it held!).
    const flags = f.phase === 'looming' ? 0 : 1
    if (flags > 0) {
      const colors = [this.pal.flag, this.pal.accents[1] ?? '#ffd36b', this.pal.tent, this.pal.accents[3] ?? '#b6e0ff', this.pal.accents[2] ?? '#ff9db0']
      const m = 11
      for (let i = 0; i < m; i++) {
        const x = lerp(this.x0, this.x1, (i + 1) / (m + 1))
        const at = f.phase === 'revealing' ? window01(p, 0.42 + i * 0.035, 0.62 + i * 0.035) : 1
        if (at <= 0) continue
        const s = easeOutBack(at, 2)
        const y = this.handY(x) - 0.8
        const flutter = Math.sin(f.clock * 3.2 + i * 1.3) * 0.18 + this.windDir * 0.08
        const c = colors[i % colors.length]
        ctx.save()
        ctx.translate(x, -y)
        ctx.rotate(flutter)
        ctx.scale(s, s)
        ctx.fillStyle = c
        ctx.strokeStyle = ink(c)
        ctx.lineWidth = 0.7
        ctx.beginPath()
        ctx.moveTo(-3.6, 0)
        ctx.lineTo(3.6, 0)
        ctx.lineTo(0, 8.5)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
        ctx.restore()
      }
    }
    v.applyScreen(ctx)
  }

  /** Looming: a couple of loose planks sticking up, frayed rope ends, wobble lines. */
  private drawRickety(ctx: CanvasRenderingContext2D, f: Frame, a: number): void {
    const v = f.view
    const pal = this.pal
    const pw = (this.x1 - this.x0) / this.n
    const kick = Math.exp(-(f.clock - this.creakAt) * 2.5)
    v.applyWorld(ctx)
    ctx.globalAlpha = a
    // Loose planks, one end popped up off the deck (they rattle when it creaks).
    for (const [k, dir] of [
      [Math.floor(this.n * 0.17), 1],
      [Math.floor(this.n * 0.83), -1],
    ] as const) {
      const cx = this.x0 + (k + 0.5) * pw
      const y = this.top - this.dip(cx) + 0.5
      const tilt = (0.24 + 0.08 * Math.sin(f.clock * 7 + k) * kick) * dir
      ctx.save()
      ctx.translate(cx - (dir * pw) / 2, -y)
      ctx.rotate(-tilt)
      ctx.fillStyle = mix(pal.wood, '#ffffff', 0.12)
      ctx.strokeStyle = ink(pal.wood)
      ctx.lineWidth = 1.1
      ctx.beginPath()
      roundRectPath(ctx, dir > 0 ? 0 : -(pw - 1), -1, pw - 1, 5.5, 1.6)
      ctx.fill()
      ctx.stroke()
      ctx.restore()
    }
    // Frayed rope ends at the posts.
    const rope = mix(pal.wood, '#f3e2c0', 0.5)
    ctx.strokeStyle = ink(rope)
    ctx.lineWidth = 0.8
    for (const [px, side] of [
      [this.x0, 1],
      [this.x1, -1],
    ] as const) {
      const bx = px + side * 4
      const by = -(this.top + 26)
      for (let i = 0; i < 4; i++) {
        const wob = Math.sin(f.clock * 5 + i) * 0.8
        ctx.beginPath()
        ctx.moveTo(bx, by)
        ctx.quadraticCurveTo(bx + side * (2 + i), by + 2 + i * 0.6, bx + side * (1 + i * 1.3) + wob, by + 5 + i * 1.4)
        ctx.stroke()
      }
    }
    // Cartoon wobble marks beside the posts, in time with its sway.
    const sw = Math.sin(f.clock * 1.6)
    ctx.globalAlpha = a * (0.3 + 0.4 * Math.abs(sw) + 0.3 * kick)
    ctx.strokeStyle = rgba(pal.ink, 0.55)
    ctx.lineWidth = 1.1
    for (const [px, side] of [
      [this.x0, -1],
      [this.x1, 1],
    ] as const) {
      for (let i = 0; i < 2; i++) {
        const r = 5 + i * 3.5
        const cx = px + side * (2 + i * 0.5)
        const cy = -(this.top + 6)
        ctx.beginPath()
        ctx.arc(cx, cy, r, side > 0 ? -0.55 : Math.PI - 0.55, side > 0 ? 0.55 : Math.PI + 0.55)
        ctx.stroke()
      }
    }
    ctx.globalAlpha = 1
    v.applyScreen(ctx)
  }

  override drawFront(ctx: CanvasRenderingContext2D, f: Frame): void {
    const v = f.view
    const p = f.p
    const rickety = f.phase === 'looming' ? 1 : 1 - smoothstep(window01(p, 0.1, 0.5))
    if (rickety > 0.01) this.drawRickety(ctx, f, rickety)
    // Looming: wind streaks whistling round the bridge, and creaks at the posts.
    const windA = f.phase === 'looming' ? 1 : 1 - smoothstep(window01(p, 0, 0.35))
    if (windA > 0.01) {
      const span = this.x1 - this.x0 + 120
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'
      ctx.lineCap = 'round'
      ctx.lineWidth = Math.max(1, 1.1 * v.s)
      for (let i = 0; i < 4; i++) {
        const u = ((f.clock * (70 + i * 14) + i * 83) % span) / span
        const xx = this.windDir > 0 ? this.x0 - 60 + u * span : this.x1 + 60 - u * span
        const y = this.top + [34, -6, 16, -26][i] + Math.sin(f.clock * 2 + i) * 3
        const len = 26 + (i % 2) * 12
        const a = windA * bump(u) * 0.8
        if (a < 0.02) continue
        ctx.globalAlpha = a
        const x0 = v.x(xx - this.windDir * len)
        const x1 = v.x(xx)
        const yy = v.y(y)
        const curl = 4 * v.s
        ctx.beginPath()
        ctx.moveTo(x0, yy)
        ctx.quadraticCurveTo((x0 + x1) / 2, yy - 2 * v.s, x1, yy)
        ctx.arc(x1, yy - curl, curl, Math.PI / 2, this.windDir > 0 ? -Math.PI * 0.6 : Math.PI * 1.6, this.windDir < 0)
        ctx.stroke()
      }
      ctx.globalAlpha = 1
      const age = f.clock - this.creakAt
      if (f.phase === 'looming' && age >= 0 && age < 0.8) {
        const a = 1 - age / 0.8
        ctx.strokeStyle = rgba(this.pal.ink, 0.55 * a)
        ctx.lineWidth = Math.max(1, 1.2 * v.s)
        for (const [px, side] of [
          [this.x0, -1],
          [this.x1, 1],
        ] as const) {
          const cx = v.x(px + side * 6)
          const cy = v.y(this.top + 24)
          for (let k = 0; k < 2; k++) {
            const r = (4 + k * 3.5 + age * 6) * v.s
            ctx.beginPath()
            ctx.arc(cx - side * 4 * v.s, cy, r, side > 0 ? -0.6 : Math.PI - 0.6, side > 0 ? 0.6 : Math.PI + 0.6)
            ctx.stroke()
          }
        }
      }
    }
    // The reveal: twinkles running along the hand ropes from where she landed — it held!
    if (f.phase === 'revealing') {
      const from = this.landX ?? (this.x0 + this.x1) / 2
      const k = window01(p, 0.05, 0.75)
      if (k > 0 && k < 1) {
        for (const end of [this.x0, this.x1]) {
          for (let i = 0; i < 5; i++) {
            const u = clamp01(easeOutCubic(k) * 1.15 - i * 0.07)
            const x = lerp(from, end, u)
            const y = this.handY(x) + 1
            const r = (2 + (i % 2) * 1.4) * bump(Math.min(1, k * 1.3)) * v.s
            twinkle(ctx, v.x(x), v.y(y), r, i % 2 ? '#fff6c8' : '#ffffff')
          }
        }
        const burst = window01(p, 0.02, 0.4)
        if (burst > 0 && burst < 1) {
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * TAU
            const r = (10 + 22 * easeOutCubic(burst)) * v.s
            twinkle(ctx, v.x(from) + Math.cos(a) * r, v.y(this.top + 14) + Math.sin(a) * r * 0.7, 2.6 * bump(burst) * v.s, '#fff3b0')
          }
        }
      }
    }
  }
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.moveTo(x + rr, y)
  ctx.lineTo(x + w - rr, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr)
  ctx.lineTo(x + w, y + h - rr)
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h)
  ctx.lineTo(x + rr, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr)
  ctx.lineTo(x, y + rr)
  ctx.quadraticCurveTo(x, y, x + rr, y)
}

// =============================================================================================
// Cloud Steps: a giant horned shadow on the fog → a tiny fluffy marmot, backlit by the low sun

/** The marmot's drawing scale, and its height (units) from its feet to the tips of its ear tufts. */
const MARMOT_S = 1.12
const MARMOT_H = 31 * MARMOT_S

class ShadowScene extends Scene {
  readonly duration = 3.6
  private readonly mx: number
  private readonly my: number
  private readonly dir: 1 | -1
  /** Shadow: bottom-centre and height (units). */
  private readonly shx: number
  private readonly shy: number
  private readonly shH: number
  private waveUntil = -1
  private nextWave = 4

  constructor(level: Level, ls: LooksScary, pal: ZonePalette) {
    super(level, ls, pal)
    const pair = leapFor(level, ls)
    const to = pair ? pair.to : findLedge(level, ls.revealAt)
    const from = pair ? pair.from : findLedge(level, ls.forecastAt)
    const tx0 = to ? to.x : ls.x - 60
    const tx1 = to ? to.x + to.w : ls.x + 30
    this.my = to ? to.y : ls.y
    this.mx = Math.max(tx0 + 16, Math.min(tx1 - 16, ls.x))
    const fromC = from ? from.x + from.w / 2 : this.mx - 200
    this.dir = fromC < this.mx ? -1 : 1
    // The shadow stands on the fog between her camp and the marmot, leaning towards the camp.
    const edge = from ? (this.dir < 0 ? from.x + from.w : from.x) : this.mx + this.dir * 160
    const gapMid = (edge + (this.dir < 0 ? tx0 : tx1)) / 2
    this.shx = lerp(gapMid, this.mx, 0.45)
    this.shy = this.my - 46
    this.shH = 250
  }

  focus(): ScaryPoint {
    return { x: lerp(this.shx, this.mx, 0.6), y: this.my + 70 }
  }

  override forecastFocus(): ScaryPoint {
    return { x: this.shx, y: this.shy + this.shH * 0.55 }
  }

  protected box(): Box {
    const half = this.shH * 0.5
    return { x0: Math.min(this.shx - half, this.mx - 60), x1: Math.max(this.shx + half, this.mx + 60), y0: this.shy - 30, y1: this.shy + this.shH + 40 }
  }

  override startReveal(cue: CueFn): void {
    cue('sparkle')
  }

  override update(_dt: number, f: Frame): void {
    if (f.phase === 'looming') return
    const her = f.her
    const close = her ? Math.hypot(her.x - this.mx, her.y - this.my) < 190 : false
    if (f.clock >= this.nextWave && (close || f.phase === 'revealing')) {
      this.waveUntil = f.clock + 2.2
      this.nextWave = f.clock + (close ? 4.5 : 7)
    }
  }

  /** The giant shadow (marmot shape, stretched tall, soft edges) + a faint glory ring. */
  private paintShadow(g: CanvasRenderingContext2D, k: number): void {
    const pal = this.pal
    const sc = this.shH / MARMOT_H
    const off = 4000
    g.save()
    // Soft edges: draw the shape far off-canvas and keep only its blurred shadow.
    g.shadowColor = rgba(mix(pal.ink, pal.faceDark, 0.3), 0.85)
    g.shadowBlur = 7 * k
    g.shadowOffsetX = off * k
    g.translate(this.shx - off, -this.shy)
    g.scale(sc * 0.9 * this.dir * MARMOT_S, sc * 1.06 * MARMOT_S)
    g.fillStyle = '#000'
    // The low sun stretches the shadow's ear tufts into great curly horns.
    g.fill(marmotShape(1, 1.5))
    g.restore()
  }

  private paintGlory(g: CanvasRenderingContext2D, k: number): void {
    const sc = this.shH / MARMOT_H
    const cx = this.shx
    const cy = -(this.shy + 20 * MARMOT_S * sc * 1.06)
    const colors = ['#c7a2ff', '#9fd4ff', '#a9e88f', '#ffe48a', '#ffb08a']
    g.save()
    g.shadowColor = 'rgba(255,255,255,0.6)'
    g.shadowBlur = 4 * k
    for (let i = 0; i < colors.length; i++) {
      g.strokeStyle = rgba(colors[i], 0.5)
      g.lineWidth = 3.2
      g.beginPath()
      g.arc(cx, cy, 8.6 * MARMOT_S * sc + i * 3, 0, TAU)
      g.stroke()
    }
    g.restore()
  }

  private paintScreen(g: CanvasRenderingContext2D): void {
    const rng = createRng(`shadow-fog:${this.level.id}`)
    const fog = this.dot(mix(this.pal.mist, '#ffffff', 0.25), 0.2)
    const w = this.shH * 0.95
    puffs(g, rng, fog, this.shx - w / 2, -(this.shy + this.shH + 10), w, this.shH * 1.05, 30, [70, 140], [0.45, 0.85])
  }

  /** The marmot's body (no near paw, no eyes), backlit: a warm halo and rim, golden fur. */
  private paintMarmot(g: CanvasRenderingContext2D, k: number): void {
    const d = this.dir
    g.save()
    g.translate(this.mx, -this.my)
    g.scale(d * MARMOT_S, MARMOT_S)
    const shape = marmotShape(1, 0.7)
    // Halo: the low sun (the moon, at night) behind it lights up its fluff.
    const night = this.pal.night
    g.save()
    g.shadowColor = night ? 'rgba(190, 205, 255, 0.9)' : 'rgba(255, 210, 120, 0.95)'
    g.shadowBlur = 8 * k
    g.fillStyle = night ? '#d6defc' : '#ffe2a0'
    g.fill(shape)
    g.restore()
    g.strokeStyle = this.rim()
    g.lineWidth = 2.4
    g.stroke(shape)
    g.save()
    g.clip(shape)
    g.fillStyle = night ? mix('#bb8650', '#3a4070', 0.3) : '#bb8650'
    g.fillRect(-14, -36, 28, 38)
    // The side away from her is a little darker; tummy, muzzle and inner ears are cream and pink.
    g.fillStyle = rgba('#8f5f36', 0.55)
    g.beginPath()
    g.ellipse(-7, -9, 4.6, 11, 0.1, 0, TAU)
    g.fill()
    g.fillStyle = '#f1d3a6'
    g.beginPath()
    g.ellipse(2, -7.4, 5, 7, 0, 0, TAU)
    g.fill()
    g.fillStyle = '#f7e4c6'
    g.beginPath()
    g.ellipse(4.4, -17.6, 3.7, 2.8, 0, 0, TAU)
    g.fill()
    // A darker cap on top of its head, where the tufts grow.
    g.fillStyle = rgba('#7d5030', 0.75)
    g.beginPath()
    g.ellipse(-0.6, -25.6, 5.6, 3, -0.08, 0, TAU)
    g.fill()
    g.fillStyle = '#e9a58c'
    g.beginPath()
    g.arc(-6.1, -23, 0.7, 0, TAU)
    g.arc(6.1, -23, 0.7, 0, TAU)
    g.fill()
    g.restore()
    g.strokeStyle = rgba('#6b4528', 0.6)
    g.lineWidth = 0.6
    g.stroke(shape)
    // Fluffy fur ticks catching the light.
    g.strokeStyle = rgba(this.rim(), 0.9)
    g.lineWidth = 0.6
    for (const [x, y, dx, dy] of [
      [-8.4, -5, -1, -1.2],
      [-8.8, -9.5, -1.1, -0.8],
      [8.3, -4.5, 1, -1.2],
      [-6.5, -16.6, -0.9, -1],
      [-5.6, -23, -0.8, -1],
    ]) {
      g.beginPath()
      g.moveTo(x, y)
      g.lineTo(x + dx, y + dy)
      g.stroke()
    }
    // Nose, two big front teeth, a pink cheek.
    g.fillStyle = '#3b2420'
    g.beginPath()
    g.ellipse(7.3, -18.7, 1.3, 1, 0, 0, TAU)
    g.fill()
    g.fillStyle = '#ffffff'
    g.strokeStyle = rgba('#5a3a26', 0.6)
    g.lineWidth = 0.3
    g.beginPath()
    g.rect(5.5, -16.4, 1, 1.7)
    g.rect(6.5, -16.4, 1, 1.7)
    g.fill()
    g.stroke()
    g.fillStyle = rgba('#ff8f80', 0.5)
    g.beginPath()
    g.ellipse(2.6, -16.4, 1.8, 1.1, 0, 0, TAU)
    g.fill()
    g.restore()
  }

  override drawOnFog(ctx: CanvasRenderingContext2D, f: Frame): void {
    const v = f.view
    const S = this.sprites
    const p = f.p
    const looming = f.phase === 'looming'
    const half = this.shH * 0.62
    const sx0 = this.shx - half
    const sy1 = this.shy + this.shH * 1.25 + 20
    const sw = half * 2
    const shH = this.shH * 1.25 + 40
    // The fog it's projected on (thins away in the reveal).
    const fogA = looming ? 0.85 : 0.85 * (1 - smoothstep(window01(p, 0.05, 0.6)))
    if (fogA > 0.004) {
      const scr = S.get('screen', sx0 - 20, sy1 + 20, sw + 40, shH + 50, (g) => this.paintScreen(g), 0.5)
      blit(ctx, v, scr, fogA, Math.sin(f.clock * 0.25) * 5)
    }
    // The low sun behind the marmot: the frame's one radial light.
    const sun = looming ? 0.6 : lerp(0.6, 1, smoothstep(window01(p, 0.1, 0.6)))
    glowAt(ctx, v, this.dot(this.pal.night ? '#b9c6ff' : '#ffc76e', 0.1), this.mx - this.dir * 6, this.my + 22, 64, (this.pal.night ? 0.4 : 0.62) * sun)
    // The giant shadow: sways and breathes; shrinks back into the marmot in the reveal.
    const shrink = looming ? 0 : easeInOutSine(window01(p, 0.08, 0.62))
    const shA = looming ? 0.62 + 0.06 * Math.sin(f.clock * 0.7) : 0.62 * (1 - smoothstep(window01(p, 0.2, 0.6)))
    if (shA > 0.004) {
      const sp = S.get('shadow', sx0, sy1, sw, shH, (g, k) => this.paintShadow(g, k), 0.45)
      const glory = S.get('glory', sx0, sy1, sw, shH, (g, k) => this.paintGlory(g, k), 0.45)
      const breathe = 1 + 0.02 * Math.sin(f.clock * 1.1)
      const sway = Math.sin(f.clock * 0.55) * 0.03 + Math.sin(f.clock * 1.7) * 0.006
      const target = (MARMOT_H + 2) / this.shH
      const scale = lerp(breathe, target, shrink)
      const px = lerp(this.shx, this.mx, shrink)
      const py = lerp(this.shy, this.my, shrink)
      // Draw the sprite about its own foot point, then move that point.
      blitAbout(ctx, v, glory, shA * 0.4 * (1 - shrink), px + (this.shx - this.shx), py, scale, scale, sway)
      ctx.save()
      ctx.translate(v.x(px) - v.x(this.shx), v.y(py) - v.y(this.shy))
      blitAbout(ctx, v, sp, shA, this.shx, this.shy, scale, scale, sway)
      ctx.restore()
    }
    // The marmot.
    const ma = looming ? 0 : smoothstep(window01(p, 0.22, 0.55))
    if (ma > 0.004) this.drawMarmot(ctx, f, ma)
    // Little motes of light drifting up around it.
    if (!looming) {
      const dot = this.dot(this.pal.night ? '#e4eaff' : '#fff2c4', 0.3)
      for (let i = 0; i < 6; i++) {
        const u = (f.clock * 0.18 + i / 6) % 1
        const x = this.mx - this.dir * 8 + Math.sin(i * 2.1 + f.clock * 0.8) * 22
        const y = this.my + 6 + u * 60
        glowAt(ctx, v, dot, x, y, 2.4, 0.8 * bump(u) * ma)
      }
    }
  }

  /** Rim light colour: low sun by day, moonlight at night. */
  private rim(): string {
    return this.pal.night ? '#e4eaff' : '#fff3c8'
  }

  private drawMarmot(ctx: CanvasRenderingContext2D, f: Frame, alpha: number): void {
    const v = f.view
    const d = this.dir
    const body = this.sprites.get('marmot', this.mx - 24, this.my + 44, 48, 50, (g, k) => this.paintMarmot(g, k), 1)
    // A gentle sunbathing sway.
    const bob = Math.sin(f.clock * 1.4) * 0.3
    blit(ctx, v, body, alpha, 0, bob)
    v.applyWorld(ctx)
    ctx.globalAlpha = alpha
    ctx.translate(this.mx, -(this.my + bob))
    ctx.scale(d * MARMOT_S, MARMOT_S)
    // Big shiny eyes (blinking).
    const bl = eyeBlink(f.clock, 1.3)
    ctx.fillStyle = '#2d1a16'
    for (const [ex, ey, er] of [
      [4.2, -20.8, 1.15],
      [0.3, -21.1, 1],
    ]) {
      ctx.beginPath()
      ctx.ellipse(ex, ey, er, er * 1.1 * (1 - bl * 0.9), 0, 0, TAU)
      ctx.fill()
    }
    if (bl < 0.5) {
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(4.6, -21.3, 0.42, 0, TAU)
      ctx.arc(0.65, -21.6, 0.38, 0, TAU)
      ctx.fill()
    }
    // The near paw: tucked at its chest, or up and waving hello.
    const waving = f.clock < this.waveUntil || (f.phase === 'revealing' && f.p > 0.45)
    const theta = waving ? 2.55 + Math.sin(f.clock * 9) * 0.4 : 0.42 + Math.sin(f.clock * 1.4) * 0.05
    const L = waving ? 5.6 : 4.8
    const sx = 4.2
    const sy = -13
    const px = sx + Math.sin(theta) * L
    const py = sy + Math.cos(theta) * L
    ctx.lineCap = 'round'
    ctx.strokeStyle = this.rim()
    ctx.lineWidth = 3.6
    ctx.beginPath()
    ctx.moveTo(sx, sy)
    ctx.lineTo(px, py)
    ctx.stroke()
    ctx.strokeStyle = '#bb8650'
    ctx.lineWidth = 2.6
    ctx.stroke()
    ctx.fillStyle = '#c99462'
    ctx.strokeStyle = rgba('#6b4528', 0.6)
    ctx.lineWidth = 0.5
    ctx.beginPath()
    ctx.arc(px, py, 1.6, 0, TAU)
    ctx.fill()
    ctx.stroke()
    ctx.globalAlpha = 1
    v.applyScreen(ctx)
  }
}

/**
 * A marmot standing up (art coords, feet at the origin, facing +x, ~31 tall): pear body, round head,
 * little ears and two fluffy tufts on top — which, as a giant shadow on the fog, look like horns.
 */
function marmotShape(s: number, tuft = 1): Path2D {
  const p = new Path2D()
  const S = (v: number) => v * s
  // Body.
  p.moveTo(S(-8.4), 0)
  p.bezierCurveTo(S(-10.6), S(-6), S(-9), S(-13.5), S(-5), S(-15.8))
  p.lineTo(S(5), S(-15.8))
  p.bezierCurveTo(S(9.4), S(-13.5), S(10.6), S(-6), S(8.4), 0)
  p.closePath()
  // Head and muzzle.
  p.moveTo(S(6.6), S(-20.2))
  p.arc(0, S(-20.2), S(6.6), 0, TAU)
  p.moveTo(S(7.8), S(-18.2))
  p.ellipse(S(3.8), S(-18.2), S(4), S(3), 0, 0, TAU)
  // Little round ears, low on the sides of its head.
  p.moveTo(S(-4.8), S(-23))
  p.arc(S(-6.1), S(-23), S(1.3), 0, TAU)
  p.moveTo(S(7.4), S(-23))
  p.arc(S(6.1), S(-23), S(1.3), 0, TAU)
  // Tufts.
  for (const side of [-1, 1]) {
    const x = side * 1.7
    const T = (v: number) => S(-25.6 - v * tuft)
    p.moveTo(S(x - 1.7), S(-25.6))
    p.quadraticCurveTo(S(x + side * 0.1 * tuft), T(4), S(x + side * 2.9 * tuft), T(5.4))
    p.quadraticCurveTo(S(x + side * 1.9 * tuft), T(2.4), S(x + 1.7), S(-25.6))
    p.closePath()
  }
  // Tail.
  p.moveTo(S(-6.4), S(-3))
  p.ellipse(S(-9.4), S(-3), S(3.4), S(2.4), -0.4, 0, TAU)
  // Feet.
  p.moveTo(S(-1.4), S(-0.8))
  p.ellipse(S(-4.4), S(-0.8), S(3), S(1.5), 0, 0, TAU)
  p.moveTo(S(7.2), S(-0.8))
  p.ellipse(S(4.4), S(-0.8), S(3), S(1.5), 0, 0, TAU)
  // The far arm, resting.
  p.moveTo(S(-3.4), S(-12))
  p.ellipse(S(-5.4), S(-9.6), S(1.7), S(3.6), 0.3, 0, TAU)
  return p
}
