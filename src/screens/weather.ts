/**
 * The Weather Station (#/weather): her Fear Forecast against how it really was, for every done
 * brave thing (real ones only — never the climb's Looks Scary moments), oldest first, newest last.
 *
 * - The station's sign: "Fear forecasts usually come in stormier than the real weather." and a
 *   gentle summary ("Forecasts: mostly Rainy. Really: mostly Sunny.") — never a score, never praise
 *   that grows with the fear number.
 * - A timeline (cairn/weatherChart.ts) and the list of brave things, each with its pair of weather
 *   icons. Tapping either opens that brave thing's story (the same sheet as its cairn stone).
 * - A friendly empty state until there are 3, saying how many she has.
 */
import './cairn/cairn.css'
import './cairn/weather.css'
import { now, save } from '../app/context'
import type { Screen } from '../app/router'
import { audio } from '../audio/audio'
import { button, emptyState, pressable, screenLayout, type OverlayHandle } from '../ui/components'
import { h } from '../ui/dom'
import { icon, weatherIcon, weatherLabel } from '../ui/icons'
import { WEATHER_COPY } from './cairn/copy'
import { openStoneStory } from './cairn/story'
import { weatherChart, type WeatherChart } from './cairn/weatherChart'
import { WEATHER_GROUPS, WEATHER_MIN, weatherEntries, weatherGroup, weatherSummary, type WeatherEntry } from './cairn/weatherData'
import { dayPhrase } from './flops/when'

const c = WEATHER_COPY

/** A middle level of the most common kind of weather, for the summary's little picture. */
function typicalLevel(levels: number[]): number {
  const counts = WEATHER_GROUPS.map(() => 0)
  for (const l of levels) counts[weatherGroup(l)]++
  let best = 0
  for (let i = 1; i < counts.length; i++) if (counts[i] > counts[best]) best = i
  const lo = best === 0 ? 0 : WEATHER_GROUPS[best - 1].max + 1
  return Math.round((lo + WEATHER_GROUPS[best].max) / 2)
}

function summaryLine(label: string, words: string, level: number, kind: 'forecast' | 'really'): HTMLElement {
  return h(
    'p',
    { class: `wx-sign__line wx-sign__line--${kind}` },
    h('span', { class: `wx-bubble wx-bubble--${kind} wx-bubble--static`, 'aria-hidden': 'true' }, weatherIcon(level, 30)),
    h('span', null, h('strong', null, label), ' ', words, '.'),
  )
}

function row(e: WeatherEntry, t: Date, onPick: (id: string) => void): HTMLElement {
  const when = dayPhrase(e.at, t)
  const el = h(
    'button',
    {
      type: 'button',
      class: 'wx-row',
      'aria-label': c.rowLabel(e.text, when, e.forecast, weatherLabel(e.forecast), e.really, weatherLabel(e.really)),
    },
    h(
      'span',
      { class: 'wx-row__text', 'aria-hidden': 'true' },
      h('span', { class: 'wx-row__what' }, e.text),
      when ? h('span', { class: 'wx-row__when' }, when.charAt(0).toUpperCase() + when.slice(1)) : null,
    ),
    h(
      'span',
      { class: 'wx-row__pair', 'aria-hidden': 'true' },
      h('span', { class: 'wx-bubble wx-bubble--forecast wx-bubble--static' }, weatherIcon(e.forecast, 30)),
      h('span', { class: 'wx-row__arrow' }, '→'),
      h('span', { class: 'wx-bubble wx-bubble--really wx-bubble--static' }, weatherIcon(e.really, 30)),
    ),
  )
  pressable(el)
  el.addEventListener('click', () => onPick(e.id))
  return el
}

export const weatherScreen: Screen = (root, ctx) => {
  const d = save()
  const t = now()
  const entries = weatherEntries(d)
  let story: OverlayHandle | null = null
  let lastPick = -Infinity
  const pick = (id: string) => {
    const at = performance.now()
    if (at - lastPick < 400) return
    lastPick = at
    audio.tap()
    story?.close()
    story = openStoneStory(id, {
      onClose: () => {
        story = null
      },
    })
  }

  let chart: WeatherChart | null = null
  const body: HTMLElement[] = []
  if (entries.length < WEATHER_MIN) {
    // Three slots: the ones she has show their forecast → real weather; the rest wait, dashed.
    const slots = h('div', { class: 'wx-slots', 'aria-hidden': 'true' })
    for (let i = 0; i < WEATHER_MIN; i++) {
      const e = entries[i]
      slots.appendChild(
        e
          ? h('span', { class: 'wx-slot is-filled' }, weatherIcon(e.forecast, 30), h('span', { class: 'wx-slot__arrow' }, '→'), weatherIcon(e.really, 30))
          : h('span', { class: 'wx-slot' }),
      )
    }
    const empty = emptyState({
      icon: h('span', { class: 'wx-empty-art' }, weatherIcon(7, 34), h('span', { class: 'wx-empty-art__arrow' }, '→'), weatherIcon(1, 34)),
      title: c.emptyTitle,
      text: c.emptyHave(entries.length),
      action: button(c.logOne, { icon: 'stone', size: 'big', onClick: () => ctx.navigate('/log') }),
    })
    empty.insertBefore(slots, empty.lastChild)
    body.push(empty)
  } else {
    const sum = weatherSummary(entries)
    const forecasts = entries.map((e) => e.forecast)
    const reallys = entries.map((e) => e.really)
    body.push(
      h(
        'section',
        { class: 'wx-sign' },
        h(
          'div',
          { class: 'wx-sign__head' },
          h('span', { class: 'wx-sign__vane', 'aria-hidden': 'true' }, icon('weather', 40)),
          h('p', { class: 'wx-sign__caption' }, c.caption),
        ),
        h(
          'div',
          { class: 'wx-sign__summary' },
          summaryLine(c.forecasts, sum.forecasts, typicalLevel(forecasts), 'forecast'),
          summaryLine(c.really, sum.really, typicalLevel(reallys), 'really'),
        ),
      ),
    )
    chart = weatherChart(entries, t, pick)
    body.push(
      h(
        'section',
        { class: 'wx-card' },
        h(
          'div',
          { class: 'wx-legend', 'aria-hidden': 'true' },
          h('span', { class: 'wx-legend__item' }, h('span', { class: 'wx-legend__dot wx-legend__dot--forecast' }), c.legendForecast),
          h('span', { class: 'wx-legend__item' }, h('span', { class: 'wx-legend__dot wx-legend__dot--really' }), c.legendReally),
        ),
        chart.el,
        h('p', { class: 'wx-card__hint' }, c.tapHint),
      ),
      h(
        'section',
        { class: 'wx-list-wrap' },
        h('h2', { class: 'wx-list-title' }, c.listTitle),
        h('div', { class: 'wx-list' }, ...entries.map((e) => row(e, t, pick))),
      ),
    )
  }

  root.appendChild(
    screenLayout({
      class: 'weather-screen',
      title: c.title,
      back: () => ctx.back('/camp'),
      backLabel: c.back,
      tone: 'ridge',
      body,
    }),
  )

  return () => {
    story?.close()
    chart?.destroy()
  }
}
