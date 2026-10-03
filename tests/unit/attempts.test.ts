import { describe, expect, it } from 'vitest'
import {
  SUMMIT_PITCH,
  abandonRun,
  clearTestRuns,
  currentRun,
  downsampleArc,
  markCrumbleFound,
  needsScaryForecast,
  needsScaryReally,
  recordBetaAsked,
  recordBigLeapTried,
  recordLanding,
  recordPose,
  recordRopeCatch,
  recordScaryForecast,
  recordScaryReally,
  recordSend,
  recordWhipper,
  revealHold,
  startRun,
  totalAttempts,
} from '../../src/model/attempts'
import { normalize } from '../../src/storage/migrations'
import { ARC_POINTS, MAX_STORED_ARCS, type SaveData } from '../../src/storage/schema'
import type { LevelId } from '../../src/game/types'
import { DAY1, at, fresh } from './fixtures'

/** A tiny pitch: route c0 (camp) → a → c1 (camp) → b → top (camp). */
const ROUTE = ['c0', 'a', 'c1', 'b', 'top']
const CAMPS = new Set(['c0', 'c1', 'top'])
const arcTo = (id: string): number[] => [0, 0, 10, 20, id.length * 7, 30]

function land(d: SaveData, id: string, level: LevelId = 'p01', night = false) {
  const i = ROUTE.indexOf(id)
  return recordLanding(d, level, night, { elementId: id, routeIndex: i < 0 ? null : i, isCamp: CAMPS.has(id), arc: arcTo(id) })
}

function whip(d: SaveData, spotId: string, level: LevelId = 'p01', night = false, kind: 'rope' | 'slip' | 'crumble' = 'rope') {
  const r = recordWhipper(d, level, night, { spotId, arc: [0, 0, 50, 60, 100, -40], kind })
  if (kind === 'rope') recordRopeCatch(d, level, night)
  return r
}

describe('attempt counting', () => {
  it('attempts = whippers + the send', () => {
    const d = fresh()
    startRun(d, 'p01', 'c0', false, DAY1)
    expect(whip(d, 'c0')).toEqual({ whippersThisRun: 1, fallsAtSpot: 1 })
    land(d, 'a')
    expect(whip(d, 'a')).toEqual({ whippersThisRun: 2, fallsAtSpot: 1 })
    expect(whip(d, 'c0')).toEqual({ whippersThisRun: 3, fallsAtSpot: 2 })
    for (const id of ['a', 'c1', 'b', 'top']) land(d, id)
    const send = recordSend(d, 'p01', false, at(2026, 10, 3, 11))
    expect(send.attempts).toBe(4)
    expect(send.failedArcs).toHaveLength(3)
    expect(send.routeArcs).toHaveLength(4)
    expect(send.night).toBe(false)
    expect(d.stats).toMatchObject({ whippers: 3, sends: 1 })
    expect(totalAttempts(d)).toBe(4)
    const p = d.pitches.p01
    expect(p).toMatchObject({ sends: 1, nightSends: 0, totalAttempts: 4, run: null, lastSend: send })
    expect(p?.firstSentAt).toBe(at(2026, 10, 3, 11).toISOString())
  })

  it('a clean send is 1 attempt; per-pitch totals keep adding up', () => {
    const d = fresh()
    startRun(d, 'p01', 'c0', false, DAY1)
    whip(d, 'c0')
    for (const id of ROUTE.slice(1)) land(d, id)
    recordSend(d, 'p01', false, DAY1)
    startRun(d, 'p01', 'c0', false, at(2026, 10, 4))
    for (const id of ROUTE.slice(1)) land(d, id)
    const second = recordSend(d, 'p01', false, at(2026, 10, 4))
    expect(second.attempts).toBe(1)
    expect(d.pitches.p01).toMatchObject({ sends: 2, totalAttempts: 3, firstSentAt: DAY1.toISOString() })
    expect(totalAttempts(d)).toBe(3)
  })

  it('slips and crumbles are whippers too', () => {
    const d = fresh()
    startRun(d, 'p05', 'c0', false, DAY1)
    whip(d, 'a', 'p05', false, 'slip')
    whip(d, 'b', 'p05', false, 'crumble')
    expect(d.stats.whippers).toBe(2)
    expect(currentRun(d, 'p05', false)?.whippers).toBe(2)
  })

  it('the lesson whipper counts', () => {
    const d = fresh()
    startRun(d, 'lesson', 'start', false, DAY1)
    whip(d, 'start', 'lesson')
    expect(d.stats.whippers).toBe(1)
  })

  it('a whipper with no run still counts', () => {
    const d = fresh()
    expect(recordWhipper(d, 'p02', false, { spotId: 'x', arc: [], kind: 'rope' })).toEqual({ whippersThisRun: 0, fallsAtSpot: 0 })
    expect(d.stats.whippers).toBe(1)
    expect(d.pitches.p02?.totalAttempts).toBe(1)
  })

  it('caps stored failed arcs but never the count', () => {
    const d = fresh()
    startRun(d, 'p01', 'c0', false, DAY1)
    for (let i = 0; i < MAX_STORED_ARCS + 50; i++) {
      recordWhipper(d, 'p01', false, { spotId: 'c0', arc: [i, 0, i, -100], kind: 'rope' })
    }
    const run = currentRun(d, 'p01', false)
    expect(run?.failedArcs).toHaveLength(MAX_STORED_ARCS)
    expect(run?.failedArcs[0]).toEqual([50, 0, 50, -100])
    expect(run?.whippers).toBe(MAX_STORED_ARCS + 50)
    expect(recordSend(d, 'p01', false, DAY1).attempts).toBe(MAX_STORED_ARCS + 51)
  })
})

