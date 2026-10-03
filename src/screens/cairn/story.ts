/**
 * Read a stone back: the sheet that opens when she taps a stone in the cairn (or a day in the
 * Weather Station). A brave thing's stone tells its whole story — the brave thing, "Forecast 7 →
 * Really 2" with the weather, what she was worried about, what happened, how it went, what she
 * learned and when. A letter's stone shows the Spotted! note and who wrote it. A waiting stone says
 * when it goes on.
 */
import { now, releaseCanvas, save } from '../../app/context'
import { renderStoneCanvas } from '../../game/art/stones'
import type { BraveThing, Letter } from '../../storage/schema'
import { sheet, type OverlayHandle } from '../../ui/components'
import { h, type Child } from '../../ui/dom'
import { icon, weatherIcon, weatherLabel, weatherTint } from '../../ui/icons'
import { OUTCOMES } from '../log/ticket'
import { dayPhrase } from '../flops/when'
import { STORY_COPY } from './copy'
import { waitingWhen, type WaitingWhen } from './data'

const c = STORY_COPY

/** The same little pictures as the log's "How did it go?" cards. */
function outcomeArt(outcome: NonNullable<BraveThing['outcome']>): Element {
  const info = OUTCOMES.find((o) => o.id === outcome)
  const art = info ? info.art() : icon('check', 26)
  art.setAttribute('width', '26')
  art.setAttribute('height', '26')
  return art
}

/** How long the sheet takes to slide away (ui/components overlay close) before its canvas is freed. */
const SHEET_CLOSE_MS = 320

/** The stone itself, drawn big at the top of the sheet. Release `canvas` when the sheet closes. */
function stoneArt(id: string, letter: boolean, glow: boolean): { el: HTMLElement; canvas: HTMLCanvasElement } {
  const canvas = h('canvas', { class: 'story__stone-canvas', 'aria-hidden': 'true' })
  const el = h('div', { class: 'story__stone' + (glow ? ' is-waiting' : '') }, canvas)
  // The canvas has no size until the sheet is on the page (and none to draw once it has gone).
  requestAnimationFrame(() => {
    if (canvas.isConnected) renderStoneCanvas(canvas, id, { mark: letter ? 'letter' : null, glow })
  })
  return { el, canvas }
}

/** "Forecast 7 → Really 2", with both weather pictures. */
export function weatherPair(forecast: number, really: number): HTMLElement {
  const side = (label: string, n: number) =>
    h(
      'div',
      { class: 'wpair__side', style: `--tint: ${weatherTint(n)}` },
      h('span', { class: 'wpair__icon' }, weatherIcon(n, 58)),
      h('span', { class: 'wpair__word' }, `${label} ${n}`),
      h('span', { class: 'wpair__label' }, weatherLabel(n)),
    )
  return h(
    'div',
    {
      class: 'wpair',
      role: 'img',
      'aria-label': c.pairLabel(forecast, weatherLabel(forecast), really, weatherLabel(really)),
    },
    side(c.forecast, forecast),
    h('span', { class: 'wpair__arrow', 'aria-hidden': 'true' }, '→'),
    side(c.really, really),
  )
}

function qa(q: string, a: Child, cls = ''): HTMLElement {
  return h('div', { class: 'story__qa' + (cls ? ` ${cls}` : '') }, h('span', { class: 'story__q' }, q), h('p', { class: 'story__a' }, a))
}

function waitingBanner(when: WaitingWhen | null): HTMLElement | null {
  if (!when) return null
  return h(
    'p',
    { class: 'story__waiting' },
    h('span', { class: 'story__waiting-dot', 'aria-hidden': 'true' }),
    when === 'tomorrow' ? c.waitingTomorrow : c.waitingLater,
  )
}

function braveBody(b: BraveThing, when: WaitingWhen | null, t: Date): Child[] {
  const tags: Child[] = []
  if (b.oops) tags.push(h('span', { class: 'story__tag story__tag--oops' }, icon('oops', 20), c.oops))
  if (b.smallerOf) tags.push(h('span', { class: 'story__tag story__tag--smaller' }, icon('smaller', 20), c.smaller))
  const done = dayPhrase(b.doneAt ?? b.createdAt, t)
  const really = typeof b.really === 'number' ? b.really : null
  return [
    waitingBanner(when),
    tags.length ? h('div', { class: 'story__tags' }, ...tags) : null,
    really === null ? null : weatherPair(b.forecast, really),
    h(
      'article',
      { class: 'note story__note' },
      b.worry ? qa(c.worried, b.worry) : null,
      b.whatHappened ? qa(c.happened, b.whatHappened) : null,
      b.outcome
        ? qa(
            c.howItWent,
            h('span', { class: 'story__outcome' }, outcomeArt(b.outcome), c.outcome[b.outcome]),
            `story__qa--${b.outcome}`,
          )
        : null,
      b.learned ? qa(c.learned, b.learned, 'story__qa--learned') : null,
    ),
    done ? h('p', { class: 'story__when' }, c.doneOn(done)) : null,
  ]
}

function letterBody(l: Letter, when: WaitingWhen | null, t: Date): Child[] {
  const opened = dayPhrase(l.openedAt ?? l.createdAt, t)
  return [
    waitingBanner(when),
    h(
      'article',
      { class: 'note story__letter' },
      h('span', { class: 'note__from' }, c.spotted),
      h('p', { class: 'note__text' }, l.text),
      l.from ? h('p', { class: 'story__sign' }, '— ', c.from(l.from)) : null,
    ),
    h('p', { class: 'story__bonus' }, h('span', { 'aria-hidden': 'true' }, icon('heart', 22)), c.letterBonus(l.from)),
    opened ? h('p', { class: 'story__when' }, c.letterOpened(opened)) : null,
  ]
}

/** Open the story of the stone with this id (brave thing or letter). Null if there is no such stone. */
export function openStoneStory(id: string, opts: { onClose?: () => void } = {}): OverlayHandle | null {
  const d = save()
  const t = now()
  const b = d.brave.find((x) => x.id === id)
  const l = b ? undefined : d.letters.find((x) => x.id === id)
  if (!b && !l) return null
  const when = waitingWhen(d, id)
  const { el: art, canvas } = stoneArt(id, !!l, when !== null)
  // iOS keeps a canvas's backing store until it is sized to nothing: free it once the sheet has gone.
  const onClose = () => {
    setTimeout(() => releaseCanvas(canvas), SHEET_CLOSE_MS)
    opts.onClose?.()
  }
  if (b) {
    return sheet({
      title: b.text,
      art,
      body: braveBody(b, when, t),
      class: 'story story--brave',
      tone: 'leaf',
      onClose,
    })
  }
  const letter = l as Letter
  return sheet({
    title: c.letterTitle(letter.from.trim()),
    art,
    body: letterBody(letter, when, t),
    class: 'story story--letter',
    tone: 'sun',
    onClose,
  })
}
