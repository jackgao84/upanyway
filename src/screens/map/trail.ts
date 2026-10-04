/**
 * The Trail Map's model and geometry, with no DOM: what each of the 16 pitch markers shows, where
 * her climber marker goes, and where everything sits on the map (normalised 0..1 coordinates, so
 * the picture and the buttons agree at any size).
 *
 * Marker states:
 * - day:   'sent' (a little flag) · 'open' (glowing, tap to climb) · 'hidden' (in soft fog).
 * - night: every pitch is open (night climbs open after the summit, or in test mode); 'sent' means
 *          sent by moonlight.
 * Her climber marker stands, by day, at the lowest open pitch she is partway up (a run waiting at a
 * camp) or hasn't sent yet (the highest open pitch once every open one is sent); at night, at the
 * first pitch she hasn't climbed by moonlight yet (the last one once she has climbed them all).
 */
import { PITCHES } from '../../game/levels'
import type { LevelId, ZoneId } from '../../game/types'
import { isNightOpen, isPitchOpen, stonesToOpen } from '../../model/unlocks'
import type { SaveData } from '../../storage/schema'

export type MarkerState = 'sent' | 'open' | 'hidden'

export interface PitchMarker {
  id: LevelId
  /** 1-based pitch number. */
  n: number
  title: string
  zone: ZoneId
  state: MarkerState
  /** Stones still needed (hidden markers only; 0 otherwise). */
  needs: number
  /** Her climber marker stands here. */
  current: boolean
}

export function trailMarkers(d: SaveData, night: boolean): PitchMarker[] {
  const nightMode = night && isNightOpen(d)
  const out: PitchMarker[] = PITCHES.map((level, i) => {
    const p = d.pitches[level.id]
    let state: MarkerState
    if (nightMode) state = (p?.nightSends ?? 0) > 0 ? 'sent' : 'open'
    else if (!isPitchOpen(d, level.id)) state = 'hidden'
    else state = (p?.sends ?? 0) > 0 ? 'sent' : 'open'
    return {
      id: level.id,
      n: i + 1,
      title: level.title,
      zone: level.zone,
      state,
      needs: state === 'hidden' ? stonesToOpen(d, level.id) : 0,
      current: false,
    }
  })
  let at: number
  if (nightMode) {
    at = out.findIndex((m) => m.state !== 'sent')
    if (at < 0) at = out.length - 1
  } else {
    // The pitch she is on (a run waiting at a camp) or the next one she hasn't sent, lowest first,
    // so the big Climb button never walks her away from a run or skips a pitch. Once every open
    // pitch is sent: the highest open one.
    at = out.findIndex((m) => m.state !== 'hidden' && (m.state !== 'sent' || !!d.pitches[m.id]?.run))
    if (at < 0) {
      out.forEach((m, i) => {
        if (m.state !== 'hidden') at = i
      })
    }
    if (at < 0) at = 0
  }
  out[at].current = true
  return out
}

// ---------------------------------------------------------------------------------------------
// Geometry (u: 0 = left edge … 1 = right edge; v: 0 = top … 1 = bottom)

export interface MapPt {
  u: number
  v: number
}

/** Where the trail starts (her camp at the foot) and ends (Sky Lake). */
export const CAMP_PT: MapPt = { u: 0.5, v: 0.955 }
export const LAKE_PT: MapPt = { u: 0.5, v: 0.11 }

const FIRST_V = 0.885
const LAST_V = 0.19
/** Within a zone pitches are one step apart; between zones, a bit more (the trail climbs a band). */
const ZONE_GAP = 2

/** How wide the mountain is at height v, as a fraction of the full width (narrower near the top). */
export function mountainWidthAt(v: number): number {
  const t = Math.max(0, Math.min(1, (v - LAST_V) / (FIRST_V - LAST_V)))
  return 0.58 + 0.42 * t
}

/**
 * The 16 marker positions: three to a zone, switching back and forth across the mountain
 * (left → right in one zone, right → left in the next), narrowing toward the top.
 */
export function markerPoints(): MapPt[] {
  const steps: number[] = [0]
  for (let i = 1; i < 16; i++) steps.push(steps[i - 1] + (i % 3 === 0 ? ZONE_GAP : 1))
  const total = steps[15]
  return steps.map((s, i) => {
    const v = FIRST_V - (s / total) * (FIRST_V - LAST_V)
    const zone = Math.floor(i / 3)
    const k = i % 3
    // The summit pitch (the 16th) sits in the middle, under the lake.
    const side = i === 15 ? 0 : (k - 1) * (zone % 2 === 0 ? 1 : -1)
    const wobble = i === 15 ? 0 : [0.015, -0.01, 0.02, -0.015, 0.01][zone] * (k === 1 ? 1 : 0)
    return { u: 0.5 + side * 0.25 * mountainWidthAt(v) + wobble, v }
  })
}

/** Which side of the mountain a marker sits on (the middle one of each zone, and the summit's, sit in the middle). */
export function markerSide(i: number): 'left' | 'right' | null {
  if (i >= 15 || i % 3 === 1) return null
  const leftFirst = Math.floor(i / 3) % 2 === 0
  return (i % 3 === 0) === leftFirst ? 'left' : 'right'
}

/** The v where one zone's band meets the next (between its last pitch and the next zone's first). */
export function zoneBounds(points: readonly MapPt[]): number[] {
  const out: number[] = []
  for (let z = 1; z <= 5; z++) {
    const below = points[z * 3 - 1]
    const above = points[Math.min(15, z * 3)]
    out.push((below.v + above.v) / 2)
  }
  return out
}

/** The whole trail, foot to lake: camp, the 16 pitches, Sky Lake. */
export function trailPoints(points: readonly MapPt[]): MapPt[] {
  return [CAMP_PT, ...points, LAKE_PT]
}
