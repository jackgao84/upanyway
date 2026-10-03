/**
 * Dev-only zones lab (served at /upanyway/dev/zones.html by `vite`; not part of the build).
 *
 * Renders the REAL level with the real Renderer + CharacterAnimator, framed the way the climb
 * screen frames her when she is ready (HUD bands included), for art reviews and timing.
 *
 * Query: level=p01, night=1, at=bottom|mid|top|high|<element id>, warm=<s> (frames run before the
 * shot), discover=1 (crumbles found + hidden holds revealed), aim=<angle>,<power> (hold an aim),
 * run=1 (keep animating with the autopilot leaping through saved solutions), ui=0 (no panel).
 *
 * `window.__zones` (Playwright):
 *   show(opts)  — set up a scene and run `warm` seconds of fixed 60 fps frames; returns info.
 *   perf(opts)  — time renderer.draw over N requestAnimationFrame frames (autopilot leaping on
 *                 when `moving`); resolves { frames, mean, p50, p95, max, first }.
 *   points(id)  — the named altitudes of a level (bottom / mid / high / top element ids).
 */
import '@fontsource-variable/nunito/wght.css'
import { Camera } from '../src/game/camera'
import { ClimbSession } from '../src/game/engine'
import { maxDragPxFor } from '../src/game/input'
import { ALL_LEVELS, getLevel } from '../src/game/levels'
import { solutionFrom } from '../src/game/levels/solutions'
import { CharacterAnimator } from '../src/game/render/character'
import { View } from '../src/game/render/effects'
import { paletteFor } from '../src/game/render/palette'
import { Parallax } from '../src/game/render/parallax'
import { Renderer, type RenderFrame } from '../src/game/render/renderer'
import { TUNING } from '../src/game/tuning'
import type { Ledge, Level, LevelElement, LevelId } from '../src/game/types'
import { defaultLook } from '../src/storage/schema'

const params = new URLSearchParams(location.search)

interface ShowOptions {
  level?: string
  night?: boolean
  /** bottom | mid | high | top | an element id */
  at?: string
  /** Seconds of 60 fps frames to run before returning (particles drift in, flags flutter). */
  warm?: number
  /** Crumbly ledges drawn as found, hidden holds revealed. */
  discover?: boolean
  /** Hold an aim (angle in degrees, power 0..1). */
  aim?: [number, number] | null
  /** Override the HUD bands (CSS px). */
  hudTop?: number
  hudBottom?: number
}

interface PerfOptions extends ShowOptions {
  frames?: number
  /** Leap along the route with the saved solutions while timing (camera moves, sprites build). */
  moving?: boolean
  /** Read one pixel back inside the timed region, so the time includes the raster work too. */
  flush?: boolean
}

interface Scene {
  level: Level
  night: boolean
  session: ClimbSession
  renderer: Renderer
  animator: CharacterAnimator
  camera: Camera
  frame: RenderFrame
  clock: number
  restCenter: number
  hudTop: number
  hudBottom: number
  /** Autopilot (perf / run). */
  auto: boolean
  wait: number
  aiming: { angle: number; power: number; t: number; dur: number; launchTime: number | null } | null
}

const stage = document.createElement('div')
stage.className = 'stage'
const canvas = document.createElement('canvas')
stage.appendChild(canvas)
document.body.appendChild(stage)

let scene: Scene | null = null
let raf = 0

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v)

function isLedge(el: LevelElement): el is Ledge {
  return el.kind === 'ledge'
}

/** Named altitudes on a level's route. */
function points(level: Level): Record<'bottom' | 'mid' | 'high' | 'top', string> {
  const route = level.route
  const camps = route.filter((id) => {
    const el = level.elements.find((e) => e.id === id)
    return !!el && isLedge(el) && el.camp
  })
  const top = route[route.length - 1]
  const midCamp = camps.length > 2 ? camps[Math.floor(camps.length / 2)] : route[Math.floor(route.length / 2)]
  return { bottom: route[0], mid: midCamp, high: route[Math.max(0, route.length - 3)], top }
}

function resolveAt(level: Level, at: string | undefined): string {
  const p = points(level)
  if (!at) return p.bottom
  if (at === 'bottom' || at === 'mid' || at === 'high' || at === 'top') return p[at]
  return level.elements.some((e) => e.id === at) ? at : p.bottom
}

function destroyScene(): void {
  if (!scene) return
  scene.animator.destroy()
  scene.renderer.destroy()
  scene = null
}

