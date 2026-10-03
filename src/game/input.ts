/**
 * The one gesture: touch, drag back, release (slingshot). Pointer Events on the canvas
 * (`touch-action: none`). The drag can start anywhere; releasing with a tiny drag, or with the finger
 * back on the climber, cancels. pointercancel / lostpointercapture / a second finger always cancel —
 * they never launch.
 */
import type { ClimbSession } from './engine'
import { TUNING } from './tuning'

export interface AimInputDeps {
  session: () => ClimbSession | null
  /** Climber centre in client (CSS) px and her hit radius in px. */
  climberClient: () => { x: number; y: number; r: number }
  maxDragPx: () => number
  /** Called after every aim change (null = aim ended). */
  onAimChange?: () => void
}

export function maxDragPxFor(viewW: number, viewH: number): number {
  const v = TUNING.maxDragFraction * Math.min(viewW, viewH)
  return Math.max(TUNING.maxDragPxMin, Math.min(TUNING.maxDragPxMax, v))
}

export function climberHitRadius(halfHeightPx: number): number {
  return Math.max(TUNING.climberHitMinPx, Math.min(TUNING.climberHitMaxPx, halfHeightPx))
}

export class AimInput {
  private pointerId: number | null = null
  private startX = 0
  private startY = 0
  private readonly cleanups: (() => void)[] = []

  constructor(
    private readonly canvas: HTMLElement,
    private readonly deps: AimInputDeps,
  ) {
    const down = (e: PointerEvent) => this.onDown(e)
    const move = (e: PointerEvent) => this.onMove(e)
    const up = (e: PointerEvent) => this.onUp(e)
    const cancel = (e: PointerEvent) => this.onCancel(e)
    // Every touch here is the gesture: no scrolling, zooming or double-tap delay.
    canvas.style.touchAction = 'none'
    canvas.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    canvas.addEventListener('lostpointercapture', cancel)
    const blockMenu = (e: Event) => e.preventDefault()
    canvas.addEventListener('contextmenu', blockMenu)
    this.cleanups.push(
      () => canvas.removeEventListener('pointerdown', down),
      () => window.removeEventListener('pointermove', move),
      () => window.removeEventListener('pointerup', up),
      () => window.removeEventListener('pointercancel', cancel),
      () => canvas.removeEventListener('lostpointercapture', cancel),
      () => canvas.removeEventListener('contextmenu', blockMenu),
    )
  }

  get active(): boolean {
    return this.pointerId !== null
  }

  destroy(): void {
    this.reset()
    for (const fn of this.cleanups.splice(0)) fn()
  }

  private onDown(e: PointerEvent): void {
    const session = this.deps.session()
    if (this.pointerId !== null) {
      // A second finger: cancel the aim (never launch).
      if (e.pointerId !== this.pointerId) {
        session?.cancelAim()
        this.reset()
        this.deps.onAimChange?.()
      }
      return
    }
    if (e.button !== undefined && e.button > 0) return
    if (!session || !session.canAim()) return
    e.preventDefault()
    this.pointerId = e.pointerId
    this.startX = e.clientX
    this.startY = e.clientY
    try {
      this.canvas.setPointerCapture(e.pointerId)
    } catch {
      // Synthetic or already-ended pointers can't be captured; window listeners still track them.
    }
    this.update(e)
  }

  private onMove(e: PointerEvent): void {
    if (e.pointerId !== this.pointerId) return
    this.update(e)
  }

  private onUp(e: PointerEvent): void {
    if (e.pointerId !== this.pointerId) return
    this.update(e)
    this.deps.session()?.release()
    this.reset()
    this.deps.onAimChange?.()
  }

  private onCancel(e: PointerEvent): void {
    if (this.pointerId === null || e.pointerId !== this.pointerId) return
    this.deps.session()?.cancelAim()
    this.reset()
    this.deps.onAimChange?.()
  }

  private update(e: PointerEvent): void {
    const session = this.deps.session()
    if (!session) return
    const dx = e.clientX - this.startX
    const dy = e.clientY - this.startY
    const c = this.deps.climberClient()
    const onClimber = Math.hypot(e.clientX - c.x, e.clientY - c.y) < c.r
    session.aimAt(dx, dy, this.deps.maxDragPx(), onClimber)
    this.deps.onAimChange?.()
  }

  private reset(): void {
    if (this.pointerId !== null) {
      try {
        if (this.canvas.hasPointerCapture?.(this.pointerId)) this.canvas.releasePointerCapture(this.pointerId)
      } catch {
        // ignore
      }
    }
    this.pointerId = null
  }
}
