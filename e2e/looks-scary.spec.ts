/**
 * The Looks Scary moment on Pitch 2 (the Big Gap), on every project. A climber past the first run
 * climbs to the camp before the gap by replaying the saved solution: the misty drop looms and the
 * Fear Forecast asks once (one tap). The Big Leap lands her on the far side: the gentle reveal plays
 * with the clock frozen, then "How scary was it really?" and the one-line comparison ("Forecast 7.
 * Really 2."). Coming back to the pitch, it is already gentle and nothing is asked again.
 */
import {
  climberSave,
  climbState,
  expect,
  leapDrag,
  loadSolution,
  pendingPrompt,
  readSave,
  replaySolutions,
  scaryPhase,
  seedSave,
  tap,
  tapCount,
  test,
  waitClimbPause,
} from './helpers'

test.describe.configure({ timeout: 150_000 })

const FORECAST = 7
const REALLY = 2

test('Pitch 2: the Fear Forecast, the gentle reveal up close, then "Forecast 7. Really 2."', async ({ page }) => {
  await seedSave(page, climberSave())
  await page.goto('./#/climb/p02')
  const steps = loadSolution('p02').steps
  const toCamp = steps.find((s) => s.to === 'c1')
  const bigLeap = steps.find((s) => s.from === 'c1')
  expect(toCamp && bigLeap, 'the saved solution reaches the camp and leaps the gap').toBeTruthy()
  if (!toCamp || !bigLeap) return

  // Up to the step below the camp; nothing scary asked on the way.
  await replaySolutions(page, 'p02', {}, { stopAt: toCamp.from })
  expect(await scaryPhase(page), 'the misty drop looms from below').toBe('looming')

  // Arriving at the camp: the goat notices it, then the one-tap Fear Forecast.
  await leapDrag(page, toCamp.angle, toCamp.power)
  expect(await waitClimbPause(page), 'a card on arrival at the camp').toBe('prompt')
  await expect.poll(() => pendingPrompt(page)).toBe('forecast')
  expect((await climbState(page))?.elementId).toBe('c1')
  expect((await climbState(page))?.frozen, 'the clock is frozen while the card is up').toBe(true)
  const card = page.locator('.climb-prompt--fear')
  await expect(card).toContainText('How scary does it look?')
  const before = tapCount(page)
  await tap(card.getByRole('radio', { name: new RegExp(`^${FORECAST},`) }))
  await expect.poll(() => pendingPrompt(page), { message: 'one tap answers the forecast' }).toBeNull()
  expect(tapCount(page) - before).toBe(1)
  expect((await readSave(page)).looksScary.meadow).toMatchObject({ forecast: FORECAST, really: null })
  expect(await scaryPhase(page), 'still looming until she gets there').toBe('looming')

  // The Big Leap: the reveal plays (clock frozen, no card yet), then "How scary was it really?".
  expect(await waitClimbPause(page)).toBe('ready')
  expect((await climbState(page))?.bigLeap, 'standing at the Big Leap').toBe(true)
  await leapDrag(page, bigLeap.angle, bigLeap.power)
  await expect.poll(() => pendingPrompt(page), { message: 'the reveal starts on landing', timeout: 15_000 }).toBe('reveal')
  expect((await climbState(page))?.elementId).toBe('gap')
  expect(await scaryPhase(page)).toBe('revealing')
  expect((await climbState(page))?.frozen, 'the clock is frozen during the reveal').toBe(true)
  await expect(page.locator('.climb-prompt--fear'), 'no card while the reveal plays').toHaveCount(0)
  await expect.poll(() => pendingPrompt(page), { message: 'the question after the reveal', timeout: 10_000 }).toBe('really')
  expect(await scaryPhase(page), 'the reveal has finished playing').toBe('revealed')

  await expect(card).toContainText('How scary was it really?')
  await tap(card.getByRole('radio', { name: new RegExp(`^${REALLY},`) }))
  const compare = page.locator('.climb-prompt--compare')
  await expect(compare).toBeVisible()
  await expect(compare).toContainText(`Forecast ${FORECAST}. Really ${REALLY}.`)
  await tap(page.getByRole('button', { name: 'Keep climbing', exact: true }))
  await expect.poll(() => pendingPrompt(page)).toBeNull()
  expect(await waitClimbPause(page)).toBe('ready')
  expect((await climbState(page))?.elementId).toBe('gap')
  const rec = (await readSave(page)).looksScary.meadow
  expect(rec).toMatchObject({ forecast: FORECAST, really: REALLY })
  expect(typeof rec?.at).toBe('string')

  // Back another time: it starts gentle at the camp, and nothing is asked on the way past it.
  await page.goto('./#/camp')
  await page.goto('./#/climb/p02')
  await expect.poll(() => climbState(page).then((s) => s?.elementId ?? null)).toBe('c1')
  expect(await scaryPhase(page)).toBe('revealed')
  await page.waitForTimeout(1_600) // the climb's arrival check has run
  expect(await waitClimbPause(page), 'no forecast the second time').toBe('ready')
  await leapDrag(page, bigLeap.angle, bigLeap.power)
  await expect.poll(() => climbState(page).then((s) => (s?.phase === 'ready' ? s.elementId : null)), { timeout: 15_000 }).toBe('gap')
  await page.waitForTimeout(800)
  expect(await pendingPrompt(page), 'no "really" the second time').toBeNull()
  expect((await readSave(page)).looksScary.meadow).toMatchObject({ forecast: FORECAST, really: REALLY })
})
