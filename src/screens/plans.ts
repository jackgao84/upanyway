/**
 * Plans (#/plans): the brave things she saved for later, newest first. Each one can go three ways:
 *
 * - "I did it!"       → #/log/did/:id (how scary it really was, what happened, how it went, what she
 *                       learned) → the cairn.
 * - "Not today"       → costs nothing. The goat says "Fear won this round. That's allowed." and offers
 *                       "Make it smaller?". Only a hidden counter changes (for the smaller-step badge);
 *                       nothing is shown, counted, dated or nagged about, and the plan stays as it was.
 * - "Make it smaller" → a sheet with three smaller versions (half of it, with someone first, practise
 *                       at home first) or her own words, then that step's own Fear Forecast: a NEW plan
 *                       joins the list and the original stays (Decision 22).
 *
 * No dates, counts, streaks or expiry anywhere: a plan waits as long as she likes.
 */
import './log/log.css'
import { goatAvatar, save, update } from '../app/context'
import type { Screen } from '../app/router'
import { audio } from '../audio/audio'
import { sfx } from '../audio/sfx'
import { goatVoice, scriptedLine, type SpokenLine } from '../model/goatVoice'
import { markNotToday } from '../model/stones'
import type { BraveThing } from '../storage/schema'
import { button, emptyState, screenLayout, type OverlayHandle } from '../ui/components'
import { Disposer, clear, h, prefersReducedMotion } from '../ui/dom'
import { goatBubble, type GoatBubble } from '../ui/goatBubble'
import { icon, weatherIcon, weatherLabel } from '../ui/icons'
import { PLANS_COPY } from './log/copy'
import { SAVED_TOAST_MS, takeJustSaved } from './log/events'
import { openSmallerSheet } from './log/smallerSheet'
import { showBadgeCards } from './log/ticket'

/** A new badge waits this long after the goat's line, so she hears the goat first. */
const BADGE_AFTER_MS = 2600

/** Her plans, newest first (by when they were made; later in the list = newer on a tie). */
export function plansNewestFirst(brave: readonly BraveThing[]): BraveThing[] {
  return brave
    .map((b, i) => ({ b, i, t: Date.parse(b.createdAt) || 0 }))
    .filter((x) => x.b.status === 'planned')
    .sort((a, b) => b.t - a.t || b.i - a.i)
    .map((x) => x.b)
}

