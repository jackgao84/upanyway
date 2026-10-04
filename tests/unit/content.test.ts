/**
 * Content rules for every word she reads so far: no banned phrases anywhere, every goat line ≤ 12
 * words (with its slots filled), glossary definitions ≤ 12 words, no empty strings or lists.
 * The goat's own rules (groups, moral cap, picker) are in goatVoice.test.ts.
 */
import { describe, expect, it } from 'vitest'
import { CAMP_COPY, GATE_COPY, SETUP_COPY, fill, joinNames } from '../../src/content/copy'
import { GOAT_LINES, GOAT_MOMENTS, MOMENT_MOOD, SCRIPTED, type GoatLine } from '../../src/content/goatLines'
import { GLOSSARY_WORDS, glossary } from '../../src/content/glossary'
import { GOAT_NAMES, MOUNTAIN_NAMES } from '../../src/content/names'
import { MAX_GOAT_WORDS, bannedIn, wordCount } from './voice'

const SLOTS = {
  goat: 'Butterscotch',
  mountain: 'Mount Anyway',
  names: joinNames(['Mum', 'Dad', 'Nana']),
  pose: 'The Spaghetti Arms',
  n: '14',
  // The goat's {thing}: a brave thing cut to its first five words (model/goatVoice shortThing).
  thing: 'Order my own food at…',
}

/**
 * Every string in a content object as [path, text]. Templates are called with numbers and a word;
 * an empty list shows up as an empty string.
 */
function strings(value: unknown, path: string, out: [string, string][] = []): [string, string][] {
  if (typeof value === 'string') out.push([path, value])
  else if (typeof value === 'function') {
    const fn = value as (...args: unknown[]) => unknown
    for (const sample of [1, 2, 'iPad']) strings(fn(...Array<unknown>(fn.length).fill(sample)), `${path}(${sample})`, out)
  } else if (Array.isArray(value)) {
    if (!value.length) out.push([`${path} (empty list)`, ''])
    value.forEach((v, i) => strings(v, `${path}[${i}]`, out))
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) strings(v, `${path}.${k}`, out)
  }
  return out
}

/** Every goat line: each moment's lines, and the scripted story beats. */
function goatLines(): [string, GoatLine][] {
  const out: [string, GoatLine][] = []
  for (const m of GOAT_MOMENTS) GOAT_LINES[m].forEach((line, i) => out.push([`GOAT_LINES.${m}[${i}]`, line]))
  for (const [k, v] of Object.entries(SCRIPTED)) {
    if (typeof v === 'string') out.push([`SCRIPTED.${k}`, { text: v }])
    else v.forEach((text: string, i: number) => out.push([`SCRIPTED.${k}[${i}]`, { text }]))
  }
  return out
}

const COPY = {
  SETUP_COPY,
  GATE_COPY,
  CAMP_COPY,
  GOAT_LINES,
  SCRIPTED,
  glossary,
  GOAT_NAMES,
  MOUNTAIN_NAMES,
}
const ALL = Object.entries(COPY).flatMap(([name, v]) => strings(v, name))
const GOAT = goatLines()
const MOODS = ['calm', 'happy', 'scared', 'giggly', 'wobbly']

describe('content voice', () => {
  it('finds the copy it checks', () => {
    expect(ALL.length).toBeGreaterThan(100)
    expect(GOAT.length).toBeGreaterThanOrEqual(80)
  })

  it('never uses a banned phrase', () => {
    for (const [path, text] of ALL) expect(bannedIn(fill(text, SLOTS)), path).toEqual([])
  })

  it('has no empty strings or lists', () => {
    for (const [path, text] of ALL) expect(text.trim(), path).not.toBe('')
  })

  it('keeps every goat line to 12 words or fewer, with its slots filled', () => {
    for (const [path, line] of GOAT) {
      const text = fill(line.text, SLOTS)
      expect(text, path).not.toMatch(/[{}]/)
      expect(wordCount(text), `${path}: ${text}`).toBeLessThanOrEqual(MAX_GOAT_WORDS)
      if (line.mood) expect(MOODS, path).toContain(line.mood)
    }
    for (const m of GOAT_MOMENTS) expect(MOODS, m).toContain(MOMENT_MOOD[m])
  })

  it('says why the rope is there the first time it catches a fall', () => {
    const rope = SCRIPTED.ropeFirst.toLowerCase()
    expect(rope).toContain('rope')
    expect(rope).toContain('why')
  })

  it('keeps every glossary definition to 12 words or fewer', () => {
    expect([...GLOSSARY_WORDS].sort()).toEqual(['beta', 'cairn', 'chalk', 'hold', 'pitch', 'send', 'whipper'])
    for (const w of GLOSSARY_WORDS) {
      expect(glossary[w].word).toBe(w)
      expect(wordCount(glossary[w].definition), w).toBeLessThanOrEqual(MAX_GOAT_WORDS)
    }
  })

  it('catches a banned phrase written with a curly apostrophe or capitals', () => {
    expect(bannedIn('Don’t be scared!')).toEqual(["don't be scared"])
    expect(bannedIn('GOOD JOB')).toEqual(['good job'])
    expect(bannedIn('My legs are jelly. Let’s go anyway?')).toEqual([])
  })
})
