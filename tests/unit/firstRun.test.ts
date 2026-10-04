/** First-run order: where a reload resumes, and which steps the route guard lets her open. */
import { beforeEach, describe, expect, it } from 'vitest'
import { setupPath, setupStep } from '../../src/app/context'
import { guard } from '../../src/app/screens'
import { makePinRecord } from '../../src/model/pin'
import { makeRecoveryRecord, newRecoveryCode } from '../../src/model/recovery'
import { normalize } from '../../src/storage/migrations'
import { defaultLook, defaultSave } from '../../src/storage/schema'
import { MemoryStorage, initStore, store } from '../../src/storage/store'

const at = (path: string) => guard({ path, params: {}, query: new URLSearchParams() })

function grownUpsDone(): void {
  store().update((d) => {
    Object.assign(d.parent, makePinRecord('2580'), makeRecoveryRecord(newRecoveryCode()))
    d.parent.names = ['Mum']
    d.setup.parentDone = true
  })
}

beforeEach(() => {
  initStore(new MemoryStorage())
})

describe('first run', () => {
  it('starts with the grown-ups and keeps her out until they are done', () => {
    expect(setupStep(store().data)).toBe('hello')
    expect(at('/camp')).toBe('/setup/hello')
    expect(at('/setup/climber')).toBe('/setup/hello')
    expect(at('/setup/recovery'), 'no recovery code before a PIN').toBe('/setup/hello')
    expect(at('/setup/names')).toBe('/setup/hello')
    store().update((d) => Object.assign(d.parent, makePinRecord('2580')))
    // Right after the PIN: the recovery code, until "I've written it down" saves it.
    expect(setupStep(store().data)).toBe('recovery')
    expect(at('/setup/recovery')).toBeNull()
    expect(at('/setup/names'), 'the code can’t be skipped').toBe('/setup/recovery')
    expect(at('/setup/handover')).toBe('/setup/recovery')
    expect(at('/')).toBe('/setup/recovery')
    store().update((d) => Object.assign(d.parent, makeRecoveryRecord(newRecoveryCode())))
    expect(setupStep(store().data)).toBe('names')
    expect(at('/setup/names')).toBeNull()
    expect(at('/setup/recovery'), 'a saved code is never shown again').toBe('/setup/names')
    expect(at('/setup/hello'), 'the PIN can still be changed').toBeNull()
    expect(at('/setup/handover')).toBe('/setup/names')
  })

  it('a first run from before recovery codes asks for one only while the grown-ups’ part is open', () => {
    store().update((d) => Object.assign(d.parent, makePinRecord('2580')))
    expect(setupStep(store().data)).toBe('recovery')
    store().update((d) => {
      d.parent.names = ['Mum']
      d.setup.parentDone = true
    })
    // Past the grown-ups' part already: she carries on (the grown-ups' home invites them to make one).
    expect(setupStep(store().data)).toBe('handover')
    expect(at('/setup/recovery')).toBe('/setup/handover')
    expect(at('/setup/handover')).toBeNull()
  })

  it('opens the hand-over and the designer, but not the goat, before she has saved a look', () => {
    grownUpsDone()
    expect(setupPath(store().data)).toBe('/setup/handover')
    expect(at('/setup/handover')).toBeNull()
    expect(at('/setup/climber')).toBeNull()
    expect(at('/setup/goat')).toBe('/setup/handover')
  })

  it('moves on to the goat when the look she saved is the default one', () => {
    grownUpsDone()
    store().update((d) => {
      d.profile.look = defaultLook()
      d.setup.lookDone = true
    })
    expect(setupStep(store().data)).toBe('goat')
    expect(at('/setup/goat')).toBeNull()
    expect(at('/setup/climber')).toBeNull()
    expect(at('/setup/mountain')).toBe('/setup/goat')
  })

  it('walks the kid steps in order as each answer is saved', () => {
    grownUpsDone()
    const steps: string[] = []
    const answer: Record<string, () => void> = {
      handover: () => store().update((d) => (d.setup.lookDone = true)),
      goat: () => store().update((d) => (d.profile.goatName = 'Pip')),
      mountain: () => store().update((d) => (d.profile.mountainName = 'Big Blue')),
      lesson: () => store().update((d) => (d.lessonDone = true)),
      brave: () => store().update((d) => (d.flags.braveVsDangerousSeen = true)),
      cheer: () => store().update((d) => (d.setup.complete = true)),
    }
    while (!store().data.setup.complete) {
      const step = setupStep(store().data)
      steps.push(step)
      answer[step]()
    }
    expect(steps).toEqual(['handover', 'goat', 'mountain', 'lesson', 'brave', 'cheer'])
    expect(at('/setup/goat')).toBe('/camp')
    expect(at('/')).toBe('/camp')
    expect(at('/camp')).toBeNull()
  })

  it('treats saves from before the designer flag as past the designer once the goat has a name', () => {
    const old = JSON.parse(JSON.stringify(defaultSave())) as Record<string, unknown> & {
      setup: Record<string, unknown>
      profile: Record<string, unknown>
    }
    delete old.setup.lookDone
    expect(normalize(old).setup.lookDone).toBe(false)
    old.profile.goatName = 'Pip'
    expect(normalize(old).setup.lookDone).toBe(true)
  })
})
