/**
 * The goat's voice: every line and the line picker (PROGRESS.md "Story/voice rules").
 * Scared is allowed and named, going anyway is the move; no banned phrases, no generic praise, no
 * disappointment; ≤ 12 words; at most one moral per camp arrival; no back-to-back repeats.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  GOAT_LINES,
  GOAT_MOMENTS,
  MOMENT_MOOD,
  SCRIPTED,
  SCRIPTED_MOOD,
  type GoatLine,
  type GoatMoment,
  type ScriptedKey,
} from '../../src/content/goatLines'
import type { HintClass } from '../../src/game/beta'
import type { WhipperKind } from '../../src/game/events'
import type { LooksScaryKind, ZoneId } from '../../src/game/types'
import { GoatVoice, hintMoment, scriptedLine, typeset, type GoatContext, type GoatVars } from '../../src/model/goatVoice'
import { mulberry32 } from '../../src/model/rng'
import { MAX_GOAT_WORDS, bannedIn, plain, wordCount } from './voice'

/** Long sample values: the real ones are usually shorter. */
const SAMPLE: Required<GoatVars> = {
  pose: 'The Very Dramatic Swoon',
  n: 12,
  goat: 'Captain Fluff',
  mountain: 'Mount Wobbly Top',
}
const KNOWN_SLOTS = ['pose', 'n', 'goat', 'mountain']

/** The groups the brief names: at least four lines each. */
const BRIEF_GROUPS: GoatMoment[] = [
  'aim',
  'aimBigLeap',
  'land',
  'bigLeapLanded',
  'bigLeapMissed',
  'fall',
  'repeatFall',
  'hintShort',
  'hintLong',
  'hintSteep',
  'hintFlat',
  'hintBumped',
  'hintGust',
  'hintCrumbled',
  'looksScaryBefore',
  'looksScaryAfter',
  'campIdle',
  'stoneAdded',
  'flopLogged',
  'notToday',
  'summit',
]
const HINT_GROUPS: GoatMoment[] = BRIEF_GROUPS.filter((m) => m.startsWith('hint'))
const ALL_MOMENTS: GoatMoment[] = [
  'aim',
  'aimBigLeap',
  'land',
  'bigLeapLanded',
  'bigLeapMissed',
  'fall',
  'repeatFall',
  'hintShort',
  'hintLong',
  'hintSteep',
  'hintFlat',
  'hintBumped',
  'hintGust',
  'hintCrumbled',
  'ghost',
  'looksScaryBefore',
  'looksScaryAfter',
  'campIdle',
  'campReached',
  'stoneAdded',
  'stoneWaiting',
  'flopLogged',
  'notToday',
  'summit',
  'rope',
  'lesson',
  'meet',
  'hiddenHold',
  'sunset',
  'send',
  'firstCamp',
  'crumbleFound',
  'gustSoon',
  'hop',
  'betaOffer',
  'smaller',
  'letter',
]
const SCARY_KINDS: LooksScaryKind[] = ['bigleap', 'eyes', 'rumble', 'bridge', 'shadow']
const ZONES: ZoneId[] = ['meadow', 'hollow', 'crumble', 'ridge', 'cloud', 'summit']
const WHIPPERS: WhipperKind[] = ['rope', 'slip', 'crumble']
const MOODS = ['calm', 'happy', 'scared', 'giggly', 'wobbly']

/** Generic praise names no specific try. */
const GENERIC_PRAISE = [
  'amazing',
  'awesome',
  'perfect',
  'excellent',
  'fantastic',
  'brilliant',
  'superstar',
  'great work',
  'nice work',
  'good work',
  'nicely done',
  'good one',
  'nice one',
  'great one',
  'you did great',
  'proud of you',
  'so proud',
  'good girl',
  'way to go',
  'you rock',
  'super job',
  'bravo',
  'keep it up',
  'nailed it',
]
/** Disappointment, pity, failure words: a flop is information, not a verdict. */
const DISAPPOINTED = /\b(aw+|unlucky|shame|bummer|sadly|sad|sorry|darn|whoops|fail|fails|failed|failure|disappoint\w*|so close|too bad|never ?mind|nearly had|almost had|better luck|what a pity)\b/
/** Orders and nagging: hints are offers. */
const NAGGING = ['you should', 'you must', 'you need to', 'you have to', 'remember to', 'try harder', "don't forget"]

