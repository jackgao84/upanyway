import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { KEYS } from '../../src/storage/keys'
import { CURRENT_SCHEMA_VERSION, defaultSave, type SaveData } from '../../src/storage/schema'
import { MemoryStorage, Store, type StorageChange, type StorageLike } from '../../src/storage/store'
import { DAY1, richSave } from './fixtures'

/** A window 'storage' event as a page on the origin makes it (another tab of the app, or another app). */
const PAGE = 'https://example.github.io/otherapp/'
const change = (key: string | null, newValue: string | null, url = PAGE): StorageChange => ({ key, newValue, url })

describe('Store', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts fresh on an empty device and writes the new save straight away', () => {
    const storage = new MemoryStorage()
    const store = new Store(storage)
    expect(store.loadInfo.kind).toBe('fresh')
    expect(storage.getItem(KEYS.save)).not.toBeNull()
    expect(storage.getItem(KEYS.backup)).toBeNull()
    expect(JSON.parse(storage.getItem(KEYS.save) as string)).toEqual(store.data)
  })

  it('loads an existing save without rewriting it', () => {
    const storage = new MemoryStorage()
    const saved = JSON.stringify(richSave())
    storage.setItem(KEYS.save, saved)
    const store = new Store(storage)
    expect(store.loadInfo.kind).toBe('loaded')
    expect(store.data).toStrictEqual(richSave())
    expect(storage.getItem(KEYS.save)).toBe(saved)
  })

  it('debounces writes from update() and notifies subscribers at once', () => {
    const storage = new MemoryStorage()
    const store = new Store(storage, 150)
    const seen: number[] = []
    const off = store.subscribe((d) => seen.push(d.stats.whippers))
    store.update((d) => {
      d.stats.whippers = 1
    })
    store.update((d) => {
      d.stats.whippers = 2
    })
    expect(seen).toEqual([1, 2])
    expect(JSON.parse(storage.getItem(KEYS.save) as string).stats.whippers).toBe(0)
    vi.advanceTimersByTime(150)
    expect(JSON.parse(storage.getItem(KEYS.save) as string).stats.whippers).toBe(2)
    off()
    store.update((d) => {
      d.stats.whippers = 3
    })
    expect(seen).toEqual([1, 2])
  })

  it('flush() writes immediately', () => {
    const storage = new MemoryStorage()
    const store = new Store(storage)
    store.update((d) => {
      d.profile.goatName = 'Pip'
    })
    store.flush()
    expect(JSON.parse(storage.getItem(KEYS.save) as string).profile.goatName).toBe('Pip')
  })

  it('reset keeps the old save as the backup and writes a fresh save (never deletes)', () => {
    const storage = new MemoryStorage()
    storage.setItem(KEYS.save, JSON.stringify(richSave()))
    const store = new Store(storage)
    store.update((d) => {
      d.stats.whippers = 99
    })
    let notified = 0
    store.subscribe(() => notified++)
    store.reset(DAY1)
    const backup = JSON.parse(storage.getItem(KEYS.backup) as string)
    expect(backup.profile.goatName).toBe('Pip')
    expect(backup.stats.whippers).toBe(99)
    const saved = JSON.parse(storage.getItem(KEYS.save) as string)
    expect(saved).toEqual(defaultSave(DAY1))
    expect(store.data).toEqual(defaultSave(DAY1))
    expect(notified).toBe(1)
    expect(storage.keys().sort()).toEqual([KEYS.backup, KEYS.save].sort())
  })

  it('never replaces a backup that holds a save from a newer version', () => {
    const storage = new MemoryStorage()
    const newer = JSON.stringify({ ...richSave(), schemaVersion: 99, futureThing: { kept: true } })
    storage.setItem(KEYS.save, newer)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const store = new Store(storage)
    expect(store.loadInfo.kind).toBe('newer')
    expect(storage.getItem(KEYS.backup)).toBe(newer)
    store.update((d) => {
      d.stats.whippers = 5
    })
    vi.runAllTimers()
    store.reset(DAY1)
    expect(storage.getItem(KEYS.backup)).toBe(newer)
    // ...and after a restart, too (the main save is now this version's).
    const again = new Store(storage)
    again.writeBackup()
    expect(storage.getItem(KEYS.backup)).toBe(newer)
    warn.mockRestore()
  })

  it('reports a failed write instead of throwing', () => {
    const storage = new MemoryStorage()
    const store = new Store(storage)
    const full: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
      removeItem: () => undefined,
    }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const broken = new Store(full)
    expect(broken.lastWriteError).toContain('Quota')
    expect(() => broken.update((d) => void (d.stats.sends = 1))).not.toThrow()
    expect(store.lastWriteError).toBeNull()
    warn.mockRestore()
  })

  it('only ever uses prefixed keys', () => {
    const storage = new MemoryStorage()
    const store = new Store(storage)
    store.update((d) => void (d.stats.sends = 1))
    store.reset(DAY1)
    vi.runAllTimers()
    for (const key of storage.keys()) expect(key.startsWith('upanyway:')).toBe(true)
  })
})

