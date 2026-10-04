/**
 * The first run, start to Pitch 1, on every project: grown-up PIN, the recovery code (shown once,
 * saved as a hash on "I've written it down"), names, hand-over, her climber,
 * the goat, the mountain, the lesson (played for real: a touch-drag leap onto the ledge, a leap off
 * it that the rope catches, then Next), brave vs dangerous, who cheers her on. Every screen is
 * checked for the mute toggle, finger-sized targets and sideways scrolling, and the whole run stays
 * short.
 */
import { cleanRecoveryInput, verifyRecoveryCode } from '../src/model/recovery'
import { CLIMB_COPY } from '../src/screens/climb/copy'
import {
  DEFAULT_PIN,
  checkScreen,
  completeFirstRun,
  expect,
  expectRoute,
  readRecoveryCode,
  readSave,
  routeOf,
  tap,
  test,
} from './helpers'

/**
 * The brief's budget for the whole first run, counted in touches. The recovery code's "I've written it
 * down" (Decision 87) is one more grown-up tap: 24 → 25 measured, still within this budget.
 */
const MAX_TAPS = 25

test('walks the whole first run to Pitch 1 in a few taps', async ({ page }, testInfo) => {
  const checked: string[] = []
  const result = await completeFirstRun(page, {
    onScreen: async (step, phase) => {
      const label = phase ? `${step} (${phase})` : step
      await checkScreen(page, label)
      checked.push(label)
    },
  })

  // Pitch 1's screen gets the same checks.
  await checkScreen(page, 'climb p01')
  checked.push('climb p01')

  const line = `first run: ${result.taps} taps in ${(result.ms / 1000).toFixed(1)} s on ${testInfo.project.name}`
  console.log(line)
  testInfo.annotations.push({ type: 'first run', description: line })
  testInfo.annotations.push({ type: 'screens checked', description: checked.join(', ') })
  expect(result.taps, `the first run takes at most ${MAX_TAPS} taps`).toBeLessThanOrEqual(MAX_TAPS)
  expect(checked).toHaveLength(13)

  const save = await readSave(page)
  expect(save.parent.pinHash, 'a PIN is saved (hashed)').toBeTruthy()
  expect(save.parent.pinHash).not.toBe(DEFAULT_PIN)

  // The recovery code read off its screen is the one saved — as a salted hash, never the code itself.
  expect(verifyRecoveryCode(result.recoveryCode, save.parent), 'the code shown is the code saved').toBe(true)
  expect(save.parent.recoverySalt).toBeTruthy()
  const json = JSON.stringify(save)
  expect(json).not.toContain(result.recoveryCode)
  expect(json).not.toContain(cleanRecoveryInput(result.recoveryCode))
  expect(save.glossarySeen, 'the cheer screen explained "cairn"').toContain('cairn')

  // The lesson's fall was a real whipper: counted, with its pose and the first-whipper badge, the
  // rope explained, and the word met — but no run to resume and no send.
  expect(save.stats.whippers, 'the lesson whipper counts').toBe(1)
  expect(save.stats.sends).toBe(0)
  expect(Object.keys(save.poses), 'one fall pose collected').toHaveLength(1)
  expect(Object.keys(save.badges)).toContain('first-whipper')
  expect(save.flags.ropeExplained).toBe(true)
  expect(save.glossarySeen).toContain('whipper')
  expect(save.pitches.lesson, 'no pitch record for the lesson (no run, no attempts, no send)').toBeUndefined()

  // Pitch 3 needs a stone in the cairn and Pitch 2 climbed: typed in by hand, its trail is hidden
  // (the card names both), with a way to camp.
  await page.goto('./#/climb/p03')
  await expect.poll(() => page.evaluate(() => window.__upanyway?.climb.pendingPrompt() ?? null), { message: 'the hidden-trail card' }).toBe('locked')
  expect(await page.evaluate(() => window.__upanyway?.climb.levelId() ?? null)).toBe('p03')
  expect(await page.evaluate(() => window.__upanyway?.climb.state() ?? null), 'no climb behind the card').toBeNull()
  await expect(page.getByRole('dialog')).toContainText(CLIMB_COPY.locked.title)
  await expect(page.getByRole('dialog')).toContainText('Climb Pitch 2 and add a stone to your cairn to find the way.')
  expect(CLIMB_COPY.locked.way(1, 2)).toBe('Climb Pitch 2 and add a stone to your cairn to find the way.')
  await checkScreen(page, 'climb p03 (locked)')
  await tap(page.getByRole('button', { name: 'Back to camp', exact: true }))
  await expectRoute(page, '/camp')
  expect(await page.evaluate(() => window.__upanyway?.climb.pendingPrompt() ?? null)).toBeNull()
})

test('a reload part-way through comes back to the same step', async ({ page }) => {
  const reloaded: string[] = []
  await completeFirstRun(page, {
    onScreen: async (step, phase) => {
      // The PIN isn't saved until it is confirmed, so the first screen always starts over.
      if (phase || step === 'hello') return
      const before = routeOf(page)
      // The recovery code is never shown twice: a reload before "I've written it down" shows a new one.
      const code = step === 'recovery' ? await readRecoveryCode(page) : ''
      await page.reload()
      await expectRoute(page, before)
      if (step === 'recovery') {
        expect(await readRecoveryCode(page), 'a new code after a reload').not.toBe(code)
        expect((await readSave(page)).parent.recoveryHash, 'still nothing saved').toBe('')
      }
      reloaded.push(step)
    },
  })
  expect(reloaded).toEqual(['recovery', 'names', 'handover', 'climber', 'goat', 'mountain', 'lesson', 'brave', 'cheer'])

  // Once finished, a reload (or opening the app fresh) never goes back into the first run.
  await page.reload()
  await expectRoute(page, '/climb/p01')
  await page.goto('./#/setup/hello')
  await expectRoute(page, '/camp')
  await page.goto('./#/setup/recovery')
  await expectRoute(page, '/camp')
})

test('the mute toggle works from the first screen and is remembered', async ({ page }) => {
  await page.goto('./')
  await expectRoute(page, '/setup/hello')
  const mute = page.locator('#mute-toggle')
  await expect(mute).toHaveAttribute('aria-pressed', 'false')
  await tap(mute)
  await expect(mute).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(async () => (await readSave(page)).settings.muted).toBe(true)
  await page.reload()
  await expect(mute).toHaveAttribute('aria-pressed', 'true')
  await tap(mute)
  await expect(mute).toHaveAttribute('aria-pressed', 'false')
  await expect.poll(async () => (await readSave(page)).settings.muted).toBe(false)
})
