/**
 * Logging real brave things, on every project, by touch.
 *
 * 1. "I already did it!": every question of the log flow in turn (typed brave thing, Fear Forecast,
 *    worry, how scary it really was, what happened from a chip, "Flopped — and I'm still here", what
 *    she learned from a chip) → the cairn drops the new stone (placed today) → the Hall of Flops
 *    hangs it in "My flops" with what she learned as its caption → the Weather Station waits for two
 *    more (its friendly empty state, one slot filled).
 * 2. "I'll do it later": an idea card → a plan on Plans → "Not today" (the goat's exact words, and
 *    nothing about the plan changes) → "Make it smaller" → a NEW plan that points at the first one,
 *    which stays exactly as it was → "I did it!" on the smaller step → its stone on the cairn.
 */
import type { Page } from '@playwright/test'
import { HAPPENED_CHIPS } from '../src/content/happenedChips'
import { IDEAS } from '../src/content/ideas'
import { LEARN_CHIPS } from '../src/content/learnChips'
import { SMALLER_WAYS, smallerText } from '../src/content/smaller'
import { CAIRN_COPY, WEATHER_COPY } from '../src/screens/cairn/copy'
import { HALL_COPY } from '../src/screens/flops/copy'
import { LOG_COPY, PLANS_COPY } from '../src/screens/log/copy'
import {
  buttonNamed,
  checkScreen,
  climberSave,
  expect,
  expectRoute,
  gotoCamp,
  mainHeading,
  readSave,
  seedSave,
  settle,
  tap,
  tapWeather,
  test,
  todayKey,
  typeInto,
} from './helpers'

test.describe.configure({ timeout: 120_000 })

const L = LOG_COPY

/** The question on the log flow right now. */
async function expectQuestion(page: Page, text: string): Promise<void> {
  await expect(mainHeading(page), `the question "${text}"`).toHaveText(text)
}

/** Back to camp with the screen's own back button. */
async function backToCamp(page: Page): Promise<void> {
  await tap(page.locator('.layout__back'))
  await expectRoute(page, '/camp')
}

