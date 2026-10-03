/** Typed events the climb engine emits. The climb screen turns them into saves, sounds, goat lines. */

export type WhipperKind = 'rope' | 'slip' | 'crumble'

export interface LandInfo {
  id: string
  kind: 'ledge' | 'hold'
  x: number
  y: number
  /** Index in level.route, or null when off-route. */
  routeIndex: number | null
  isCamp: boolean
  /** Landed on the pitch top: the send. */
  isTop: boolean
  /** The leap's arc (flattened world x,y). */
  arc: number[]
  /** This leap was a Big Leap (from → to) that landed on its target. */
  bigLeap: boolean
  /** A new highest camp this run (rope now anchors here). */
  newCamp: boolean
}

export interface EngineEvents {
  aimStart: { bigLeap: boolean }
  aimCancel: Record<string, never>
  launch: { fromId: string; angle: number; power: number; bigLeap: boolean; towardBigLeapTarget: boolean }
  /** A successful leap ended on a ledge (stand) or hold (hang). */
  land: LandInfo
  /** Landed back where she started: no count either way. */
  hop: { id: string }
  /** A failed leap: every whipper gets chalk, a pose and counts as an attempt. */
  whipper: {
    kind: WhipperKind
    spotId: string
    arc: number[]
    poseId: string
    landedId: string | null
    /** The launch that failed (null for a crumble collapse). */
    launch: { angle: number; power: number } | null
    /** Touched the side of a ledge that wasn't where she was heading. */
    bumped: boolean
    /** A gust pushed her during the flight. */
    gusted: boolean
  }
  /** The rope has her and is swinging her back to camp. */
  ropeCatch: { campId: string }
  /** In play again (after landing settle, rope reel, or flop). */
  ready: { id: string }
  /** Hidden holds spotted on the way down. */
  reveal: { ids: string[] }
  crumbleStart: { id: string }
  crumbled: { id: string }
  crumbleRestored: { ids: string[] }
  /** First time she stands on a crumbly ledge (it now draws cracked). */
  crumbleFound: { id: string }
  gust: { zoneId: string; starting: boolean }
  send: { arc: number[] }
}

export type EngineEventName = keyof EngineEvents
type Handler<K extends EngineEventName> = (payload: EngineEvents[K]) => void

export class Emitter {
  private handlers = new Map<EngineEventName, Set<Handler<EngineEventName>>>()

  on<K extends EngineEventName>(name: K, fn: Handler<K>): () => void {
    let set = this.handlers.get(name)
    if (!set) {
      set = new Set()
      this.handlers.set(name, set)
    }
    set.add(fn as Handler<EngineEventName>)
    return () => set!.delete(fn as Handler<EngineEventName>)
  }

  emit<K extends EngineEventName>(name: K, payload: EngineEvents[K]): void {
    const set = this.handlers.get(name)
    if (!set) return
    for (const fn of [...set]) (fn as Handler<K>)(payload)
  }

  clear(): void {
    this.handlers.clear()
  }
}
