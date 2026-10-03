/**
 * The 16 silly fall poses (whippers) as short limb-angle animations on the climber rig (rig.ts).
 *
 * `fallPose(id, t)` takes t = seconds since the whipper began. Each pose pops in with a springy
 * stretch over the first ~0.3 s, then loops a 0.6–0.8 s cycle forever (the climb shows ~0.5–0.8 s
 * of it; the Hall of Flops loops it). Silhouettes are exaggerated so every pose reads at ~50 px.
 *
 * Frame and angles follow rig.ts: local y-down, feet at (0, 0), facing +x; limbs measured from
 * straight down, + toward the front; `rot` spins the whole figure about (0, RIG.pivotY).
 * Poses that need hands or feet at a point are solved with the rig's IK in the un-rotated frame,
 * then `rot` is applied, so limbs turn with the body.
 *
 * Names and descriptions live in content/fallPoses.ts (the single list of ids, in Hall order).
 */
import { FALL_POSES, type FallPoseId } from '../../content/fallPoses'
import type { Expression } from './climber'
import type { GoatMood } from './goat'
import { fall } from './poses'
import {
  DEG,
  RIG,
  aimArm,
  easeInOutSine,
  easeOutElastic,
  easeOutQuad,
  lerpPose,
  pose,
  solveLimb,
  solvePose,
  type Pose,
  type Pt,
} from './rig'

/** Every fall pose id, in Hall of Flops order. */
export const FALL_POSE_IDS: string[] = FALL_POSES.map((p) => p.id)

// ---------------------------------------------------------------------------------------------
// Timing helpers

const TAU = Math.PI * 2

/** 0..1 position inside a loop of `period` seconds. */
function phase(t: number, period: number): number {
  const x = t / period
  return x - Math.floor(x)
}

/** A sine wave on the loop phase: k whole cycles per loop (so it always loops cleanly). */
function osc(p: number, k = 1, offset = 0): number {
  return Math.sin(TAU * (p * k + offset))
}

/** 0 → 1 → 0 once per loop, smooth at both ends. */
function swell(p: number, k = 1, offset = 0): number {
  return 0.5 - 0.5 * Math.cos(TAU * (p * k + offset))
}

/** Piecewise hold/ease: 0 until a, eases to 1 by b, holds until c, eases back to 0 by d. */
function holdEase(p: number, a: number, b: number, c: number, d: number): number {
  if (p < a || p >= d) return 0
  if (p < b) return easeInOutSine((p - a) / (b - a))
  if (p < c) return 1
  return 1 - easeInOutSine((p - c) / (d - c))
}

/** The pop-in: stretched tall at the start of the whipper, springing into the pose. */
const POP_TIME = 0.34

function popIn(q: Pose, t: number): Pose {
  if (t < 0 || t >= POP_TIME) return q
  const e = 1 - easeOutElastic(t / POP_TIME)
  q.squashX *= 1 - 0.15 * e
  q.squashY *= 1 + 0.18 * e
  return q
}

// ---------------------------------------------------------------------------------------------
// IK helpers (un-rotated frame; set rot afterwards)

function legAt(q: Pose, side: 'L' | 'R', ankle: Pt): Pose {
  const sk = solvePose(q)
  const hip = side === 'L' ? sk.hipL : sk.hipR
  const limb = solveLimb(hip, ankle, RIG.thigh, RIG.shin, -1)
  if (side === 'L') q.legL = limb
  else q.legR = limb
  return q
}

/** A point in the head's frame (x toward the face, y down) → the local frame. */
function onHead(q: Pose, x: number, y: number): Pt {
  const sk = solvePose(q)
  const a = sk.headAngle * DEG
  const c = Math.cos(a)
  const s = Math.sin(a)
  return { x: sk.head.x + x * c - y * s, y: sk.head.y + x * s + y * c }
}

/** A point in the torso's frame (origin at the hip, x forward, y down the spine) → local. */
function onTorso(q: Pose, x: number, y: number): Pt {
  const sk = solvePose(q)
  const a = sk.torsoAngle * DEG
  const c = Math.cos(a)
  const s = Math.sin(a)
  return { x: sk.hip.x + x * c - y * s, y: sk.hip.y + x * s + y * c }
}

