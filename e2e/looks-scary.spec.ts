/**
 * The Looks Scary moment on Pitch 2 (the Big Gap), on every project: the Fear Forecast at the camp
 * before it, then — even when she skips the gap by leaping straight up past it — "How scary was it
 * really?" and the one-line comparison ("Forecast 7. Really 2.") on the first spot past it.
 */
import { answerUntilReady, climbState, completeFirstRun, expect, leapDrag, readSave, replaySolutions, test, type ClimbLog } from './helpers'

test.describe.configure({ timeout: 150_000 })

/** From c1, nearly straight up onto b2: over the gap's landing (and the Big Leap) altogether. */
const SKIP_GAP = { angle: 100, power: 0.86 } as const

test('a shortcut past the Looks Scary spot still gets "How scary was it really?"', async ({ page }) => {
  await completeFirstRun(page)
  await page.goto('./#/climb/p02')
  const log: ClimbLog = { forecastGiven: null }
  await replaySolutions(page, 'p02', { forecast: 7 }, { stopAt: 'c1', log })
  expect(log.forecastGiven, 'the Fear Forecast at the camp before the gap').toBe(7)
  expect((await climbState(page))?.elementId).toBe('c1')
  expect((await readSave(page)).looksScary.meadow).toMatchObject({ forecast: 7, really: null })

  await leapDrag(page, SKIP_GAP.angle, SKIP_GAP.power)
  // On b2 the reveal plays, then the question and the comparison card (answerUntilReady requires it).
  const after = await answerUntilReady(page, log, { really: 2 }, 'past the gap')
  expect(after.elementId).toBe('b2')
  expect((await readSave(page)).looksScary.meadow).toMatchObject({ forecast: 7, really: 2 })
})
