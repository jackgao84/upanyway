import { describe, expect, it } from 'vitest'
import { PITCH_IDS } from '../../src/game/types'
import { addBraveThing } from '../../src/model/stones'
import {
  isGoatOut,
  isNightOpen,
  isPitchOpen,
  nextLockedPitch,
  openPitches,
  pitchRequirement,
  stonesToOpen,
} from '../../src/model/unlocks'
import { DAY1, at, doBrave, fresh, sendLetter, withStones } from './fixtures'

describe('pitch unlocks', () => {
  it('pitch n needs n − 2 stones; pitches 1 and 2 are free', () => {
    expect(pitchRequirement('lesson')).toBe(0)
    expect(pitchRequirement('p01')).toBe(0)
    expect(pitchRequirement('p02')).toBe(0)
    expect(pitchRequirement('p03')).toBe(1)
    expect(pitchRequirement('p10')).toBe(8)
    expect(pitchRequirement('p16')).toBe(14)
  })

  it('0 stones → only p01 and p02', () => {
    const d = fresh()
    expect(openPitches(d)).toEqual(['p01', 'p02'])
    expect(nextLockedPitch(d)).toBe('p03')
    expect(isPitchOpen(d, 'lesson')).toBe(true)
    expect(stonesToOpen(d, 'p03')).toBe(1)
    expect(stonesToOpen(d, 'p16')).toBe(14)
  })

  it('1 stone → p03 opens', () => {
    const d = fresh()
    doBrave(d, DAY1)
    expect(isPitchOpen(d, 'p03')).toBe(true)
    expect(isPitchOpen(d, 'p04')).toBe(false)
    expect(nextLockedPitch(d)).toBe('p04')
  })

  it('13 stones → up to p15; 14 stones → the whole mountain', () => {
    const d = fresh()
    withStones(d, 13)
    expect(nextLockedPitch(d)).toBe('p16')
    expect(isPitchOpen(d, 'p15')).toBe(true)
    withStones(d, 1, at(2026, 11, 1))
    expect(isPitchOpen(d, 'p16')).toBe(true)
    expect(openPitches(d)).toEqual(PITCH_IDS)
    expect(nextLockedPitch(d)).toBeNull()
  })

  it('counts letter stones, but not waiting stones or plans', () => {
    const d = fresh()
    sendLetter(d, DAY1)
    expect(isPitchOpen(d, 'p03')).toBe(true)
    for (let i = 0; i < 4; i++) doBrave(d, at(2026, 10, 3, 12, i)) // 3 placed, 1 waiting
    addBraveThing(d, { text: 'A plan', forecast: 5 }, DAY1)
    expect(openPitches(d)).toHaveLength(6) // 4 stones → p01…p06
  })

  it('test mode opens everything, day and night', () => {
    const d = fresh()
    d.testMode = true
    expect(openPitches(d)).toEqual(PITCH_IDS)
    expect(nextLockedPitch(d)).toBeNull()
    expect(isNightOpen(d)).toBe(true)
    expect(isPitchOpen(d, 'p16', true)).toBe(true)
    expect(stonesToOpen(d, 'p16')).toBe(0)
  })

  it('the goat stays in the pack until it climbs out at Sky Lake (the finale seen)', () => {
    const d = fresh()
    expect(isGoatOut(d)).toBe(false)
    d.summit.reached = true
    expect(isNightOpen(d)).toBe(true)
    expect(isGoatOut(d)).toBe(false)
    d.summit.finaleSeen = true
    expect(isGoatOut(d)).toBe(true)
    const t = fresh()
    t.testMode = true
    expect(isGoatOut(t)).toBe(true)
  })

  it('night opens every pitch after the summit, and none before', () => {
    const d = fresh()
    expect(isNightOpen(d)).toBe(false)
    expect(isPitchOpen(d, 'p01', true)).toBe(false)
    d.summit.reached = true
    expect(isNightOpen(d)).toBe(true)
    for (const id of PITCH_IDS) expect(isPitchOpen(d, id, true)).toBe(true)
    expect(isPitchOpen(d, 'p16')).toBe(false)
  })
})