function slotsOf(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1])
}

function fillSample(text: string): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in SAMPLE ? String(SAMPLE[k as keyof GoatVars]) : m))
}

/** Every scripted string as [key, text]. */
function scriptedTexts(): [string, string][] {
  const out: [string, string][] = []
  for (const key of Object.keys(SCRIPTED) as ScriptedKey[]) {
    const v: string | readonly string[] = SCRIPTED[key]
    if (typeof v === 'string') out.push([key, v])
    else v.forEach((t, i) => out.push([`${key}[${i}]`, t]))
  }
  return out
}

const LINES: [string, GoatLine][] = GOAT_MOMENTS.flatMap((m) =>
  GOAT_LINES[m].map((l, i): [string, GoatLine] => [`${m}[${i}]`, l]),
)
const TEXTS: [string, string][] = [...LINES.map(([p, l]): [string, string] => [p, l.text]), ...scriptedTexts()]

/** A line said with no slots filled and no context. */
function isPlain(l: GoatLine): boolean {
  return !l.moral && !l.zone && !l.scary && !l.whipper && !l.pack && !l.out && slotsOf(l.text).length === 0
}
function untagged(l: GoatLine): boolean {
  return !l.moral && !l.zone && !l.scary && !l.whipper && !l.out
}

function voice(seed = 1): GoatVoice {
  return new GoatVoice(mulberry32(seed))
}

/** Which line of `moment` a spoken text came from. */
function lineOf(moment: GoatMoment, text: string, vars: GoatVars = {}): GoatLine {
  const found = GOAT_LINES[moment].find((l) => {
    const re = new RegExp(
      '^' +
        typeset(l.text)
          .replace(/[.*+?^$()|[\]\\]/g, '\\$&')
          .replace(/\{(\w+)\}/g, (_m, k: string) =>
            k in vars ? String(vars[k as keyof GoatVars]).replace(/[.*+?^$()|[\]\\{}]/g, '\\$&') : '.+',
          ) +
        '$',
    )
    return re.test(text)
  })
  if (!found) throw new Error(`"${text}" is not a ${moment} line`)
  return found
}

describe('goat lines: groups', () => {
  it('has exactly the moments the game uses', () => {
    expect([...GOAT_MOMENTS].sort()).toEqual([...ALL_MOMENTS].sort())
    expect(Object.keys(MOMENT_MOOD).sort()).toEqual([...ALL_MOMENTS].sort())
  })

  it('has at least four lines in every group the brief names, and one everywhere else', () => {
    for (const m of ALL_MOMENTS) expect(GOAT_LINES[m].length, m).toBeGreaterThanOrEqual(1)
    for (const m of BRIEF_GROUPS) {
      expect(GOAT_LINES[m].length, m).toBeGreaterThanOrEqual(4)
      // ...and four that fit anywhere (not tied to a zone, a scary kind, a fall kind or a moral).
      expect(GOAT_LINES[m].filter(untagged).length, `${m}: untagged lines`).toBeGreaterThanOrEqual(4)
    }
  })

  it('has 80+ lines in all', () => {
    expect(LINES.length).toBeGreaterThanOrEqual(80)
  })

  it('has a line for every moment that needs no slots and no context', () => {
    for (const m of ALL_MOMENTS) expect(GOAT_LINES[m].some(isPlain), m).toBe(true)
  })

  it('uses moods the bubble knows', () => {
    for (const [p, l] of LINES) if (l.mood) expect(MOODS, p).toContain(l.mood)
    for (const m of ALL_MOMENTS) expect(MOODS, m).toContain(MOMENT_MOOD[m])
    for (const key of Object.keys(SCRIPTED) as ScriptedKey[]) {
      const v: string | readonly string[] = SCRIPTED[key]
      const mood: string | readonly string[] = SCRIPTED_MOOD[key]
      if (typeof v === 'string') expect(MOODS, key).toContain(mood)
      else {
        expect(Array.isArray(mood), key).toBe(true)
        expect(mood.length, key).toBe(v.length)
        for (const md of mood) expect(MOODS, key).toContain(md)
      }
    }
  })
})

