/**
 * Friendly dates for the Hall of Flops, Letters and Badges: "today", "yesterday", "on Tuesday",
 * "on 3 October" (and the year only when it isn't this year). Local calendar days, never times or
 * countdowns. Written by hand (not Intl) so every device says it the same way.
 */
import { dayKey, daysBetween } from '../../model/clock'

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

function parse(iso: string | undefined): Date | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isFinite(t) ? new Date(t) : null
}

/** "3 October", or "3 October 2025" when it isn't this year. Empty for a missing/bad date. */
export function dateLabel(iso: string | undefined, now: Date): string {
  const d = parse(iso)
  if (!d) return ''
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`
  return d.getFullYear() === now.getFullYear() ? base : `${base} ${d.getFullYear()}`
}

/**
 * "today", "yesterday", "on Tuesday" (within the last week), else "on 3 October". Empty for a
 * missing/bad date. A date in the future (a device clock that moved) reads as "today".
 */
export function dayPhrase(iso: string | undefined, now: Date): string {
  const d = parse(iso)
  if (!d) return ''
  const ago = daysBetween(dayKey(d), dayKey(now))
  if (ago <= 0) return 'today'
  if (ago === 1) return 'yesterday'
  if (ago < 7) return `on ${WEEKDAYS[d.getDay()]}`
  return `on ${dateLabel(iso, now)}`
}

/** True when the date falls on today's local calendar day. */
export function isToday(iso: string | undefined, now: Date): boolean {
  const d = parse(iso)
  return !!d && dayKey(d) === dayKey(now)
}
