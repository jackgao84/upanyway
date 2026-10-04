/**
 * Words on the climb screen and in its cards. Narrator copy states no morals (the goat says any
 * "why"), names no counts except attempts on the Beta Map, and never uses a clock. Goat lines live in
 * content/goatLines.ts.
 */

export const CLIMB_COPY = {
  /** The tent button's name (top-left). */
  camp: 'Camp',
  /** Shown in the first-visit title card: "Pitch 3" + the pitch's own name. */
  pitch: (n: number) => `Pitch ${n}`,
  nightPitch: (n: number) => `Pitch ${n} by moonlight`,
  sun: {
    high: 'The sun is high in the sky',
    lower: 'The sun is getting lower',
    low: 'The sun is nearly down',
  },
  moon: {
    high: 'The moon is high in the sky',
    lower: 'The moon is getting lower',
    low: 'The moon is nearly down',
  },
  hint: 'Hint?',
  hintLabel: 'Get a hint from the goat',
  showMe: 'Show me',
  showMeLabel: 'Show a ghost of a leap that works',
  newFlop: 'New flop unlocked!',
  newBadge: (name: string) => `New badge: ${name}`,
  forecast: {
    title: 'How scary does it look?',
    sub: 'Tap a weather to keep climbing.',
    label: 'How scary does it look? 0 to 10',
  },
  really: {
    title: 'How scary was it really?',
    sub: 'Tap a weather.',
    label: 'How scary was it really? 0 to 10',
    compare: (forecast: number, really: number) => `Forecast ${forecast}. Really ${really}.`,
    go: 'Keep climbing',
  },
  map: {
    title: 'Beta map',
    sent: 'Sent',
    sentMany: (n: number) => `in ${n} attempts.`,
    sentOne: 'in 1 attempt.',
    every: 'Every whipper got you here.',
    everyOne: 'Every leap got you here.',
    camp: 'Back to camp',
    next: 'Next pitch',
    /** After the summit pitch: on to the Sky Lake finale. */
    skyLake: 'On to Sky Lake',
    again: 'Climb again',
    /** The next pitch is still hidden: off to log a brave thing. */
    log: 'Log a brave thing',
  },
  sunset: {
    camp: 'Back to camp',
    /** On camp itself (the Climb tile after the day's time is used): the card just closes. */
    stay: 'Back to the fire',
    /** Under camp's Climb tile once the day's climbing time is used. */
    tileNote: 'The mountain will be here tomorrow.',
  },
  locked: {
    title: 'The trail ahead is hidden.',
    text: 'Add a stone to your cairn to find the way.',
    camp: 'Back to camp',
  },
} as const

/** The real first-run lesson (setup/lesson.ts). Its title and steps are SETUP_COPY.lesson. */
export const LESSON_COPY = {
  stage: 'Practice rock. Drag back from your climber, then let go to leap.',
} as const
