/**
 * Climber designer options. Every id here is drawn by src/game/art/climber.ts; colours are any
 * hex, the palettes below are what the designer offers. Names are what she sees.
 */
import { defaultLook, type ClimberLook } from '../storage/schema'

export interface WardrobeOption {
  id: string
  name: string
  /** Colour picked when she switches to this option and hasn't chosen one yet. */
  defaultColor: string
}

export interface Swatch {
  color: string
  name: string
}

export const HAIR_STYLES: readonly WardrobeOption[] = [
  { id: 'ponytail', name: 'Ponytail', defaultColor: '#4a2f23' },
  { id: 'buns', name: 'Two buns', defaultColor: '#2a2321' },
  { id: 'bob', name: 'Bob', defaultColor: '#7a4a2c' },
  { id: 'long', name: 'Long and loose', defaultColor: '#e0b45c' },
  { id: 'curly', name: 'Curly puff', defaultColor: '#2a2321' },
  { id: 'braids', name: 'Braids', defaultColor: '#9c4a2a' },
  { id: 'crop', name: 'Short crop', defaultColor: '#4a2f23' },
  { id: 'pigtails', name: 'Pigtails', defaultColor: '#c8642f' },
  { id: 'locs', name: 'Locs', defaultColor: '#2a2321' },
]

export const HAIR_COLORS: readonly Swatch[] = [
  { color: '#2a2321', name: 'Black' },
  { color: '#4a2f23', name: 'Dark brown' },
  { color: '#7a4a2c', name: 'Brown' },
  { color: '#9c4a2a', name: 'Auburn' },
  { color: '#c8642f', name: 'Ginger' },
  { color: '#e0b45c', name: 'Blonde' },
  { color: '#efe0b8', name: 'Pale blonde' },
  { color: '#f08aa8', name: 'Bubblegum pink' },
  { color: '#a98fd8', name: 'Lavender' },
  { color: '#4fb3a9', name: 'Mermaid teal' },
  { color: '#5b8fd6', name: 'Sky blue' },
]

export const SKIN_TONES: readonly Swatch[] = [
  { color: '#fde3cf', name: 'Very light' },
  { color: '#f6d0b1', name: 'Light' },
  { color: '#efc19c', name: 'Light warm' },
  { color: '#e8b48f', name: 'Medium light' },
  { color: '#d79f74', name: 'Medium' },
  { color: '#c08559', name: 'Medium warm' },
  { color: '#a96c43', name: 'Tan' },
  { color: '#8d5533', name: 'Brown' },
  { color: '#6f4128', name: 'Dark brown' },
  { color: '#553020', name: 'Deep' },
]

export const OUTFITS: readonly WardrobeOption[] = [
  { id: 'tee', name: 'T-shirt and shorts', defaultColor: '#e2725b' },
  { id: 'hoodie', name: 'Cozy hoodie', defaultColor: '#6fa8dc' },
  { id: 'overalls', name: 'Overalls', defaultColor: '#5b8c85' },
  { id: 'dress', name: 'Climbing dress', defaultColor: '#e98fb0' },
  { id: 'raincoat', name: 'Raincoat', defaultColor: '#f2c14e' },
  { id: 'vest', name: 'Puffy vest', defaultColor: '#8c6bc8' },
  { id: 'stripes', name: 'Stripy top and long socks', defaultColor: '#3f7cbf' },
]

export const OUTFIT_COLORS: readonly Swatch[] = [
  { color: '#e2725b', name: 'Coral' },
  { color: '#f2c14e', name: 'Sunflower' },
  { color: '#f28c3a', name: 'Tangerine' },
  { color: '#7cb66a', name: 'Leaf' },
  { color: '#5b8c85', name: 'Pine' },
  { color: '#6fa8dc', name: 'Sky' },
  { color: '#3f7cbf', name: 'Ocean' },
  { color: '#8c6bc8', name: 'Grape' },
  { color: '#e98fb0', name: 'Rose' },
  { color: '#c84b6a', name: 'Berry' },
  { color: '#f4ecdc', name: 'Cream' },
]

export const HELMETS: readonly WardrobeOption[] = [
  { id: 'classic', name: 'Classic', defaultColor: '#f2c14e' },
  { id: 'vented', name: 'Speedy', defaultColor: '#e4572e' },
  { id: 'dotty', name: 'Spotty', defaultColor: '#5aa9e6' },
  { id: 'star', name: 'Star sticker', defaultColor: '#9a7fd1' },
  { id: 'cat', name: 'Cat ears', defaultColor: '#f28fb0' },
  { id: 'lamp', name: 'Headlamp', defaultColor: '#6cc5a4' },
]

