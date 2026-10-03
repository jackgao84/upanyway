/**
 * Export / import of the whole save as a JSON file (parent mode). Import goes through the same
 * migrate + normalize path as loading, refuses files from newer versions, and keeps the current save
 * as the backup before replacing it.
 */
import { PITCH_IDS } from '../game/types'
import { totalStones } from '../model/stones'
import { CURRENT_SCHEMA_VERSION, type SaveData } from './schema'
import { NEWER_VERSION, migrateToCurrent, versionOf } from './migrations'
import type { Store } from './store'

/** Marker in exported files so an import can tell our backups from any other JSON. */
export const EXPORT_APP = 'upanyway'

export interface ExportEnvelope {
  app: typeof EXPORT_APP
  exportedAt: string
  schemaVersion: number
  data: SaveData
}

export interface ImportSummary {
  /** Stones on the cairn. */
  stones: number
  /** Brave things logged (plans included). */
  braveThings: number
  /** Pitches sent at least once by day. */
  pitchesSent: number
  goatName: string
  mountainName: string
}

export type ImportResult = { ok: true; data: SaveData; summary: ImportSummary } | { ok: false; error: string }

export const IMPORT_ERRORS = {
  empty: 'That file is empty. Try choosing the backup file again.',
  notJson: "That doesn't look like an Up Anyway backup. Check it's the right file and try again.",
  notOurs: "That doesn't look like an Up Anyway backup. Check it's the right file and try again.",
  otherApp: 'That backup belongs to a different app, so it was left alone.',
  newer: NEWER_VERSION,
} as const

/** Pretty JSON with an app marker and the export time. */
export function exportJson(data: SaveData, now: Date): string {
  const envelope: ExportEnvelope = {
    app: EXPORT_APP,
    exportedAt: now.toISOString(),
    schemaVersion: data.schemaVersion,
    data,
  }
  return JSON.stringify(envelope, null, 2)
}

/** 'upanyway-backup-YYYY-MM-DD.json' (local date). */
export function backupFileName(now: Date): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `upanyway-backup-${y}-${m}-${d}.json`
}

const SAVE_KEYS = ['setup', 'parent', 'profile', 'brave', 'pitches', 'stats']

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export function summarize(data: SaveData): ImportSummary {
  return {
    stones: totalStones(data),
    braveThings: data.brave.length,
    pitchesSent: PITCH_IDS.filter((id) => (data.pitches[id]?.sends ?? 0) > 0).length,
    goatName: data.profile.goatName,
    mountainName: data.profile.mountainName,
  }
}

/**
 * Read a backup (file contents or pasted text). Accepts the exported envelope, or a bare save
 * document copied straight out of storage. Never throws.
 */
export function parseImport(text: string, now: Date = new Date()): ImportResult {
  const trimmed = text.replace(/^﻿/, '').trim()
  if (!trimmed) return { ok: false, error: IMPORT_ERRORS.empty }
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return { ok: false, error: IMPORT_ERRORS.notJson }
  }
  if (!isObj(parsed)) return { ok: false, error: IMPORT_ERRORS.notOurs }

  let save: Record<string, unknown>
  if ('app' in parsed) {
    if (parsed.app !== EXPORT_APP) return { ok: false, error: IMPORT_ERRORS.otherApp }
    if (!isObj(parsed.data)) return { ok: false, error: IMPORT_ERRORS.notOurs }
    save = parsed.data
  } else if (typeof parsed.schemaVersion === 'number' && SAVE_KEYS.some((k) => k in parsed)) {
    save = parsed
  } else {
    return { ok: false, error: IMPORT_ERRORS.notOurs }
  }

  const version = versionOf(save)
  if (version === null) return { ok: false, error: IMPORT_ERRORS.notOurs }
  if (version > CURRENT_SCHEMA_VERSION) return { ok: false, error: IMPORT_ERRORS.newer }
  try {
    const { data } = migrateToCurrent(save, now)
    return { ok: true, data, summary: summarize(data) }
  } catch {
    return { ok: false, error: IMPORT_ERRORS.notOurs }
  }
}

/** Replace the save with an imported one; the current save becomes the backup first. */
export function applyImport(store: Store, data: SaveData): void {
  store.writeBackup()
  store.replace(data)
}
