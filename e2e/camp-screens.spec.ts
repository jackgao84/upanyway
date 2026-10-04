/**
 * Every camp screen and every grown-ups' page, on every project, reached the way she (or a grown-up)
 * would: by tapping camp's tiles, the Hall's three rooms, every Wardrobe tab, and the grown-ups' cards
 * behind the PIN door. Each one shows its main heading, the mute toggle, finger-sized targets (48 px),
 * no sideways scrolling, 16 px text fields and no console errors. Three climbers:
 *
 * - brand new (just past the first run): the friendly empty states;
 * - well into the game: stones, plans, a framed flop, letters (one sealed), badges, poses;
 * - after Sky Lake: the goat out of the pack, treasures in the Wardrobe, the day/night map.
 */
import type { Page } from '@playwright/test'
import { CHEER } from '../src/content/cheer'
import { WEATHER_COPY, CAIRN_COPY } from '../src/screens/cairn/copy'
import { BADGES_COPY, HALL_COPY, LETTERS_COPY } from '../src/screens/flops/copy'
import { LOG_COPY, PLANS_COPY } from '../src/screens/log/copy'
import { MAP_COPY } from '../src/screens/map/copy'
import { PARENT_COPY } from '../src/screens/parent/copy'
import type { SaveData } from '../src/storage/schema'
import {
  checkScreen,
  climberSave,
  expect,
  expectRoute,
  gotoCamp,
  mainHeading,
  openGrownups,
  openParentPage,
  readSave,
  richSave,
  seedSave,
  settle,
  tap,
  test,
  withPin,
} from './helpers'

test.describe.configure({ timeout: 180_000 })

/** A camp tile by the start of its label ("Cairn" also matches "Cairn 4 stones"). */
function campTile(page: Page, label: string) {
  return page.locator('.camp__tiles .tile', { has: page.locator('.tile__label', { hasText: new RegExp(`^${label}`) }) })
}

/** Tap a camp tile, check the screen it opens, run `inside`, then come back to camp. */
async function visit(page: Page, label: string, route: string, heading: string, inside?: () => Promise<void>): Promise<void> {
  await tap(campTile(page, label))
  await expectRoute(page, route)
  await expect(mainHeading(page), `${route} heading`).toHaveText(heading)
  await checkScreen(page, route)
  if (inside) await inside()
  await tap(page.locator('.layout__back'))
  await expectRoute(page, '/camp')
}

/** Every room of the Hall of Flops. */
async function hallRooms(page: Page): Promise<void> {
  for (const room of [HALL_COPY.tabs.poses, HALL_COPY.tabs.mine, HALL_COPY.tabs.wing]) {
    const tab = page.getByRole('radio', { name: room })
    await tap(tab)
    await expect(tab).toHaveAttribute('aria-checked', 'true')
    await settle(page)
    await checkScreen(page, `flops: ${room}`)
  }
}

/** Every Wardrobe tab (seven after Sky Lake: Treasures too). */
async function wardrobeTabs(page: Page, count: number): Promise<void> {
  const tabs = page.getByRole('tab')
  await expect(tabs).toHaveCount(count)
  for (let i = 0; i < count; i++) {
    const tab = tabs.nth(i)
    await tap(tab)
    await expect(tab).toHaveAttribute('aria-selected', 'true')
    await checkScreen(page, `wardrobe: ${(await tab.textContent())?.trim()}`)
  }
}

/** All of camp's screens, from camp. */
async function kidScreens(page: Page, d: SaveData, opts: { tabs: number }): Promise<void> {
  await expect(mainHeading(page)).toHaveText(d.profile.mountainName)
  await checkScreen(page, 'camp')
  await visit(page, 'Climb', '/map', MAP_COPY.title)
  await visit(page, 'Log a brave thing', '/log', LOG_COPY.what.q)
  await visit(page, 'Plans', '/plans', PLANS_COPY.title)
  await visit(page, 'Cairn', '/cairn', CAIRN_COPY.title)
  await visit(page, 'Weather Station', '/weather', WEATHER_COPY.title)
  await visit(page, 'Hall of Flops', '/flops', HALL_COPY.title, () => hallRooms(page))
  await visit(page, 'Letters', '/letters', LETTERS_COPY.title)
  await visit(page, 'Wardrobe', '/wardrobe', 'Wardrobe', () => wardrobeTabs(page, opts.tabs))
  await visit(page, 'Badges', '/badges', BADGES_COPY.title)
}

/** The grown-ups' home and each of its pages, through the PIN door. */
async function parentPages(page: Page, worries: readonly string[] = []): Promise<void> {
  const p = PARENT_COPY
  await openGrownups(page)
  await checkScreen(page, 'parent home')
  const pages: [card: string, path: string, heading: string][] = [
    [p.home.pages.cheer.title, '/parent/cheer', CHEER.title],
    [p.home.pages.cairn.title, '/parent/cairn', p.cairn.title],
    [p.home.pages.letter.title, '/parent/letter', p.letter.title],
    [p.home.pages.flop.title, '/parent/flop', p.flop.title],
    [p.home.pages.ideas.title, '/parent/ideas', p.ideas.title],
    [p.home.pages.settings.title, '/parent/settings', p.settings.title],
    [p.home.pages.data.title, '/parent/data', p.data.title],
    [p.home.pages.pin.title, '/parent/pin', p.pin.title],
  ]
  for (const [card, path, heading] of pages) {
    await openParentPage(page, card, path)
    await expect(mainHeading(page), `${path} heading`).toHaveText(heading)
    // Reading her cairn and plans shows what she was worried might happen, as her cairn does.
    if (path === '/parent/cairn' && worries.length) {
      for (const w of worries) await expect(page.locator('.pp-brave__worry', { hasText: w })).toHaveCount(1)
    }
    await checkScreen(page, path)
    await tap(page.locator('.layout__back'))
    await expectRoute(page, '/parent/home')
  }
  // Back to camp locks the grown-ups' pages again.
  await tap(page.getByRole('button', { name: p.home.backToCamp }).last())
  await expectRoute(page, '/camp')
  await page.goto('./#/parent/settings')
  await expectRoute(page, '/parent')
}

test('a brand-new climber: every camp screen and grown-ups page', async ({ page }) => {
  const d = withPin(climberSave())
  await seedSave(page, d)
  await gotoCamp(page)
  await kidScreens(page, d, { tabs: 6 })
  await parentPages(page)
  expect((await readSave(page)).brave, 'looking around logs nothing').toEqual([])
})

test('a climber well into the game: every camp screen and grown-ups page', async ({ page }) => {
  const d = richSave()
  await seedSave(page, d)
  await gotoCamp(page)
  await expect(campTile(page, 'Letters').locator('.tile__count')).toHaveText('1')
  await kidScreens(page, d, { tabs: 6 })
  const worries = d.brave.map((b) => b.worry?.trim()).filter((w): w is string => !!w)
  expect(worries.length, 'the save has a worry to read').toBeGreaterThan(0)
  await parentPages(page, worries)
})

test('after Sky Lake: every camp screen, with treasures and the night map', async ({ page }) => {
  const d = richSave({ summit: true })
  await seedSave(page, d)
  await gotoCamp(page)
  await kidScreens(page, d, { tabs: 7 })
  // By moonlight every pitch is open.
  await tap(campTile(page, 'Climb'))
  await expectRoute(page, '/map')
  await tap(page.getByRole('radio', { name: MAP_COPY.night }))
  await expect(page.locator('.trail-pin')).toHaveCount(16)
  await expect(page.locator('.trail-pin.is-hidden')).toHaveCount(0)
  await checkScreen(page, 'map by night')
})
