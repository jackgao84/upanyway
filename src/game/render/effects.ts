/**
 * Small shared helpers for the world renderer: the per-frame world→screen mapping (View), eases,
 * squash-and-stretch factors and a pre-rendered screen vignette.
 */
import type { Camera } from '../camera'
import type { ClimbSession } from '../engine'
import { WORLD_W } from '../types'

// ---------------------------------------------------------------------------------------------
// Eases

export const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t)
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - clamp01(t), 3)
export const easeInCubic = (t: number): number => Math.pow(clamp01(t), 3)
export const easeInOutSine = (t: number): number => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(t))
export const smoothstep = (t: number): number => {
  const k = clamp01(t)
  return k * k * (3 - 2 * k)
}
export function easeOutBack(t: number, s = 1.70158): number {
  const k = clamp01(t) - 1
  return 1 + (s + 1) * k * k * k + s * k * k
}
/** 0 → 1 → 0 over t in 0..1. */
export const bump = (t: number): number => Math.sin(Math.PI * clamp01(t))

// ---------------------------------------------------------------------------------------------
// World → screen for one frame

/**
 * The camera mapping frozen for one frame, without per-call allocation:
 * screen (CSS px) = (ox + x·s, oy − y·s). World y is up.
 */
export class View {
  /** CSS px per world unit (camera.scale). */
  s = 1
  ox = 0
  oy = 0
  dpr = 1
  w = 1
  h = 1
  zoom = 1
  /** Base scale (zoom 1). */
  base = 1

  from(camera: Camera): this {
    const p = camera.worldToScreen(0, 0)
    this.s = camera.scale
    this.ox = p.x
    this.oy = p.y
    this.dpr = camera.dpr
    this.w = camera.viewW
    this.h = camera.viewH
    this.zoom = camera.zoom
    this.base = camera.baseScale
    return this
  }

  x(wx: number): number {
    return this.ox + wx * this.s
  }

  y(wy: number): number {
    return this.oy - wy * this.s
  }

  /** World altitude at the top / bottom edge of the screen. */
  get top(): number {
    return this.oy / this.s
  }

  get bottom(): number {
    return (this.oy - this.h) / this.s
  }

  /** World x at the left / right edge of the screen. */
  get left(): number {
    return -this.ox / this.s
  }

  get right(): number {
    return (this.w - this.ox) / this.s
  }

  /** Set ctx so drawing at (x, −y) in world units lands on screen (art coords: y-down). */
  applyWorld(ctx: CanvasRenderingContext2D): void {
    const d = this.dpr
    ctx.setTransform(d * this.s, 0, 0, d * this.s, d * this.ox, d * this.oy)
  }

  /** Set ctx to CSS px. */
  applyScreen(ctx: CanvasRenderingContext2D): void {
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
  }

  /** The centre of the pitch on screen (x). */
  get centerX(): number {
    return this.ox + (WORLD_W / 2) * this.s
  }
}

// ---------------------------------------------------------------------------------------------
// Squash and stretch

export interface Squash {
  sx: number
  sy: number
}

const LAUNCH_T = 0.2
const LAND_T = 0.26

/**
 * Squash-and-stretch from the session's last launch / landing (pitch clock): a quick stretch as she
 * leaves the rock, a soft squash with a little overshoot as she lands. Writes into `out`.
 */
export function squashStretch(session: ClimbSession, out: Squash = { sx: 1, sy: 1 }): Squash {
  const now = session.t
  const sinceLand = now - session.lastLandAt
  const sinceLaunch = now - session.lastLaunchAt
  out.sx = 1
  out.sy = 1
  if (sinceLand >= 0 && sinceLand < LAND_T && session.lastLandAt >= session.lastLaunchAt) {
    const k = sinceLand / LAND_T
    // Squash, then spring back past 1 a touch.
    const a = Math.sin(k * Math.PI * 1.5) * (1 - k)
    out.sy = 1 - 0.2 * a
    out.sx = 1 + 0.16 * a
  } else if (sinceLaunch >= 0 && sinceLaunch < LAUNCH_T) {
    const k = sinceLaunch / LAUNCH_T
    const power = session.lastLaunch ? session.lastLaunch.power : 0.6
    const a = (1 - k) * (1 - k) * (0.5 + 0.5 * power)
    out.sy = 1 + 0.2 * a
    out.sx = 1 - 0.12 * a
  }
  return out
}

// ---------------------------------------------------------------------------------------------
// Vignette

/** A soft edge darkening, pre-rendered once into a small canvas and stretched over the screen. */
export class Vignette {
  private canvas: HTMLCanvasElement | null = null

  constructor(
    private readonly color: string,
    private readonly strength: number,
  ) {}

  draw(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    if (this.strength <= 0) return
    if (!this.canvas) this.canvas = this.build()
    if (!this.canvas) return
    ctx.drawImage(this.canvas, 0, 0, w, h)
  }

  private build(): HTMLCanvasElement | null {
    const c = document.createElement('canvas')
    c.width = 128
    c.height = 128
    const g = c.getContext('2d')
    if (!g) return null
    const grad = g.createRadialGradient(64, 60, 22, 64, 64, 92)
    grad.addColorStop(0, hexA(this.color, 0))
    grad.addColorStop(0.62, hexA(this.color, this.strength * 0.25))
    grad.addColorStop(1, hexA(this.color, this.strength))
    g.fillStyle = grad
    g.fillRect(0, 0, 128, 128)
    return c
  }

  destroy(): void {
    if (this.canvas) {
      this.canvas.width = 0
      this.canvas.height = 0
      this.canvas = null
    }
  }
}

function hexA(hex: string, a: number): string {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h, 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

// ---------------------------------------------------------------------------------------------
// Canvas helpers

/** A fresh offscreen canvas (never OffscreenCanvas: iPadOS 15). */
export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.ceil(w))
  c.height = Math.max(1, Math.ceil(h))
  return c
}

/** Release a canvas's backing store (Safari keeps it alive otherwise). */
export function freeCanvas(c: HTMLCanvasElement | null | undefined): void {
  if (!c) return
  c.width = 0
  c.height = 0
}

/** A soft round dot (white, alpha falloff) — tinted copies are made with tintSprite. */
export function softDot(size: number, color: string, hardness = 0.25): HTMLCanvasElement {
  const c = makeCanvas(size, size)
  const g = c.getContext('2d')
  if (!g) return c
  const r = size / 2
  const grad = g.createRadialGradient(r, r, 0, r, r, r)
  grad.addColorStop(0, hexA(color, 1))
  grad.addColorStop(hardness, hexA(color, 0.75))
  grad.addColorStop(1, hexA(color, 0))
  g.fillStyle = grad
  g.fillRect(0, 0, size, size)
  return c
}
