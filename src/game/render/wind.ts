/**
 * Wind you can read. Every wind zone gets a little striped windsock on a pole: it hangs limp in the
 * calm, starts to flutter TUNING.windTelegraph seconds before a gust (physics.timeToGust), and
 * stands out straight while it blows. During a gust, air streaks and leaves sweep across the zone;
 * grass, flags and the rope bridge lean with it (terrain asks `lean`). The rhythm comes from the
 * pitch clock (session.t), so what she sees is exactly what physics does.
 */
import { createRng } from '../../model/rng'
import { ink, mix } from '../art/rig'
import { timeToGust } from '../physics'
import { TUNING } from '../tuning'
import { LEDGE_H, WORLD_W, type Level, type WindZone } from '../types'
import { smoothstep, type View } from './effects'
import type { ZonePalette } from './palette'
import type { Particles, WindField } from './particles'
import type { WindLean } from './terrain'

const STREAKS = 14

interface ZoneFx {
  z: WindZone
  /** 0..1 gust strength right now (eased in and out). */
  amount: number
  /** 0..1 how close the next gust is (during the telegraph window). */
  tele: number
  /** Windsock position (world), or null when no clear spot. */
  sock: { x: number; y: number } | null
  /** Streak slots: x, y, len, age, life, alpha. */
  streaks: Float32Array
  leafAcc: number
  streakAcc: number
}

export class WindFx implements WindField, WindLean {
  private readonly zones: ZoneFx[]
  private t = 0
  private readonly rng = createRng('wind')
  /** Colours mixed once (nothing is mixed per frame). */
  private readonly bracket: string
  private readonly poleInk: string
  private readonly poleLight: string

  constructor(
    level: Level,
    private readonly palette: ZonePalette,
  ) {
    this.bracket = mix(palette.faceDark, palette.ink, 0.3)
    this.poleInk = ink(palette.wood)
    this.poleLight = mix(palette.wood, '#ffffff', 0.25)
    this.zones = (level.wind ?? []).map((z) => ({
      z,
      amount: 0,
      tele: 0,
      sock: placeSock(level, z),
      streaks: new Float32Array(STREAKS * 6),
      leafAcc: 0,
      streakAcc: 0,
    }))
  }

  get active(): boolean {
    return this.zones.length > 0
  }

  /** Advance with the pitch clock (`pitchT` = session.t) and the real frame delta. */
  update(pitchT: number, dt: number, view: View, particles: Particles | null): void {
    this.t = pitchT
    const top = view.top + 40
    const bottom = view.bottom - 40
    for (const f of this.zones) {
      const z = f.z
      const phase = (((pitchT - z.offset) % z.period) + z.period) % z.period
      if (phase < z.gust) {
        // Ease in quickly, ease out over the last moment of the gust.
        f.amount = smoothstep(phase / 0.18) * (0.35 + 0.65 * smoothstep((z.gust - phase) / 0.3))
        f.tele = 1
      } else {
        const after = phase - z.gust
        f.amount = 0.35 * Math.exp(-after * 6)
        const ttg = timeToGust(z, pitchT)
        f.tele = ttg < TUNING.windTelegraph ? 1 - ttg / TUNING.windTelegraph : 0
      }
      const visible = z.y < top && z.y + z.h > bottom
      // Streaks.
      const s = f.streaks
      for (let i = 0; i < STREAKS; i++) {
        const o = i * 6
        if (s[o + 4] <= 0) continue
        s[o + 3] += dt
        s[o] += z.dir * (220 + 120 * f.amount) * dt
        if (s[o + 3] >= s[o + 4]) s[o + 4] = 0
      }
      if (!visible || dt <= 0) continue
      const want = f.amount > 0.25 ? 24 * f.amount : f.tele > 0 && f.tele < 1 ? 4 : 0
      f.streakAcc += dt * want
      while (f.streakAcc >= 1) {
        f.streakAcc -= 1
        this.spawnStreak(f, f.amount > 0.25 ? 1 : 0.45)
      }
      if (particles && f.amount > 0.4) {
        f.leafAcc += dt * 5 * f.amount
        while (f.leafAcc >= 1) {
          f.leafAcc -= 1
          const x = z.dir > 0 ? Math.max(view.left, z.x) - 6 : Math.min(view.right, z.x + z.w) + 6
          const y = this.rng.range(Math.max(z.y, bottom), Math.min(z.y + z.h, top))
          particles.gustLeaf(x, y, z.dir)
        }
      }
    }
  }

