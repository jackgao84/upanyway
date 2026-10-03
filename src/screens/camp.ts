/**
 * Camp, the hub (#/camp). Her mountain's name, the camp picture — her by the fire, the goat peeking
 * out of the backpack (or, once it has climbed out at Sky Lake, sitting beside her), her real cairn,
 * and every camp decoration her stones have unlocked after the summit — a goat line, and big tiles
 * to everything else: Climb (the Trail Map), Log a brave thing, Plans, Cairn, Weather Station, Hall
 * of Flops, Letters, Wardrobe, Badges, and a small Grown-ups button.
 *
 * On entry: waiting stones that fit today go on the cairn (a gentle toast offers to go and see
 * them), a waiting app update is switched on (never mid-climb), and the word "cairn" gets its card
 * the first time. The goat says one line per visit from its campIdle bag (campKey = this visit, so
 * at most one moral line); the very first visit it names Sky Lake as where they're going.
 * No clocks, no streaks, no nagging: the counts on tiles are plain facts (stones, unread letters);
 * Plans never shows how many are still to do.
 */
import './camp.css'
import { goatAvatar, markWordSeen, now, save, update } from '../app/context'
import type { Screen } from '../app/router'
import { applyUpdateIfSafe, onUpdateReady } from '../app/sw-register'
import { CAMP_COPY } from '../content/copy'
import { goatVoice, scriptedLine, type SpokenLine } from '../model/goatVoice'
import { placeWaitingStones, stoneOrder, unopenedLetters, waitingStones } from '../model/stones'
import { isGoatOut } from '../model/unlocks'
import { newlyUnlockedSince, unlockedDecorations, unlockedItems } from '../model/unlockables'
import type { SaveData } from '../storage/schema'
import { button, screenLayout, tile, toast, type ToastHandle } from '../ui/components'
import { h } from '../ui/dom'
import { goatBubble } from '../ui/goatBubble'
import { wordCard, type WordBook } from './climb/cards'
import { campScene, type CampStone } from './campScene'
import { noteArrivals } from './log/events'
import { trailMarkers } from './map/trail'

/** Camp words beyond the shared CAMP_COPY (content/copy.ts). Plain facts, no nagging. */
export const CAMP_SCREEN_COPY = {
  climbNext: (n: number, title: string) => `Pitch ${n}: ${title}`,
  stones: (n: number) => (n === 1 ? '1 stone' : `${n} stones`),
  seeCairn: 'See the cairn',
  newAtCamp: (names: string[]) =>
    names.length === 1 ? `Something new came with it: ${names[0]}.` : `New things came with them: ${names.join(', ')}.`,
} as const

/** Each visit to camp is one camp arrival: the goat says at most one moral line per arrival. */
let campArrivals = 0

/** Her placed stones in cairn order, for the picture. */
export function campStones(d: SaveData): CampStone[] {
  return stoneOrder(d).map((s) => ({ id: s.id, letter: s.kind === 'letter' }))
}

/**
 * Unlocked camp decorations: base id → the colour of its newest colour variant (null = its own
 * colours). Test mode shows every decoration (and keeps the colours her own stones gave them).
 */
export function campDecorations(d: SaveData): Map<string, string | null> {
  const items = d.testMode ? [...unlockedDecorations(d), ...unlockedDecorations({ ...d, testMode: false })] : unlockedDecorations(d)
  const out = new Map<string, string | null>()
  for (const item of items) out.set(item.baseId, item.tint ?? out.get(item.baseId) ?? null)
  return out
}

