/**
 * The Weather Station's timeline: one column per done brave thing, oldest on the left, newest on
 * the right. In each column the Fear Forecast (a bubble with a grey-blue ring) and how it really
 * was (a sunny ring) sit at their height on a Stormy-to-Sunny scale, with a small arrow from one to
 * the other; a soft line joins the forecasts and another joins the real weather, so the shape of
 * "forecasts come in stormier" shows without a single number to add up.
 *
 * Plain DOM + one inline SVG for the lines. Columns are big buttons (the whole column, ≥ 96 px wide)
 * that open that brave thing's story. Few columns stretch to fill the card; many scroll sideways,
 * starting at the newest.
 */
import { dayKey, daysBetween } from '../../model/clock'
import { pressable } from '../../ui/components'
import { h, svg } from '../../ui/dom'
import { weatherIcon, weatherLabel } from '../../ui/icons'
import { WEATHER_COPY } from './copy'
import type { WeatherEntry } from './weatherData'

const c = WEATHER_COPY

/** Chart geometry (CSS px). */
const H = 250
const PAD_Y = 30
const BUBBLE = 44
const COL_MIN = 100
const COL_MAX = 156
const PAD_X = 10

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

/** "Today", "Yesterday", "Tue" (this week), else "3 Oct". */
export function shortDay(iso: string, now: Date): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  const d = new Date(t)
  const ago = daysBetween(dayKey(d), dayKey(now))
  if (ago <= 0) return c.today
  if (ago === 1) return c.yesterday
  if (ago < 7) return DAYS[d.getDay()]
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`
}

/** Pixel height of a level on the Stormy (top) … Sunny (bottom) scale. */
function yOf(level: number): number {
  return PAD_Y + (1 - level / 10) * (H - 2 * PAD_Y)
}

export interface WeatherChart {
  el: HTMLElement
  destroy(): void
}

export function weatherChart(entries: readonly WeatherEntry[], now: Date, onPick: (id: string) => void): WeatherChart {
  const n = entries.length
  const lines = svg('svg', { class: 'wx-chart__lines', 'aria-hidden': 'true', focusable: 'false' })
  const days = h('div', { class: 'wx-chart__days', 'aria-hidden': 'true' })
  const track = h('div', { class: 'wx-chart__track', style: `height: ${H}px` }, lines)
  let lastDay = ''
  const cols = entries.map((e, i) => {
    const bubble = (kind: 'forecast' | 'really', level: number) =>
      h(
        'span',
        { class: `wx-bubble wx-bubble--${kind}`, style: `top: ${Math.round(yOf(level) - BUBBLE / 2)}px` },
        weatherIcon(level, 32),
      )
    const col = h(
      'button',
      {
        type: 'button',
        class: 'wx-col',
        'aria-label': c.columnLabel(e.text, e.forecast, weatherLabel(e.forecast), e.really, weatherLabel(e.really)),
        dataset: { id: e.id },
      },
      bubble('forecast', e.forecast),
      bubble('really', e.really),
    )
    pressable(col)
    col.addEventListener('click', () => onPick(e.id))
    track.appendChild(col)
    const label = shortDay(e.at, now)
    days.appendChild(h('span', { class: 'wx-chart__day' }, label === lastDay && i > 0 ? '' : label))
    lastDay = label
    return col
  })
  const scroll = h('div', { class: 'wx-chart__scroll' }, track, days)
  const axis = h(
    'div',
    { class: 'wx-chart__axis', 'aria-hidden': 'true', style: `height: ${H}px` },
    h('span', { class: 'wx-chart__axis-end wx-chart__axis-end--top' }, weatherIcon(10, 30), h('span', null, c.stormy)),
    h('span', { class: 'wx-chart__axis-bar' }),
    h('span', { class: 'wx-chart__axis-end wx-chart__axis-end--bottom' }, weatherIcon(0, 30), h('span', null, c.sunny)),
  )
  const el = h(
    'div',
    { class: 'wx-chart', role: 'group', 'aria-label': c.chartLabel(n) },
    axis,
    scroll,
  )

  let width = -1
  let first = true

  function layout(): void {
    const avail = scroll.clientWidth
    if (!avail || avail === width) return
    width = avail
    const col = Math.max(COL_MIN, Math.min(COL_MAX, (avail - 2 * PAD_X) / Math.max(1, n)))
    const trackW = Math.max(avail, Math.round(n * col + 2 * PAD_X))
    track.style.width = `${trackW}px`
    days.style.width = `${trackW}px`
    lines.setAttribute('width', String(trackW))
    lines.setAttribute('height', String(H))
    lines.setAttribute('viewBox', `0 0 ${trackW} ${H}`)
    while (lines.firstChild) lines.removeChild(lines.firstChild)

    // Faint guide lines: stormy, in between, sunny.
    for (const level of [10, 5, 0]) {
      const y = yOf(level)
      lines.appendChild(svg('line', { x1: 0, y1: y, x2: trackW, y2: y, class: 'wx-chart__guide' }))
    }
    const fx = (i: number) => PAD_X + i * col + col * 0.28
    const rx = (i: number) => PAD_X + i * col + col * 0.72
    const series = (xs: (i: number) => number, key: 'forecast' | 'really') => {
      if (n < 2) return
      let d = ''
      entries.forEach((e, i) => {
        d += `${i ? 'L' : 'M'}${xs(i).toFixed(1)} ${yOf(e[key]).toFixed(1)}`
      })
      lines.appendChild(svg('path', { d, class: `wx-chart__line wx-chart__line--${key}` }))
    }
    series(fx, 'forecast')
    series(rx, 'really')
    // A small arrow in each column, from the forecast to how it really was.
    entries.forEach((e, i) => {
      const x1 = fx(i)
      const y1 = yOf(e.forecast)
      const x2 = rx(i)
      const y2 = yOf(e.really)
      const len = Math.hypot(x2 - x1, y2 - y1)
      const cut = BUBBLE / 2 + 4
      if (len < cut * 2 + 8) return
      const ux = (x2 - x1) / len
      const uy = (y2 - y1) / len
      const ax = x1 + ux * cut
      const ay = y1 + uy * cut
      const bx = x2 - ux * cut
      const by = y2 - uy * cut
      const head = 7
      const lx = bx - ux * head - uy * head * 0.7
      const ly = by - uy * head + ux * head * 0.7
      const rx2 = bx - ux * head + uy * head * 0.7
      const ry2 = by - uy * head - ux * head * 0.7
      lines.appendChild(
        svg('path', {
          d: `M${ax.toFixed(1)} ${ay.toFixed(1)}L${bx.toFixed(1)} ${by.toFixed(1)}M${lx.toFixed(1)} ${ly.toFixed(1)}L${bx.toFixed(1)} ${by.toFixed(1)}L${rx2.toFixed(1)} ${ry2.toFixed(1)}`,
          class: 'wx-chart__arrow',
        }),
      )
    })
    cols.forEach((el, i) => {
      el.style.left = `${Math.round(PAD_X + i * col)}px`
      el.style.width = `${Math.round(col)}px`
    })
    Array.from(days.children).forEach((el, i) => {
      const s = (el as HTMLElement).style
      s.left = `${Math.round(PAD_X + i * col)}px`
      s.width = `${Math.round(col)}px`
    })
    // Start at the newest (the right-hand end).
    if (first) {
      first = false
      scroll.scrollLeft = trackW - avail
    }
  }

  let ro: ResizeObserver | null = null
  const onResize = () => layout()
  if (typeof ResizeObserver === 'function') {
    ro = new ResizeObserver(onResize)
    ro.observe(scroll)
  } else window.addEventListener('resize', onResize)
  requestAnimationFrame(layout)

  return {
    el,
    destroy() {
      ro?.disconnect()
      window.removeEventListener('resize', onResize)
    },
  }
}
