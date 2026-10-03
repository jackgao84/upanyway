/**
 * Dev-only world lab (served at /upanyway/dev/world.html by `vite`; not part of the build).
 *
 * ?mode=play (default): a real ClimbSession + the Renderer, auto-leaping through the saved
 *   solutions. Query: level=p01, night=1, at=<element id to start on>, fails=1 (miss now and then to
 *   show chalk + the rope), ui=0 (hide the panel), auto=0 (stand still).
 * ?mode=swatches: every zone's palette (day + night) as chips and a still frame of that zone.
 *
 * The climber here is drawn with the Stage 2 climber art in a few basic poses (the real animator
 * lives in src/game/render/character.ts); `window.__lab` lets a screenshot script set up states.
 */
import '@fontsource-variable/nunito/wght.css'
import { Camera } from '../src/game/camera'
import { ClimbSession, type Aim } from '../src/game/engine'
import { ALL_LEVELS, getLevel } from '../src/game/levels'
import { solutionFrom } from '../src/game/levels/solutions'
import { maxDragPxFor } from '../src/game/input'
import { TUNING } from '../src/game/tuning'
import type { Ledge, Level, LevelId, ZoneId } from '../src/game/types'
import { Renderer, type CharacterDrawer, type RenderFrame } from '../src/game/render/renderer'
import { paletteFor, ZONES, type ZonePalette } from '../src/game/render/palette'
import { drawClimber, type Expression } from '../src/game/art/climber'
import { crouch, fall, fly, hang, idle, stand } from '../src/game/art/poses'
import type { Pose } from '../src/game/art/rig'
import { defaultLook } from '../src/storage/schema'

const params = new URLSearchParams(location.search)
const mode = params.get('mode') ?? 'play'
const look = defaultLook()
/** ?char=real draws the real animator (src/game/render/character.ts) instead of the lab poses. */
let character: CharacterDrawer | null = null

// ---------------------------------------------------------------------------------------------
// A simple climber for the lab

const stub: CharacterDrawer = {
  draw(ctx, s, cam, t) {
    const p = cam.worldToScreen(s.body.x, s.body.y)
    let pose: Pose
    let expression: Expression = 'happy'
    const hanging = s.isHanging()
    if (s.aim && !s.aim.cancel) {
      pose = crouch(s.aim.power, s.aim.angle, s.facing)
      expression = s.bigLeapHere() ? 'scared-but-going' : 'determined'
    } else if (s.phase === 'flying') pose = s.body.vy > 0 ? fly(t) : fall(t)
    else if (s.phase === 'roped' || s.phase === 'flopped') {
      pose = fall(t)
      expression = 'surprised'
    } else if (hanging) pose = hang(2, t)
    else if (s.phase === 'settling') pose = stand()
    else pose = idle(t)
    if (s.phase === 'sent') expression = 'proud'
    ctx.translate(p.x, p.y)
    ctx.scale(cam.scale, cam.scale)
    drawClimber(ctx, { look, pose, expression, facing: s.facing, t, goat: { mood: s.phase === 'roped' ? 'wheee' : 'peek', t, inBackpack: true } })
  },
}

// ---------------------------------------------------------------------------------------------
// Play mode

interface Lab {
  level: Level
  session: ClimbSession
  renderer: Renderer
  camera: Camera
  night: boolean
  auto: boolean
  fails: boolean
  /** Lab autopilot state. */
  wait: number
  aiming: { angle: number; power: number; t: number; dur: number; launchTime: number | null } | null
  hold: Aim | null
  ghost: number[] | null
  beta: { t: number } | null
  step: number
  paused: boolean
}

let lab: Lab | null = null
const perfLog: number[] = []

