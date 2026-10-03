/**
 * Small <canvas> previews of the climber and the goat for DOM screens (designer, camp, cards).
 * Canvases are sized for devicePixelRatio (capped at TUNING.maxDpr), the figure is centred and
 * scaled to fit, and the background stays transparent.
 */
import { defaultLook, type ClimberLook } from '../../storage/schema'
import { TUNING } from '../tuning'
import { prefersReducedMotion } from '../../ui/dom'
import { climberBounds, drawClimber, drawPackWithGoat, type Expression } from './climber'
import { drawGoat, goatBounds, type GoatState } from './goat'
import { idle } from './poses'
import type { Pose } from './rig'

interface Box {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface ClimberPreviewOpts {
  expression?: Expression
  pose?: Pose
  goat?: GoatState | null
  t?: number
  facing?: 1 | -1
  /** Empty space around the figure as a fraction of the canvas (default 0.06). */
  padding?: number
}

export interface GoatPreviewOpts {
  /** In-backpack goats are shown peeking out of this look's pack (default: the default look's). */
  look?: ClimberLook
  padding?: number
}

/** Size the backing store for the CSS size × DPR; returns the CSS size. */
function prepare(canvas: HTMLCanvasElement): { w: number; h: number; dpr: number } | null {
  let w = canvas.clientWidth
  let h = canvas.clientHeight
  if (!w || !h) {
    w = Number(canvas.dataset.cssW) || canvas.width
    h = Number(canvas.dataset.cssH) || canvas.height
    if (!canvas.style.width) canvas.style.width = `${w}px`
    if (!canvas.style.height) canvas.style.height = `${h}px`
  }
  if (!w || !h) return null
  canvas.dataset.cssW = String(w)
  canvas.dataset.cssH = String(h)
  const dpr = Math.min(TUNING.maxDpr, Math.max(1, window.devicePixelRatio || 1))
  const bw = Math.round(w * dpr)
  const bh = Math.round(h * dpr)
  if (canvas.width !== bw) canvas.width = bw
  if (canvas.height !== bh) canvas.height = bh
  return { w, h, dpr }
}

/** Clear, then set a transform that fits `box` (local units) into the canvas, centred. */
function fit(canvas: HTMLCanvasElement, box: Box, padding: number): CanvasRenderingContext2D | null {
  const size = prepare(canvas)
  const ctx = canvas.getContext('2d')
  if (!size || !ctx) return null
  const { w, h, dpr } = size
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  const bw = box.maxX - box.minX
  const bh = box.maxY - box.minY
  const avail = 1 - padding * 2
  const s = Math.min((w * avail) / bw, (h * avail) / bh)
  const cx = (box.minX + box.maxX) / 2
  const cy = (box.minY + box.maxY) / 2
  ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (w / 2 - cx * s), dpr * (h / 2 - cy * s))
  return ctx
}

function union(a: Box, b: Box): Box {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  }
}

/** Draw the climber once. */
export function renderClimberPreview(canvas: HTMLCanvasElement, look: ClimberLook, opts: ClimberPreviewOpts = {}): void {
  const t = opts.t ?? 0
  const p = opts.pose ?? idle(t)
  const facing = opts.facing ?? 1
  const goat = opts.goat === undefined ? null : opts.goat
  const box = climberBounds(p, facing, !!goat)
  const ctx = fit(canvas, box, opts.padding ?? 0.06)
  if (!ctx) return
  drawClimber(ctx, { look, pose: p, expression: opts.expression ?? 'happy', facing, t, goat })
}

/** Draw the goat once (standing, or peeking out of a backpack). */
export function renderGoatPreview(canvas: HTMLCanvasElement, state: GoatState, opts: GoatPreviewOpts = {}): void {
  const box = goatPreviewBox(state)
  const ctx = fit(canvas, box, opts.padding ?? 0.06)
  if (!ctx) return
  drawGoatScene(ctx, state, opts.look)
}

function goatPreviewBox(state: GoatState): Box {
  if (!state.inBackpack) return goatBounds(state)
  // Pack is 19 × 17 with the rim at y = −17; the goat rises above it.
  const g = goatBounds({ inBackpack: true, facing: state.facing })
  return { minX: Math.min(-11, g.minX), minY: g.minY - 17, maxX: Math.max(11, g.maxX), maxY: 1.8 }
}

