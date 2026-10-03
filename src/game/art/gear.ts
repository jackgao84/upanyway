/**
 * Post-summit gear: which items exist, where each one is worn, how a worn id names its colour, the
 * wearing rule, and small "try it on" pictures for the Wardrobe's Treasures tab.
 *
 * The gear itself is drawn on the climber by climber.ts (each slot at its place on the rig: helmet
 * gear in the head frame, neck gear and the cape in the torso frame, gloves and bracelets at the
 * wrists, socks, boots and laces at the feet, the pack's extras on the backpack). This module is what
 * climber.ts asks to read `look.gear`.
 *
 * Worn ids (ClimberLook.gear) are unlockable ids: "gear-scarf", or a colour variant
 * "gear-scarf~sky-blue" / "gear-scarf~sky-blue~2" (model/unlockables.ts). Older spellings
 * ("gear-scarf:sky-blue", "gear-scarf-sky-blue", any "#rrggbb") still read.
 *
 * Try-it-on pictures for the Wardrobe live in screens/designer.ts (this module stays free of the
 * climber drawing, which imports it).
 *
 * The wearing rule (Decision: one per slot): one thing on the helmet, one round the neck, one on the
 * back, one on the hands, one on the feet, one on the face — up to six at once. Putting a new thing
 * on a slot takes the old one off, so nothing piles up in the same spot.
 */
import { UNLOCKABLES, VARIANT_COLOURS, type GearSlot } from '../../content/unlockables'

export type { GearSlot }

/** Slots in the order the Wardrobe shows them (top of her to the bottom). */
export const GEAR_SLOTS: readonly GearSlot[] = ['head', 'face', 'neck', 'back', 'hands', 'feet']

/** Base gear ids → slot, from the content list. */
const SLOT_OF: ReadonlyMap<string, GearSlot> = new Map(
  UNLOCKABLES.filter((u) => u.kind === 'gear' && u.slot).map((u) => [u.id, u.slot as GearSlot]),
)

/** Every base gear id, in content order. */
export const GEAR_IDS: readonly string[] = [...SLOT_OF.keys()]

/** Longest ids first, so "gear-star-stickers" never reads as some shorter "gear-star…" prefix. */
const BY_LENGTH = [...GEAR_IDS].sort((a, b) => b.length - a.length)

export interface WornGear {
  /** The content item ("gear-scarf"). */
  baseId: string
  slot: GearSlot
  /** Colour of a variant; null = the item's own colours. */
  tint: string | null
}

const HEX = /#[0-9a-f]{6}/i

/** Read one worn id. Null for anything that isn't gear (a decoration, a typo, an old item). */
export function parseGearId(raw: string): WornGear | null {
  if (typeof raw !== 'string') return null
  const id = raw.trim()
  const baseId = BY_LENGTH.find((b) => id === b || id.startsWith(b + '~') || id.startsWith(b + ':') || id.startsWith(b + '-'))
  if (!baseId) return null
  const slot = SLOT_OF.get(baseId) as GearSlot
  if (id === baseId) return { baseId, slot, tint: null }
  const hex = HEX.exec(id)
  if (hex) return { baseId, slot, tint: hex[0].toLowerCase() }
  const rest = id.slice(baseId.length + 1).replace(/^[-~:]+/, '')
  const colourId = rest.split('~')[0]
  const colour = VARIANT_COLOURS.find((c) => c.id === colourId) ?? VARIANT_COLOURS.find((c) => rest.endsWith(c.id))
  return colour ? { baseId, slot, tint: colour.tint } : null
}

/** The slot an id is worn on (null if it isn't gear). */
export function gearSlot(id: string): GearSlot | null {
  return parseGearId(id)?.slot ?? null
}

/** What she is wearing, one entry per base item (the last one listed wins). */
export function wornGear(ids: readonly string[] | undefined): Map<string, WornGear> {
  const out = new Map<string, WornGear>()
  for (const raw of ids ?? []) {
    const w = parseGearId(raw)
    if (w) out.set(w.baseId, w)
  }
  return out
}

/**
 * Put an item on (taking off whatever was on the same slot) or take it off. Returns a new list;
 * `ids` is not changed.
 */
export function wearGear(ids: readonly string[], id: string, on: boolean): string[] {
  const slot = gearSlot(id)
  if (!slot) return ids.slice()
  const rest = ids.filter((x) => x !== id && gearSlot(x) !== slot)
  return on ? [...rest, id] : rest
}

/** Is this exact item (this colour) being worn? */
export function isWearing(ids: readonly string[], id: string): boolean {
  return ids.includes(id)
}

/**
 * Keep only gear she can still wear (`allowed`: the unlocked ids), one per slot (the last one
 * listed wins). Used when test mode ends: things tried on in test mode come off again.
 */
export function pruneGear(ids: readonly string[], allowed: ReadonlySet<string>): string[] {
  let out: string[] = []
  for (const id of ids) if (allowed.has(id) && gearSlot(id)) out = wearGear(out, id, true)
  return out
}