function startPlay(): void {
  document.body.className = 'play'
  const stage = document.createElement('div')
  stage.className = 'stage'
  const canvas = document.createElement('canvas')
  stage.appendChild(canvas)
  document.body.appendChild(stage)

  const levelId = (params.get('level') ?? 'p01') as LevelId
  const night = params.get('night') === '1'
  const camera = new Camera()
  const level = getLevel(levelId) ?? getLevel('p01')!
  const renderer = new Renderer(canvas, { zone: level.zone, night })
  lab = {
    level,
    session: makeSession(level, params.get('at') ?? undefined),
    renderer,
    camera,
    night,
    auto: params.get('auto') !== '0',
    fails: params.get('fails') === '1',
    wait: 0.6,
    aiming: null,
    hold: null,
    ghost: null,
    beta: null,
    step: 0,
    paused: false,
  }

  const resize = () => {
    if (!lab) return
    lab.camera.resize(window.innerWidth, window.innerHeight, { top: 0, right: 0, bottom: 0, left: 0 }, window.devicePixelRatio || 1)
    lab.renderer.resize(lab.camera)
    focus(true)
  }
  window.addEventListener('resize', resize)
  resize()

  if (params.get('ui') !== '0') panel()

  let last = performance.now()
  let drawMs = 0
  let frameNo = 0
  perfLog.length = 0
  const loop = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000)
    last = now
    if (lab && !lab.paused) {
      tick(dt)
      const t0 = performance.now()
      draw(now / 1000, dt)
      const ms = performance.now() - t0
      drawMs = drawMs * 0.9 + ms * 0.1
      perfLog.push(ms)
      if (perfLog.length > 600) perfLog.shift()
      if (++frameNo <= 3 || ms > 40) console.info(`[world] frame ${frameNo}: ${ms.toFixed(1)} ms`)
      const st = document.getElementById('stats')
      if (st && Math.round(now) % 20 < 2) {
        const s = lab.renderer.stats()
        st.textContent = `${drawMs.toFixed(1)} ms · ${(s.cachedPx / 1e6).toFixed(1)} Mpx · ${s.particles} p · ${lab.session.elementId}`
      }
    }
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
  document.body.dataset.ready = '1'
}

function makeSession(level: Level, at?: string): ClimbSession {
  let i = 0
  const poses = ['starfish', 'pancake', 'spaghetti']
  return new ClimbSession({ level, startId: at, choosePose: () => poses[i++ % poses.length] })
}

function focus(snap = false): void {
  if (!lab) return
  if (lab.beta) {
    // The Beta Map: the whole pitch in view.
    const fit = Math.min(1, lab.camera.viewH / lab.camera.baseScale / (lab.level.height + 260))
    lab.camera.setTarget(lab.level.height / 2 + 40, fit)
    if (snap) lab.camera.snap()
    return
  }
  const s = lab.session
  const big = s.bigLeapHere() !== null && (lab.aiming !== null || lab.hold !== null)
  lab.camera.setTarget(s.body.y + 70, big ? TUNING.bigLeapZoom : 1)
  if (snap) lab.camera.snap()
}

function tick(dt: number): void {
  if (!lab) return
  const L = lab
  const s = L.session
  s.update(dt)
  if (L.beta) {
    L.beta.t += dt
    if (L.beta.t > 8) {
      L.beta = null
      L.session = makeSession(L.level)
      L.step = 0
      L.wait = 1
    }
  } else if (s.phase === 'sent') {
    L.wait -= dt
    if (L.wait < -2) L.beta = { t: 0 }
  } else if (L.auto && !L.hold) autopilot(dt)
  focus()
  L.camera.update(dt, L.level.height)
}

function autopilot(dt: number): void {
  if (!lab) return
  const L = lab
  const s = L.session
  if (L.aiming) {
    const a = L.aiming
    a.t += dt
    const k = Math.min(1, a.t / a.dur)
    const ease = 1 - (1 - k) * (1 - k)
    aimAt(a.angle, a.power * ease)
    const period = L.level.wind?.[0]?.period
    let ready = k >= 1
    if (ready && period && a.launchTime !== null) {
      const ph = (((s.t - a.launchTime) % period) + period) % period
      ready = ph < 0.03 || ph > period - 0.01
    }
    if (ready) {
      s.release()
      L.aiming = null
      L.wait = 0.55
    }
    return
  }
  if (s.phase !== 'ready') return
  L.wait -= dt
  if (L.wait > 0) return
  const sol = solutionFrom(L.level.id, s.elementId)
  if (!sol) return
  L.step++
  let angle = sol.angle
  let power = sol.power
  // Now and then a miss, to show chalk, the rope and a fall.
  if (L.fails && L.step % 4 === 2) {
    power *= 0.72
    angle += 8
  }
  const el = s.el(s.elementId)
  const crumbly = el.kind === 'ledge' && (el as Ledge).crumble
  L.aiming = { angle, power, t: 0, dur: crumbly ? 0.45 : 0.75, launchTime: L.level.wind && !crumbly ? sol.launchTime : null }
}

function aimAt(angle: number, power: number): void {
  if (!lab) return
  const md = maxDragPxFor(lab.camera.viewW, lab.camera.viewH)
  const a = (angle * Math.PI) / 180
  const len = Math.max(TUNING.cancelPx + 1, power * md)
  lab.session.aimAt(-Math.cos(a) * len, Math.sin(a) * len, md, false)
}

function draw(t: number, dt: number): void {
  if (!lab) return
  const s = lab.session
  const aim = s.aim
  const frame: RenderFrame = {
    t,
    dt,
    aim,
    preview: aim && !aim.cancel ? s.previewPath(aim.angle, aim.power) : null,
    ghost: lab.ghost,
    betaMap: lab.beta ? { failed: s.chalk.map((c) => c.arc), route: s.routeArcs, t: lab.beta.t } : null,
  }
  lab.renderer.draw(s, lab.camera, frame, character ?? stub)
}

