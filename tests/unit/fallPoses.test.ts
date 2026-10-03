/**
 * The 16 silly fall poses: content rules (names, ≤ 12-word descriptions, voice), every animation
 * finite and loopable, and the unseen-biased picker.
 */
import { describe, expect, it } from 'vitest'
import { FALL_POSES, fallPoseInfo, isFallPoseId } from '../../src/content/fallPoses'
import {
  FALL_POSE_IDS,
  UNSEEN_BIAS,
  fallPose,
  fallPoseExpression,
  fallPoseGoatMood,
  fallPosePeriod,
  fallPoseStill,
  groundLift,
  pickFallPose,
} from '../../src/game/art/fallPosesAnim'
import { EXPRESSIONS } from '../../src/game/art/climber'
import { GOAT_MOODS } from '../../src/game/art/goat'
import type { Pose } from '../../src/game/art/rig'
import { mulberry32 } from '../../src/model/rng'
import { bannedIn, wordCount } from './voice'

const NUMERIC: (keyof Pose)[] = ['rootX', 'rootY', 'rot', 'lean', 'headTilt', 'reachL', 'reachR', 'squashX', 'squashY', 'hairFloat']
const LIMBS: (keyof Pose)[] = ['armL', 'armR', 'legL', 'legR']

/** Every number in a pose, in a fixed order. */
function numbers(p: Pose): number[] {
  const out = NUMERIC.map((k) => p[k] as number)
  for (const k of LIMBS) out.push(...(p[k] as [number, number]))
  out.push(p.noodle ?? 0)
  return out
}

/** Angles that differ by whole turns are the same drawing. */
function angleGap(a: number, b: number): number {
  const d = Math.abs(a - b) % 360
  return Math.min(d, 360 - d)
}

describe('fall pose content', () => {
  it('has exactly 16 poses with unique ids, in the same order everywhere', () => {
    expect(FALL_POSES).toHaveLength(16)
    expect(new Set(FALL_POSES.map((p) => p.id)).size).toBe(16)
    expect(FALL_POSE_IDS).toEqual(FALL_POSES.map((p) => p.id))
    for (const id of FALL_POSE_IDS) {
      expect(isFallPoseId(id)).toBe(true)
      expect(fallPoseInfo(id)?.id).toBe(id)
    }
    expect(isFallPoseId('moonwalk')).toBe(false)
    expect(fallPoseInfo('moonwalk')).toBeUndefined()
  })

  it('includes the four poses the brief names', () => {
    const names = FALL_POSES.map((p) => p.name)
    for (const n of ['The Starfish', 'The Pancake', 'The Spaghetti Arms', 'The Dramatic Swoon']) expect(names).toContain(n)
  })

  it('gives every pose a unique "The …" name and a short, kind description', () => {
    expect(new Set(FALL_POSES.map((p) => p.name)).size).toBe(16)
    for (const p of FALL_POSES) {
      expect(p.name, p.id).toMatch(/^The [A-Z]/)
      expect(p.description.trim(), p.id).not.toBe('')
      expect(wordCount(p.description), `${p.id}: ${p.description}`).toBeLessThanOrEqual(12)
      expect(bannedIn(`${p.name} ${p.description}`), p.id).toEqual([])
    }
  })
})

