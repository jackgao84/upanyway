/**
 * The one gesture: touch, drag back, release (slingshot). Pointer Events on the canvas
 * (`touch-action: none`). The drag can start anywhere; releasing with a tiny drag, or with the finger
 * back on the climber, cancels. pointercancel / lostpointercapture / a second finger during a real
 * drag always cancel — they never launch. A finger that is only resting (a thumb on the screen's
 * edge) hands over to the next finger. An aim the session cancels itself (a crumble, a card) ends
 * the gesture for good. A touch that starts while she is still settling onto a ledge (or getting up
 * from a flop) waits and aims once she is ready.
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
  private lastX = 0
  private lastY = 0
  /** This gesture has started an aim on the session (until then it is only waiting for her). */
  private aimed = false
  /** A touch that began while she was still settling onto a ledge: it aims once she is ready, but
   *  only if she is still on that landing (session.lastLandAt unchanged). */
  private landAt = 0
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

  /**
   * Call once a frame: a finger that went down while she was settling starts aiming as soon as she
   * is ready, even if it hasn't moved since.
   */
  poll(): void {
    if (this.pointerId === null || this.aimed) return
    const session = this.deps.session()
    if (session?.canAim()) this.update(this.lastX, this.lastY)
  }

  private onDown(e: PointerEvent): void {
    const session = this.deps.session()
    if (this.pointerId !== null) {
      if (e.pointerId === this.pointerId) return
      if (Math.hypot(this.lastX - this.startX, this.lastY - this.startY) >= TUNING.cancelPx) {
        // A second finger while she is really dragging: cancel the aim (never launch).
        session?.cancelAim()
        this.reset()
        this.deps.onAimChange?.()
        return
      }
      // The finger we follow is only resting (a thumb on the edge of the screen): follow the new
      // one instead.
      if (this.aimed) session?.cancelAim()
      this.reset()
      this.deps.onAimChange?.()
    }
    if (e.button !== undefined && e.button > 0) return
    if (!session || session.frozen) return
    const settling = session.phase === 'settling' || session.phase === 'flopped'
    if (!session.canAim() && !settling) return
    e.preventDefault()
    this.pointerId = e.pointerId
    this.startX = this.lastX = e.clientX
    this.startY = this.lastY = e.clientY
    this.aimed = false
    this.landAt = session.lastLandAt
    try {
      this.canvas.setPointerCapture(e.pointerId)
    } catch {
      // Synthetic or already-ended pointers can't be captured; window listeners still track them.
    }
    this.update(e.clientX, e.clientY)
  }

  private onMove(e: PointerEvent): void {
    if (e.pointerId !== this.pointerId) return
    this.update(e.clientX, e.clientY)
  }

  private onUp(e: PointerEvent): void {
    if (e.pointerId !== this.pointerId) return
    this.update(e.clientX, e.clientY)
    // Dropped on the way (the aim was cancelled from outside), or she never got to aim: no release.
    if (this.pointerId === null) return
    const aimed = this.aimed
    this.reset()
    if (aimed) this.deps.session()?.release()
    this.deps.onAimChange?.()
  }

  private onCancel(e: PointerEvent): void {
    if (this.pointerId === null || e.pointerId !== this.pointerId) return
    if (this.aimed) this.deps.session()?.cancelAim()
    this.reset()
    this.deps.onAimChange?.()
  }

  private update(x: number, y: number): void {
    this.lastX = x
    this.lastY = y
    const session = this.deps.session()
    if (!session) return
    if (this.aimed && !session.aim) {
      // The session ended this aim itself (the ledge crumbled, a card opened): the gesture is over.
      // The finger has to lift and touch again — a cancelled drag never comes back to life.
      this.drop()
      return
    }
    if (!this.aimed) {
      if (!session.canAim()) return
      if (session.lastLandAt !== this.landAt) {
        // She fell or moved on since the finger went down.
        this.drop()
        return
      }
    }
    const dx = x - this.startX
    const dy = y - this.startY
    const c = this.deps.climberClient()
    const onClimber = Math.hypot(x - c.x, y - c.y) < c.r
    const aim = session.aimAt(dx, dy, this.deps.maxDragPx(), onClimber)
    if (!aim) {
      this.drop()
      return
    }
    this.aimed = true
    this.deps.onAimChange?.()
  }

  /** Stop following this finger (the session's aim, if any, is already gone). */
  private drop(): void {
    this.reset()
    this.deps.onAimChange?.()
  }

  private reset(): void {
    const id = this.pointerId
    this.pointerId = null
    this.aimed = false
    if (id !== null) {
      try {
        if (this.canvas.hasPointerCapture?.(id)) this.canvas.releasePointerCapture(id)
      } catch {
        // ignore
      }
    }
  }
}
