/**
 * The Hall of Flops (#/flops), a little museum with three rooms (tabs):
 *
 * - Fall poses: the 16 whipper poses. Found ones loop their animation in her own look, with the
 *   pose's name, its silly description and how many times she's done it (tap one to watch it big).
 *   Not-found ones are soft paper silhouettes with "???": a mystery, never a gap to feel bad about.
 * - My flops: her real brave things that flopped, hung like museum paintings in gilded frames: the
 *   brave thing is the title, "What I learned: …" the caption (or "What happened: …"). Respectful,
 *   always: no jokes, no fall poses, no goat gags.
 * - Grown-ups' Wing: flops her grown-ups added in grown-up mode, framed the same way.
 *
 * Routes: #/flops, #/flops?tab=poses|mine|wing, #/flops?tab=mine&new=<braveId> (that painting gets a
 * "Just hung" ribbon and is scrolled into view). Without ?tab the room she was last in opens.
 */
import './flops/hall.css'
import { now, releaseCanvas, save } from '../app/context'
import type { Screen } from '../app/router'
import { audio } from '../audio/audio'
import { joinNames } from '../content/copy'
import { FALL_POSES, type FallPoseInfo } from '../content/fallPoses'
import { renderPoseCard } from '../game/art/poseCard'
import type { BraveThing, SaveData } from '../storage/schema'
import { emptyState, modal, pressable, screenLayout, segmented } from '../ui/components'
import { clear, Disposer, h } from '../ui/dom'
import { HALL_COPY } from './flops/copy'
import { exhibit } from './flops/exhibit'
import { dateLabel, dayPhrase, isToday } from './flops/when'
import { richText, termScope } from './flops/words'

export type HallTab = 'poses' | 'mine' | 'wing'

const TABS: readonly HallTab[] = ['poses', 'mine', 'wing']

function isTab(v: string | null): v is HallTab {
  return v !== null && (TABS as readonly string[]).includes(v)
}

/** The app path for the Hall, e.g. flopsPath({ tab: 'mine', id }) → '/flops?tab=mine&new=<id>'. */
export function flopsPath(opts: { tab?: HallTab; id?: string } = {}): string {
  const q: string[] = []
  if (opts.tab) q.push(`tab=${opts.tab}`)
  if (opts.id) q.push(`new=${encodeURIComponent(opts.id)}`)
  return q.length ? `/flops?${q.join('&')}` : '/flops'
}

/** Her flopped brave things, newest first. */
export function hallFlops(d: SaveData): BraveThing[] {
  return d.brave
    .filter((b) => b.status === 'done' && b.outcome === 'flopped')
    .sort((a, b) => (Date.parse(b.doneAt ?? b.createdAt) || 0) - (Date.parse(a.doneAt ?? a.createdAt) || 0))
}

/** The room she was last in (this session). */
let lastTab: HallTab = 'poses'

/** A tap handler with the kit's double-tap guard and click sound. */
function onTap(el: HTMLElement, fn: () => void): void {
  let last = -Infinity
  pressable(el)
  el.addEventListener('click', () => {
    const t = performance.now()
    if (t - last < 380) return
    last = t
    audio.tap()
    fn()
  })
}

