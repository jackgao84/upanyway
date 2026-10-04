/**
 * The recovery code, shown once (Decision 87): what it's for, the code in big, easy-to-copy type, "write
 * it down and keep it where your climber won't find it", "it won't be shown again", and one big "I've
 * written it down". Used by the first run (setup/recovery.ts), the gate after "Forgot PIN?" has set a
 * new PIN, and Change PIN → "Make a new recovery code". The caller saves the hash on onDone; nothing is
 * saved before that, and the code itself never is.
 */
import './recovery.css'
import { RECOVERY_COPY } from '../../content/copy'
import { formatRecoveryCode, spellRecoveryCode } from '../../model/recovery'
import { button } from '../../ui/components'
import { h } from '../../ui/dom'
import { icon } from '../../ui/icons'

export interface RecoveryShowOpts {
  /** The new code (model/recovery.ts newRecoveryCode). */
  code: string
  /** h1 when it is the screen's own question (the first run), h2 inside another page. */
  heading: 'h1' | 'h2'
  /** The first line: what the code is for, or that the old one is used up. */
  lead: string
  /** Say that the old code stops working at "I've written it down" (a game that already has one). */
  replacesOld?: boolean
  onDone: () => void
  /** A secondary "Not now" (Change PIN only: nothing changes). */
  onCancel?: () => void
}

export interface RecoveryShow {
  el: HTMLElement
  /** "I've written it down" (and "Not now"): the first run puts them in its footer. */
  actions: HTMLElement[]
}

/** The code itself, three groups in large monospaced type, selectable for a password manager. */
export function recoveryCodeBox(code: string): HTMLElement {
  const groups = formatRecoveryCode(code).split('-')
  const text = h('span', { class: 'recovery-code__text', 'aria-hidden': 'true' })
  groups.forEach((g, i) => {
    if (i) text.appendChild(h('span', { class: 'recovery-code__dash' }, '-'))
    text.appendChild(h('span', { class: 'recovery-code__group' }, g))
  })
  return h('p', { class: 'recovery-code' }, h('span', { class: 'sr-only' }, RECOVERY_COPY.codeLabel(spellRecoveryCode(code))), text)
}

export function recoveryShow(opts: RecoveryShowOpts): RecoveryShow {
  const c = RECOVERY_COPY
  const done = button(c.done, { icon: 'check', size: 'big', onClick: () => opts.onDone(), class: 'recovery__done' })
  const actions: HTMLElement[] = opts.onCancel
    ? [button(c.cancel, { variant: 'secondary', onClick: () => opts.onCancel?.() }), done]
    : [done]
  const el = h(
    'section',
    { class: 'recovery', 'aria-label': c.title },
    h('div', { class: 'recovery__badge', 'aria-hidden': 'true' }, icon('pencil', 40)),
    h(opts.heading, { class: 'recovery__title' }, c.title),
    h('p', { class: 'recovery__lead' }, opts.lead),
    recoveryCodeBox(opts.code),
    h(
      'ul',
      { class: 'recovery__points' },
      h('li', null, icon('pencil', 24), h('span', null, c.points[0])),
      h('li', null, icon('eye', 24), h('span', null, c.points[1])),
    ),
    opts.replacesOld ? h('p', { class: 'recovery__note' }, c.replaces) : null,
    h('p', { class: 'recovery__note' }, c.later),
  )
  return { el, actions }
}
