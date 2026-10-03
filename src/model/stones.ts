/**
 * Brave things, letters and the cairn's stones (Decision 6).
 *
 * - One stone per done brave thing, whatever the forecast, "really" or outcome: placement never reads
 *   them. At most BRAVE_STONES_PER_DAY brave-thing stones per local day.
 * - One bonus stone per opened letter, at most LETTER_STONES_PER_DAY per day.
 * - Over the cap a stone waits (`stoneDay = null`) and is placed, oldest first, on a later day with
 *   room: call placeWaitingStones() on every Camp and Cairn visit. Nothing is ever discarded.
 *
 * Test mode does not change these rules: logging a brave thing or opening a letter is always real.
 * (Test-mode climbs never touch stones — they don't create any.)
 */
import type { BraveOutcome, BraveThing, Letter, SaveData } from '../storage/schema'
import { dayKey, type DayKey } from './clock'
import { newId } from './ids'

export const BRAVE_STONES_PER_DAY = 3
export const LETTER_STONES_PER_DAY = 1

export type StoneKind = 'brave' | 'letter'

export interface StoneRef {
  kind: StoneKind
  id: string
  day: DayKey
}

export function totalStones(d: SaveData): number {
  let n = 0
  for (const b of d.brave) if (b.stoneDay) n++
  for (const l of d.letters) if (l.stoneDay) n++
  return n
}

export function braveStonesPlacedOn(d: SaveData, day: DayKey): number {
  return d.brave.filter((b) => b.stoneDay === day).length
}

export function letterStonesPlacedOn(d: SaveData, day: DayKey): number {
  return d.letters.filter((l) => l.stoneDay === day).length
}

function isBrave(s: BraveThing | Letter): s is BraveThing {
  return 'status' in s
}

/** When a stone became earned: done (brave thing) or opened (letter). */
function eligibleAt(s: BraveThing | Letter): number {
  const iso = isBrave(s) ? s.doneAt : s.openedAt
  const t = iso ? Date.parse(iso) : NaN
  if (Number.isFinite(t)) return t
  const c = Date.parse(s.createdAt)
  return Number.isFinite(c) ? c : 0
}

function isWaiting(s: BraveThing | Letter): boolean {
  if (s.stoneDay) return false
  return isBrave(s) ? s.status === 'done' : Boolean(s.openedAt)
}

/** Earned stones not yet on the cairn (over a daily cap), oldest first. */
export function waitingStones(d: SaveData): (BraveThing | Letter)[] {
  const list: { s: BraveThing | Letter; order: number }[] = []
  d.brave.forEach((s, i) => {
    if (isWaiting(s)) list.push({ s, order: i })
  })
  d.letters.forEach((s, i) => {
    if (isWaiting(s)) list.push({ s, order: d.brave.length + i })
  })
  list.sort((a, b) => eligibleAt(a.s) - eligibleAt(b.s) || a.order - b.order)
  return list.map((x) => x.s)
}

/**
 * Place every waiting stone that fits under today's caps, oldest first.
 * Returns the ids placed now (for the stacking animation), in placement order.
 */
export function placeWaitingStones(d: SaveData, now: Date): string[] {
  const today = dayKey(now)
  let braveRoom = BRAVE_STONES_PER_DAY - braveStonesPlacedOn(d, today)
  let letterRoom = LETTER_STONES_PER_DAY - letterStonesPlacedOn(d, today)
  const placed: string[] = []
  for (const s of waitingStones(d)) {
    if (isBrave(s)) {
      if (braveRoom <= 0) continue
      braveRoom--
    } else {
      if (letterRoom <= 0) continue
      letterRoom--
    }
    s.stoneDay = today
    placed.push(s.id)
  }
  return placed
}

/**
 * Every placed stone, in the order it went onto the cairn (by day, then by when it was earned —
 * which is the order placeWaitingStones places them). Stable for equal times.
 */
export function stoneOrder(d: SaveData): StoneRef[] {
  const list: { ref: StoneRef; at: number; order: number }[] = []
  d.brave.forEach((b, i) => {
    if (b.stoneDay) list.push({ ref: { kind: 'brave', id: b.id, day: b.stoneDay }, at: eligibleAt(b), order: i })
  })
  d.letters.forEach((l, i) => {
    if (l.stoneDay)
      list.push({ ref: { kind: 'letter', id: l.id, day: l.stoneDay }, at: eligibleAt(l), order: d.brave.length + i })
  })
  list.sort((a, b) => {
    if (a.ref.day !== b.ref.day) return a.ref.day < b.ref.day ? -1 : 1
    return a.at - b.at || a.order - b.order
  })
  return list.map((x) => x.ref)
}