describe('fall pose animations', () => {
  it('returns finite numbers for every pose over t in [0, 2]', () => {
    for (const id of FALL_POSE_IDS) {
      for (let i = 0; i <= 200; i++) {
        const t = i / 100
        const p = fallPose(id, t)
        for (const n of numbers(p)) expect(Number.isFinite(n), `${id} at t=${t}`).toBe(true)
        expect(Math.abs(p.squashX), `${id} squashX at t=${t}`).toBeGreaterThan(0.1)
        expect(p.squashY, `${id} squashY at t=${t}`).toBeGreaterThan(0.5)
        expect(p.reachL, id).toBeGreaterThanOrEqual(1)
        expect(p.reachR, id).toBeGreaterThanOrEqual(1)
        expect(Number.isFinite(groundLift(p)), id).toBe(true)
      }
    }
  })

  it('animates every pose (it moves) and gives each its own shape', () => {
    const generic = numbers(fallPose('not-a-pose', 0.6))
    for (const id of FALL_POSE_IDS) {
      const a = numbers(fallPose(id, 0.6))
      const b = numbers(fallPose(id, 0.6 + fallPosePeriod(id) / 3))
      expect(a.some((v, i) => Math.abs(v - b[i]) > 1), `${id} moves`).toBe(true)
      expect(a.some((v, i) => Math.abs(v - generic[i]) > 1), `${id} is not the generic fall`).toBe(true)
    }
  })

  it('loops cleanly after the pop-in: t and t + period draw the same pose', () => {
    for (const id of FALL_POSE_IDS) {
      const period = fallPosePeriod(id)
      expect(period, id).toBeGreaterThanOrEqual(0.55)
      expect(period, id).toBeLessThanOrEqual(0.85)
      for (let t = 0.5; t < 1.5; t += 0.07) {
        const a = numbers(fallPose(id, t))
        const b = numbers(fallPose(id, t + period))
        a.forEach((v, i) => expect(angleGap(v, b[i]), `${id} field ${i} at t=${t.toFixed(2)}`).toBeLessThan(0.01))
      }
    }
  })

  it('never pops between frames (no IK flips or seams), except the ballerina’s edge-on flip', () => {
    for (const id of FALL_POSE_IDS) {
      let prev = numbers(fallPose(id, 0))
      for (let i = 1; i <= 120; i++) {
        const cur = numbers(fallPose(id, i / 60))
        cur.forEach((v, k) => {
          const gap = k < NUMERIC.length && NUMERIC[k].startsWith('squash') ? Math.abs(v - prev[k]) : angleGap(v, prev[k])
          if (id === 'ballerina' && NUMERIC[k] === 'squashX') return
          // The fastest moves on purpose: the windmill's arms (~17° a frame at 60 fps) and the
          // disco snap (~25° at its peak). A glitch (an IK flip, a bad loop seam) is far bigger.
          expect(gap, `${id} field ${k} at frame ${i}`).toBeLessThan(30)
        })
        prev = cur
      }
    }
  })

  it('pops in stretched and settles into the loop', () => {
    for (const id of FALL_POSE_IDS) {
      const start = fallPose(id, 0)
      const settled = fallPose(id, fallPosePeriod(id) * 3)
      expect(start.squashY / Math.abs(start.squashX), id).toBeGreaterThan(settled.squashY / Math.abs(settled.squashX))
    }
  })

  it('has a face, a goat mood and a still frame for every pose', () => {
    for (const id of FALL_POSE_IDS) {
      expect(EXPRESSIONS, id).toContain(fallPoseExpression(id, 0))
      expect(EXPRESSIONS, id).toContain(fallPoseExpression(id, 1))
      expect(GOAT_MOODS, id).toContain(fallPoseGoatMood(id))
      expect(fallPoseStill(id), id).toBeGreaterThanOrEqual(0.34)
    }
  })

  it('falls back to the generic fall for an unknown id, and never breaks on odd times', () => {
    for (const t of [Number.NaN, -1, Infinity, 0]) {
      for (const n of numbers(fallPose('starfish', t))) expect(Number.isFinite(n)).toBe(true)
      for (const n of numbers(fallPose('unknown', t))) expect(Number.isFinite(n)).toBe(true)
    }
    expect(EXPRESSIONS).toContain(fallPoseExpression('unknown'))
  })

  it('rests a lying-down flop on the ledge (groundLift)', () => {
    // The pancake lies flat: it must be lowered onto the ground line, not hover at standing height.
    expect(groundLift(fallPose('pancake', 0.6))).toBeGreaterThan(8)
    // A pose standing on its feet needs (almost) no shift.
    expect(Math.abs(groundLift(fallPose('flamingo', 0.6)))).toBeLessThan(4)
  })
})

describe('pickFallPose', () => {
  it('always picks a new pose on the very first whipper', () => {
    for (let seed = 1; seed <= 50; seed++) {
      expect(FALL_POSE_IDS).toContain(pickFallPose({}, mulberry32(seed)))
    }
  })

  it('returns valid ids for any save, including unknown keys and edge rng values', () => {
    const allSeen = Object.fromEntries(FALL_POSE_IDS.map((id) => [id, { firstAt: '2026-01-01', count: 2 }]))
    for (let seed = 1; seed <= 50; seed++) {
      expect(FALL_POSE_IDS).toContain(pickFallPose(allSeen, mulberry32(seed)))
      expect(FALL_POSE_IDS).toContain(pickFallPose({ moonwalk: { count: 1 } }, mulberry32(seed)))
    }
    expect(FALL_POSE_IDS).toContain(pickFallPose({}, () => 0))
    expect(FALL_POSE_IDS).toContain(pickFallPose({}, () => 0.9999999))
    expect(FALL_POSE_IDS).toContain(pickFallPose(allSeen, () => 1))
  })

  it('is deterministic for a given rng', () => {
    const seen = { starfish: { count: 1 }, pancake: { count: 3 } }
    const a = mulberry32(42)
    const b = mulberry32(42)
    for (let i = 0; i < 40; i++) expect(pickFallPose(seen, a)).toBe(pickFallPose(seen, b))
  })

  it('prefers poses she has not collected yet', () => {
    const missing = 'disco'
    const seen = Object.fromEntries(FALL_POSE_IDS.filter((id) => id !== missing).map((id) => [id, { count: 1 }]))
    const rng = mulberry32(7)
    let hits = 0
    const n = 4000
    for (let i = 0; i < n; i++) if (pickFallPose(seen, rng) === missing) hits++
    // 60% straight to the unseen one, plus its 1-in-16 share of the rest.
    const expected = UNSEEN_BIAS + (1 - UNSEEN_BIAS) / 16
    expect(hits / n).toBeGreaterThan(expected - 0.04)
    expect(hits / n).toBeLessThan(expected + 0.04)
  })

  it('collects all 16 in a reasonable number of falls', () => {
    const seen: Record<string, number> = {}
    const rng = mulberry32(2026)
    let falls = 0
    while (Object.keys(seen).length < 16 && falls < 500) {
      seen[pickFallPose(seen, rng)] = 1
      falls++
    }
    expect(Object.keys(seen)).toHaveLength(16)
    expect(falls).toBeLessThan(60)
  })
})
