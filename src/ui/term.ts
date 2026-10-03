/**
 * Climbing words (content/glossary.ts). The first time a word appears, it shows with its one-line
 * definition in a small bubble, and the word joins `glossarySeen` (via onSeen). After that it is just
 * a styled word.
 *
 * The bubble stays for re-renders of the same screen (same route) in this session, so a screen
 * that re-renders on a store change doesn't snatch the definition away while she is reading it.
 * Use term() for the main mention on a screen; plain text for repeats.
 */
import { ROUTE_CHANGE_EVENT } from '../app/router'
import { glossary, isGlossaryWord, type GlossaryWord } from '../content/glossary'
import { h } from './dom'

export interface TermOpts {
  /** Words already introduced (SaveData.glossarySeen). */
  seen: readonly string[]
  /** Called once when a word is introduced here (add it to glossarySeen). */
  onSeen: (word: GlossaryWord) => void
  /** How the word reads in the sentence (e.g. "whippers", "Pitch"). Default: the word itself. */
  text?: string
}

/** Word → the route it was introduced on; cleared when she leaves that screen. */
const introducedOn = new Map<string, string>()
let watching = false

function routeKey(): string {
  return typeof location === 'undefined' ? '' : location.hash
}

function watchRoute(): void {
  if (watching || typeof window === 'undefined') return
  watching = true
  window.addEventListener(ROUTE_CHANGE_EVENT, () => {
    const now = routeKey()
    for (const [word, route] of [...introducedOn]) if (route !== now) introducedOn.delete(word)
  })
}

/** Glossary key for a word as written ("Whippers" → "whipper"). */
function key(word: string): string {
  const k = word.trim().toLowerCase()
  if (!isGlossaryWord(k) && k.endsWith('s') && isGlossaryWord(k.slice(0, -1))) return k.slice(0, -1)
  return k
}

/** The definition line for a glossary word (undefined for other words). */
export function definition(word: string): string | undefined {
  const k = key(word)
  return isGlossaryWord(k) ? glossary[k].definition : undefined
}

/** True if this glossary word hasn't been introduced yet. */
export function isNewWord(word: string, seen: readonly string[]): boolean {
  const k = key(word)
  return isGlossaryWord(k) && !seen.includes(k)
}

/**
 * Text for canvas labels and toasts: "Whipper: a big fall that the rope catches." the first time,
 * just the word after that. The caller marks the word seen.
 */
export function firstMentionText(word: string, seen: readonly string[]): string {
  const k = key(word)
  if (!isGlossaryWord(k) || seen.includes(k)) return word
  const def = glossary[k].definition
  const lowered = def.charAt(0).toLowerCase() + def.slice(1)
  return `${k.charAt(0).toUpperCase()}${k.slice(1)}: ${lowered}`
}

/** An inline climbing word; the first time, followed by its definition bubble. */
export function term(word: string, opts: TermOpts): HTMLElement {
  const k = key(word)
  const shown = opts.text ?? word
  if (!isGlossaryWord(k)) return h('span', { class: 'term' }, shown)
  const fresh = !opts.seen.includes(k)
  const here = introducedOn.get(k) === routeKey()
  if (!fresh && !here) return h('span', { class: 'term' }, shown)

  const el = h(
    'span',
    { class: 'term term--new' },
    h('span', { class: 'term__word' }, shown),
    ' ',
    h('span', { class: 'term__def', role: 'note' }, h('span', { class: 'sr-only' }, `${k} means: `), glossary[k].definition),
  )
  if (fresh && !here) {
    watchRoute()
    introducedOn.set(k, routeKey())
    queueMicrotask(() => opts.onSeen(k))
  }
  return el
}
