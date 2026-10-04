/**
 * The goat's line picker. Screens say WHAT happened (a moment, plus a few facts about the try);
 * the picker chooses what the goat says about it.
 *
 * - Shuffle-bag per moment: every line of a group comes round before any repeats, and the same
 *   line is never said twice in a row (unless it is the only one that fits).
 * - Templates: {pose}, {n}, {goat}, {mountain}, {thing}. A line whose slot has no value is skipped;
 *   {n} only counts from 2 (so there is never a "1 attempts"); {thing} is cut to its first few words.
 * - Scripted lines (the SCRIPTED story beats, tagged `scripted`) are said only through
 *   scriptedLine(); pick() draws a group's other lines.
 * - At most ONE moral line per camp arrival: `ctx.campKey` names the arrival (a hub visit or reaching
 *   a camp on a pitch). Without a campKey no moral line is said at all.
 * - It never takes the fear numbers she gives (before or after a brave thing) as input: the goat's
 *   words never depend on how scared she said she was.
 * - Straight apostrophes in the content come out curly.
 */
import {
  GOAT_LINES,
  MOMENT_MOOD,
  SCRIPTED,
  SCRIPTED_MOOD,
  type GoatLine,
  type GoatMoment,
  type ScriptedKey,
} from '../content/goatLines'
import type { HintClass } from '../game/beta'
import type { WhipperKind } from '../game/events'
import type { LooksScaryKind, ZoneId } from '../game/types'
import type { GoatMood } from '../ui/goatBubble'

/** Facts about the try, for the template slots. */
export interface GoatVars {
  /** The fall pose's name ("The Starfish"). */
  pose?: string
  /** A count: attempts at this spot, falls here, attempts this pitch, stones in the cairn. */
  n?: number
  /** The goat's name (she typed it). */
  goat?: string
  /** Her mountain's name (she typed it). */
  mountain?: string
  /** The brave thing whose stone just went on (her words or the idea card's), shortened. */
  thing?: string
}

/** {thing} is cut to this many words (with "…"), so every line stays within 12 words. */
export const THING_WORDS = 5

/** Her brave thing as a short quote: the first few words, no trailing full stop. */
export function shortThing(text: string): string | null {
  const words = text.trim().replace(/\s+/g, ' ').split(' ').filter(Boolean)
  if (!words.length) return null
  const cut = words.length > THING_WORDS
  let out = words.slice(0, THING_WORDS).join(' ')
  out = cut ? out.replace(/[.,;:!?…]+$/, '') + '…' : out.replace(/[.,;:]+$/, '')
  return out ? typeset(out) : null
}

/** Where the goat is, so it only says lines that fit. */
export interface GoatContext {
  /** One camp arrival. Moral lines need it; at most one moral per key. */
  campKey?: string
  /** The pitch's zone: unlocks that zone's lines. */
  zone?: ZoneId
  /** The Looks Scary moment (looksScaryBefore / looksScaryAfter): unlocks its own lines. */
  scary?: LooksScaryKind
  /**
   * Only that moment's own lines (the first time she meets it, and inside its fear cards): she hears
   * what the scary thing looks like, and what it turned out to be — never just a generic line.
   */
  scaryOnly?: boolean
  /** The kind of fall: rope-catch lines only for 'rope', and so on. */
  whipper?: WhipperKind
  /** The goat climbs beside her (night climbs after the summit), not in the backpack. */
  goatOut?: boolean
}

/** A line ready for the goat bubble. */
export interface SpokenLine {
  text: string
  mood: GoatMood
  moral: boolean
}

const SLOT = /\{(\w+)\}/g

