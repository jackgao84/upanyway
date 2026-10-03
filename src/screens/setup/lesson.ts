/**
 * First run, kid step 4: the 20-second lesson. The full-bleed `[data-lesson-stage]` is where the
 * climb engine mounts. Until it does, the stage plays a short picture of each step (drag back and
 * let go; the rope catches a fall), the goat explains, and a big Next moves on.
 */
import { animate, goatAvatar, releaseCanvas, save, update } from '../../app/context'
import type { Screen } from '../../app/router'
import { GOAT_SETUP, SETUP_COPY } from '../../content/copy'
import { drawClimber, type Expression } from '../../game/art/climber'
import type { GoatMood } from '../../game/art/goat'
import { crouch, fall, fly, idle, land } from '../../game/art/poses'
import { clamp01, easeInOutSine, type Pose } from '../../game/art/rig'
import { TUNING } from '../../game/tuning'
import type { ClimberLook } from '../../storage/schema'
import { button } from '../../ui/components'
import { h, prefersReducedMotion } from '../../ui/dom'
import { goatBubble } from '../../ui/goatBubble'
import { icon } from '../../ui/icons'
import './common'

interface Ledge {
  x: number
  y: number
  w: number
}

/** World units, y-up, like the climb. */
const LEDGE_A: Ledge = { x: 92, y: 200, w: 120 }
const LEDGE_B: Ledge = { x: 248, y: 330, w: 120 }
const START = { x: 150, y: 200 }
const TARGET = { x: 300, y: 330 }
const APEX = 95
const LOOP_S = 3.6
const ROPE_LEN = 120

interface View {
  w: number
  h: number
  dpr: number
  s: number
  bg: HTMLCanvasElement
}

function makeView(canvas: HTMLCanvasElement): View | null {
  const w = canvas.clientWidth
  const hgt = canvas.clientHeight
  if (!w || !hgt) return null
  const dpr = Math.min(TUNING.maxDpr, Math.max(1, window.devicePixelRatio || 1))
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(hgt * dpr)
  // The action spans about 400 × 400 units; leave ~300 px for the HUD above and the goat below.
  const s = Math.max(0.6, Math.min(w / 400, (hgt - 300) / 400))
  const bg = document.createElement('canvas')
  bg.width = Math.max(1, Math.round(w))
  bg.height = Math.max(1, Math.round(hgt))
  const g = bg.getContext('2d')
  if (g) paintBackground(g, w, hgt)
  return { w, h: hgt, dpr, s, bg }
}

/** Morning meadow sky with paper-cut hills (painted once per size). */
function paintBackground(g: CanvasRenderingContext2D, w: number, hgt: number): void {
  const sky = g.createLinearGradient(0, 0, 0, hgt)
  sky.addColorStop(0, '#bfe3f0')
  sky.addColorStop(0.55, '#fff0dc')
  sky.addColorStop(1, '#ffdcc0')
  g.fillStyle = sky
  g.fillRect(0, 0, w, hgt)
  g.fillStyle = 'rgba(255, 220, 140, 0.55)'
  g.beginPath()
  g.arc(w * 0.82, hgt * 0.16, Math.min(w, hgt) * 0.08, 0, Math.PI * 2)
  g.fill()
  const hill = (base: number, amp: number, phase: number, color: string) => {
    g.fillStyle = color
    g.beginPath()
    g.moveTo(0, hgt)
    for (let x = 0; x <= w + 20; x += 20) {
      g.lineTo(x, hgt * base - Math.sin(x / (w * 0.22) + phase) * amp - Math.sin(x / (w * 0.09) + phase * 2) * amp * 0.25)
    }
    g.lineTo(w, hgt)
    g.closePath()
    g.fill()
  }
  hill(0.62, hgt * 0.05, 0.4, '#e6dcf2')
  hill(0.74, hgt * 0.04, 1.7, '#cfe5bd')
  hill(0.86, hgt * 0.03, 2.9, '#a9d18e')
}

function toScreen(v: View, x: number, y: number): [number, number] {
  return [v.w / 2 + (x - 215) * v.s, v.h / 2 - (y - 228) * v.s]
}

