/**
 * Beta: turning her last failed leap into a hint. After TUNING.hintAfterFalls falls from one spot the
 * goat offers a hint based on what actually happened on her LAST attempt; after
 * TUNING.ghostAfterFalls she can tap to see a faint ghost of a working arc. Hints are free.
 */
import { restPoint } from './physics'
import { TUNING } from './tuning'
import type { Level, LevelElement, StepSolution } from './types'
import type { WhipperKind } from './events'

export type HintClass = 'short' | 'long' | 'steep' | 'flat' | 'bumped' | 'gust' | 'crumbled'

export interface MissInfo {
  kind: WhipperKind
  arc: number[]
  launch: { angle: number; power: number } | null
  bumped: boolean
  gusted: boolean
}

function topOf(el: LevelElement): number {
  return el.kind === 'ledge' ? el.y : el.y - TUNING.handOffset + TUNING.holdReach
}

/**
 * Classify a miss against where she was heading (`target`) from `from`, using the saved working
 * solution from that spot when there is one.
 */
export function classifyMiss(
  level: Level,
  from: LevelElement,
  target: LevelElement,
  miss: MissInfo,
  solution: StepSolution | null,
): HintClass {
  void level
  if (miss.kind === 'crumble') return 'crumbled'
  if (miss.gusted) return 'gust'
  if (miss.bumped) return 'bumped'

  const arc = miss.arc
  const start = restPoint(from)
  const goal = restPoint(target)
  const dir = Math.sign(goal.x - start.x) || 1
  const angle = miss.launch?.angle ?? 90
  const solAngle = solution?.angle ?? (Math.atan2(goal.y - start.y + 60, goal.x - start.x) * 180) / Math.PI
  // How far from vertical: bigger = flatter.
  const flatness = Math.abs(90 - angle)
  const solFlatness = Math.abs(90 - solAngle)

  let apex = -Infinity
  for (let i = 1; i < arc.length; i += 2) apex = Math.max(apex, arc[i])
  const top = topOf(target)

  if (apex < top) {
    // Never got high enough.
    return flatness > solFlatness + 8 ? 'flat' : 'short'
  }

  // Where did the arc come back down through the target's height?
  let crossX: number | null = null
  for (let i = 2; i < arc.length; i += 2) {
    const y0 = arc[i - 1]
    const y1 = arc[i + 1]
    if (y0 >= top && y1 < top) {
      const f = (y0 - top) / Math.max(1e-6, y0 - y1)
      crossX = arc[i - 2] + (arc[i] - arc[i - 2]) * f
      break
    }
  }
  if (crossX === null) crossX = arc[arc.length - 2]

  const along = (crossX - goal.x) * dir
  if (along < 0) {
    // Came down before reaching it: too steep if she aimed higher than the working line, else short.
    return flatness + 8 < solFlatness ? 'steep' : 'short'
  }
  return 'long'
}

/** The working leap to show as a ghost from where she is (route step or saved ghost). */
export function ghostFor(solutionFrom: (fromId: string) => StepSolution | null, fromId: string): StepSolution | null {
  return solutionFrom(fromId)
}

/** Falls from this spot this run → which beta is available. */
export function betaAvailable(fallsAtSpot: number): { hint: boolean; ghost: boolean } {
  return { hint: fallsAtSpot >= TUNING.hintAfterFalls, ghost: fallsAtSpot >= TUNING.ghostAfterFalls }
}
