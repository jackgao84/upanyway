/**
 * The Sky Lake finale, moment by moment. Pure: `sceneAt(mode, t)` says where everyone is and what
 * they're doing at `t` seconds; the screen (finale/play.ts) keeps the clock, plays the cues and hands
 * the scene to the renderer (game/render/finale.ts).
 *
 * Day (her first send of the summit pitch), ≈ 26 s before the closing card:
 *   summit   close on her at the top, by the little sign with her mountain's name → the camera pulls
 *            out over the whole mountain…
 *   mountain …and the camps she passed light up, bottom to top. Then in to Sky Lake.
 *   lake     the still lake at sunset; she cheers, the goat peeks out happy.
 *   out      the goat climbs OUT of the backpack for the first time — wiggle, pop, four hooves.
 *   edge     it trots to the tip of the diving rock, looks down, wobbles, gulps…
 *   leap     …and makes its own wobbly leap…
 *   splash   …belly-flop into Sky Lake. Drops fly back and splash her face.
 *   laugh    it pops up laughing (with a little fountain), and she laughs too.
 *   both     close on the two laughing faces.
 *   card     the closing card.
 * Night (a moonlight send of the summit pitch), ≈ 10 s: both of them jump in together.
 *
 * Until the goat climbs out (day, ≈ 10 s in), it is only ever drawn in the backpack.
 */
import { cheer, crouch, fly, idle, land, laugh } from '../../game/art/poses'
import { aimArm, lerpPose, plantFeet, pose, type Pose, type Pt } from '../../game/art/rig'
import type { Expression } from '../../game/art/climber'
import type { GoatMood, GoatState } from '../../game/art/goat'
import {
  FinaleRenderer,
  LAKE,
  PANO,
  goatFlopIn,
  goatPopUp,
  goatWobblyLeap,
  lerpBox,
  packRim,
  zoomBox,
  type Box,
  type FinaleScene,
  type GoatFigure,
  type HerFigure,
  type LakeScene,
  type PanoScene,
  type Splash,
} from '../../game/render/finale'

export type FinaleMode = 'day' | 'night'

export type BeatId = 'summit' | 'mountain' | 'lake' | 'out' | 'edge' | 'leap' | 'splash' | 'laugh' | 'both' | 'card' | 'jump' | 'float'

export interface Beat {
  id: BeatId
  /** Where the beat starts (a tap skips to the next beat's start). */
  at: number
  /** The still frame that stands for it (reduced motion). */
  still: number
}

export const DAY_BEATS: readonly Beat[] = [
  { id: 'summit', at: 0, still: 0.7 },
  { id: 'mountain', at: 4.0, still: 5.75 },
  { id: 'lake', at: 6.9, still: 8.4 },
  { id: 'out', at: 8.6, still: 11.0 },
  { id: 'edge', at: 11.4, still: 14.3 },
  { id: 'leap', at: 15.8, still: 16.8 },
  { id: 'splash', at: 17.4, still: 17.62 },
  { id: 'laugh', at: 18.85, still: 19.95 },
  { id: 'both', at: 21.0, still: 23.6 },
  { id: 'card', at: 25.8, still: 26.4 },
]

export const NIGHT_BEATS: readonly Beat[] = [
  { id: 'lake', at: 0, still: 1.4 },
  { id: 'jump', at: 2.8, still: 3.85 },
  { id: 'splash', at: 4.4, still: 4.62 },
  { id: 'float', at: 5.4, still: 7.9 },
  { id: 'card', at: 9.8, still: 10.4 },
]

export function beatsFor(mode: FinaleMode): readonly Beat[] {
  return mode === 'night' ? NIGHT_BEATS : DAY_BEATS
}

/** When the closing card comes up. */
export function cardAt(mode: FinaleMode): number {
  const b = beatsFor(mode)
  return b[b.length - 1].at
}

/** The beat playing at `t`. */
export function beatAt(mode: FinaleMode, t: number): Beat {
  const beats = beatsFor(mode)
  let cur = beats[0]
  for (const b of beats) if (t >= b.at) cur = b
  return cur
}

/** The next beat's start after `t` (the card's start once there). */
export function nextBeatAt(mode: FinaleMode, t: number): number {
  for (const b of beatsFor(mode)) if (b.at > t + 1e-3) return b.at
  return cardAt(mode)
}

