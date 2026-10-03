/**
 * The Fear Forecast scale: 11 weather tiles, 0 (sunny) to 10 (thunderstorm). One tap picks.
 * One row when there is room (≥ 50 px a tile), otherwise two rows: 0–5 over 6–10.
 * Accessible as a radiogroup (arrow keys move, Space/Enter picks).
 */
import { audio } from '../audio/audio'
import { pressable } from './components'
import { h } from './dom'
import { weatherIcon, weatherLabel, weatherTint } from './icons'

export interface FearScaleOpts {
  value?: number | null
  onPick: (n: number) => void
  /** Accessible name of the group (the screen shows the question itself). */
  label?: string
}

export type FearScale = HTMLDivElement & { setValue(n: number | null): void }

/** Widths (px) needed for one row of 11, or two rows of 6, with tiles ≥ 48 px. */
const ONE_ROW_MIN = 11 * 50 + 10 * 6
const TWO_ROW_MIN = 6 * 48 + 5 * 5

export function fearScale(opts: FearScaleOpts): FearScale {
  let value: number | null = opts.value ?? null
  let lastPick = -Infinity
  const tiles: HTMLButtonElement[] = []
  const group = h('div', { class: 'fear__tiles', role: 'radiogroup', 'aria-label': opts.label ?? 'How scary? 0 to 10' })

  for (let n = 0; n <= 10; n++) {
    const tile = h(
      'button',
      {
        type: 'button',
        class: 'fear__tile',
        role: 'radio',
        'aria-label': `${n}, ${weatherLabel(n)}`,
        dataset: { level: String(n) },
        style: { background: weatherTint(n) },
      },
      h('span', { class: 'fear__icon' }, weatherIcon(n, 36)),
      h('span', { class: 'fear__num' }, String(n)),
    )
    pressable(tile)
    tile.addEventListener('click', () => {
      const now = performance.now()
      if (now - lastPick < 350) return
      lastPick = now
      audio.tap()
      setValue(n)
      opts.onPick(n)
    })
    tile.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
      if (!d) return
      e.preventDefault()
      const next = tiles[Math.max(0, Math.min(10, n + d))]
      for (const t of tiles) t.tabIndex = -1
      next.tabIndex = 0
      next.focus()
    })
    tiles.push(tile)
    group.appendChild(tile)
    if (n === 5) group.appendChild(h('span', { class: 'fear__break', 'aria-hidden': 'true' }))
  }

  const ends = h(
    'div',
    { class: 'fear__ends', 'aria-hidden': 'true' },
    h('span', null, `0 ${weatherLabel(0)}`),
    h('span', null, `${weatherLabel(10)} 10`),
  )
  const el = h('div', { class: 'fear fear--two-rows' }, group, ends) as FearScale

  function setValue(n: number | null): void {
    value = n === null ? null : Math.max(0, Math.min(10, Math.round(n)))
    tiles.forEach((t, i) => {
      const on = i === value
      t.setAttribute('aria-checked', String(on))
      t.classList.toggle('is-selected', on)
      t.tabIndex = on || (value === null && i === 0) ? 0 : -1
    })
  }
  el.setValue = setValue
  setValue(value)

  let seen = false
  const gone = () => {
    if (el.isConnected) seen = true
    return seen && !el.isConnected
  }
  // Applied on the next frame, outside the observer callback (no "ResizeObserver loop" errors).
  let pending = 0
  const fit = (width: number) => {
    if (width <= 0) return
    const three = width < TWO_ROW_MIN
    const two = !three && width < ONE_ROW_MIN
    const list = el.classList
    if (two === list.contains('fear--two-rows') && three === list.contains('fear--three-rows')) return
    cancelAnimationFrame(pending)
    pending = requestAnimationFrame(() => {
      list.toggle('fear--two-rows', two)
      list.toggle('fear--three-rows', three)
    })
  }
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver((entries) => {
      if (gone()) {
        ro.disconnect()
        return
      }
      for (const entry of entries) fit(entry.contentRect.width)
    })
    ro.observe(el)
  } else {
    const onResize = () => {
      if (gone()) {
        window.removeEventListener('resize', onResize)
        return
      }
      fit(el.clientWidth)
    }
    window.addEventListener('resize', onResize)
    requestAnimationFrame(onResize)
  }
  return el
}
