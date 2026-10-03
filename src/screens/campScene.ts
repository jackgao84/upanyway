/**
 * The camp picture: her mountain (Sky Lake glinting on top) behind a meadow camp — tent, a small
 * crackling fire, a little cairn of her stones — and her, sitting by the fire with the goat
 * peeking out of the backpack. Static layers are painted once per size; each frame adds the fire,
 * its glow, sparks and the two of them breathing and blinking.
 */
import { animate, releaseCanvas } from '../app/context'
import { drawClimber } from '../game/art/climber'
import type { GoatMood } from '../game/art/goat'
import { sit } from '../game/art/poses'
import { TUNING } from '../game/tuning'
import type { ClimberLook } from '../storage/schema'

export interface CampSceneOpts {
  look: ClimberLook
  /** Stones in her cairn (the picture shows up to nine). */
  stones: number
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

const STONE_COLOURS = ['#cfc6ba', '#b9b2cc', '#d8c4a6', '#aebdb2', '#d2b7a9', '#c4cbd6', '#e0cfa4', '#b7a99c', '#c9d3bf']
const MAX_PICTURE_STONES = 9
const FIRE_X = -26
const CLIMBER_X = 46
const TENT_X = -112
const CAIRN_X = 122

function layout(canvas: HTMLCanvasElement, opts: CampSceneOpts): Layout | null {
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  if (!w || !h) return null
  const dpr = Math.min(TUNING.maxDpr, Math.max(1, window.devicePixelRatio || 1))
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  // The camp group (tent → cairn) is about 320 × 190 units; fit it, let sky and hills fill the rest.
  const u = Math.min(w / 320, h / 190)
  const gy = h - Math.min(h * 0.16, 30 * u)
  const bg = document.createElement('canvas')
  bg.width = canvas.width
  bg.height = canvas.height
  const L: Layout = { w, h, dpr, u, cx: w / 2, gy, bg }
  const g = bg.getContext('2d')
  if (g) {
    g.scale(dpr, dpr)
    paintStatic(g, L, opts.stones)
  }
  return L
}

function paintStatic(g: CanvasRenderingContext2D, L: Layout, stones: number): void {
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
  // Snow cap
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

  paintTent(g, cx + TENT_X * u, gy, u)
  paintCairn(g, cx + CAIRN_X * u, gy, u, Math.min(MAX_PICTURE_STONES, stones))

  // Fire ring + logs
  const fx = cx + FIRE_X * u
  g.fillStyle = 'rgba(61, 42, 36, 0.18)'
  g.beginPath()
  g.ellipse(fx, gy + 1 * u, 20 * u, 4 * u, 0, 0, Math.PI * 2)
  g.fill()
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * (0.05 + (i / 6) * 0.9)
    g.fillStyle = i % 2 ? '#b7a99c' : '#cfc6ba'
    g.beginPath()
    g.ellipse(fx - Math.cos(a) * 18 * u, gy + 1.5 * u - Math.sin(a) * 1.5 * u, 4.6 * u, 3.2 * u, 0, 0, Math.PI * 2)
    g.fill()
  }
  g.strokeStyle = '#7a4b33'
  g.lineCap = 'round'
  g.lineWidth = 4.2 * u
  g.beginPath()
  g.moveTo(fx - 12 * u, gy - 0.5 * u)
  g.lineTo(fx + 10 * u, gy - 5 * u)
  g.moveTo(fx + 12 * u, gy - 0.5 * u)
  g.lineTo(fx - 10 * u, gy - 5 * u)
  g.stroke()
}

