/**
 * Smooth vertical-follow camera with a zoom (Big Leap pull-back). The pitch is 400 wide and every
 * supported view is at least TUNING.viewMinW wide, so x is always centred; only y and zoom move.
 */
import { TUNING } from './tuning'
import { WORLD_W } from './types'

export interface Insets {
  top: number
  right: number
  bottom: number
  left: number
}

export class Camera {
  /** CSS px. */
  viewW = 1
  viewH = 1
  /** Canvas device-pixel ratio (capped). */
  dpr = 1
  /** Base CSS px per world unit (fits ≥ viewMinW × viewMinH units). */
  baseScale = 1
  zoom = 1
  /** World altitude at the centre of the safe rect. */
  centerY = 300
  insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 }
  /** The device asks for reduced motion: shake() does nothing (set by the screen; no DOM here). */
  reducedMotion = false

  private targetY = 300
  private targetZoom = 1
  private shakeT = 0
  private shakeMag = 0

  resize(viewW: number, viewH: number, insets: Insets, devicePixelRatio: number): void {
    this.viewW = Math.max(1, viewW)
    this.viewH = Math.max(1, viewH)
    this.insets = insets
    this.dpr = Math.min(TUNING.maxDpr, Math.max(1, devicePixelRatio || 1))
    const usableH = Math.max(1, this.viewH - insets.top - insets.bottom)
    this.baseScale = Math.min(this.viewW / TUNING.viewMinW, usableH / TUNING.viewMinH)
  }

  get scale(): number {
    return this.baseScale * this.zoom
  }

  /** Visible world height (units) at the current zoom. */
  get worldViewH(): number {
    return this.viewH / this.scale
  }

  /** Screen y (CSS px) of the safe rect's centre. */
  private get screenCenterY(): number {
    return this.insets.top + (this.viewH - this.insets.top - this.insets.bottom) / 2
  }

  worldToScreen(x: number, y: number): { x: number; y: number } {
    const s = this.scale
    return { x: this.viewW / 2 + (x - WORLD_W / 2) * s + this.shakeX(), y: this.screenCenterY - (y - this.centerY) * s }
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    const s = this.scale
    return { x: WORLD_W / 2 + (sx - this.viewW / 2) / s, y: this.centerY - (sy - this.screenCenterY) / s }
  }

  /** Where the camera should head (world altitude at centre) and how far zoomed out. */
  setTarget(centerY: number, zoom = 1): void {
    this.targetY = centerY
    this.targetZoom = zoom
  }

  /** Jump straight to the target (on mount, after a resize). */
  snap(): void {
    this.centerY = this.targetY
    this.zoom = this.targetZoom
  }

  /** Gentle rumble (Looks Scary "rumbling cliff"). Visual only; never with reduced motion. */
  shake(magnitude: number, seconds: number): void {
    if (this.reducedMotion) return
    this.shakeMag = Math.max(this.shakeMag, magnitude)
    this.shakeT = Math.max(this.shakeT, seconds)
  }

  update(dt: number, levelHeight: number): void {
    const k = 1 - Math.exp(-TUNING.cameraFollow * dt)
    this.zoom += (this.targetZoom - this.zoom) * k
    // Don't show much below the pitch's foot or far above its top — measured on the safe rect (the
    // part of the screen the HUD doesn't cover), so the foot of a pitch never sits under the HUD.
    const half = (this.viewH - this.insets.top - this.insets.bottom) / this.scale / 2
    const minY = half - 90
    const maxY = Math.max(minY, levelHeight + 160 - half)
    const target = Math.min(maxY, Math.max(minY, this.targetY))
    this.centerY += (target - this.centerY) * k
    if (this.shakeT > 0) {
      this.shakeT = Math.max(0, this.shakeT - dt)
      if (this.shakeT === 0) this.shakeMag = 0
    }
  }

  private shakeX(): number {
    if (this.shakeT <= 0) return 0
    return Math.sin(performance.now() / 23) * this.shakeMag * Math.min(1, this.shakeT * 3)
  }
}
