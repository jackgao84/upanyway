/**
 * The Trail Map (src/screens/map/*): what each of the 16 pitch markers shows (sent, open, hidden in
 * fog, and how many more stones a hidden one needs), where her marker stands by day and by night,
 * test mode, the map's geometry (every marker has room for a finger), and the words on it.
 */
import { describe, expect, it } from 'vitest'
import { PITCHES } from '../../src/game/levels'
import { defaultPitchProgress } from '../../src/storage/schema'
import { MAP_COPY, ZONE_NAMES, numberWord } from '../../src/screens/map/copy'
import { CAMP_PT, LAKE_PT, markerPoints, markerSide, mountainWidthAt, trailMarkers, zoneBounds } from '../../src/screens/map/trail'
import { at, fresh, withStones } from './fixtures'
import { bannedIn } from './voice'

function strings(value: unknown, path: string, out: [string, string][] = []): [string, string][] {
  if (typeof value === 'string') out.push([path, value])
  else if (typeof value === 'function') {
    const fn = value as (...args: unknown[]) => unknown
    for (const sample of [1, 2, 7, 14]) strings(fn(...Array<unknown>(fn.length).fill(sample)), `${path}(${sample})`, out)
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) strings(v, `${path}.${k}`, out)
  }
  return out
}

describe('trail markers by day', () => {
  it('lists the 16 pitches in mountain order with their names and zones', () => {
    const m = trailMarkers(fresh(), false)
    expect(m.map((x) => x.id)).toEqual(PITCHES.map((p) => p.id))
    expect(m.map((x) => x.n)).toEqual(Array.from({ length: 16 }, (_, i) => i + 1))
    m.forEach((x, i) => {
      expect(x.title).toBe(PITCHES[i].title)
      expect(x.zone).toBe(PITCHES[i].zone)
    })
  })

  it('opens pitches 1–2 for free and hides the rest, each with the stones it still needs', () => {
    const m = trailMarkers(fresh(), false)
    expect(m.slice(0, 2).map((x) => x.state)).toEqual(['open', 'open'])
    expect(m.slice(2).every((x) => x.state === 'hidden')).toBe(true)
    expect(m[2].needs).toBe(1)
    expect(m[15].needs).toBe(14)
    expect(m[0].needs).toBe(0)
    // Her marker: the first pitch she hasn't sent.
    expect(m.filter((x) => x.current).map((x) => x.id)).toEqual(['p01'])
  })

  it('flags sent pitches and opens pitch n at n − 2 stones', () => {
    const d = fresh()
    withStones(d, 5)
    d.pitches.p01 = { ...defaultPitchProgress(), sends: 2 }
    d.pitches.p04 = { ...defaultPitchProgress(), sends: 1 }
    const m = trailMarkers(d, false)
    expect(m[0].state).toBe('sent')
    expect(m[1].state).toBe('open')
    expect(m[3].state).toBe('sent')
    expect(m[6].state).toBe('open')
    expect(m[7].state).toBe('hidden')
    expect(m[7].needs).toBe(1)
    expect(m[8].needs).toBe(2)
    // The lowest open pitch not sent yet: never a jump past p02 to the highest open one.
    expect(m.filter((x) => x.current).map((x) => x.id)).toEqual(['p02'])
  })

  it('stands her marker on the pitch she is partway up, even one she has sent before', () => {
    const d = fresh()
    withStones(d, 4)
    d.pitches.p01 = { ...defaultPitchProgress(), sends: 1 }
    d.pitches.p02 = { ...defaultPitchProgress(), sends: 1 }
    d.pitches.p03 = { ...defaultPitchProgress(), sends: 1 }
    expect(trailMarkers(d, false).filter((x) => x.current).map((x) => x.id)).toEqual(['p04'])
    d.pitches.p02.run = {
      startedAt: at(2026, 10, 3).toISOString(),
      lastCampId: 'c1',
      lastCampRouteIndex: 1,
      whippers: 2,
      failedArcs: [],
      routeArcs: [],
      routePath: ['c1'],
      fallsBySpot: {},
      lastMissBySpot: {},
      highestRouteIndex: 1,
      night: false,
    }
    expect(trailMarkers(d, false).filter((x) => x.current).map((x) => x.id)).toEqual(['p02'])
  })

  it('stands her marker on the highest open pitch once every open pitch is sent', () => {
    const d = fresh()
    withStones(d, 3)
    for (const id of ['p01', 'p02', 'p03', 'p04', 'p05'] as const) d.pitches[id] = { ...defaultPitchProgress(), sends: 1 }
    expect(trailMarkers(d, false).filter((x) => x.current).map((x) => x.id)).toEqual(['p05'])
    const all = fresh()
    withStones(all, 14)
    for (const p of PITCHES) all.pitches[p.id] = { ...defaultPitchProgress(), sends: 1 }
    const m = trailMarkers(all, false)
    expect(m.every((x) => x.state !== 'hidden')).toBe(true)
    expect(m.filter((x) => x.current).map((x) => x.id)).toEqual(['p16'])
  })

  it('opens everything in test mode', () => {
    const d = fresh()
    d.testMode = true
    const m = trailMarkers(d, false)
    expect(m.every((x) => x.state === 'open' && x.needs === 0)).toBe(true)
  })
})

