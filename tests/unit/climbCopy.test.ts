/**
 * Words on the climb screen and in the lesson (src/screens/climb/copy.ts): no banned phrases, no
 * empty strings, no clocks or countdowns, and the Beta Map line says attempts the way the brief does.
 */
import { describe, expect, it } from 'vitest'
import { CLIMB_COPY, LESSON_COPY } from '../../src/screens/climb/copy'
import { bannedIn } from './voice'

function strings(value: unknown, path: string, out: [string, string][] = []): [string, string][] {
  if (typeof value === 'string') out.push([path, value])
  else if (typeof value === 'function') {
    const fn = value as (...args: unknown[]) => unknown
    for (const sample of [1, 7, 14]) strings(fn(...Array<unknown>(fn.length).fill(sample)), `${path}(${sample})`, out)
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) strings(v, `${path}.${k}`, out)
  }
  return out
}

const ALL = [...strings(CLIMB_COPY, 'CLIMB_COPY'), ...strings(LESSON_COPY, 'LESSON_COPY')]

describe('climb copy', () => {
  it('finds the copy', () => {
    expect(ALL.length).toBeGreaterThan(25)
  })

  it('never uses a banned phrase, an empty string, or a clock', () => {
    for (const [path, text] of ALL) {
      expect(bannedIn(text), path).toEqual([])
      expect(text.trim(), path).not.toBe('')
      expect(text, path).not.toMatch(/\b(seconds?|minutes?|timer|countdown|hurry)\b/i)
    }
  })

  it('reads the Beta Map line like the brief', () => {
    const m = CLIMB_COPY.map
    expect(`${m.sent} ${m.sentMany(14)} ${m.every}`).toBe('Sent in 14 attempts. Every whipper got you here.')
    expect(`${m.sent} ${m.sentOne} ${m.everyOne}`).toBe('Sent in 1 attempt. Every leap got you here.')
    expect(CLIMB_COPY.really.compare(7, 2)).toBe('Forecast 7. Really 2.')
  })
})
