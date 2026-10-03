/**
 * The Sky Lake finale (#/finale). Her first send of the summit pitch ends here: the whole mountain
 * from the top, then Sky Lake, where the goat climbs out of the backpack for the very first time,
 * makes its own wobbly leap, flops into the lake, and they both laugh. A short warm card, then camp.
 *
 * Routes:
 *   #/finale            the first time (after the summit pitch's Beta Map): records the summit when
 *                       the card comes up — summit.reached (+ at) and summit.finaleSeen.
 *   #/finale?replay=1   watch it again (Trail Map, the card's "Watch again"): records nothing.
 *   #/finale?night=1    the short moonlight ending after a night send of the summit pitch: both of them
 *                       splash in together. Records nothing.
 * It always plays, even when the day's climbing time ran out on that send (the climb screen goes
 * here instead of the sunset card); the finale itself never counts climbing time.
 *
 * Guards: the day finale needs the summit reached (or test mode); the night ending needs night
 * climbs open and the day finale seen (or test mode). Anything else goes to camp. Once finaleSeen
 * is set, #/finale plays as a replay. Test mode never writes (Decision 21).
 */
import './finale/finale.css'
import { save } from '../app/context'
import type { Screen } from '../app/router'
import { isGoatOut, isNightOpen } from '../model/unlocks'
import { FinalePlay } from './finale/play'

export interface FinaleRouteOpts {
  /** The moonlight ending (after a night send of the summit pitch). */
  night?: boolean
  /** Watch it again: plays the same, writes nothing. */
  replay?: boolean
}

/** The app path for the finale, e.g. finalePath({ replay: true }) → '/finale?replay=1'. */
export function finalePath(opts: FinaleRouteOpts = {}): string {
  const q: string[] = []
  if (opts.night) q.push('night=1')
  if (opts.replay) q.push('replay=1')
  return q.length ? `/finale?${q.join('&')}` : '/finale'
}

/**
 * Can the finale (or its night ending) be shown for this save? The night ending shows the goat out of
 * the pack, so it waits until the day finale has been seen (the goat's first time out).
 */
export function canShowFinale(night: boolean): boolean {
  const d = save()
  return night ? isNightOpen(d) && isGoatOut(d) : d.summit.reached || d.testMode
}

export const finaleScreen: Screen = (root, ctx) => {
  const night = ctx.query.get('night') === '1'
  if (!canShowFinale(night)) {
    ctx.navigate('/camp', { replace: true })
    return
  }
  const d = save()
  const replay = ctx.query.get('replay') === '1'
  const play = new FinalePlay(root, {
    night,
    record: !night && !replay && !d.testMode && !d.summit.finaleSeen,
    navigate: ctx.navigate,
    againPath: finalePath({ night, replay: true }),
  })
  return () => play.destroy()
}
