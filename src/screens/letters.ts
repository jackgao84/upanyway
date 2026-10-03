/**
 * Letters (#/letters): "Spotted!" notes her grown-ups write in grown-up mode.
 *
 * Unopened letters are sealed envelopes. Tapping one opens it right away in the save
 * (openLetter: its bonus stone goes on the cairn if today's letter stone is still free — one a day —
 * otherwise it waits for a later day), then plays a short opening: the wax seal pops, the flap
 * lifts, the note rises out and unfolds. Tap to skip; Reduce Motion shows the note at once.
 * The note says where its stone went, warmly, and offers the cairn (#/cairn?new=<placed ids>,<id>:
 * older stones it placed hop on, then its own stone lands on the pile or on the waiting spot).
 * Opened letters stay below as notes she can read again.
 */
import './flops/letters.css'
import { now, save, update } from '../app/context'
import type { Screen } from '../app/router'
import { audio } from '../audio/audio'
import { sfx } from '../audio/sfx'
import { joinNames } from '../content/copy'
import { openLetter } from '../model/stones'
import type { Letter } from '../storage/schema'
import { button, emptyState, modal, pressable, screenLayout, toast, type OverlayHandle } from '../ui/components'
import { clear, h, prefersReducedMotion } from '../ui/dom'
import { icon } from '../ui/icons'
import { LETTERS_COPY } from './flops/copy'
import { dayPhrase } from './flops/when'
import { noteArrivals } from './log/events'

const c = LETTERS_COPY

/** Opening beats (ms after the tap): seal pops, flap lifts, note rises, note shows. */
const BEATS = { unseal: 260, flap: 560, rise: 980, read: 1750 }

/** Who wrote it (a letter saved without a name still reads naturally). */
function who(l: Letter): string {
  return l.from.trim() || c.whoFallback
}

function byTime(iso: string | undefined): number {
  return iso ? Date.parse(iso) || 0 : 0
}

function tapGuard(el: HTMLElement, fn: () => void): void {
  let last = -Infinity
  pressable(el)
  el.addEventListener('click', () => {
    const t = performance.now()
    if (t - last < 500) return
    last = t
    audio.tap()
    fn()
  })
}

/** The note itself: "Spotted!", her grown-up's words, and who it's from. */
function noteCard(l: Letter): HTMLElement {
  return h(
    'article',
    { class: 'note letter-note' },
    h('span', { class: 'letter-note__stamp' }, c.spotted),
    h('p', { class: 'note__text letter-note__text' }, l.text),
    h('p', { class: 'letter-note__sign' }, '— ', c.signoff(who(l))),
  )
}

