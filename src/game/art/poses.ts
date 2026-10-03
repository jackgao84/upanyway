/**
 * Named base poses on the rig. Each returns a fresh Pose; animated ones take `t` (seconds, or 0..1
 * where noted). Angles follow rig.ts: limbs from straight down, + toward the facing side.
 */
import {
  RIG,
  aimArm,
  clamp01,
  easeOutBack,
  lerpPose,
  plantFeet,
  pose,
  solveLimb,
  solvePose,
  type Pose,
  type Pt,
} from './rig'


/** Plant one foot's ankle at a point (rot assumed 0). */
function legTo(p: Pose, side: 'L' | 'R', ankle: Pt): Pose {
  const sk = solvePose({ ...p, rot: 0 })
  const hip = side === 'L' ? sk.hipL : sk.hipR
  const limb = solveLimb(hip, ankle, RIG.thigh, RIG.shin, -1)
  return side === 'L' ? { ...p, legL: limb } : { ...p, legR: limb }
}

export function stand(): Pose {
  return pose({ armL: [-14, 12], armR: [13, 14], legL: [-4, 2], legR: [4, -1] })
}

/** Gentle breathing and a little sway. */
export function idle(t: number): Pose {
  const b = Math.sin(t * 2.2)
  const s = Math.sin(t * 0.9)
  return pose({
    rootY: b * 0.25,
    squashY: 1 + b * 0.012,
    squashX: 1 - b * 0.006,
    lean: s * 1.2,
    headTilt: Math.sin(t * 0.7 + 1) * 3,
    armL: [-14 + b * 2, 12 + b * 2],
    armR: [13 - b * 2, 14 + b * 2],
    legL: [-4, 2],
    legR: [4, -1],
  })
}

/**
 * Winding up for a leap: lower with power (0..1), hips pulled back away from the aim, arms swung
 * back, eyes on the target. `aimDeg` is the world launch angle (0 = right, 90 = up, 180 = left).
 */
export function crouch(power: number, aimDeg = 90, facing: 1 | -1 = 1): Pose {
  const k = clamp01(power)
  const a = (aimDeg * Math.PI) / 180
  const fwd = Math.cos(a) * facing // + = aiming toward where she faces
  const up = Math.sin(a)
  const elev = (Math.atan2(up, Math.abs(fwd)) * 180) / Math.PI
  // A spring-loaded crouch: hips back and down, chest over the knees, arms swung back.
  const lean = 6 + 20 * k - 6 * k * fwd
  const p = pose({
    rootY: 0.8 + 5.2 * k,
    rootX: -1.2 * k - fwd * 1.4 * k,
    lean,
    headTilt: -elev * 0.42 - lean * 0.8,
    armL: [-34 - 34 * k, 22 + 8 * k],
    armR: [-26 - 36 * k, 20 + 10 * k],
    squashY: 1 - 0.06 * k,
    squashX: 1 + 0.05 * k,
  })
  return plantFeet(p, -2.6 + 1.2 * k, 3.2 + 1.6 * k)
}

/** The moment of take-off: stretched long, arms flung up. */
export function launch(): Pose {
  return pose({
    rootY: -0.6,
    lean: 4,
    headTilt: -10,
    armL: [-140, -12],
    armR: [128, 26],
    legL: [-10, -6],
    legR: [-3, -8],
    squashX: 0.88,
    squashY: 1.13,
    hairFloat: 0.15,
  })
}

/** Rising through the air: a knee tucked, the near arm reaching ahead. */
export function fly(t = 0): Pose {
  const w = Math.sin(t * 7) * 4
  return pose({
    lean: 7,
    headTilt: -12,
    armL: [-60 + w, 40],
    armR: [122 - w, 30],
    legL: [-14, -24],
    legR: [64 + w, -96],
    hairFloat: 0.35,
  })
}

