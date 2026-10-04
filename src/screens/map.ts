/**
 * The Trail Map (#/map, #/map?night=1): her mountain as a cozy illustrated map. Five zones and the
 * summit, Sky Lake shining at the top, a winding trail from camp with the 16 pitch markers:
 * - sent: a little flag · open: glowing, tap to climb (#/climb/pNN) · hidden: in soft fog — a tap
 *   says "The trail ahead is hidden. Add a stone to your cairn to find the way." and, gently, how
 *   many more stones that part of the trail needs.
 * - Her climber marker ("you are here") at her highest open pitch, with the goat.
 * - After the summit (or in test mode): a Day/Night toggle — at night every pitch is open and a
 *   tap climbs by moonlight (#/climb/pNN?night=1) — and "Watch the Sky Lake ending again".
 * - When today's climbing time is used up, a tap shows the sunset card ("The sun's going down. The
 *   mountain will be here tomorrow.") instead — no lock icons, nothing sad.
 * The picture is one canvas painted per size and mode (map/paint.ts); markers and words are DOM on
 * top, placed in percentages of the same normalised map (map/trail.ts), so they always line up.
 */
import './map/map.css'
import { markWordSeen, now, releaseCanvas, save, sizeCanvas } from '../app/context'
import type { Screen } from '../app/router'
import type { LevelId } from '../game/types'
import { isSunset } from '../model/climbTime'
import { isGoatOut, isNightOpen } from '../model/unlocks'
import { button, modal, screenLayout, segmented, type OverlayHandle } from '../ui/components'
import { clear, h } from '../ui/dom'
import { icon } from '../ui/icons'
import { term } from '../ui/term'
import { sunsetLine, sunsetPrompt, type Prompt } from './climb/prompts'
import { finalePath } from './finale'
import { MAP_COPY, ZONE_NAMES } from './map/copy'
import { paintMap } from './map/paint'
import { mapPin, type MapPin } from './map/pin'
import {
  CAMP_PT,
  LAKE_PT,
  markerPoints,
  markerSide,
  mountainWidthAt,
  trailMarkers,
  zoneBounds,
  type MapPt,
  type PitchMarker,
} from './map/trail'

/** The last mode she looked at, so coming back from a night climb shows the night map. */
let lastNight = false

/** Labels beside the side markers need this much map width (narrower: the footer names the pitch). */
const LABELS_FROM_PX = 540

/** Room kept between her marker (with its "you are here" pin) and the footer. */
const MARKER_ROOM_PX = 56

const pct = (x: number) => `${(x * 100).toFixed(3)}%`

