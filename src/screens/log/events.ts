/**
 * One-shot notes from the log flow to the screen it hands over to, so nothing is left in the URL
 * for a reload to repeat:
 *
 * - Plans: "this plan was just saved" (the goat greets it, its card glows once).
 * - The cairn: badges earned by the brave thing that just went on. They wait until the stone has
 *   landed, so the stacking moment comes first: the cairn calls releaseHeldBadges() when its new
 *   stones have settled. If nobody releases them they show by themselves after a few seconds.
 * - The cairn: stones that went on somewhere else (camp places waiting stones on entry; opening a
 *   letter places its stone). The next cairn visit plays their arrival (noteArrivals → takeArrivals),
 *   however she gets there.
 */
import type { BadgeId } from '../../content/badges'
import { showBadgeCards } from './ticket'

/**
 * How long "Saved to your Plans." shows. Plans waits this long before the goat greets the new plan,
 * so the two never sit on top of each other.
 */
export const SAVED_TOAST_MS = 2400

let justSaved: string | null = null

export function notePlanSaved(id: string): void {
  justSaved = id
}

/** The plan saved just before this visit (once), or null. */
export function takeJustSaved(): string | null {
  const id = justSaved
  justSaved = null
  return id
}

let pendingArrivals: string[] = []

/** Stones whose arrival the next cairn visit should play (waiting stones placed at camp, a letter's stone). */
export function noteArrivals(ids: readonly string[]): void {
  for (const id of ids) if (!pendingArrivals.includes(id)) pendingArrivals.push(id)
}

/** The stones noted since the last cairn visit (once), oldest note first. */
export function takeArrivals(): string[] {
  const ids = pendingArrivals
  pendingArrivals = []
  return ids
}

/** Long enough for a stone to drop, land and settle on the cairn. */
const HOLD_FALLBACK_MS = 4200

let held: BadgeId[] = []
let heldTimer: ReturnType<typeof setTimeout> | null = null

/** Keep new badges back until the stone has landed (see releaseHeldBadges). */
export function holdBadgesForCairn(ids: readonly BadgeId[], fallbackMs = HOLD_FALLBACK_MS): void {
  if (!ids.length) return
  held = [...held, ...ids.filter((id) => !held.includes(id))]
  if (heldTimer) clearTimeout(heldTimer)
  heldTimer = setTimeout(releaseHeldBadges, fallbackMs)
}

/** Show the held badges now (the cairn calls this once its new stones have settled). */
export function releaseHeldBadges(): void {
  if (heldTimer) clearTimeout(heldTimer)
  heldTimer = null
  const ids = held
  held = []
  if (ids.length) showBadgeCards(ids)
}