export const flopsScreen: Screen = (root, ctx) => {
  const c = HALL_COPY
  const asked = ctx.query.get('tab')
  const highlight = ctx.query.get('new') ?? ''
  let tab: HallTab = isTab(asked) ? asked : highlight ? 'mine' : lastTab
  let room = new Disposer()
  const panel = h('div', { class: 'hall__panel' })

  const tabs = segmented<HallTab>({
    options: [
      { value: 'poses', label: c.tabs.poses },
      { value: 'mine', label: c.tabs.mine },
      { value: 'wing', label: c.tabs.wing },
    ],
    value: tab,
    ariaLabel: c.tabsLabel,
    onChange: (v) => show(v, true),
  })
  tabs.classList.add('hall__tabs')

  root.appendChild(
    screenLayout({
      class: 'hall',
      title: c.title,
      back: () => ctx.back('/camp'),
      backLabel: c.back,
      top: tabs,
      tone: 'plum',
      body: [panel],
    }),
  )

  function show(next: HallTab, userPicked: boolean): void {
    room.dispose()
    room = new Disposer()
    clear(panel)
    tab = next
    lastTab = next
    panel.dataset.tab = next
    const d = save()
    if (next === 'poses') posesRoom(panel, room, d)
    else if (next === 'mine') mineRoom(panel, d, userPicked ? '' : highlight)
    else wingRoom(panel, d)
    if (userPicked) root.scrollTop = 0
  }

  show(tab, false)
  if (highlight && tab === 'mine') {
    const el = panel.querySelector<HTMLElement>(`[data-id="${CSS.escape(highlight)}"]`)
    if (el) requestAnimationFrame(() => el.scrollIntoView({ block: 'center' }))
  }

  return () => room.dispose()
}

// ---------------------------------------------------------------------------------------------
// Fall poses

function posesRoom(panel: HTMLElement, room: Disposer, d: SaveData): void {
  const c = HALL_COPY.poses
  const look = d.profile.look
  const today = now()
  const total = FALL_POSES.length
  const foundCount = FALL_POSES.filter((p) => d.poses[p.id]).length

  const tally = h(
    'div',
    { class: 'hall__tally', role: 'img', 'aria-label': c.found(foundCount, total) },
    ...FALL_POSES.map((p) => h('span', { class: 'hall__tally-dot' + (d.poses[p.id] ? ' is-found' : '') })),
  )
  const intro = h(
    'div',
    { class: 'hall__intro' },
    h('p', { class: 'hall__lead' }, ...richText(c.intro, termScope())),
    h(
      'div',
      { class: 'hall__count' },
      h('span', { class: 'hall__count-text' }, foundCount === total ? c.allFound(total) : c.found(foundCount, total)),
      tally,
    ),
  )

  const grid = h('div', { class: 'pose-grid' })
  const paint: (() => void)[] = []
  for (const p of FALL_POSES) {
    const rec = d.poses[p.id]
    const canvas = h('canvas', { class: 'pose-card__canvas', 'aria-hidden': 'true' })
    if (rec) {
      const fresh = isToday(rec.firstAt, today)
      const card = h(
        'button',
        { type: 'button', class: 'pose-card is-found', 'aria-label': c.open(p.name) },
        h('span', { class: 'pose-card__pic' }, canvas, fresh ? h('span', { class: 'pose-card__new' }, c.newToday) : null),
        h(
          'span',
          { class: 'pose-card__words' },
          h('span', { class: 'pose-card__name' }, p.name),
          h('span', { class: 'pose-card__text' }, p.description),
          h('span', { class: 'pose-card__times' }, c.times(Math.max(1, rec.count))),
        ),
      )
      onTap(card, () => openPose(p, d))
      grid.appendChild(card)
      paint.push(() => room.add(renderPoseCard(canvas, p.id, look, { animate: true, fps: 24 })))
    } else {
      grid.appendChild(
        h(
          'div',
          { class: 'pose-card is-mystery', role: 'img', 'aria-label': c.mysteryLabel },
          h('span', { class: 'pose-card__pic' }, canvas),
          h(
            'span',
            { class: 'pose-card__words', 'aria-hidden': 'true' },
            h('span', { class: 'pose-card__name' }, c.mysteryName),
            h('span', { class: 'pose-card__text' }, c.mysteryText),
          ),
        ),
      )
      paint.push(() => room.add(renderPoseCard(canvas, p.id, look, { silhouette: true, goat: true })))
    }
    room.add(() => releaseCanvas(canvas))
  }
  panel.append(intro, grid)
  // Canvases size themselves from their laid-out size, so draw once they're on the page.
  for (const fn of paint) fn()
}