describe('Store: two tabs on one storage', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const stored = (storage: MemoryStorage) => JSON.parse(storage.getItem(KEYS.save) as string)

  it('hiding a tab that changed nothing never rewrites the save', () => {
    const storage = new MemoryStorage()
    storage.setItem(KEYS.save, JSON.stringify(richSave()))
    const a = new Store(storage)
    const b = new Store(storage)
    b.update((d) => {
      d.settings.muted = true
    })
    b.flush()
    expect(stored(storage).settings.muted).toBe(true)
    // Tab A is hidden (pagehide / visibilitychange): it has nothing to save.
    a.flush()
    expect(stored(storage).settings.muted).toBe(true)
  })

  it("a stale tab takes the other tab's write and keeps it on its next change", () => {
    const storage = new MemoryStorage()
    storage.setItem(KEYS.save, JSON.stringify(richSave()))
    const a = new Store(storage)
    const b = new Store(storage)
    let notified = 0
    a.subscribe(() => notified++)
    b.update((d) => {
      d.letters.push({ id: 'l-new', createdAt: DAY1.toISOString(), from: 'Mum', text: 'Spotted!', stoneDay: null })
    })
    b.flush()
    // The browser fires 'storage' in tab A only.
    a.externalWrite(change(KEYS.save, storage.getItem(KEYS.save)))
    expect(notified).toBe(1)
    expect(a.data.letters.some((l) => l.id === 'l-new')).toBe(true)
    a.update((d) => {
      d.stats.whippers += 1
    })
    vi.runAllTimers()
    const saved = stored(storage)
    expect(saved.letters.some((l: { id: string }) => l.id === 'l-new')).toBe(true)
    expect(saved.stats.whippers).toBe(richSave().stats.whippers + 1)
  })

  it("ignores other apps' keys, written or removed", () => {
    const storage = new MemoryStorage()
    const a = new Store(storage)
    const writes = vi.spyOn(storage, 'setItem')
    let notified = 0
    a.subscribe(() => notified++)
    a.externalWrite(change('otherapp:save', '{}'))
    a.externalWrite(change('otherapp:save', null))
    a.externalWrite(change('state', null))
    expect(notified).toBe(0)
    expect(writes).not.toHaveBeenCalled()
  })

  it('a failed write stays pending, so a retry writes it', () => {
    const storage = new MemoryStorage()
    let fail = true
    const flaky: StorageLike = {
      getItem: (k) => storage.getItem(k),
      setItem: (k, v) => {
        if (fail) throw new Error('QuotaExceededError')
        storage.setItem(k, v)
      },
      removeItem: (k) => storage.removeItem(k),
    }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const s = new Store(flaky)
    s.update((d) => void (d.stats.sends = 3))
    vi.runAllTimers()
    expect(s.lastWriteError).toContain('Quota')
    fail = false
    s.flush()
    expect(s.lastWriteError).toBeNull()
    expect(stored(storage).stats.sends).toBe(3)
    warn.mockRestore()
  })
})

