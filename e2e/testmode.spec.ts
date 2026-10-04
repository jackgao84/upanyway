/**
 * Test mode, on every project. A climber partway up the mountain (later pitches still in the fog).
 * A grown-up turns test mode on in Settings: the "Test mode" pill shows, the Trail Map has every
 * pitch open and a Day/Night toggle, and a pitch she hasn't reached yet can be climbed — by day or by
 * moonlight, and the Wardrobe's treasures tried on. Leaving the grown-ups' pages with test mode on asks
 * first. Turning it off puts the game back exactly as it was: the save is deep-equal to the one before
 * test mode, climbs and gear included.
 */
import type { Page } from '@playwright/test'
import { HALL_COPY } from '../src/screens/flops/copy'
import { MAP_COPY } from '../src/screens/map/copy'
import { PARENT_COPY } from '../src/screens/parent/copy'
import {
  CLIMB_CANVAS,
  DEFAULT_PIN,
  answerUntilReady,
  buttonNamed,
  checkScreen,
  climbToCamp,
  expect,
  expectRoute,
  gotoCamp,
  leapDrag,
  loadSolution,
  mainHeading,
  openGrownups,
  openParentPage,
  readSave,
  richSave,
  seedSave,
  tap,
  test,
  waitClimbPause,
} from './helpers'

test.describe.configure({ timeout: 150_000 })

const P = PARENT_COPY
const T = P.settings.test
/**
 * richSave() has 8 stones and Pitches 1–3 sent: open to Pitch 4 (Pitch 5 waits for Pitch 4 to be
 * sent; the stones reach Pitch 10). LOCKED is a pitch well up in the fog, climbed in test mode.
 */
const LAST_OPEN = 'p04'
const FIRST_HIDDEN = 'p05'
const LOCKED = 'p11'

async function openSettings(page: Page): Promise<void> {
  await openGrownups(page, DEFAULT_PIN)
  await openParentPage(page, P.home.pages.settings.title, '/parent/settings')
  await expect(mainHeading(page)).toHaveText(P.settings.title)
}

function testSwitch(page: Page) {
  return page.getByRole('switch', { name: new RegExp(`^${T.label}`) })
}

async function openMap(page: Page): Promise<void> {
  await tap(page.locator('.camp__climb'))
  await expectRoute(page, '/map')
  await expect(mainHeading(page)).toHaveText(MAP_COPY.title)
}

