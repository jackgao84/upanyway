/**
 * The first run, start to Pitch 1, on every project: grown-up PIN + names, hand-over, her climber,
 * the goat, the mountain, the lesson, brave vs dangerous, who cheers her on. Every screen is checked
 * for the mute toggle, finger-sized targets and sideways scrolling, and the whole run stays short.
 */
import {
  DEFAULT_PIN,
  checkScreen,
  completeFirstRun,
  expect,
  expectRoute,
  readSave,
  routeOf,
  tap,
  test,
} from './helpers'

/** The brief's budget for the whole first run, counted in touches. */
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
  expect(checked).toHaveLength(12)

  const save = await readSave(page)
  expect(save.parent.pinHash, 'a PIN is saved (hashed)').toBeTruthy()
  expect(save.parent.pinHash).not.toBe(DEFAULT_PIN)
  expect(save.glossarySeen, 'the cheer screen explained "cairn"').toContain('cairn')
})

test('a reload part-way through comes back to the same step', async ({ page }) => {
  const reloaded: string[] = []
  await completeFirstRun(page, {
    onScreen: async (step, phase) => {
      // The PIN isn't saved until it is confirmed, so the first screen always starts over.
      if (phase || step === 'hello') return
      const before = routeOf(page)
      await page.reload()
      await expectRoute(page, before)
      reloaded.push(step)
    },
  })
  expect(reloaded).toEqual(['names', 'handover', 'climber', 'goat', 'mountain', 'lesson', 'brave', 'cheer'])

  // Once finished, a reload (or opening the app fresh) never goes back into the first run.
  await page.reload()
  await expectRoute(page, '/climb/p01')
  await page.goto('./#/setup/hello')
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
