/**
 * Zone palettes: one time of day per zone (sunrise at the bottom of the mountain, sunset at the top)
 * plus a moonlit night variant of each. Everything the world renderer paints takes its colours from
 * here, so a zone's whole look is one object. Colours are hex strings (the art helpers in
 * game/art/rig.ts mix and shade hex).
 */
import { mix, rgba } from '../art/rig'
import type { ZoneId } from '../types'

/** What sits on top of every ledge in the zone. */
export type TopKind = 'grass' | 'moss' | 'sand' | 'snow' | 'cloud'

/** Gentle ambient particles. */
export type AmbientKind = 'pollen' | 'petals' | 'fireflies' | 'dust' | 'leaves' | 'mist' | 'snow' | 'sparkles'

/** Silhouette style of the nearest parallax layer. */
export type HillKind = 'meadow' | 'forest' | 'mesa' | 'alpine' | 'cloudsea' | 'peaks'

export interface SkyStop {
  at: number
  color: string
}

export interface ZonePalette {
  zone: ZoneId
  night: boolean
  /** Sky gradient, top of the screen (0) → horizon (1). */
  sky: SkyStop[]
  /** Sun by day, moon by night. x: fraction of the view width; y: fraction of the view height at the
   *  foot of the pitch (it sinks very slowly as she climbs); r: radius in CSS px at a 1x scale. */
  celestial: { kind: 'sun' | 'moon'; color: string; glow: string; x: number; y: number; r: number }
  /** Stars in the sky (0 by day). */
  stars: number
  cloud: string
  cloudShade: string
  /** Parallax mountain layers, far → near. */
  mountains: string[]
  /** Snow caps on the far peaks (null = none). */
  snowcap: string | null
  hills: HillKind
  /** Atmospheric haze at the foot of each mountain layer. */
  haze: string
  /** The climbing face behind the route. */
  face: string
  faceLight: string
  faceDark: string
  faceEdge: string
  /** Small things growing on the face (moss, vines, snow patches). */
  facePatch: string
  ground: string
  groundDark: string
  /** Ledge rock: the slab. */
  rock: string
  rockLight: string
  rockDark: string
  rockInk: string
  /** Ledge top. */
  top: string
  topLight: string
  topDark: string
  topKind: TopKind
  /** Grass blades poking through (also the tufts that bend in the wind). */
  tuft: string
  /** Flowers, berries, sparkles. */
  accents: string[]
  hold: { jug: string; root: string; crystal: string; knob: string; glow: string }
  wood: string
  tent: string
  tentStripe: string
  flag: string
  lantern: string
  lanternGlow: string
  /** Chalk lines and puffs. */
  chalk: string
  /** The climbing rope. */
  rope: string
  ropeLight: string
  particles: AmbientKind[]
  /** Ambient light colour (the character module may tint her with it at ambientAlpha). */
  ambient: string
  ambientAlpha: number
  /** Foreground mist at the bottom of the view (alpha 0 = none). */
  mist: string
  mistAlpha: number
  /** Default outline ink. */
  ink: string
  /** Paper shadow under layers and ledges (rgba). */
  shadow: string
  /** Screen vignette strength 0..1. */
  vignette: number
  vignetteColor: string
}

type DayPalette = Omit<ZonePalette, 'zone' | 'night' | 'shadow'>

