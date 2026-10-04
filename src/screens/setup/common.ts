/** Bits shared by the first-run screens: progress dots and the "name it" field with idea chips. */
import './setup.css'
import { KID_STEPS, type KidStep } from '../../app/context'
import { chips, progressDots, textField, type TextField } from '../../ui/components'
import { h } from '../../ui/dom'

/** Dots for her part of the first run (the hand-over screen is the grown-ups'). */
export function kidDots(step: KidStep): HTMLElement {
  const steps: readonly KidStep[] = KID_STEPS.filter((s) => s !== 'handover')
  return progressDots(steps.length, Math.max(0, steps.indexOf(step)))
}

/** Dots for the grown-ups' part (PIN, recovery code, then names). */
export function parentDots(i: 0 | 1 | 2): HTMLElement {
  return progressDots(3, i)
}

export interface NamePicker {
  el: HTMLElement
  field: TextField
  /** The trimmed name, or the fallback when the field is empty. */
  value(): string
}

/** A text field pre-filled with a suggestion, plus chips with more ideas (tap one to use it). */
export function namePicker(opts: {
  label: string
  ideasLabel: string
  value: string
  ideas: string[]
  fallback: string
  maxLength: number
  onChange?: (name: string) => void
  onEnter: () => void
}): NamePicker {
  const field = textField({
    label: opts.label,
    value: opts.value,
    maxLength: opts.maxLength,
    autocapitalize: 'words',
    enterKeyHint: 'done',
    onInput: (v) => opts.onChange?.(v.trim()),
    onEnter: () => {
      field.input.blur()
      opts.onEnter()
    },
  })
  const ideaChips = chips(opts.ideas, (name) => {
    field.setValue(name)
    opts.onChange?.(name)
  }, { ariaLabel: opts.ideasLabel })
  const el = h(
    'div',
    { class: 'name-picker stack' },
    field,
    h('div', { class: 'name-picker__ideas stack stack--sm' }, h('p', { class: 'muted small name-picker__label' }, opts.ideasLabel), ideaChips),
  )
  return {
    el,
    field,
    value: () => field.input.value.trim().replace(/\s+/g, ' ') || opts.fallback,
  }
}
