/**
 * The camp picture: her mountain (Sky Lake glinting on top) behind a meadow camp between two trees
 * — tent, a small crackling fire, a little cairn of her real stones — and her, sitting by the fire.
 * Until the goat has climbed out at Sky Lake it peeks out of her backpack; after that it sits
 * beside her. Camp decorations she has unlocked after the summit are placed around the camp, each
 * in its own spot, in its own colour (or the colour of its newest variant).
 *
 * Static layers (sky, mountain, meadow, trees, tent, cairn, the still decorations) are painted once
 * per size; each frame adds the fire, her and the goat, and whatever moves (bunting, lights, the
 * kite, pinwheels, steam, the swing…).
 *
 * Scene units: x from the centre line, y down from the ground line (things above ground have
 * negative y). The camp group is about GROUP_W × GROUP_H units and is fitted to the canvas.
 */
import { animate, releaseCanvas } from '../app/context'
import { drawClimber } from '../game/art/climber'
import { drawGoat, type GoatMood } from '../game/art/goat'
import { sit } from '../game/art/poses'
import { mix, rgba, shade } from '../game/art/rig'
import { drawStone, stoneLook } from '../game/art/stones'
import { TUNING } from '../game/tuning'
import type { ClimberLook } from '../storage/schema'

export interface CampStone {
  id: string
  /** A letter's bonus stone (one small painted heart). */
  letter: boolean
}

export interface CampSceneOpts {
  look: ClimberLook
  /** Her placed stones in cairn order (the picture shows the newest ten). */
  stones: readonly CampStone[]
  /** The goat has climbed out of the pack (Sky Lake): it sits beside her. */
  goatOut: boolean
  /** Unlocked camp decorations: base id → colour (null = its own colours). */
  decorations: ReadonlyMap<string, string | null>
}

export interface CampScene {
  stop(): void
}

interface Layout {
  w: number
  h: number
  dpr: number
  /** Pixels per scene unit. */
  u: number
  /** Screen x of the scene's centre line and y of the ground. */
  cx: number
  gy: number
  bg: HTMLCanvasElement
}

/**
 * The camp group, fitted to the canvas; sky and meadow fill the rest. On a squarer picture (a phone,
 * the landscape column) the two trees at the edges may be cut off a little, so she and the fire
 * stay big enough to read: at least VISIBLE_MIN units of the group's width always show.
 */
const GROUP_W = 420
const GROUP_H = 196
const VISIBLE_MIN = 360
const MAX_PICTURE_STONES = 10

const TREE_L = -190
const TREE_R = 192
const TENT_X = -104
const TENT_W = 92
const TENT_H = 66
const FIRE_X = -18
const HOOK_X = -50
const CLIMBER_X = 46
const GOAT_X = 84
const CAIRN_X = 134
const FLAG_X = -142

// ---------------------------------------------------------------------------------------------

function layout(canvas: HTMLCanvasElement, opts: CampSceneOpts): Layout | null {
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  if (!w || !h) return null
  const dpr = Math.min(TUNING.maxDpr, Math.max(1, window.devicePixelRatio || 1))
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  const visible = Math.max(VISIBLE_MIN, Math.min(GROUP_W, (w / h) * 228))
  const u = Math.min(w / visible, h / GROUP_H)
  const gy = h - Math.min(h * 0.16, 28 * u)
  const bg = document.createElement('canvas')
  bg.width = canvas.width
  bg.height = canvas.height
  const L: Layout = { w, h, dpr, u, cx: w / 2, gy, bg }
  const g = bg.getContext('2d')
  if (g) {
    g.scale(dpr, dpr)
    paintStatic(g, L, opts)
  }
  return L
}

/** Run `fn` in scene units (origin: centre of the ground line). */
function inScene(g: CanvasRenderingContext2D, L: Layout, fn: () => void): void {
  g.save()
  g.translate(L.cx, L.gy)
  g.scale(L.u, L.u)
  fn()
  g.restore()
}

const has = (o: CampSceneOpts, id: string): boolean => o.decorations.has(id)
const tintOf = (o: CampSceneOpts, id: string, fallback: string): string => o.decorations.get(id) ?? fallback

// ---------------------------------------------------------------------------------------------
// Static picture

