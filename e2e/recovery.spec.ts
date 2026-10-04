/**
 * The grown-ups' recovery code (Decision 87), on every project. (The first run's code — shown once,
 * saved on "I've written it down", a new one after a reload — is walked in first-run.spec.ts.)
 *
 * - "Forgot PIN?" with the right code (typed the forgiving way) sets a new PIN; the old code is used up
 *   and a new one is shown once; the old PIN and the old code no longer work, the new ones do.
 * - A code that doesn't match gets a gentle line (and a non-code says what's off, without counting);
 *   after five, a wait. The PIN still opens the door meanwhile.
 * - A game from before recovery codes: "Forgot PIN?" explains plainly, with no way round the PIN, and
 *   the grown-ups' home invites them to make one.
 * - Change PIN → "Make a new recovery code": shown once, saved only on "I've written it down" ("Not now"
 *   changes nothing), and it replaces the old one.
 */
import type { Page } from '@playwright/test'
import { GATE_COPY, RECOVERY_COPY } from '../src/content/copy'
import { verifyPin } from '../src/model/pin'
import { cleanRecoveryInput, verifyRecoveryCode } from '../src/model/recovery'
import { PARENT_COPY } from '../src/screens/parent/copy'
import {
  DEFAULT_PIN,
  DEFAULT_RECOVERY_CODE,
  buttonNamed,
  checkScreen,
  climberSave,
  enterPin,
  expect,
  expectRoute,
  gotoCamp,
  mainHeading,
  openGrownups,
  openParentPage,
  readRecoveryCode,
  readSave,
  seedSave,
  tap,
  test,
  typeInto,
  withPin,
  withRecovery,
} from './helpers'

test.describe.configure({ timeout: 120_000 })

const G = GATE_COPY
const R = RECOVERY_COPY
const P = PARENT_COPY
const NEW_PIN = '1357'

/** From camp: the small Grown-ups button, to the PIN door. */
async function toTheDoor(page: Page): Promise<void> {
  await tap(buttonNamed(page.locator('.camp__grownups'), 'Grown-ups'))
  await expectRoute(page, '/parent')
  await expect(page.locator('.pin__title')).toHaveText(G.pinTitle)
}

/** From the grown-ups' home: Back to camp (locks the pages again). */
async function backToCamp(page: Page): Promise<void> {
  await tap(page.getByRole('button', { name: P.home.backToCamp }).last())
  await expectRoute(page, '/camp')
}

/** At the door: "Forgot PIN?", to the recovery code field. */
async function forgotPin(page: Page) {
  await tap(buttonNamed(page, G.forgot))
  const field = page.getByRole('textbox', { name: G.code.label })
  await expect(field).toBeVisible()
  await expect(page.getByRole('heading', { name: G.code.title })).toBeVisible()
  return field
}

