/**
 * Post-summit unlockables, derived — never stored (Decision 25). Every stone placed on or after the
 * summit day (letters included, in cairn order) unlocks the next item of content/unlockables.ts; past
 * the end of that list, deterministic colour variants ("Sunset-pink paper lantern") keep coming, so
 * every post-summit stone gives exactly one item. Test mode shows all base items.
 */
import { UNLOCKABLES, VARIANT_COLOURS, type Unlockable, type VariantColour } from '../content/unlockables'
import type { SaveData } from '../storage/schema'
import { dayKey } from './clock'
import { createRng } from './rng'
import { stoneOrder } from './stones'

export interface UnlockedItem extends Unlockable {
  /** The content item this is (or is a colour variant of). */
  baseId: string
  /** Colour applied over the base art; null = the original colours. */
  tint: string | null
  /** The stone that unlocked it (null in test mode). */
  stoneId: string | null
}

const VARIANT_BASES: readonly Unlockable[] = createRng('upanyway:variants').shuffle(
  UNLOCKABLES.filter((u) => !u.multicolour),
)

const lowerFirst = (s: string): string => s.charAt(0).toLowerCase() + s.slice(1)

type ItemInfo = Omit<UnlockedItem, 'stoneId'>

function baseItem(base: Unlockable): ItemInfo {
  return { ...base, baseId: base.id, tint: null }
}

function variantItem(base: Unlockable, colour: VariantColour, roundNo: number): ItemInfo {
  const item: ItemInfo = {
    id: `${base.id}~${colour.id}${roundNo > 1 ? `~${roundNo}` : ''}`,
    name: `${colour.name} ${lowerFirst(base.name)}${roundNo > 1 ? ` No. ${roundNo}` : ''}`,
    kind: base.kind,
    description: base.description,
    baseId: base.id,
    tint: colour.tint,
  }
  if (base.slot) item.slot = base.slot
  return item
}

/**
 * The i-th unlockable in unlock order (0-based). Items 0…N−1 are the content list; after that each
 * (base, colour) pair appears once before any repeats, colours mixed so neighbours differ.
 */
export function unlockableAt(i: number): ItemInfo {
  if (i < UNLOCKABLES.length) return baseItem(UNLOCKABLES[i])
  const v = i - UNLOCKABLES.length
  const nb = VARIANT_BASES.length
  const nc = VARIANT_COLOURS.length
  const w = v % (nb * nc)
  const b = w % nb
  return variantItem(VARIANT_BASES[b], VARIANT_COLOURS[(b + Math.floor(w / nb)) % nc], Math.floor(v / (nb * nc)) + 1)
}

/** Look up any unlockable id, including generated variants ("deco-lantern~sky-blue"). */
export function resolveUnlockable(id: string): ItemInfo | null {
  const [baseId, colourId, roundText, extra] = id.split('~')
  const base = UNLOCKABLES.find((u) => u.id === baseId)
  if (!base || extra !== undefined) return null
  if (colourId === undefined) return baseItem(base)
  const colour = VARIANT_COLOURS.find((c) => c.id === colourId)
  if (!colour || base.multicolour) return null
  let roundNo = 1
  if (roundText !== undefined) {
    roundNo = Number(roundText)
    if (!Number.isInteger(roundNo) || roundNo < 2) return null
  }
  return variantItem(base, colour, roundNo)
}

/**
 * Stones placed on days before the summit's day: the cairn size at the summit for a save that
 * reached Sky Lake before `summit.stonesAt` was recorded (normalize fills it in once with this).
 */
export function stonesBeforeSummitDay(d: SaveData): number {
  const at = d.summit.at ? Date.parse(d.summit.at) : NaN
  const summitDay = Number.isFinite(at) ? dayKey(new Date(at)) : ''
  return stoneOrder(d).filter((s) => s.day < summitDay).length
}

/**
 * Stones that count for unlockables: every stone placed after the summit was reached, in cairn order
 * (the cairn held `summit.stonesAt` stones then; stones from earlier that day don't count).
 */
function postSummitStones(d: SaveData): string[] {
  if (!d.summit.reached) return []
  const before = d.summit.stonesAt ?? stonesBeforeSummitDay(d)
  return stoneOrder(d)
    .slice(Math.max(0, before))
    .map((s) => s.id)
}

/** Everything unlocked so far, in unlock order. */
export function unlockedItems(d: SaveData): UnlockedItem[] {
  if (d.testMode) return UNLOCKABLES.map((u) => ({ ...u, baseId: u.id, tint: null, stoneId: null }))
  return postSummitStones(d).map((stoneId, i) => ({ ...unlockableAt(i), stoneId }))
}

/** Items unlocked after the first `prevCount` (read the count before placing stones, then call this). */
export function newlyUnlockedSince(prevCount: number, d: SaveData): UnlockedItem[] {
  return unlockedItems(d).slice(Math.max(0, prevCount))
}

/** Unlocked gear only (the wardrobe). */
export function unlockedGear(d: SaveData): UnlockedItem[] {
  return unlockedItems(d).filter((u) => u.kind === 'gear')
}

/** Unlocked camp decorations only (the camp scene). */
export function unlockedDecorations(d: SaveData): UnlockedItem[] {
  return unlockedItems(d).filter((u) => u.kind === 'decoration')
}