export const HELMET_COLORS: readonly Swatch[] = [
  { color: '#f2c14e', name: 'Sunshine' },
  { color: '#e4572e', name: 'Tomato' },
  { color: '#f28c3a', name: 'Orange' },
  { color: '#6cc5a4', name: 'Mint' },
  { color: '#5aa9e6', name: 'Sky' },
  { color: '#9a7fd1', name: 'Purple' },
  { color: '#f28fb0', name: 'Pink' },
  { color: '#f4f1ea', name: 'Snow' },
]

export const BACKPACKS: readonly WardrobeOption[] = [
  { id: 'roll-top', name: 'Roll-top', defaultColor: '#5b8c85' },
  { id: 'daypack', name: 'Zippy daypack', defaultColor: '#e2725b' },
  { id: 'basket', name: 'Basket pack', defaultColor: '#c99a5b' },
  { id: 'frame', name: 'Big adventure pack', defaultColor: '#7a8f4e' },
  { id: 'bear', name: 'Bear pack', defaultColor: '#a0704a' },
  { id: 'patches', name: 'Patchy pack', defaultColor: '#3f7cbf' },
]

export const BACKPACK_COLORS: readonly Swatch[] = [
  { color: '#5b8c85', name: 'Pine' },
  { color: '#7a8f4e', name: 'Moss' },
  { color: '#e2725b', name: 'Coral' },
  { color: '#c84b6a', name: 'Berry' },
  { color: '#3f7cbf', name: 'Ocean' },
  { color: '#8c6bc8', name: 'Grape' },
  { color: '#c99a5b', name: 'Wicker' },
  { color: '#a0704a', name: 'Teddy' },
  { color: '#f2c14e', name: 'Mustard' },
]

function pick<T>(list: readonly T[], rng: () => number): T {
  return list[Math.min(list.length - 1, Math.floor(rng() * list.length))]
}

/** A cheerful random starting look (helmet, outfit and pack never share a colour). */
export function randomLook(rng: () => number = Math.random): ClimberLook {
  const outfit = pick(OUTFITS, rng)
  const outfitColor = pick(OUTFIT_COLORS, rng).color
  let helmetColor = pick(HELMET_COLORS, rng).color
  for (let i = 0; i < 6 && helmetColor === outfitColor; i++) helmetColor = pick(HELMET_COLORS, rng).color
  let backpackColor = pick(BACKPACK_COLORS, rng).color
  for (let i = 0; i < 6 && (backpackColor === outfitColor || backpackColor === helmetColor); i++) {
    backpackColor = pick(BACKPACK_COLORS, rng).color
  }
  return {
    hairStyle: pick(HAIR_STYLES, rng).id,
    hairColor: pick(HAIR_COLORS, rng).color,
    skinTone: pick(SKIN_TONES, rng).color,
    outfit: outfit.id,
    outfitColor,
    helmet: pick(HELMETS, rng).id,
    helmetColor,
    backpack: pick(BACKPACKS, rng).id,
    backpackColor,
    gear: [],
  }
}

const HEX = /^#[0-9a-f]{6}$/i

/** Repair a stored look: unknown ids fall back to the defaults, bad colours to their defaults. */
export function normalizeLook(look: Partial<ClimberLook> | null | undefined): ClimberLook {
  const d = defaultLook()
  const l = look ?? {}
  const id = (v: unknown, list: readonly WardrobeOption[], fb: string) =>
    typeof v === 'string' && list.some((o) => o.id === v) ? v : fb
  const col = (v: unknown, fb: string) => (typeof v === 'string' && HEX.test(v) ? v : fb)
  return {
    hairStyle: id(l.hairStyle, HAIR_STYLES, d.hairStyle),
    hairColor: col(l.hairColor, d.hairColor),
    skinTone: col(l.skinTone, d.skinTone),
    outfit: id(l.outfit, OUTFITS, d.outfit),
    outfitColor: col(l.outfitColor, d.outfitColor),
    helmet: id(l.helmet, HELMETS, d.helmet),
    helmetColor: col(l.helmetColor, d.helmetColor),
    backpack: id(l.backpack, BACKPACKS, d.backpack),
    backpackColor: col(l.backpackColor, d.backpackColor),
    gear: Array.isArray(l.gear) ? l.gear.filter((g): g is string => typeof g === 'string') : [],
  }
}
