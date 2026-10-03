/**
 * The near world: the climbing face behind the route, the ground at its foot, every ledge, hold and
 * decoration, and the living bits (crumbling ledges, the rope bridge, lanterns, flags, the hidden
 * hold sparkle).
 *
 * Drawing is in "art coords": world x, and y = −(world y), so shapes are authored y-down like the
 * rest of the art (game/art/*), 1 unit = 1 world unit.
 *
 * Caching:
 * - the face is pre-rendered (DPR 1, it is soft background) into world-locked strips ≤ 2048 px tall,
 *   generated lazily as the camera rises and dropped when far away;
 * - the ground is one viewport-wide strip, built only while it is on screen;
 * - each ledge (with the decorations standing on it) is a sprite at full resolution, built when it
 *   comes near the view and dropped when it is far away. Crumbly ledges have a second, cracked
 *   sprite; nothing about the plain sprite gives a crumbly ledge away.
 * Per frame this is a handful of drawImage calls plus a few small vector bits.
 */
import { createRng, type Rng } from '../../model/rng'
import { ink, mix, rgba } from '../art/rig'
import type { ClimbSession } from '../engine'
import { TUNING } from '../tuning'
import { LEDGE_H, WORLD_W, type Decor, type Hold, type Ledge, type Level } from '../types'
import { clamp01, easeOutBack, freeCanvas, makeCanvas, softDot, type View } from './effects'
import type { FarClip } from './parallax'
import { paperCloud } from './parallax'
import type { ZonePalette } from './palette'
import type { Particles } from './particles'

/** Something that knows how hard the wind is blowing where (wind.ts). */
export interface WindLean {
  /** −1..1: how far grass at (x, y) leans right (+) or left (−) right now. */
  lean(x: number, y: number): number
}

const FACE_PAD = 64
/** World units of overlap drawn above and below each face strip (hidden; avoids seams). */
const STRIP_MARGIN = 2
const MAX_STRIP_PX = 2048
const SIGN_FONT = '"Nunito Variable", "Nunito", ui-rounded, system-ui, sans-serif'

interface Sprite {
  canvas: HTMLCanvasElement
  /** World left edge and top altitude of the sprite. */
  x0: number
  y1: number
  /** World size. */
  w: number
  h: number
  used: number
}

type DynKind = 'lantern' | 'flag' | 'summit' | 'pennant' | 'bunting'

interface Dyn {
  kind: DynKind
  x: number
  y: number
  scale: number
  flip: boolean
  seed: number
  /** For pennants: which way the flag points at rest. */
  dir: number
}

interface LedgeInfo {
  ledge: Ledge
  key: string
  keyCracked: string
  /** Decorations baked into the sprite: drawn behind the slab / in front of the cap. */
  back: Decor[]
  front: Decor[]
  /** World height the decorations reach above the top. */
  decorH: number
  /** In a wind zone: the grass tufts are drawn live so they can bend. */
  liveTufts: boolean
  tufts: Float32Array
  isTop: boolean
  /** Seed for the slab's shape. */
  seed: string
}

interface Chunk {
  /** Outline points (local, unit square-ish), flattened. */
  shape: number[]
  x: number
  y: number
  vx: number
  vy: number
  rot: number
  vr: number
  w: number
  h: number
  age: number
  top: boolean
}

export class Terrain {
  readonly palette: ZonePalette
  private readonly level: Level
  private readonly seed: string
  private readonly infos: LedgeInfo[] = []
  private readonly infoById = new Map<string, LedgeInfo>()
  private readonly free: { decor: Decor; key: string }[] = []
  private readonly dyn: Dyn[] = []
  private readonly bolts: { x: number; y: number }[] = []
  private readonly holds: Hold[]
  private readonly sprites = new Map<string, Sprite>()
  private readonly faceStrips = new Map<number, HTMLCanvasElement>()
  private ground: { canvas: HTMLCanvasElement; x0: number; y1: number; w: number; h: number } | null = null
  private holdSprites: Record<string, HTMLCanvasElement> = {}
  private glow: HTMLCanvasElement | null = null
  private holdGlow: HTMLCanvasElement | null = null

  private readonly clip: FarClip = { x0: 0, x1: 0, topY: 0, groundY: 0 }
  private k = 1
  private faceK = 1
  private faceStripH = 1000
  private frame = 0

  // Live state mirrored from the session (diffed each frame).
  private session: ClimbSession | null = null
  private readonly knownCrumbled = new Set<string>()
  private readonly knownRevealed = new Set<string>()
  private readonly popAt = new Map<string, number>()
  private readonly revealAt = new Map<string, number>()
  private readonly chunks: Chunk[] = []
  private pebbleAcc = 0
  private readonly rng: Rng

  /** Highest top of the face (crest), and the crest's lowest point (sky shows above it). */
  readonly topLedge: Ledge
  private readonly crestCx: number
  private readonly crestLow: number
  private readonly siteSeed: number

  constructor(level: Level, palette: ZonePalette, seed: string) {
    this.level = level
    this.palette = palette
    this.seed = seed
    this.rng = createRng(`terrain-live:${seed}`)
    const lastId = level.route[level.route.length - 1]
    const ledges = level.elements.filter((e): e is Ledge => e.kind === 'ledge')
    this.topLedge = (ledges.find((l) => l.id === lastId) ?? ledges.reduce((a, b) => (b.y > a.y ? b : a))) as Ledge
    this.crestCx = this.topLedge.x + this.topLedge.w / 2
    this.crestLow = this.topLedge.y + 26
    this.holds = level.elements.filter((e): e is Hold => e.kind === 'hold')
    this.siteSeed = createRng(`${seed}:sites`).range(0, 100)
    this.layout(ledges)
    this.loadFont()
  }

  // -------------------------------------------------------------------------------------------
  // Layout: which decorations sit on which ledge; camp furniture; flags.

  private layout(ledges: Ledge[]): void {
    const level = this.level
    const decor = level.decor ?? []
    const wind = level.wind ?? []
    const bigFrom = new Map<string, string>()
    for (const b of level.bigLeaps ?? []) bigFrom.set(b.from, b.to)

    for (const l of ledges) {
      const isTop = l === this.topLedge
      const inWind = wind.some((z) => l.x + l.w > z.x && l.x < z.x + z.w && l.y >= z.y - 10 && l.y <= z.y + z.h + 10)
      const info: LedgeInfo = {
        ledge: l,
        key: `L:${l.id}`,
        keyCracked: `C:${l.id}`,
        back: [],
        front: [],
        decorH: 10,
        liveTufts: inWind && !l.bridge,
        tufts: new Float32Array(0),
        isTop,
        seed: `${this.seed}:${l.id}`,
      }
      this.infos.push(info)
      this.infoById.set(l.id, info)
    }

    // Which ledge a decoration stands on. Exact (its y is the ledge top) first; a decoration a little
    // off any ledge top (level geometry moved after it was placed) settles onto the nearest ledge
    // under/over its x, so nothing ever floats in mid-air. Too far from any ledge: left out.
    const campThings = new Set<Decor['kind']>(['tent', 'lantern', 'sign', 'flag'])
    const onLedge = (d: Decor): LedgeInfo | null => {
      let best: LedgeInfo | null = null
      let bestCost = Infinity
      for (const info of this.infos) {
        const l = info.ledge
        if (l.bridge) continue
        if (d.x < l.x - 16 || d.x > l.x + l.w + 16) continue
        const dy = Math.abs(d.y - l.y)
        if (dy <= 3 && d.x >= l.x - 24 && d.x <= l.x + l.w + 24) return info
        if (dy > 90) continue
        // Prefer a ledge it sits well inside, and camps for camp things.
        const inside = d.x >= l.x + 12 && d.x <= l.x + l.w - 12
        const cost = dy + (inside ? 0 : 40) + (campThings.has(d.kind) && !l.camp ? 50 : 0)
        if (cost < bestCost) {
          bestCost = cost
          best = info
        }
      }
      return best
    }
    const settle = (d: Decor, info: LedgeInfo): Decor => (d.y === info.ledge.y ? d : { ...d, y: info.ledge.y })

    let fi = 0
    for (const raw of decor) {
      if (raw.kind === 'cave' || raw.kind === 'cloud') {
        this.free.push({ decor: raw, key: `D:${fi}` })
        fi++
        continue
      }
      const info = onLedge(raw)
      fi++
      if (!info) continue
      const d = settle(raw, info)
      if (d.kind === 'flag' || d.kind === 'lantern') {
        const summit = d.kind === 'flag' && info.isTop
        this.dyn.push({ kind: d.kind === 'lantern' ? 'lantern' : summit ? 'summit' : 'flag', x: d.x, y: d.y, scale: d.scale ?? 1, flip: !!d.flip, seed: fi * 7.3, dir: d.flip ? -1 : 1 })
      } else {
        if (BACK_KINDS.has(d.kind)) info.back.push(d)
        else info.front.push(d)
        info.decorH = Math.max(info.decorH, decorHeight(d))
        if (d.kind === 'tent') this.addPennant(d)
      }
    }

    // Camp furniture: a tent with a pennant and a lantern; the pitch top gets the summit flag.
    for (const info of this.infos) {
      const l = info.ledge
      if (!l.camp) continue
      const standX = l.standX ?? l.x + l.w / 2
      const toward = bigFrom.get(l.id)
      const towardX = toward ? this.elementX(toward) : null
      if (info.isTop) {
        if (!this.dyn.some((d) => d.kind === 'summit')) {
          // The end of the ledge farthest from her stand point and from anything standing there.
          const taken = [standX, ...info.back.map((d) => d.x), ...info.front.map((d) => d.x)]
          let fx = l.x + 22
          let best = -1
          for (const x of [l.x + 16, l.x + 34, l.x + l.w - 34, l.x + l.w - 16]) {
            const room = Math.min(...taken.map((tx) => Math.abs(tx - x)))
            if (room > best) {
              best = room
              fx = x
            }
          }
          this.dyn.push({ kind: 'summit', x: fx, y: l.y, scale: 1, flip: fx > standX ? false : true, seed: 3.1, dir: fx > standX ? 1 : -1 })
        }
        this.bolts.push({ x: standX, y: l.y + 70 })
        continue
      }
      this.bolts.push({ x: standX, y: l.y + 70 })
      const hasTent = info.back.some((d) => d.kind === 'tent')
      // Pick the side away from the stand point and from any Big Leap edge.
      const roomL = standX - l.x
      const roomR = l.x + l.w - standX
      let tentLeft = roomL >= roomR
      if (towardX !== null) tentLeft = towardX > standX
      if (!hasTent && Math.max(roomL, roomR) >= 46) {
        const tx = tentLeft ? l.x + 24 : l.x + l.w - 24
        const tent: Decor = { kind: 'tent', x: tx, y: l.y, flip: !tentLeft }
        info.back.push(tent)
        info.decorH = Math.max(info.decorH, decorHeight(tent))
        this.addPennant(tent)
      }
      const hasLantern = this.dyn.some((d) => d.kind === 'lantern' && Math.abs(d.y - l.y) <= 3 && d.x >= l.x - 10 && d.x <= l.x + l.w + 10)
      if (!hasLantern) {
        // Beside the tent, on the stand-point side: a warm light at every camp.
        const tentX = info.back.find((d) => d.kind === 'tent')?.x ?? (tentLeft ? l.x + 24 : l.x + l.w - 24)
        let lx = tentX + (tentX < standX ? 30 : -30)
        if (Math.abs(lx - standX) < 22) lx = tentX + (tentX < standX ? -1 : 1) * 30
        lx = Math.max(l.x + 6, Math.min(l.x + l.w - 6, lx))
        this.dyn.push({ kind: 'lantern', x: lx, y: l.y, scale: 1, flip: false, seed: l.y * 0.37, dir: 1 })
      }
    }

    // Big Leaps are marked: a little bunting post at the take-off edge.
    for (const b of level.bigLeaps ?? []) {
      const from = this.infoById.get(b.from)?.ledge
      if (!from) continue
      const tx = this.elementX(b.to)
      const right = tx > from.x + from.w / 2
      const x = right ? from.x + from.w - 7 : from.x + 7
      this.dyn.push({ kind: 'bunting', x, y: from.y, scale: 1, flip: !right, seed: from.y * 0.11, dir: right ? 1 : -1 })
    }

    // Tufts drawn live (wind zones): positions along the ledge top.
    for (const info of this.infos) {
      if (!info.liveTufts) continue
      const l = info.ledge
      const rng = createRng(`${info.seed}:tufts`)
      const n = Math.max(3, Math.round(l.w / 30))
      const arr = new Float32Array(n * 2)
      for (let i = 0; i < n; i++) {
        arr[i * 2] = l.x + ((i + 0.5) / n) * l.w + rng.range(-8, 8)
        arr[i * 2 + 1] = rng.range(3, 6.5)
      }
      info.tufts = arr
    }
  }

  private addPennant(tent: Decor): void {
    const s = tent.scale ?? 1
    const apexX = tent.x + (tent.flip ? 2 : -2) * s
    this.dyn.push({ kind: 'pennant', x: apexX, y: tent.y + 31 * s, scale: s, flip: !!tent.flip, seed: tent.x * 0.13, dir: tent.flip ? -1 : 1 })
  }

  private elementX(id: string): number {
    const el = this.level.elements.find((e) => e.id === id)
    if (!el) return WORLD_W / 2
    return el.kind === 'ledge' ? el.x + el.w / 2 : el.x
  }

  private loadFont(): void {
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts
    if (!fonts || typeof fonts.load !== 'function') return
    const spec = `800 12px ${SIGN_FONT}`
    try {
      if (fonts.check(spec)) return
      fonts
        .load(spec)
        .then(() => this.dropSignSprites())
        .catch(() => undefined)
    } catch {
      // No font loading API: signs use the fallback font.
    }
  }

  private dropSignSprites(): void {
    for (const info of this.infos) {
      if (info.back.some((d) => d.kind === 'sign') || info.front.some((d) => d.kind === 'sign')) {
        this.dropSprite(info.key)
        this.dropSprite(info.keyCracked)
      }
    }
    for (const f of this.free) if (f.decor.kind === 'sign') this.dropSprite(f.key)
  }