function openPose(p: FallPoseInfo, d: SaveData): void {
  const c = HALL_COPY.poses
  const rec = d.poses[p.id]
  if (!rec) return
  const canvas = h('canvas', { class: 'pose-modal__canvas', 'aria-hidden': 'true' })
  const when = dayPhrase(rec.firstAt, now())
  let stop: (() => void) | null = null
  modal({
    title: p.name,
    tone: 'plum',
    class: 'pose-modal',
    dismissible: true,
    art: h('div', { class: 'pose-modal__pic' }, canvas),
    body: [
      h('p', { class: 'pose-modal__text' }, p.description),
      h(
        'p',
        { class: 'pose-modal__facts' },
        c.count(Math.max(1, rec.count)),
        when ? h('br') : null,
        when ? c.firstFound(when) : null,
      ),
    ],
    actions: [{ label: c.close, variant: 'secondary' }],
    onClose: () => {
      stop?.()
      // Let the closing fade finish before the picture goes blank.
      setTimeout(() => releaseCanvas(canvas), 300)
    },
  })
  stop = renderPoseCard(canvas, p.id, d.profile.look, { animate: true, fps: 30 })
}

// ---------------------------------------------------------------------------------------------
// My flops

/** A small empty gilded frame, for the empty walls. */
function emptyFrame(): HTMLElement {
  return h('span', { class: 'hall__empty-frame', 'aria-hidden': 'true' }, h('span', { class: 'hall__empty-mat' }))
}

function mineRoom(panel: HTMLElement, d: SaveData, highlight: string): void {
  const c = HALL_COPY.mine
  const flops = hallFlops(d)
  if (!flops.length) {
    panel.appendChild(h('div', { class: 'hall__wall hall__wall--empty' }, emptyState({ icon: emptyFrame(), title: c.emptyTitle, text: c.emptyText })))
    return
  }
  const today = now()
  panel.append(
    h('p', { class: 'hall__lead hall__lead--wall' }, c.intro),
    h(
      'div',
      { class: 'hall__wall' },
      ...flops.map((b) => {
        const learned = (b.learned ?? '').trim()
        const happened = (b.whatHappened ?? '').trim()
        const date = dateLabel(b.doneAt ?? b.createdAt, today)
        return exhibit({
          id: b.id,
          seed: b.id,
          title: b.text,
          date: date ? c.tried(date) : undefined,
          captionLabel: learned ? c.learned : c.happened,
          caption: learned || happened || undefined,
          ribbon: highlight === b.id ? c.justHung : undefined,
        })
      }),
    ),
  )
}

// ---------------------------------------------------------------------------------------------
// Grown-ups' Wing

function wingRoom(panel: HTMLElement, d: SaveData): void {
  const c = HALL_COPY.wing
  const flops = [...d.grownupFlops].sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0))
  if (!flops.length) {
    const names = joinNames(d.parent.names) || c.namesFallback
    panel.appendChild(
      h('div', { class: 'hall__wall hall__wall--wing hall__wall--empty' }, emptyState({ icon: emptyFrame(), title: c.emptyTitle, text: c.emptyText(names) })),
    )
    return
  }
  const whos: string[] = []
  for (const f of flops) {
    const who = f.who.trim()
    if (who && !whos.includes(who)) whos.push(who)
  }
  panel.append(
    h('p', { class: 'hall__lead hall__lead--wall' }, c.intro(joinNames(whos) || c.namesFallback)),
    h(
      'div',
      { class: 'hall__wall hall__wall--wing' },
      ...flops.map((f) =>
        exhibit({
          id: f.id,
          seed: f.id,
          title: f.what,
          artist: f.who.trim() ? c.by(f.who.trim()) : undefined,
          captionLabel: c.learned,
          caption: f.learned.trim() || undefined,
        }),
      ),
    ),
  )
}
