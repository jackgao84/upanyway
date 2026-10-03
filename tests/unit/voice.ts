/** Shared voice rules for content tests (PROGRESS: Story/voice rules). */

/** Never in goat lines or copy (checked case-insensitively, curly apostrophes made straight). */
export const BANNED = [
  "don't be scared",
  'do not be scared',
  'nothing to be scared of',
  'be brave',
  'good job',
  'great job',
  'well done',
  'nice job',
  'oh no',
  'you failed',
  'try harder',
  'the lesson',
  'the moral',
  'you should',
  'remember to',
] as const

export const MAX_GOAT_WORDS = 12

export function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length
}

/** Lower case with straight apostrophes and single spaces, for phrase matching. */
export function plain(s: string): string {
  return s.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, ' ')
}

/** The banned phrases found in `text`. */
export function bannedIn(text: string): string[] {
  const t = plain(text)
  return BANNED.filter((phrase) => t.includes(phrase))
}