function panel(): void {
  const p = document.createElement('div')
  p.id = 'panel'
  const sel = document.createElement('select')
  for (const l of ALL_LEVELS) {
    const o = document.createElement('option')
    o.value = l.id
    o.textContent = `${l.id} · ${l.zone} · ${l.title}`
    if (l.id === lab?.level.id) o.selected = true
    sel.appendChild(o)
  }
  sel.onchange = () => {
    const q = new URLSearchParams(location.search)
    q.set('level', sel.value)
    q.delete('at')
    location.search = q.toString()
  }
  const night = document.createElement('button')
  night.textContent = lab?.night ? 'Day' : 'Night'
  night.onclick = () => {
    const q = new URLSearchParams(location.search)
    q.set('night', lab?.night ? '0' : '1')
    location.search = q.toString()
  }
  const fails = document.createElement('button')
  fails.textContent = 'Misses: ' + (lab?.fails ? 'on' : 'off')
  fails.onclick = () => {
    if (!lab) return
    lab.fails = !lab.fails
    fails.textContent = 'Misses: ' + (lab.fails ? 'on' : 'off')
  }
  const sw = document.createElement('a')
  sw.href = '?mode=swatches'
  sw.textContent = 'Swatches'
  sw.style.color = '#ffd36b'
  const stats = document.createElement('span')
  stats.id = 'stats'
  p.append(sel, night, fails, sw, stats)
  document.body.appendChild(p)
}

// Screenshot / poke helpers.
const api = {
  /** Start again standing on `id` (any element). */
  jumpTo(id: string): void {
    if (!lab) return
    lab.session = makeSession(lab.level, id)
    lab.aiming = null
    lab.hold = null
    lab.beta = null
    lab.wait = 99
    focus(true)
  },
  /** Hold an aim (stops the autopilot). */
  aim(angle: number, power: number): void {
    if (!lab) return
    lab.auto = false
    aimAt(angle, power)
    lab.hold = lab.session.aim
    focus()
  },
  cancelAim(): void {
    if (!lab) return
    lab.session.cancelAim()
    lab.hold = null
  },
  /** Leap with a solution (or a given input). */
  leap(angle?: number, power?: number): void {
    if (!lab) return
    const s = lab.session
    const sol = solutionFrom(lab.level.id, s.elementId)
    lab.hold = null
    s.launch(angle ?? sol?.angle ?? 90, power ?? sol?.power ?? 0.5)
  },
  /** Show the ghost beta from where she stands. */
  ghost(on = true): void {
    if (!lab) return
    const sol = solutionFrom(lab.level.id, lab.session.elementId)
    lab.ghost = on && sol ? lab.session.ghostPath(sol) : null
  },
  /** Mark every crumbly ledge as found (cracks), reveal every hidden hold. */
  discover(): void {
    if (!lab) return
    for (const el of lab.level.elements) {
      if (el.kind === 'ledge' && el.crumble) lab.session.foundCrumbles.add(el.id)
      if (el.kind === 'hold' && el.hidden) lab.session.revealed.add(el.id)
    }
  },
  auto(on: boolean): void {
    if (lab) lab.auto = on
  },
  pause(on: boolean): void {
    if (lab) lab.paused = on
  },
  /** Run the sim + renderer forward by `seconds` of fixed frames (for deterministic shots). */
  advance(seconds: number, fps = 60): void {
    if (!lab) return
    const n = Math.round(seconds * fps)
    for (let i = 0; i < n; i++) {
      tick(1 / fps)
      draw(performance.now() / 1000, 1 / fps)
    }
  },
  /** Run the sim (and the autopilot) forward without drawing. */
  simulate(seconds: number): void {
    if (!lab) return
    const n = Math.round(seconds * 60)
    for (let i = 0; i < n; i++) tick(1 / 60)
  },
  /** Turn deliberate misses on/off. */
  fails(on: boolean): void {
    if (lab) lab.fails = on
  },
  betaMap(t = 5): void {
    if (!lab) return
    lab.beta = { t }
    focus(true)
  },
  /** Decorations (other than clouds and caves) that don't sit on any ledge top, per level. */
  orphans(): Record<string, string[]> {
    const out: Record<string, string[]> = {}
    for (const l of ALL_LEVELS) {
      for (const d of l.decor ?? []) {
        if (d.kind === 'cloud' || d.kind === 'cave') continue
        const on = l.elements.some((e) => e.kind === 'ledge' && Math.abs(e.y - d.y) <= 3 && d.x >= e.x - 24 && d.x <= e.x + e.w + 24)
        if (!on) (out[l.id] ??= []).push(`${d.kind}@${d.x},${d.y}`)
      }
    }
    return out
  },
  /** Draw-time stats over the last frames (ms). */
  perf(): { frames: number; mean: number; p95: number; max: number } {
    const a = perfLog.slice(5).sort((x, y) => x - y)
    const mean = a.reduce((s, v) => s + v, 0) / Math.max(1, a.length)
    return { frames: a.length, mean: +mean.toFixed(2), p95: +(a[Math.floor(a.length * 0.95)] ?? 0).toFixed(2), max: +(a[a.length - 1] ?? 0).toFixed(2) }
  },
  state(): unknown {
    if (!lab) return null
    return { ...lab.session.snapshot(), stats: lab.renderer.stats(), zoom: lab.camera.zoom }
  },
}
;(window as unknown as { __lab: typeof api }).__lab = api