/**
 * The first day finale (the one that records the summit) can't be tapped past the goat's first time
 * out of the backpack: taps during these beats do nothing, and the Skip button waits for `laugh`.
 * Replays and the night ending skip freely.
 */
export const UNSKIPPABLE_BEATS: readonly BeatId[] = ['out', 'edge', 'leap', 'splash']

/** When the first day finale's Skip button may show (the goat has popped up laughing). */
export function skipAllFrom(): number {
  return DAY_BEATS.find((b) => b.id === 'laugh')!.at
}

/**
 * Sounds and lines, by time. `say:<n>` = SCRIPTED.finale[n]; `say:night` = SCRIPTED.nightSplash.
 * The screen turns ids into sfx calls and goat-bubble lines.
 */
export type CueId =
  | 'say:0'
  | 'say:1'
  | 'say:2'
  | 'say:night'
  | 'bleat:happy'
  | 'bleat:nervous'
  | 'bleat:wheee'
  | 'bleat:laugh'
  | 'hop'
  | 'whoosh'
  | 'splash'
  | 'chime'
  | 'sparkle'
  | 'swoosh'

export interface Cue {
  at: number
  id: CueId
}

export const DAY_CUES: readonly Cue[] = [
  { at: 0.35, id: 'bleat:happy' },
  { at: 1.1, id: 'say:0' },
  { at: 4.05, id: 'sparkle' },
  { at: 5.65, id: 'chime' },
  { at: 6.35, id: 'swoosh' },
  { at: 7.35, id: 'bleat:happy' },
  { at: 10.0, id: 'bleat:happy' },
  { at: 10.45, id: 'hop' },
  { at: 11.8, id: 'hop' },
  { at: 12.25, id: 'hop' },
  { at: 12.7, id: 'hop' },
  { at: 12.95, id: 'bleat:nervous' },
  { at: 13.4, id: 'say:1' },
  { at: 16.3, id: 'whoosh' },
  { at: 16.34, id: 'bleat:wheee' },
  { at: 17.4, id: 'splash' },
  { at: 19.45, id: 'bleat:laugh' },
  { at: 19.5, id: 'say:2' },
  { at: 20.85, id: 'hop' },
  { at: 22.9, id: 'bleat:laugh' },
]

export const NIGHT_CUES: readonly Cue[] = [
  { at: 0.4, id: 'say:night' },
  { at: 3.3, id: 'whoosh' },
  { at: 3.34, id: 'bleat:wheee' },
  { at: 4.4, id: 'splash' },
  { at: 5.65, id: 'bleat:laugh' },
  { at: 8.2, id: 'bleat:laugh' },
]

export function cuesFor(mode: FinaleMode): readonly Cue[] {
  return mode === 'night' ? NIGHT_CUES : DAY_CUES
}

// ---------------------------------------------------------------------------------------------
// Eases

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k
const seg = (t: number, a: number, b: number): number => clamp01((t - a) / (b - a))
const easeInOut = (k: number): number => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(k))
const easeOut = (k: number): number => 1 - Math.pow(1 - clamp01(k), 3)
const easeIn = (k: number): number => Math.pow(clamp01(k), 3)
const easeOutBack = (k: number, s = 2.2): number => {
  const q = clamp01(k) - 1
  return 1 + (s + 1) * q * q * q + s * q * q
}
const bump = (k: number): number => Math.sin(Math.PI * clamp01(k))

// ---------------------------------------------------------------------------------------------
// Places

const HER_X = -30
const HER_Y = LAKE.rockTop
const TIP_X = LAKE.tipX - 3
const SPLASH: Pt = { x: 48, y: LAKE.waterY }
const SWIM_END: Pt = { x: 14, y: LAKE.waterY + 3 }
/** Where she sits at the end, on the very tip of the rock, legs dangling over the water. */
const PERCH_X = LAKE.tipX - 2
/** Her face (scene units), where the splash's stray drops land. */
const HER_FACE: Pt = { x: HER_X - 1, y: HER_Y - 46 }
const GOAT_DOWN_X = -60
const HOPS: readonly [number, number, number, number][] = [
  // [start, end, from x, to x]
  [11.4, 11.8, GOAT_DOWN_X, -44],
  [11.85, 12.25, -44, -26],
  [12.3, 12.7, -26, TIP_X],
]

