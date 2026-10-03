/**
 * Hall of Flops pose cards: the climber (in her own look) mid-whipper on a cozy sky card, held by
 * the rope, with the goat peeking out of her backpack. Not-yet-collected poses draw as a soft
 * paper silhouette (the shape is the clue). The DOM card around it carries the name + text.
 *
 * - The canvas is sized from its CSS size × devicePixelRatio (capped at TUNING.maxDpr).
 * - Every pose is drawn at the same scale (a collection should look like one), centred on its
 *   own loop's bounds; the occasional very wide pose shrinks to fit.
 * - animate: loops the pose (default 30 fps, paused while scrolled off-screen). Reduced motion
 *   or animate: false draws one still frame (the pose's most readable moment).
 * - stop() cancels the loop and observers. If the canvas leaves the page while animating, the
 *   loop stops by itself and gives the canvas memory back (width = height = 0). Screens still
 *   release their canvases on unmount as usual.
 */
import type { ClimberLook } from '../../storage/schema'
import { prefersReducedMotion } from '../../ui/dom'
import { TUNING } from '../tuning'
import { climberBounds, drawClimber } from './climber'
import {
  fallPose,
  fallPoseExpression,
  fallPoseGoatMood,
  fallPosePeriod,
  fallPoseStill,
} from './fallPosesAnim'
import type { GoatState } from './goat'
import { hash01, solvePose, type Pose } from './rig'

export interface PoseCardOpts {
  /** Loop the animation (default false: one still frame). */
  animate?: boolean
  /** Not collected yet: a soft paper silhouette, no colours or face (default false). */
  silhouette?: boolean
  /** The goat peeking out of the backpack (default true). */
  goat?: boolean
  /** Still frame time (s); default: the pose's most readable moment. */
  t?: number
  /** Frame-rate cap while animating (default 30). */
  fps?: number
}

