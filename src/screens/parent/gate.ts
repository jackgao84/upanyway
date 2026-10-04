/**
 * The grown-ups' gate (#/parent): the PIN pad, and "Forgot PIN?" (Decision 87).
 *
 * "Forgot PIN?" asks for the recovery code a grown-up wrote down at setup. The right code (any case,
 * spaces and dashes ignored) leads to a new PIN (enter + confirm); saving it uses the old code up, and
 * a new code is shown once and saved on "I've written it down". A code that doesn't match gets a gentle
 * line; after five in a row each further try waits 30 seconds (only a guesser notices). A game set up
 * before recovery codes gets a plain explanation of what a grown-up can do instead: there is no way
 * round the PIN from here.
 */
import './gate.css'
import { lockParent, save, unlockParent, update } from '../../app/context'
import type { Screen } from '../../app/router'
import { GATE_COPY, RECOVERY_COPY } from '../../content/copy'
import { hasPin, makePinRecord, verifyPin } from '../../model/pin'
import {
  cleanRecoveryInput,
  hasRecoveryCode,
  isRecoveryCodeShaped,
  makeRecoveryRecord,
  newRecoveryCode,
  noRecoveryCode,
  recoveryWaitMs,
  strangeRecoveryChars,
  verifyRecoveryCode,
} from '../../model/recovery'
import { button, screenLayout, setDisabled, textField, toast } from '../../ui/components'
import { h } from '../../ui/dom'
import { keepInView } from '../../ui/keyboard'
import { pinPad } from '../../ui/pinPad'
import { recoveryShow } from './recoveryCode'

type Mode = 'enter' | 'code' | 'noCode' | 'new' | 'confirm' | 'show'

/**
 * Codes in a row that didn't match, and when the current wait ends. Kept while the app is open, so
 * leaving the gate and coming back doesn't start the count again.
 */
const guesses = { wrong: 0, waitUntil: 0 }

/** "O and 1", "O, 1 and #". */
function listChars(chars: string[]): string {
  return chars.length <= 1 ? chars.join('') : `${chars.slice(0, -1).join(', ')} and ${chars[chars.length - 1]}`
}

