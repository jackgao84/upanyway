/**
 * The save store. One JSON document under KEYS.save. All writes go through `update()`, which
 * mutates the live document, schedules a debounced save, and notifies subscribers.
 *
 * Storage is injectable (`StorageLike`) so unit tests run in node with an in-memory map.
 */
import { KEYS } from './keys'
import { loadSave, versionOf, type LoadResult } from './migrations'
import { CURRENT_SCHEMA_VERSION, defaultSave, type SaveData } from './schema'

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export class MemoryStorage implements StorageLike {
  private map = new Map<string, string>()
  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value))
  }
  removeItem(key: string): void {
    this.map.delete(key)
  }
  keys(): string[] {
    return [...this.map.keys()]
  }
}

type Listener = (data: SaveData) => void

export class Store {
  private doc: SaveData
  private listeners = new Set<Listener>()
  private timer: ReturnType<typeof setTimeout> | null = null
  /**
   * True while the live document holds changes not yet written. flush() writes only then, so hiding
   * a tab that changed nothing never writes its (possibly stale) copy over another tab's save.
   */
  private dirty = false
  /** How the document was loaded (fresh / migrated / recovered from backup / newer-version notice). */
  readonly loadInfo: LoadResult['info']
  /** Set when the stored save could not be written (e.g. storage full). Shown in parent mode. */
  lastWriteError: string | null = null

  constructor(
    private readonly storage: StorageLike,
    private readonly debounceMs = 150,
  ) {
    const result = loadSave(storage)
    this.doc = result.data
    this.loadInfo = result.info
    if (result.info.kind === 'migrated' || result.info.kind === 'recovered' || result.info.kind === 'fresh') {
      this.dirty = true
      this.flush()
    }
  }

  /** The live document. Treat as read-only outside `update()`. */
  get data(): SaveData {
    return this.doc
  }

  /** Mutate the document. Saves (debounced) and notifies subscribers. */
  update(fn: (draft: SaveData) => void): void {
    fn(this.doc)
    this.dirty = true
    this.schedule()
    this.emit()
  }

  /** Replace the whole document (import / reset). Writes immediately. */
  replace(next: SaveData): void {
    this.doc = next
    this.dirty = true
    this.flush()
    this.emit()
  }

  /** Fresh save (parent reset). The previous document is kept as the backup first. */
  reset(now: Date = new Date()): void {
    this.writeBackup()
    this.replace(defaultSave(now))
  }

  /**
   * Another tab or window of the app (same origin, same storage) wrote the save: take its copy, so
   * this one never writes stale data back over it. Wired to the window 'storage' event in main.ts
   * (the browser fires it only in the OTHER tabs). A change this tab made in the last moment before
   * (still debounced) gives way to the other tab's newer write.
   */
  externalWrite(key: string | null, newValue: string | null): void {
    if (key !== KEYS.save || newValue === null) return
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.doc = loadSave(this.storage).data
    this.dirty = false
    this.emit()
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  /**
   * Write any pending change now (called on pagehide / visibilitychange and by replace). Does nothing
   * when the document is unchanged since the last successful write.
   */
  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (!this.dirty) return
    try {
      this.storage.setItem(KEYS.save, JSON.stringify(this.doc))
      this.dirty = false
      this.lastWriteError = null
    } catch (err) {
      this.lastWriteError = err instanceof Error ? err.message : String(err)
      console.warn('[upanyway] save failed', err)
    }
  }

  /**
   * Copy the currently stored save to the backup key (writing any pending change first). A backup that
   * holds a save from a newer version of the app is never replaced: it is the only full copy of that
   * save (this version can only read part of it), and the grown-up was told it was kept.
   */
  writeBackup(): void {
    if (this.timer) this.flush()
    try {
      if (holdsNewerSave(this.storage.getItem(KEYS.backup))) return
      const current = this.storage.getItem(KEYS.save)
      if (current) this.storage.setItem(KEYS.backup, current)
    } catch (err) {
      console.warn('[upanyway] backup failed', err)
    }
  }

  private schedule(): void {
    if (this.timer) return
    this.timer = setTimeout(() => {
      this.timer = null
      this.flush()
    }, this.debounceMs)
  }

  private emit(): void {
    for (const fn of [...this.listeners]) fn(this.doc)
  }
}

/** True when `text` is a save written by a newer version of the app. */
function holdsNewerSave(text: string | null): boolean {
  if (!text) return false
  try {
    const parsed: unknown = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false
    const v = versionOf(parsed as Record<string, unknown>)
    return v !== null && v > CURRENT_SCHEMA_VERSION
  } catch {
    return false
  }
}

let instance: Store | null = null

/** The app-wide store (created in main.ts with window.localStorage). */
export function store(): Store {
  if (!instance) throw new Error('Store not initialised')
  return instance
}

export function initStore(storage: StorageLike): Store {
  instance = new Store(storage)
  return instance
}

/** Ask the browser not to evict our data (Safari supports this from 15.2+). */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage && typeof navigator.storage.persist === 'function') {
      if (typeof navigator.storage.persisted === 'function' && (await navigator.storage.persisted())) return true
      return await navigator.storage.persist()
    }
  } catch (err) {
    console.warn('[upanyway] persist() failed', err)
  }
  return false
}
