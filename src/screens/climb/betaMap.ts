/**
 * The Beta Map card at the end of every pitch: the canvas shows the whole pitch with every failed
 * arc as faint chalk under the bright route that worked (the stage draws it); this card says how
 * many attempts it took — "Sent in 14 attempts. Every whipper got you here." — and offers Back to
 * camp / Next pitch / Climb again. No stars, no timers, no "fewer falls" anything. After the summit
 * pitch the way on is "On to Sky Lake" (the first time by day, the only button: the finale is next).
 * When the next pitch is still hidden, the card says "The trail ahead is hidden. Add a stone to your
 * cairn to find the way." and its big button is Log a brave thing (the real-life half comes in).
 *
 * Portrait: a card along the bottom, the pitch framed above it. Landscape (a phone on its side too):
 * a card on the right, the pitch in the middle.
 */
import { button } from '../../ui/components'
import { h } from '../../ui/dom'
import { firstMentionText } from '../../ui/term'
import type { GlossaryWord } from '../../content/glossary'
import { CLIMB_COPY } from './copy'

export interface BetaMapCardOpts {
  attempts: number
  /** Words she has met (for the first-time definitions of beta, send and whipper). */
  seen: readonly string[]
  onSeen: (word: GlossaryWord) => void
  /** Null when there is no next pitch to offer (summit, or not open yet). */
  onNext: (() => void) | null
  /**
   * The next pitch is still hidden (the cairn needs another stone): the card says so in the brief's
   * words, and its big button goes to Log a brave thing.
   */
  onLocked?: (() => void) | null
  /** The primary button's words when it isn't "Next pitch" (the summit: "On to Sky Lake"). */
  nextLabel?: string
  /** Offer only the way on (the first Sky Lake finale): no Climb again, no Back to camp. */
  onlyNext?: boolean
  onAgain: () => void
  onCamp: () => void
  /** Top of the area the pitch may use (below the HUD row), CSS px. */
  regionTop: () => number
}

export interface BetaMapCard {
  el: HTMLElement
  /** Where on screen (CSS px) the pitch should be framed. */
  region(): { top: number; bottom: number }
  destroy(): void
}

/**
 * Side card on any landscape screen wide enough for the pitch and a card next to it — a phone on
 * its side included (a bottom card there would leave the pitch a sliver).
 */
function wide(): boolean {
  return window.innerWidth >= 640 && window.innerWidth > window.innerHeight * 1.15
}

export function betaMapCard(opts: BetaMapCardOpts): BetaMapCard {
  const c = CLIMB_COPY.map
  const many = opts.attempts !== 1
  const line = h(
    'p',
    { class: 'climb-map__line' },
    `${c.sent} ${many ? c.sentMany(opts.attempts) : c.sentOne} ${many ? c.every : c.everyOne}`,
  )
  // Climbing words met here for the first time get their one-line definition, under the line.
  const notes = (['beta', 'send', 'whipper'] as const)
    .filter((word) => (word !== 'whipper' || many) && !opts.seen.includes(word))
    .map((word) => {
      opts.onSeen(word)
      return h('p', { class: 'climb-map__word' }, firstMentionText(word, []))
    })
  const next = opts.onNext
  const locked = !next && opts.onLocked ? opts.onLocked : null
  const lockedNote = locked
    ? h(
        'div',
        { class: 'climb-map__locked' },
        h('p', { class: 'climb-map__locked-title' }, CLIMB_COPY.locked.title),
        h('p', { class: 'climb-map__locked-text' }, CLIMB_COPY.locked.text),
      )
    : null
  const primary = next
    ? button(opts.nextLabel ?? c.next, { onClick: next, size: 'big', iconEnd: 'next', class: 'climb-map__next' })
    : locked
      ? button(c.log, { onClick: locked, size: 'big', icon: 'stone', class: 'climb-map__log' })
      : button(c.again, { onClick: opts.onAgain, size: 'big', icon: 'undo', class: 'climb-map__again' })
  const secondary =
    next && opts.onlyNext
      ? []
      : [
          next || locked ? button(c.again, { onClick: opts.onAgain, variant: 'secondary', icon: 'undo', class: 'climb-map__again' }) : null,
          button(c.camp, { onClick: opts.onCamp, variant: 'secondary', icon: 'tent', class: 'climb-map__camp' }),
        ]
  const el = h(
    'section',
    { class: 'climb-map', role: 'dialog', 'aria-modal': 'false', 'aria-label': 'Beta map' },
    h('h2', { class: 'climb-map__title' }, c.title),
    line,
    lockedNote,
    notes.length ? h('div', { class: 'climb-map__words' }, ...notes) : null,
    h('div', { class: 'climb-map__actions' }, primary, secondary.length ? h('div', { class: 'climb-map__row' }, ...secondary) : null),
  )
  const layout = () => el.classList.toggle('climb-map--side', wide())
  layout()
  window.addEventListener('resize', layout)
  requestAnimationFrame(() => el.classList.add('is-open'))

  return {
    el,
    region() {
      const r = el.getBoundingClientRect()
      const top = opts.regionTop()
      if (el.classList.contains('climb-map--side') || r.height === 0) return { top, bottom: window.innerHeight - 24 }
      return { top, bottom: Math.max(top + 120, r.top - 16) }
    },
    destroy() {
      window.removeEventListener('resize', layout)
      el.remove()
    },
  }
}
