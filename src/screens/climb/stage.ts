/**
 * The climb machinery shared by the climb screen and the first-run lesson: a full-bleed canvas in a
 * `.stage`, the camera, the world renderer, the character animator and the slingshot input, driven by
 * one requestAnimationFrame loop (the session steps its own fixed 1/120 s physics inside update()).
 *
 * Camera: while she stands or hangs ready it frames her low in the safe rect with the next target in
 * view; in flight it holds that framing and only moves to keep her on screen (calm, no chasing). A
 * Big Leap spot pulls back to TUNING.bigLeapZoom to show the drop below and the far side. Screens can
 * point it at something for a moment (lookAt) or frame the whole pitch for the Beta Map (showMap).
 *
 * Pausing: the session freezes (pitch clock, crumble timers, wind) whenever any freeze reason is held
 * (a blocking prompt, the Beta Map, a reveal moment) or the page is hidden. The camera and her
 * breathing keep going so a paused screen still looks alive.
 */
import { Camera } from '../../game/camera'
import { frameDelta } from '../../game/clock'
import type { Aim, ClimbSession } from '../../game/engine'
import { AimInput, climberHitRadius, maxDragPxFor } from '../../game/input'
import { CharacterAnimator } from '../../game/render/character'
import { CLIMBER_CENTER } from '../../game/render/overlays'
import { Renderer, type RenderFrame } from '../../game/render/renderer'
import { TUNING } from '../../game/tuning'
import type { Level, LevelElement } from '../../game/types'
import type { ClimberLook } from '../../storage/schema'
import { h } from '../../ui/dom'

export interface StageOptions {
  level: Level
  session: ClimbSession
  look: ClimberLook
  night: boolean
  /** The goat climbs beside her (night climbs) instead of riding in the backpack. */
  goatOutside: boolean
  /** Space (CSS px) the HUD takes at the top and bottom, on top of the safe-area insets (read on resize). */
  hudTop: number | (() => number)
  hudBottom: number | (() => number)
  /** Zoom in (up to 1.35×) while the view is wider than this many world units (the small lesson rock). */
  fitWidth?: number
  /** A fixed camera altitude (the lesson's small rock, framed with room below her for the drag). */
  fixedCenterY?: number
  /** Keep the next target at least this far (CSS px) below the top of the safe rect, clear of the
   *  cards that slide in up there (default 0). */
  targetTopPx?: number
  /** Accessible description of the play area. */
  label: string
  /** Called every frame after the session has stepped (dt = real seconds, clamped to 0.1). */
  onFrame?: (dt: number) => void
  /** Called after every resize, with the camera fitted to the new size. */
  onResize?: (camera: Camera) => void
}

export interface ClientPoint {
  x: number
  y: number
}

/** Screen region (CSS px, top/bottom) the Beta Map should fit the pitch into. */
export type MapRegion = () => { top: number; bottom: number }

interface BetaMapState {
  failed: number[][]
  route: number[][]
  t: number
  region: MapRegion
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v)

export class ClimbStage {
  readonly el: HTMLElement
  readonly canvas: HTMLCanvasElement
  readonly camera = new Camera()
  readonly renderer: Renderer
  readonly animator: CharacterAnimator
  readonly session: ClimbSession
  readonly level: Level

  /** The ghost beta arc being shown (null = none). Cleared when she launches. */
  ghost: number[] | null = null

  private readonly opts: StageOptions
  private readonly probe: HTMLElement
  private readonly input: AimInput
  private readonly frame: RenderFrame = { t: 0, dt: 0, aim: null, preview: null, ghost: null, betaMap: null }
  private readonly freezes = new Set<string>()
  private readonly cleanups: (() => void)[] = []
  private raf = 0
  private lastMs = -1
  private clock = 0
  private destroyed = false
  private needSnap = true
  private sized = false
  /** Extra zoom for small scenes (fitWidth), set on resize. */
  private zoomBase = 1
  private rectLeft = 0
  private rectTop = 0

  // Camera framing state.
  private restCenter = 0
  private look: { y: number; zoom: number; frac: number } | null = null
  private map: BetaMapState | null = null
  /** The Big Leap she is in the air on (keeps the pull-back until she comes down). */
  private bigFlight: { from: string; to: string } | null = null

  // Preview cache: recomputed only when the aim (or, on windy pitches, the clock) changes.
  private previewAngle = NaN
  private previewPower = NaN
  private previewT = NaN
  private previewFrom = ''
  private preview: number[] | null = null

