/**
 * Dev-only fall-pose lab (served at /upanyway/dev/poses.html by `vite`; not part of the build).
 * All 16 whipper poses animating at climb size (phone ≈ 1 px/unit, iPad ≈ 2 px/unit), as Hall of
 * Flops cards (collected + silhouette), and as filmstrips for reviewing screenshots.
 *
 * Query: ?still=1 (every cell at its pose's still frame), ?t=0.5 (every cell at that time).
 */
import { defaultLook, type ClimberLook } from '../src/storage/schema'
import { randomLook } from '../src/content/wardrobe'
import { FALL_POSES } from '../src/content/fallPoses'
import { drawClimber } from '../src/game/art/climber'
import {
  fallPose,
  fallPoseExpression,
  fallPoseGoatMood,
  fallPoseStill,
  groundLift,
} from '../src/game/art/fallPosesAnim'
import { renderPoseCard } from '../src/game/art/poseCard'

const params = new URLSearchParams(location.search)
const STILL = params.get('still') === '1'
const FIXED_T = params.has('t') ? Number(params.get('t')) : null
const ANIMATE = !STILL && FIXED_T === null
const lab = document.getElementById('lab') as HTMLElement

function seeded(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let x = s
    x = Math.imul(x ^ (x >>> 15), x | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

const base = defaultLook()
const looks: ClimberLook[] = [base, ...Array.from({ length: 16 }, (_, i) => randomLook(seeded(i * 131 + 7)))]

function section(id: string, title: string, cls = '', gridCls = 'grid'): HTMLElement {
  const s = document.createElement('section')
  s.id = id
  if (cls) s.className = cls
  const h = document.createElement('h2')
  h.textContent = title
  const g = document.createElement('div')
  g.className = gridCls
  s.append(h, g)
  lab.appendChild(s)
  return g
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.style.width = `${w}px`
  c.style.height = `${h}px`
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  c.width = Math.round(w * dpr)
  c.height = Math.round(h * dpr)
  return c
}

function cell(grid: HTMLElement, c: HTMLCanvasElement, name: string, sub = ''): void {
  const f = document.createElement('figure')
  const cap = document.createElement('figcaption')
  const b = document.createElement('b')
  b.textContent = name
  cap.append(b, sub)
  f.append(c, cap)
  grid.appendChild(f)
}

const draws: ((t: number) => void)[] = []

/** The climber at a fixed world scale (px per unit), feet at (cx, cy) — like the climb renders her. */
function climbCell(
  grid: HTMLElement,
  id: string,
  look: ClimberLook,
  pxPerUnit: number,
  w: number,
  h: number,
  facing: 1 | -1,
  label: string,
  rest = false,
): void {
  const c = makeCanvas(w, h)
  const draw = (t: number) => {
    const ctx = c.getContext('2d')
    if (!ctx) return
    const dpr = c.width / w
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, c.width, c.height)
    const p = fallPose(id, t)
    const s = pxPerUnit
    const feetY = rest ? h - 8 : h * 0.5 + 24 * s
    const lift = rest ? groundLift(p) : 0
    if (rest) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.fillStyle = '#9b7b62'
      ctx.fillRect(4, feetY, w - 8, 6)
      ctx.fillStyle = '#7fb069'
      ctx.fillRect(4, feetY - 1.5, w - 8, 2.5)
    }
    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (w / 2), dpr * (feetY + lift * s))
    drawClimber(ctx, {
      look,
      pose: p,
      expression: fallPoseExpression(id, t),
      facing,
      t,
      goat: { mood: fallPoseGoatMood(id), t, inBackpack: true, earFlap: 1 },
    })
  }
  draws.push((t) => draw(FIXED_T ?? (STILL ? fallPoseStill(id) : t)))
  cell(grid, c, label)
}

// Phone-size climb view (≈ 0.95 px per unit → she's ~50 px tall).
{
  const g = section('phone', 'Climb size — phone (0.95 px/unit), facing right then left', 'sky')
  FALL_POSES.forEach((info, i) => climbCell(g, info.id, looks[i % looks.length], 0.95, 92, 92, 1, info.name))
  FALL_POSES.forEach((info, i) => climbCell(g, info.id, looks[(i + 5) % looks.length], 0.95, 92, 92, -1, ''))
}

// iPad climb view (≈ 1.95 px per unit → ~100 px tall).
{
  const g = section('ipad', 'Climb size — iPad (1.95 px/unit)', 'sky')
  FALL_POSES.forEach((info, i) => climbCell(g, info.id, looks[(i + 2) % looks.length], 1.95, 170, 170, 1, info.name))
}

