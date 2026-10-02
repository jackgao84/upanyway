/**
 * Level data format. Levels are pure data (src/game/levels/*.ts); the validator
 * (tests/levels/validator.test.ts) proves each required route is climbable with the real physics.
 *
 * World units, y-up (altitude). Pitch width is WORLD_W (400) with solid side walls.
 * "One screen" is SCREEN_H (600) units of altitude.
 */

export const WORLD_W = 400
export const SCREEN_H = 600

export type ZoneId = 'meadow' | 'hollow' | 'crumble' | 'ridge' | 'cloud' | 'summit'
export type LevelId =
  | 'lesson'
  | 'p01' | 'p02' | 'p03' | 'p04' | 'p05' | 'p06' | 'p07' | 'p08'
  | 'p09' | 'p10' | 'p11' | 'p12' | 'p13' | 'p14' | 'p15' | 'p16'

export const PITCH_IDS: Exclude<LevelId, 'lesson'>[] = [
  'p01', 'p02', 'p03', 'p04', 'p05', 'p06', 'p07', 'p08',
  'p09', 'p10', 'p11', 'p12', 'p13', 'p14', 'p15', 'p16',
]

/** A solid rock ledge. She stands on its top surface. */
export interface Ledge {
  id: string
  kind: 'ledge'
  /** Left edge. */
  x: number
  /** Top surface altitude. */
  y: number
  w: number
  /** Thickness below the top surface (default LEDGE_H). */
  h?: number
  /** A camp: rope anchor; the rope catches falls below the highest camp reached. */
  camp?: boolean
  /** Crumbles `TUNING.crumbleDelay` s after she lands; restored after the next rope catch. */
  crumble?: boolean
  /** Drawn as a rope bridge (Gusty Ridge Looks Scary). Physically a normal ledge. */
  bridge?: boolean
  /** Where she settles after landing (default: centre). */
  standX?: number
}

export const LEDGE_H = 26

/** A hand hold. She hangs from it. */
export interface Hold {
  id: string
  kind: 'hold'
  x: number
  y: number
  /** Only appears (and only collides) after she falls past it. Never on the required route. */
  hidden?: boolean
  style?: 'jug' | 'root' | 'crystal' | 'knob'
}

export type LevelElement = Ledge | Hold

/** Horizontal wind gusts on a fixed rhythm (global pitch clock). */
export interface WindZone {
  id: string
  x: number
  y: number
  w: number
  h: number
  dir: -1 | 1
  /** Horizontal acceleration while gusting, before TUNING.windScale. */
  accel: number
  /** Seconds per cycle. */
  period: number
  /** Seconds of gust at the start of each cycle (after offset). */
  gust: number
  /** Seconds of phase offset. */
  offset: number
}

export type LooksScaryKind = 'bigleap' | 'eyes' | 'rumble' | 'bridge' | 'shadow'

export interface LooksScary {
  kind: LooksScaryKind
  /** Arriving on this element (first time this run) shows the scary thing + Fear Forecast. */
  forecastAt: string
  /** Arriving on this element plays the gentle reveal + "How scary was it really?". */
  revealAt: string
  /** Where the scary thing is drawn (world units). */
  x: number
  y: number
}

export type DecorKind =
  | 'tree' | 'pine' | 'bush' | 'flowers' | 'grass' | 'rock' | 'sign' | 'cave'
  | 'mushroom' | 'crystal' | 'flag' | 'cloud' | 'snow' | 'tent' | 'lantern'

export interface Decor {
  kind: DecorKind
  x: number
  y: number
  /** 1 = default size. */
  scale?: number
  flip?: boolean
  /** Text for signs. */
  text?: string
}

export interface Level {
  id: LevelId
  /** 0 for the lesson, 1..16 for pitches. */
  index: number
  zone: ZoneId
  title: string
  /** Altitude of the pitch top region (1800–2400 for pitches). */
  height: number
  elements: LevelElement[]
  /** Ordered ids: route[0] = start camp, route[route.length-1] = pitch top. */
  route: string[]
  bigLeaps?: { from: string; to: string }[]
  wind?: WindZone[]
  looksScary?: LooksScary
  decor?: Decor[]
  /** Night re-climb is the same geometry; this only marks the summit pitch's ending. */
  finale?: boolean
}

/** One saved validator solution for a route step. */
export interface StepSolution {
  from: string
  to: string
  angle: number
  power: number
  /** Global pitch clock time to launch at (matters only for wind). */
  launchTime: number
  /** How far (deg / power) the solution is from the nearest failing input. */
  marginAngle: number
  marginPower: number
}

export interface SolutionsFile {
  generatedBy: string
  tuningHash: string
  levels: Partial<Record<LevelId, StepSolution[]>>
}