describe('runs and the bright route', () => {
  it('startRun resumes the run in progress', () => {
    const d = fresh()
    const run = startRun(d, 'p01', 'c0', false, DAY1)
    expect(run).toMatchObject({ lastCampId: 'c0', lastCampRouteIndex: 0, routePath: ['c0'], routeArcs: [], whippers: 0, night: false })
    land(d, 'a')
    land(d, 'c1')
    const again = startRun(d, 'p01', 'c0', false, at(2026, 10, 4))
    expect(again).toBe(run)
    expect(again.lastCampId).toBe('c1')
    expect(again.startedAt).toBe(DAY1.toISOString())
  })

  it('a rope catch cuts the route back to the last camp, exactly', () => {
    const d = fresh()
    startRun(d, 'p01', 'c0', false, DAY1)
    land(d, 'a')
    expect(land(d, 'c1')).toEqual({ newCamp: true })
    land(d, 'b')
    whip(d, 'b')
    const run = currentRun(d, 'p01', false)
    expect(run?.routePath).toEqual(['c0', 'a', 'c1'])
    expect(run?.routeArcs).toEqual([downsampleArc(arcTo('a')), downsampleArc(arcTo('c1'))])
    expect(run?.highestRouteIndex).toBe(3)
    land(d, 'b')
    land(d, 'top')
    const send = recordSend(d, 'p01', false, DAY1)
    expect(send.routeArcs).toHaveLength(4)
  })

  it('a rope catch before any camp clears the route back to the start', () => {
    const d = fresh()
    startRun(d, 'p01', 'c0', false, DAY1)
    land(d, 'a')
    whip(d, 'a')
    expect(currentRun(d, 'p01', false)?.routePath).toEqual(['c0'])
    expect(currentRun(d, 'p01', false)?.routeArcs).toEqual([])
  })

  it('hops and steps back drop the loop instead of adding arcs', () => {
    const d = fresh()
    startRun(d, 'p01', 'c0', false, DAY1)
    land(d, 'a')
    land(d, 'a') // neutral hop on the same ledge
    expect(currentRun(d, 'p01', false)?.routePath).toEqual(['c0', 'a'])
    land(d, 'side') // off-route ledge
    land(d, 'a') // back again
    expect(currentRun(d, 'p01', false)?.routePath).toEqual(['c0', 'a'])
    land(d, 'c0') // all the way back to the start camp
    expect(currentRun(d, 'p01', false)?.routePath).toEqual(['c0'])
    expect(currentRun(d, 'p01', false)?.routeArcs).toEqual([])
  })

  it('never cuts below the last camp except with the rope', () => {
    const d = fresh()
    startRun(d, 'p01', 'c0', false, DAY1)
    land(d, 'a')
    land(d, 'c1')
    land(d, 'a') // a gentle step down below the camp: kept, so the camp stays on the route
    const run = currentRun(d, 'p01', false)
    expect(run?.routePath).toEqual(['c0', 'a', 'c1', 'a'])
    recordRopeCatch(d, 'p01', false)
    expect(run?.routePath).toEqual(['c0', 'a', 'c1'])
    expect(run?.routeArcs).toHaveLength(2)
  })

  it('a slip back onto the route cuts the route to where she ended up', () => {
    const d = fresh()
    startRun(d, 'p01', 'c0', false, DAY1)
    land(d, 'a')
    land(d, 'c1')
    land(d, 'b')
    recordWhipper(d, 'p01', false, { spotId: 'b', arc: [1, 2, 3, 4], kind: 'slip', restId: 'c1' })
    expect(currentRun(d, 'p01', false)?.routePath).toEqual(['c0', 'a', 'c1'])
  })

  it('only camps further up the route become the last camp', () => {
    const d = fresh()
    startRun(d, 'p01', 'c0', false, DAY1)
    land(d, 'a')
    land(d, 'c1')
    expect(recordLanding(d, 'p01', false, { elementId: 'odd-camp', routeIndex: null, isCamp: true, arc: [0, 0, 1, 1] })).toEqual({
      newCamp: false,
    })
    expect(recordLanding(d, 'p01', false, { elementId: 'c0', routeIndex: 0, isCamp: true, arc: [0, 0, 1, 1] })).toEqual({
      newCamp: false,
    })
    const run = currentRun(d, 'p01', false)
    expect(run?.lastCampId).toBe('c1')
    expect(run?.lastCampRouteIndex).toBe(2)
    expect(run?.highestRouteIndex).toBe(2)
  })

  it('night runs are separate from day runs', () => {
    const d = fresh()
    d.summit.reached = true
    startRun(d, 'p03', 'c0', false, DAY1)
    land(d, 'a', 'p03')
    whip(d, 'a', 'p03')
    const night = startRun(d, 'p03', 'c0', true, DAY1)
    expect(night.night).toBe(true)
    expect(night.whippers).toBe(0)
    for (const id of ROUTE.slice(1)) land(d, id, 'p03', true)
    const send = recordSend(d, 'p03', true, DAY1)
    expect(send).toMatchObject({ attempts: 1, night: true })
    const p = d.pitches.p03
    expect(p).toMatchObject({ sends: 0, nightSends: 1, nightRun: null, totalAttempts: 2 })
    expect(p?.run?.whippers).toBe(1)
    expect(d.stats.sends).toBe(1)
  })

  it('abandonRun starts the next climb from the bottom', () => {
    const d = fresh()
    startRun(d, 'p01', 'c0', false, DAY1)
    land(d, 'a')
    land(d, 'c1')
    abandonRun(d, 'p01', false)
    expect(currentRun(d, 'p01', false)).toBeNull()
    expect(startRun(d, 'p01', 'c0', false, DAY1).lastCampId).toBe('c0')
  })

  it('a run survives a save round trip', () => {
    const d = fresh()
    startRun(d, 'p01', 'c0', false, DAY1)
    land(d, 'a')
    land(d, 'c1')
    whip(d, 'c1')
    land(d, 'b')
    const back = normalize(JSON.parse(JSON.stringify(d)), DAY1)
    expect(back).toStrictEqual(d)
  })
})