  private spawnStreak(f: ZoneFx, strength: number): void {
    const s = f.streaks
    const z = f.z
    for (let i = 0; i < STREAKS; i++) {
      const o = i * 6
      if (s[o + 4] > 0) continue
      const r = this.rng
      s[o] = z.dir > 0 ? z.x + r.range(-40, z.w * 0.5) : z.x + z.w - r.range(-40, z.w * 0.5)
      s[o + 1] = z.y + r.range(0.08, 0.92) * z.h
      s[o + 2] = r.range(34, 80) * (0.6 + 0.4 * strength)
      s[o + 3] = 0
      s[o + 4] = r.range(0.45, 0.8)
      s[o + 5] = strength
      return
    }
  }

  /** −1..1: how far grass at (x, y) leans right now (+ = right). */
  lean(x: number, y: number): number {
    let v = 0
    for (const f of this.zones) {
      const z = f.z
      if (x < z.x - 10 || x > z.x + z.w + 10 || y < z.y - 20 || y > z.y + z.h + 20) continue
      const flutter = f.tele > 0 && f.amount < 0.3 ? f.tele * 0.3 * (0.6 + 0.4 * Math.sin(this.t * 19 + y * 0.1)) : 0
      v += z.dir * (f.amount * 0.95 + flutter)
    }
    return v < -1 ? -1 : v > 1 ? 1 : v
  }

  /** Sideways push on particles (units/s²). */
  push(x: number, y: number): number {
    let v = 0
    for (const f of this.zones) {
      const z = f.z
      if (x < z.x || x > z.x + z.w || y < z.y || y > z.y + z.h) continue
      v += z.dir * (z.accel * 0.45 * f.amount + 18 * f.tele)
    }
    return v
  }

