/**
 * Another app shares this GitHub Pages origin. If it calls localStorage.clear() while Up Anyway is
 * open, the app writes its save and backup straight back, down to the last stone; the other app's
 * keys stay cleared. A later change to the save from elsewhere (a reset or restore in another tab)
 * is taken, never undone. The other app is a stand-in page outside /upanyway/ on the same origin.
 */
import { KEYS } from '../src/storage/keys'
import type { SaveData } from '../src/storage/schema'
import { expect, gotoCamp, readSave, richSave, seedSave, test } from './helpers'

test('another app’s localStorage.clear() doesn’t lose her save', async ({ page, context, baseURL }) => {
  const save = richSave()
  const backup = JSON.stringify(richSave({ stones: 2 }))
  await seedSave(page, save)
  await page.addInitScript(
    ({ key, json }) => {
      try {
        if (!localStorage.getItem(key)) localStorage.setItem(key, json)
      } catch {
        // Storage refused: the checks below will say so.
      }
    },
    { key: KEYS.backup, json: backup },
  )
  await gotoCamp(page)
  const stones = (d: SaveData) => d.brave.filter((b) => b.stoneDay).length

  const otherUrl = new URL('/otherapp/', baseURL).href
  const other = await context.newPage()
  await other.route(otherUrl, (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Other app</title><p>Other app' }),
  )
  await other.goto(otherUrl)
  const get = (key: string) => other.evaluate((k) => localStorage.getItem(k), key)
  expect(await get(KEYS.save), 'the other app sees the same storage').not.toBeNull()

  await other.evaluate(() => {
    localStorage.setItem('otherapp:save', '{}')
    localStorage.clear()
  })

  await expect.poll(() => get(KEYS.save), { message: 'the save came back' }).not.toBeNull()
  const after = JSON.parse((await get(KEYS.save)) as string) as SaveData
  expect(after, 'exactly what the open app holds').toEqual(await readSave(page))
  expect(stones(after), 'every stone').toBe(stones(save))
  expect(after.brave, 'every brave thing').toEqual(save.brave)
  expect(after.stats, 'every stat').toEqual(save.stats)
  await expect.poll(() => get(KEYS.backup), { message: 'the backup came back' }).toBe(backup)
  expect(await get('otherapp:save'), 'the other app’s own keys stay cleared').toBeNull()
  await expect(page.locator('.camp__tiles')).toBeVisible()

  // A change from elsewhere is taken, not undone: the open app adopts it and writes nothing back.
  const changed = { ...after, settings: { ...after.settings, muted: !after.settings.muted } }
  await other.evaluate(({ key, json }) => localStorage.setItem(key, json), { key: KEYS.save, json: JSON.stringify(changed) })
  await expect.poll(async () => (await readSave(page)).settings.muted, { message: 'the app took the change' }).toBe(changed.settings.muted)
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')))
  expect(JSON.parse((await get(KEYS.save)) as string) as SaveData).toEqual(changed)
  await other.close()
})
