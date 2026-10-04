/**
 * Badges (#/badges): the ten badges, all for attempts and courage (content/badges.ts).
 *
 * Earned ones are bright medals with their icon, name, what they're for, and the day she earned it
 * in friendly words ("Earned yesterday"). Not-yet ones are soft and faint, with how to earn them:
 * always about trying (falls count, flops count), never about speed, streaks or perfect runs.
 * Only the attempt badges show how far along she is ("7 of 10 so far"); the stormy-forecast badge never
 * counts or explains its rule, so her fear numbers are never a target (brief: no rewards tied to fear ratings).
 * Climbing words (whipper, beta) are introduced the first time they appear (ui/term).
 */
import './flops/badges.css'
import { now, save } from '../app/context'
import type { Screen } from '../app/router'
import { BADGES, type Badge, type BadgeId } from '../content/badges'
import { earnedBadges } from '../model/badges'
import type { SaveData } from '../storage/schema'
import { screenLayout, type Tone } from '../ui/components'
import { h } from '../ui/dom'
import { BADGE_ICONS, icon } from '../ui/icons'
import { BADGES_COPY } from './flops/copy'
import { dayPhrase, isToday } from './flops/when'
import { richText, termScope, type TermScope } from './flops/words'

const TONES: Record<BadgeId, Tone> = {
  'first-whipper': 'coral',
  'attempts-10': 'sun',
  'attempts-50': 'sun',
  'attempts-100': 'sun',
  'big-leap': 'sky',
  oops: 'plum',
  'still-here': 'leaf',
  'smaller-step': 'crumble',
  beta: 'ridge',
  'stormy-5': 'hollow',
}

const ATTEMPTS: Partial<Record<BadgeId, number>> = { 'attempts-10': 10, 'attempts-50': 50, 'attempts-100': 100 }

/** How far along she is for a counting badge (null for the others). */
export function badgeProgress(d: SaveData, id: BadgeId): { have: number; need: number } | null {
  const need = ATTEMPTS[id]
  if (need) return { have: d.stats.whippers + d.stats.sends, need }
  return null
}

function medal(b: Badge): HTMLElement {
  const n = ATTEMPTS[b.id]
  return h(
    'span',
    { class: 'badge-medal', 'aria-hidden': 'true' },
    h('span', { class: 'badge-medal__ribbon' }),
    h('span', { class: 'badge-medal__disc' }, icon(BADGE_ICONS[b.id] ?? 'badge', 44)),
    n ? h('span', { class: 'badge-medal__num' }, String(n)) : null,
  )
}

export const badgesScreen: Screen = (root, ctx) => {
  const c = BADGES_COPY
  const d = save()
  const today = now()
  const scope: TermScope = termScope()
  const vars = { goat: d.profile.goatName || 'your goat' }
  // Test mode puts every badge on show (read-time only: her real badges and dates are untouched).
  const earned = d.testMode ? BADGES.map((b) => ({ ...b, earnedAt: d.badges[b.id] ?? '' })) : earnedBadges(d)
  const notYet = d.testMode ? [] : BADGES.filter((b) => !d.badges[b.id])

  const earnedCards = earned.map((b, i) => {
    const when = dayPhrase(b.earnedAt, today)
    const fresh = isToday(b.earnedAt, today)
    return h(
      'article',
      {
        class: 'badge-card is-earned' + (fresh ? ' is-today' : ''),
        dataset: { tone: TONES[b.id], badge: b.id },
        style: `animation-delay: ${Math.min(i, 8) * 60}ms`,
      },
      medal(b),
      h(
        'div',
        { class: 'badge-card__words' },
        h('h3', { class: 'badge-card__name' }, b.name),
        h('p', { class: 'badge-card__text' }, ...richText(b.description, scope, vars)),
        when ? h('span', { class: 'badge-card__when' }, c.earned(when)) : null,
      ),
      fresh ? h('span', { class: 'badge-card__new' }, c.newToday) : null,
    )
  })

  const notYetCards = notYet.map((b) => {
    const p = badgeProgress(d, b.id)
    const shown = p && p.have > 0 ? { have: Math.min(p.have, p.need - 1), need: p.need } : null
    return h(
      'article',
      { class: 'badge-card is-locked', dataset: { tone: TONES[b.id], badge: b.id } },
      medal(b),
      h(
        'div',
        { class: 'badge-card__words' },
        h('h3', { class: 'badge-card__name' }, b.name),
        h('p', { class: 'badge-card__text' }, ...richText(c.how[b.id], scope, vars)),
        shown
          ? h(
              'span',
              { class: 'badge-card__progress' },
              h(
                'span',
                { class: 'badge-card__bar', 'aria-hidden': 'true' },
                h('span', { class: 'badge-card__fill', style: `width: ${Math.round((100 * shown.have) / shown.need)}%` }),
              ),
              h('span', { class: 'badge-card__count' }, c.progress(shown.have, shown.need)),
            )
          : h('span', { class: 'badge-card__notyet' }, c.notYet),
      ),
    )
  })

  root.appendChild(
    screenLayout({
      class: 'badges',
      title: c.title,
      back: () => ctx.back('/camp'),
      backLabel: c.back,
      tone: 'summit',
      body: [
        h(
          'div',
          { class: 'badges__intro' },
          h('p', { class: 'badges__lead' }, c.intro),
          d.testMode
            ? h('span', { class: 'badges__have' }, c.testMode)
            : earned.length
              ? h('span', { class: 'badges__have' }, c.have(earned.length))
              : null,
        ),
        earnedCards.length
          ? h(
              'section',
              { class: 'badges__section' },
              h('h2', { class: 'badges__title' }, c.earnedTitle),
              h('div', { class: 'badges__grid' }, ...earnedCards),
            )
          : null,
        notYetCards.length
          ? h(
              'section',
              { class: 'badges__section' },
              h('h2', { class: 'badges__title' }, c.notYetTitle),
              h('div', { class: 'badges__grid' }, ...notYetCards),
            )
          : null,
      ],
    }),
  )
}
