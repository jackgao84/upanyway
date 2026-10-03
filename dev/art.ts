/**
 * Dev-only art lab (served at /upanyway/dev/art.html by `vite`; not part of the build).
 * Every hair style, colour, skin tone, outfit, helmet, backpack, expression, pose and goat mood.
 */
import { defaultLook, type ClimberLook } from '../src/storage/schema'
import {
  BACKPACKS,
  BACKPACK_COLORS,
  HAIR_COLORS,
  HAIR_STYLES,
  HELMETS,
  HELMET_COLORS,
  OUTFITS,
  OUTFIT_COLORS,
  SKIN_TONES,
  randomLook,
} from '../src/content/wardrobe'
import { UNLOCKABLES } from '../src/content/unlockables'
import { EXPRESSIONS, drawClimber, type Expression } from '../src/game/art/climber'
import { GOAT_MOODS, type GoatState } from '../src/game/art/goat'
import { BASE_POSES, idle, stand } from '../src/game/art/poses'
import {
  animateClimberPreview,
  animateGoatPreview,
  renderClimberPreview,
  renderGoatPreview,
} from '../src/game/art/preview'
import { aimArm, pose, solvePose, type Pose } from '../src/game/art/rig'

const params = new URLSearchParams(location.search)
const ANIMATE = params.get('animate') === '1'
const T = Number(params.get('t') ?? '0.7')
const lab = document.getElementById('lab') as HTMLElement

