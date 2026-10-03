/**
 * Name ideas for the goat and the mountain (first run). Cozy, original, nobody real.
 * The screens pre-fill one and offer a handful more as chips; she can always type her own.
 */

export const GOAT_NAMES: readonly string[] = [
  'Pebble',
  'Biscuit',
  'Clover',
  'Puddle',
  'Nibbles',
  'Marshmallow',
  'Bramble',
  'Tumble',
  'Snowdrop',
  'Mochi',
  'Pickle',
  'Fuzzbutton',
  'Bean',
  'Sprout',
  'Toffee',
  'Crumpet',
  'Noodle',
  'Pip',
  'Bumble',
  'Waffles',
  'Juniper',
  'Dumpling',
  'Puffball',
  'Wiggles',
]

export const MOUNTAIN_NAMES: readonly string[] = [
  'Mount Wobbletop',
  'Mount Anyway',
  'Big Bumpy',
  'Cloudnibble Peak',
  'Mount Maybe',
  'Sunrise Spire',
  'Pebblepeak',
  'Mount Marshmallow',
  'Gigglecrag',
  'Puffin Peak',
  'Honeycomb Peak',
  'Mount Hullabaloo',
  'Starlight Summit',
  'Mount Pancake',
  'Snowcone Peak',
  'Mount Tippytoes',
  'Dragonback Ridge',
  'Mount Cozy',
  'Whistlewind Peak',
  'Mount Kerfuffle',
]

/** `count` different names from `list`, in a random order. */
export function pickNames(list: readonly string[], count: number, rng: () => number = Math.random): string[] {
  const pool = list.slice()
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = pool[i]
    pool[i] = pool[j]
    pool[j] = tmp
  }
  return pool.slice(0, Math.max(0, Math.min(count, pool.length)))
}
