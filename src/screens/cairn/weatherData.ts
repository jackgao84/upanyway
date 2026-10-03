/**
 * The Weather Station's numbers: her done brave things (real ones only — never the climb's Looks
 * Scary moments), oldest first, each with its Fear Forecast and how it really was, plus a gentle
 * one-line summary ("Forecasts: mostly Rainy. Really: mostly Sunny."). Never a score: nothing here
 * adds the numbers up, ranks them or rewards a big forecast. Pure, no DOM.
 */
import type { SaveData } from '../../storage/schema'
import { WEATHER_COPY } from './copy'

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

/** Four broad kinds of weather (the eleven icons, grouped), sunniest first. */
export const WEATHER_GROUPS = [
  { word: 'Sunny', max: 2 },
  { word: 'Cloudy', max: 5 },
  { word: 'Rainy', max: 8 },
  { word: 'Stormy', max: 10 },
] as const

/** Which broad kind of weather a level 0–10 is (index into WEATHER_GROUPS). */
export function weatherGroup(level: number): number {
  const n = clamp(level)
  const i = WEATHER_GROUPS.findIndex((g) => n <= g.max)
  return i < 0 ? WEATHER_GROUPS.length - 1 : i
}

/**
 * "mostly Rainy" when one kind of weather is at least half of them; "a mix of Cloudy and Rainy"
 * when two kinds make up most of them; otherwise "all sorts of weather".
 */
export function describeWeather(levels: readonly number[]): string {
  const c = WEATHER_COPY
  if (!levels.length) return c.allSorts
  const counts: number[] = WEATHER_GROUPS.map(() => 0)
  for (const l of levels) counts[weatherGroup(l)]++
  const order = counts
    .map((n, i) => ({ n, i }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || a.i - b.i)
  const total = levels.length
  const top = order[0]
  if (top.n * 2 >= total) return c.mostly(WEATHER_GROUPS[top.i].word)
  const second = order[1]
  if (second && (top.n + second.n) / total >= 0.7) {
    const [a, b] = top.i < second.i ? [top.i, second.i] : [second.i, top.i]
    return c.mix(WEATHER_GROUPS[a].word, WEATHER_GROUPS[b].word)
  }
  return c.allSorts
}

/** "Forecasts: mostly Rainy. Really: mostly Sunny." */
export function weatherSummary(entries: readonly WeatherEntry[]): { forecasts: string; really: string } {
  return {
    forecasts: describeWeather(entries.map((e) => e.forecast)),
    really: describeWeather(entries.map((e) => e.really)),
  }
}
