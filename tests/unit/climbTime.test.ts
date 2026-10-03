import { describe, expect, it } from 'vitest'
import { addClimbSeconds, climbSecondsToday, dailyLimitSeconds, isSunset, sunProgress } from '../../src/model/climbTime'
import { at, fresh } from './fixtures'

const MORNING = at(2026, 10, 3, 9)
const EVENING = at(2026, 10, 3, 19)
const NEXT_DAY = at(2026, 10, 4, 7)

describe('daily climb time', () => {
  it('defaults to 20 minutes and the sun sets when they are used up', () => {
    const d = fresh()
    expect(dailyLimitSeconds(d)).toBe(1200)
    addClimbSeconds(d, 600, MORNING)
    expect(climbSecondsToday(d, MORNING)).toBe(600)
    expect(sunProgress(d, MORNING)).toBe(0.5)
    expect(isSunset(d, MORNING)).toBe(false)
    addClimbSeconds(d, 599.9, EVENING)
    expect(isSunset(d, EVENING)).toBe(false)
    addClimbSeconds(d, 0.1, EVENING)
    expect(isSunset(d, EVENING)).toBe(true)
    expect(sunProgress(d, EVENING)).toBe(1)
    addClimbSeconds(d, 300, EVENING)
    expect(sunProgress(d, EVENING)).toBe(1)
  })

  it('starts again from zero on a new local day', () => {
    const d = fresh()
    addClimbSeconds(d, 1500, MORNING)
    expect(isSunset(d, MORNING)).toBe(true)
    expect(climbSecondsToday(d, NEXT_DAY)).toBe(0)
    expect(isSunset(d, NEXT_DAY)).toBe(false)
    expect(sunProgress(d, NEXT_DAY)).toBe(0)
    addClimbSeconds(d, 30, NEXT_DAY)
    expect(d.climbTime).toEqual({ day: '2026-10-04', seconds: 30 })
    expect(climbSecondsToday(d, at(2026, 10, 4, 23, 59))).toBe(30)
    expect(climbSecondsToday(d, at(2026, 10, 5, 0, 0))).toBe(0)
  })

  it('0 minutes means no limit', () => {
    const d = fresh()
    d.parent.dailyClimbMinutes = 0
    expect(dailyLimitSeconds(d)).toBe(Infinity)
    addClimbSeconds(d, 100_000, MORNING)
    expect(isSunset(d, MORNING)).toBe(false)
    expect(sunProgress(d, MORNING)).toBe(0)
  })

  it('follows the parent setting', () => {
    const d = fresh()
    d.parent.dailyClimbMinutes = 30
    addClimbSeconds(d, 1500, MORNING)
    expect(isSunset(d, MORNING)).toBe(false)
    d.parent.dailyClimbMinutes = 25
    expect(isSunset(d, MORNING)).toBe(true)
  })

  it('test mode has no cap and records nothing', () => {
    const d = fresh()
    addClimbSeconds(d, 1300, MORNING)
    d.testMode = true
    expect(isSunset(d, MORNING)).toBe(false)
    expect(sunProgress(d, MORNING)).toBe(0)
    addClimbSeconds(d, 500, MORNING)
    expect(d.climbTime.seconds).toBe(1300)
  })

  it('ignores negative, zero and broken amounts', () => {
    const d = fresh()
    for (const s of [-5, 0, NaN, Infinity]) addClimbSeconds(d, s, MORNING)
    expect(d.climbTime).toEqual({ day: '', seconds: 0 })
  })
})