describe('Store: another app on the shared origin removes this app’s keys', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  /** A device with her rich save, an older backup, another app's keys, and the app open (tab A). */
  function device() {
    const storage = new MemoryStorage()
    const backup = JSON.stringify(defaultSave(DAY1))
    storage.setItem(KEYS.save, JSON.stringify(richSave()))
    storage.setItem(KEYS.backup, backup)
    storage.setItem('otherapp:save', '{"theirs":true}')
    const a = new Store(storage)
    /** The other app's localStorage.clear(): everything goes, then the browser tells tab A (key null). */
    const clearAll = () => {
      for (const k of storage.keys()) storage.removeItem(k)
      a.externalWrite(change(null, null))
    }
    return { storage, backup, a, clearAll }
  }
  const parsed = (storage: MemoryStorage, key: string) => JSON.parse(storage.getItem(key) as string)

  it('writes the save and backup straight back after localStorage.clear(), down to the last point', () => {
    const { storage, backup, a, clearAll } = device()
    let notified = 0
    a.subscribe(() => notified++)
    clearAll()
    expect(parsed(storage, KEYS.save)).toStrictEqual(richSave())
    const stones = (d: SaveData) => d.brave.filter((b) => b.stoneDay).length
    expect(stones(parsed(storage, KEYS.save))).toBe(stones(richSave()))
    expect(stones(richSave())).toBeGreaterThan(0)
    expect(storage.getItem(KEYS.backup)).toBe(backup)
    // Only this app's keys come back; nothing on screen changes.
    expect(storage.getItem('otherapp:save')).toBeNull()
    expect(storage.keys().sort()).toEqual([KEYS.save, KEYS.backup].sort())
    expect(notified).toBe(0)
  })

  it('includes a change still waiting to be saved', () => {
    const { storage, a, clearAll } = device()
    a.update((d) => void (d.stats.whippers += 1))
    clearAll()
    expect(parsed(storage, KEYS.save).stats.whippers).toBe(richSave().stats.whippers + 1)
    vi.runAllTimers()
    expect(parsed(storage, KEYS.save).stats.whippers).toBe(richSave().stats.whippers + 1)
  })

  it('writes back a single removed key (removeItem) and leaves the other alone', () => {
    const { storage, backup, a } = device()
    const writes = vi.spyOn(storage, 'setItem')
    storage.removeItem(KEYS.save)
    a.externalWrite(change(KEYS.save, null))
    expect(parsed(storage, KEYS.save)).toStrictEqual(richSave())
    expect(writes).toHaveBeenCalledTimes(1)
    storage.removeItem(KEYS.backup)
    a.externalWrite(change(KEYS.backup, null))
    expect(storage.getItem(KEYS.backup)).toBe(backup)
    expect(writes).toHaveBeenCalledTimes(2)
  })

  it('leaves a key alone when another open tab already put it back', () => {
    const { storage, a } = device()
    const b = new Store(storage)
    for (const k of storage.keys()) storage.removeItem(k)
    b.externalWrite(change(null, null))
    const writes = vi.spyOn(storage, 'setItem')
    a.externalWrite(change(null, null))
    expect(writes).not.toHaveBeenCalled()
    expect(parsed(storage, KEYS.save)).toStrictEqual(richSave())
  })

  it('has no backup to write back on a device that never made one', () => {
    const storage = new MemoryStorage()
    storage.setItem(KEYS.save, JSON.stringify(richSave()))
    const a = new Store(storage)
    storage.removeItem(KEYS.save)
    a.externalWrite(change(null, null))
    expect(parsed(storage, KEYS.save)).toStrictEqual(richSave())
    expect(storage.getItem(KEYS.backup)).toBeNull()
  })

  it('never undoes a reset in another tab: a changed key is taken, and later write-backs use it', () => {
    const { storage, a } = device()
    const b = new Store(storage)
    const before = storage.getItem(KEYS.save)
    // Tab B's grown-up starts over: the old save becomes the backup, then a fresh save.
    b.reset(DAY1)
    a.externalWrite(change(KEYS.backup, storage.getItem(KEYS.backup)))
    a.externalWrite(change(KEYS.save, storage.getItem(KEYS.save)))
    expect(a.data).toStrictEqual(defaultSave(DAY1))
    expect(parsed(storage, KEYS.save)).toStrictEqual(defaultSave(DAY1))
    a.flush()
    vi.runAllTimers()
    expect(parsed(storage, KEYS.save)).toStrictEqual(defaultSave(DAY1))
    // A later clear() brings back the reset save and the backup B made, not tab A's old copies.
    for (const k of storage.keys()) storage.removeItem(k)
    a.externalWrite(change(null, null))
    expect(parsed(storage, KEYS.save)).toStrictEqual(defaultSave(DAY1))
    expect(storage.getItem(KEYS.backup)).toBe(before)
  })

  it('never undoes a restore in another tab', () => {
    const { storage, a } = device()
    const b = new Store(storage)
    const restored = richSave()
    restored.stats.whippers += 7
    // Tab B restores a backup file (backup.ts): the current save is kept as the backup, then replaced.
    b.writeBackup()
    b.replace(restored)
    a.externalWrite(change(KEYS.backup, storage.getItem(KEYS.backup)))
    a.externalWrite(change(KEYS.save, storage.getItem(KEYS.save)))
    vi.runAllTimers()
    expect(parsed(storage, KEYS.save)).toStrictEqual(restored)
    expect(a.data).toStrictEqual(restored)
  })

  it('does not write back over storage it cannot read', () => {
    const storage = new MemoryStorage()
    storage.setItem(KEYS.save, JSON.stringify(richSave()))
    let broken = false
    const flaky: StorageLike = {
      getItem: (k) => {
        if (broken) throw new Error('SecurityError')
        return storage.getItem(k)
      },
      setItem: (k, v) => storage.setItem(k, v),
      removeItem: (k) => storage.removeItem(k),
    }
    const a = new Store(flaky)
    const writes = vi.spyOn(storage, 'setItem')
    broken = true
    a.externalWrite(change(null, null))
    expect(writes).not.toHaveBeenCalled()
  })

  it('leaves the site alone when the browser itself cleared its data (no page URL)', () => {
    const { storage, a } = device()
    const writes = vi.spyOn(storage, 'setItem')
    for (const k of storage.keys()) storage.removeItem(k)
    a.externalWrite(change(null, null, ''))
    storage.setItem('probe', '1')
    storage.removeItem('probe')
    a.externalWrite(change(KEYS.save, null, ''))
    expect(writes).toHaveBeenCalledTimes(1) // only the probe
    expect(storage.getItem(KEYS.save)).toBeNull()
    expect(storage.getItem(KEYS.backup)).toBeNull()
  })

  it('a save event handled after the clear() takes the event’s copy, never a fresh game', () => {
    // Tab B is in the background: tab A's save and the other app's clear() reach it together, after
    // tab A has been closed.
    const { storage, a } = device()
    const b = new Store(storage)
    a.update((d) => void (d.stats.whippers += 1))
    a.flush()
    const saved = storage.getItem(KEYS.save) as string
    for (const k of storage.keys()) storage.removeItem(k)
    b.externalWrite(change(KEYS.save, saved))
    expect(b.data.setup.complete).toBe(true)
    expect(b.data.stats.whippers).toBe(richSave().stats.whippers + 1)
    b.externalWrite(change(null, null))
    expect(parsed(storage, KEYS.save)).toStrictEqual(JSON.parse(saved))
  })

  it('…and when the background tab gets there before the tab that saved', () => {
    const { storage, a } = device()
    const b = new Store(storage)
    a.update((d) => void (d.stats.whippers += 1))
    a.flush()
    const saved = storage.getItem(KEYS.save) as string
    for (const k of storage.keys()) storage.removeItem(k)
    b.externalWrite(change(KEYS.save, saved))
    b.externalWrite(change(null, null))
    a.externalWrite(change(null, null))
    a.externalWrite(change(KEYS.save, storage.getItem(KEYS.save)))
    vi.runAllTimers()
    expect(parsed(storage, KEYS.save).stats.whippers).toBe(richSave().stats.whippers + 1)
    expect(parsed(storage, KEYS.save).setup.complete).toBe(true)
    expect(a.data.stats.whippers).toBe(richSave().stats.whippers + 1)
  })

  it('keeps an unsaved change when another tab’s write-back of the same save lands first', () => {
    const { storage, a } = device()
    const b = new Store(storage)
    a.update((d) => void (d.stats.whippers += 1)) // still waiting to be saved
    for (const k of storage.keys()) storage.removeItem(k)
    // B handles the clear() first and puts back the save as it was; A then sees it there.
    b.externalWrite(change(null, null))
    const putBack = storage.getItem(KEYS.save)
    a.externalWrite(change(null, null))
    // Each then gets the other's write.
    a.externalWrite(change(KEYS.save, putBack))
    b.externalWrite(change(KEYS.save, storage.getItem(KEYS.save)))
    vi.runAllTimers()
    const whippers = richSave().stats.whippers + 1
    expect(parsed(storage, KEYS.save).stats.whippers).toBe(whippers)
    expect(a.data.stats.whippers).toBe(whippers)
    expect(b.data.stats.whippers).toBe(whippers)
  })

  it('keeps changes whose earlier write failed (storage was full) through the clear()', () => {
    const storage = new MemoryStorage()
    storage.setItem(KEYS.save, JSON.stringify(richSave()))
    let full = true
    const flaky: StorageLike = {
      getItem: (k) => storage.getItem(k),
      setItem: (k, v) => {
        if (full && k === KEYS.save) throw new Error('QuotaExceededError')
        storage.setItem(k, v)
      },
      removeItem: (k) => storage.removeItem(k),
    }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const a = new Store(flaky)
    const b = new Store(storage)
    a.update((d) => void (d.stats.sends += 2))
    vi.runAllTimers()
    expect(a.lastWriteError).toContain('Quota')
    // The other app clears the origin (which frees the space); B writes back first.
    full = false
    for (const k of storage.keys()) storage.removeItem(k)
    b.externalWrite(change(null, null))
    a.externalWrite(change(null, null))
    expect(parsed(storage, KEYS.save).stats.sends).toBe(richSave().stats.sends + 2)
    expect(a.lastWriteError).toBeNull()
    warn.mockRestore()
  })

  it('never undoes a reset made between the clear() and this tab’s turn, even with unsaved changes', () => {
    const { storage, a } = device()
    const b = new Store(storage)
    a.update((d) => void (d.stats.whippers += 1))
    for (const k of storage.keys()) storage.removeItem(k)
    // Tab B's grown-up starts over before tab A has handled the clear().
    b.reset(DAY1)
    a.externalWrite(change(null, null))
    a.externalWrite(change(KEYS.save, storage.getItem(KEYS.save)))
    vi.runAllTimers()
    expect(parsed(storage, KEYS.save)).toStrictEqual(defaultSave(DAY1))
    expect(a.data).toStrictEqual(defaultSave(DAY1))
  })

  it('writes back the backup a save from another version of the app made, not an older one', () => {
    const { storage, a } = device()
    // A tab on a newer build saves; loading it here keeps its full text as the backup.
    const newer = JSON.stringify({ ...richSave(), schemaVersion: CURRENT_SCHEMA_VERSION + 1, comingLater: [1, 2] })
    storage.setItem(KEYS.save, newer)
    a.externalWrite(change(KEYS.save, newer))
    expect(storage.getItem(KEYS.backup)).toBe(newer)
    for (const k of storage.keys()) storage.removeItem(k)
    a.externalWrite(change(null, null))
    expect(storage.getItem(KEYS.backup)).toBe(newer)
    expect(storage.getItem(KEYS.save)).not.toBeNull()
  })
})