  /** Windsocks (drawn with the ledges, before the climber). World transform. */
  drawSocks(ctx: CanvasRenderingContext2D, view: View, t: number): void {
    if (!this.zones.length) return
    view.applyWorld(ctx)
    const top = view.top + 40
    const bottom = view.bottom - 40
    for (const f of this.zones) {
      const s = f.sock
      if (!s || s.y > top || s.y < bottom) continue
      const dir = f.z.dir
      const x = s.x
      const base = -s.y
      const poleTop = base - 30
      // Pole on a little bracket plate.
      ctx.fillStyle = this.bracket
      ctx.beginPath()
      ctx.ellipse(x, base, 3, 2, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = this.poleInk
      ctx.lineWidth = 3
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(x, base)
      ctx.lineTo(x, poleTop)
      ctx.stroke()
      ctx.strokeStyle = this.poleLight
      ctx.lineWidth = 1.6
      ctx.stroke()
      // Sock angle: limp (hanging) → fluttering → straight out downwind.
      const calm = 1 - Math.max(f.amount, f.tele * 0.6)
      const flutter = f.tele > 0 && f.amount < 0.5 ? Math.sin(t * 17) * 0.35 * f.tele : Math.sin(t * 11) * 0.06 * f.amount
      const hang = Math.PI / 2 - 0.25
      const out = 0.05
      const ang = out + (hang - out) * calm + flutter
      const len = 30
      const ax = Math.cos(ang) * dir
      const ay = Math.sin(ang)
      // Hoop at the pole top.
      const hx = x + dir * 2
      const hy = poleTop + 1
      const segs = 4
      for (let i = 0; i < segs; i++) {
        const u0 = i / segs
        const u1 = (i + 1) / segs
        const wob = Math.sin(t * 14 - i * 1.3) * (0.6 + f.amount * 1.4) * u1
        const r0 = 6 - 3.2 * u0
        const r1 = 6 - 3.2 * u1
        const x0 = hx + ax * len * u0
        const y0 = hy + ay * len * u0
        const x1 = hx + ax * len * u1 - ay * wob * dir
        const y1 = hy + ay * len * u1 + ax * wob * dir
        const nx = -ay
        const ny = ax * dir
        ctx.fillStyle = i % 2 ? '#ffffff' : '#ff7a5c'
        ctx.strokeStyle = '#8a3b33'
        ctx.lineWidth = 0.9
        ctx.beginPath()
        ctx.moveTo(x0 + nx * r0 * dir, y0 + ny * r0 * dir)
        ctx.lineTo(x1 + nx * r1 * dir, y1 + ny * r1 * dir)
        ctx.lineTo(x1 - nx * r1 * dir, y1 - ny * r1 * dir)
        ctx.lineTo(x0 - nx * r0 * dir, y0 - ny * r0 * dir)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
      }
      ctx.strokeStyle = '#5b4a52'
      ctx.lineWidth = 1.4
      ctx.beginPath()
      ctx.ellipse(hx, hy, 1.8, 6, ang * dir, 0, Math.PI * 2)
      ctx.stroke()
    }
  }

  /** Air streaks (drawn after the climber, under the mist). World transform. */
  drawStreaks(ctx: CanvasRenderingContext2D, view: View): void {
    if (!this.zones.length) return
    view.applyWorld(ctx)
    const p = this.palette
    ctx.strokeStyle = p.night ? '#cfd9ff' : '#ffffff'
    ctx.lineCap = 'round'
    ctx.lineWidth = Math.max(1.6, 2 / Math.max(0.5, view.zoom))
    for (const f of this.zones) {
      const s = f.streaks
      const dir = f.z.dir
      for (let i = 0; i < STREAKS; i++) {
        const o = i * 6
        if (s[o + 4] <= 0) continue
        const k = s[o + 3] / s[o + 4]
        const a = Math.sin(Math.PI * k) * (0.3 + 0.45 * s[o + 5])
        if (a <= 0.02) continue
        const x = s[o]
        const y = -s[o + 1]
        const len = s[o + 2]
        ctx.globalAlpha = a
        ctx.beginPath()
        ctx.moveTo(x - dir * len, y)
        ctx.quadraticCurveTo(x - dir * len * 0.4, y - 3.5, x, y - 1)
        // A little curl at the head of some streaks.
        if (i % 3 === 0) ctx.quadraticCurveTo(x + dir * 7, y + 1, x + dir * 4, y + 5)
        ctx.stroke()
      }
    }
    ctx.globalAlpha = 1
  }
}

/** A clear spot for the windsock: on the upwind side of the zone, away from ledges and holds. */
function placeSock(level: Level, z: WindZone): { x: number; y: number } | null {
  const upwindX = z.dir > 0 ? Math.max(14, z.x + 14) : Math.min(WORLD_W - 14, z.x + z.w - 14)
  const candidatesX = [upwindX, z.dir > 0 ? upwindX + 30 : upwindX - 30]
  const clear = (x: number, y: number) => {
    for (const el of level.elements) {
      if (el.kind === 'ledge') {
        const bottom = el.y - (el.h ?? LEDGE_H) - 6
        if (x > el.x - 20 && x < el.x + el.w + 20 && y + 40 > bottom && y - 6 < el.y + 60) return false
      } else if (Math.abs(el.x - x) < 34 && Math.abs(el.y - (y + 20)) < 40) return false
    }
    return true
  }
  const lo = z.y + 20
  const hi = z.y + z.h - 50
  // Prefer the lower part of the zone (seen from the camp below).
  for (const x of candidatesX) {
    for (let y = lo; y <= hi; y += 8) if (clear(x, y)) return { x, y }
  }
  return null
}
