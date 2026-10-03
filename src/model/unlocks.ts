/**
 * Which pitches are open (Decision 5): pitches 1–2 are free; pitch n opens when the cairn holds n − 2
 * stones. No "previous pitch sent" gate. Unlocked pitches replay freely. Test mode opens everything;
 * after the summit every pitch is open at night (the goat climbs beside her once it has climbed out
 * of the pack at Sky Lake).
 */
import type { SaveData } from '../storage/schema'
import { PITCH_IDS, type LevelId } from '../game/types'
import { totalStones } from './stones'

/** Stones needed to open a pitch (p01, p02 and the lesson → 0). */
export function pitchRequirement(levelId: LevelId): number {
  const index = PITCH_IDS.indexOf(levelId as (typeof PITCH_IDS)[number])
  if (index < 0) return 0
  return Math.max(0, index + 1 - 2)
}

export function isNightOpen(d: SaveData): boolean {
  return d.summit.reached || d.testMode
}

/**
 * The goat has climbed out of the backpack: it does that for the very first time in the Sky Lake
 * finale (summit.finaleSeen). Until then every drawing of it — camp, cards, wardrobe, a night climb —
 * keeps it in (or peeking out of) the pack. Test mode shows everything.
 */
export function isGoatOut(d: SaveData): boolean {
  return d.summit.finaleSeen || d.testMode
}

export function isPitchOpen(d: SaveData, levelId: LevelId, night = false): boolean {
  if (d.testMode) return true
  if (night) return isNightOpen(d)
  return totalStones(d) >= pitchRequirement(levelId)
}

/** Stones still needed for this pitch (0 when open). */
export function stonesToOpen(d: SaveData, levelId: LevelId): number {
  if (d.testMode) return 0
  return Math.max(0, pitchRequirement(levelId) - totalStones(d))
}

/** Day pitches she can climb, in mountain order. */
export function openPitches(d: SaveData): LevelId[] {
  return PITCH_IDS.filter((id) => isPitchOpen(d, id))
}

/** The first pitch still hidden by day, or null when the whole mountain is open. */
export function nextLockedPitch(d: SaveData): LevelId | null {
  return PITCH_IDS.find((id) => !isPitchOpen(d, id)) ?? null
}