/**
 * The opening shot and the whole-mountain shot, by screen shape (width / height of the framing
 * region): a phone gets a taller, narrower box so she and the mountain stay big.
 */
function panoStart(aspect: number): Box {
  if (aspect < 0.65) return { x0: -90, y0: -1092, x1: 50, y1: -930 }
  if (aspect < 1.1) return { x0: -80, y0: -1082, x1: 70, y1: -932 }
  return { x0: -86, y0: -1066, x1: 74, y1: -952 }
}

function panoWhole(aspect: number): Box {
  if (aspect < 0.65) return { x0: -440, y0: -1110, x1: 440, y1: 60 }
  if (aspect < 1.1) return { x0: -600, y0: -1120, x1: 600, y1: 80 }
  return { x0: -720, y0: -1110, x1: 720, y1: 80 }
}

const PANO_IN: Box = { x0: -20, y0: -1022, x1: 32, y1: -996 }
const PANO_ANCHOR: Pt = { x: PANO.herX, y: PANO.herY - 8 }

const WIDE: Box = FinaleRenderer.wideLakeBox()
/** The day finale moves from the whole mountain to Sky Lake here (through a flash of light). */
const LAKE_AT = 6.9
const scaleBox = (b: Box, k: number, about: Pt): Box => ({
  x0: about.x + (b.x0 - about.x) / k,
  y0: about.y + (b.y0 - about.y) / k,
  x1: about.x + (b.x1 - about.x) / k,
  y1: about.y + (b.y1 - about.y) / k,
})
const ARRIVE: Box = scaleBox(WIDE, 1.3, { x: 10, y: -24 })
const DAY_CLOSE: Box = { x0: -40, y0: -70, x1: 36, y1: 20 }
const NIGHT_CLOSE: Box = { x0: 2, y0: -54, x1: 76, y1: 28 }

// Night places.
const N_HER_X = -36
const N_GOAT_X = -8
const N_HER_IN: Pt = { x: 24, y: LAKE.waterY + 1 }
const N_GOAT_IN: Pt = { x: 64, y: LAKE.waterY + 2 }
const N_HER_FLOAT: Pt = { x: 30, y: LAKE.waterY + 1 }
const N_GOAT_FLOAT: Pt = { x: 52, y: LAKE.waterY + 2 }

// ---------------------------------------------------------------------------------------------
// Poses that only the finale uses

/** Squeezing her eyes shut as lake water splashes her: leaning back, hands up. */
function flinch(t: number): Pose {
  const s = Math.sin(t * 30) * 0.6
  return plantFeet(pose({ rootY: 0.8, lean: -11 + s, headTilt: -6, armL: [-30, 84], armR: [44, 92] }), -3, 3.4)
}

/**
 * Sitting on the very edge of the rock, legs dangling over the water, hands on the rock beside her,
 * rocking with laughter. Her feet point (the pose origin) is the edge she sits on.
 */
function perch(t: number, laughing: number): Pose {
  const swing = Math.sin(t * 2.3)
  const r = Math.sin(t * 10) * laughing
  let p = pose({
    rootY: 14.2,
    rootX: -1.5,
    lean: -5 - 4 * laughing + r * 3,
    headTilt: -8 * laughing + r * 2,
    legL: [84 + swing * 12, -84 - swing * 10],
    legR: [96 - swing * 12, -100 + swing * 10],
  })
  p = aimArm(p, 'L', { x: -8.5, y: -0.6 }, 1, 1.3)
  p = aimArm(p, 'R', { x: 4.5, y: -0.6 }, 1, 1.3)
  return p
}

/** Treading water: arms out along the surface, legs kicking slowly below. */
function swim(t: number): Pose {
  const a = Math.sin(t * 3.1)
  return pose({
    lean: 2,
    headTilt: -8 + Math.sin(t * 1.7) * 3,
    armL: [-96 + a * 12, 26],
    armR: [100 - a * 12, -24],
    legL: [-16 + a * 14, -30],
    legR: [18 - a * 14, -36],
    hairFloat: 0.25,
  })
}