// Flop on a ledge (slips): the pose rests on the ground via groundLift().
{
  const g = section('rest', 'Flop landing on a ledge (groundLift)', 'sky')
  FALL_POSES.forEach((info, i) => climbCell(g, info.id, looks[(i + 9) % looks.length], 1.4, 120, 110, 1, info.name, true))
}

// Night (contrast check).
{
  const g = section('night', 'Night (contrast)', 'night')
  FALL_POSES.slice(0, 8).forEach((info, i) => climbCell(g, info.id, looks[(i + 3) % looks.length], 0.95, 92, 92, 1, ''))
}

// Hall of Flops cards: collected (animated) and silhouettes.
{
  const g = section('cards', 'Hall of Flops cards (150 × 180)', 'card')
  FALL_POSES.forEach((info) => {
    const c = makeCanvas(150, 180)
    cell(g, c, info.name, info.description)
    requestAnimationFrame(() => renderPoseCard(c, info.id, base, { animate: ANIMATE, t: FIXED_T ?? undefined }))
  })
}
{
  const g = section('silhouettes', 'Not collected yet (silhouette)', 'card')
  FALL_POSES.forEach((info) => {
    const c = makeCanvas(110, 132)
    cell(g, c, '???')
    requestAnimationFrame(() => renderPoseCard(c, info.id, looks[3], { silhouette: true }))
  })
}
{
  const g = section('cards-small', 'Small cards (96 × 110), other looks', 'card')
  FALL_POSES.forEach((info, i) => {
    const c = makeCanvas(96, 110)
    cell(g, c, '')
    requestAnimationFrame(() => renderPoseCard(c, info.id, looks[(i + 1) % looks.length], { animate: ANIMATE, t: FIXED_T ?? undefined }))
  })
}

// Filmstrips: each pose at 9 moments (pop-in at 0–0.3 s, then the loop).
{
  const g = section('strip', 'Filmstrips: t = 0, 0.1 … 0.8 s (1.5 px/unit)', 'sky', 'strip')
  FALL_POSES.forEach((info, i) => {
    const label = document.createElement('div')
    label.className = 'label'
    label.textContent = info.name
    g.appendChild(label)
    for (let k = 0; k <= 8; k++) {
      const t = k * 0.1
      const c = makeCanvas(100, 100)
      const look = looks[(i + 4) % looks.length]
      const ctx = c.getContext('2d')
      if (ctx) {
        const dpr = c.width / 100
        const s = 1.15
        ctx.fillStyle = k % 2 ? '#d7ecf4' : '#e3f2f7'
        ctx.fillRect(0, 0, c.width, c.height)
        ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * 50, dpr * (50 + 25 * s))
        drawClimber(ctx, {
          look,
          pose: fallPose(info.id, t),
          expression: fallPoseExpression(info.id, t),
          facing: 1,
          t,
          goat: { mood: fallPoseGoatMood(info.id), t, inBackpack: true, earFlap: 1 },
        })
      }
      g.appendChild(c)
    }
  })
}

if (ANIMATE) {
  const t0 = performance.now()
  const loop = (now: number) => {
    const t = (now - t0) / 1000
    for (const d of draws) d(t)
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
} else {
  for (const d of draws) d(0)
}

// ?perf=1: time a full card frame (background + rope + climber + goat) for every pose.
if (params.get('perf') === '1') {
  const c = makeCanvas(150, 180)
  document.body.appendChild(c)
  const t0 = performance.now()
  let n = 0
  for (let k = 0; k < 6; k++) {
    for (const info of FALL_POSES) {
      const stop = renderPoseCard(c, info.id, base, { t: 0.4 + k * 0.1 })
      stop()
      n++
    }
  }
  const ms = (performance.now() - t0) / n
  // The climber alone, at card scale.
  const ctx = c.getContext('2d')
  let m = 0
  const t1 = performance.now()
  if (ctx) {
    for (let k = 0; k < 6; k++) {
      for (const info of FALL_POSES) {
        ctx.setTransform(4, 0, 0, 4, 150, 250)
        const t = 0.4 + k * 0.1
        drawClimber(ctx, {
          look: base,
          pose: fallPose(info.id, t),
          expression: fallPoseExpression(info.id, t),
          facing: 1,
          t,
          goat: { mood: fallPoseGoatMood(info.id), t, inBackpack: true, earFlap: 1 },
        })
        m++
      }
    }
  }
  const climberMs = (performance.now() - t1) / Math.max(1, m)
  document.body.dataset.perf = `card ${ms.toFixed(3)} ms, climber+goat ${climberMs.toFixed(3)} ms`
  c.remove()
}

requestAnimationFrame(() => requestAnimationFrame(() => (document.body.dataset.ready = '1')))
