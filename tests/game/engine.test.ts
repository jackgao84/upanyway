/**
 * The engine and the validator must agree: replaying each level's saved solutions through a
 * ClimbSession (the real game state machine) sends the pitch with zero whippers.
 */
import { describe, expect, test } from 'vitest'
import { ClimbSession } from '../../src/game/engine'
import { ALL_LEVELS, getLevel } from '../../src/game/levels'
import { solutionsFor } from '../../src/game/levels/solutions'
import { TUNING } from '../../src/game/tuning'
import type { Level } from '../../src/game/types'

function session(level: Level, startId?: string) {
  const s = new ClimbSession({ level, startId, choosePose: () => 'starfish' })
  const log: string[] = []
  s.events.on('whipper', (e) => log.push(`whipper:${e.kind}:${e.spotId}`))
  s.events.on('land', (e) => log.push(`land:${e.id}`))
  s.events.on('send', () => log.push('send'))
  s.events.on('ropeCatch', () => log.push('rope'))
  s.events.on('hop', (e) => log.push(`hop:${e.id}`))
  return { s, log }
}

function runUntilReady(s: ClimbSession, maxSeconds = 8): number {
  let steps = 0
  do {
    s.fixedStep()
    steps++
  } while (s.phase !== 'ready' && s.phase !== 'sent' && steps * TUNING.dt < maxSeconds)
  return steps * TUNING.dt
}

describe('saved solutions replay through the engine', () => {
  for (const level of ALL_LEVELS) {
    test(`${level.id} sends with no whippers`, () => {
      const sol = solutionsFor(level.id)!
      const { s, log } = session(level)
      for (const step of sol.steps) {
        expect(s.elementId).toBe(step.from)
        // Wait for the solution's launch time on wind levels (crumble steps never need wind — the
        // validator checks that — and waiting there would let the ledge crumble).
        const period = level.wind?.[0]?.period
        const fromEl = level.elements.find((e) => e.id === step.from)
        const onCrumble = fromEl?.kind === 'ledge' && fromEl.crumble
        if (period && !onCrumble) while (Math.abs(((s.t - step.launchTime) % period + period) % period) > 1e-6 && ((s.t - step.launchTime) % period + period) % period < period - 1e-6) s.fixedStep()
        expect(s.launch(step.angle, step.power)).toBe(true)
        runUntilReady(s)
        expect(s.elementId, `after ${step.from}→${step.to}: ${log.join(' ')}`).toBe(step.to)
      }
      expect(s.phase).toBe('sent')
      expect(log.filter((l) => l.startsWith('whipper'))).toEqual([])
    })
  }
})

describe('the rope', () => {
  test('a missed leap is caught and she is in play again in under a second', () => {
    const level = getLevel('p01')!
    const { s, log } = session(level)
    s.launch(180, 0.3) // off the left of the start camp: nothing to land on
    s.fixedStep()
    expect(s.phase).toBe('flying')
    while (s.phase === 'flying') s.fixedStep()
    expect(s.phase).toBe('roped')
    const back = runUntilReady(s)
    expect(back).toBeLessThan(1)
    expect(s.elementId).toBe('c0')
    expect(log).toContain('whipper:rope:c0')
    expect(s.chalk).toHaveLength(1)
  })

  test('hopping straight up and back down is neutral (no whipper, no land)', () => {
    const level = getLevel('p01')!
    const { s, log } = session(level)
    s.launch(90, 0.3)
    runUntilReady(s)
    expect(log).toEqual(['hop:c0'])
    expect(s.elementId).toBe('c0')
  })

  test('falls are deterministic: same input, same result', () => {
    const level = getLevel('p02')!
    const a = session(level)
    const b = session(level)
    for (const x of [a, b]) {
      x.s.launch(63, 0.71)
      runUntilReady(x.s)
    }
    expect(a.log).toEqual(b.log)
    expect(a.s.body).toEqual(b.s.body)
  })
})