/** A little hop-landing squash for the goat (k 0..1 after touching down). */
function landSquash(k: number): [number, number] {
  if (k < 0 || k >= 1) return [1, 1]
  const e = easeOutBack(k, 2.6)
  return [1.18 - 0.18 * e, 0.76 + 0.24 * e]
}

function goat(mood: GoatMood, t: number, extra: Partial<GoatState> = {}): GoatState {
  return { mood, t, inBackpack: false, ...extra }
}

// ---------------------------------------------------------------------------------------------
// Day

function dayPano(t: number, aspect: number): PanoScene {
  const start = panoStart(aspect)
  const whole = panoWhole(aspect)
  let box: Box
  if (t < 0.9) box = start
  else if (t < 6.0) box = zoomBox(start, whole, PANO_ANCHOR, easeInOut(seg(t, 0.9, 4.2)))
  else box = zoomBox(whole, PANO_IN, { x: PANO.lake.x, y: PANO.lake.y }, easeIn(seg(t, 6.0, 6.92)))
  const cheering = t < 2.2
  const herPose = cheering ? lerpPose(cheer(t), idle(t), seg(t, 1.7, 2.2)) : idle(t)
  const mood: GoatMood = t < 1.9 ? 'happy' : t < 4.4 ? 'curious' : 'laugh'
  const her: HerFigure = {
    x: PANO.herX,
    y: PANO.herY,
    scale: PANO.herScale,
    pose: herPose,
    expression: t < 2.2 ? 'happy' : t < 4.4 ? 'proud' : 'laughing',
    facing: 1,
    gaze: t < 2.2 ? { x: 0.5, y: -0.4 } : { x: 0.7, y: 0.6 },
    goat: { mood, t, inBackpack: true, lookX: 0.8, lookY: mood === 'curious' ? 0.9 : 0 },
  }
  const sparkle = t < 2.6 ? Math.min(1, t / 0.3) * (1 - seg(t, 1.8, 2.6)) : 0
  // Diving into Sky Lake: everything goes warm and bright for a moment.
  const flash = Math.pow(seg(t, 6.35, 6.9), 2)
  return { kind: 'pano', t, box, lit: Math.max(0, Math.min(16, ((t - 4.0) / 1.6) * 16)), her, sparkle, flash }
}

function dayHer(t: number, goatX: number): HerFigure {
  let p: Pose
  let expression: Expression = 'happy'
  let gaze: Pt = { x: 0.6, y: 0.1 }
  if (t < 8.1) {
    p = lerpPose(cheer(t), idle(t), seg(t, 7.7, 8.1))
    gaze = { x: 0.6, y: -0.2 }
  } else if (t < 18.15) {
    p = idle(t)
    if (t >= 9.3 && t < 10.05) {
      expression = 'surprised'
      gaze = { x: -0.9, y: -0.5 }
    } else if (t >= 10.05 && t < 11.4) {
      gaze = { x: -0.9, y: 0.6 }
    } else if (t >= 11.4) {
      gaze = { x: goatX < HER_X - 4 ? -0.8 : 0.8, y: 0.5 }
      if (t >= 15.1 && t < 15.8) expression = 'nervous'
      if (t >= 15.8) {
        expression = 'surprised'
        gaze = { x: 0.9, y: t < 16.9 ? -0.3 : 0.4 }
      }
    }
  } else if (t < 18.75) {
    p = flinch(t)
    expression = 'oof'
  } else if (t < 19.2) {
    p = lerpPose(flinch(t), idle(t), seg(t, 18.75, 19.0))
    expression = 'surprised'
    gaze = { x: 0.9, y: 0.6 }
  } else if (t < 20.25) {
    p = lerpPose(idle(t), laugh(t), seg(t, 19.2, 19.45))
    expression = 'laughing'
    gaze = { x: 0.8, y: 0.6 }
  } else {
    // A happy hop to the tip of the rock, then she sits down on the edge, laughing.
    expression = 'laughing'
    gaze = { x: 0.7, y: 0.8 }
    if (t < 20.45) p = lerpPose(laugh(t), crouch(0.35, 60, 1), seg(t, 20.25, 20.42))
    else if (t < 20.85) p = fly(t)
    else if (t < 21.05) p = land(seg(t, 20.85, 21.05))
    else p = lerpPose(land(1), perch(t, 1), easeOut(seg(t, 21.05, 21.45)))
    if (t > 30.0) {
      expression = 'happy'
      p = perch(t, 0)
    }
  }
  const inPack = t < 10.0
  let packGoat: GoatState | null = null
  if (inPack) {
    let mood: GoatMood = 'happy'
    let sink = 0
    let lookX = 0.9
    let lookY = 0
    if (t >= 8.6 && t < 9.2) {
      mood = 'curious'
      sink = -3 * easeOut(seg(t, 8.6, 9.0))
      lookY = 0.5
    } else if (t >= 9.2) {
      mood = 'wobbly'
      sink = -3 - 1.6 * seg(t, 9.2, 9.95)
      lookX = -0.4
      lookY = 0.7
    }
    packGoat = { mood, t, inBackpack: true, sink, lookX, lookY }
  }
  const hop = seg(t, 20.45, 20.85)
  const x = t < 20.45 ? HER_X : lerp(HER_X, PERCH_X, easeInOut(hop))
  const y = HER_Y - bump(hop) * 10
  return { x, y, pose: p, expression, facing: 1, gaze, goat: packGoat, wetFor: t >= 18.15 ? t - 18.15 : undefined }
}