/** The far hand on her hip, elbow cocked out behind her (the teapot's handle, the disco hip). */
function handOnHip(q: Pose): Pose {
  return aimArm(q, 'L', onTorso(q, -4.2, -3.4), -1, 1)
}

// ---------------------------------------------------------------------------------------------
// The poses
//
// Readability notes (3/4 view, big head): the far arm (L) hides behind the head when it points
// up-back, so poses send it back-and-level or forward instead; the near limbs (R) carry each
// silhouette. A limb at body angle φ points along φ − rot on screen.

interface FallAnim {
  /** Loop length (s). */
  period: number
  /** The most readable moment (s) for still cards and silhouettes. */
  still: number
  expression: Expression
  /** A different face for the first moment of the whipper (the beat before the splat). */
  firstFace?: Expression
  /** What the goat in the backpack does (cards; the climb may use it too). */
  goat: GoatMood
  at: (t: number) => Pose
}

/** How long `firstFace` shows (s). */
const FIRST_FACE_TIME = 0.16

/** All limbs flung out in a big X, flexing like a happy starfish and slowly tumbling. */
function starfish(t: number): Pose {
  const p = phase(t, 0.72)
  const s = swell(p)
  return pose({
    rot: -6 + 10 * osc(p, 1, 0.1),
    lean: -4,
    headTilt: -8 + 4 * osc(p, 1, 0.3),
    armL: [-90 - 22 * s, -4 - 10 * s],
    armR: [116 + 22 * s, 6 + 10 * s],
    legL: [-36 - 20 * s, 8 - 6 * s],
    legR: [40 + 20 * s, -8 + 6 * s],
    reachL: 1.3,
    reachR: 1.18,
    squashX: 1.02 + 0.07 * s,
    squashY: 1.01 - 0.05 * s,
    hairFloat: 1,
  })
}

/** Stiff as a board, belly-down and squashed flat, wobbling like a plank that went "boing". */
function pancake(t: number): Pose {
  const p = phase(t, 0.8)
  const wob = osc(p, 2)
  const quiver = osc(p, 8) * 3
  const flat = swell(p, 2, 0.25)
  return pose({
    rot: 90 + 8 * wob,
    lean: 0,
    headTilt: -26 + 4 * wob,
    armL: [-3 + quiver, 0],
    armR: [4 - quiver, 0],
    legL: [-3 - quiver * 0.6, 0],
    legR: [3 + quiver * 0.6, 0],
    squashX: 1.14 + 0.06 * flat,
    squashY: 0.76 - 0.08 * flat,
    hairFloat: 0.7,
  })
}

/** Long floppy noodle arms flailing in front and above (the wiggle period matches climber.ts's noodle). */
const SPAGHETTI_PERIOD = TAU / 9

function spaghettiArms(t: number): Pose {
  const p = phase(t, SPAGHETTI_PERIOD)
  const a = osc(p)
  const b = osc(p, 1, 0.33)
  return pose({
    rot: 5 * osc(p, 1, 0.5),
    lean: -6,
    headTilt: -6 + 5 * osc(p, 1, 0.2),
    armL: [84 + 40 * a, 10 - 24 * b],
    armR: [112 - 40 * b, 10 - 26 * a],
    reachL: 1.85,
    reachR: 1.9,
    noodle: 1,
    legL: [-14 + 10 * b, 18],
    legR: [16 - 10 * a, -28],
    hairFloat: 1,
  })
}

/** Back of the hand to the forehead, leaning way back, other arm trailing, one knee up: the big faint. */
function dramaticSwoon(t: number): Pose {
  const p = phase(t, 0.8)
  const sigh = swell(p)
  const q = pose({
    lean: -18 - 8 * sigh,
    headTilt: -18 - 10 * sigh,
    armL: [-62 - 10 * sigh, 40 + 12 * sigh],
    reachL: 1.15,
    legL: [-8, -4],
    legR: [56 + 10 * sigh, -80 - 8 * sigh],
    hairFloat: 0.8,
  })
  const out = aimArm(q, 'R', onHead(q, 3.2, -6.8), -1, 1.5)
  out.rot = -20 - 7 * sigh
  return out
}

