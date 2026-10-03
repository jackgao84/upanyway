/**
 * The goat's little face beside its speech bubble in the finale. Until it climbs out, it peeks over
 * the backpack's rim (like everywhere else in the game); once it is out it is just the goat, and in
 * the lake it bobs with a ring of water round it.
 */
import { animate, fitBox, releaseCanvas, sizeCanvas, type Box } from '../../app/context'
import { drawPackWithGoat } from '../../game/art/climber'
import { drawGoat, type GoatMood as ArtGoatMood } from '../../game/art/goat'
import type { ClimberLook } from '../../storage/schema'
import { h } from '../../ui/dom'
import type { GoatAvatar, GoatMood } from '../../ui/goatBubble'

export type GoatWhere = 'pack' | 'out' | 'swim'

export type FinaleAvatar = GoatAvatar & { setWhere(where: GoatWhere): void }

const BUBBLE_TO_ART: Record<GoatMood, ArtGoatMood> = {
  calm: 'peek',
  happy: 'happy',
  scared: 'nervous',
  giggly: 'laugh',
  wobbly: 'wobbly',
}

export function finaleAvatar(look: ClimberLook, where: GoatWhere = 'pack'): FinaleAvatar {
  const canvas = h('canvas', { class: 'goat-avatar', 'aria-hidden': 'true' })
  const el = h('span', { class: 'goat-avatar-wrap' }, canvas) as FinaleAvatar
  let mood: ArtGoatMood = 'happy'
  let place: GoatWhere = where
  let moodAt = 0
  let lastT = 0
  const packBox: Box = { minX: -14, minY: -42, maxX: 15, maxY: -9 }
  const headBox: Box = { minX: -12, minY: -25, maxX: 14, maxY: 3 }
  const loop = animate(
    canvas,
    (t) => {
      lastT = t
      const size = sizeCanvas(canvas)
      const ctx = canvas.getContext('2d')
      if (!size || !ctx) return
      const pop = Math.max(0, 1 - (t - moodAt) * 3)
      if (place === 'pack') {
        fitBox(ctx, size, packBox, 0.02)
        ctx.translate(0, -pop * 1.5)
        drawPackWithGoat(ctx, look, { mood, t, inBackpack: true, earFlap: mood === 'happy' ? 0.3 * pop : 0 })
        return
      }
      fitBox(ctx, size, headBox, 0.02)
      if (place === 'swim') {
        ctx.fillStyle = 'rgba(120, 190, 220, 0.55)'
        ctx.fillRect(-20, 0, 40, 10)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)'
        ctx.lineWidth = 0.9
        ctx.beginPath()
        ctx.ellipse(0.5, 0.4, 11, 2.2, 0, 0, Math.PI * 2)
        ctx.stroke()
      }
      ctx.translate(0, -pop * 1.5 + (place === 'swim' ? Math.sin(t * 2.6) * 0.5 : 0))
      // Head and shoulders, the same drawing as over the rim — with no backpack round it.
      drawGoat(ctx, { mood, t, inBackpack: true, earFlap: mood === 'happy' ? 0.3 * pop : 0 })
    },
    { fps: 30 },
  )
  el.setMood = (m: GoatMood) => {
    mood = BUBBLE_TO_ART[m]
    moodAt = lastT
    loop.redraw()
  }
  el.setWhere = (w: GoatWhere) => {
    if (w === place) return
    place = w
    loop.redraw()
  }
  el.destroy = () => {
    loop.stop()
    releaseCanvas(canvas)
  }
  return el
}
