import { describe, expect, it, vi } from 'vitest'
import { dayKey } from '../../src/model/clock'
import { KEYS } from '../../src/storage/keys'
import {
  LOAD_MESSAGES,
  MIGRATIONS,
  NEWER_VERSION,
  loadSave,
  migrateToCurrent,
  normalize,
} from '../../src/storage/migrations'
import { CURRENT_SCHEMA_VERSION, defaultSave } from '../../src/storage/schema'
import { MemoryStorage, Store } from '../../src/storage/store'
import { DAY1, at, richSave } from './fixtures'

/** A pre-versioned (v0) prototype save: no schemaVersion, flat settings, old field names. */
function v0Fixture(): Record<string, unknown> {
  return {
    createdAt: at(2026, 8, 1).toISOString(),
    pinHash: 'b'.repeat(64),
    pinSalt: 'oldsalt',
    parentNames: ['Mum', 'Dad'],
    dailyMinutes: 30,
    muted: true,
    goat: 'Pip',
    mountain: 'Big Blue',
    look: { hairStyle: 'bun', hairColor: '#111111' },
    whippers: 7,
    sends: 2,
    braveThings: [
      {
        id: 'old-1',
        text: 'Asked for help',
        fear: 8,
        howScary: 3,
        done: true,
        date: at(2026, 8, 2, 15).toISOString(),
        outcome: 'wobbly',
      },
      { id: 'old-2', text: 'Jump in the deep end', fear: 9, done: false, date: at(2026, 8, 3).toISOString() },
      { text: '' },
      'garbage',
    ],
    progress: { p01: { sends: 2, attempts: 9 }, p99: { sends: 1 } },
    badges: ['first-whipper', 'not-a-badge'],
    poses: ['starfish', 'pancake'],
    somethingElse: { x: 1 },
  }
}

/**
 * A v1 save, as the app wrote it before grown-ups could hide idea cards: the rich save with no
 * `hiddenIdeas` and schemaVersion 1.
 */
function v1Fixture(): Record<string, unknown> {
  const d = JSON.parse(JSON.stringify(richSave())) as Record<string, unknown>
  delete d.hiddenIdeas
  d.schemaVersion = 1
  return d
}