const DAY: Record<ZoneId, DayPalette> = {
  // Sunrise: peach, pink and gold over green foothills.
  meadow: {
    sky: [
      { at: 0, color: '#b3c9ea' },
      { at: 0.32, color: '#e8c5dc' },
      { at: 0.66, color: '#ffcdb5' },
      { at: 1, color: '#ffe5b6' },
    ],
    celestial: { kind: 'sun', color: '#fff3c9', glow: '#ffd27a', x: 0.86, y: 0.13, r: 30 },
    stars: 0,
    cloud: '#fff4ec',
    cloudShade: '#f2cdd2',
    mountains: ['#ecd2e2', '#c9a3c8', '#a8c99a', '#82b46e'],
    snowcap: '#fff6f2',
    hills: 'meadow',
    haze: '#ffe2cc',
    face: '#ecd2bf',
    faceLight: '#f5e0cf',
    faceDark: '#ddbca8',
    faceEdge: '#c99f8b',
    facePatch: '#a9cc8a',
    ground: '#8cc06e',
    groundDark: '#6aa257',
    rock: '#b4836e',
    rockLight: '#cf9f88',
    rockDark: '#8e6253',
    rockInk: '#5a3838',
    top: '#8fca6a',
    topLight: '#b8e28c',
    topDark: '#5f9f4f',
    topKind: 'grass',
    tuft: '#7cbd5c',
    accents: ['#ff9db0', '#ffd36b', '#ffffff', '#c7a6ff'],
    hold: { jug: '#c48669', root: '#9a6a45', crystal: '#8fd0e4', knob: '#bb8f7a', glow: '#fff4dc' },
    wood: '#b07b52',
    tent: '#f08c70',
    tentStripe: '#ffd36b',
    flag: '#e8735a',
    lantern: '#ffcf6e',
    lanternGlow: '#ffd98a',
    chalk: '#ffffff',
    rope: '#e8735a',
    ropeLight: '#ffd2c2',
    particles: ['pollen', 'petals'],
    ambient: '#ffd9b8',
    ambientAlpha: 0.1,
    mist: '#fff1e8',
    mistAlpha: 0.32,
    ink: '#4a2e34',
    vignette: 0.16,
    vignetteColor: '#7a4a5a',
  },
  // Fresh morning greens outside; inside the hollow, a dark mossy cave.
  hollow: {
    sky: [
      { at: 0, color: '#b9e1d8' },
      { at: 0.45, color: '#d9f0d6' },
      { at: 1, color: '#f6f6d2' },
    ],
    celestial: { kind: 'sun', color: '#fffbe2', glow: '#f2efb0', x: 0.18, y: 0.38, r: 28 },
    stars: 0,
    cloud: '#f7fbef',
    cloudShade: '#d3e8d4',
    mountains: ['#c2e0cb', '#98c6a7', '#6ca686', '#4c8a6b'],
    snowcap: null,
    hills: 'forest',
    haze: '#e6f3dc',
    face: '#3d5249',
    faceLight: '#4a6358',
    faceDark: '#2f413a',
    faceEdge: '#24332d',
    facePatch: '#4f8a52',
    ground: '#5f9459',
    groundDark: '#467848',
    rock: '#8e9c87',
    rockLight: '#aab8a1',
    rockDark: '#6c7b69',
    rockInk: '#26352f',
    top: '#7cc565',
    topLight: '#a8e07f',
    topDark: '#4f9a4b',
    topKind: 'moss',
    tuft: '#6cb85a',
    accents: ['#d9ff9a', '#ffe08a', '#8fe3ff', '#ffffff'],
    hold: { jug: '#a7b39b', root: '#ab794d', crystal: '#7fe0d0', knob: '#9fad96', glow: '#eaffd2' },
    wood: '#8a6a48',
    tent: '#6aa7c9',
    tentStripe: '#ffe08a',
    flag: '#ffcf5a',
    lantern: '#ffe08a',
    lanternGlow: '#fff0a8',
    chalk: '#f8fff4',
    rope: '#ef7d5f',
    ropeLight: '#ffd8c8',
    particles: ['fireflies'],
    ambient: '#d8ffd0',
    ambientAlpha: 0.06,
    mist: '#eaf7e6',
    mistAlpha: 0,
    ink: '#21302a',
    vignette: 0.3,
    vignetteColor: '#0f1d18',
  },
  // Warm late morning: sandstone stripes and ochre mesas.
  crumble: {
    sky: [
      { at: 0, color: '#8ccbe8' },
      { at: 0.5, color: '#c3e3ea' },
      { at: 1, color: '#fbe6c2' },
    ],
    celestial: { kind: 'sun', color: '#fffbe8', glow: '#ffe7a6', x: 0.78, y: 0.24, r: 30 },
    stars: 0,
    cloud: '#fffaf0',
    cloudShade: '#f0dcc4',
    mountains: ['#f0d6b6', '#e3b98f', '#cf9b6e', '#b88058'],
    snowcap: null,
    hills: 'mesa',
    haze: '#fbe8cc',
    face: '#e8bc8e',
    faceLight: '#f2cfa6',
    faceDark: '#d8a476',
    faceEdge: '#c0885b',
    facePatch: '#b9b06a',
    ground: '#dcb27e',
    groundDark: '#c49663',
    rock: '#bf744b',
    rockLight: '#d68f63',
    rockDark: '#9b5737',
    rockInk: '#582e20',
    top: '#f1d39d',
    topLight: '#fbe7bd',
    topDark: '#d6ae74',
    topKind: 'sand',
    tuft: '#a3b860',
    accents: ['#ff9a6a', '#ffd36b', '#a7cf73', '#ffffff'],
    hold: { jug: '#c47d52', root: '#8e5c3a', crystal: '#ffc06a', knob: '#bb7a52', glow: '#fff1d8' },
    wood: '#a87048',
    tent: '#5aa6a0',
    tentStripe: '#fff0c8',
    flag: '#e8735a',
    lantern: '#ffcf6e',
    lanternGlow: '#ffd98a',
    chalk: '#ffffff',
    rope: '#5d8fd0',
    ropeLight: '#cfe2ff',
    particles: ['dust'],
    ambient: '#ffe3b8',
    ambientAlpha: 0.08,
    mist: '#fff2dc',
    mistAlpha: 0.12,
    ink: '#4f2c20',
    vignette: 0.14,
    vignetteColor: '#7a4a2a',
  },
  // Bright afternoon: blue sky, cool grey rock, snow.
  ridge: {
    sky: [
      { at: 0, color: '#4ea4dc' },
      { at: 0.5, color: '#86c6ea' },
      { at: 1, color: '#d8f1fb' },
    ],
    celestial: { kind: 'sun', color: '#ffffff', glow: '#fff4cc', x: 0.22, y: 0.16, r: 26 },
    stars: 0,
    cloud: '#ffffff',
    cloudShade: '#d6e5f2',
    mountains: ['#c9dbec', '#a3bed8', '#7f9fbf', '#5f7f9f'],
    snowcap: '#ffffff',
    hills: 'alpine',
    haze: '#e6f4fb',
    face: '#a9b7c6',
    faceLight: '#bfcad6',
    faceDark: '#93a2b3',
    faceEdge: '#7a899b',
    facePatch: '#f4f9fd',
    ground: '#eef5fa',
    groundDark: '#cbdae6',
    rock: '#7b8797',
    rockLight: '#97a3b1',
    rockDark: '#616b7a',
    rockInk: '#303846',
    top: '#f7fbff',
    topLight: '#ffffff',
    topDark: '#cbdcea',
    topKind: 'snow',
    tuft: '#9cba6b',
    accents: ['#ffffff', '#ffd36b', '#ff9db0', '#b6e0ff'],
    hold: { jug: '#8692a3', root: '#8a6a50', crystal: '#8fd6ff', knob: '#848fa0', glow: '#f2f9ff' },
    wood: '#9a7656',
    tent: '#e8735a',
    tentStripe: '#ffffff',
    flag: '#f5b83d',
    lantern: '#ffd36b',
    lanternGlow: '#ffe7a0',
    chalk: '#ffffff',
    rope: '#e8735a',
    ropeLight: '#ffd2c2',
    particles: ['leaves'],
    ambient: '#e6f4ff',
    ambientAlpha: 0.05,
    mist: '#f4fbff',
    mistAlpha: 0.18,
    ink: '#2c3442',
    vignette: 0.12,
    vignetteColor: '#2a3a55',
  },
  // Golden hour: amber light, lilac rock, soft fog.
  cloud: {
    sky: [
      { at: 0, color: '#a99ad6' },
      { at: 0.36, color: '#d9b0c9' },
      { at: 0.72, color: '#f8c78f' },
      { at: 1, color: '#ffe2aa' },
    ],
    celestial: { kind: 'sun', color: '#fff0c2', glow: '#ffc978', x: 0.8, y: 0.5, r: 32 },
    stars: 0,
    cloud: '#fff4ec',
    cloudShade: '#e5cbe0',
    mountains: ['#e6cbdf', '#d0b0d2', '#b597c3', '#977cae'],
    snowcap: '#fff3ee',
    hills: 'cloudsea',
    haze: '#ffe6cf',
    face: '#ccb8d0',
    faceLight: '#ddcdde',
    faceDark: '#b8a3bf',
    faceEdge: '#9e88a8',
    facePatch: '#fff2ea',
    ground: '#fff2ea',
    groundDark: '#e9d4e4',
    rock: '#9984aa',
    rockLight: '#b4a1c3',
    rockDark: '#7c688f',
    rockInk: '#433457',
    top: '#fff6ee',
    topLight: '#ffffff',
    topDark: '#e9d6e6',
    topKind: 'cloud',
    tuft: '#b0c47a',
    accents: ['#ffd28a', '#ffb3c7', '#ffffff', '#c9b6ff'],
    hold: { jug: '#8d78a6', root: '#8e6a58', crystal: '#b9a2ff', knob: '#8a74a2', glow: '#fff3e2' },
    wood: '#9d7b6a',
    tent: '#f5b83d',
    tentStripe: '#ffffff',
    flag: '#e8735a',
    lantern: '#ffd28a',
    lanternGlow: '#ffe2a8',
    chalk: '#ffffff',
    rope: '#e8735a',
    ropeLight: '#ffd8c8',
    particles: ['mist'],
    ambient: '#ffd9a8',
    ambientAlpha: 0.1,
    mist: '#fff5f2',
    mistAlpha: 0.5,
    ink: '#3f3150',
    vignette: 0.14,
    vignetteColor: '#5a3f6a',
  },
  // Sunset: rose and violet, pink snow, the last light.
  summit: {
    sky: [
      { at: 0, color: '#6c5aa8' },
      { at: 0.34, color: '#a77ab9' },
      { at: 0.7, color: '#ef95a2' },
      { at: 1, color: '#ffc08a' },
    ],
    celestial: { kind: 'sun', color: '#ffe3b4', glow: '#ff9f8a', x: 0.16, y: 0.3, r: 36 },
    stars: 8,
    cloud: '#ffdcdc',
    cloudShade: '#d99ab6',
    mountains: ['#c993b8', '#a77aab', '#85619b', '#654c84'],
    snowcap: '#ffe9ef',
    hills: 'peaks',
    haze: '#ffc9b4',
    face: '#c49eb3',
    faceLight: '#d6b4c5',
    faceDark: '#ae89a2',
    faceEdge: '#94718c',
    facePatch: '#fff0f4',
    ground: '#fbeaf0',
    groundDark: '#e6c9d8',
    rock: '#7d5f86',
    rockLight: '#987ba1',
    rockDark: '#634a6d',
    rockInk: '#382642',
    top: '#fff0f3',
    topLight: '#ffffff',
    topDark: '#efcadb',
    topKind: 'snow',
    tuft: '#b8b07a',
    accents: ['#ffd36b', '#ffffff', '#ffb3c7', '#bfa6ff'],
    hold: { jug: '#87698f', root: '#8a5e52', crystal: '#ffb3d6', knob: '#8a6e94', glow: '#fff1f6' },
    wood: '#8f6a5a',
    tent: '#5aa6a0',
    tentStripe: '#ffe9b0',
    flag: '#f5b83d',
    lantern: '#ffd36b',
    lanternGlow: '#ffe2a0',
    chalk: '#ffffff',
    rope: '#f5b83d',
    ropeLight: '#fff0c4',
    particles: ['snow', 'sparkles'],
    ambient: '#ffb8b0',
    ambientAlpha: 0.12,
    mist: '#ffe9ef',
    mistAlpha: 0.22,
    ink: '#36243f',
    vignette: 0.16,
    vignetteColor: '#3a2048',
  },
}

