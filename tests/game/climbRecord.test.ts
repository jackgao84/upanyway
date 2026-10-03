/**
 * The climb screen's record keeping (src/screens/climb/record.ts), driven by a real ClimbSession:
 * attempts, the run and its resume point, poses, badges, the lesson's whipper, climb time — and that
 * test mode leaves her record exactly as it was.
 */
import { describe, expect, test } from 'vitest'
import { ClimbSession } from '../../src/game/engine'
import type { WhipperKind } from '../../src/game/events'
import { getLevel } from '../../src/game/levels'
import { solutionsFor } from '../../src/game/levels/solutions'
import { TUNING } from '../../src/game/tuning'
import type { Level, LevelId } from '../../src/game/types'
import { ClimbRecorder, type SendFacts, type WhipperFacts } from '../../src/screens/climb/record'
import { defaultSave, type SaveData } from '../../src/storage/schema'

const NOW = new Date(2026, 9, 3, 10, 0, 0)

function recorder(d: SaveData, levelId: LevelId, keepsRun = true): ClimbRecorder {
  return new ClimbRecorder({ save: () => d, update: (fn) => fn(d), now: () => NOW }, levelId, false, keepsRun)
}

/** A session wired to the recorder the way the climb screen wires it. */
function climb(level: Level, rec: ClimbRecorder, startId: string) {
  const s = new ClimbSession({ level, startId, choosePose: () => 'starfish' })
  const whippers: (WhipperFacts & { kind: WhipperKind })[] = []
  let sent: SendFacts | null = null
  let fromId: string | null = null
  s.events.on('launch', (e) => {
    fromId = e.fromId
    if (e.bigLeap && e.towardBigLeapTarget) rec.bigLeapTried()
  })
  s.events.on('land', (e) => rec.landing(e, fromId))
  s.events.on('whipper', (e) => whippers.push({ ...rec.whipper(e), kind: e.kind }))
  s.events.on('ropeCatch', () => rec.ropeCatch())
  s.events.on('reveal', (e) => rec.revealHolds(e.ids))
  s.events.on('crumbleFound', (e) => rec.crumbleFound(e.id))
  s.events.on('send', () => {
    sent = rec.send()
  })
  return { s, whippers, sent: () => sent as SendFacts | null }
}

function untilReady(s: ClimbSession): void {
  let n = 0
  do {
    s.fixedStep()
    n++
  } while (s.phase !== 'ready' && s.phase !== 'sent' && n * TUNING.dt < 8)
}

/** Replay the saved route from where she stands until `stopAt` (or the top). */
function replay(s: ClimbSession, levelId: LevelId, stopAt?: string): void {
  const steps = solutionsFor(levelId)!.steps
  while (s.phase === 'ready' && s.elementId !== stopAt) {
    const step = steps.find((x) => x.from === s.elementId)
    if (!step) throw new Error(`no step from ${s.elementId}`)
    s.launch(step.angle, step.power)
    untilReady(s)
  }
}