test('Forgot PIN? with the recovery code: a new PIN, the old code used up, a new code shown once', async ({ page }) => {
  await seedSave(page, withRecovery(withPin(climberSave())))
  await gotoCamp(page)
  await toTheDoor(page)
  await checkScreen(page, 'gate')

  const field = await forgotPin(page)
  await checkScreen(page, 'gate: recovery code')
  // Typed the forgiving way: small letters, spaces for dashes.
  await typeInto(field, 'k7qm 4xpa tr9d')
  await tap(buttonNamed(page, G.code.check))
  const title = page.locator('.pin__title')
  await expect(title).toHaveText(G.newTitle)
  await expect(page.locator('.pin__subtitle')).toHaveText(G.newSubAfterCode)
  await enterPin(page, NEW_PIN)
  await expect(title).toHaveText(G.confirmTitle)
  await enterPin(page, NEW_PIN)

  // The new PIN is saved and the old code is used up there and then; a new code shows, once.
  const newCode = await readRecoveryCode(page)
  expect(newCode).not.toBe(DEFAULT_RECOVERY_CODE)
  await expect(page.locator('.recovery')).toContainText(R.afterReset)
  await expect(page.locator('.recovery')).toContainText(R.points[0])
  await expect(page.locator('.recovery')).toContainText(R.points[1])
  await checkScreen(page, 'gate: the new recovery code')
  let save = await readSave(page)
  expect(verifyPin(NEW_PIN, save.parent)).toBe(true)
  expect(verifyPin(DEFAULT_PIN, save.parent)).toBe(false)
  expect(save.parent.recoveryHash, 'the old code is used up').toBe('')

  await tap(buttonNamed(page, R.done))
  await expectRoute(page, '/parent/home')
  await expect(page.locator('.toast').filter({ hasText: R.saved })).toBeVisible()
  save = await readSave(page)
  expect(verifyRecoveryCode(newCode, save.parent), 'the new code is saved').toBe(true)
  expect(verifyRecoveryCode(DEFAULT_RECOVERY_CODE, save.parent)).toBe(false)
  expect(JSON.stringify(save), 'as a hash, never the code').not.toContain(cleanRecoveryInput(newCode))
  await expect(page.locator('.pp-recovery-note'), 'no "make one" note: there is a code').toHaveCount(0)

  // The old PIN no longer opens the door; the new one does.
  await backToCamp(page)
  await toTheDoor(page)
  await enterPin(page, DEFAULT_PIN)
  await expect(page.locator('.pin__error')).toHaveText(G.wrong)
  await enterPin(page, NEW_PIN)
  await expectRoute(page, '/parent/home')

  // The old code no longer works; the new one does (and leads to a new PIN again).
  await backToCamp(page)
  await toTheDoor(page)
  const again = await forgotPin(page)
  await typeInto(again, DEFAULT_RECOVERY_CODE)
  await tap(buttonNamed(page, G.code.check))
  await expect(page.locator('.gate__error')).toHaveText(G.code.wrong)
  await again.fill('')
  await typeInto(again, newCode)
  await tap(buttonNamed(page, G.code.check))
  await expect(title).toHaveText(G.newTitle)
  expect(verifyPin(NEW_PIN, (await readSave(page)).parent), 'nothing changes until a new PIN is confirmed').toBe(true)
})

test('a code that doesn’t match: a gentle line, then a wait after five', async ({ page }) => {
  const seeded = withRecovery(withPin(climberSave()))
  await seedSave(page, seeded)
  await gotoCamp(page)
  await toTheDoor(page)
  const field = await forgotPin(page)
  const error = page.locator('.gate__error')
  const check = buttonNamed(page, G.code.check)

  await tap(check)
  await expect(error).toHaveText(G.code.empty)
  await typeInto(field, 'AAAA-BBBB-CCCC')
  await tap(check)
  await expect(error).toHaveText(G.code.wrong)
  await checkScreen(page, 'gate: a code that doesn’t match')

  // Not a code at all: it says what's off, and these don't count as tries.
  await field.fill('K7QM-4XPA-TR90')
  await tap(check)
  await expect(error).toHaveText(G.code.strange('0'))
  await field.fill('K7QM-4XPA')
  await tap(check)
  await expect(error).toHaveText(G.code.length(8))

  // Four more codes that don't match (five in all): then a wait, with the check button off.
  for (const code of ['AAAA-BBBB-CCCD', 'AAAA-BBBB-CCCE', 'AAAA-BBBB-CCCF', 'AAAA-BBBB-CCCG']) {
    await field.fill(code)
    await tap(check)
  }
  await expect(error).toContainText('Too many codes that didn’t match. Wait')
  await expect(check).toHaveAttribute('aria-disabled', 'true')
  // Even the right code waits its turn (the keyboard's Go key does nothing either).
  await field.fill(DEFAULT_RECOVERY_CODE)
  await field.press('Enter')
  await expect(page.locator('.gate__code')).toBeVisible()
  await expect(error).toContainText('Too many codes that didn’t match. Wait')
  await checkScreen(page, 'gate: waiting')

  // The PIN still opens the door, and nothing was changed.
  await tap(buttonNamed(page, G.code.back))
  await expect(page.locator('.pin__title')).toHaveText(G.pinTitle)
  await enterPin(page, DEFAULT_PIN)
  await expectRoute(page, '/parent/home')
  const save = await readSave(page)
  expect(save.parent.pinHash).toBe(seeded.parent.pinHash)
  expect(save.parent.recoveryHash).toBe(seeded.parent.recoveryHash)
})