/** A generic fall: arms windmilling, legs bicycling, hair streaming up. */
export function fall(t = 0): Pose {
  const a = t * 11
  return pose({
    lean: -6,
    headTilt: -10,
    rot: Math.sin(t * 3) * 4,
    armL: [-128 + Math.sin(a) * 28, -30 + Math.sin(a + 1) * 20],
    armR: [136 + Math.sin(a + Math.PI) * 28, 30 + Math.sin(a + 2) * 20],
    legL: [22 + Math.sin(a * 0.8) * 30, -58],
    legR: [-12 - Math.sin(a * 0.8) * 30, -44],
    hairFloat: 1,
  })
}

/**
 * Hanging from a hold. The hold is at (0, −TUNING.handOffset) = (0, −44) above the feet point;
 * the body hangs below it (feet dangle a little under the physics point).
 */
export function hang(hands: 1 | 2 = 2, t = 0): Pose {
  const sway = Math.sin(t * 1.6)
  let p = pose({
    rootY: 11.5,
    rootX: hands === 1 ? -1.6 : 0,
    rot: sway * 2.5 + (hands === 1 ? -5 : 0),
    lean: -4,
    headTilt: -14,
    legL: [-10 + sway * 5, 12],
    legR: [16 + sway * 5, -34],
  })
  if (hands === 2) {
    p = aimArm(p, 'L', { x: -1.8, y: -44.2 }, 1)
    p = aimArm(p, 'R', { x: 1.9, y: -44.4 }, 1)
  } else {
    p = aimArm(p, 'R', { x: 0.4, y: -44.4 }, 1)
    p = { ...p, armL: [-70 + sway * 8, 30] }
  }
  return p
}

/** Touch-down: squash at t = 0 springing back to standing by t = 1. */
export function land(t: number): Pose {
  const k = clamp01(t)
  const a = 1 - easeOutBack(k, 2.2)
  const squash = pose({
    rootY: 5.2,
    lean: 10,
    headTilt: -4,
    armL: [-62, 30],
    armR: [74, 26],
    squashX: 1.16,
    squashY: 0.82,
  })
  const p = lerpPose(stand(), squash, a)
  return plantFeet(p, -3.4, 3.6)
}

/**
 * Big Leap nerves: knees knocking and a shiver, layered on any standing/crouching pose.
 * Purely visual; `amount` 0..1.
 */
export function wobble(t: number, base: Pose = stand(), amount = 1): Pose {
  const k = clamp01(amount)
  const knock = Math.sin(t * 26) * 7 * k
  const shiver = Math.sin(t * 41) * 0.35 * k
  return {
    ...base,
    rootX: base.rootX + shiver,
    legL: [base.legL[0] + 8 * k + knock, base.legL[1] - 14 * k - knock * 1.6],
    legR: [base.legR[0] - 8 * k + knock, base.legR[1] + 6 * k - knock * 1.6],
    armL: [base.armL[0] + Math.sin(t * 33) * 3 * k, base.armL[1]],
    armR: [base.armR[0] + Math.sin(t * 29) * 3 * k, base.armR[1]],
    squashY: base.squashY - 0.015 * k * Math.abs(Math.sin(t * 13)),
  }
}

/** A friendly wave with the near hand. */
export function wave(t: number): Pose {
  const w = Math.sin(t * 9)
  return pose({
    headTilt: -4 + Math.sin(t * 2) * 2,
    lean: -2,
    armL: [-10, 12],
    armR: [116 + w * 8, 34 + w * 22],
    legL: [-4, 2],
    legR: [4, -1],
  })
}

/** Both arms up, bouncing on her toes. */
export function cheer(t: number): Pose {
  const hop = Math.abs(Math.sin(t * 6))
  return pose({
    rootY: -hop * 1.8,
    headTilt: -9,
    lean: -3,
    armL: [-122 + Math.sin(t * 12) * 6, -34],
    armR: [118 - Math.sin(t * 12) * 6, 36],
    legL: [-6, 4 - hop * 6],
    legR: [5, -2 - hop * 8],
    squashY: 1 + hop * 0.04,
    squashX: 1 - hop * 0.03,
  })
}

