import { describe, expect, it } from 'vitest'
import { IMPORT_ERRORS, applyImport, backupFileName, exportJson, parseImport } from '../../src/storage/backup'
import { KEYS } from '../../src/storage/keys'
import { NEWER_VERSION } from '../../src/storage/migrations'
import { CURRENT_SCHEMA_VERSION, defaultSave } from '../../src/storage/schema'
import { MemoryStorage, Store } from '../../src/storage/store'
import { DAY1, at, richSave } from './fixtures'

describe('export', () => {
  it('writes pretty JSON with the app marker and export time', () => {
    const text = exportJson(richSave(), DAY1)
    const parsed = JSON.parse(text)
    expect(parsed.app).toBe('upanyway')
    expect(parsed.exportedAt).toBe(DAY1.toISOString())
    expect(parsed.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(parsed.data).toEqual(richSave())
    expect(text).toContain('\n  "app": "upanyway"')
  })

  it('names the file by local date', () => {
    expect(backupFileName(at(2026, 1, 5, 23, 59))).toBe('upanyway-backup-2026-01-05.json')
    expect(backupFileName(at(2026, 12, 31, 0, 1))).toBe('upanyway-backup-2026-12-31.json')
  })
})

describe('import', () => {
  it('round-trips an export exactly', () => {
    const original = richSave()
    const r = parseImport(exportJson(original, DAY1), DAY1)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data).toStrictEqual(original)
    expect(r.summary).toEqual({ stones: 2, braveThings: 3, pitchesSent: 1, goatName: 'Pip', mountainName: 'Big Blue' })
  })

  it('carries hidden idea cards through an export and back', () => {
    const original = richSave()
    original.hiddenIdeas = ['oops-odd-socks', 'family-light-off', 'school-assembly']
    const text = exportJson(original, DAY1)
    expect(JSON.parse(text).data.hiddenIdeas).toEqual(['oops-odd-socks', 'family-light-off', 'school-assembly'])
    const r = parseImport(text, DAY1)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.hiddenIdeas).toEqual(['oops-odd-socks', 'family-light-off', 'school-assembly'])
    expect(r.data).toStrictEqual(original)
  })

  it('a backup from before hidden cards (v1) restores with every card showing', () => {
    const v1 = JSON.parse(JSON.stringify(richSave())) as Record<string, unknown> & { parent: Record<string, unknown> }
    delete v1.hiddenIdeas
    delete v1.parent.recoveryHash
    delete v1.parent.recoverySalt
    v1.schemaVersion = 1
    const r = parseImport(JSON.stringify({ app: 'upanyway', exportedAt: DAY1.toISOString(), schemaVersion: 1, data: v1 }), DAY1)
    expect(r.ok && r.data).toStrictEqual({ ...richSave(), parent: { ...richSave().parent, recoveryHash: '', recoverySalt: '' }, hiddenIdeas: [] })
  })

  it('carries the recovery code (its hash, never the code), and a backup from before codes (v2) restores with none', () => {
    const text = exportJson(richSave(), DAY1)
    expect(JSON.parse(text).data.parent).toMatchObject({ recoveryHash: 'c'.repeat(64), recoverySalt: 'rsalt456' })
    const r = parseImport(text, DAY1)
    expect(r.ok && r.data.parent).toStrictEqual(richSave().parent)

    const v2 = JSON.parse(JSON.stringify(richSave())) as Record<string, unknown> & { parent: Record<string, unknown> }
    delete v2.parent.recoveryHash
    delete v2.parent.recoverySalt
    v2.schemaVersion = 2
    const old = parseImport(JSON.stringify({ app: 'upanyway', exportedAt: DAY1.toISOString(), schemaVersion: 2, data: v2 }), DAY1)
    expect(old.ok && old.data).toStrictEqual({ ...richSave(), parent: { ...richSave().parent, recoveryHash: '', recoverySalt: '' } })
  })

  it('round-trips a brand-new save too', () => {
    const r = parseImport(exportJson(defaultSave(DAY1), DAY1), DAY1)
    expect(r.ok && r.data).toStrictEqual(defaultSave(DAY1))
  })

  it('accepts a bare save copied out of storage, and a byte-order mark', () => {
    const r = parseImport('﻿  ' + JSON.stringify(richSave()) + '\n', DAY1)
    expect(r.ok && r.data).toStrictEqual(richSave())
  })

  it('migrates an older save inside the envelope', () => {
    const r = parseImport(JSON.stringify({ app: 'upanyway', exportedAt: DAY1.toISOString(), data: { goat: 'Pip', braveThings: [] } }), DAY1)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data.profile.goatName).toBe('Pip')
  })

  it('refuses files from a newer version', () => {
    const future = { ...richSave(), schemaVersion: CURRENT_SCHEMA_VERSION + 1 }
    const wrapped = parseImport(JSON.stringify({ app: 'upanyway', exportedAt: DAY1.toISOString(), data: future }))
    expect(wrapped).toEqual({ ok: false, error: NEWER_VERSION })
    const bare = parseImport(JSON.stringify(future))
    expect(bare).toEqual({ ok: false, error: NEWER_VERSION })
  })

  it.each([
    ['', IMPORT_ERRORS.empty],
    ['   \n', IMPORT_ERRORS.empty],
    ['hello there', IMPORT_ERRORS.notJson],
    ['{"brave": [', IMPORT_ERRORS.notJson],
    ['[]', IMPORT_ERRORS.notOurs],
    ['42', IMPORT_ERRORS.notOurs],
    ['null', IMPORT_ERRORS.notOurs],
    ['{"foo": 1}', IMPORT_ERRORS.notOurs],
    ['{"schemaVersion": 1}', IMPORT_ERRORS.notOurs],
    ['{"app": "upanyway"}', IMPORT_ERRORS.notOurs],
    ['{"app": "upanyway", "data": {"schemaVersion": "two"}}', IMPORT_ERRORS.notOurs],
    ['{"app": "another-app", "data": {}}', IMPORT_ERRORS.otherApp],
  ])('refuses garbage: %j', (text, error) => {
    expect(parseImport(text)).toEqual({ ok: false, error })
  })

  it('uses gentle wording', () => {
    for (const msg of Object.values(IMPORT_ERRORS)) {
      expect(msg).not.toMatch(/error|corrupt|invalid|fail|wrong|bad/i)
      expect(msg.length).toBeGreaterThan(10)
    }
  })

  it('applyImport keeps the current save as the backup, then replaces it', () => {
    const storage = new MemoryStorage()
    const store = new Store(storage)
    store.update((d) => {
      d.profile.goatName = 'Old goat'
    })
    store.flush()
    const r = parseImport(exportJson(richSave(), DAY1), DAY1)
    if (!r.ok) throw new Error(r.error)
    let notified = 0
    store.subscribe(() => notified++)
    applyImport(store, r.data)
    expect(JSON.parse(storage.getItem(KEYS.backup) as string).profile.goatName).toBe('Old goat')
    expect(JSON.parse(storage.getItem(KEYS.save) as string)).toStrictEqual(richSave())
    expect(store.data).toStrictEqual(richSave())
    expect(notified).toBe(1)
  })
})