function seeded(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let x = s
    x = Math.imul(x ^ (x >>> 15), x | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

function section(id: string, title: string, cls = ''): HTMLElement {
  const s = document.createElement('section')
  s.id = id
  if (cls) s.className = cls
  const h = document.createElement('h2')
  h.textContent = title
  const g = document.createElement('div')
  g.className = 'grid'
  s.append(h, g)
  lab.appendChild(s)
  return g
}

function canvasCell(grid: HTMLElement, label: string, w: number, h: number): HTMLCanvasElement {
  const f = document.createElement('figure')
  const c = document.createElement('canvas')
  c.style.width = `${w}px`
  c.style.height = `${h}px`
  const cap = document.createElement('figcaption')
  cap.textContent = label
  f.append(c, cap)
  grid.appendChild(f)
  return c
}

const peekGoat = (mood: GoatState['mood'] = 'peek'): GoatState => ({ mood, t: T, inBackpack: true })

function climber(
  grid: HTMLElement,
  label: string,
  look: ClimberLook,
  h: number,
  o: { expression?: Expression; pose?: Pose | ((t: number) => Pose); goat?: GoatState | null; facing?: 1 | -1; w?: number } = {},
): void {
  const c = canvasCell(grid, label, o.w ?? Math.round(h * 0.78), h)
  if (ANIMATE) {
    animateClimberPreview(c, look, { expression: o.expression, pose: o.pose, goat: o.goat, facing: o.facing })
  } else {
    const p = typeof o.pose === 'function' ? o.pose(T) : o.pose ?? idle(T)
    renderClimberPreview(c, look, { expression: o.expression, pose: p, goat: o.goat ?? null, t: T, facing: o.facing })
  }
}

function goat(grid: HTMLElement, label: string, state: GoatState, h: number, look?: ClimberLook, w?: number): void {
  const c = canvasCell(grid, label, w ?? Math.round(h * 1.0), h)
  if (ANIMATE) animateGoatPreview(c, (t) => ({ ...state, t }), { look })
  else renderGoatPreview(c, state, { look })
}

const base = defaultLook()
const looks = Array.from({ length: 12 }, (_, i) => randomLook(seeded(i * 97 + 13)))

// Hero.
{
  const g = section('hero', 'Hero')
  climber(g, 'default · happy', base, 240, { goat: peekGoat('happy') })
  climber(g, 'determined', looks[0], 240, { expression: 'determined', goat: peekGoat('nervous') })
  climber(g, 'scared-but-going', looks[1], 240, { expression: 'scared-but-going', goat: peekGoat('gulp') })
  climber(g, 'laughing', looks[2], 240, { expression: 'laughing', goat: peekGoat('laugh') })
  goat(g, 'goat in pack · peek', peekGoat('peek'), 240, base, 200)
  goat(g, 'goat standing · happy', { mood: 'happy', t: T, inBackpack: false }, 240, undefined, 220)
}

// Hair.
{
  const g = section('hair', 'Hair styles × colours (110px)')
  const cols = ['#2a2321', '#7a4a2c', '#e0b45c', '#f08aa8']
  for (const s of HAIR_STYLES) {
    for (const col of cols) {
      climber(g, `${s.id} ${col}`, { ...base, hairStyle: s.id, hairColor: col }, 110, { goat: peekGoat() })
    }
  }
}
{
  const g = section('haircolours', 'Every hair colour')
  for (const c of HAIR_COLORS) climber(g, c.name, { ...base, hairStyle: 'long', hairColor: c.color }, 110)
}

// Skin tones.
{
  const g = section('skin', 'Skin tones')
  SKIN_TONES.forEach((s, i) =>
    climber(g, s.name, { ...base, skinTone: s.color, hairStyle: HAIR_STYLES[i % HAIR_STYLES.length].id, hairColor: HAIR_COLORS[i % 4].color }, 120, {
      goat: peekGoat('happy'),
    }),
  )
}

// Outfits.
{
  const g = section('outfits', 'Outfits (default colour, then two others)')
  OUTFITS.forEach((o, i) => {
    climber(g, o.name, { ...base, outfit: o.id, outfitColor: o.defaultColor }, 120)
    climber(g, `${o.id} b`, { ...base, outfit: o.id, outfitColor: OUTFIT_COLORS[(i * 3 + 2) % OUTFIT_COLORS.length].color }, 120)
    climber(g, `${o.id} c`, { ...base, outfit: o.id, outfitColor: OUTFIT_COLORS[(i * 5 + 7) % OUTFIT_COLORS.length].color }, 120)
  })
}

// Helmets.
{
  const g = section('helmets', 'Helmets')
  HELMETS.forEach((hm, i) => {
    climber(g, hm.name, { ...base, helmet: hm.id, helmetColor: hm.defaultColor }, 120)
    climber(g, `${hm.id} b`, { ...base, helmet: hm.id, helmetColor: HELMET_COLORS[(i + 3) % HELMET_COLORS.length].color }, 120)
  })
}

// Backpacks.
{
  const g = section('packs', 'Backpacks (worn, with goat) and on their own')
  BACKPACKS.forEach((b, i) => {
    climber(g, b.name, { ...base, backpack: b.id, backpackColor: b.defaultColor }, 120, { goat: peekGoat(i % 2 ? 'happy' : 'peek') })
  })
  BACKPACKS.forEach((b, i) => {
    goat(g, `${b.id} pack`, peekGoat(GOAT_MOODS[i]), 110, { ...base, backpack: b.id, backpackColor: BACKPACK_COLORS[i].color })
  })
  climber(g, 'empty pack (closed)', base, 120, { goat: null })
}

// Expressions.
{
  const g = section('faces', 'Expressions — close-up and 110px')
  for (const e of EXPRESSIONS) {
    const c = canvasCell(g, e, 130, 130)
    const draw = (t: number) => {
      const ctx = c.getContext('2d')
      if (!ctx) return
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      c.width = 130 * dpr
      c.height = 130 * dpr
      ctx.setTransform(dpr * 4.4, 0, 0, dpr * 4.4, dpr * 62, dpr * 230)
      drawClimber(ctx, { look: base, pose: stand(), expression: e, facing: 1, t })
    }
    draw(T)
    if (ANIMATE) {
      const loop = (now: number) => {
        draw(now / 1000)
        requestAnimationFrame(loop)
      }
      requestAnimationFrame(loop)
    }
  }
  for (const e of EXPRESSIONS) climber(g, e, looks[3], 110, { expression: e })
}

// Poses.
{
  const g = section('poses', 'Base poses')
  for (const p of BASE_POSES) {
    climber(g, p.name, looks[4], 130, { pose: p.at, goat: peekGoat(p.id === 'fall' ? 'wheee' : p.id === 'wobble' ? 'gulp' : 'peek'), w: 120 })
  }
  climber(g, 'facing left', looks[5], 130, { pose: (t) => idle(t), facing: -1, goat: peekGoat('curious') })
}

// Rig stress test: the kinds of fall poses the rig must support (the real 16 live in fallPoses).
{
  const g = section('rig', 'Rig stress test (sample fall poses)')
  const starfish = (t: number) =>
    pose({ armL: [-128 + Math.sin(t * 6) * 6, -6], armR: [128 - Math.sin(t * 6) * 6, 6], legL: [-34, 4], legR: [34, -4], headTilt: -6, hairFloat: 1 })
  const pancake = (t: number) =>
    pose({ rot: 90, rootY: 4, armL: [-96, 10], armR: [96, -10], legL: [-12, 0], legR: [10, 0], squashY: 0.82 + Math.sin(t * 8) * 0.03, squashX: 1.1, hairFloat: 0.6 })
  const spaghetti = (t: number) =>
    pose({ armL: [-104 + Math.sin(t * 5) * 14, -24], armR: [104 + Math.sin(t * 5 + 1) * 14, 24], reachL: 1.6, reachR: 1.6, noodle: 1, legL: [-14, 20], legR: [18, -30], hairFloat: 1 })
  const swoon = (t: number) => {
    let p = pose({ rot: -22 + Math.sin(t * 2) * 2, lean: -14, headTilt: -18, armL: [-112, -24], legL: [-8, -4], legR: [36, -60], hairFloat: 0.7 })
    const sk = solvePose(p)
    const a = (sk.headAngle * Math.PI) / 180
    p = aimArm(p, 'R', { x: sk.head.x + 4 * Math.cos(a) + 6 * Math.sin(a), y: sk.head.y + 4 * Math.sin(a) - 6 * Math.cos(a) }, 1, 1.4)
    return p
  }
  climber(g, 'The Starfish', looks[9], 140, { pose: starfish, expression: 'surprised', goat: peekGoat('wheee'), w: 140 })
  climber(g, 'The Pancake', looks[10], 140, { pose: pancake, expression: 'oof', goat: peekGoat('cover-eyes'), w: 140 })
  climber(g, 'The Spaghetti Arms', looks[11], 140, { pose: spaghetti, expression: 'laughing', goat: peekGoat('laugh'), w: 140 })
  climber(g, 'The Dramatic Swoon', base, 140, { pose: swoon, expression: 'oof', goat: peekGoat('nervous'), w: 140 })
  climber(g, 'Starfish, no goat', looks[2], 140, { pose: starfish, expression: 'laughing', goat: null, w: 140 })
}

// Goat.
{
  const g = section('goat', 'Goat moods — in the pack, then standing')
  for (const m of GOAT_MOODS) goat(g, m, peekGoat(m), 110, base)
  for (const m of GOAT_MOODS) goat(g, m, { mood: m, t: T, inBackpack: false }, 110)
  for (let i = 0; i < 6; i++) {
    goat(g, `ear flap ${i}`, { mood: 'nervous', t: i * 0.04, earFlap: 1, inBackpack: true }, 90, base)
  }
}

// Gear.
{
  const g = section('gear', 'Gear (post-summit)')
  for (const u of UNLOCKABLES) {
    if (u.kind !== 'gear') continue
    climber(g, u.name, { ...looks[6], gear: [u.id] }, 120, { goat: peekGoat() })
  }
  climber(g, 'everything', { ...looks[7], gear: UNLOCKABLES.filter((u) => u.kind === 'gear').map((u) => u.id) }, 140, {
    goat: peekGoat('proud'),
  })
}

// Small sizes.
{
  const g = section('small', 'Phone size: 35px tall (sky)')
  for (const l of looks) climber(g, '', l, 40, { goat: peekGoat(), w: 34 })
  for (const e of EXPRESSIONS) climber(g, '', base, 40, { expression: e, goat: peekGoat(), w: 34 })
  const n = section('small-night', 'Phone size on night and meadow', 'night')
  for (const l of looks.slice(0, 8)) climber(n, '', l, 40, { goat: peekGoat(), w: 34 })
  for (const l of looks.slice(0, 6)) climber(n, '', l, 110, { goat: peekGoat('sleepy'), expression: 'sleepy' })
  const m = section('small-meadow', 'Meadow', 'meadow')
  for (const l of looks.slice(4, 12)) climber(m, '', l, 40, { goat: peekGoat(), w: 34 })
  for (const p of BASE_POSES.slice(5, 11)) climber(m, '', looks[8], 40, { pose: p.at, goat: peekGoat(), w: 40 })
}

document.body.dataset.ready = '1'
