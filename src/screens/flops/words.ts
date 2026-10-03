/**
 * Sentences with climbing words in them, for the Hall of Flops, Letters and Badges.
 *
 * Copy marks a climbing word as a slot: "Take your first {whipper}" (or "{whippers}"). The bare
 * words "whipper(s)" and "beta" are found too, for text that lives in content files (badge
 * descriptions). The FIRST mention of each word on a screen goes through ui/term (her first time
 * ever: the word plus its one-line definition); later mentions are plain words.
 *
 * Other {slots} (e.g. {goat}) are filled from `vars` first.
 */
import { markWordSeen, save } from '../../app/context'
import { fill } from '../../content/copy'
import { isGlossaryWord, type GlossaryWord } from '../../content/glossary'
import type { Child } from '../../ui/dom'
import { term } from '../../ui/term'

/** Tracks which words a screen has already introduced (one per screen render). */
export interface TermScope {
  used: Set<GlossaryWord>
}

export function termScope(): TermScope {
  return { used: new Set() }
}

const WORD = /\{(\w+)\}|\b(whippers?|beta)\b/gi

/** Glossary key for a written word ("whippers" → "whipper"); null for anything else. */
function glossaryKey(word: string): GlossaryWord | null {
  const k = word.toLowerCase()
  if (isGlossaryWord(k)) return k
  if (k.endsWith('s') && isGlossaryWord(k.slice(0, -1))) return k.slice(0, -1) as GlossaryWord
  return null
}

/**
 * The sentence as DOM children: plain text, with each climbing word styled (and introduced the
 * first time this screen mentions it). Repeats are plain words.
 */
export function richText(text: string, scope: TermScope, vars: Record<string, string> = {}): Child[] {
  const filled = fill(text, vars)
  const out: Child[] = []
  let last = 0
  WORD.lastIndex = 0
  for (let m = WORD.exec(filled); m; m = WORD.exec(filled)) {
    const written = m[1] ?? m[2] ?? ''
    const key = glossaryKey(written)
    if (!key) continue // an unknown {slot}: leave it as written
    if (m.index > last) out.push(filled.slice(last, m.index))
    if (scope.used.has(key)) out.push(written)
    else {
      scope.used.add(key)
      out.push(term(written, { seen: save().glossarySeen, onSeen: markWordSeen, text: written }))
    }
    last = m.index + m[0].length
  }
  if (last < filled.length) out.push(filled.slice(last))
  return out
}

/** The plain sentence (slots filled, climbing words as written), for aria-labels and tests. */
export function plainText(text: string, vars: Record<string, string> = {}): string {
  return fill(text, vars).replace(/\{(\w+)\}/g, (whole, word: string) => (glossaryKey(word) ? word : whole))
}
