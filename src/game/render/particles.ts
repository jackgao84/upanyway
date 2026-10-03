/**
 * Gentle particles: ambient ones by zone (pollen and petals, fireflies, dust motes, leaves, mist
 * wisps, snow and sparkles) plus little bursts for juice (landing dust, chalk puffs, crumble dust,
 * a sparkle when a hidden hold shows itself). One fixed pool of struct-of-arrays slots: nothing is
 * allocated per frame. World units, y-up; drawn with the world transform (art coords x, −y).
 */
import { createRng, type Rng } from '../../model/rng'
import { mix } from '../art/rig'
import { freeCanvas, softDot, type View } from './effects'
import type { AmbientKind, ZonePalette } from './palette'

const enum K {
  Pollen = 0,
  Petal,
  Firefly,
  Dust,
  Leaf,
  Mist,
  Snow,
  Sparkle,
  Chalk,
  Puff,
  Debris,
}

/** Sprite indices for soft dots. */
const enum S {
  White = 0,
  Dust,
  Rock,
  Firefly,
  Mist,
  Count,
}

/** Something that pushes particles sideways (wind.ts). Units/s². */
export interface WindField {
  push(x: number, y: number): number
}

/** Per kind: how many per 420×640-unit screen, wind response, fade in/out (fraction of life). */
const AMBIENT: Record<AmbientKind, { kind: K; perScreen: number }> = {
  pollen: { kind: K.Pollen, perScreen: 22 },
  petals: { kind: K.Petal, perScreen: 7 },
  fireflies: { kind: K.Firefly, perScreen: 16 },
  dust: { kind: K.Dust, perScreen: 26 },
  leaves: { kind: K.Leaf, perScreen: 7 },
  mist: { kind: K.Mist, perScreen: 6 },
  snow: { kind: K.Snow, perScreen: 40 },
  sparkles: { kind: K.Sparkle, perScreen: 6 },
}

const WIND_RESPONSE = [0.45, 0.6, 0.15, 0.4, 1.1, 0.25, 0.5, 0.1, 0, 0, 0]
const SCREEN_AREA = 420 * 640

export class Particles {
  readonly capacity: number
  private n = 0
  private readonly x: Float32Array
  private readonly y: Float32Array
  private readonly vx: Float32Array
  private readonly vy: Float32Array
  private readonly age: Float32Array
  private readonly life: Float32Array
  private readonly size: Float32Array
  private readonly rot: Float32Array
  private readonly vrot: Float32Array
  private readonly phase: Float32Array
  private readonly grav: Float32Array
  private readonly kind: Uint8Array
  private readonly color: Uint8Array
  private readonly ambient: Uint8Array

  private readonly colors: string[]
  private readonly sprites: HTMLCanvasElement[] = []
  private readonly rng: Rng
  private readonly ambientKinds: { kind: K; perScreen: number }[]
  private readonly counts = new Int32Array(16)
  private spawnAcc = 0

  constructor(
    private readonly palette: ZonePalette,
    seed: string,
    capacity = 320,
  ) {
    this.capacity = capacity
    this.x = new Float32Array(capacity)
    this.y = new Float32Array(capacity)
    this.vx = new Float32Array(capacity)
    this.vy = new Float32Array(capacity)
    this.age = new Float32Array(capacity)
    this.life = new Float32Array(capacity)
    this.size = new Float32Array(capacity)
    this.rot = new Float32Array(capacity)
    this.vrot = new Float32Array(capacity)
    this.phase = new Float32Array(capacity)
    this.grav = new Float32Array(capacity)
    this.kind = new Uint8Array(capacity)
    this.color = new Uint8Array(capacity)
    this.ambient = new Uint8Array(capacity)
    this.rng = createRng(`particles:${seed}`)
    const p = palette
    // Colour table (indices used below).
    this.colors = [
      p.accents[0], // 0 petal / flower
      p.accents[1], // 1 pollen gold
      '#ffffff', // 2
      mix(p.top, p.ground, 0.4), // 3 dust
      p.rockLight, // 4 debris light
      p.rockDark, // 5 debris dark
      p.night ? '#fff3a8' : '#f4ffb0', // 6 firefly core
      p.zone === 'ridge' ? '#e8a24a' : '#9cc46a', // 7 leaf warm / green
      p.zone === 'ridge' ? '#c6d86a' : '#e0b25a', // 8 leaf alt
      mix(p.faceLight, '#ffffff', 0.4), // 9 dust motes
      p.accents[3] ?? '#ffffff', // 10
      p.chalk, // 11
    ]
    this.ambientKinds = p.particles.map((k) => AMBIENT[k])
  }

