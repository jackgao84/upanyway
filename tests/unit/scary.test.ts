/**
 * The Looks Scary set-pieces and the Cloud Steps fog, on every level (node: no drawing): a no-op where
 * there is no moment; cues, the cliff's rumble and the bridge's loose planks; focus points inside the
 * pitch; the reveal plays once and stays gentle; fog only in Cloud Steps and on the summit.
 */
import { describe, expect, it } from 'vitest'
import { Camera } from '../../src/game/camera'
import { ClimbSession } from '../../src/game/engine'
import { ALL_LEVELS } from '../../src/game/levels'
import { bigLeapTarget, FogLayer } from '../../src/game/render/fog'
import { ScaryLayer, type ScaryCue } from '../../src/game/render/scary'
import type { LooksScaryKind } from '../../src/game/types'

/** The sound each reveal starts with. */
const REVEAL_CUE: Record<LooksScaryKind, ScaryCue> = { bigleap: 'sparkle', eyes: 'sparkle', rumble: 'snore', bridge: 'creak', shadow: 'sparkle' }

const cam = () => {
  const c = new Camera()
  c.resize(820, 1180, { top: 74, bottom: 88, left: 0, right: 0 }, 2)
  return c
}

describe('ScaryLayer on every level', () => {
  for (const level of ALL_LEVELS) {
    it(level.id, () => {
      const s = new ScaryLayer(level)
      expect(s.kind).toBe(level.looksScary?.kind ?? null)
      if (!level.looksScary) {
        expect(s.bridgeGaps()).toEqual([])
        return
      }
      const c = cam()
      const shakes: number[] = []
      const orig = c.shake.bind(c)
      c.shake = (m: number, sec: number) => { shakes.push(m); orig(m, sec) }
      const cues: ScaryCue[] = []
      s.onCue = (x) => cues.push(x)
      s.setPhase('looming', 0)
      const ls = level.looksScary
      const at = level.elements.find((e) => e.id === ls.forecastAt)!
      c.setTarget(ls.y, 1)
      c.snap()
      for (let i = 0; i < 600; i++) s.update(1 / 60, c, { x: at.x, y: at.y })
      const f = s.focus()
      const ff = s.forecastFocus()
      for (const p of [f, ff]) {
        expect(p.x).toBeGreaterThan(-20)
        expect(p.x).toBeLessThan(420)
        expect(p.y).toBeGreaterThan(0)
        expect(p.y).toBeLessThan(level.height + 200)
      }
      expect(s.revealDuration()).toBeGreaterThan(1.5)
      expect(s.revealDuration()).toBeLessThan(4)
      if (ls.kind === 'rumble') { expect(cues).toContain('rumble'); expect(shakes.length).toBeGreaterThan(1); expect(cues).not.toContain('snore') }
      if (ls.kind === 'bridge') { expect(cues).toContain('creak'); expect(s.bridgeGaps().length).toBe(2) }
      // The reveal itself asks for its own sound (not just the looming cues from before).
      const n = cues.length
      s.setPhase('revealing', 10)
      expect(cues.slice(n)).toContain(REVEAL_CUE[ls.kind])
      for (let i = 0; i < 300; i++) s.update(1 / 60, c, { x: at.x, y: at.y })
      s.setPhase('revealed', 15)
      s.setPhase('revealing', 16)
      expect(s.phase).toBe('revealed')
      if (ls.kind === 'bridge') expect(s.bridgeGaps()).toEqual([])
      s.destroy()
    })
  }
})

describe('FogLayer', () => {
  it('is only active in Cloud Steps and the summit, with a bank per Big Leap', () => {
    for (const level of ALL_LEVELS) {
      const fog = new FogLayer(level.zone, { level })
      expect(fog.active).toBe(level.zone === 'cloud' || level.zone === 'summit')
      fog.update(0.016)
      fog.destroy()
    }
  })
  it('bigLeapTarget names the landing at a take-off', () => {
    const level = ALL_LEVELS.find((l) => l.id === 'p13')!
    const b = level.bigLeaps![0]
    const s = new ClimbSession({ level, startId: b.from, choosePose: () => 'starfish' })
    const to = level.elements.find((e) => e.id === b.to)!
    expect(bigLeapTarget(s)).toEqual({ x: to.x, y: to.y, w: (to as { w: number }).w })
    const s2 = new ClimbSession({ level, startId: level.route[0], choosePose: () => 'starfish' })
    expect(bigLeapTarget(s2)).toBeNull()
  })
})

describe('Camera shake', () => {
  it('shakes the picture, except with reduced motion', () => {
    const c = cam()
    const x0 = c.worldToScreen(200, 300).x
    c.shake(2.6, 0.9)
    c.update(0.05, 2000)
    expect(c.worldToScreen(200, 300).x).not.toBe(x0)
    const still = cam()
    still.reducedMotion = true
    still.shake(2.6, 0.9)
    for (let i = 0; i < 20; i++) {
      still.update(0.02, 2000)
      expect(still.worldToScreen(200, 300).x).toBe(x0)
    }
  })
})
