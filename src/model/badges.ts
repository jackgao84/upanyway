/**
 * Badge triggers (attempts + courage only). Call evaluateBadges() after anything that could earn one:
 * whippers, sends, Big Leap tries, beta, finishing a brave thing, making a plan smaller.
 * In test mode only the brave-thing badges can be earned: brave things logged in test mode are real
 * (Decision 56), while climbs in test mode record nothing.
 */
import { BADGES, type Badge, type BadgeId } from '../content/badges'
import type { SaveData } from '../storage/schema'

const ATTEMPT_THRESHOLDS: Partial<Record<BadgeId, number>> = {
  'attempts-10': 10,
  'attempts-50': 50,
  'attempts-100': 100,
}

/** Done brave things whose forecast came in stormier than how it really was. */
export function stormierForecasts(d: SaveData): number {
  return d.brave.filter((b) => b.status === 'done' && typeof b.really === 'number' && b.forecast > b.really).length
}

function triggered(d: SaveData, id: BadgeId): boolean {
  const done = d.brave.filter((b) => b.status === 'done')
  switch (id) {
    case 'first-whipper':
      return d.stats.whippers >= 1
    case 'attempts-10':
    case 'attempts-50':
    case 'attempts-100':
      return d.stats.whippers + d.stats.sends >= (ATTEMPT_THRESHOLDS[id] ?? Infinity)
    case 'big-leap':
      return d.stats.bigLeapsTried >= 1
    case 'oops':
      return done.some((b) => b.oops)
    case 'still-here':
      return done.some((b) => b.outcome === 'flopped')
    case 'smaller-step':
      // Marked when the plan was made smaller after a Not today (never the other way round).
      return d.brave.some((b) => b.afterNotToday === true)
    case 'beta':
      return d.stats.betaAsked >= 1
    case 'stormy-5':
      return stormierForecasts(d) >= 5
  }
}

/** Badges earned by her real-life brave things (the only ones test mode can award). */
const BRAVE_BADGES: ReadonlySet<BadgeId> = new Set<BadgeId>(['oops', 'still-here', 'smaller-step', 'stormy-5'])

/** Award every badge whose trigger now holds. Returns the newly earned ids, in BADGES order. */
export function evaluateBadges(d: SaveData, now: Date): BadgeId[] {
  const earned: BadgeId[] = []
  for (const badge of BADGES) {
    if (d.badges[badge.id]) continue
    // Test-mode climbs write nothing, so the climbing badges wait for her real climbs.
    if (d.testMode && !BRAVE_BADGES.has(badge.id)) continue
    if (triggered(d, badge.id)) {
      d.badges[badge.id] = now.toISOString()
      earned.push(badge.id)
    }
  }
  return earned
}

export interface EarnedBadge extends Badge {
  earnedAt: string
}

/** Badges she has, in BADGES order. */
export function earnedBadges(d: SaveData): EarnedBadge[] {
  const out: EarnedBadge[] = []
  for (const badge of BADGES) {
    const at = d.badges[badge.id]
    if (at) out.push({ ...badge, earnedAt: at })
  }
  return out
}