test('logs a brave thing she already did, flopped — and still here, all the way to the museum', async ({ page }) => {
  await seedSave(page, climberSave())
  await gotoCamp(page)
  await tap(page.locator('.camp__log'))
  await expectRoute(page, '/log')

  // 1. What's the brave thing? Next waits for words.
  await expectQuestion(page, L.what.q)
  const next = buttonNamed(page, L.next)
  await expect(next).toBeDisabled()
  await checkScreen(page, 'log: what')
  const brave = 'Sing my song at the school show'
  await typeInto(page.getByRole('textbox', { name: L.what.label }), brave)
  await expect(next).toBeEnabled()
  await tap(next)

  // 2. Fear Forecast: one tap on the weather moves on.
  await expectQuestion(page, L.forecast.q)
  await expect(page.locator('.log-ticket__text'), 'the brave thing rides along above each question').toHaveText(brave)
  await checkScreen(page, 'log: forecast')
  await tapWeather(page.locator('.log-fear'), 8)

  // 3. The worry (optional).
  await expectQuestion(page, L.worry.q)
  await checkScreen(page, 'log: worry')
  await typeInto(page.getByRole('textbox', { name: L.worry.label }), 'I forget the words')
  await tap(buttonNamed(page, L.next))

  // 4. Done yet? "I already did it!"
  await expectQuestion(page, L.when.q)
  await checkScreen(page, 'log: when')
  await tap(page.getByRole('button', { name: new RegExp(`^${L.when.did}`) }))

  // 5a. How scary was it really?
  await expectQuestion(page, L.really.q)
  await checkScreen(page, 'log: really')
  await tapWeather(page.locator('.log-fear'), 3)

  // 5b. What actually happened? A chip fills the line (and lights up).
  await expectQuestion(page, L.happened.q)
  await expect(buttonNamed(page, L.next)).toBeDisabled()
  await checkScreen(page, 'log: happened')
  const happened = HAPPENED_CHIPS[3]
  const chip = buttonNamed(page.locator('.log-chips'), happened)
  await tap(chip)
  await expect(chip).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('textbox', { name: L.happened.label })).toHaveValue(happened)
  await tap(buttonNamed(page, L.next))

  // 5c. How did it go? All three ways are the same size.
  await expectQuestion(page, L.outcome.q)
  const outcomes = page.locator('.log-choice--outcome')
  await expect(outcomes).toHaveCount(3)
  const sizes = await outcomes.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)))
  expect(new Set(sizes).size, `the three outcomes are the same height (${sizes.join(', ')})`).toBe(1)
  await checkScreen(page, 'log: outcome')
  await tap(page.getByRole('button', { name: L.outcome.flopped }))

  // 5d. What did I learn? (optional) After a flop: the goat, and where the flop will hang.
  await expectQuestion(page, L.learned.q)
  await expect(page.locator('.log-flop__note')).toHaveText(L.learned.flop)
  await expect(page.locator('.log-flop .goat-bubble__text')).not.toBeEmpty()
  await checkScreen(page, 'log: learned')
  const learned = LEARN_CHIPS[0]
  await tap(buttonNamed(page.locator('.log-chips'), learned))
  await expect(page.getByRole('textbox', { name: L.learned.label })).toHaveValue(learned)
  await tap(buttonNamed(page, L.learned.done))

  // The cairn: the new stone drops in today, and the count says one.
  await expectRoute(page, '/cairn')
  const save = await readSave(page)
  expect(save.brave).toHaveLength(1)
  const b = save.brave[0]
  expect(b).toMatchObject({
    text: brave,
    status: 'done',
    forecast: 8,
    worry: 'I forget the words',
    really: 3,
    whatHappened: happened,
    outcome: 'flopped',
    learned,
    oops: false,
    stoneDay: todayKey(),
  })
  expect(new URL(page.url()).hash, 'the cairn is asked to drop the new stone').toContain(`new=${b.id}`)
  await expect(mainHeading(page)).toHaveText(CAIRN_COPY.title)
  await expect(page.locator('.cairn-info__num')).toHaveText('1', { timeout: 15_000 })
  await expect(page.locator('.cairn-bubble .goat-bubble__text')).not.toBeEmpty()
  // The badge for a flop logged anyway, once the stone has landed.
  await expect(page.locator('.toast').filter({ hasText: 'Flopped — and Still Here' })).toBeVisible({ timeout: 10_000 })
  expect(Object.keys((await readSave(page)).badges)).toContain('still-here')
  await checkScreen(page, 'cairn with the new stone')

  // The Hall of Flops: "My flops" frames it with what she learned.
  await backToCamp(page)
  await tap(page.getByRole('button', { name: 'Hall of Flops' }))
  await expectRoute(page, '/flops')
  await expect(mainHeading(page)).toHaveText(HALL_COPY.title)
  await tap(page.getByRole('radio', { name: HALL_COPY.tabs.mine }))
  await expect(page.getByRole('radio', { name: HALL_COPY.tabs.mine })).toHaveAttribute('aria-checked', 'true')
  const exhibit = page.locator(`.exhibit[data-id="${b.id}"]`)
  await expect(exhibit).toBeVisible()
  await expect(exhibit.locator('.placard__title')).toHaveText(brave)
  await expect(exhibit.locator('.placard__caption')).toHaveText(`${HALL_COPY.mine.learned} ${learned}`)
  await checkScreen(page, 'flops: my flops')

  // The Weather Station: one forecast so far, two more to go.
  await backToCamp(page)
  await tap(page.getByRole('button', { name: WEATHER_COPY.title }))
  await expectRoute(page, '/weather')
  await expect(mainHeading(page)).toHaveText(WEATHER_COPY.title)
  await expect(page.getByText(WEATHER_COPY.emptyTitle)).toBeVisible()
  await expect(page.getByText(WEATHER_COPY.emptyHave(1))).toBeVisible()
  await expect(page.locator('.wx-slot')).toHaveCount(3)
  await expect(page.locator('.wx-slot.is-filled')).toHaveCount(1)
  await checkScreen(page, 'weather: empty state')
})