function build(opts: ShowOptions): Scene {
  destroyScene()
  const level = getLevel((opts.level ?? 'p01') as LevelId) ?? getLevel('p01')!
  const night = !!opts.night
  const startId = resolveAt(level, opts.at)
  const poses = ['starfish', 'pancake', 'spaghetti']
  let pi = 0
  const session = new ClimbSession({ level, startId, choosePose: () => poses[pi++ % poses.length] })
  if (opts.discover) {
    for (const el of level.elements) {
      if (isLedge(el) && el.crumble) session.foundCrumbles.add(el.id)
      if (el.kind === 'hold' && el.hidden) session.revealed.add(el.id)
    }
  }
  const renderer = new Renderer(canvas, { zone: level.zone, night })
  const animator = new CharacterAnimator({ look: defaultLook(), night, goatOutside: night })
  const camera = new Camera()
  const wide = window.innerWidth >= 600
  const shortLandscape = window.innerHeight < 500 && window.innerWidth > window.innerHeight
  const s: Scene = {
    level,
    night,
    session,
    renderer,
    animator,
    camera,
    frame: { t: 0, dt: 0, aim: null, preview: null, ghost: null, betaMap: null },
    clock: 0,
    restCenter: 0,
    hudTop: opts.hudTop ?? (shortLandscape ? 10 : 74),
    hudBottom: opts.hudBottom ?? (shortLandscape ? 10 : wide ? 88 : 104),
    auto: false,
    wait: 0.6,
    aiming: null,
  }
  camera.resize(window.innerWidth, window.innerHeight, { top: s.hudTop, right: 0, bottom: s.hudBottom, left: 0 }, window.devicePixelRatio || 1)
  renderer.resize(camera)
  scene = s
  direct(s, 0, true)
  if (opts.aim) aimAt(s, opts.aim[0], opts.aim[1])
  return s
}

// ---------------------------------------------------------------------------------------------
// Camera: the climb stage's "ready" framing (low in the safe rect, next target in view).

function safeHalf(c: Camera, zoom: number): number {
  return (c.viewH - c.insets.top - c.insets.bottom) / (c.baseScale * zoom) / 2
}

function topOf(el: LevelElement): number {
  return el.kind === 'ledge' ? el.y + 60 : el.y + 16
}

function direct(s: Scene, dt: number, snap = false): void {
  const cam = s.camera
  const ses = s.session
  const big = ses.bigLeapHere()
  const zoom = big ? TUNING.bigLeapZoom : 1
  const hs = safeHalf(cam, zoom)
  const feet = ses.body.y
  let center: number
  if (ses.phase === 'ready' || ses.phase === 'sent') {
    if (big) {
      const to = ses.el(big.to)
      const top = topOf(to) + 50
      const bottom = feet - 240
      const lo = top + 20 - hs
      const hi = feet - 20 + hs - 60
      center = lo <= hi ? clamp((top + bottom) / 2, lo, hi) : (lo + hi) / 2
    } else {
      center = feet + Math.min(hs * 0.42, 170)
      const nextId = ses.nextTargetId()
      const next = nextId ? ses.index.byId.get(nextId) : undefined
      if (next) {
        const lo = topOf(next) + 40 - hs + 30
        const hi = feet - 30 + hs - 50
        center = lo <= hi ? clamp(center, lo, hi) : (lo + hi) / 2
      }
    }
    s.restCenter = center
  } else {
    const m = Math.min(90, hs * 0.22)
    const lo = feet + 70 + m - hs
    const hi = feet - 10 - m + hs
    center = lo <= hi ? clamp(s.restCenter, lo, hi) : (lo + hi) / 2
  }
  cam.setTarget(center, zoom)
  if (snap) {
    cam.snap()
    cam.update(0, s.level.height)
    cam.snap()
  }
  cam.update(dt, s.level.height)
}

function aimAt(s: Scene, angle: number, power: number): void {
  const md = maxDragPxFor(s.camera.viewW, s.camera.viewH)
  const a = (angle * Math.PI) / 180
  const len = Math.max(TUNING.cancelPx + 1, power * md)
  s.session.aimAt(-Math.cos(a) * len, Math.sin(a) * len, md, false)
}

