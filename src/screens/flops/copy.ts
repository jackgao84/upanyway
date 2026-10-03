/**
 * Words on the Hall of Flops, Letters and Badges screens. Plain English for a young climber (audience and reading level: see .brief/); the
 * narrator states no morals and makes no jokes about her real flops (those are framed like museum
 * paintings). Climbing words are written as slots ({whipper}, {beta}) so screens/flops/words.ts can
 * introduce them the first time. Other slots: {goat}, {names}.
 */
import type { BadgeId } from '../../content/badges'

export const HALL_COPY = {
  title: 'Hall of Flops',
  back: 'Back to camp',
  tabsLabel: 'Parts of the Hall of Flops',
  tabs: {
    poses: 'Fall poses',
    mine: 'My flops',
    wing: 'Grown-ups’ Wing',
  },
  poses: {
    intro: 'Every {whipper} strikes a pose. Here are the ones you’ve found.',
    found: (n: number, total: number) => `${n} of ${total} found`,
    allFound: (total: number) => `All ${total} found! A full set of flops.`,
    mysteryName: '???',
    mysteryText: 'A mystery flop.',
    mysteryLabel: 'A mystery flop, not found yet.',
    times: (n: number) => (n === 1 ? 'Once' : `${n} times`),
    newToday: 'New!',
    open: (name: string) => `${name}. Tap to watch it bigger.`,
    firstFound: (when: string) => `First found ${when}.`,
    count: (n: number) => (n === 1 ? 'You’ve flopped this way once.' : `You’ve flopped this way ${n} times.`),
    close: 'Back to the Hall',
  },
  mine: {
    intro: 'Brave things that didn’t go to plan. You tried them anyway.',
    learned: 'What I learned:',
    happened: 'What happened:',
    tried: (date: string) => `Tried on ${date}`,
    justHung: 'Just hung',
    emptyTitle: 'The wall is ready',
    emptyText: 'When a brave thing flops, it hangs here with what you learned.',
  },
  wing: {
    intro: (names: string) => `Flops from ${names}, and what they learned.`,
    by: (who: string) => `by ${who}`,
    learned: 'What I learned:',
    emptyTitle: 'This wing is waiting for its first flop',
    emptyText: (names: string) =>
      `Ask ${names} about a time something flopped for them. They can hang it here.`,
    namesFallback: 'your grown-ups',
  },
} as const

export const LETTERS_COPY = {
  title: 'Letters',
  back: 'Back to camp',
  newCount: (n: number) => (n === 1 ? '1 new letter' : `${n} new letters`),
  newTitle: (n: number) => (n === 1 ? 'A letter for you!' : 'Letters for you!'),
  from: (who: string) => `From ${who}`,
  arrived: (when: string) => `Arrived ${when}`,
  tapToOpen: 'Tap to open',
  envelopeLabel: (who: string) => `A sealed letter from ${who}. Tap to open it.`,
  spotted: 'Spotted!',
  signoff: (who: string) => `from ${who}`,
  skip: 'Tap to open it now',
  stonePlaced: 'Its bonus stone just joined your cairn.',
  stoneTomorrow: 'Letter stones go on one a day. Its stone joins your cairn tomorrow.',
  stoneLater: 'Letter stones go on one a day. Its stone waits beside your cairn for its turn.',
  waitingToo: (n: number) =>
    n === 1 ? 'A waiting stone joined your cairn too.' : `${n} waiting stones joined your cairn too.`,
  seeCairn: 'See your cairn',
  backToLetters: 'Back to letters',
  readTitle: 'Letters you’ve read',
  readLabel: (who: string) => `Spotted! note from ${who}. Tap to read it again.`,
  noteLabel: (who: string) => `Spotted! note from ${who}`,
  allRead: 'All read! New Spotted! notes land here.',
  emptyTitle: 'Spotted! notes land here',
  emptyText: (names: string) =>
    `When ${names} spot you being brave, they can write you a Spotted! note. Each one adds a bonus stone to your cairn.`,
  namesFallback: 'your grown-ups',
  whoFallback: 'your grown-up',
} as const

/** How to earn each badge: about trying, never about speed, streaks or perfect runs. */
export const BADGE_HOW: Record<BadgeId, string> = {
  'first-whipper': 'Take your first {whipper}: fall, and let the rope catch you.',
  'attempts-10': 'Make 10 attempts on the mountain. Falls count as much as landings.',
  'attempts-50': 'Make 50 attempts on the mountain. Every leap counts, landed or not.',
  'attempts-100': 'Make 100 attempts on the mountain. Every leap counts, landed or not.',
  'big-leap': 'Try a Big Leap on the mountain. Landed or not, trying it counts.',
  oops: 'Do an Oops Mission: a small mistake on purpose. They’re in the idea cards.',
  'still-here': 'If a brave thing flops, log it anyway. It still counts.',
  'smaller-step': 'When a plan feels too big, tap Not today, then Make it smaller.',
  beta: 'Ask {goat} for {beta} after a few falls in one spot.',
  'stormy-5': 'After a brave thing, say how scary it really was.',
}

export const BADGES_COPY = {
  title: 'Badges',
  back: 'Back to camp',
  intro: 'Badges are for trying things, falling off and going anyway.',
  have: (n: number) => (n === 1 ? '1 badge so far' : `${n} badges so far`),
  earnedTitle: 'Your badges',
  notYetTitle: 'Still to find',
  earned: (when: string) => `Earned ${when}`,
  newToday: 'New!',
  notYet: 'Not yet',
  progress: (have: number, need: number) => `${have} of ${need} so far`,
  how: BADGE_HOW,
} as const