function dayGoat(t: number, her: HerFigure): { fig: GoatFigure | null; behind: boolean } {
  if (t < 10.0) return { fig: null, behind: false }
  // Out of the pack: a hop from the rim down behind her (its first time on its own hooves).
  if (t < 10.45) {
    const k = seg(t, 10.0, 10.45)
    const rim = packRim({ ...her, pose: idle(10.0) })
    const x = lerp(rim.x, GOAT_DOWN_X, k)
    const y = lerp(rim.y + 2, HER_Y, k * k) - bump(k) * 9
    const stretch = 1 + 0.18 * (1 - k)
    return { fig: { x, y, state: goat('nervous', t, { facing: -1, earFlap: 0.7, lookY: 0.6 }), sx: 1 / Math.sqrt(stretch), sy: stretch, rot: -0.25 * (1 - k) }, behind: k < 0.35 }
  }
  if (t < 11.4) {
    const [sx, sy] = landSquash(seg(t, 10.45, 10.75))
    const proud = t >= 10.95
    return {
      fig: {
        x: GOAT_DOWN_X,
        y: HER_Y,
        state: goat(proud ? 'proud' : 'curious', t, { facing: proud ? 1 : -1, lookX: 0.2, lookY: proud ? -0.3 : 1 }),
        sx,
        sy,
      },
      behind: false,
    }
  }
  // Three little hops past her to the tip of the diving rock.
  if (t < 12.8) {
    for (const [a, b, x0, x1] of HOPS) {
      if (t >= a && t < b) {
        const k = seg(t, a, b)
        const st = k < 0.2 ? 1 + 0.12 * (1 - k / 0.2) : 1
        return { fig: { x: lerp(x0, x1, easeInOut(k)), y: HER_Y - bump(k) * 9, state: goat('happy', t, { facing: 1 }), sx: 1 / Math.sqrt(st), sy: st }, behind: false }
      }
    }
    const last = HOPS.reduce((acc, h) => (t >= h[1] ? h : acc), HOPS[0])
    const [sx, sy] = landSquash(seg(t, last[1], last[1] + 0.25))
    return { fig: { x: t >= HOPS[0][1] ? last[3] : GOAT_DOWN_X, y: HER_Y, state: goat('happy', t, { facing: 1 }), sx, sy }, behind: false }
  }
  // At the edge: looks down, wobbles, gulps.
  if (t < 15.8) {
    const mood: GoatMood = t < 13.4 ? 'nervous' : t < 15.1 ? 'wobbly' : 'gulp'
    return { fig: { x: TIP_X, y: HER_Y, state: goat(mood, t, { facing: 1, lookX: 0.7, lookY: 0.9 }) }, behind: false }
  }
  // Wind up…
  if (t < 16.3) {
    const k = easeOut(seg(t, 15.8, 16.25))
    return { fig: { x: TIP_X, y: HER_Y, state: goat('wobbly', t, { facing: 1, lookX: 0.9, lookY: 0.4 }), sx: 1 + 0.15 * k, sy: 1 - 0.26 * k }, behind: false }
  }
  // …the wobbly leap, legs going everywhere, and a belly flop.
  if (t < 17.4) return { fig: goatWobblyLeap(seg(t, 16.3, 17.4), { x: TIP_X, y: HER_Y }, SPLASH, t), behind: false }
  if (t < 17.56) return { fig: goatFlopIn(seg(t, 17.4, 17.56), SPLASH, t), behind: false }
  if (t < 18.85) return { fig: null, behind: false }
  // Pops up — spits out a little fountain — laughs — paddles back to her.
  const swimK = easeInOut(seg(t, 20.2, 22.2))
  const at = { x: lerp(SPLASH.x, SWIM_END.x, swimK), y: lerp(SPLASH.y + 1, SWIM_END.y, swimK) }
  const mood: GoatMood = t < 19.4 ? 'happy' : t < 30.0 ? 'laugh' : 'happy'
  return { fig: goatPopUp(seg(t, 18.85, 19.25), at, t, mood, -1, seg(t, 19.0, 19.65)), behind: false }
}

