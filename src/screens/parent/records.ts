/**
 * The grown-ups' own records and settings rules: Grown-ups' Wing flops, extra idea cards, taking back
 * a letter before it's opened, the daily-minutes stepper and the test-mode switch. Pure functions
 * over SaveData (call them inside update()); unit-tested (tests/unit/parentRecords.test.ts).
 * Nothing here ever touches her brave things, stones or stats.
 */
import { pruneGear } from '../../game/art/gear'
import { clearTestRuns } from '../../model/attempts'
import { newId } from '../../model/ids'
import { unlockedGear } from '../../model/unlockables'
import { DEFAULT_DAILY_MINUTES, type CustomIdea, type GrownupFlop, type SaveData } from '../../storage/schema'

// ---------------------------------------------------------------------------------------------
// Settings

export const MIN_MINUTES = 5
export const MAX_MINUTES = 120
export const MINUTES_STEP = 5
/** The stepper's value one step past the most minutes stands for "No limit" (saved as 0). */
export const NO_LIMIT_STEP = MAX_MINUTES + MINUTES_STEP

/** Saved minutes → stepper value (5–120 in fives, or NO_LIMIT_STEP for 0 = no limit). */
export function minutesToStep(saved: number): number {
  if (saved === 0) return NO_LIMIT_STEP
  const m = Number.isFinite(saved) && saved > 0 ? saved : DEFAULT_DAILY_MINUTES
  return Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, Math.round(m / MINUTES_STEP) * MINUTES_STEP))
}

/** Stepper value → saved minutes (0 = no limit). */
export function stepToMinutes(step: number): number {
  return step >= NO_LIMIT_STEP ? 0 : step
}

/**
 * Test mode on or off. Climbs in test mode live in scratch runs beside the save (never written), so
 * they're forgotten whenever the switch moves: her real runs, stats and stones are exactly as she
 * left them. Turning it off also takes off any gear tried on in test mode that her own stones haven't
 * unlocked (climber.ts draws whatever look.gear holds, on every screen).
 */
export function applyTestMode(d: SaveData, on: boolean): void {
  d.testMode = on
  clearTestRuns(d)
  if (!on) d.profile.look.gear = pruneGear(d.profile.look.gear, new Set(unlockedGear(d).map((g) => g.id)))
}

// ---------------------------------------------------------------------------------------------
// Grown-ups' Wing, idea cards, letters

/** The ideas screen's rule: an idea card is at most this many words. */
export const MAX_IDEA_WORDS = 12
/** Characters an idea card's field takes (12 long words fit). */
export const MAX_IDEA_CHARS = 90
export const MAX_FLOP_TEXT = 300

const tidy = (s: string): string => s.trim().replace(/[ \t]+/g, ' ')

export function wordsIn(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

export interface FlopInput {
  who: string
  what: string
  learned: string
}

/** Hang a flop in the Grown-ups' Wing. Null when there's nothing to say. */
export function addGrownupFlop(d: SaveData, input: FlopInput, now: Date): GrownupFlop | null {
  const what = tidy(input.what)
  if (!what) return null
  const flop: GrownupFlop = {
    id: newId('g'),
    createdAt: now.toISOString(),
    who: tidy(input.who),
    what: what.slice(0, MAX_FLOP_TEXT),
    learned: tidy(input.learned).slice(0, MAX_FLOP_TEXT),
  }
  d.grownupFlops.push(flop)
  return flop
}

/** Change a flop's words (it keeps its id, date and place on the wall). False if it's gone. */
export function editGrownupFlop(d: SaveData, id: string, input: FlopInput): boolean {
  const flop = d.grownupFlops.find((f) => f.id === id)
  const what = tidy(input.what)
  if (!flop || !what) return false
  flop.who = tidy(input.who)
  flop.what = what.slice(0, MAX_FLOP_TEXT)
  flop.learned = tidy(input.learned).slice(0, MAX_FLOP_TEXT)
  return true
}

export function removeGrownupFlop(d: SaveData, id: string): boolean {
  const i = d.grownupFlops.findIndex((f) => f.id === id)
  if (i < 0) return false
  d.grownupFlops.splice(i, 1)
  return true
}

/**
 * An idea card's words, tidied to look like the built-in cards: one line, single spaces, a capital
 * first letter, no full stop at the end.
 */
export function tidyIdea(text: string): string {
  const t = text
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\.+$/, '')
    .trim()
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : ''
}

/**
 * Add an idea card she can pick from (never a task). Null when it's empty or longer than
 * MAX_IDEA_WORDS words.
 */
export function addCustomIdea(d: SaveData, text: string, oops: boolean, now: Date): CustomIdea | null {
  const t = tidyIdea(text).slice(0, MAX_IDEA_CHARS)
  if (!t || wordsIn(t) > MAX_IDEA_WORDS) return null
  const idea: CustomIdea = { id: newId('i'), createdAt: now.toISOString(), text: t, oops: Boolean(oops) }
  d.customIdeas.push(idea)
  return idea
}

/** Remove an idea card. Brave things she already logged from it keep their own words. */
export function removeCustomIdea(d: SaveData, id: string): boolean {
  const i = d.customIdeas.findIndex((x) => x.id === id)
  if (i < 0) return false
  d.customIdeas.splice(i, 1)
  return true
}

/** Take back a letter she hasn't opened yet (no stone exists for it). Opened letters always stay. */
export function takeBackLetter(d: SaveData, id: string): boolean {
  const i = d.letters.findIndex((l) => l.id === id)
  if (i < 0 || d.letters[i].openedAt || d.letters[i].stoneDay) return false
  d.letters.splice(i, 1)
  return true
}
