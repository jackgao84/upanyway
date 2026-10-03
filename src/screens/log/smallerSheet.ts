/**
 * "Make it smaller" (Plans): a bottom sheet with the three smaller versions (half of it, with someone
 * first, practise at home first) and "Write my own", then the new step's own Fear Forecast. It makes a
 * NEW plan pointing at the original (makeSmallerPlan); the original plan stays exactly as it was.
 */
import { now, update } from '../../app/context'
import type { BadgeId } from '../../content/badges'
import { SMALLER_WAYS, WRITE_MY_OWN, WRITE_MY_OWN_HINT, smallerText } from '../../content/smaller'
import { evaluateBadges } from '../../model/badges'
import { makeSmallerPlan } from '../../model/stones'
import type { BraveThing } from '../../storage/schema'
import { button, card, setDisabled, sheet, textField, type OverlayHandle } from '../../ui/components'
import { clear, h } from '../../ui/dom'
import { fearScale } from '../../ui/fearScale'
import { icon, type IconName } from '../../ui/icons'
import { PLANS_COPY } from './copy'
import { ticket } from './ticket'

const MAX_OWN = 100
const WAY_ICONS: Record<string, IconName> = { half: 'smaller', someone: 'grownups', home: 'tent' }

export interface SmallerResult {
  id: string
  badges: BadgeId[]
}

export function openSmallerSheet(plan: BraveThing, onMade: (result: SmallerResult) => void): OverlayHandle {
  const c = PLANS_COPY.sheet
  const body = h('div', { class: 'smaller' })
  let made = false
  let ownText = ''

  const handle = sheet({ title: c.title, body, class: 'smaller-sheet', tone: 'sky' })

  function show(...children: (HTMLElement | null)[]): void {
    clear(body)
    for (const child of children) if (child) body.appendChild(child)
    const scroller = handle.el.querySelector<HTMLElement>('.sheet__scroll')
    if (scroller) scroller.scrollTop = 0
  }

  function backButton(to: () => void): HTMLElement {
    return h('div', { class: 'smaller__back' }, button(c.back, { variant: 'ghost', icon: 'back', onClick: to }))
  }

  function chooseWay(): void {
    const cards = SMALLER_WAYS.map((way) =>
      card({
        title: way.label,
        text: way.hint,
        icon: icon(WAY_ICONS[way.id] ?? 'smaller', 32),
        tone: 'sky',
        class: 'smaller__way',
        onClick: () => askForecast(smallerText(way.id, plan.text), chooseWay),
      }),
    )
    const own = card({
      title: WRITE_MY_OWN,
      text: WRITE_MY_OWN_HINT,
      icon: icon('pencil', 32),
      tone: 'sun',
      class: 'smaller__way smaller__way--own',
      onClick: () => writeOwn(),
    })
    show(
      h('p', { class: 'smaller__sub' }, c.sub),
      ticket({ text: plan.text, oops: plan.oops, forecast: plan.forecast }),
      h('div', { class: 'smaller__ways' }, ...cards, own),
    )
  }

  function writeOwn(): void {
    const next = button(c.next, { size: 'big', iconEnd: 'next', onClick: () => submit() })
    const sync = () => setDisabled(next, !ownText.trim())
    const submit = () => {
      const text = ownText.trim().replace(/\s+/g, ' ')
      if (!text) return
      field.input.blur()
      askForecast(text, writeOwn)
    }
    const field = textField({
      label: c.ownQ,
      value: ownText,
      placeholder: c.ownPlaceholder,
      maxLength: MAX_OWN,
      enterKeyHint: 'next',
      onInput: (v) => {
        ownText = v
        sync()
      },
      onEnter: () => submit(),
    })
    sync()
    show(backButton(chooseWay), h('div', { class: 'smaller__own stack' }, field, h('div', { class: 'smaller__actions' }, next)))
  }

  function askForecast(text: string, back: () => void): void {
    const scale = fearScale({
      label: c.forecastLabel,
      onPick: (n) => {
        if (made) return
        made = true
        let id = ''
        let badges: BadgeId[] = []
        update((d) => {
          const b = makeSmallerPlan(d, plan.id, { text, forecast: n }, now())
          if (b) id = b.id
          badges = evaluateBadges(d, now())
        })
        setTimeout(() => {
          handle.close()
          if (id) onMade({ id, badges })
        }, 240)
      },
    })
    show(
      backButton(back),
      ticket({ text, oops: plan.oops }),
      h('h3', { class: 'smaller__q' }, c.forecastQ),
      scale,
    )
  }

  chooseWay()
  return handle
}
