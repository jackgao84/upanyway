/**
 * Sending Pitch 1, on every project: after the whole first run (lesson included), replay the saved
 * solution (src/game/levels/solutions/p01.json) leap by leap as touch drags, checking where she is
 * by element id before and after every leap. Then the Beta Map: "Sent in 1 attempt.", the word it
 * introduces, the save, and Next pitch. A second climb takes a fall on the way, so the map counts 2.
 */
import {
  checkScreen,
  climbState,
  completeFirstRun,
  expect,
  expectRoute,
  leapDrag,
  loadSolution,
  pendingPrompt,
  readSave,
  replaySolutions,
  tap,
  test,
  waitClimbPause,
} from './helpers'

// The first run plus eighteen leaps at a human pace.
test.describe.configure({ timeout: 150_000 })

const betaMap = (page: import('@playwright/test').Page) => page.getByRole('dialog', { name: 'Beta map' })

test('sends Pitch 1 by replaying its saved solution as touch drags', async ({ page }, testInfo) => {
  await completeFirstRun(page)
  await expectRoute(page, '/climb/p01')

  const started = Date.now()
  const leaps = await replaySolutions(page, 'p01')
  expect(leaps).toBe(loadSolution('p01').steps.length)
  expect((await climbState(page))?.elementId).toBe('top')
  // The goat says "We sent it!" (or the like): the word's meaning comes with it, the first time.
  await expect(page.locator('.toast').filter({ hasText: 'Making it all the way to the top of a pitch.' })).toBeVisible()
  testInfo.annotations.push({ type: 'send', description: `p01: ${leaps} leaps in ${((Date.now() - started) / 1000).toFixed(1)} s on ${testInfo.project.name}` })

  // The Beta Map: one attempt, said the way she'd say it.
  await expect.poll(() => pendingPrompt(page), { message: 'the Beta Map opens after the send' }).toBe('betamap')
  const map = betaMap(page)
  await expect(map).toBeVisible()
  await expect(map.locator('.climb-map__line')).toHaveText('Sent in 1 attempt. Every leap got you here.')
  await expect(map).not.toContainText('1 attempts')
  // First time at the top: what "beta" means ("send" came with the goat's line; no "whipper" —
  // there wasn't one).
  await expect(map.locator('.climb-map__word')).toHaveCount(1)
  await expect(map.locator('.climb-map__word')).toContainText(/^Beta: tips and tricks/)
  await checkScreen(page, 'beta map p01')

  const save = await readSave(page)
  const p01 = save.pitches.p01
  expect(p01, 'Pitch 1 has a record').toBeTruthy()
  expect(p01!.sends).toBe(1)
  expect(p01!.totalAttempts).toBe(1)
  expect(p01!.run, 'the run is finished').toBeNull()
  expect(p01!.lastSend?.attempts).toBe(1)
  expect(p01!.lastSend?.failedArcs).toEqual([])
  expect(p01!.lastSend?.routeArcs, 'the bright route on the map: one arc per leap').toHaveLength(leaps)
  expect(p01!.firstSentAt).toBeTruthy()
  expect(save.stats.sends).toBe(1)
  expect(save.stats.whippers, 'only the lesson whipper').toBe(1)
  expect(save.glossarySeen).toEqual(expect.arrayContaining(['pitch', 'whipper', 'beta', 'send']))

  // Kept with the test's output for a look by eye (test-results/…/beta-map.png), once the bright
  // route has drawn itself leap by leap.
  await page.waitForTimeout(3_000)
  await page.screenshot({ path: testInfo.outputPath('beta-map.png') })

  // Sending Pitch 1 opens Pitch 2 (it needs no stones, only Pitch 1 sent): Next pitch goes straight there.
  await expect(map.locator('.climb-map__locked'), 'no hidden-trail note').toHaveCount(0)
  const next = map.getByRole('button', { name: 'Next pitch', exact: true })
  await expect(map.getByRole('button', { name: 'Climb again', exact: true })).toBeVisible()
  await expect(map.getByRole('button', { name: 'Back to camp', exact: true })).toBeVisible()
  await tap(next)
  await expectRoute(page, '/climb/p02')
  await expect.poll(() => page.evaluate(() => window.__upanyway?.climb.levelId() ?? null)).toBe('p02')
  expect(await waitClimbPause(page)).toBe('ready')
  expect((await climbState(page))?.elementId).toBe('c0')
  await expect(betaMap(page)).toHaveCount(0)
})

test('a fall on the way counts: Sent in 2 attempts', async ({ page }) => {
  await completeFirstRun(page)
  const [first] = loadSolution('p01').steps

  // Onto the first hold, then a leap that's far too flat: the rope catches her back at the start.
  expect(await waitClimbPause(page)).toBe('ready')
  await leapDrag(page, first.angle, first.power)
  expect(await waitClimbPause(page)).toBe('ready')
  expect((await climbState(page))?.elementId).toBe(first.to)
  await leapDrag(page, 20, 0.45)
  await expect.poll(async () => (await readSave(page)).stats.whippers, { message: 'the fall counts as a whipper' }).toBe(2)
  expect(await waitClimbPause(page)).toBe('ready')
  expect((await climbState(page))?.elementId, 'back at the start camp').toBe(first.from)
  const run = (await readSave(page)).pitches.p01?.run
  expect(run?.whippers).toBe(1)
  expect(run?.failedArcs).toHaveLength(1)

  // The whole pitch from the start camp, and the map counts both tries.
  await replaySolutions(page, 'p01')
  await expect.poll(() => pendingPrompt(page)).toBe('betamap')
  const map = betaMap(page)
  await expect(map.locator('.climb-map__line')).toHaveText('Sent in 2 attempts. Every whipper got you here.')
  const save = await readSave(page)
  expect(save.pitches.p01?.lastSend?.attempts).toBe(2)
  expect(save.pitches.p01?.lastSend?.failedArcs).toHaveLength(1)
  expect(save.pitches.p01?.totalAttempts).toBe(2)
  expect(save.pitches.p01?.lastSend?.routeArcs, 'the bright route starts again from the start camp').toHaveLength(loadSolution('p01').steps.length)

  // Back to camp from the map.
  await tap(map.getByRole('button', { name: 'Back to camp', exact: true }))
  await expectRoute(page, '/camp')
})
