/**
 * The summit pitch ends at Sky Lake, on every project. A climber with the whole mountain open stands
 * at the summit pitch's last camp (a seeded run); the last leap (a Big Leap) sends it, the Beta Map
 * offers only "On to Sky Lake", and the finale plays. A tap skips ONE beat — every tap is checked to
 * really move it on — except, the first time, while the goat climbs out of the backpack, makes its
 * leap and flops in: taps do nothing there and the Skip button waits until it pops up laughing. The
 * card records the summit. "Watch again" replays it and writes nothing. Then a night climb of the
 * same pitch — the goat climbing beside her now — ends with the short moonlight ending, which writes
 * nothing either. And a reload on the summit pitch while Sky Lake is still owed goes on to Sky Lake.
 */
import {
  addStones,
  climberSave,
  climbState,
  expect,
  expectRoute,
  leapDrag,
  loadSolution,
  pendingPrompt,
  pitchWithRuns,
  readSave,
  runAt,
  seedSave,
  tap,
  test,
  waitClimbPause,
} from './helpers'
import type { Page } from '@playwright/test'
import { FINALE_COPY } from '../src/screens/finale/copy'
import { cardAt, nextBeatAt, skipAllFrom, UNSKIPPABLE_BEATS, type FinaleMode } from '../src/screens/finale/timeline'

test.describe.configure({ timeout: 180_000 })

/** What the finale's debug hook reports (screens/finale/play.ts). */
interface FinaleState {
  t: number
  beat: string
  night: boolean
  record: boolean
  card: boolean
  reduced: boolean
  skipShown: boolean
}

function finaleState(page: Page): Promise<FinaleState | null> {
  return page.evaluate(() => {
    const f = window.__upanyway?.finale as { state(): FinaleState } | null | undefined
    return f ? f.state() : null
  })
}

/** The summit pitch's route (element ids), from the level file the app is built from. */
function summitRoute(): { lastCamp: string; index: number } {
  const steps = loadSolution('p16').steps
  const last = steps[steps.length - 1]
  expect(last.to, 'the last step reaches the top').toBe('top')
  return { lastCamp: last.from, index: steps.length - 1 }
}

/** Is the climb's goat climbing beside her (not in the backpack)? */
function goatOutside(page: Page): Promise<boolean | null> {
  return page.evaluate(() => window.__upanyway?.climb.goatOutside() ?? null)
}

/**
 * Walk the finale to its card. Each tap on the picture must skip exactly to the next beat (checked);
 * on the first day finale, taps while the goat climbs out, leaps and flops must change nothing, no
 * Skip button shows until it pops up laughing, and then Skip goes straight to the card. Taps go to the
 * right-hand side of the picture, clear of the Skip button, the mute toggle and the goat's bubble.
 */
async function walkFinale(page: Page, mode: FinaleMode, cardButton: string): Promise<void> {
  const done = page.getByRole('button', { name: cardButton, exact: true })
  const stage = page.locator('.finale__stage')
  await expect(stage).toBeVisible()
  const box = await stage.boundingBox()
  expect(box, 'the finale picture is laid out').not.toBeNull()
  const position = { x: (box?.width ?? 300) - 40, y: (box?.height ?? 600) * 0.4 }
  const first = await finaleState(page)
  expect(first, 'the finale is playing').not.toBeNull()
  const guarded = !!first?.record && mode === 'day'
  const started = Date.now()
  let sawGuard = false
  for (let i = 0; i < 80; i++) {
    const s = await finaleState(page)
    if (!s || s.card) break
    if (guarded && (UNSKIPPABLE_BEATS as readonly string[]).includes(s.beat)) {
      sawGuard = true
      expect(s.skipShown, `no Skip button during "${s.beat}"`).toBe(false)
      const end = nextBeatAt(mode, s.t)
      if (end - s.t > 0.8) {
        await stage.tap({ position })
        await page.waitForTimeout(350)
        const after = await finaleState(page)
        expect(after?.t ?? end, `a tap during "${s.beat}" skips nothing`).toBeLessThan(end)
      } else await page.waitForTimeout(250)
      continue
    }
    if (guarded && s.t >= skipAllFrom()) {
      // The goat has popped up laughing: now Skip goes straight to the card.
      const skip = page.getByRole('button', { name: FINALE_COPY.skipLabel, exact: true })
      await expect(skip, 'Skip shows once the goat pops up').toBeVisible()
      await tap(skip)
      break
    }
    await stage.tap({ position })
    await expect
      .poll(async () => (await finaleState(page))?.beat ?? 'gone', { timeout: 1_000, message: `a tap skips the "${s.beat}" beat` })
      .not.toBe(s.beat)
    await page.waitForTimeout(350)
  }
  await expect(done, 'the finale card').toBeVisible({ timeout: 2_000 })
  if (guarded) expect(sawGuard, 'the goat climbing out played in full').toBe(true)
  else expect(Date.now() - started, 'tapping gets to the card well before it would come by itself').toBeLessThan(cardAt(mode) * 600)
}

