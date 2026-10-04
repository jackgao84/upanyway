/**
 * Change the grown-ups' PIN (#/parent/pin): the current PIN, then the new one twice (just the new one
 * when there is no PIN yet). Same PIN pad as the gate (its own big keys, no system keyboard). Saving
 * goes back to the grown-ups' home.
 *
 * Below it, the recovery code (Decision 87): whether this game has one, and "Make a new recovery code",
 * which shows a new code once and replaces the old one only on "I've written it down" ("Not now"
 * changes nothing). The grown-ups' home links here with `?make=1` when there is no code yet, which
 * opens the new code straight away. Being on this page already needed the PIN.
 */
import { save, update } from '../../app/context'
import type { Screen } from '../../app/router'
import { RECOVERY_COPY } from '../../content/copy'
import { hasPin, makePinRecord, verifyPin } from '../../model/pin'
import { hasRecoveryCode, makeRecoveryRecord, newRecoveryCode } from '../../model/recovery'
import { button, progressDots, toast } from '../../ui/components'
import { h } from '../../ui/dom'
import { pinPad } from '../../ui/pinPad'
import { PARENT_COPY } from './copy'
import { panel, para, parentLayout, parentPath } from './parts'
import { recoveryShow } from './recoveryCode'

const c = PARENT_COPY.pin

type Step = 'old' | 'new' | 'confirm'
const STEPS: Step[] = ['old', 'new', 'confirm']

export const pinScreen: Screen = (root, ctx) => {
  // A restored backup can arrive without a PIN: then there's no current one to ask for.
  const start: Step = hasPin(save().parent) ? 'old' : 'new'
  let step: Step = start
  let firstNew = ''
  const dotsHost = h('div', { class: 'pp-pin__dots' })

  const pad = pinPad({
    title: start === 'old' ? c.oldTitle : c.newTitle,
    subtitle: start === 'old' ? c.oldSub : c.newSub,
    onComplete: (pin) => onPin(pin),
  })

  function go(next: Step, error?: string): void {
    step = next
    if (next === 'old') pad.setTitle(c.oldTitle, c.oldSub)
    else if (next === 'new') pad.setTitle(c.newTitle, c.newSub)
    else pad.setTitle(c.confirmTitle, c.confirmSub)
    dotsHost.replaceChildren(progressDots(STEPS.length, STEPS.indexOf(next)))
    if (error) pad.error(error)
    else pad.reset()
  }

  function onPin(pin: string): void {
    if (!pinView.isConnected || pinView.hidden) {
      // Digits from a hardware keyboard while the new recovery code shows: ignore them.
      pad.reset()
      return
    }
    if (step === 'old') {
      if (verifyPin(pin, save().parent)) go('new')
      else pad.error(c.wrong)
      return
    }
    if (step === 'new') {
      firstNew = pin
      go('confirm')
      return
    }
    if (pin !== firstNew) {
      firstNew = ''
      go('new', c.mismatch)
      return
    }
    const record = makePinRecord(pin)
    update((d) => {
      d.parent.pinHash = record.pinHash
      d.parent.pinSalt = record.pinSalt
    })
    toast(c.saved, { icon: 'check', tone: 'leaf' })
    ctx.back(parentPath('home'))
  }

  // ---- The recovery code ---------------------------------------------------------------------
  const r = c.recovery
  const status = para('', 'pp-recovery__status')
  const recoveryPanel = panel(
    { title: r.title, icon: 'pencil', tone: 'sun', class: 'pp-recovery' },
    status,
    para(r.how, 'pp__text--faint'),
    h('div', { class: 'pp-actions pp-actions--center' }, button(r.make, { icon: 'pencil', onClick: () => showNewCode() })),
  )
  const paintStatus = () => {
    status.textContent = hasRecoveryCode(save().parent) ? r.has : r.none
  }
  paintStatus()

  const pinView = h(
    'div',
    { class: 'pp-pin__main stack stack--center' },
    dotsHost,
    h('div', { class: 'pp-pin__pad' }, pad.el),
    h('p', { class: 'pp-page-note pp-pin__note' }, c.note),
    recoveryPanel,
  )
  const showView = h('div', { class: 'pp-pin__show' })
  showView.hidden = true

  function closeCode(): void {
    showView.hidden = true
    showView.replaceChildren()
    pinView.hidden = false
    paintStatus()
  }

  function showNewCode(): void {
    const code = newRecoveryCode()
    const hadOne = hasRecoveryCode(save().parent)
    const show = recoveryShow({
      code,
      heading: 'h2',
      lead: RECOVERY_COPY.forWhat,
      replacesOld: hadOne,
      onDone: () => {
        const record = makeRecoveryRecord(code)
        update((d) => {
          d.parent.recoveryHash = record.recoveryHash
          d.parent.recoverySalt = record.recoverySalt
        })
        toast(RECOVERY_COPY.saved, { icon: 'check', tone: 'leaf' })
        ctx.back(parentPath('home'))
      },
      onCancel: () => closeCode(),
    })
    showView.replaceChildren(show.el, h('div', { class: 'recovery-actions' }, ...show.actions))
    pinView.hidden = true
    showView.hidden = false
    pad.reset()
    root.scrollTop = 0
  }

  dotsHost.replaceChildren(progressDots(STEPS.length, STEPS.indexOf(start)))
  root.appendChild(
    parentLayout(ctx, {
      title: c.title,
      class: 'parent--pin',
      narrow: true,
      body: [pinView, showView],
    }),
  )
  if (ctx.query.get('make') === '1') showNewCode()

  return () => pad.destroy()
}