/** Night skies: deep blues with a hint of each zone's own colour near the horizon. */
const NIGHT_SKY: Record<ZoneId, SkyStop[]> = {
  meadow: [
    { at: 0, color: '#151d3d' },
    { at: 0.55, color: '#2a3566' },
    { at: 1, color: '#4c4a7c' },
  ],
  hollow: [
    { at: 0, color: '#121c38' },
    { at: 0.55, color: '#223a5c' },
    { at: 1, color: '#365a6c' },
  ],
  crumble: [
    { at: 0, color: '#161b3c' },
    { at: 0.55, color: '#2c3362' },
    { at: 1, color: '#55497a' },
  ],
  ridge: [
    { at: 0, color: '#101a3a' },
    { at: 0.55, color: '#21346a' },
    { at: 1, color: '#3b5585' },
  ],
  cloud: [
    { at: 0, color: '#18183e' },
    { at: 0.55, color: '#30306a' },
    { at: 1, color: '#5a4a84' },
  ],
  summit: [
    { at: 0, color: '#120f34' },
    { at: 0.55, color: '#2c2462' },
    { at: 1, color: '#55387a' },
  ],
}

const NIGHT_BLUE = '#1e2852'
const MOON_BLUE = '#3a4a80'

function nightOf(zone: ZoneId, d: DayPalette): DayPalette {
  const dim = (c: string, k = 0.58) => mix(c, NIGHT_BLUE, k)
  const moonlit = (c: string, k = 0.42) => mix(c, MOON_BLUE, k)
  return {
    ...d,
    sky: NIGHT_SKY[zone],
    celestial: { kind: 'moon', color: '#fbf5de', glow: '#b9c7ff', x: 1 - d.celestial.x, y: 0.07, r: 24 },
    stars: 110,
    cloud: dim(d.cloud, 0.62),
    cloudShade: dim(d.cloudShade, 0.7),
    mountains: d.mountains.map((c, i) => dim(c, 0.6 + i * 0.07)),
    snowcap: d.snowcap ? moonlit(d.snowcap, 0.45) : null,
    haze: dim(d.haze, 0.62),
    face: dim(d.face, 0.7),
    faceLight: dim(d.faceLight, 0.64),
    faceDark: dim(d.faceDark, 0.74),
    faceEdge: dim(d.faceEdge, 0.66),
    facePatch: dim(d.facePatch, 0.55),
    ground: dim(d.ground, 0.58),
    groundDark: dim(d.groundDark, 0.64),
    rock: moonlit(d.rock, 0.42),
    rockLight: moonlit(d.rockLight, 0.36),
    rockDark: dim(d.rockDark, 0.58),
    rockInk: mix(d.rockInk, '#0e1230', 0.45),
    top: moonlit(d.top, 0.3),
    topLight: moonlit(d.topLight, 0.22),
    topDark: dim(d.topDark, 0.55),
    tuft: moonlit(d.tuft, 0.45),
    accents: d.accents.map((c) => moonlit(c, 0.3)),
    hold: {
      jug: moonlit(d.hold.jug, 0.42),
      root: moonlit(d.hold.root, 0.42),
      crystal: mix(d.hold.crystal, '#bfe8ff', 0.3),
      knob: moonlit(d.hold.knob, 0.42),
      glow: '#dfe8ff',
    },
    wood: moonlit(d.wood, 0.45),
    tent: moonlit(d.tent, 0.4),
    tentStripe: moonlit(d.tentStripe, 0.35),
    flag: moonlit(d.flag, 0.3),
    // Lanterns stay warm: they are the light at night.
    lantern: '#ffd47a',
    lanternGlow: '#ffcf70',
    chalk: '#eef3ff',
    rope: mix(d.rope, '#ffffff', 0.08),
    ropeLight: d.ropeLight,
    particles: zone === 'summit' || zone === 'ridge' ? ['fireflies', 'snow'] : ['fireflies'],
    ambient: '#9fb2ff',
    ambientAlpha: 0.16,
    mist: dim(d.mist, 0.55),
    mistAlpha: d.mistAlpha * 0.6,
    ink: mix(d.ink, '#0b0e26', 0.4),
    vignette: 0.32,
    vignetteColor: '#060a22',
  }
}

const cache = new Map<string, ZonePalette>()

/** The palette for a zone (day or night). Cached: the same object every call. */
export function paletteFor(zone: ZoneId, night = false): ZonePalette {
  const key = `${zone}:${night ? 1 : 0}`
  const hit = cache.get(key)
  if (hit) return hit
  const day = DAY[zone]
  const base = night ? nightOf(zone, day) : day
  const p: ZonePalette = {
    ...base,
    zone,
    night,
    shadow: rgba(mix(base.ink, base.faceDark, 0.3), night ? 0.42 : 0.26),
  }
  cache.set(key, p)
  return p
}

export const ZONES: readonly ZoneId[] = ['meadow', 'hollow', 'crumble', 'ridge', 'cloud', 'summit']

/** The sky colour at a fraction 0 (top) .. 1 (horizon) — for DOM chrome that wants to match. */
export function skyAt(p: ZonePalette, f: number): string {
  const s = p.sky
  if (f <= s[0].at) return s[0].color
  for (let i = 1; i < s.length; i++) {
    if (f <= s[i].at) {
      const a = s[i - 1]
      const b = s[i]
      return mix(a.color, b.color, (f - a.at) / Math.max(1e-6, b.at - a.at))
    }
  }
  return s[s.length - 1].color
}
