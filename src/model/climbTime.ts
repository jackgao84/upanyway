/**
 * Daily climb time (parent setting, default 20 min; 0 = no limit). Shown only as a sinking sun —
 * never a countdown. Counts only while the climb screen is visible and not frozen (Decision 7).
 * Test mode: no cap, and nothing is written.
 */
import type { SaveData } from '../storage/schema'
import { dayKey } from './clock'

export function climbSecondsToday(d: SaveData, now: Date): number {
  return d.climbTime.day === dayKey(now) ? d.climbTime.seconds : 0
}

/** Add climbing time (seconds). A new local day starts again from zero. */
export function addClimbSeconds(d: SaveData, seconds: number, now: Date): void {
  if (d.testMode || !Number.isFinite(seconds) || seconds <= 0) return
  const today = dayKey(now)
  if (d.climbTime.day !== today) d.climbTime = { day: today, seconds: 0 }
  d.climbTime.seconds += seconds
}

/** Today's allowance in seconds; Infinity when the parent chose no limit (0 minutes). */
export function dailyLimitSeconds(d: SaveData): number {
  const minutes = d.parent.dailyClimbMinutes
  if (!Number.isFinite(minutes) || minutes <= 0) return Infinity
  return minutes * 60
}

/** True once today's time is used up: she finishes the current attempt, then the sunset card. */
export function isSunset(d: SaveData, now: Date): boolean {
  if (d.testMode) return false
  return climbSecondsToday(d, now) >= dailyLimitSeconds(d)
}

/** How far the sun has sunk today: 0 = high, 1 = set. Always 0 with no limit or in test mode. */
export function sunProgress(d: SaveData, now: Date): number {
  const limit = dailyLimitSeconds(d)
  if (d.testMode || limit === Infinity) return 0
  return Math.max(0, Math.min(1, climbSecondsToday(d, now) / limit))
}
