/**
 * The persistent shell: always-visible mute toggle (top-right, safe-area aware, above every screen
 * and overlay) and a small "Test mode" pill while test mode is on. Mounted once at boot.
 */
import { audio } from '../audio/audio'
import { pressable } from '../ui/components'
import { h } from '../ui/dom'
import { icon } from '../ui/icons'

export interface ShellDeps {
  getMuted(): boolean
  setMuted(muted: boolean): void
  isTestMode(): boolean
  /** Called whenever saved state changes; returns an unsubscribe. */
  subscribe(cb: () => void): () => void
}

export interface Shell {
  setTestMode(on: boolean): void
  destroy(): void
}

export function mountShell(root: HTMLElement, deps: ShellDeps): Shell {
  const mute = h('button', { type: 'button', class: 'shell__mute', id: 'mute-toggle' })
  const pill = h('div', { class: 'shell__pill', 'aria-live': 'polite' }, 'Test mode')
  const el = h('div', { class: 'shell' }, mute, pill)

  let shownMuted: boolean | null = null
  const paintMute = () => {
    const muted = deps.getMuted()
    if (muted === shownMuted) return
    shownMuted = muted
    mute.replaceChildren(icon(muted ? 'sound-off' : 'sound-on', 30))
    mute.setAttribute('aria-label', 'Mute')
    mute.setAttribute('aria-pressed', String(muted))
    mute.classList.toggle('is-muted', muted)
  }
  const setTestMode = (on: boolean) => {
    pill.hidden = !on
  }

  pressable(mute)
  mute.addEventListener('click', () => {
    const next = !deps.getMuted()
    deps.setMuted(next)
    paintMute()
    // A soft tick once the master gain is back up, so she hears that sound is on.
    if (!next) setTimeout(() => audio.tap(), 180)
  })

  // iOS only applies :active styles when the page has a touch listener.
  const noop = () => undefined
  document.addEventListener('touchstart', noop, { passive: true })

  const unsubscribe = deps.subscribe(() => {
    paintMute()
    setTestMode(deps.isTestMode())
  })
  paintMute()
  setTestMode(deps.isTestMode())
  root.appendChild(el)

  return {
    setTestMode,
    destroy() {
      unsubscribe()
      document.removeEventListener('touchstart', noop)
      el.remove()
    },
  }
}