describe('goat lines: the voice rules', () => {
  it('keeps every line to 12 words or fewer, with long sample slots filled', () => {
    for (const [p, text] of TEXTS) {
      for (const s of slotsOf(text)) expect(KNOWN_SLOTS, `${p}: {${s}}`).toContain(s)
      const filled = fillSample(text)
      expect(filled, p).not.toMatch(/[{}]/)
      expect(wordCount(filled), `${p}: ${filled}`).toBeLessThanOrEqual(MAX_GOAT_WORDS)
      expect(filled.trim(), p).not.toBe('')
    }
  })

  it('never uses a banned phrase (straight or curly apostrophes, any case)', () => {
    for (const [p, text] of TEXTS) {
      expect(bannedIn(fillSample(text)), p).toEqual([])
      expect(bannedIn(typeset(fillSample(text))), p).toEqual([])
    }
  })

  it('names the try instead of generic praise', () => {
    for (const [p, text] of TEXTS) {
      const t = plain(fillSample(text))
      for (const phrase of GENERIC_PRAISE) expect(t.includes(phrase), `${p}: "${phrase}"`).toBe(false)
    }
  })

  it('never sounds disappointed and never gives orders', () => {
    for (const [p, text] of TEXTS) {
      const t = plain(fillSample(text))
      expect(t, p).not.toMatch(DISAPPOINTED)
      for (const phrase of NAGGING) expect(t.includes(phrase), `${p}: "${phrase}"`).toBe(false)
    }
  })

  it('never uses a personal name slot other than the goat and mountain she named', () => {
    for (const [p, text] of TEXTS) expect(text, p).not.toMatch(/\{(name|names|mum|dad|kid|child)\}/i)
  })

  it('is written tidily: straight apostrophes, end punctuation, no doubles', () => {
    const seen = new Map<string, string>()
    for (const [p, text] of TEXTS) {
      expect(text, `${p}: write apostrophes straight`).not.toMatch(/[’‘]/)
      expect(text, p).toMatch(/[.!?…]$/)
      expect(text, p).not.toMatch(/\s{2,}|^\s|\s$/)
    }
    for (const [p, l] of LINES) {
      const key = plain(l.text)
      expect(seen.has(key), `${p} repeats ${seen.get(key)}`).toBe(false)
      seen.set(key, p)
    }
  })

  it('offers hints as questions, never orders', () => {
    for (const m of HINT_GROUPS) for (const l of GOAT_LINES[m]) expect(l.text, m).toContain('?')
  })

  it('keeps morals at camp, a few of them, from the goat', () => {
    for (const [p, l] of LINES) {
      if (l.moral) expect(['campIdle', 'campReached'], p).toContain(p.split('[')[0])
    }
    expect(GOAT_LINES.campIdle.filter((l) => l.moral).length).toBeGreaterThanOrEqual(3)
    expect(GOAT_LINES.campIdle.filter((l) => !l.moral).length).toBeGreaterThanOrEqual(8)
  })

  it('puts tags only where the picker gets that context', () => {
    for (const [p, l] of LINES) {
      const m = p.split('[')[0]
      if (l.whipper) expect(['fall', 'repeatFall', 'bigLeapMissed'], p).toContain(m)
      if (l.scary) expect(['looksScaryBefore', 'looksScaryAfter'], p).toContain(m)
      if (l.zone) expect(ZONES, p).toContain(l.zone)
      if (slotsOf(l.text).includes('pose')) expect(['fall', 'repeatFall', 'bigLeapMissed'], p).toContain(m)
    }
    for (const kind of SCARY_KINDS) {
      expect(GOAT_LINES.looksScaryBefore.some((l) => l.scary === kind), `before: ${kind}`).toBe(true)
      expect(GOAT_LINES.looksScaryAfter.some((l) => l.scary === kind), `after: ${kind}`).toBe(true)
    }
  })

  it('always has something to say when the goat climbs beside her, for every kind of fall', () => {
    for (const m of ALL_MOMENTS) expect(GOAT_LINES[m].some((l) => isPlain(l) || (l.out && !l.moral)), m).toBe(true)
    for (const w of WHIPPERS) {
      for (const m of ['fall', 'repeatFall', 'bigLeapMissed'] as const) {
        expect(GOAT_LINES[m].some((l) => isPlain(l) || l.whipper === w), `${m}/${w}`).toBe(true)
      }
    }
  })
})

