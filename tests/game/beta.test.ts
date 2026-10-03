/** Beta hints describe her real last attempt: each miss class from actual simulated arcs. */
import { describe, expect, test } from 'vitest'
import { betaAvailable, classifyMiss, type MissInfo } from '../../src/game/beta'
import { getLevel } from '../../src/game/levels'
import { solutionFrom } from '../../src/game/levels/solutions'
import { indexLevel, simulateLeap } from '../../src/game/physics'

const level = getLevel('p01')!
const idx = indexLevel(level)
const from = idx.byId.get('c0')!
const target = idx.byId.get('a1')!
const sol = solutionFrom('p01', 'c0')!

function miss(angle: number, power: number): MissInfo {
  const r = simulateLeap(level, { fromId: 'c0', t0: 0 }, angle, power, { ropeLineY: -30, record: true, sampleEvery: 3 })
  expect(r.contact?.kind === 'fall' || (r.contact && r.contact.id !== 'a1')).toBeTruthy()
  return { kind: 'rope', arc: r.path, launch: { angle, power }, bumped: false, gusted: false }
}

describe('classifyMiss', () => {
  test('too little power → short', () => {
    expect(classifyMiss(level, from, target, miss(sol.angle, sol.power - 0.25), sol)).toBe('short')
  })
  test('too much power → long', () => {
    expect(classifyMiss(level, from, target, miss(30, 1), sol)).toBe('long')
  })
  test('aimed much flatter and stayed low → flat', () => {
    expect(classifyMiss(level, from, target, miss(20, 0.5), sol)).toBe('flat')
  })
  test('aimed much steeper and came down before it → steep', () => {
    expect(classifyMiss(level, from, target, miss(88, 0.8), sol)).toBe('steep')
  })
  test('bumped / gust / crumbled come from the engine flags', () => {
    const base = miss(sol.angle, sol.power - 0.25)
    expect(classifyMiss(level, from, target, { ...base, bumped: true }, sol)).toBe('bumped')
    expect(classifyMiss(level, from, target, { ...base, gusted: true }, sol)).toBe('gust')
    expect(classifyMiss(level, from, target, { ...base, kind: 'crumble', launch: null }, sol)).toBe('crumbled')
  })
})

test('hint after 3 falls at a spot, ghost after 6', () => {
  expect(betaAvailable(2)).toEqual({ hint: false, ghost: false })
  expect(betaAvailable(3)).toEqual({ hint: true, ghost: false })
  expect(betaAvailable(6)).toEqual({ hint: true, ghost: true })
})
