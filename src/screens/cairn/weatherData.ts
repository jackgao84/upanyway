/**
 * The Weather Station's numbers: her done brave things (real ones only — never the climb's Looks
 * Scary moments), oldest first, each with its Fear Forecast and how it really was. Never a score:
 * nothing here adds the numbers up, ranks them or rewards a big forecast. Pure, no DOM.
 */
import type { SaveData } from '../../storage/schema'

/** Brave things needed before the station starts forecasting. */
export const WEATHER_MIN = 3

export interface WeatherEntry {
  id: string
  text: string
  forecast: number
  really: number
  /** When it was done (ISO). */
  at: string
}

function clamp(n: number): number {
  return Math.max(0, Math.min(10, Math.round(Number.isFinite(n) ? n : 0)))
}

function time(iso: string | undefined): number {
  const t = iso ? Date.parse(iso) : NaN
  return Number.isFinite(t) ? t : 0
}

/** Done brave things with both numbers, oldest first (newest last). */
export function weatherEntries(d: SaveData): WeatherEntry[] {
  return d.brave
    .map((b, i) => ({ b, i }))
    .filter(({ b }) => b.status === 'done' && typeof b.really === 'number')
    .sort((x, y) => time(x.b.doneAt ?? x.b.createdAt) - time(y.b.doneAt ?? y.b.createdAt) || x.i - y.i)
    .map(({ b }) => ({
      id: b.id,
      text: b.text,
      forecast: clamp(b.forecast),
      really: clamp(b.really ?? 0),
      at: b.doneAt ?? b.createdAt,
    }))
}
