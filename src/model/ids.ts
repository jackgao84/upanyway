/**
 * Short, URL-safe random ids (lowercase letters + digits). Uses crypto.getRandomValues, which works
 * in insecure contexts too (LAN http while testing); falls back to Math.random. Never randomUUID.
 */

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'
/** 36^12 ≈ 4.7e18 — collisions are not a practical concern for one child's save. */
export const ID_LENGTH = 12

export function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n)
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto
  if (c && typeof c.getRandomValues === 'function') {
    try {
      c.getRandomValues(out)
      return out
    } catch {
      // fall through to Math.random
    }
  }
  for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256)
  return out
}

/** A random id like "k3x9q0a7mz2c", or "b-k3x9q0a7mz2c" with a prefix. */
export function newId(prefix?: string): string {
  let s = ''
  while (s.length < ID_LENGTH) {
    for (const b of randomBytes(16)) {
      // 252 = 36 × 7: rejecting the top 4 byte values keeps every character equally likely.
      if (b < 252) s += ALPHABET[b % 36]
      if (s.length === ID_LENGTH) break
    }
  }
  return prefix ? `${prefix}-${s}` : s
}