/** Arms pinwheeling backwards in huge circles, legs kicking. */
function windmill(t: number): Pose {
  const p = phase(t, 0.7)
  const th = 720 * p
  return pose({
    rot: -6 + 3 * osc(p, 2),
    lean: -10,
    headTilt: -8,
    armR: [180 + th, 8],
    armL: [th, 8],
    reachL: 1.2,
    reachR: 1.22,
    legL: [-18 + 24 * osc(p, 2), -40 - 12 * osc(p, 2, 0.25)],
    legR: [18 - 24 * osc(p, 2), -40 + 12 * osc(p, 2, 0.25)],
    hairFloat: 1,
  })
}

/** Flying! One fist out front, body flat out, legs trailing. */
function superhero(t: number): Pose {
  const p = phase(t, 0.8)
  const bob = osc(p)
  return pose({
    rot: 74 + 4 * bob,
    rootY: 1.2 * bob,
    lean: 0,
    headTilt: -40,
    armR: [176 + 3 * osc(p, 2), 0],
    reachR: 1.2,
    armL: [-14, 30],
    legL: [-10, -26 + 8 * bob],
    legR: [6, -6],
    hairFloat: 1,
  })
}

/** Knees hugged tight, rolling head over heels. */
function cannonball(t: number): Pose {
  const p = phase(t, 0.7)
  const q = pose({
    lean: 24,
    headTilt: 16,
    rootY: 3,
    legL: [108, -150],
    legR: [120, -156],
    squashX: 1.04,
    squashY: 0.97,
    hairFloat: 0.9,
  })
  const sk = solvePose(q)
  const shin = (k: Pt, a: Pt, dx: number): Pt => ({ x: (k.x + a.x) / 2 + dx, y: (k.y + a.y) / 2 })
  const out = aimArm(aimArm(q, 'L', shin(sk.kneeL, sk.ankleL, 1.6), 1, 1.2), 'R', shin(sk.kneeR, sk.ankleR, 2.2), 1, 1.2)
  out.rot = 360 * p
  return out
}

/** One leg tucked up, arms flapping like wings, head bobbing like a bird. */
function flamingo(t: number): Pose {
  const p = phase(t, 0.8)
  const flap = osc(p, 2)
  return pose({
    rot: 4 * osc(p, 1, 0.25),
    lean: 14 + 3 * osc(p),
    headTilt: -16 + 10 * osc(p, 1, 0.1),
    armL: [-96 - 24 * flap, -30 + 26 * flap],
    armR: [100 + 24 * flap, 30 - 26 * flap],
    reachL: 1.15,
    reachR: 1.1,
    legL: [-14, 0],
    legR: [64, -152],
    hairFloat: 0.8,
  })
}

/** Pedalling an invisible bike as fast as she can, hands on the handlebars. */
function bicycle(t: number): Pose {
  const p = phase(t, 0.8)
  const a = TAU * 2 * p
  let q = pose({ lean: 14 + 2 * osc(p, 4), headTilt: -16, rootY: -0.4 * osc(p, 4), hairFloat: 0.9 })
  const sk = solvePose(q)
  // Each foot circles a pedal in front of and below its own hip, half a turn apart.
  const r = 4
  q = legAt(q, 'R', { x: sk.hipR.x + 4.4 + r * Math.cos(a), y: sk.hipR.y + 6.6 + r * Math.sin(a) })
  q = legAt(q, 'L', { x: sk.hipL.x + 4.4 - r * Math.cos(a), y: sk.hipL.y + 6.6 - r * Math.sin(a) })
  q = aimArm(q, 'L', { x: sk.neck.x + 10, y: sk.neck.y + 4.2 }, 1, 1.2)
  q = aimArm(q, 'R', { x: sk.neck.x + 11.4, y: sk.neck.y + 4.8 }, 1, 1.2)
  q.rot = -8
  return q
}