test('saves a plan for later; Not today costs nothing; Make it smaller adds a new plan and keeps the first', async ({ page }) => {
  await seedSave(page, climberSave())
  await gotoCamp(page)
  await tap(page.locator('.camp__log'))
  await expectQuestion(page, L.what.q)

  // Pick an idea: the brave-vs-dangerous line is always at the top.
  await tap(buttonNamed(page, L.what.pick))
  await expect(mainHeading(page)).toHaveText(L.ideas.title)
  await expect(page.locator('.ideas__care')).toContainText(L.ideas.brave)
  await expect(page.locator('.ideas__care')).toContainText(L.ideas.care)
  await settle(page)
  await checkScreen(page, 'log: ideas')
  const idea = IDEAS[0]
  await tap(page.locator('.idea-card').filter({ hasText: idea.text }).first())
  await expectQuestion(page, L.forecast.q)
  await tapWeather(page.locator('.log-fear'), 6)
  await expectQuestion(page, L.worry.q)
  await tap(buttonNamed(page, L.skip))
  await expectQuestion(page, L.when.q)
  await tap(page.getByRole('button', { name: new RegExp(`^${L.when.later}`) }))

  // Saved to Plans.
  await expectRoute(page, '/plans')
  await expect(page.locator('.toast').filter({ hasText: L.saved })).toBeVisible()
  await expect(mainHeading(page)).toHaveText(PLANS_COPY.title)
  let save = await readSave(page)
  expect(save.brave).toHaveLength(1)
  const plan = save.brave[0]
  expect(plan).toMatchObject({ text: idea.text, ideaId: idea.id, status: 'planned', forecast: 6, notTodayCount: 0 })
  expect(plan.stoneDay ?? null, 'a plan has no stone yet').toBeNull()
  const cards = page.locator('.plan')
  await expect(cards).toHaveCount(1)
  await expect(cards.first().locator('.plan__text')).toHaveText(idea.text)
  // No dates, counts or streaks on a plan.
  await expect(cards.first()).not.toContainText(/\d/)
  await checkScreen(page, 'plans')

  // Not today: the goat's words, and an offer. Nothing else about the plan changes.
  await tap(cards.first().locator('.plan__not-today'))
  const notToday = cards.first().locator('.plan__nottoday')
  await expect(notToday.locator('.goat-bubble__text')).toHaveText(/^Fear won this round\. That[’']s allowed\.$/)
  await expect(notToday).toContainText(PLANS_COPY.offer.q)
  save = await readSave(page)
  expect(save.brave).toHaveLength(1)
  expect(save.brave[0]).toEqual({ ...plan, notTodayCount: 1 })
  await checkScreen(page, 'plans: not today')
  const original = save.brave[0]

  // Make it smaller: half of it, then its own forecast.
  await tap(buttonNamed(notToday, PLANS_COPY.offer.yes))
  const sheet = page.locator('.smaller-sheet')
  await expect(sheet).toBeVisible()
  await expect(sheet).toContainText(PLANS_COPY.sheet.sub)
  await settle(page)
  await checkScreen(page, 'plans: make it smaller')
  const way = SMALLER_WAYS[0]
  await tap(sheet.locator('.smaller__way').filter({ hasText: way.label }))
  await expect(sheet.locator('.smaller__q')).toHaveText(PLANS_COPY.sheet.forecastQ)
  await tapWeather(sheet, 3)
  await expect(sheet).toHaveCount(0)

  // A new plan, first in the list, pointing at the original; the original is exactly as it was.
  await expect(cards).toHaveCount(2)
  const smaller = smallerText(way.id, idea.text)
  await expect(cards.first().locator('.plan__text')).toHaveText(smaller)
  await expect(cards.first()).toContainText(PLANS_COPY.smallerTag)
  await expect(cards.nth(1).locator('.plan__text')).toHaveText(idea.text)
  save = await readSave(page)
  expect(save.brave).toHaveLength(2)
  expect(save.brave.find((x) => x.id === original.id), 'the original plan is unchanged').toEqual(original)
  const step = save.brave.find((x) => x.id !== original.id)
  expect(step).toMatchObject({ text: smaller, smallerOf: original.id, status: 'planned', forecast: 3, notTodayCount: 0 })
  // Not today turned into a smaller step: its badge follows the goat's line.
  await expect(page.locator('.toast').filter({ hasText: 'A Smaller Step' })).toBeVisible({ timeout: 10_000 })
  expect(Object.keys(save.badges)).toContain('smaller-step')
  await checkScreen(page, 'plans: two plans')

  // "I did it!" on the smaller step: how it went, then its stone.
  await tap(cards.first().locator('.plan__did'))
  await expectRoute(page, `/log/did/${step!.id}`)
  await expectQuestion(page, L.really.q)
  await tapWeather(page.locator('.log-fear'), 1)
  await expectQuestion(page, L.happened.q)
  await tap(buttonNamed(page.locator('.log-chips'), HAPPENED_CHIPS[0]))
  await tap(buttonNamed(page, L.next))
  await expectQuestion(page, L.outcome.q)
  await tap(page.getByRole('button', { name: L.outcome.nailed }))
  await expectQuestion(page, L.learned.q)
  await expect(page.locator('.log-flop')).toHaveCount(0)
  await tap(buttonNamed(page, L.learned.done))
  await expectRoute(page, '/cairn')
  await expect(page.locator('.cairn-info__num')).toHaveText('1', { timeout: 15_000 })
  save = await readSave(page)
  expect(save.brave.find((x) => x.id === step!.id)).toMatchObject({ status: 'done', really: 1, outcome: 'nailed', stoneDay: todayKey() })
  expect(save.brave.find((x) => x.id === original.id), 'the first plan still waits, unchanged').toEqual(original)

  // Back on Plans only the first plan is left.
  await tap(page.locator('.layout__back'))
  await expectRoute(page, '/plans')
  await expect(cards).toHaveCount(1)
  await expect(cards.first().locator('.plan__text')).toHaveText(idea.text)
})