function autopilot(s: Scene, dt: number): void {
  const ses = s.session
  if (s.aiming) {
    const a = s.aiming
    a.t += dt
    const k = Math.min(1, a.t / a.dur)
    aimAt(s, a.angle, a.power * (1 - (1 - k) * (1 - k)))
    const period = s.level.wind?.[0]?.period
    let ready = k >= 1
    if (ready && period && a.launchTime !== null) {
      const ph = (((ses.t - a.launchTime) % period) + period) % period
      ready = ph < 0.03 || ph > period - 0.01
    }
    if (ready) {
      ses.release()
      s.aiming = null
      s.wait = 0.45
    }
    return
  }
  if (ses.phase === 'sent') {
    s.wait -= dt
    if (s.wait < -1.5) {
      // Round again from the bottom (keeps a long perf run moving).
      const level = s.level
      s.session = new ClimbSession({ level, choosePose: () => 'starfish' })
      s.wait = 0.4
      direct(s, 0, true)
    }
    return
  }
  if (ses.phase !== 'ready') return
  s.wait -= dt
  if (s.wait > 0) return
  const sol = solutionFrom(s.level.id, ses.elementId)
  if (!sol) return
  const el = ses.el(ses.elementId)
  const crumbly = isLedge(el) && !!el.crumble
  s.aiming = { angle: sol.angle, power: sol.power, t: 0, dur: crumbly ? 0.35 : 0.55, launchTime: s.level.wind && !crumbly ? sol.launchTime : null }
}

function step(s: Scene, dt: number): void {
  s.clock += dt
  s.session.update(dt)
  if (s.auto) autopilot(s, dt)
  direct(s, dt)
}

let flush = false

function render(s: Scene, dt: number): number {
  const ses = s.session
  const f = s.frame
  const aim = ses.aim
  f.t = s.clock
  f.dt = dt
  f.aim = aim
  f.preview = aim && !aim.cancel ? ses.previewPath(aim.angle, aim.power) : null
  const t0 = performance.now()
  s.renderer.draw(ses, s.camera, f, s.animator)
  if (flush) s.renderer.context?.getImageData(0, 0, 1, 1)
  return performance.now() - t0
}

// ---------------------------------------------------------------------------------------------
// API

function info(s: Scene): Record<string, unknown> {
  return {
    level: s.level.id,
    zone: s.level.zone,
    at: s.session.elementId,
    y: Math.round(s.session.body.y),
    centerY: Math.round(s.camera.centerY),
    scale: +s.camera.scale.toFixed(3),
    view: [s.camera.viewW, s.camera.viewH, s.camera.dpr],
    stats: s.renderer.stats(),
  }
}

