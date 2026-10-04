/**
 * Words on the Trail Map. Narrator copy: plain, warm, no morals, no clocks, no counts except the
 * stones a hidden part of the trail still needs (in words, gently). The hidden-trail line is the
 * brief's exact wording; the sunset card is the goat's own line (content/goatLines.ts).
 */
import type { ZoneId } from '../../game/types'

export const ZONE_NAMES: Record<ZoneId, string> = {
  meadow: 'Meadow Slopes',
  hollow: 'Firefly Hollow',
  crumble: 'Crumble Cliffs',
  ridge: 'Gusty Ridge',
  cloud: 'Cloud Steps',
  summit: 'The Summit',
}

const NUMBER_WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
]

/** "three" for 3; digits past sixteen (never needed: the last pitch needs fourteen). */
export function numberWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n)
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)
/** A title as the end of a sentence: no extra full stop after its own "?" or "!". */
const end = (title: string): string => (/[.!?…]$/.test(title) ? title : `${title}.`)

export const MAP_COPY = {
  title: 'Trail Map',
  /** Under the title; "pitch" is a glossary word (its first mention shows the definition). */
  introBefore: 'Tap a glowing ',
  introAfter: ' to climb it.',
  introNight: 'By moonlight, every part of the trail is open.',
  day: 'Day',
  night: 'Night',
  toggleLabel: 'Climb by day or by night',
  sceneLabel: (mountain: string) => `A map of ${mountain}, with Sky Lake at the very top.`,
  climb: (n: number) => `Climb Pitch ${n}`,
  climbNight: (n: number) => `Climb Pitch ${n} by moonlight`,
  replay: 'Watch the Sky Lake ending again',
  camp: 'Camp',
  skyLake: 'Sky Lake',
  youAreHere: 'You are here',
  marker: {
    sent: (n: number, title: string) => `Pitch ${n}, ${end(title)} Sent! Tap to climb it again.`,
    open: (n: number, title: string) => `Pitch ${n}, ${end(title)} Tap to climb.`,
    nightSent: (n: number, title: string) => `Pitch ${n}, ${end(title)} Sent by moonlight. Tap to climb it again.`,
    night: (n: number, title: string) => `Pitch ${n}, ${end(title)} Tap to climb by moonlight.`,
    hidden: (n: number) => `Pitch ${n}, hidden in the fog.`,
  },
  locked: {
    /** Exactly the brief's words. */
    text: 'The trail ahead is hidden. Add a stone to your cairn to find the way.',
    more: (n: number) => (n === 1 ? 'One more stone and the fog lifts here.' : `${cap(numberWord(n))} more stones and the fog lifts here.`),
    log: 'Log a brave thing',
    ok: 'Okay',
  },
} as const