function dayLake(t: number): LakeScene {
  const lt = Math.max(LAKE_AT, t)
  let box: Box
  if (lt < 8.4) box = lerpBox(ARRIVE, WIDE, easeOut(seg(lt, LAKE_AT, 8.4)))
  else if (lt < 21.0) box = WIDE
  else box = lerpBox(WIDE, DAY_CLOSE, easeInOut(seg(lt, 21.0, 22.6)))
  // Where the goat is (for her gaze), then her, then the goat with her pose known.
  const herNoGoat = dayHer(lt, 0)
  const g0 = dayGoat(lt, herNoGoat)
  const her = dayHer(lt, g0.fig ? g0.fig.x : 0)
  const g = dayGoat(lt, her)
  const splashes: Splash[] = [{ x: SPLASH.x, y: SPLASH.y, at: 17.4, size: 1.2, seed: 1, toward: HER_FACE }]
  const sparkle = clamp01((lt - 22.0) / 0.8)
  return {
    kind: 'lake',
    t: lt,
    box,
    her,
    goat: g.fig,
    goatBehind: g.behind,
    splashes,
    bubbles: [[SPLASH.x, SPLASH.y, 17.7, 18.75]],
    sparkle,
    sparkleAt: { x: (PERCH_X + SWIM_END.x) / 2, y: -26 },
    wake: bump(seg(lt, 20.2, 22.2)),
    flash: 1 - easeOut(seg(lt, LAKE_AT, LAKE_AT + 0.55)),
  }
}

// ---------------------------------------------------------------------------------------------
// Night

