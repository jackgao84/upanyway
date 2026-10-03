/**
 * Dev-only Looks Scary lab (served at /upanyway/dev/scary.html by `vite`; not part of the build).
 *
 * Runs the real ClimbStage (renderer, camera framing, character animator) on a pitch with a Looks
 * Scary moment, standing at its forecast camp or on its reveal spot, with the ScaryLayer in the
 * renderer's hooks the way the climb screen wires it: draw() → 'behind', drawOnFog() → 'fog' (the
 * renderer draws the Cloud Steps fog itself), drawFront() → 'front', bridgeGaps() → the terrain.
 *
 * Query: kind=bigleap|eyes|rumble|bridge|shadow (or level=p02 …), at=forecast|reveal, start=<element id>,
 *   phase=looming|revealing|revealed, cam=play|forecast|reveal, night=1, ui=0.
 * window.__scary: reveal() replays the reveal, phase(p), state().
 */
import '@fontsource-variable/nunito/wght.css'
import { ClimbSession } from '../src/game/engine'
import { getLevel } from '../src/game/levels'
import { ScaryLayer, type ScaryCue, type ScaryPhase } from '../src/game/render/scary'
import type { Level, LevelId, LooksScaryKind } from '../src/game/types'
import { defaultLook } from '../src/storage/schema'
import { ClimbStage } from '../src/screens/climb/stage'

const params = new URLSearchParams(location.search)
const KIND_LEVEL: Record<LooksScaryKind, LevelId> = { bigleap: 'p02', eyes: 'p05', rumble: 'p08', bridge: 'p11', shadow: 'p14' }
const kind = params.get('kind') as LooksScaryKind | null
const levelId = (params.get('level') ?? (kind ? KIND_LEVEL[kind] : 'p02')) as LevelId
const level = getLevel(levelId) as Level
const ls = level.looksScary
const at = params.get('at') ?? 'forecast'
const night = params.get('night') === '1'
const startPhase = (params.get('phase') ?? (at === 'reveal' ? 'revealing' : 'looming')) as ScaryPhase
const camMode = params.get('cam') ?? (at === 'reveal' ? 'reveal' : 'play')

const startId = params.get('start') ?? (ls ? (at === 'reveal' ? ls.revealAt : ls.forecastAt) : undefined)
const session = new ClimbSession({ level, startId, choosePose: () => 'starfish' })
const scary = new ScaryLayer(level, { night })
const cues: string[] = []
scary.onCue = (c: ScaryCue) => {
  cues.push(c)
  if (cues.length > 12) cues.shift()
}

const stage = new ClimbStage(document.body, {
  level,
  session,
  look: defaultLook(),
  night,
  goatOutside: night,
  hudTop: 74,
  hudBottom: () => (window.innerWidth < 600 ? 104 : 88),
  label: 'Looks Scary lab',
  onFrame: (dt) => {
    scary.update(dt, stage.camera, session.body)
  },
})

// The renderer's slots: draw() behind the ledges, drawOnFog() on the fog, drawFront() over everything.
// Draw-time of the scary layer (ms per frame, for the lab’s perf readout).
const perfMs: number[] = []
let frameMs = 0
const timed = (fn: () => void) => {
  const t0 = performance.now()
  fn()
  frameMs += performance.now() - t0
}
stage.renderer.setHook('behind', (ctx, _s, camera, t) => {
  if (frameMs > 0) perfMs.push(frameMs)
  if (perfMs.length > 600) perfMs.shift()
  frameMs = 0
  timed(() => scary.draw(ctx, camera, t))
})
stage.renderer.setHook('fog', (ctx, _s, camera, t) => timed(() => scary.drawOnFog(ctx, camera, t)))
stage.renderer.setHook('front', (ctx, _s, camera, t) => timed(() => scary.drawFront(ctx, camera, t)))
stage.renderer.setBridgeGaps(() => scary.bridgeGaps())

function frameCamera(): void {
  if (!ls) return
  if (camMode === 'forecast') {
    // What the climb screen should do while the Fear Forecast is up.
    const f = scary.forecastFocus()
    stage.lookAt(f.y, 1, 0.4)
    stage.animator.lookAt(f.x, f.y, 99, 'nervous')
  } else if (camMode === 'reveal') {
    const f = scary.focus()
    stage.lookAt(f.y, 1, 0.42)
    stage.animator.lookAt(f.x, f.y, 99, 'happy')
  } else {
    stage.clearLook()
  }
}

function reveal(): void {
  scary.setPhase('looming', stage.time)
  scary.setPhase('revealing', stage.time)
  stage.setFrozen('prompt', true)
  frameCamera()
}

scary.setPhase(startPhase === 'revealing' ? 'looming' : startPhase, stage.time)
if (startPhase === 'revealing') reveal()
else frameCamera()

if (params.get('ui') !== '0') {
  const p = document.createElement('div')
  p.id = 'panel'
  const sel = document.createElement('select')
  for (const k of Object.keys(KIND_LEVEL) as LooksScaryKind[]) {
    for (const a of ['forecast', 'reveal']) {
      const o = document.createElement('option')
      o.value = `${k}|${a}`
      o.textContent = `${k} · ${a}`
      if (KIND_LEVEL[k] === levelId && a === at) o.selected = true
      sel.appendChild(o)
    }
  }
  sel.onchange = () => {
    const [k, a] = sel.value.split('|')
    const q = new URLSearchParams(location.search)
    q.set('kind', k)
    q.set('at', a)
    q.delete('level')
    q.delete('phase')
    q.delete('cam')
    location.search = q.toString()
  }
  const btn = (label: string, fn: () => void) => {
    const b = document.createElement('button')
    b.textContent = label
    b.onclick = fn
    return b
  }
  const stats = document.createElement('span')
  stats.id = 'stats'
  p.append(
    sel,
    btn('Looming', () => scary.setPhase('looming', stage.time)),
    btn('Reveal', reveal),
    btn('Revealed', () => scary.setPhase('revealed', stage.time)),
    btn(night ? 'Day' : 'Night', () => {
      const q = new URLSearchParams(location.search)
      q.set('night', night ? '0' : '1')
      location.search = q.toString()
    }),
    stats,
  )
  document.body.appendChild(p)
  setInterval(() => {
    stats.textContent = `${scary.phase} · ${(scary.cachedPixels() / 1e6).toFixed(2)} Mpx · cues: ${cues.slice(-4).join(' ')}`
  }, 250)
}

;(window as unknown as { __scary: unknown }).__scary = {
  reveal,
  phase: (p: ScaryPhase) => scary.setPhase(p, stage.time),
  perf: () => {
    const a = perfMs.slice(10).sort((x, y) => x - y)
    const mean = a.reduce((m, v) => m + v, 0) / Math.max(1, a.length)
    return { frames: a.length, mean: +mean.toFixed(3), p95: +(a[Math.floor(a.length * 0.95)] ?? 0).toFixed(3), max: +(a[a.length - 1] ?? 0).toFixed(3) }
  },
  state: () => ({ phase: scary.phase, cues: cues.slice(), focus: scary.focus(), forecastFocus: scary.forecastFocus(), duration: scary.revealDuration(), px: scary.cachedPixels() }),
}
requestAnimationFrame(() => requestAnimationFrame(() => (document.body.dataset.ready = '1')))
