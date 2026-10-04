/**
 * The grown-ups' recovery code (Decision 87): the code's format and alphabet, the salted hash (never
 * the code) and forgiving checking, the wait after too many wrong codes, and the grown-up words around
 * it (no banned phrases; her screens never mention it).
 */
import { describe, expect, it } from 'vitest'
import { GATE_COPY, RECOVERY_COPY } from '../../src/content/copy'
import {
  RECOVERY_ALPHABET,
  RECOVERY_FREE_TRIES,
  RECOVERY_LENGTH,
  RECOVERY_WAIT_MS,
  cleanRecoveryInput,
  formatRecoveryCode,
  hasRecoveryCode,
  isRecoveryCodeShaped,
  isRecoveryRecord,
  makeRecoveryRecord,
  newRecoveryCode,
  noRecoveryCode,
  recoveryWaitMs,
  spellRecoveryCode,
  strangeRecoveryChars,
  verifyRecoveryCode,
} from '../../src/model/recovery'
import { PARENT_COPY } from '../../src/screens/parent/copy'
import { bannedIn } from './voice'

const CODE_RE = /^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/

describe('a new recovery code', () => {
  it('uses an alphabet with no look-alikes: no 0, O, 1, I or L', () => {
    expect(RECOVERY_ALPHABET).toHaveLength(31)
    expect(new Set(RECOVERY_ALPHABET).size).toBe(31)
    for (const ch of '01ILO') expect(RECOVERY_ALPHABET).not.toContain(ch)
    expect(RECOVERY_ALPHABET).toMatch(/^[2-9A-Z]+$/)
  })

  it('is 12 characters in three groups of four, from that alphabet', () => {
    for (let i = 0; i < 200; i++) {
      const code = newRecoveryCode()
      expect(code).toMatch(CODE_RE)
      expect(cleanRecoveryInput(code)).toHaveLength(RECOVERY_LENGTH)
      expect(code).not.toMatch(/[01ILO]/)
    }
  })

  it('is different every time', () => {
    const codes = new Set(Array.from({ length: 500 }, () => newRecoveryCode()))
    expect(codes.size).toBe(500)
  })

  it('uses every character about equally (the top byte values are thrown away, not wrapped)', () => {
    const counts = new Map<string, number>()
    for (let i = 0; i < 4000; i++) for (const ch of cleanRecoveryInput(newRecoveryCode())) counts.set(ch, (counts.get(ch) ?? 0) + 1)
    expect(counts.size).toBe(31)
    const mean = (4000 * RECOVERY_LENGTH) / 31
    for (const [ch, n] of counts) expect(Math.abs(n - mean) / mean, ch).toBeLessThan(0.15)
  })

  it('skips byte values that would favour the first few characters', () => {
    // 248 and above are rejected; 0 → '2', 31 → '2', 30 → 'Z'.
    let call = 0
    const bytes = (n: number) => {
      call++
      const out = new Uint8Array(n)
      out.fill(call === 1 ? 255 : 0)
      out[0] = call === 1 ? 248 : 30
      out[1] = call === 1 ? 250 : 31
      return out
    }
    expect(newRecoveryCode(bytes)).toBe('Z222-2222-2222')
    expect(call).toBe(2)
  })
})

describe('typing a recovery code', () => {
  it('ignores case, spaces and dashes of any kind', () => {
    expect(cleanRecoveryInput(' k7qm 4xpa–tr9d ')).toBe('K7QM4XPATR9D')
    expect(cleanRecoveryInput('K7QM—4XPA_TR9D')).toBe('K7QM4XPATR9D')
    expect(formatRecoveryCode('k7qm4xpatr9d')).toBe('K7QM-4XPA-TR9D')
    expect(spellRecoveryCode('K7QM-4XPA-TR9D')).toBe('K 7 Q M, 4 X P A, T R 9 D')
  })

  it('knows a code-shaped entry, and names characters a code never has', () => {
    expect(isRecoveryCodeShaped('k7qm-4xpa-tr9d')).toBe(true)
    expect(isRecoveryCodeShaped('K7QM-4XPA-TR9')).toBe(false)
    expect(isRecoveryCodeShaped('K7QM-4XPA-TR9DD')).toBe(false)
    expect(isRecoveryCodeShaped('K7QM-4XPA-TR90')).toBe(false)
    expect(strangeRecoveryChars('k7qo-1xpa-tr9l, o')).toEqual(['O', '1', 'L', ','])
    expect(strangeRecoveryChars('k7qm-4xpa-tr9d')).toEqual([])
  })
})

