/**
 * The climb's blocking cards (the session is frozen while one is open): the one-tap Fear Forecast,
 * "How scary was it really?" with its one-line comparison, the sunset card and the hidden-trail card.
 * Each is an in-DOM modal (never window.confirm); the goat says its line inside the card.
 */
import { goatAvatar } from '../../app/context'
import type { SpokenLine } from '../../model/goatVoice'
import type { ClimberLook } from '../../storage/schema'
import { modal, type OverlayHandle } from '../../ui/components'
import { h } from '../../ui/dom'
import { fearScale } from '../../ui/fearScale'
import { goatBubble, type GoatBubble } from '../../ui/goatBubble'
import { icon, weatherIcon, weatherTint } from '../../ui/icons'
import { CLIMB_COPY } from './copy'
import { sunDial } from './sun'

export interface GoatInfo {
  look: ClimberLook
  name: string
}

export interface Prompt {
  close(): void
}

/** The goat saying one line inside a card. */
function goatSays(goat: GoatInfo, line: SpokenLine): GoatBubble {
  const b = goatBubble({ avatar: () => goatAvatar(goat.look), name: goat.name, tapToHide: false })
  b.say(line.text, { mood: line.mood, durationMs: 0 })
  return b
}

/** One tap on the weather scale answers it. */
export function forecastPrompt(goat: GoatInfo, line: SpokenLine, onPick: (n: number) => void): Prompt {
  const c = CLIMB_COPY.forecast
  const bubble = goatSays(goat, line)
  let picked = false
  let closed = false
  let handle: OverlayHandle | null = null
  const scale = fearScale({
    label: c.label,
    onPick: (n) => {
      if (picked) return
      picked = true
      // A beat to see the tile light up (unless the card was closed meanwhile: the screen went away).
      setTimeout(() => {
        if (closed) return
        handle?.close()
        onPick(n)
      }, 260)
    },
  })
  handle = modal({
    title: c.title,
    body: [h('div', { class: 'climb-prompt__goat' }, bubble.el), h('p', { class: 'climb-prompt__sub' }, c.sub), scale],
    dismissible: false,
    class: 'climb-prompt climb-prompt--fear',
    onClose: () => bubble.destroy(),
  })
  return {
    close: () => {
      closed = true
      handle?.close()
    },
  }
}

/**
 * "How scary was it really?" → the one-line comparison ("Forecast 7. Really 2.") → Keep climbing.
 * `forecast` null (a replay with no forecast on record) skips the comparison line.
 */
export function reallyPrompt(goat: GoatInfo, line: SpokenLine, forecast: number | null, onPick: (n: number) => void, onDone: () => void): Prompt {
  const c = CLIMB_COPY.really
  const bubble = goatSays(goat, line)
  let picked = false
  let closed = false
  let second: OverlayHandle | null = null
  let first: OverlayHandle | null = null
  const scale = fearScale({
    label: c.label,
    onPick: (n) => {
      if (picked) return
      picked = true
      onPick(n)
      setTimeout(() => {
        // Closed meanwhile (the screen went away): open nothing on the next screen.
        if (closed) return
        first?.close()
        if (forecast === null) {
          onDone()
          return
        }
        second = modal({
          title: c.compare(forecast, n),
          body: [],
          art: compareArt(forecast, n),
          dismissible: false,
          class: 'climb-prompt climb-prompt--compare',
          actions: [{ label: c.go, onClick: () => undefined }],
          onClose: onDone,
        })
      }, 260)
    },
  })
  first = modal({
    title: c.title,
    body: [h('div', { class: 'climb-prompt__goat' }, bubble.el), scale],
    dismissible: false,
    class: 'climb-prompt climb-prompt--fear',
    onClose: () => bubble.destroy(),
  })
  return {
    close: () => {
      closed = true
      first?.close()
      second?.close()
    },
  }
}

/** Two little weather pictures side by side: the forecast, then how it really was. */
function compareArt(forecast: number, really: number): HTMLElement {
  const tile = (n: number, cls: string) =>
    h(
      'span',
      { class: `climb-compare__tile ${cls}`, style: { background: weatherTint(n) } },
      weatherIcon(n, 44),
      h('span', { class: 'climb-compare__num' }, String(n)),
    )
  return h(
    'div',
    { class: 'climb-compare', 'aria-hidden': 'true' },
    tile(forecast, 'is-forecast'),
    h('span', { class: 'climb-compare__arrow' }, icon('next', 28)),
    tile(really, 'is-really'),
  )
}

/** The day's climbing time is up: the goat's sunset line, then back to camp. */
export function sunsetPrompt(goat: GoatInfo, line: SpokenLine, onCamp: () => void): Prompt {
  const bubble = goatSays(goat, line)
  const sun = sunDial()
  sun.set(0.8)
  sun.el.classList.add('climb-sun--big')
  const handle = modal({
    body: [h('div', { class: 'climb-prompt__goat' }, bubble.el)],
    art: sun.el,
    dismissible: false,
    class: 'climb-prompt climb-prompt--sunset',
    actions: [{ label: CLIMB_COPY.sunset.camp, icon: 'tent', onClick: onCamp }],
    onClose: () => bubble.destroy(),
  })
  return { close: () => handle.close() }
}

/** A pitch that isn't open yet (typed URL): the trail is hidden; back to camp. */
export function lockedPrompt(onCamp: () => void): Prompt {
  const c = CLIMB_COPY.locked
  const handle = modal({
    title: c.title,
    body: [h('p', { class: 'climb-prompt__sub' }, c.text)],
    art: 'cairn',
    dismissible: false,
    class: 'climb-prompt',
    actions: [{ label: c.camp, icon: 'tent', onClick: onCamp }],
  })
  return { close: () => handle.close() }
}
