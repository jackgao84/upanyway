import { describe, expect, it } from 'vitest'
import { PITCH_IDS, type LevelId } from '../../src/game/types'
import { addBraveThing } from '../../src/model/stones'
import {
  isGoatOut,
  isNightOpen,
  isPitchOpen,
  lockReason,
  nextLockedPitch,
  openPitches,
  pitchNumber,
  pitchRequirement,
  stonesToOpen,
  trailReach,
} from '../../src/model/unlocks'
import { defaultPitchProgress, type SaveData } from '../../src/storage/schema'
import { DAY1, at, doBrave, fresh, sendLetter, withStones } from './fixtures'

/** Mark pitches as sent by day (night: by moonlight only). */
function send(d: SaveData, ids: readonly LevelId[], night = false): void {
  for (const id of ids) d.pitches[id] = { ...defaultPitchProgress(), ...(night ? { nightSends: 1 } : { sends: 1 }) }
}

/** Pitches 1…n (1-based) sent by day. */
function sendUpTo(d: SaveData, n: number): void {
  send(d, PITCH_IDS.slice(0, n))
}

describe('pitch unlocks: stones AND the pitch below sent (Decision 5)', () => {
  it('pitch n needs n − 2 stones (pitches 1 and 2 need none)', () => {
    expect(pitchRequirement('lesson')).toBe(0)
    expect(pitchRequirement('p01')).toBe(0)
    expect(pitchRequirement('p02')).toBe(0)
    expect(pitchRequirement('p03')).toBe(1)
    expect(pitchRequirement('p10')).toBe(8)
    expect(pitchRequirement('p16')).toBe(14)
    expect(pitchNumber('p01')).toBe(1)
    expect(pitchNumber('p16')).toBe(16)
    expect(pitchNumber('lesson')).toBe(0)
  })

  it('0 stones, nothing sent: only Pitch 1; Pitch 2 needs Pitch 1 sent', () => {
    const d = fresh()
    expect(openPitches(d)).toEqual(['p01'])
    expect(nextLockedPitch(d)).toBe('p02')
    expect(isPitchOpen(d, 'lesson')).toBe(true)
    expect(lockReason(d, 'lesson')).toBeNull()
    expect(lockReason(d, 'p01')).toBeNull()
    expect(lockReason(d, 'p02')).toEqual({ needStones: 0, needPitch: 'p01' })
    expect(lockReason(d, 'p03')).toEqual({ needStones: 1, needPitch: 'p02' })
    expect(lockReason(d, 'p16')).toEqual({ needStones: 14, needPitch: 'p15' })
    expect(stonesToOpen(d, 'p02')).toBe(0)
    expect(stonesToOpen(d, 'p03')).toBe(1)
    expect(stonesToOpen(d, 'p16')).toBe(14)
  })

  it('sending Pitch 1 opens Pitch 2 with no stones; Pitch 3 then needs a stone and Pitch 2 sent', () => {
    const d = fresh()
    sendUpTo(d, 1)
    expect(openPitches(d)).toEqual(['p01', 'p02'])
    expect(lockReason(d, 'p03')).toEqual({ needStones: 1, needPitch: 'p02' })
  })

  it('stones but no send: the pitch below is what is missing', () => {
    const d = fresh()
    withStones(d, 5)
    expect(openPitches(d)).toEqual(['p01'])
    expect(lockReason(d, 'p02')).toEqual({ needStones: 0, needPitch: 'p01' })
    expect(lockReason(d, 'p03')).toEqual({ needStones: 0, needPitch: 'p02' })
    expect(lockReason(d, 'p07')).toEqual({ needStones: 0, needPitch: 'p06' })
    expect(lockReason(d, 'p08')).toEqual({ needStones: 1, needPitch: 'p07' })
    sendUpTo(d, 2)
    expect(openPitches(d)).toEqual(['p01', 'p02', 'p03'])
    expect(nextLockedPitch(d)).toBe('p04')
    expect(lockReason(d, 'p04')).toEqual({ needStones: 0, needPitch: 'p03' })
  })

  it('a send but no stones: a stone is what is missing', () => {
    const d = fresh()
    sendUpTo(d, 2)
    expect(openPitches(d)).toEqual(['p01', 'p02'])
    expect(lockReason(d, 'p03')).toEqual({ needStones: 1, needPitch: null })
    expect(stonesToOpen(d, 'p03')).toBe(1)
    doBrave(d, DAY1)
    expect(lockReason(d, 'p03')).toBeNull()
    expect(isPitchOpen(d, 'p03')).toBe(true)
    expect(lockReason(d, 'p04')).toEqual({ needStones: 1, needPitch: 'p03' })
  })

  it('both missing, then each in turn', () => {
    const d = fresh()
    sendUpTo(d, 3)
    expect(lockReason(d, 'p05')).toEqual({ needStones: 3, needPitch: 'p04' })
    withStones(d, 3)
    expect(lockReason(d, 'p05')).toEqual({ needStones: 0, needPitch: 'p04' })
    send(d, ['p04'])
    expect(lockReason(d, 'p05')).toBeNull()
    expect(openPitches(d)).toEqual(['p01', 'p02', 'p03', 'p04', 'p05'])
  })

  it('13 stones and Pitches 1–15 sent → up to p15; 14 stones → the whole mountain', () => {
    const d = fresh()
    withStones(d, 13)
    sendUpTo(d, 15)
    expect(nextLockedPitch(d)).toBe('p16')
    expect(lockReason(d, 'p16')).toEqual({ needStones: 1, needPitch: null })
    expect(isPitchOpen(d, 'p15')).toBe(true)
    withStones(d, 1, at(2026, 11, 1))
    expect(isPitchOpen(d, 'p16')).toBe(true)
    expect(openPitches(d)).toEqual(PITCH_IDS)
    expect(nextLockedPitch(d)).toBeNull()
  })

  it('a pitch sent only by moonlight does not count by day', () => {
    const d = fresh()
    send(d, ['p01'], true)
    expect(lockReason(d, 'p02')).toEqual({ needStones: 0, needPitch: 'p01' })
  })

  it('counts letter stones, but not waiting stones or plans', () => {
    const d = fresh()
    sendUpTo(d, 15)
    sendLetter(d, DAY1)
    expect(isPitchOpen(d, 'p03')).toBe(true)
    for (let i = 0; i < 4; i++) doBrave(d, at(2026, 10, 3, 12, i)) // 3 placed, 1 waiting
    addBraveThing(d, { text: 'A plan', forecast: 5 }, DAY1)
    expect(openPitches(d)).toHaveLength(6) // 4 stones → p01…p06
    expect(lockReason(d, 'p07')).toEqual({ needStones: 1, needPitch: null })
  })

  it('test mode opens everything, day and night, with no reason given', () => {
    const d = fresh()
    d.testMode = true
    expect(openPitches(d)).toEqual(PITCH_IDS)
    expect(nextLockedPitch(d)).toBeNull()
    for (const id of PITCH_IDS) expect(lockReason(d, id)).toBeNull()
    expect(isNightOpen(d)).toBe(true)
    expect(isPitchOpen(d, 'p16', true)).toBe(true)
    expect(stonesToOpen(d, 'p16')).toBe(0)
    expect(trailReach(d).open).toBe(16)
  })

  it('isPitchOpen, stonesToOpen, openPitches and nextLockedPitch all agree with lockReason', () => {
    const d = fresh()
    withStones(d, 4)
    send(d, ['p01', 'p02', 'p03', 'p05'])
    for (const id of PITCH_IDS) {
      const r = lockReason(d, id)
      expect(isPitchOpen(d, id), id).toBe(r === null)
      expect(stonesToOpen(d, id), id).toBe(r?.needStones ?? 0)
    }
    expect(openPitches(d)).toEqual(PITCH_IDS.filter((id) => lockReason(d, id) === null))
    expect(nextLockedPitch(d)).toBe('p05')
  })

  it('trail reach: how far the trail is open in a row, and how far the stones alone reach', () => {
    const d = fresh()
    expect(trailReach(d)).toEqual({ open: 1, stones: 2 })
    withStones(d, 3)
    expect(trailReach(d)).toEqual({ open: 1, stones: 5 })
    sendUpTo(d, 2)
    expect(trailReach(d)).toEqual({ open: 3, stones: 5 })
    sendUpTo(d, 6)
    expect(trailReach(d)).toEqual({ open: 5, stones: 5 })
    // With fewer stones on the cairn (it counts up as they land).
    expect(trailReach(d, 1)).toEqual({ open: 3, stones: 3 })
    expect(trailReach(d, 99).stones).toBe(16)
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