interface Box {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** Every pose fits this many world units across at the shared card scale. */
const REF_SPAN = 66
/** Fraction of the card the reference span fills. */
const FILL = 0.84

const SKY_TOP = '#bfe2ef'
const SKY_BOTTOM = '#ffe7d2'
const HILL_FAR = '#ecc9b8'
const HILL_NEAR = '#e2b7a4'
const CLOUD = 'rgba(255,255,255,0.9)'
const STREAK = 'rgba(255,255,255,0.75)'
const ROPE = '#e8735a'
const ROPE_INK = '#a8483a'

const PAPER_TOP = '#f8ecdc'
const PAPER_BOTTOM = '#f1dfc8'
const PAPER_HILL = '#ead6bd'
const SIL_FILL = '#c7ab8e'

const boxCache = new Map<string, Box>()

function normBox(pose: Pose, withGoat: boolean): Box {
  const b = climberBounds(pose, 1, withGoat)
  return {
    minX: Math.min(b.minX, b.maxX),
    maxX: Math.max(b.minX, b.maxX),
    minY: Math.min(b.minY, b.maxY),
    maxY: Math.max(b.minY, b.maxY),
  }
}

/** Bounds of the whole loop (after the pop-in), so the figure never pumps or drifts. */
function loopBox(id: string, withGoat: boolean): Box {
  const key = `${id}|${withGoat ? 1 : 0}`
  const hit = boxCache.get(key)
  if (hit) return hit
  const period = fallPosePeriod(id)
  const t0 = 0.4
  let box = normBox(fallPose(id, fallPoseStill(id)), withGoat)
  for (let i = 0; i <= 24; i++) {
    const b = normBox(fallPose(id, t0 + (period * i) / 24), withGoat)
    box = {
      minX: Math.min(box.minX, b.minX),
      minY: Math.min(box.minY, b.minY),
      maxX: Math.max(box.maxX, b.maxX),
      maxY: Math.max(box.maxY, b.maxY),
    }
  }
  boxCache.set(key, box)
  return box
}

/** Size the backing store to the CSS size × DPR (capped). Null while the canvas has no size. */
function prepare(canvas: HTMLCanvasElement): { w: number; h: number; dpr: number } | null {
  let w = canvas.clientWidth
  let h = canvas.clientHeight
  if (!w || !h) {
    // Not laid out yet: fall back to an explicit CSS size or the width/height attributes.
    w = parseFloat(canvas.style.width) || 0
    h = parseFloat(canvas.style.height) || 0
  }
  if (!w || !h) return null
  const dpr = Math.min(TUNING.maxDpr, Math.max(1, window.devicePixelRatio || 1))
  const bw = Math.max(1, Math.round(w * dpr))
  const bh = Math.max(1, Math.round(h * dpr))
  if (canvas.width !== bw) canvas.width = bw
  if (canvas.height !== bh) canvas.height = bh
  return { w, h, dpr }
}

// ---------------------------------------------------------------------------------------------
// Background (its seeded layout is worked out once per card, so a frame allocates nothing)

interface HillRow {
  /** Height fractions (× amp) of the left edge, then peak/valley pairs for each of 4 humps. */
  start: number
  peaks: number[]
  ends: number[]
}

interface Scene {
  silhouette: boolean
  sky: CanvasGradient | null
  skyH: number
  sunX: number
  clouds: { x: number; y: number; s: number; speed: number }[]
  far: HillRow
  near: HillRow
  streaks: { side: number; off: number; len: number; speed: number; y0: number }[]
}

function hillRow(seed: string): HillRow {
  const peaks: number[] = []
  const ends: number[] = []
  for (let i = 0; i < 4; i++) {
    peaks.push(0.55 + 0.45 * hash01(`${seed}p${i}`))
    ends.push(0.2 + 0.4 * hash01(`${seed}v${i}`))
  }
  return { start: 0.3 + 0.5 * hash01(`${seed}a`), peaks, ends }
}

function makeScene(poseId: string, silhouette: boolean): Scene {
  const seed = `card:${poseId}`
  const r = (k: string) => hash01(`${seed}:${k}`)
  return {
    silhouette,
    sky: null,
    skyH: 0,
    sunX: 0.12 + 0.76 * r('sun'),
    clouds: [0, 1].map((i) => ({
      x: 0.15 + 0.7 * r(`cx${i}`),
      y: 0.22 + 0.36 * r(`cy${i}`),
      s: 0.05 + 0.03 * r(`cs${i}`),
      speed: i ? 2.4 : 4,
    })),
    far: hillRow(`${seed}:far`),
    near: hillRow(`${seed}:near`),
    streaks: [0, 1, 2, 3, 4, 5].map((i) => ({
      side: i % 2 ? 1 : -1,
      off: 0.22 + 0.16 * r(`sx${i}`),
      len: 0.1 + 0.08 * r(`sl${i}`),
      speed: 1.6 + 0.8 * r(`sv${i}`),
      y0: r(`sy${i}`),
    })),
  }
}

function puff(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.moveTo(x + r, y)
  ctx.arc(x, y, r, 0, Math.PI * 2)
}

function cloud(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.beginPath()
  puff(ctx, x, y, s)
  puff(ctx, x + s * 1.05, y + s * 0.25, s * 0.78)
  puff(ctx, x - s * 1.0, y + s * 0.3, s * 0.68)
  puff(ctx, x + s * 0.2, y + s * 0.45, s * 0.8)
  ctx.fill()
}

/** Paper-cut hills along the bottom (seeded, so each card's view is a little different). */
function hills(ctx: CanvasRenderingContext2D, w: number, h: number, row: HillRow, base: number, amp: number, fill: string): void {
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.moveTo(0, h)
  ctx.lineTo(0, h - base - amp * row.start)
  const n = row.peaks.length
  for (let i = 0; i < n; i++) {
    const x0 = (w * i) / n
    const x1 = (w * (i + 1)) / n
    const peak = h - base - amp * row.peaks[i]
    ctx.quadraticCurveTo((x0 + x1) / 2, peak - amp * 0.35, x1, h - base - amp * row.ends[i])
  }
  ctx.lineTo(w, h)
  ctx.closePath()
  ctx.fill()
}

function skyGradient(ctx: CanvasRenderingContext2D, scene: Scene, h: number): CanvasGradient {
  if (!scene.sky || scene.skyH !== h) {
    const g = ctx.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, scene.silhouette ? PAPER_TOP : SKY_TOP)
    g.addColorStop(1, scene.silhouette ? PAPER_BOTTOM : SKY_BOTTOM)
    scene.sky = g
    scene.skyH = h
  }
  return scene.sky
}