/** A quick squeeze and a slow drift open: long noodle arms and legs trail below like tentacles. */
function jellyfish(t: number): Pose {
  const p = phase(t, 0.8)
  const f = p < 0.26 ? 1 - easeOutQuad(p / 0.26) : easeInOutSine((p - 0.26) / 0.74)
  return pose({
    rootY: -3 * (1 - f),
    rot: 3 * osc(p),
    lean: -2,
    headTilt: 8,
    armL: [-6 - 26 * f, -6 + 6 * f],
    armR: [8 + 30 * f, 6 - 6 * f],
    reachL: 1.95,
    reachR: 2,
    noodle: 1,
    legL: [-6 - 22 * f, 18 - 8 * f],
    legR: [6 + 22 * f, -18 + 8 * f],
    squashX: 0.92 + 0.14 * f,
    squashY: 1.08 - 0.12 * f,
    hairFloat: 1,
  })
}

/** Spout out front, a hand on the hip for the handle, tipping right over to pour. */
function teapot(t: number): Pose {
  const p = phase(t, 0.8)
  const tip = holdEase(p, 0.08, 0.38, 0.62, 0.92)
  let q = pose({
    lean: 4 + 8 * tip,
    headTilt: -6 + 14 * tip,
    rootY: -0.6 * tip,
    armR: [76 + 6 * tip, 46 - 6 * tip],
    reachR: 1.18,
    legL: [-5, 2],
    legR: [6, -2],
    hairFloat: 0.4,
  })
  q = handOnHip(q)
  q.rot = 36 * tip - 3
  return q
}

/** Every limb shot out stiff and splayed like a startled cat, hair on end, boinging and quivering. */
function surprisedCat(t: number): Pose {
  const p = phase(t, 0.6)
  const boing = Math.abs(osc(p, 1))
  const jitter = osc(p, 12) * 0.8
  const rot = 28
  return pose({
    rot,
    rootX: jitter,
    rootY: -4 * boing,
    lean: 18,
    headTilt: -46,
    armL: [rot + 30, 0],
    armR: [rot + 52, 0],
    legL: [rot - 50, 0],
    legR: [rot - 26, 0],
    reachL: 1.3,
    reachR: 1.3,
    squashX: 0.98 - 0.06 * boing,
    squashY: 1.02 + 0.14 * boing,
    hairFloat: 1,
  })
}

/** An arabesque that twirls round and round (a paper-flip turn: squashX goes through zero). */
function ballerina(t: number): Pose {
  const p = phase(t, 0.8)
  // Spends most of the turn wide and whips through the edge-on moment.
  const c = Math.cos(TAU * p)
  const w = Math.max(0.22, Math.sqrt(Math.abs(c)))
  const sx = c >= 0 ? w : -w
  return pose({
    rot: 12,
    lean: 20,
    headTilt: -28,
    armR: [124, 24],
    armL: [-100, -20],
    reachL: 1.12,
    reachR: 1.08,
    legL: [-102, 4],
    legR: [-12, 0],
    rootY: -0.8 * swell(p, 2),
    squashX: sx,
    squashY: 1 + 0.03 * osc(p, 2),
    hairFloat: 0.6,
  })
}

/** Hanging upside down by the knees from a branch that isn't there, arms dangling, dozing. */
function sleepySloth(t: number): Pose {
  const p = phase(t, 0.8)
  const sway = osc(p)
  const lag = osc(p, 1, -0.15)
  return pose({
    rot: 180 + 9 * sway,
    rootY: -2,
    lean: 4 * lag,
    headTilt: -12 + 5 * osc(p, 1, 0.3),
    // Knees hooked over the branch: thighs point up (screen), shins fold over the top.
    legL: [-4 + 3 * lag, -96],
    legR: [4 + 3 * lag, -104],
    // Arms hang down past her helmet, swinging a beat behind.
    armL: [-150 + 10 * lag, 6],
    armR: [150 + 10 * lag, -6],
    reachL: 1.25,
    reachR: 1.3,
    hairFloat: 1,
  })
}