  constructor(parent: HTMLElement, opts: StageOptions) {
    this.opts = opts
    this.level = opts.level
    this.session = opts.session
    this.canvas = h('canvas', { class: 'climb-stage__canvas', role: 'img', 'aria-label': opts.label })
    this.probe = h('div', { class: 'climb-stage__safe', 'aria-hidden': 'true' })
    this.el = h('div', { class: 'stage climb-stage' }, this.canvas, this.probe)
    parent.appendChild(this.el)

    // The Renderer asks for the 2D context first ({ alpha: false }).
    this.renderer = new Renderer(this.canvas, { zone: opts.level.zone, night: opts.night })
    this.animator = new CharacterAnimator({ look: opts.look, night: opts.night, goatOutside: opts.goatOutside })
    this.input = new AimInput(this.canvas, {
      session: () => (this.destroyed ? null : this.session),
      climberClient: () => this.climberClient(),
      maxDragPx: () => this.maxDragPx(),
    })

    const s = this.session
    this.cleanups.push(
      s.events.on('launch', (e) => {
        this.ghost = null
        this.bigFlight = e.bigLeap ? (this.level.bigLeaps ?? []).find((b) => b.from === e.fromId) ?? null : null
      }),
      s.events.on('ready', () => {
        this.bigFlight = null
      }),
    )

    // Size now and whenever the stage changes size (rotation, split view, keyboard).
    const onResize = () => this.scheduleResize()
    if (typeof ResizeObserver === 'function') {
      const ro = new ResizeObserver(onResize)
      ro.observe(this.el)
      this.cleanups.push(() => ro.disconnect())
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    this.cleanups.push(
      () => window.removeEventListener('resize', onResize),
      () => window.removeEventListener('orientationchange', onResize),
    )

    // Hidden page: everything pauses (and the clock doesn't jump when it comes back).
    const onVisibility = () => {
      this.setFrozen('hidden', document.visibilityState === 'hidden')
      this.lastMs = -1
    }
    document.addEventListener('visibilitychange', onVisibility)
    this.cleanups.push(() => document.removeEventListener('visibilitychange', onVisibility))
    onVisibility()

    this.resize()
    this.raf = requestAnimationFrame(this.tick)
  }

  // -------------------------------------------------------------------------------------------
  // Pausing

  /** Hold or release one reason for the session to stay frozen. */
  setFrozen(reason: string, on: boolean): void {
    if (on) this.freezes.add(reason)
    else this.freezes.delete(reason)
    this.syncFrozen()
  }

  isFrozen(reason?: string): boolean {
    return reason ? this.freezes.has(reason) : this.freezes.size > 0
  }

  private syncFrozen(): void {
    const frozen = this.freezes.size > 0
    if (frozen && !this.session.frozen) this.session.cancelAim()
    this.session.frozen = frozen
  }

  // -------------------------------------------------------------------------------------------
  // Coordinates (for input, the debug hook and DOM things placed over the canvas)

  /** Her centre in client px, and the radius inside which a release cancels. */
  climberClient(): { x: number; y: number; r: number } {
    const b = this.session.body
    const p = this.camera.worldToScreen(b.x, b.y + CLIMBER_CENTER)
    const r = climberHitRadius((TUNING.bodyHeight / 2) * this.camera.scale)
    return { x: p.x + this.rectLeft, y: p.y + this.rectTop, r }
  }

  worldToClient(x: number, y: number): ClientPoint {
    const p = this.camera.worldToScreen(x, y)
    return { x: p.x + this.rectLeft, y: p.y + this.rectTop }
  }

  /** Drag length (CSS px) that means full power. */
  maxDragPx(): number {
    return maxDragPxFor(this.camera.viewW, this.camera.viewH)
  }

  /** Seconds since the stage started (the render clock). */
  get time(): number {
    return this.clock
  }

  // -------------------------------------------------------------------------------------------
  // Camera direction

  /**
   * Ease the camera to a world altitude (a Looks Scary moment) until clearLook(). `frac` is where on
   * screen it should sit (0 = top, 0.5 = middle): high up keeps it clear of a card in the middle.
   */
  lookAt(y: number, zoom = 1, frac = 0.5): void {
    this.look = { y, zoom, frac }
  }

  clearLook(): void {
    this.look = null
  }

  /** Frame the whole pitch inside `region` and draw the Beta Map over it. */
  showMap(failed: number[][], route: number[][], region: MapRegion): void {
    this.map = { failed, route, t: 0, region }
  }

  hideMap(): void {
    this.map = null
    this.needSnap = true
  }

  // -------------------------------------------------------------------------------------------
  // The loop

  private readonly tick = (ms: number): void => {
    this.raf = 0
    if (this.destroyed) return
    const dt = frameDelta(this.lastMs, ms)
    this.lastMs = ms
    this.clock += dt
    if (!this.sized) this.resize()
    this.syncFrozen()
    this.session.update(dt)
    this.input.poll()
    this.opts.onFrame?.(dt)
    if (this.destroyed) return
    this.direct(dt)
    if (this.map) this.map.t += dt
    this.draw(dt)
    this.raf = requestAnimationFrame(this.tick)
  }

  private draw(dt: number): void {
    const s = this.session
    const f = this.frame
    const aim: Aim | null = s.aim
    f.t = this.clock
    f.dt = dt
    f.aim = this.map ? null : aim
    f.preview = aim && !aim.cancel && !this.map ? this.previewFor(aim) : null
    f.ghost = this.map ? null : this.ghost
    f.betaMap = this.map
    this.renderer.draw(s, this.camera, f, this.animator)
  }

  private previewFor(aim: Aim): number[] | null {
    const s = this.session
    // The preview bends with live wind, so on windy pitches the clock matters too.
    const t = this.level.wind?.length ? s.t : 0
    if (aim.angle !== this.previewAngle || aim.power !== this.previewPower || t !== this.previewT || s.elementId !== this.previewFrom) {
      this.previewAngle = aim.angle
      this.previewPower = aim.power
      this.previewT = t
      this.previewFrom = s.elementId
      this.preview = s.previewPath(aim.angle, aim.power)
    }
    return this.preview
  }

  // -------------------------------------------------------------------------------------------
  // Camera

  private safeHalf(zoom: number): number {
    const c = this.camera
    return (c.viewH - c.insets.top - c.insets.bottom) / (c.baseScale * zoom) / 2
  }

  /** The Big Leap in play: standing ready at its start, or in the air on it. */
  private bigLeapFocus(): { from: string; to: string } | null {
    if (this.bigFlight) return this.bigFlight
    return this.session.bigLeapHere()
  }

  private direct(dt: number): void {
    const cam = this.camera
    const s = this.session
    const height = this.level.height

    if (this.map) {
      const r = this.map.region()
      const regionH = Math.max(120, r.bottom - r.top)
      const zoom = Math.min(1, regionH / ((height + 260) * cam.baseScale))
      const sc = cam.baseScale * zoom
      const screenCenter = cam.insets.top + (cam.viewH - cam.insets.top - cam.insets.bottom) / 2
      const centerY = height / 2 + 30 - (screenCenter - (r.top + r.bottom) / 2) / sc
      if (this.needSnap) {
        cam.zoom = zoom
        cam.centerY = centerY
        this.needSnap = false
      } else {
        const k = 1 - Math.exp(-3.2 * dt)
        cam.zoom += (zoom - cam.zoom) * k
        cam.centerY += (centerY - cam.centerY) * k
      }
      return
    }

    const fixed = this.opts.fixedCenterY
    if (fixed !== undefined && !this.look) {
      const zoom = this.zoomBase
      if (this.needSnap) {
        cam.zoom = zoom
        cam.centerY = fixed
        this.needSnap = false
      } else {
        const k = 1 - Math.exp(-TUNING.cameraFollow * dt)
        cam.zoom += (zoom - cam.zoom) * k
        cam.centerY += (fixed - cam.centerY) * k
      }
      return
    }

    if (this.look) {
      const lk = this.look
      const screenCenter = cam.insets.top + (cam.viewH - cam.insets.top - cam.insets.bottom) / 2
      cam.setTarget(lk.y - (screenCenter - lk.frac * cam.viewH) / (cam.baseScale * lk.zoom), lk.zoom)
    } else {
      const big = this.bigLeapFocus()
      const zoom = (big ? TUNING.bigLeapZoom : 1) * this.zoomBase
      const hs = this.safeHalf(zoom)
      const feet = s.body.y
      let center: number
      if (s.phase === 'ready' || s.phase === 'sent') {
        center = this.frameReady(feet, hs, big)
        this.restCenter = center
      } else {
        // In the air, on the rope, settling: hold the framing, only keep her on screen.
        const m = Math.min(90, hs * 0.22)
        const lo = feet + 70 + m - hs
        const hi = feet - 10 - m + hs
        center = lo <= hi ? clamp(this.restCenter, lo, hi) : (lo + hi) / 2
      }
      cam.setTarget(center, zoom)
    }
    if (this.needSnap) {
      cam.snap()
      cam.update(0, height)
      cam.snap()
      this.needSnap = false
    }
    cam.update(dt, height)
  }

  /** The card band at the top of the safe rect, in world units at the current framing. */
  private cardBand(hs: number): number {
    const px = this.opts.targetTopPx ?? 0
    const c = this.camera
    const safePx = c.viewH - c.insets.top - c.insets.bottom
    // Never more than a third of the picture: on a short screen the target still fits.
    return safePx > 0 ? (Math.min(px, safePx / 3) / safePx) * hs * 2 : 0
  }

  /** Where to centre the camera while she is ready: low in the view, next target in sight. */
  private frameReady(feet: number, hs: number, big: { from: string; to: string } | null): number {
    const s = this.session
    if (big) {
      // Show the drop under the gap and the far side.
      const to = s.el(big.to)
      const top = topOf(to) + 50
      const bottom = feet - 240
      const c = (top + bottom) / 2
      const lo = top + 20 - hs + this.cardBand(hs)
      const hi = feet - 20 + hs - 60
      return lo <= hi ? clamp(c, lo, hi) : (lo + hi) / 2
    }
    let c = feet + Math.min(hs * 0.42, 170)
    const nextId = s.nextTargetId()
    const next = nextId ? s.index.byId.get(nextId) : undefined
    if (next) {
      const top = topOf(next) + 40
      const lo = top - hs + 30 + this.cardBand(hs)
      const hi = feet - 30 + hs - 50
      c = lo <= hi ? clamp(c, lo, hi) : (lo + hi) / 2
    }
    return c
  }

  // -------------------------------------------------------------------------------------------
  // Size

  /** Measure again (call after the HUD around the stage has been laid out). */
  relayout(): void {
    this.resize()
  }

  private resizeQueued = false

  private scheduleResize(): void {
    if (this.resizeQueued || this.destroyed) return
    this.resizeQueued = true
    requestAnimationFrame(() => {
      this.resizeQueued = false
      if (!this.destroyed) this.resize()
    })
  }

  private resize(): void {
    const w = this.el.clientWidth
    const hgt = this.el.clientHeight
    if (!w || !hgt) return
    const safe = readSafeInsets(this.probe)
    const sameSize = this.sized && w === this.camera.viewW && hgt === this.camera.viewH
    const px = (v: number | (() => number)) => Math.max(0, typeof v === 'function' ? v() : v)
    this.camera.resize(
      w,
      hgt,
      { top: safe.top + px(this.opts.hudTop), bottom: safe.bottom + px(this.opts.hudBottom), left: safe.left, right: safe.right },
      window.devicePixelRatio || 1,
    )
    const fit = this.opts.fitWidth
    this.zoomBase = fit ? clamp(w / (fit * this.camera.baseScale), 1, 1.35) : 1
    if (!sameSize) this.renderer.resize(this.camera)
    const rect = this.canvas.getBoundingClientRect()
    this.rectLeft = rect.left
    this.rectTop = rect.top
    this.sized = true
    this.needSnap = true
    this.previewAngle = NaN
    this.opts.onResize?.(this.camera)
  }

  // -------------------------------------------------------------------------------------------

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    cancelAnimationFrame(this.raf)
    this.input.destroy()
    for (const fn of this.cleanups.splice(0)) fn()
    this.animator.destroy()
    // Releases the canvas too (width = height = 0).
    this.renderer.destroy()
    this.canvas.width = 0
    this.canvas.height = 0
    this.el.remove()
  }
}

/** The altitude she needs in view above an element (standing on a ledge, hanging from a hold). */
function topOf(el: LevelElement): number {
  return el.kind === 'ledge' ? el.y + 60 : el.y + 16
}

/** Safe-area insets in px, read from a probe padded with env(safe-area-inset-*). */
function readSafeInsets(probe: HTMLElement): { top: number; right: number; bottom: number; left: number } {
  const st = getComputedStyle(probe)
  const n = (v: string) => {
    const x = parseFloat(v)
    return Number.isFinite(x) ? x : 0
  }
  return { top: n(st.paddingTop), right: n(st.paddingRight), bottom: n(st.paddingBottom), left: n(st.paddingLeft) }
}

