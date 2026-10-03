import { describe, expect, it } from 'vitest'
import { dayKey } from '../../src/model/clock'
import {
  BRAVE_STONES_PER_DAY,
  LETTER_STONES_PER_DAY,
  addBraveThing,
  addLetter,
  braveStonesPlacedOn,
  completeBraveThing,
  letterStonesPlacedOn,
  makeSmallerPlan,
  markNotToday,
  openLetter,
  placeWaitingStones,
  stoneOrder,
  totalStones,
  unopenedLetters,
  waitingStones,
} from '../../src/model/stones'
import { DAY1, at, doBrave, fresh, sendLetter } from './fixtures'

const DAY2 = at(2026, 10, 4)
const DAY3 = at(2026, 10, 5)

describe('brave-thing stones', () => {
  it('caps brave-thing stones at 3 a day; the 4th waits', () => {
    expect(BRAVE_STONES_PER_DAY).toBe(3)
    const d = fresh()
    const results = [1, 2, 3, 4].map((i) => doBrave(d, at(2026, 10, 3, 9 + i)))
    expect(results.map((r) => r.placed)).toEqual([true, true, true, false])
    expect(totalStones(d)).toBe(3)
    expect(braveStonesPlacedOn(d, dayKey(DAY1))).toBe(3)
    const fourth = d.brave.find((b) => b.id === results[3].id)
    expect(fourth?.status).toBe('done')
    expect(fourth?.stoneDay).toBeNull()
    expect(waitingStones(d).map((s) => s.id)).toEqual([results[3].id])
    // Still the same day: no room, nothing placed.
    expect(placeWaitingStones(d, at(2026, 10, 3, 23, 59))).toEqual([])
  })

  it('places a waiting stone on the next day', () => {
    const d = fresh()
    const ids = [1, 2, 3, 4].map((i) => doBrave(d, at(2026, 10, 3, 9 + i)).id)
    expect(placeWaitingStones(d, at(2026, 10, 4, 0, 1))).toEqual([ids[3]])
    expect(totalStones(d)).toBe(4)
    expect(braveStonesPlacedOn(d, dayKey(DAY2))).toBe(1)
    expect(waitingStones(d)).toEqual([])
    expect(placeWaitingStones(d, DAY2)).toEqual([])
  })

  it('places waiting stones oldest first, before a new one', () => {
    const d = fresh()
    const ids = [1, 2, 3, 4, 5, 6].map((i) => doBrave(d, at(2026, 10, 3, 8 + i), { text: `t${i}` }).id)
    expect(waitingStones(d).map((s) => s.id)).toEqual(ids.slice(3))
    // Next day she logs something new straight away: the three waiting stones fill the day first.
    const x = doBrave(d, at(2026, 10, 4, 8))
    expect(x.placed).toBe(false)
    expect(x.waitingPlaced).toEqual(ids.slice(3))
    expect(waitingStones(d).map((s) => s.id)).toEqual([x.id])
    expect(placeWaitingStones(d, DAY3)).toEqual([x.id])
    expect(totalStones(d)).toBe(7)
  })

  it('only places as many waiting stones as the day has room for', () => {
    const d = fresh()
    for (let i = 0; i < 8; i++) doBrave(d, at(2026, 10, 3, 8, i))
    expect(totalStones(d)).toBe(3)
    expect(placeWaitingStones(d, DAY2)).toHaveLength(3)
    expect(placeWaitingStones(d, DAY3)).toHaveLength(2)
    expect(totalStones(d)).toBe(8)
  })

  it('never looks at forecast, really or outcome', () => {
    const run = (forecast: number, really: number, outcome: 'nailed' | 'wobbly' | 'flopped') => {
      const d = fresh()
      for (let i = 0; i < 5; i++) doBrave(d, at(2026, 10, 3, 9, i), { forecast: (forecast + i) % 11, really, outcome })
      placeWaitingStones(d, DAY2)
      return d.brave.map((b) => b.stoneDay)
    }
    const calm = run(0, 0, 'nailed')
    expect(run(10, 10, 'flopped')).toEqual(calm)
    expect(run(5, 1, 'wobbly')).toEqual(calm)
    expect(calm.filter(Boolean)).toHaveLength(5)
  })

  it('a planned brave thing has no stone until it is done', () => {
    const d = fresh()
    const b = addBraveThing(d, { text: '  Jump in the deep end ', forecast: 14 }, DAY1)
    expect(b).toMatchObject({ text: 'Jump in the deep end', forecast: 10, status: 'planned', stoneDay: null, notTodayCount: 0 })
    expect(waitingStones(d)).toEqual([])
    expect(placeWaitingStones(d, DAY2)).toEqual([])
    const r = completeBraveThing(d, b.id, { really: 3, whatHappened: ' Splash ', outcome: 'flopped', learned: '  ' }, DAY3)
    expect(r).toEqual({ placed: true, waitingPlaced: [] })
    expect(b).toMatchObject({ status: 'done', really: 3, whatHappened: 'Splash', outcome: 'flopped', stoneDay: dayKey(DAY3) })
    expect(b).not.toHaveProperty('learned')
  })

  it('completing twice or an unknown id changes nothing', () => {
    const d = fresh()
    const { id } = doBrave(d, DAY1)
    const before = JSON.stringify(d)
    expect(completeBraveThing(d, id, { really: 9, whatHappened: 'again', outcome: 'flopped' }, DAY2)).toEqual({
      placed: false,
      waitingPlaced: [],
    })
    expect(completeBraveThing(d, 'nope', { really: 1, whatHappened: 'x', outcome: 'nailed' }, DAY2).placed).toBe(false)
    expect(JSON.stringify(d)).toBe(before)
  })

  it('day boundaries follow the local calendar', () => {
    const d = fresh()
    for (let i = 0; i < 3; i++) doBrave(d, at(2026, 10, 3, 23, 50 + i))
    const late = doBrave(d, at(2026, 10, 3, 23, 59))
    expect(late.placed).toBe(false)
    const early = doBrave(d, at(2026, 10, 4, 0, 1))
    expect(early.waitingPlaced).toEqual([late.id])
    expect(early.placed).toBe(true)
  })

  it('stones work the same in test mode (logging is always real)', () => {
    const d = fresh()
    d.testMode = true
    expect(doBrave(d, DAY1).placed).toBe(true)
    expect(totalStones(d)).toBe(1)
  })
})