// ---------------------------------------------------------------------------------------------
// Swatches mode

const SHOWCASE: Record<ZoneId, { level: LevelId; at: string }> = {
  meadow: { level: 'p02', at: 'c1' },
  hollow: { level: 'p05', at: 'c2' },
  crumble: { level: 'p08', at: 'c1' },
  ridge: { level: 'p11', at: 'c1' },
  cloud: { level: 'p14', at: 'c2' },
  summit: { level: 'p16', at: 'c2' },
}

function chips(p: ZonePalette): string[] {
  return [
    ...p.sky.map((s) => s.color),
    ...p.mountains,
    p.face,
    p.faceLight,
    p.faceDark,
    p.rock,
    p.rockDark,
    p.top,
    p.topDark,
    p.hold.jug,
    p.hold.root,
    p.hold.crystal,
    p.hold.knob,
    ...p.accents,
    p.tent,
    p.flag,
    p.lantern,
    p.rope,
  ]
}

function startSwatches(): void {
  const main = document.createElement('main')
  main.className = 'swatches'
  document.body.appendChild(main)
  const cams: { renderer: Renderer; camera: Camera; session: ClimbSession; canvas: HTMLCanvasElement }[] = []
  for (const zone of ZONES) {
    for (const night of [false, true]) {
      const p = paletteFor(zone, night)
      const card = document.createElement('section')
      card.className = 'zone-card'
      const h = document.createElement('h2')
      const show = SHOWCASE[zone]
      h.textContent = `${zone}${night ? ' · night' : ''} — ${show.level} at ${show.at}`
      const canvas = document.createElement('canvas')
      const row = document.createElement('div')
      row.className = 'chips'
      for (const c of chips(p)) {
        const d = document.createElement('div')
        d.className = 'chip'
        d.style.background = c
        d.title = c
        row.appendChild(d)
      }
      card.append(h, canvas, row)
      main.appendChild(card)
      const level = getLevel(show.level)!
      const session = makeSession(level, show.at)
      for (const el of level.elements) {
        if (el.kind === 'ledge' && el.crumble) session.foundCrumbles.add(el.id)
        if (el.kind === 'hold' && el.hidden) session.revealed.add(el.id)
      }
      const renderer = new Renderer(canvas, { zone, night })
      cams.push({ renderer, camera: new Camera(), session, canvas })
    }
  }
  const render = (t: number) => {
    for (const c of cams) {
      const w = c.canvas.clientWidth
      const h = c.canvas.clientHeight
      if (c.camera.viewW !== w || c.camera.viewH !== h) {
        c.camera.resize(w, h, { top: 0, right: 0, bottom: 0, left: 0 }, window.devicePixelRatio || 1)
        c.renderer.resize(c.camera)
        c.camera.setTarget(c.session.body.y + 80, 0.82)
        c.camera.snap()
        c.camera.update(0, c.session.level.height)
      }
      c.renderer.draw(c.session, c.camera, { t, dt: 1 / 60, aim: null, preview: null, ghost: null }, stub)
    }
  }
  let frames = 0
  const loop = (now: number) => {
    render(now / 1000)
    if (++frames < 90) requestAnimationFrame(loop)
    else document.body.dataset.ready = '1'
  }
  requestAnimationFrame(loop)
}

async function boot(): Promise<void> {
  if (params.get('char') === 'real') {
    try {
      const mod = await import('../src/game/render/character')
      character = new mod.CharacterAnimator({ look, night: params.get('night') === '1', goatOutside: params.get('night') === '1' })
    } catch (e) {
      console.warn('[world] real character unavailable, using the lab poses', e)
    }
  }
  if (mode === 'swatches') startSwatches()
  else startPlay()
}
void boot()
