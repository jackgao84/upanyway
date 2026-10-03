/**
 * Real brave things open the trail, on every project. After the whole first run (lesson included),
 * Pitch 3 is hidden in the fog on the Trail Map: a tap says "The trail ahead is hidden. Add a stone to
 * your cairn to find the way." and that one stone is needed. Logging one brave thing (straight from
 * that card) puts a stone on the cairn, which says the trail is open to Pitch 3; back on the map the
 * marker glows, and a tap climbs it: #/climb/p03 with the climb on its canvas.
 */
import { MAP_COPY } from '../src/screens/map/copy'
import {
  CLIMB_CANVAS,
  buttonNamed,
  checkScreen,
  climbToCamp,
  completeFirstRun,
  expect,
  expectRoute,
  logDoneBraveThing,
  mainHeading,
  readSave,
  tap,
  test,
  todayKey,
} from './helpers'

// The first run (with the lesson) plus a brave thing at a human pace.
test.describe.configure({ timeout: 150_000 })

test('one brave thing opens Pitch 3', async ({ page }) => {
  await completeFirstRun(page)
  await climbToCamp(page)

  // The Trail Map: Pitches 1 and 2 are open, Pitch 3 is in the fog.
  await tap(page.locator('.camp__climb'))
  await expectRoute(page, '/map')
  await expect(mainHeading(page)).toHaveText(MAP_COPY.title)
  const pin = (id: string) => page.locator(`.trail-pin[data-pitch="${id}"]`)
  await expect(pin('p01')).toHaveClass(/is-open/)
  await expect(pin('p02')).toHaveClass(/is-open/)
  await expect(pin('p03')).toHaveClass(/is-hidden/)
  await expect(pin('p03')).toHaveAttribute('aria-label', MAP_COPY.marker.hidden(3))
  await checkScreen(page, 'map: first run done')

  // A tap on the fog: the hidden-trail words, and one stone to go.
  await tap(pin('p03'))
  const card = page.locator('.trailmap__card')
  await expect(card.locator('.trailmap__locked')).toHaveText(MAP_COPY.locked.text)
  await expect(card.locator('.trailmap__locked-more')).toHaveText(MAP_COPY.locked.more(1))
  await expectRoute(page, '/map')
  expect((await readSave(page)).brave).toHaveLength(0)
  await checkScreen(page, 'map: hidden trail card')

  // Log a brave thing from the card.
  await tap(buttonNamed(card, MAP_COPY.locked.log))
  await expectRoute(page, '/log')
  await logDoneBraveThing(page, { text: 'Order my own lunch at the canteen' })
  const save = await readSave(page)
  expect(save.brave).toHaveLength(1)
  expect(save.brave[0].stoneDay, 'its stone is on the cairn today').toBe(todayKey())
  await expect(page.locator('.cairn-info__num')).toHaveText('1', { timeout: 15_000 })
  await expect(page.locator('.cairn-info__trail')).toContainText(/The trail is open to Pitch.*3\./)

  // Back to the map: Pitch 3 glows now, and a tap climbs it.
  await tap(page.locator('.layout__back'))
  await expectRoute(page, '/map')
  await expect(pin('p03')).toHaveClass(/is-open/)
  await expect(pin('p03')).toHaveAttribute('aria-label', /^Pitch 3, .+\. Tap to climb\.$/)
  await expect(pin('p04')).toHaveClass(/is-hidden/)
  await tap(pin('p03'))
  await expectRoute(page, '/climb/p03')
  await expect(page.locator(CLIMB_CANVAS)).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.__upanyway?.climb.levelId() ?? null), { message: 'climbing Pitch 3' }).toBe('p03')
  await expect.poll(() => page.evaluate(() => window.__upanyway?.climb.pendingPrompt() ?? null), { message: 'not the locked card' }).not.toBe('locked')
})