describe('letter stones', () => {
  it('one letter stone a day; the second waits for tomorrow', () => {
    expect(LETTER_STONES_PER_DAY).toBe(1)
    const d = fresh()
    const a = sendLetter(d, at(2026, 10, 3, 9))
    const b = sendLetter(d, at(2026, 10, 3, 10))
    expect(a.placed).toBe(true)
    expect(b.placed).toBe(false)
    expect(letterStonesPlacedOn(d, dayKey(DAY1))).toBe(1)
    expect(waitingStones(d).map((s) => s.id)).toEqual([b.id])
    expect(placeWaitingStones(d, DAY2)).toEqual([b.id])
    expect(totalStones(d)).toBe(2)
  })

  it('an unopened letter has no stone; opening twice does nothing more', () => {
    const d = fresh()
    const { id } = sendLetter(d, DAY1, false)
    expect(unopenedLetters(d).map((l) => l.id)).toEqual([id])
    expect(waitingStones(d)).toEqual([])
    expect(openLetter(d, id, DAY2).placed).toBe(true)
    expect(openLetter(d, id, DAY3)).toEqual({ placed: false, waitingPlaced: [] })
    expect(openLetter(d, 'missing', DAY3).placed).toBe(false)
    expect(unopenedLetters(d)).toEqual([])
    expect(totalStones(d)).toBe(1)
  })

  it('the letter cap is separate from the brave-thing cap', () => {
    const d = fresh()
    for (let i = 0; i < 3; i++) doBrave(d, at(2026, 10, 3, 9, i))
    expect(sendLetter(d, at(2026, 10, 3, 12)).placed).toBe(true)
    expect(totalStones(d)).toBe(4)
  })

  it('addLetter trims and starts unopened', () => {
    const d = fresh()
    const l = addLetter(d, ' Dad ', ' Spotted! ', DAY1)
    expect(l).toMatchObject({ from: 'Dad', text: 'Spotted!', stoneDay: null })
    expect(l).not.toHaveProperty('openedAt')
  })
})

describe('stone order', () => {
  it('lists every placed stone by day, then by when it was earned, letters included', () => {
    const d = fresh()
    const b1 = doBrave(d, at(2026, 10, 3, 9)).id
    const l1 = sendLetter(d, at(2026, 10, 3, 10)).id
    const b2 = doBrave(d, at(2026, 10, 3, 11)).id
    const l2 = sendLetter(d, at(2026, 10, 3, 12)).id // waits
    const b3 = doBrave(d, at(2026, 10, 3, 13)).id
    const b4 = doBrave(d, at(2026, 10, 3, 14)).id // waits
    placeWaitingStones(d, at(2026, 10, 4, 8))
    const b5 = doBrave(d, at(2026, 10, 4, 9)).id
    expect(stoneOrder(d).map((s) => s.id)).toEqual([b1, l1, b2, b3, l2, b4, b5])
    expect(stoneOrder(d).map((s) => s.kind)).toEqual(['brave', 'letter', 'brave', 'brave', 'letter', 'brave', 'brave'])
    expect(stoneOrder(d)[4].day).toBe(dayKey(DAY2))
  })

  it('is stable when times are equal', () => {
    const d = fresh()
    const ids = [0, 1, 2].map(() => doBrave(d, DAY1).id)
    expect(stoneOrder(d).map((s) => s.id)).toEqual(ids)
  })
})

describe('plans', () => {
  it('Not today only bumps a hidden counter', () => {
    const d = fresh()
    const b = addBraveThing(d, { text: 'Sing in assembly', forecast: 9 }, DAY1)
    const snapshot = { ...b }
    markNotToday(d, b.id)
    markNotToday(d, b.id)
    expect(b).toEqual({ ...snapshot, notTodayCount: 2 })
    expect(totalStones(d)).toBe(0)
  })

  it('Make it smaller adds a new plan and leaves the original alone', () => {
    const d = fresh()
    const original = addBraveThing(d, { text: 'Jump in the deep end', forecast: 9, oops: false }, DAY1)
    const snapshot = { ...original }
    const smaller = makeSmallerPlan(d, original.id, { text: 'Sit on the edge first', forecast: 4 }, DAY2)
    expect(smaller).toMatchObject({ smallerOf: original.id, status: 'planned', forecast: 4, text: 'Sit on the edge first' })
    expect(smaller?.afterNotToday).toBeUndefined()
    expect(original).toEqual(snapshot)
    expect(d.brave).toHaveLength(2)
    expect(makeSmallerPlan(d, 'missing', { text: 'x', forecast: 1 }, DAY2)).toBeNull()
  })

  it('a plan made smaller after a Not today remembers it (the smaller-step badge)', () => {
    const d = fresh()
    const original = addBraveThing(d, { text: 'Jump in the deep end', forecast: 9 }, DAY1)
    markNotToday(d, original.id)
    expect(makeSmallerPlan(d, original.id, { text: 'Dip my toes in', forecast: 2 }, DAY2)?.afterNotToday).toBe(true)
  })
})