// ---------------------------------------------------------------------------------------------
// Brave things

export interface NewBraveThing {
  text: string
  /** Fear Forecast 0–10. */
  forecast: number
  ideaId?: string
  oops?: boolean
  worry?: string
}

function clampScale(n: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.min(10, Math.round(n))) : 0
}

function optText(s: string | undefined): string | undefined {
  const t = (s ?? '').trim()
  return t ? t : undefined
}

/** Log a brave thing as a plan (steps 1–4 of the log flow). Call completeBraveThing for "I already did it!". */
export function addBraveThing(d: SaveData, input: NewBraveThing, now: Date): BraveThing {
  const b: BraveThing = {
    id: newId('b'),
    createdAt: now.toISOString(),
    text: input.text.trim(),
    oops: Boolean(input.oops),
    forecast: clampScale(input.forecast),
    status: 'planned',
    notTodayCount: 0,
    stoneDay: null,
  }
  if (input.ideaId) b.ideaId = input.ideaId
  const worry = optText(input.worry)
  if (worry) b.worry = worry
  d.brave.push(b)
  return b
}

/** "Not today" on a plan. Costs nothing: only a hidden counter (used by the smaller-step badge). */
export function markNotToday(d: SaveData, id: string): void {
  const b = d.brave.find((x) => x.id === id)
  if (b && b.status === 'planned') b.notTodayCount++
}

/**
 * "Make it smaller": a NEW plan pointing at the original, which stays unchanged (Decision 22).
 * Made after a "Not today" on the original, it's marked `afterNotToday` (the smaller-step badge:
 * a Not today turned into a smaller step, in that order).
 */
export function makeSmallerPlan(
  d: SaveData,
  originalId: string,
  input: { text: string; forecast: number; worry?: string },
  now: Date,
): BraveThing | null {
  const original = d.brave.find((x) => x.id === originalId)
  if (!original) return null
  const b = addBraveThing(d, { ...input, oops: original.oops }, now)
  b.smallerOf = original.id
  if (original.notTodayCount > 0) b.afterNotToday = true
  return b
}

export interface BraveAnswers {
  /** "How scary was it really?" 0–10. */
  really: number
  whatHappened: string
  outcome: BraveOutcome
  learned?: string
}

/**
 * Mark a brave thing done and put its stone on the cairn today if there is room (waiting stones go
 * first, oldest first). `placed: false` means it waits for a later day. `waitingPlaced` lists older
 * waiting stones that went on just before it. Calling it again for a done thing changes nothing.
 */
export function completeBraveThing(
  d: SaveData,
  id: string,
  answers: BraveAnswers,
  now: Date,
): { placed: boolean; waitingPlaced: string[] } {
  const b = d.brave.find((x) => x.id === id)
  if (!b || b.status === 'done') return { placed: false, waitingPlaced: [] }
  b.status = 'done'
  b.doneAt = now.toISOString()
  b.really = clampScale(answers.really)
  b.whatHappened = answers.whatHappened.trim()
  b.outcome = answers.outcome
  const learned = optText(answers.learned)
  if (learned) b.learned = learned
  else delete b.learned
  const placed = placeWaitingStones(d, now)
  return { placed: b.stoneDay !== null, waitingPlaced: placed.filter((x) => x !== b.id) }
}

// ---------------------------------------------------------------------------------------------
// Letters

/** A parent's "Spotted!" letter (parent mode). It earns its stone when she opens it. */
export function addLetter(d: SaveData, from: string, text: string, now: Date): Letter {
  const l: Letter = { id: newId('l'), createdAt: now.toISOString(), from: from.trim(), text: text.trim(), stoneDay: null }
  d.letters.push(l)
  return l
}

/**
 * Open a letter and place its bonus stone if today has room (1 a day; otherwise it waits).
 * Re-opening an already-opened letter changes nothing and returns placed: false.
 */
export function openLetter(d: SaveData, id: string, now: Date): { placed: boolean; waitingPlaced: string[] } {
  const l = d.letters.find((x) => x.id === id)
  if (!l || l.openedAt) return { placed: false, waitingPlaced: [] }
  l.openedAt = now.toISOString()
  const placed = placeWaitingStones(d, now)
  return { placed: l.stoneDay !== null, waitingPlaced: placed.filter((x) => x !== l.id) }
}

export function unopenedLetters(d: SaveData): Letter[] {
  return d.letters.filter((l) => !l.openedAt)
}
