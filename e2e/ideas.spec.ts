/**
 * Hiding built-in idea cards, on every project, by touch (parent mode → Idea cards).
 *
 * 1. A grown-up hides one brave idea and one Oops Mission (each with its own Shown/Hidden switch, the
 *    page listing every built-in card in the groups her screen uses) → her "Pick an idea" screen
 *    leaves exactly those two out, the brave-vs-dangerous line still at the top → "Show all again"
 *    (asked in the page) → both are back on her screen. Nothing she logged changes.
 * 2. With a whole group hidden, her screen has no heading or jump chip for it. A downloaded backup
 *    holds the hidden ids; after "Show all again", restoring that file hides them again.
 */
import { readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'
import { IDEAS, IDEA_GROUPS, ideaById, type Idea } from '../src/content/ideas'
import { LOG_COPY } from '../src/screens/log/copy'
import { PARENT_COPY } from '../src/screens/parent/copy'
import type { ExportEnvelope } from '../src/storage/backup'
import {
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
  withPin,
} from './helpers'

test.describe.configure({ timeout: 120_000 })

const P = PARENT_COPY
const B = PARENT_COPY.ideas.builtIn
const D = PARENT_COPY.data
const L = LOG_COPY

const BRAVE = ideaById('school-ask-question')!
const OOPS = ideaById('oops-odd-socks')!

/** The grown-ups' Shown/Hidden switch for one built-in card. */
function switchFor(page: Page, idea: Idea) {
  return page.locator(`.pp-hide[data-idea="${idea.id}"]`)
}

/** Her idea cards on the "Pick an idea" screen. */
function kidCards(page: Page) {
  return page.locator('.idea-card')
}

/** From camp: the PIN door, then one grown-ups' page. */
async function openPage(page: Page, card: string, path: string, heading: string): Promise<void> {
  await openGrownups(page)
  await openParentPage(page, card, path)
  await expect(mainHeading(page)).toHaveText(heading)
}

/** From a grown-ups' page: their home, then back to camp (which locks the pages again). */
async function grownupsToCamp(page: Page): Promise<void> {
  await tap(page.locator('.layout__back'))
  await expectRoute(page, '/parent/home')
  await tap(page.getByRole('button', { name: P.home.backToCamp }).last())
  await expectRoute(page, '/camp')
}

/** From camp: Log a brave thing → Pick an idea. */
async function openKidIdeas(page: Page): Promise<void> {
  await tap(page.locator('.camp__log'))
  await expectRoute(page, '/log')
  await tap(buttonNamed(page, L.what.pick))
  await expect(mainHeading(page)).toHaveText(L.ideas.title)
  // The brave-vs-dangerous line is always first.
  const first = page.locator('.log-step > :first-child')
  await expect(first).toHaveClass(/ideas__care/)
  await expect(first).toContainText(L.ideas.brave)
  await expect(first).toContainText(L.ideas.care)
}

/** From her ideas screen back to camp (ideas → the first question → camp). */
async function kidIdeasToCamp(page: Page): Promise<void> {
  await tap(page.locator('.layout__back'))
  await expect(mainHeading(page)).toHaveText(L.what.q)
  await tap(page.locator('.layout__back'))
  await expectRoute(page, '/camp')
}

/** "Show all again", then yes in the page's own dialog. */
async function showAllAgain(page: Page, hidden: number): Promise<void> {
  await tap(buttonNamed(page, B.showAll))
  const ask = page.getByRole('dialog', { name: B.showAllConfirm.title })
  await expect(ask).toBeVisible()
  await expect(ask).toContainText(B.showAllConfirm.body(hidden))
  await checkScreen(page, 'ideas: show all again?')
  await tap(buttonNamed(ask, B.showAllConfirm.yes))
  await expect(page.locator('.toast').filter({ hasText: B.shownAll })).toBeVisible()
  await expect(page.locator('.pp-hide__count')).toHaveText(B.count(0))
  await expect(buttonNamed(page, B.showAll)).toHaveAttribute('aria-disabled', 'true')
  await expect(page.locator('.pp-hide[aria-checked="false"]')).toHaveCount(0)
}

test('a grown-up hides a brave idea and an Oops Mission; her screen leaves them out until they are shown again', async ({ page }) => {
  const seeded = withPin(climberSave())
  // Something she already logged from the brave idea: hiding the card never touches it.
  seeded.brave.push({
    id: 'plan-from-card',
    createdAt: new Date().toISOString(),
    text: BRAVE.text,
    ideaId: BRAVE.id,
    oops: false,
    forecast: 7,
    status: 'planned',
    notTodayCount: 0,
    stoneDay: null,
  })
  await seedSave(page, seeded)
  await gotoCamp(page)
  await openPage(page, P.home.pages.ideas.title, '/parent/ideas', P.ideas.title)

  // Every built-in card, in her screen's groups and order, all shown.
  const count = page.locator('.pp-hide__count')
  await expect(count).toHaveText(B.count(0))
  await expect(page.locator('.pp-hide')).toHaveCount(IDEAS.length)
  await expect(page.locator('.pp-hide[aria-checked="true"]')).toHaveCount(IDEAS.length)
  expect(await page.locator('.pp-hide__group').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.group))).toEqual(
    IDEA_GROUPS.map((g) => g.id),
  )
  expect(await page.locator('.pp-hide').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.idea))).toEqual(
    IDEA_GROUPS.flatMap((g) => IDEAS.filter((i) => i.group === g.id).map((i) => i.id)),
  )
  await expect(buttonNamed(page, B.showAll)).toHaveAttribute('aria-disabled', 'true')
  await checkScreen(page, 'ideas: every card shown')

  // Hide one brave idea and one Oops Mission.
  for (const idea of [BRAVE, OOPS]) {
    const sw = switchFor(page, idea)
    await expect(sw).toContainText(B.shown)
    await tap(sw)
    await expect(sw).toHaveAttribute('aria-checked', 'false')
    await expect(sw).toContainText(B.hidden)
  }
  await expect(count).toHaveText(B.count(2))
  await expect(page.locator('.pp-hide__group[data-group="school"] .pp-hide__group-count')).toHaveText(B.groupCount(1))
  await expect(page.locator('.pp-hide__group[data-group="oops"] .pp-hide__group-count')).toHaveText(B.groupCount(1))
  await expect(page.locator('.pp-hide__group[data-group="family"] .pp-hide__group-count')).toHaveText('')
  await expect(buttonNamed(page, B.showAll)).not.toHaveAttribute('aria-disabled', 'true')
  let save = await readSave(page)
  expect(save.hiddenIdeas).toEqual([BRAVE.id, OOPS.id])
  expect(save.brave, 'hiding a card never touches what she logged').toEqual(seeded.brave)
  await checkScreen(page, 'ideas: two hidden')

  // Her "Pick an idea" screen leaves exactly those two out.
  await grownupsToCamp(page)
  await openKidIdeas(page)
  await expect(kidCards(page)).toHaveCount(IDEAS.length - 2)
  await expect(kidCards(page).filter({ hasText: BRAVE.text })).toHaveCount(0)
  await expect(kidCards(page).filter({ hasText: OOPS.text })).toHaveCount(0)
  for (const other of IDEAS.filter((i) => i.id !== BRAVE.id && i.id !== OOPS.id).slice(0, 3)) {
    await expect(kidCards(page).filter({ hasText: other.text })).toHaveCount(1)
  }
  // Every group still has cards, so every heading stays.
  await expect(page.locator('.ideas__section')).toHaveCount(IDEA_GROUPS.length)
  await checkScreen(page, 'log: ideas, two hidden')
  await kidIdeasToCamp(page)

  // Show all again: both come back.
  await openPage(page, P.home.pages.ideas.title, '/parent/ideas', P.ideas.title)
  await expect(page.locator('.pp-hide__count')).toHaveText(B.count(2))
  await showAllAgain(page, 2)
  save = await readSave(page)
  expect(save.hiddenIdeas).toEqual([])
  expect(save.brave).toEqual(seeded.brave)

  await grownupsToCamp(page)
  await openKidIdeas(page)
  await expect(kidCards(page)).toHaveCount(IDEAS.length)
  await expect(kidCards(page).filter({ hasText: BRAVE.text })).toHaveCount(1)
  await expect(kidCards(page).filter({ hasText: OOPS.text })).toHaveCount(1)
})