/** The last leap from the seeded camp, then the Beta Map. */
async function sendFromLastCamp(page: Page, lastCamp: string): Promise<void> {
  const steps = loadSolution('p16').steps
  const last = steps[steps.length - 1]
  await expect.poll(() => climbState(page).then((s) => s?.elementId ?? null), { message: 'resumed at the last camp' }).toBe(lastCamp)
  expect(await waitClimbPause(page)).toBe('ready')
  expect((await climbState(page))?.bigLeap, 'the last leap is a Big Leap').toBe(true)
  await leapDrag(page, last.angle, last.power)
  await expect.poll(() => pendingPrompt(page), { message: 'the Beta Map after the send', timeout: 20_000 }).toBe('betamap')
  expect((await climbState(page))?.phase).toBe('sent')
}

test('the summit pitch: Beta Map → Sky Lake → the summit is reached; Watch again and the moonlight ending write nothing', async ({ page }) => {
  const { lastCamp, index } = summitRoute()
  const d = climberSave()
  addStones(d, 14)
  d.pitches.p16 = pitchWithRuns(runAt(lastCamp, index), runAt(lastCamp, index, true))
  await seedSave(page, d)

  // Night climbs aren't open yet: ?night=1 is a day climb.
  await page.goto('./#/climb/p16?night=1')
  await sendFromLastCamp(page, lastCamp)
  const after = await readSave(page)
  expect(after.summit.reached, 'the send reaches the summit').toBe(true)
  expect(after.summit.finaleSeen).toBe(false)
  expect(after.pitches.p16?.sends).toBe(1)
  expect(after.pitches.p16?.nightSends, 'it was a day climb').toBe(0)

  // The first time, Sky Lake is the only way on.
  const map = page.locator('.climb-map')
  const go = map.getByRole('button', { name: 'On to Sky Lake', exact: true })
  await expect(go).toBeVisible()
  await expect(map.getByRole('button', { name: 'Climb again', exact: true })).toHaveCount(0)
  await expect(map.getByRole('button', { name: 'Back to camp', exact: true })).toHaveCount(0)
  await tap(go)
  await expectRoute(page, '/finale')
  expect(await finaleState(page)).toMatchObject({ night: false, record: true })

  await walkFinale(page, 'day', 'Back to camp')
  await expect(page.locator('.finale-card')).toContainText('Sky Lake!')
  const seen = await readSave(page)
  expect(seen.summit).toMatchObject({ reached: true, finaleSeen: true })
  expect(typeof seen.summit.at).toBe('string')
  const summit = JSON.stringify(seen.summit)

  // Watch again: the same finale, skippable all the way, and nothing is written.
  await tap(page.getByRole('button', { name: 'Watch again', exact: true }))
  await expectRoute(page, '/finale')
  expect(new URL(page.url()).hash).toContain('replay=1')
  await expect.poll(() => finaleState(page).then((s) => (s && !s.card ? s.record : null))).toBe(false)
  await walkFinale(page, 'day', 'Back to camp')
  expect(JSON.stringify((await readSave(page)).summit), 'a replay writes nothing').toBe(summit)
  await tap(page.getByRole('button', { name: 'Back to camp', exact: true }))
  await expectRoute(page, '/camp')

  // By moonlight: the goat climbs beside her, and the send ends with both of them splashing in.
  await page.goto('./#/climb/p16?night=1')
  await expect.poll(() => goatOutside(page), { message: 'the goat climbs beside her at night' }).toBe(true)
  await sendFromLastCamp(page, lastCamp)
  expect((await readSave(page)).pitches.p16?.nightSends).toBe(1)
  const night = page.locator('.climb-map').getByRole('button', { name: 'On to Sky Lake', exact: true })
  await expect(night).toBeVisible()
  await tap(night)
  await expectRoute(page, '/finale')
  expect(new URL(page.url()).hash).toContain('night=1')
  expect(await finaleState(page)).toMatchObject({ night: true, record: false })
  await walkFinale(page, 'night', 'Back to camp')
  await expect(page.locator('.finale-card')).toContainText('Sky Lake by moonlight')
  await tap(page.getByRole('button', { name: 'Back to camp', exact: true }))
  await expectRoute(page, '/camp')
  expect(JSON.stringify((await readSave(page)).summit), 'the night ending writes nothing').toBe(summit)
})

test('a reload on a climb while Sky Lake is still owed goes on to Sky Lake', async ({ page }) => {
  const { lastCamp, index } = summitRoute()
  const d = climberSave()
  addStones(d, 14)
  d.pitches.p16 = { ...pitchWithRuns(null, runAt(lastCamp, index, true)), sends: 1, totalAttempts: 1 }
  d.summit = { reached: true, at: new Date().toISOString(), finaleSeen: false }
  await seedSave(page, d)

  // E.g. Safari restoring the tab on the summit pitch's Beta Map: not back to the bottom of the pitch.
  await page.goto('./#/climb/p16?night=1')
  await expectRoute(page, '/finale')
  await expect.poll(() => finaleState(page).then((s) => s?.record ?? null)).toBe(true)
  expect((await finaleState(page))?.night).toBe(false)
  expect(await page.evaluate(() => window.__upanyway?.climb.levelId() ?? null), 'no climb mounted').toBeNull()
})
