/** First run, kid step 3: name your mountain (pre-filled, idea chips). The sign on the picture follows. */
import { goatAvatar, save, update } from '../../app/context'
import type { Screen } from '../../app/router'
import { GOAT_SETUP, SETUP_COPY } from '../../content/copy'
import { MOUNTAIN_NAMES, pickNames } from '../../content/names'
import { button, screenLayout } from '../../ui/components'
import { h, svg } from '../../ui/dom'
import { goatBubble } from '../../ui/goatBubble'
import { kidDots, namePicker } from './common'

const NAME_MAX = 40

/** A paper-cut mountain with Sky Lake glinting on its flat top and the trail zig-zagging up. */
function mountainArt(): SVGSVGElement {
  const grad = svg(
    'linearGradient',
    { id: 'mtn-sky', x1: 0, y1: 0, x2: 0, y2: 1 },
    svg('stop', { offset: '0', 'stop-color': '#bfe3f0' }),
    svg('stop', { offset: '0.62', 'stop-color': '#ffe9d2' }),
    svg('stop', { offset: '1', 'stop-color': '#ffd9bd' }),
  )
  const cloud = (x: number, y: number, s: number) =>
    svg('path', {
      d: `M${x} ${y}h${44 * s}a${9 * s} ${9 * s} 0 0 0-${8 * s}-${12 * s}a${12 * s} ${12 * s} 0 0 0-${22 * s}-${4 * s}a${10 * s} ${10 * s} 0 0 0-${16 * s} ${8 * s}a${8 * s} ${8 * s} 0 0 0 ${2 * s} ${8 * s}z`,
      fill: '#ffffff',
      opacity: '0.9',
    })
  return svg(
    'svg',
    { class: 'peak-art', viewBox: '0 0 400 240', preserveAspectRatio: 'xMidYMax slice', 'aria-hidden': 'true' },
    svg('defs', null, grad),
    svg('rect', { x: -200, y: 0, width: 800, height: 240, fill: 'url(#mtn-sky)' }),
    svg('circle', { cx: 322, cy: 70, r: 40, fill: '#ffe7a6', opacity: '0.55' }),
    svg('circle', { cx: 322, cy: 70, r: 24, fill: '#ffd36b' }),
    cloud(52, 78, 1),
    cloud(268, 112, 0.8),
    // Far ridges
    svg('path', { d: 'M-200 240 L-40 150 L30 182 L110 120 L170 170 L230 140 L300 168 L380 118 L470 160 L600 240Z', fill: '#e4d9f1' }),
    // The mountain, moved down a little so its top shows in wide frames.
    svg(
      'g',
      { transform: 'translate(0 26)' },
      svg('path', { d: 'M24 240 L120 132 L150 104 L182 52 Q200 44 218 52 L250 104 L286 138 L376 240Z', fill: '#8ea7c8' }),
      svg('path', { d: 'M200 48 Q209 46 218 52 L250 104 L286 138 L376 240 L232 240 L246 170 L222 118Z', fill: '#a8bed9' }),
      // Snow cap
      svg('path', { d: 'M168 76 L182 52 Q200 44 218 52 L234 78 L222 86 L211 76 L200 88 L188 76 L178 86Z', fill: '#ffffff' }),
      // Sky Lake on the flat top
      svg('ellipse', { cx: 200, cy: 51, rx: 12, ry: 2.6, fill: '#4fb0c6' }),
      svg('path', { d: 'M193 50.4h6', stroke: '#ffffff', 'stroke-width': 1, 'stroke-linecap': 'round', opacity: '0.85' }),
      // Trail
      svg('path', {
        d: 'M150 236 L236 206 L168 182 L240 160 L180 136 L228 116 L196 98 L214 82',
        fill: 'none',
        stroke: '#ffffff',
        'stroke-width': 2.6,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        'stroke-dasharray': '0.1 7',
        opacity: '0.9',
      }),
    ),
    // Meadow hills
    svg('path', { d: 'M-200 240 L-200 214 Q-60 186 70 206 Q170 220 250 200 Q340 180 600 210 L600 240Z', fill: '#a9d18e' }),
    svg('path', { d: 'M-200 240 L-200 228 Q-20 210 120 226 Q260 238 360 222 Q480 208 600 226 L600 240Z', fill: '#7fb069' }),
    // A little tent at base camp
    svg(
      'g',
      { transform: 'translate(212 -2)' },
      svg('path', { d: 'M78 228 L96 200 L114 228Z', fill: '#e8735a' }),
      svg('path', { d: 'M96 200 L114 228 L103 228Z', fill: '#c4573f' }),
      svg('path', { d: 'M96 214 L92 228 L100 228Z', fill: '#7a3b2c' }),
    ),
  )
}

export const mountainScreen: Screen = (root, ctx) => {
  const c = SETUP_COPY.mountain
  const d = save()
  const ideas = pickNames(MOUNTAIN_NAMES, 7)
  const suggestion = d.profile.mountainName || ideas[0]

  const signText = h('span', { class: 'peak-sign__text' }, suggestion)
  const setSign = (name: string) => {
    signText.textContent = name || suggestion
  }

  const picker = namePicker({
    label: c.nameLabel,
    ideasLabel: c.ideas,
    value: suggestion,
    ideas: ideas.slice(1),
    fallback: suggestion || c.fallback,
    maxLength: NAME_MAX,
    onChange: setSign,
    onEnter: () => finish(),
  })

  const bubble = goatBubble({ avatar: () => goatAvatar(d.profile.look), name: d.profile.goatName, tapToHide: false })

  function finish(): void {
    const name = picker.value()
    update((draft) => {
      draft.profile.mountainName = name
    })
    ctx.navigate('/setup/lesson')
  }

  root.appendChild(
    screenLayout({
      class: 'setup setup--mountain',
      title: c.title,
      top: kidDots('mountain'),
      back: () => ctx.navigate('/setup/goat'),
      body: [
        h(
          'div',
          { class: 'peak' },
          h(
            'div',
            { class: 'peak__stage scene' },
            mountainArt(),
            h('div', { class: 'peak-sign', 'aria-hidden': 'true' }, signText, h('span', { class: 'peak-sign__post' })),
          ),
          h('div', { class: 'peak__side stack' }, bubble.el, picker.el),
        ),
      ],
      footer: [button(c.done, { onClick: finish, size: 'big', iconEnd: 'next' })],
    }),
  )
  const timer = setTimeout(() => bubble.say(GOAT_SETUP.mountain.text, { mood: GOAT_SETUP.mountain.mood, durationMs: 0 }), 350)
  return () => {
    clearTimeout(timer)
    bubble.destroy()
  }
}