const api = {
  levels(): string[] {
    return ALL_LEVELS.filter((l) => l.id !== 'lesson').map((l) => l.id)
  },
  points(id: string): Record<string, string> | null {
    const level = getLevel(id as LevelId)
    return level ? points(level) : null
  },
  show(opts: ShowOptions = {}): Record<string, unknown> {
    cancelAnimationFrame(raf)
    const s = build(opts)
    const warm = opts.warm ?? 1.2
    const n = Math.max(1, Math.round(warm * 60))
    for (let i = 0; i < n; i++) {
      step(s, 1 / 60)
      if (opts.aim) aimAt(s, opts.aim[0], opts.aim[1])
      render(s, 1 / 60)
    }
    return info(s)
  },
  perf(opts: PerfOptions = {}): Promise<Record<string, number>> {
    cancelAnimationFrame(raf)
    const s = build(opts)
    s.auto = opts.moving !== false
    flush = !!opts.flush
    const frames = opts.frames ?? 300
    const times: number[] = []
    let first = 0
    return new Promise((resolve) => {
      let last = -1
      const loop = (now: number) => {
        const dt = last < 0 ? 1 / 60 : Math.min(0.1, (now - last) / 1000)
        last = now
        step(s, dt)
        const ms = render(s, dt)
        if (times.length === 0 && first === 0) first = ms
        else times.push(ms)
        if (times.length < frames) raf = requestAnimationFrame(loop)
        else {
          flush = false
          const a = times.slice().sort((x, y) => x - y)
          const mean = a.reduce((sum, v) => sum + v, 0) / a.length
          resolve({
            frames: a.length,
            first: +first.toFixed(2),
            mean: +mean.toFixed(3),
            p50: +a[Math.floor(a.length * 0.5)].toFixed(2),
            p95: +a[Math.floor(a.length * 0.95)].toFixed(2),
            max: +a[a.length - 1].toFixed(2),
            cachedMpx: +(s.renderer.stats().cachedPx / 1e6).toFixed(2),
          })
        }
      }
      raf = requestAnimationFrame(loop)
    })
  },
  /** Time the far world alone (Parallax.draw, unclipped) over N frames of a scene's camera. */
  perfParallax(opts: PerfOptions = {}): Record<string, number> {
    cancelAnimationFrame(raf)
    const s = build(opts)
    const ctx = s.renderer.context
    if (!ctx) return {}
    const par = new Parallax(paletteFor(s.level.zone, s.night), `${s.level.zone}${s.night ? ':night' : ''}`)
    const view = new View().from(s.camera)
    par.resize(view, s.camera.viewH / s.camera.baseScale / 2 - 90)
    const b0 = performance.now()
    par.draw(ctx, s.camera, view, 0, null)
    const buildMs = performance.now() - b0
    const frames = opts.frames ?? 300
    const t0 = performance.now()
    for (let i = 0; i < frames; i++) {
      s.camera.centerY += 0.5
      view.from(s.camera)
      par.draw(ctx, s.camera, view, i / 60, null)
      if (opts.flush) ctx.getImageData(0, 0, 1, 1)
    }
    const ms = (performance.now() - t0) / frames
    const px = par.cachedPixels()
    par.destroy()
    return { ms: +ms.toFixed(3), build: +buildMs.toFixed(1), cachedMpx: +(px / 1e6).toFixed(2) }
  },
  /** Keep animating live (autopilot optional). */
  run(auto = true): void {
    if (!scene) return
    const s = scene
    s.auto = auto
    let last = -1
    cancelAnimationFrame(raf)
    const loop = (now: number) => {
      const dt = last < 0 ? 1 / 60 : Math.min(0.1, (now - last) / 1000)
      last = now
      step(s, dt)
      const ms = render(s, dt)
      const st = document.getElementById('stats')
      if (st && Math.round(now) % 15 < 2) st.textContent = `${ms.toFixed(1)} ms · ${s.session.elementId} · ${(s.renderer.stats().cachedPx / 1e6).toFixed(1)} Mpx`
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
  },
  stop(): void {
    cancelAnimationFrame(raf)
  },
  destroy(): void {
    cancelAnimationFrame(raf)
    destroyScene()
  },
}
;(window as unknown as { __zones: typeof api }).__zones = api

// ---------------------------------------------------------------------------------------------
// Manual use

function panel(): void {
  const p = document.createElement('div')
  p.id = 'panel'
  const sel = document.createElement('select')
  for (const l of ALL_LEVELS) {
    if (l.id === 'lesson') continue
    const o = document.createElement('option')
    o.value = l.id
    o.textContent = `${l.id} · ${l.zone}`
    if (l.id === (params.get('level') ?? 'p01')) o.selected = true
    sel.appendChild(o)
  }
  const go = (patch: Record<string, string>) => {
    const q = new URLSearchParams(location.search)
    for (const [k, v] of Object.entries(patch)) q.set(k, v)
    location.search = q.toString()
  }
  sel.onchange = () => go({ level: sel.value })
  const buttons: [string, Record<string, string>][] = [
    ['Bottom', { at: 'bottom' }],
    ['Mid', { at: 'mid' }],
    ['High', { at: 'high' }],
    ['Top', { at: 'top' }],
    [params.get('night') === '1' ? 'Day' : 'Night', { night: params.get('night') === '1' ? '0' : '1' }],
    ['Run', { run: '1' }],
  ]
  p.appendChild(sel)
  for (const [label, patch] of buttons) {
    const b = document.createElement('button')
    b.textContent = label
    b.onclick = () => go(patch)
    p.appendChild(b)
  }
  const stats = document.createElement('span')
  stats.id = 'stats'
  p.appendChild(stats)
  document.body.appendChild(p)
}

function boot(): void {
  const aim = params.get('aim')
  const opts: ShowOptions = {
    level: params.get('level') ?? 'p01',
    night: params.get('night') === '1',
    at: params.get('at') ?? 'bottom',
    warm: Number(params.get('warm') ?? 1.2),
    discover: params.get('discover') === '1',
    aim: aim ? (aim.split(',').map(Number) as [number, number]) : null,
  }
  if (params.get('ui') !== '0') panel()
  api.show(opts)
  if (params.get('run') === '1') api.run(true)
  window.addEventListener('resize', () => {
    if (!scene) return
    api.show({ ...opts, level: scene.level.id })
  })
  document.body.dataset.ready = '1'
}

void document.fonts.ready.then(boot, boot)