describe('goat lines: the scripted story beats', () => {
  it('says the brief\'s words exactly', () => {
    expect(SCRIPTED.notToday).toBe("Fear won this round. That's allowed.")
    expect(SCRIPTED.stoneWaiting).toBe("The cairn's full for today. This stone goes on tomorrow.")
    expect(SCRIPTED.sunset).toBe("The sun's going down. The mountain will be here tomorrow.")
    expect(SCRIPTED.hiddenHold).toBe('Spotted a hold on the way down!')
    expect(GOAT_LINES.notToday.map((l) => l.text)).toContain(SCRIPTED.notToday)
    expect(GOAT_LINES.stoneWaiting.map((l) => l.text)).toContain(SCRIPTED.stoneWaiting)
  })

  it('meets her as a baby mountain goat, scared of heights, coming anyway', () => {
    expect(SCRIPTED.meet.length).toBeGreaterThanOrEqual(2)
    expect(SCRIPTED.meet.length).toBeLessThanOrEqual(3)
    const meet = plain(SCRIPTED.meet.join(' '))
    expect(meet).toContain('baby mountain goat')
    expect(meet).toContain('scared of heights')
    expect(meet).toContain('anyway')
    expect(GOAT_LINES.meet.map((l) => l.text)).toEqual([...SCRIPTED.meet])
  })

  it('says why the rope is there, every time it explains the rope', () => {
    for (const text of [SCRIPTED.ropeFirst, ...GOAT_LINES.rope.map((l) => l.text)]) {
      const t = plain(text)
      expect(t, text).toContain('rope')
      expect(t, text).toContain('why')
      expect(t, text).toMatch(/climbers can try/)
    }
  })

  it('names Sky Lake as where they are going on the first camp visit', () => {
    expect(SCRIPTED.firstCamp).toContain('Sky Lake')
    expect(plain(SCRIPTED.firstCamp)).toContain('going')
  })

  it('makes the lesson a leap, then a practice fall', () => {
    expect(plain(SCRIPTED.lessonLeap)).toMatch(/drag back.*let go/)
    expect(plain(SCRIPTED.lessonFall)).toContain('falling')
    expect(GOAT_LINES.lesson.map((l) => l.text)).toContain(SCRIPTED.lessonLeap)
  })

  it('gives the finale its four beats: arrive, the goat leaps, the splash, together', () => {
    expect(SCRIPTED.finale.length).toBe(4)
    expect(SCRIPTED.finale[0]).toContain('Sky Lake')
    expect(plain(SCRIPTED.finale[1])).toContain('anyway')
    expect(SCRIPTED.finale[2]).toMatch(/SPLASH/)
    for (const t of SCRIPTED.finale) expect(GOAT_LINES.summit.map((l) => l.text)).toContain(t)
  })
})

