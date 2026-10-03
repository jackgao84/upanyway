/** First run: the grown-up hands over. A closed backpack gives a little wiggle (someone's in there). */
import { animate, deviceWord, fitBox, releaseCanvas, save, sizeCanvas } from '../../app/context'
import type { Screen } from '../../app/router'
import { SETUP_COPY } from '../../content/copy'
import { drawPackWithGoat } from '../../game/art/climber'
import { button, screenLayout } from '../../ui/components'
import { h } from '../../ui/dom'
import './common'

export const handoverScreen: Screen = (root, ctx) => {
  const c = SETUP_COPY.handover
  const look = save().profile.look
  const canvas = h('canvas', { class: 'handover__pack', 'aria-hidden': 'true' })

  root.appendChild(
    screenLayout({
      class: 'setup setup--handover',
      body: [
        h(
          'div',
          { class: 'handover stack stack--center' },
          h('div', { class: 'handover__art' }, canvas),
          h('h1', { class: 'title-xl handover__title' }, c.title(deviceWord())),
          h('p', { class: 'lead' }, c.sub),
        ),
      ],
      footer: [button(c.go, { onClick: () => ctx.navigate('/setup/climber'), size: 'big', iconEnd: 'next' })],
    }),
  )

  // Every couple of seconds the pack shuffles about, as if something inside is waking up.
  const loop = animate(
    canvas,
    (t) => {
      const size = sizeCanvas(canvas)
      const g = canvas.getContext('2d')
      if (!size || !g) return
      fitBox(g, size, { minX: -16, minY: -24, maxX: 16, maxY: 3 }, 0.04)
      const k = t % 2.6
      const wiggle = k < 0.7 ? Math.sin(k * 30) * (0.7 - k) * 0.22 : 0
      const hop = k < 0.7 ? Math.abs(Math.sin(k * 15)) * (0.7 - k) * 2.2 : 0
      g.translate(0, -hop)
      g.rotate(wiggle)
      drawPackWithGoat(g, look, null)
    },
    { fps: 30 },
  )
  return () => {
    loop.stop()
    releaseCanvas(canvas)
  }
}
