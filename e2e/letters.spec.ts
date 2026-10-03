/**
 * Spotted! letters, on every project. A grown-up writes one behind the PIN door; at camp the Letters
 * tile counts it; she opens the envelope, reads the note, and its bonus stone joins the cairn today.
 * A second letter the same day: its stone waits beside the cairn for tomorrow (one letter stone a
 * day), and nothing is lost.
 */
import type { Page } from '@playwright/test'
import { CAIRN_COPY } from '../src/screens/cairn/copy'
import { LETTERS_COPY } from '../src/screens/flops/copy'
import { PARENT_COPY } from '../src/screens/parent/copy'
import {
  DEFAULT_NAMES,
  buttonNamed,
  checkScreen,
  climberSave,
  expect,
  expectRoute,
  gotoCamp,
  mainHeading,
  openGrownups,
  openParentPage,
  readSave,
  seedSave,
  tap,
  test,
  todayKey,
  withPin,
} from './helpers'

test.describe.configure({ timeout: 120_000 })

const P = PARENT_COPY
const C = LETTERS_COPY

/** From camp: a grown-up writes a Spotted! letter from `from`, then hands back to camp. */
async function writeLetter(page: Page, from: string, text: string): Promise<void> {
  await openGrownups(page)
  await openParentPage(page, P.home.pages.letter.title, '/parent/letter')
  await expect(mainHeading(page)).toHaveText(P.letter.title)
  const who = page.getByRole('radio', { name: from })
  await tap(who)
  await expect(who).toHaveAttribute('aria-checked', 'true')
  const field = page.locator('textarea[name="letter-text"]')
  await expect(field).toHaveValue(P.letter.start)
  await tap(field)
  await field.fill(text)
  await checkScreen(page, 'parent letter')
  await tap(buttonNamed(page, P.letter.send))
  await expect(page.locator('.pp-sent__title')).toHaveText(P.letter.sentTitle)
  await expect(page.locator('.pp-sent__note')).toContainText(text)
  await tap(page.locator('.layout__back'))
  await expectRoute(page, '/parent/home')
  await tap(page.getByRole('button', { name: P.home.backToCamp }).last())
  await expectRoute(page, '/camp')
}

/** At camp: open Letters, then the sealed envelope from `from`, and wait for the note. */
async function openEnvelope(page: Page, from: string, text: string) {
  const tile = page.locator('.camp__tiles .tile', { has: page.locator('.tile__label', { hasText: /^Letters/ }) })
  await expect(tile.locator('.tile__count')).toHaveText('1')
  await expect(tile).toHaveAttribute('aria-label', 'Letters, 1 new letter')
  await tap(tile)
  await expectRoute(page, '/letters')
  await expect(mainHeading(page)).toHaveText(C.title)
  const envelope = page.getByRole('button', { name: C.envelopeLabel(from) })
  await expect(envelope).toBeVisible()
  await checkScreen(page, 'letters: sealed')
  await tap(envelope)
  const note = page.getByRole('dialog', { name: C.noteLabel(from) })
  await expect(note.locator('.letter-read')).toBeVisible({ timeout: 10_000 })
  await expect(note).toContainText(text)
  await expect(note).toContainText(C.signoff(from))
  return note
}

test('a Spotted! letter adds a bonus stone; a second the same day waits for tomorrow', async ({ page }) => {
  await seedSave(page, withPin(climberSave()))
  await gotoCamp(page)
  const [first, second] = [DEFAULT_NAMES[1], DEFAULT_NAMES[0]]

  // A grown-up writes the first letter. It waits sealed; no stone yet.
  const text1 = 'I saw you put your hand up in assembly, even though your cheeks went red.'
  await writeLetter(page, first, text1)
  let save = await readSave(page)
  expect(save.letters).toHaveLength(1)
  expect(save.letters[0]).toMatchObject({ from: first, text: text1, stoneDay: null })
  expect(save.letters[0].openedAt).toBeUndefined()

  // She opens it: the note, and its bonus stone joins the cairn today.
  let note = await openEnvelope(page, first, text1)
  await expect(note.locator('.letter-read__stone')).toHaveText(C.stonePlaced)
  await checkScreen(page, 'letters: first note')
  save = await readSave(page)
  const letter1 = save.letters[0]
  expect(letter1.openedAt).toBeTruthy()
  expect(letter1.stoneDay).toBe(todayKey())
  await tap(buttonNamed(note, C.seeCairn))
  await expectRoute(page, '/cairn')
  expect(new URL(page.url()).hash).toContain(`new=${letter1.id}`)
  await expect(page.locator('.cairn-info__num')).toHaveText('1', { timeout: 15_000 })

  // Back at the letters it's read now, then back to camp.
  await tap(page.locator('.layout__back'))
  await expectRoute(page, '/letters')
  await expect(page.locator('.letters__all-read')).toHaveText(C.allRead)
  await expect(page.getByRole('button', { name: C.readLabel(first) })).toBeVisible()
  await tap(page.locator('.layout__back'))
  await expectRoute(page, '/camp')

  // A second letter the same day: read straight away, its stone waits for tomorrow.
  const text2 = 'I saw you ask the lifeguard a question all by yourself.'
  await writeLetter(page, second, text2)
  note = await openEnvelope(page, second, text2)
  await expect(note.locator('.letter-read__stone')).toHaveText(C.stoneTomorrow)
  save = await readSave(page)
  const letter2 = save.letters.find((l) => l.from === second)
  expect(letter2?.openedAt).toBeTruthy()
  expect(letter2?.stoneDay ?? null, 'over the one-a-day cap: the stone waits').toBeNull()
  expect(save.letters.find((l) => l.id === letter1.id)).toEqual(letter1)

  // The cairn: still one stone on the pile, and one glowing beside it.
  await tap(buttonNamed(note, C.seeCairn))
  await expectRoute(page, '/cairn')
  await expect(page.locator('.cairn-info__num')).toHaveText('1', { timeout: 15_000 })
  await expect(page.locator('.cairn-info__line--waiting')).toHaveText(CAIRN_COPY.waitingLine(1))
  // Its stone drops onto the waiting spot, and the goat says when it goes on.
  expect(new URL(page.url()).hash).toContain(`new=${letter2!.id}`)
  await expect(page.locator('.cairn-bubble .goat-bubble__text')).toHaveText(/This stone goes on tomorrow\.$/, { timeout: 15_000 })
  await checkScreen(page, 'cairn: a waiting letter stone')
  await tap(page.locator('.layout__back'))
  await expectRoute(page, '/letters')
  await expect(page.locator('.letter-card')).toHaveCount(2)
})
