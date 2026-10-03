/**
 * Saved validator solutions (src/game/levels/solutions/<id>.json, written by tests/levels/*).
 * Used for the ghost beta arc and by the e2e replay. `levelHash` must match `hashLevel(level)` —
 * tests/levels/fresh.test.ts (run before every build) fails if a level changed without re-validating.
 */
import type { Level, LevelId, StepSolution } from '../types'
import { PHYSICS_VERSION } from '../physics'
import { TUNING } from '../tuning'

export interface LevelSolutions {
  levelId: LevelId
  levelHash: string
  /** One per route step, in route order. */
  steps: StepSolution[]
  /** Off-route element id → a leap from it to a route element above (ghost beta from side spots). */
  ghosts: Record<string, StepSolution>
  difficulty: {
    /** Smallest forgiveness scale over the route's steps (1 = exactly ±4° / ±0.06). */
    minMargin: number
    minSuccessFraction: number
    meanSuccessFraction: number
  }
}

const files = import.meta.glob<LevelSolutions>('./solutions/*.json', { eager: true, import: 'default' })

const byId = new Map<string, LevelSolutions>()
for (const data of Object.values(files)) byId.set(data.levelId, data)

export function solutionsFor(id: LevelId): LevelSolutions | null {
  return byId.get(id) ?? null
}

/** The saved step solution from `fromId` (route step or ghost), if any. */
export function solutionFrom(id: LevelId, fromId: string): StepSolution | null {
  const s = byId.get(id)
  if (!s) return null
  return s.steps.find((step) => step.from === fromId) ?? s.ghosts[fromId] ?? null
}

/** FNV-1a over the level data + tuning + physics version: any change means re-validating the level. */
export function hashLevel(level: Level): string {
  const text = JSON.stringify(level) + '|' + JSON.stringify(TUNING) + '|physics' + PHYSICS_VERSION
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}
