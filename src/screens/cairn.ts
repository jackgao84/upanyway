/**
 * The Cairn (#/cairn[?new=<id>[,<id>…]]): her stones stacked on a grassy hilltop.
 *
 * - On entry, waiting stones that fit today go on (placeWaitingStones, like camp) and hop over
 *   from beside the pile. Stones named in ?new=, or noted by camp or a letter since the last visit
 *   (log/events.ts noteArrivals), arrive too, one after another: a brand-new stone
 *   drops in with a squash, dust and a clack; one that waited (earned on an earlier day) hops over;
 *   one over today's cap drops onto the waiting spot beside the pile.
 * - Each arrival plays once per session: a re-visit of the same URL shows the stone in place.
 * - Tap any stone to read it back (cairn/story.ts). Waiting stones glow softly beside the pile.
 * - Under the picture: the goat (stoneAdded, naming the brave thing that just went on / stoneWaiting /
 *   a quiet visit line), how many stones and what they have opened ("The trail is open to Pitch 5."),
 *   or, while a pitch below still needs climbing, how far they reach ("Your stones have found the
 *   way to Pitch 5. Climb on to get there."). No comparisons, no streaks, nothing about fear numbers.
 * - After the summit, a stone that lands brings something new to camp: a small toast says what.
 */
import './cairn/cairn.css'
import { goatAvatar, markWordSeen, now, save, update } from '../app/context'
import type { Screen } from '../app/router'
import { goatVoice, scriptedLine, type SpokenLine } from '../model/goatVoice'
import { placeWaitingStones, waitingStones } from '../model/stones'
import { unlockedItems, type UnlockedItem } from '../model/unlockables'
import { button, screenLayout, toast, type OverlayHandle } from '../ui/components'
import { append, clear, h, type Child } from '../ui/dom'
import { icon } from '../ui/icons'
import { goatBubble } from '../ui/goatBubble'
import { isNewWord, term } from '../ui/term'
import { CAIRN_COPY } from './cairn/copy'
import { cairnStones, didWait, sameTrailLine, stoneRecord, trailLine, waitingBefore, waitingWhen } from './cairn/data'
import { cairnScene } from './cairn/scene'
import { openStoneStory } from './cairn/story'
import { releaseHeldBadges, takeArrivals } from './log/events'

const c = CAIRN_COPY

/** Stones whose arrival has already played this session. */
const arrived = new Set<string>()
/** At most this many stones arrive one by one (an import or a long gap: the rest are just there). */
const MAX_ARRIVALS = 8

/** "?new=a,b" → ['a', 'b'] (also accepts the parameter more than once). */
function requestedIds(query: URLSearchParams): string[] {
  const out: string[] = []
  for (const v of query.getAll('new')) {
    for (const id of v.split(',')) {
      const t = id.trim()
      if (t && !out.includes(t)) out.push(t)
    }
  }
  return out
}

