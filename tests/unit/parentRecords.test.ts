/**
 * Parent mode rules (src/screens/parent/records.ts): Grown-ups' Wing flops, idea cards (≤ 12 words,
 * never a task), taking back an unopened letter, the daily-minutes stepper (5–120 in fives, or no
 * limit) and the test-mode switch (her real runs come back exactly as they were).
 * Plus: the read-only cairn page never reads how often she said "Not today".
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { currentRun, recordWhipper, startRun } from '../../src/model/attempts'
import { addBraveThing, addLetter, openLetter, totalStones } from '../../src/model/stones'
import {
  MAX_IDEA_WORDS,
  NO_LIMIT_STEP,
  addCustomIdea,
  addGrownupFlop,
  applyTestMode,
  editGrownupFlop,
  minutesToStep,
  removeCustomIdea,
  removeGrownupFlop,
  stepToMinutes,
  takeBackLetter,
  tidyIdea,
} from '../../src/screens/parent/records'
import { UNLOCKABLES } from '../../src/content/unlockables'
import { gearSlot } from '../../src/game/art/gear'
import { unlockedGear } from '../../src/model/unlockables'
import { DAY1, at, doBrave, fresh, withStones } from './fixtures'

describe("Grown-ups' Wing", () => {
  it('hangs, changes and takes down a flop', () => {
    const d = fresh()
    const f = addGrownupFlop(d, { who: '  Dad ', what: ' Burnt the pancakes   for guests ', learned: 'Lower heat.' }, DAY1)
    expect(f).not.toBeNull()
    expect(d.grownupFlops).toHaveLength(1)
    expect(f).toMatchObject({ who: 'Dad', what: 'Burnt the pancakes for guests', learned: 'Lower heat.' })
    expect(f?.createdAt).toBe(DAY1.toISOString())

    expect(editGrownupFlop(d, f!.id, { who: 'Mum', what: 'Locked the keys in the car', learned: '' })).toBe(true)
    expect(d.grownupFlops[0]).toMatchObject({ id: f!.id, who: 'Mum', what: 'Locked the keys in the car', learned: '', createdAt: DAY1.toISOString() })

    expect(removeGrownupFlop(d, f!.id)).toBe(true)
    expect(d.grownupFlops).toHaveLength(0)
    expect(removeGrownupFlop(d, f!.id)).toBe(false)
  })

  it('needs something to say', () => {
    const d = fresh()
    expect(addGrownupFlop(d, { who: 'Mum', what: '   ', learned: 'x' }, DAY1)).toBeNull()
    const f = addGrownupFlop(d, { who: 'Mum', what: 'Sang the wrong words', learned: '' }, DAY1)!
    expect(editGrownupFlop(d, f.id, { who: 'Mum', what: '  ', learned: '' })).toBe(false)
    expect(d.grownupFlops[0].what).toBe('Sang the wrong words')
    expect(editGrownupFlop(d, 'nope', { who: 'Mum', what: 'x', learned: '' })).toBe(false)
  })

  it('never touches her stones or stats', () => {
    const d = fresh()
    doBrave(d, DAY1)
    const before = JSON.stringify({ brave: d.brave, letters: d.letters, stats: d.stats, badges: d.badges })
    const f = addGrownupFlop(d, { who: 'Dad', what: 'Fell off the paddleboard', learned: 'Knees bent' }, DAY1)!
    editGrownupFlop(d, f.id, { who: 'Dad', what: 'Fell off the paddleboard twice', learned: 'Knees bent' })
    removeGrownupFlop(d, f.id)
    expect(JSON.stringify({ brave: d.brave, letters: d.letters, stats: d.stats, badges: d.badges })).toBe(before)
  })
})

describe('idea cards', () => {
  it('tidies the words like the built-in cards', () => {
    expect(tidyIdea('  ask   the bus driver a question.  ')).toBe('Ask the bus driver a question')
    expect(tidyIdea('say hi first!')).toBe('Say hi first!')
    expect(tidyIdea('   ')).toBe('')
  })

  it(`adds a card of up to ${MAX_IDEA_WORDS} words, brave or Oops`, () => {
    const d = fresh()
    const brave = addCustomIdea(d, 'order at the canteen yourself', false, DAY1)
    const oops = addCustomIdea(d, 'Wear odd socks to the shops', true, DAY1)
    expect(brave).toMatchObject({ text: 'Order at the canteen yourself', oops: false })
    expect(oops).toMatchObject({ text: 'Wear odd socks to the shops', oops: true })
    expect(d.customIdeas.map((i) => i.id)).toEqual([brave!.id, oops!.id])

    const twelve = 'one two three four five six seven eight nine ten eleven twelve'
    expect(addCustomIdea(d, twelve, false, DAY1)).not.toBeNull()
    expect(addCustomIdea(d, `${twelve} thirteen`, false, DAY1)).toBeNull()
    expect(addCustomIdea(d, '  ', false, DAY1)).toBeNull()
    expect(d.customIdeas).toHaveLength(3)
  })

  it('removes a card; brave things logged from it keep their words', () => {
    const d = fresh()
    const idea = addCustomIdea(d, 'Ask for a different flavour', false, DAY1)!
    addBraveThing(d, { text: idea.text, ideaId: idea.id, forecast: 5 }, DAY1)
    expect(removeCustomIdea(d, idea.id)).toBe(true)
    expect(d.customIdeas).toHaveLength(0)
    expect(d.brave[0].text).toBe('Ask for a different flavour')
    expect(removeCustomIdea(d, idea.id)).toBe(false)
  })
})

describe('Spotted! letters', () => {
  it('takes back only a letter that has not been opened', () => {
    const d = fresh()
    const a = addLetter(d, 'Mum', 'I saw you ask for help.', DAY1)
    const b = addLetter(d, 'Dad', 'I saw you try the deep end.', DAY1)
    openLetter(d, b.id, DAY1)
    expect(totalStones(d)).toBe(1)

    expect(takeBackLetter(d, b.id)).toBe(false)
    expect(takeBackLetter(d, a.id)).toBe(true)
    expect(d.letters.map((l) => l.id)).toEqual([b.id])
    expect(totalStones(d)).toBe(1)
    expect(takeBackLetter(d, 'missing')).toBe(false)
  })
})

describe('daily climbing minutes', () => {
  it('maps saved minutes to the 5–120 stepper and back, with 0 as "No limit"', () => {
    expect(minutesToStep(20)).toBe(20)
    expect(minutesToStep(0)).toBe(NO_LIMIT_STEP)
    expect(stepToMinutes(NO_LIMIT_STEP)).toBe(0)
    expect(minutesToStep(3)).toBe(5)
    expect(minutesToStep(240)).toBe(120)
    expect(minutesToStep(22)).toBe(20)
    expect(minutesToStep(Number.NaN)).toBe(20)
    for (let m = 5; m <= 120; m += 5) expect(stepToMinutes(minutesToStep(m))).toBe(m)
  })
})

describe('test mode switch', () => {
  it('forgets test climbs and brings her real run back exactly', () => {
    const d = fresh()
    const real = startRun(d, 'p01', 'p01-c0', false, at(2026, 10, 3, 9))
    recordWhipper(d, 'p01', false, { spotId: 'p01-c0', arc: [0, 0, 10, 10], kind: 'rope' })
    const realJson = JSON.stringify(d.pitches.p01)
    const stats = JSON.stringify(d.stats)
    expect(currentRun(d, 'p01', false)).toBe(d.pitches.p01?.run)

    applyTestMode(d, true)
    expect(currentRun(d, 'p01', false)).toBeNull()
    startRun(d, 'p01', 'p01-c0', false, DAY1)
    expect(currentRun(d, 'p01', false)).not.toBeNull()

    applyTestMode(d, false)
    expect(d.testMode).toBe(false)
    expect(currentRun(d, 'p01', false)).toBe(d.pitches.p01?.run)
    expect(JSON.stringify(d.pitches.p01)).toBe(realJson)
    expect(JSON.stringify(d.stats)).toBe(stats)
    expect(real.startedAt).toBe(at(2026, 10, 3, 9).toISOString())

    // Back on: the earlier test climb is gone too.
    applyTestMode(d, true)
    expect(currentRun(d, 'p01', false)).toBeNull()
  })

  it('takes off gear tried on in test mode before the summit', () => {
    const d = fresh()
    applyTestMode(d, true)
    d.profile.look.gear = ['gear-scarf']
    applyTestMode(d, false)
    expect(d.profile.look.gear).toEqual([])
  })

  it('keeps gear her own stones unlocked, and takes off the rest', () => {
    const d = fresh()
    d.summit = { reached: true, at: DAY1.toISOString(), finaleSeen: true }
    withStones(d, 2) // the first stone after the summit opens a decoration, the second a piece of gear
    const own = unlockedGear(d).map((g) => g.id)
    expect(own.length).toBe(1)
    const other = UNLOCKABLES.find((u) => u.kind === 'gear' && u.slot && u.id !== own[0] && u.slot !== gearSlot(own[0]))
    expect(other).toBeDefined()
    applyTestMode(d, true)
    d.profile.look.gear = [own[0], other!.id]
    applyTestMode(d, false)
    expect(d.profile.look.gear).toEqual([own[0]])
  })
})

describe('read the cairn', () => {
  it('never reads how often she said "Not today"', () => {
    const src = readFileSync(join(__dirname, '../../src/screens/parent/readCairn.ts'), 'utf8')
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(code).not.toMatch(/notTodayCount/)
    expect(code).not.toMatch(/\bworry\b/)
  })
})