describe('trail markers by night', () => {
  it('is the day map until the summit', () => {
    const d = fresh()
    expect(trailMarkers(d, true)).toEqual(trailMarkers(d, false))
  })

  it('opens every pitch after the summit, flags night sends, and stands her at the first one left', () => {
    const d = fresh()
    d.summit = { reached: true, at: at(2026, 10, 3).toISOString(), finaleSeen: true }
    d.pitches.p01 = { ...defaultPitchProgress(), sends: 1, nightSends: 1 }
    d.pitches.p02 = { ...defaultPitchProgress(), sends: 1 }
    d.pitches.p03 = { ...defaultPitchProgress(), sends: 1, nightSends: 2 }
    const m = trailMarkers(d, true)
    expect(m.some((x) => x.state === 'hidden')).toBe(false)
    expect(m[0].state).toBe('sent')
    expect(m[1].state).toBe('open')
    expect(m[2].state).toBe('sent')
    expect(m.filter((x) => x.current).map((x) => x.id)).toEqual(['p02'])
    for (const p of PITCHES) d.pitches[p.id] = { ...defaultPitchProgress(), sends: 1, nightSends: 1 }
    expect(trailMarkers(d, true).filter((x) => x.current).map((x) => x.id)).toEqual(['p16'])
  })
})

describe('trail map geometry', () => {
  const pts = markerPoints()

  it('climbs from camp to Sky Lake, inside the picture', () => {
    expect(pts).toHaveLength(16)
    expect(CAMP_PT.v).toBeGreaterThan(pts[0].v)
    expect(LAKE_PT.v).toBeLessThan(pts[15].v)
    for (let i = 1; i < 16; i++) expect(pts[i].v, `pitch ${i + 1}`).toBeLessThan(pts[i - 1].v)
    for (const p of pts) {
      expect(p.u).toBeGreaterThan(0.08)
      expect(p.u).toBeLessThan(0.92)
    }
  })

  it('keeps markers inside the mountain at their height', () => {
    for (const p of pts) expect(Math.abs(p.u - 0.5)).toBeLessThanOrEqual(mountainWidthAt(p.v) / 2)
  })

  it('leaves a finger-sized gap between markers on a phone and an iPad', () => {
    // Frame sizes in CSS px: phone portrait, iPad portrait, iPad landscape (the frame is ≥ 820 tall).
    for (const [W, H] of [
      [358, 820],
      [788, 930],
      [1132, 820],
    ]) {
      let min = Infinity
      for (let i = 0; i < 16; i++) {
        for (let j = i + 1; j < 16; j++) min = Math.min(min, Math.hypot((pts[i].u - pts[j].u) * W, (pts[i].v - pts[j].v) * H))
      }
      expect(min, `${W}×${H}`).toBeGreaterThanOrEqual(56)
    }
  })

  it('switches back and forth across the mountain, zone by zone', () => {
    expect(markerSide(0)).toBe('left')
    expect(markerSide(1)).toBeNull()
    expect(markerSide(2)).toBe('right')
    expect(markerSide(3)).toBe('right')
    expect(markerSide(5)).toBe('left')
    expect(markerSide(15)).toBeNull()
    const b = zoneBounds(pts)
    expect(b).toHaveLength(5)
    for (let i = 1; i < 5; i++) expect(b[i]).toBeLessThan(b[i - 1])
  })
})

describe('trail map words', () => {
  const ALL = [...strings(MAP_COPY, 'MAP_COPY'), ...strings(ZONE_NAMES, 'ZONE_NAMES')]

  it('uses the brief’s words for the hidden trail', () => {
    expect(MAP_COPY.locked.text).toBe('The trail ahead is hidden. Add a stone to your cairn to find the way.')
  })

  it('says how many more stones gently, in words', () => {
    expect(MAP_COPY.locked.more(1)).toBe('One more stone and the fog lifts here.')
    expect(MAP_COPY.locked.more(14)).toBe('Fourteen more stones and the fog lifts here.')
    for (let n = 1; n <= 14; n++) expect(MAP_COPY.locked.more(n)).not.toMatch(/\d/)
    expect(numberWord(3)).toBe('three')
  })

  it('never uses a banned phrase, a clock or a lock', () => {
    expect(ALL.length).toBeGreaterThan(20)
    for (const [path, text] of ALL) {
      expect(bannedIn(text), path).toEqual([])
      expect(text.trim(), path).not.toBe('')
      expect(text, path).not.toMatch(/\b(seconds?|minutes?|timer|countdown|hurry|locked|streak)\b/i)
    }
  })

  it('names the five zones and the summit', () => {
    expect(Object.values(ZONE_NAMES)).toEqual(['Meadow Slopes', 'Firefly Hollow', 'Crumble Cliffs', 'Gusty Ridge', 'Cloud Steps', 'The Summit'])
  })
})
