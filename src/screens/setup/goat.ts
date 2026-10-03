/**
 * First run, kid step 2: meet the goat. The backpack wiggles, a baby mountain goat peeks out and
 * says who it is (tap to keep going), then she names it (pre-filled, with idea chips).
 */
import { animate, fitBox, releaseCanvas, save, update } from '../../app/context'
import type { Screen } from '../../app/router'
import { SETUP_COPY } from '../../content/copy'
import { SCRIPTED } from '../../content/goatLines'
import { GOAT_NAMES, pickNames } from '../../content/names'
import { drawPackWithGoat } from '../../game/art/climber'
import type { GoatMood as ArtMood } from '../../game/art/goat'
import { easeOutBack, clamp01 } from '../../game/art/rig'
import { TUNING } from '../../game/tuning'
import { scriptedLine } from '../../model/goatVoice'
import { button, screenLayout } from '../../ui/components'
import { h, prefersReducedMotion } from '../../ui/dom'
import { goatBubble, type GoatMood } from '../../ui/goatBubble'
import { kidDots, namePicker } from './common'

type Phase = 'wiggle' | 'lines' | 'name'

const ART_MOOD: Record<GoatMood, ArtMood> = {
  calm: 'peek',
  happy: 'happy',
  scared: 'nervous',
  giggly: 'laugh',
  wobbly: 'wobbly',
}
const NAME_MAX = 30
const WIGGLE_S = 1.6

export const goatScreen: Screen = (root, ctx) => {
  const c = SETUP_COPY.goat
  const d = save()
  const look = d.profile.look
  const ideas = pickNames(GOAT_NAMES, 7)
  const suggestion = d.profile.goatName || ideas[0]

  let phase: Phase = 'wiggle'
  let line = -1
  let now = 0
  let revealAt = -1
  let mood: ArtMood = 'curious'
  let moodUntil = -1
  let tempMood: ArtMood = 'laugh'
  let lastTap = -Infinity

  const canvas = h('canvas', { class: 'meet__canvas', role: 'img', 'aria-label': 'A baby mountain goat in your backpack' })
  const bubble = goatBubble({ placement: 'inline', tapToHide: false })
  const title = h('h1', { class: 'layout__title meet__title' }, c.title)

  const picker = namePicker({
    label: c.nameLabel,
    ideasLabel: c.ideas,
    value: suggestion,
    ideas: ideas.slice(1),
    fallback: suggestion || c.fallback,
    maxLength: NAME_MAX,
    onChange: (name) => {
      if (!name) return
      tempMood = 'laugh'
      moodUntil = now + 1.2
      const named = scriptedLine('named', { vars: { goat: name } })
      bubble.say(named.text, { mood: named.mood, durationMs: 0 })
      loop.redraw()
    },
    onEnter: () => finish(),
  })
  const nameBox = h('div', { class: 'meet__name' }, picker.el)
  nameBox.hidden = true

  const nextBtn = button(c.next, { onClick: () => advance(), size: 'big', iconEnd: 'next' })
  const doneBtn = button(c.done, { onClick: () => finish(), size: 'big', iconEnd: 'next' })
  doneBtn.hidden = true

  function reveal(): void {
    if (phase !== 'wiggle') return
    phase = 'lines'
    revealAt = now
    title.textContent = c.metTitle
    loop.redraw()
    setTimeout(() => {
      if (line < 0) sayLine(0)
    }, 450)
  }

  function sayLine(i: number): void {
    line = i
    const l = scriptedLine('meet', { index: i })
    mood = ART_MOOD[l.mood]
    bubble.say(l.text, { mood: l.mood, durationMs: 0 })
    loop.redraw()
  }

  function advance(): void {
    if (phase === 'wiggle') return reveal()
    if (phase === 'lines') {
      if (line < 0) return sayLine(0)
      if (line < SCRIPTED.meet.length - 1) return sayLine(line + 1)
      phase = 'name'
      mood = 'happy'
      nameBox.hidden = false
      nextBtn.hidden = true
      doneBtn.hidden = false
      loop.redraw()
      requestAnimationFrame(() => nameBox.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' }))
      return
    }
    finish()
  }

  function finish(): void {
    if (phase !== 'name') return advance()
    const name = picker.value()
    update((draft) => {
      draft.profile.goatName = name
    })
    ctx.navigate('/setup/mountain')
  }

  const onStageTap = () => {
    const t = performance.now()
    if (t - lastTap < 350) return
    lastTap = t
    if (phase !== 'name') advance()
  }

  const stage = h('div', { class: 'meet__stage scene' }, canvas)
  stage.addEventListener('click', onStageTap)
  bubble.el.addEventListener('click', onStageTap)

  root.appendChild(
    screenLayout({
      class: 'setup setup--goat',
      top: kidDots('goat'),
      body: [
        title,
        h(
          'div',
          { class: 'meet' },
          stage,
          h('div', { class: 'meet__side stack' }, bubble.el, h('p', { class: 'faint small center meet__hint' }, c.tapHint), nameBox),
        ),
      ],
      footer: [nextBtn, doneBtn],
    }),
  )
  const hint = root.querySelector<HTMLElement>('.meet__hint')

  const box = { minX: -17, minY: -44, maxX: 18, maxY: 3 }
  const loop = animate(
    canvas,
    (t) => {
      now = t
      if (hint) hint.hidden = phase !== 'lines'
      const g = canvas.getContext('2d')
      const w = canvas.clientWidth
      const hgt = canvas.clientHeight
      if (!g || !w || !hgt) return
      const dpr = Math.min(TUNING.maxDpr, Math.max(1, window.devicePixelRatio || 1))
      const bw = Math.round(w * dpr)
      const bh = Math.round(hgt * dpr)
      if (canvas.width !== bw) canvas.width = bw
      if (canvas.height !== bh) canvas.height = bh
      fitBox(g, { w, h: hgt, dpr }, box, 0.04)
      if (phase === 'wiggle') {
        const k = t % 0.8
        g.translate(0, -Math.abs(Math.sin(k * 8)) * 1.2)
        g.rotate(Math.sin(t * 22) * 0.06)
        drawPackWithGoat(g, look, null)
        return
      }
      const since = revealAt < 0 || prefersReducedMotion() ? 1 : t - revealAt
      const rise = easeOutBack(clamp01(since / 0.55), 2.2)
      const shownMood = t < moodUntil ? tempMood : since < 0.9 ? 'curious' : mood
      drawPackWithGoat(g, look, {
        mood: shownMood,
        t,
        inBackpack: true,
        sink: (1 - rise) * 3.5,
        earFlap: since < 0.5 ? 0.8 : 0,
      })
    },
    { fps: 60 },
  )

  const wiggleTimer = setTimeout(reveal, WIGGLE_S * 1000)

  return () => {
    clearTimeout(wiggleTimer)
    loop.stop()
    bubble.destroy()
    releaseCanvas(canvas)
  }
}