  private sprite(i: S): HTMLCanvasElement {
    let c = this.sprites[i]
    if (!c) {
      const p = this.palette
      let color: string
      switch (i) {
        case S.White:
          color = p.chalk
          break
        case S.Dust:
          color = mix(p.top, p.ground, 0.35)
          break
        case S.Rock:
          color = mix(p.rockLight, p.faceLight, 0.4)
          break
        case S.Firefly:
          color = p.night ? '#ffe680' : '#e9ff8a'
          break
        default:
          color = mix(p.mist, '#ffffff', 0.3)
      }
      c = softDot(i === S.Mist ? 96 : 48, color, i === S.Firefly ? 0.12 : 0.3)
      this.sprites[i] = c
    }
    return c
  }

  private add(kind: K, x: number, y: number, vx: number, vy: number, life: number, size: number, color: number): number {
    let i = this.n
    if (i >= this.capacity) {
      // Full: recycle the oldest ambient particle, else give up.
      i = -1
      let best = -1
      for (let j = 0; j < this.n; j++) {
        if (this.ambient[j] && this.age[j] / this.life[j] > best) {
          best = this.age[j] / this.life[j]
          i = j
        }
      }
      if (i < 0) return -1
      this.counts[this.kind[i]]--
    } else {
      this.n++
    }
    this.kind[i] = kind
    this.x[i] = x
    this.y[i] = y
    this.vx[i] = vx
    this.vy[i] = vy
    this.age[i] = 0
    this.life[i] = life
    this.size[i] = size
    this.rot[i] = this.rng.next() * Math.PI * 2
    this.vrot[i] = (this.rng.next() - 0.5) * 3
    this.phase[i] = this.rng.next()
    this.grav[i] = 0
    this.color[i] = color
    this.ambient[i] = 0
    this.counts[kind]++
    return i
  }

  private remove(i: number): void {
    this.counts[this.kind[i]]--
    const last = --this.n
    if (i === last) return
    this.x[i] = this.x[last]
    this.y[i] = this.y[last]
    this.vx[i] = this.vx[last]
    this.vy[i] = this.vy[last]
    this.age[i] = this.age[last]
    this.life[i] = this.life[last]
    this.size[i] = this.size[last]
    this.rot[i] = this.rot[last]
    this.vrot[i] = this.vrot[last]
    this.phase[i] = this.phase[last]
    this.grav[i] = this.grav[last]
    this.kind[i] = this.kind[last]
    this.color[i] = this.color[last]
    this.ambient[i] = this.ambient[last]
  }

  /** Remove everything (session change). */
  clear(): void {
    this.n = 0
    this.counts.fill(0)
    this.spawnAcc = 0
  }

  // -------------------------------------------------------------------------------------------
  // Ambient

  private spawnAmbient(kind: K, view: View, anywhere: boolean): void {
    const r = this.rng
    const left = view.left - 20
    const right = view.right + 20
    const top = view.top + 20
    const bottom = view.bottom - 20
    const x = r.range(left, right)
    let y = r.range(bottom, top)
    switch (kind) {
      case K.Pollen: {
        const i = this.add(kind, x, y, r.range(-6, 6), r.range(-3, 5), r.range(6, 11), r.range(0.9, 1.7), 1)
        if (i >= 0) this.ambient[i] = 1
        break
      }
      case K.Petal: {
        if (!anywhere) y = top
        const i = this.add(kind, x, y, r.range(6, 18), r.range(-16, -8), r.range(7, 12), r.range(2.2, 3.4), r.next() < 0.7 ? 0 : 10)
        if (i >= 0) this.ambient[i] = 1
        break
      }
      case K.Firefly: {
        const i = this.add(kind, x, y, 0, 0, r.range(7, 13), r.range(1.4, 2.2), 6)
        if (i >= 0) this.ambient[i] = 1
        break
      }
      case K.Dust: {
        const i = this.add(kind, x, y, r.range(-4, 4), r.range(-2, 3), r.range(7, 12), r.range(0.8, 1.6), 9)
        if (i >= 0) this.ambient[i] = 1
        break
      }
      case K.Leaf: {
        if (!anywhere) y = top
        const i = this.add(kind, x, y, r.range(-6, 6), r.range(-22, -12), r.range(6, 10), r.range(2.6, 3.6), r.next() < 0.5 ? 7 : 8)
        if (i >= 0) this.ambient[i] = 1
        break
      }
      case K.Mist: {
        const i = this.add(kind, x, y, r.range(4, 10) * (r.next() < 0.5 ? -1 : 1), 0, r.range(9, 15), r.range(45, 90), 2)
        if (i >= 0) this.ambient[i] = 1
        break
      }
      case K.Snow: {
        if (!anywhere) y = top
        const i = this.add(kind, x, y, r.range(-5, 5), r.range(-26, -14), r.range(8, 14), r.range(1, 2.1), 2)
        if (i >= 0) this.ambient[i] = 1
        break
      }
      case K.Sparkle: {
        const i = this.add(kind, x, y, 0, r.range(-2, 2), r.range(2.5, 4.5), r.range(2.2, 3.8), r.next() < 0.5 ? 2 : 1)
        if (i >= 0) this.ambient[i] = 1
        break
      }
      default:
        break
    }
  }