export const gateScreen: Screen = (root, ctx) => {
  const c = GATE_COPY
  lockParent()
  let mode: Mode = hasPin(save().parent) ? 'enter' : 'new'
  /** The new PIN follows a right recovery code (then a new code is shown once it's saved). */
  let viaCode = false
  let firstNew = ''
  let waitTimer = 0

  const pad = pinPad({
    title: mode === 'enter' ? c.pinTitle : c.newTitle,
    subtitle: mode === 'enter' ? c.pinSub : c.noPin,
    onComplete: (pin) => onPin(pin),
  })

  // ---- The PIN pad (enter, new, confirm) -------------------------------------------------------
  const forgot = button(c.forgot, { variant: 'secondary', icon: 'info', onClick: () => openForgot(), class: 'gate__forgot-btn' })
  const forgotWrap = h('div', { class: 'gate__forgot' }, forgot)
  const pinView = h('div', { class: 'gate__pin stack stack--center' }, h('div', { class: 'gate__pad' }, pad.el), forgotWrap)

  // ---- "Forgot PIN?": the recovery code ---------------------------------------------------------
  const codeError = h('p', { class: 'gate__error', role: 'alert' })
  const field = textField({
    label: c.code.label,
    value: '',
    // Room for spaces and dashes; the "n left" count only shows near the end, well past a code.
    maxLength: 40,
    autocapitalize: 'none',
    enterKeyHint: 'go',
    name: 'recovery-code',
    onInput: () => {
      if (!waiting()) codeError.textContent = ''
    },
    onEnter: () => check(),
  })
  field.input.setAttribute('autocapitalize', 'characters')
  field.input.setAttribute('autocorrect', 'off')
  field.input.setAttribute('spellcheck', 'false')
  field.classList.add('gate__field')
  const checkBtn = button(c.code.check, { icon: 'check', onClick: () => check() })
  const codeView = h(
    'section',
    { class: 'gate__panel gate__code', 'aria-labelledby': 'gate-code-title' },
    h('h2', { class: 'gate__panel-title', id: 'gate-code-title' }, c.code.title),
    h('p', { class: 'gate__panel-text' }, c.code.sub),
    field,
    codeError,
    h(
      'div',
      { class: 'gate__actions' },
      button(c.code.back, { variant: 'secondary', icon: 'back', onClick: () => enterMode('enter') }),
      checkBtn,
    ),
  )

  // ---- "Forgot PIN?" on a game with no code ------------------------------------------------------
  const noCodeView = h(
    'section',
    { class: 'gate__panel gate__nocode', 'aria-labelledby': 'gate-nocode-title' },
    h('h2', { class: 'gate__panel-title', id: 'gate-nocode-title' }, c.noCode.title),
    ...c.noCode.lines.map((line) => h('p', { class: 'gate__panel-text' }, line)),
    h('div', { class: 'gate__actions' }, button(c.noCode.back, { variant: 'secondary', icon: 'back', onClick: () => enterMode('enter') })),
  )

  // ---- The new code, once the new PIN is saved -------------------------------------------------
  const showView = h('div', { class: 'gate__show' })

  function waiting(): boolean {
    return guesses.waitUntil > Date.now()
  }

  /** While a wait runs: the check button is off and the line counts down; then it says "try again". */
  function paintWait(): void {
    window.clearInterval(waitTimer)
    waitTimer = 0
    if (!waiting()) {
      setDisabled(checkBtn, false)
      return
    }
    setDisabled(checkBtn, true)
    const tick = () => {
      const left = Math.ceil((guesses.waitUntil - Date.now()) / 1000)
      if (left > 0) {
        codeError.textContent = c.code.wait(left)
        return
      }
      window.clearInterval(waitTimer)
      waitTimer = 0
      setDisabled(checkBtn, false)
      codeError.textContent = c.code.ready
    }
    tick()
    waitTimer = window.setInterval(tick, 500)
  }

  function check(): void {
    if (mode !== 'code' || waiting()) return
    const typed = field.input.value
    const clean = cleanRecoveryInput(typed)
    if (!clean) {
      codeError.textContent = c.code.empty
      return
    }
    // Not a code at all (a letter it never uses, or too few/many): say what, and don't count it.
    const strange = strangeRecoveryChars(clean)
    if (strange.length) {
      codeError.textContent = c.code.strange(listChars(strange))
      return
    }
    if (!isRecoveryCodeShaped(clean)) {
      codeError.textContent = c.code.length(clean.length)
      return
    }
    if (verifyRecoveryCode(clean, save().parent)) {
      guesses.wrong = 0
      guesses.waitUntil = 0
      field.input.blur()
      viaCode = true
      enterMode('new')
      return
    }
    guesses.wrong++
    const wait = recoveryWaitMs(guesses.wrong)
    if (wait) {
      guesses.waitUntil = Date.now() + wait
      paintWait()
    } else {
      codeError.textContent = c.code.wrong
    }
  }

  function openForgot(): void {
    if (mode !== 'enter') return
    enterMode(hasRecoveryCode(save().parent) ? 'code' : 'noCode')
  }

  function enterMode(next: Mode, error?: string): void {
    mode = next
    pinView.hidden = !(next === 'enter' || next === 'new' || next === 'confirm')
    codeView.hidden = next !== 'code'
    noCodeView.hidden = next !== 'noCode'
    showView.hidden = next !== 'show'
    forgotWrap.hidden = next !== 'enter'
    layout.classList.toggle('is-panel', next === 'code' || next === 'noCode' || next === 'show')
    if (next === 'enter') pad.setTitle(c.pinTitle, c.pinSub)
    else if (next === 'new') pad.setTitle(c.newTitle, viaCode ? c.newSubAfterCode : hasPin(save().parent) ? c.newSub : c.noPin)
    else if (next === 'confirm') pad.setTitle(c.confirmTitle)
    if (error) pad.error(error)
    else pad.reset()
    if (next === 'code') {
      field.setValue('')
      codeError.textContent = ''
      paintWait()
      field.input.focus()
      keepInView(field.input)
    }
    if (next !== 'code') {
      window.clearInterval(waitTimer)
      waitTimer = 0
    }
    if (next === 'noCode' || next === 'show') root.scrollTop = 0
  }

  function done(): void {
    unlockParent()
    ctx.navigate('/parent/home', { replace: true })
  }

  /** The new PIN is saved: show a new code once (the old one is used up). */
  function showNewCode(): void {
    const code = newRecoveryCode()
    const show = recoveryShow({
      code,
      heading: 'h2',
      lead: RECOVERY_COPY.afterReset,
      onDone: () => {
        const record = makeRecoveryRecord(code)
        update((d) => {
          d.parent.recoveryHash = record.recoveryHash
          d.parent.recoverySalt = record.recoverySalt
        })
        toast(RECOVERY_COPY.saved, { icon: 'check', tone: 'leaf' })
        done()
      },
    })
    showView.replaceChildren(show.el, h('div', { class: 'recovery-actions' }, ...show.actions))
    enterMode('show')
  }

  function onPin(pin: string): void {
    if (mode === 'enter') {
      if (verifyPin(pin, save().parent)) return done()
      pad.error(c.wrong)
      return
    }
    if (mode === 'new') {
      firstNew = pin
      enterMode('confirm')
      return
    }
    if (mode !== 'confirm') {
      // Digits from a hardware keyboard while another panel shows: ignore them.
      pad.reset()
      return
    }
    if (pin !== firstNew) {
      firstNew = ''
      enterMode('new', c.mismatch)
      return
    }
    const record = makePinRecord(pin)
    update((d) => {
      d.parent.pinHash = record.pinHash
      d.parent.pinSalt = record.pinSalt
      // A code that set a new PIN is used up, there and then. The new one is saved on "I've written it
      // down"; until then (a reload, Back to camp) there is none, and the grown-ups' home says so.
      if (viaCode) Object.assign(d.parent, noRecoveryCode())
    })
    // After a recovery code the new code's own first line says the PIN is saved (a toast would cover it).
    if (viaCode) return showNewCode()
    toast(c.saved, { icon: 'check', tone: 'leaf' })
    done()
  }

  const layout = screenLayout({
    class: 'gate',
    title: c.title,
    back: () => ctx.back('/camp'),
    backLabel: c.back,
    narrow: true,
    body: [pinView, codeView, noCodeView, showView],
  })
  root.appendChild(layout)
  enterMode(mode)

  return () => {
    window.clearInterval(waitTimer)
    pad.destroy()
  }
}