function paintTent(g: CanvasRenderingContext2D, x: number, gy: number, u: number): void {
  const w = 92 * u
  const ht = 66 * u
  g.fillStyle = 'rgba(61, 42, 36, 0.16)'
  g.beginPath()
  g.ellipse(x, gy + 1 * u, w * 0.58, 5 * u, 0, 0, Math.PI * 2)
  g.fill()
  // Body
  g.fillStyle = '#f08c70'
  g.beginPath()
  g.moveTo(x - w / 2, gy)
  g.quadraticCurveTo(x - w * 0.2, gy - ht * 0.55, x, gy - ht)
  g.quadraticCurveTo(x + w * 0.2, gy - ht * 0.55, x + w / 2, gy)
  g.closePath()
  g.fill()
  g.fillStyle = '#e8735a'
  g.beginPath()
  g.moveTo(x, gy - ht)
  g.quadraticCurveTo(x + w * 0.2, gy - ht * 0.55, x + w / 2, gy)
  g.lineTo(x + w * 0.12, gy)
  g.closePath()
  g.fill()
  // Door, flap tied open, warm light inside
  g.fillStyle = '#5e3a2e'
  g.beginPath()
  g.moveTo(x - 13 * u, gy)
  g.quadraticCurveTo(x - 4 * u, gy - ht * 0.4, x, gy - ht * 0.62)
  g.quadraticCurveTo(x + 4 * u, gy - ht * 0.4, x + 13 * u, gy)
  g.closePath()
  g.fill()
  g.fillStyle = 'rgba(255, 200, 120, 0.35)'
  g.beginPath()
  g.ellipse(x, gy - 7 * u, 8 * u, 5 * u, 0, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#fcd9cd'
  g.beginPath()
  g.moveTo(x, gy - ht * 0.62)
  g.quadraticCurveTo(x - 10 * u, gy - ht * 0.32, x - 20 * u, gy - 6 * u)
  g.quadraticCurveTo(x - 9 * u, gy - ht * 0.22, x - 4 * u, gy - ht * 0.45)
  g.closePath()
  g.fill()
  // Pennant
  g.strokeStyle = '#6c5048'
  g.lineWidth = Math.max(1, 1.4 * u)
  g.beginPath()
  g.moveTo(x, gy - ht)
  g.lineTo(x, gy - ht - 16 * u)
  g.stroke()
  g.fillStyle = '#f5b83d'
  g.beginPath()
  g.moveTo(x, gy - ht - 16 * u)
  g.lineTo(x + 13 * u, gy - ht - 12 * u)
  g.lineTo(x, gy - ht - 8 * u)
  g.fill()
  // Guy lines
  g.strokeStyle = 'rgba(108, 80, 72, 0.5)'
  g.lineWidth = Math.max(1, 0.9 * u)
  g.beginPath()
  g.moveTo(x - w * 0.32, gy - ht * 0.42)
  g.lineTo(x - w * 0.66, gy)
  g.moveTo(x + w * 0.32, gy - ht * 0.42)
  g.lineTo(x + w * 0.66, gy)
  g.stroke()
}

function paintCairn(g: CanvasRenderingContext2D, x: number, gy: number, u: number, n: number): void {
  // A flat base rock, then her stones, smaller as they go up.
  g.fillStyle = 'rgba(61, 42, 36, 0.16)'
  g.beginPath()
  g.ellipse(x, gy + 1 * u, 20 * u, 3.6 * u, 0, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#a99a8c'
  g.beginPath()
  g.ellipse(x, gy - 3 * u, 18 * u, 5 * u, 0, 0, Math.PI * 2)
  g.fill()
  let y = gy - 7 * u
  for (let i = 0; i < n; i++) {
    const rw = (15 - i * 1.1) * u
    const rh = (5.2 - i * 0.22) * u
    const off = (i % 2 ? 1 : -1) * (i * 0.35) * u
    g.fillStyle = STONE_COLOURS[i % STONE_COLOURS.length]
    g.beginPath()
    g.ellipse(x + off, y - rh, rw, rh, (i % 3 - 1) * 0.06, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = 'rgba(255, 255, 255, 0.35)'
    g.beginPath()
    g.ellipse(x + off - rw * 0.3, y - rh * 1.45, rw * 0.35, rh * 0.28, 0, 0, Math.PI * 2)
    g.fill()
    y -= rh * 1.8
  }
}

function paintFire(g: CanvasRenderingContext2D, L: Layout, t: number): void {
  const { u, cx, gy } = L
  const fx = cx + FIRE_X * u
  const fy = gy - 4 * u
  const flick = 1 + Math.sin(t * 13) * 0.06 + Math.sin(t * 7.3) * 0.05
  // Glow (one radial gradient per frame, small).
  const r = 70 * u * flick
  const glow = g.createRadialGradient(fx, fy, 2 * u, fx, fy, r)
  glow.addColorStop(0, 'rgba(255, 196, 100, 0.42)')
  glow.addColorStop(1, 'rgba(255, 196, 100, 0)')
  g.fillStyle = glow
  g.fillRect(fx - r, fy - r, r * 2, r * 2)
  const flame = (scale: number, color: string, sway: number) => {
    const fh = 24 * u * scale * flick
    const fw = 9 * u * scale
    g.fillStyle = color
    g.beginPath()
    g.moveTo(fx - fw, fy)
    g.quadraticCurveTo(fx - fw * 1.1, fy - fh * 0.5, fx + sway * u, fy - fh)
    g.quadraticCurveTo(fx + fw * 1.1, fy - fh * 0.5, fx + fw, fy)
    g.quadraticCurveTo(fx, fy + 3 * u, fx - fw, fy)
    g.fill()
  }
  flame(1, '#f08c3a', Math.sin(t * 5) * 3)
  flame(0.72, '#f5b83d', Math.sin(t * 6.4 + 1) * 2.4)
  flame(0.4, '#fff2c4', Math.sin(t * 8 + 2) * 1.6)
  // Sparks drifting up.
  for (let i = 0; i < 6; i++) {
    const k = (t * 0.55 + i / 6) % 1
    const sx = fx + Math.sin(t * 2 + i * 1.7) * 8 * u * k + (i - 2.5) * 2 * u
    const sy = fy - 20 * u - k * 60 * u
    g.fillStyle = `rgba(255, 210, 120, ${(1 - k) * 0.9})`
    g.beginPath()
    g.arc(sx, sy, Math.max(0.8, 1.4 * u * (1 - k * 0.5)), 0, Math.PI * 2)
    g.fill()
  }
}

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
      g.setTransform(1, 0, 0, 1, 0, 0)
      g.drawImage(L.bg, 0, 0)
      g.setTransform(L.dpr, 0, 0, L.dpr, 0, 0)
      paintFire(g, L, t)
      // Her, sitting by the fire (facing it), the goat peeking over her shoulder.
      const s = L.u * 1.25
      const moods: GoatMood[] = ['peek', 'curious', 'peek', 'happy', 'peek', 'sleepy']
      const mood = moods[Math.floor(t / 5) % moods.length]
      g.save()
      g.translate(L.cx + CLIMBER_X * L.u, L.gy - 1 * L.u)
      g.scale(s, s)
      drawClimber(g, {
        look: opts.look,
        pose: sit(t),
        expression: mood === 'sleepy' ? 'sleepy' : 'happy',
        facing: -1,
        t,
        goat: { mood, t, inBackpack: true },
      })
      g.restore()
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
