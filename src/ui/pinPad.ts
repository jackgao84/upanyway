/**
 * Four-digit PIN pad for the grown-ups' gate. Its own big keys (no system keyboard), four dots,
 * a gentle shake on a wrong PIN. Digits typed on a hardware keyboard work too.
 */
import { audio } from '../audio/audio'
import { pressable } from './components'
import { h } from './dom'
import { icon } from './icons'

export interface PinPadOpts {
  title: string
  subtitle?: string
  onComplete: (pin: string) => void
  /** Message shown from the start (e.g. after a mismatch on the previous screen). */
  error?: string
  length?: number
}

export interface PinPad {
  el: HTMLElement
  /** Clear the digits and accept input again. */
  reset(): void
  /** Shake, show the message, clear the digits and accept input again. */
  error(message: string): void
  setTitle(title: string, subtitle?: string): void
  /** Remove the hardware-keyboard listener (also happens automatically once the pad leaves the page). */
  destroy(): void
}

export function pinPad(opts: PinPadOpts): PinPad {
  const length = opts.length ?? 4
  let digits = ''
  let locked = false
  let seen = false

  const title = h('h2', { class: 'pin__title' }, opts.title)
  const subtitle = h('p', { class: 'pin__subtitle' }, opts.subtitle ?? '')
  subtitle.hidden = !opts.subtitle
  const dots = h('div', { class: 'pin__dots', 'aria-hidden': 'true' })
  for (let i = 0; i < length; i++) dots.appendChild(h('span', { class: 'pin__dot' }))
  const status = h('p', { class: 'sr-only', 'aria-live': 'polite' })
  const errorLine = h('p', { class: 'pin__error', role: 'alert' }, opts.error ?? '')

  const paint = () => {
    dots.querySelectorAll('.pin__dot').forEach((d, i) => d.classList.toggle('is-filled', i < digits.length))
    status.textContent = `${digits.length} of ${length} numbers`
  }

  const press = (key: string) => {
    if (locked) return
    if (key === 'back') {
      if (!digits) return
      digits = digits.slice(0, -1)
      paint()
      return
    }
    if (digits.length >= length) return
    digits += key
    if (errorLine.textContent) errorLine.textContent = ''
    paint()
    if (digits.length === length) {
      locked = true
      const pin = digits
      setTimeout(() => opts.onComplete(pin), 160)
    }
  }

  const keyButton = (key: string, label: string, content: Node | string, extra = '') => {
    const b = h('button', { type: 'button', class: `pin__key ${extra}`.trim(), 'aria-label': label, dataset: { key } }, content)
    pressable(b)
    b.addEventListener('click', () => {
      audio.tap()
      press(key)
    })
    return b
  }

  const keys = h('div', { class: 'pin__keys' })
  for (const d of ['1', '2', '3', '4', '5', '6', '7', '8', '9']) keys.appendChild(keyButton(d, d, d))
  keys.appendChild(h('span', { class: 'pin__gap', 'aria-hidden': 'true' }))
  keys.appendChild(keyButton('0', '0', '0'))
  keys.appendChild(keyButton('back', 'Delete', icon('backspace', 30), 'pin__key--back'))

  const el = h('div', { class: 'pin' }, title, subtitle, dots, errorLine, status, keys)

  const onKey = (e: KeyboardEvent) => {
    if (el.isConnected) seen = true
    else if (seen) {
      destroy()
      return
    } else return
    const target = e.target as HTMLElement | null
    if (target && target.matches('input, textarea')) return
    if (/^[0-9]$/.test(e.key)) {
      e.preventDefault()
      press(e.key)
    } else if (e.key === 'Backspace') {
      e.preventDefault()
      press('back')
    }
  }
  document.addEventListener('keydown', onKey)

  function destroy(): void {
    document.removeEventListener('keydown', onKey)
  }

  paint()
  return {
    el,
    reset() {
      digits = ''
      locked = false
      paint()
    },
    error(message: string) {
      digits = ''
      locked = false
      paint()
      errorLine.textContent = message
      el.classList.remove('is-shaking')
      void el.offsetWidth
      el.classList.add('is-shaking')
      if (typeof navigator.vibrate === 'function') navigator.vibrate(60)
    },
    setTitle(t: string, sub?: string) {
      title.textContent = t
      subtitle.textContent = sub ?? ''
      subtitle.hidden = !sub
    },
    destroy,
  }
}