test('a hidden group leaves her screen, and a backup keeps the hidden cards', async ({ page }) => {
  const family = IDEAS.filter((i) => i.group === 'family')
  const hidden = [...family.map((i) => i.id), OOPS.id]
  const seeded = withPin(climberSave())
  seeded.hiddenIdeas = [...hidden]
  await seedSave(page, seeded)
  await gotoCamp(page)

  // No heading and no jump chip for a group with nothing left to show.
  await openKidIdeas(page)
  await expect(page.locator('.ideas__section[data-group="family"]')).toHaveCount(0)
  const familyTitle = IDEA_GROUPS.find((g) => g.id === 'family')!.title
  await expect(page.locator('.ideas__jump-chip').filter({ hasText: familyTitle })).toHaveCount(0)
  await expect(page.locator('.ideas__section')).toHaveCount(IDEA_GROUPS.length - 1)
  await expect(page.locator('.ideas__jump-chip')).toHaveCount(IDEA_GROUPS.length - 1)
  await expect(kidCards(page)).toHaveCount(IDEAS.length - hidden.length)
  await checkScreen(page, 'log: ideas, a group hidden')
  await kidIdeasToCamp(page)

  // The backup file holds the hidden ids.
  await openPage(page, P.home.pages.data.title, '/parent/data', D.title)
  const [download] = await Promise.all([page.waitForEvent('download'), tap(buttonNamed(page, D.export.download))])
  const file = await download.path()
  const envelope = JSON.parse(readFileSync(file, 'utf8')) as ExportEnvelope
  expect(envelope.data.hiddenIdeas).toEqual(hidden)

  // Show them all again here, then restore the file: they are hidden again.
  await tap(page.locator('.layout__back'))
  await expectRoute(page, '/parent/home')
  await openParentPage(page, P.home.pages.ideas.title, '/parent/ideas')
  await expect(page.locator('.pp-hide__count')).toHaveText(B.count(hidden.length))
  await expect(page.locator('.pp-hide__group[data-group="family"] .pp-hide__group-count')).toHaveText(B.groupCount(family.length))
  await showAllAgain(page, hidden.length)
  expect((await readSave(page)).hiddenIdeas).toEqual([])

  await tap(page.locator('.layout__back'))
  await expectRoute(page, '/parent/home')
  await openParentPage(page, P.home.pages.data.title, '/parent/data')
  await page.locator('input.pp-file').setInputFiles(file)
  await tap(buttonNamed(page, D.import.restore))
  const ask = page.getByRole('dialog', { name: D.import.confirmTitle })
  await expect(ask).toBeVisible()
  await tap(buttonNamed(ask, D.import.confirmYes))
  await expect(page.locator('.toast').filter({ hasText: D.import.done })).toBeVisible()
  expect((await readSave(page)).hiddenIdeas, 'restored from the backup').toEqual(hidden)

  await tap(page.locator('.layout__back'))
  await expectRoute(page, '/parent/home')
  await openParentPage(page, P.home.pages.ideas.title, '/parent/ideas')
  await expect(page.locator('.pp-hide__count')).toHaveText(B.count(hidden.length))
  for (const id of hidden) await expect(page.locator(`.pp-hide[data-idea="${id}"]`)).toHaveAttribute('aria-checked', 'false')
  await expect(page.locator('.pp-hide[aria-checked="false"]')).toHaveCount(hidden.length)
})