describe('GoatVoice', () => {
  it('never says the same line twice in a row', () => {
    for (const seed of [1, 2, 3, 99]) {
      const v = voice(seed)
      for (const m of ALL_MOMENTS) {
        const fitting = GOAT_LINES[m].filter(isPlain).length
        if (fitting < 2) continue
        let prev = ''
        for (let k = 0; k < 120; k++) {
          const t = v.line(m)
          expect(t, `${m} #${k}`).not.toBe(prev)
          prev = t
        }
      }
    }
  })

  it('also avoids back-to-back repeats with slots filled and context set', () => {
    const v = voice(7)
    const cases: [GoatMoment, GoatVars, GoatContext][] = [
      ['fall', { pose: 'The Starfish' }, { whipper: 'rope', zone: 'meadow' }],
      ['land', { n: 3 }, { zone: 'cloud' }],
      ['looksScaryBefore', {}, { scary: 'eyes' }],
      ['campIdle', {}, { campKey: 'visit' }],
    ]
    for (const [m, vars, ctx] of cases) {
      let prev = ''
      for (let k = 0; k < 150; k++) {
        const t = v.line(m, vars, ctx)
        expect(t, `${m} #${k}`).not.toBe(prev)
        prev = t
      }
    }
  })

  it('deals out the whole bag before repeating', () => {
    const v = voice(5)
    const plainIdle = GOAT_LINES.campIdle.filter(isPlain).length
    const first = new Set<string>()
    for (let k = 0; k < plainIdle; k++) first.add(v.line('campIdle'))
    expect(first.size).toBe(plainIdle)
    const hops = new Set<string>()
    for (let k = 0; k < GOAT_LINES.hop.length; k++) hops.add(v.line('hop'))
    expect(hops.size).toBe(GOAT_LINES.hop.length)
  })

  it('says at most one moral per camp arrival', () => {
    const v = voice(11)
    let morals = 0
    for (let k = 0; k < 300; k++) if (v.pick('campIdle', {}, { campKey: 'hub:1' }).moral) morals++
    expect(morals).toBe(1)

    // Each new arrival may have one (and some do); in-pitch camps share the same cap.
    let total = 0
    for (let visit = 0; visit < 60; visit++) {
      let here = 0
      for (let k = 0; k < 6; k++) {
        if (v.pick('campIdle', {}, { campKey: `hub:${visit + 2}` }).moral) here++
        if (v.pick('campReached', {}, { campKey: `hub:${visit + 2}` }).moral) here++
      }
      expect(here, `visit ${visit}`).toBeLessThanOrEqual(1)
      total += here
    }
    expect(total).toBeGreaterThan(10)
  })

  it('says no moral at all without a camp arrival', () => {
    const v = voice(12)
    for (let k = 0; k < 300; k++) {
      expect(v.pick('campIdle').moral).toBe(false)
      expect(v.pick('campReached').moral).toBe(false)
    }
  })

  it('fills the slots, and skips lines whose slot has no value', () => {
    const v = voice(3)
    const poseLines = new Set<string>()
    for (let k = 0; k < 200; k++) {
      const plainFall = v.line('fall')
      expect(plainFall).not.toMatch(/[{}]/)
      const t = v.line('fall', { pose: 'The Starfish' })
      expect(t).not.toMatch(/[{}]/)
      if (t.includes('The Starfish')) poseLines.add(t)
    }
    expect(poseLines.size).toBeGreaterThanOrEqual(2)

    // {n} counts from 2: no "Try number 1".
    for (let k = 0; k < 200; k++) {
      expect(v.line('land', { n: 1 })).not.toMatch(/\d/)
      expect(v.line('send', { n: 0 })).not.toMatch(/\d/)
    }
    let sawSeven = false
    for (let k = 0; k < 200; k++) if (v.line('land', { n: 7 }).includes('7')) sawSeven = true
    expect(sawSeven).toBe(true)

    // A typed name goes in as typed.
    let sawMountain = false
    for (let k = 0; k < 50; k++) if (v.line('summit', { mountain: "Mount O'Fluff" }).includes("Mount O'Fluff")) sawMountain = true
    expect(sawMountain).toBe(true)
  })

  it('only says lines that fit the moment: zone, scary kind, fall kind, backpack', () => {
    const v = voice(21)
    for (const kind of SCARY_KINDS) {
      const said = new Set<string>()
      for (let k = 0; k < 120; k++) {
        const t = v.line('looksScaryBefore', {}, { scary: kind })
        const l = lineOf('looksScaryBefore', t)
        expect(l.scary === undefined || l.scary === kind, `${kind}: ${t}`).toBe(true)
        if (l.scary === kind) said.add(t)
        const after = lineOf('looksScaryAfter', v.line('looksScaryAfter', {}, { scary: kind }))
        expect(after.scary === undefined || after.scary === kind, kind).toBe(true)
      }
      expect(said.size, kind).toBe(GOAT_LINES.looksScaryBefore.filter((l) => l.scary === kind).length)
    }
    for (const w of WHIPPERS) {
      for (let k = 0; k < 120; k++) {
        const l = lineOf('fall', v.line('fall', { pose: 'The Pancake' }, { whipper: w }), { pose: 'The Pancake' })
        expect(l.whipper === undefined || l.whipper === w, w).toBe(true)
      }
    }
    for (const z of ZONES) {
      for (let k = 0; k < 80; k++) {
        const l = lineOf('aim', v.line('aim', {}, { zone: z }))
        expect(l.zone === undefined || l.zone === z, z).toBe(true)
      }
    }
    let sawOut = false
    for (let k = 0; k < 200; k++) {
      const l = lineOf('aim', v.line('aim', {}, { goatOut: true }))
      expect(l.pack, l.text).toBeUndefined()
      if (l.out) sawOut = true
      expect(lineOf('aim', v.line('aim')).out, 'out-of-pack lines need goatOut').toBeUndefined()
    }
    expect(sawOut).toBe(true)
  })

  it('names the Looks Scary thing itself the first time (scaryOnly), with some variety', () => {
    const v = voice(33)
    for (const kind of SCARY_KINDS) {
      for (const m of ['looksScaryBefore', 'looksScaryAfter'] as const) {
        const own = GOAT_LINES[m].filter((l) => l.scary === kind)
        expect(own.length, `${m}: ${kind}`).toBeGreaterThanOrEqual(2)
        const said = new Set<string>()
        for (let k = 0; k < 40; k++) {
          const t = v.line(m, {}, { scary: kind, scaryOnly: true })
          expect(lineOf(m, t).scary, `${m} ${kind}: ${t}`).toBe(kind)
          said.add(t)
        }
        expect(said.size, `${m}: ${kind}`).toBe(own.length)
      }
    }
  })

  it('never says the goat rode the rope while it waits on the ledge (night), and has lines for that', () => {
    const v = voice(8)
    for (const m of ['fall', 'bigLeapMissed', 'repeatFall'] as const) {
      let sawOut = false
      for (let k = 0; k < 200; k++) {
        const l = lineOf(m, v.line(m, { pose: 'The Pancake', n: 3 }, { whipper: 'rope', goatOut: true }), { pose: 'The Pancake', n: 3 })
        expect(l.pack, `${m}: ${l.text}`).toBeUndefined()
        expect(l.text, m).not.toMatch(/(rope's got us|rope caught us|rope's caught us)/i)
        if (l.out) sawOut = true
      }
      expect(sawOut, m).toBe(true)
    }
  })

  it('says curly apostrophes and a known mood', () => {
    const v = voice(4)
    for (const m of ALL_MOMENTS) {
      for (let k = 0; k < 10; k++) {
        const s = v.pick(m, SAMPLE, { campKey: `k${k}` })
        expect(s.text, m).not.toContain("'")
        expect(s.text.trim(), m).not.toBe('')
        expect(MOODS, m).toContain(s.mood)
      }
    }
    expect(scriptedLine('notToday').text).toBe('Fear won this round. That’s allowed.')
  })

  it('is the same every time for the same seed', () => {
    const a = voice(42)
    const b = voice(42)
    for (let k = 0; k < 100; k++) {
      const m = ALL_MOMENTS[k % ALL_MOMENTS.length]
      expect(a.line(m, SAMPLE)).toBe(b.line(m, SAMPLE))
    }
  })

  it('maps every beta hint to its group', () => {
    const classes: HintClass[] = ['short', 'long', 'steep', 'flat', 'bumped', 'gust', 'crumbled']
    expect(classes.map(hintMoment).sort()).toEqual([...HINT_GROUPS].sort())
  })

  it('reads scripted lines with their moods and slots', () => {
    expect(scriptedLine('named', { vars: { goat: 'Pebble' } })).toEqual({ text: 'Pebble? I love it!', mood: 'giggly', moral: false })
    expect(scriptedLine('meet', { index: 1 }).mood).toBe(SCRIPTED_MOOD.meet[1])
    expect(scriptedLine('meet', { index: 1 }).text).toBe(typeset(SCRIPTED.meet[1]))
    expect(scriptedLine('meet', { index: 99 }).text).toBe(typeset(SCRIPTED.meet[SCRIPTED.meet.length - 1]))
    expect(scriptedLine('ropeFirst').mood).toBe('calm')
  })

  it('never takes the fear numbers as input', () => {
    const src = readFileSync(join(__dirname, '..', '..', 'src', 'model', 'goatVoice.ts'), 'utf8')
    expect(src).not.toMatch(/forecast|really/i)
  })
})