  // -------------------------------------------------------------------------------------------
  // Bursts (world coords: x, y = the point on the rock)

  /** Dust kicked up by her feet on landing. strength 0..1. */
  landingDust(x: number, y: number, strength = 0.6): void {
    const r = this.rng
    const n = 6 + Math.round(strength * 6)
    for (let k = 0; k < n; k++) {
      const dir = k % 2 === 0 ? 1 : -1
      const i = this.add(K.Puff, x + r.range(-6, 6), y + r.range(0, 3), dir * r.range(18, 46) * (0.6 + strength), r.range(4, 18), r.range(0.35, 0.6), r.range(3, 5.5), 3)
      if (i >= 0) this.phase[i] = S.Dust
    }
  }

  /** A white chalk puff (launch, whipper). */
  chalkPuff(x: number, y: number, n = 8, spread = 1): void {
    const r = this.rng
    for (let k = 0; k < n; k++) {
      const a = r.range(0, Math.PI * 2)
      const sp = r.range(10, 34) * spread
      const i = this.add(K.Chalk, x + r.range(-4, 4), y + r.range(-4, 4), Math.cos(a) * sp, Math.sin(a) * sp + 8, r.range(0.45, 0.8), r.range(3, 6) * spread, 11)
      if (i >= 0) this.phase[i] = S.White
    }
  }

  /** A crumbly ledge giving way (or shaking): pebbles + dust along its underside. */
  crumbleDust(x: number, y: number, w: number, n = 12): void {
    const r = this.rng
    for (let k = 0; k < n; k++) {
      const px = x + r.range(0, w)
      if (k % 3 === 0) {
        const i = this.add(K.Debris, px, y, r.range(-14, 14), r.range(-10, 20), r.range(0.7, 1.2), r.range(1.4, 3), k % 2 ? 4 : 5)
        if (i >= 0) this.grav[i] = 420
      } else {
        const i = this.add(K.Puff, px, y + r.range(-6, 4), r.range(-16, 16), r.range(-10, 8), r.range(0.5, 0.9), r.range(4, 8), 4)
        if (i >= 0) this.phase[i] = S.Rock
      }
    }
  }

  /** A puff where a crumbled ledge pops back. */
  restorePuff(x: number, y: number, w: number): void {
    const r = this.rng
    for (let k = 0; k < 10; k++) {
      const i = this.add(K.Puff, x + r.range(0, w), y + r.range(-14, 2), r.range(-20, 20), r.range(6, 22), r.range(0.4, 0.7), r.range(4, 7), 3)
      if (i >= 0) this.phase[i] = S.White
    }
  }