test('a game from before recovery codes: Forgot PIN? explains, and the grown-ups’ home invites one', async ({ page }) => {
  await seedSave(page, withPin(climberSave()))
  await gotoCamp(page)
  await toTheDoor(page)
  await tap(buttonNamed(page, G.forgot))
  await expect(page.getByRole('heading', { name: G.noCode.title })).toBeVisible()
  for (const line of G.noCode.lines) await expect(page.locator('.gate__nocode')).toContainText(line)
  await expect(page.getByRole('textbox'), 'no way round the PIN from here').toHaveCount(0)
  await checkScreen(page, 'gate: no recovery code')

  await tap(buttonNamed(page, G.noCode.back))
  await expect(page.locator('.pin__title')).toHaveText(G.pinTitle)
  await enterPin(page, DEFAULT_PIN)
  await expectRoute(page, '/parent/home')
  const note = page.locator('.pp-recovery-note')
  await expect(note).toContainText(P.home.noRecovery.title)
  await expect(note).toContainText(P.home.noRecovery.text)
  await checkScreen(page, 'parent home: no recovery code yet')
})

test('Change PIN: make a new recovery code', async ({ page }) => {
  await seedSave(page, withPin(climberSave()))
  await gotoCamp(page)
  await openGrownups(page)

  // "Make one now" from the home's note opens a code straight away; nothing is saved before the tap.
  await tap(buttonNamed(page.locator('.pp-recovery-note'), P.home.noRecovery.make))
  await expectRoute(page, '/parent/pin')
  const first = await readRecoveryCode(page)
  await expect(page.locator('.recovery')).toContainText(R.forWhat)
  await expect(page.locator('.recovery'), 'there is no old code to replace').not.toContainText(R.replaces)
  await checkScreen(page, 'Change PIN: a new recovery code')
  expect((await readSave(page)).parent.recoveryHash).toBe('')
  await tap(buttonNamed(page, R.done))
  await expectRoute(page, '/parent/home')
  await expect(page.locator('.pp-recovery-note')).toHaveCount(0)
  expect(verifyRecoveryCode(first, (await readSave(page)).parent)).toBe(true)

  // From Change PIN: the page says there is one; "Not now" changes nothing.
  await openParentPage(page, P.home.pages.pin.title, '/parent/pin')
  await expect(mainHeading(page)).toHaveText(P.pin.title)
  await expect(page.locator('.pp-recovery__status')).toHaveText(P.pin.recovery.has)
  await checkScreen(page, 'Change PIN')
  await tap(buttonNamed(page, P.pin.recovery.make))
  const notNow = await readRecoveryCode(page)
  expect(notNow).not.toBe(first)
  await expect(page.locator('.recovery')).toContainText(R.replaces)
  await tap(buttonNamed(page, R.cancel))
  await expect(page.locator('.recovery')).toHaveCount(0)
  await expect(page.locator('.pin__title')).toHaveText(P.pin.oldTitle)
  let parent = (await readSave(page)).parent
  expect(verifyRecoveryCode(first, parent), '"Not now" keeps the old code').toBe(true)
  expect(verifyRecoveryCode(notNow, parent)).toBe(false)

  // Again, and this time written down: it replaces the old one.
  await tap(buttonNamed(page, P.pin.recovery.make))
  const second = await readRecoveryCode(page)
  expect(second).not.toBe(first)
  expect(second).not.toBe(notNow)
  await tap(buttonNamed(page, R.done))
  await expectRoute(page, '/parent/home')
  parent = (await readSave(page)).parent
  expect(verifyRecoveryCode(second, parent)).toBe(true)
  expect(verifyRecoveryCode(first, parent), 'the old code stops working').toBe(false)
  expect(verifyPin(DEFAULT_PIN, parent), 'the PIN is unchanged').toBe(true)
})
