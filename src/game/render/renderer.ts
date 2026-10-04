/**
 * The world renderer: composes one frame of the climb.
 *
 * Draw order: sky + parallax → face + ground + decorations behind the route → [behind hook] →
 * chalk + ghost → rope → ledges, holds, windsocks → (Cloud Steps, summit) the fog with [fog hook] on
 * it, then chalk + ghost above it → the climber (character module) → preview arc + slingshot band →
 * particles + wind streaks → [front hook] → foreground mist → vignette → [screen hook].
 * In fog zones chalk and the ghost move above the fog so failed arcs and the beta still read.
 *
 * It reads the ClimbSession (never changes it) and notices what happened since the last frame —
 * a launch, a landing, a whipper, a crumble, a revealed hold — to add the juice (dust, chalk puffs,
 * sparkles) itself, so the climb screen doesn't have to wire anything for it.
 */
import { createRng } from '../../model/rng'
import { rgba } from '../art/rig'
import type { Camera } from '../camera'
import type { Aim, ClimbSession } from '../engine'
import { restPoint } from '../physics'
import type { ZoneId } from '../types'
import { TUNING } from '../tuning'
import { freeCanvas, makeCanvas, softDot, View, Vignette } from './effects'
import { bigLeapTarget, FogLayer, type FogInfo } from './fog'
import { CLIMBER_CENTER, drawBand, drawBetaMap, drawChalk, drawGhost, drawPreview, drawRope } from './overlays'
import { paletteFor, type ZonePalette } from './palette'
import { Parallax } from './parallax'
import { Particles } from './particles'
import { Terrain } from './terrain'
import { WindFx } from './wind'

export interface RenderFrame {
  /** Real seconds (animation clock: flutter, twinkle, pulses). */
  t: number
  /** Real frame delta (s). */
  dt: number
  /** The live aim (session.aim), or null. */
  aim: Aim | null
  /** session.previewPath(aim) while aiming, else null. */
  preview: number[] | null
  /** session.ghostPath(solution) while the ghost beta is showing, else null. */
  ghost: number[] | null
  /**
   * Optional: the end-of-pitch Beta Map, drawn over the world (failed arcs as chalk under the bright
   * route). `t` = seconds since it opened. While it shows, the band and preview are not drawn.
   */
  betaMap?: { failed: number[][]; route: number[][]; t: number } | null
}

export interface CharacterDrawer {
  /** ctx is in CSS px (transform = DPR scale). */
  draw(ctx: CanvasRenderingContext2D, session: ClimbSession, camera: Camera, t: number): void
}

/**
 * Extra drawing other modules can slot in (Looks Scary moments, the finale). ctx in CSS px.
 * 'behind': before the ledges · 'fog': on the fog, under the Big Leap landing outline (fog zones
 * only) · 'front': over everything in the world · 'screen': after the vignette.
 */
export type RenderHook = (ctx: CanvasRenderingContext2D, session: ClimbSession, camera: Camera, t: number) => void
export type HookSlot = 'behind' | 'fog' | 'front' | 'screen'

const NO_GAPS: readonly number[] = []

export interface RendererOptions {
  zone: ZoneId
  night: boolean
  /** Seed for the zone's look (defaults to the zone name: every pitch of a zone shares a sky). */
  seed?: string
}

export class Renderer {
  readonly palette: ZonePalette
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D | null
  private readonly view = new View()
  private readonly parallax: Parallax
  private readonly particles: Particles
  private readonly vignette: Vignette
  private terrain: Terrain | null = null
  private wind: WindFx | null = null
  private levelId: string | null = null
  private readonly seed: string
  private sized = false
  private readonly hooks: Record<HookSlot, RenderHook | null> = { behind: null, fog: null, front: null, screen: null }
  private mist: HTMLCanvasElement | null = null
  private readonly fog: FogLayer
  private readonly fogInfo: FogInfo = { bigLeapTarget: null, her: null, onFog: null }
  private gaps: (() => readonly number[]) | null = null
  /** This frame's camera and clock (for the fog hook, called from inside the fog's draw). */
  private frameCamera: Camera | null = null
  private frameT = 0

