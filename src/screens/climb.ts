/**
 * The climb (#/climb/:id, #/climb/:id?night=1). Full-bleed canvas + HUD; everything that happens on
 * the rock lives in climb/play.ts (machinery in climb/stage.ts).
 *
 * Guards: an unknown pitch (or the lesson, which belongs to the first run) goes to camp; a pitch that
 * isn't open yet shows "The trail ahead is hidden." with what still opens it (a stone, the pitch
 * below, or both — model/unlocks.ts lockReason) and a way back to camp; ?night=1 only once night
 * climbs are open (after the summit, or in test mode) — otherwise it is a day climb.
 */
import './climb/climb.css'
import { save } from '../app/context'
import { setClimbDebug } from '../debug'
import type { Screen } from '../app/router'
import { getLevel } from '../game/levels'
import { PITCH_IDS, type LevelId } from '../game/types'
import { isNightOpen, lockReason, pitchNumber } from '../model/unlocks'
import { lockedPrompt } from './climb/prompts'
import { ClimbPlay } from './climb/play'

export const climbScreen: Screen = (root, ctx) => {
  const id = ctx.params.id as LevelId
  const level = PITCH_IDS.includes(id as (typeof PITCH_IDS)[number]) ? getLevel(id) : undefined
  if (!level) {
    ctx.navigate('/camp', { replace: true })
    return
  }
  const d = save()
  const night = ctx.query.get('night') === '1' && isNightOpen(d)
  const hidden = night ? null : lockReason(d, level.id)
  if (hidden) {
    const below = hidden.needPitch ? pitchNumber(hidden.needPitch) : 0
    const p = lockedPrompt(hidden.needStones, below, () => ctx.navigate('/camp', { replace: true }))
    // No climb behind the card, but tests (and a curious grown-up) can still tell which card it is.
    setClimbDebug({
      state: () => null,
      climberClient: () => null,
      maxDragPx: () => 0,
      worldToClient: () => null,
      levelId: () => level.id,
      pendingPrompt: () => 'locked',
    })
    return () => {
      setClimbDebug(null)
      p.close()
    }
  }
  const play = new ClimbPlay(root, { level, night, navigate: ctx.navigate })
  return () => play.destroy()
}
