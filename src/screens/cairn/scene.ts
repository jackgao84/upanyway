/**
 * The cairn picture: her stones stacked on a grassy hilltop, sky and far mountains behind.
 *
 * - Layout comes from layout.ts (pure, deterministic: stone i always sits in the same spot). Looks
 *   come from game/art/stones.ts (seeded from the id only).
 * - The frame has a fixed height; a tall cairn scrolls vertically inside it (native scrolling, so
 *   momentum and VoiceOver just work). The canvas sits behind an invisible scroll layer and is
 *   repainted for the scroll position; the sky stays put and the far mountains move slower
 *   (parallax).
 * - Every stone has an invisible button over it (keyboard, VoiceOver, tests). Finger taps are
 *   hit-tested against the stone shapes with a generous radius, so small stones are easy to tap.
 * - New stones drop in one after another with a squash, a puff of dust and a clack; waiting stones
 *   that just went on hop over from beside the pile. Reduce Motion: no movement, a soft ring
 *   marks the new stones instead.
 */
import { animate, releaseCanvas, sizeCanvas, type CanvasSize } from '../../app/context'
import { audio } from '../../audio/audio'
import { sfx } from '../../audio/sfx'
import { drawStone, paintGlow, stoneLook } from '../../game/art/stones'
import { createRng } from '../../model/rng'
import { h, prefersReducedMotion } from '../../ui/dom'
import { hillY, layoutCairn, layoutWaiting, type PlacedStone, type StoneInput } from './layout'

export interface SceneStone extends StoneInput {
  /** What a screen reader says for this stone's button. */
  label: string
}

export interface CairnSceneOpts {
  /** Stones on the cairn, in cairn order. */
  placed: SceneStone[]
  /** Stones waiting beside the pile (over a daily cap), oldest first. */
  waiting: SceneStone[]
  /** Brand-new stones to drop in (on the pile, or onto the waiting spot if they wait), in order. */
  dropIds?: string[]
  /** Waiting stones that just went on: they hop over from where they waited. */
  hopIds?: string[]
  /** The waiting list as it was before those went on (for where they hop from). */
  waitingBefore?: SceneStone[]
  ariaLabel: string
  onTap: (id: string) => void
  /** A stone finished landing (sound and dust are the scene's own). */
  onLanded?: (id: string, where: 'pile' | 'waiting') => void
  /** Every new stone has landed (called at once when there is nothing to animate). */
  onSettled?: () => void
}

export interface CairnScene {
  el: HTMLElement
  destroy(): void
}

/** Pixels per cairn unit, the scroll height, and where the hilltop sits. */
export interface SceneGeometry {
  s: number
  /** Track height (px): ≥ the frame height. */
  trackH: number
  /** Track y (px) of the hilltop (cairn y = 0). */
  groundY: number
  /** Visible hill below the hilltop (px). */
  groundPx: number
}

/** Room above the top stone (cairn units): sky, and somewhere for new stones to fall from. */
const HEADROOM = 64

/**
 * Fit the cairn into a frame: big and cosy while it is small, never so small that stones get
 * fiddly to tap; when it is taller than the frame, the frame scrolls.
 */
export function sceneGeometry(fw: number, fh: number, top: number, halfSpan: number): SceneGeometry {
  const groundPx = Math.max(64, Math.min(150, fh * 0.17))
  const sFitW = fw / (2 * halfSpan)
  const sFitH = (fh - groundPx - 16) / (top + HEADROOM)
  const sComfort = Math.max(0.82, Math.min(1.35, fw / 430))
  const s = Math.max(0.5, Math.min(2.1, sFitW, Math.max(sFitH, sComfort)))
  const trackH = Math.max(fh, Math.ceil(groundPx + (top + HEADROOM) * s))
  return { s, trackH, groundY: trackH - groundPx, groundPx }
}

// ---------------------------------------------------------------------------------------------
// Background art (painted once per size into offscreen canvases)

interface Layers {
  w: number
  h: number
  dpr: number
  s: number
  sky: HTMLCanvasElement
  /** Far mountains: drawn with their foot at `mountFoot` px from the strip top. */
  mountains: HTMLCanvasElement
  mountFoot: number
  /** The hill: hilltop at `hillTop` px from the strip top. */
  hill: HTMLCanvasElement
  hillTop: number
}

function offscreen(w: number, h: number, dpr: number): [HTMLCanvasElement, CanvasRenderingContext2D | null] {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w * dpr))
  c.height = Math.max(1, Math.round(h * dpr))
  const g = c.getContext('2d')
  g?.setTransform(dpr, 0, 0, dpr, 0, 0)
  return [c, g]
}