export const lettersScreen: Screen = (root, ctx) => {
  const list = h('div', { class: 'letters' })
  let alive = true
  let overlay: OverlayHandle | null = null
  const timers: ReturnType<typeof setTimeout>[] = []

  root.appendChild(
    screenLayout({
      class: 'letters-screen',
      title: c.title,
      back: () => ctx.back('/camp'),
      backLabel: c.back,
      tone: 'sun',
      body: [list],
    }),
  )

  function render(): void {
    if (!alive) return
    clear(list)
    const d = save()
    const today = now()
    const names = joinNames(d.parent.names) || c.namesFallback
    if (!d.letters.length) {
      list.appendChild(emptyState({ icon: envelopeArt(), title: c.emptyTitle, text: c.emptyText(names) }))
      return
    }
    const sealed = d.letters.filter((l) => !l.openedAt).sort((a, b) => byTime(a.createdAt) - byTime(b.createdAt))
    const read = d.letters.filter((l) => l.openedAt).sort((a, b) => byTime(b.openedAt) - byTime(a.openedAt))

    if (sealed.length) {
      list.appendChild(
        h(
          'section',
          { class: 'letters__section' },
          h(
            'div',
            { class: 'letters__head' },
            h('h2', { class: 'letters__title' }, c.newTitle(sealed.length)),
            h('span', { class: 'letters__count' }, c.newCount(sealed.length)),
          ),
          h(
            'div',
            { class: 'letters__envelopes' },
            ...sealed.map((l, i) => {
              const when = dayPhrase(l.createdAt, today)
              const el = h(
                'button',
                {
                  type: 'button',
                  class: 'envelope',
                  'aria-label': c.envelopeLabel(who(l)),
                  style: `--tilt: ${i % 2 ? 1.2 : -1}deg; --delay: ${Math.min(i, 6) * 70}ms`,
                },
                h(
                  'span',
                  { class: 'envelope__body' },
                  ...envelopeParts(),
                  h('span', { class: 'envelope__seal', 'aria-hidden': 'true' }, icon('heart', 24)),
                  h(
                    'span',
                    { class: 'envelope__address' },
                    h('span', { class: 'envelope__from' }, c.from(who(l))),
                    when ? h('span', { class: 'envelope__when' }, c.arrived(when)) : null,
                  ),
                ),
                h('span', { class: 'envelope__tap', 'aria-hidden': 'true' }, c.tapToOpen),
              )
              tapGuard(el, () => openSealed(l.id))
              return el
            }),
          ),
        ),
      )
    } else {
      list.appendChild(h('p', { class: 'letters__all-read' }, icon('letter', 28), h('span', null, c.allRead)))
    }

    if (read.length) {
      list.appendChild(
        h(
          'section',
          { class: 'letters__section' },
          h('div', { class: 'letters__head' }, h('h2', { class: 'letters__title' }, c.readTitle)),
          h(
            'div',
            { class: 'letters__read' },
            ...read.map((l) => {
              const when = dayPhrase(l.createdAt, today)
              const el = h(
                'button',
                { type: 'button', class: 'letter-card', 'aria-label': c.readLabel(who(l)) },
                h('span', { class: 'letter-card__top' }, h('span', { class: 'letter-card__spotted' }, c.spotted), when ? h('span', { class: 'letter-card__when' }, when) : null),
                h('span', { class: 'letter-card__text' }, l.text),
                h('span', { class: 'letter-card__from' }, '— ', c.signoff(who(l))),
              )
              tapGuard(el, () => reread(l.id))
              return el
            }),
          ),
        ),
      )
    }
  }

  /** Open a sealed letter: save first (the stone is settled now), then the little show. */
  function openSealed(id: string): void {
    if (overlay) return
    let res = { placed: false, waitingPlaced: [] as string[] }
    update((d) => {
      res = openLetter(d, id, now())
    })
    const d = save()
    const letter = d.letters.find((l) => l.id === id)
    if (!letter) return
    const lettersWaiting = d.letters.filter((l) => l.openedAt && !l.stoneDay).length
    // Older waiting stones it placed hop on first, then the letter's own stone (onto the pile, or onto
    // the waiting spot when today's letter stone is used): at the next cairn visit, however she goes.
    const arrivals = [...res.waitingPlaced, letter.id]
    noteArrivals(arrivals)
    const stoneLine = res.placed ? c.stonePlaced : lettersWaiting > 1 ? c.stoneLater : c.stoneTomorrow
    const extra = res.waitingPlaced.length

    const view = h('div', { class: 'letter-view' })
    const stage = openingStage(letter)
    let shown = false
    const showNote = () => {
      if (shown) return
      shown = true
      timers.splice(0).forEach(clearTimeout)
      clear(view)
      view.appendChild(
        h(
          'div',
          { class: 'letter-read' },
          noteCard(letter),
          h(
            'p',
            { class: 'letter-read__stone' + (res.placed ? ' is-placed' : '') },
            h('span', { class: 'letter-read__stone-art' }, icon('stone', 30)),
            h('span', null, stoneLine),
          ),
          h(
            'div',
            { class: 'letter-read__actions' },
            button(c.seeCairn, {
              icon: 'cairn',
              size: 'big',
              onClick: () => ctx.navigate(`/cairn?new=${arrivals.map(encodeURIComponent).join(',')}`),
            }),
            button(c.backToLetters, { variant: 'secondary', size: 'big', onClick: () => overlay?.close() }),
          ),
        ),
      )
      sfx.chime()
      if (extra) toast(c.waitingToo(extra), { icon: 'cairn', tone: 'leaf' })
    }

    if (prefersReducedMotion()) {
      overlay = letterModal(view, c.noteLabel(who(letter)))
      showNote()
      return
    }
    view.appendChild(stage)
    overlay = letterModal(view, c.noteLabel(who(letter)))
    stage.addEventListener('click', showNote)
    timers.push(
      setTimeout(() => {
        stage.classList.add('is-unsealed')
        sfx.reveal()
      }, BEATS.unseal),
      setTimeout(() => stage.classList.add('is-open'), BEATS.flap),
      setTimeout(() => stage.classList.add('is-rising'), BEATS.rise),
      setTimeout(showNote, BEATS.read),
    )
  }

  function reread(id: string): void {
    if (overlay) return
    const letter = save().letters.find((l) => l.id === id)
    if (!letter) return
    const view = h(
      'div',
      { class: 'letter-view' },
      h(
        'div',
        { class: 'letter-read' },
        noteCard(letter),
        h(
          'div',
          { class: 'letter-read__actions' },
          button(c.backToLetters, { variant: 'secondary', size: 'big', onClick: () => overlay?.close() }),
        ),
      ),
    )
    overlay = letterModal(view, c.noteLabel(who(letter)))
  }

  function letterModal(view: HTMLElement, label: string): OverlayHandle {
    const handle = modal({
      class: 'letter-modal',
      tone: 'sun',
      dismissible: true,
      body: view,
      onClose: () => {
        timers.splice(0).forEach(clearTimeout)
        overlay = null
        render()
      },
    })
    // No visible title (the note is the picture), so name the dialog for screen readers.
    handle.el.setAttribute('aria-label', label)
    return handle
  }

  render()

  return () => {
    alive = false
    timers.splice(0).forEach(clearTimeout)
    overlay?.close()
  }
}