export const cairnScreen: Screen = (root, ctx) => {
  const t = now()
  // Stones that went on elsewhere since the last visit (camp, a letter) arrive too, as do ?new= ones.
  const requested = [...new Set([...takeArrivals(), ...requestedIds(ctx.query)])]
  let placedNow: string[] = []
  if (waitingStones(save()).length) {
    update((draft) => {
      placedNow = placeWaitingStones(draft, t)
    })
  }

  const d = save()
  const { placed, waiting } = cairnStones(d)
  const order = new Map<string, number>()
  placed.forEach((s, i) => order.set(s.id, i))
  waiting.forEach((s, i) => order.set(s.id, placed.length + i))
  const onPile = (id: string) => order.has(id) && (order.get(id) as number) < placed.length

  // ----------------------------------------------------------------- what arrives
  const fresh = [...new Set([...placedNow, ...requested])]
    .filter((id) => order.has(id) && !arrived.has(id))
    .sort((a, b) => (order.get(a) as number) - (order.get(b) as number))
    .slice(-MAX_ARRIVALS)
  for (const id of fresh) arrived.add(id)
  const hopIds: string[] = []
  const dropIds: string[] = []
  for (const id of fresh) {
    const rec = stoneRecord(d, id)
    if (onPile(id) && rec && (placedNow.includes(id) || didWait(rec))) hopIds.push(id)
    else dropIds.push(id)
  }
  const newWaitIds = requested.filter((id) => fresh.includes(id) && !onPile(id))
  const newWaits = newWaitIds.length > 0
  // Only promise "tomorrow" when every new waiting stone really goes on tomorrow (3 a day, oldest first).
  const waitsTillTomorrow = newWaitIds.every((id) => waitingWhen(d, id) === 'tomorrow')
  const newOnPile = fresh.some(onPile)

  // After the summit each stone brings something new to camp.
  const unlocks = new Map<string, UnlockedItem>()
  if (!d.testMode) for (const u of unlockedItems(d)) if (u.stoneId) unlocks.set(u.stoneId, u)

  // ----------------------------------------------------------------- the picture
  let story: OverlayHandle | null = null
  const scene = cairnScene({
    placed,
    waiting,
    dropIds,
    hopIds,
    waitingBefore: hopIds.length ? waitingBefore(d, hopIds, waiting) : undefined,
    ariaLabel: c.sceneLabel(placed.length),
    onTap: (id) => {
      story?.close()
      story = openStoneStory(id, {
        onClose: () => {
          story = null
        },
      })
    },
    onLanded: (id, where) => {
      if (where === 'pile') countUp()
      const item = where === 'pile' ? unlocks.get(id) : undefined
      if (item) {
        toast(item.kind === 'gear' ? c.unlockGear(item.name) : c.unlockDecoration(item.name), {
          title: c.unlockTitle,
          icon: item.kind === 'gear' ? 'wardrobe' : 'tent',
          tone: 'sun',
          place: 'bottom',
        })
      }
    },
    onSettled: () => {
      if (fresh.length) speak()
      // Badges from the brave thing that just went on show once its stone has landed.
      releaseHeldBadges()
    },
  })

  // ----------------------------------------------------------------- the goat
  /** The brave thing of the newest stone that just went on the pile, so the goat names that try. */
  function newestThing(): string | undefined {
    for (let i = fresh.length - 1; i >= 0; i--) {
      if (!onPile(fresh[i])) continue
      const rec = stoneRecord(d, fresh[i])
      return rec && 'status' in rec ? rec.text : undefined
    }
    return undefined
  }

  // Like camp: the goat sits in the backpack beside her cairn.
  const bubble = goatBubble({ avatar: () => goatAvatar(d.profile.look), name: d.profile.goatName })
  let spoken = false
  function speak(): void {
    if (spoken) return
    spoken = true
    const voice = goatVoice()
    let line: SpokenLine
    // Over today's cap: the brief's own words the first time this stone is seen waiting (or, when
    // older stones are queued ahead of it, the same words without the promise of tomorrow).
    if (newWaits) line = scriptedLine(waitsTillTomorrow ? 'stoneWaiting' : 'stoneWaitingLater')
    else if (newOnPile) line = voice.pick('stoneAdded', { n: placed.length, thing: newestThing() })
    else line = voice.pick(placed.length ? 'cairnVisit' : 'cairnEmpty')
    // A new stone's line stays until she taps it; a quiet visit's line drifts off after a while.
    bubble.say(line.text, { mood: line.mood, durationMs: fresh.length ? 0 : 9000 })
  }

  // ----------------------------------------------------------------- the words
  const seen = d.glossarySeen
  const n = placed.length
  const w = waiting.length
  const info: Child[] = []
  // The count shows the stones already there, and ticks up as each new one lands.
  let shown = n - fresh.filter(onPile).length
  const numEl = h('span', { class: 'cairn-info__num', 'aria-hidden': 'true' }, String(shown))
  const countWords = document.createTextNode(c.countWords(shown))
  const trailEl = h('p', { class: 'cairn-info__line cairn-info__trail' })
  function renderTrail(stones: number, opened: boolean): void {
    const line = trailLine(d, stones)
    const pitchWord = () => term('pitch', { seen, onSeen: markWordSeen, text: 'Pitch' })
    clear(trailEl)
    trailEl.classList.toggle('is-new', opened)
    append(
      trailEl,
      h('span', { class: 'cairn-info__icon', 'aria-hidden': 'true' }, icon('map', 26)),
      line.kind === 'all'
        ? h('span', null, c.trailAll)
        : line.kind === 'open'
          ? h('span', null, c.trailToBefore, pitchWord(), c.trailToAfter(line.pitch))
          : h('span', null, c.trailFoundBefore, pitchWord(), c.trailFoundAfter(line.pitch)),
    )
  }
  function countUp(): void {
    if (shown >= n) return
    shown++
    numEl.textContent = String(shown)
    countWords.data = c.countWords(shown)
    numEl.classList.remove('is-bump')
    void numEl.offsetWidth
    numEl.classList.add('is-bump')
    // A stone that changes the line (the way reaches a pitch further up) lights it up.
    if (!sameTrailLine(trailLine(d, shown), trailLine(d, shown - 1))) renderTrail(shown, true)
  }
  if (n > 0) {
    info.push(
      h(
        'p',
        { class: 'cairn-info__count', 'aria-label': c.countLabel(n) },
        numEl,
        h('span', { class: 'cairn-info__words', 'aria-hidden': 'true' }, countWords, ' ', term('cairn', { seen, onSeen: markWordSeen })),
      ),
    )
    renderTrail(shown, false)
    info.push(trailEl)
    if (d.summit.reached && !d.testMode) {
      info.push(
        h(
          'p',
          { class: 'cairn-info__line' },
          h('span', { class: 'cairn-info__icon', 'aria-hidden': 'true' }, icon('tent', 26)),
          h('span', null, c.afterSummit(unlocks.size)),
        ),
      )
    }
  } else if (w === 0) {
    info.push(
      isNewWord('cairn', seen)
        ? h('p', { class: 'cairn-info__word' }, term('cairn', { seen, onSeen: markWordSeen, text: 'Cairn' }))
        : null,
      h('h2', { class: 'cairn-info__empty-title' }, c.emptyTitle),
      h('p', { class: 'cairn-info__text' }, c.emptyText),
      button(c.logFirst, { icon: 'stone', size: 'big', onClick: () => ctx.navigate('/log') }),
    )
  }
  if (w > 0) {
    info.push(
      h(
        'p',
        { class: 'cairn-info__line cairn-info__line--waiting' },
        h('span', { class: 'cairn-info__glow', 'aria-hidden': 'true' }),
        h('span', null, c.waitingLine(w)),
      ),
    )
  }
  if (n + w > 0) info.push(h('p', { class: 'cairn-info__hint' }, c.tapHint))

  root.appendChild(
    screenLayout({
      class: 'cairn-screen',
      title: c.title,
      back: () => ctx.back('/camp'),
      backLabel: c.back,
      tone: 'leaf',
      body: [
        h(
          'div',
          { class: 'cairn-grid' + (n + w === 0 ? ' is-empty' : '') },
          h('div', { class: 'cairn-grid__scene' }, scene.el),
          h(
            'div',
            { class: 'cairn-grid__side' },
            h('div', { class: 'cairn-bubble' }, bubble.el),
            h('section', { class: 'cairn-info', 'aria-label': c.title }, ...info),
          ),
        ),
      ],
    }),
  )

  // Nothing arriving: the goat says hello after a moment.
  const hello = fresh.length ? null : setTimeout(speak, 600)

  return () => {
    if (hello) clearTimeout(hello)
    story?.close()
    scene.destroy()
    bubble.destroy()
  }
}
