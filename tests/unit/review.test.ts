/**
 * REVIEW.md: every built-in brave idea, Oops Mission and goat line in one place, grouped the way
 * they come up in the game, for a grown-up to read through.
 *
 * The file is built here from the real content (src/content/ideas.ts, src/content/goatLines.ts),
 * so it can't drift: this test fails while the committed REVIEW.md differs from what the content
 * gives, and `npm run review` (UPDATE_REVIEW=1) writes it instead.
 *
 * Every goat-spoken string lives in content/goatLines.ts: the picker's groups (GOAT_LINES) and the
 * story beats (SCRIPTED), some of which also sit inside a group. layoutGoat() below places each one
 * under the moment it is said; a new group or story beat fails the test until it is placed here,
 * and nothing may be placed twice.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FALL_POSES } from '../../src/content/fallPoses'
import { GOAT_LINES, GOAT_MOMENTS, SCRIPTED, type GoatLine, type GoatMoment, type ScriptedKey } from '../../src/content/goatLines'
import { IDEAS, IDEA_GROUPS, OOPS_INTRO } from '../../src/content/ideas'
import type { WhipperKind } from '../../src/game/events'
import { PITCHES } from '../../src/game/levels'
import type { LooksScaryKind } from '../../src/game/types'
import { typeset } from '../../src/model/goatVoice'
import { LOG_COPY, PLANS_COPY } from '../../src/screens/log/copy'
import { ZONE_NAMES } from '../../src/screens/map/copy'

const REVIEW_PATH = join(__dirname, '..', '..', 'REVIEW.md')

// ---------------------------------------------------------------------------------------------
// The shape of the file

interface Bullet {
  text: string
  notes: string[]
}
/** A run of lines, with an optional label ("Before:") when a group has more than one. */
interface Part {
  label?: string
  bullets: Bullet[]
}
interface Group {
  title: string
  /** When the goat says these, in one plain line. */
  when: string
  /** What fills each {slot} in these lines. */
  fills?: string
  parts: Part[]
}
interface Section {
  title: string
  intro?: string
  groups: Group[]
}

/** Where a line is said: the "out of the backpack" tag means a night climb or camp after Sky Lake. */
type Where = 'climb' | 'camp'

