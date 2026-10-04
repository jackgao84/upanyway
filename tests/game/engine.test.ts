/**
 * The engine and the validator must agree: replaying each level's saved solutions through a
 * ClimbSession (the real game state machine) sends the pitch with zero whippers.
 */
import { describe, expect, test } from 'vitest'
import { ClimbSession } from '../../src/game/engine'
import { ALL_LEVELS, getLevel } from '../../src/game/levels'
import { solutionsFor } from '../../src/game/levels/solutions'
import { simulateLeap } from '../../src/game/physics'
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
    s.launch(20, 0.5) // far too flat, under everything: nothing to land on
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

  test('a flat leap slides off the edge of the take-off ledge instead of re-landing on it', () => {
    for (const [angle, power] of [[0, 0.45], [-10, 0.8], [180, 0.45]] as const) {
      const { s, log } = session(getLevel('p01')!, 'a1')
      s.launch(angle, power)
      runUntilReady(s)
      expect(log.some((l) => l.startsWith('whipper')), `${angle},${power}: ${log.join(' ')}`).toBe(true)
      expect(log).not.toContain('hop:a1')
    }
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

describe('a leap the take-off ledge swallows is a neutral hop', () => {
  // A "swipe up" launches straight down into her own ledge; a flat leap into a pitch wall from a
  // ledge that reaches it gets stopped by the wall. Neither may freeze her and end as a whipper.
  const hw = TUNING.bodyHalfWidth
  const reach = TUNING.landTolerance + hw
  for (const level of ALL_LEVELS) {
    test(`${level.id}: straight down, near-vertical and into the wall from every ledge`, () => {
      for (const el of level.elements) {
        if (el.kind !== 'ledge') continue
        const tries: [number, number][] = [
          [-90, 0.5],
          [-80, 0.3],
          [-100, 0.3],
        ]
        if (el.x - reach <= hw) tries.push([180, 0.3], [190, 0.3], [185, 0.6])
        if (el.x + el.w + reach >= 400 - hw) tries.push([0, 0.3], [-10, 0.3], [-5, 0.6])
        for (const [angle, power] of tries) {
          const { s, log } = session(level, el.id)
          expect(s.launch(angle, power)).toBe(true)
          const took = runUntilReady(s, 3)
          const what = `${level.id} ${el.id} ${angle}°/${power}: ${log.join(' ')}`
          // Never a freeze: every leap resolves quickly (a whipper includes the fall, rope/flop and settle).
          const fell = log.some((l) => l.startsWith('whipper'))
          expect(took, what).toBeLessThan(angle < -45 ? 0.6 : fell ? 3 : 1.2)
          if (angle < -45) {
            // Straight down into her own ledge: always a neutral hop.
            expect(log.filter((l) => l.startsWith('whipper') || l === 'rope'), what).toEqual([])
            expect(s.elementId, what).toBe(el.id)
          } else if (s.elementId === el.id) {
            // Stopped by the wall without leaving her ledge: neutral, not a whipper.
            expect(log.filter((l) => l.startsWith('whipper')), what).toEqual([])
          } else {
            // Slid off through the gap to the wall (wider than she is): an honest whipper.
            expect(log.some((l) => l.startsWith('whipper')), what).toBe(true)
          }
        }
      }
    })
  }
})

describe('where she is heading', () => {
  test('after a fall back to a camp she has climbed past, the target is the next step from that camp', () => {
    const level = getLevel('p01')!
    const sol = solutionsFor('p01')!
    const campIdx = level.route.indexOf('c1')
    const upPast = (): ReturnType<typeof session> => {
      const x = session(level)
      // Up to two steps past c1.
      for (const step of sol.steps.slice(0, campIdx + 2)) {
        x.s.launch(step.angle, step.power)
        runUntilReady(x.s)
      }
      return x
    }
    // A leap from up there that ends back on c1 (a slip onto it, or the rope).
    let fall: [number, number] | null = null
    for (let angle = -20; angle <= 200 && !fall; angle += 4) {
      for (let power = 0.3; power <= 1 && !fall; power += 0.1) {
        const x = upPast()
        x.s.launch(angle, power)
        runUntilReady(x.s)
        if (x.s.elementId === 'c1' && x.log.some((l) => l.startsWith('whipper'))) fall = [angle, power]
      }
    }
    expect(fall, 'a fall from two steps past c1 back onto c1').not.toBeNull()
    const { s } = upPast()
    expect(s.elementId).toBe(level.route[campIdx + 2])
    expect(s.nextTargetId()).toBe(level.route[campIdx + 3])
    s.launch(fall![0], fall![1])
    runUntilReady(s)
    expect(s.elementId).toBe('c1')
    expect(s.highestRouteIndex).toBe(campIdx + 2)
    expect(s.nextTargetId()).toBe(level.route[campIdx + 1])
  })

  test('a Big Leap only counts as landed on its own far side', () => {
    const level = getLevel('p02')!
    const big = level.bigLeaps![0]
    const solBig = solutionsFor('p02')!.steps.find((st) => st.from === big.from)!
    const landed: { id: string; bigLeap: boolean }[] = []
    const a = session(level, big.from)
    a.s.events.on('land', (e) => landed.push({ id: e.id, bigLeap: e.bigLeap }))
    a.s.launch(solBig.angle, solBig.power)
    runUntilReady(a.s)
    expect(landed).toEqual([{ id: big.to, bigLeap: true }])
    // Any other landing from the Big Leap's start (straight up onto a ledge above) is not "the Big Leap".
    for (let angle = 80; angle <= 100; angle += 1) {
      for (let power = 0.5; power <= 0.95; power += 0.05) {
        const b = session(level, big.from)
        const seen: { id: string; bigLeap: boolean }[] = []
        b.s.events.on('land', (e) => seen.push({ id: e.id, bigLeap: e.bigLeap }))
        b.s.launch(angle, power)
        runUntilReady(b.s)
        for (const l of seen) expect(l.bigLeap, `${angle}°/${power.toFixed(2)} → ${l.id}`).toBe(l.id === big.to)
      }
    }
  })
})

describe('crumbly ledges', () => {
  test('a crumbly ledge that gives way while she lies there after a slip drops her (she never stands on thin air)', () => {
    const level = getLevel('p07')!
    // Find a leap from a4 that slips back down onto the crumbly a3.
    let slip: [number, number] | null = null
    for (let angle = -20; angle <= 200 && !slip; angle += 2) {
      for (let power = 0.24; power <= 0.9 && !slip; power += 0.02) {
        const probe = session(level, 'a4')
        let landedOn: string | null = null
        probe.s.events.on('whipper', (e) => {
          if (e.kind === 'slip') landedOn = e.landedId
        })
        probe.s.launch(angle, power)
        runUntilReady(probe.s, 3)
        if (landedOn === 'a3') slip = [angle, power]
      }
    }
    expect(slip, 'a slip from a4 onto a3').not.toBeNull()
    const { s, log } = session(level, 'a4')
    s.launch(slip![0], slip![1])
    while (s.phase !== 'flopped') s.fixedStep()
    expect(s.elementId).toBe('a3')
    // Its timer (still running from an earlier landing) runs out during the flop.
    s.crumbleTimers.set('a3', TUNING.crumbleDelay - 0.05)
    for (let i = 0; i < 20; i++) s.fixedStep()
    expect(s.crumbled.has('a3')).toBe(true)
    expect(s.phase).toBe('flying')
    runUntilReady(s)
    expect(log).toContain('whipper:crumble:a3')
    expect(s.elementId).not.toBe('a3')
  })
})

describe('chalk', () => {
  test('a leap that comes back down on its own take-off ledge leaves chalk, but is no whipper', () => {
    const level = getLevel('p01')!
    // A short hop up and down on the wide start camp.
    const { s, log } = session(level, 'c0')
    expect(s.launch(80, 0.3)).toBe(true)
    runUntilReady(s, 3)
    expect(log).toContain('hop:c0')
    expect(log.some((l) => l.startsWith('whipper'))).toBe(false)
    expect(s.chalk).toHaveLength(1)
    expect(s.chalk[0].hop).toBe(true)
    // The arc goes up and comes back down where she stands: the chalk shows how short it was.
    const arc = s.chalk[0].arc
    let apex = -Infinity
    for (let i = 1; i < arc.length; i += 2) apex = Math.max(apex, arc[i])
    expect(apex).toBeGreaterThan(arc[1] + 20)
  })

  test('a leap pinned on its own ledge without moving leaves no chalk', () => {
    const level = getLevel('p01')!
    const { s, log } = session(level, 'c0')
    expect(s.launch(-90, 0.5)).toBe(true)
    runUntilReady(s, 1)
    expect(log).toContain('hop:c0')
    expect(s.chalk).toHaveLength(0)
  })
})

describe('crumbly ledges give her the same time to aim after a slip', () => {
  test('the timer starts once the flop is over, not while she lies there', () => {
    const level = getLevel('p07')!
    let slip: [number, number] | null = null
    for (let angle = -20; angle <= 200 && !slip; angle += 2) {
      for (let power = 0.24; power <= 0.9 && !slip; power += 0.02) {
        const probe = session(level, 'a4')
        let landedOn: string | null = null
        probe.s.events.on('whipper', (e) => {
          if (e.kind === 'slip') landedOn = e.landedId
        })
        probe.s.launch(angle, power)
        runUntilReady(probe.s, 3)
        if (landedOn === 'a3') slip = [angle, power]
      }
    }
    expect(slip, 'a slip from a4 onto a3').not.toBeNull()
    const { s } = session(level, 'a4')
    s.launch(slip![0], slip![1])
    while (s.phase !== 'flopped') s.fixedStep()
    expect(s.crumbleTimers.has('a3')).toBe(false)
    let flop = 0
    while (s.phase === 'flopped') {
      s.fixedStep()
      flop += TUNING.dt
    }
    expect(flop).toBeCloseTo(TUNING.flopTime, 1)
    expect(s.crumbleTimers.has('a3')).toBe(true)
    // Settling takes at most settleMax; she then still has the validator's aim allowance.
    let settle = 0
    while (s.phase !== 'ready') {
      s.fixedStep()
      settle += TUNING.dt
    }
    expect(settle).toBeLessThanOrEqual(TUNING.settleMax + TUNING.dt)
    expect(TUNING.crumbleDelay - (s.crumbleTimers.get('a3') ?? 0)).toBeGreaterThan(1.2)
  })
})

describe('the engine and simulateLeap step the very same flight (wind pitches)', () => {
  test('p10: launches either side of a gust edge match step for step', () => {
    const level = getLevel('p10')!
    const sol = solutionsFor('p10')!.steps.find((st) => st.from === 'c1')!
    const zone = level.wind![0]
    const gustEnd = 2 * zone.period + zone.offset + zone.gust
    let straddled = 0
    for (const before of [0, 1, 7, 30, 61, 100, 140]) {
      const { s } = session(level, 'c1')
      // Run the pitch clock to `before` steps ahead of a gust's end, then leap.
      const target = Math.round(gustEnd / TUNING.dt) - before
      while (Math.round(s.t / TUNING.dt) < target) s.fixedStep()
      const t0 = s.t
      expect(t0).toBe(target * TUNING.dt)
      expect(s.launch(sol.angle, sol.power)).toBe(true)
      const sim = simulateLeap(level, { fromId: 'c1', t0 }, sol.angle, sol.power, {
        world: s.world,
        ropeLineY: s.ropeLineY(),
        record: true,
        sampleEvery: 1,
      })
      const steps = sim.path.length / 2 - 1
      let i = 0
      for (;;) {
        s.fixedStep()
        i++
        if (s.phase !== 'flying') break
        expect([s.body.x, s.body.y], `step ${i} (launched ${before} steps before the gust ends)`).toEqual([sim.path[2 * i], sim.path[2 * i + 1]])
      }
      expect(i, 'same number of steps in the air').toBe(steps)
      if (before > 0 && steps > before) straddled++
    }
    expect(straddled, 'some leaps were in the air when the gust ended').toBeGreaterThan(2)
  })
})
