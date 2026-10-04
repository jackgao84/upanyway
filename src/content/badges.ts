/**
 * Badges celebrate attempts and courage only — never speed, streaks or flawless runs.
 * Triggers live in model/badges.ts. `icon` names an icon in ui/icons.
 */

export type BadgeId =
  | 'first-whipper'
  | 'attempts-10'
  | 'attempts-50'
  | 'attempts-100'
  | 'big-leap'
  | 'oops'
  | 'still-here'
  | 'smaller-step'
  | 'beta'
  | 'stormy-5'

export type BadgeIcon = 'whipper' | 'attempts' | 'bigleap' | 'oops' | 'stillhere' | 'smaller' | 'beta' | 'stormy'

export interface Badge {
  id: BadgeId
  name: string
  /**
   * Kid-facing, at most 14 words: a plain fact about what she did. The narrator states no morals
   * (any "why" is the goat's), so no "that's how climbers learn".
   */
  description: string
  icon: BadgeIcon
}

export const BADGES: readonly Badge[] = [
  {
    id: 'first-whipper',
    name: 'First Whipper',
    description: 'You fell, the rope caught you, and you climbed on.',
    icon: 'whipper',
  },
  {
    id: 'attempts-10',
    name: '10 Attempts',
    description: 'Ten tries on the rock, falls and sends together.',
    icon: 'attempts',
  },
  {
    id: 'attempts-50',
    name: '50 Attempts',
    description: 'Fifty tries on the rock. That’s a lot of chalk lines.',
    icon: 'attempts',
  },
  {
    id: 'attempts-100',
    name: '100 Attempts',
    description: 'A hundred tries. Your chalk lines could fill the whole sky.',
    icon: 'attempts',
  },
  {
    id: 'big-leap',
    name: 'First Big Leap Tried',
    description: 'You leapt without seeing the landing. Landed or not, it counts.',
    icon: 'bigleap',
  },
  {
    id: 'oops',
    name: 'First Oops Mission',
    description: 'You made a small mistake on purpose.',
    icon: 'oops',
  },
  {
    id: 'still-here',
    name: 'Flopped — and Still Here',
    description: 'It didn’t go to plan. You logged it, and you’re still here.',
    icon: 'stillhere',
  },
  {
    id: 'smaller-step',
    name: 'A Smaller Step',
    description: 'Not today became a smaller step.',
    icon: 'smaller',
  },
  {
    id: 'beta',
    name: 'Asked for Beta',
    description: 'You asked the goat for a tip.',
    icon: 'beta',
  },
  {
    id: 'stormy-5',
    name: 'Stormy Forecasts ×5',
    description: 'Five times, the fear forecast was stormier than the real weather.',
    icon: 'stormy',
  },
]

export function badgeById(id: string): Badge | undefined {
  return BADGES.find((b) => b.id === id)
}