/** Straight apostrophes → curly ones (the goat lines contain no single-quoted speech). */
export function typeset(text: string): string {
  return text.replace(/'/g, '’')
}

function slotValue(name: string, vars: GoatVars): string | null {
  switch (name) {
    case 'n': {
      const n = vars.n
      return typeof n === 'number' && Number.isFinite(n) && n >= 2 ? String(Math.round(n)) : null
    }
    case 'pose':
    case 'goat':
    case 'mountain': {
      const v = vars[name]
      return typeof v === 'string' && v.trim() ? v.trim() : null
    }
    case 'thing':
      return typeof vars.thing === 'string' ? shortThing(vars.thing) : null
    default:
      return null
  }
}

function slotsOf(text: string): string[] {
  const out: string[] = []
  text.replace(SLOT, (m, k: string) => {
    out.push(k)
    return m
  })
  return out
}

/** Fill the slots of a (typeset) line. Slots without a value are left as they are. */
function fillSlots(text: string, vars: GoatVars): string {
  return text.replace(SLOT, (m, k: string) => slotValue(k, vars) ?? m)
}

/** A scripted line (SCRIPTED in content/goatLines.ts) with its mood, slots filled, typeset. */
export function scriptedLine(key: ScriptedKey, opts: { index?: number; vars?: GoatVars } = {}): SpokenLine {
  const value: string | readonly string[] = SCRIPTED[key]
  const moods: GoatMood | readonly GoatMood[] = SCRIPTED_MOOD[key]
  let text: string
  let mood: GoatMood
  if (typeof value === 'string') {
    text = value
    mood = moods as GoatMood
  } else {
    const i = Math.max(0, Math.min(value.length - 1, Math.floor(opts.index ?? 0)))
    text = value[i]
    mood = (moods as readonly GoatMood[])[i] ?? 'calm'
  }
  return { text: fillSlots(typeset(text), opts.vars ?? {}), mood, moral: false }
}

/** The hint moment for a beta classification (game/beta.ts classifyMiss). */
export function hintMoment(hint: HintClass): GoatMoment {
  switch (hint) {
    case 'short':
      return 'hintShort'
    case 'long':
      return 'hintLong'
    case 'steep':
      return 'hintSteep'
    case 'flat':
      return 'hintFlat'
    case 'bumped':
      return 'hintBumped'
    case 'gust':
      return 'hintGust'
    case 'crumbled':
      return 'hintCrumbled'
  }
}

interface Bag {
  /** Line indices still to come this round, drawn from the end. */
  left: number[]
  /** The line said last (-1: none yet). */
  last: number
}

export class GoatVoice {
  private readonly rng: () => number
  private readonly bags = new Map<GoatMoment, Bag>()
  private readonly slots = new Map<GoatMoment, string[][]>()
  /** Camp arrivals that have had their moral line. */
  private readonly moralSaid = new Set<string>()

  constructor(rng: () => number = Math.random) {
    this.rng = rng
  }

  /** What the goat says for `moment`, as text for the bubble. */
  line(moment: GoatMoment, vars?: GoatVars, ctx?: GoatContext): string {
    return this.pick(moment, vars, ctx).text
  }

  /** What the goat says for `moment`, with the bubble mood. */
  pick(moment: GoatMoment, vars: GoatVars = {}, ctx: GoatContext = {}): SpokenLine {
    const lines = GOAT_LINES[moment]
    const slots = this.slotsFor(moment)
    const fits = (i: number): boolean => this.fits(lines[i], slots[i], vars, ctx)
    let i = this.draw(moment, lines.length, fits)
    if (i < 0) {
      // Nothing fits (the content tests make sure this can't happen): any line without slots or a moral.
      i = lines.findIndex((l, k) => !l.moral && slots[k].length === 0)
      if (i < 0) i = 0
    }
    const line = lines[i]
    if (line.moral && ctx.campKey !== undefined) this.moralSaid.add(ctx.campKey)
    return {
      text: fillSlots(typeset(line.text), vars).replace(SLOT, '').replace(/\s+/g, ' ').trim(),
      mood: line.mood ?? MOMENT_MOOD[moment],
      moral: line.moral === true,
    }
  }

  private slotsFor(moment: GoatMoment): string[][] {
    let s = this.slots.get(moment)
    if (!s) {
      s = GOAT_LINES[moment].map((l) => slotsOf(l.text))
      this.slots.set(moment, s)
    }
    return s
  }

  private fits(line: GoatLine, slots: string[], vars: GoatVars, ctx: GoatContext): boolean {
    if (line.scripted) return false
    if (line.moral && (ctx.campKey === undefined || this.moralSaid.has(ctx.campKey))) return false
    if (line.zone !== undefined && line.zone !== ctx.zone) return false
    if (line.scary !== undefined && line.scary !== ctx.scary) return false
    if (ctx.scaryOnly && line.scary === undefined) return false
    if (line.whipper !== undefined && line.whipper !== ctx.whipper) return false
    if (line.pack && ctx.goatOut) return false
    if (line.out && !ctx.goatOut) return false
    for (const s of slots) if (slotValue(s, vars) === null) return false
    return true
  }

  /** The next fitting line from the moment's bag (refilled and reshuffled when it runs dry). */
  private draw(moment: GoatMoment, count: number, fits: (i: number) => boolean): number {
    let bag = this.bags.get(moment)
    if (!bag) {
      bag = { left: [], last: -1 }
      this.bags.set(moment, bag)
    }
    for (let k = bag.left.length - 1; k >= 0; k--) {
      const i = bag.left[k]
      if (!fits(i)) continue
      bag.left.splice(k, 1)
      bag.last = i
      return i
    }
    // A new round: shuffle every line back in. The first one out must not be the line just said.
    const left: number[] = []
    for (let i = 0; i < count; i++) left.push(i)
    for (let i = left.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1))
      const t = left[i]
      left[i] = left[j]
      left[j] = t
    }
    bag.left = left
    let chosen = -1
    let repeat = -1
    for (let k = left.length - 1; k >= 0; k--) {
      const i = left[k]
      if (!fits(i)) continue
      if (i === bag.last) {
        repeat = k
        continue
      }
      chosen = k
      break
    }
    if (chosen < 0) chosen = repeat
    if (chosen < 0) return -1
    const i = left[chosen]
    left.splice(chosen, 1)
    bag.last = i
    return i
  }
}

let shared: GoatVoice | null = null

/** The app's goat: one voice for every screen, so bags carry over between visits. */
export function goatVoice(): GoatVoice {
  if (!shared) shared = new GoatVoice()
  return shared
}
