/** First run, grown-up step 2: what the climber calls each grown-up (1–4) and the daily climb time. */
import { save, update } from '../../app/context'
import type { Screen } from '../../app/router'
import { SETUP_COPY } from '../../content/copy'
import { DEFAULT_DAILY_MINUTES } from '../../storage/schema'
import { button, iconButton, screenLayout, stepper, textField, type TextField } from '../../ui/components'
import { clear, h } from '../../ui/dom'
import { parentDots } from './common'

const MAX_NAMES = 4
const MAX_NAME_LENGTH = 24
/** The stepper's value one step past 60 stands for "No limit" (saved as 0). */
const NO_LIMIT_STEP = 65

export const namesScreen: Screen = (root, ctx) => {
  const c = SETUP_COPY.names
  const d = save()
  const names: string[] = d.parent.names.length ? d.parent.names.slice(0, MAX_NAMES) : []
  while (names.length < 2) names.push('')
  const savedMinutes = d.parent.dailyClimbMinutes
  let minutes = savedMinutes === 0 ? NO_LIMIT_STEP : Math.min(60, Math.max(5, savedMinutes || DEFAULT_DAILY_MINUTES))

  const list = h('div', { class: 'names__list stack' })
  const error = h('p', { class: 'names__error', role: 'alert' })
  let fields: TextField[] = []

  const addBtn = button(c.addAnother, {
    variant: 'secondary',
    icon: 'plus',
    onClick: () => {
      if (names.length >= MAX_NAMES) return
      names.push('')
      render()
      fields[fields.length - 1]?.input.focus()
    },
  })

  function render(): void {
    clear(list)
    fields = names.map((value, i) => {
      const field = textField({
        label: c.fieldLabel(i + 1),
        value,
        placeholder: c.examples[i] ? `For example: ${c.examples[i]}` : undefined,
        maxLength: MAX_NAME_LENGTH,
        autocapitalize: 'words',
        enterKeyHint: i < names.length - 1 ? 'next' : 'done',
        name: `grownup-${i + 1}`,
        onInput: (v) => {
          names[i] = v
          if (error.textContent && v.trim()) error.textContent = ''
        },
        onEnter: () => {
          const next = fields[i + 1]
          if (next) next.input.focus()
          else field.input.blur()
        },
      })
      const remove =
        names.length > 1
          ? iconButton('close', c.remove(i + 1), () => {
              names.splice(i, 1)
              render()
            }, { variant: 'ghost', class: 'names__remove' })
          : null
      list.appendChild(h('div', { class: 'names__row' }, field, remove))
      return field
    })
    addBtn.hidden = names.length >= MAX_NAMES
  }

  const minutesStepper = stepper({
    value: minutes,
    min: 5,
    max: NO_LIMIT_STEP,
    step: 5,
    label: c.minutesLabel,
    format: (v) => (v >= NO_LIMIT_STEP ? c.noLimit : c.minutes(v)),
    onChange: (v) => {
      minutes = v
    },
  })

  const finish = () => {
    const clean = names.map((n) => n.trim().replace(/\s+/g, ' ')).filter(Boolean)
    if (!clean.length) {
      error.textContent = c.needOne
      fields[0]?.input.focus()
      return
    }
    update((draft) => {
      draft.parent.names = clean.slice(0, MAX_NAMES)
      draft.parent.dailyClimbMinutes = minutes >= NO_LIMIT_STEP ? 0 : minutes
      draft.setup.parentDone = true
    })
    ctx.navigate('/setup/handover')
  }

  render()
  root.appendChild(
    screenLayout({
      class: 'setup setup--names',
      top: parentDots(1),
      back: () => ctx.navigate('/setup/hello'),
      narrow: true,
      body: [
        h('h1', { class: 'ask__q names__title' }, c.title),
        h('p', { class: 'muted center' }, c.hint),
        h(
          'div',
          { class: 'names' },
          h('div', { class: 'names__people stack' }, list, h('div', { class: 'row' }, addBtn), error),
          h(
            'section',
            { class: 'names__minutes stack stack--sm' },
            h('h2', { class: 'section-title' }, c.minutesTitle),
            minutesStepper,
            h('p', { class: 'muted small' }, c.minutesHint),
          ),
        ),
      ],
      footer: [button(c.done, { onClick: finish, size: 'big', iconEnd: 'next' })],
    }),
  )
}
