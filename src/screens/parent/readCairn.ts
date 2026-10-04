/**
 * Read the cairn (#/parent/cairn): her brave things in her own words, read-only — so grown-ups can
 * notice the try and cheer. Done brave things show the forecast → how scary it really was, how it
 * went, what she was worried might happen, what happened and what she learned. Plans show their
 * words, forecast and worry only: never a date,
 * never how often she said "Not today" (notTodayCount is not read here at all), never a nudge.
 * A gentle card points to How to cheer before any of it.
 */
import { now, save } from '../../app/context'
import type { Screen } from '../../app/router'
import { totalStones } from '../../model/stones'
import type { BraveThing } from '../../storage/schema'
import { button, emptyState } from '../../ui/components'
import { h } from '../../ui/dom'
import { icon, weatherIcon, weatherLabel } from '../../ui/icons'
import { PARENT_COPY } from './copy'
import { newestFirst, panel, parentLayout, parentPath, shortDate, tag } from './parts'

const c = PARENT_COPY.cairn

const OUTCOME_TONE = { nailed: 'leaf', wobbly: 'sun', flopped: 'plum' } as const
const OUTCOME_ICON = { nailed: 'check', wobbly: 'heart', flopped: 'stillhere' } as const

/** One side of "Forecast → Really": the weather icon, its name and the number. */
function weather(label: string, level: number): HTMLElement {
  return h(
    'div',
    { class: 'pp-weather' },
    h('span', { class: 'pp-weather__label' }, label),
    weatherIcon(level, 44),
    h('span', { class: 'pp-weather__name' }, weatherLabel(level)),
    h('span', { class: 'pp-weather__num' }, c.scale(level)),
  )
}

function doneItem(b: BraveThing, today: Date): HTMLElement {
  const date = shortDate(b.doneAt ?? b.createdAt, today)
  const tags = [b.oops ? tag(c.oops, 'sun', 'oops') : null, b.outcome ? tag(c.outcome[b.outcome], OUTCOME_TONE[b.outcome], OUTCOME_ICON[b.outcome]) : null]
  return h(
    'li',
    { class: 'pp-item pp-brave' },
    h('div', { class: 'pp-item__top' }, h('span', { class: 'pp-item__date' }, date), h('span', { class: 'pp-brave__tags' }, ...tags)),
    h('p', { class: 'pp-brave__text' }, b.text),
    h(
      'div',
      { class: 'pp-compare', role: 'group', 'aria-label': c.compareLabel(b.forecast, b.really ?? b.forecast) },
      weather(c.forecast, b.forecast),
      h('span', { class: 'pp-compare__arrow', 'aria-hidden': 'true' }, icon('next', 26)),
      typeof b.really === 'number' ? weather(c.really, b.really) : h('div', { class: 'pp-weather pp-weather--none' }, c.noReally),
    ),
    worried(b),
    b.whatHappened?.trim() ? h('p', { class: 'pp-brave__story' }, h('strong', null, c.happened), ' ', b.whatHappened.trim()) : null,
    b.learned?.trim() ? h('p', { class: 'pp-brave__story pp-brave__learned' }, h('strong', null, c.learned), ' ', b.learned.trim()) : null,
  )
}

/** Her answer to "What are you worried might happen?", when she gave one (her cairn shows it too). */
function worried(b: BraveThing): HTMLElement | null {
  const w = b.worry?.trim()
  return w ? h('p', { class: 'pp-brave__story pp-brave__worry' }, h('strong', null, c.worried), ' ', w) : null
}

function planItem(b: BraveThing): HTMLElement {
  return h(
    'li',
    { class: 'pp-item pp-plan' },
    h('span', { class: 'pp-plan__weather', 'aria-hidden': 'true' }, weatherIcon(b.forecast, 40)),
    h(
      'div',
      { class: 'pp-plan__words' },
      h('p', { class: 'pp-plan__text' }, b.text),
      h(
        'p',
        { class: 'pp-plan__forecast' },
        c.forecastLine(weatherLabel(b.forecast), b.forecast),
        b.oops ? h('span', { class: 'pp-plan__tag' }, ' · ', c.oops) : null,
        b.smallerOf ? h('span', { class: 'pp-plan__tag' }, ' · ', c.smaller) : null,
      ),
      worried(b),
    ),
  )
}

export const readCairnScreen: Screen = (root, ctx) => {
  const d = save()
  const today = now()
  const done = newestFirst(
    d.brave.filter((b) => b.status === 'done'),
    (b) => b.doneAt ?? b.createdAt,
  )
  // Plans in the order she made them: no dates, no "oldest first" pressure either way.
  const plans = d.brave.filter((b) => b.status === 'planned')
  const stones = totalStones(d)
  const letterStones = d.letters.filter((l) => l.stoneDay).length
  const compared = done.filter((b) => typeof b.really === 'number')
  const calmer = compared.filter((b) => (b.really as number) < b.forecast).length

  const stat = (n: number, text: string, iconName: 'cairn' | 'heart' | 'letter', tone: string) =>
    h('div', { class: 'pp-stat', dataset: { tone } }, h('span', { class: 'pp-stat__icon', 'aria-hidden': 'true' }, icon(iconName, 30)), h('span', { class: 'pp-stat__num' }, String(n)), h('span', { class: 'pp-stat__text' }, text))

  const summary = h(
    'div',
    { class: 'pp-stats' },
    stat(stones, c.stonesWord(stones), 'cairn', 'leaf'),
    stat(done.length, c.doneWord(done.length), 'heart', 'coral'),
    letterStones ? stat(letterStones, c.letterWord(letterStones), 'letter', 'sun') : null,
  )

  const cheer = h(
    'div',
    { class: 'callout pp-cheer-card', dataset: { tone: 'coral' } },
    icon('heart', 32),
    h(
      'div',
      { class: 'pp-cheer-card__text' },
      h('strong', { class: 'pp-cheer-card__title' }, c.cheerTitle),
      h('p', null, c.cheerText),
      button(c.cheerLink, { variant: 'secondary', icon: 'book', onClick: () => ctx.navigate(parentPath('cheer')) }),
    ),
  )

  const donePanel = panel(
    { title: c.doneTitle, icon: 'cairn', tone: 'leaf', lead: compared.length ? c.weather(calmer, compared.length) : undefined },
    done.length ? h('ul', { class: 'pp-list' }, ...done.map((b) => doneItem(b, today))) : emptyState({ icon: 'cairn', title: c.noneDone, text: c.noneDoneText }),
  )

  const plansPanel = panel(
    { title: c.plansTitle, icon: 'plans', tone: 'sky', lead: c.plansNote },
    plans.length ? h('ul', { class: 'pp-list' }, ...plans.map(planItem)) : h('p', { class: 'pp__text pp__text--faint' }, c.nonePlans),
  )

  root.appendChild(
    parentLayout(ctx, {
      title: c.title,
      class: 'parent--cairn',
      body: [h('p', { class: 'pp-page-lead' }, c.lead), summary, cheer, donePanel, plansPanel],
    }),
  )
}
