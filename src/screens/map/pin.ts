/**
 * Her climber marker on the Trail Map: a round "you are here" pin with her face and the goat — peeking
 * out of the backpack until Sky Lake, then standing at her side. Painted once (it bobs with CSS).
 */
import { fitBox, releaseCanvas, type Box } from '../../app/context'
import { climberGoatAnchor, drawClimber } from '../../game/art/climber'
import { drawGoat } from '../../game/art/goat'
import { stand } from '../../game/art/poses'
import { RIG, solvePose } from '../../game/art/rig'
import { TUNING } from '../../game/tuning'
import type { ClimberLook } from '../../storage/schema'
import { h } from '../../ui/dom'

export interface MapPin {
  el: HTMLElement
  destroy(): void
}

/** Pixel size of the round portrait (CSS px). */
const PIN_PX = 58

function portraitBox(goatOut: boolean): Box {
  const sk = solvePose(stand())
  const r = RIG.headR
  const top = sk.head.y - r - 9
  const bottom = sk.neck.y + 10
  if (goatOut) return { minX: sk.head.x - r - 5, maxX: sk.head.x + r + 21, minY: top - 2, maxY: bottom + 2 }
  const goat = climberGoatAnchor(stand(), 1)
  return { minX: Math.min(sk.head.x - r - 4, goat.x - 12), maxX: sk.head.x + r + 6, minY: Math.min(top, goat.y - 30), maxY: bottom }
}

function paint(canvas: HTMLCanvasElement, look: ClimberLook, goatOut: boolean): void {
  const dpr = Math.min(TUNING.maxDpr, Math.max(1, window.devicePixelRatio || 1))
  const px = Math.round(PIN_PX * dpr)
  canvas.width = px
  canvas.height = px
  const g = canvas.getContext('2d')
  if (!g) return
  fitBox(g, { w: PIN_PX, h: PIN_PX, dpr }, portraitBox(goatOut), 0.04)
  drawClimber(g, {
    look,
    pose: stand(),
    expression: 'happy',
    facing: 1,
    t: 0.6,
    goat: goatOut ? null : { mood: 'peek', t: 0.6, inBackpack: true },
  })
  if (goatOut) {
    const sk = solvePose(stand())
    g.save()
    g.translate(sk.head.x + RIG.headR + 13, sk.neck.y + 14)
    g.scale(0.9, 0.9)
    drawGoat(g, { mood: 'happy', t: 0.6, inBackpack: !goatOut, facing: -1 })
    g.restore()
  }
}

export function mapPin(look: ClimberLook, goatOut: boolean, label: string): MapPin {
  const canvas = h('canvas', { class: 'trail-me__art', 'aria-hidden': 'true' })
  const el = h('div', { class: 'trail-me', role: 'img', 'aria-label': label }, h('span', { class: 'trail-me__bubble' }, canvas))
  paint(canvas, look, goatOut)
  return {
    el,
    destroy() {
      releaseCanvas(canvas)
    },
  }
}
