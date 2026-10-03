/**
 * The render loop's frame delta. Physics runs in fixed TUNING.dt steps (engine.update), and the
 * renderer draws the body at its last step (no interpolation), so the number of steps per frame must
 * stay even for motion to look smooth.
 */
import { TUNING } from './tuning'

/** Longest frame the session will catch up on (a stall or a backgrounded tab), in seconds. */
export const MAX_FRAME_DT = 0.1

/**
 * The real delta between two rAF timestamps (ms), in seconds, snapped to whole physics steps when it
 * is within 2 ms of them. Safari gives rAF times in whole milliseconds (16, 17, 16… at 60 Hz); an
 * unsnapped 1/120 s accumulator would then run 1, 2 or 3 steps a frame and every leap would judder.
 * Snapped, a 60 Hz frame is always exactly 2 steps and a 120 Hz one exactly 1. Physics stays
 * deterministic: only how the fixed steps are grouped into frames changes. `lastMs < 0`: first frame.
 */
export function frameDelta(lastMs: number, ms: number): number {
  if (lastMs < 0) return 1 / 60
  const raw = (ms - lastMs) / 1000
  const dt = raw < 0 ? 0 : raw > MAX_FRAME_DT ? MAX_FRAME_DT : raw
  const q = Math.round(dt / TUNING.dt)
  return q >= 1 && Math.abs(dt - q * TUNING.dt) < 0.002 ? q * TUNING.dt : dt
}
