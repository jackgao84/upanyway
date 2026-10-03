/** Shared runner: one vitest test per level; writes solutions/<id>.json when the level passes. */
import { expect, test } from 'vitest'
import type { Level } from '../../src/game/types'
import { describeReport, validateLevel, writeSolutions } from './validator'

export function validateLevels(levels: Level[]): void {
  for (const level of levels) {
    test(`${level.id} "${level.title}" — every route step has a forgiving leap`, () => {
      const report = validateLevel(level)
      console.log(describeReport(level, report))
      expect(report.errors).toEqual([])
      writeSolutions(report)
    })
  }
}
