/**
 * Real brave things and real climbs open the trail, on every project (Decision 5: pitch n opens when
 * the cairn holds n − 2 stones AND Pitch n − 1 has been sent).
 *
 * 1. After the whole first run (lesson included) only Pitch 1 is open. Tapping the fog says what is
 *    missing: on Pitch 2, climbing Pitch 1; on Pitch 3, both ("Climb Pitch 2 and add a stone to your
 *    cairn to find the way."). Logging one brave thing (straight from that card) puts a stone on the
 *    cairn, which says how far the stones reach ("Your stones have found the way to Pitch 3. Climb on
 *    to get there."); back on the map Pitch 3 is still in the fog, and now its card names only the
 *    pitch below: "The trail ahead is hidden. Climb Pitch 2 first to find the way."
 * 2. With Pitches 1–2 sent (a seeded save: replaying both pitches is send-pitch1's and looks-scary's
 *    job, and would triple this spec's time), Pitch 3's card is the brief's own words, "The trail
 *    ahead is hidden. Add a stone to your cairn to find the way.", and that one stone is needed.
 *    Logging one brave thing from the card opens it: the cairn says the trail is open to Pitch 3, the
 *    marker glows, and a tap climbs it — #/climb/p03 with the climb on its canvas.
 * 3. Where she meets the hidden trail in play: sending Pitch 2 (Pitch 1 sent, no stones), the Beta
 *    Map says "The trail ahead is hidden. Add a stone to your cairn to find the way." and its big
 *    button is Log a brave thing.
 */
import type { Page } from '@playwright/test'
import { CAIRN_COPY } from '../src/screens/cairn/copy'
import { CLIMB_COPY } from '../src/screens/climb/copy'
import { MAP_COPY } from '../src/screens/map/copy'
import {
  CLIMB_CANVAS,
  buttonNamed,
  checkScreen,
  climbState,
  climbToCamp,
  climberSave,
  completeFirstRun,
  expect,
  expectRoute,
  gotoCamp,
  leapDrag,
  loadSolution,
  logDoneBraveThing,
  mainHeading,
  pendingPrompt,
  pitchWithRuns,
  readSave,
  runAt,
  seedSave,
  sendPitches,
  tap,
  test,
  todayKey,
} from './helpers'

// The first run (with the lesson) plus a brave thing at a human pace.
test.describe.configure({ timeout: 150_000 })

/** The brief's line for a hidden trail (only a stone missing). */
const BRIEF_LINE = 'The trail ahead is hidden. Add a stone to your cairn to find the way.'

const pin = (page: Page, id: string) => page.locator(`.trail-pin[data-pitch="${id}"]`)

async function openMap(page: Page): Promise<void> {
  await tap(page.locator('.camp__climb'))
  await expectRoute(page, '/map')
  await expect(mainHeading(page)).toHaveText(MAP_COPY.title)
}

/** Tap a foggy marker: its card, with the words it shows checked. */
async function hiddenCard(page: Page, id: string, text: string, more: string | null) {
  await tap(pin(page, id))
  const card = page.locator('.trailmap__card')
  await expect(card.locator('.trailmap__locked')).toHaveText(text)
  if (more) await expect(card.locator('.trailmap__locked-more')).toHaveText(more)
  else await expect(card.locator('.trailmap__locked-more')).toHaveCount(0)
  await expectRoute(page, '/map')
  return card
}

test('after the first run: the fog names what is missing — the pitch below, a stone, or both', async ({ page }) => {
  await completeFirstRun(page)
  await climbToCamp(page)

  // The Trail Map: only Pitch 1 is open; Pitches 2 and 3 are in the fog.
  await openMap(page)
  await expect(pin(page, 'p01')).toHaveClass(/is-open/)
  await expect(pin(page, 'p02')).toHaveClass(/is-hidden/)
  await expect(pin(page, 'p03')).toHaveClass(/is-hidden/)
  await expect(pin(page, 'p03')).toHaveAttribute('aria-label', MAP_COPY.marker.hidden(3))
  await checkScreen(page, 'map: first run done')

  // Pitch 2 needs no stones, only Pitch 1 climbed: no brave thing offered.
  let card = await hiddenCard(page, 'p02', 'The trail ahead is hidden. Climb Pitch 1 first to find the way.', null)
  expect(MAP_COPY.locked.text(0, 1)).toBe('The trail ahead is hidden. Climb Pitch 1 first to find the way.')
  await expect(buttonNamed(card, MAP_COPY.locked.log)).toHaveCount(0)
  await tap(buttonNamed(card, MAP_COPY.locked.ok))
  await expect(card).toHaveCount(0)

  // Pitch 3 needs both, in one sentence.
  card = await hiddenCard(page, 'p03', MAP_COPY.locked.text(1, 2), null)
  await expect(card.locator('.trailmap__locked')).toHaveText('The trail ahead is hidden. Climb Pitch 2 and add a stone to your cairn to find the way.')
  expect((await readSave(page)).brave).toHaveLength(0)
  await checkScreen(page, 'map: hidden trail card (both)')

  // Log a brave thing from the card: its stone goes on, and the stones reach Pitch 3.
  await tap(buttonNamed(card, MAP_COPY.locked.log))
  await expectRoute(page, '/log')
  await logDoneBraveThing(page, { text: 'Order my own lunch at the canteen' })
  const save = await readSave(page)
  expect(save.brave).toHaveLength(1)
  expect(save.brave[0].stoneDay, 'its stone is on the cairn today').toBe(todayKey())
  expect(save.pitches.p02?.sends ?? 0, 'Pitch 2 not climbed').toBe(0)
  await expect(page.locator('.cairn-info__num')).toHaveText('1', { timeout: 15_000 })
  // (The first mention of "pitch" may carry its one-line definition after the word.)
  await expect(page.locator('.cairn-info__trail')).toHaveText(/^Your stones have found the way to Pitch.*3\. Climb on to get there\.$/)
  expect(CAIRN_COPY.trailFound(3)).toBe('Your stones have found the way to Pitch 3. Climb on to get there.')

  // Back on the map: one stone, but Pitch 2 not climbed — the card names the pitch below.
  await tap(page.locator('.layout__back'))
  await expectRoute(page, '/map')
  await expect(pin(page, 'p03')).toHaveClass(/is-hidden/)
  card = await hiddenCard(page, 'p03', 'The trail ahead is hidden. Climb Pitch 2 first to find the way.', null)
  await expect(buttonNamed(card, MAP_COPY.locked.log)).toHaveCount(0)
  await checkScreen(page, 'map: hidden trail card (the pitch below)')
})

