/**
 * The grown-ups' gate (#/parent): the PIN pad. "Forgot PIN?" needs a 3-second press-and-hold, then
 * a 2-digit × 2-digit product written in words, typed as digits, then a new PIN (enter + confirm).
 * A deterrent beyond a young climber's patience and times tables, not security.
 */
import './gate.css'
import { lockParent, save, unlockParent, update } from '../../app/context'
import type { Screen } from '../../app/router'
import { GATE_COPY } from '../../content/copy'
import { hasPin, makePinRecord, verifyPin } from '../../model/pin'
import { screenLayout, toast } from '../../ui/components'
import { h } from '../../ui/dom'
import { icon } from '../../ui/icons'
import { pinPad } from '../../ui/pinPad'

type Mode = 'enter' | 'challenge' | 'new' | 'confirm'

const HOLD_MS = 3000
const TRIES_PER_QUESTION = 3

const ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
const TEENS = ['ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']

/** 10–99 in words: "forty-seven". */
export function twoDigitWords(n: number): string {
  if (n < 10 || n > 99 || !Number.isInteger(n)) throw new Error('two-digit numbers only')
  if (n < 20) return TEENS[n - 10]
  const t = Math.floor(n / 10)
  const o = n % 10
  return o ? `${TENS[t]}-${ONES[o]}` : TENS[t]
}

/** A question whose answer always has four digits (both numbers ≥ 32), so the PIN pad can take it. */
export function makeChallenge(rng: () => number = Math.random): { a: number; b: number; title: string; answer: string } {
  const pick = () => 32 + Math.floor(rng() * 68)
  const a = pick()
  const b = pick()
  return { a, b, title: GATE_COPY.challengeTitle(twoDigitWords(a), twoDigitWords(b)), answer: String(a * b) }
}

export const gateScreen: Screen = (root, ctx) => {
  const c = GATE_COPY
  lockParent()
  let mode: Mode = hasPin(save().parent) ? 'enter' : 'new'
  let challenge = makeChallenge()
  let wrongAnswers = 0
  let firstNew = ''

  const pad = pinPad({
    title: mode === 'enter' ? c.pinTitle : c.newTitle,
    subtitle: mode === 'enter' ? c.pinSub : c.noPin,
    onComplete: (pin) => onPin(pin),
  })

  function enterMode(next: Mode, error?: string): void {
    mode = next
    if (next === 'enter') pad.setTitle(c.pinTitle, c.pinSub)
    else if (next === 'challenge') pad.setTitle(challenge.title, c.challengeSub)
    else if (next === 'new') pad.setTitle(c.newTitle, c.newSub)
    else pad.setTitle(c.confirmTitle)
    forgotWrap.hidden = next !== 'enter'
    layout.classList.toggle('is-challenge', next === 'challenge')
    if (error) pad.error(error)
    else pad.reset()
  }

  function done(): void {
    unlockParent()
    ctx.navigate('/parent/home', { replace: true })
  }

  function onPin(pin: string): void {
    if (mode === 'enter') {
      if (verifyPin(pin, save().parent)) return done()
      pad.error(c.wrong)
      return
    }
    if (mode === 'challenge') {
      if (pin === challenge.answer) return enterMode('new')
      wrongAnswers++
      if (wrongAnswers >= TRIES_PER_QUESTION) {
        wrongAnswers = 0
        challenge = makeChallenge()
        pad.setTitle(challenge.title, c.challengeSub)
      }
      pad.error(c.challengeWrong)
      return
    }
    if (mode === 'new') {
      firstNew = pin
      enterMode('confirm')
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
    })
    toast(c.saved, { icon: 'check', tone: 'leaf' })
    done()
  }

  // "Forgot PIN?": press and hold for three seconds (a fill shows the progress).
  const fill = h('span', { class: 'hold__fill', 'aria-hidden': 'true' })
  const label = h('span', { class: 'hold__label' }, c.forgot)
  const forgot = h('button', { type: 'button', class: 'btn btn--secondary hold' }, fill, icon('info', 24), label)
  const holdHint = h('p', { class: 'muted small center hold__hint', 'aria-live': 'polite' })
  const forgotWrap = h('div', { class: 'stack stack--sm stack--center gate__forgot' }, forgot, holdHint)
  forgotWrap.hidden = mode !== 'enter'

  let holdStart = -1
  let raf = 0
  const paintHold = (k: number) => {
    fill.style.transform = `scaleX(${k})`
  }
  const tick = () => {
    if (holdStart < 0) return
    const k = Math.min(1, (performance.now() - holdStart) / HOLD_MS)
    paintHold(k)
    if (k >= 1) {
      holdStart = -1
      forgot.classList.remove('is-holding')
      paintHold(0)
      label.textContent = c.forgot
      holdHint.textContent = ''
      challenge = makeChallenge()
      wrongAnswers = 0
      enterMode('challenge')
      return
    }
    raf = requestAnimationFrame(tick)
  }
  const startHold = () => {
    if (holdStart >= 0 || mode !== 'enter') return
    holdStart = performance.now()
    forgot.classList.add('is-holding')
    label.textContent = c.holding
    holdHint.textContent = ''
    raf = requestAnimationFrame(tick)
  }
  const stopHold = () => {
    if (holdStart < 0) return
    holdStart = -1
    cancelAnimationFrame(raf)
    forgot.classList.remove('is-holding')
    paintHold(0)
    label.textContent = c.forgot
    holdHint.textContent = c.holdHint
  }
  forgot.addEventListener('pointerdown', (e) => {
    try {
      forgot.setPointerCapture(e.pointerId)
    } catch {
      // Capture is a nicety; holding still works without it.
    }
    startHold()
  })
  forgot.addEventListener('pointerup', stopHold)
  forgot.addEventListener('pointercancel', stopHold)
  forgot.addEventListener('lostpointercapture', stopHold)
  forgot.addEventListener('contextmenu', (e) => e.preventDefault())
  forgot.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
      e.preventDefault()
      startHold()
    }
  })
  forgot.addEventListener('keyup', (e) => {
    if (e.key === 'Enter' || e.key === ' ') stopHold()
  })
  forgot.addEventListener('click', () => {
    if (holdStart < 0 && mode === 'enter' && !holdHint.textContent) holdHint.textContent = c.holdHint
  })

  const layout = screenLayout({
    class: 'gate',
    title: c.title,
    back: () => ctx.back('/camp'),
    backLabel: c.back,
    narrow: true,
    body: [h('div', { class: 'gate__pad' }, pad.el), forgotWrap],
  })
  root.appendChild(layout)

  return () => {
    stopHold()
    pad.destroy()
  }
}
