/**
 * Words on the grown-ups' pages (src/screens/parent/copy.ts) and "How to cheer" (content/cheer.ts):
 * the same voice rules as everything else (no banned phrases, no empty strings), no personal names,
 * nothing that ranks or compares the child, nothing that assigns her tasks, no streak/expiry talk,
 * and How to cheer covers every point the brief asks for with one or two things to try saying.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CHEER } from '../../src/content/cheer'
import { PARENT_COPY } from '../../src/screens/parent/copy'
import { bannedIn, plain } from './voice'

function strings(value: unknown, path: string, out: [string, string][] = []): [string, string][] {
  if (typeof value === 'string') out.push([path, value])
  else if (typeof value === 'function') {
    const fn = value as (...args: unknown[]) => unknown
    for (const sample of [0, 1, 2, 'Mum']) strings(fn(...Array<unknown>(fn.length).fill(sample)), `${path}(${String(sample)})`, out)
  } else if (Array.isArray(value)) {
    if (!value.length) out.push([`${path} (empty list)`, ''])
    value.forEach((v, i) => strings(v, `${path}[${i}]`, out))
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) strings(v, `${path}.${k}`, out)
  }
  return out
}

const ALL = [...strings(PARENT_COPY, 'PARENT_COPY'), ...strings(CHEER, 'CHEER')]

describe("grown-ups' words", () => {
  it('finds the copy it checks', () => {
    expect(ALL.length).toBeGreaterThan(150)
  })

  it('never uses a banned phrase', () => {
    for (const [path, text] of ALL) expect(bannedIn(text), path).toEqual([])
  })

  it('has no empty strings or lists', () => {
    for (const [path, text] of ALL) expect(text.trim(), path).not.toBe('')
  })

  it('never ranks her, keeps streaks or sets deadlines', () => {
    const bad = /\b(leaderboard|rank(ed|ing)?|streaks?|overdue|deadline|expir\w*|top score|high score|better than|worse than|behind (the )?others)\b/
    for (const [path, text] of ALL) expect(plain(text), path).not.toMatch(bad)
  })

  it('never shows "Not today" counts', () => {
    for (const [path, text] of ALL) expect(plain(text), path).not.toMatch(/not today\s*[×x]\s*\d|not today count/)
  })

  it('uses curly apostrophes on screen', () => {
    for (const [path, text] of ALL) expect(text, path).not.toMatch(/'/)
  })
})

describe('How to cheer', () => {
  const ids = CHEER.tips.map((t) => t.id)

  it('covers every point from the brief', () => {
    expect(ids).toEqual(['try', 'learn', 'flops', 'rescue', 'bargain', 'compare'])
    const byId = Object.fromEntries(CHEER.tips.map((t) => [t.id, plain(`${t.title} ${t.body}`)]))
    expect(byId.try).toMatch(/praise the try/)
    expect(byId.learn).toMatch(/what did you learn/)
    expect(byId.learn).toMatch(/why didn't you/)
    expect(byId.flops).toMatch(/your own flops/)
    expect(byId.flops).toMatch(/grown-ups' wing/)
    expect(byId.rescue).toMatch(/rescue/)
    expect(byId.bargain).toMatch(/reward/)
    expect(byId.bargain).toMatch(/punishment/)
    expect(byId.compare).toMatch(/brother or sister/)
  })

  it('gives one or two things to try saying under each tip', () => {
    for (const t of CHEER.tips) {
      expect(t.tryThese.length, t.id).toBeGreaterThanOrEqual(1)
      expect(t.tryThese.length, t.id).toBeLessThanOrEqual(2)
    }
  })

  it('explains the stones, the sinking sun and brave = safe but scary', () => {
    const facts = Object.fromEntries(CHEER.facts.map((f) => [f.id, plain(`${f.title} ${f.body}`)]))
    expect(facts.stones).toMatch(/one stone/)
    expect(facts.stones).toMatch(/whatever their fear number/)
    expect(facts.stones).toMatch(/three/)
    expect(facts.sun).toMatch(/never numbers or a countdown/)
    expect(facts.brave).toMatch(/safe but scary/)
    expect(facts.brave).toMatch(/tell a grown-up/)
  })
})

describe('parent pages source', () => {
  it('keeps names out of the source (they come from the save)', () => {
    const dir = join(__dirname, '../../src/screens/parent')
    for (const file of ['copy.ts', 'home.ts', 'settings.ts', 'letter.ts', 'grownupFlop.ts', 'ideas.ts', 'readCairn.ts', 'cheer.ts', 'data.ts', 'pin.ts', 'parts.ts', 'records.ts']) {
      const src = readFileSync(join(dir, file), 'utf8')
      expect(src, file).not.toMatch(/\b(Mum|Mom|Dad|Mummy|Daddy|Papa|Mama)\b/)
    }
  })
})
