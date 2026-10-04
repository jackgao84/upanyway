/**
 * Hiding built-in idea cards (parent mode → Idea cards). A grown-up can take any built-in brave idea
 * or Oops Mission off her "Pick an idea" screen and put it back later. Hidden, never deleted: the
 * cards themselves (content/ideas.ts) never change, brave things and plans she made from a hidden
 * card keep their own words, and she can still type anything she likes. Grown-ups' own cards
 * (save.customIdeas) are removed instead, so only built-in ids can be hidden.
 *
 * Pure functions over SaveData (call the changing ones inside update()). Test mode doesn't touch
 * this: it is a grown-up's preference, like the cards they add.
 */
import { IDEAS, customIdeaCards, ideaById, type Idea } from '../content/ideas'
import type { SaveData } from '../storage/schema'

/** A built-in card's id (only these can be hidden). */
export function isBuiltInIdea(id: string): boolean {
  return ideaById(id) !== undefined
}

/** Is this built-in card hidden from her ideas screen? */
export function isHidden(d: SaveData, id: string): boolean {
  return d.hiddenIdeas.includes(id)
}

/** Hide a built-in card from her ideas screen. False if it isn't a built-in card or is already hidden. */
export function hideIdea(d: SaveData, id: string): boolean {
  if (!isBuiltInIdea(id) || isHidden(d, id)) return false
  d.hiddenIdeas.push(id)
  return true
}

/** Show a hidden card again. False if it wasn't hidden. */
export function showIdea(d: SaveData, id: string): boolean {
  const i = d.hiddenIdeas.indexOf(id)
  if (i < 0) return false
  d.hiddenIdeas.splice(i, 1)
  return true
}

/** Show every hidden card again. Returns how many came back. */
export function showAllIdeas(d: SaveData): number {
  return d.hiddenIdeas.splice(0).filter(isBuiltInIdea).length
}

/** How many built-in cards are hidden (optionally only those in one group, e.g. 'oops'). */
export function hiddenCount(d: SaveData, group?: Idea['group']): number {
  return d.hiddenIdeas.filter((id) => {
    const idea = ideaById(id)
    return idea !== undefined && (group === undefined || idea.group === group)
  }).length
}

/**
 * The cards on her ideas screen: the built-in ones that aren't hidden (in their usual order), then the
 * grown-ups' own cards (marked `custom`).
 */
export function visibleIdeas(d: SaveData): Idea[] {
  const hidden = new Set(d.hiddenIdeas)
  return [...IDEAS.filter((i) => !hidden.has(i.id)), ...customIdeaCards(d.customIdeas)]
}
