/**
 * Small pieces shared by the log flow and Plans: the paper "ticket" that keeps her brave thing in
 * view while she answers, the outcome pictures, a group icon per idea group, and gentle badge cards.
 */
import { badgeCard } from '../climb/cards'
import type { IdeaGroup } from '../../content/ideas'
import type { BadgeId } from '../../content/badges'
import type { BraveOutcome } from '../../storage/schema'
import { h, svg } from '../../ui/dom'
import { icon, weatherIcon, weatherLabel, type IconName } from '../../ui/icons'
import type { Tone } from '../../ui/components'
import { LOG_COPY } from './copy'

export interface TicketOpts {
  text: string
  oops: boolean
  forecast?: number | null
  really?: number | null
}

function weatherChip(label: string, n: number): HTMLElement {
  return h(
    'span',
    { class: 'log-ticket__weather', role: 'img', 'aria-label': `${label}: ${LOG_COPY.ticket.weather(weatherLabel(n), n)}` },
    h('span', { class: 'log-ticket__weather-label', 'aria-hidden': 'true' }, label),
    h('span', { class: 'log-ticket__weather-icon', 'aria-hidden': 'true' }, weatherIcon(n, 34)),
  )
}

/** Her brave thing on a scrap of paper, with the forecast (and "really") once she has given them. */
export function ticket(opts: TicketOpts): HTMLElement {
  const weather: HTMLElement[] = []
  if (typeof opts.forecast === 'number') weather.push(weatherChip(LOG_COPY.ticket.forecast, opts.forecast))
  if (typeof opts.forecast === 'number' && typeof opts.really === 'number') {
    weather.push(h('span', { class: 'log-ticket__arrow', 'aria-hidden': 'true' }, icon('next', 18)))
    weather.push(weatherChip(LOG_COPY.ticket.really, opts.really))
  }
  return h(
    'div',
    { class: 'log-ticket' + (opts.oops ? ' log-ticket--oops' : '') },
    h('span', { class: 'log-ticket__icon', 'aria-hidden': 'true' }, icon(opts.oops ? 'oops' : 'stone', 26)),
    h('p', { class: 'log-ticket__text' }, opts.text),
    weather.length ? h('span', { class: 'log-ticket__forecast' }, ...weather) : null,
  )
}

/** A wobbly line that still arrives: "Wobbly, but I did it". */
function wobblyArt(size: number): SVGSVGElement {
  const line = { fill: 'none', stroke: 'currentColor', 'stroke-width': 2.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }
  return svg(
    'svg',
    { viewBox: '0 0 32 32', width: size, height: size, class: 'icon icon--wobbly', 'aria-hidden': 'true', focusable: 'false' },
    svg('circle', { cx: 25.4, cy: 9.6, r: 4.6, fill: 'currentColor', 'fill-opacity': 0.2, stroke: 'currentColor', 'stroke-width': 2.2 }),
    svg('path', { ...line, d: 'M23.4 9.8l1.5 1.5 2.7-3' }),
    svg('path', { ...line, d: 'M3.5 25.5c2.2-3.6 4.2 1.4 6.4-2.2s4.2 1.4 6.4-2.2 4.2 1.4 6.4-2.2c1-1.6 1.8-2.8 2.4-4.2' }),
    svg('path', { ...line, 'stroke-width': 1.6, opacity: 0.55, d: 'M6 29c1.4-1 2.6.6 4 0M14 27.4c1.4-1 2.6.6 4 0' }),
  )
}

export interface OutcomeInfo {
  id: BraveOutcome
  label: string
  tone: Tone
  art: () => Element
}

/** The three ways it can go: the same size, the same weight, the same stone. */
export const OUTCOMES: readonly OutcomeInfo[] = [
  { id: 'nailed', label: LOG_COPY.outcome.nailed, tone: 'sun', art: () => icon('flag', 40) },
  { id: 'wobbly', label: LOG_COPY.outcome.wobbly, tone: 'sky', art: () => wobblyArt(40) },
  { id: 'flopped', label: LOG_COPY.outcome.flopped, tone: 'plum', art: () => icon('stillhere', 40) },
]

export const GROUP_ICONS: Record<IdeaGroup, IconName> = {
  school: 'book',
  friends: 'grownups',
  family: 'heart',
  out: 'map',
  me: 'sun',
  oops: 'oops',
}

export const GROUP_TONES: Record<IdeaGroup, Tone> = {
  school: 'sky',
  friends: 'sun',
  family: 'coral',
  out: 'leaf',
  me: 'plum',
  oops: 'crumble',
}

/**
 * A gentle card for each new badge (the same card the climb shows), one after another, rising from
 * the bottom of the screen so the goat's line near the top stays readable.
 */
export function showBadgeCards(ids: readonly BadgeId[]): void {
  ids.forEach((id, i) => {
    if (i === 0) badgeCard(id, 'bottom')
    else setTimeout(() => badgeCard(id, 'bottom'), i * 700)
  })
}