/** Markdown-significant characters, escaped so a line shows exactly as written. */
function md(text: string): string {
  return text.replace(/([\\`*_<[\]])/g, '\\$1')
}

function slotsIn(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((m) => `{${m[1]}}`)
}

const WHIPPER_NOTE: Record<WhipperKind, string> = {
  rope: 'only when the rope catches her',
  slip: 'only when she slips onto a lower spot',
  crumble: 'only when a crumbly ledge gives way',
}

/** What each Looks Scary moment looks like, and what it turns out to be. */
const SCARY: Record<LooksScaryKind, { title: string; what: string }> = {
  bigleap: { title: 'The huge gap', what: 'The first Big Leap looks like a huge gap above a misty drop. Up close, it’s an easy hop.' },
  eyes: { title: 'Glowing eyes', what: 'Glowing eyes in a dark cave. They’re fireflies.' },
  rumble: { title: 'The rumbling cliff', what: 'The whole cliff rumbles and growls. It’s a bear, snoring in its cave.' },
  bridge: { title: 'The rickety rope bridge', what: 'A wobbly, creaking rope bridge. It holds.' },
  shadow: { title: 'The giant shadow', what: 'A giant shadow in the fog. It’s a fluffy marmot with the sun behind it.' },
}

/** The pitch that holds each Looks Scary moment, in climbing order (from the level data). */
const SCARY_PITCHES = PITCHES.filter((p) => p.looksScary).map((p) => ({
  kind: (p.looksScary as NonNullable<typeof p.looksScary>).kind,
  where: `${ZONE_NAMES[p.zone]}, Pitch ${p.index}`,
}))

/** The notes on a line, from its tags. `inScaryGroup`: the group is already that Looks Scary moment's. */
function tagNotes(l: GoatLine, where: Where, inScaryGroup: boolean): string[] {
  const out: string[] = []
  if (l.moral) out.push('moral')
  if (l.zone) out.push(l.zone === 'summit' ? 'only on the summit pitch' : `only in ${ZONE_NAMES[l.zone]}`)
  if (l.scary && !inScaryGroup) out.push(`only at ${SCARY[l.scary].title.toLowerCase()}`)
  if (l.whipper) out.push(WHIPPER_NOTE[l.whipper])
  if (l.pack) out.push('only while the goat is in the backpack')
  if (l.out) {
    out.push(where === 'climb' ? 'only on night climbs, with the goat climbing beside her' : 'only after Sky Lake, with the goat out beside her')
  }
  return out
}

// ---------------------------------------------------------------------------------------------
// Placing the goat's lines

/** How many times each line was placed: `aim[3]` (GOAT_LINES) or `SCRIPTED.named` / `SCRIPTED.meet[1]`. */
type Placed = Map<string, number>

function scriptedRefs(key: ScriptedKey): { ref: string; text: string }[] {
  const v: string | readonly string[] = SCRIPTED[key]
  return typeof v === 'string' ? [{ ref: `SCRIPTED.${key}`, text: v }] : v.map((text, i) => ({ ref: `SCRIPTED.${key}[${i}]`, text }))
}

function layoutGoat(placed: Placed): Section[] {
  const mark = (ref: string) => placed.set(ref, (placed.get(ref) ?? 0) + 1)

  /**
   * The lines of one group (optionally only some of them), with their tags as notes. `beats` notes
   * the group's scripted story beats, in order; `scary` marks a group that is one Looks Scary moment's.
   */
  const lines = (
    moment: GoatMoment,
    where: Where,
    opts: { only?: (l: GoatLine) => boolean; beats?: readonly string[]; scary?: boolean } = {},
  ): Bullet[] => {
    const out: Bullet[] = []
    let beat = 0
    GOAT_LINES[moment].forEach((l, i) => {
      if (opts.only && !opts.only(l)) return
      mark(`${moment}[${i}]`)
      const notes: string[] = []
      if (l.scripted) {
        const note = opts.beats?.[beat++]
        if (note) notes.push(note)
      }
      notes.push(...tagNotes(l, where, opts.scary === true))
      out.push({ text: typeset(l.text), notes })
    })
    return out
  }

  /** A story beat that isn't part of any group (said once, at its moment). */
  const beat = (key: ScriptedKey, notes: readonly string[] = []): Bullet[] =>
    scriptedRefs(key).map(({ ref, text }, i) => {
      mark(ref)
      return { text: typeset(text), notes: notes[i] ? [notes[i]] : [] }
    })

  const one = (bullets: Bullet[]): Part[] => [{ bullets }]
  const isScripted = (l: GoatLine) => l.scripted === true
  const notScripted = (l: GoatLine) => !l.scripted
  const generic = (l: GoatLine) => l.scary === undefined

  const firstRun: Section = {
    title: 'First run',
    intro: 'Setup, once a grown-up has handed it over.',
    groups: [
      {
        title: 'Meeting the goat',
        when: 'After she designs her climber, the goat peeks out of the backpack. She taps Next between the lines.',
        parts: one(lines('meet', 'camp')),
      },
      {
        title: 'Naming the goat',
        when: 'She has just typed a name for the goat.',
        fills: '{goat} is the name she gave it.',
        parts: one(beat('named')),
      },
      {
        title: 'Naming her mountain',
        when: 'On the screen where she names her mountain.',
        parts: one(beat('mountain')),
      },
    ],
  }

  const lesson: Section = {
    title: 'The lesson',
    intro: 'The short lesson at the end of setup: one leap up to a ledge, then fall practice.',
    groups: [
      {
        title: 'Learning to leap',
        when: 'The lesson starts with the first line. If she waits 6 seconds without leaping, the goat says one of the others.',
        parts: one(lines('lesson', 'climb', { beats: ['said first'] })),
      },
      {
        title: 'The first leap lands',
        when: 'Her first leap in the lesson lands on the ledge.',
        parts: one(beat('lessonLanded')),
      },
      {
        title: 'Fall practice',
        when: 'Two seconds later: fall practice, from a spot where every leap ends on the rope.',
        parts: one(beat('lessonFall')),
      },
      {
        title: 'The rope’s first catch',
        when: 'The first time the rope ever catches her (the lesson’s fall practice). It says why the rope is there.',
        parts: one(lines('rope', 'climb')),
      },
    ],
  }

  const endOfSetup: Section = {
    title: 'The end of setup',
    groups: [
      {
        title: 'Brave versus dangerous',
        when: 'The setup screen that says brave means safe but scary, and that if something could really hurt her or someone else, the brave move is to stop and tell a grown-up.',
        parts: one(beat('brave')),
      },
      {
        title: 'Off to Pitch 1',
        when: 'The last setup screen, just before Pitch 1.',
        parts: one(beat('cheer')),
      },
    ],
  }

  const climbing: Section = {
    title: 'Climbing',
    intro: 'On a pitch, in a small bubble beside her. Each group says when its lines come up; the chattier ones only now and then.',
    groups: [
      {
        title: 'Aiming',
        when: 'She drags back to aim: her first aim on a climb, then about every fourth new spot she aims from.',
        parts: one(lines('aim', 'climb')),
      },
      {
        title: 'Aiming at a Big Leap',
        when: 'The first time she aims at each Big Leap on a climb (the camera pulls back and her knees wobble).',
        parts: one(lines('aimBigLeap', 'climb')),
      },
      {
        title: 'A Big Leap lands',
        when: 'A Big Leap lands across its gap.',
        fills: '{n} is how many goes it took at that gap.',
        parts: one(lines('bigLeapLanded', 'climb')),
      },
      {
        title: 'A Big Leap tried, not landed',
        when: 'She leapt for a Big Leap and fell. Trying one counts as brave whether or not she lands it.',
        parts: one(lines('bigLeapMissed', 'climb')),
      },
      {
        title: 'Landing',
        when: 'A leap lands on the next spot up: always when it took 2 or more tries there (the {n} lines), otherwise about one landing in three.',
        fills: '{n} is how many tries it took at that spot.',
        parts: one(lines('land', 'climb')),
      },
      {
        title: 'A little hop',
        when: 'A leap comes back down on the ledge it started from (it isn’t counted as an attempt): every third hop on a pitch, every hop in the lesson.',
        parts: one(lines('hop', 'climb')),
      },
      {
        title: 'Reaching a camp',
        when: 'She reaches a new camp partway up a pitch. The rope ties on there, so a fall only brings her back to it.',
        parts: one(lines('campReached', 'climb')),
      },
      {
        title: 'Falling',
        when: 'A whipper, on most falls: the rope catches her, she slips onto a lower spot, or a crumbly ledge gives way. The rope’s first catch, falls at a Big Leap and every second fall at one spot have their own lines.',
        fills: `{pose} is the name of the fall pose she just did, like “${FALL_POSES[0].name}”.`,
        parts: one(lines('fall', 'climb')),
      },
      {
        title: 'Falling again at the same spot',
        when: 'Every second fall at the same spot (the 2nd, 4th, 6th…).',
        fills: '{n} is how many times she has fallen at that spot.',
        parts: one(lines('repeatFall', 'climb')),
      },
      {
        title: 'Offering beta',
        when: 'After 3 falls at one spot, as the hint button appears. Hints are free.',
        parts: one(lines('betaOffer', 'climb')),
      },
      {
        title: 'Beta hints',
        when: 'She taps the hint button. The goat looks at how her last leap from that spot missed and says a line from the matching group.',
        parts: [
          { label: 'Too short', bullets: lines('hintShort', 'climb') },
          { label: 'Too far', bullets: lines('hintLong', 'climb') },
          { label: 'Too steep (lots of up, not much across)', bullets: lines('hintSteep', 'climb') },
          { label: 'Too flat', bullets: lines('hintFlat', 'climb') },
          { label: 'Bumped into a ledge on the way', bullets: lines('hintBumped', 'climb') },
          { label: 'Pushed by a gust', bullets: lines('hintGust', 'climb') },
          { label: 'The ledge crumbled under her', bullets: lines('hintCrumbled', 'climb') },
        ],
      },
      {
        title: 'Offering a ghost leap',
        when: 'After 6 falls at one spot: the goat offers a faint, see-through leap that works.',
        parts: one(lines('ghost', 'climb')),
      },
      {
        title: 'Finding a hidden hold',
        when: 'A fall reveals a hidden shortcut hold. The first line comes with the first one she finds on a climb; after that, one of the others.',
        parts: one(lines('hiddenHold', 'climb', { beats: ['the first one on a climb'] })),
      },
      {
        title: 'A crumbly ledge',
        when: 'The first time she lands on each crumbly ledge (from then on it’s drawn cracked).',
        parts: one(lines('crumbleFound', 'climb')),
      },
      {
        title: 'A gust is coming',
        when: 'On windy pitches, as a gust starts near her while she’s standing ready (at most once every 45 seconds).',
        parts: one(lines('gustSoon', 'climb')),
      },
      {
        title: 'The send: the top of a pitch',
        when: 'She reaches the top of the pitch. The Beta Map follows.',
        fills: '{n} is her attempts on this pitch, the send included.',
        parts: one(lines('send', 'climb')),
      },
      {
        title: 'Sunset',
        when: 'The day’s climbing time is used up, once she finishes the attempt she’s on. The first line is the first time each day; if she taps Climb again, one of the others.',
        parts: one(lines('sunset', 'climb', { beats: ['the first time each day'] })),
      },
    ],
  }

  const scaryGroups: Group[] = SCARY_PITCHES.map(({ kind, where }) => {
    const ofKind = (l: GoatLine) => l.scary === kind
    return {
      title: `${SCARY[kind].title}: ${where}`,
      when: SCARY[kind].what,
      parts: [
        { label: 'Before, as it comes into view', bullets: lines('looksScaryBefore', 'climb', { only: ofKind, scary: true }) },
        { label: 'After, up close', bullets: lines('looksScaryAfter', 'climb', { only: ofKind, scary: true }) },
      ],
    }
  })
  const looksScary: Section = {
    title: 'Looks Scary',
    intro:
      'One moment in each of the first five zones, on the middle pitch: something looks scary from below and turns out gentle up close. Before it, she gives a Fear Forecast; after it, she’s asked “How scary was it really?”. The first time she meets each one, the goat only says that moment’s own lines.',
    groups: [
      ...scaryGroups,
      {
        title: 'Any of the five, on later climbs',
        when: 'Climbing past a moment she has met before, the goat may also say one of these.',
        parts: [
          { label: 'Before, as it comes into view', bullets: lines('looksScaryBefore', 'climb', { only: generic }) },
          { label: 'After, up close', bullets: lines('looksScaryAfter', 'climb', { only: generic }) },
        ],
      },
    ],
  }

  const camp: Section = {
    title: 'Camp',
    intro: 'At camp and the screens around it: logging a brave thing, the cairn and Plans.',
    groups: [
      {
        title: 'The first visit to camp',
        when: 'Her very first visit to camp: the goat points out where they’re going.',
        parts: one(lines('firstCamp', 'camp')),
      },
      {
        title: 'Sitting at camp',
        when: 'One line each visit to camp, and another each time she taps the picture. At most one moral per visit.',
        parts: one(lines('campIdle', 'camp')),
      },
      {
        title: 'Saving a plan',
        when: `Logging a brave thing, she chose “${LOG_COPY.when.later}”: it goes to her Plans, and the goat greets it there.`,
        parts: one(lines('planSaved', 'camp')),
      },
      {
        title: 'A brave thing that flopped',
        when: `Logging a brave thing she has done, she chose “${LOG_COPY.outcome.flopped}”. Said with respect, never as a joke.`,
        parts: one(lines('flopLogged', 'camp')),
      },
      {
        title: 'A stone lands on the cairn',
        when: 'A new stone lands on her cairn. The goat never mentions her fear numbers or how it went.',
        fills: '{thing} is the first few words of the brave thing (lines with it are skipped for a letter’s stone); {n} is how many stones the cairn holds now.',
        parts: one(lines('stoneAdded', 'camp')),
      },
      {
        title: 'The cairn is full for today',
        when: 'A new stone is over the day’s limit of three, so it waits beside the cairn.',
        parts: one(lines('stoneWaiting', 'camp', { beats: ['when it goes on tomorrow', 'when other stones are already waiting ahead of it'] })),
      },
      {
        title: 'Visiting the cairn',
        when: 'She opens the cairn and no new stone is arriving.',
        parts: one(lines('cairnVisit', 'camp')),
      },
      {
        title: 'The empty cairn',
        when: 'She opens the cairn before her first stone.',
        parts: one(lines('cairnEmpty', 'camp')),
      },
      {
        title: 'Not today',
        when: `She taps “${PLANS_COPY.notToday}” on a plan. It costs nothing. The first line is always said; a few seconds later, one of the others.`,
        parts: one(lines('notToday', 'camp', { beats: ['always said first'] })),
      },
      {
        title: 'Make it smaller',
        when: `She taps “${PLANS_COPY.smaller}” on a plan and picks a smaller step (half of it, with someone first, practise at home first, or her own).`,
        parts: one(lines('smaller', 'camp')),
      },
    ],
  }

  const skyLake: Section = {
    title: 'Sky Lake',
    intro: 'The top of the mountain.',
    groups: [
      {
        title: 'The Sky Lake finale',
        when: 'Her first send of the summit pitch, in this order.',
        parts: one(
          lines('summit', 'camp', {
            only: isScripted,
            beats: ['arriving at Sky Lake', 'before the goat’s own wobbly leap', 'the splash', 'on the closing card'],
          }),
        ),
      },
      {
        title: 'The night ending',
        when: 'Sending the summit pitch on a night climb (after Sky Lake): a short ending where they both splash in.',
        parts: one(beat('nightSplash')),
      },
      {
        title: 'Remembering Sky Lake',
        when: 'At camp after Sky Lake, on the first visit of each day.',
        fills: '{mountain} is the name she gave her mountain.',
        parts: one(lines('summit', 'camp', { only: notScripted })),
      },
    ],
  }

  return [firstRun, lesson, endOfSetup, climbing, looksScary, camp, skyLake]
}

// ---------------------------------------------------------------------------------------------
// Writing it out

function countGroup(g: Group): number {
  return g.parts.reduce((n, p) => n + p.bullets.length, 0)
}
function countSection(s: Section): number {
  return s.groups.reduce((n, g) => n + countGroup(g), 0)
}
function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

function bulletLine(b: Bullet): string {
  return `- ${md(b.text)}${b.notes.length ? ` *(${b.notes.join('; ')})*` : ''}`
}

function buildReview(): { markdown: string; placed: Placed; goat: Section[] } {
  const placed: Placed = new Map()
  const goat = layoutGoat(placed)
  const braveGroups = IDEA_GROUPS.filter((g) => g.id !== 'oops').map((g) => ({ title: g.title, ideas: IDEAS.filter((i) => i.group === g.id) }))
  const oopsGroup = IDEA_GROUPS.find((g) => g.id === 'oops')
  const oops = IDEAS.filter((i) => i.group === 'oops')
  const braveCount = braveGroups.reduce((n, g) => n + g.ideas.length, 0)
  const goatCount = goat.reduce((n, s) => n + countSection(s), 0)
  const goatGroups = goat.reduce((n, s) => n + s.groups.length, 0)
  const idea = (i: { text: string; id: string }) => `- ${md(i.text)} <sub>\`${i.id}\`</sub>`

  const out: string[] = []
  const para = (...lines: string[]) => out.push(...lines, '')

  para('# Up Anyway: every brave idea, Oops Mission and goat line')
  para(
    'Every built-in idea card she can pick and everything the goat says, in one place, grouped the way they come up in the game and written the way she sees them.',
  )
  para(
    `- ${plural(braveCount, 'brave idea', 'brave ideas')} in ${braveGroups.length} groups`,
    `- ${plural(oops.length, 'Oops Mission', 'Oops Missions')}`,
    `- ${plural(goatCount, 'goat line', 'goat lines')} in ${goatGroups} groups`,
  )
  para('**This file is generated from the game’s content. Don’t edit it by hand.**')
  para(
    '- To change the words, edit `src/content/ideas.ts` (brave ideas and Oops Missions) or `src/content/goatLines.ts` (everything the goat says), then run `npm run review` to rebuild this file.',
    '- The layout (the groups, their order and the notes on when the goat says each line) lives in `tests/unit/review.test.ts`.',
    '- `npx vitest run` fails while this file is out of date, so it always matches the game.',
  )
  para(
    '**Hiding a card:** Grown-ups → Idea cards → Built-in idea cards lists the same cards in the same groups and order, each with a Shown/Hidden switch. A hidden card is never deleted and can be shown again any time. The small code after each card here is its id.',
  )

  para(`## 1. Brave ideas (${braveCount})`)
  para(
    `Her “${LOG_COPY.ideas.title}” screen (from Log a brave thing), in its groups and order. It always starts with this line:`,
  )
  para(`> **${md(LOG_COPY.ideas.brave)}** ${md(LOG_COPY.ideas.care)}`)
  para(
    `Cards a grown-up adds in parent mode show under “${LOG_COPY.ideas.extra}”, just before the Oops Missions. They are saved on the device, so they aren’t listed here.`,
  )
  for (const g of braveGroups) {
    para(`### ${g.title} (${g.ideas.length})`)
    para(...g.ideas.map(idea))
  }

  para(`## 2. ${oopsGroup ? oopsGroup.title : 'Oops Missions'} (${oops.length})`)
  para('The last group on her ideas screen: small mistakes made on purpose. Under the heading her screen says:')
  para(`> ${md(OOPS_INTRO)}`)
  para(...oops.map(idea))

  para(`## 3. The goat’s lines (${goatCount})`)
  para(
    'The goat rides in her backpack and is scared of heights: it is the fear, coming along and saying so out loud while the climb goes on anyway. Within a group the goat goes through every line before any comes round again, and never says the same line twice in a row.',
  )
  para(
    'How to read the notes:',
    '',
    '- **{n}**, **{pose}** and the other words in curly brackets are filled in when the line is said; each group says what with. A line is skipped when there’s nothing to fill it with, so the {n} lines only come up once the count is 2 or more.',
    '- *(moral)*: one of the few gentle morals. Only at a camp, and at most one per camp visit.',
    '- *(only while the goat is in the backpack)*: skipped once the goat is out of the backpack, on night climbs and at camp after Sky Lake.',
    '- *(only on night climbs …)* and *(only after Sky Lake …)*: said only once the goat is out of the backpack.',
    '- *(only in Gusty Ridge)* and the like: only in that part of the mountain. *(only when the rope catches her)* and the like: only for that kind of fall.',
  )
  goat.forEach((s, si) => {
    para(`### 3.${si + 1} ${s.title} (${plural(countSection(s), 'line', 'lines')})`)
    if (s.intro) para(s.intro)
    for (const g of s.groups) {
      para(`#### ${g.title} (${countGroup(g)})`)
      para(`*When:* ${md(g.when)}`)
      if (g.fills) para(`*Filled in:* ${md(g.fills)}`)
      for (const p of g.parts) {
        if (p.label) para(`${p.label}:`)
        para(...p.bullets.map(bulletLine))
      }
    }
  })

  // One trailing newline.
  while (out.length && out[out.length - 1] === '') out.pop()
  return { markdown: out.join('\n') + '\n', placed, goat }
}

// ---------------------------------------------------------------------------------------------

const review = buildReview()

describe('REVIEW.md', () => {
  it('places every goat line exactly once', () => {
    const expected = new Map<string, number>()
    for (const m of GOAT_MOMENTS) GOAT_LINES[m].forEach((_, i) => expected.set(`${m}[${i}]`, 1))
    // A story beat that also sits inside a group is listed there, not again on its own.
    const inGroups = new Set(GOAT_MOMENTS.flatMap((m) => GOAT_LINES[m].filter((l) => l.scripted).map((l) => l.text)))
    for (const key of Object.keys(SCRIPTED) as ScriptedKey[]) {
      for (const { ref, text } of scriptedRefs(key)) if (!inGroups.has(text)) expected.set(ref, 1)
    }
    for (const [ref] of expected) {
      expect(review.placed.get(ref) ?? 0, `${ref} must be placed once in layoutGoat() (tests/unit/review.test.ts)`).toBe(1)
    }
    for (const [ref] of review.placed) expect(expected.has(ref), `${ref} is placed but is already listed in its group`).toBe(true)
  })

  it('says what fills every slot, in every group that has one', () => {
    for (const s of review.goat) {
      for (const g of s.groups) {
        const slots = new Set(g.parts.flatMap((p) => p.bullets.flatMap((b) => slotsIn(b.text))))
        for (const slot of slots) expect(`${g.when} ${g.fills ?? ''}`, `${g.title}: say what fills ${slot}`).toContain(slot)
      }
    }
  })

  it('has a Looks Scary group for every moment on the mountain', () => {
    expect(SCARY_PITCHES.map((p) => p.kind).sort()).toEqual((Object.keys(SCARY) as LooksScaryKind[]).sort())
  })

  it('lists every built-in idea card once, in her screen’s groups', () => {
    for (const i of IDEAS) expect(review.markdown.split(`\`${i.id}\``).length - 1, i.id).toBe(1)
    expect(IDEA_GROUPS.map((g) => g.id).sort()).toEqual([...new Set(IDEAS.map((i) => i.group))].sort())
  })

  it('matches the committed file (npm run review rebuilds it)', () => {
    if (process.env.UPDATE_REVIEW === '1') writeFileSync(REVIEW_PATH, review.markdown)
    expect(existsSync(REVIEW_PATH), 'REVIEW.md is missing: run npm run review').toBe(true)
    const current = readFileSync(REVIEW_PATH, 'utf8')
    expect(current === review.markdown, 'REVIEW.md is out of date: run npm run review').toBe(true)
  })
})
