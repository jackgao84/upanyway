/**
 * First run, kid step 4: the 20-second lesson, on the real climb machinery (climb/stage.ts) and the
 * 'lesson' level (Practice Rock).
 *
 * 1. Leap: the goat says how, and a soft hand shows the drag-back. She leaps onto the higher ledge.
 * 2. Fall: "Now we practise falling." From that ledge nothing is reachable, so any leap ends with the
 *    rope catching her. (A miss on step 1 counts as the fall too.)
 * Then the goat's rope line, the "New flop unlocked!" card with the whipper definition, and Next.
 * Waiting 6 s without a drag: the goat says the aiming hint again and the hand comes back.
 *
 * The lesson whipper counts (stats, first-whipper badge, its pose) under level id 'lesson', with no
 * pitch run, so it never shows up as a pitch anywhere else.
 */
import '../climb/climb.css'
import { ambient } from '../../audio/ambient'
import { sfx } from '../../audio/sfx'
import { goatAvatar, now, save, update } from '../../app/context'
import type { Screen } from '../../app/router'
import { SETUP_COPY } from '../../content/copy'
import { setClimbDebug } from '../../debug'
import { pickFallPose } from '../../game/art/fallPosesAnim'
import type { Camera } from '../../game/camera'
import { ClimbSession } from '../../game/engine'
import { getLevel } from '../../game/levels'
import { solutionFrom } from '../../game/levels/solutions'
import { CLIMBER_CENTER } from '../../game/render/overlays'
import { goatVoice, scriptedLine, type SpokenLine } from '../../model/goatVoice'
import { hashString, mulberry32 } from '../../model/rng'
import { button } from '../../ui/components'
import { h } from '../../ui/dom'
import { goatBubble } from '../../ui/goatBubble'
import { icon } from '../../ui/icons'
import { firstMentionText } from '../../ui/term'
import { badgeCards, CardQueue, flopCard, flopPanel } from '../climb/cards'
import { LESSON_COPY } from '../climb/copy'
import { wordBook } from '../climb/play'
import { ClimbRecorder } from '../climb/record'
import { ClimbStage } from '../climb/stage'
import './common'

/** Idle seconds before the goat repeats the aiming hint. */
const IDLE_HINT_S = 6
/** Room kept for the goat's bubble (two lines) under the title and step pills (CSS px). */
const BUBBLE_ROOM = 112
/** The hand's drag for the fall step (any leap from there falls; this one shows "leap off"). */
const FALL_DEMO = { angle: 48, power: 0.55 }

type Step = 'leap' | 'fall' | 'done'