describe('summit', () => {
  it('the first day send of the summit pitch reaches the summit', () => {
    expect(SUMMIT_PITCH).toBe('p16')
    const d = fresh()
    startRun(d, 'p16', 'c0', true, DAY1)
    recordSend(d, 'p16', true, DAY1)
    expect(d.summit.reached).toBe(false)
    startRun(d, 'p16', 'c0', false, DAY1)
    recordSend(d, 'p16', false, at(2026, 10, 3, 17))
    expect(d.summit).toEqual({ reached: true, at: at(2026, 10, 3, 17).toISOString(), finaleSeen: false })
    recordSend(d, 'p16', false, at(2026, 10, 9))
    expect(d.summit.at).toBe(at(2026, 10, 3, 17).toISOString())
  })

  it('other pitches never touch the summit', () => {
    const d = fresh()
    recordSend(d, 'p15', false, DAY1)
    expect(d.summit.reached).toBe(false)
  })
})

describe('other climbing records', () => {
  it('poses: new the first time, then counted', () => {
    const d = fresh()
    expect(recordPose(d, 'starfish', DAY1)).toEqual({ isNew: true })
    expect(recordPose(d, 'starfish', at(2026, 10, 4))).toEqual({ isNew: false })
    expect(d.poses.starfish).toEqual({ firstAt: DAY1.toISOString(), count: 2 })
  })

  it('big leaps and beta are counted', () => {
    const d = fresh()
    recordBigLeapTried(d)
    recordBigLeapTried(d)
    recordBetaAsked(d)
    expect(d.stats).toMatchObject({ bigLeapsTried: 2, betaAsked: 1 })
  })

  it('found holds and crumbles stay found, once each', () => {
    const d = fresh()
    revealHold(d, 'p04', 'h1')
    revealHold(d, 'p04', 'h1')
    markCrumbleFound(d, 'p07', 'k1')
    markCrumbleFound(d, 'p07', 'k1')
    expect(d.pitches.p04?.revealedHolds).toEqual(['h1'])
    expect(d.pitches.p07?.foundCrumbles).toEqual(['k1'])
  })
})

