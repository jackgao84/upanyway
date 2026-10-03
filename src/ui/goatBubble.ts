/**
 * The goat's speech bubble. Every goat line is spoken by the goat (its little face beside the
 * bubble, its name on top), never by a narrator. Tap the bubble to dismiss it.
 *
 * The avatar comes from the art code: pass `avatar: () => element` (e.g. a small canvas of the goat
 * peeking out of the backpack). If that element has `setMood(mood)`, the bubble calls it on each line;
 * if it has `destroy()`, the bubble's destroy() calls it.
 * Without a factory, a drawn goat-face icon is used.
 */
import { h } from './dom'
import { icon } from './icons'

export type GoatMood = 'calm' | 'happy' | 'scared' | 'giggly' | 'wobbly'

export type GoatAvatar = HTMLElement & { setMood?: (mood: GoatMood) => void; destroy?: () => void }

export interface GoatBubbleOpts {
  avatar?: () => GoatAvatar
  /** The goat's name, shown as a small tag on the bubble. */
  name?: string
  /** 'float' pins it bottom-left above the safe area (climb HUD); 'inline' flows in the page. */
  placement?: 'inline' | 'float'
  /** false = never catches taps (touches pass through to the climb canvas). Default true: tap hides it. */
  tapToHide?: boolean
}

export interface SayOpts {
  /** How long the line stays. Default: by length (≈ 3–7 s). 0 = until hide(). */
  durationMs?: number
  mood?: GoatMood
}

export interface GoatBubble {
  el: HTMLElement
  say(text: string, opts?: SayOpts): void
  hide(): void
  setName(name: string): void
  isShowing(): boolean
  /** Stop timers and the avatar's animation (call on unmount). */
  destroy(): void
}

export function goatBubble(opts: GoatBubbleOpts = {}): GoatBubble {
  const avatar: GoatAvatar = opts.avatar ? opts.avatar() : (h('span', { class: 'goat-face' }, icon('goat', 60)) as GoatAvatar)
  const nameTag = h('span', { class: 'goat-bubble__name' }, opts.name ?? '')
  nameTag.hidden = !opts.name
  const text = h('span', { class: 'goat-bubble__text' })
  const bubble = h('div', { class: 'goat-bubble__bubble', role: 'status', 'aria-live': 'polite' }, nameTag, text)
  const el = h(
    'div',
    {
      class: `goat-bubble goat-bubble--${opts.placement ?? 'inline'}${opts.tapToHide === false ? ' goat-bubble--passive' : ''}`,
      dataset: { mood: 'calm' },
    },
    h('div', { class: 'goat-bubble__avatar', 'aria-hidden': 'true' }, avatar),
    bubble,
  )
  let timer: ReturnType<typeof setTimeout> | null = null
  let showing = false

  const clearTimer = () => {
    if (timer) clearTimeout(timer)
    timer = null
  }

  function hide(): void {
    clearTimer()
    if (!showing) return
    showing = false
    el.classList.remove('is-showing')
  }

  function say(line: string, sayOpts: SayOpts = {}): void {
    clearTimer()
    const mood = sayOpts.mood ?? 'calm'
    el.dataset.mood = mood
    avatar.setMood?.(mood)
    text.textContent = line
    // Restart the pop animation for every new line.
    el.classList.remove('is-showing', 'is-new')
    void el.offsetWidth
    el.classList.add('is-showing', 'is-new')
    showing = true
    const duration = sayOpts.durationMs ?? Math.min(7000, Math.max(3000, 1600 + line.length * 60))
    if (duration > 0) timer = setTimeout(hide, duration)
  }

  if (opts.tapToHide !== false) bubble.addEventListener('click', hide)

  return {
    el,
    say,
    hide,
    setName(name: string) {
      nameTag.textContent = name
      nameTag.hidden = !name
    },
    isShowing: () => showing,
    destroy() {
      clearTimer()
      avatar.destroy?.()
    },
  }
}