function nightScene(t: number): LakeScene {
  let box: Box
  if (t < 1.6) box = lerpBox(scaleBox(WIDE, 1.15, { x: 0, y: -24 }), WIDE, easeOut(seg(t, 0, 1.6)))
  else if (t < 6.2) box = WIDE
  else box = lerpBox(WIDE, NIGHT_CLOSE, easeInOut(seg(t, 6.2, 7.6)))

  // Her.
  let her: HerFigure
  if (t < 3.3) {
    const k = easeOut(seg(t, 2.8, 3.25))
    const base = idle(t)
    const p = t < 2.8 ? base : lerpPose(base, crouch(0.75, 40, 1), k)
    her = {
      x: N_HER_X,
      y: HER_Y,
      pose: p,
      expression: t < 2.8 ? 'laughing' : 'determined',
      facing: 1,
      gaze: t < 1.8 ? { x: 0.8, y: 0.7 } : { x: 0.9, y: 0.2 },
      goat: null,
    }
  } else if (t < 4.4) {
    const k = seg(t, 3.3, 4.4)
    her = {
      x: lerp(N_HER_X, N_HER_IN.x, k),
      y: lerp(HER_Y, N_HER_IN.y + 18, k) - 4 * 44 * k * (1 - k),
      pose: k < 0.15 ? lerpPose(crouch(0.75, 40, 1), fly(t), k / 0.15) : fly(t),
      expression: 'laughing',
      facing: 1,
      goat: null,
      waterY: k > 0.7 ? N_HER_IN.y : undefined,
    }
  } else if (t < 5.4) {
    // Under for a moment: only her drawn faintly below the surface, sinking.
    const k = seg(t, 4.4, 4.7)
    her = { x: N_HER_IN.x, y: N_HER_IN.y + 18 + k * 30, pose: fly(t), expression: 'laughing', facing: 1, goat: null, waterY: N_HER_IN.y, hidden: t >= 4.7 }
  } else {
    const k = seg(t, 5.4, 5.75)
    const drift = easeInOut(seg(t, 5.8, 7.4))
    const x = lerp(N_HER_IN.x, N_HER_FLOAT.x, drift)
    const wy = N_HER_IN.y + Math.sin(t * 2.2) * 0.4
    her = {
      x,
      y: wy + 27 + 14 * (1 - easeOutBack(k, 2.2)),
      pose: swim(t),
      expression: 'laughing',
      facing: 1,
      gaze: { x: 0.8, y: 0 },
      goat: null,
      waterY: wy,
    }
  }

  // The goat beside her.
  let g: GoatFigure | null
  if (t < 3.35) {
    const lookUp = t < 1.8
    const k = easeOut(seg(t, 2.85, 3.3))
    g = {
      x: N_GOAT_X,
      y: HER_Y,
      state: goat(t < 1.8 ? 'laugh' : t < 2.8 ? 'wobbly' : 'wobbly', t, { facing: lookUp ? -1 : 1, lookX: lookUp ? 0.6 : 0.8, lookY: lookUp ? -0.8 : 0.6 }),
      sx: 1 + 0.14 * k,
      sy: 1 - 0.24 * k,
    }
  } else if (t < 4.5) {
    // This time it's a happy leap: no wobble left, just wheee.
    g = goatWobblyLeap(seg(t, 3.35, 4.5), { x: N_GOAT_X, y: HER_Y }, N_GOAT_IN, t, 38)
    g.state = { ...g.state, mood: 'wheee' }
    g.whoosh = 0
  } else if (t < 4.66) {
    g = goatFlopIn(seg(t, 4.5, 4.66), N_GOAT_IN, t)
  } else if (t < 5.5) {
    g = null
  } else {
    const drift = easeInOut(seg(t, 5.8, 7.4))
    const at = { x: lerp(N_GOAT_IN.x, N_GOAT_FLOAT.x, drift), y: lerp(N_GOAT_IN.y, N_GOAT_FLOAT.y, drift) }
    g = goatPopUp(seg(t, 5.5, 5.85), at, t, t < 14 ? 'laugh' : 'happy', -1, seg(t, 5.65, 6.25))
  }

  const splashes: Splash[] = [
    { x: N_HER_IN.x, y: N_HER_IN.y, at: 4.4, size: 1.45, seed: 2 },
    { x: N_GOAT_IN.x, y: N_GOAT_IN.y, at: 4.5, size: 1, seed: 3 },
  ]
  return {
    kind: 'lake',
    t,
    box,
    her,
    goat: g,
    goatBehind: false,
    splashes,
    bubbles: [
      [N_HER_IN.x, N_HER_IN.y, 4.65, 5.3],
      [N_GOAT_IN.x, N_GOAT_IN.y, 4.75, 5.4],
    ],
    sparkle: clamp01((t - 7.0) / 0.8),
    sparkleAt: { x: (N_HER_FLOAT.x + N_GOAT_FLOAT.x) / 2, y: -14 },
    wake: 0,
  }
}

// ---------------------------------------------------------------------------------------------
// Public

/**
 * Everything on screen at `t` (seconds since the finale started). `aspect` = width / height of the
 * part of the screen the picture is framed in (some shots frame a phone differently).
 */
export function sceneAt(mode: FinaleMode, t: number, aspect = 1.4): FinaleScene {
  if (mode === 'night') return nightScene(Math.max(0, t))
  return t < LAKE_AT ? dayPano(Math.max(0, t), aspect) : dayLake(t)
}

/** Which way the goat is: in the backpack, out on its own, or swimming (for the bubble's face). */
export function goatWhereAt(mode: FinaleMode, t: number): 'pack' | 'out' | 'swim' {
  if (mode === 'night') return t >= 4.5 ? 'swim' : 'out'
  if (t < 10.0) return 'pack'
  return t >= 17.4 ? 'swim' : 'out'
}
