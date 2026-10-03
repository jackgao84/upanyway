/**
 * Climbing words. The first time each one appears (on any screen or in the climb), its one-line
 * definition shows with it, once (see ui/term.ts). Definitions: ≤ 12 words, plain English for a
 * young climber (audience and reading level: see .brief/).
 */

export type GlossaryWord = 'pitch' | 'whipper' | 'beta' | 'send' | 'cairn' | 'chalk' | 'hold'

export interface GlossaryEntry {
  word: GlossaryWord
  definition: string
}

export const glossary: Record<GlossaryWord, GlossaryEntry> = {
  pitch: { word: 'pitch', definition: 'One part of the mountain, climbed from bottom to top.' },
  whipper: { word: 'whipper', definition: 'A big fall that the rope catches.' },
  beta: { word: 'beta', definition: 'Tips and tricks for how to do a climb.' },
  send: { word: 'send', definition: 'Making it all the way to the top of a pitch.' },
  cairn: { word: 'cairn', definition: 'A stack of stones. Yours grows with every brave thing.' },
  chalk: { word: 'chalk', definition: 'Powder for grippy hands. It marks where you tried.' },
  hold: { word: 'hold', definition: 'A bump in the rock you can grab and hang from.' },
}

export const GLOSSARY_WORDS = Object.keys(glossary) as GlossaryWord[]

export function isGlossaryWord(word: string): word is GlossaryWord {
  return Object.prototype.hasOwnProperty.call(glossary, word)
}
