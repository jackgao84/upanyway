/**
 * Things drawn over the world that belong to the climb rather than the mountain: the slingshot band,
 * the dotted preview arc, chalk lines from failed leaps, the ghost beta arc, the rope, and the
 * end-of-pitch Beta Map. All in CSS px (ctx transform = DPR scale) using the frame's View, except the
 * rope, which is drawn in world units (art coords) so it sits in the scene.
 */
import { mix, rgba } from '../art/rig'
import type { Camera } from '../camera'
import type { Aim, ClimbSession } from '../engine'
import { maxDragPxFor } from '../input'
import { TUNING } from '../tuning'
import { clamp01, easeOutCubic, View } from './effects'
import type { ZonePalette } from './palette'

/** Her centre above the feet (world units) — where the band attaches. */
export const CLIMBER_CENTER = 22
/** Harness height above the feet (world units). */
export const HARNESS = 15

// ---------------------------------------------------------------------------------------------
// Slingshot band

const BAND_LOW = '#7fd0ae'
const BAND_MID = '#f5b83d'
const BAND_HIGH = '#ee6f57'

function bandColor(power: number): string {
  const p = Math.round(clamp01(power) * 20) / 20
  return p < 0.5 ? mix(BAND_LOW, BAND_MID, p * 2) : mix(BAND_MID, BAND_HIGH, (p - 0.5) * 2)
}

/**
 * The stretchy band from her middle to where the finger pulls. Hidden while a release would cancel.
 * `cx, cy` = her centre in CSS px.
 */