function drawLedge(g: CanvasRenderingContext2D, v: View, l: Ledge, camp: boolean): void {
  const [x, y] = toScreen(v, l.x, l.y)
  const w = l.w * v.s
  const hh = 26 * v.s
  g.fillStyle = '#c9a582'
  g.beginPath()
  g.moveTo(x, y)
  g.lineTo(x + w, y)
  g.quadraticCurveTo(x + w - 6 * v.s, y + hh, x + w * 0.5, y + hh * 1.1)
  g.quadraticCurveTo(x + 6 * v.s, y + hh, x, y)
  g.fill()
  g.fillStyle = '#7fb069'
  g.beginPath()
  g.ellipse(x + w / 2, y + 1, w / 2 + 2 * v.s, 5 * v.s, 0, 0, Math.PI * 2)
  g.fill()
  if (camp) {
    // A little flag marks the camp (where the rope is tied).
    const fx = x + 10 * v.s
    g.strokeStyle = '#6c5048'
    g.lineWidth = Math.max(1.5, 1.4 * v.s)
    g.beginPath()
    g.moveTo(fx, y)
    g.lineTo(fx, y - 30 * v.s)
    g.stroke()
    g.fillStyle = '#e8735a'
    g.beginPath()
    g.moveTo(fx, y - 30 * v.s)
    g.lineTo(fx + 16 * v.s, y - 25 * v.s)
    g.lineTo(fx, y - 20 * v.s)
    g.fill()
  }
}

function arcPoint(u: number): [number, number] {
  return [START.x + (TARGET.x - START.x) * u, START.y + (TARGET.y - START.y) * u + 4 * APEX * u * (1 - u)]
}

function drawFigure(
  g: CanvasRenderingContext2D,
  v: View,
  look: ClimberLook,
  feet: [number, number],
  pose: Pose,
  expression: Expression,
  goat: GoatMood,
  t: number,
  rot = 0,
): void {
  g.save()
  g.translate(feet[0] * v.dpr, feet[1] * v.dpr)
  g.scale(v.s * v.dpr, v.s * v.dpr)
  if (rot) g.rotate(rot)
  drawClimber(g, { look, pose, expression, facing: 1, t, goat: { mood: goat, t, inBackpack: true, earFlap: goat === 'wheee' ? 1 : undefined } })
  g.restore()
}

/** Step 1: drag back (the band and dotted preview), let go, fly, land. */
function paintLeap(g: CanvasRenderingContext2D, v: View, look: ClimberLook, t: number): void {
  const k = t % LOOP_S
  const aimEnd = 1.5
  const flyEnd = 2.2
  drawLedge(g, v, LEDGE_A, true)
  drawLedge(g, v, LEDGE_B, false)
  const start = toScreen(v, START.x, START.y)
  if (k < aimEnd) {
    const pull = easeInOutSine(clamp01(k / 1.1))
    const dirX = -0.55
    const dirY = 0.83
    const len = (40 + pull * 70) * v.s
    const hip = [start[0], start[1] - 22 * v.s]
    const finger = [hip[0] + dirX * len, hip[1] + dirY * len]
    // Dotted preview: the first part of the flight.
    g.fillStyle = 'rgba(61, 42, 36, 0.55)'
    for (let u = 0.04; u <= 0.4 * (0.4 + pull * 0.6); u += 0.035) {
      const [x, y] = toScreen(v, ...arcPoint(u))
      g.beginPath()
      g.arc(x * v.dpr, (y - 22 * v.s) * v.dpr, 3.2 * v.dpr, 0, Math.PI * 2)
      g.fill()
    }
    drawFigure(g, v, look, start, crouch(pull, 58, 1), 'determined', pull > 0.5 ? 'gulp' : 'peek', t)
    // The band from her to the finger, and the finger itself.
    g.strokeStyle = 'rgba(232, 115, 90, 0.75)'
    g.lineWidth = 4 * v.dpr
    g.lineCap = 'round'
    g.beginPath()
    g.moveTo(hip[0] * v.dpr, hip[1] * v.dpr)
    g.lineTo(finger[0] * v.dpr, finger[1] * v.dpr)
    g.stroke()
    g.fillStyle = 'rgba(255, 255, 255, 0.75)'
    g.strokeStyle = 'rgba(76, 143, 172, 0.9)'
    g.lineWidth = 3 * v.dpr
    g.beginPath()
    g.arc(finger[0] * v.dpr, finger[1] * v.dpr, 20 * v.dpr, 0, Math.PI * 2)
    g.fill()
    g.stroke()
    return
  }
  if (k < flyEnd) {
    const u = (k - aimEnd) / (flyEnd - aimEnd)
    const p = toScreen(v, ...arcPoint(u))
    drawFigure(g, v, look, p, fly(k), 'scared-but-going', 'cover-eyes', t)
    return
  }
  const after = k - flyEnd
  const p = toScreen(v, TARGET.x, TARGET.y)
  drawFigure(g, v, look, p, after < 0.4 ? land(after / 0.4) : idle(t), 'proud', 'happy', t)
}