  // -------------------------------------------------------------------------------------------
  // Resize

  resize(view: View): void {
    this.release()
    this.k = view.base * view.dpr
    this.faceK = view.base
    this.faceStripH = Math.floor(MAX_STRIP_PX / this.faceK) - STRIP_MARGIN * 2 - 1
  }

  /** What the face and ground cover on screen (the far world is only drawn outside it). */
  faceClip(view: View): FarClip {
    const c = this.clip
    c.x0 = view.x(-1)
    c.x1 = view.x(WORLD_W + 1)
    c.topY = view.y(this.crestLow)
    c.groundY = view.y(GROUND_LOW)
    return c
  }

  /** Stone site (i, j) of the face's tiling: axis 0 → x, 1 → y. Stable for the pitch. */
  private sitePt(i: number, j: number, axis: 0 | 1): number {
    const st = FACE_STONES[this.palette.zone]
    const h = Math.sin(i * 12.9898 + j * 78.233 + axis * 37.719 + this.siteSeed) * 43758.5453
    const r = h - Math.floor(h) - 0.5
    // Odd rows shift half a stone: a running bond, then jitter.
    return axis === 0 ? (i + 0.5 + (j & 1) * 0.5 + r * st.jitter) * st.w : (j + 0.5 + r * st.jitter) * st.h
  }

  // -------------------------------------------------------------------------------------------
  // Face edges (world)

  /** Rugged left / right edges of the face (always outside the pitch walls, x ≤ −4 / ≥ 404). */
  private faceLeft(y: number): number {
    const bulge = Math.pow(Math.max(0, Math.sin(y / 53 + 2)), 4) * 12
    return -15 + 6 * Math.sin(y / 71 + 1.3) + 4 * Math.sin(y / 23 + 0.4) - bulge
  }

  private faceRight(y: number): number {
    const bulge = Math.pow(Math.max(0, Math.sin(y / 59 + 0.7)), 4) * 12
    return WORLD_W + 15 + 6 * Math.sin(y / 67 + 2.1) + 4 * Math.sin(y / 27 + 2.9) + bulge
  }

  private crest(x: number): number {
    const d = (x - this.crestCx) / 150
    return this.topLedge.y + 34 + 78 * Math.exp(-d * d) + 5 * Math.sin(x / 23)
  }

  // -------------------------------------------------------------------------------------------
  // Face strips

  drawFace(ctx: CanvasRenderingContext2D, view: View): void {
    view.applyScreen(ctx)
    const H = this.faceStripH
    const top = Math.min(view.top, this.crestTop())
    // The face starts at the ground: everything below it is drawn by drawGround (strip, plain fill
    // and the side fills), so no strip is ever built under the foot of the pitch.
    const bottom = Math.max(view.bottom, GROUND_LOW)
    if (this.faceStrips.size === 0) {
      // Every strip at once, on the first frame after a resize (behind the entry card), rather than
      // one in the middle of a camera pan later. A pitch needs two (three on the biggest iPads), and
      // the eviction window below keeps them all anyway.
      const last = Math.floor(this.crestTop() / H)
      for (let j = Math.floor(GROUND_LOW / H); j <= last; j++) this.faceStrips.set(j, this.buildFaceStrip(j))
    }
    if (top > bottom) {
      const j0 = Math.floor(bottom / H)
      const j1 = Math.floor(top / H)
      for (const [j, c] of this.faceStrips) {
        if (j < j0 - 1 || j > j1 + 1) {
          freeCanvas(c)
          this.faceStrips.delete(j)
        }
      }
      for (let j = j0; j <= j1; j++) {
        let c = this.faceStrips.get(j)
        if (!c) {
          c = this.buildFaceStrip(j)
          this.faceStrips.set(j, c)
        }
        const wy1 = (j + 1) * H
        const x = view.x(-FACE_PAD)
        const y = view.y(wy1)
        // The strip carries a small margin above and below; sampling only its middle keeps the
        // joins between strips seamless.
        const m = STRIP_MARGIN * this.faceK
        ctx.drawImage(c, 0, m, c.width, c.height - 2 * m, x, y, (WORLD_W + FACE_PAD * 2) * view.s, H * view.s)
      }
    }
    this.drawGround(ctx, view)
  }

  private crestTop(): number {
    return this.topLedge.y + 34 + 78 + 8
  }

  private buildFaceStrip(j: number): HTMLCanvasElement {
    const p = this.palette
    const H = this.faceStripH
    const k = this.faceK
    const yBot = j * H
    const yTop = (j + 1) * H
    const W = WORLD_W + FACE_PAD * 2
    const c = makeCanvas(W * k, (H + STRIP_MARGIN * 2) * k)
    const g = c.getContext('2d')
    if (!g) return c
    // Art coords: x = world x, y = −world y.
    g.setTransform(k, 0, 0, k, FACE_PAD * k, (yTop + STRIP_MARGIN) * k)
    const yLo = Math.max(yBot - 40, GROUND_LOW - 40)
    const yHi = Math.min(yTop + 40, this.crestTop() + 10)
    if (yHi <= yLo) return c

    // The face silhouette.
    const path = new Path2D()
    const step = 8
    // Up the left edge (stopping at the crest), across the crest, down the right edge.
    const crestVisible = yHi >= this.crestLow - 10
    const xl = (y: number) => this.faceLeft(y)
    const xr = (y: number) => this.faceRight(y)
    path.moveTo(xl(yLo), -yLo)
    for (let y = yLo; y <= yHi; y += step) {
      if (crestVisible && y >= this.crest(xl(y))) break
      path.lineTo(xl(y), -y)
    }
    let crestPath: Path2D | null = null
    if (crestVisible) {
      const x0 = xl(this.crestLow)
      const x1 = xr(this.crestLow)
      crestPath = new Path2D()
      for (let x = x0; x <= x1; x += 6) {
        const y = Math.min(yHi, this.crest(x))
        path.lineTo(x, -y)
        if (x === x0) crestPath.moveTo(x, -y)
        else crestPath.lineTo(x, -y)
      }
      for (let y = yHi; y >= yLo; y -= step) {
        if (y >= this.crest(xr(y))) continue
        path.lineTo(xr(y), -y)
      }
    } else {
      path.lineTo(xr(yHi), -yHi)
      for (let y = yHi; y >= yLo; y -= step) path.lineTo(xr(y), -y)
    }
    path.closePath()

    // Paper shadow the face casts on the world behind it.
    g.save()
    g.shadowColor = p.shadow
    g.shadowBlur = 16 * k
    g.shadowOffsetY = 3 * k
    g.fillStyle = p.face
    g.fill(path)
    g.restore()

    g.save()
    g.clip(path)
    const rng = createRng(`${this.seed}:face:${j}`)

    // Crevices: the face shows darker between its stones.
    g.fillStyle = mix(p.face, p.faceDark, 0.5)
    g.fillRect(-FACE_PAD, -yTop - 40, W, H + 80)

    // Big rounded stone plates (a jittered Voronoi tiling, world-anchored so strips join
    // seamlessly): reads as a rock face, never as tiles or bark.
    const st = FACE_STONES[p.zone]
    const sunSide = p.celestial.x < 0.5 ? -1 : 1
    const i0 = Math.floor(-FACE_PAD / st.w) - 1
    const i1 = Math.ceil((WORLD_W + FACE_PAD) / st.w) + 1
    const j0 = Math.floor(yLo / st.h) - 1
    const j1 = Math.ceil(yHi / st.h) + 1
    const poly: number[] = []
    const tmp: number[] = []
    for (let j = j0; j <= j1 && st.w > 0; j++) {
      for (let i = i0; i <= i1; i++) {
        const cx = this.sitePt(i, j, 0)
        const cy = this.sitePt(i, j, 1)
        // Start from a box around the site, cut by the bisector with each neighbour.
        poly.length = 0
        const R = Math.max(st.w, st.h) * 1.6
        poly.push(cx - R, cy - R, cx + R, cy - R, cx + R, cy + R, cx - R, cy + R)
        for (let dj = -2; dj <= 2; dj++) {
          for (let di = -2; di <= 2; di++) {
            if (di === 0 && dj === 0) continue
            if (Math.abs(di) === 2 && Math.abs(dj) === 2) continue
            const nx = this.sitePt(i + di, j + dj, 0)
            const ny = this.sitePt(i + di, j + dj, 1)
            clipHalfPlane(poly, tmp, (cx + nx) / 2, (cy + ny) / 2, nx - cx, ny - cy)
            if (poly.length < 6) break
          }
        }
        if (poly.length < 6) continue
        // Shrink towards the site for the crevice; round the corners.
        const k2 = st.shrink
        for (let q = 0; q < poly.length; q += 2) {
          poly[q] = cx + (poly[q] - cx) * k2
          poly[q + 1] = cy + (poly[q + 1] - cy) * k2
        }
        let minY = Infinity
        let maxY = -Infinity
        for (let q = 1; q < poly.length; q += 2) {
          minY = Math.min(minY, poly[q])
          maxY = Math.max(maxY, poly[q])
        }
        if (maxY < yLo - 20 || minY > yHi + 20) continue
        const path = new Path2D()
        const n = poly.length / 2
        const mx = (a: number) => (poly[(a % n) * 2] + poly[((a + 1) % n) * 2]) / 2
        const my = (a: number) => (poly[(a % n) * 2 + 1] + poly[((a + 1) % n) * 2 + 1]) / 2
        path.moveTo(mx(0), -my(0))
        for (let a = 1; a <= n; a++) path.quadraticCurveTo(poly[(a % n) * 2], -poly[(a % n) * 2 + 1], mx(a), -my(a))
        path.closePath()
        const rr = createRng(`${this.seed}:stone:${i}:${j}`)
        const tint = rr.range(-1, 1)
        const fill = tint > 0 ? mix(p.face, p.faceLight, tint * 0.55) : mix(p.face, p.faceDark, -tint * 0.3)
        // Crisp paper shadow (an offset copy: cheap to build, no blur).
        g.save()
        g.translate(-sunSide * 1.4, 2)
        g.fillStyle = p.faceEdge
        g.globalAlpha = 0.3
        g.fill(path)
        g.restore()
        g.fillStyle = fill
        g.fill(path)
        // Rounded: a soft light on the upper sun side, shade low on the other.
        g.save()
        g.clip(path)
        g.globalAlpha = p.night ? 0.14 : 0.3
        g.fillStyle = mix(fill, '#ffffff', 0.4)
        g.beginPath()
        g.ellipse(cx + sunSide * st.w * 0.28, -(cy + st.h * 0.32), st.w * 0.42, st.h * 0.34, 0, 0, Math.PI * 2)
        g.fill()
        g.globalAlpha = 0.25
        g.fillStyle = mix(fill, p.faceDark, 0.7)
        g.beginPath()
        g.ellipse(cx - sunSide * st.w * 0.3, -(cy - st.h * 0.42), st.w * 0.55, st.h * 0.32, 0, 0, Math.PI * 2)
        g.fill()
        g.globalAlpha = 1
        // An odd crack.
        if (rr.next() < 0.22) {
          g.strokeStyle = p.faceEdge
          g.globalAlpha = 0.5
          g.lineWidth = 1
          g.lineCap = 'round'
          g.beginPath()
          let x = cx + rr.range(-0.2, 0.2) * st.w
          let y = cy + st.h * 0.35
          g.moveTo(x, -y)
          for (let q = 0; q < 3; q++) {
            x += rr.range(-5, 5)
            y -= st.h * rr.range(0.12, 0.22)
            g.lineTo(x, -y)
          }
          g.stroke()
          g.globalAlpha = 1
        }
        g.restore()
      }
    }

    // Sandstone: long wavy stripes in four tones, with rounded erosion pockets.
    if (p.zone === 'crumble') {
      const tones = [p.faceLight, p.face, mix(p.face, p.faceDark, 0.6), mix(p.faceLight, '#ffffff', 0.25)]
      const BAND = 26
      for (let b = Math.floor(yLo / BAND) - 2; b <= Math.ceil(yHi / BAND) + 1; b++) {
        const br = createRng(`${this.seed}:band:${b}`)
        const ph = br.next() * 9
        const lift = br.range(-5, 5)
        const yAt = (x: number, k: number) => k * BAND + lift + 5 * Math.sin(x / 61 + ph) + 2.5 * Math.sin(x / 17 + ph * 2) + 0.03 * (x - 200)
        g.fillStyle = tones[((b % 4) + 4) % 4]
        g.beginPath()
        for (let x = -FACE_PAD; x <= WORLD_W + FACE_PAD; x += 8) {
          if (x === -FACE_PAD) g.moveTo(x, -yAt(x, b + 1))
          else g.lineTo(x, -yAt(x, b + 1))
        }
        for (let x = WORLD_W + FACE_PAD; x >= -FACE_PAD; x -= 8) g.lineTo(x, -(yAt(x, b) - 3))
        g.closePath()
        g.fill()
        // The darker line where layers meet.
        g.strokeStyle = p.faceEdge
        g.globalAlpha = 0.35
        g.lineWidth = 1
        g.beginPath()
        for (let x = -FACE_PAD; x <= WORLD_W + FACE_PAD; x += 8) {
          if (x === -FACE_PAD) g.moveTo(x, -yAt(x, b))
          else g.lineTo(x, -yAt(x, b))
        }
        g.stroke()
        g.globalAlpha = 1
        // Erosion pockets.
        if (br.next() < 0.5) {
          const px = br.range(0, WORLD_W)
          const py = b * BAND + BAND * 0.5
          g.fillStyle = mix(p.faceDark, p.faceEdge, 0.4)
          g.globalAlpha = 0.5
          g.beginPath()
          g.ellipse(px, -py, br.range(6, 16), br.range(3, 6), 0, 0, Math.PI * 2)
          g.fill()
          g.globalAlpha = 0.6
          g.fillStyle = p.faceLight
          g.beginPath()
          g.ellipse(px, -py + 3.5, br.range(6, 14), 1.4, 0, 0, Math.PI * 2)
          g.fill()
          g.globalAlpha = 1
        }
      }
    }

    // Rounded like a tower: the sun side is lit, the far side and both edges fall into shade.
    const sunLeft = p.celestial.x < 0.5
    const light = g.createLinearGradient(-20, 0, WORLD_W + 20, 0)
    const lit = rgba(p.faceLight, 0.42)
    const shade = rgba(p.faceDark, 0.55)
    light.addColorStop(0, sunLeft ? rgba(p.faceDark, 0.25) : shade)
    light.addColorStop(0.12, sunLeft ? lit : rgba(p.faceDark, 0.18))
    light.addColorStop(0.45, rgba(p.faceLight, 0))
    light.addColorStop(0.88, sunLeft ? rgba(p.faceDark, 0.18) : lit)
    light.addColorStop(1, sunLeft ? shade : rgba(p.faceDark, 0.25))
    g.fillStyle = light
    g.fillRect(-FACE_PAD, -yTop - 40, W, H + 80)

    this.facePatches(g, yLo, yHi, rng)

    // Grain.
    const n = Math.round((W * (yHi - yLo)) / 110)
    const dark = mix(p.face, p.ink, 0.4)
    const lightC = mix(p.face, '#ffffff', 0.5)
    for (let i = 0; i < n; i++) {
      g.globalAlpha = rng.range(0.06, 0.14)
      g.fillStyle = i % 2 ? dark : lightC
      const r = rng.range(0.35, 0.8)
      g.fillRect(rng.range(-FACE_PAD, WORLD_W + FACE_PAD), -rng.range(yLo, yHi), r, r)
    }
    g.globalAlpha = 1

    // The cut edge: a darker band just inside the silhouette, then a light rim.
    g.strokeStyle = p.faceEdge
    g.globalAlpha = 0.7
    g.lineWidth = 7
    g.stroke(path)
    g.restore()
    g.save()
    g.strokeStyle = mix(p.faceLight, '#ffffff', 0.3)
    g.globalAlpha = 0.5
    g.lineWidth = 1.2
    g.stroke(path)
    g.restore()
    // The top of the mountain wears the zone's cap (grass, moss, sand, snow, cloud).
    if (crestPath) {
      g.save()
      g.lineJoin = 'round'
      g.lineCap = 'round'
      g.strokeStyle = ink(p.top)
      g.lineWidth = 9
      g.globalAlpha = 0.5
      g.stroke(crestPath)
      g.globalAlpha = 1
      g.strokeStyle = p.top
      g.lineWidth = 7
      g.stroke(crestPath)
      g.strokeStyle = p.topLight
      g.lineWidth = 2
      g.translate(0, -2)
      g.stroke(crestPath)
      g.restore()
      if (p.topKind === 'grass' || p.topKind === 'moss' || p.topKind === 'snow') {
        const r2 = createRng(`${this.seed}:crest`)
        for (let x = xl(this.crestLow) + 8; x < xr(this.crestLow) - 8; x += r2.range(14, 30)) {
          const y = this.crest(x)
          if (y > yHi) continue
          tuft(g, x, -y - 2, r2.range(4, 8), p.tuft, r2.range(-0.25, 0.25))
          if (p.zone === 'meadow' && r2.next() < 0.4) flower(g, x + 5, -y - 2, r2.range(5, 8), p.accents[r2.int(3)], p.tuft)
        }
      }
    }
    return c
  }

