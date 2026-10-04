/**
 * Words in the Sky Lake finale. Plain English, warm, no narrator morals (the goat says the one line
 * that matters, in content/goatLines.ts), no clocks or countdowns. Names come from her own save; when
 * one is empty the line still reads well.
 */
import type { BeatId } from './timeline'

const or = (name: string, fallback: string): string => (name.trim() ? name.trim() : fallback)

export const FINALE_COPY = {
  /** The Skip button (shows after the first few seconds) and its spoken name. */
  skip: 'Skip',
  skipLabel: 'Skip to the end',
  /** What the picture shows, beat by beat (the canvas's accessible description). */
  stage(beat: BeatId, night: boolean, goat: string, mountain: string): string {
    const g = or(goat, 'The goat')
    if (night) {
      switch (beat) {
        case 'jump':
          return 'One, two, three: you both jump!'
        case 'splash':
          return 'Splash! Both of you, into Sky Lake.'
        case 'float':
        case 'card':
          return 'Floating in the moonlit lake, both of you laughing.'
        default:
          return `Sky Lake under the moon, with ${g} beside you.`
      }
    }
    switch (beat) {
      case 'summit':
        return `You, at the very top of ${or(mountain, 'your mountain')}.`
      case 'mountain':
        return 'The whole mountain below you, every camp you passed glowing.'
      case 'lake':
        return 'Sky Lake: still water with the whole sky in it.'
      case 'out':
        return `${g} climbs out of the backpack for the very first time.`
      case 'edge':
        return `${g} stands at the edge of the rock, knees wobbling.`
      case 'leap':
        return `${g} leaps!`
      case 'splash':
        return `Splash! ${g} flops into Sky Lake.`
      case 'laugh':
        return `${g} pops up laughing, and so do you.`
      default:
        return 'You and your goat, laughing and laughing.'
    }
  },
  card: {
    title: 'Sky Lake!',
    climbed: (mountain: string) =>
      mountain.trim() ? `You climbed all of ${mountain.trim()}, right to the very top.` : 'You climbed the whole mountain, right to the very top.',
    attempts: (n: number) => `Attempts on the way up: ${n}.`,
    newHeading: 'New at the top',
    nightOpen: (goat: string) => `Night climbs are open. ${or(goat, 'Your goat')} climbs beside you now.`,
    treasures: 'Each new stone in your cairn brings a camp treasure.',
    camp: 'Back to camp',
    again: 'Watch again',
    label: 'Sky Lake',
  },
  nightCard: {
    title: 'Sky Lake by moonlight',
    line: 'One big moonlight splash.',
    camp: 'Back to camp',
    again: 'Watch again',
    label: 'Sky Lake by moonlight',
  },
} as const
