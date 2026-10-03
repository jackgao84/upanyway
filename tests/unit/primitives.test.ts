import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sha256Hex } from '../../src/model/hash'
import { ID_LENGTH, newId } from '../../src/model/ids'
import { hasPin, isValidPin, makePinRecord, verifyPin } from '../../src/model/pin'
import { createRng, hashString, mulberry32 } from '../../src/model/rng'

describe('sha256Hex', () => {
  it('matches the standard test vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    )
    expect(
      sha256Hex(
        'abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu',
      ),
    ).toBe('cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1')
    expect(sha256Hex('a'.repeat(1_000_000))).toBe('cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0')
  })

  it('agrees with node:crypto across padding boundaries and UTF-8', () => {
    const samples: string[] = []
    for (let n = 0; n <= 130; n++) samples.push('x'.repeat(n))
    samples.push('héllo wörld', '山に登る', '🐐🧗‍♀️⛰️', 'upanyway:pin:salt:1234')
    for (const s of samples) {
      expect(sha256Hex(s)).toBe(createHash('sha256').update(s, 'utf8').digest('hex'))
    }
  })
})

describe('pin', () => {
  it('accepts exactly four ASCII digits', () => {
    expect(isValidPin('1234')).toBe(true)
    expect(isValidPin('0000')).toBe(true)
    for (const bad of ['', '123', '12345', 'abcd', '12 4', '１２３４', ' 1234', '12.4']) {
      expect(isValidPin(bad)).toBe(false)
    }
  })

  it('verifies the right PIN only, with a fresh salt each time', () => {
    const a = makePinRecord('2580')
    const b = makePinRecord('2580')
    expect(a.pinHash).toMatch(/^[0-9a-f]{64}$/)
    expect(a.pinSalt).not.toBe(b.pinSalt)
    expect(a.pinHash).not.toBe(b.pinHash)
    expect(verifyPin('2580', a)).toBe(true)
    expect(verifyPin('2580', b)).toBe(true)
    expect(verifyPin('2581', a)).toBe(false)
    expect(verifyPin('258', a)).toBe(false)
    expect(hasPin(a)).toBe(true)
  })

  it('never verifies when no PIN is set, and refuses to make a bad one', () => {
    expect(verifyPin('1234', { pinHash: '', pinSalt: '' })).toBe(false)
    expect(hasPin({ pinHash: '', pinSalt: '' })).toBe(false)
    expect(() => makePinRecord('12')).toThrow()
  })
})

describe('newId', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('is short, URL-safe and unique', () => {
    const ids = new Set<string>()
    for (let i = 0; i < 2000; i++) {
      const id = newId()
      expect(id).toMatch(new RegExp(`^[0-9a-z]{${ID_LENGTH}}$`))
      ids.add(id)
    }
    expect(ids.size).toBe(2000)
    expect(newId('b')).toMatch(/^b-[0-9a-z]{12}$/)
    const id = newId('l')
    expect(encodeURIComponent(id)).toBe(id)
  })

  it('falls back to Math.random without crypto', () => {
    vi.stubGlobal('crypto', undefined)
    const a = newId()
    const b = newId()
    expect(a).toMatch(/^[0-9a-z]{12}$/)
    expect(a).not.toBe(b)
  })
})

describe('rng', () => {
  it('is deterministic per seed', () => {
    const a = createRng(42)
    const b = createRng(42)
    const c = createRng(43)
    const sa = Array.from({ length: 20 }, () => a.next())
    const sb = Array.from({ length: 20 }, () => b.next())
    const sc = Array.from({ length: 20 }, () => c.next())
    expect(sa).toEqual(sb)
    expect(sa).not.toEqual(sc)
    for (const x of sa) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(1)
    }
  })

  it('string seeds go through hashString', () => {
    expect(hashString('stone-1')).toBe(hashString('stone-1'))
    expect(hashString('stone-1')).not.toBe(hashString('stone-2'))
    expect(Number.isInteger(hashString('x'))).toBe(true)
    expect(hashString('x')).toBeGreaterThanOrEqual(0)
    expect(hashString('x')).toBeLessThan(2 ** 32)
    expect(createRng('abc').next()).toBe(mulberry32(hashString('abc'))())
  })

  it('int, range, pick and shuffle stay in bounds', () => {
    const r = createRng('bounds')
    for (let i = 0; i < 500; i++) {
      const n = r.int(7)
      expect(Number.isInteger(n) && n >= 0 && n < 7).toBe(true)
      const f = r.range(2, 5)
      expect(f >= 2 && f < 5).toBe(true)
    }
    expect(r.int(0)).toBe(0)
    expect(['a', 'b', 'c']).toContain(r.pick(['a', 'b', 'c']))
    expect(() => r.pick([])).toThrow()
    const input = [1, 2, 3, 4, 5, 6, 7, 8]
    const shuffled = createRng(9).shuffle(input)
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect([...shuffled].sort((x, y) => x - y)).toEqual(input)
    expect(createRng(9).shuffle(input)).toEqual(shuffled)
  })
})
