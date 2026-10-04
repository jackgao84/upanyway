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
  newTitle: 'Choose a new PIN',
  newSub: 'Four numbers.',
  newSubAfterCode: 'The code was right. Now pick four new numbers.',
  confirmTitle: 'Type the new PIN again',
  mismatch: 'Those didn’t match. Let’s start again.',
  saved: 'New PIN saved.',
  noPin: 'No PIN is set yet. Choose one now.',
  back: 'Back to camp',
  /** "Forgot PIN?" → the recovery code a grown-up wrote down at setup. */
  code: {
    title: 'Type your recovery code',
    sub: 'The 12 letters and numbers a grown-up wrote down when the game was set up. Capitals, spaces and dashes don’t matter.',
    label: 'Recovery code',
    check: 'Check the code',
    back: 'Back to the PIN',
    empty: 'Type the recovery code first.',
    length: (n: number) => `A recovery code has 12 letters and numbers. That was ${n}.`,
    strange: (chars: string) =>
      `A recovery code only has letters and numbers, and never 0, O, 1, I or L. Check ${chars} against what you wrote down.`,
    wrong: 'That code doesn’t match. Check it against what you wrote down and try again.',
    wait: (s: number) => `Too many codes that didn’t match. Wait ${s === 1 ? '1 second' : `${s} seconds`}, then try again.`,
    ready: 'You can try again now.',
  },
  /** "Forgot PIN?" on a game set up before recovery codes. No way round the PIN from here. */
  noCode: {
    title: 'This game has no recovery code yet',
    lines: [
      'It was set up before recovery codes, so its PIN can’t be reset from here.',
      'To set it up again on this device: delete the Up Anyway icon from the Home Screen (this deletes the game and everything in it on this device), add it again from Safari and go through the setup. You’ll get a recovery code then.',
      'Saved a backup file? Restore it straight after the new setup (Grown-ups → Backup and data). It brings back the PIN it was saved with, so before leaving the grown-ups’ pages, make a recovery code (Grown-ups → Change PIN) and use it with “Forgot PIN?” to choose a new PIN.',
    ],
    back: 'Back to the PIN',
  },
} as const

/**
 * The recovery code, shown once: at setup, after "Forgot PIN?" has set a new PIN, and from Change
 * PIN → "Make a new recovery code". Grown-up words only: nothing on her screens mentions it.
 */
export const RECOVERY_COPY = {
  title: 'Your recovery code',
  forWhat: 'If you ever forget the PIN, this code lets you set a new one.',
  afterReset: 'Your new PIN is saved. The old recovery code is used up, so here is a new one.',
  /** Read out by screen readers one character at a time: "K 7 Q M, 4 X P A, T R 9 D". */
  codeLabel: (spelled: string) => `Recovery code: ${spelled}`,
  points: ['Write it down and keep it somewhere your climber won’t find it.', 'It won’t be shown again.'],
  later: 'Lost it later? While you still know the PIN, make a new one in Grown-ups → Change PIN.',
  replaces: 'Your old recovery code stops working when you tap “I’ve written it down”.',
  done: 'I’ve written it down',
  cancel: 'Not now',
  saved: 'Recovery code saved.',
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
