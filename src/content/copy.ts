/**
 * Words on the first-run, grown-ups' gate and camp screens. Narrator copy states no morals: any
 * "why" is said by the goat, and every goat line lives in content/goatLines.ts (read through
 * model/goatVoice.ts). Templates: {goat}, {mountain}, {names}.
 */

export const SETUP_COPY = {
  hello: {
    title: 'Hello, grown-up!',
    lines: [
      'Up Anyway is a cozy climbing game about feeling scared and going anyway.',
      'Real brave things your climber does in everyday life open up the mountain. In the game, falling is safe, silly and counted with pride.',
    ],
    tipTitle: 'Set it up from the Home Screen',
    tip: 'Tap Share, then “Add to Home Screen”, and open Up Anyway from that icon before you start. On iPad, Home Screen apps keep their own storage.',
    pinTitle: 'Choose a grown-ups’ PIN',
    pinSub: 'Four numbers. It opens the grown-up settings.',
    confirmTitle: 'Type it once more',
    confirmSub: 'Just to be sure.',
    mismatch: 'Those didn’t match. Let’s try again.',
  },
  names: {
    title: 'What does your climber call you?',
    hint: 'One name for each grown-up who will cheer. They appear on letters and in the cairn.',
    fieldLabel: (n: number) => `Grown-up ${n}`,
    examples: ['Mum', 'Dad', 'Nana', 'Grandpa'],
    addAnother: 'Add another',
    remove: (n: number) => `Remove grown-up ${n}`,
    needOne: 'Add at least one name.',
    minutesTitle: 'Climbing time each day',
    minutesHint: 'Shown as a sun slowly setting, never a countdown. You can change it later in grown-up mode.',
    minutesLabel: 'Minutes of climbing a day',
    noLimit: 'No limit',
    minutes: (n: number) => `${n} minutes`,
    done: 'Done',
  },
  handover: {
    title: (device: string) => `Hand the ${device} to your climber`,
    sub: 'Everything from here on is theirs.',
    go: 'I’m the climber!',
  },
  climber: {
    title: 'This is you!',
    hint: 'Pick anything. You can change it later in the Wardrobe.',
    tabs: {
      hair: 'Hair',
      hairColor: 'Hair colour',
      skin: 'Skin',
      outfit: 'Outfit',
      helmet: 'Helmet',
      backpack: 'Backpack',
    },
    colourOf: (thing: string) => `${thing} colour`,
    surprise: 'Surprise me',
    done: 'Looks like me!',
  },
  goat: {
    title: 'Your backpack is wiggling…',
    metTitle: 'Look who’s in your backpack!',
    tapHint: 'Tap to keep going',
    next: 'Next',
    nameLabel: 'What will you call your goat?',
    ideas: 'Or pick one:',
    done: 'That’s its name!',
    fallback: 'Pebble',
  },
  mountain: {
    title: 'Name your mountain',
    nameLabel: 'Your mountain’s name',
    ideas: 'Or pick one:',
    done: 'Next',
    fallback: 'Mount Anyway',
  },
  lesson: {
    title: 'How to climb',
    steps: ['Leap: drag back, then let go', 'Fall: the rope catches you'],
    next: 'Next',
  },
  brave: {
    title: 'Brave means safe but scary.',
    care: 'If something could really hurt you or someone else, the brave move is to stop and tell a grown-up.',
    done: 'Got it',
  },
  cheer: {
    line: 'can cheer you on by reading your cairn',
    nobody: 'Your grown-ups',
    go: 'Let’s climb!',
  },
} as const

export const GATE_COPY = {
  title: 'Grown-ups only',
  pinTitle: 'Grown-ups’ PIN',
  pinSub: 'Type the four numbers.',
  wrong: 'That’s not it. Try again.',
  forgot: 'Forgot PIN?',
  holding: 'Keep holding…',
  holdHint: 'Press and hold for 3 seconds.',
  /** Two lines ("\n"), so a number like "thirty-five" is never split at its hyphen. */
  challengeTitle: (a: string, b: string) => `What is ${a}\ntimes ${b}?`,
  challengeSub: 'Type the answer to set a new PIN.',
  challengeWrong: 'Not quite. Have another go.',
  newTitle: 'Choose a new PIN',
  newSub: 'Four numbers.',
  confirmTitle: 'Type the new PIN again',
  mismatch: 'Those didn’t match. Let’s start again.',
  saved: 'New PIN saved.',
  noPin: 'No PIN is set yet. Choose one now.',
  back: 'Back to camp',
} as const

export const CAMP_COPY = {
  kicker: 'Camp',
  climb: 'Climb',
  log: 'Log a brave thing',
  plans: 'Plans',
  cairn: 'Cairn',
  weather: 'Weather Station',
  flops: 'Hall of Flops',
  letters: 'Letters',
  lettersUnread: (n: number) => (n === 1 ? 'Letters, 1 new letter' : `Letters, ${n} new letters`),
  wardrobe: 'Wardrobe',
  badges: 'Badges',
  grownups: 'Grown-ups',
  sceneLabel: (mountain: string) => `Camp at the bottom of ${mountain}. You are sitting by the fire with your goat.`,
  waitingPlaced: (n: number) =>
    n === 1 ? 'A waiting stone joined your cairn.' : `${n} waiting stones joined your cairn.`,
} as const

/** "Mum", "Mum and Dad", "Mum, Dad and Nana". */
export function joinNames(names: readonly string[]): string {
  const list = names.map((n) => n.trim()).filter(Boolean)
  if (list.length <= 1) return list[0] ?? ''
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`
}

/** Fill {goat}, {mountain}, {names} style slots. Unknown slots are left as they are. */
export function fill(text: string, vars: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : m))
}
