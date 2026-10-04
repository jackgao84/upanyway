/**
 * Two tabs of the app on one device (two Safari tabs, or a browser tab beside the installed app)
 * never undo each other's saves. Tab B mutes the sound; tab A takes B's save as it happens, hiding
 * tab A writes nothing, and A's own next change (starting Pitch 1) is saved on top of B's.
 */
import { KEYS } from '../src/storage/keys'
import type { SaveData } from '../src/storage/schema'
import { CLIMB_CANVAS, climberSave, expect, gotoCamp, readSave, seedSave, tap, test } from './helpers'

test('two tabs never undo each other’s saves', async ({ page, context }) => {
  const stored = (p: typeof page) =>
    p.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null') as SaveData | null, KEYS.save)

  await seedSave(page, climberSave())
  await gotoCamp(page)
  const b = await context.newPage()
  await gotoCamp(b)
  expect((await stored(b))?.settings.muted).toBe(false)

  // Tab B mutes.
  await tap(b.locator('#mute-toggle'))
  await expect.poll(async () => (await stored(b))?.settings.muted, { message: 'B saved the mute' }).toBe(true)

  // Tab A takes B's save (the storage event) — its own copy is muted now too.
  await expect.poll(async () => (await readSave(page)).settings.muted, { message: 'A took B’s save' }).toBe(true)
  await expect(page.locator('#mute-toggle')).toHaveAttribute('aria-pressed', 'true')

  // Tab A is hidden or closed: it has nothing unsaved, so nothing is written back.
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')))
  expect((await stored(b))?.settings.muted).toBe(true)

  // Tab A's own change goes on top of B's.
  await page.goto('./#/climb/p01')
  await expect(page.locator(CLIMB_CANVAS)).toBeVisible()
  await expect.poll(async () => (await stored(b))?.pitches.p01?.run?.lastCampId ?? null, { message: 'A saved its run' }).toBe('c0')
  expect((await stored(b))?.settings.muted, 'B’s mute survived A’s save').toBe(true)
  await b.close()
})
