/**
 * Non-blocking cards for the climb (toasts — they never pause play): "New flop unlocked!" with a
 * little moving picture of the pose, climbing-word cards (the first time a word comes up), and new
 * badges. Word bookkeeping goes through `words`, so test mode can keep it out of her record.
 */
import { audio } from '../../audio/audio'
import { sfx } from '../../audio/sfx'
import { badgeById, type BadgeId } from '../../content/badges'
import { fallPoseInfo } from '../../content/fallPoses'
import { glossary, type GlossaryWord } from '../../content/glossary'
import { renderPoseCard } from '../../game/art/poseCard'
import type { ClimberLook } from '../../storage/schema'
import { toast, type ToastHandle } from '../../ui/components'
import { h } from '../../ui/dom'
import { BADGE_ICONS, icon, type IconName } from '../../ui/icons'
import { CLIMB_COPY } from './copy'

/** Which climbing words she has met (glossarySeen, or an in-memory list in test mode). */
export interface WordBook {
  seen(): readonly string[]
  mark(word: GlossaryWord): void
}

const WORD_ICONS: Record<GlossaryWord, IconName> = {
  pitch: 'mountain',
  whipper: 'whipper',
  beta: 'beta',
  send: 'flag',
  cairn: 'cairn',
  chalk: 'pencil',
  hold: 'rope',
}

const cap = (w: string): string => w.charAt(0).toUpperCase() + w.slice(1)

/** True if the word hasn't been introduced yet. */
export function isNew(words: WordBook, word: GlossaryWord): boolean {
  return !words.seen().includes(word)
}

/**
 * The word's one-line definition as a card, the first time only. `title` replaces the word as the
 * card's title (e.g. "Pitch 3 · Daisy Steps"); the definition then starts with the word.
 */
export function wordCard(words: WordBook, word: GlossaryWord, title?: string): ToastHandle | null {
  if (!isNew(words, word)) return null
  words.mark(word)
  return definitionCard(word, title)
}

/**
 * For a word said right now (by the goat): marks it met at once — so nothing else defines it again
 * meanwhile — and queues its card. Does nothing if she has met the word before.
 */
export function introduceWord(words: WordBook, word: GlossaryWord, queue: CardQueue): void {
  if (!isNew(words, word)) return
  words.mark(word)
  queue.push(() => definitionCard(word))
}

function definitionCard(word: GlossaryWord, title?: string): ToastHandle {
  const def = glossary[word].definition
  const text = title ? `${cap(word)}: ${def.charAt(0).toLowerCase()}${def.slice(1)}` : def
  return toast(text, { title: title ?? cap(word), icon: WORD_ICONS[word], tone: 'sky' })
}

/** "New flop unlocked!" with the pose moving in a little card. `extra` adds a line under the name. */
export function flopCard(poseId: string, look: ClimberLook, extra?: string): ToastHandle {
  const info = fallPoseInfo(poseId)
  const canvas = h('canvas', { class: 'flop-toast__pose', 'aria-hidden': 'true' })
  const message = h(
    'span',
    { class: 'flop-toast__text' },
    h('span', { class: 'flop-toast__name' }, info ? info.name : CLIMB_COPY.newFlop),
    extra ? h('span', { class: 'flop-toast__extra' }, extra) : null,
  )
  const handle = toast(message, { title: CLIMB_COPY.newFlop, media: canvas, tone: 'plum', durationMs: extra ? 7000 : 5200 })
  handle.el.classList.add('toast--flop')
  // Sized once the card is in the page (the canvas takes its CSS size × DPR).
  requestAnimationFrame(() => {
    if (canvas.isConnected) renderPoseCard(canvas, poseId, look, { animate: true, fps: 24 })
  })
  sfx.chime()
  return handle
}

/**
 * The same "New flop unlocked!" news as an in-page card (the lesson shows it beside its Next button,
 * with the whipper definition and any new badge). A pose she has seen before (`isNew: false`) is
 * titled with its name instead. Returns the element and a stop() for its picture.
 */
export function flopPanel(
  poseId: string,
  look: ClimberLook,
  extra: string,
  badges: readonly BadgeId[],
  opts: { isNew?: boolean } = {},
): { el: HTMLElement; stop(): void } {
  const isNewPose = opts.isNew ?? true
  const info = fallPoseInfo(poseId)
  const canvas = h('canvas', { class: 'flop-panel__pose', 'aria-hidden': 'true' })
  const badgeRows = badges.map((id) => {
    const b = badgeById(id)
    return b ? h('span', { class: 'flop-panel__badge' }, icon(BADGE_ICONS[id] ?? 'badge', 22), CLIMB_COPY.newBadge(b.name)) : null
  })
  const el = h(
    'div',
    { class: 'flop-panel', role: 'status' },
    h('span', { class: 'flop-panel__media' }, canvas),
    h(
      'span',
      { class: 'flop-panel__text' },
      h('span', { class: 'flop-panel__title' }, isNewPose || !info ? CLIMB_COPY.newFlop : info.name),
      isNewPose && info ? h('span', { class: 'flop-panel__name' }, info.name) : null,
      h('span', { class: 'flop-panel__extra' }, extra),
      ...badgeRows,
    ),
  )
  let stop = () => undefined as void
  requestAnimationFrame(() => {
    if (canvas.isConnected) stop = renderPoseCard(canvas, poseId, look, { animate: true, fps: 24 })
  })
  sfx.chime()
  return {
    el,
    stop: () => {
      stop()
      canvas.width = 0
      canvas.height = 0
    },
  }
}

/**
 * A gentle card for a new badge. On camp screens (`place: 'bottom'`) it rises from the bottom, so
 * it never covers the goat's bubble.
 */
export function badgeCard(id: BadgeId, place: 'top' | 'bottom' = 'top'): ToastHandle | null {
  const badge = badgeById(id)
  if (!badge) return null
  if (audio.isRunning()) sfx.chime()
  return toast(badge.description, { title: CLIMB_COPY.newBadge(badge.name), icon: BADGE_ICONS[id] ?? 'badge', tone: 'sun', place })
}

/** Queue a card for each new badge. */
export function badgeCards(ids: readonly BadgeId[], queue: CardQueue): void {
  for (const id of ids) queue.push(() => badgeCard(id))
}

/**
 * Cards one after another instead of a pile: at most `maxLive()` of ours on screen at once (one on
 * a phone, upright or sideways), the next one as soon as a slot frees up (cards hide themselves, or
 * she taps them away).
 */
export class CardQueue {
  private waiting: (() => ToastHandle | null)[] = []
  private live: ToastHandle[] = []
  private timer: ReturnType<typeof setTimeout> | null = null
  private dead = false

  constructor(private readonly maxLive: () => number = () => (window.innerWidth < 600 || window.innerHeight < 500 ? 1 : 2)) {}

  push(show: () => ToastHandle | null): void {
    if (this.dead) return
    this.waiting.push(show)
    this.pump()
  }

  private pump(): void {
    this.live = this.live.filter((t) => t.el.isConnected && !t.el.classList.contains('is-out'))
    while (this.waiting.length && this.live.length < this.maxLive()) {
      const card = (this.waiting.shift() as () => ToastHandle | null)()
      if (card) this.live.push(card)
    }
    if ((this.waiting.length || this.live.length) && !this.timer && !this.dead) {
      this.timer = setTimeout(() => {
        this.timer = null
        this.pump()
      }, 250)
    }
  }

  /** Stop showing queued cards (cards already up hide on their own). */
  destroy(): void {
    this.dead = true
    this.waiting = []
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }
}