/** The envelope that opens in the dialog: back, the note inside, front pocket, flap and seal. */
function openingStage(l: Letter): HTMLElement {
  return h(
    'div',
    { class: 'letter-stage', role: 'img', 'aria-label': c.envelopeLabel(who(l)) },
    h(
      'div',
      { class: 'letter-stage__env' },
      envelopeBack('letter-stage__back'),
      h(
        'span',
        { class: 'letter-stage__paper' },
        h('span', { class: 'letter-stage__paper-title' }, c.spotted),
        h('span', { class: 'letter-stage__paper-lines' }),
      ),
      envelopeFront('letter-stage__front'),
      envelopeFlap('letter-stage__flap'),
      h('span', { class: 'letter-stage__seal' }, icon('heart', 30)),
      h('span', { class: 'letter-stage__from' }, c.from(who(l))),
    ),
    h('p', { class: 'letter-stage__skip' }, c.skip),
  )
}

// ---------------------------------------------------------------------------------------------
// The envelope, drawn in code: three layers (inside, front pocket, flap) so the flap can lift
// and the note can rise out between them.

const PAPER_BACK = '#efd2a4'
const PAPER_FRONT = '#fbe8c8'
const PAPER_FLAP = '#f7ddb3'
const FOLD = '#e2bf8b'

function svgEl(cls: string, viewBox: string, markup: string): SVGSVGElement {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  el.setAttribute('viewBox', viewBox)
  el.setAttribute('preserveAspectRatio', 'none')
  el.setAttribute('aria-hidden', 'true')
  el.setAttribute('focusable', 'false')
  el.setAttribute('class', cls)
  el.innerHTML = markup
  return el
}

function envelopeBack(cls: string): SVGSVGElement {
  return svgEl(cls, '0 0 300 200', `<rect x="1" y="1" width="298" height="198" rx="14" fill="${PAPER_BACK}"/>`)
}

function envelopeFront(cls: string): SVGSVGElement {
  return svgEl(
    cls,
    '0 0 300 200',
    `<path d="M1 30 L150 124 L299 30 V185 Q299 199 285 199 H15 Q1 199 1 185 Z" fill="${PAPER_FRONT}"/>` +
      `<path d="M6 194 L124 112 M294 194 L176 112" fill="none" stroke="${FOLD}" stroke-width="2.2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>` +
      `<path d="M1 30 L150 124 L299 30" fill="none" stroke="${FOLD}" stroke-width="2.2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`,
  )
}

function envelopeFlap(cls: string): SVGSVGElement {
  return svgEl(
    cls,
    '0 0 300 124',
    `<path d="M1 15 Q1 1 15 1 H285 Q299 1 299 15 L160 117 Q150 124 140 117 Z" fill="${PAPER_FLAP}" stroke="${FOLD}" stroke-width="2.2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`,
  )
}

/** A closed envelope's layers (for the list and the empty state). */
function envelopeParts(): SVGSVGElement[] {
  return [envelopeBack('envelope__back'), envelopeFront('envelope__front'), envelopeFlap('envelope__flap')]
}

/** A small closed envelope for the empty state. */
function envelopeArt(): HTMLElement {
  return h(
    'span',
    { class: 'envelope-art', 'aria-hidden': 'true' },
    ...envelopeParts(),
    h('span', { class: 'envelope__seal' }, icon('heart', 16)),
  )
}
