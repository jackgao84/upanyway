/** Local-day helpers. Everything "daily" (stone caps, letter bonus, climb time) keys off DayKey. */

export type DayKey = string // 'YYYY-MM-DD' in the device's local time zone

export function dayKey(date: Date): DayKey {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function isoNow(date: Date): string {
  return date.toISOString()
}

/** Days from a to b (b later → positive), by local calendar day. */
export function daysBetween(a: DayKey, b: DayKey): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  const ta = Date.UTC(ay, am - 1, ad)
  const tb = Date.UTC(by, bm - 1, bd)
  return Math.round((tb - ta) / 86_400_000)
}