function paintStatic(g: CanvasRenderingContext2D, L: Layout, o: CampSceneOpts): void {
  const { w, h, u, cx, gy } = L
  const sky = g.createLinearGradient(0, 0, 0, gy)
  sky.addColorStop(0, '#8fbfe0')
  sky.addColorStop(0.55, '#ffd9b4')
  sky.addColorStop(1, '#ffc79e')
  g.fillStyle = sky
  g.fillRect(0, 0, w, h)

  // Low golden sun and a couple of early stars.
  g.fillStyle = 'rgba(255, 236, 170, 0.5)'
  g.beginPath()
  g.arc(cx + 150 * u, gy - 70 * u, 34 * u, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#ffd36b'
  g.beginPath()
  g.arc(cx + 150 * u, gy - 70 * u, 18 * u, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = 'rgba(255, 255, 255, 0.8)'
  for (const [sx, sy] of [
    [0.12, 0.1],
    [0.3, 0.05],
    [0.71, 0.08],
    [0.9, 0.16],
  ]) {
    g.beginPath()
    g.arc(w * sx, (gy - 150 * u) * sy + 6, Math.max(1, 1.3 * u), 0, Math.PI * 2)
    g.fill()
  }

  // Far ridges across the whole width.
  g.fillStyle = '#e3d6ee'
  g.beginPath()
  g.moveTo(0, gy)
  for (let x = 0; x <= w + 24; x += 24) g.lineTo(x, gy - 46 * u - Math.sin(x / (70 * u)) * 14 * u - Math.sin(x / (23 * u)) * 4 * u)
  g.lineTo(w, gy)
  g.fill()

  paintMountain(g, L)

  // Meadow
  g.fillStyle = '#a9d18e'
  g.beginPath()
  g.moveTo(0, h)
  g.lineTo(0, gy - 12 * u)
  g.quadraticCurveTo(w * 0.3, gy - 26 * u, w * 0.55, gy - 10 * u)
  g.quadraticCurveTo(w * 0.8, gy + 2 * u, w, gy - 16 * u)
  g.lineTo(w, h)
  g.fill()
  g.fillStyle = '#8cc172'
  g.fillRect(0, gy, w, h - gy)
  g.fillStyle = '#7fb069'
  g.beginPath()
  g.moveTo(0, h)
  g.lineTo(0, gy + 14 * u)
  g.quadraticCurveTo(w * 0.5, gy + 4 * u, w, gy + 16 * u)
  g.lineTo(w, h)
  g.fill()

  inScene(g, L, () => {
    paintTree(g, TREE_L, 1)
    paintTree(g, TREE_R, -1)
    if (has(o, 'deco-hammock')) paintHammock(g, tintOf(o, 'deco-hammock', '#f0a050'))
    if (has(o, 'deco-signpost')) paintSignpost(g, tintOf(o, 'deco-signpost', '#d9a06b'))
    if (has(o, 'deco-log-bench')) paintLogBench(g, tintOf(o, 'deco-log-bench', '#e8735a'))
    paintTent(g)
    if (has(o, 'deco-lantern') || has(o, 'deco-wind-chime')) paintHook(g)
    paintFireRing(g)
    paintCairn(g, o.stones.slice(-MAX_PICTURE_STONES))
    if (has(o, 'deco-goat-bed')) paintGoatBed(g, tintOf(o, 'deco-goat-bed', '#a678c8'))
    // The front row.
    if (has(o, 'deco-flower-pots')) paintFlowerPots(g, tintOf(o, 'deco-flower-pots', '#d9805a'))
    if (has(o, 'deco-veggie-patch')) paintVeggiePatch(g, tintOf(o, 'deco-veggie-patch', '#f0a050'))
    if (has(o, 'deco-picnic')) paintPicnic(g, tintOf(o, 'deco-picnic', '#e8735a'))
    if (has(o, 'deco-telescope')) paintTelescope(g, tintOf(o, 'deco-telescope', '#4f5da3'))
  })
}

function paintMountain(g: CanvasRenderingContext2D, L: Layout): void {
  const { u, cx, gy } = L
  // Her mountain: a tall peak with a flat top where Sky Lake glints.
  const peakH = Math.min(gy - 18, 175 * u)
  const top = gy - peakH
  const mx = cx + 18 * u
  const half = Math.max(150 * u, peakH * 0.95)
  g.fillStyle = '#8ea7c8'
  g.beginPath()
  g.moveTo(mx - half, gy)
  g.lineTo(mx - 14 * u, top + 6 * u)
  g.quadraticCurveTo(mx, top, mx + 14 * u, top + 6 * u)
  g.lineTo(mx + half, gy)
  g.fill()
  g.fillStyle = '#a8bed9'
  g.beginPath()
  g.moveTo(mx, top + 3 * u)
  g.quadraticCurveTo(mx + 8 * u, top + 2 * u, mx + 14 * u, top + 6 * u)
  g.lineTo(mx + half, gy)
  g.lineTo(mx + half * 0.25, gy)
  g.lineTo(mx + half * 0.18, top + peakH * 0.5)
  g.closePath()
  g.fill()
  const cap = peakH * 0.2
  const slope = half / peakH
  g.fillStyle = '#ffffff'
  g.beginPath()
  g.moveTo(mx - 14 * u - cap * slope, top + 6 * u + cap)
  g.lineTo(mx - 14 * u, top + 6 * u)
  g.quadraticCurveTo(mx, top, mx + 14 * u, top + 6 * u)
  g.lineTo(mx + 14 * u + cap * slope, top + 6 * u + cap)
  g.lineTo(mx + 8 * u, top + 6 * u + cap * 0.62)
  g.lineTo(mx, top + 6 * u + cap)
  g.lineTo(mx - 10 * u, top + 6 * u + cap * 0.6)
  g.closePath()
  g.fill()
  g.fillStyle = '#4fb0c6'
  g.beginPath()
  g.ellipse(mx, top + 4.4 * u, 11 * u, 2.2 * u, 0, 0, Math.PI * 2)
  g.fill()
}

function groundShadow(g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry = 3): void {
  g.fillStyle = 'rgba(61, 42, 36, 0.16)'
  g.beginPath()
  g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
  g.fill()
}

/** A round meadow tree; `branch` = which way its low branch reaches (for the swing / feeder). */
function paintTree(g: CanvasRenderingContext2D, x: number, branch: 1 | -1): void {
  groundShadow(g, x, -1, 22, 4)
  g.fillStyle = '#8a5a3c'
  g.beginPath()
  g.moveTo(x - 5, 0)
  g.quadraticCurveTo(x - 3, -30, x - 4, -60)
  g.lineTo(x + 4, -60)
  g.quadraticCurveTo(x + 3, -30, x + 6, 0)
  g.closePath()
  g.fill()
  // The low branch.
  g.strokeStyle = '#8a5a3c'
  g.lineWidth = 3.4
  g.lineCap = 'round'
  g.beginPath()
  g.moveTo(x, -50)
  g.quadraticCurveTo(x + branch * 14, -58, x + branch * 30, -58)
  g.stroke()
  const crown: [number, number, number, string][] = [
    [x - 14, -74, 20, '#6f9f57'],
    [x + 14, -76, 21, '#6f9f57'],
    [x, -92, 23, '#7fb069'],
    [x - 4, -70, 20, '#86ba6e'],
    [x + 6, -86, 14, '#94c67b'],
  ]
  for (const [cx, cy, r, c] of crown) {
    g.fillStyle = c
    g.beginPath()
    g.arc(cx, cy, r, 0, Math.PI * 2)
    g.fill()
  }
  g.fillStyle = 'rgba(255, 255, 255, 0.18)'
  g.beginPath()
  g.arc(x - 8, -96, 9, 0, Math.PI * 2)
  g.fill()
}

function paintTent(g: CanvasRenderingContext2D): void {
  const x = TENT_X
  const w = TENT_W
  const ht = TENT_H
  groundShadow(g, x, 1, w * 0.58, 5)
  g.fillStyle = '#f08c70'
  g.beginPath()
  g.moveTo(x - w / 2, 0)
  g.quadraticCurveTo(x - w * 0.2, -ht * 0.55, x, -ht)
  g.quadraticCurveTo(x + w * 0.2, -ht * 0.55, x + w / 2, 0)
  g.closePath()
  g.fill()
  g.fillStyle = '#e8735a'
  g.beginPath()
  g.moveTo(x, -ht)
  g.quadraticCurveTo(x + w * 0.2, -ht * 0.55, x + w / 2, 0)
  g.lineTo(x + w * 0.12, 0)
  g.closePath()
  g.fill()
  // Door, flap tied open, warm light inside.
  g.fillStyle = '#5e3a2e'
  g.beginPath()
  g.moveTo(x - 13, 0)
  g.quadraticCurveTo(x - 4, -ht * 0.4, x, -ht * 0.62)
  g.quadraticCurveTo(x + 4, -ht * 0.4, x + 13, 0)
  g.closePath()
  g.fill()
  g.fillStyle = 'rgba(255, 200, 120, 0.35)'
  g.beginPath()
  g.ellipse(x, -7, 8, 5, 0, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#fcd9cd'
  g.beginPath()
  g.moveTo(x, -ht * 0.62)
  g.quadraticCurveTo(x - 10, -ht * 0.32, x - 20, -6)
  g.quadraticCurveTo(x - 9, -ht * 0.22, x - 4, -ht * 0.45)
  g.closePath()
  g.fill()
  // Pennant
  g.strokeStyle = '#6c5048'
  g.lineWidth = 1.4
  g.beginPath()
  g.moveTo(x, -ht)
  g.lineTo(x, -ht - 16)
  g.stroke()
  g.fillStyle = '#f5b83d'
  g.beginPath()
  g.moveTo(x, -ht - 16)
  g.lineTo(x + 13, -ht - 12)
  g.lineTo(x, -ht - 8)
  g.fill()
  // Guy lines
  g.strokeStyle = 'rgba(108, 80, 72, 0.5)'
  g.lineWidth = 0.9
  g.beginPath()
  g.moveTo(x - w * 0.32, -ht * 0.42)
  g.lineTo(x - w * 0.66, 0)
  g.moveTo(x + w * 0.32, -ht * 0.42)
  g.lineTo(x + w * 0.62, 0)
  g.stroke()
}

function paintFireRing(g: CanvasRenderingContext2D): void {
  const fx = FIRE_X
  groundShadow(g, fx, 1, 20, 4)
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * (0.05 + (i / 6) * 0.9)
    g.fillStyle = i % 2 ? '#b7a99c' : '#cfc6ba'
    g.beginPath()
    g.ellipse(fx - Math.cos(a) * 18, 1.5 - Math.sin(a) * 1.5, 4.6, 3.2, 0, 0, Math.PI * 2)
    g.fill()
  }
  g.strokeStyle = '#7a4b33'
  g.lineCap = 'round'
  g.lineWidth = 4.2
  g.beginPath()
  g.moveTo(fx - 12, -0.5)
  g.lineTo(fx + 10, -5)
  g.moveTo(fx + 12, -0.5)
  g.lineTo(fx - 10, -5)
  g.stroke()
}

/** Her cairn: a base rock and her newest stones, stacked a little wider at the bottom. */
function paintCairn(g: CanvasRenderingContext2D, stones: readonly CampStone[]): void {
  const x = CAIRN_X
  groundShadow(g, x, 1, 22, 4)
  g.fillStyle = '#a99a8c'
  g.beginPath()
  g.ellipse(x, -3, 20, 5, 0, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = 'rgba(255, 255, 255, 0.22)'
  g.beginPath()
  g.ellipse(x - 6, -5.5, 8, 1.6, 0, 0, Math.PI * 2)
  g.fill()
  const k = stones.length
  if (!k) return
  // Rows from the bottom: wider rows once there are enough stones.
  const rows: number[] = k >= 7 ? [3, 2, 2, 1, 1, 1] : k >= 4 ? [2, 1, 1, 1, 1] : [1, 1, 1]
  let left = k
  let y = -6
  let i = 0
  for (let r = 0; r < rows.length && left > 0; r++) {
    const n = Math.min(rows[r], left)
    const scale = 0.34 - r * 0.022
    let rowH = 0
    const looks = stones.slice(i, i + n).map((s) => ({ s, look: stoneLook(s.id) }))
    const widths = looks.map((l) => l.look.w * scale * 0.92)
    const total = widths.reduce((a, b) => a + b, 0)
    let sx = x - total / 2 + (r % 2 ? 1 : -1) * 0.8
    looks.forEach(({ s, look }, j) => {
      const sw = widths[j]
      const sh = look.h * scale
      rowH = Math.max(rowH, sh)
      g.save()
      g.translate(sx + sw / 2, y - sh / 2)
      g.rotate(look.lean)
      g.scale(scale, scale)
      drawStone(g, look, { mark: s.letter ? 'letter' : null })
      g.restore()
      sx += sw
    })
    y -= rowH * 0.82
    left -= n
    i += n
  }
}

// ---------------------------------------------------------------------------------------------
// Still decorations

function paintHammock(g: CanvasRenderingContext2D, col: string): void {
  // Between a post and the right tree's trunk.
  const px = 156
  groundShadow(g, 174, 0, 18, 3)
  g.strokeStyle = '#8a5a3c'
  g.lineWidth = 3
  g.lineCap = 'round'
  g.beginPath()
  g.moveTo(px, 0)
  g.lineTo(px, -34)
  g.stroke()
  const a = { x: px + 1, y: -32 }
  const b = { x: TREE_R - 4, y: -34 }
  g.strokeStyle = '#6c5048'
  g.lineWidth = 0.8
  g.beginPath()
  g.moveTo(a.x, a.y)
  g.lineTo(a.x + 5, a.y + 5)
  g.moveTo(b.x, b.y)
  g.lineTo(b.x - 5, b.y + 5)
  g.stroke()
  g.fillStyle = col
  g.beginPath()
  g.moveTo(a.x + 5, a.y + 5)
  g.quadraticCurveTo((a.x + b.x) / 2, a.y + 22, b.x - 5, b.y + 5)
  g.quadraticCurveTo((a.x + b.x) / 2, a.y + 14, a.x + 5, a.y + 5)
  g.closePath()
  g.fill()
  g.strokeStyle = rgba('#ffffff', 0.6)
  g.lineWidth = 1.2
  for (const k of [0.35, 0.65]) {
    const mx = a.x + 5 + (b.x - a.x - 10) * k
    g.beginPath()
    g.moveTo(mx - 1, a.y + 9 + k * 2)
    g.lineTo(mx + 1, a.y + 15)
    g.stroke()
  }
}

function paintSignpost(g: CanvasRenderingContext2D, col: string): void {
  // Just behind the goat's spot, tall enough that both arrows clear its back.
  const x = 104
  groundShadow(g, x, 0, 6, 1.6)
  g.fillStyle = '#8a5a3c'
  g.fillRect(x - 1.6, -58, 3.2, 58)
  const board = (y: number, dir: 1 | -1, tilt: number) => {
    g.save()
    g.translate(x, y)
    g.rotate(tilt)
    g.fillStyle = col
    g.beginPath()
    g.moveTo(-dir * 3, -4)
    g.lineTo(dir * 15, -4)
    g.lineTo(dir * 20, 0)
    g.lineTo(dir * 15, 4)
    g.lineTo(-dir * 3, 4)
    g.closePath()
    g.fill()
    g.fillStyle = shade(col, -0.25)
    g.fillRect(dir === 1 ? -3 : -15, 2.4, 18, 1.6)
    g.restore()
  }
  // Up to Sky Lake (a tiny lake on it) and back home (a tiny house).
  board(-52, -1, 0.1)
  g.fillStyle = '#4fb0c6'
  g.beginPath()
  g.ellipse(x - 8, -52.5, 4, 1.6, 0.1, 0, Math.PI * 2)
  g.fill()
  board(-40, 1, -0.06)
  g.fillStyle = '#6c5048'
  g.beginPath()
  g.moveTo(x + 6, -39)
  g.lineTo(x + 9, -42.5)
  g.lineTo(x + 12, -39)
  g.closePath()
  g.fill()
  g.fillRect(x + 6.8, -39, 4.4, 2.6)
}

function paintLogBench(g: CanvasRenderingContext2D, cushion: string): void {
  const x0 = 24
  const x1 = 70
  const y = -7
  groundShadow(g, (x0 + x1) / 2, y + 5, 26, 2.6)
  g.fillStyle = '#9b6a48'
  g.beginPath()
  g.moveTo(x0, y - 4)
  g.lineTo(x1, y - 4)
  g.quadraticCurveTo(x1 + 4, y, x1, y + 4)
  g.lineTo(x0, y + 4)
  g.closePath()
  g.fill()
  g.fillStyle = '#d9b08a'
  g.beginPath()
  g.ellipse(x0, y, 3, 4, 0, 0, Math.PI * 2)
  g.fill()
  g.strokeStyle = '#9b6a48'
  g.lineWidth = 0.6
  g.beginPath()
  g.ellipse(x0, y, 1.6, 2.2, 0, 0, Math.PI * 2)
  g.stroke()
  // A cushion for whoever sits there.
  g.fillStyle = cushion
  g.beginPath()
  g.ellipse(x1 - 9, y - 5.5, 7, 2.6, 0, 0, Math.PI * 2)
  g.fill()
}

function paintGoatBed(g: CanvasRenderingContext2D, col: string): void {
  const x = GOAT_X
  groundShadow(g, x, 3, 17, 3.2)
  g.fillStyle = col
  g.beginPath()
  g.ellipse(x, 0, 16, 5.6, 0, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = mix(col, '#ffffff', 0.7)
  g.beginPath()
  g.ellipse(x, -0.8, 11.5, 3.2, 0, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = mix(col, '#ffffff', 0.35)
  g.beginPath()
  g.ellipse(x, -3.4, 15, 2.8, 0, Math.PI, 0)
  g.fill()
}

function paintFlowerPots(g: CanvasRenderingContext2D, col: string): void {
  ;[-182, -168, -154].forEach((x, i) => {
    const y = 16 + (i % 2) * 2
    groundShadow(g, x, y + 0.6, 6, 1.4)
    // Stems and daisies.
    g.strokeStyle = '#5a8c46'
    g.lineWidth = 0.9
    for (const dx of [-2.5, 0.5, 3]) {
      g.beginPath()
      g.moveTo(x + dx * 0.4, y - 7)
      g.lineTo(x + dx, y - 14 - Math.abs(dx))
      g.stroke()
      g.fillStyle = '#ffffff'
      for (let p = 0; p < 6; p++) {
        const a = (p / 6) * Math.PI * 2
        g.beginPath()
        g.arc(x + dx + Math.cos(a) * 1.6, y - 14 - Math.abs(dx) + Math.sin(a) * 1.6, 1.1, 0, Math.PI * 2)
        g.fill()
      }
      g.fillStyle = '#f5b83d'
      g.beginPath()
      g.arc(x + dx, y - 14 - Math.abs(dx), 0.9, 0, Math.PI * 2)
      g.fill()
    }
    g.fillStyle = col
    g.beginPath()
    g.moveTo(x - 5, y - 8)
    g.lineTo(x + 5, y - 8)
    g.lineTo(x + 3.8, y)
    g.lineTo(x - 3.8, y)
    g.closePath()
    g.fill()
    g.fillStyle = shade(col, -0.18)
    g.fillRect(x - 5.6, y - 9.5, 11.2, 2.4)
  })
}

function paintVeggiePatch(g: CanvasRenderingContext2D, pumpkin: string): void {
  const x0 = -98
  const x1 = -62
  const y = 18
  g.fillStyle = '#9b6a48'
  g.beginPath()
  g.ellipse((x0 + x1) / 2, y, (x1 - x0) / 2 + 3, 4, 0, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#7d5238'
  g.beginPath()
  g.ellipse((x0 + x1) / 2, y + 0.8, (x1 - x0) / 2, 2.6, 0, 0, Math.PI * 2)
  g.fill()
  // Carrot tops.
  g.strokeStyle = '#5a8c46'
  g.lineWidth = 1
  for (let x = x0 + 2; x < x0 + 18; x += 5) {
    g.fillStyle = '#f0a050'
    g.beginPath()
    g.arc(x, y - 0.6, 1.2, 0, Math.PI * 2)
    g.fill()
    for (const dx of [-1.6, 0, 1.6]) {
      g.beginPath()
      g.moveTo(x, y - 1)
      g.lineTo(x + dx, y - 6)
      g.stroke()
    }
  }
  // A pea vine on a stick.
  g.strokeStyle = '#a57a55'
  g.lineWidth = 0.8
  g.beginPath()
  g.moveTo(x0 + 21, y)
  g.lineTo(x0 + 21, y - 14)
  g.stroke()
  g.fillStyle = '#7fb069'
  for (let k = 0; k < 4; k++) {
    g.beginPath()
    g.arc(x0 + 21 + (k % 2 ? 1.6 : -1.6), y - 3 - k * 3, 1.3, 0, Math.PI * 2)
    g.fill()
  }
  // One very big pumpkin.
  const px = x1 - 5
  const py = y - 4
  g.fillStyle = shade(pumpkin, -0.12)
  g.beginPath()
  g.ellipse(px - 3, py, 4, 4.6, 0, 0, Math.PI * 2)
  g.ellipse(px + 3, py, 4, 4.6, 0, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = pumpkin
  g.beginPath()
  g.ellipse(px, py, 4, 5, 0, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#5a8c46'
  g.fillRect(px - 0.6, py - 7, 1.4, 2.6)
}

function paintPicnic(g: CanvasRenderingContext2D, col: string): void {
  // A checked blanket on the grass, seen from the side (a flat parallelogram).
  const x = -24
  const y = 20
  const wdt = 40
  const dep = 7
  const cells = 6
  for (let i = 0; i < cells; i++) {
    for (let j = 0; j < 2; j++) {
      g.fillStyle = (i + j) % 2 ? '#fff6ea' : col
      const ax = x + (i * wdt) / cells + j * 3
      const ay = y - (j * dep) / 2
      g.beginPath()
      g.moveTo(ax, ay)
      g.lineTo(ax + wdt / cells, ay)
      g.lineTo(ax + wdt / cells + 3, ay - dep / 2)
      g.lineTo(ax + 3, ay - dep / 2)
      g.closePath()
      g.fill()
    }
  }
  // A little basket and a cup.
  const bx = x + 28
  const by = y - 4
  g.fillStyle = '#c99a62'
  g.beginPath()
  g.moveTo(bx - 6, by - 6)
  g.lineTo(bx + 6, by - 6)
  g.lineTo(bx + 5, by)
  g.lineTo(bx - 5, by)
  g.closePath()
  g.fill()
  g.strokeStyle = '#a57a55'
  g.lineWidth = 1.2
  g.beginPath()
  g.arc(bx, by - 6, 4.6, Math.PI, 0)
  g.stroke()
  g.fillStyle = '#f5b83d'
  g.beginPath()
  g.arc(bx - 2.6, by - 6.5, 1.6, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#ffffff'
  g.fillRect(x + 10, y - 7, 3.4, 4)
}

function paintTelescope(g: CanvasRenderingContext2D, col: string): void {
  const x = 176
  const y = 14
  groundShadow(g, x, y + 0.5, 9, 1.6)
  g.strokeStyle = '#6c5048'
  g.lineWidth = 1.4
  g.lineCap = 'round'
  g.beginPath()
  g.moveTo(x, y - 14)
  g.lineTo(x - 7, y)
  g.moveTo(x, y - 14)
  g.lineTo(x + 6, y)
  g.moveTo(x, y - 14)
  g.lineTo(x + 1, y + 1)
  g.stroke()
  // The tube, pointing up toward the top of her mountain.
  g.save()
  g.translate(x, y - 15)
  g.rotate(-2.55)
  g.fillStyle = col
  g.beginPath()
  g.moveTo(-6, -2.2)
  g.lineTo(13, -3.2)
  g.lineTo(13, 3.2)
  g.lineTo(-6, 2.2)
  g.closePath()
  g.fill()
  g.fillStyle = '#e0b84a'
  g.fillRect(9, -3.4, 2, 6.8)
  g.fillRect(-6.5, -2.4, 1.6, 4.8)
  g.fillStyle = '#cfe8f2'
  g.fillRect(13, -2.6, 0.9, 5.2)
  g.restore()
}

function paintHook(g: CanvasRenderingContext2D): void {
  // A shepherd's hook with two arms: the lantern on one, the wind chime on the other.
  const x = HOOK_X
  g.strokeStyle = '#4f4866'
  g.lineWidth = 1.6
  g.lineCap = 'round'
  g.beginPath()
  g.moveTo(x, 1)
  g.lineTo(x, -54)
  g.moveTo(x, -50)
  g.quadraticCurveTo(x + 4, -56, x + 9, -54)
  g.moveTo(x, -50)
  g.quadraticCurveTo(x - 4, -56, x - 9, -54)
  g.stroke()
}

// ---------------------------------------------------------------------------------------------
// Moving things (every frame)

interface Frame {
  g: CanvasRenderingContext2D
  t: number
  o: CampSceneOpts
}

/** Points along a sagging string from a to b (quadratic). */
function sagAt(ax: number, ay: number, bx: number, by: number, sag: number, k: number): { x: number; y: number } {
  const mx = (ax + bx) / 2
  const my = (ay + by) / 2 + sag
  const x = (1 - k) * (1 - k) * ax + 2 * (1 - k) * k * mx + k * k * bx
  const y = (1 - k) * (1 - k) * ay + 2 * (1 - k) * k * my + k * k * by
  return { x, y }
}

function sagString(g: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number, sag: number, col: string, lw: number): void {
  g.strokeStyle = col
  g.lineWidth = lw
  g.beginPath()
  g.moveTo(ax, ay)
  g.quadraticCurveTo((ax + bx) / 2, (ay + by) / 2 + sag, bx, by)
  g.stroke()
}

const FAIRY = { ax: TREE_L + 10, ay: -94, bx: TREE_R - 10, by: -92, sag: 20 }

function drawFairyLights(f: Frame, string: boolean): void {
  const { g, t, o } = f
  const lit = has(o, 'deco-fairy-lights')
  if (!lit && !string) return
  sagString(g, FAIRY.ax, FAIRY.ay, FAIRY.bx, FAIRY.by, FAIRY.sag, lit ? '#5e4a44' : 'rgba(108, 80, 72, 0.7)', 0.6)
  if (!lit) return
  const tint = o.decorations.get('deco-fairy-lights') ?? null
  const colours = tint ? [tint, mix(tint, '#ffffff', 0.35)] : ['#ffd56b', '#ff9f7a', '#a8e0c8', '#d7c4f2']
  const n = 22
  for (let i = 1; i < n; i++) {
    const p = sagAt(FAIRY.ax, FAIRY.ay, FAIRY.bx, FAIRY.by, FAIRY.sag, i / n)
    const tw = 0.55 + 0.45 * Math.sin(t * 2.2 + i * 1.7)
    const c = colours[i % colours.length]
    g.fillStyle = rgba(c, 0.25 * tw)
    g.beginPath()
    g.arc(p.x, p.y + 2, 4, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = rgba(c, 0.6 + 0.4 * tw)
    g.beginPath()
    g.ellipse(p.x, p.y + 2, 1.4, 1.9, 0, 0, Math.PI * 2)
    g.fill()
  }
}

function drawPaperBirds(f: Frame): void {
  const { g, t, o } = f
  if (!has(o, 'deco-paper-birds')) return
  const tint = o.decorations.get('deco-paper-birds') ?? null
  const colours = tint ? [tint, mix(tint, '#ffffff', 0.4), shade(tint, -0.15)] : ['#f29bab', '#7cc4e8', '#f5d76e', '#ffffff', '#a8e0c8']
  const spots = [0.18, 0.3, 0.62, 0.74, 0.86]
  spots.forEach((k, i) => {
    const top = sagAt(FAIRY.ax, FAIRY.ay, FAIRY.bx, FAIRY.by, FAIRY.sag, k)
    const len = 9 + (i % 3) * 4
    const sway = Math.sin(t * 1.1 + i) * 1.2
    const bx = top.x + sway
    const by = top.y + len
    g.strokeStyle = 'rgba(108, 80, 72, 0.6)'
    g.lineWidth = 0.4
    g.beginPath()
    g.moveTo(top.x, top.y)
    g.lineTo(bx, by - 1)
    g.stroke()
    // A folded bird, turning slowly on its thread.
    const turn = Math.cos(t * 1.4 + i * 1.3)
    g.save()
    g.translate(bx, by)
    g.scale(0.35 + 0.65 * Math.abs(turn), 1)
    const c = colours[i % colours.length]
    g.fillStyle = c
    g.beginPath()
    g.moveTo(-4.5, 0)
    g.lineTo(0, -3.2)
    g.lineTo(1.2, 0.4)
    g.closePath()
    g.fill()
    g.fillStyle = shade(c, -0.14)
    g.beginPath()
    g.moveTo(1.2, 0.4)
    g.lineTo(4.2, -2.4)
    g.lineTo(3.4, 1.6)
    g.lineTo(-4.5, 0)
    g.closePath()
    g.fill()
    g.restore()
  })
}

function drawBunting(f: Frame): void {
  const { g, t, o } = f
  if (!has(o, 'deco-bunting')) return
  const ax = TREE_L + 6
  const ay = -64
  const bx = TENT_X
  const by = -TENT_H - 15
  const sag = 12
  sagString(g, ax, ay, bx, by, sag, '#6c5048', 0.6)
  const colours = ['#e8735a', '#f5b83d', '#7fb069', '#5aa9e6', '#a678c8', '#f29bab', '#f0a050']
  const n = 7
  for (let i = 0; i < n; i++) {
    const k0 = (i + 0.2) / n
    const k1 = (i + 0.8) / n
    const p0 = sagAt(ax, ay, bx, by, sag, k0)
    const p1 = sagAt(ax, ay, bx, by, sag, k1)
    const flutter = Math.sin(t * 3.4 + i * 0.9) * 1.4
    g.fillStyle = colours[i % colours.length]
    g.beginPath()
    g.moveTo(p0.x, p0.y)
    g.lineTo(p1.x, p1.y)
    g.lineTo((p0.x + p1.x) / 2 + flutter, (p0.y + p1.y) / 2 + 8)
    g.closePath()
    g.fill()
  }
}

function drawCampFlag(f: Frame): void {
  const { g, t, o } = f
  if (!has(o, 'deco-camp-flag')) return
  // Her own flag: her outfit's colour, unless it's a coloured variant.
  const col = o.decorations.get('deco-camp-flag') ?? o.look.outfitColor
  const x = FLAG_X
  const top = -124
  g.strokeStyle = '#7a5a48'
  g.lineWidth = 1.8
  g.lineCap = 'round'
  g.beginPath()
  g.moveTo(x, 0)
  g.lineTo(x, top)
  g.stroke()
  g.fillStyle = '#f5b83d'
  g.beginPath()
  g.arc(x, top - 1, 1.8, 0, Math.PI * 2)
  g.fill()
  const len = 24
  const ht = 15
  const wave = (k: number) => Math.sin(t * 3 - k * 4) * 2.2 * k
  g.fillStyle = col
  g.beginPath()
  g.moveTo(x, top + 1)
  for (let k = 0; k <= 1.001; k += 0.25) g.lineTo(x + len * k, top + 1 + wave(k))
  for (let k = 1; k >= -0.001; k -= 0.25) g.lineTo(x + len * k, top + 1 + ht + wave(k) - k * 1.5)
  g.closePath()
  g.fill()
  // A white star in the middle.
  const sx = x + len * 0.48
  const sy = top + 1 + ht / 2 + wave(0.48) - 0.6
  g.fillStyle = '#ffffff'
  g.beginPath()
  for (let p = 0; p < 10; p++) {
    const a = -Math.PI / 2 + (p * Math.PI) / 5
    const r = p % 2 ? 1.8 : 4.2
    if (p === 0) g.moveTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r)
    else g.lineTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r)
  }
  g.closePath()
  g.fill()
}

function drawSwing(f: Frame): void {
  const { g, t, o } = f
  if (!has(o, 'deco-swing')) return
  const col = tintOf(o, 'deco-swing', '#c98a5a')
  const px = TREE_L + 24
  const py = -58
  const a = Math.sin(t * 1.25) * 0.1
  g.save()
  g.translate(px, py)
  g.rotate(a)
  g.strokeStyle = '#6c5048'
  g.lineWidth = 0.8
  g.beginPath()
  g.moveTo(-6, 0)
  g.lineTo(-6, 42)
  g.moveTo(6, 0)
  g.lineTo(6, 42)
  g.stroke()
  g.fillStyle = col
  g.beginPath()
  g.moveTo(-9, 41)
  g.lineTo(9, 41)
  g.lineTo(9, 44)
  g.lineTo(-9, 44)
  g.closePath()
  g.fill()
  g.restore()
}

function drawBirdFeeder(f: Frame): void {
  const { g, t, o } = f
  if (!has(o, 'deco-bird-feeder')) return
  const col = tintOf(o, 'deco-bird-feeder', '#e8735a')
  const x = TREE_R - 22
  const top = -58
  g.strokeStyle = '#6c5048'
  g.lineWidth = 0.6
  g.beginPath()
  g.moveTo(x, top)
  g.lineTo(x, top + 8)
  g.stroke()
  // Roof, posts, tray.
  g.fillStyle = col
  g.beginPath()
  g.moveTo(x - 8, top + 13)
  g.lineTo(x, top + 7)
  g.lineTo(x + 8, top + 13)
  g.closePath()
  g.fill()
  g.fillStyle = '#9b6a48'
  g.fillRect(x - 6, top + 13, 1.2, 7)
  g.fillRect(x + 4.8, top + 13, 1.2, 7)
  g.fillRect(x - 7.5, top + 20, 15, 1.8)
  g.fillStyle = '#e8c27a'
  g.beginPath()
  g.ellipse(x, top + 19.6, 4, 1.2, 0, Math.PI, 0)
  g.fill()
  // A little bird hops about on the tray.
  const cyc = t % 5
  const hop = cyc < 0.6 ? Math.sin((cyc / 0.6) * Math.PI) * 2.4 : 0
  const peck = cyc > 2.4 && cyc < 3.2 ? 1 : 0
  const bx = x + 3.6 - (cyc > 0.6 && cyc < 2.4 ? 1.6 : 0)
  const by = top + 18 - hop
  g.fillStyle = '#5aa9e6'
  g.beginPath()
  g.ellipse(bx, by, 2.6, 2.1, peck * 0.4, 0, Math.PI * 2)
  g.fill()
  g.beginPath()
  g.arc(bx - 1.6, by - 1.6 + peck, 1.5, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#f5b83d'
  g.beginPath()
  g.moveTo(bx - 3, by - 1.8 + peck)
  g.lineTo(bx - 4.4, by - 1.2 + peck)
  g.lineTo(bx - 3, by - 0.8 + peck)
  g.fill()
  g.fillStyle = '#2f1d22'
  g.beginPath()
  g.arc(bx - 2, by - 2 + peck, 0.35, 0, Math.PI * 2)
  g.fill()
}

function drawLanternAndChime(f: Frame): void {
  const { g, t, o } = f
  const x = HOOK_X
  if (has(o, 'deco-lantern')) {
    const col = tintOf(o, 'deco-lantern', '#e8735a')
    const lx = x + 9
    const ly = -42
    const flick = 0.85 + Math.sin(t * 7.3) * 0.06 + Math.sin(t * 3.1) * 0.06
    const glow = g.createRadialGradient(lx, ly, 1, lx, ly, 20)
    glow.addColorStop(0, `rgba(255, 210, 130, ${0.42 * flick})`)
    glow.addColorStop(1, 'rgba(255, 210, 130, 0)')
    g.fillStyle = glow
    g.fillRect(lx - 20, ly - 20, 40, 40)
    g.strokeStyle = '#4f4866'
    g.lineWidth = 0.5
    g.beginPath()
    g.moveTo(lx, -54)
    g.lineTo(lx, ly - 8)
    g.stroke()
    g.fillStyle = mix(col, '#fff3c4', 0.35 * flick)
    g.beginPath()
    g.ellipse(lx, ly, 6, 7.4, 0, 0, Math.PI * 2)
    g.fill()
    g.strokeStyle = rgba(shade(col, -0.2), 0.55)
    g.lineWidth = 0.6
    for (const k of [-0.55, 0, 0.55]) {
      g.beginPath()
      g.ellipse(lx, ly, 6 * Math.abs(k) + 0.01, 7.4, 0, -Math.PI / 2, Math.PI / 2, k < 0)
      g.stroke()
    }
    g.fillStyle = '#4f4866'
    g.fillRect(lx - 2.6, ly - 8.4, 5.2, 1.6)
    g.fillRect(lx - 2.2, ly + 6.8, 4.4, 1.4)
  }
  if (has(o, 'deco-wind-chime')) {
    const col = tintOf(o, 'deco-wind-chime', '#c3cad8')
    const cx = x - 9
    const top = -54
    const swing = Math.sin(t * 1.6) * 0.08
    g.save()
    g.translate(cx, top)
    g.rotate(swing)
    g.strokeStyle = '#6c5048'
    g.lineWidth = 0.4
    g.beginPath()
    g.moveTo(0, 0)
    g.lineTo(0, 5)
    g.stroke()
    g.fillStyle = '#9b6a48'
    g.beginPath()
    g.ellipse(0, 6, 5, 1.2, 0, 0, Math.PI * 2)
    g.fill()
    const lens = [9, 12, 10, 7]
    lens.forEach((len, i) => {
      const tx = -3.6 + i * 2.4
      const a = Math.sin(t * 2.3 + i * 1.1) * 0.12
      g.save()
      g.translate(tx, 7)
      g.rotate(a)
      g.strokeStyle = 'rgba(108, 80, 72, 0.6)'
      g.beginPath()
      g.moveTo(0, 0)
      g.lineTo(0, 2)
      g.stroke()
      g.fillStyle = i % 2 ? mix(col, '#ffffff', 0.35) : col
      g.fillRect(-0.7, 2, 1.4, len)
      g.restore()
    })
    g.restore()
  }
}

function drawMoonLamp(f: Frame): void {
  const { g, t, o } = f
  if (!has(o, 'deco-moon-lamp')) return
  const col = tintOf(o, 'deco-moon-lamp', '#fff1c2')
  const x = TENT_X + 2
  const y = -15
  const pulse = 0.85 + 0.15 * Math.sin(t * 1.3)
  const glow = g.createRadialGradient(x, y, 1, x, y, 16)
  glow.addColorStop(0, rgba(col, 0.55 * pulse))
  glow.addColorStop(1, rgba(col, 0))
  g.fillStyle = glow
  g.fillRect(x - 16, y - 16, 32, 32)
  g.fillStyle = col
  g.beginPath()
  g.arc(x, y, 4.6, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = rgba(shade(col, -0.18), 0.5)
  g.beginPath()
  g.arc(x - 1.4, y - 1, 1, 0, Math.PI * 2)
  g.arc(x + 1.6, y + 1.4, 0.8, 0, Math.PI * 2)
  g.fill()
}

function drawKite(f: Frame): void {
  const { g, t, o } = f
  if (!has(o, 'deco-kite')) return
  const col = tintOf(o, 'deco-kite', '#f0a050')
  // High over the right-hand tree, its string down past the hammock to a peg in the grass.
  const kx = 156 + Math.sin(t * 0.6) * 5
  const ky = -146 + Math.sin(t * 0.9) * 3
  const peg = { x: 166, y: 6 }
  g.strokeStyle = 'rgba(108, 80, 72, 0.6)'
  g.lineWidth = 0.5
  g.beginPath()
  g.moveTo(kx - 4, ky + 4)
  g.quadraticCurveTo(kx - 8, ky + 80, peg.x, peg.y)
  g.stroke()
  g.fillStyle = '#9b6a48'
  g.fillRect(peg.x - 0.6, peg.y - 2, 1.4, 4)
  // A fish that swims in the wind: body, tail, fins, an eye and scales.
  const sw = Math.sin(t * 2.6)
  g.save()
  g.translate(kx, ky)
  g.rotate(-0.25 + sw * 0.05)
  g.fillStyle = col
  g.beginPath()
  g.ellipse(0, 0, 12, 6, 0, 0, Math.PI * 2)
  g.fill()
  g.beginPath()
  g.moveTo(10, 0)
  g.quadraticCurveTo(18, -6 + sw * 2, 22, -7 + sw * 3)
  g.quadraticCurveTo(19, 0, 22, 7 + sw * 3)
  g.quadraticCurveTo(18, 6 + sw * 2, 10, 0)
  g.fill()
  g.fillStyle = '#ffffff'
  g.beginPath()
  g.ellipse(-3, 1.6, 7, 2.6, 0, 0, Math.PI)
  g.fill()
  g.fillStyle = shade(col, -0.2)
  for (const sx of [-1, 3, 7]) {
    g.beginPath()
    g.arc(sx, -1.2, 1.8, Math.PI * 0.1, Math.PI * 0.9)
    g.fill()
  }
  g.fillStyle = '#ffffff'
  g.beginPath()
  g.arc(-7.4, -1.4, 2, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#2f1d22'
  g.beginPath()
  g.arc(-7.8, -1.4, 1, 0, Math.PI * 2)
  g.fill()
  g.restore()
}

function drawKettle(f: Frame): void {
  const { g, t, o } = f
  if (!has(o, 'deco-kettle')) return
  const col = tintOf(o, 'deco-kettle', '#5aa9e6')
  const x = 8
  const y = 0
  g.fillStyle = '#b7a99c'
  g.beginPath()
  g.ellipse(x, y, 8, 2.4, 0, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = col
  g.beginPath()
  g.moveTo(x - 6, y - 1.5)
  g.quadraticCurveTo(x - 7, y - 10, x, y - 10.5)
  g.quadraticCurveTo(x + 7, y - 10, x + 6, y - 1.5)
  g.closePath()
  g.fill()
  // Spout toward the fire.
  g.beginPath()
  g.moveTo(x - 5, y - 4)
  g.lineTo(x - 11, y - 9)
  g.lineTo(x - 10, y - 10)
  g.lineTo(x - 4.5, y - 6.5)
  g.closePath()
  g.fill()
  g.strokeStyle = '#4f4866'
  g.lineWidth = 0.9
  g.beginPath()
  g.arc(x, y - 10.5, 4.2, Math.PI * 1.1, Math.PI * 1.9)
  g.stroke()
  g.fillStyle = 'rgba(255, 255, 255, 0.45)'
  g.beginPath()
  g.ellipse(x - 2.6, y - 7, 1.2, 2.2, -0.3, 0, Math.PI * 2)
  g.fill()
  // Steam curling up from the spout.
  for (let i = 0; i < 4; i++) {
    const k = (t * 0.45 + i / 4) % 1
    const sx = x - 10.5 + Math.sin(t * 1.6 + i * 2) * 2 * k - k * 3
    const sy = y - 11 - k * 22
    g.fillStyle = `rgba(255, 255, 255, ${(1 - k) * 0.55})`
    g.beginPath()
    g.arc(sx, sy, 1.4 + k * 2.4, 0, Math.PI * 2)
    g.fill()
  }
}

function drawPinwheels(f: Frame): void {
  const { g, t, o } = f
  if (!has(o, 'deco-pinwheels')) return
  const tint = o.decorations.get('deco-pinwheels') ?? null
  const colours = tint ? [tint, mix(tint, '#ffffff', 0.45)] : ['#e8735a', '#f5b83d', '#5aa9e6', '#7fb069']
  ;[
    [112, 16, 1.0],
    [124, 19, 0.85],
  ].forEach(([x, y, s], i) => {
    const top = y - 20 * s
    g.strokeStyle = '#8a5a3c'
    g.lineWidth = 0.9
    g.beginPath()
    g.moveTo(x, y)
    g.lineTo(x, top)
    g.stroke()
    g.save()
    g.translate(x, top)
    g.rotate(t * (2.2 + i * 0.7))
    for (let b = 0; b < 4; b++) {
      g.rotate(Math.PI / 2)
      g.fillStyle = colours[(b + i) % colours.length]
      g.beginPath()
      g.moveTo(0, 0)
      g.lineTo(6.5 * s, -1)
      g.lineTo(5 * s, 4 * s)
      g.closePath()
      g.fill()
    }
    g.fillStyle = '#ffffff'
    g.beginPath()
    g.arc(0, 0, 0.9, 0, Math.PI * 2)
    g.fill()
    g.restore()
  })
}

// ---------------------------------------------------------------------------------------------
// The fire

function paintFire(g: CanvasRenderingContext2D, t: number): void {
  const fx = FIRE_X
  const fy = -4
  const flick = 1 + Math.sin(t * 13) * 0.06 + Math.sin(t * 7.3) * 0.05
  const r = 70 * flick
  const glow = g.createRadialGradient(fx, fy, 2, fx, fy, r)
  glow.addColorStop(0, 'rgba(255, 196, 100, 0.42)')
  glow.addColorStop(1, 'rgba(255, 196, 100, 0)')
  g.fillStyle = glow
  g.fillRect(fx - r, fy - r, r * 2, r * 2)
  const flame = (scale: number, color: string, sway: number) => {
    const fh = 24 * scale * flick
    const fw = 9 * scale
    g.fillStyle = color
    g.beginPath()
    g.moveTo(fx - fw, fy)
    g.quadraticCurveTo(fx - fw * 1.1, fy - fh * 0.5, fx + sway, fy - fh)
    g.quadraticCurveTo(fx + fw * 1.1, fy - fh * 0.5, fx + fw, fy)
    g.quadraticCurveTo(fx, fy + 3, fx - fw, fy)
    g.fill()
  }
  flame(1, '#f08c3a', Math.sin(t * 5) * 3)
  flame(0.72, '#f5b83d', Math.sin(t * 6.4 + 1) * 2.4)
  flame(0.4, '#fff2c4', Math.sin(t * 8 + 2) * 1.6)
  for (let i = 0; i < 6; i++) {
    const k = (t * 0.55 + i / 6) % 1
    const sx = fx + Math.sin(t * 2 + i * 1.7) * 8 * k + (i - 2.5) * 2
    const sy = fy - 20 - k * 60
    g.fillStyle = `rgba(255, 210, 120, ${(1 - k) * 0.9})`
    g.beginPath()
    g.arc(sx, sy, 1.4 * (1 - k * 0.5), 0, Math.PI * 2)
    g.fill()
  }
}

// ---------------------------------------------------------------------------------------------

const PACK_MOODS: GoatMood[] = ['peek', 'curious', 'peek', 'happy', 'peek', 'sleepy']
const OUT_MOODS: GoatMood[] = ['happy', 'curious', 'happy', 'laugh', 'proud', 'sleepy']

/** Start the animated camp picture on `canvas` (sized by CSS). Call stop() on unmount. */
export function campScene(canvas: HTMLCanvasElement, opts: CampSceneOpts): CampScene {
  let L: Layout | null = null
  const loop = animate(
    canvas,
    (t) => {
      if (!L || L.w !== canvas.clientWidth || L.h !== canvas.clientHeight) {
        if (L) releaseCanvas(L.bg)
        L = layout(canvas, opts)
      }
      const g = canvas.getContext('2d')
      if (!L || !g) return
      const lay = L
      g.setTransform(1, 0, 0, 1, 0, 0)
      g.drawImage(lay.bg, 0, 0)
      g.setTransform(lay.dpr, 0, 0, lay.dpr, 0, 0)
      const f: Frame = { g, t, o: opts }
      inScene(g, lay, () => {
        drawCampFlag(f)
        drawSwing(f)
        drawBirdFeeder(f)
        drawFairyLights(f, has(opts, 'deco-paper-birds'))
        drawPaperBirds(f)
        drawBunting(f)
        drawKite(f)
        drawMoonLamp(f)
        drawLanternAndChime(f)
        paintFire(g, t)
        drawKettle(f)

        // Her, sitting by the fire (facing it); the goat in her backpack, or beside her.
        const moods = opts.goatOut ? OUT_MOODS : PACK_MOODS
        const mood = moods[Math.floor(t / 5) % moods.length]
        const s = 1.35
        g.save()
        g.translate(CLIMBER_X, -1)
        g.scale(s, s)
        drawClimber(g, {
          look: opts.look,
          pose: sit(t),
          expression: !opts.goatOut && mood === 'sleepy' ? 'sleepy' : 'happy',
          facing: -1,
          t,
          goat: opts.goatOut ? null : { mood, t, inBackpack: true },
        })
        g.restore()
        if (opts.goatOut) {
          g.save()
          g.translate(GOAT_X, has(opts, 'deco-goat-bed') ? -1.5 : 0)
          g.scale(s, s)
          drawGoat(g, { mood, t, inBackpack: !opts.goatOut, facing: -1, lookX: -0.4 })
          g.restore()
        }
        drawPinwheels(f)
      })
    },
    { fps: 30 },
  )
  return {
    stop() {
      loop.stop()
      if (L) releaseCanvas(L.bg)
      releaseCanvas(canvas)
    },
  }
}