  // What the last frame saw (to spot launches, landings, whippers).
  private session: ClimbSession | null = null
  private seenLaunch = -10
  private seenLand = -10
  private seenChalk = 0
  private seenChalkAt = -10
  private seenPhase = ''

  constructor(canvas: HTMLCanvasElement, opts: RendererOptions) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d', { alpha: false }) ?? canvas.getContext('2d')
    this.palette = paletteFor(opts.zone, opts.night)
    this.seed = opts.seed ?? `${opts.zone}${opts.night ? ':night' : ''}`
    this.parallax = new Parallax(this.palette, this.seed)
    this.particles = new Particles(this.palette, this.seed)
    this.vignette = new Vignette(this.palette.vignetteColor, this.palette.vignette)
    this.fog = new FogLayer(opts.zone, { night: opts.night })
  }

  /** Size the canvas backing store to the camera's view (CSS px × capped DPR) and rebuild caches. */
  resize(camera: Camera): void {
    const bw = Math.max(1, Math.round(camera.viewW * camera.dpr))
    const bh = Math.max(1, Math.round(camera.viewH * camera.dpr))
    if (this.canvas.width !== bw) this.canvas.width = bw
    if (this.canvas.height !== bh) this.canvas.height = bh
    this.view.from(camera)
    const startC = camera.viewH / camera.baseScale / 2 - 90
    this.parallax.resize(this.view, startC)
    this.terrain?.resize(this.view)
    this.fog.resize(camera)
    freeCanvas(this.mist)
    this.mist = null
    this.sized = true
  }

  /** Slot in extra drawing (or null to remove it). */
  setHook(slot: HookSlot, fn: RenderHook | null): void {
    this.hooks[slot] = fn
  }

  /**
   * The rope bridge's missing deck planks right now (Gusty Ridge's Looks Scary: ScaryLayer.bridgeGaps),
   * read once per frame; null = a whole deck.
   */
  setBridgeGaps(fn: (() => readonly number[]) | null): void {
    this.gaps = fn
  }

  /** The canvas context (for hooks that need to draw outside a frame). */
  get context(): CanvasRenderingContext2D | null {
    return this.ctx
  }

  draw(session: ClimbSession, camera: Camera, frame: RenderFrame, character: CharacterDrawer): void {
    const ctx = this.ctx
    if (!ctx) return
    if (!this.sized) this.resize(camera)
    this.ensureLevel(session)
    const terrain = this.terrain
    const wind = this.wind
    if (!terrain || !wind) return
    const view = this.view.from(camera)
    const t = frame.t
    const dt = Math.min(0.1, Math.max(0, frame.dt))

    // Notice what happened since the last frame.
    this.juice(session)
    terrain.sync(session, t, dt, this.particles)
    wind.update(session.t, session.frozen ? 0 : dt, view, this.particles)
    this.particles.update(dt, view, wind.active ? wind : null)
    this.fog.update(dt)
    this.frameCamera = camera
    this.frameT = t

    ctx.save()
    // 1. Sky and the far world (only where the face doesn't cover it).
    this.parallax.draw(ctx, camera, view, t, terrain.faceClip(view))
    // 2. The face, the ground, things behind the route.
    terrain.drawFace(ctx, view)
    terrain.drawBehind(ctx, view)
    this.hook('behind', ctx, session, camera, t, view)
    // 3. Chalk and the ghost beta (above the fog instead, where there is fog).
    const beta = frame.betaMap ?? null
    const fog = this.fog.active
    if (!fog) this.drawChalkAndGhost(ctx, view, session, frame, t)
    // 4. The rope.
    drawRope(ctx, session, this.palette, view)
    // 5. Ledges, holds, the live bits, windsocks.
    terrain.bridgeGaps = this.gaps ? this.gaps() : NO_GAPS
    terrain.drawLedges(ctx, view, session, t, wind.active ? wind : null)
    wind.drawSocks(ctx, view, t)
    // 5b. Fog (Cloud Steps thick, the summit lightly), whatever sits on it, then chalk and the ghost.
    if (fog) {
      const info = this.fogInfo
      info.bigLeapTarget = beta ? null : bigLeapTarget(session)
      info.her = session.body
      info.onFog = this.hooks.fog ? this.drawOnFog : null
      this.fog.draw(ctx, camera, t, info)
      this.drawChalkAndGhost(ctx, view, session, frame, t)
    }
    // 6. Her.
    view.applyScreen(ctx)
    ctx.save()
    character.draw(ctx, session, camera, t)
    ctx.restore()
    // 7. Aiming.
    // While a release would cancel (finger back on her, or a tiny drag) both are hidden.
    const aim = frame.aim
    if (!beta && !(aim && aim.cancel)) {
      if (frame.preview && frame.preview.length >= 4) drawPreview(ctx, view, frame.preview, this.palette)
      if (aim) drawBand(ctx, view, view.x(session.body.x), view.y(session.body.y + CLIMBER_CENTER), aim, t)
    }
    // 8. Particles and wind.
    this.particles.draw(ctx, view, t)
    wind.drawStreaks(ctx, view)
    if (beta) drawBetaMap(ctx, camera, beta.failed, beta.route, beta.t)
    this.hook('front', ctx, session, camera, t, view)
    // 9. Foreground mist and a soft vignette.
    view.applyScreen(ctx)
    this.drawMist(ctx, view, t)
    this.vignette.draw(ctx, view.w, view.h)
    this.hook('screen', ctx, session, camera, t, view)
    ctx.restore()
  }

  private drawChalkAndGhost(ctx: CanvasRenderingContext2D, view: View, session: ClimbSession, frame: RenderFrame, t: number): void {
    if (frame.betaMap) return
    drawChalk(ctx, view, session, this.palette)
    if (frame.ghost && frame.ghost.length >= 4) drawGhost(ctx, view, frame.ghost, session, t)
  }

  /** The fog hook, called by the fog between its banks and the Big Leap landing outline. */
  private readonly drawOnFog = (): void => {
    const ctx = this.ctx
    const session = this.session
    const camera = this.frameCamera
    if (!ctx || !session || !camera) return
    this.hook('fog', ctx, session, camera, this.frameT, this.view)
  }

  private hook(slot: HookSlot, ctx: CanvasRenderingContext2D, session: ClimbSession, camera: Camera, t: number, view: View): void {
    const fn = this.hooks[slot]
    if (!fn) return
    view.applyScreen(ctx)
    ctx.save()
    fn(ctx, session, camera, t)
    ctx.restore()
  }

  private ensureLevel(session: ClimbSession): void {
    const id = session.level.id
    if (this.levelId === id && this.terrain) return
    this.terrain?.destroy()
    this.levelId = id
    this.terrain = new Terrain(session.level, this.palette, `${this.seed}:${id}`)
    this.wind = new WindFx(session.level, this.palette)
    this.fog.setLevel(session.level)
    if (this.sized) this.terrain.resize(this.view)
  }

  // -------------------------------------------------------------------------------------------
  // Juice: dust, chalk, sparkles from session changes

  private juice(session: ClimbSession): void {
    const p = this.particles
    if (session !== this.session) {
      this.session = session
      this.seenLaunch = session.lastLaunchAt
      this.seenLand = session.lastLandAt
      this.seenChalk = session.chalk.length
      this.seenChalkAt = session.chalk.length ? session.chalk[session.chalk.length - 1].at : -10
      this.seenPhase = session.phase
      p.clear()
      return
    }
    if (session.lastLaunchAt !== this.seenLaunch) {
      this.seenLaunch = session.lastLaunchAt
      const el = session.index.byId.get(session.elementId)
      if (el) {
        const at = restPoint(el)
        const power = session.lastLaunch?.power ?? 0.6
        if (el.kind === 'ledge') {
          p.landingDust(at.x, at.y, 0.25 + power * 0.4)
          p.chalkPuff(at.x, at.y + 30, 5, 0.8)
        } else {
          p.chalkPuff(el.x, el.y, 7, 0.9)
        }
      }
    }
    const chalkN = session.chalk.length
    const chalkAt = chalkN ? session.chalk[chalkN - 1].at : -10
    if (chalkN !== this.seenChalk || chalkAt !== this.seenChalkAt) {
      this.seenChalk = chalkN
      this.seenChalkAt = chalkAt
      // A whipper: a puff of chalk from her hands where it happened (a hop just leaves its line).
      if (!session.chalk[chalkN - 1]?.hop) p.chalkPuff(session.body.x, session.body.y + 34, 9, 1)
    }
    if (session.lastLandAt !== this.seenLand) {
      this.seenLand = session.lastLandAt
      const el = session.index.byId.get(session.elementId)
      if (el && session.phase !== 'roped') {
        if (el.kind === 'ledge') p.landingDust(session.body.x, el.y, 0.75)
        else p.chalkPuff(el.x, el.y, 6, 0.8)
      }
    }
    if (session.phase !== this.seenPhase) {
      if (session.phase === 'sent') {
        const top = session.el(session.elementId)
        const at = restPoint(top)
        p.revealSparkle(at.x, at.y + 30, 22)
      }
      this.seenPhase = session.phase
    }
  }

  // -------------------------------------------------------------------------------------------
  // Foreground mist: a soft band of cloud along the bottom of the view

  private drawMist(ctx: CanvasRenderingContext2D, view: View, t: number): void {
    const p = this.palette
    // Pulling back for a Big Leap thickens the mist a little: it shows the drop.
    const pull = Math.max(0, Math.min(1, (1 - view.zoom) / (1 - TUNING.bigLeapZoom)))
    const alpha = Math.min(0.75, p.mistAlpha + pull * 0.2)
    if (alpha <= 0.01) return
    if (!this.mist) this.mist = this.buildMist(view)
    const m = this.mist
    if (!m || m.width <= 1) return
    const h = m.height / Math.min(view.dpr, 1.5)
    const w = m.width / Math.min(view.dpr, 1.5)
    const off = (t * 9) % w
    const y = view.h - h * (0.85 + 0.1 * pull)
    ctx.globalAlpha = alpha
    ctx.drawImage(m, -off, y, w, h)
    ctx.drawImage(m, w - off, y, w, h)
    ctx.globalAlpha = 1
  }

  private buildMist(view: View): HTMLCanvasElement {
    const k = Math.min(view.dpr, 1.5)
    const w = Math.max(320, Math.round(view.w))
    const h = Math.round(Math.min(240, Math.max(120, view.h * 0.22)))
    const c = makeCanvas(w * k, h * k)
    const g = c.getContext('2d')
    if (!g) return c
    g.scale(k, k)
    const p = this.palette
    const rng = createRng(`${this.seed}:mist`)
    const puff = softDot(64, p.mist, 0.35)
    // Soft overlapping puffs (tileable: each is drawn again one width left and right).
    for (let i = 0; i < 16; i++) {
      const x = rng.range(0, w)
      const pw = rng.range(140, 300)
      const ph = rng.range(50, 110)
      const y = h - ph * rng.range(0.35, 0.75)
      g.globalAlpha = rng.range(0.55, 0.9)
      for (let dx = -w; dx <= w; dx += w) g.drawImage(puff, x + dx - pw / 2, y - ph / 2, pw, ph)
    }
    g.globalAlpha = 1
    const grad = g.createLinearGradient(0, h * 0.45, 0, h)
    grad.addColorStop(0, rgba(p.mist, 0))
    grad.addColorStop(1, rgba(p.mist, 0.85))
    g.fillStyle = grad
    g.fillRect(0, 0, w, h)
    freeCanvas(puff)
    return c
  }

  // -------------------------------------------------------------------------------------------

  /** Cached offscreen pixels (lab/debug). */
  stats(): { cachedPx: number; particles: number } {
    const px = (this.terrain?.cachedPixels() ?? 0) + this.parallax.cachedPixels() + this.fog.cachedPixels()
    return { cachedPx: px, particles: this.particles.count }
  }

  destroy(): void {
    this.terrain?.destroy()
    this.terrain = null
    this.parallax.destroy()
    this.particles.destroy()
    this.fog.destroy()
    this.gaps = null
    this.frameCamera = null
    this.vignette.destroy()
    freeCanvas(this.mist)
    this.mist = null
    this.session = null
    this.hooks.behind = this.hooks.fog = this.hooks.front = this.hooks.screen = null
    this.canvas.width = 0
    this.canvas.height = 0
  }
}
