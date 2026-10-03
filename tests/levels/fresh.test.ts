/**
 * Fast check (runs before every build): every level has saved solutions whose hash matches the
 * current level data + tuning. If this fails, run `npm run validate` to re-prove the levels.
 */
import { describe, expect, test } from 'vitest'
import { ALL_LEVELS } from '../../src/game/levels'
import { hashLevel, solutionsFor } from '../../src/game/levels/solutions'

describe('saved level solutions are fresh', () => {
  for (const level of ALL_LEVELS) {
    test(level.id, () => {
      const saved = solutionsFor(level.id)
      expect(saved, `no solutions for ${level.id} — run npm run validate`).not.toBeNull()
      expect(saved!.levelHash, `${level.id} changed since it was validated — run npm run validate`).toBe(hashLevel(level))
      expect(saved!.steps.length).toBe(level.route.length - 1)
    })
  }
})