describe('the saved recovery code', () => {
  it('is a salted SHA-256 — never the code — with a fresh salt each time', () => {
    const code = newRecoveryCode()
    const a = makeRecoveryRecord(code)
    const b = makeRecoveryRecord(code)
    expect(a.recoveryHash).toMatch(/^[0-9a-f]{64}$/)
    expect(a.recoverySalt).not.toBe(b.recoverySalt)
    expect(a.recoveryHash).not.toBe(b.recoveryHash)
    const saved = JSON.stringify(a)
    expect(saved).not.toContain(code)
    expect(saved).not.toContain(cleanRecoveryInput(code))
    expect(isRecoveryRecord(a.recoveryHash, a.recoverySalt)).toBe(true)
    expect(hasRecoveryCode(a)).toBe(true)
  })

  it('checks the right code however it is typed, and nothing else', () => {
    const record = makeRecoveryRecord('K7QM-4XPA-TR9D')
    for (const typed of ['K7QM-4XPA-TR9D', 'k7qm4xpatr9d', ' k7qm 4xpa tr9d ', 'K7QM–4XPA–TR9D', 'k7 qm-4x pa-tr 9d']) {
      expect(verifyRecoveryCode(typed, record), typed).toBe(true)
    }
    for (const typed of ['K7QM-4XPA-TR9E', 'K7QM-4XPA-TR9', '', 'D9RT-APX4-MQ7K', 'K7QM-4XPA-TR9D-K']) {
      expect(verifyRecoveryCode(typed, record), typed).toBe(false)
    }
    expect(verifyRecoveryCode('K7QM-4XPA-TR9D', makeRecoveryRecord('K7QM-4XPA-TR9E'))).toBe(false)
  })

  it('never matches when there is no code, and refuses to make one from a non-code', () => {
    expect(hasRecoveryCode(noRecoveryCode())).toBe(false)
    expect(verifyRecoveryCode('K7QM-4XPA-TR9D', noRecoveryCode())).toBe(false)
    for (const bad of ['', 'K7QM', 'K7QM-4XPA-TR90', 'hello world!']) expect(() => makeRecoveryRecord(bad)).toThrow()
  })

  it('keeps only a whole stored record (64 hex characters with a salt)', () => {
    expect(isRecoveryRecord('a'.repeat(64), 'salt')).toBe(true)
    expect(isRecoveryRecord('a'.repeat(64), '')).toBe(false)
    expect(isRecoveryRecord('A'.repeat(64), 'salt')).toBe(false)
    expect(isRecoveryRecord('a'.repeat(63), 'salt')).toBe(false)
    expect(isRecoveryRecord('K7QM-4XPA-TR9D', 'salt')).toBe(false)
    expect(isRecoveryRecord(42, 'salt')).toBe(false)
  })
})

describe('wrong codes', () => {
  it('are free for the first five, then each one waits 30 seconds', () => {
    expect(RECOVERY_FREE_TRIES).toBe(5)
    for (let n = 0; n < RECOVERY_FREE_TRIES; n++) expect(recoveryWaitMs(n), `${n} wrong`).toBe(0)
    expect(recoveryWaitMs(5)).toBe(RECOVERY_WAIT_MS)
    expect(recoveryWaitMs(9)).toBe(RECOVERY_WAIT_MS)
    expect(RECOVERY_WAIT_MS).toBe(30_000)
  })
})

/** Every string in a value; templates are called with sample arguments. */
function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value)
  else if (typeof value === 'function') {
    const fn = value as (...args: unknown[]) => unknown
    for (const sample of [1, 7, 'O and 1']) strings(fn(...Array<unknown>(Math.max(1, fn.length)).fill(sample)), out)
  } else if (Array.isArray(value)) value.forEach((v) => strings(v, out))
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => strings(v, out))
  return out
}

describe('the recovery code words (grown-ups only)', () => {
  const all = [...strings(RECOVERY_COPY), ...strings(GATE_COPY), ...strings(PARENT_COPY.pin), ...strings(PARENT_COPY.home.noRecovery)]

  it('say what it is for, to write it down away from her, and that it is shown once', () => {
    expect(RECOVERY_COPY.forWhat).toBe('If you ever forget the PIN, this code lets you set a new one.')
    expect(RECOVERY_COPY.points.join(' ')).toMatch(/Write it down and keep it somewhere your climber won’t find it\./)
    expect(RECOVERY_COPY.points.join(' ')).toMatch(/It won’t be shown again\./)
    expect(RECOVERY_COPY.done).toBe('I’ve written it down')
  })

  it('never use a banned phrase or a straight apostrophe, and are never empty', () => {
    expect(all.length).toBeGreaterThan(30)
    for (const text of all) {
      expect(bannedIn(text), text).toEqual([])
      expect(text, text).not.toMatch(/'/)
      expect(text.trim(), text).not.toBe('')
    }
  })

  it('no longer ask a times-table question', () => {
    for (const text of all) expect(text, text).not.toMatch(/times|press and hold|keep holding/i)
  })
})
