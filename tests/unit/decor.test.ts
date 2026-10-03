/**
 * Level decor hygiene: every decoration that stands on the ground (everything except a free-floating
 * cloud wisp) sits exactly on the top of a ledge whose span contains it — so the renderer never has
 * to "settle" a flower that floats in mid-air or hides inside the rock. Rope bridges don't carry
 * decor (the terrain never puts any on them).
 */
import { describe, expect, it } from 'vitest'
import { ALL_LEVELS } from '../../src/game/levels'
import type { Decor, Ledge, Level } from '../../src/game/types'

/** Decor drawn free on the face, not standing on anything. */
const FREE_KINDS = new Set<Decor['kind']>(['cloud'])

function ledgesOf(level: Level): Ledge[] {
  return level.elements.filter((e): e is Ledge => e.kind === 'ledge' && !e.bridge)
}

/** The ledge a decoration stands on, or null. */
function standsOn(d: Decor, ledges: readonly Ledge[]): Ledge | null {
  return ledges.find((l) => d.y === l.y && d.x >= l.x && d.x <= l.x + l.w) ?? null
}

describe('level decor', () => {
  for (const level of ALL_LEVELS) {
    it(`${level.id}: every ground decoration stands on a ledge top`, () => {
      const ledges = ledgesOf(level)
      const floating = (level.decor ?? [])
        .filter((d) => !FREE_KINDS.has(d.kind) && !standsOn(d, ledges))
        .map((d) => `${d.kind} at (${d.x}, ${d.y})`)
      expect(floating).toEqual([])
    })
  }
})