/** Swimming through the air: chin up, paws paddling in little circles, feet kicking. */
function doggyPaddle(t: number): Pose {
  const p = phase(t, 0.6)
  const a = TAU * 2 * p
  let q = pose({
    lean: 0,
    headTilt: -56 + 4 * osc(p, 2),
    rootY: -0.5 * osc(p, 2),
    legL: [-14 + 16 * osc(p, 4), -16],
    legR: [-14 - 16 * osc(p, 4), -12],
    hairFloat: 0.5,
  })
  // Paws paddle forward-and-down in small circles in front of her chest, out of step. Each circle
  // sits within its own arm's reach (the far shoulder is further back in this 3/4 view).
  const r = 3
  const pawR = onTorso(q, 12.5 + r * Math.cos(a), -7.2 + r * Math.sin(a))
  const pawL = onTorso(q, 4.6 - r * Math.cos(a), -7.6 - r * Math.sin(a))
  q = aimArm(q, 'L', pawL, 1, 1.1)
  q = aimArm(q, 'R', pawR, 1, 1.1)
  q.rot = 64 + 3 * osc(p, 2)
  return q
}

/** Point up! Point down! Hip out, hand on hip, head bopping. */
function discoPose(up: boolean, bop: number): Pose {
  const q = up
    ? pose({
        rootX: 1.4,
        lean: -8,
        headTilt: -16 + bop,
        armR: [156, 2],
        reachR: 1.2,
        legL: [-6, 2],
        legR: [28, -48],
        squashY: 1.02,
      })
    : pose({
        rootX: -1,
        lean: 12,
        headTilt: 14 + bop,
        armR: [36, -2],
        reachR: 1.2,
        legL: [18, -34],
        legR: [-4, 2],
        squashY: 0.98,
      })
  return handOnHip(q)
}

function disco(t: number): Pose {
  const p = phase(t, 0.8)
  const k = holdEase(p, 0.35, 0.49, 0.85, 0.99)
  const bop = 3 * osc(p, 4)
  const q = lerpPose(discoPose(true, bop), discoPose(false, bop), k)
  // Re-plant the hand on the hip after blending (the blend drifts it off).
  const out = handOnHip(q)
  out.rot = -4 + 8 * k
  return out
}

const ANIMS: Record<FallPoseId, FallAnim> = {
  starfish: { period: 0.72, still: 0.88, expression: 'laughing', goat: 'laugh', at: starfish },
  pancake: { period: 0.8, still: 0.6, expression: 'oof', firstFace: 'surprised', goat: 'cover-eyes', at: pancake },
  'spaghetti-arms': { period: SPAGHETTI_PERIOD, still: 0.55, expression: 'surprised', goat: 'laugh', at: spaghettiArms },
  'dramatic-swoon': { period: 0.8, still: 1.2, expression: 'sleepy', goat: 'nervous', at: dramaticSwoon },
  windmill: { period: 0.7, still: 1.006, expression: 'nervous', goat: 'gulp', at: windmill },
  superhero: { period: 0.8, still: 0.6, expression: 'determined', goat: 'proud', at: superhero },
  cannonball: { period: 0.7, still: 0.7, expression: 'oof', firstFace: 'surprised', goat: 'cover-eyes', at: cannonball },
  flamingo: { period: 0.8, still: 0.6, expression: 'proud', goat: 'curious', at: flamingo },
  bicycle: { period: 0.8, still: 0.84, expression: 'determined', goat: 'happy', at: bicycle },
  jellyfish: { period: 0.8, still: 1.2, expression: 'happy', goat: 'sleepy', at: jellyfish },
  teapot: { period: 0.8, still: 1.2, expression: 'happy', goat: 'happy', at: teapot },
  'surprised-cat': { period: 0.6, still: 0.75, expression: 'surprised', goat: 'nervous', at: surprisedCat },
  ballerina: { period: 0.8, still: 0.8, expression: 'proud', goat: 'wobbly', at: ballerina },
  'sleepy-sloth': { period: 0.8, still: 0.8, expression: 'sleepy', goat: 'sleepy', at: sleepySloth },
  'doggy-paddle': { period: 0.6, still: 0.65, expression: 'focused', goat: 'happy', at: doggyPaddle },
  disco: { period: 0.8, still: 0.96, expression: 'laughing', goat: 'laugh', at: disco },
}