export const plansScreen: Screen = (root, ctx) => {
  const c = PLANS_COPY
  const disposer = new Disposer()
  /** Cleanup for the list's goat bubbles (rebuilt with the list). */
  let listDisposer = new Disposer()
  const look = save().profile.look
  const goatName = save().profile.goatName

  /** The plan to greet (just saved, or just made smaller): it glows once. */
  let glowId: string | null = takeJustSaved()
  /** The plan that just got "Not today" (its card shows the goat and "Make it smaller?"). */
  let notTodayId: string | null = null
  let sheetHandle: OverlayHandle | null = null

  const topGoat = goatBubble({ avatar: () => goatAvatar(look), name: goatName })
  disposer.add(() => topGoat.destroy())
  const say = (bubble: GoatBubble, line: SpokenLine, durationMs?: number) =>
    bubble.say(line.text, { mood: line.mood, durationMs })
  /** The goat's spot above the list takes room only while it talks. */
  const goatSpot = h('div', { class: 'plans__goat' }, topGoat.el)
  let goatTimer: ReturnType<typeof setTimeout> | null = null
  const quiet = () => {
    if (goatTimer) clearTimeout(goatTimer)
    goatTimer = null
    goatSpot.classList.remove('is-open')
  }
  disposer.add(quiet)
  const talk = (line: SpokenLine, ms = 7000) => {
    quiet()
    goatSpot.classList.add('is-open')
    say(topGoat, line, ms)
    goatTimer = setTimeout(quiet, ms + 200)
  }
  goatSpot.addEventListener('click', quiet)

  const list = h('div', { class: 'plans__list', role: 'list' })
  const intro = h('p', { class: 'plans__intro' }, c.intro)
  const newButton = button(c.newPlan, { variant: 'secondary', size: 'big', icon: 'plus', onClick: () => ctx.navigate('/log') })

  root.appendChild(
    screenLayout({
      class: 'plans',
      title: c.title,
      tone: 'sky',
      back: () => ctx.back('/camp'),
      backLabel: c.toCamp,
      body: [intro, goatSpot, list],
      footer: [newButton],
    }),
  )
  const footer = root.querySelector<HTMLElement>('.layout__footer')

  // -------------------------------------------------------------------------------------------

  function planCard(plan: BraveThing): HTMLElement {
    const short = plan.text.length > 40 ? plan.text.slice(0, 38).trimEnd() + '…' : plan.text
    const tags: HTMLElement[] = []
    if (plan.smallerOf) tags.push(h('span', { class: 'pill plan__tag', dataset: { tone: 'sky' } }, icon('smaller', 18), c.smallerTag))
    if (plan.oops) tags.push(h('span', { class: 'pill plan__tag', dataset: { tone: 'crumble' } }, icon('oops', 18), c.oopsTag))

    const forecast = h(
      'span',
      { class: 'plan__forecast', role: 'img', 'aria-label': c.forecastLabel(weatherLabel(plan.forecast), plan.forecast) },
      h('span', { class: 'plan__forecast-icon', 'aria-hidden': 'true' }, weatherIcon(plan.forecast, 40)),
      h('span', { class: 'plan__forecast-label', 'aria-hidden': 'true' }, c.forecastShort),
    )

    const paper = h(
      'div',
      { class: 'plan__paper' },
      h('span', { class: 'plan__icon', 'aria-hidden': 'true' }, icon(plan.oops ? 'oops' : 'stone', 30)),
      h(
        'div',
        { class: 'plan__words' },
        tags.length ? h('div', { class: 'plan__tags' }, ...tags) : null,
        h('p', { class: 'plan__text' }, plan.text),
      ),
      forecast,
    )

    let lower: HTMLElement
    if (notTodayId === plan.id) {
      // "Not today": the goat's exact words, then a gentle offer. Nothing else changes.
      const bubble = goatBubble({ avatar: () => goatAvatar(look), name: goatName, tapToHide: false })
      listDisposer.add(() => bubble.destroy())
      const line = scriptedLine('notToday')
      const timer = setTimeout(() => say(bubble, line, 0), 60)
      listDisposer.add(() => clearTimeout(timer))
      lower = h(
        'div',
        { class: 'plan__nottoday' },
        bubble.el,
        h('p', { class: 'plan__offer' }, c.offer.q),
        h(
          'div',
          { class: 'plan__actions plan__actions--offer' },
          button(c.offer.yes, { size: 'big', icon: 'smaller', class: 'plan__smaller', onClick: () => makeSmaller(plan.id) }),
          button(c.offer.no, {
            variant: 'secondary',
            size: 'big',
            onClick: () => {
              notTodayId = null
              render()
            },
          }),
        ),
      )
    } else {
      lower = h(
        'div',
        { class: 'plan__actions' },
        button(c.did, {
          size: 'big',
          icon: 'check',
          class: 'plan__did',
          ariaLabel: `${c.did} ${short}`,
          onClick: () => ctx.navigate(`/log/did/${encodeURIComponent(plan.id)}`),
        }),
        button(c.notToday, {
          variant: 'secondary',
          size: 'big',
          icon: 'moon',
          class: 'plan__not-today',
          ariaLabel: `${c.notToday}: ${short}`,
          onClick: () => notToday(plan.id),
        }),
        button(c.smaller, {
          variant: 'secondary',
          size: 'big',
          icon: 'smaller',
          class: 'plan__smaller',
          ariaLabel: `${c.smaller}: ${short}`,
          onClick: () => makeSmaller(plan.id),
        }),
      )
    }

    return h(
      'article',
      {
        class: 'plan' + (glowId === plan.id ? ' is-new' : '') + (plan.oops ? ' plan--oops' : ''),
        role: 'listitem',
        dataset: { id: plan.id },
      },
      paper,
      lower,
    )
  }

  function render(): void {
    listDisposer.dispose()
    listDisposer = new Disposer()
    clear(list)
    const plans = plansNewestFirst(save().brave)
    intro.hidden = plans.length === 0
    if (footer) footer.hidden = plans.length === 0
    if (!plans.length) {
      list.appendChild(
        emptyState({
          icon: 'plans',
          title: c.empty.title,
          text: c.empty.text,
          action: button(c.empty.action, { size: 'big', icon: 'stone', onClick: () => ctx.navigate('/log') }),
        }),
      )
      return
    }
    for (const plan of plans) list.appendChild(planCard(plan))
  }

  function cardEl(id: string): HTMLElement | null {
    for (const el of list.querySelectorAll<HTMLElement>('.plan')) if (el.dataset.id === id) return el
    return null
  }

  function scrollToCard(id: string, block: 'start' | 'nearest'): void {
    const el = cardEl(id)
    if (!el) return
    const header = root.querySelector<HTMLElement>('.layout__header')
    const headerH = header ? header.getBoundingClientRect().height : 0
    const box = el.getBoundingClientRect()
    const view = root.getBoundingClientRect()
    const footerH = footer && !footer.hidden ? footer.getBoundingClientRect().height : 0
    let delta = 0
    if (block === 'start') delta = box.top - view.top - headerH - 12
    else if (box.bottom > view.bottom - footerH - 12) delta = box.bottom - (view.bottom - footerH - 12)
    else if (box.top < view.top + headerH + 12) delta = box.top - (view.top + headerH + 12)
    if (Math.abs(delta) < 2) return
    root.scrollTo({ top: Math.max(0, root.scrollTop + delta), behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }

  function notToday(id: string): void {
    update((d) => markNotToday(d, id))
    notTodayId = id
    glowId = null
    render()
    requestAnimationFrame(() => scrollToCard(id, 'nearest'))
  }

  function makeSmaller(id: string): void {
    const plan = save().brave.find((b) => b.id === id && b.status === 'planned')
    if (!plan) return
    sheetHandle?.close()
    sheetHandle = openSmallerSheet(plan, ({ id: newId, badges }) => {
      sheetHandle = null
      notTodayId = null
      glowId = newId
      render()
      root.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
      if (audio.isRunning()) sfx.bleat('happy')
      talk(goatVoice().pick('smaller'))
      // The goat's words first; a new badge (a smaller step after "Not today") follows gently.
      // (It still shows if she has moved on by then: toasts float over any screen.)
      if (badges.length) setTimeout(() => showBadgeCards(badges), BADGE_AFTER_MS)
    })
  }

  render()

  if (glowId) {
    // Just saved from the log flow: the goat greets it once "Saved to your Plans." has gone.
    const greet = goatVoice().pick('planSaved')
    const timer = setTimeout(() => talk(greet), SAVED_TOAST_MS + 150)
    disposer.add(() => clearTimeout(timer))
  }

  return () => {
    sheetHandle?.close()
    listDisposer.dispose()
    disposer.dispose()
  }
}
