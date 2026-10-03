/**
 * Post-summit gear and camp decorations: every gear item (and every generated colour variant) is
 * read with its slot and colour, one thing per slot, what the Wardrobe's Treasures tab lists (and
 * when it has no tab at all), what the camp picture places, and the words on these screens.
 */
import { describe, expect, it } from 'vitest'
import { UNLOCKABLES, VARIANT_COLOURS } from '../../src/content/unlockables'
import { GEAR_IDS, GEAR_SLOTS, gearSlot, parseGearId, pruneGear, wearGear, wornGear } from '../../src/game/art/gear'
import { unlockableAt } from '../../src/model/unlockables'
import { CAMP_SCREEN_COPY, campDecorations, campStones } from '../../src/screens/camp'
import { DESIGNER_COPY } from '../../src/screens/designer'
import { WARDROBE_COPY, treasureItems } from '../../src/screens/wardrobe'
import type { SaveData } from '../../src/storage/schema'
import { DAY1, at, fresh, sendLetter, withStones } from './fixtures'
import { bannedIn } from './voice'

const GEAR = UNLOCKABLES.filter((u) => u.kind === 'gear')
const DECOR = UNLOCKABLES.filter((u) => u.kind === 'decoration')

function strings(value: unknown, path: string, out: [string, string][] = []): [string, string][] {
  if (typeof value === 'string') out.push([path, value])
  else if (typeof value === 'function') {
    // Counts for (n) => …, item names for (names) => …, words for (name) => ….
    const fn = value as (...args: unknown[]) => unknown
    const samples: unknown[] = /\(names\b/.test(String(fn)) ? [['Paper lantern'], ['Paper lantern', 'Cozy scarf']] : /\((name|thing)\b/.test(String(fn)) ? ['Cozy scarf'] : [1, 3]
    for (const sample of samples) strings(fn(...Array<unknown>(Math.max(1, fn.length)).fill(sample)), `${path}(…)`, out)
  } else if (Array.isArray(value)) value.forEach((v, i) => strings(v, `${path}[${i}]`, out))
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) strings(v, `${path}.${k}`, out)
  return out
}

/** Summit reached on DAY1, then `n` stones from that day on (all post-summit). */
function summitSave(n: number): SaveData {
  const d = fresh(at(2026, 9, 1))
  withStones(d, 14, at(2026, 9, 1))
  d.summit = { reached: true, at: DAY1.toISOString(), finaleSeen: true }
  withStones(d, n, DAY1)
  return d
}

describe('gear ids', () => {
  it('knows all twenty gear items, each on one of six slots', () => {
    expect(GEAR_IDS).toEqual(GEAR.map((g) => g.id))
    expect(GEAR).toHaveLength(20)
    for (const g of GEAR) expect(gearSlot(g.id), g.id).toBe(g.slot)
    for (const slot of GEAR_SLOTS) expect(GEAR.some((g) => g.slot === slot), slot).toBe(true)
  })

  it('reads every generated colour variant with its colour', () => {
    for (let i = UNLOCKABLES.length; i < UNLOCKABLES.length + 600; i++) {
      const item = unlockableAt(i)
      const worn = parseGearId(item.id)
      if (item.kind === 'decoration') {
        expect(worn, item.id).toBeNull()
        continue
      }
      expect(worn, item.id).toEqual({ baseId: item.baseId, slot: item.slot, tint: item.tint })
    }
  })

  it('reads older spellings, and nothing that is not gear', () => {
    const sky = VARIANT_COLOURS.find((c) => c.id === 'sky-blue')?.tint
    expect(parseGearId('gear-scarf')).toEqual({ baseId: 'gear-scarf', slot: 'neck', tint: null })
    expect(parseGearId('gear-scarf:sky-blue')?.tint).toBe(sky)
    expect(parseGearId('gear-scarf-sky-blue')?.tint).toBe(sky)
    expect(parseGearId('gear-scarf-#A1B2C3')?.tint).toBe('#a1b2c3')
    expect(parseGearId('gear-star-stickers')?.baseId).toBe('gear-star-stickers')
    expect(parseGearId('deco-lantern')).toBeNull()
    expect(parseGearId('gear-jetpack')).toBeNull()
    expect(parseGearId('gear-scarf~not-a-colour')).toBeNull()
  })
})

describe('wearing gear', () => {
  it('wears one thing per slot: a new one takes the old one off', () => {
    let worn: string[] = []
    worn = wearGear(worn, 'gear-scarf', true)
    worn = wearGear(worn, 'gear-headlamp', true)
    worn = wearGear(worn, 'gear-bandana', true)
    expect(worn).toEqual(['gear-headlamp', 'gear-bandana'])
    worn = wearGear(worn, 'gear-bandana~lemon', true)
    expect(worn).toEqual(['gear-headlamp', 'gear-bandana~lemon'])
    worn = wearGear(worn, 'gear-headlamp', false)
    expect(worn).toEqual(['gear-bandana~lemon'])
    expect(wearGear(worn, 'deco-lantern', true)).toEqual(worn)
  })

  it('can wear six things at once, one on each slot', () => {
    let worn: string[] = []
    for (const slot of GEAR_SLOTS) worn = wearGear(worn, GEAR.find((g) => g.slot === slot)?.id ?? '', true)
    expect(worn).toHaveLength(6)
    expect(wornGear(worn).size).toBe(6)
  })

  it('takes off what she can no longer see (test mode ended), one per slot', () => {
    const allowed = new Set(['gear-scarf', 'gear-bandana'])
    expect(pruneGear(['gear-scarf', 'gear-cape', 'gear-bandana'], allowed)).toEqual(['gear-bandana'])
    expect(pruneGear(['gear-cape'], allowed)).toEqual([])
  })
})

describe('the Treasures tab', () => {
  it('is not there before the summit', () => {
    const d = fresh()
    withStones(d, 9)
    expect(treasureItems(d, DAY1)).toBeNull()
  })

  it('is there, empty, on the summit day before any new stone', () => {
    expect(treasureItems(summitSave(0), DAY1)).toEqual([])
  })

  it('lists the gear her post-summit stones unlocked, newest ones marked new', () => {
    const d = summitSave(9)
    const items = treasureItems(d, at(2026, 10, 5)) ?? []
    const expected = Array.from({ length: 9 }, (_, i) => unlockableAt(i)).filter((u) => u.kind === 'gear')
    expect(items.map((i) => i.id)).toEqual(expected.map((u) => u.id))
    // Stones 7–9 went on 5 Oct (three a day from 3 Oct): only gear from those is new.
    const newIds = Array.from({ length: 3 }, (_, i) => unlockableAt(6 + i)).filter((u) => u.kind === 'gear').map((u) => u.id)
    expect(items.filter((i) => i.isNew).map((i) => i.id)).toEqual(newIds)
    expect(treasureItems(d, at(2026, 10, 9))?.some((i) => i.isNew)).toBe(false)
  })

  it('counts letters too, and never shows locked gear', () => {
    const d = summitSave(1)
    sendLetter(d, at(2026, 10, 4))
    const ids = (treasureItems(d, DAY1) ?? []).map((i) => i.id)
    expect(ids).toEqual([unlockableAt(0), unlockableAt(1)].filter((u) => u.kind === 'gear').map((u) => u.id))
  })

  it('shows every gear item in test mode, plus her own colour variants', () => {
    const d = summitSave(UNLOCKABLES.length + 4)
    d.testMode = true
    const ids = (treasureItems(d, DAY1) ?? []).map((i) => i.id)
    for (const g of GEAR) expect(ids, g.id).toContain(g.id)
    const variants = Array.from({ length: 4 }, (_, i) => unlockableAt(UNLOCKABLES.length + i)).filter((u) => u.kind === 'gear')
    for (const v of variants) expect(ids, v.id).toContain(v.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('the camp picture', () => {
  it('places nothing extra before the summit, and every decoration in test mode', () => {
    const d = fresh()
    withStones(d, 6)
    expect(campDecorations(d).size).toBe(0)
    d.testMode = true
    const all = campDecorations(d)
    expect([...all.keys()].sort()).toEqual(DECOR.map((x) => x.id).sort())
    expect([...all.values()].every((t) => t === null)).toBe(true)
  })

  it('places each unlocked decoration once, in the colour of its newest variant', () => {
    const d = summitSave(UNLOCKABLES.length + 60)
    const deco = campDecorations(d)
    expect(deco.size).toBe(DECOR.length)
    const newest = new Map<string, string | null>()
    for (let i = 0; i < UNLOCKABLES.length + 60; i++) {
      const u = unlockableAt(i)
      if (u.kind === 'decoration') newest.set(u.baseId, u.tint ?? newest.get(u.baseId) ?? null)
    }
    expect(deco).toEqual(newest)
    // Bunting is already every colour: it never gets a variant.
    expect(deco.get('deco-bunting')).toBeNull()
  })

  it('stacks her real stones in cairn order, letters marked', () => {
    const d = fresh()
    withStones(d, 2)
    const letter = sendLetter(d, at(2026, 10, 4))
    const stones = campStones(d)
    expect(stones).toHaveLength(3)
    expect(stones.filter((s) => s.letter).map((s) => s.id)).toEqual([letter.id])
  })
})

describe('wardrobe and camp words', () => {
  const ALL = [
    ...strings(DESIGNER_COPY, 'DESIGNER_COPY'),
    ...strings(WARDROBE_COPY, 'WARDROBE_COPY'),
    ...strings(CAMP_SCREEN_COPY, 'CAMP_SCREEN_COPY'),
  ]

  it('says the treasures line the gentle way', () => {
    expect(DESIGNER_COPY.treasures.note).toBe('New treasures arrive with every stone you add.')
  })

  it('never uses a banned phrase, a clock, a streak or a lock', () => {
    expect(ALL.length).toBeGreaterThan(20)
    for (const [path, text] of ALL) {
      expect(bannedIn(text), path).toEqual([])
      expect(text.trim(), path).not.toBe('')
      expect(text, path).not.toMatch(/\b(seconds?|minutes?|timer|countdown|hurry|locked|streak|in a row)\b/i)
    }
  })
})
