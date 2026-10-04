/**
 * Words for the Cairn (#/cairn) and the Weather Station (#/weather). Plain English for a
 * young climber (audience and reading level: see .brief/): warm, never a score, never a comparison, never a nudge.
 */
import type { BraveOutcome } from '../../storage/schema'

export const CAIRN_COPY = {
  title: 'Your cairn',
  back: 'Back',
  sceneLabel: (n: number) =>
    n === 0
      ? 'A grassy hilltop, waiting for the first stone of your cairn.'
      : `Your cairn on a grassy hilltop: ${n === 1 ? 'one stone' : `${n} stones`}. Tap a stone to read it.`,
  /** The big count line: "12" in a pebble, then "stones in your cairn" ("cairn" is a glossary term). */
  countWords: (n: number) => (n === 1 ? 'stone in your' : 'stones in your'),
  countLabel: (n: number) => (n === 1 ? '1 stone in your cairn.' : `${n} stones in your cairn.`),
  emptyTitle: 'Your cairn is waiting for its first stone.',
  emptyText: 'Do something brave in real life, then log it. Its stone goes right here.',
  logFirst: 'Log a brave thing',
  /** What the stones have opened ("Pitch" is a glossary term, so the line comes in parts). */
  trailTo: (pitch: number) => `The trail is open to Pitch ${pitch}.`,
  trailToBefore: 'The trail is open to ',
  trailToAfter: (pitch: number) => ` ${pitch}.`,
  /** The stones reach further than she has climbed: a pitch opens once the one below it is climbed too. */
  trailFound: (pitch: number) => `Your stones have found the way to Pitch ${pitch}. Climb on to get there.`,
  trailFoundBefore: 'Your stones have found the way to ',
  trailFoundAfter: (pitch: number) => ` ${pitch}. Climb on to get there.`,
  trailAll: 'The whole trail is open, all the way to Sky Lake.',
  afterSummit: (m: number) =>
    m === 0
      ? 'Since Sky Lake, every new stone brings something new to camp.'
      : m === 1
        ? 'Since Sky Lake, your stones have brought 1 new thing to camp.'
        : `Since Sky Lake, your stones have brought ${m} new things to camp.`,
  waitingLine: (w: number) =>
    w === 1
      ? '1 stone is waiting beside the cairn. It goes on tomorrow.'
      : `${w} stones are waiting beside the cairn. They go on first, starting tomorrow.`,
  tapHint: 'Tap any stone to read it again.',
  stoneLabel: (i: number, text: string) => `Stone ${i}: ${text}`,
  waitingLabel: (text: string) => `Waiting stone: ${text}`,
  letterStoneLabel: (from: string) => (from ? `A Spotted! note from ${from}` : 'A Spotted! note'),
  /** A post-summit stone brought something new. */
  unlockTitle: 'New!',
  unlockGear: (name: string) => `${name}. Try it on in the Wardrobe.`,
  unlockDecoration: (name: string) => `${name}. It’s waiting at camp.`,
} as const

export const STORY_COPY = {
  doneOn: (when: string) => (when ? `Done ${when}` : ''),
  oops: 'Oops Mission',
  smaller: 'A smaller step',
  forecast: 'Forecast',
  really: 'Really',
  /** "Forecast 7 → Really 2" (the arrow is drawn between them). */
  pair: (f: number, r: number) => `Forecast ${f} → Really ${r}`,
  pairLabel: (f: number, fl: string, r: number, rl: string) => `Forecast ${f}, ${fl}. Really ${r}, ${rl}.`,
  worried: 'I was worried that…',
  happened: 'What happened',
  howItWent: 'How it went',
  learned: 'What I learned',
  outcome: {
    nailed: 'Nailed it',
    wobbly: 'Wobbly, but I did it',
    flopped: 'Flopped — and I’m still here',
  } satisfies Record<BraveOutcome, string>,
  waitingTomorrow: 'This stone goes on tomorrow.',
  waitingLater: 'This stone goes on soon. Waiting stones go on first, oldest first.',
  waitingNow: 'This stone is waiting beside the cairn.',
  /** Letter stones. */
  spotted: 'Spotted!',
  letterTitle: (who: string) => (who ? `A note from ${who}` : 'A Spotted! note'),
  from: (who: string) => `from ${who}`,
  letterBonus: (who: string) => (who ? `A bonus stone from ${who}’s Spotted! note.` : 'A bonus stone from a Spotted! note.'),
  letterOpened: (when: string) => (when ? `Opened ${when}` : ''),
  close: 'Close',
} as const

export const WEATHER_COPY = {
  title: 'Weather Station',
  /** Exactly the brief's words. */
  caption: 'Fear forecasts usually come in stormier than the real weather.',
  emptyTitle: 'Your weather station needs 3 brave things to start forecasting.',
  emptyHave: (n: number) =>
    n === 0
      ? 'You haven’t done one yet. Each brave thing you log brings a forecast and the real weather.'
      : n === 1
        ? 'You have 1 so far. Two more and it starts.'
        : 'You have 2 so far. One more and it starts.',
  logOne: 'Log a brave thing',
  chartLabel: (n: number) => `Fear Forecast and how it really was, for your ${n} brave things, oldest first.`,
  legendForecast: 'Fear Forecast',
  legendReally: 'How it really was',
  stormy: 'Stormy',
  sunny: 'Sunny',
  columnLabel: (text: string, f: number, fl: string, r: number, rl: string) =>
    `${text}. Forecast ${f}, ${fl}. Really ${r}, ${rl}.`,
  tapHint: 'Tap a weather to read that brave thing again.',
  listTitle: 'Your forecasts',
  back: 'Back',
  today: 'Today',
  yesterday: 'Yesterday',
  rowLabel: (text: string, when: string, f: number, fl: string, r: number, rl: string) =>
    `${text}${when ? `, done ${when}` : ''}. Forecast ${f}, ${fl}. Really ${r}, ${rl}.`,
} as const