describe('loadSave', () => {
  it('missing save → fresh, and never falls back to the backup', () => {
    const storage = new MemoryStorage()
    const backupText = JSON.stringify(richSave())
    storage.setItem(KEYS.backup, backupText)
    const r = loadSave(storage, DAY1)
    expect(r.info.kind).toBe('fresh')
    expect(r.data).toStrictEqual(defaultSave(DAY1))
    expect(storage.getItem(KEYS.backup)).toBe(backupText)
  })

  it('a current save loads unchanged', () => {
    const storage = new MemoryStorage()
    storage.setItem(KEYS.save, JSON.stringify(richSave()))
    const r = loadSave(storage, DAY1)
    expect(r.info).toEqual({ kind: 'loaded', fromVersion: CURRENT_SCHEMA_VERSION })
    expect(r.data).toStrictEqual(richSave())
    expect(storage.getItem(KEYS.backup)).toBeNull()
  })

  it('a v0 save migrates, keeps her stuff, and the raw copy goes to the backup', () => {
    const storage = new MemoryStorage()
    const raw = JSON.stringify(v0Fixture())
    storage.setItem(KEYS.save, raw)
    const r = loadSave(storage, DAY1)
    expect(r.info.kind).toBe('migrated')
    expect(r.info.fromVersion).toBe(0)
    expect(r.info.message).toBe(LOAD_MESSAGES.migrated)
    expect(storage.getItem(KEYS.backup)).toBe(raw)

    const d = r.data
    expect(d.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(d.parent).toEqual({ pinHash: 'b'.repeat(64), pinSalt: 'oldsalt', names: ['Mum', 'Dad'], dailyClimbMinutes: 30 })
    expect(d.settings.muted).toBe(true)
    expect(d.profile.goatName).toBe('Pip')
    expect(d.profile.mountainName).toBe('Big Blue')
    expect(d.profile.look.hairStyle).toBe('bun')
    expect(d.profile.look.skinTone).toBe(defaultSave().profile.look.skinTone)
    expect(d.stats).toEqual({ whippers: 7, sends: 2, bigLeapsTried: 0, betaAsked: 0 })
    expect(d.brave).toHaveLength(2)
    const [done, planned] = d.brave
    expect(done).toMatchObject({
      id: 'old-1',
      text: 'Asked for help',
      forecast: 8,
      really: 3,
      status: 'done',
      outcome: 'wobbly',
      stoneDay: dayKey(at(2026, 8, 2, 15)),
    })
    expect(planned).toMatchObject({ id: 'old-2', status: 'planned', forecast: 9, stoneDay: null })
    expect(d.pitches.p01).toMatchObject({ sends: 2, totalAttempts: 9 })
    expect(Object.keys(d.pitches)).toEqual(['p01'])
    expect(Object.keys(d.badges)).toEqual(['first-whipper'])
    expect(Object.keys(d.poses).sort()).toEqual(['pancake', 'starfish'])
    expect(d.hiddenIdeas, 'v0 → v1 → v2: every idea card shows').toEqual([])
    expect('somethingElse' in d).toBe(false)
  })

  it('a v1 save migrates to v2: every idea card shows and nothing else changes', () => {
    const storage = new MemoryStorage()
    const raw = JSON.stringify(v1Fixture())
    storage.setItem(KEYS.save, raw)
    const r = loadSave(storage, DAY1)
    expect(r.info).toEqual({ kind: 'migrated', fromVersion: 1, message: LOAD_MESSAGES.migrated })
    expect(storage.getItem(KEYS.backup), 'the v1 text is kept as the backup').toBe(raw)
    expect(r.data.schemaVersion).toBe(2)
    expect(r.data.hiddenIdeas).toEqual([])
    expect(r.data).toStrictEqual({ ...richSave(), hiddenIdeas: [] })
  })

  it('the Store writes the migrated save back', () => {
    const storage = new MemoryStorage()
    storage.setItem(KEYS.save, JSON.stringify(v0Fixture()))
    const store = new Store(storage)
    expect(store.loadInfo.kind).toBe('migrated')
    expect(JSON.parse(storage.getItem(KEYS.save) as string).schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
  })

  it('corrupt save → the backup is loaded (recovered)', () => {
    const storage = new MemoryStorage()
    storage.setItem(KEYS.save, '{"schemaVersion":1,"brave":[{"te')
    storage.setItem(KEYS.backup, JSON.stringify(richSave()))
    const r = loadSave(storage, DAY1)
    expect(r.info.kind).toBe('recovered')
    expect(r.info.message).toBe(LOAD_MESSAGES.recoveredBackup)
    expect(r.data).toStrictEqual(richSave())
  })

  it('corrupt save with no backup → fresh (recovered), keeping the unreadable text aside', () => {
    const storage = new MemoryStorage()
    const corrupt = '{not json at all'
    storage.setItem(KEYS.save, corrupt)
    const r = loadSave(storage, DAY1)
    expect(r.info.kind).toBe('recovered')
    expect(r.info.message).toBe(LOAD_MESSAGES.recoveredFresh)
    expect(r.data).toStrictEqual(defaultSave(DAY1))
    expect(storage.getItem(KEYS.backup)).toBe(corrupt)
  })

  it('corrupt save with an unreadable backup → fresh (recovered)', () => {
    const storage = new MemoryStorage()
    storage.setItem(KEYS.save, 'nope')
    storage.setItem(KEYS.backup, 'also nope')
    const r = loadSave(storage, DAY1)
    expect(r.info.kind).toBe('recovered')
    expect(r.data).toStrictEqual(defaultSave(DAY1))
  })

  it.each(['[]', '42', 'null', '"text"', '{"schemaVersion":"abc"}', '{"schemaVersion":-1}'])(
    'treats %s as unreadable',
    (text) => {
      const storage = new MemoryStorage()
      storage.setItem(KEYS.save, text)
      expect(loadSave(storage, DAY1).info.kind).toBe('recovered')
    },
  )

  it('newer version → best-effort load, raw copy kept in the backup, notice for parent mode', () => {
    const storage = new MemoryStorage()
    const future = { ...richSave(), schemaVersion: 99, hoverboards: ['red'] }
    const raw = JSON.stringify(future)
    storage.setItem(KEYS.save, raw)
    const r = loadSave(storage, DAY1)
    expect(r.info.kind).toBe('newer')
    expect(r.info.fromVersion).toBe(99)
    expect(r.info.message).toBe(LOAD_MESSAGES.newer)
    expect(storage.getItem(KEYS.backup)).toBe(raw)
    expect(r.data.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(r.data.profile.goatName).toBe('Pip')
    expect(r.data.brave).toHaveLength(3)
    expect('hoverboards' in r.data).toBe(false)
  })

  it('survives a storage that throws on read', () => {
    const r = loadSave(
      {
        getItem: () => {
          throw new Error('denied')
        },
        setItem: () => undefined,
        removeItem: () => undefined,
      },
      DAY1,
    )
    expect(r.info.kind).toBe('fresh')
  })
})

describe('migrateToCurrent', () => {
  it('has a migration for every older version', () => {
    for (let v = 0; v < CURRENT_SCHEMA_VERSION; v++) expect(typeof MIGRATIONS[v]).toBe('function')
  })

  it('throws friendly errors for newer versions and non-objects', () => {
    expect(() => migrateToCurrent({ schemaVersion: CURRENT_SCHEMA_VERSION + 1 })).toThrow(NEWER_VERSION)
    for (const bad of [null, 42, 'x', [], undefined]) expect(() => migrateToCurrent(bad)).toThrow(/Up Anyway/)
  })

  it('does not mutate its input', () => {
    for (const raw of [v0Fixture(), v1Fixture()]) {
      const copy = JSON.parse(JSON.stringify(raw))
      migrateToCurrent(raw, DAY1)
      expect(raw).toEqual(copy)
    }
  })

  it('v1 → v2 adds an empty hidden-cards list and the new version, and only that', () => {
    const v1 = v1Fixture()
    const v2 = MIGRATIONS[1](v1)
    expect(CURRENT_SCHEMA_VERSION).toBe(2)
    expect(v2.schemaVersion).toBe(2)
    expect(v2.hiddenIdeas).toEqual([])
    const { hiddenIdeas: _h, schemaVersion: _v2, ...rest } = v2
    const { schemaVersion: _v1, ...before } = v1
    expect(rest).toEqual(before)
  })

  it('v1 → v2 keeps a list a v1 file already had, for normalize to check', () => {
    const v1 = { ...v1Fixture(), hiddenIdeas: ['oops-odd-socks', 'not-a-card', 'oops-odd-socks'] }
    expect(MIGRATIONS[1](v1).hiddenIdeas).toEqual(['oops-odd-socks', 'not-a-card', 'oops-odd-socks'])
    expect(migrateToCurrent(v1, DAY1).data.hiddenIdeas).toEqual(['oops-odd-socks'])
  })
})

describe('normalize', () => {
  it('is the identity on valid data', () => {
    expect(normalize(richSave(), DAY1)).toStrictEqual(richSave())
    expect(normalize(defaultSave(DAY1), DAY1)).toStrictEqual(defaultSave(DAY1))
  })

  it('turns anything into a valid default-shaped save', () => {
    for (const junk of [null, 7, 'x', [], {}, { setup: 'yes', stats: [], brave: 'lots' }]) {
      const d = normalize(junk, DAY1)
      expect(d).toStrictEqual(defaultSave(DAY1))
    }
  })

  it('coerces and clamps numbers', () => {
    const d = normalize(
      {
        parent: { dailyClimbMinutes: 100000, names: ['A', '', 3, 'B', 'C', 'D', 'E'] },
        stats: { whippers: -4, sends: '3', bigLeapsTried: 2.6, betaAsked: 'many' },
        climbTime: { day: 'Tuesday', seconds: -5 },
        brave: [
          { id: 'x1', text: 'a', forecast: 15, status: 'planned' },
          { id: 'x2', text: 'b', forecast: -3, status: 'planned' },
          { id: 'x3', text: 'c', forecast: '7', status: 'planned' },
          { id: 'x4', text: 'd', forecast: 'loud', status: 'planned' },
          { id: 'x5', text: 'e', forecast: 4, really: 99, status: 'done', doneAt: DAY1.toISOString(), stoneDay: null },
        ],
      },
      DAY1,
    )
    expect(d.parent.dailyClimbMinutes).toBe(240)
    expect(d.parent.names).toEqual(['A', 'B', 'C', 'D'])
    expect(d.stats).toEqual({ whippers: 0, sends: 3, bigLeapsTried: 3, betaAsked: 0 })
    expect(d.climbTime).toEqual({ day: '', seconds: 0 })
    expect(d.brave.map((b) => b.forecast)).toEqual([10, 0, 7, 5, 4])
    expect(d.brave[4].really).toBe(10)
    expect(normalize({ parent: { dailyClimbMinutes: 0 } }).parent.dailyClimbMinutes).toBe(0)
  })

  it('drops broken entries, fixes ids and never loses a placed stone', () => {
    const d = normalize(
      {
        brave: [
          { id: 'same', text: 'one', status: 'planned', forecast: 3 },
          { id: 'same', text: 'two', status: 'planned', forecast: 3 },
          { text: 'no id', forecast: 3 },
          { text: '   ' },
          null,
          { id: 'odd', text: 'has a stone', status: 'planned', stoneDay: '2026-10-01', forecast: 3 },
          { id: 'plan', text: 'plan with junk', status: 'planned', really: 3, outcome: 'nailed', forecast: 3 },
        ],
        letters: [{ id: 'l', text: 'hi', from: 'Dad', stoneDay: '2026-10-01', createdAt: DAY1.toISOString() }, { text: '' }],
        grownupFlops: [{ what: '' }, { who: 'Mum', what: 'Dropped the cake', learned: 'Two hands' }],
        customIdeas: [{ text: 'Wave first', oops: 'yes' }, 5],
      },
      DAY1,
    )
    expect(d.brave.map((b) => b.text)).toEqual(['one', 'two', 'no id', 'has a stone', 'plan with junk'])
    const ids = d.brave.map((b) => b.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids[0]).toBe('same')
    expect(ids[1]).not.toBe('same')
    expect(ids[2]).toMatch(/^b-/)
    expect(d.brave[3]).toMatchObject({ status: 'done', stoneDay: '2026-10-01' })
    expect(d.brave[3].doneAt).toBeTruthy()
    expect(d.brave[4]).not.toHaveProperty('really')
    expect(d.brave[4]).not.toHaveProperty('outcome')
    expect(d.letters).toHaveLength(1)
    expect(d.letters[0].openedAt).toBe(DAY1.toISOString())
    expect(d.grownupFlops).toHaveLength(1)
    expect(d.grownupFlops[0].id).toMatch(/^f-/)
    expect(d.customIdeas).toEqual([expect.objectContaining({ text: 'Wave first', oops: false })])
  })

  it('keeps only hidden ids that are still built-in cards, each once, in the order hidden', () => {
    const d = normalize(
      {
        ...richSave(),
        hiddenIdeas: ['oops-odd-socks', 'school-assembly', 'oops-odd-socks', 'a-card-that-was-removed', 'i-1', '', 7, null, { id: 'x' }],
      },
      DAY1,
    )
    // 'i-1' is a grown-up's own card (removed, never hidden), so it isn't kept either.
    expect(d.hiddenIdeas).toEqual(['oops-odd-socks', 'school-assembly'])
    for (const junk of [undefined, null, 'school-assembly', { 0: 'school-assembly' }, 3]) {
      expect(normalize({ ...richSave(), hiddenIdeas: junk }, DAY1).hiddenIdeas, String(junk)).toEqual([])
    }
  })

  it('keeps unknown fields, pitches, zones and badges out', () => {
    const d = normalize(
      {
        extra: 1,
        pitches: { p01: { sends: 1 }, p17: { sends: 1 }, __proto__: { sends: 1 } },
        looksScary: { meadow: { forecast: 3, really: 1, at: DAY1.toISOString() }, moon: { forecast: 1 }, ridge: { really: 2 } },
        badges: { 'first-whipper': DAY1.toISOString(), 'speed-run': DAY1.toISOString(), beta: true, oops: 'not a date' },
        poses: { starfish: { count: 0 }, bad: 3 },
        profile: { look: { hairStyle: 7, gear: ['x', 'x', 4] }, goatName: 5 },
        flags: { persistGranted: 'sure' },
      },
      DAY1,
    )
    expect('extra' in d).toBe(false)
    expect(Object.keys(d.pitches)).toEqual(['p01'])
    expect(Object.keys(d.looksScary)).toEqual(['meadow'])
    expect(d.badges).toEqual({ 'first-whipper': DAY1.toISOString(), beta: DAY1.toISOString() })
    expect(d.poses).toEqual({ starfish: { firstAt: DAY1.toISOString(), count: 1 } })
    expect(d.profile.look.hairStyle).toBe(defaultSave().profile.look.hairStyle)
    expect(d.profile.look.gear).toEqual(['x'])
    expect(d.profile.goatName).toBe('')
    expect(d.flags.persistGranted).toBeNull()
  })

  it('repairs runs: arcs capped and downsampled, path kept consistent with the arcs', () => {
    const longArc = Array.from({ length: 100 }, (_, i) => i * 1.4)
    const d = normalize(
      {
        pitches: {
          p02: {
            run: {
              lastCampId: 'c0',
              whippers: 250,
              failedArcs: Array.from({ length: 250 }, (_, i) => [i, i, i + 1, i + 1]),
              routeArcs: [longArc, [1, 2, 3, 4]],
              routePath: ['c0', 'a'],
              fallsBySpot: { c0: 4, junk: 'x', zero: 0 },
            },
            nightRun: { whippers: 1 },
          },
          p03: {
            run: {
              lastCampId: 'c1',
              lastCampRouteIndex: 2,
              routeArcs: [[0, 0, 1, 1], longArc],
              routePath: ['c0', 'a', 'c1'],
              highestRouteIndex: 1,
            },
          },
        },
      },
      DAY1,
    )
    const run = d.pitches.p02?.run
    expect(run).toBeTruthy()
    if (!run) return
    expect(run.failedArcs).toHaveLength(200)
    expect(run.failedArcs[0]).toEqual([50, 50, 51, 51])
    expect(run.routeArcs).toEqual([])
    expect(run.routePath).toEqual(['c0'])
    expect(run.fallsBySpot).toEqual({ c0: 4 })
    expect(run.night).toBe(false)
    expect(d.pitches.p02?.nightRun).toBeNull()

    const ok = d.pitches.p03?.run
    expect(ok?.routePath).toEqual(['c0', 'a', 'c1'])
    expect(ok?.routeArcs[1].length).toBeLessThanOrEqual(32)
    expect(ok?.routeArcs[1].every((n) => Number.isInteger(n))).toBe(true)
    expect(ok?.highestRouteIndex).toBe(2)
  })

  it('round-trips through JSON without changes', () => {
    const d = richSave()
    expect(normalize(JSON.parse(JSON.stringify(d)), DAY1)).toStrictEqual(d)
  })

  it('does not warn on a clean load', () => {
    const warn = vi.spyOn(console, 'warn')
    const storage = new MemoryStorage()
    storage.setItem(KEYS.save, JSON.stringify(richSave()))
    loadSave(storage, DAY1)
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