test('with Pitches 1–2 sent, one brave thing opens Pitch 3', async ({ page }) => {
  const d = climberSave()
  sendPitches(d, 2)
  expect(d.brave).toHaveLength(0)
  await seedSave(page, d)
  await gotoCamp(page)

  await openMap(page)
  await expect(pin(page, 'p01')).toHaveClass(/is-sent/)
  await expect(pin(page, 'p02')).toHaveClass(/is-sent/)
  await expect(pin(page, 'p03')).toHaveClass(/is-hidden/)

  // Only a stone missing: the brief's words, and one stone to go.
  const card = await hiddenCard(page, 'p03', BRIEF_LINE, MAP_COPY.locked.more(1))
  await checkScreen(page, 'map: hidden trail card (a stone)')

  // Log a brave thing from the card.
  await tap(buttonNamed(card, MAP_COPY.locked.log))
  await expectRoute(page, '/log')
  await logDoneBraveThing(page, { text: 'Order my own lunch at the canteen' })
  const save = await readSave(page)
  expect(save.brave).toHaveLength(1)
  expect(save.brave[0].stoneDay, 'its stone is on the cairn today').toBe(todayKey())
  await expect(page.locator('.cairn-info__num')).toHaveText('1', { timeout: 15_000 })
  await expect(page.locator('.cairn-info__trail')).toHaveText(/^The trail is open to Pitch.*3\.$/)

  // Back to the map: Pitch 3 glows now, and a tap climbs it.
  await tap(page.locator('.layout__back'))
  await expectRoute(page, '/map')
  await expect(pin(page, 'p03')).toHaveClass(/is-open/)
  await expect(pin(page, 'p03')).toHaveAttribute('aria-label', /^Pitch 3, .+\. Tap to climb\.$/)
  await expect(pin(page, 'p04')).toHaveClass(/is-hidden/)
  await tap(pin(page, 'p03'))
  await expectRoute(page, '/climb/p03')
  await expect(page.locator(CLIMB_CANVAS)).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.__upanyway?.climb.levelId() ?? null), { message: 'climbing Pitch 3' }).toBe('p03')
  await expect.poll(() => page.evaluate(() => window.__upanyway?.climb.pendingPrompt() ?? null), { message: 'not the locked card' }).not.toBe('locked')
})

test('sending Pitch 2 with no stones: the Beta Map says the trail ahead is hidden and offers a brave thing', async ({ page }) => {
  // A climber who has sent Pitch 1, on Pitch 2, resuming at its last camp below the top, with the
  // Big Gap's forecast done.
  const d = climberSave()
  sendPitches(d, 1)
  const { steps } = loadSolution('p02')
  const from = steps.findIndex((s) => s.from === 'c3')
  expect(from, 'Pitch 2 has a camp c3 below its top').toBeGreaterThan(0)
  d.pitches.p02 = pitchWithRuns(runAt('c3', from))
  d.looksScary.meadow = { forecast: 7, really: 2, at: new Date().toISOString() }
  expect(d.brave).toHaveLength(0)
  await seedSave(page, d)
  await page.goto('./#/climb/p02')
  await expect(page.locator(CLIMB_CANVAS)).toBeVisible()
  for (const step of steps.slice(from)) {
    await expect
      .poll(
        async () => {
          const st = await climbState(page)
          return st && st.phase === 'ready' && !st.frozen && (await pendingPrompt(page)) === null ? st.elementId : null
        },
        { message: `ready on ${step.from}`, timeout: 15_000 },
      )
      .toBe(step.from)
    await leapDrag(page, step.angle, step.power)
  }
  await expect.poll(() => pendingPrompt(page), { message: 'the Beta Map', timeout: 15_000 }).toBe('betamap')
  const map = page.locator('.climb-map')
  // Pitch 2 has just been sent, so a stone is all that's missing: the brief's words.
  await expect(map.locator('.climb-map__locked-title')).toHaveText(CLIMB_COPY.locked.title)
  await expect(map.locator('.climb-map__locked-text')).toHaveText(CLIMB_COPY.locked.way(1, 0))
  expect(`${CLIMB_COPY.locked.title} ${CLIMB_COPY.locked.way(1, 0)}`).toBe(BRIEF_LINE)
  await expect(buttonNamed(map, CLIMB_COPY.map.next)).toHaveCount(0)
  await expect(buttonNamed(map, CLIMB_COPY.map.again)).toBeVisible()
  await expect(buttonNamed(map, CLIMB_COPY.map.camp)).toBeVisible()
  await checkScreen(page, 'beta map: the trail ahead is hidden')
  await tap(buttonNamed(map, CLIMB_COPY.map.log))
  await expectRoute(page, '/log')
  await expect(mainHeading(page)).toHaveText('What’s the brave thing?')
})
