/**
 * Backup, start over and restore, on every project, through the grown-ups' "Backup and data" page.
 *
 * A climber well into the game (stones, plans, letters, flops, badges, names, a PIN) is saved with
 * "Download file": the file is the whole save, exactly. "Start over" (asked twice) clears the game
 * and opens the first run, which is walked again with another PIN and other names. Then the backup
 * file goes back in through "Choose backup file" (preview, "Restore this backup", "Restore it"): the
 * save is exactly the one that was downloaded — her stones, brave things, plans, letters, names and
 * the old PIN. A second device with a different climber restores the same backup by pasting its
 * text, with the same result.
 */
import { readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'
import { PARENT_COPY } from '../src/screens/parent/copy'
import { backupFileName, type ExportEnvelope } from '../src/storage/backup'
import { totalStones } from '../src/model/stones'
import type { SaveData } from '../src/storage/schema'
import {
  DEFAULT_NAMES,
  DEFAULT_PIN,
  buttonNamed,
  checkScreen,
  climberSave,
  climbToCamp,
  completeFirstRun,
  expect,
  expectRoute,
  gotoCamp,
  mainHeading,
  openGrownups,
  openParentPage,
  readSave,
  richSave,
  seedSave,
  tap,
  test,
  withPin,
} from './helpers'

// The first run (with the lesson) a second time, plus a lot of grown-up taps.
test.describe.configure({ timeout: 180_000 })

const D = PARENT_COPY.data
const OTHER_PIN = '1357'
const OTHER_NAMES = ['Grandma']

/** The open dialog with this title. */
function dialog(page: Page, title: string) {
  return page.getByRole('dialog', { name: title })
}

/** From camp: the PIN door, then "Backup and data". */
async function openData(page: Page, pin: string): Promise<void> {
  await openGrownups(page, pin)
  await openParentPage(page, PARENT_COPY.home.pages.data.title, '/parent/data')
  await expect(mainHeading(page)).toHaveText(D.title)
}

/** The preview of a backup about to be restored, then "Restore this backup" → "Restore it". */
async function restoreFromPreview(page: Page, backup: SaveData): Promise<void> {
  const preview = page.locator('.pp-summary__col--new')
  await expect(preview).toContainText(D.import.inBackup)
  await expect(preview).toContainText(D.import.stones(totalStones(backup)))
  await expect(preview).toContainText(D.import.brave(backup.brave.length))
  await expect(preview).toContainText(D.import.goat(backup.profile.goatName))
  await checkScreen(page, 'data: restore preview')
  await tap(buttonNamed(page, D.import.restore))
  const ask = dialog(page, D.import.confirmTitle)
  await expect(ask).toBeVisible()
  await tap(buttonNamed(ask, D.import.confirmYes))
  await expect(page.locator('.toast').filter({ hasText: D.import.done })).toBeVisible()
  await expectRoute(page, '/parent/data')
}

test('download a backup, start over, and restore it exactly', async ({ page, freshPage }) => {
  await seedSave(page, richSave())
  await gotoCamp(page)
  await openData(page, DEFAULT_PIN)
  await checkScreen(page, 'data')

  // Download file: the whole save, exactly.
  const before = await readSave(page)
  const [download] = await Promise.all([page.waitForEvent('download'), tap(buttonNamed(page, D.export.download))])
  expect(download.suggestedFilename()).toBe(backupFileName(new Date()))
  expect(download.suggestedFilename()).toMatch(/^upanyway-backup-\d{4}-\d{2}-\d{2}\.json$/)
  const file = await download.path()
  const text = readFileSync(file, 'utf8')
  const envelope = JSON.parse(text) as ExportEnvelope
  expect(envelope.app).toBe('upanyway')
  expect(envelope.schemaVersion).toBe(before.schemaVersion)
  expect(envelope.data, 'the backup file holds the whole save').toEqual(before)
  await expect(page.locator('.toast').filter({ hasText: D.export.downloaded })).toBeVisible()

  // Start over: asked twice, then the first run opens on a fresh save.
  await tap(buttonNamed(page.locator('.pp-reset'), D.reset.button))
  const ask1 = dialog(page, D.reset.ask1Title)
  await expect(ask1).toBeVisible()
  await checkScreen(page, 'data: start over?')
  await tap(buttonNamed(ask1, D.reset.next))
  const ask2 = dialog(page, D.reset.ask2Title)
  await expect(ask2).toBeVisible()
  await tap(buttonNamed(ask2, D.reset.yes))
  await expectRoute(page, '/setup/hello')
  const fresh = await readSave(page)
  expect(fresh.setup.complete).toBe(false)
  expect(fresh.brave).toEqual([])
  expect(fresh.letters).toEqual([])
  expect(fresh.parent.names).toEqual([])
  expect(fresh.parent.pinHash).toBe('')

  // The first run again, with another PIN and other names.
  await completeFirstRun(page, { goto: false, pin: OTHER_PIN, names: OTHER_NAMES })
  await climbToCamp(page)
  await openData(page, OTHER_PIN)

  // Restore the downloaded file.
  await page.locator('input.pp-file').setInputFiles(file)
  await restoreFromPreview(page, before)
  const after = await readSave(page)
  expect(after, 'the restored save is exactly the one in the backup').toEqual(before)
  expect(after.parent.names).toEqual(DEFAULT_NAMES)
  expect(after.brave.map((b) => b.text)).toEqual(before.brave.map((b) => b.text))
  expect(totalStones(after)).toBe(totalStones(before))

  // Its PIN came back too: the old one opens the grown-ups' door, and camp shows her stones.
  await tap(page.locator('.layout__back'))
  await expectRoute(page, '/parent/home')
  await tap(page.getByRole('button', { name: PARENT_COPY.home.backToCamp }).last())
  await expectRoute(page, '/camp')
  await expect(page.locator('.camp__tiles')).toContainText(`${totalStones(before)} stones`)
  await openGrownups(page, DEFAULT_PIN)

  // Another device with a different climber: paste the backup text instead.
  const other = await freshPage()
  await seedSave(other, withPin(climberSave(), OTHER_PIN))
  await gotoCamp(other)
  await openData(other, OTHER_PIN)
  await tap(buttonNamed(other, D.import.paste))
  const box = other.locator('textarea[name="backup-text"]')
  await expect(box).toBeVisible()
  await box.fill(text)
  await tap(buttonNamed(other, D.import.check))
  await restoreFromPreview(other, before)
  expect(await readSave(other), 'restored from pasted text, exactly').toEqual(before)
})

test('a file that is not a backup changes nothing', async ({ page }) => {
  await seedSave(page, richSave())
  await gotoCamp(page)
  await openData(page, DEFAULT_PIN)
  const before = await readSave(page)
  await tap(buttonNamed(page, D.import.paste))
  await page.locator('textarea[name="backup-text"]').fill('{"hello": "world"}')
  await tap(buttonNamed(page, D.import.check))
  await expect(page.locator('.pp-restore')).toContainText(/That doesn[’']t look like an Up Anyway backup\./)
  await expect(page.locator('.pp-summary')).toHaveCount(0)
  expect(await readSave(page)).toEqual(before)
})
