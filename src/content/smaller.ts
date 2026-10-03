/**
 * "Make it smaller" (Plans): the three smaller versions the brief suggests, plus "Write my own".
 * Each way turns the plan's text into a smaller plan's text ("Half of it: Order my own food…").
 * The original plan always stays as it is; the smaller one is a new plan (Decision 22).
 */
export type SmallerWayId = 'half' | 'someone' | 'home'

export interface SmallerWay {
  id: SmallerWayId
  /** The button's name. */
  label: string
  /** One short line under the name: what this smaller version means. */
  hint: string
  /** What goes in front of the plan's text. */
  prefix: string
}

export const SMALLER_WAYS: readonly SmallerWay[] = [
  { id: 'half', label: 'Do half of it', hint: 'Just the first bit, for now.', prefix: 'Half of it:' },
  { id: 'someone', label: 'With someone first', hint: 'A friend or a grown-up does it with you.', prefix: 'With someone first:' },
  { id: 'home', label: 'Practise at home first', hint: 'Try it out where it feels cosy.', prefix: 'Practise at home first:' },
]

export const WRITE_MY_OWN = 'Write my own'
/** The line under "Write my own". */
export const WRITE_MY_OWN_HINT = 'Any step that feels a bit smaller.'

/** The plan's own words without a smaller-way prefix (so making it smaller twice reads well). */
export function baseText(text: string): string {
  let t = text.trim()
  let changed = true
  while (changed) {
    changed = false
    for (const way of SMALLER_WAYS) {
      if (t.toLowerCase().startsWith(way.prefix.toLowerCase())) {
        const rest = t.slice(way.prefix.length).trim()
        if (rest) {
          t = rest
          changed = true
        }
      }
    }
  }
  return t
}

/** The smaller plan's text for one of the ways, e.g. "With someone first: Sleep with the light off". */
export function smallerText(way: SmallerWayId, text: string): string {
  const w = SMALLER_WAYS.find((x) => x.id === way) ?? SMALLER_WAYS[0]
  const base = baseText(text)
  return base ? `${w.prefix} ${base}` : w.label
}