describe('Looks Scary', () => {
  it('asks the forecast once per zone, and really until answered', () => {
    const d = fresh()
    expect(needsScaryForecast(d, 'meadow')).toBe(true)
    expect(needsScaryReally(d, 'meadow')).toBe(false)
    recordScaryForecast(d, 'meadow', 7.4, DAY1)
    expect(d.looksScary.meadow).toEqual({ forecast: 7, really: null, at: DAY1.toISOString() })
    expect(needsScaryForecast(d, 'meadow')).toBe(false)
    expect(needsScaryReally(d, 'meadow')).toBe(true)
    recordScaryForecast(d, 'meadow', 2, at(2026, 10, 4))
    expect(d.looksScary.meadow?.forecast).toBe(7)
    recordScaryReally(d, 'meadow', 12)
    expect(d.looksScary.meadow?.really).toBe(10)
    recordScaryReally(d, 'meadow', 1)
    expect(d.looksScary.meadow?.really).toBe(10)
    expect(needsScaryReally(d, 'meadow')).toBe(false)
    recordScaryReally(d, 'hollow', 3)
    expect(d.looksScary.hollow).toBeUndefined()
  })

  it('test mode records nothing', () => {
    const d = fresh()
    d.testMode = true
    recordScaryForecast(d, 'ridge', 5, DAY1)
    expect(d.looksScary).toEqual({})
    expect(needsScaryForecast(d, 'ridge')).toBe(true)
  })
})

describe('test mode', () => {
  it('writes nothing to her record, but runs still work', () => {
    const d = fresh()
    d.stats.whippers = 5
    d.testMode = true
    const before = JSON.stringify(d)

    const run = startRun(d, 'p09', 'c0', false, DAY1)
    land(d, 'a', 'p09')
    expect(whip(d, 'a', 'p09')).toEqual({ whippersThisRun: 1, fallsAtSpot: 1 })
    expect(whip(d, 'a', 'p09')).toEqual({ whippersThisRun: 2, fallsAtSpot: 2 })
    land(d, 'a', 'p09')
    land(d, 'c1', 'p09')
    expect(currentRun(d, 'p09', false)).toBe(run)
    expect(run.routePath).toEqual(['c0', 'a', 'c1'])
    recordPose(d, 'pancake', DAY1)
    recordBigLeapTried(d)
    recordBetaAsked(d)
    revealHold(d, 'p09', 'h')
    markCrumbleFound(d, 'p09', 'k')
    for (const id of ['b', 'top']) land(d, id, 'p09')
    const send = recordSend(d, 'p09', false, DAY1)
    expect(send.attempts).toBe(3)
    expect(send.failedArcs).toHaveLength(2)
    expect(recordSend(d, SUMMIT_PITCH, false, DAY1).attempts).toBe(1)

    expect(JSON.stringify(d)).toBe(before)
    expect(currentRun(d, 'p09', false)).toBeNull()
  })

  it('test runs are kept apart from her real runs', () => {
    const d = fresh()
    startRun(d, 'p01', 'c0', false, DAY1)
    land(d, 'a')
    land(d, 'c1')
    d.testMode = true
    expect(currentRun(d, 'p01', false)).toBeNull()
    expect(startRun(d, 'p01', 'c0', false, DAY1).lastCampId).toBe('c0')
    d.testMode = false
    expect(currentRun(d, 'p01', false)?.lastCampId).toBe('c1')
    d.testMode = true
    clearTestRuns(d)
    expect(currentRun(d, 'p01', false)).toBeNull()
  })
})

describe('downsampleArc', () => {
  it('keeps the ends, rounds to integers and caps the points', () => {
    const pts: number[] = []
    for (let i = 0; i <= 100; i++) pts.push(i * 1.5, Math.sin(i / 10) * 50.4)
    const arc = downsampleArc(pts)
    expect(arc.length).toBe(ARC_POINTS * 2)
    expect(arc.slice(0, 2)).toEqual([0, 0])
    expect(arc.slice(-2)).toEqual([150, Math.round(Math.sin(10) * 50.4)])
    expect(arc.every((n) => Number.isInteger(n))).toBe(true)
    expect(downsampleArc(pts, 4)).toHaveLength(8)
  })

  it('passes short paths through and cleans junk', () => {
    expect(downsampleArc([1.4, 2.6, 3.5, -0.2])).toEqual([1, 3, 4, 0])
    expect(Object.is(downsampleArc([-0.2, -0.4])[0], 0)).toBe(true)
    expect(downsampleArc([1, 2, 3])).toEqual([1, 2])
    expect(downsampleArc([1, 2, NaN, 4, 5, 6])).toEqual([1, 2, 5, 6])
    expect(downsampleArc([])).toEqual([])
  })
})