export function drawBand(ctx: CanvasRenderingContext2D, view: View, cx: number, cy: number, aim: Aim, t: number): void {
  if (aim.cancel) return
  const len = Math.hypot(aim.dragX, aim.dragY)
  if (len < 1) return
  const maxDrag = maxDragPxFor(view.w, view.h)
  const shown = Math.min(len, maxDrag * 1.08)
  const ux = aim.dragX / len
  const uy = aim.dragY / len
  const px = cx + ux * shown
  const py = cy + uy * shown
  const nx = -uy
  const ny = ux
  const power = aim.power
  const color = bandColor(power)
  const outline = mix(color, '#2a1620', 0.55)
  // Thinner as it stretches.
  const thick = 5.2 - 2.4 * power
  const spread = 7 + 2 * power
  view.applyScreen(ctx)
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  // Two strands, slightly bowed, from either side of her to the pouch.
  for (let pass = 0; pass < 2; pass++) {
    ctx.strokeStyle = pass === 0 ? outline : color
    ctx.lineWidth = pass === 0 ? thick + 2.4 : thick
    for (let side = -1; side <= 1; side += 2) {
      const sx = cx + nx * spread * side
      const sy = cy + ny * spread * side
      const ex = px + nx * 4 * side
      const ey = py + ny * 4 * side
      const bow = (1 - power) * 6 * side
      ctx.beginPath()
      ctx.moveTo(sx, sy)
      ctx.quadraticCurveTo((sx + ex) / 2 + nx * bow, (sy + ey) / 2 + ny * bow, ex, ey)
      ctx.stroke()
    }
  }
  // The pouch: a rounded pad across the pull.
  const pulse = power > 0.97 ? 1 + 0.08 * Math.sin(t * 16) : 1
  const pw = 9 * pulse
  const ph = 5.5 * pulse
  ctx.save()
  ctx.translate(px, py)
  ctx.rotate(Math.atan2(uy, ux))
  ctx.fillStyle = mix(color, '#ffffff', 0.25)
  ctx.strokeStyle = outline
  ctx.lineWidth = 1.6
  ctx.beginPath()
  ctx.ellipse(0, 0, ph, pw, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  ctx.restore()
  // Anchors on her.
  ctx.fillStyle = outline
  for (let side = -1; side <= 1; side += 2) {
    ctx.beginPath()
    ctx.arc(cx + nx * spread * side, cy + ny * spread * side, 2.2, 0, Math.PI * 2)
    ctx.fill()
  }
}

// ---------------------------------------------------------------------------------------------
// Dotted arcs

/** Walk a flattened world path, calling `dot` every `spacing` screen px. Returns the count. */
function walkDots(view: View, path: number[], spacing: number, dot: (x: number, y: number, i: number, total: number) => void): void {
  const n = path.length >> 1
  if (n < 2) return
  // Total screen length first (so sizes can fade along it).
  let total = 0
  for (let i = 1; i < n; i++) {
    total += Math.hypot((path[i * 2] - path[i * 2 - 2]) * view.s, (path[i * 2 + 1] - path[i * 2 - 1]) * view.s)
  }
  // Start clear of her body; short arcs (Big Leaps) get closer dots so a few always show.
  const skip = Math.min(20 * view.s, total * 0.25)
  spacing = Math.min(spacing, Math.max(7, (total - skip) / 5))
  const count = Math.max(1, Math.floor((total - skip) / spacing) + 1)
  let next = Math.max(spacing * 0.6, skip)
  let idx = 0
  let acc = 0
  for (let i = 1; i < n && idx < count; i++) {
    const x0 = view.x(path[i * 2 - 2])
    const y0 = view.y(path[i * 2 - 1])
    const x1 = view.x(path[i * 2])
    const y1 = view.y(path[i * 2 + 1])
    const seg = Math.hypot(x1 - x0, y1 - y0)
    while (acc + seg >= next && idx < count) {
      const f = seg > 0 ? (next - acc) / seg : 0
      dot(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, idx, count)
      idx++
      next += spacing
    }
    acc += seg
  }
}

let previewCtx: CanvasRenderingContext2D | null = null
let previewInk = '#2a1620'
let previewFill = '#ffffff'

function previewDot(x: number, y: number, i: number, total: number): void {
  const ctx = previewCtx
  if (!ctx) return
  const f = total > 1 ? i / (total - 1) : 0
  const r = 5.4 - 3.1 * f
  ctx.globalAlpha = 0.95 - 0.62 * f
  ctx.beginPath()
  ctx.arc(x, y, r + 1.4, 0, Math.PI * 2)
  ctx.fillStyle = previewInk
  ctx.fill()
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = previewFill
  ctx.fill()
}

/** The dotted preview: dots get smaller and fainter along the arc. No landing marker. */
export function drawPreview(ctx: CanvasRenderingContext2D, view: View, path: number[], palette: ZonePalette): void {
  view.applyScreen(ctx)
  previewCtx = ctx
  previewInk = rgba(palette.ink, 0.45)
  previewFill = palette.night ? '#fff7e0' : '#ffffff'
  walkDots(view, path, 15, previewDot)
  previewCtx = null
  ctx.globalAlpha = 1
}

let ghostAlpha = 0.5
let ghostCtx: CanvasRenderingContext2D | null = null

function ghostDot(x: number, y: number, i: number): void {
  const ctx = ghostCtx
  if (!ctx) return
  const a = ghostAlpha * (i % 2 === 0 ? 1 : 0.8)
  // A soft halo, then the dot (no per-frame shadow blur).
  ctx.globalAlpha = a * 0.3
  ctx.fillStyle = '#dfe8ff'
  ctx.beginPath()
  ctx.arc(x, y, 6.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.globalAlpha = a
  ctx.fillStyle = '#f7f9ff'
  ctx.beginPath()
  ctx.arc(x, y, 3, 0, Math.PI * 2)
  ctx.fill()
}

/**
 * The ghost beta: a faint, pulsing, dotted ghost-white arc of a leap that works. On wind pitches it
 * glows brightest in the calm (when that leap works) and dims during the gusts.
 */
export function drawGhost(ctx: CanvasRenderingContext2D, view: View, path: number[], session: ClimbSession, t: number): void {
  view.applyScreen(ctx)
  const pulse = 0.5 + 0.5 * Math.sin(t * 3.2)
  let calm = 1
  const zones = session.level.wind
  if (zones && zones.length) {
    const z = zones[0]
    const phase = (((session.t - z.offset) % z.period) + z.period) % z.period
    calm = phase < z.gust + 0.15 ? 0.35 : 1
  }
  ghostAlpha = (0.38 + 0.4 * pulse) * calm
  ghostCtx = ctx
  walkDots(view, path, 11, ghostDot)
  ghostCtx = null
  ctx.globalAlpha = 1
}

// ---------------------------------------------------------------------------------------------
// Chalk

function strokeArc(ctx: CanvasRenderingContext2D, view: View, arc: number[], upto = 1): void {
  const n = arc.length >> 1
  if (n < 2) return
  const last = Math.max(1, Math.floor((n - 1) * clamp01(upto)))
  ctx.beginPath()
  ctx.moveTo(view.x(arc[0]), view.y(arc[1]))
  for (let i = 1; i <= last; i++) ctx.lineTo(view.x(arc[i * 2]), view.y(arc[i * 2 + 1]))
  // Finish the partial segment smoothly.
  if (upto < 1 && last < n - 1) {
    const f = (n - 1) * upto - last
    const ax = arc[last * 2]
    const ay = arc[last * 2 + 1]
    ctx.lineTo(view.x(ax + (arc[last * 2 + 2] - ax) * f), view.y(ay + (arc[last * 2 + 3] - ay) * f))
  }
  ctx.stroke()
}

/** One chalk line: a soft powdery stroke under a thin bright core. */
function chalkLine(ctx: CanvasRenderingContext2D, view: View, arc: number[], alpha: number, color: string, upto = 1): void {
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  // A faint shadow line keeps white chalk readable on pale rock.
  ctx.strokeStyle = CHALK_SHADOW
  ctx.globalAlpha = alpha * 0.35
  ctx.lineWidth = 3.4
  ctx.save()
  ctx.translate(0.8, 1.2)
  strokeArc(ctx, view, arc, upto)
  ctx.restore()
  ctx.strokeStyle = color
  ctx.globalAlpha = alpha * 0.3
  ctx.lineWidth = 7
  strokeArc(ctx, view, arc, upto)
  ctx.globalAlpha = alpha
  ctx.lineWidth = 2.6
  strokeArc(ctx, view, arc, upto)
}

const CHALK_SHADOW = '#5a4050'
const CHALK_ALPHA = [0.78, 0.46, 0.26, 0.14, 0.08]

/** The last TUNING.chalkVisible failed arcs: newest brightest, older fainter. */
export function drawChalk(ctx: CanvasRenderingContext2D, view: View, session: ClimbSession, palette: ZonePalette): void {
  const list = session.chalk
  if (list.length === 0) return
  view.applyScreen(ctx)
  const shown = Math.min(TUNING.chalkVisible, list.length)
  for (let i = shown - 1; i >= 0; i--) {
    const c = list[list.length - 1 - i]
    const age = session.t - c.at
    const fadeIn = clamp01(age / 0.35)
    chalkLine(ctx, view, c.arc, (CHALK_ALPHA[i] ?? 0.08) * (0.4 + 0.6 * fadeIn), palette.chalk)
  }
  ctx.globalAlpha = 1
}

// ---------------------------------------------------------------------------------------------
// The rope

/**
 * The rope from the last camp's anchor to her harness: a soft hanging curve, pulled straight and
 * taut while it is catching her. Drawn in world units (art coords) — call with the world transform.
 */
export function drawRope(ctx: CanvasRenderingContext2D, session: ClimbSession, palette: ZonePalette, view: View): void {
  const camp = session.lastCamp
  const r = session.rope
  const sx = camp.standX ?? camp.x + camp.w / 2
  const ax = r ? r.anchorX : sx
  const ay = r ? r.anchorY : camp.y + 70
  const hx = session.body.x
  const hy = session.body.y + HARNESS
  const dx = hx - ax
  const dy = hy - ay
  const d = Math.hypot(dx, dy)
  if (d < 2) return
  view.applyWorld(ctx)
  const taut = session.phase === 'roped'
  // Slack hangs down: more when she's close, a gentle belly when far.
  const lw = Math.max(1.7, 1.2 / Math.max(0.3, view.zoom))
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = mix(palette.rope, '#2a1620', 0.5)
  ctx.lineWidth = lw + 1.2
  ctx.beginPath()
  ctx.moveTo(ax, -ay)
  if (taut) ctx.lineTo(hx, -hy)
  else {
    // Slack rope: a soft belly under the straight line. Close to the anchor (standing at camp) it
    // drapes in a loose C behind her back instead of running straight up through her.
    const near = Math.max(0, 1 - d / 170)
    const ux = dx / d
    const uy = dy / d
    const k = d * 0.3 * (1 - near)
    const drop = Math.min(40, 10 + d * 0.1) * (1 - near)
    const side = -session.facing * 40 * near
    ctx.bezierCurveTo(ax + ux * k + side * 0.9, -(ay + uy * k - drop - 8 * near), hx - ux * k + side * 1.15, -(hy - uy * k - drop + 6 * near), hx, -hy)
  }
  ctx.stroke()
  ctx.strokeStyle = palette.rope
  ctx.lineWidth = lw
  ctx.stroke()
  // The twist: a light dashed thread along the rope.
  ctx.strokeStyle = palette.ropeLight
  ctx.lineWidth = lw * 0.42
  ctx.setLineDash([2.2, 3.4])
  ctx.stroke()
  ctx.setLineDash([])
}

// ---------------------------------------------------------------------------------------------
// Beta Map

const BETA_ROUTE = '#ffd36b'

/**
 * The end-of-pitch Beta Map: every failed arc of the run as faint chalk, drawn in one after another,
 * then the route that worked traced brightly on top, landing by landing. `t` = seconds since the
 * map opened. ctx in CSS px (DPR transform); pass the camera framing the pitch.
 */
export function drawBetaMap(ctx: CanvasRenderingContext2D, camera: Camera, failedArcs: number[][], routeArcs: number[][], t: number): void {
  const view = new View().from(camera)
  view.applyScreen(ctx)
  const nf = failedArcs.length
  const stagger = nf > 0 ? Math.min(0.08, 1.4 / nf) : 0
  const failDone = nf > 0 ? (nf - 1) * stagger + 0.45 : 0
  for (let i = 0; i < nf; i++) {
    const k = (t - i * stagger) / 0.45
    if (k <= 0) break
    chalkLine(ctx, view, failedArcs[i], 0.26, '#ffffff', easeOutCubic(k))
  }
  // The send: bright, landing by landing.
  const start = Math.min(failDone, 1.6) + 0.15
  const per = routeArcs.length > 0 ? Math.min(0.32, 2.6 / routeArcs.length) : 0
  for (let i = 0; i < routeArcs.length; i++) {
    const k = (t - start - i * per) / per
    if (k <= 0) break
    const arc = routeArcs[i]
    const upto = easeOutCubic(Math.min(1, k))
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.globalAlpha = 0.9
    ctx.strokeStyle = 'rgba(80,40,30,0.55)'
    ctx.lineWidth = 7
    strokeArc(ctx, view, arc, upto)
    ctx.strokeStyle = BETA_ROUTE
    ctx.lineWidth = 4.2
    strokeArc(ctx, view, arc, upto)
    ctx.strokeStyle = '#fffbe8'
    ctx.lineWidth = 1.4
    strokeArc(ctx, view, arc, upto)
    // A little star where each leap landed.
    if (k >= 1 && arc.length >= 2) {
      const lx = view.x(arc[arc.length - 2])
      const ly = view.y(arc[arc.length - 1])
      const pop = Math.min(1, (k - 1) * 3)
      const r = 5.5 * (pop < 1 ? 0.4 + 0.9 * pop : 1)
      ctx.globalAlpha = 1
      ctx.fillStyle = BETA_ROUTE
      ctx.strokeStyle = 'rgba(80,40,30,0.7)'
      ctx.lineWidth = 1.2
      star(ctx, lx, ly, r)
      ctx.fill()
      ctx.stroke()
    }
  }
  ctx.globalAlpha = 1
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const rr = i % 2 === 0 ? r : r * 0.48
    if (i === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
    else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
  }
  ctx.closePath()
}
