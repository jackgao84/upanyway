/** First run, grown-up step 1: what this is, a Home Screen tip when needed, then a PIN (enter + confirm). */
import { isStandalone, update } from '../../app/context'
import type { Screen } from '../../app/router'
import { SETUP_COPY } from '../../content/copy'
import { makePinRecord } from '../../model/pin'
import { screenLayout } from '../../ui/components'
import { h } from '../../ui/dom'
import { icon } from '../../ui/icons'
import { pinPad } from '../../ui/pinPad'
import { parentDots } from './common'

export const helloScreen: Screen = (root, ctx) => {
  const c = SETUP_COPY.hello
  let first = ''

  const pad = pinPad({
    title: c.pinTitle,
    subtitle: c.pinSub,
    onComplete: (pin) => {
      if (!first) {
        first = pin
        pad.setTitle(c.confirmTitle, c.confirmSub)
        pad.reset()
        return
      }
      if (pin !== first) {
        first = ''
        pad.setTitle(c.pinTitle, c.pinSub)
        pad.error(c.mismatch)
        return
      }
      const record = makePinRecord(pin)
      update((d) => {
        d.parent.pinHash = record.pinHash
        d.parent.pinSalt = record.pinSalt
      })
      ctx.navigate('/setup/names')
    },
  })

  const tip = isStandalone()
    ? null
    : h(
        'div',
        { class: 'callout hello__tip', dataset: { tone: 'sky' } },
        icon('share', 30),
        h('div', { class: 'stack stack--sm' }, h('strong', null, c.tipTitle), h('span', { class: 'small' }, c.tip)),
      )

  // On a phone the PIN pad comes straight after the first line and the tip (CSS reorders; the second
  // line, `hello__more`, moves under the pad), so the pad shows without scrolling.
  const intro = h(
    'div',
    { class: 'hello__intro stack' },
    h('div', { class: 'hello__badge', 'aria-hidden': 'true' }, icon('goat', 72)),
    h('h1', { class: 'title-xl hello__title' }, c.title),
    ...c.lines.map((line, i) => h('p', { class: i === 0 ? 'lead hello__lead' : 'muted hello__more' }, line)),
    tip,
  )

  root.appendChild(
    screenLayout({
      class: 'setup setup--hello',
      top: parentDots(0),
      body: [h('div', { class: 'hello' }, intro, h('div', { class: 'hello__pin' }, pad.el))],
    }),
  )
  return () => pad.destroy()
}
