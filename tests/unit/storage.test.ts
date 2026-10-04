import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { KEYS } from '../../src/storage/keys'
import { defaultSave } from '../../src/storage/schema'
import { MemoryStorage, Store, type StorageLike } from '../../src/storage/store'
import { DAY1, richSave } from './fixtures'

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
    a.externalWrite(KEYS.save, storage.getItem(KEYS.save))
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

  it('ignores other keys and removals', () => {
    const storage = new MemoryStorage()
    const a = new Store(storage)
    let notified = 0
    a.subscribe(() => notified++)
    a.externalWrite('otherapp:save', '{}')
    a.externalWrite(KEYS.save, null)
    a.externalWrite(null, null)
    expect(notified).toBe(0)
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