/** The sky card: gradient, sun, drifting clouds, two rows of hills far below. */
function background(ctx: CanvasRenderingContext2D, scene: Scene, w: number, h: number, t: number): void {
  ctx.fillStyle = skyGradient(ctx, scene, h)
  ctx.fillRect(0, 0, w, h)
  const u = Math.min(w, h)
  ctx.fillStyle = 'rgba(255,244,214,0.85)'
  ctx.beginPath()
  ctx.arc(w * scene.sunX, h * 0.16, u * 0.09, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = CLOUD
  for (const c of scene.clouds) {
    const span = w * 1.3
    const x = ((((w * c.x + t * c.speed) % span) + span) % span) - w * 0.15
    cloud(ctx, x, h * c.y, u * c.s)
  }
  hills(ctx, w, h, scene.far, h * 0.1, h * 0.12, HILL_FAR)
  hills(ctx, w, h, scene.near, 0, h * 0.09, HILL_NEAR)
}

/**
 * The paper card behind a silhouette. Drawn with 'destination-over' (behind the figure), so the
 * layers go front to back: the hill first, then the sky.
 */
function paperBehind(ctx: CanvasRenderingContext2D, scene: Scene, w: number, h: number): void {
  hills(ctx, w, h, scene.far, h * 0.04, h * 0.1, PAPER_HILL)
  ctx.fillStyle = skyGradient(ctx, scene, h)
  ctx.fillRect(0, 0, w, h)
}

/** Speed streaks rushing upward past her (the world rises as she falls). */
function streaks(ctx: CanvasRenderingContext2D, scene: Scene, w: number, h: number, t: number): void {
  ctx.strokeStyle = STREAK
  ctx.lineCap = 'round'
  const u = Math.min(w, h)
  ctx.lineWidth = Math.max(1.2, u * 0.012)
  ctx.beginPath()
  for (const s of scene.streaks) {
    const x = w / 2 + s.side * u * s.off
    const len = u * s.len
    const span = h + len
    const y = ((((h * s.y0 - t * h * s.speed) % span) + span) % span) - len * 0.5
    ctx.moveTo(x, y)
    ctx.lineTo(x, y + len)
  }
  ctx.stroke()
}

// ---------------------------------------------------------------------------------------------

/**
 * Draw `poseId` on `canvas` as a Hall of Flops card. Returns stop() (cancels the animation loop
 * and observers; safe to call more than once).
 */
export function renderPoseCard(
  canvas: HTMLCanvasElement,
  poseId: string,
  look: ClimberLook,
  opts: PoseCardOpts = {},
): () => void {
  const silhouette = !!opts.silhouette
  const withGoat = opts.goat !== false
  const box = loopBox(poseId, withGoat)
  const scene = makeScene(poseId, silhouette)
  const goatMood = fallPoseGoatMood(poseId)
  const animate = !!opts.animate && !prefersReducedMotion()
  const stillT = opts.t ?? fallPoseStill(poseId)

  const frame = (t: number) => {
    const size = prepare(canvas)
    const ctx = size ? canvas.getContext('2d') : null
    if (!size || !ctx) return
    const { w, h, dpr } = size
    const pose = fallPose(poseId, t)
    const expression = fallPoseExpression(poseId, t)
    const bw = box.maxX - box.minX
    const bh = box.maxY - box.minY
    const s = Math.min((w * FILL) / Math.max(REF_SPAN, bw), (h * FILL) / Math.max(REF_SPAN, bh))
    // Centre the loop's bounds, nudged a touch low so the rope has room above her.
    const ox = w / 2 - ((box.minX + box.maxX) / 2) * s
    const oy = h * 0.53 - ((box.minY + box.maxY) / 2) * s
    const goat: GoatState | null = withGoat ? { mood: goatMood, t, inBackpack: true, earFlap: 1 } : null

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalCompositeOperation = 'source-over'
    ctx.globalAlpha = 1
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    if (silhouette) {
      // The figure, flattened to one paper colour, then the card slid in behind it.
      ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy)
      drawClimber(ctx, { look, pose, expression, facing: 1, t, goat })
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.globalCompositeOperation = 'source-in'
      ctx.fillStyle = SIL_FILL
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.globalCompositeOperation = 'destination-over'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      paperBehind(ctx, scene, w, h)
      ctx.globalCompositeOperation = 'source-over'
      return
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    background(ctx, scene, w, h, animate ? t : 0)
    streaks(ctx, scene, w, h, animate ? t : 0.37)

    // The rope: from above the card down to her harness (it's why falling is safe).
    const sk = solvePose(pose)
    const hx = ox + sk.hip.x * pose.squashX * s
    const hy = oy + sk.hip.y * pose.squashY * s
    const topX = w / 2 + (hx - w / 2) * 0.35
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(topX, -4)
    ctx.quadraticCurveTo(topX + (hx - topX) * 0.3 + w * 0.02, (hy - 4) * 0.55, hx, hy)
    ctx.strokeStyle = ROPE_INK
    ctx.lineWidth = Math.max(2.4, s * 1.9)
    ctx.stroke()
    ctx.strokeStyle = ROPE
    ctx.lineWidth = Math.max(1.4, s * 1.2)
    ctx.stroke()

    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy)
    drawClimber(ctx, { look, pose, expression, facing: 1, t, goat })
    ctx.setTransform(1, 0, 0, 1, 0, 0)
  }

  let stopped = false
  let raf = 0
  let seen = false
  let visible = true
  let resize: ResizeObserver | null = null
  let io: IntersectionObserver | null = null

  const stop = () => {
    if (stopped) return
    stopped = true
    cancelAnimationFrame(raf)
    resize?.disconnect()
    io?.disconnect()
  }

  if (!animate) {
    frame(stillT)
    // Repaint when the card is laid out or changes size (rotation, first layout).
    if (typeof ResizeObserver !== 'undefined') {
      let lastW = canvas.clientWidth
      let lastH = canvas.clientHeight
      resize = new ResizeObserver(() => {
        if (stopped) return
        const w = canvas.clientWidth
        const h = canvas.clientHeight
        if (w === lastW && h === lastH && canvas.width > 0) return
        lastW = w
        lastH = h
        frame(stillT)
      })
      resize.observe(canvas)
    }
    return stop
  }

  if (typeof IntersectionObserver !== 'undefined') {
    io = new IntersectionObserver((entries) => {
      for (const e of entries) visible = e.isIntersecting
    })
    io.observe(canvas)
  }
  const minStep = 1000 / Math.max(1, opts.fps ?? 30) - 2
  let start = -1
  let last = -Infinity
  const tick = (ms: number) => {
    if (stopped) return
    if (canvas.isConnected) seen = true
    else if (seen) {
      stop()
      canvas.width = 0
      canvas.height = 0
      return
    }
    if (start < 0) start = ms
    if (visible && ms - last >= minStep) {
      last = ms
      frame((ms - start) / 1000)
    }
    raf = requestAnimationFrame(tick)
  }
  frame(0)
  raf = requestAnimationFrame(tick)
  return stop
}