function drawGoatScene(ctx: CanvasRenderingContext2D, state: GoatState, look?: ClimberLook): void {
  if (state.inBackpack) drawPackWithGoat(ctx, look ?? DEFAULT_PACK_LOOK, state)
  else drawGoat(ctx, state)
}

const DEFAULT_PACK_LOOK: ClimberLook = defaultLook()

export interface AnimatedClimberOpts {
  expression?: Expression | ((t: number) => Expression)
  /** A fixed pose or a pose over time (default: idle breathing). */
  pose?: Pose | ((t: number) => Pose)
  goat?: GoatState | null | ((t: number) => GoatState | null)
  facing?: 1 | -1
  padding?: number
  /** Playback speed (1 = real time). */
  speed?: number
}

/**
 * Animate a climber preview with requestAnimationFrame. Returns stop(); it also stops by itself
 * once the canvas leaves the document. With reduced motion it draws one still frame.
 */
export function animateClimberPreview(
  canvas: HTMLCanvasElement,
  look: ClimberLook,
  opts: AnimatedClimberOpts = {},
): () => void {
  const poseAt = (t: number): Pose =>
    typeof opts.pose === 'function' ? opts.pose(t) : opts.pose ?? idle(t)
  const goatAt = (t: number): GoatState | null => {
    const g = typeof opts.goat === 'function' ? opts.goat(t) : opts.goat
    return g ? { ...g, t } : null
  }
  const exprAt = (t: number): Expression =>
    typeof opts.expression === 'function' ? opts.expression(t) : opts.expression ?? 'happy'
  const facing = opts.facing ?? 1
  // A steady frame: the union of bounds over a few seconds, so the figure doesn't pump in size.
  let box = climberBounds(poseAt(0), facing, !!goatAt(0))
  for (let t = 0.1; t <= 3; t += 0.1) box = union(box, climberBounds(poseAt(t), facing, !!goatAt(t)))
  const padding = opts.padding ?? 0.06
  const speed = opts.speed ?? 1

  const frame = (t: number) => {
    const ctx = fit(canvas, box, padding)
    if (!ctx) return
    drawClimber(ctx, { look, pose: poseAt(t), expression: exprAt(t), facing, t, goat: goatAt(t) })
  }

  if (prefersReducedMotion()) {
    frame(0)
    return () => {}
  }
  let raf = 0
  let stopped = false
  let start = -1
  let seen = false
  const tick = (now: number) => {
    if (stopped) return
    if (canvas.isConnected) seen = true
    else if (seen) {
      stopped = true
      return
    }
    if (start < 0) start = now
    frame(((now - start) / 1000) * speed)
    raf = requestAnimationFrame(tick)
  }
  frame(0)
  raf = requestAnimationFrame(tick)
  return () => {
    stopped = true
    cancelAnimationFrame(raf)
  }
}

/** Animate a goat preview (its blinks, trembles and flaps). Returns stop(). */
export function animateGoatPreview(
  canvas: HTMLCanvasElement,
  state: GoatState | ((t: number) => GoatState),
  opts: GoatPreviewOpts & { speed?: number } = {},
): () => void {
  const at = (t: number): GoatState => (typeof state === 'function' ? state(t) : { ...state, t })
  const box = goatPreviewBox(at(0))
  const padding = opts.padding ?? 0.06
  const speed = opts.speed ?? 1
  const frame = (t: number) => {
    const ctx = fit(canvas, box, padding)
    if (!ctx) return
    drawGoatScene(ctx, at(t), opts.look)
  }
  if (prefersReducedMotion()) {
    frame(0)
    return () => {}
  }
  let raf = 0
  let stopped = false
  let start = -1
  let seen = false
  const tick = (now: number) => {
    if (stopped) return
    if (canvas.isConnected) seen = true
    else if (seen) {
      stopped = true
      return
    }
    if (start < 0) start = now
    frame(((now - start) / 1000) * speed)
    raf = requestAnimationFrame(tick)
  }
  frame(0)
  raf = requestAnimationFrame(tick)
  return () => {
    stopped = true
    cancelAnimationFrame(raf)
  }
}