/** Sitting on the ground at camp, knees up, hands on knees. Feet rest at y = 0. */
export function sit(t = 0): Pose {
  const b = Math.sin(t * 2)
  let p = pose({ rootY: 10.4, lean: -5 + b * 0.8, headTilt: 4 + Math.sin(t * 0.8) * 3 })
  p = legTo(p, 'L', { x: 6.8, y: -1.5 })
  p = legTo(p, 'R', { x: 9.6, y: -1.5 })
  const sk = solvePose(p)
  p = aimArm(p, 'L', { x: sk.kneeL.x - 0.4, y: sk.kneeL.y - 1.4 }, 1, 1)
  p = aimArm(p, 'R', { x: sk.kneeR.x + 0.2, y: sk.kneeR.y - 1.6 }, 1, 1)
  return p
}

/** Giggling: rocking back, hands on her tummy. */
export function laugh(t: number): Pose {
  const r = Math.sin(t * 10)
  const p = pose({
    rootY: Math.abs(r) * 0.7,
    lean: -9 + r * 3,
    headTilt: -9 + r * 2,
    armL: [-4, 74],
    armR: [22, -112 + r * 6],
    squashY: 1 - Math.abs(r) * 0.02,
  })
  return plantFeet(p, -3, 3.4)
}

/** Peering down over an edge: leaning out, hands on knees. */
export function peer(t = 0): Pose {
  const s = Math.sin(t * 1.4)
  let p = pose({ rootY: 2.4, rootX: -1, lean: 22 + s * 2, headTilt: 16 })
  p = plantFeet(p, -3.4, 3.4)
  const sk = solvePose(p)
  p = aimArm(p, 'L', { x: sk.kneeL.x + 0.4, y: sk.kneeL.y - 1 }, 1, 1)
  p = aimArm(p, 'R', { x: sk.kneeR.x + 0.8, y: sk.kneeR.y - 1.2 }, 1, 1)
  return p
}

export interface NamedPose {
  id: string
  name: string
  /** t in seconds (looping poses) — land uses (t mod 1.2) / 1.2. */
  at: (t: number) => Pose
}

/** Every base pose, for galleries and tools. */
export const BASE_POSES: readonly NamedPose[] = [
  { id: 'stand', name: 'Stand', at: () => stand() },
  { id: 'idle', name: 'Idle', at: (t) => idle(t) },
  { id: 'crouch-low', name: 'Crouch (little leap)', at: () => crouch(0.3, 70, 1) },
  { id: 'crouch-full', name: 'Crouch (big leap)', at: () => crouch(1, 55, 1) },
  { id: 'crouch-up', name: 'Crouch (straight up)', at: () => crouch(0.9, 90, 1) },
  { id: 'launch', name: 'Launch', at: () => launch() },
  { id: 'fly', name: 'Fly', at: (t) => fly(t) },
  { id: 'fall', name: 'Fall', at: (t) => fall(t) },
  { id: 'hang', name: 'Hang', at: (t) => hang(2, t) },
  { id: 'hang-one', name: 'Hang (one hand)', at: (t) => hang(1, t) },
  { id: 'land', name: 'Land', at: (t) => land((t % 1.2) / 1.2) },
  { id: 'wobble', name: 'Wobbly knees', at: (t) => wobble(t, crouch(0.35, 70, 1)) },
  { id: 'wave', name: 'Wave', at: (t) => wave(t) },
  { id: 'cheer', name: 'Cheer', at: (t) => cheer(t) },
  { id: 'sit', name: 'Sit', at: (t) => sit(t) },
  { id: 'laugh', name: 'Laugh', at: (t) => laugh(t) },
  { id: 'peer', name: 'Peer down', at: (t) => peer(t) },
]