function paintSky(g: CanvasRenderingContext2D, w: number, h: number): void {
  const sky = g.createLinearGradient(0, 0, 0, h)
  sky.addColorStop(0, '#a6d3ec')
  sky.addColorStop(0.5, '#cfe8f1')
  sky.addColorStop(0.82, '#fde9d4')
  sky.addColorStop(1, '#ffdcc0')
  g.fillStyle = sky
  g.fillRect(0, 0, w, h)
  // A soft, low sun.
  const sx = w * 0.8
  const sy = h * 0.2
  const r = Math.min(w, h) * 0.07 + 16
  const halo = g.createRadialGradient(sx, sy, r * 0.6, sx, sy, r * 3.2)
  halo.addColorStop(0, 'rgba(255, 240, 190, 0.75)')
  halo.addColorStop(1, 'rgba(255, 240, 190, 0)')
  g.fillStyle = halo
  g.fillRect(0, 0, w, h)
  g.fillStyle = '#ffe08a'
  g.beginPath()
  g.arc(sx, sy, r, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = 'rgba(255, 252, 235, 0.7)'
  g.beginPath()
  g.arc(sx - r * 0.3, sy - r * 0.3, r * 0.42, 0, Math.PI * 2)
  g.fill()
  // A few puffy clouds.
  const rng = createRng('upanyway:cairn-clouds')
  const n = Math.max(3, Math.round(w / 220))
  for (let i = 0; i < n; i++) {
    const cx = ((i + 0.3 + rng.range(-0.25, 0.25)) / n) * w
    const cy = h * rng.range(0.08, 0.42)
    const cs = rng.range(0.7, 1.15) * Math.max(0.75, Math.min(1.4, w / 600))
    cloud(g, cx, cy, cs)
  }
}

function cloud(g: CanvasRenderingContext2D, x: number, y: number, k: number): void {
  const puffs: [number, number, number][] = [
    [-34, 6, 18],
    [-14, -6, 24],
    [12, -10, 26],
    [36, 2, 19],
    [2, 8, 22],
  ]
  g.save()
  g.translate(x, y)
  g.scale(k, k)
  g.fillStyle = 'rgba(214, 196, 205, 0.35)'
  g.beginPath()
  for (const [px, py, r] of puffs) g.ellipse(px + 3, py + 5, r, r * 0.9, 0, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = 'rgba(255, 255, 255, 0.92)'
  g.beginPath()
  for (const [px, py, r] of puffs) {
    g.moveTo(px + r, py)
    g.ellipse(px, py, r, r * 0.9, 0, 0, Math.PI * 2)
  }
  g.fill()
  g.restore()
}

/** Far ranges with her mountain in the middle and Sky Lake glinting near its top. */
function paintMountains(g: CanvasRenderingContext2D, w: number, hgt: number, foot: number): void {
  const rng = createRng('upanyway:cairn-ranges')
  const range = (color: string, base: number, amp: number, step: number, rim: string) => {
    g.fillStyle = color
    g.beginPath()
    g.moveTo(0, foot + 4)
    let x = 0
    let y = base
    g.lineTo(0, y)
    while (x < w) {
      const nx = x + step * rng.range(0.6, 1.3)
      const ny = base - amp * rng.range(0.15, 1)
      g.quadraticCurveTo(x + (nx - x) * 0.5, Math.min(y, ny) - amp * 0.2, nx, ny)
      x = nx
      y = ny
    }
    g.lineTo(w, foot + 4)
    g.closePath()
    g.fill()
    g.strokeStyle = rim
    g.lineWidth = 2
    g.stroke()
  }
  // Her mountain: one tall rounded peak, snow cap, a blue glint of Sky Lake.
  const peakX = w * 0.32
  const peakY = foot - hgt * 0.92
  const half = Math.min(w * 0.42, hgt * 1.25)
  g.fillStyle = '#b7b3d8'
  g.beginPath()
  g.moveTo(peakX - half, foot + 4)
  g.bezierCurveTo(peakX - half * 0.55, foot - hgt * 0.35, peakX - half * 0.18, peakY + 6, peakX, peakY)
  g.bezierCurveTo(peakX + half * 0.2, peakY + 6, peakX + half * 0.55, foot - hgt * 0.4, peakX + half, foot + 4)
  g.closePath()
  g.fill()
  g.save()
  g.clip()
  g.fillStyle = '#f3f1fb'
  g.beginPath()
  g.moveTo(peakX - half, peakY + hgt * 0.16)
  for (let i = 0; i <= 8; i++) {
    const x = peakX - half * 0.42 + (i / 8) * half * 0.84
    g.lineTo(x, peakY + hgt * (0.15 + (i % 2 ? 0.05 : 0)))
  }
  g.lineTo(peakX + half, peakY - 20)
  g.lineTo(peakX - half, peakY - 20)
  g.closePath()
  g.fill()
  g.restore()
  g.fillStyle = '#6fc3d6'
  g.beginPath()
  g.ellipse(peakX + 2, peakY + hgt * 0.07, Math.max(5, half * 0.07), Math.max(2, half * 0.018), 0, 0, Math.PI * 2)
  g.fill()

  range('#c9c4e2', foot - hgt * 0.4, hgt * 0.32, Math.max(70, w / 7), 'rgba(255,255,255,0.35)')
  range('#c4d9bf', foot - hgt * 0.16, hgt * 0.2, Math.max(60, w / 9), 'rgba(255,255,255,0.4)')
  // A far tree line along the foot.
  g.fillStyle = '#a9c79a'
  for (let x = -6; x < w + 10; x += rng.range(9, 16)) {
    const th = rng.range(10, 22)
    g.beginPath()
    g.moveTo(x - 6, foot + 2)
    g.lineTo(x, foot - th)
    g.lineTo(x + 6, foot + 2)
    g.closePath()
    g.fill()
  }
}

/** The grassy hilltop in cairn units, with tufts and little flowers. */
function paintHill(g: CanvasRenderingContext2D, w: number, hillTop: number, height: number, s: number, cx: number): void {
  const yAt = (px: number) => hillTop - hillY((px - cx) / s) * s
  const path = new Path2D()
  path.moveTo(0, height + 2)
  for (let px = 0; px <= w + 4; px += 4) path.lineTo(px, yAt(px))
  path.lineTo(w, height + 2)
  path.closePath()
  const grass = g.createLinearGradient(0, hillTop, 0, height)
  grass.addColorStop(0, '#a8d185')
  grass.addColorStop(0.35, '#93c272')
  grass.addColorStop(1, '#7aac5f')
  g.fillStyle = grass
  g.fill(path)
  // A worn patch of earth where the cairn stands.
  g.save()
  g.clip(path)
  const patch = g.createRadialGradient(cx, hillTop + 6 * s, 4, cx, hillTop + 6 * s, 110 * s)
  patch.addColorStop(0, 'rgba(196, 160, 112, 0.55)')
  patch.addColorStop(0.6, 'rgba(196, 160, 112, 0.22)')
  patch.addColorStop(1, 'rgba(196, 160, 112, 0)')
  g.fillStyle = patch
  g.beginPath()
  g.ellipse(cx, hillTop + 8 * s, 120 * s, 22 * s, 0, 0, Math.PI * 2)
  g.fill()
  // A trail winding down the hill toward camp.
  g.strokeStyle = 'rgba(214, 184, 140, 0.7)'
  g.lineWidth = Math.max(6, 12 * s)
  g.lineCap = 'round'
  g.beginPath()
  g.moveTo(cx + 40 * s, hillTop + 14 * s)
  g.bezierCurveTo(cx + 140 * s, hillTop + 30 * s, cx - 20 * s, hillTop + 60 * s, cx + 90 * s, height + 20)
  g.stroke()
  g.restore()
  // Light rim along the top of the hill.
  g.strokeStyle = 'rgba(214, 240, 180, 0.9)'
  g.lineWidth = 3
  g.beginPath()
  for (let px = 0; px <= w + 4; px += 4) {
    const y = yAt(px) + 1.5
    if (px === 0) g.moveTo(px, y)
    else g.lineTo(px, y)
  }
  g.stroke()
  // Tufts and flowers, seeded in cairn units so they don't shuffle on resize.
  const rng = createRng('upanyway:cairn-hill')
  const flowerColours = ['#fff6e8', '#f7b6c2', '#ffd66b', '#c9b8ef']
  const fromU = -cx / s - 20
  const toU = (w - cx) / s + 20
  // Seeded from a fixed point well to the left (same draws every time), so the tufts and flowers
  // stay in the same places on the hill whatever the framing.
  for (let ux = -2400; ux < toU; ux += rng.range(9, 22)) {
    const near = Math.abs(ux) < 70
    const depth = rng.range(near ? 10 : 2, 40)
    const size = rng.range(0.8, 1.2)
    const tuft = rng.next() < 0.68
    const shade = rng.next() < 0.5
    const flowerChance = rng.next()
    const colour = rng.pick(flowerColours)
    if (ux < fromU) continue
    const px = cx + ux * s
    const py = yAt(px) + depth * s * 0.9
    if (py > height - 4) continue
    const k = Math.max(0.6, Math.min(1.6, s)) * size
    if (tuft) {
      g.strokeStyle = shade ? '#6f9e52' : '#86b866'
      g.lineWidth = 1.6 * k
      g.lineCap = 'round'
      g.beginPath()
      g.moveTo(px - 3 * k, py - 5 * k)
      g.lineTo(px, py)
      g.lineTo(px + 1 * k, py - 7 * k)
      g.moveTo(px, py)
      g.lineTo(px + 4 * k, py - 5 * k)
      g.stroke()
    } else if (!near || flowerChance < 0.3) {
      g.strokeStyle = '#6f9e52'
      g.lineWidth = 1.2 * k
      g.beginPath()
      g.moveTo(px, py)
      g.lineTo(px, py - 6 * k)
      g.stroke()
      g.fillStyle = colour
      g.beginPath()
      g.arc(px, py - 7 * k, 2.6 * k, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = '#f2a33a'
      g.beginPath()
      g.arc(px, py - 7 * k, 1 * k, 0, Math.PI * 2)
      g.fill()
    }
  }
}

function buildLayers(size: CanvasSize, geo: SceneGeometry, originX: number): Layers {
  const { w, h, dpr } = size
  const [sky, sg] = offscreen(w, h, Math.min(dpr, 1.5))
  if (sg) paintSky(sg, w, h)
  const mh = Math.max(120, Math.min(300, h * 0.42))
  const [mountains, mg] = offscreen(w, mh + 8, dpr)
  if (mg) paintMountains(mg, w, mh * 0.82, mh)
  const hillTop = Math.round(60 * geo.s + 10)
  const hillH = hillTop + geo.groundPx + 4
  const [hill, hg] = offscreen(w, hillH, dpr)
  if (hg) paintHill(hg, w, hillTop, hillH, geo.s, originX)
  return { w, h, dpr, s: geo.s, sky, mountains, mountFoot: mh, hill, hillTop }
}

function releaseLayers(L: Layers | null): void {
  if (!L) return
  releaseCanvas(L.sky)
  releaseCanvas(L.mountains)
  releaseCanvas(L.hill)
}

// ---------------------------------------------------------------------------------------------
// Animation

interface Motion {
  id: string
  /** 'drop' falls from the sky; 'hop' arcs over from the waiting spot. */
  kind: 'drop' | 'hop'
  where: 'pile' | 'waiting'
  from: { x: number; y: number; rot: number }
  to: PlacedStone
  /** Seconds (scene clock) when it starts moving and lands; null until scheduled. */
  start: number
  land: number
  landed: boolean
}

interface Puff {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  born: number
  life: number
  kind: 'dust' | 'spark'
}

const FALL_G = 2400 // cairn units / s²
const SQUASH_S = 0.5
const GAP_S = 0.3

/** Damped squash after a landing: 1 = round, < 1 = squashed. */
function squash(t: number): number {
  if (t < 0 || t > SQUASH_S) return 1
  return 1 - 0.2 * Math.exp(-t * 9) * Math.cos(t * 30)
}

// ---------------------------------------------------------------------------------------------

export function cairnScene(opts: CairnSceneOpts): CairnScene {
  const reduced = prefersReducedMotion()
  const canvas = h('canvas', { class: 'cairn-scene__canvas', 'aria-hidden': 'true' })
  const track = h('div', { class: 'cairn-scene__track' })
  const scroller = h('div', { class: 'cairn-scene__scroll', role: 'group', 'aria-label': opts.ariaLabel }, track)
  const el = h('div', { class: 'cairn-scene scene' }, canvas, scroller)

  const layout = layoutCairn(opts.placed)
  const placed = layout.stones
  const waitFrom = Math.max(layout.right, 30) + 30
  const waiting = layoutWaiting(opts.waiting, waitFrom)
  const labels = new Map<string, string>()
  for (const st of [...opts.placed, ...opts.waiting]) labels.set(st.id, st.label)

  // Where waiting stones that just went on used to sit.
  const before = new Map<string, PlacedStone>()
  if (opts.hopIds?.length && opts.waitingBefore?.length) {
    for (const st of layoutWaiting(opts.waitingBefore, waitFrom)) before.set(st.id, st)
  }
  const waitingRight = [...waiting, ...before.values()].reduce((m, st) => Math.max(m, st.x + st.w / 2), -Infinity)
  // The view frames the pile and anything waiting beside it (centred between them).
  const spanL = Math.min(-70, layout.left)
  const spanR = Math.max(70, layout.right, waitingRight)
  const viewX = (spanL + spanR) / 2
  const halfSpan = (spanR - spanL) / 2 + 28
  /** Stones still waiting that shuffle along to fill the gap the hoppers leave. */
  const slideFrom = new Map<string, PlacedStone>()
  for (const st of waiting) {
    const b = before.get(st.id)
    if (b && (Math.abs(b.x - st.x) > 0.5 || Math.abs(b.y - st.y) > 0.5)) slideFrom.set(st.id, b)
  }

  // ------------------------------------------------------------------ motions
  const motions: Motion[] = []
  const byId = new Map<string, PlacedStone>()
  for (const st of placed) byId.set(st.id, st)
  const waitById = new Map<string, PlacedStone>()
  for (const st of waiting) waitById.set(st.id, st)
  const hop = new Set(opts.hopIds ?? [])
  const drop = new Set(opts.dropIds ?? [])
  // Hops first (the waiting stones go on before the new one), then drops, each in cairn order.
  for (const st of placed) {
    if (hop.has(st.id) && before.has(st.id)) {
      const b = before.get(st.id) as PlacedStone
      motions.push({ id: st.id, kind: 'hop', where: 'pile', from: { x: b.x, y: b.y, rot: b.rot }, to: st, start: -1, land: -1, landed: false })
    }
  }
  for (const st of placed) {
    if ((drop.has(st.id) || (hop.has(st.id) && !before.has(st.id))) && !motions.some((m) => m.id === st.id)) {
      motions.push({ id: st.id, kind: 'drop', where: 'pile', from: { x: st.x, y: st.y, rot: st.rot }, to: st, start: -1, land: -1, landed: false })
    }
  }
  for (const st of waiting) {
    if (drop.has(st.id)) {
      motions.push({ id: st.id, kind: 'drop', where: 'waiting', from: { x: st.x, y: st.y, rot: st.rot }, to: st, start: -1, land: -1, landed: false })
    }
  }
  const moving = new Map<string, Motion>()
  for (const m of motions) moving.set(m.id, m)
  /** Reduce Motion: a soft ring marks the stones that are new. */
  const ringed = new Set(reduced ? motions.map((m) => m.id) : [])
  const puffs: Puff[] = []
  const rng = createRng('upanyway:cairn-dust')

  // ------------------------------------------------------------------ geometry + buttons
  let size: CanvasSize | null = null
  let geo: SceneGeometry | null = null
  let layers: Layers | null = null
  let sceneT = 0
  let clockAt = -1
  let dirty = true
  let touching = false
  let autoScroll: { from: number; to: number; start: number; dur: number } | null = null
  const buttons = new Map<string, HTMLButtonElement>()
  /** Brief "boing" when a stone is tapped. */
  const wiggles = new Map<string, number>()

  const toTrack = (x: number, y: number) => {
    const g = geo as SceneGeometry
    const w = size ? size.w : 0
    return { X: w / 2 + (x - viewX) * g.s, Y: g.groundY - y * g.s }
  }

  function makeButtons(): void {
    for (const st of [...placed, ...waiting]) {
      const b = h('button', {
        type: 'button',
        class: 'cairn-stone' + (waitById.has(st.id) ? ' cairn-stone--waiting' : ''),
        'aria-label': labels.get(st.id) ?? '',
        dataset: { stone: st.id },
      })
      buttons.set(st.id, b)
      track.appendChild(b)
    }
  }

  function placeButtons(): void {
    if (!geo || !size) return
    track.style.height = `${geo.trackH}px`
    for (const st of [...placed, ...waiting]) {
      const b = buttons.get(st.id)
      if (!b) continue
      const { X, Y } = toTrack(st.x, st.y)
      const bw = Math.max(48, st.w * geo.s * 0.9)
      const bh = Math.max(48, st.h * geo.s * 0.9)
      b.style.left = `${Math.round(X - bw / 2)}px`
      b.style.top = `${Math.round(Y - bh / 2)}px`
      b.style.width = `${Math.round(bw)}px`
      b.style.height = `${Math.round(bh)}px`
      b.hidden = isHidden(st.id)
    }
  }

  /** A stone that hasn't landed yet isn't on the picture (or tappable). */
  function isHidden(id: string): boolean {
    const m = moving.get(id)
    return !!m && !m.landed && !reduced
  }

  function resize(): void {
    const sz = sizeCanvas(canvas)
    if (!sz) return
    const bottomGap = geo ? scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight : 0
    const first = !geo
    size = sz
    // The scroll layer is the same size as the frame (the canvas fills it).
    geo = sceneGeometry(sz.w, sz.h, layout.top, halfSpan)
    releaseLayers(layers)
    layers = buildLayers(sz, geo, sz.w / 2 - viewX * geo.s)
    placeButtons()
    if (first) scroller.scrollTop = initialScroll()
    else scroller.scrollTop = Math.max(0, geo.trackH - sz.h - bottomGap)
    dirty = true
    loop.redraw()
  }

  /** Start at the bottom (the hill), or where the first new stone lands. */
  function initialScroll(): number {
    if (!geo || !size) return 0
    const max = geo.trackH - size.h
    const first = motions[0]
    if (!first) return max
    return clampScroll(toTrack(first.to.x, first.to.y).Y - size.h * 0.55)
  }

  function clampScroll(v: number): number {
    if (!geo || !size) return 0
    return Math.max(0, Math.min(geo.trackH - size.h, v))
  }

  /** Bring a landing spot into view (gently), unless her finger is on the picture. */
  function revealSpot(x: number, y: number): void {
    if (!geo || !size || touching) return
    const { Y } = toTrack(x, y)
    const top = scroller.scrollTop
    const margin = Math.min(140, size.h * 0.28)
    if (Y > top + margin && Y < top + size.h - margin * 0.6) return
    const to = clampScroll(Y - size.h * 0.55)
    if (Math.abs(to - top) < 4) return
    autoScroll = { from: top, to, start: sceneT, dur: 0.45 }
  }

  // ------------------------------------------------------------------ scheduling
  let next = 0
  let settledCalled = false

  function schedule(at: number): void {
    const m = motions[next]
    if (!m) return
    m.start = at
    if (m.kind === 'drop') {
      const fallUnits = (size ? size.h * 0.8 : 600) / (geo ? geo.s : 1) + 60
      m.from = { x: m.to.x + (m.where === 'waiting' ? 8 : 0), y: m.to.y + fallUnits, rot: m.to.rot + (rng.next() < 0.5 ? -0.5 : 0.5) }
      m.land = at + Math.sqrt((2 * fallUnits) / FALL_G)
    } else {
      m.land = at + 0.8
    }
    revealSpot(m.to.x, m.to.y)
  }

  function landed(m: Motion): void {
    m.landed = true
    const b = buttons.get(m.id)
    if (b) b.hidden = false
    if (audio.isRunning()) sfx.clack()
    // Dust from both sides of where it touched down, and a few sparkles for a new stone.
    const footY = m.to.y - m.to.h * 0.42
    for (let i = 0; i < 12; i++) {
      const side = i % 2 ? 1 : -1
      puffs.push({
        x: m.to.x + side * m.to.w * rng.range(0.3, 0.5),
        y: footY + rng.range(-2, 4),
        vx: side * rng.range(30, 90),
        vy: rng.range(8, 46),
        r: rng.range(3, 7),
        born: sceneT,
        life: rng.range(0.45, 0.8),
        kind: 'dust',
      })
    }
    if (m.kind === 'drop' && m.where === 'pile') {
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + rng.range(-1.2, 1.2)
        puffs.push({
          x: m.to.x + rng.range(-0.4, 0.4) * m.to.w,
          y: m.to.y + m.to.h * 0.3,
          vx: Math.cos(a) * 30,
          vy: -Math.sin(a) * rng.range(50, 90),
          r: rng.range(2.5, 4.5),
          born: sceneT + 0.05,
          life: rng.range(0.7, 1.1),
          kind: 'spark',
        })
      }
    }
    opts.onLanded?.(m.id, m.where)
    next++
    if (next < motions.length) schedule(sceneT + SQUASH_S * 0.6 + GAP_S)
    else finish()
  }

  function finish(): void {
    if (settledCalled) return
    settledCalled = true
    opts.onSettled?.()
  }

  // ------------------------------------------------------------------ drawing
  function stoneAt(st: PlacedStone, now: number): { x: number; y: number; rot: number; sx: number; sy: number; flying: boolean } {
    let x = st.x
    let y = st.y
    let rot = st.rot
    let sx = 1
    let sy = 1
    let flying = false
    const m = moving.get(st.id)
    if (m && !reduced && m.kind === 'hop' && (m.start < 0 || now < m.start)) {
      // Still waiting beside the pile for its turn.
      return { x: m.from.x, y: m.from.y, rot: m.from.rot, sx, sy, flying }
    }
    if (m && !reduced && m.start >= 0) {
      if (now < m.land) {
        flying = true
        const u = Math.max(0, (now - m.start) / (m.land - m.start))
        if (m.kind === 'drop') {
          const e = u * u
          x = m.from.x + (m.to.x - m.from.x) * e
          y = m.from.y + (m.to.y - m.from.y) * e
          rot = m.from.rot + (m.to.rot - m.from.rot) * u
          sy = 1.06
          sx = 0.96
        } else {
          const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2
          x = m.from.x + (m.to.x - m.from.x) * e
          const lift = 70 + Math.max(0, m.to.y - m.from.y) * 0.25
          y = m.from.y + (m.to.y - m.from.y) * e + Math.sin(Math.PI * u) * lift
          rot = m.from.rot + (m.to.rot - m.from.rot) * e + Math.sin(Math.PI * u) * 0.6
        }
      } else {
        const k = squash(now - m.land)
        sy = k
        sx = 1 + (1 - k) * 0.9
        y = st.y - (1 - k) * st.h * 0.5
      }
    }
    const sl = slideFrom.get(st.id)
    if (sl && !reduced) {
      const firstHop = motions.find((mm) => mm.kind === 'hop')
      const t0 = firstHop && firstHop.start >= 0 ? firstHop.start : Infinity
      const u = Math.max(0, Math.min(1, (now - t0 - 0.25) / 0.5))
      const e = u * u * (3 - 2 * u)
      x = sl.x + (st.x - sl.x) * e
      y = sl.y + (st.y - sl.y) * e
      rot = sl.rot + (st.rot - sl.rot) * e
    }
    const wig = wiggles.get(st.id)
    if (wig !== undefined) {
      const t = now - wig
      if (t > 0.45) wiggles.delete(st.id)
      else {
        const k = Math.exp(-t * 8) * Math.sin(t * 34)
        rot += k * 0.08
        sx *= 1 + k * 0.05
        sy *= 1 - k * 0.05
      }
    }
    return { x, y, rot, sx, sy, flying }
  }

  function draw(): void {
    const ctx = canvas.getContext('2d')
    if (!ctx || !size || !geo || !layers) return
    const { w, h: fh, dpr } = size
    const g = geo
    const s = g.s
    const scroll = scroller.scrollTop
    const maxScroll = Math.max(0, g.trackH - fh)
    const up = maxScroll - scroll // how far she has scrolled up from the bottom
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.drawImage(layers.sky, 0, 0, layers.sky.width, layers.sky.height, 0, 0, w * dpr, fh * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const groundCanvas = g.groundY - scroll
    // Far mountains: their foot just behind the hill, sinking slowly as she scrolls up.
    const mountFootY = fh - g.groundPx + up * 0.35 + 18 * Math.min(1.4, s)
    // Meadow below the far hills (seen when she scrolls up a tall cairn), then the hills.
    if (mountFootY < fh) {
      ctx.fillStyle = '#b3d493'
      ctx.fillRect(0, mountFootY - 1, w, fh - mountFootY + 1)
    }
    ctx.drawImage(layers.mountains, 0, mountFootY - layers.mountFoot, w, layers.mountains.height / dpr)
    // The hill.
    const hillY0 = groundCanvas - layers.hillTop
    if (hillY0 < fh) ctx.drawImage(layers.hill, 0, hillY0, w, layers.hill.height / dpr)

    const cx = w / 2 - viewX * s
    const now = sceneT
    const view = (st: PlacedStone, y: number) => {
      const Y = groundCanvas - y * s
      const r = Math.max(st.w, st.h) * s
      return Y > -r - 40 && Y < fh + r + 40
    }

    // Ground shadows under the stones that touch the hill.
    ctx.fillStyle = 'rgba(70, 60, 30, 0.18)'
    for (const st of [...placed, ...waiting]) {
      if (isHidden(st.id) || st.y - st.h / 2 > hillY(st.x) + 6) continue
      if (!view(st, st.y)) continue
      ctx.beginPath()
      ctx.ellipse(cx + st.x * s, groundCanvas - (st.y - st.h * 0.44) * s, st.w * 0.52 * s, st.h * 0.16 * s, 0, 0, Math.PI * 2)
      ctx.fill()
    }

    // An empty hilltop keeps a spot for the first stone: a soft dashed outline.
    if (!placed.length && !waiting.length) {
      const pulseK = reduced ? 1 : 0.75 + 0.25 * Math.sin(now * 1.8)
      ctx.save()
      ctx.translate(cx, groundCanvas - 13 * s)
      ctx.fillStyle = `rgba(255, 252, 240, ${0.45 * pulseK})`
      ctx.strokeStyle = `rgba(110, 80, 60, ${0.45 * pulseK})`
      ctx.lineWidth = 2.5
      ctx.setLineDash([7, 7])
      ctx.beginPath()
      ctx.ellipse(0, 0, 29 * s, 17 * s, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.restore()
    }

    const paint = (st: PlacedStone, glow: number) => {
      const p = stoneAt(st, now)
      if (!view(st, p.y)) return
      const X = cx + p.x * s
      const Y = groundCanvas - p.y * s
      ctx.save()
      ctx.translate(X, Y)
      ctx.scale(s, s)
      if (glow > 0) paintGlow(ctx, stoneLook(st.id), glow)
      ctx.rotate(-p.rot)
      // A soft contact shadow on whatever is underneath (none in mid-air).
      if (!p.flying) {
        ctx.fillStyle = 'rgba(60, 34, 44, 0.13)'
        ctx.beginPath()
        ctx.ellipse(0, st.h * 0.4, st.w * 0.5, st.h * 0.2, 0, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.scale(p.sx, p.sy)
      drawStone(ctx, stoneLook(st.id), { mark: st.kind === 'letter' ? 'letter' : null })
      ctx.restore()
      if (ringed.has(st.id)) {
        ctx.save()
        ctx.strokeStyle = 'rgba(255, 214, 102, 0.95)'
        ctx.lineWidth = 3
        ctx.setLineDash([6, 6])
        ctx.beginPath()
        ctx.ellipse(X, Y, (st.w * 0.62 + 6) * s, (st.h * 0.62 + 6) * s, -p.rot, 0, Math.PI * 2)
        ctx.stroke()
        ctx.restore()
      }
    }

    const pulse = reduced ? 0.8 : 0.62 + 0.28 * Math.sin(now * 2.4)
    for (const st of placed) {
      const m = moving.get(st.id)
      if (m && !reduced && m.start < 0 && m.kind !== 'hop') continue // not its turn yet
      // A waiting stone glows beside the pile until it hops on.
      const waitingStill = !!m && !reduced && m.kind === 'hop' && (m.start < 0 || now < m.start)
      paint(st, waitingStill ? pulse : 0)
    }
    for (const st of waiting) {
      const m = moving.get(st.id)
      if (m && !reduced && m.start < 0) continue
      paint(st, m && !m.landed ? 0 : pulse)
    }
    // Two little twinkles drift around each waiting stone.
    if (!reduced) {
      for (const st of waiting) {
        const m = moving.get(st.id)
        if (m && !m.landed) continue
        for (let k = 0; k < 2; k++) {
          const a = now * 0.9 + k * Math.PI + st.index
          const tw = 0.5 + 0.5 * Math.sin(now * 3.1 + k * 2 + st.index)
          const X = cx + (st.x + Math.cos(a) * st.w * 0.62) * s
          const Y = groundCanvas - (st.y + Math.sin(a) * st.h * 0.75 + st.h * 0.15) * s
          sparkle(ctx, X, Y, (1.6 + 1.6 * tw) * Math.min(1.6, s), 0.35 + 0.6 * tw)
        }
      }
    }

    // Dust and sparkles.
    for (let i = puffs.length - 1; i >= 0; i--) {
      const p = puffs[i]
      const t = now - p.born
      if (t < 0) continue
      if (t > p.life) {
        puffs.splice(i, 1)
        continue
      }
      const k = t / p.life
      const x = cx + (p.x + p.vx * t) * s
      const y = groundCanvas - (p.y + p.vy * t - (p.kind === 'dust' ? 60 : 30) * t * t) * s
      if (p.kind === 'dust') {
        ctx.fillStyle = `rgba(214, 190, 160, ${0.55 * (1 - k)})`
        ctx.beginPath()
        ctx.arc(x, y, p.r * (1 + k * 1.4) * Math.min(1.6, s), 0, Math.PI * 2)
        ctx.fill()
      } else {
        sparkle(ctx, x, y, p.r * Math.min(1.6, s) * (1 - k * 0.4), 1 - k)
      }
    }
  }

  function sparkle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, a: number): void {
    ctx.save()
    ctx.translate(x, y)
    ctx.fillStyle = `rgba(255, 222, 120, ${a})`
    ctx.beginPath()
    ctx.moveTo(0, -r * 1.6)
    ctx.quadraticCurveTo(0, 0, r * 1.6, 0)
    ctx.quadraticCurveTo(0, 0, 0, r * 1.6)
    ctx.quadraticCurveTo(0, 0, -r * 1.6, 0)
    ctx.quadraticCurveTo(0, 0, 0, -r * 1.6)
    ctx.fill()
    ctx.restore()
  }

  // ------------------------------------------------------------------ frame loop
  let lastGlow = -1
  const loop = animate(canvas, (t) => {
    if (clockAt < 0) clockAt = t
    sceneT = reduced ? 0 : t - clockAt
    if (!size) resize()
    if (!size) return
    let busy = false
    if (!reduced && next < motions.length) {
      const m = motions[next]
      if (m.start < 0) schedule(sceneT + 0.35)
      if (sceneT >= m.land && !m.landed) landed(m)
      busy = true
    }
    if (autoScroll) {
      const u = Math.min(1, (sceneT - autoScroll.start) / autoScroll.dur)
      const e = 1 - Math.pow(1 - u, 3)
      scroller.scrollTop = autoScroll.from + (autoScroll.to - autoScroll.from) * e
      if (u >= 1 || touching) autoScroll = null
      busy = true
    }
    if (puffs.length || wiggles.size) busy = true
    if (slideFrom.size && sceneT < 3) busy = true
    // Waiting stones glow softly: a calm 15 fps is plenty for that.
    if ((waiting.length || !placed.length) && !reduced && sceneT - lastGlow > 1 / 15) {
      lastGlow = sceneT
      dirty = true
    }
    if (busy || dirty) {
      dirty = false
      draw()
    }
  })

  // ------------------------------------------------------------------ input
  const onScroll = () => {
    dirty = true
    if (reduced) loop.redraw()
  }
  scroller.addEventListener('scroll', onScroll, { passive: true })
  const onDown = () => {
    touching = true
    autoScroll = null
  }
  const onUp = () => {
    touching = false
  }
  scroller.addEventListener('pointerdown', onDown)
  scroller.addEventListener('pointerup', onUp)
  scroller.addEventListener('pointercancel', onUp)
  scroller.addEventListener('touchstart', onDown, { passive: true })
  scroller.addEventListener('touchend', onUp, { passive: true })

  /** The stone under a finger: inside its shape (topmost first), else the nearest within reach. */
  function hitTest(px: number, py: number): string | null {
    if (!geo || !size) return null
    const s = geo.s
    const ux = (px - size.w / 2) / s + viewX
    const uy = (geo.groundY - py) / s
    const all = [...placed, ...waiting].filter((st) => !isHidden(st.id))
    for (let i = all.length - 1; i >= 0; i--) {
      const st = all[i]
      const dx = ux - st.x
      const dy = uy - st.y
      const c = Math.cos(st.rot)
      const sn = Math.sin(st.rot)
      const lx = dx * c + dy * sn
      const ly = -dx * sn + dy * c
      const a = st.w / 2
      const b = st.h / 2
      if ((lx * lx) / (a * a) + (ly * ly) / (b * b) <= 1.08) return st.id
    }
    const reach = 30 / s + 4
    let best: string | null = null
    let bestD = Infinity
    for (const st of all) {
      const d = Math.hypot(ux - st.x, uy - st.y) - Math.min(st.w, st.h) / 2
      if (d < reach && d < bestD) {
        bestD = d
        best = st.id
      }
    }
    return best
  }

  let lastTap = -Infinity
  track.addEventListener('click', (e) => {
    const t = performance.now()
    if (t - lastTap < 400) return
    const target = e.target instanceof HTMLElement ? e.target.closest<HTMLElement>('[data-stone]') : null
    let id: string | null = null
    // Keyboard / VoiceOver activation (no pointer position): the focused stone itself.
    if (target && e.detail === 0) id = target.dataset.stone ?? null
    else {
      const r = track.getBoundingClientRect()
      id = hitTest(e.clientX - r.left, e.clientY - r.top) ?? target?.dataset.stone ?? null
    }
    if (!id) return
    lastTap = t
    audio.tap()
    wiggles.set(id, sceneT)
    dirty = true
    if (reduced) loop.redraw()
    opts.onTap(id)
  })

  makeButtons()
  let ro: ResizeObserver | null = null
  const onWinResize = () => resize()
  if (typeof ResizeObserver === 'function') {
    ro = new ResizeObserver(() => resize())
    ro.observe(el)
  } else window.addEventListener('resize', onWinResize)

  if (!motions.length) queueMicrotask(finish)
  else if (reduced) {
    // Nothing moves: one clack for the new stone(s), then the goat speaks.
    setTimeout(() => {
      if (audio.isRunning()) sfx.clack()
      for (const m of motions) {
        m.landed = true
        opts.onLanded?.(m.id, m.where)
      }
      finish()
    }, 350)
  }

  return {
    el,
    destroy() {
      loop.stop()
      ro?.disconnect()
      window.removeEventListener('resize', onWinResize)
      scroller.removeEventListener('scroll', onScroll)
      releaseLayers(layers)
      layers = null
      releaseCanvas(canvas)
    },
  }
}
