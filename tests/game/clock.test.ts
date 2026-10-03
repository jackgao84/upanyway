/** Frame pacing: Safari's whole-millisecond rAF times must still give an even number of physics steps a frame. */
import { describe, expect, test } from 'vitest'
import { frameDelta } from '../../src/game/clock'
import { ClimbSession } from '../../src/game/engine'
import { getLevel } from '../../src/game/levels'
import { TUNING } from '../../src/game/tuning'

/**
 * Steps the session takes on each of `frames` frames at `hz`, with timestamps rounded to whole ms
 * (the first frame, always one 60 Hz frame, left out).
 */
function stepsPerFrame(hz: number, frames: number, phaseMs = 0): number[] {
  const s = new ClimbSession({ level: getLevel('p01')!, choosePose: () => 'starfish' })
  const out: number[] = []
  let last = -1
  for (let i = 0; i < frames; i++) {
    const ms = Math.floor(phaseMs + (i * 1000) / hz)
    const before = s.t
    s.update(frameDelta(last, ms))
    last = ms
    out.push(Math.round((s.t - before) / TUNING.dt))
  }
  return out.slice(1)
}

describe('frameDelta', () => {
  test('60 Hz with whole-ms timestamps: exactly 2 steps every frame, whatever the phase', () => {
    for (const phase of [0, 0.3, 0.5, 0.7, 0.99]) {
      expect(new Set(stepsPerFrame(60, 600, phase))).toEqual(new Set([2]))
    }
  })
  test('59.94 Hz: still 2 a frame', () => {
    expect(new Set(stepsPerFrame(59.94, 1200, 0.4))).toEqual(new Set([2]))
  })
  test('120 Hz (ProMotion): 1 a frame; 30 Hz: 4 a frame', () => {
    expect(new Set(stepsPerFrame(120, 600, 0.2))).toEqual(new Set([1]))
    expect(new Set(stepsPerFrame(30, 300, 0.2)).has(4)).toBe(true)
    expect(new Set(stepsPerFrame(30, 300, 0.2)).size).toBe(1)
  })
  test('a stall is clamped, and the first frame is one 60 Hz frame', () => {
    expect(frameDelta(-1, 1234)).toBeCloseTo(1 / 60, 9)
    expect(frameDelta(0, 5000)).toBe(0.1)
    expect(frameDelta(100, 90)).toBe(0)
    // Not near a whole number of steps: left as it is.
    expect(frameDelta(0, 20)).toBeCloseTo(0.02, 9)
  })
})