test('test mode opens everything, records nothing, and turning it off puts it all back', async ({ page }) => {
  await seedSave(page, richSave())
  await gotoCamp(page)

  // The real mountain: the later pitches are hidden, there's no night toggle, no pill.
  await openMap(page)
  const pins = page.locator('.trail-pin')
  await expect(pins).toHaveCount(16)
  await expect(page.locator(`.trail-pin[data-pitch="${LOCKED}"]`)).toHaveClass(/is-hidden/)
  await expect(page.locator(`.trail-pin[data-pitch="${FIRST_HIDDEN}"]`)).toHaveClass(/is-hidden/)
  await expect(page.locator(`.trail-pin[data-pitch="${LAST_OPEN}"]`)).not.toHaveClass(/is-hidden/)
  await expect(page.getByRole('radio', { name: MAP_COPY.night })).toHaveCount(0)
  await expect(page.locator('.shell__pill')).toBeHidden()
  await tap(page.locator('.layout__back'))
  await expectRoute(page, '/camp')

  // A grown-up turns test mode on.
  await openSettings(page)
  const before = await readSave(page)
  expect(before.testMode).toBe(false)
  await expect(testSwitch(page)).toHaveAttribute('aria-checked', 'false')
  await tap(testSwitch(page))
  await expect(testSwitch(page)).toHaveAttribute('aria-checked', 'true')
  await expect(page.locator('.toast').filter({ hasText: T.on })).toBeVisible()
  expect((await readSave(page)).testMode).toBe(true)
  await expect(page.locator('.shell__pill')).toBeVisible()
  await checkScreen(page, 'settings: test mode on')

  // Leaving with it on asks first; keep it on.
  await tap(page.locator('.layout__back'))
  await expectRoute(page, '/parent/home')
  await expect(page.locator('.pp-test-note')).toBeVisible()
  await tap(page.getByRole('button', { name: P.home.backToCamp }).last())
  const ask = page.getByRole('dialog', { name: P.home.testLeave.title })
  await expect(ask).toBeVisible()
  await tap(buttonNamed(ask, P.home.testLeave.keep))
  await expectRoute(page, '/camp')
  await expect(page.locator('.shell__pill')).toBeVisible()

  // Every pitch is open, and so is the night.
  await openMap(page)
  await expect(pins).toHaveCount(16)
  await expect(page.locator('.trail-pin.is-hidden')).toHaveCount(0)
  const night = page.getByRole('radio', { name: MAP_COPY.night })
  await expect(night).toBeVisible()
  await checkScreen(page, 'map: test mode, day')
  await tap(night)
  await expect(night).toHaveAttribute('aria-checked', 'true')
  await expect(page.locator('.trail-pin.is-hidden')).toHaveCount(0)
  await expect(page.locator(`.trail-pin[data-pitch="p16"]`)).toHaveAttribute('aria-label', /by moonlight/)
  await checkScreen(page, 'map: test mode, night')
  await tap(page.getByRole('radio', { name: MAP_COPY.day }))

  // Climb a pitch she hasn't reached yet: a real leap, and nothing is recorded.
  await tap(page.locator(`.trail-pin[data-pitch="${LOCKED}"]`))
  await expectRoute(page, `/climb/${LOCKED}`)
  await expect(page.locator(CLIMB_CANVAS)).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.__upanyway?.climb.levelId() ?? null)).toBe(LOCKED)
  await expect(page.locator('.shell__pill')).toBeVisible()
  const log = { forecastGiven: null }
  const start = await answerUntilReady(page, log, {}, `${LOCKED} in test mode`)
  const [first] = loadSolution(LOCKED).steps
  expect(start.elementId).toBe(first.from)
  await leapDrag(page, first.angle, first.power)
  const pause = await waitClimbPause(page)
  expect(pause).not.toBe('sent')
  await climbToCamp(page)
  expect(await readSave(page), 'a test-mode climb records nothing').toEqual({ ...before, testMode: true })

  // Try on a treasure (before the summit only test mode shows them): it comes off with test mode.
  await tap(page.locator('.camp__tiles .tile', { has: page.locator('.tile__label', { hasText: /^Wardrobe/ }) }))
  await expectRoute(page, '/wardrobe')
  await tap(page.locator('.designer__tab--treasures'))
  const treasure = page.locator('.treasure').first()
  await tap(treasure)
  await expect(treasure).toHaveClass(/is-selected/)
  expect((await readSave(page)).profile.look.gear).toHaveLength(1)
  await tap(page.locator('.layout__back'))
  await expectRoute(page, '/camp')

  // Every fall pose and every badge is on show (read-time only: her record is untouched).
  const shown = await readSave(page)
  await page.goto('./#/flops?tab=poses')
  await expectRoute(page, '/flops')
  await expect(page.locator('.pose-card')).toHaveCount(16)
  await expect(page.locator('.pose-card.is-found')).toHaveCount(16)
  await expect(page.locator('.pose-card.is-mystery')).toHaveCount(0)
  await expect(page.locator('.hall__count-text')).toHaveText(HALL_COPY.poses.testMode)
  await checkScreen(page, 'hall: test mode')
  await page.goto('./#/badges')
  await expectRoute(page, '/badges')
  await expect(page.locator('.badge-card.is-earned')).toHaveCount(10)
  await expect(page.locator('.badge-card.is-locked')).toHaveCount(0)
  await checkScreen(page, 'badges: test mode')
  expect(await readSave(page), 'showing them wrote nothing').toEqual(shown)
  await page.goto('./#/camp')
  await expectRoute(page, '/camp')

  // Turn it off: everything is exactly as it was before.
  await openSettings(page)
  await expect(testSwitch(page)).toHaveAttribute('aria-checked', 'true')
  await tap(testSwitch(page))
  await expect(testSwitch(page)).toHaveAttribute('aria-checked', 'false')
  await expect(page.locator('.toast').filter({ hasText: T.off })).toBeVisible()
  await expect(page.locator('.shell__pill')).toBeHidden()
  const after = await readSave(page)
  expect(after, 'the save is exactly as it was before test mode').toEqual(before)

  // And the real mountain is back.
  await tap(page.locator('.layout__back'))
  await tap(page.getByRole('button', { name: P.home.backToCamp }).last())
  await expectRoute(page, '/camp')
  await openMap(page)
  await expect(page.locator(`.trail-pin[data-pitch="${LOCKED}"]`)).toHaveClass(/is-hidden/)
  await expect(page.getByRole('radio', { name: MAP_COPY.night })).toHaveCount(0)
})
