/**
 * Hiding built-in idea cards (src/model/ideas.ts): a grown-up can take any built-in brave idea or
 * Oops Mission off her "Pick an idea" screen and put it back. Hidden, never deleted: the cards
 * themselves never change, brave things and plans from a hidden card keep their words, it is fully
 * reversible, only built-in cards can be hidden, and test mode leaves it alone.
 */
import { describe, expect, it } from 'vitest'
import { IDEAS, ideaById } from '../../src/content/ideas'
import { hiddenCount, hideIdea, isBuiltInIdea, isHidden, showAllIdeas, showIdea, visibleIdeas } from '../../src/model/ideas'
import { addBraveThing } from '../../src/model/stones'
import { normalize } from '../../src/storage/migrations'
import { addCustomIdea, applyTestMode } from '../../src/screens/parent/records'
import { DAY1, doBrave, fresh } from './fixtures'

const BRAVE = ideaById('school-ask-question')!
const OOPS = ideaById('oops-odd-socks')!

describe('hiding built-in idea cards', () => {
  it('starts with every card showing', () => {
    const d = fresh()
    expect(d.hiddenIdeas).toEqual([])
    expect(hiddenCount(d)).toBe(0)
    expect(visibleIdeas(d)).toEqual([...IDEAS])
  })

  it('hides a brave idea and an Oops Mission, and shows them again', () => {
    const d = fresh()
    expect(hideIdea(d, BRAVE.id)).toBe(true)
    expect(hideIdea(d, OOPS.id)).toBe(true)
    expect(isHidden(d, BRAVE.id)).toBe(true)
    expect(isHidden(d, OOPS.id)).toBe(true)
    expect(d.hiddenIdeas).toEqual([BRAVE.id, OOPS.id])
    expect(hiddenCount(d)).toBe(2)
    expect(hiddenCount(d, 'school')).toBe(1)
    expect(hiddenCount(d, 'oops')).toBe(1)
    expect(hiddenCount(d, 'family')).toBe(0)
    const ids = visibleIdeas(d).map((i) => i.id)
    expect(ids).not.toContain(BRAVE.id)
    expect(ids).not.toContain(OOPS.id)
    expect(ids).toHaveLength(IDEAS.length - 2)

    expect(showIdea(d, BRAVE.id)).toBe(true)
    expect(isHidden(d, BRAVE.id)).toBe(false)
    expect(visibleIdeas(d).map((i) => i.id)).toContain(BRAVE.id)
    expect(showIdea(d, BRAVE.id), 'already showing').toBe(false)
  })

  it('is fully reversible: hide then show gives back the very same save', () => {
    const d = fresh()
    doBrave(d, DAY1)
    addCustomIdea(d, 'Ask the librarian for a book tip', false, DAY1)
    const before = JSON.parse(JSON.stringify(d))
    for (const idea of IDEAS) hideIdea(d, idea.id)
    expect(hiddenCount(d)).toBe(IDEAS.length)
    for (const idea of IDEAS) showIdea(d, idea.id)
    expect(d).toEqual(before)

    hideIdea(d, BRAVE.id)
    hideIdea(d, OOPS.id)
    expect(showAllIdeas(d)).toBe(2)
    expect(d).toEqual(before)
    expect(showAllIdeas(d), 'nothing left to show').toBe(0)
  })

  it('hides each card once, and only built-in cards', () => {
    const d = fresh()
    const own = addCustomIdea(d, 'Wave at the bus driver', false, DAY1)!
    expect(hideIdea(d, BRAVE.id)).toBe(true)
    expect(hideIdea(d, BRAVE.id), 'already hidden').toBe(false)
    expect(hideIdea(d, own.id), "a grown-up's own card is removed, not hidden").toBe(false)
    expect(hideIdea(d, 'not-a-card')).toBe(false)
    expect(d.hiddenIdeas).toEqual([BRAVE.id])
    expect(isBuiltInIdea(BRAVE.id)).toBe(true)
    expect(isBuiltInIdea(own.id)).toBe(false)
  })

  it('never deletes anything: the cards stay, and her brave things and plans keep their words', () => {
    const d = fresh()
    const cardsBefore = JSON.stringify(IDEAS)
    const plan = addBraveThing(d, { text: BRAVE.text, ideaId: BRAVE.id, forecast: 7 }, DAY1)
    const done = addBraveThing(d, { text: OOPS.text, ideaId: OOPS.id, oops: true, forecast: 3 }, DAY1)
    const braveBefore = JSON.stringify(d.brave)
    hideIdea(d, BRAVE.id)
    hideIdea(d, OOPS.id)
    expect(JSON.stringify(d.brave)).toBe(braveBefore)
    expect(d.brave.map((b) => b.id)).toEqual([plan.id, done.id])
    expect(d.brave.map((b) => b.text)).toEqual([BRAVE.text, OOPS.text])
    expect(JSON.stringify(IDEAS)).toBe(cardsBefore)
    expect(ideaById(BRAVE.id)?.text, 'a hidden card can still be looked up').toBe(BRAVE.text)
  })

  it('shows the built-in cards in their usual order, then the grown-ups’ own (marked custom)', () => {
    const d = fresh()
    const own = addCustomIdea(d, 'Ask the librarian for a book tip', false, DAY1)!
    const ownOops = addCustomIdea(d, 'Wear a silly hat to dinner', true, DAY1)!
    hideIdea(d, OOPS.id)
    hideIdea(d, BRAVE.id)
    const cards = visibleIdeas(d)
    const builtIn = cards.filter((c) => !c.custom)
    expect(builtIn.map((c) => c.id)).toEqual(IDEAS.filter((i) => i.id !== BRAVE.id && i.id !== OOPS.id).map((i) => i.id))
    expect(cards.slice(-2)).toEqual([
      { id: own.id, text: own.text, oops: false, group: 'me', custom: true },
      { id: ownOops.id, text: ownOops.text, oops: true, group: 'oops', custom: true },
    ])
  })

  it('a whole group can be hidden (her screen then leaves that group out)', () => {
    const d = fresh()
    const family = IDEAS.filter((i) => i.group === 'family')
    for (const idea of family) hideIdea(d, idea.id)
    expect(hiddenCount(d, 'family')).toBe(family.length)
    expect(visibleIdeas(d).some((i) => i.group === 'family')).toBe(false)
    expect(visibleIdeas(d).some((i) => i.group === 'school')).toBe(true)
  })

  it('test mode leaves hidden cards as they are (a grown-up’s preference)', () => {
    const d = fresh()
    hideIdea(d, BRAVE.id)
    applyTestMode(d, true)
    expect(d.hiddenIdeas).toEqual([BRAVE.id])
    expect(visibleIdeas(d).map((i) => i.id)).not.toContain(BRAVE.id)
    applyTestMode(d, false)
    expect(d.hiddenIdeas).toEqual([BRAVE.id])
  })

  it('survives normalize unchanged', () => {
    const d = fresh()
    hideIdea(d, OOPS.id)
    hideIdea(d, BRAVE.id)
    expect(normalize(JSON.parse(JSON.stringify(d)), DAY1)).toStrictEqual(d)
  })
})