export const campScreen: Screen = (root, ctx) => {
  // A safe moment for a waiting app update: the page reloads once into the new version.
  applyUpdateIfSafe()
  const offUpdate = onUpdateReady(() => applyUpdateIfSafe())

  // Stones that waited (over a day's cap) go on now if today has room.
  let placed: string[] = []
  let unlockedNow: string[] = []
  if (waitingStones(save()).length) {
    const before = save().testMode ? -1 : unlockedItems(save()).length
    update((d) => {
      placed = placeWaitingStones(d, now())
    })
    // Their hop onto the cairn plays at the next cairn visit, by the toast's button or the Cairn tile.
    noteArrivals(placed)
    if (placed.length && before >= 0) unlockedNow = newlyUnlockedSince(before, save()).map((i) => i.name)
  }

  const d = save()
  const c = CAMP_COPY
  const s = CAMP_SCREEN_COPY
  const goatOut = isGoatOut(d)
  const firstVisit = !d.flags.firstCampVisit
  if (firstVisit) {
    update((draft) => {
      draft.flags.firstCampVisit = true
    })
  }

  const go = (path: string) => () => ctx.navigate(path)
  const letters = unopenedLetters(d).length
  const stones = campStones(d)
  const here = trailMarkers(d, false).find((m) => m.current)

  const sceneCanvas = h('canvas', { class: 'camp__canvas', role: 'img', 'aria-label': c.sceneLabel(d.profile.mountainName || 'your mountain') })
  const bubble = goatBubble({ avatar: () => goatAvatar(d.profile.look, { out: goatOut }), name: d.profile.goatName })
  const sceneFrame = h('div', { class: 'camp__scene scene' }, sceneCanvas)

  /** A tile with a small line of plain fact under its name. */
  const withNote = (el: HTMLButtonElement, note: string | null): HTMLButtonElement => {
    if (note) el.querySelector('.tile__label')?.appendChild(h('span', { class: 'tile__note' }, note))
    return el
  }

  const tiles = h(
    'div',
    { class: 'tiles camp__tiles' },
    withNote(
      tile({
        label: c.climb,
        icon: 'mountain',
        tone: 'meadow',
        wide: true,
        onClick: go('/map'),
        class: 'camp__climb',
        ariaLabel: here ? `${c.climb}. ${s.climbNext(here.n, here.title)}` : undefined,
      }),
      here ? s.climbNext(here.n, here.title) : null,
    ),
    tile({ label: c.log, icon: 'stone', tone: 'coral', wide: true, onClick: go('/log'), class: 'camp__log' }),
    // Plans is a plain tile: no count of brave things still to do (never a to-do list or a nag).
    tile({ label: c.plans, icon: 'plans', tone: 'sky', onClick: go('/plans') }),
    withNote(
      tile({
        label: c.cairn,
        icon: 'cairn',
        tone: 'leaf',
        onClick: go('/cairn'),
        ariaLabel: stones.length ? `${c.cairn}, ${s.stones(stones.length)}` : undefined,
      }),
      stones.length ? s.stones(stones.length) : null,
    ),
    tile({ label: c.weather, icon: 'weather', tone: 'ridge', onClick: go('/weather') }),
    tile({ label: c.flops, icon: 'flops', tone: 'plum', onClick: go('/flops') }),
    tile({
      label: c.letters,
      icon: 'letter',
      tone: 'sun',
      count: letters,
      ariaLabel: letters ? c.lettersUnread(letters) : undefined,
      onClick: go('/letters'),
    }),
    tile({ label: c.wardrobe, icon: 'wardrobe', tone: 'crumble', onClick: go('/wardrobe') }),
    tile({ label: c.badges, icon: 'badge', tone: 'summit', onClick: go('/badges') }),
  )

  root.appendChild(
    screenLayout({
      class: 'camp',
      title: d.profile.mountainName || c.kicker,
      body: [
        h(
          'div',
          { class: 'camp__grid' + (goatOut ? ' camp--goat-out' : '') },
          h('div', { class: 'camp__left' }, sceneFrame, h('div', { class: 'camp__bubble' }, bubble.el)),
          h(
            'div',
            { class: 'camp__right' },
            tiles,
            h('div', { class: 'camp__grownups' }, button(c.grownups, { variant: 'ghost', icon: 'grownups', onClick: go('/parent') })),
          ),
        ),
      ],
    }),
  )

  const scene = campScene(sceneCanvas, { look: d.profile.look, stones, goatOut, decorations: campDecorations(d) })

  // The goat: its first-ever camp line names Sky Lake; after that, one idle line per visit (more if
  // she taps the picture). Idle lines come from the shuffle-bag (no back-to-back repeats).
  const campKey = `camp:${++campArrivals}`
  const idleLine = () => goatVoice().pick('campIdle', {}, { campKey, goatOut })
  const say = (line: SpokenLine, ms?: number) => bubble.say(line.text, { mood: line.mood, durationMs: ms })
  const timer = setTimeout(() => say(firstVisit ? scriptedLine('firstCamp') : idleLine(), firstVisit ? 0 : 9000), 500)
  let lastPoke = -Infinity
  sceneFrame.addEventListener('click', () => {
    const t = performance.now()
    if (t - lastPoke < 600) return
    lastPoke = t
    say(idleLine(), 7000)
  })

  // Cards: stones that waited and just went on (with a way to watch them hop onto the cairn), and
  // the word "cairn" the first time camp shows it.
  const cards: ToastHandle[] = []
  if (placed.length) {
    const message = h(
      'span',
      { class: 'camp-toast' },
      h('span', { class: 'camp-toast__text' }, c.waitingPlaced(placed.length)),
      unlockedNow.length ? h('span', { class: 'camp-toast__extra' }, s.newAtCamp(unlockedNow.slice(0, 3))) : null,
      button(s.seeCairn, {
        variant: 'secondary',
        iconEnd: 'next',
        class: 'camp-toast__go',
        onClick: () => ctx.navigate(`/cairn?new=${placed.map(encodeURIComponent).join(',')}`),
      }),
    )
    cards.push(toast(message, { icon: 'cairn', tone: 'leaf', durationMs: 9000 }))
  }
  // The word card is general (it may finish showing on the next screen); the stones card is camp's.
  const words: WordBook = { seen: () => save().glossarySeen, mark: markWordSeen }
  // On the first visit it waits a moment: the goat is pointing at the top of the mountain.
  const wordTimer = setTimeout(() => wordCard(words, 'cairn'), firstVisit ? 6000 : 900)

  return () => {
    clearTimeout(timer)
    clearTimeout(wordTimer)
    offUpdate()
    scene.stop()
    bubble.destroy()
    // The cards belong to camp ("See the cairn" means nothing on another screen).
    cards.forEach((t) => t.close())
  }
}
