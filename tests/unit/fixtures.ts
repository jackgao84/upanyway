/** Shared builders for unit tests. Dates are LOCAL (dayKey uses the device's time zone). */
import { defaultSave, type SaveData } from '../../src/storage/schema'
import { addBraveThing, completeBraveThing, addLetter, openLetter } from '../../src/model/stones'
import type { BraveOutcome } from '../../src/storage/schema'

/** Local date-time: at(2026, 10, 3) = 3 Oct 2026, 10:00 local. */
export function at(y: number, m: number, d: number, h = 10, min = 0): Date {
  return new Date(y, m - 1, d, h, min, 0, 0)
}

export const DAY1 = at(2026, 10, 3)

export function fresh(now: Date = DAY1): SaveData {
  return defaultSave(now)
}

/** Log a brave thing and mark it done straight away ("I already did it!"). */
export function doBrave(
  d: SaveData,
  now: Date,
  opts: { text?: string; forecast?: number; really?: number; outcome?: BraveOutcome; oops?: boolean; learned?: string } = {},
): { id: string; placed: boolean; waitingPlaced: string[] } {
  const b = addBraveThing(d, { text: opts.text ?? 'Asked a question in class', forecast: opts.forecast ?? 6, oops: opts.oops }, now)
  const r = completeBraveThing(
    d,
    b.id,
    { really: opts.really ?? 2, whatHappened: 'It went fine', outcome: opts.outcome ?? 'nailed', learned: opts.learned },
    now,
  )
  return { id: b.id, ...r }
}

export function sendLetter(d: SaveData, now: Date, open = true): { id: string; placed: boolean } {
  const l = addLetter(d, 'Mum', 'Spotted! You ordered by yourself.', now)
  if (!open) return { id: l.id, placed: false }
  return { id: l.id, placed: openLetter(d, l.id, now).placed }
}

/** Give her n placed stones spread over enough days to respect the 3-a-day cap. */
export function withStones(d: SaveData, n: number, start: Date = DAY1): void {
  for (let i = 0; i < n; i++) {
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + Math.floor(i / 3), 9, i % 3)
    doBrave(d, day, { text: `Brave thing ${i + 1}` })
  }
}

/** A rich, valid current-version save touching every part of the schema. */
export function richSave(): SaveData {
  const d = defaultSave(at(2026, 9, 1))
  d.setup = { parentDone: true, lookDone: true, complete: true }
  d.parent = { pinHash: 'a'.repeat(64), pinSalt: 'salt123', names: ['Mum', 'Dad'], dailyClimbMinutes: 25 }
  d.settings = { muted: true, music: false }
  d.profile = {
    look: { ...d.profile.look, hairStyle: 'bun', hairColor: '#222222', gear: ['gear-scarf', 'deco-lantern~sky-blue'] },
    goatName: 'Pip',
    mountainName: 'Big Blue',
  }
  d.lessonDone = true
  d.pitches = {
    p01: {
      sends: 2,
      nightSends: 1,
      totalAttempts: 9,
      firstSentAt: at(2026, 9, 2).toISOString(),
      run: {
        startedAt: at(2026, 9, 5).toISOString(),
        lastCampId: 'c1',
        lastCampRouteIndex: 2,
        whippers: 3,
        failedArcs: [
          [10, 20, 30, 40],
          [1, 2, 3, 4, 5, 6],
        ],
        routeArcs: [
          [0, 0, 5, 5],
          [5, 5, 9, 9],
        ],
        routePath: ['c0', 'a', 'c1'],
        fallsBySpot: { c1: 3 },
        lastMissBySpot: { c1: { kind: 'rope', launch: { angle: 70, power: 0.6 }, bumped: false, gusted: true, arc: [10, 20, 30, 40] } },
        highestRouteIndex: 3,
        night: false,
      },
      nightRun: null,
      lastSend: {
        at: at(2026, 9, 4).toISOString(),
        attempts: 4,
        failedArcs: [[1, 1, 2, 2]],
        routeArcs: [[0, 0, 1, 1]],
        night: false,
      },
      revealedHolds: ['h9'],
      foundCrumbles: [],
    },
  }
  d.stats = { whippers: 12, sends: 3, bigLeapsTried: 1, betaAsked: 2 }
  d.poses = { starfish: { firstAt: at(2026, 9, 1).toISOString(), count: 4 } }
  d.brave = [
    {
      id: 'b-1',
      createdAt: at(2026, 9, 1).toISOString(),
      text: 'Ordered food by myself',
      ideaId: 'order-food',
      oops: false,
      forecast: 7,
      worry: 'I might say it wrong',
      status: 'done',
      notTodayCount: 1,
      doneAt: at(2026, 9, 1, 12).toISOString(),
      really: 2,
      whatHappened: 'The lady smiled',
      outcome: 'nailed',
      learned: 'It was quick',
      stoneDay: '2026-09-01',
    },
    {
      id: 'b-2',
      createdAt: at(2026, 9, 2).toISOString(),
      text: 'Jump in the deep end',
      oops: false,
      forecast: 9,
      status: 'planned',
      notTodayCount: 2,
      stoneDay: null,
    },
    {
      id: 'b-3',
      createdAt: at(2026, 9, 3).toISOString(),
      text: 'Sit on the edge first',
      oops: false,
      forecast: 5,
      status: 'planned',
      notTodayCount: 0,
      smallerOf: 'b-2',
      afterNotToday: true,
      stoneDay: null,
    },
  ]
  d.letters = [
    {
      id: 'l-1',
      createdAt: at(2026, 9, 2).toISOString(),
      from: 'Dad',
      text: 'Spotted! You asked for help.',
      openedAt: at(2026, 9, 2, 18).toISOString(),
      stoneDay: '2026-09-02',
    },
  ]
  d.grownupFlops = [{ id: 'f-1', createdAt: at(2026, 9, 2).toISOString(), who: 'Mum', what: 'Burnt the toast', learned: 'Set a timer' }]
  d.customIdeas = [{ id: 'i-1', createdAt: at(2026, 9, 2).toISOString(), text: 'Say hi to the bus driver', oops: false }]
  d.hiddenIdeas = ['school-assembly', 'oops-worst-joke']
  d.badges = { 'first-whipper': at(2026, 9, 1).toISOString(), 'attempts-10': at(2026, 9, 3).toISOString() }
  d.glossarySeen = ['pitch', 'whipper']
  d.looksScary = { meadow: { forecast: 8, really: 3, at: at(2026, 9, 2).toISOString() }, hollow: { forecast: 6, really: null, at: at(2026, 9, 3).toISOString() } }
  d.climbTime = { day: '2026-09-05', seconds: 312.5 }
  d.summit = { reached: false, finaleSeen: false }
  d.flags = { ropeExplained: true, firstCampVisit: true, braveVsDangerousSeen: true, persistGranted: true }
  d.testMode = false
  return d
}
