/**
 * Which pitches are open (Decision 5, the owner's rule): Pitch 1 is always open. Pitch n (n ≥ 2)
 * opens when the cairn holds n − 2 placed stones AND she has sent Pitch n − 1 by day. Waiting stones
 * don't count; stones are never spent, so once open a pitch stays open and replays freely.
 * `lockReason` is the one place the rule lives: everything else here (and every screen that says
 * why a part of the trail is hidden) reads it.
 *
 * Test mode opens everything; after the summit every pitch is open at night (the goat climbs beside
 * her once it has climbed out of the pack at Sky Lake). A night send doesn't count toward the day
 * rule: night climbs open only after the summit, when every pitch has been sent by day anyway.
 */
import type { SaveData } from '../storage/schema'
import { PITCH_IDS, type LevelId } from '../game/types'
import { totalStones } from './stones'

/** Why a day pitch is still hidden. At least one of the two is missing. */
export interface LockReason {
  /** How many more placed stones the cairn needs (0 when it already holds enough). */
  needStones: number
  /** The pitch below, not sent by day yet (null once it has been). */
  needPitch: LevelId | null
}

const pitchIndex = (levelId: LevelId): number => PITCH_IDS.indexOf(levelId as (typeof PITCH_IDS)[number])

/** 1-based pitch number ("Pitch 3"); 0 for the lesson. */
export function pitchNumber(levelId: LevelId): number {
  return pitchIndex(levelId) + 1
}

/** Stones needed to open a pitch (p01, p02 and the lesson → 0). */
export function pitchRequirement(levelId: LevelId): number {
  const index = pitchIndex(levelId)
  if (index < 0) return 0
  return Math.max(0, index + 1 - 2)
}

/** Sent by day at least once. */
export function isSentByDay(d: SaveData, levelId: LevelId): boolean {
  return (d.pitches[levelId]?.sends ?? 0) > 0
}

/** The rule itself, with the cairn's stone count passed in (the cairn counts up stone by stone). */
function reasonWith(d: SaveData, levelId: LevelId, stones: number): LockReason | null {
  if (d.testMode) return null
  const index = pitchIndex(levelId)
  if (index <= 0) return null // the lesson and Pitch 1
  const needStones = Math.max(0, pitchRequirement(levelId) - stones)
  const below = PITCH_IDS[index - 1]
  const needPitch = isSentByDay(d, below) ? null : below
  return needStones > 0 || needPitch ? { needStones, needPitch } : null
}

/** Why this day pitch is still hidden, or null when it is open. */
export function lockReason(d: SaveData, levelId: LevelId): LockReason | null {
  return reasonWith(d, levelId, totalStones(d))
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
  return lockReason(d, levelId) === null
}

/** Stones still needed for this pitch (0 when open, or when only the climb below is missing). */
export function stonesToOpen(d: SaveData, levelId: LevelId): number {
  return lockReason(d, levelId)?.needStones ?? 0
}

/** Day pitches she can climb, in mountain order. */
export function openPitches(d: SaveData): LevelId[] {
  return PITCH_IDS.filter((id) => isPitchOpen(d, id))
}

/** The first pitch still hidden by day, or null when the whole mountain is open. */
export function nextLockedPitch(d: SaveData): LevelId | null {
  return PITCH_IDS.find((id) => !isPitchOpen(d, id)) ?? null
}

/** How far the day trail goes, as 1-based pitch numbers. */
export interface TrailReach {
  /** The pitches open in a row from Pitch 1 (16 = the whole mountain). */
  open: number
  /** The highest pitch the cairn's stones reach, climbing aside: stones + 2, at most 16. */
  stones: number
}

/**
 * How far the trail is open by day with `stones` placed stones (default: the cairn as it is), and how
 * far those stones alone would take it. `open < stones` means climbing is what opens the next part.
 */
export function trailReach(d: SaveData, stones = totalStones(d)): TrailReach {
  let open = 0
  while (open < PITCH_IDS.length && reasonWith(d, PITCH_IDS[open], stones) === null) open++
  return { open, stones: Math.min(PITCH_IDS.length, Math.max(0, Math.floor(stones)) + 2) }
}