  /** Sparkles when a hidden hold shows itself (or anything magical). */
  revealSparkle(x: number, y: number, n = 14): void {
    const r = this.rng
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + r.range(-0.2, 0.2)
      const sp = r.range(30, 72)
      this.add(K.Sparkle, x, y, Math.cos(a) * sp, Math.sin(a) * sp, r.range(0.7, 1.3), r.range(3.6, 6.4), k % 3 === 0 ? 1 : 2)
    }
    // A soft white flash in the middle.
    const i = this.add(K.Chalk, x, y, 0, 0, 0.5, 9, 11)
    if (i >= 0) this.phase[i] = S.White
  }

  /** A falling pebble (crumble shake). */
  pebble(x: number, y: number): void {
    const r = this.rng
    const i = this.add(K.Debris, x, y, r.range(-6, 6), r.range(-4, 6), r.range(0.6, 0.9), r.range(1, 2), r.next() < 0.5 ? 4 : 5)
    if (i >= 0) this.grav[i] = 380
  }

  /** A gust leaf (wind.ts). */
  gustLeaf(x: number, y: number, dir: number): void {
    const r = this.rng
    const i = this.add(K.Leaf, x, y, dir * r.range(60, 120), r.range(-8, 14), r.range(2.2, 3.6), r.range(2.4, 3.4), r.next() < 0.5 ? 7 : 8)
    if (i >= 0) this.vrot[i] = dir * r.range(4, 9)
  }

  // -------------------------------------------------------------------------------------------

  update(dt: number, view: View, wind: WindField | null): void {
    if (dt <= 0) return
    // Ambient: keep each kind near its density for the visible area.
    const area = Math.max(1, (view.right - view.left) * (view.top - view.bottom))
    const scale = Math.min(2.6, area / SCREEN_AREA)
    const first = this.spawnAcc === 0
    this.spawnAcc += dt
    for (const a of this.ambientKinds) {
      const want = Math.round(a.perScreen * scale)
      let have = this.counts[a.kind]
      // Spawn a few per frame (prewarm fills the screen at once).
      let budget = first ? want : 2
      while (have < want && budget-- > 0) {
        this.spawnAmbient(a.kind, view, first || a.kind === K.Firefly || a.kind === K.Pollen || a.kind === K.Dust || a.kind === K.Mist || a.kind === K.Sparkle)
        have++
      }
    }

    const top = view.top + 80
    const bottom = view.bottom - 80
    const left = view.left - 80
    const right = view.right + 80
    for (let i = this.n - 1; i >= 0; i--) {
      const age = (this.age[i] += dt)
      const k = this.kind[i]
      if (age >= this.life[i]) {
        this.remove(i)
        continue
      }
      const ph = this.phase[i]
      switch (k) {
        case K.Firefly: {
          this.vx[i] = 11 * Math.sin(age * 0.9 + ph * 40)
          this.vy[i] = 8 * Math.cos(age * 1.13 + ph * 23)
          break
        }
        case K.Pollen:
        case K.Dust: {
          this.vx[i] += Math.sin(age * 1.7 + ph * 30) * 4 * dt
          break
        }
        case K.Petal:
        case K.Leaf: {
          this.vx[i] += Math.sin(age * 2.2 + ph * 20) * 14 * dt
          this.rot[i] += this.vrot[i] * dt
          break
        }
        case K.Snow: {
          this.vx[i] += Math.sin(age * 1.4 + ph * 10) * 6 * dt
          break
        }
        case K.Chalk:
        case K.Puff: {
          const damp = Math.exp(-3.2 * dt)
          this.vx[i] *= damp
          this.vy[i] = this.vy[i] * damp + 6 * dt
          break
        }
        case K.Sparkle: {
          const damp = Math.exp(-2.4 * dt)
          this.vx[i] *= damp
          this.vy[i] *= damp
          break
        }
        case K.Debris: {
          this.rot[i] += this.vrot[i] * dt * 2
          break
        }
        default:
          break
      }
      if (this.grav[i] !== 0) this.vy[i] -= this.grav[i] * dt
      if (wind && this.ambient[i] | (k === K.Leaf ? 1 : 0)) {
        const push = wind.push(this.x[i], this.y[i])
        if (push !== 0) {
          this.vx[i] += push * WIND_RESPONSE[k] * dt
          // Settle back towards a lazy drift after the gust.
        }
        if (this.ambient[i] && k !== K.Firefly && k !== K.Mist) this.vx[i] *= Math.exp(-0.6 * dt)
      }
      this.x[i] += this.vx[i] * dt
      this.y[i] += this.vy[i] * dt
      if (this.ambient[i]) {
        const x = this.x[i]
        const y = this.y[i]
        if (y > top || y < bottom || x < left || x > right) this.remove(i)
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, view: View, t: number): void {
    if (this.n === 0) return
    view.applyWorld(ctx)
    const colors = this.colors
    let lastColor = -1
    const minS = 1 / view.s
    for (let i = 0; i < this.n; i++) {
      const k = this.kind[i]
      const age = this.age[i]
      const life = this.life[i]
      const f = age / life
      // Fade in over the first 15% (ambient) and out over the last 30%.
      let a = this.ambient[i] ? Math.min(1, f / 0.15, (1 - f) / 0.3) : Math.min(1, (1 - f) / 0.45)
      if (a <= 0.01) continue
      const x = this.x[i]
      const y = -this.y[i]
      let s = this.size[i]
      switch (k) {
        case K.Pollen:
        case K.Dust:
        case K.Snow: {
          if (k === K.Pollen) a *= 0.75
          else if (k === K.Dust) a *= 0.55
          else a *= 0.9
          if (s < minS) s = minS
          ctx.globalAlpha = a
          if (lastColor !== this.color[i]) {
            lastColor = this.color[i]
            ctx.fillStyle = colors[lastColor]
          }
          ctx.beginPath()
          ctx.arc(x, y, s, 0, 6.2832)
          ctx.fill()
          break
        }
        case K.Petal:
        case K.Leaf:
        case K.Debris: {
          ctx.globalAlpha = a * (k === K.Debris ? 1 : 0.92)
          if (lastColor !== this.color[i]) {
            lastColor = this.color[i]
            ctx.fillStyle = colors[lastColor]
          }
          const flip = k === K.Debris ? 1 : 0.35 + 0.65 * Math.abs(Math.cos(age * 3 + this.phase[i] * 9))
          ctx.beginPath()
          ctx.ellipse(x, y, s, Math.max(0.3, s * (k === K.Debris ? 0.8 : 0.45) * flip), this.rot[i], 0, 6.2832)
          ctx.fill()
          break
        }
        case K.Firefly: {
          const blink = 0.35 + 0.65 * Math.max(0, Math.sin(age * 2.1 + this.phase[i] * 31))
          ctx.globalAlpha = a * blink * 0.75
          const g = s * 7
          ctx.drawImage(this.sprite(S.Firefly), x - g, y - g, g * 2, g * 2)
          ctx.globalAlpha = a * (0.55 + 0.45 * blink)
          if (lastColor !== this.color[i]) {
            lastColor = this.color[i]
            ctx.fillStyle = colors[lastColor]
          }
          ctx.beginPath()
          ctx.arc(x, y, Math.max(minS, s * 0.75), 0, 6.2832)
          ctx.fill()
          break
        }
        case K.Mist: {
          ctx.globalAlpha = a * 0.16
          ctx.drawImage(this.sprite(S.Mist), x - s * 1.6, y - s * 0.6, s * 3.2, s * 1.2)
          break
        }
        case K.Chalk:
        case K.Puff: {
          const grow = 1 + f * 1.6
          const g = s * grow
          ctx.globalAlpha = a * (k === K.Chalk ? 0.85 : 0.7)
          ctx.drawImage(this.sprite(this.phase[i] as S), x - g, y - g, g * 2, g * 2)
          break
        }
        case K.Sparkle: {
          const tw = this.ambient[i] ? 0.4 + 0.6 * Math.abs(Math.sin(t * 3 + this.phase[i] * 17)) : 1
          ctx.globalAlpha = a * tw
          if (lastColor !== this.color[i]) {
            lastColor = this.color[i]
            ctx.fillStyle = colors[lastColor]
          }
          const r = s * (this.ambient[i] ? tw : 1 - f * 0.5)
          const q = r * 0.22
          ctx.beginPath()
          ctx.moveTo(x, y - r)
          ctx.quadraticCurveTo(x + q, y - q, x + r, y)
          ctx.quadraticCurveTo(x + q, y + q, x, y + r)
          ctx.quadraticCurveTo(x - q, y + q, x - r, y)
          ctx.quadraticCurveTo(x - q, y - q, x, y - r)
          ctx.fill()
          break
        }
        default:
          break
      }
    }
    ctx.globalAlpha = 1
  }

  /** Live particle count (lab/debug). */
  get count(): number {
    return this.n
  }

  destroy(): void {
    for (const c of this.sprites) freeCanvas(c)
    this.sprites.length = 0
    this.clear()
  }
}