  /** Zone touches on the face: moss and vines, snow patches, wisps, little holes. */
  private facePatches(g: CanvasRenderingContext2D, yLo: number, yHi: number, rng: Rng): void {
    const p = this.palette
    const zone = p.zone
    const count = Math.round((yHi - yLo) / 55)
    for (let i = 0; i < count; i++) {
      const x = rng.range(-10, WORLD_W + 10)
      const y = rng.range(yLo, yHi)
      switch (zone) {
        case 'meadow': {
          // Little ivy sprigs and specks of flowers on the rock.
          g.strokeStyle = p.facePatch
          g.globalAlpha = 0.7
          g.lineWidth = 1.4
          g.lineCap = 'round'
          g.beginPath()
          g.moveTo(x, -y)
          g.quadraticCurveTo(x + 6, -y + 8, x + 2, -y + 16)
          g.stroke()
          g.fillStyle = p.facePatch
          for (let l = 0; l < 3; l++) {
            g.beginPath()
            g.ellipse(x + 3 + (l % 2 ? 3 : -2), -y + 4 + l * 5, 2.4, 1.4, l % 2 ? 0.6 : -0.6, 0, Math.PI * 2)
            g.fill()
          }
          if (rng.next() < 0.4) {
            g.fillStyle = p.accents[rng.int(2)]
            g.globalAlpha = 0.8
            g.beginPath()
            g.arc(x + 5, -y + 2, 1.6, 0, Math.PI * 2)
            g.fill()
          }
          break
        }
        case 'hollow': {
          // Hanging vines with leaves; tiny glowing specks.
          const len = rng.range(18, 46)
          g.strokeStyle = mix(p.facePatch, p.face, 0.2)
          g.globalAlpha = 0.85
          g.lineWidth = 1.3
          g.beginPath()
          g.moveTo(x, -y)
          g.bezierCurveTo(x + 4, -y + len * 0.3, x - 4, -y + len * 0.7, x + 1, -y + len)
          g.stroke()
          g.fillStyle = p.facePatch
          for (let l = 0; l < len / 8; l++) {
            const ly = -y + 6 + l * 8
            g.beginPath()
            g.ellipse(x + (l % 2 ? 3 : -3), ly, 2.8, 1.5, l % 2 ? 0.5 : -0.5, 0, Math.PI * 2)
            g.fill()
          }
          g.fillStyle = '#d9ff9a'
          g.globalAlpha = 0.5
          g.beginPath()
          g.arc(x + rng.range(-20, 20), -y + rng.range(-20, 20), 0.9, 0, Math.PI * 2)
          g.fill()
          break
        }
        case 'crumble': {
          // Little round holes (swallow nests) and pebbles.
          g.fillStyle = p.faceEdge
          g.globalAlpha = 0.55
          g.beginPath()
          g.ellipse(x, -y, rng.range(2.5, 4.5), rng.range(1.8, 3), 0, 0, Math.PI * 2)
          g.fill()
          g.fillStyle = p.faceLight
          g.globalAlpha = 0.8
          g.beginPath()
          g.ellipse(x, -y + 3, 4, 1.2, 0, 0, Math.PI * 2)
          g.fill()
          break
        }
        case 'ridge':
        case 'summit': {
          // Snow patches resting on little steps in the rock.
          g.fillStyle = p.facePatch
          g.globalAlpha = 0.85
          const w = rng.range(10, 26)
          g.beginPath()
          g.moveTo(x - w / 2, -y)
          g.quadraticCurveTo(x - w / 4, -y - 5, x, -y - 4)
          g.quadraticCurveTo(x + w / 4, -y - 6, x + w / 2, -y)
          g.quadraticCurveTo(x, -y + 2, x - w / 2, -y)
          g.fill()
          break
        }
        case 'cloud': {
          // Soft wisps resting on the rock.
          g.fillStyle = p.facePatch
          g.globalAlpha = 0.35
          g.beginPath()
          g.ellipse(x, -y, rng.range(14, 30), rng.range(3, 6), 0, 0, Math.PI * 2)
          g.fill()
          break
        }
        default:
          break
      }
    }
    g.globalAlpha = 1
  }

  // -------------------------------------------------------------------------------------------
  // Ground at the foot of the pitch

  private drawGround(ctx: CanvasRenderingContext2D, view: View): void {
    const top = GROUND_TOP + 30
    if (view.bottom > top) {
      if (this.ground && view.bottom > top + 1200) this.dropGround()
      return
    }
    const p = this.palette
    if (!this.ground) this.ground = this.buildGround(view)
    const gr = this.ground
    if (gr) {
      ctx.drawImage(gr.canvas, view.x(gr.x0), view.y(gr.y1), gr.w * view.s, gr.h * view.s)
      // Beyond the strip (zoomed far out): plain ground.
      const yB = view.y(gr.y1 - gr.h)
      if (yB < view.h) {
        ctx.fillStyle = p.groundDark
        ctx.fillRect(0, yB - 1, view.w, view.h - yB + 1)
      }
      const xL = view.x(gr.x0)
      const xR = view.x(gr.x0 + gr.w)
      if (xL > 0 || xR < view.w) {
        // Zoomed far out (the Beta Map): carry on the ground's colours to the screen edges.
        const yT = view.y(GROUND_TOP - 6)
        const grad = ctx.createLinearGradient(0, yT, 0, yB)
        grad.addColorStop(0, p.ground)
        grad.addColorStop(1, p.groundDark)
        ctx.fillStyle = grad
        if (xL > 0) ctx.fillRect(0, yT, xL + 1, yB - yT)
        if (xR < view.w) ctx.fillRect(xR - 1, yT, view.w - xR + 1, yB - yT)
      }
    }
  }

  private buildGround(view: View): { canvas: HTMLCanvasElement; x0: number; y1: number; w: number; h: number } | null {
    const p = this.palette
    // Wide enough for the Big Leap pull-back.
    const halfW = view.w / 2 / (view.base * TUNING.bigLeapZoom) + 40
    const x0 = WORLD_W / 2 - halfW
    const w = halfW * 2
    const y1 = GROUND_TOP + 28
    const y0 = GROUND_LOW - 70
    const h = y1 - y0
    const k = Math.min(this.k, view.base * 1.5, MAX_STRIP_PX / w)
    const c = makeCanvas(w * k, h * k)
    const g = c.getContext('2d')
    if (!g) return null
    g.setTransform(k, 0, 0, k, -x0 * k, y1 * k)
    const rng = createRng(`${this.seed}:ground`)
    const surf = (x: number) => GROUND_TOP - 6 + 4 * Math.sin(x / 61 + 1.1) + 2.5 * Math.sin(x / 19)
    const path = new Path2D()
    path.moveTo(x0, -y0)
    for (let x = x0; x <= x0 + w + 6; x += 6) path.lineTo(x, -surf(x))
    path.lineTo(x0 + w, -y0)
    path.closePath()
    g.save()
    g.shadowColor = p.shadow
    g.shadowBlur = 12 * k
    g.shadowOffsetY = -2 * k
    const grad = g.createLinearGradient(0, -GROUND_TOP, 0, -y0)
    grad.addColorStop(0, p.ground)
    grad.addColorStop(1, p.groundDark)
    g.fillStyle = grad
    g.fill(path)
    g.restore()
    // A lighter lip along the top.
    g.save()
    g.clip(path)
    g.strokeStyle = mix(p.ground, '#ffffff', 0.35)
    g.lineWidth = 3
    g.beginPath()
    for (let x = x0; x <= x0 + w + 6; x += 6) {
      if (x === x0) g.moveTo(x, -surf(x) + 1.5)
      else g.lineTo(x, -surf(x) + 1.5)
    }
    g.stroke()
    // Speckles / pebbles.
    for (let i = 0; i < w * 0.5; i++) {
      g.globalAlpha = rng.range(0.1, 0.25)
      g.fillStyle = i % 3 === 0 ? mix(p.groundDark, p.ink, 0.3) : mix(p.ground, '#ffffff', 0.4)
      g.beginPath()
      g.ellipse(rng.range(x0, x0 + w), -rng.range(y0, GROUND_TOP - 6), rng.range(0.6, 1.8), rng.range(0.4, 1.1), 0, 0, Math.PI * 2)
      g.fill()
    }
    g.restore()
    // Zone dressing on the ground line.
    for (let x = x0 + rng.range(0, 14); x < x0 + w; x += rng.range(10, 26)) {
      const y = surf(x)
      switch (p.topKind) {
        case 'grass':
        case 'moss':
          tuft(g, x, -y + 1, rng.range(4, 8), p.tuft, rng.range(-0.2, 0.2))
          if (p.zone === 'meadow' && rng.next() < 0.25) flower(g, x + 4, -y, rng.range(5, 8), p.accents[rng.int(3)], p.tuft)
          break
        case 'sand':
          if (rng.next() < 0.3) pebble(g, x, -y + 1, rng.range(2, 4), p.rockLight, p.rockInk)
          if (rng.next() < 0.15) tuft(g, x, -y + 1, rng.range(3, 6), p.tuft, 0)
          break
        case 'snow':
          if (rng.next() < 0.25) tuft(g, x, -y + 1, rng.range(3, 6), p.tuft, rng.range(-0.2, 0.2))
          break
        case 'cloud':
          g.fillStyle = mix(p.ground, '#ffffff', 0.5)
          g.beginPath()
          g.arc(x, -y + 2, rng.range(5, 10), Math.PI, 0)
          g.fill()
          break
      }
    }
    return { canvas: c, x0, y1, w, h }
  }

  private dropGround(): void {
    if (this.ground) freeCanvas(this.ground.canvas)
    this.ground = null
  }

  // -------------------------------------------------------------------------------------------
  // Behind the route: caves, floating clouds, loose decorations, rope anchors.