/** Step 2: a fall on purpose. The rope (tied at camp) catches her and she swings, giggling. */
function paintRope(g: CanvasRenderingContext2D, v: View, look: ClimberLook, t: number): void {
  drawLedge(g, v, LEDGE_A, true)
  drawLedge(g, v, LEDGE_B, false)
  const anchor = toScreen(v, LEDGE_A.x + LEDGE_A.w - 8, LEDGE_A.y)
  const swing = Math.sin(t * 2.1) * 0.5
  const harness: [number, number] = [anchor[0] + Math.sin(swing) * ROPE_LEN * v.s, anchor[1] + Math.cos(swing) * ROPE_LEN * v.s]
  g.strokeStyle = '#e2725b'
  g.lineWidth = Math.max(2, 2.2 * v.s) * v.dpr
  g.lineCap = 'round'
  g.beginPath()
  g.moveTo(anchor[0] * v.dpr, anchor[1] * v.dpr)
  g.quadraticCurveTo(
    ((anchor[0] + harness[0]) / 2 + swing * 10 * v.s) * v.dpr,
    ((anchor[1] + harness[1]) / 2) * v.dpr,
    harness[0] * v.dpr,
    harness[1] * v.dpr,
  )
  g.stroke()
  g.fillStyle = '#6c5048'
  g.beginPath()
  g.arc(anchor[0] * v.dpr, anchor[1] * v.dpr, 4 * v.dpr, 0, Math.PI * 2)
  g.fill()
  // Feet hang 14.5 units below the harness (her hips), turned with the swing.
  const feet: [number, number] = [harness[0] - Math.sin(swing) * 14.5 * v.s, harness[1] + Math.cos(swing) * 14.5 * v.s]
  drawFigure(g, v, look, feet, fall(t), 'laughing', 'wheee', t, -swing * 0.6)
}

export const lessonScreen: Screen = (root, ctx) => {
  const c = SETUP_COPY.lesson
  const d = save()
  const look = d.profile.look
  let step = 0

  const canvas = h('canvas', { class: 'lesson__canvas', 'aria-hidden': 'true' })
  const stage = h('div', { class: 'lesson__stage stage', dataset: { lessonStage: '' } }, canvas)
  const pills = c.steps.map((text, i) =>
    h('li', { class: 'lesson__step' }, h('span', { class: 'lesson__num' }, String(i + 1)), h('span', null, text)),
  )
  const bubble = goatBubble({ avatar: () => goatAvatar(look), name: d.profile.goatName, tapToHide: false })
  const next = button(c.next, {
    size: 'big',
    iconEnd: 'next',
    class: 'lesson__next',
    onClick: () => {
      if (step < c.steps.length - 1) {
        step++
        show()
        return
      }
      update((draft) => {
        draft.lessonDone = true
        // The goat has told her why the rope is there (its line on the fall step).
        draft.flags.ropeExplained = true
      })
      ctx.navigate('/setup/brave')
    },
  })

  function show(): void {
    pills.forEach((p, i) => {
      p.classList.toggle('is-current', i === step)
      p.classList.toggle('is-done', i < step)
      p.setAttribute('aria-current', i === step ? 'step' : 'false')
    })
    const line = GOAT_SETUP.lesson[step]
    bubble.say(line.text, { mood: line.mood, durationMs: 0 })
    loop.redraw()
  }

  root.appendChild(
    h(
      'div',
      { class: 'lesson setup' },
      stage,
      h(
        'div',
        { class: 'hud' },
        h(
          'div',
          { class: 'hud__top' },
          h('div', { class: 'lesson__head' }, h('h1', { class: 'lesson__title' }, icon('rope', 26), c.title), h('ol', { class: 'lesson__steps' }, ...pills)),
        ),
        h('div', { class: 'hud__bottom lesson__bottom' }, h('div', { class: 'lesson__bubble' }, bubble.el), next),
      ),
    ),
  )

  let view: View | null = null
  // A new size means a new backdrop: give the old one's memory back first.
  const rebuild = () => {
    if (view) releaseCanvas(view.bg)
    view = makeView(canvas)
  }
  const resize = () => {
    rebuild()
    loop.redraw()
  }
  const loop = animate(canvas, (t) => {
    if (!view || view.w !== canvas.clientWidth || view.h !== canvas.clientHeight) rebuild()
    const v = view
    const g = canvas.getContext('2d')
    if (!v || !g) return
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.drawImage(v.bg, 0, 0, canvas.width, canvas.height)
    // A still picture (reduced motion) shows the pull-back mid-way, not before it starts.
    const tt = prefersReducedMotion() ? 0.9 : t
    if (step === 0) paintLeap(g, v, look, tt)
    else paintRope(g, v, look, tt)
  })
  window.addEventListener('resize', resize)
  show()

  return () => {
    window.removeEventListener('resize', resize)
    loop.stop()
    bubble.destroy()
    releaseCanvas(canvas)
    if (view) releaseCanvas(view.bg)
  }
}
