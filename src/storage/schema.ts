/**
 * The save document. One JSON blob in localStorage at KEYS.save, versioned by `schemaVersion`.
 * Bump CURRENT_SCHEMA_VERSION and add a migration in migrations.ts for any shape change.
 */
import type { DayKey } from '../model/clock'
import type { LevelId, ZoneId } from '../game/types'

export const CURRENT_SCHEMA_VERSION = 1

/** Flattened [x0, y0, x1, y1, …] world units, rounded to integers, ≤ ARC_POINTS points. */
export type Arc = number[]

export interface ClimberLook {
  hairStyle: string
  hairColor: string
  skinTone: string
  outfit: string
  outfitColor: string
  helmet: string
  helmetColor: string
  backpack: string
  backpackColor: string
  /** Post-summit gear she has chosen to wear (ids from content/unlockables). */
  gear: string[]
}

export type BraveOutcome = 'nailed' | 'wobbly' | 'flopped'

export interface BraveThing {
  id: string
  createdAt: string
  text: string
  /** Set when picked from an idea card (built-in id or custom idea id). */
  ideaId?: string
  /** An Oops Mission (a small deliberate imperfection). */
  oops: boolean
  /** Fear Forecast 0–10. Never affects rewards. */
  forecast: number
  worry?: string
  status: 'planned' | 'done'
  /** Times she tapped "Not today" (costs nothing; used for the smaller-step badge). */
  notTodayCount: number
  /** If this plan is a smaller version of another plan, that plan's id. */
  smallerOf?: string
  doneAt?: string
  /** "How scary was it really?" 0–10. */
  really?: number
  whatHappened?: string
  outcome?: BraveOutcome
  learned?: string
  /** Local day its stone was placed; null = done but waiting for room under the daily cap (or not done). */
  stoneDay: DayKey | null
}

export interface Letter {
  id: string
  createdAt: string
  /** Which grown-up wrote it (one of parent.names). */
  from: string
  text: string
  openedAt?: string
  /** Local day its bonus stone was placed; null = unopened or waiting for the 1-a-day room. */
  stoneDay: DayKey | null
}

export interface GrownupFlop {
  id: string
  createdAt: string
  who: string
  what: string
  learned: string
}

export interface CustomIdea {
  id: string
  createdAt: string
  text: string
  oops: boolean
}

export interface PitchRun {
  startedAt: string
  /** Highest camp reached this run; she resumes here. */
  lastCampId: string
  whippers: number
  /** Failed leaps this run (capped at MAX_STORED_ARCS; oldest dropped, `whippers` keeps the count). */
  failedArcs: Arc[]
  /** Successful leaps since the start — truncated back to the last camp on every rope catch, so at the
   *  send it is exactly the chain that worked (the bright line on the beta map). */
  routeArcs: Arc[]
  /** Launch element id → falls from there this run (beta hint after 3, ghost after 6). */
  fallsBySpot: Record<string, number>
  /** Highest index in level.route she has reached this run (beta target = the next one). */
  highestRouteIndex: number
  night: boolean
}

export interface SendRecord {
  at: string
  attempts: number
  failedArcs: Arc[]
  routeArcs: Arc[]
  night: boolean
}

export interface PitchProgress {
  sends: number
  nightSends: number
  /** All attempts ever on this pitch (whippers + sends). */
  totalAttempts: number
  firstSentAt?: string
  /** Day run in progress (resume at its last camp). */
  run: PitchRun | null
  /** Night re-climb in progress (post-summit). Kept separate so it never clobbers a day run. */
  nightRun: PitchRun | null
  lastSend: SendRecord | null
  /** Hidden holds she has spotted on this pitch (a found shortcut stays found). */
  revealedHolds: string[]
  /** Crumbly ledges she has landed on: drawn cracked from then on (her learning, made visible). */
  foundCrumbles: string[]
}

export interface LooksScaryRecord {
  forecast: number
  really: number | null
  at: string
}

export interface SaveData {
  schemaVersion: number
  createdAt: string
  setup: {
    /** Grown-up part done (PIN + names). */
    parentDone: boolean
    /** Whole first run done (she has reached Pitch 1). */
    complete: boolean
  }
  parent: {
    pinHash: string
    pinSalt: string
    /** What she calls each parent, e.g. two entries. Entered at first run, never in source. */
    names: string[]
    /** Daily climb time in minutes (default 20). 0 = no limit. */
    dailyClimbMinutes: number
  }
  settings: {
    /** Master mute: her always-visible toggle and the parent sound setting change this same flag. */
    muted: boolean
    /** Generative ambient music on/off (parent setting). */
    music: boolean
  }
  profile: {
    look: ClimberLook
    goatName: string
    mountainName: string
  }
  lessonDone: boolean
  pitches: Partial<Record<LevelId, PitchProgress>>
  stats: {
    whippers: number
    sends: number
    bigLeapsTried: number
    betaAsked: number
  }
  /** Fall poses collected for the Hall of Flops. */
  poses: Record<string, { firstAt: string; count: number }>
  brave: BraveThing[]
  letters: Letter[]
  grownupFlops: GrownupFlop[]
  customIdeas: CustomIdea[]
  /** Badge id → ISO time earned. */
  badges: Record<string, string>
  /** Climbing words already introduced ('pitch', 'whipper', 'beta', 'send', …). */
  glossarySeen: string[]
  looksScary: Partial<Record<ZoneId, LooksScaryRecord>>
  climbTime: { day: DayKey; seconds: number }
  /** Post-summit decorations/gear, in unlock order. */
  unlocked: string[]
  summit: { reached: boolean; at?: string; finaleSeen: boolean }
  flags: {
    ropeExplained: boolean
    firstCampVisit: boolean
    braveVsDangerousSeen: boolean
    /** Result of navigator.storage.persist() (null = not asked / unsupported). */
    persistGranted: boolean | null
  }
  testMode: boolean
}

export const MAX_STORED_ARCS = 200
export const ARC_POINTS = 16
export const DEFAULT_DAILY_MINUTES = 20

export function defaultLook(): ClimberLook {
  return {
    hairStyle: 'ponytail',
    hairColor: '#4a2f23',
    skinTone: '#e8b48f',
    outfit: 'tee',
    outfitColor: '#e2725b',
    helmet: 'classic',
    helmetColor: '#f2c14e',
    backpack: 'roll-top',
    backpackColor: '#5b8c85',
    gear: [],
  }
}

export function defaultPitchProgress(): PitchProgress {
  return {
    sends: 0,
    nightSends: 0,
    totalAttempts: 0,
    run: null,
    nightRun: null,
    lastSend: null,
    revealedHolds: [],
    foundCrumbles: [],
  }
}

export function defaultSave(now: Date = new Date()): SaveData {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    createdAt: now.toISOString(),
    setup: { parentDone: false, complete: false },
    parent: { pinHash: '', pinSalt: '', names: [], dailyClimbMinutes: DEFAULT_DAILY_MINUTES },
    settings: { muted: false, music: true },
    profile: { look: defaultLook(), goatName: '', mountainName: '' },
    lessonDone: false,
    pitches: {},
    stats: { whippers: 0, sends: 0, bigLeapsTried: 0, betaAsked: 0 },
    poses: {},
    brave: [],
    letters: [],
    grownupFlops: [],
    customIdeas: [],
    badges: {},
    glossarySeen: [],
    looksScary: {},
    climbTime: { day: '', seconds: 0 },
    unlocked: [],
    summit: { reached: false, finaleSeen: false },
    flags: { ropeExplained: false, firstCampVisit: false, braveVsDangerousSeen: false, persistGranted: null },
    testMode: false,
  }
}