describe('climb record keeping', () => {
  test('a miss, a camp, a resume, the send: attempts = whippers + 1', () => {
    const level = getLevel('p01')!
    const d = defaultSave(NOW)
    const rec = recorder(d, 'p01')
    const begin = rec.begin(level.route[0])
    expect(begin).toMatchObject({ startId: 'c0', resumed: false, recentChalk: [] })

    const a = climb(level, rec, begin.startId)
    a.s.launch(20, 0.5) // far too flat, under everything: the rope catches her
    untilReady(a.s)
    expect(a.whippers).toHaveLength(1)
    expect(a.whippers[0]).toMatchObject({ kind: 'rope', fallsAtSpot: 1, newPose: true, firstEver: true })
    expect(a.whippers[0].badges).toContain('first-whipper')
    expect(rec.fallsAt('c0')).toBe(1)
    expect(d.stats.whippers).toBe(1)
    expect(d.poses.starfish.count).toBe(1)

    replay(a.s, 'p01', 'c1')
    expect(d.pitches.p01!.run!.lastCampId).toBe('c1')

    // Leaving and coming back: she resumes at c1 with her chalk.
    const rec2 = recorder(d, 'p01')
    const back = rec2.begin(level.route[0])
    expect(back).toMatchObject({ startId: 'c1', resumed: true })
    expect(back.recentChalk).toHaveLength(1)
    const b = climb(level, rec2, back.startId)
    replay(b.s, 'p01')
    expect(b.s.phase).toBe('sent')
    const sent = b.sent()!
    expect(sent.send.attempts).toBe(2)
    expect(sent.firstSend).toBe(true)
    expect(sent.send.failedArcs).toHaveLength(1)
    expect(sent.send.routeArcs).toHaveLength(level.route.length - 1)
    expect(d.stats).toMatchObject({ whippers: 1, sends: 1 })
    expect(d.pitches.p01).toMatchObject({ sends: 1, totalAttempts: 2, run: null })
    expect(d.pitches.p01!.lastSend!.attempts).toBe(2)
  })

  test('leaving from above the last camp: coming back, the bright route starts again at that camp', () => {
    const level = getLevel('p01')!
    const d = defaultSave(NOW)
    const rec = recorder(d, 'p01')
    const a = climb(level, rec, rec.begin(level.route[0]).startId)
    replay(a.s, 'p01', 'b3')
    const run = d.pitches.p01!.run!
    expect(run.lastCampId).toBe('c1')
    expect(run.routePath.slice(-4)).toEqual(['c1', 'b1', 'b2', 'b3'])

    const rec2 = recorder(d, 'p01')
    const back = rec2.begin(level.route[0])
    expect(back).toMatchObject({ startId: 'c1', resumed: true })
    const again = d.pitches.p01!.run!
    expect(again.routePath[again.routePath.length - 1]).toBe('c1')
    expect(again.routeArcs).toHaveLength(again.routePath.length - 1)
    // And the send's bright route is one clean line, one arc per step.
    const b = climb(level, rec2, back.startId)
    replay(b.s, 'p01')
    expect(b.sent()!.send.routeArcs).toHaveLength(level.route.length - 1)
  })

  test('a Big Leap tried counts, landed or not', () => {
    const level = getLevel('p02')!
    const d = defaultSave(NOW)
    const rec = recorder(d, 'p02')
    const big = level.bigLeaps![0]
    const a = climb(level, rec, rec.begin(level.route[0]).startId)
    replay(a.s, 'p02', big.from)
    expect(d.stats.bigLeapsTried).toBe(0)
    a.s.launch(60, 0.3) // toward the far side, far too short
    untilReady(a.s)
    expect(d.stats.bigLeapsTried).toBe(1)
    expect(d.badges['big-leap']).toBeTruthy()
  })

  test('test mode writes nothing to her record', () => {
    const level = getLevel('p01')!
    const d = defaultSave(NOW)
    d.testMode = true
    d.parent.dailyClimbMinutes = 1
    const before = JSON.stringify(d)
    const rec = recorder(d, 'p01')
    const a = climb(level, rec, rec.begin(level.route[0]).startId)
    a.s.launch(20, 0.5)
    untilReady(a.s)
    // The run still works (beta needs it) — in a scratch copy beside the save.
    expect(rec.fallsAt('c0')).toBe(1)
    expect(a.whippers[0]).toMatchObject({ newPose: false, firstEver: false, badges: [] })
    rec.bigLeapTried()
    rec.betaAsked()
    rec.revealHolds(['x'])
    rec.crumbleFound('a1')
    rec.scaryForecast('meadow', 8)
    rec.scaryReally('meadow', 2)
    rec.ropeExplained()
    expect(rec.addTime(3600)).toBe(false)
    replay(a.s, 'p01')
    expect(a.sent()!.send.attempts).toBe(2)
    expect(JSON.stringify(d)).toBe(before)
  })

  test('the lesson whipper counts, with no pitch run', () => {
    const level = getLevel('lesson')!
    const d = defaultSave(NOW)
    const rec = recorder(d, 'lesson', false)
    expect(rec.begin(level.route[0]).startId).toBe('c0')
    const a = climb(level, rec, 'c0')
    a.s.launch(120, 0.5) // up and off the left end of the start ledge
    untilReady(a.s)
    expect(a.whippers).toHaveLength(1)
    expect(a.whippers[0].badges).toEqual(['first-whipper'])
    expect(d.stats.whippers).toBe(1)
    expect(Object.keys(d.poses)).toEqual(['starfish'])
    // No pitch record at all for the lesson (it never shows up as a pitch).
    expect(d.pitches.lesson).toBeUndefined()
    expect(rec.run()).toBeNull()
  })

  test('climb time: the sun sets after the daily minutes', () => {
    const d = defaultSave(NOW)
    d.parent.dailyClimbMinutes = 2
    const rec = recorder(d, 'p01')
    expect(rec.addTime(60)).toBe(false)
    expect(rec.addTime(61)).toBe(true)
    d.parent.dailyClimbMinutes = 0
    expect(rec.addTime(600)).toBe(false)
  })
})
