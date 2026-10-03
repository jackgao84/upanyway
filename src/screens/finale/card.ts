/**
 * The finale's closing card: a short warm title, what she did in one line, the goat's one line (from
 * the summit group), and — gently — what is new now (night climbs, camp treasures). Back to camp, or
 * watch it again. The night ending's card is just its title, a line and the buttons.
 *
 * Portrait (and phones): a card along the bottom, the two of them framed above it. Landscape: a card on
 * the right, the picture beside it.
 */
import type { SpokenLine } from '../../model/goatVoice'
import type { ClimberLook } from '../../storage/schema'
import { button } from '../../ui/components'
import { h } from '../../ui/dom'
import { goatBubble, type GoatBubble } from '../../ui/goatBubble'
import { icon } from '../../ui/icons'
import { finaleAvatar } from './avatar'
import { FINALE_COPY } from './copy'

export interface FinaleCardOpts {
  night: boolean
  mountainName: string
  goatName: string
  look: ClimberLook
  /** Her attempts so far (whippers + sends); said only when it is 2 or more. */
  attempts: number
  /** The goat's line on the card (day only). */
  line: SpokenLine | null
  onCamp: () => void
  onAgain: () => void
}

export interface FinaleCard {
  el: HTMLElement
  /** True when the card sits at the side (the picture is framed to its left). */
  isSide(): boolean
  destroy(): void
}

/** Side card on a landscape screen wide enough for the picture and a card beside it. */
export function sideLayout(): boolean {
  return window.innerWidth >= 640 && window.innerWidth > window.innerHeight * 1.15
}

export function finaleCard(opts: FinaleCardOpts): FinaleCard {
  const c = FINALE_COPY.card
  const n = FINALE_COPY.nightCard
  let bubble: GoatBubble | null = null
  const body: (HTMLElement | null)[] = []
  if (opts.night) {
    body.push(h('p', { class: 'finale-card__line' }, n.line))
  } else {
    body.push(
      h(
        'p',
        { class: 'finale-card__line' },
        c.climbed(opts.mountainName),
      ),
    )
    if (opts.attempts >= 2) body.push(h('p', { class: 'finale-card__attempts' }, c.attempts(opts.attempts)))
    if (opts.line) {
      const b = goatBubble({ avatar: () => finaleAvatar(opts.look, 'swim'), name: opts.goatName, tapToHide: false })
      b.say(opts.line.text, { mood: opts.line.mood, durationMs: 0 })
      bubble = b
      body.push(h('div', { class: 'finale-card__goat' }, b.el))
    }
    body.push(
      h(
        'div',
        { class: 'finale-card__new' },
        h('p', { class: 'finale-card__new-title' }, c.newHeading),
        h(
          'ul',
          { class: 'finale-card__list' },
          h('li', null, h('span', { class: 'finale-card__icon', 'aria-hidden': 'true' }, icon('moon', 26)), h('span', null, c.nightOpen(opts.goatName))),
          h('li', null, h('span', { class: 'finale-card__icon', 'aria-hidden': 'true' }, icon('cairn', 26)), h('span', null, c.treasures)),
        ),
      ),
    )
  }
  const title = opts.night ? n.title : c.title
  const el = h(
    'section',
    { class: `finale-card${opts.night ? ' finale-card--night' : ''}`, role: 'dialog', 'aria-modal': 'false', 'aria-label': opts.night ? n.label : c.label },
    h('h2', { class: 'finale-card__title' }, title),
    ...body,
    h(
      'div',
      { class: 'finale-card__actions' },
      button(opts.night ? n.camp : c.camp, { onClick: opts.onCamp, size: 'big', icon: 'tent', class: 'finale-card__camp' }),
      button(opts.night ? n.again : c.again, { onClick: opts.onAgain, variant: 'secondary', icon: 'undo', class: 'finale-card__again' }),
    ),
  )
  const layout = () => el.classList.toggle('finale-card--side', sideLayout())
  layout()
  window.addEventListener('resize', layout)
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-open')))
  return {
    el,
    isSide: () => el.classList.contains('finale-card--side'),
    destroy() {
      window.removeEventListener('resize', layout)
      bubble?.destroy()
      el.remove()
    },
  }
}
