/**
 * The Cairn and the Weather Station: stone looks (from the id only), the stacking layout
 * (deterministic, never moves a stone already there), what the cairn lists, when a waiting stone
 * goes on, the weather station's entries and gentle summary, and the words on both screens.
 */
import { describe, expect, it } from 'vitest'
import { STONE_SIZE, stoneLook } from '../../src/game/art/stones'
import { stoneOrder } from '../../src/model/stones'
import { CAIRN_COPY, STORY_COPY, WEATHER_COPY } from '../../src/screens/cairn/copy'
import { cairnStones, didWait, trailOpenTo, waitingBefore, waitingWhen } from '../../src/screens/cairn/data'
import { hillY, layoutCairn, layoutWaiting, reachFor, type StoneInput } from '../../src/screens/cairn/layout'
import {
  WEATHER_MIN,
  describeWeather,
  weatherEntries,
  weatherGroup,
  weatherSummary,
} from '../../src/screens/cairn/weatherData'
import { DAY1, at, doBrave, fresh, sendLetter } from './fixtures'
import { bannedIn } from './voice'

function ids(n: number, prefix = 'b'): StoneInput[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${prefix}-${(i * 7919 + 13).toString(36)}-${i}`,
    kind: i % 7 === 3 ? 'letter' : 'brave',
  }))
}

describe('stone looks', () => {
  it('come from the id alone, inside one size range for every kind of stone', () => {
    const a = stoneLook('b-abc123')
    const b = stoneLook('b-abc123')
    expect(b).toBe(a)
    for (const s of ids(200)) {
      const look = stoneLook(s.id)
      expect(look.w).toBeGreaterThanOrEqual(STONE_SIZE.minW)
      expect(look.w).toBeLessThanOrEqual(STONE_SIZE.maxW)
      expect(look.h).toBeGreaterThanOrEqual(STONE_SIZE.minH)
      expect(look.h).toBeLessThanOrEqual(STONE_SIZE.maxH)
      expect(look.pts.length).toBeGreaterThanOrEqual(6)
    }
  })

  it('vary from stone to stone', () => {
    const looks = ids(60).map((s) => stoneLook(s.id))
    expect(new Set(looks.map((l) => l.base)).size).toBeGreaterThan(6)
    expect(new Set(looks.map((l) => l.pattern)).size).toBeGreaterThan(3)
    expect(new Set(looks.map((l) => Math.round(l.w))).size).toBeGreaterThan(8)
  })

  it('never depend on the forecast, the real weather or how it went (Decision 23)', () => {
    // Two saves with the same ids but opposite answers give identical stones and spots.
    const calm = fresh()
    const stormy = fresh()
    for (let i = 0; i < 9; i++) {
      const day = new Date(DAY1.getFullYear(), DAY1.getMonth(), DAY1.getDate() + Math.floor(i / 3), 9, i)
      doBrave(calm, day, { forecast: 0, really: 0, outcome: 'nailed' })
      doBrave(stormy, day, { forecast: 10, really: 10, outcome: 'flopped' })
    }
    // Give the second save the first save's ids (ids are random).
    stormy.brave.forEach((b, i) => (b.id = calm.brave[i].id))
    const A = layoutCairn(cairnStones(calm).placed)
    const B = layoutCairn(cairnStones(stormy).placed)
    expect(B).toEqual(A)
    for (const b of calm.brave) expect(stoneLook(b.id)).toBe(stoneLook(b.id))
  })
})

describe('the cairn layout', () => {
  it('is deterministic', () => {
    expect(layoutCairn(ids(40))).toEqual(layoutCairn(ids(40)))
  })

  it('never moves a stone that is already there when another goes on', () => {
    const all = ids(120)
    const full = layoutCairn(all).stones
    for (const k of [1, 2, 3, 5, 8, 17, 40, 77]) {
      const part = layoutCairn(all.slice(0, k)).stones
      expect(part).toEqual(full.slice(0, k))
    }
  })

  it('does not care whether a stone is a letter or a brave thing', () => {
    const asBrave = ids(30).map((s) => ({ ...s, kind: 'brave' as const }))
    const mixed = ids(30)
    const a = layoutCairn(asBrave).stones.map(({ x, y, rot }) => ({ x, y, rot }))
    const b = layoutCairn(mixed).stones.map(({ x, y, rot }) => ({ x, y, rot }))
    expect(b).toEqual(a)
  })

  it('stacks small cairns, then builds a mound that tapers as it grows', () => {
    const one = layoutCairn(ids(1))
    expect(one.stones[0].x).toBeCloseTo(0, -1)
    // A little stack: the third stone sits on the first two.
    const three = layoutCairn(ids(3))
    expect(three.top).toBeGreaterThan(Math.max(...three.stones.map((s) => s.h)) * 1.2)
    for (const n of [17, 60, 200]) {
      const L = layoutCairn(ids(n))
      const top = L.stones.reduce((m, s) => (s.y > m.y ? s : m))
      // The highest stone sits near the middle; the pile is no wider than its reach (plus a tumble).
      expect(Math.abs(top.x)).toBeLessThan(80)
      expect(L.right - L.left).toBeLessThan(2 * (reachFor(10_000) + 70))
      // Every stone rests on the hill or on other stones (nothing hangs in the air or sinks in).
      for (const s of L.stones) expect(s.y - s.h / 2).toBeGreaterThan(hillY(s.x) - s.h * 0.35)
    }
    // Taller with more stones.
    expect(layoutCairn(ids(200)).top).toBeGreaterThan(layoutCairn(ids(60)).top)
  })

  it('keeps stones from piling onto one spot (no stone hidden inside another)', () => {
    const L = layoutCairn(ids(80))
    for (let i = 0; i < L.stones.length; i++) {
      for (let j = i + 1; j < L.stones.length; j++) {
        const a = L.stones[i]
        const b = L.stones[j]
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        expect(d, `${i} and ${j}`).toBeGreaterThan(Math.min(a.h, b.h) * 0.6)
      }
    }
  })

  it('lays waiting stones beside the pile, on the ground', () => {
    const W = layoutWaiting(ids(4, 'w'), 120)
    expect(W).toHaveLength(4)
    for (const s of W) expect(s.x).toBeGreaterThan(90)
    expect(W[0].y).toBeLessThan(W[0].h)
  })

  it('lays out a big cairn quickly', () => {
    const t = performance.now()
    layoutCairn(ids(400))
    expect(performance.now() - t).toBeLessThan(1500)
  })
})

describe('what the cairn shows', () => {
  it('lists placed stones in cairn order and waiting stones oldest first', () => {
    const d = fresh()
    const made = [1, 2, 3, 4, 5].map((k) => doBrave(d, at(2026, 10, 3, 9, k), { text: `Thing ${k}` }))
    const letter = sendLetter(d, at(2026, 10, 3, 18))
    const { placed, waiting } = cairnStones(d)
    expect(placed.map((s) => s.id)).toEqual(stoneOrder(d).map((r) => r.id))
    expect(placed.map((s) => s.kind)).toEqual(['brave', 'brave', 'brave', 'letter'])
    expect(placed[0].label).toContain('Thing 1')
    expect(placed[3].label).toContain('Spotted!')
    expect(waiting.map((s) => s.id)).toEqual([made[3].id, made[4].id])
    expect(waiting[0].label).toContain('Thing 4')
    expect(letter.placed).toBe(true)
  })

  it('knows which stones waited, and where hoppers came from', () => {
    const d = fresh()
    for (let k = 0; k < 5; k++) doBrave(d, at(2026, 10, 3, 9, k))
    const w = cairnStones(d).waiting
    expect(w).toHaveLength(2)
    expect(waitingWhen(d, w[0].id)).toBe('tomorrow')
    expect(waitingWhen(d, w[1].id)).toBe('tomorrow')
    expect(waitingWhen(d, d.brave[0].id)).toBeNull()
    // The next day one more is logged before the cairn is visited: they go on first.
    const r = doBrave(d, at(2026, 10, 4, 9))
    expect(r.waitingPlaced).toEqual(w.map((s) => s.id))
    for (const id of r.waitingPlaced) expect(didWait(d.brave.find((b) => b.id === id)!)).toBe(true)
    expect(didWait(d.brave.find((b) => b.id === r.id)!)).toBe(false)
    const before = waitingBefore(d, r.waitingPlaced, cairnStones(d).waiting)
    expect(before.map((s) => s.id)).toEqual(w.map((s) => s.id))
  })

  it('says "later" for a stone that will not fit tomorrow', () => {
    const d = fresh()
    for (let k = 0; k < 7; k++) doBrave(d, at(2026, 10, 3, 9, k))
    const w = cairnStones(d).waiting
    expect(w).toHaveLength(4)
    expect(w.map((s) => waitingWhen(d, s.id))).toEqual(['tomorrow', 'tomorrow', 'tomorrow', 'later'])
  })

  it('names the furthest pitch the stones have opened', () => {
    expect(trailOpenTo(0)).toBe(2)
    expect(trailOpenTo(1)).toBe(3)
    expect(trailOpenTo(12)).toBe(14)
    expect(trailOpenTo(14)).toBe(16)
    expect(trailOpenTo(99)).toBe(16)
  })
})

describe('the weather station', () => {
  it('uses done brave things only (never Looks Scary), oldest first', () => {
    const d = fresh()
    doBrave(d, at(2026, 10, 3, 12), { text: 'B', forecast: 8, really: 2 })
    doBrave(d, at(2026, 10, 3, 9), { text: 'A', forecast: 6, really: 1 })
    d.brave.push({ ...d.brave[0], id: 'planned', status: 'planned', really: undefined, doneAt: undefined, stoneDay: null })
    d.looksScary.meadow = { forecast: 9, really: 1, at: at(2026, 10, 3).toISOString() }
    const e = weatherEntries(d)
    expect(e.map((x) => x.text)).toEqual(['A', 'B'])
    expect(e[0]).toMatchObject({ forecast: 6, really: 1 })
    expect(WEATHER_MIN).toBe(3)
  })

  it('sums the weather up gently: mostly, a mix, or all sorts — never a score', () => {
    expect(weatherGroup(0)).toBe(0)
    expect(weatherGroup(7)).toBe(2)
    expect(weatherGroup(10)).toBe(3)
    expect(describeWeather([7, 7, 8, 2])).toBe('mostly Rainy')
    expect(describeWeather([1, 0, 2])).toBe('mostly Sunny')
    expect(describeWeather([4, 7, 5, 8, 0])).toBe('a mix of Cloudy and Rainy')
    expect(describeWeather([0, 1, 7, 10])).toBe('mostly Sunny') // half is "mostly"
    expect(describeWeather([0, 1, 7, 8])).toBe('mostly Sunny') // a tie goes to the sunnier
    expect(describeWeather([0, 4, 7, 10])).toBe('all sorts of weather')
    expect(describeWeather([0, 4, 7, 10, 3, 6, 9])).toBe('all sorts of weather')
    const s = weatherSummary([
      { id: '1', text: '', forecast: 7, really: 1, at: '' },
      { id: '2', text: '', forecast: 8, really: 2, at: '' },
      { id: '3', text: '', forecast: 6, really: 0, at: '' },
    ])
    expect(s).toEqual({ forecasts: 'mostly Rainy', really: 'mostly Sunny' })
    for (const v of Object.values(s)) expect(v).not.toMatch(/\d/)
  })
})

describe('the words', () => {
  function strings(obj: Record<string, unknown>): string[] {
    const out: string[] = []
    for (const v of Object.values(obj)) {
      if (typeof v === 'string') out.push(v)
      else if (typeof v === 'function') out.push(String((v as (...a: unknown[]) => unknown)(3, 'Mum', 2, 'Rainy', 1, 'Sunny')))
      else if (v && typeof v === 'object') out.push(...strings(v as Record<string, unknown>))
    }
    return out
  }

  it('keeps the caption exactly as the brief says', () => {
    expect(WEATHER_COPY.caption).toBe('Fear forecasts usually come in stormier than the real weather.')
    expect(WEATHER_COPY.emptyTitle).toBe('Your weather station needs 3 brave things to start forecasting.')
    expect(STORY_COPY.waitingTomorrow).toBe('This stone goes on tomorrow.')
  })

  it('uses no banned phrases, no streaks and no comparisons', () => {
    const all = [...strings(CAIRN_COPY), ...strings(STORY_COPY), ...strings(WEATHER_COPY)]
    expect(all.length).toBeGreaterThan(40)
    for (const s of all) {
      expect(bannedIn(s), s).toEqual([])
      expect(s.toLowerCase(), s).not.toMatch(/streak|in a row|best|worst|more than|less than|score|points|record/)
    }
  })

  it('counts stones in plain words', () => {
    expect(CAIRN_COPY.countLabel(1)).toBe('1 stone in your cairn.')
    expect(CAIRN_COPY.countLabel(12)).toBe('12 stones in your cairn.')
    expect(CAIRN_COPY.trailTo(14)).toBe('The trail is open to Pitch 14.')
    expect(WEATHER_COPY.emptyHave(0)).not.toMatch(/\d/)
    expect(WEATHER_COPY.emptyHave(1)).toContain('1')
    expect(WEATHER_COPY.emptyHave(2)).toContain('2')
  })
})
