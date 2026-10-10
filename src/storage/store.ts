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

/** What `Store.externalWrite` needs from a window 'storage' event (a StorageEvent fits). */
export interface StorageChange {
  key: string | null
  newValue: string | null
  /** The page that made the change; empty when the browser itself cleared the site's data. */
  url: string
}

export class Store {
  private doc: SaveData
  private listeners = new Set<Listener>()
  private timer: ReturnType<typeof setTimeout> | null = null
  /**
   * True while the live document holds changes not yet written. flush() writes only then, so hiding
   * a tab that changed nothing never writes its (possibly stale) copy over another tab's save.
   */
  private dirty = false
  /** The backup as last seen in storage, so a backup removed from outside can be written back. */
  private backupText: string | null = null
  /**
   * The save as this tab last had it in step with storage (loaded, written, or taken from another
   * tab), without its unsaved changes. After a removal it tells another tab's plain write-back of
   * that same save (this tab's unsaved changes are newer) from a real new write such as a reset.
   */
  private syncedText: string | null = null
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
    this.syncedText = JSON.stringify(this.doc)
    if (result.info.kind === 'migrated' || result.info.kind === 'recovered' || result.info.kind === 'fresh') {
      this.dirty = true
      this.flush()
    }
    this.backupText = this.read(KEYS.backup)
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
   * Something else on this origin changed storage. Wired to the window 'storage' event in main.ts
   * (a page's change reaches the OTHER tabs and windows of the origin, never its own).
   * - Another tab of the app wrote the save: take its copy, so this one never writes stale data back
   *   over it. A change this tab made in the last moment before (still debounced) gives way to it.
   *   Storage is read now (the latest write); if a clear() has emptied it since, the event's own copy.
   * - Another tab wrote the backup: remember it.
   * - A page removed this app's save or backup (key null = another app on the shared origin called
   *   localStorage.clear()): write this tab's copy straight back. Only removals: a changed key is
   *   another tab's reset or restore, which is taken, never undone. The app itself never removes
   *   its keys, so such a removal always comes from outside it. A removal with no page URL is the
   *   browser clearing the site's data (a grown-up's choice, Clear-Site-Data): left alone.
   */
  externalWrite({ key, newValue, url }: StorageChange): void {
    if (key !== null && key !== KEYS.save && key !== KEYS.backup) return
    if (key === null || newValue === null) {
      if (url) this.writeBackRemoved()
      return
    }
    if (key === KEYS.backup) {
      this.backupText = newValue
      return
    }
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    const latest: StorageLike = {
      getItem: (k) => (k === KEYS.save ? (this.read(KEYS.save) ?? newValue) : this.storage.getItem(k)),
      setItem: (k, v) => this.storage.setItem(k, v),
      removeItem: (k) => this.storage.removeItem(k),
    }
    this.doc = loadSave(latest).data
    this.syncedText = JSON.stringify(this.doc)
    this.dirty = false
    // Loading an older or newer version's save writes the backup here, which no event reports.
    this.backupText = this.read(KEYS.backup)
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
      const text = JSON.stringify(this.doc)
      this.storage.setItem(KEYS.save, text)
      this.syncedText = text
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
      if (current) {
        this.storage.setItem(KEYS.backup, current)
        this.backupText = current
      }
    } catch (err) {
      console.warn('[upanyway] backup failed', err)
    }
  }

  /**
   * Put back whichever of the save and backup is missing from storage, from this tab's copies (the
   * live document, unsaved changes included, and the backup as last seen). A key that is present
   * again (another open tab got there first) is left alone, with one exception: when this tab has
   * unsaved changes and what was put back is exactly the save it last had in step, its own copy is
   * that save plus those changes, so it is written. Anything else there (a reset or restore made
   * since) wins. Nothing is written when storage can't be read.
   */
  private writeBackRemoved(): void {
    const save = this.peek(KEYS.save)
    if (save === null || (save !== undefined && this.dirty && sameSave(save, this.syncedText))) {
      this.dirty = true
      this.flush()
    }
    if (this.backupText === null || this.peek(KEYS.backup) !== null) return
    try {
      this.storage.setItem(KEYS.backup, this.backupText)
    } catch (err) {
      console.warn('[upanyway] backup failed', err)
    }
  }

  /** A stored value: null when storage answers that it isn't there, undefined when it can't be read. */
  private peek(key: string): string | null | undefined {
    try {
      return this.storage.getItem(key)
    } catch {
      return undefined
    }
  }

  /** A stored value, or null when it is missing or storage can't be read. */
  private read(key: string): string | null {
    try {
      return this.storage.getItem(key)
    } catch {
      return null
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

/** True when two saves hold the same document (key order aside). */
function sameSave(a: string, b: string | null): boolean {
  if (b === null) return false
  if (a === b) return true
  try {
    return sameJson(JSON.parse(a), JSON.parse(b))
  } catch {
    return false
  }
}

function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false
  const ka = Object.keys(a)
  if (ka.length !== Object.keys(b).length) return false
  return ka.every(
    (k) => Object.hasOwn(b, k) && sameJson((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  )
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
