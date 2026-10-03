/**
 * Seeded randomness for anything that must look random but stay the same every time: stone shapes,
 * fall-pose picks, unlockable colour variants. Physics never uses randomness.
 */

/** 32-bit string hash (FNV-1a with a murmur3 finaliser for better spread). */
export function hashString(str: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}

/** mulberry32: tiny, fast, good enough for visuals. Returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface Rng {
  /** Float in [0, 1). */
  next(): number
  /** Integer in [0, n). 0 when n ≤ 0. */
  int(n: number): number
  /** Float in [min, max). */
  range(min: number, max: number): number
  /** One element (throws on an empty array — content arrays are never empty). */
  pick<T>(arr: readonly T[]): T
  /** A shuffled copy (Fisher–Yates); the input is left untouched. */
  shuffle<T>(arr: readonly T[]): T[]
}

/** A seeded generator. String seeds go through hashString. */
export function createRng(seed: number | string): Rng {
  const next = mulberry32(typeof seed === 'string' ? hashString(seed) : seed)
  const int = (n: number): number => (n > 0 ? Math.floor(next() * Math.floor(n)) : 0)
  return {
    next,
    int,
    range: (min, max) => min + next() * (max - min),
    pick<T>(arr: readonly T[]): T {
      if (arr.length === 0) throw new Error('rng.pick: empty array')
      return arr[int(arr.length)]
    },
    shuffle<T>(arr: readonly T[]): T[] {
      const out = arr.slice()
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(i + 1)
        const tmp = out[i]
        out[i] = out[j]
        out[j] = tmp
      }
      return out
    },
  }
}