function anim(id: string): FallAnim | undefined {
  return Object.prototype.hasOwnProperty.call(ANIMS, id) ? ANIMS[id as FallPoseId] : undefined
}

// ---------------------------------------------------------------------------------------------
// Public API

/**
 * The fall pose `id` at t seconds since the whipper began. Unknown ids get the generic fall, so
 * an old save can never break drawing. Always returns a fresh Pose.
 */
export function fallPose(id: string, t: number): Pose {
  const a = anim(id)
  const tt = Number.isFinite(t) && t > 0 ? t : 0
  if (!a) return fall(tt)
  return popIn(a.at(tt), tt)
}

/** Her face for this pose (t in seconds since the whipper began). */
export function fallPoseExpression(id: string, t = 0): Expression {
  const a = anim(id)
  if (!a) return 'surprised'
  return a.firstFace && t >= 0 && t < FIRST_FACE_TIME ? a.firstFace : a.expression
}

/** What the goat in her backpack does during this pose (ears flapping is up to the caller). */
export function fallPoseGoatMood(id: string): GoatMood {
  return anim(id)?.goat ?? 'wheee'
}

/** Loop length in seconds (after the pop-in). */
export function fallPosePeriod(id: string): number {
  return anim(id)?.period ?? 0.7
}

/** The most readable moment (s) for a still drawing (silhouettes, reduced motion). */
export function fallPoseStill(id: string): number {
  return anim(id)?.still ?? 0.6
}

/** Chance that a pick goes to a not-yet-collected pose while any remain. */
export const UNSEEN_BIAS = 0.6

/**
 * Prefer poses she hasn't collected: while any remain, 60% of picks are an unseen pose (and the
 * very first pick always is); otherwise any of the 16. Deterministic for a given rng.
 * `seen` is SaveData.poses (keys = pose ids); unknown keys are ignored.
 */
export function pickFallPose(seen: Record<string, unknown>, rng: () => number): string {
  const has = (id: string) => Object.prototype.hasOwnProperty.call(seen, id) && seen[id] != null
  const unseen = FALL_POSE_IDS.filter((id) => !has(id))
  const pickFrom = (list: readonly string[]) => list[Math.min(list.length - 1, Math.max(0, Math.floor(rng() * list.length)))]
  const r = rng()
  if (unseen.length > 0 && (unseen.length === FALL_POSE_IDS.length || r < UNSEEN_BIAS)) return pickFrom(unseen)
  return pickFrom(FALL_POSE_IDS)
}

/**
 * How far (local units, y-down) to shift the drawing so her lowest point rests on the ground line
 * y = 0 — for a flop that lands on a ledge (a lying-down Pancake should lie ON the ledge, not hover).
 * Add it to the feet y before drawing. Standing poses give ~0.
 */
export function groundLift(p: Pose): number {
  const sk = solvePose(p)
  let maxY = -Infinity
  const add = (pt: Pt, r: number) => {
    if (pt.y + r > maxY) maxY = pt.y + r
  }
  add(sk.head, RIG.headR + 0.8)
  add(sk.neck, 2)
  add(sk.hip, 4)
  add(sk.kneeL, 2.4)
  add(sk.kneeR, 2.4)
  add(sk.ankleL, RIG.ankleLift + 0.2)
  add(sk.ankleR, RIG.ankleLift + 0.2)
  add(sk.elbowL, 2)
  add(sk.elbowR, 2)
  add(sk.wristL, 2.2)
  add(sk.wristR, 2.2)
  // The backpack: its bottom corners in the torso frame.
  const a = sk.torsoAngle * DEG
  const c = Math.cos(a)
  const s = Math.sin(a)
  for (const [x, y] of [
    [-17.8, -0.2],
    [-6.6, -0.2],
    [-17.8, -15],
  ] as const) {
    add({ x: sk.hip.x + x * c - y * s, y: sk.hip.y + x * s + y * c }, 0.5)
  }
  return -maxY * p.squashY
}
