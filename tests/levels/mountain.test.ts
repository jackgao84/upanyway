/** The mountain as a whole: exactly lesson + p01–p16, zones in order, one Looks Scary per zone 1–5. */
import { expect, test } from 'vitest'
import { ALL_LEVELS, PITCHES } from '../../src/game/levels'
import { LOOKS_SCARY_PITCHES, ZONE_OF_INDEX } from './validator'

test('lesson + 16 pitches with the right ids and zones', () => {
  expect(ALL_LEVELS.map((l) => l.id)).toEqual(['lesson', ...Array.from({ length: 16 }, (_, i) => `p${String(i + 1).padStart(2, '0')}`)])
  PITCHES.forEach((l, i) => {
    expect(l.index).toBe(i + 1)
    expect(l.zone).toBe(ZONE_OF_INDEX[i + 1])
  })
})

test('one Looks Scary moment in each of zones 1–5, on the middle pitch', () => {
  expect(PITCHES.filter((l) => l.looksScary).map((l) => l.id)).toEqual(LOOKS_SCARY_PITCHES)
})

test('hidden holds exist somewhere on the mountain', () => {
  const hidden = PITCHES.flatMap((l) => l.elements.filter((e) => e.kind === 'hold' && e.hidden))
  expect(hidden.length).toBeGreaterThanOrEqual(3)
})

test('the summit pitch is the finale', () => {
  expect(PITCHES[15].finale).toBe(true)
})
