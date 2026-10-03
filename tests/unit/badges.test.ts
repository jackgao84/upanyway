import { describe, expect, it } from 'vitest'
import { BADGES, badgeById } from '../../src/content/badges'
import { recordBetaAsked, recordBigLeapTried, recordSend, recordWhipper, startRun } from '../../src/model/attempts'
import { earnedBadges, evaluateBadges, stormierForecasts } from '../../src/model/badges'
import { addBraveThing, completeBraveThing, makeSmallerPlan, markNotToday } from '../../src/model/stones'
import type { SaveData } from '../../src/storage/schema'
import { DAY1, at, doBrave, fresh } from './fixtures'
import { bannedIn, wordCount } from './voice'

function whippers(d: SaveData, n: number): void {
  for (let i = 0; i < n; i++) recordWhipper(d, 'p01', false, { spotId: 'c0', arc: [0, 0, 1, -1], kind: 'rope' })
}

describe('badge content', () => {
  it('is exactly the ten badges from the plan', () => {
    expect(BADGES.map((b) => b.id)).toEqual([
      'first-whipper',
      'attempts-10',
      'attempts-50',
      'attempts-100',
      'big-leap',
      'oops',
      'still-here',
      'smaller-step',
      'beta',
      'stormy-5',
    ])
    expect(BADGES.map((b) => b.name)).toEqual([
      'First Whipper',
      '10 Attempts',
      '50 Attempts',
      '100 Attempts',
      'First Big Leap Tried',
      'First Oops Mission',
      'Flopped — and Still Here',
      'A Smaller Step',
      'Asked for Beta',
      'Stormy Forecasts ×5',
    ])
    expect(badgeById('beta')?.icon).toBe('beta')
    expect(badgeById('nope')).toBeUndefined()
  })

  it('descriptions are short and kind', () => {
    for (const b of BADGES) {
      expect(wordCount(b.description), b.id).toBeLessThanOrEqual(14)
      const text = `${b.name} ${b.description}`.toLowerCase().replace(/[’‘]/g, "'")
      expect(bannedIn(text), b.id).toEqual([])
      expect(text).not.toMatch(/fast|quick|streak|perfect|flawless|without falling/)
      expect(['whipper', 'attempts', 'bigleap', 'oops', 'stillhere', 'smaller', 'beta', 'stormy']).toContain(b.icon)
    }
  })
})

describe('badge triggers', () => {
  it('first whipper (the lesson counts)', () => {
    const d = fresh()
    expect(evaluateBadges(d, DAY1)).toEqual([])
    startRun(d, 'lesson', 'start', false, DAY1)
    recordWhipper(d, 'lesson', false, { spotId: 'start', arc: [], kind: 'rope' })
    expect(evaluateBadges(d, DAY1)).toEqual(['first-whipper'])
    expect(d.badges['first-whipper']).toBe(DAY1.toISOString())
    expect(evaluateBadges(d, at(2026, 10, 4))).toEqual([])
  })

  it('10 / 50 / 100 attempts count whippers and sends', () => {
    const d = fresh()
    whippers(d, 8)
    recordSend(d, 'p01', false, DAY1)
    expect(evaluateBadges(d, DAY1)).toEqual(['first-whipper'])
    recordSend(d, 'p01', false, DAY1)
    expect(evaluateBadges(d, DAY1)).toEqual(['attempts-10'])
    whippers(d, 39)
    expect(evaluateBadges(d, DAY1)).toEqual([])
    whippers(d, 1)
    expect(evaluateBadges(d, DAY1)).toEqual(['attempts-50'])
    whippers(d, 50)
    expect(evaluateBadges(d, DAY1)).toEqual(['attempts-100'])
  })

  it('earns several at once, in list order', () => {
    const d = fresh()
    whippers(d, 100)
    recordBetaAsked(d)
    expect(evaluateBadges(d, DAY1)).toEqual(['first-whipper', 'attempts-10', 'attempts-50', 'attempts-100', 'beta'])
  })

  it('first Big Leap tried', () => {
    const d = fresh()
    recordBigLeapTried(d)
    expect(evaluateBadges(d, DAY1)).toEqual(['big-leap'])
  })

  it('first Oops Mission — only once it is done', () => {
    const d = fresh()
    const plan = addBraveThing(d, { text: 'Odd socks for a day', forecast: 4, oops: true }, DAY1)
    expect(evaluateBadges(d, DAY1)).toEqual([])
    completeBraveThing(d, plan.id, { really: 1, whatHappened: 'Nobody noticed', outcome: 'nailed' }, DAY1)
    expect(evaluateBadges(d, DAY1)).toEqual(['oops'])
  })

  it('Flopped — and still here', () => {
    const d = fresh()
    doBrave(d, DAY1, { outcome: 'wobbly' })
    expect(evaluateBadges(d, DAY1)).toEqual([])
    doBrave(d, DAY1, { outcome: 'flopped' })
    expect(evaluateBadges(d, DAY1)).toEqual(['still-here'])
  })

  it('a smaller step only counts after a Not today', () => {
    const d = fresh()
    const a = addBraveThing(d, { text: 'Sing in assembly', forecast: 9 }, DAY1)
    makeSmallerPlan(d, a.id, { text: 'Sing to my family', forecast: 5 }, DAY1)
    expect(evaluateBadges(d, DAY1)).toEqual([])
    const b = addBraveThing(d, { text: 'Jump in the deep end', forecast: 9 }, DAY1)
    markNotToday(d, b.id)
    expect(evaluateBadges(d, DAY1)).toEqual([])
    makeSmallerPlan(d, b.id, { text: 'Jump in with a friend', forecast: 6 }, DAY1)
    expect(evaluateBadges(d, DAY1)).toEqual(['smaller-step'])
  })

  it('asked for beta', () => {
    const d = fresh()
    recordBetaAsked(d)
    expect(evaluateBadges(d, DAY1)).toEqual(['beta'])
  })

  it('5 forecasts stormier than the real weather', () => {
    const d = fresh()
    for (let i = 0; i < 4; i++) doBrave(d, at(2026, 10, 3 + i), { forecast: 7, really: 2 })
    doBrave(d, at(2026, 10, 8), { forecast: 3, really: 3 }) // same, not stormier
    doBrave(d, at(2026, 10, 8), { forecast: 2, really: 6 }) // calmer than it was
    addBraveThing(d, { text: 'A plan', forecast: 10 }, DAY1) // not done
    expect(stormierForecasts(d)).toBe(4)
    expect(evaluateBadges(d, DAY1)).toEqual([])
    doBrave(d, at(2026, 10, 9), { forecast: 1, really: 0 })
    expect(evaluateBadges(d, DAY1)).toEqual(['stormy-5'])
  })

  it('test mode never earns badges', () => {
    const d = fresh()
    d.stats.whippers = 100
    d.testMode = true
    expect(evaluateBadges(d, DAY1)).toEqual([])
    expect(d.badges).toEqual({})
  })

  it('earnedBadges lists what she has, in order, with the time', () => {
    const d = fresh()
    recordBetaAsked(d)
    evaluateBadges(d, DAY1)
    recordBigLeapTried(d)
    evaluateBadges(d, at(2026, 10, 4))
    expect(earnedBadges(d).map((b) => [b.id, b.earnedAt])).toEqual([
      ['big-leap', at(2026, 10, 4).toISOString()],
      ['beta', DAY1.toISOString()],
    ])
  })
})
