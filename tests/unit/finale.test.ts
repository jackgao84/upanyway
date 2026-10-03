/**
 * The Sky Lake finale's timeline and words: the goat is never outside the backpack before it climbs
 * out; beats run in order and the whole thing lasts 25–35 s; the copy follows the voice rules.
 */
import { describe, expect, it } from 'vitest'
import { FINALE_COPY } from '../../src/screens/finale/copy'
import { DAY_BEATS, DAY_CUES, NIGHT_BEATS, NIGHT_CUES, UNSKIPPABLE_BEATS, beatAt, cardAt, goatWhereAt, nextBeatAt, sceneAt, skipAllFrom } from '../../src/screens/finale/timeline'
import { bannedIn } from './voice'

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value)
  else if (typeof value === 'function') {
    const fn = value as (...args: unknown[]) => unknown
    for (const beat of ['summit', 'mountain', 'lake', 'out', 'edge', 'leap', 'splash', 'laugh', 'both', 'card', 'jump', 'float'])
      for (const night of [false, true]) strings(fn.length >= 3 ? fn(beat, night, 'Pebble', 'Mount Maybe') : fn('Pebble', 7), out)
    if (fn.length === 1) strings(fn(''), out)
  } else if (value && typeof value === 'object') for (const v of Object.values(value)) strings(v, out)
  return out
}

describe('finale timeline', () => {
  it('keeps the goat in the backpack until it climbs out', () => {
    for (let t = 0; t < 10; t += 0.05) {
      const s = sceneAt('day', t, t < 5 ? 0.5 : 1.6)
      expect(goatWhereAt('day', t), `t=${t}`).toBe('pack')
      expect(s.her.goat?.inBackpack, `t=${t}`).toBe(true)
      if (s.kind === 'lake') expect(s.goat, `t=${t}`).toBeNull()
    }
    const out = sceneAt('day', 10.6)
    expect(out.kind).toBe('lake')
    if (out.kind === 'lake') {
      expect(out.her.goat).toBeNull()
      expect(out.goat?.state.inBackpack).toBe(false)
    }
  })

  it('runs its beats in order, 25–35 s by day and a short night ending', () => {
    for (const beats of [DAY_BEATS, NIGHT_BEATS]) {
      for (let i = 1; i < beats.length; i++) {
        expect(beats[i].at).toBeGreaterThan(beats[i - 1].at)
        expect(beats[i - 1].still).toBeGreaterThanOrEqual(beats[i - 1].at)
        expect(beats[i - 1].still).toBeLessThan(beats[i].at)
      }
    }
    expect(cardAt('day')).toBeGreaterThanOrEqual(22)
    expect(cardAt('day')).toBeLessThanOrEqual(30)
    expect(cardAt('night')).toBeLessThan(cardAt('day'))
    for (const cues of [DAY_CUES, NIGHT_CUES]) for (let i = 1; i < cues.length; i++) expect(cues[i].at).toBeGreaterThanOrEqual(cues[i - 1].at)
    // A tap only ever skips to the next beat, never past the card.
    expect(nextBeatAt('day', 0)).toBe(DAY_BEATS[1].at)
    expect(nextBeatAt('day', 99)).toBe(cardAt('day'))
  })

  it('the first time, the goat climbing out, its leap and its flop are never tapped past', () => {
    // Every moment from the goat stirring in the pack to it popping up again is in a beat a tap can't
    // skip, and the Skip button waits until it has popped up laughing.
    const outAt = DAY_BEATS.find((b) => b.id === 'out')!.at
    for (let t = outAt; t < skipAllFrom(); t += 0.05) expect(UNSKIPPABLE_BEATS, `t=${t.toFixed(2)}`).toContain(beatAt('day', t).id)
    expect(goatWhereAt('day', outAt)).toBe('pack')
    expect(skipAllFrom()).toBeGreaterThan(DAY_CUES.find((c) => c.id === 'splash')!.at)
    expect(skipAllFrom()).toBeLessThan(cardAt('day'))
    // Before it stirs, taps still move things on (the whole-mountain shot, the lake).
    for (const id of ['summit', 'mountain', 'lake'] as const) expect(UNSKIPPABLE_BEATS).not.toContain(id)
  })

  it('draws a scene at every moment without throwing', () => {
    for (const mode of ['day', 'night'] as const) for (let t = 0; t < cardAt(mode) + 8; t += 0.1) expect(() => sceneAt(mode, t)).not.toThrow()
  })
})

describe('finale copy', () => {
  it('never uses a banned phrase, an empty string, or a clock', () => {
    const all = strings(FINALE_COPY)
    expect(all.length).toBeGreaterThan(20)
    for (const text of all) {
      expect(bannedIn(text), text).toEqual([])
      expect(text.trim(), text).not.toBe('')
      expect(text, text).not.toMatch(/\b(seconds?|minutes?|timer|countdown|hurry)\b/i)
    }
  })
})
