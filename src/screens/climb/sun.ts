/**
 * The small sinking sun at the top of the climb (Decision 7). It shows how much of today's climbing
 * time is left as a picture only: the sun slides down toward the hills and the sky warms. No numbers,
 * no clock, no countdown. With no daily limit (or in test mode) it stays high. On night climbs it is
 * the moon in a night sky, sinking the same way.
 */
import { h, svg } from '../../ui/dom'
import { CLIMB_COPY } from './copy'

export interface SunDial {
  el: HTMLElement
  /** 0 = high in the sky, 1 = set. */
  set(progress: number): void
}

const SKY = ['#d4eef6', '#ffe6c4', '#ffc9a0', '#f4a38a']
const SUN_FILL = ['#ffd45c', '#ffc24a', '#ffa24a', '#ff8a52']
const NIGHT_SKY = ['#3b4a86', '#34407a', '#2d376c', '#262f5e']
const MOON_FILL = ['#fff4d6', '#fff0cc', '#ffe9bd', '#ffe2ad']

function pick(list: string[], p: number): string {
  return list[Math.min(list.length - 1, Math.max(0, Math.floor(p * (list.length - 0.001))))]
}

export function sunDial(opts: { night?: boolean } = {}): SunDial {
  const night = !!opts.night
  const skies = night ? NIGHT_SKY : SKY
  const fills = night ? MOON_FILL : SUN_FILL
  const sky = svg('rect', { x: '0', y: '0', width: '80', height: '48', fill: skies[0] })
  const rays = svg(
    'g',
    { class: 'climb-sun__rays', stroke: '#ffd45c', 'stroke-width': '2.2', 'stroke-linecap': 'round' },
    ...[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
      const a = (deg * Math.PI) / 180
      return svg('line', {
        x1: String(Math.cos(a) * 12.5),
        y1: String(Math.sin(a) * 12.5),
        x2: String(Math.cos(a) * 16),
        y2: String(Math.sin(a) * 16),
      })
    }),
  )
  const disc = svg('circle', { cx: '0', cy: '0', r: '9', fill: fills[0], stroke: night ? '#d9c79a' : '#e89a3a', 'stroke-width': '1.4' })
  // The moon's crescent shadow, and a few stars.
  const shade = night ? svg('circle', { cx: '4', cy: '-3', r: '7.5', fill: NIGHT_SKY[0], opacity: '0.85' }) : null
  const stars = night
    ? svg(
        'g',
        { fill: '#fff6dd' },
        ...[
          [12, 9, 1.1],
          [62, 7, 1.3],
          [70, 18, 0.9],
          [8, 22, 0.8],
          [48, 12, 0.8],
        ].map(([x, y, r]) => svg('circle', { cx: String(x), cy: String(y), r: String(r) })),
      )
    : null
  const sun = svg('g', { class: 'climb-sun__sun' }, night ? null : rays, disc, shade)
  const far = svg('path', { d: 'M0 38 C14 30 24 33 34 36 C46 29 60 28 80 35 L80 48 L0 48 Z', fill: night ? '#4f6a8e' : '#b9d9a6' })
  const near = svg('path', { d: 'M0 44 C18 38 30 41 44 43 C56 39 68 39 80 42 L80 48 L0 48 Z', fill: night ? '#3c5677' : '#8fbf78' })
  const clipId = `sun-clip-${Math.random().toString(36).slice(2, 8)}`
  const art = svg(
    'svg',
    { class: 'climb-sun__art', viewBox: '0 0 80 48', width: '80', height: '48', 'aria-hidden': 'true', focusable: 'false' },
    svg('defs', null, svg('clipPath', { id: clipId }, svg('rect', { x: '0', y: '0', width: '80', height: '48', rx: '18' }))),
    svg('g', { 'clip-path': `url(#${clipId})` }, sky, stars, sun, far, near),
  )
  const words = night ? CLIMB_COPY.moon : CLIMB_COPY.sun
  const el = h('div', { class: 'climb-sun', role: 'img', 'aria-label': words.high }, art)

  let shown = -1
  function set(progress: number): void {
    const p = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0))
    // Small steps only: the picture changes slowly, like the real sun.
    const q = Math.round(p * 40) / 40
    if (q === shown) return
    shown = q
    const x = 24 + 30 * q
    const y = 15 + 36 * Math.pow(q, 1.15)
    sun.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`)
    const skyFill = pick(skies, q)
    sky.setAttribute('fill', skyFill)
    shade?.setAttribute('fill', skyFill)
    disc.setAttribute('fill', pick(fills, q))
    rays.setAttribute('opacity', String(Math.max(0, 1 - q * 1.6).toFixed(2)))
    el.setAttribute('aria-label', q < 0.4 ? words.high : q < 0.8 ? words.lower : words.low)
  }
  set(0)
  return { el, set }
}
