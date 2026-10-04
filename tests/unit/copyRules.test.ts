/**
 * House rules for every word shown on screen outside the goat's lines:
 *
 * - Teach by doing: narrator copy (screens, cards, badges, the Hall, the finale) states no morals.
 *   Any "why" is the goat's, at most one a camp. The one exception is the brief's own Beta Map line
 *   ("Every whipper got you here.").
 * - Curly apostrophes on screen (’), never a straight one between letters. Goat lines are written
 *   straight and turned curly by the line picker, so they are checked in goatVoice.test.ts instead.
 */
import { describe, expect, it } from 'vitest'
import { BADGES } from '../../src/content/badges'
import { CHEER } from '../../src/content/cheer'
import { CAMP_COPY, GATE_COPY, RECOVERY_COPY, SETUP_COPY } from '../../src/content/copy'
import { FALL_POSES } from '../../src/content/fallPoses'
import { glossary } from '../../src/content/glossary'
import { HAPPENED_CHIPS } from '../../src/content/happenedChips'
import { IDEAS, IDEA_GROUPS, OOPS_INTRO } from '../../src/content/ideas'
import { LEARN_CHIPS } from '../../src/content/learnChips'
import { GOAT_NAMES, MOUNTAIN_NAMES } from '../../src/content/names'
import { SMALLER_WAYS, WRITE_MY_OWN, WRITE_MY_OWN_HINT } from '../../src/content/smaller'
import { UNLOCKABLES, VARIANT_COLOURS } from '../../src/content/unlockables'
import { PITCHES } from '../../src/game/levels'
import { CAIRN_COPY, STORY_COPY, WEATHER_COPY } from '../../src/screens/cairn/copy'
import { CLIMB_COPY, LESSON_COPY } from '../../src/screens/climb/copy'
import { FINALE_COPY } from '../../src/screens/finale/copy'
import { BADGES_COPY, BADGE_HOW, HALL_COPY, LETTERS_COPY } from '../../src/screens/flops/copy'
import { LOG_COPY, PLANS_COPY } from '../../src/screens/log/copy'
import { MAP_COPY, ZONE_NAMES } from '../../src/screens/map/copy'
import { PARENT_COPY } from '../../src/screens/parent/copy'
import { IMPORT_ERRORS } from '../../src/storage/backup'
import { LOAD_MESSAGES, NEWER_VERSION, NOT_A_SAVE } from '../../src/storage/migrations'
import { plain } from './voice'

/** Every string in a value as [path, text]; templates are called with sample arguments. */
function strings(value: unknown, path: string, out: [string, string][] = []): [string, string][] {
  if (typeof value === 'string') out.push([path, value])
  else if (typeof value === 'function') {
    const fn = value as (...args: unknown[]) => unknown
    for (const sample of [1, 2, 'Pebble']) {
      let r: unknown
      try {
        r = fn(...Array<unknown>(Math.max(1, fn.length)).fill(sample))
      } catch {
        continue
      }
      strings(r, `${path}(${sample})`, out)
    }
  } else if (Array.isArray(value)) value.forEach((v, i) => strings(v, `${path}[${i}]`, out))
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) strings(v, `${path}.${k}`, out)
  return out
}

/** What the narrator says to her (screens, cards, badges, the Hall, the finale, the map). */
const KID_NARRATOR = {
  SETUP_COPY,
  CAMP_COPY,
  CLIMB_COPY,
  LESSON_COPY,
  CAIRN_COPY,
  STORY_COPY,
  WEATHER_COPY,
  FINALE_COPY,
  HALL_COPY,
  LETTERS_COPY,
  BADGE_HOW,
  BADGES_COPY,
  LOG_COPY,
  PLANS_COPY,
  MAP_COPY,
  ZONE_NAMES,
  BADGES: BADGES.map((b) => ({ name: b.name, description: b.description })),
  IDEA_GROUPS,
  OOPS_INTRO,
  glossary,
}

/** Everything shown on screen apart from the goat's lines. */
const DISPLAYED = {
  ...KID_NARRATOR,
  GATE_COPY,
  RECOVERY_COPY,
  PARENT_COPY,
  CHEER,
  FALL_POSES: FALL_POSES.map((p) => ({ name: p.name, description: p.description })),
  IDEAS: IDEAS.map((i) => i.text),
  HAPPENED_CHIPS,
  LEARN_CHIPS,
  GOAT_NAMES,
  MOUNTAIN_NAMES,
  SMALLER_WAYS,
  WRITE_MY_OWN,
  WRITE_MY_OWN_HINT,
  UNLOCKABLES: UNLOCKABLES.map((u) => u.name),
  VARIANT_COLOURS: VARIANT_COLOURS.map((c) => c.name),
  PITCH_TITLES: PITCHES.map((p) => p.title),
  IMPORT_ERRORS,
  LOAD_MESSAGES,
  NEWER_VERSION,
  NOT_A_SAVE,
}

/** A narrator stating a lesson ("That is how climbers learn a mountain.", "Clever climbers do that."). */
const NARRATOR_MORAL =
  /\b(is|are) how\b|that'?s how|that is how|means (you|we)'?r?e? ?learn|taught (you|your)|real climbers|clever climbers|good climbers|the world kept turning|you tried (it|them) anyway|every (one|try|fall|flop|leap|whipper|stone|attempt) (taught|helps|helped|counts as much)|falls count as much|is how (you|we|everyone|everybody) learn|the point is|the lesson|the moral/i

/** The brief's own Beta Map words (and their one-attempt form). */
const BRIEF_LINES = new Set(['every whipper got you here.', 'every leap got you here.'])

describe('narrator copy', () => {
  const kid = Object.entries(KID_NARRATOR).flatMap(([name, v]) => strings(v, name))

  it('finds the copy it checks', () => {
    expect(kid.length).toBeGreaterThan(300)
  })

  it('states no morals (the goat says any why, at camp)', () => {
    for (const [path, text] of kid) {
      if (BRIEF_LINES.has(plain(text))) continue
      expect(plain(text), path).not.toMatch(NARRATOR_MORAL)
    }
  })

  it('never mentions the grown-ups’ recovery code (it lives on their pages only)', () => {
    for (const [path, text] of kid) expect(plain(text), path).not.toMatch(/recovery|forgot pin/)
  })

  it('catches the narrator morals it is meant to', () => {
    for (const bad of [
      'Fifty tries! That is how climbers learn a mountain.',
      'Not today turned into a smaller step. Clever climbers do that.',
      'You made a mistake on purpose, and the world kept turning.',
      'Ten tries on the rock. Every one taught your feet something.',
      'You asked for a tip. Real climbers swap beta all the time.',
      'Brave things that didn’t go to plan. You tried them anyway.',
    ]) {
      expect(plain(bad), bad).toMatch(NARRATOR_MORAL)
    }
  })

  it('tells her the attempt rule as it is: every fall and every send counts', () => {
    for (const id of ['attempts-10', 'attempts-50', 'attempts-100'] as const) {
      const how = plain(BADGE_HOW[id])
      expect(how, id).toContain('fall')
      expect(how, id).toContain('send')
      expect(how, id).not.toMatch(/landing|landed|every leap/)
    }
  })
})

describe('apostrophes on screen', () => {
  const all = Object.entries(DISPLAYED).flatMap(([name, v]) => strings(v, name))

  it('are curly, never straight between letters', () => {
    expect(all.length).toBeGreaterThan(600)
    for (const [path, text] of all) expect(text, `${path}: ${text}`).not.toMatch(/[A-Za-z]'[A-Za-z]/)
  })
})