export const lessonScreen: Screen = (root, ctx) => {
  const c = SETUP_COPY.lesson
  const d = save()
  const look = d.profile.look
  const level = getLevel('lesson')
  if (!level) return
  const words = wordBook()
  const recorder = new ClimbRecorder({ save, update, now }, 'lesson', false, false)
  let poseN = 0
  const session = new ClimbSession({
    level,
    choosePose: () => pickFallPose(save().poses, mulberry32(hashString(`lesson:${save().stats.whippers}:${poseN++}`))),
  })
  const leapSol = solutionFrom('lesson', level.route[0])
  const leapDemo = { angle: leapSol?.angle ?? 51, power: leapSol?.power ?? 0.8 }

  const cards = new CardQueue()
  let step: Step = 'leap'
  let destroyed = false
  const timers = new Set<ReturnType<typeof setTimeout>>()
  const later = (fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timers.delete(id)
      if (!destroyed) fn()
    }, ms)
    timers.add(id)
  }

  // ---- DOM ----------------------------------------------------------------------------------
  const pills = c.steps.map((text, i) =>
    h('li', { class: 'lesson__step' }, h('span', { class: 'lesson__num' }, String(i + 1)), h('span', null, text)),
  )
  const bubble = goatBubble({ avatar: () => goatAvatar(look), name: d.profile.goatName, tapToHide: false })
  const next = button(c.next, {
    size: 'big',
    iconEnd: 'next',
    class: 'lesson__next',
    onClick: () => {
      update((draft) => {
        draft.lessonDone = true
        // Said by the goat on the first rope catch (Decision 36).
        draft.flags.ropeExplained = true
      })
      ctx.navigate('/setup/brave')
    },
  })
  next.hidden = true
  const wrap = h('div', { class: 'lesson setup' })
  root.appendChild(wrap)
  const head = h('div', { class: 'lesson__head' }, h('h1', { class: 'lesson__title' }, icon('rope', 26), c.title), h('ol', { class: 'lesson__steps' }, ...pills))

  let lastActive = 0
  let handOn = true
  let handFrom = 0
  const stage = new ClimbStage(wrap, {
    level,
    session,
    look,
    night: false,
    goatOutside: false,
    // The title, the steps and the goat's bubble sit at the top; the drag happens below.
    // Measured from the HUD row (which sits --shell-top = safe top + 10 px down): the stage adds the
    // safe-area inset itself.
    hudTop: () => {
      const row = head.parentElement?.getBoundingClientRect().top ?? 0
      return (head.getBoundingClientRect().bottom - row || 100) + 10 + BUBBLE_ROOM
    },
    hudBottom: 12,
    fitWidth: 440,
    // Practice Rock is small: frame all of it, with room under her for the drag.
    fixedCenterY: 105,
    label: LESSON_COPY.stage,
    onFrame: () => idleCheck(),
  })
  stage.el.classList.add('lesson__stage')
  stage.el.dataset.lessonStage = ''
  const bottom = h('div', { class: 'hud__bottom lesson__bottom' }, next)
  let panel: { el: HTMLElement; stop(): void } | null = null
  wrap.appendChild(
    h('div', { class: 'hud lesson__hud' }, h('div', { class: 'hud__top lesson__top' }, head, h('div', { class: 'lesson__bubble' }, bubble.el)), bottom),
  )
  stage.relayout()

  const say = (line: SpokenLine, ms = 0) => bubble.say(line.text, { mood: line.mood, durationMs: ms })
  const showStep = () => {
    const i = step === 'leap' ? 0 : step === 'fall' ? 1 : 2
    pills.forEach((p, k) => {
      p.classList.toggle('is-current', k === i)
      p.classList.toggle('is-done', k < i)
      p.setAttribute('aria-current', k === i ? 'step' : 'false')
    })
  }

  // ---- The hand that shows the drag ----------------------------------------------------------
  stage.renderer.setHook('screen', (g, s, camera) => {
    if (!handOn || step === 'done' || s.phase !== 'ready' || s.aim || s.frozen) return
    const demo = step === 'leap' ? leapDemo : FALL_DEMO
    drawHandHint(g, camera, s, stage.maxDragPx(), demo.angle, demo.power, stage.time - handFrom)
  })

  function idleCheck(): void {
    if (step === 'done' || session.phase !== 'ready' || session.aim) {
      lastActive = stage.time
      return
    }
    if (stage.time - lastActive < IDLE_HINT_S) return
    lastActive = stage.time
    handOn = true
    handFrom = stage.time
    say(goatVoice().pick('lesson'))
  }

  // ---- What happens -------------------------------------------------------------------------
  const ev = session.events
  const unsubs = [
    ev.on('aimStart', () => {
      handOn = false
    }),
    ev.on('launch', (e) => sfx.whoosh(e.power)),
    ev.on('hop', () => {
      sfx.land(false)
      if (step !== 'done') say(goatVoice().pick('hop'), 3500)
    }),
    ev.on('land', (e) => {
      if (!e.isTop) sfx.land(e.kind === 'hold')
    }),
    ev.on('send', () => {
      // The lesson has no beta map: she stays up there either way.
      session.resumeAfterSend()
      sfx.land(false)
      // Only the first leap's landing moves the lesson on (after a missed first leap she may still
      // climb up for fun; that changes nothing).
      if (step !== 'leap') return
      // Step 1 done: she's up. Fall practice from here.
      sfx.chime()
      later(() => sfx.bleat('happy'), 250)
      step = 'fall'
      showStep()
      say(scriptedLine('lessonLanded'))
      later(() => {
        if (step !== 'fall') return
        say(scriptedLine('lessonFall'))
        handOn = true
        handFrom = stage.time
      }, 2000)
    }),
    ev.on('ropeCatch', () => {
      sfx.boing()
      later(() => sfx.bleat('wheee'), 240)
    }),
    ev.on('whipper', (e) => {
      const facts = recorder.whipper(e)
      if (step === 'done') {
        if (facts.newPose) cards.push(() => flopCard(e.poseId, look))
        say(goatVoice().pick('fall', {}, { whipper: e.kind }), 4000)
        badgeCards(facts.badges, cards)
        return
      }
      // The fall (a miss on step 1 counts too): the rope line, the flop card, then Next.
      step = 'done'
      showStep()
      handOn = false
      recorder.ropeExplained()
      say(scriptedLine('ropeFirst'))
      // The card always carries the word's definition here: this is where "whipper" is introduced.
      const def = firstMentionText('whipper', [])
      words.mark('whipper')
      later(() => {
        if (panel || destroyed) return
        panel = flopPanel(e.poseId, look, def, facts.badges, { isNew: facts.newPose })
        bottom.insertBefore(panel.el, next)
      }, 900)
      later(() => {
        next.hidden = false
      }, 1500)
    }),
  ]

  setClimbDebug({
    state: () => session.snapshot(),
    climberClient: () => stage.climberClient(),
    maxDragPx: () => stage.maxDragPx(),
    worldToClient: (x, y) => stage.worldToClient(x, y),
    levelId: () => 'lesson',
    pendingPrompt: () => null,
  })
  ambient.start('meadow')
  showStep()
  say(scriptedLine('lessonLeap'))

  return () => {
    destroyed = true
    cards.destroy()
    for (const id of timers) clearTimeout(id)
    for (const off of unsubs) off()
    setClimbDebug(null)
    ambient.stop()
    panel?.stop()
    bubble.destroy()
    stage.destroy()
  }
}