  drawBehind(ctx: CanvasRenderingContext2D, view: View): void {
    this.frame++
    view.applyScreen(ctx)
    const top = view.top + 40
    const bottom = view.bottom - 40
    for (const f of this.free) {
      const d = f.decor
      const hgt = decorHeight(d)
      if (d.y - hgt > top || d.y + hgt < bottom) continue
      let sp = this.sprites.get(f.key)
      if (!sp) {
        sp = this.buildFreeDecor(f.decor)
        this.sprites.set(f.key, sp)
      }
      this.blit(ctx, view, sp)
    }
    // Rope anchors: a bolt and ring at each camp.
    view.applyWorld(ctx)
    const p = this.palette
    for (const b of this.bolts) {
      if (b.y > top || b.y < bottom) continue
      ctx.fillStyle = mix(p.faceDark, p.ink, 0.3)
      ctx.beginPath()
      ctx.ellipse(b.x, -b.y, 3.2, 4.2, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#c9ccd6'
      ctx.lineWidth = 1.3
      ctx.beginPath()
      ctx.arc(b.x, -b.y + 3.2, 2.6, 0, Math.PI * 2)
      ctx.stroke()
      ctx.fillStyle = '#e9ebf2'
      ctx.beginPath()
      ctx.arc(b.x - 0.8, -b.y - 1, 1.1, 0, Math.PI * 2)
      ctx.fill()
    }
    this.evict(view)
  }

  private buildFreeDecor(d: Decor): Sprite {
    const s = d.scale ?? 1
    const hw = decorHalfWidth(d) + 12
    const hgt = decorHeight(d)
    const isCloud = d.kind === 'cloud'
    const x0 = d.x - hw
    const y1 = isCloud ? d.y + hgt / 2 + 12 : d.y + hgt + 8
    const y0 = isCloud ? d.y - hgt / 2 - 12 : d.y - 14
    const sp = this.newSprite(x0, y1, hw * 2, y1 - y0)
    const g = sp.canvas.getContext('2d')
    if (g) {
      this.artTransform(g, sp)
      drawDecor(g, d, this.palette, s, this.k)
    }
    return sp
  }

  // -------------------------------------------------------------------------------------------
  // Ledges, holds, and the live bits

  /** Mirror session changes (crumbles, reveals) into effects. Call once per frame before drawing. */
  sync(session: ClimbSession, t: number, dt: number, particles: Particles): void {
    if (session !== this.session) {
      this.session = session
      this.knownCrumbled.clear()
      for (const id of session.crumbled) this.knownCrumbled.add(id)
      this.knownRevealed.clear()
      for (const id of session.revealed) this.knownRevealed.add(id)
      this.popAt.clear()
      this.revealAt.clear()
      this.chunks.length = 0
    }
    for (const id of session.crumbled) {
      if (this.knownCrumbled.has(id)) continue
      this.knownCrumbled.add(id)
      const info = this.infoById.get(id)
      if (info) {
        this.spawnChunks(info.ledge)
        particles.crumbleDust(info.ledge.x, info.ledge.y - (info.ledge.h ?? LEDGE_H) * 0.5, info.ledge.w, 16)
      }
    }
    if (this.knownCrumbled.size > session.crumbled.size) {
      for (const id of this.knownCrumbled) {
        if (session.crumbled.has(id)) continue
        this.knownCrumbled.delete(id)
        this.popAt.set(id, t)
        const info = this.infoById.get(id)
        if (info) particles.restorePuff(info.ledge.x, info.ledge.y, info.ledge.w)
      }
    }
    for (const id of session.revealed) {
      if (this.knownRevealed.has(id)) continue
      this.knownRevealed.add(id)
      this.revealAt.set(id, t)
      const h = this.holds.find((x) => x.id === id)
      if (h) particles.revealSparkle(h.x, h.y, 18)
    }
    // Crumbling ledges shed pebbles and puffs of dust while they shake.
    this.pebbleAcc += dt
    if (session.crumbleTimers.size > 0 && this.pebbleAcc > 0.07) {
      this.pebbleAcc = 0
      for (const [id, elapsed] of session.crumbleTimers) {
        if (TUNING.crumbleDelay - elapsed > TUNING.crumbleWarn) continue
        const info = this.infoById.get(id)
        if (!info) continue
        const l = info.ledge
        particles.pebble(l.x + this.rng.range(8, l.w - 8), l.y - (l.h ?? LEDGE_H) * 0.8)
        if (this.rng.next() < 0.45) particles.crumbleDust(l.x + this.rng.range(0, l.w * 0.7), l.y - (l.h ?? LEDGE_H) * 0.7, l.w * 0.3, 2)
      }
    }
    // Falling chunks.
    for (let i = this.chunks.length - 1; i >= 0; i--) {
      const c = this.chunks[i]
      c.age += dt
      c.vy -= 620 * dt
      c.x += c.vx * dt
      c.y += c.vy * dt
      c.rot += c.vr * dt
      if (c.age > 1.4) this.chunks.splice(i, 1)
    }
  }

  private spawnChunks(l: Ledge): void {
    const h = l.h ?? LEDGE_H
    const n = Math.max(4, Math.round(l.w / 22))
    for (let i = 0; i < n; i++) {
      const w = l.w / n
      const shape: number[] = []
      const pts = 5 + (i % 2)
      for (let q = 0; q < pts; q++) {
        const a = (q / pts) * Math.PI * 2 + this.rng.range(-0.25, 0.25)
        const r = this.rng.range(0.75, 1.05)
        shape.push(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5)
      }
      this.chunks.push({
        shape,
        x: l.x + (i + 0.5) * w,
        y: l.y - h * 0.4,
        vx: this.rng.range(-30, 30) + (i - n / 2) * 6,
        vy: this.rng.range(10, 60),
        rot: this.rng.range(-0.2, 0.2),
        vr: this.rng.range(-3, 3),
        w: w * this.rng.range(0.75, 0.95),
        h: h * this.rng.range(0.6, 0.9),
        age: 0,
        top: true,
      })
    }
  }

  drawLedges(ctx: CanvasRenderingContext2D, view: View, session: ClimbSession, t: number, wind: WindLean | null): void {
    const p = this.palette
    const top = view.top + 60
    const bottom = view.bottom - 60
    view.applyScreen(ctx)
    this.prebuild(view, session)

    for (let i = 0; i < this.infos.length; i++) {
      const info = this.infos[i]
      const l = info.ledge
      const lh = l.h ?? LEDGE_H
      if (l.y - lh > top || l.y + info.decorH < bottom) continue
      if (l.bridge) {
        view.applyWorld(ctx)
        this.drawBridge(ctx, l, session, t, wind)
        view.applyScreen(ctx)
        continue
      }
      if (session.crumbled.has(l.id)) continue
      const cracked = !!l.crumble && session.foundCrumbles.has(l.id)
      const key = cracked ? info.keyCracked : info.key
      let sp = this.sprites.get(key)
      if (!sp) {
        sp = this.buildLedge(info, cracked)
        this.sprites.set(key, sp)
      }
      // Crumbling: shake through the warning window.
      let dx = 0
      let dy = 0
      const prog = l.crumble ? session.crumbleProgress(l.id) : null
      if (prog !== null) {
        const left = (1 - prog) * TUNING.crumbleDelay
        if (left < TUNING.crumbleWarn) {
          const k = 1 - left / TUNING.crumbleWarn
          const amp = 0.5 + 2.2 * k * k
          dx = Math.sin(t * 47) * amp
          dy = Math.sin(t * 31 + 1) * amp * 0.4
        } else {
          // A tiny settle wobble when she lands.
          dx = Math.sin(t * 30) * 0.25
        }
      }
      // Popping back after a crumble.
      const pop = this.popAt.get(l.id)
      let scale = 1
      if (pop !== undefined) {
        const k = (t - pop) / 0.4
        if (k >= 1) this.popAt.delete(l.id)
        else scale = 0.55 + 0.45 * easeOutBack(clamp01(k), 2.2)
      }
      this.blit(ctx, view, sp, dx, dy, scale, l.x + l.w / 2, l.y - lh / 2)
    }

    view.applyWorld(ctx)
    // Grass that bends with the wind.
    if (wind) {
      ctx.strokeStyle = p.tuft
      ctx.lineCap = 'round'
      ctx.lineWidth = 1.5
      for (let i = 0; i < this.infos.length; i++) {
        const info = this.infos[i]
        if (!info.liveTufts) continue
        const l = info.ledge
        if (l.y > top || l.y < bottom || session.crumbled.has(l.id)) continue
        const lean = wind.lean(l.x + l.w / 2, l.y + 10)
        const tf = info.tufts
        ctx.beginPath()
        for (let j = 0; j < tf.length; j += 2) {
          const x = tf[j]
          const hgt = tf[j + 1]
          const sway = lean * 0.9 + Math.sin(t * 2.3 + x * 0.3) * 0.08
          for (let b = -1; b <= 1; b++) {
            const bx = x + b * 2.2
            const tipX = bx + b * 1.6 + sway * hgt * 1.1
            const tipY = -l.y - 1 - hgt * (1 - Math.abs(sway) * 0.35) * (b === 0 ? 1 : 0.75)
            ctx.moveTo(bx, -l.y + 1.5)
            ctx.quadraticCurveTo(bx + sway * hgt * 0.3, -l.y - hgt * 0.5, tipX, tipY)
          }
        }
        ctx.stroke()
      }
    }

    // Holds.
    for (let i = 0; i < this.holds.length; i++) {
      const h = this.holds[i]
      if (h.y > top || h.y < bottom) continue
      if (h.hidden && !session.revealed.has(h.id)) continue
      let scale = 1
      const rv = this.revealAt.get(h.id)
      if (rv !== undefined) {
        const k = (t - rv) / 0.5
        if (k >= 1.6) this.revealAt.delete(h.id)
        scale = k < 1 ? 0.2 + 0.8 * easeOutBack(clamp01(k), 2.6) : 1
      }
      this.drawHold(ctx, h, scale, t, h.hidden === true)
    }

    // Lanterns, flags, bunting.
    for (let i = 0; i < this.dyn.length; i++) {
      const d = this.dyn[i]
      if (d.y > top + 40 || d.y < bottom - 60) continue
      const lean = wind ? wind.lean(d.x, d.y + 20) : 0
      switch (d.kind) {
        case 'lantern':
          this.drawLantern(ctx, d, t)
          break
        case 'flag':
        case 'summit':
        case 'pennant':
          drawFlag(ctx, d, p, t, lean)
          break
        case 'bunting':
          drawBunting(ctx, d, p, t, lean)
          break
      }
    }

    // Chunks of a crumbled ledge, falling away.
    if (this.chunks.length) {
      for (const c of this.chunks) {
        const a = 1 - clamp01((c.age - 0.6) / 0.8)
        ctx.globalAlpha = a
        ctx.save()
        ctx.translate(c.x, -c.y)
        ctx.rotate(c.rot)
        ctx.fillStyle = p.rock
        ctx.strokeStyle = p.rockInk
        ctx.lineWidth = 1.2
        ctx.beginPath()
        const sh = c.shape
        for (let q = 0; q < sh.length; q += 2) {
          const x = sh[q] * c.w
          const y = sh[q + 1] * c.h
          if (q === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
        ctx.fillStyle = p.top
        ctx.beginPath()
        ctx.ellipse(0, -c.h * 0.32, c.w * 0.36, 2.2, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }
      ctx.globalAlpha = 1
    }
  }

  /** Build a couple of sprites a frame for what is about to scroll into view (above and below). */
  private prebuild(view: View, session: ClimbSession): void {
    let budget = 2
    const span = view.top - view.bottom
    const hi = view.top + span * 0.9
    const lo = view.bottom - span * 0.4
    for (let i = 0; i < this.infos.length && budget > 0; i++) {
      const info = this.infos[i]
      const l = info.ledge
      if (l.bridge || l.y > hi || l.y + info.decorH < lo) continue
      const cracked = !!l.crumble && session.foundCrumbles.has(l.id)
      const key = cracked ? info.keyCracked : info.key
      if (this.sprites.has(key)) continue
      this.sprites.set(key, this.buildLedge(info, cracked))
      budget--
    }
    for (let i = 0; i < this.free.length && budget > 0; i++) {
      const f = this.free[i]
      const d = f.decor
      if (d.y > hi || d.y + decorHeight(d) < lo || this.sprites.has(f.key)) continue
      this.sprites.set(f.key, this.buildFreeDecor(d))
      budget--
    }
  }

  private blit(ctx: CanvasRenderingContext2D, view: View, sp: Sprite, dx = 0, dy = 0, scale = 1, px = 0, py = 0): void {
    sp.used = this.frame
    let x = view.x(sp.x0 + dx)
    let y = view.y(sp.y1 + dy)
    let w = sp.w * view.s
    let h = sp.h * view.s
    if (scale !== 1) {
      const cx = view.x(px)
      const cy = view.y(py)
      x = cx + (x - cx) * scale
      y = cy + (y - cy) * scale
      w *= scale
      h *= scale
    } else if (Math.abs(view.zoom - 1) < 1e-3) {
      // Snap to device pixels so sprites stay crisp at 1:1.
      const d = view.dpr
      x = Math.round(x * d) / d
      y = Math.round(y * d) / d
    }
    ctx.drawImage(sp.canvas, x, y, w, h)
  }

  private newSprite(x0: number, y1: number, w: number, h: number): Sprite {
    const k = this.k
    const canvas = makeCanvas(Math.min(MAX_STRIP_PX, w * k), Math.min(MAX_STRIP_PX, h * k))
    return { canvas, x0, y1, w, h, used: this.frame }
  }

  private artTransform(g: CanvasRenderingContext2D, sp: Sprite): void {
    const kx = sp.canvas.width / sp.w
    const ky = sp.canvas.height / sp.h
    g.setTransform(kx, 0, 0, ky, -sp.x0 * kx, sp.y1 * ky)
  }

  private buildLedge(info: LedgeInfo, cracked: boolean): Sprite {
    const l = info.ledge
    const p = this.palette
    const lh = l.h ?? LEDGE_H
    let xL = l.x - 18
    let xR = l.x + l.w + 18
    for (const d of info.back.concat(info.front)) {
      const hw = decorHalfWidth(d) + 6
      xL = Math.min(xL, d.x - hw)
      xR = Math.max(xR, d.x + hw)
    }
    const y1 = l.y + info.decorH + 10
    const y0 = l.y - lh - 16
    const sp = this.newSprite(xL, y1, xR - xL, y1 - y0)
    const g = sp.canvas.getContext('2d')
    if (!g) return sp
    this.artTransform(g, sp)
    const rng = createRng(info.seed)
    for (const d of info.back) drawDecor(g, d, p, d.scale ?? 1, this.k)
    drawSlab(g, l, p, rng, this.k)
    drawCap(g, l, p, rng, !info.liveTufts, info.ledge.camp === true)
    if (cracked) drawCracks(g, l, p, createRng(`${info.seed}:cracks`))
    for (const d of info.front) drawDecor(g, d, p, d.scale ?? 1, this.k)
    return sp
  }

  private drawBridge(ctx: CanvasRenderingContext2D, l: Ledge, session: ClimbSession, t: number, wind: WindLean | null): void {
    const p = this.palette
    const x0 = l.x
    const x1 = l.x + l.w
    const top = -l.y
    const stood = session.elementId === l.id && session.phase !== 'flying' && session.phase !== 'roped'
    const herX = session.body.x
    const sinceLand = session.t - session.lastLandAt
    const bounce = stood ? Math.exp(-sinceLand * 2.2) * Math.sin(sinceLand * 11) * 2.2 : 0
    const gust = wind ? wind.lean(l.x + l.w / 2, l.y + 10) : 0
    const sway = gust * 2 + Math.sin(t * 1.6) * 0.5
    const dip = (x: number) => {
      const span = (x - x0) / (x1 - x0)
      const base = Math.sin(Math.PI * span) * (1.6 + Math.abs(gust) * 1.5)
      const her = stood ? 3.2 * Math.exp(-(((x - herX) / 34) ** 2)) : 0
      return base + her + bounce * Math.sin(Math.PI * span)
    }
    // Posts.
    const post = (x: number) => {
      ctx.fillStyle = p.wood
      ctx.strokeStyle = ink(p.wood)
      ctx.lineWidth = 1.3
      ctx.beginPath()
      roundRect(ctx, x - 3.2, top - 30, 6.4, 46, 2.5)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = mix(p.wood, '#ffffff', 0.25)
      ctx.beginPath()
      ctx.arc(x, top - 30, 3.6, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
    // Rope colour: a sun-faded natural rope.
    const rope = mix(p.wood, '#f3e2c0', 0.5)
    // Back hand rope.
    ctx.strokeStyle = ink(rope)
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x0, top - 26)
    ctx.quadraticCurveTo((x0 + x1) / 2 + sway * 3, top - 12 + dip((x0 + x1) / 2), x1, top - 26)
    ctx.stroke()
    post(x0)
    post(x1)
    // Deck: planks hung on two ropes.
    const n = Math.round(l.w / 13)
    const pw = l.w / n
    for (let i = 0; i < n; i++) {
      const cx = x0 + (i + 0.5) * pw
      const d = dip(cx)
      const tilt = (dip(cx + 4) - dip(cx - 4)) / 8
      ctx.save()
      ctx.translate(cx + sway * 0.6 * Math.sin((Math.PI * (cx - x0)) / l.w), top + d - 0.5)
      ctx.rotate(Math.atan(tilt))
      ctx.fillStyle = i % 3 === 1 ? mix(p.wood, '#ffffff', 0.15) : p.wood
      ctx.strokeStyle = ink(p.wood)
      ctx.lineWidth = 1.1
      ctx.beginPath()
      roundRect(ctx, -pw / 2 + 1, -1, pw - 2, 5.5, 1.6)
      ctx.fill()
      ctx.stroke()
      ctx.restore()
    }
    // Deck ropes and the front hand rope with hangers.
    ctx.strokeStyle = rope
    ctx.lineWidth = 1.4
    ctx.beginPath()
    for (let x = x0; x <= x1 + 0.1; x += 6) {
      const y = top + dip(x) + 4.5
      if (x === x0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
    ctx.strokeStyle = ink(rope)
    ctx.lineWidth = 0.9
    ctx.beginPath()
    const hand = (x: number) => {
      const s = (x - x0) / (x1 - x0)
      return top - 24 + Math.sin(Math.PI * s) * (12 + dip(x) * 0.5)
    }
    for (let x = x0 + pw; x < x1 - 1; x += pw * 2) {
      ctx.moveTo(x, hand(x))
      ctx.lineTo(x, top + dip(x))
    }
    ctx.stroke()
    ctx.strokeStyle = rope
    ctx.lineWidth = 2.2
    ctx.beginPath()
    for (let x = x0; x <= x1 + 0.1; x += 6) {
      const y = hand(x)
      if (x === x0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }

  private drawHold(ctx: CanvasRenderingContext2D, h: Hold, scale: number, t: number, wasHidden: boolean): void {
    const style = h.style ?? 'jug'
    let sp = this.holdSprites[style]
    if (!sp) {
      sp = this.buildHoldSprite(style)
      this.holdSprites[style] = sp
    }
    if (!this.holdGlow) this.holdGlow = softDot(64, this.palette.hold.glow, 0.2)
    const r = HOLD_SPRITE / 2
    // A soft halo on the rock so every hold reads as "grab me".
    const pulse = wasHidden ? 0.15 * Math.sin(t * 3) : 0
    // Just revealed: the halo flares, then settles.
    const flare = scale < 1 || this.revealAt.has(h.id) ? 0.4 : 0
    ctx.globalAlpha = Math.min(1, (this.palette.night || this.palette.zone === 'hollow' ? 0.55 : 0.5) + pulse + flare)
    const gr = (25 + flare * 20) * Math.max(scale, 0.6)
    ctx.drawImage(this.holdGlow, h.x - gr, -h.y - gr, gr * 2, gr * 2)
    ctx.globalAlpha = 1
    const rr = r * scale * HOLD_SCALE
    ctx.drawImage(sp, h.x - rr, -h.y - rr, rr * 2, rr * 2)
  }

  private buildHoldSprite(style: string): HTMLCanvasElement {
    // Built at the size it is drawn (HOLD_SCALE), so it stays crisp.
    const k = this.k * HOLD_SCALE
    const size = HOLD_SPRITE
    const c = makeCanvas(size * k, size * k)
    const g = c.getContext('2d')
    if (!g) return c
    g.setTransform(k, 0, 0, k, (size / 2) * k, (size / 2) * k)
    drawHoldArt(g, style, this.palette, k)
    return c
  }

  private drawLantern(ctx: CanvasRenderingContext2D, d: Dyn, t: number): void {
    const p = this.palette
    const s = d.scale
    const x = d.x
    const base = -d.y
    const hy = base - 22 * s
    // Glow first (behind the post).
    if (!this.glow) this.glow = softDot(64, p.lanternGlow, 0.15)
    const flicker = 0.9 + 0.06 * Math.sin(t * 7.3 + d.seed) + 0.04 * Math.sin(t * 13.1 + d.seed * 2)
    const gr = (p.night ? 40 : 24) * s * flicker
    ctx.globalAlpha = p.night ? 0.75 : 0.5
    ctx.drawImage(this.glow, x + 6 * s - gr, hy + 6 * s - gr, gr * 2, gr * 2)
    ctx.globalAlpha = 1
    // Post with a little arm.
    ctx.strokeStyle = ink(p.wood)
    ctx.lineWidth = 3.6 * s
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(x, base + 1)
    ctx.lineTo(x, hy - 2 * s)
    ctx.lineTo(x + 6 * s, hy - 2 * s)
    ctx.stroke()
    ctx.strokeStyle = p.wood
    ctx.lineWidth = 2 * s
    ctx.stroke()
    // The lantern swings very slightly.
    const sw = Math.sin(t * 1.7 + d.seed) * 0.08
    ctx.save()
    ctx.translate(x + 6 * s, hy - 2 * s)
    ctx.rotate(sw)
    ctx.strokeStyle = ink(p.wood)
    ctx.lineWidth = 0.8
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(0, 2.5 * s)
    ctx.stroke()
    ctx.fillStyle = '#5b4a52'
    ctx.beginPath()
    roundRect(ctx, -3.2 * s, 2.5 * s, 6.4 * s, 2 * s, 1)
    ctx.fill()
    ctx.fillStyle = p.lantern
    ctx.strokeStyle = '#5b4a52'
    ctx.lineWidth = 1
    ctx.beginPath()
    roundRect(ctx, -2.8 * s, 4.3 * s, 5.6 * s, 7 * s, 2 * s)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#fffbe6'
    ctx.globalAlpha = 0.85 * flicker
    ctx.beginPath()
    ctx.ellipse(0, 7.8 * s, 1.3 * s, 2.2 * s, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.fillStyle = '#5b4a52'
    ctx.beginPath()
    roundRect(ctx, -3.2 * s, 11 * s, 6.4 * s, 1.6 * s, 0.8)
    ctx.fill()
    ctx.restore()
  }

  // -------------------------------------------------------------------------------------------
  // Cache housekeeping

  private evict(view: View): void {
    if (this.frame % 30 !== 0) return
    const span = view.top - view.bottom
    const lo = view.bottom - span * 1.6
    const hi = view.top + span * 1.6
    for (const [key, sp] of this.sprites) {
      const far = sp.y1 < lo || sp.y1 - sp.h > hi
      if (far && this.frame - sp.used > 60) this.dropSprite(key)
    }
  }

  private dropSprite(key: string): void {
    const sp = this.sprites.get(key)
    if (!sp) return
    freeCanvas(sp.canvas)
    this.sprites.delete(key)
  }

  private release(): void {
    for (const sp of this.sprites.values()) freeCanvas(sp.canvas)
    this.sprites.clear()
    for (const c of this.faceStrips.values()) freeCanvas(c)
    this.faceStrips.clear()
    this.dropGround()
    for (const key of Object.keys(this.holdSprites)) freeCanvas(this.holdSprites[key])
    this.holdSprites = {}
    freeCanvas(this.glow)
    freeCanvas(this.holdGlow)
    this.glow = null
    this.holdGlow = null
    this.frame = 0
  }

  /** Total cached pixels (lab/debug). */
  cachedPixels(): number {
    let n = 0
    for (const sp of this.sprites.values()) n += sp.canvas.width * sp.canvas.height
    for (const c of this.faceStrips.values()) n += c.width * c.height
    if (this.ground) n += this.ground.canvas.width * this.ground.canvas.height
    return n
  }

  destroy(): void {
    this.release()
    this.session = null
    this.chunks.length = 0
  }
}

// =============================================================================================
// Art (art coords: x right, y down; world y = −art y)

const GROUND_TOP = 14

/** The face's stone plates per zone: cell width/height, jitter, how much each stone shrinks (crevice). */
const FACE_STONES: Record<string, { w: number; h: number; jitter: number; shrink: number }> = {
  meadow: { w: 92, h: 78, jitter: 0.55, shrink: 0.95 },
  hollow: { w: 80, h: 74, jitter: 0.6, shrink: 0.94 },
  crumble: { w: 0, h: 52, jitter: 0.45, shrink: 0.95 },
  ridge: { w: 64, h: 104, jitter: 0.5, shrink: 0.93 },
  cloud: { w: 100, h: 84, jitter: 0.55, shrink: 0.95 },
  summit: { w: 72, h: 96, jitter: 0.5, shrink: 0.93 },
}

/**
 * Clip a convex polygon (flat x,y list, in place) to the half-plane on the far side of the line
 * through (px, py) with normal (nx, ny) pointing AWAY from the kept side.
 */
function clipHalfPlane(poly: number[], tmp: number[], px: number, py: number, nx: number, ny: number): void {
  tmp.length = 0
  const n = poly.length / 2
  for (let a = 0; a < n; a++) {
    const ax = poly[a * 2]
    const ay = poly[a * 2 + 1]
    const bx = poly[((a + 1) % n) * 2]
    const by = poly[((a + 1) % n) * 2 + 1]
    const da = (ax - px) * nx + (ay - py) * ny
    const db = (bx - px) * nx + (by - py) * ny
    if (da <= 0) tmp.push(ax, ay)
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const t = da / (da - db)
      tmp.push(ax + (bx - ax) * t, ay + (by - ay) * t)
    }
  }
  poly.length = 0
  for (let q = 0; q < tmp.length; q++) poly.push(tmp[q])
}

const GROUND_LOW = 0
const HOLD_SPRITE = 40
/** Holds draw a little larger than their art box: chunky and easy to spot. */
const HOLD_SCALE = 1.18
const BACK_KINDS = new Set<Decor['kind']>(['tree', 'pine', 'tent', 'sign', 'bush'])

function decorHeight(d: Decor): number {
  const s = d.scale ?? 1
  switch (d.kind) {
    case 'tree':
      return 66 * s
    case 'pine':
      return 74 * s
    case 'tent':
      return 40 * s
    case 'sign':
      return 34 * s
    case 'bush':
      return 20 * s
    case 'cave':
      return 54 * s
    case 'cloud':
      return 34 * s
    case 'flag':
      return 44 * s
    case 'lantern':
      return 26 * s
    case 'crystal':
      return 20 * s
    case 'rock':
      return 16 * s
    case 'snow':
      return 10 * s
    default:
      return 14 * s
  }
}

function decorHalfWidth(d: Decor): number {
  const s = d.scale ?? 1
  switch (d.kind) {
    case 'tree':
      return 32 * s
    case 'pine':
      return 22 * s
    case 'tent':
      return 30 * s
    case 'sign':
      return 24 * s
    case 'bush':
      return 18 * s
    case 'cave':
      return 38 * s
    case 'cloud':
      return 50 * s
    case 'snow':
      return 22 * s
    case 'rock':
      return 13 * s
    default:
      return 12 * s
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.moveTo(x + rr, y)
  ctx.lineTo(x + w - rr, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr)
  ctx.lineTo(x + w, y + h - rr)
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h)
  ctx.lineTo(x + rr, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr)
  ctx.lineTo(x, y + rr)
  ctx.quadraticCurveTo(x, y, x + rr, y)
  ctx.closePath()
}

/** A soft rounded blob (rock panel, boulder): centre (cx, cy) in art coords. */
function blobPath(cx: number, cy: number, w: number, h: number, rng: Rng): Path2D {
  const n = 7
  const pts: number[] = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const r = rng.range(0.82, 1.08)
    pts.push(cx + Math.cos(a) * (w / 2) * r, cy + Math.sin(a) * (h / 2) * r)
  }
  const path = new Path2D()
  const mx = (i: number) => (pts[(i * 2) % (n * 2)] + pts[((i + 1) * 2) % (n * 2)]) / 2
  const my = (i: number) => (pts[(i * 2 + 1) % (n * 2)] + pts[((i + 1) * 2 + 1) % (n * 2)]) / 2
  path.moveTo(mx(0), my(0))
  for (let i = 1; i <= n; i++) path.quadraticCurveTo(pts[(i * 2) % (n * 2)], pts[(i * 2 + 1) % (n * 2)], mx(i), my(i))
  path.closePath()
  return path
}

/** The ledge's rock slab: flat top, rounded corners, a soft keel underneath. */
function slabPath(l: Ledge, rng: Rng): Path2D {
  const x0 = l.x
  const x1 = l.x + l.w
  const T = -l.y
  const h = l.h ?? LEDGE_H
  const path = new Path2D()
  path.moveTo(x0 + 5, T)
  path.lineTo(x1 - 5, T)
  path.quadraticCurveTo(x1 + 1.5, T, x1 + 1.5, T + 6)
  // Right side curls under.
  path.quadraticCurveTo(x1 + 1, T + h * 0.6, x1 - 7, T + h * 0.72)
  // Bumpy bottom, deepest towards the middle.
  const n = Math.max(3, Math.round(l.w / 26))
  let px = x1 - 7
  let py = T + h * 0.72
  for (let i = n - 1; i >= 0; i--) {
    const f = i / n
    const x = x0 + 7 + f * (l.w - 14)
    const mid = Math.sin(Math.PI * (0.1 + 0.8 * f))
    const y = T + h * (0.74 + 0.26 * mid) + rng.range(-2.5, 2.5)
    path.quadraticCurveTo((px + x) / 2, Math.max(py, y) + rng.range(1, 4), x, y)
    px = x
    py = y
  }
  path.quadraticCurveTo(x0 - 1, T + h * 0.6, x0 - 1.5, T + 6)
  path.quadraticCurveTo(x0 - 1.5, T, x0 + 5, T)
  path.closePath()
  return path
}

function drawSlab(g: CanvasRenderingContext2D, l: Ledge, p: ZonePalette, rng: Rng, k: number): void {
  const path = slabPath(l, rng)
  const T = -l.y
  const h = l.h ?? LEDGE_H
  // Paper shadow on the face below.
  g.save()
  g.shadowColor = p.shadow
  g.shadowBlur = 6 * k
  g.shadowOffsetX = 2.5 * k
  g.shadowOffsetY = 4 * k
  g.fillStyle = p.rock
  g.fill(path)
  g.restore()
  g.save()
  g.clip(path)
  // Underside in shade.
  g.fillStyle = p.rockDark
  g.beginPath()
  g.moveTo(l.x - 4, T + h * 0.52)
  for (let x = l.x - 4; x <= l.x + l.w + 4; x += 8) g.lineTo(x, T + h * 0.5 + Math.sin(x * 0.21) * 2)
  g.lineTo(l.x + l.w + 4, T + h + 10)
  g.lineTo(l.x - 4, T + h + 10)
  g.closePath()
  g.fill()
  // Sunlit band under the cap.
  g.fillStyle = p.rockLight
  g.globalAlpha = 0.8
  g.fillRect(l.x - 4, T, l.w + 8, 6)
  g.globalAlpha = 1
  // Stone texture: a few soft scratches and speckles.
  g.strokeStyle = p.rockDark
  g.globalAlpha = 0.5
  g.lineWidth = 1
  g.lineCap = 'round'
  const marks = Math.round(l.w / 30)
  for (let i = 0; i < marks; i++) {
    const x = l.x + rng.range(10, l.w - 10)
    const y = T + rng.range(8, h * 0.55)
    g.beginPath()
    g.moveTo(x, y)
    g.quadraticCurveTo(x + 4, y + 1, x + rng.range(6, 12), y + rng.range(-1, 2))
    g.stroke()
  }
  g.globalAlpha = 1
  for (let i = 0; i < l.w * 0.6; i++) {
    g.globalAlpha = rng.range(0.1, 0.25)
    g.fillStyle = i % 2 ? p.rockLight : p.rockDark
    g.fillRect(l.x + rng.next() * l.w, T + rng.range(4, h), 0.9, 0.9)
  }
  g.globalAlpha = 1
  g.restore()
  g.strokeStyle = p.rockInk
  g.lineWidth = 1.5
  g.lineJoin = 'round'
  g.stroke(path)
}

/** The zone-themed top: grass, moss, sand, snow or cloud tufts. Her feet stand on it. */
function drawCap(g: CanvasRenderingContext2D, l: Ledge, p: ZonePalette, rng: Rng, tufts: boolean, camp: boolean): void {
  const x0 = l.x - 2.5
  const x1 = l.x + l.w + 2.5
  const T = -l.y
  const kind = p.topKind
  const thick = kind === 'snow' ? 6.5 : kind === 'cloud' ? 6 : kind === 'sand' ? 4.5 : 5
  const path = new Path2D()
  if (kind === 'cloud') {
    // A flat, walkable cloud band with fluffy scallops underneath and puffs at the ends.
    path.moveTo(x0 + 3, T - 2.2)
    path.lineTo(x1 - 3, T - 2.2)
    path.quadraticCurveTo(x1 + 1, T - 2.2, x1 + 1, T + 1.5)
    path.lineTo(x0 - 1, T + 1.5)
    path.quadraticCurveTo(x0 - 1, T - 2.2, x0 + 3, T - 2.2)
    path.closePath()
    const n = Math.max(4, Math.round(l.w / 12))
    for (let i = 0; i <= n; i++) {
      const x = x0 + (i / n) * (x1 - x0)
      const r = rng.range(3.4, 5.2) + (i === 0 || i === n ? 1.6 : 0)
      path.moveTo(x + r, T + 2.4)
      path.arc(x, T + 2.4, r, 0, Math.PI * 2)
    }
  } else {
    path.moveTo(x0, T + 2)
    path.quadraticCurveTo(x0, T - 2, x0 + 4, T - 2)
    path.lineTo(x1 - 4, T - 2)
    path.quadraticCurveTo(x1, T - 2, x1, T + 2)
    // Scalloped / dripping lower edge back to the left.
    let x = x1
    while (x > x0 + 1) {
      const step = Math.min(x - x0, kind === 'sand' ? rng.range(10, 16) : rng.range(6, 11))
      const nx = x - step
      let drop = thick + rng.range(-1, 2.5)
      if (kind === 'moss' && rng.next() < 0.3) drop += rng.range(4, 9)
      if (kind === 'snow' && rng.next() < 0.22) drop += rng.range(2, 5)
      path.quadraticCurveTo((x + nx) / 2, T + drop + (kind === 'sand' ? 0 : 2), nx, T + thick * 0.55)
      x = nx
    }
    path.closePath()
  }
  if (kind === 'cloud') {
    // No outline (it would trace every puff): a soft offset shadow gives the edge instead.
    g.save()
    g.translate(0.8, 1.4)
    g.fillStyle = p.topDark
    g.fill(path)
    g.restore()
  }
  g.save()
  g.fillStyle = p.top
  g.fill(path)
  g.clip(path)
  // Light along the top, shade underneath.
  g.fillStyle = p.topLight
  g.fillRect(x0, T - 3, x1 - x0, 3.2)
  g.fillStyle = p.topDark
  g.globalAlpha = 0.6
  g.fillRect(x0, T + thick * 0.8, x1 - x0, 12)
  g.globalAlpha = 1
  g.restore()
  if (kind !== 'cloud') {
    g.strokeStyle = ink(p.top)
    g.globalAlpha = kind === 'snow' ? 0.55 : 0.8
    g.lineWidth = 1.1
    g.stroke(path)
    g.globalAlpha = 1
  }

  // Little things on top.
  const n = Math.max(2, Math.round(l.w / 30))
  const standX = l.standX ?? l.x + l.w / 2
  for (let i = 0; i < n; i++) {
    const x = l.x + 6 + rng.next() * (l.w - 12)
    const nearFeet = Math.abs(x - standX) < 12
    switch (kind) {
      case 'grass':
        if (tufts) tuft(g, x, T + 0.5, rng.range(4, 7), p.tuft, rng.range(-0.25, 0.25))
        if (p.zone === 'meadow' && !nearFeet && rng.next() < (camp ? 0.35 : 0.55)) flower(g, x + rng.range(-5, 5), T, rng.range(4, 7), p.accents[rng.int(p.accents.length)], p.tuft)
        break
      case 'moss':
        if (tufts) tuft(g, x, T + 0.5, rng.range(3, 5), p.tuft, rng.range(-0.3, 0.3))
        if (rng.next() < 0.4) {
          g.fillStyle = '#e4ff9e'
          g.globalAlpha = 0.85
          g.beginPath()
          g.arc(x + 3, T - 1.2, 0.9, 0, Math.PI * 2)
          g.fill()
          g.globalAlpha = 1
        }
        break
      case 'sand':
        if (!nearFeet && rng.next() < 0.6) pebble(g, x, T + 0.5, rng.range(1.6, 2.8), p.rockLight, p.rockInk)
        if (tufts && rng.next() < 0.35) tuft(g, x + 6, T + 0.5, rng.range(3, 5), p.tuft, 0)
        break
      case 'snow':
        if (tufts && rng.next() < 0.6) tuft(g, x, T + 0.5, rng.range(3, 5.5), p.tuft, rng.range(-0.2, 0.2))
        g.fillStyle = '#ffffff'
        g.globalAlpha = 0.9
        g.beginPath()
        g.arc(x + 4, T - 0.5, 0.8, 0, Math.PI * 2)
        g.fill()
        g.globalAlpha = 1
        break
      case 'cloud':
        if (tufts && rng.next() < 0.3) tuft(g, x, T, rng.range(3, 4.5), p.tuft, rng.range(-0.2, 0.2))
        break
    }
  }
}

function drawCracks(g: CanvasRenderingContext2D, l: Ledge, p: ZonePalette, rng: Rng): void {
  const T = -l.y
  const h = l.h ?? LEDGE_H
  const n = Math.max(2, Math.round(l.w / 38))
  g.save()
  g.lineCap = 'round'
  g.lineJoin = 'round'
  for (let i = 0; i < n; i++) {
    let x = l.x + ((i + 0.5) / n) * l.w + rng.range(-8, 8)
    let y = T + 3
    g.beginPath()
    g.moveTo(x, y)
    const steps = 3 + rng.int(2)
    for (let s = 0; s < steps; s++) {
      x += rng.range(-4.5, 4.5)
      y += (h * 0.85) / steps
      g.lineTo(x, y)
      if (s === 1 && rng.next() < 0.6) {
        g.moveTo(x, y)
        g.lineTo(x + rng.range(-7, 7), y + rng.range(3, 6))
        g.moveTo(x, y)
      }
    }
    // Dark hairline with a light lip: reads as a crack, not a scratch.
    g.strokeStyle = rgba(mix(p.rockLight, '#ffffff', 0.5), 0.7)
    g.lineWidth = 1.6
    g.save()
    g.translate(0.6, 0.4)
    g.stroke()
    g.restore()
    g.strokeStyle = p.rockInk
    g.lineWidth = 0.95
    g.stroke()
  }
  g.restore()
}

function tuft(g: CanvasRenderingContext2D, x: number, y: number, h: number, color: string, lean: number): void {
  g.strokeStyle = color
  g.lineWidth = 1.4
  g.lineCap = 'round'
  g.beginPath()
  for (let b = -1; b <= 1; b++) {
    const bx = x + b * 2
    g.moveTo(bx, y)
    g.quadraticCurveTo(bx + lean * h * 0.4, y - h * 0.55, bx + b * 1.6 + lean * h, y - h * (b === 0 ? 1 : 0.72))
  }
  g.stroke()
}

function flower(g: CanvasRenderingContext2D, x: number, y: number, h: number, petal: string, stem: string): void {
  g.strokeStyle = stem
  g.lineWidth = 1
  g.beginPath()
  g.moveTo(x, y + 0.5)
  g.quadraticCurveTo(x + 1, y - h * 0.5, x, y - h)
  g.stroke()
  g.fillStyle = petal
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    g.beginPath()
    g.arc(x + Math.cos(a) * 1.5, y - h + Math.sin(a) * 1.5, 1.25, 0, Math.PI * 2)
    g.fill()
  }
  g.fillStyle = '#ffe28a'
  g.beginPath()
  g.arc(x, y - h, 0.9, 0, Math.PI * 2)
  g.fill()
}

function pebble(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, line: string): void {
  g.fillStyle = color
  g.strokeStyle = line
  g.lineWidth = 0.7
  g.beginPath()
  g.ellipse(x, y - r * 0.55, r, r * 0.65, 0, 0, Math.PI * 2)
  g.fill()
  g.globalAlpha = 0.6
  g.stroke()
  g.globalAlpha = 1
}

function foliage(p: ZonePalette): string {
  switch (p.zone) {
    case 'meadow':
      return mix('#86c46a', p.top, 0.2)
    case 'hollow':
      return '#5aa25c'
    case 'crumble':
      return '#9db45e'
    case 'ridge':
      return '#6e9f73'
    case 'cloud':
      return '#9fb87a'
    default:
      return '#8a9f78'
  }
}

/** Every decoration kind, at base (x, y) (cloud: centre), art coords inside. */
function drawDecor(g: CanvasRenderingContext2D, d: Decor, p: ZonePalette, s: number, k: number): void {
  const x = d.x
  const y = -d.y
  const f = d.flip ? -1 : 1
  const rng = createRng(`decor:${d.kind}:${d.x}:${d.y}`)
  const leaf = p.night ? mix(foliage(p), '#1e2852', 0.5) : foliage(p)
  g.lineJoin = 'round'
  g.lineCap = 'round'
  switch (d.kind) {
    case 'tree': {
      // Trunk.
      g.fillStyle = p.wood
      g.strokeStyle = ink(p.wood)
      g.lineWidth = 1.3
      g.beginPath()
      g.moveTo(x - 4 * s, y + 1)
      g.quadraticCurveTo(x - 2.5 * s, y - 18 * s, x - 3 * s, y - 34 * s)
      g.lineTo(x + 3 * s, y - 34 * s)
      g.quadraticCurveTo(x + 2.5 * s, y - 18 * s, x + 4.5 * s, y + 1)
      g.closePath()
      g.fill()
      g.stroke()
      // Three round blobs.
      const blobs = [
        [-11, -38, 15],
        [11, -40, 14],
        [0, -54, 16],
      ]
      const crown = new Path2D()
      for (const [bx, by, br] of blobs) {
        crown.moveTo(x + (bx + br) * s * f, y + by * s)
        crown.arc(x + bx * s * f, y + by * s, br * s, 0, Math.PI * 2)
      }
      g.save()
      g.shadowColor = p.shadow
      g.shadowBlur = 4 * k
      g.shadowOffsetY = 2 * k
      g.fillStyle = leaf
      g.fill(crown)
      g.restore()
      g.save()
      g.clip(crown)
      g.fillStyle = mix(leaf, '#ffffff', 0.25)
      g.beginPath()
      g.arc(x - 6 * s * f, y - 58 * s, 13 * s, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = mix(leaf, p.ink, 0.25)
      g.beginPath()
      g.ellipse(x, y - 26 * s, 26 * s, 9 * s, 0, 0, Math.PI * 2)
      g.fill()
      g.restore()
      g.strokeStyle = ink(leaf)
      g.lineWidth = 1.2
      g.stroke(crown)
      if (p.zone === 'meadow') {
        for (let i = 0; i < 6; i++) {
          g.fillStyle = i % 2 ? '#ffd1dc' : '#ffffff'
          g.beginPath()
          g.arc(x + rng.range(-20, 20) * s, y + rng.range(-62, -32) * s, 1.6 * s, 0, Math.PI * 2)
          g.fill()
        }
      }
      break
    }
    case 'pine': {
      const dark = p.night ? mix('#3f7a5e', '#1e2852', 0.5) : mix(leaf, '#2f5a46', 0.45)
      g.fillStyle = p.wood
      g.fillRect(x - 2.5 * s, y - 10 * s, 5 * s, 11 * s)
      const tiers = [
        [0, 22, 30],
        [-18, 18, 28],
        [-34, 13, 26],
      ]
      for (const [ty, tw, th] of tiers) {
        const by = y - 8 * s + ty * s
        const path = new Path2D()
        path.moveTo(x - tw * s, by)
        path.quadraticCurveTo(x - tw * 0.3 * s, by - th * 0.55 * s, x, by - th * s)
        path.quadraticCurveTo(x + tw * 0.3 * s, by - th * 0.55 * s, x + tw * s, by)
        path.quadraticCurveTo(x, by + 3 * s, x - tw * s, by)
        path.closePath()
        g.fillStyle = dark
        g.fill(path)
        g.strokeStyle = ink(dark)
        g.lineWidth = 1.1
        g.stroke(path)
        if (p.topKind === 'snow' || p.topKind === 'cloud') {
          g.fillStyle = p.top
          g.beginPath()
          g.moveTo(x - tw * 0.45 * s, by - th * 0.5 * s)
          g.quadraticCurveTo(x, by - th * 1.02 * s, x + tw * 0.45 * s, by - th * 0.5 * s)
          g.quadraticCurveTo(x, by - th * 0.42 * s, x - tw * 0.45 * s, by - th * 0.5 * s)
          g.fill()
        }
      }
      break
    }
    case 'bush': {
      const path = new Path2D()
      for (const [bx, by, br] of [
        [-9, -7, 8],
        [8, -7, 8],
        [0, -12, 9.5],
      ]) {
        path.moveTo(x + (bx + br) * s, y + by * s)
        path.arc(x + bx * s, y + by * s, br * s, 0, Math.PI * 2)
      }
      g.fillStyle = leaf
      g.fill(path)
      g.save()
      g.clip(path)
      g.fillStyle = mix(leaf, '#ffffff', 0.22)
      g.beginPath()
      g.arc(x - 3 * s, y - 16 * s, 7 * s, 0, Math.PI * 2)
      g.fill()
      g.restore()
      g.strokeStyle = ink(leaf)
      g.lineWidth = 1.1
      g.stroke(path)
      g.fillStyle = p.zone === 'hollow' ? '#8fe3ff' : p.accents[0]
      for (let i = 0; i < 4; i++) {
        g.beginPath()
        g.arc(x + rng.range(-12, 12) * s, y + rng.range(-16, -5) * s, 1.4 * s, 0, Math.PI * 2)
        g.fill()
      }
      break
    }
    case 'flowers': {
      for (let i = 0; i < 4; i++) flower(g, x + (i - 1.5) * 4.5 * s + rng.range(-1, 1), y + 0.5, rng.range(5, 9) * s, p.accents[i % p.accents.length], leaf)
      break
    }
    case 'grass': {
      tuft(g, x - 4 * s, y + 0.5, 7 * s, p.tuft, -0.2)
      tuft(g, x + 3 * s, y + 0.5, 9 * s, mix(p.tuft, '#ffffff', 0.15), 0.15)
      break
    }
    case 'rock': {
      const path = blobPath(x, y - 7 * s, 22 * s, 15 * s, rng)
      g.save()
      g.shadowColor = p.shadow
      g.shadowBlur = 3 * k
      g.shadowOffsetY = 1.5 * k
      g.fillStyle = p.rockLight
      g.fill(path)
      g.restore()
      g.save()
      g.clip(path)
      g.fillStyle = p.rock
      g.fillRect(x - 14 * s, y - 5 * s, 28 * s, 10 * s)
      g.fillStyle = mix(p.rockLight, '#ffffff', 0.35)
      g.beginPath()
      g.ellipse(x - 3 * s, y - 11 * s, 5 * s, 2.5 * s, -0.3, 0, Math.PI * 2)
      g.fill()
      g.restore()
      g.strokeStyle = p.rockInk
      g.lineWidth = 1.1
      g.stroke(path)
      break
    }
    case 'sign': {
      const text = d.text ?? ''
      // Post.
      g.fillStyle = p.wood
      g.strokeStyle = ink(p.wood)
      g.lineWidth = 1.1
      g.beginPath()
      roundRect(g, x - 2 * s, y - 24 * s, 4 * s, 25 * s, 1.5)
      g.fill()
      g.stroke()
      // Board: sized to the text.
      const fontPx = 8.5 * s
      g.font = `800 ${fontPx}px ${SIGN_FONT}`
      const tw = Math.max(26 * s, Math.min(64 * s, g.measureText(text).width + 9 * s))
      const bh = 13 * s
      const bx = x - tw / 2
      const by = y - 33 * s
      g.save()
      g.shadowColor = p.shadow
      g.shadowBlur = 3 * k
      g.shadowOffsetY = 1.5 * k
      g.fillStyle = mix(p.wood, '#f6d9a8', 0.45)
      g.beginPath()
      roundRect(g, bx, by, tw, bh, 3 * s)
      g.fill()
      g.restore()
      g.strokeStyle = ink(p.wood)
      g.beginPath()
      roundRect(g, bx, by, tw, bh, 3 * s)
      g.stroke()
      g.fillStyle = ink(p.wood)
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      let fp = fontPx
      while (fp > 4 && g.measureText(text).width > tw - 5 * s) {
        fp -= 0.5
        g.font = `800 ${fp}px ${SIGN_FONT}`
      }
      g.fillText(text, x, by + bh / 2 + 0.6 * s)
      break
    }
    case 'cave': {
      const w = 50 * s
      const h = 46 * s
      const rim = new Path2D()
      rim.moveTo(x - w / 2 - 7 * s, y + 1)
      rim.quadraticCurveTo(x - w / 2 - 8 * s, y - h - 6 * s, x, y - h - 9 * s)
      rim.quadraticCurveTo(x + w / 2 + 8 * s, y - h - 6 * s, x + w / 2 + 7 * s, y + 1)
      rim.closePath()
      g.save()
      g.shadowColor = p.shadow
      g.shadowBlur = 6 * k
      g.shadowOffsetY = 2 * k
      g.fillStyle = mix(p.faceDark, p.rockDark, 0.4)
      g.fill(rim)
      g.restore()
      const mouth = new Path2D()
      mouth.moveTo(x - w / 2, y + 1)
      mouth.quadraticCurveTo(x - w / 2, y - h, x, y - h)
      mouth.quadraticCurveTo(x + w / 2, y - h, x + w / 2, y + 1)
      mouth.closePath()
      g.fillStyle = mix(p.ink, '#120c18', 0.6)
      g.fill(mouth)
      g.save()
      g.clip(mouth)
      g.fillStyle = mix(p.faceDark, '#120c18', 0.55)
      g.beginPath()
      g.ellipse(x, y - h * 0.15, w * 0.5, h * 0.55, 0, 0, Math.PI * 2)
      g.fill()
      g.restore()
      g.strokeStyle = mix(p.faceEdge, p.ink, 0.3)
      g.lineWidth = 1.4
      g.stroke(rim)
      // Rim stones.
      for (let i = 0; i < 5; i++) {
        const a = Math.PI + ((i + 0.5) / 5) * Math.PI
        pebble(g, x + Math.cos(a) * (w / 2 + 3 * s), y - h * 0.45 + Math.sin(a) * (h * 0.62), 3 * s, mix(p.faceLight, p.rockLight, 0.5), p.faceEdge)
      }
      break
    }
    case 'mushroom': {
      const glow = p.zone === 'hollow' || p.night
      const cap = glow ? '#8fdcff' : '#e8644f'
      for (const [mx, mh, mr] of [
        [0, 9, 5.5],
        [6, 6, 3.6],
      ]) {
        const cx = x + mx * s * f
        g.fillStyle = '#fbf0dc'
        g.strokeStyle = '#8a6e62'
        g.lineWidth = 0.9
        g.beginPath()
        roundRect(g, cx - 1.6 * s, y - mh * s, 3.2 * s, mh * s + 0.5, 1.4 * s)
        g.fill()
        g.stroke()
        if (glow) {
          g.fillStyle = rgba(cap, 0.25)
          g.beginPath()
          g.arc(cx, y - mh * s, mr * 2 * s, 0, Math.PI * 2)
          g.fill()
        }
        g.fillStyle = cap
        g.strokeStyle = ink(cap)
        g.beginPath()
        g.moveTo(cx - mr * s, y - mh * s + 1)
        g.quadraticCurveTo(cx - mr * s, y - (mh + mr * 1.3) * s, cx, y - (mh + mr * 1.3) * s)
        g.quadraticCurveTo(cx + mr * s, y - (mh + mr * 1.3) * s, cx + mr * s, y - mh * s + 1)
        g.closePath()
        g.fill()
        g.stroke()
        g.fillStyle = '#ffffff'
        g.beginPath()
        g.arc(cx - mr * 0.35 * s, y - (mh + mr * 0.7) * s, 1 * s, 0, Math.PI * 2)
        g.arc(cx + mr * 0.4 * s, y - (mh + mr * 0.45) * s, 0.8 * s, 0, Math.PI * 2)
        g.fill()
      }
      break
    }
    case 'crystal': {
      const col = p.hold.crystal
      g.fillStyle = rgba(col, 0.25)
      g.beginPath()
      g.arc(x, y - 9 * s, 14 * s, 0, Math.PI * 2)
      g.fill()
      for (const [cx, ch, cw, rot] of [
        [-5, 13, 4.2, -0.35],
        [5, 11, 3.8, 0.4],
        [0, 19, 5, 0],
      ]) {
        g.save()
        g.translate(x + cx * s, y + 1)
        g.rotate(rot)
        g.fillStyle = col
        g.strokeStyle = ink(col)
        g.lineWidth = 1
        g.beginPath()
        g.moveTo(-cw * s, 0)
        g.lineTo(-cw * s, -ch * 0.7 * s)
        g.lineTo(0, -ch * s)
        g.lineTo(cw * s, -ch * 0.7 * s)
        g.lineTo(cw * s, 0)
        g.closePath()
        g.fill()
        g.stroke()
        g.fillStyle = mix(col, '#ffffff', 0.55)
        g.beginPath()
        g.moveTo(-cw * 0.5 * s, -1)
        g.lineTo(-cw * 0.5 * s, -ch * 0.65 * s)
        g.lineTo(0, -ch * 0.9 * s)
        g.lineTo(0, -1)
        g.closePath()
        g.fill()
        g.restore()
      }
      break
    }
    case 'snow': {
      const w = 20 * s
      g.fillStyle = p.topKind === 'snow' ? p.top : '#f7fbff'
      g.strokeStyle = rgba(p.ink, 0.25)
      g.lineWidth = 1
      g.beginPath()
      g.moveTo(x - w, y + 1)
      g.quadraticCurveTo(x - w * 0.6, y - 9 * s, x - w * 0.1, y - 7 * s)
      g.quadraticCurveTo(x + w * 0.35, y - 11 * s, x + w, y + 1)
      g.closePath()
      g.fill()
      g.stroke()
      g.fillStyle = '#ffffff'
      g.beginPath()
      g.arc(x - w * 0.25, y - 6 * s, 1.1 * s, 0, Math.PI * 2)
      g.arc(x + w * 0.3, y - 5 * s, 0.9 * s, 0, Math.PI * 2)
      g.fill()
      break
    }
    case 'tent': {
      drawTent(g, x, y, s, f, p)
      break
    }
    case 'cloud': {
      g.save()
      g.globalAlpha = 0.92
      paperCloud(g, x, y, 22 * s, 2.3, p.cloud, p.cloudShade, p.shadow, d.x * 0.37 + d.y * 0.11)
      g.restore()
      break
    }
    case 'flag':
    case 'lantern':
      // Drawn live (they move).
      break
  }
}

function drawTent(g: CanvasRenderingContext2D, x: number, y: number, s: number, f: number, p: ZonePalette): void {
  const w = 21 * s
  const h = 31 * s
  const back = 9 * s * -f
  const canvas = p.tent
  const side = mix(canvas, p.ink, 0.22)
  // Side panel (depth).
  g.fillStyle = side
  g.strokeStyle = ink(canvas)
  g.lineWidth = 1.2
  g.beginPath()
  g.moveTo(x, y - h)
  g.lineTo(x + back, y - h + 3 * s)
  g.lineTo(x + back + w * f, y + 0.5)
  g.lineTo(x + w * f, y + 0.5)
  g.closePath()
  g.fill()
  g.stroke()
  // Front.
  const front = new Path2D()
  front.moveTo(x - w, y + 0.5)
  front.quadraticCurveTo(x - w * 0.45, y - h * 0.48, x, y - h)
  front.quadraticCurveTo(x + w * 0.45, y - h * 0.48, x + w, y + 0.5)
  front.closePath()
  g.fillStyle = canvas
  g.fill(front)
  g.save()
  g.clip(front)
  g.fillStyle = p.tentStripe
  g.globalAlpha = 0.9
  g.fillRect(x - w, y - 5 * s, w * 2, 2.6 * s)
  g.globalAlpha = 0.25
  g.fillStyle = '#ffffff'
  g.beginPath()
  g.moveTo(x, y - h)
  g.lineTo(x - w, y + 1)
  g.lineTo(x - w * 0.55, y + 1)
  g.closePath()
  g.fill()
  g.restore()
  g.strokeStyle = ink(canvas)
  g.stroke(front)
  // Door: an open flap and a cosy dark inside.
  g.fillStyle = mix(p.ink, '#2a1a22', 0.4)
  g.beginPath()
  g.moveTo(x - 6.5 * s, y + 0.5)
  g.quadraticCurveTo(x - 2 * s, y - h * 0.55, x, y - h * 0.68)
  g.quadraticCurveTo(x + 2 * s, y - h * 0.55, x + 6.5 * s, y + 0.5)
  g.closePath()
  g.fill()
  g.fillStyle = mix(canvas, '#ffffff', 0.18)
  g.beginPath()
  g.moveTo(x, y - h * 0.68)
  g.quadraticCurveTo(x + 4 * s * f, y - h * 0.3, x + 9 * s * f, y + 0.5)
  g.lineTo(x + 3.5 * s * f, y + 0.5)
  g.closePath()
  g.fill()
  g.stroke()
  // Pegs and guy lines.
  g.strokeStyle = rgba(p.ink, 0.5)
  g.lineWidth = 0.7
  g.beginPath()
  g.moveTo(x - w * 0.55, y - h * 0.45)
  g.lineTo(x - w - 6 * s, y + 0.5)
  g.moveTo(x + w * 0.55, y - h * 0.45)
  g.lineTo(x + w + 6 * s, y + 0.5)
  g.stroke()
  // Pole tip.
  g.strokeStyle = ink(p.wood)
  g.lineWidth = 1.6
  g.beginPath()
  g.moveTo(x, y - h)
  g.lineTo(x - 2 * s * f, y - h - 4 * s)
  g.stroke()
}

/** The holds: chunky and friendly, each with a highlight. Centre (0, 0). */
function drawHoldArt(g: CanvasRenderingContext2D, style: string, p: ZonePalette, k: number): void {
  g.lineJoin = 'round'
  g.lineCap = 'round'
  switch (style) {
    case 'root': {
      const c = p.hold.root
      // A thick root loop coming out of a crack, with two leaves.
      g.strokeStyle = mix(p.faceDark, p.ink, 0.4)
      g.lineWidth = 1.2
      g.beginPath()
      g.moveTo(-12, -9)
      g.lineTo(-7, -4)
      g.moveTo(12, -8)
      g.lineTo(7, -4)
      g.stroke()
      g.save()
      g.shadowColor = p.shadow
      g.shadowBlur = 3 * k
      g.shadowOffsetY = 2 * k
      g.strokeStyle = ink(c)
      g.lineWidth = 7.4
      g.beginPath()
      g.moveTo(-9, -6)
      g.bezierCurveTo(-11, 9, 11, 9, 9, -6)
      g.stroke()
      g.restore()
      g.strokeStyle = c
      g.lineWidth = 5
      g.beginPath()
      g.moveTo(-9, -6)
      g.bezierCurveTo(-11, 9, 11, 9, 9, -6)
      g.stroke()
      g.strokeStyle = mix(c, '#ffffff', 0.4)
      g.lineWidth = 1.4
      g.beginPath()
      g.moveTo(-7.5, -2)
      g.bezierCurveTo(-8, 4, -3, 6, 1, 6)
      g.stroke()
      const leafC = mix('#7cc565', p.ink, p.night ? 0.4 : 0)
      g.fillStyle = leafC
      g.strokeStyle = ink(leafC)
      g.lineWidth = 0.8
      for (const [lx, ly, r] of [
        [-11, -8, -0.8],
        [11.5, -7, 0.9],
      ]) {
        g.beginPath()
        g.ellipse(lx, ly, 4.2, 2, r, 0, Math.PI * 2)
        g.fill()
        g.stroke()
      }
      break
    }
    case 'crystal': {
      const c = p.hold.crystal
      g.fillStyle = rgba(c, 0.35)
      g.beginPath()
      g.arc(0, 0, 13, 0, Math.PI * 2)
      g.fill()
      const gem = new Path2D()
      gem.moveTo(0, -11)
      gem.lineTo(9, -3)
      gem.lineTo(6, 8)
      gem.lineTo(-6, 8)
      gem.lineTo(-9, -3)
      gem.closePath()
      g.save()
      g.shadowColor = p.shadow
      g.shadowBlur = 3 * k
      g.shadowOffsetY = 2 * k
      g.fillStyle = c
      g.fill(gem)
      g.restore()
      g.fillStyle = mix(c, '#ffffff', 0.55)
      g.beginPath()
      g.moveTo(0, -11)
      g.lineTo(-9, -3)
      g.lineTo(-2, -1)
      g.closePath()
      g.fill()
      g.fillStyle = mix(c, p.ink, 0.2)
      g.beginPath()
      g.moveTo(9, -3)
      g.lineTo(6, 8)
      g.lineTo(1, 1)
      g.closePath()
      g.fill()
      g.strokeStyle = ink(c)
      g.lineWidth = 1.3
      g.stroke(gem)
      g.strokeStyle = rgba(ink(c), 0.6)
      g.lineWidth = 0.8
      g.beginPath()
      g.moveTo(-9, -3)
      g.lineTo(-2, -1)
      g.lineTo(9, -3)
      g.moveTo(-2, -1)
      g.lineTo(-6, 8)
      g.moveTo(-2, -1)
      g.lineTo(6, 8)
      g.stroke()
      g.fillStyle = '#ffffff'
      g.beginPath()
      g.arc(-3.5, -5.5, 1.3, 0, Math.PI * 2)
      g.fill()
      break
    }
    case 'knob': {
      const c = p.hold.knob
      g.save()
      g.shadowColor = p.shadow
      g.shadowBlur = 4 * k
      g.shadowOffsetX = 1.5 * k
      g.shadowOffsetY = 2.5 * k
      g.fillStyle = c
      g.beginPath()
      g.arc(0, 0, 9, 0, Math.PI * 2)
      g.fill()
      g.restore()
      g.fillStyle = mix(c, p.ink, 0.25)
      g.beginPath()
      g.arc(1.5, 2, 7.5, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = c
      g.beginPath()
      g.arc(-0.8, -0.8, 7.2, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = mix(c, '#ffffff', 0.55)
      g.beginPath()
      g.ellipse(-3, -3.6, 3.4, 2.2, -0.6, 0, Math.PI * 2)
      g.fill()
      g.strokeStyle = ink(c)
      g.lineWidth = 1.3
      g.beginPath()
      g.arc(0, 0, 9, 0, Math.PI * 2)
      g.stroke()
      chalkMark(g, 0.5, -5.5, 6)
      break
    }
    case 'jug':
    default: {
      const c = p.hold.jug
      // A chunky lump of rock with a deep, smiling pocket on top: made to be grabbed.
      const body = new Path2D()
      body.moveTo(-12, -2)
      body.bezierCurveTo(-13, 7, -6, 11, 1, 10.5)
      body.bezierCurveTo(8, 10, 13, 6, 12, -2)
      body.bezierCurveTo(11.5, -8, 6, -10, 0, -9.5)
      body.bezierCurveTo(-6, -10, -12, -8, -12, -2)
      body.closePath()
      g.save()
      g.shadowColor = p.shadow
      g.shadowBlur = 4 * k
      g.shadowOffsetX = 1.5 * k
      g.shadowOffsetY = 3 * k
      g.fillStyle = c
      g.fill(body)
      g.restore()
      g.save()
      g.clip(body)
      g.fillStyle = mix(c, p.ink, 0.25)
      g.beginPath()
      g.ellipse(3, 10, 14, 6.5, -0.1, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = mix(c, '#ffffff', 0.35)
      g.beginPath()
      g.ellipse(-5, -6, 6, 3, -0.3, 0, Math.PI * 2)
      g.fill()
      g.restore()
      // The pocket: dark crescent with a lit lip.
      g.fillStyle = mix(p.ink, '#20131a', 0.4)
      g.beginPath()
      g.moveTo(-8, -3.5)
      g.quadraticCurveTo(0, 3.5, 8, -3.5)
      g.quadraticCurveTo(0, -0.5, -8, -3.5)
      g.closePath()
      g.fill()
      g.strokeStyle = mix(c, '#ffffff', 0.55)
      g.lineWidth = 1.5
      g.beginPath()
      g.moveTo(-7.5, -1.4)
      g.quadraticCurveTo(0, 5, 7.5, -1.4)
      g.stroke()
      g.strokeStyle = ink(c)
      g.lineWidth = 1.3
      g.stroke(body)
      chalkMark(g, 0, -6.5, 7)
      break
    }
  }
}

/** A dusty white smudge where hands have been: real climbers spot holds by their chalk. */
function chalkMark(g: CanvasRenderingContext2D, x: number, y: number, w: number): void {
  g.save()
  g.fillStyle = '#ffffff'
  g.globalAlpha = 0.5
  g.beginPath()
  g.ellipse(x, y, w * 0.5, w * 0.2, -0.08, 0, Math.PI * 2)
  g.fill()
  g.globalAlpha = 0.35
  for (let i = 0; i < 4; i++) {
    g.beginPath()
    g.arc(x - w * 0.4 + i * w * 0.27, y + (i % 2 ? 0.8 : -0.6), 0.9, 0, Math.PI * 2)
    g.fill()
  }
  g.restore()
}

function drawFlag(ctx: CanvasRenderingContext2D, d: Dyn, p: ZonePalette, t: number, lean: number): void {
  const summit = d.kind === 'summit'
  const pennant = d.kind === 'pennant'
  const s = d.scale * (summit ? 1.25 : pennant ? 0.6 : 1)
  const x = d.x
  const base = -d.y
  const poleH = (pennant ? 10 : summit ? 46 : 36) * s
  const top = base - poleH
  if (!pennant) {
    ctx.strokeStyle = ink(p.wood)
    ctx.lineWidth = 3 * s
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(x, base + 1)
    ctx.lineTo(x, top)
    ctx.stroke()
    ctx.strokeStyle = mix(p.wood, '#ffffff', 0.2)
    ctx.lineWidth = 1.6 * s
    ctx.stroke()
    ctx.fillStyle = p.lantern
    ctx.beginPath()
    ctx.arc(x, top - 1.5 * s, 2.2 * s, 0, Math.PI * 2)
    ctx.fill()
  } else {
    ctx.strokeStyle = ink(p.wood)
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.moveTo(x, base)
    ctx.lineTo(x, top)
    ctx.stroke()
  }
  // Flutter: a gentle wave, harder in a gust; it points downwind.
  const dir = Math.abs(lean) > 0.15 ? Math.sign(lean) : d.dir
  const strength = 0.35 + Math.abs(lean) * 0.65
  const fw = (summit ? 26 : pennant ? 14 : 18) * s
  const fh = (summit ? 16 : pennant ? 8 : 11) * s
  const color = summit ? p.flag : pennant ? p.tentStripe : p.flag
  const n = 5
  ctx.fillStyle = color
  ctx.strokeStyle = ink(color)
  ctx.lineWidth = 1.1
  ctx.beginPath()
  ctx.moveTo(x, top)
  for (let i = 1; i <= n; i++) {
    const u = i / n
    const wave = Math.sin(t * (4 + strength * 7) - u * 4 + d.seed) * u * (2.2 + strength * 2.5) * s
    const droop = (1 - strength) * u * u * 6 * s
    ctx.lineTo(x + dir * u * fw, top + wave + droop + (pennant || !summit ? u * fh * 0.5 : 0))
  }
  for (let i = n; i >= 0; i--) {
    const u = i / n
    const wave = Math.sin(t * (4 + strength * 7) - u * 4 + d.seed) * u * (2.2 + strength * 2.5) * s
    const droop = (1 - strength) * u * u * 6 * s
    const h = summit ? fh : fh * (1 - u)
    ctx.lineTo(x + dir * u * fw, top + wave + droop + h * (summit ? 1 : 0.5) + (summit ? 0 : u * fh * 0.0))
  }
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  if (summit) {
    // A little sun on the summit flag.
    const wave = Math.sin(t * (4 + strength * 7) - 0.5 * 4 + d.seed) * 0.5 * (2.2 + strength * 2.5) * s
    const droop = (1 - strength) * 0.25 * 6 * s
    ctx.fillStyle = p.tentStripe === '#ffffff' ? '#ffe9a8' : p.tentStripe
    ctx.beginPath()
    ctx.arc(x + dir * fw * 0.5, top + wave + droop + fh * 0.5, fh * 0.26, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawBunting(ctx: CanvasRenderingContext2D, d: Dyn, p: ZonePalette, t: number, lean: number): void {
  const x = d.x
  const base = -d.y
  const top = base - 30
  ctx.strokeStyle = ink(p.wood)
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x, base + 1)
  ctx.lineTo(x, top)
  ctx.stroke()
  ctx.strokeStyle = mix(p.wood, '#ffffff', 0.2)
  ctx.lineWidth = 1.6
  ctx.stroke()
  // A string of three little triangles hanging toward the gap.
  const dir = d.dir
  const sway = Math.sin(t * 2.4 + d.seed) * 1.2 + lean * 2
  const colors = [p.flag, p.tentStripe, p.accents[0]]
  ctx.strokeStyle = rgba(p.ink, 0.6)
  ctx.lineWidth = 0.8
  ctx.beginPath()
  ctx.moveTo(x, top + 1)
  ctx.quadraticCurveTo(x + dir * 9, top + 9 + sway, x + dir * 18, top + 5 + sway * 0.5)
  ctx.stroke()
  for (let i = 0; i < 3; i++) {
    const u = (i + 0.5) / 3
    const bx = x + dir * u * 18
    const by = top + 1 + Math.sin(Math.PI * u) * 6 + sway * u
    ctx.fillStyle = colors[i]
    ctx.strokeStyle = ink(colors[i])
    ctx.beginPath()
    ctx.moveTo(bx - 3, by)
    ctx.lineTo(bx + 3, by)
    ctx.lineTo(bx + sway * 0.3, by + 7)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  }
}
