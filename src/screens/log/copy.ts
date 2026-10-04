/**
 * Words on the log flow (#/log, #/log/did/:id), the ideas screen and Plans (#/plans). Narrator copy
 * states no morals and never counts, dates or nags; anything the goat says lives in
 * content/goatLines.ts. Apostrophes are curly (’) as everywhere else on screen.
 */
import { SETUP_COPY } from '../../content/copy'

export const LOG_COPY = {
  back: 'Back',
  toCamp: 'Back to camp',
  toPlans: 'Back to Plans',
  next: 'Next',
  skip: 'Skip',
  /** Fear scale hint under both weather questions. */
  tapWeather: 'Tap a weather.',
  what: {
    q: 'What’s the brave thing?',
    label: 'The brave thing',
    placeholder: 'Type it here…',
    pick: 'Pick an idea',
  },
  ideas: {
    title: 'Pick an idea',
    /** ALWAYS at the top of the ideas screen (the brief: brave vs dangerous). */
    brave: SETUP_COPY.brave.title,
    care: SETUP_COPY.brave.care,
    jump: 'Jump to a group of ideas',
    extra: 'Extra ideas',
    oopsTag: 'Oops',
    /** No cards to show (a grown-up hid them all). */
    none: { title: 'No idea cards right now', text: 'Go back and type your brave thing in your own words.' },
  },
  forecast: {
    q: 'How scary does it look?',
    label: 'How scary does it look? 0 to 10',
  },
  worry: {
    q: 'What are you worried might happen?',
    hint: 'Only if you want to. One line is plenty.',
    label: 'My worry',
    placeholder: 'Maybe…',
  },
  when: {
    q: 'Have you done it yet?',
    later: 'I’ll do it later',
    laterHint: 'It waits in your Plans.',
    did: 'I already did it!',
    didHint: 'Tell me how it went.',
  },
  really: {
    q: 'How scary was it really?',
    label: 'How scary was it really? 0 to 10',
  },
  happened: {
    q: 'What actually happened?',
    hint: 'Tap one, or write your own.',
    label: 'What happened',
    placeholder: 'Type what happened…',
  },
  outcome: {
    q: 'How did it go?',
    nailed: 'Nailed it',
    wobbly: 'Wobbly, but I did it',
    flopped: 'Flopped — and I’m still here',
  },
  learned: {
    q: 'What did I learn?',
    hint: 'If you like. Tap one, or write your own.',
    label: 'What I learned',
    placeholder: 'Type it here…',
    /** Only after "Flopped — and I'm still here": her flop is framed in the museum too. */
    flop: 'It gets its own frame in the Hall of Flops too.',
    done: 'Add my stone',
  },
  ticket: {
    forecast: 'Forecast',
    really: 'Really',
    weather: (label: string, n: number) => `${label}, ${n}`,
  },
  saved: 'Saved to your Plans.',
} as const

export const PLANS_COPY = {
  title: 'Plans',
  intro: 'Brave things for later. They wait as long as you like.',
  toCamp: 'Back to camp',
  newPlan: 'Log a brave thing',
  did: 'I did it!',
  notToday: 'Not today',
  smaller: 'Make it smaller',
  smallerTag: 'A smaller step',
  oopsTag: 'Oops Mission',
  forecastShort: 'Forecast',
  forecastLabel: (label: string, n: number) => `Forecast: ${label}, ${n}`,
  offer: {
    q: 'Make it smaller?',
    yes: 'Make it smaller',
    no: 'Not now',
  },
  empty: {
    title: 'No plans right now',
    text: 'When you save a brave thing for later, it waits here.',
    action: 'Log a brave thing',
  },
  sheet: {
    title: 'Make it smaller',
    sub: 'Pick a smaller step. Your first plan stays too.',
    ownQ: 'What’s a smaller step?',
    ownLabel: 'My smaller step',
    ownPlaceholder: 'Type a smaller step…',
    forecastQ: 'How scary does this step look?',
    forecastLabel: 'How scary does this step look? 0 to 10',
    back: 'Back',
    next: 'Next',
  },
} as const