// ---------------------------------------------------------------------------------------------
// The hand: presses just outside her, pulls back along the leap's drag, holds, lets go.

const HAND_CYCLE = 2.8

function drawHandHint(
  g: CanvasRenderingContext2D,
  camera: Camera,
  s: ClimbSession,
  maxDrag: number,
  angle: number,
  power: number,
  age: number,
): void {
  const c = camera.worldToScreen(s.body.x, s.body.y + CLIMBER_CENTER)
  const a = (angle * Math.PI) / 180
  // Screen drag direction (y down): opposite the launch.
  const ux = -Math.cos(a)
  const uy = Math.sin(a)
  const len = power * maxDrag
  const start = Math.max(26, Math.min(48, 20 * camera.scale)) + 8
  const u = age % HAND_CYCLE
  const intro = age < 0.4 ? age / 0.4 : 1
  let k = 0
  let alpha = 1
  let lift = 0
  if (u < 0.3) {
    alpha = u / 0.3
    lift = (1 - u / 0.3) * 0.25
  } else if (u < 1.4) {
    const v = (u - 0.3) / 1.1
    k = v * v * (3 - 2 * v)
  } else if (u < 1.8) {
    k = 1
  } else if (u < 2.1) {
    k = 1
    const v = (u - 1.8) / 0.3
    alpha = 1 - v
    lift = v * 0.3
  } else return
  alpha *= intro
  const fx = c.x + ux * (start + len * k)
  const fy = c.y + uy * (start + len * k)
  g.save()
  // The band: a soft dashed line from her to the finger.
  if (k > 0.02) {
    g.globalAlpha = alpha * 0.75
    g.strokeStyle = 'rgba(255, 255, 255, 0.95)'
    g.lineWidth = 4
    g.lineCap = 'round'
    g.setLineDash([2, 9])
    g.beginPath()
    g.moveTo(c.x + ux * 14, c.y + uy * 14)
    g.lineTo(fx, fy)
    g.stroke()
    g.setLineDash([])
  }
  // Letting go: a few dots fly off the way she will leap.
  if (u >= 1.8 && u < 2.1) {
    const v = (u - 1.8) / 0.3
    g.fillStyle = 'rgba(255, 255, 255, 0.9)'
    for (let i = 0; i < 3; i++) {
      const d = 20 + v * 70 + i * 16
      g.globalAlpha = (1 - v) * (1 - i * 0.25)
      g.beginPath()
      g.arc(c.x - ux * d, c.y - uy * d - v * 10, 4 - i, 0, Math.PI * 2)
      g.fill()
    }
  }
  g.globalAlpha = alpha
  drawHand(g, fx, fy, 1.45 * (1 + lift), u >= 0.3 && u < 1.8)
  g.restore()
}

function rrect(g: CanvasRenderingContext2D, x: number, y: number, w: number, hgt: number, r: number): void {
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + hgt, r)
  g.arcTo(x + w, y + hgt, x, y + hgt, r)
  g.arcTo(x, y + hgt, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

/** A friendly cartoon hand, pointing finger at (x, y). */
function drawHand(g: CanvasRenderingContext2D, x: number, y: number, k: number, pressed: boolean): void {
  g.save()
  g.translate(x, y)
  if (pressed) {
    g.strokeStyle = 'rgba(255, 255, 255, 0.85)'
    g.lineWidth = 3
    g.beginPath()
    g.arc(0, 0, 15 * k * 0.8, 0, Math.PI * 2)
    g.stroke()
  }
  g.rotate(-0.42)
  g.scale(k, k)
  g.lineJoin = 'round'
  g.lineWidth = 1.7
  g.strokeStyle = '#5b4038'
  g.fillStyle = '#fffaf3'
  // Soft shadow under the hand.
  g.save()
  g.globalAlpha *= 0.22
  g.fillStyle = '#3d2a24'
  g.beginPath()
  rrect(g, -6, 17, 25, 27, 10)
  g.fill()
  g.restore()
  // Folded fingers and palm.
  g.beginPath()
  rrect(g, -8, 14, 25, 27, 10)
  g.fill()
  g.stroke()
  for (const [cx, cy, r] of [
    [12, 17, 5],
    [15.5, 23, 4.6],
    [15.8, 29.5, 4.2],
  ] as const) {
    g.beginPath()
    g.arc(cx, cy, r, 0, Math.PI * 2)
    g.fill()
    g.stroke()
  }
  // Thumb.
  g.save()
  g.translate(-7, 25)
  g.rotate(0.5)
  g.beginPath()
  g.ellipse(0, 0, 4.4, 8, 0, 0, Math.PI * 2)
  g.fill()
  g.stroke()
  g.restore()
  // The pointing finger.
  g.beginPath()
  rrect(g, -5.5, -1, 11, 25, 5.5)
  g.fill()
  g.stroke()
  // Fingernail.
  g.strokeStyle = 'rgba(91, 64, 56, 0.45)'
  g.lineWidth = 1.1
  g.beginPath()
  g.arc(0, 4, 2.6, Math.PI * 1.1, Math.PI * 1.9)
  g.stroke()
  g.restore()
}