export const mapScreen: Screen = (root, ctx) => {
  const c = MAP_COPY
  const d = save()
  const nightOpen = isNightOpen(d)
  const goatOut = isGoatOut(d)
  const showReplay = d.summit.reached || d.testMode
  let night = nightOpen && (ctx.query.has('night') ? ctx.query.get('night') === '1' : lastNight)
  const points = markerPoints()
  const bounds = zoneBounds(points)

  const canvas = h('canvas', { class: 'trailmap__canvas', role: 'img', 'aria-label': c.sceneLabel(d.profile.mountainName || 'your mountain') })
  const layer = h('div', { class: 'trailmap__layer' })
  const frame = h('div', { class: 'trailmap__frame' }, canvas, layer)
  const intro = h('p', { class: 'trailmap__intro' })
  let pin: MapPin | null = null
  let markers: PitchMarker[] = []
  let prompt: Prompt | OverlayHandle | null = null

  // ------------------------------------------------------------------ taps
  const pathFor = (id: LevelId) => `/climb/${id}${night ? '?night=1' : ''}`

  function climb(m: PitchMarker): void {
    if (prompt) return
    if (m.state === 'hidden') {
      showHidden(m)
      return
    }
    if (isSunset(save(), now())) {
      prompt = sunsetPrompt({ look: d.profile.look, name: d.profile.goatName, out: night && goatOut }, sunsetLine(now()), () =>
        ctx.navigate('/camp'),
      )
      return
    }
    ctx.navigate(pathFor(m.id))
  }

  function showHidden(m: PitchMarker): void {
    const l = c.locked
    prompt = modal({
      art: h('span', { class: 'trailmap__fog-art', 'aria-hidden': 'true' }, icon('fog', 52)),
      body: [h('p', { class: 'trailmap__locked' }, l.text), m.needs > 0 ? h('p', { class: 'trailmap__locked-more' }, l.more(m.needs)) : null],
      dismissible: true,
      class: 'trailmap__card',
      actions: [
        { label: l.log, icon: 'stone', variant: 'secondary', onClick: () => ctx.navigate('/log') },
        { label: l.ok, icon: 'check' },
      ],
      onClose: () => {
        prompt = null
      },
    })
  }

  // ------------------------------------------------------------------ markers + words
  function place(el: HTMLElement, p: MapPt): HTMLElement {
    el.style.left = pct(p.u)
    el.style.top = pct(p.v)
    return el
  }

  function markerButton(m: PitchMarker, p: MapPt): HTMLElement {
    const label =
      m.state === 'hidden'
        ? c.marker.hidden(m.n)
        : night
          ? (m.state === 'sent' ? c.marker.nightSent : c.marker.night)(m.n, m.title)
          : (m.state === 'sent' ? c.marker.sent : c.marker.open)(m.n, m.title)
    const b = h(
      'button',
      {
        type: 'button',
        class: `trail-pin is-${m.state}` + (m.current ? ' is-current' : ''),
        dataset: { zone: m.zone, pitch: m.id },
        'aria-label': label,
      },
      h('span', { class: 'trail-pin__disc' }, m.state === 'hidden' ? icon('fog', 26) : String(m.n)),
      m.state === 'sent' ? h('span', { class: 'trail-pin__flag', 'aria-hidden': 'true' }) : null,
    )
    b.addEventListener('pointerdown', () => b.classList.add('is-pressed'))
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, () => b.classList.remove('is-pressed'))
    b.addEventListener('click', () => climb(m))
    return place(b, p)
  }

  function buildLayer(): void {
    pin?.destroy()
    pin = null
    clear(layer)
    markers = trailMarkers(save(), night)
    const wide = frame.clientWidth >= LABELS_FROM_PX

    // Zone names at the edge where each zone's trail starts, above its first pitch (that side is
    // free there: the trail has crossed to the other side).
    ;(['meadow', 'hollow', 'crumble', 'ridge', 'cloud', 'summit'] as const).forEach((zone, z) => {
      const left = z % 2 === 0
      const v = z === 5 ? points[15].v : (bounds[z] + points[z * 3].v) / 2
      const el = h('span', { class: `trail-zone trail-zone--${left ? 'left' : 'right'}`, dataset: { zone }, 'aria-hidden': 'true' }, ZONE_NAMES[zone])
      el.style.top = pct(v)
      layer.appendChild(el)
    })

    // Camp at the foot; Sky Lake at the top (after the summit, a button to watch the ending again).
    layer.appendChild(place(h('span', { class: 'trail-place trail-place--camp', 'aria-hidden': 'true' }, c.camp), CAMP_PT))
    if (showReplay) {
      const replay = button(c.replay, {
        variant: 'secondary',
        icon: 'eye',
        class: 'trail-replay',
        onClick: () => ctx.navigate(finalePath({ replay: true })),
      })
      layer.appendChild(replay)
    } else {
      layer.appendChild(place(h('span', { class: 'trail-place trail-place--lake' }, c.skyLake), { u: LAKE_PT.u, v: LAKE_PT.v - 0.05 }))
    }
    for (let i = 0; i < 3; i++) {
      layer.appendChild(
        place(h('span', { class: 'trail-sparkle', 'aria-hidden': 'true', style: `animation-delay: ${i * 0.9}s` }), {
          u: LAKE_PT.u + (i - 1) * 0.055,
          v: LAKE_PT.v + (i === 1 ? -0.006 : 0.004),
        }),
      )
    }

    markers.forEach((m, i) => {
      const p = points[i]
      layer.appendChild(markerButton(m, p))
      if (wide && m.state !== 'hidden') {
        // Beside the side markers (as far as the frame's edge); under the middle ones.
        // The summit pitch's name sits to its left: below it is the way up from the clouds.
        const side = markerSide(i) ?? (i === 15 ? 'left' : 'below')
        const room = side === 'left' ? `${(p.u * 100).toFixed(2)}% - 44px` : side === 'right' ? `${((1 - p.u) * 100).toFixed(2)}% - 44px` : `${(mountainWidthAt(p.v) * 50).toFixed(2)}% - 70px`
        const name = place(h('span', { class: `trail-name trail-name--${side}`, 'aria-hidden': 'true' }, m.title), p)
        name.style.maxWidth = `calc(${room})`
        layer.appendChild(name)
      }
      if (m.current) {
        pin = mapPin(d.profile.look, goatOut, c.youAreHere)
        pin.el.classList.add(markerSide(i) === 'right' ? 'trail-me--left' : 'trail-me--right')
        layer.appendChild(place(pin.el, p))
      }
    })

    shrinkWrapNames()
    intro.replaceChildren(
      ...(night
        ? [c.introNight]
        : [c.introBefore, term('pitch', { seen: save().glossarySeen, onSeen: markWordSeen }), c.introAfter]),
    )
    footerButton.replaceWith((footerButton = climbButton()))
  }

  /**
   * A name that wraps onto two lines keeps its box at the full max-width, leaving an empty tail in
   * the pill; shrink each wrapped one to its widest line (measured with a Range over its text).
   */
  function shrinkWrapNames(): void {
    layer.querySelectorAll<HTMLElement>('.trail-name').forEach((el) => {
      el.style.width = ''
      const range = document.createRange()
      range.selectNodeContents(el)
      const lines = range.getClientRects()
      if (lines.length < 2) return
      let widest = 0
      for (let i = 0; i < lines.length; i++) widest = Math.max(widest, lines[i].width)
      const cs = getComputedStyle(el)
      el.style.width = `${Math.ceil(widest + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)) + 1}px`
    })
  }

  // ------------------------------------------------------------------ the picture
  let painted = ''
  function paint(): void {
    const size = sizeCanvas(canvas)
    const g = canvas.getContext('2d')
    if (!size || !g) return
    const key = `${size.w}x${size.h}@${size.dpr}:${night}`
    if (key === painted) return
    painted = key
    g.setTransform(size.dpr, 0, 0, size.dpr, 0, 0)
    g.clearRect(0, 0, size.w, size.h)
    const firstHidden = markers.findIndex((m) => m.state === 'hidden')
    const fogFrom = firstHidden < 0 ? null : firstHidden === 0 ? 0.95 : (points[firstHidden - 1].v + points[firstHidden].v) / 2
    paintMap(g, size.w, size.h, { night, points, bounds, fogFrom })
  }

  // ------------------------------------------------------------------ the footer: climb her pitch
  function climbButton(): HTMLButtonElement {
    const m = markers.find((x) => x.current) ?? markers[0]
    const b = button(c.climb(m.n), {
      size: 'big',
      icon: night ? 'moon' : 'mountain',
      class: 'trailmap__go',
      ariaLabel: `${night ? c.climbNight(m.n) : c.climb(m.n)}: ${m.title}`,
      onClick: () => climb(m),
    })
    b.querySelector('.btn__label')?.appendChild(h('span', { class: 'trailmap__go-title' }, m.title))
    return b
  }
  let footerButton: HTMLButtonElement = h('button')

  // ------------------------------------------------------------------ day / night
  const toggle = nightOpen
    ? segmented<'day' | 'night'>({
        options: [
          { value: 'day', label: c.day, icon: 'sun' },
          { value: 'night', label: c.night, icon: 'moon' },
        ],
        value: night ? 'night' : 'day',
        ariaLabel: c.toggleLabel,
        onChange: (v) => {
          night = v === 'night'
          lastNight = night
          try {
            history.replaceState(history.state, '', night ? '#/map?night=1' : '#/map')
          } catch {
            // Safari's history throttle: the map still switches, only the address doesn't.
          }
          layout.classList.toggle('trailmap--night', night)
          buildLayer()
          paint()
        },
      })
    : null

  const layout = screenLayout({
    class: 'trailmap' + (night ? ' trailmap--night' : ''),
    title: c.title,
    back: () => ctx.back('/camp'),
    backLabel: 'Back to camp',
    top: toggle ? h('div', { class: 'trailmap__toggle' }, toggle) : undefined,
    // The intro (with the first-time card for "pitch") rides in the footer, so scrolling the map to
    // her marker never hides it under the header.
    body: [frame],
    footer: [intro, footerButton],
  })
  root.appendChild(layout)
  buildLayer()

  // Paint once it has a size, and again whenever the size changes (rotation, split view).
  let raf = requestAnimationFrame(() => {
    paint()
    // Start with her marker in view, scrolling only as far as that needs (none on an iPad held
    // upright), so the top of the map and Sky Lake stay in sight whenever they can.
    const cur = markers.findIndex((m) => m.current)
    const y = frame.offsetTop + points[Math.max(0, cur)].v * frame.clientHeight
    const footerH = root.querySelector<HTMLElement>('.layout__footer')?.offsetHeight ?? 0
    const lowest = root.clientHeight - footerH - MARKER_ROOM_PX
    if (y > lowest) root.scrollTop = y - lowest
  })
  let lastW = frame.clientWidth
  const onResize = () => {
    cancelAnimationFrame(raf)
    raf = requestAnimationFrame(() => {
      const wideChanged = frame.clientWidth >= LABELS_FROM_PX !== lastW >= LABELS_FROM_PX
      lastW = frame.clientWidth
      if (wideChanged) buildLayer()
      else shrinkWrapNames()
      paint()
    })
  }
  let ro: ResizeObserver | null = null
  if (typeof ResizeObserver === 'function') {
    ro = new ResizeObserver(onResize)
    ro.observe(frame)
  } else window.addEventListener('resize', onResize)

  return () => {
    cancelAnimationFrame(raf)
    ro?.disconnect()
    window.removeEventListener('resize', onResize)
    prompt?.close()
    pin?.destroy()
    releaseCanvas(canvas)
  }
}
