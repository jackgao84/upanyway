import { describe, expect, it } from 'vitest'
import { UNLOCKABLES, VARIANT_COLOURS } from '../../src/content/unlockables'
import { placeWaitingStones } from '../../src/model/stones'
import {
  newlyUnlockedSince,
  resolveUnlockable,
  unlockableAt,
  unlockedDecorations,
  unlockedGear,
  unlockedItems,
} from '../../src/model/unlockables'
import type { SaveData } from '../../src/storage/schema'
import { at, doBrave, fresh, sendLetter, withStones } from './fixtures'

const words = (s: string): number => s.trim().split(/\s+/).length

function summitOn(d: SaveData, when: Date): void {
  d.summit.reached = true
  d.summit.at = when.toISOString()
}

describe('unlockables content', () => {
  it('has at least 40 items, half decorations and half gear', () => {
    expect(UNLOCKABLES.length).toBeGreaterThanOrEqual(40)
    const deco = UNLOCKABLES.filter((u) => u.kind === 'decoration')
    const gear = UNLOCKABLES.filter((u) => u.kind === 'gear')
    expect(deco.length).toBe(gear.length)
    expect(deco.length + gear.length).toBe(UNLOCKABLES.length)
  })

  it('every item is well formed', () => {
    const ids = new Set<string>()
    for (const u of UNLOCKABLES) {
      expect(u.id).toMatch(/^(deco|gear)-[a-z0-9-]+$/)
      expect(ids.has(u.id)).toBe(false)
      ids.add(u.id)
      expect(u.name.trim()).not.toBe('')
      expect(u.description.trim()).not.toBe('')
      expect(words(u.description), u.id).toBeLessThanOrEqual(10)
      if (u.kind === 'gear') expect(['head', 'neck', 'back', 'hands', 'feet', 'face']).toContain(u.slot)
      else expect(u.slot).toBeUndefined()
    }
    expect(new Set(VARIANT_COLOURS.map((c) => c.id)).size).toBe(VARIANT_COLOURS.length)
    for (const c of VARIANT_COLOURS) expect(c.tint).toMatch(/^#[0-9a-f]{6}$/)
  })

  it('gear covers every slot', () => {
    const slots = new Set(UNLOCKABLES.filter((u) => u.kind === 'gear').map((u) => u.slot))
    expect([...slots].sort()).toEqual(['back', 'face', 'feet', 'hands', 'head', 'neck'])
  })
})

describe('unlockedItems', () => {
  it('nothing before the summit', () => {
    const d = fresh()
    withStones(d, 20)
    expect(unlockedItems(d)).toEqual([])
  })

  it('one item per stone placed on or after the summit day, in cairn order, letters included', () => {
    const d = fresh()
    doBrave(d, at(2026, 10, 1, 9)) // before the summit: doesn't count
    const early = doBrave(d, at(2026, 10, 3, 8)).id // summit day, before the send: counts
    summitOn(d, at(2026, 10, 3, 16))
    const letter = sendLetter(d, at(2026, 10, 3, 18)).id
    const later = doBrave(d, at(2026, 10, 4, 9)).id
    const items = unlockedItems(d)
    expect(items.map((u) => u.stoneId)).toEqual([early, letter, later])
    expect(items.map((u) => u.id)).toEqual(UNLOCKABLES.slice(0, 3).map((u) => u.id))
    expect(items.every((u) => u.tint === null)).toBe(true)
  })

  it('keeps giving colour variants past the end of the list', () => {
    const d = fresh()
    summitOn(d, at(2026, 10, 1, 7))
    const n = UNLOCKABLES.length + 25
    withStones(d, n, at(2026, 10, 1, 9))
    const items = unlockedItems(d)
    expect(items).toHaveLength(n)
    const extra = items.slice(UNLOCKABLES.length)
    for (const u of extra) {
      expect(u.tint).toMatch(/^#/)
      expect(u.id).toContain('~')
      const base = UNLOCKABLES.find((b) => b.id === u.baseId)
      expect(base).toBeTruthy()
      expect(base?.multicolour).toBeUndefined()
      expect(u.kind).toBe(base?.kind)
      expect(u.slot).toBe(base?.slot)
      expect(resolveUnlockable(u.id)).toEqual({ ...u, stoneId: undefined })
    }
    expect(new Set(items.map((u) => u.id)).size).toBe(n)
  })

  it('variants are deterministic, unique and named "<colour> <item>"', () => {
    const total = UNLOCKABLES.filter((u) => !u.multicolour).length * VARIANT_COLOURS.length
    const ids = new Set<string>()
    for (let i = UNLOCKABLES.length; i < UNLOCKABLES.length + total + 5; i++) {
      const v = unlockableAt(i)
      expect(unlockableAt(i)).toEqual(v)
      ids.add(v.id)
      const colour = VARIANT_COLOURS.find((c) => v.name.startsWith(c.name + ' '))
      expect(colour, v.name).toBeTruthy()
      expect(resolveUnlockable(v.id)).toEqual(v)
    }
    expect(ids.size).toBe(total + 5)
    // Neighbours get different colours.
    expect(unlockableAt(UNLOCKABLES.length).tint).not.toBe(unlockableAt(UNLOCKABLES.length + 1).tint)
    const first = unlockableAt(UNLOCKABLES.length)
    expect(first.name).toMatch(/^[A-Z][a-z-]+ [a-z]/)
  })

  it('resolves base ids and rejects unknown ones', () => {
    expect(resolveUnlockable('deco-lantern')).toMatchObject({ id: 'deco-lantern', tint: null, baseId: 'deco-lantern' })
    expect(resolveUnlockable('deco-lantern~sky-blue')).toMatchObject({ name: 'Sky-blue paper lantern', baseId: 'deco-lantern' })
    expect(resolveUnlockable('deco-lantern~sky-blue~2')?.name).toBe('Sky-blue paper lantern No. 2')
    for (const bad of ['nope', 'deco-lantern~plaid', 'deco-lantern~sky-blue~1', 'deco-lantern~sky-blue~x', 'gear-rainbow-rope~mint', 'a~b~c~d']) {
      expect(resolveUnlockable(bad)).toBeNull()
    }
  })

  it('test mode shows every base item', () => {
    const d = fresh()
    d.testMode = true
    const items = unlockedItems(d)
    expect(items.map((u) => u.id)).toEqual(UNLOCKABLES.map((u) => u.id))
    expect(items.every((u) => u.stoneId === null)).toBe(true)
    expect(unlockedGear(d).length + unlockedDecorations(d).length).toBe(UNLOCKABLES.length)
  })

  it('newlyUnlockedSince reports what the latest stones opened', () => {
    const d = fresh()
    summitOn(d, at(2026, 10, 3, 8))
    for (let i = 0; i < 5; i++) doBrave(d, at(2026, 10, 3, 9, i)) // 3 placed, 2 waiting
    const before = unlockedItems(d).length
    expect(before).toBe(3)
    placeWaitingStones(d, at(2026, 10, 4, 8))
    const fresh2 = newlyUnlockedSince(before, d)
    expect(fresh2.map((u) => u.id)).toEqual(UNLOCKABLES.slice(3, 5).map((u) => u.id))
    expect(newlyUnlockedSince(-3, d)).toHaveLength(5)
  })

  it('a summit with no time still unlocks for its stones', () => {
    const d = fresh()
    withStones(d, 2)
    d.summit.reached = true
    expect(unlockedItems(d)).toHaveLength(2)
  })
})
