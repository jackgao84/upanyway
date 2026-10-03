/**
 * The save store. One JSON document under KEYS.save. All writes go through `update()`, which
 * mutates the live document, schedules a debounced save, and notifies subscribers.
 *
 * Storage is injectable (`StorageLike`) so unit tests run in node with an in-memory map.
 */
import { KEYS } from './keys'
import { loadSave, type LoadResult } from './migrations'
import { defaultSave, type SaveData } from './schema'

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
    this.schedule()
    this.emit()
  }

  /** Replace the whole document (import / reset). Writes immediately. */
  replace(next: SaveData): void {
    this.doc = next
    this.flush()
    this.emit()
  }

  /** Fresh save (parent reset). The previous document is kept as the backup first. */
  reset(now: Date = new Date()): void {
    this.writeBackup()
    this.replace(defaultSave(now))
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  /** Write now (called on pagehide / visibilitychange and by replace). */
  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    try {
      this.storage.setItem(KEYS.save, JSON.stringify(this.doc))
      this.lastWriteError = null
    } catch (err) {
      this.lastWriteError = err instanceof Error ? err.message : String(err)
      console.warn('[upanyway] save failed', err)
    }
  }

  /** Copy the currently stored save to the backup key (writing any pending change first). */
  writeBackup(): void {
    if (this.timer) this.flush()
    try {
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
