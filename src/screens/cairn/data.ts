/**
 * What the cairn shows, read from the save: the placed stones in cairn order, the waiting stones
 * (oldest first), and their labels for screen readers. Pure, no DOM — the Cairn screen and the
 * grown-ups' "read her cairn" page can both use it.
 */
import { PITCH_IDS } from '../../game/types'
import { dayKey } from '../../model/clock'
import { BRAVE_STONES_PER_DAY, LETTER_STONES_PER_DAY, stoneOrder, waitingStones } from '../../model/stones'
import { trailReach } from '../../model/unlocks'
import type { BraveThing, Letter, SaveData } from '../../storage/schema'
import { CAIRN_COPY } from './copy'
import type { SceneStone } from './scene'

export interface CairnStones {
  /** On the cairn, in the order they went on. */
  placed: SceneStone[]
  /** Waiting beside the pile (over a daily cap), oldest first. */
  waiting: SceneStone[]
}

function isBrave(s: BraveThing | Letter): s is BraveThing {
  return 'status' in s
}

/** When a stone was earned: done (brave thing) or opened (letter), else when it was written. */
export function earnedAt(s: BraveThing | Letter): number {
  const iso = isBrave(s) ? s.doneAt : s.openedAt
  const t = iso ? Date.parse(iso) : NaN
  if (Number.isFinite(t)) return t
  const c = Date.parse(s.createdAt)
  return Number.isFinite(c) ? c : 0
}

/** A placed stone that waited beside the cairn first (earned on an earlier day than it went on). */
export function didWait(s: BraveThing | Letter): boolean {
  if (!s.stoneDay) return false
  return dayKey(new Date(earnedAt(s))) < s.stoneDay
}

/** Find a stone's record (brave thing or letter) by id. */
export function stoneRecord(d: SaveData, id: string): BraveThing | Letter | undefined {
  return d.brave.find((b) => b.id === id) ?? d.letters.find((l) => l.id === id)
}

function letterWho(l: Letter): string {
  return l.from.trim()
}

/** Every stone of the cairn, with screen-reader labels. */
export function cairnStones(d: SaveData): CairnStones {
  const c = CAIRN_COPY
  const placed: SceneStone[] = stoneOrder(d).map((ref, i) => {
    const rec = stoneRecord(d, ref.id)
    const what = !rec ? '' : isBrave(rec) ? rec.text : c.letterStoneLabel(letterWho(rec))
    return { id: ref.id, kind: ref.kind, label: c.stoneLabel(i + 1, what) }
  })
  const waiting: SceneStone[] = waitingStones(d).map((s) => ({
    id: s.id,
    kind: isBrave(s) ? 'brave' : 'letter',
    label: c.waitingLabel(isBrave(s) ? s.text : c.letterStoneLabel(letterWho(s))),
  }))
  return { placed, waiting }
}

/**
 * The waiting list as it stood before `hopIds` went on: those stones (they were the oldest) plus the
 * ones still waiting, oldest first. Where the hopping stones jump from.
 */
export function waitingBefore(d: SaveData, hopIds: readonly string[], waiting: readonly SceneStone[]): SceneStone[] {
  const c = CAIRN_COPY
  const list: { s: SceneStone; at: number; order: number }[] = []
  hopIds.forEach((id, i) => {
    const rec = stoneRecord(d, id)
    if (!rec) return
    const kind = isBrave(rec) ? 'brave' : 'letter'
    const label = c.waitingLabel(isBrave(rec) ? rec.text : c.letterStoneLabel(letterWho(rec)))
    list.push({ s: { id, kind, label }, at: earnedAt(rec), order: i })
  })
  waiting.forEach((s, i) => {
    const rec = stoneRecord(d, s.id)
    list.push({ s, at: rec ? earnedAt(rec) : Infinity, order: hopIds.length + i })
  })
  list.sort((a, b) => a.at - b.at || a.order - b.order)
  return list.map((x) => x.s)
}

/**
 * The cairn's line about the trail, with `stones` on the cairn (it counts up as stones land):
 * - 'all': every pitch is open (or test mode);
 * - 'open': the trail is open to Pitch `pitch`, as far as the stones reach;
 * - 'found': the stones reach Pitch `pitch`, but a pitch below it still needs climbing first
 *   (Decision 5: a pitch needs its stones AND the pitch below sent).
 */
export type TrailLine = { kind: 'all' } | { kind: 'open' | 'found'; pitch: number }

export function trailLine(d: SaveData, stones: number): TrailLine {
  const reach = trailReach(d, stones)
  if (reach.open >= PITCH_IDS.length) return { kind: 'all' }
  if (reach.open >= reach.stones) return { kind: 'open', pitch: reach.open }
  return { kind: 'found', pitch: reach.stones }
}

/** Same line? (The cairn lights the line up when a landing stone changes it.) */
export function sameTrailLine(a: TrailLine, b: TrailLine): boolean {
  return a.kind === b.kind && (a.kind === 'all' || (b.kind !== 'all' && a.pitch === b.pitch))
}

export type WaitingWhen = 'tomorrow' | 'later'

/**
 * When a waiting stone goes on: 'tomorrow' if it fits tomorrow's room (waiting stones go first,
 * oldest first, three brave stones and one letter stone a day), else 'later'. Null if it isn't
 * waiting.
 */
export function waitingWhen(d: SaveData, id: string): WaitingWhen | null {
  let brave = BRAVE_STONES_PER_DAY
  let letter = LETTER_STONES_PER_DAY
  for (const s of waitingStones(d)) {
    const isLetter = !('status' in s)
    const fits = isLetter ? letter > 0 : brave > 0
    if (isLetter && fits) letter--
    if (!isLetter && fits) brave--
    if (s.id === id) return fits ? 'tomorrow' : 'later'
  }
  return null
}
