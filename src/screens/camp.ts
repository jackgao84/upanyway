/**
 * Camp, the hub (#/camp). Her mountain's name, the camp picture (her by the fire, the goat peeking
 * out of the backpack), a goat line, and big buttons to everything else. Waiting stones are placed
 * here on a new day, and a waiting app update is switched on here (never mid-climb).
 */
import './camp.css'
import { goatAvatar, now, save, update } from '../app/context'
import type { Screen } from '../app/router'
import { applyUpdateIfSafe, onUpdateReady } from '../app/sw-register'
import { CAMP_COPY } from '../content/copy'
import { goatVoice, scriptedLine, type SpokenLine } from '../model/goatVoice'
import { placeWaitingStones, totalStones, unopenedLetters, waitingStones } from '../model/stones'
import { button, screenLayout, tile, toast } from '../ui/components'
import { h } from '../ui/dom'
import { goatBubble } from '../ui/goatBubble'
import { campScene } from './campScene'

/** Each visit to camp is one camp arrival: the goat says at most one moral line per arrival. */
let campArrivals = 0

export const campScreen: Screen = (root, ctx) => {
  // A safe moment for a waiting app update: the page reloads once into the new version.
  applyUpdateIfSafe()
  const offUpdate = onUpdateReady(() => applyUpdateIfSafe())

  let placed: string[] = []
  if (waitingStones(save()).length) {
    update((d) => {
      placed = placeWaitingStones(d, now())
    })
  }

  const d = save()
  const c = CAMP_COPY
  const firstVisit = !d.flags.firstCampVisit
  if (firstVisit) {
    update((draft) => {
      draft.flags.firstCampVisit = true
    })
  }

  const go = (path: string) => () => ctx.navigate(path)
  const letters = unopenedLetters(d).length
  const sceneCanvas = h('canvas', { class: 'camp__canvas', role: 'img', 'aria-label': c.sceneLabel(d.profile.mountainName) })
  const bubble = goatBubble({ avatar: () => goatAvatar(d.profile.look), name: d.profile.goatName })
  const sceneFrame = h('div', { class: 'camp__scene scene' }, sceneCanvas)

  const tiles = h(
    'div',
    { class: 'tiles camp__tiles' },
    tile({ label: c.climb, icon: 'mountain', tone: 'meadow', wide: true, onClick: go('/map'), class: 'camp__climb' }),
    tile({ label: c.log, icon: 'stone', tone: 'coral', wide: true, onClick: go('/log'), class: 'camp__log' }),
    tile({ label: c.plans, icon: 'plans', tone: 'sky', onClick: go('/plans') }),
    tile({ label: c.cairn, icon: 'cairn', tone: 'leaf', onClick: go('/cairn') }),
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
          { class: 'camp__grid' },
          h('div', { class: 'camp__left' }, sceneFrame, h('div', { class: 'camp__bubble' }, bubble.el)),
          h(
            'div',
            { class: 'camp__right' },
            tiles,
            h(
              'div',
              { class: 'camp__grownups' },
              button(c.grownups, { variant: 'ghost', icon: 'grownups', onClick: go('/parent') }),
            ),
          ),
        ),
      ],
    }),
  )

  const scene = campScene(sceneCanvas, { look: d.profile.look, stones: totalStones(d) })

  // Idle lines come from the goat's shuffle-bag (no back-to-back repeats, across visits too).
  const campKey = `camp:${++campArrivals}`
  const idleLine = () => goatVoice().pick('campIdle', {}, { campKey })
  const say = (line: SpokenLine, ms?: number) => bubble.say(line.text, { mood: line.mood, durationMs: ms })
  const timer = setTimeout(() => say(firstVisit ? scriptedLine('firstCamp') : idleLine(), firstVisit ? 0 : 9000), 500)
  // Tapping the picture gets another line out of the goat.
  let lastPoke = -Infinity
  sceneFrame.addEventListener('click', () => {
    const t = performance.now()
    if (t - lastPoke < 600) return
    lastPoke = t
    say(idleLine(), 7000)
  })
  if (placed.length) toast(c.waitingPlaced(placed.length), { icon: 'cairn', tone: 'leaf' })

  return () => {
    clearTimeout(timer)
    offUpdate()
    scene.stop()
    bubble.destroy()
  }
}
