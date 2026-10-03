/**
 * Shared end-to-end helpers: a `test` that fails on any console error, page error or off-site
 * request; human-paced taps that are counted; touch drags as Pointer Events; per-screen checks
 * (mute toggle, tap targets, sideways scroll, input font size); and a walker for the first run.
 */
import { test as base, expect, type Browser, type BrowserContext, type BrowserContextOptions, type Locator, type Page, type TestInfo } from '@playwright/test'
import type { SaveData } from '../src/storage/schema'

export { expect }

/** The PIN every spec sets in the first run. */
export const DEFAULT_PIN = '2468'
/** What the climber calls her grown-ups in the specs (generic words, never real names). */
export const DEFAULT_NAMES = ['Mum', 'Dad']
/** Smallest finger target, in CSS px (half a pixel of slack for sub-pixel layout). */
export const MIN_TARGET_PX = 48
/** Time between taps: a quick human pace, and longer than the kit's 380 ms double-tap guard. */
export const TAP_GAP_MS = 400

// ---------------------------------------------------------------------------------------------
// Fixtures: console errors, page errors and off-site requests fail the test

interface Watch {
  problems: string[]
  warnings: string[]
}

function hostOf(url: string | undefined): string {
  return url ? new URL(url).host : 'localhost:4173'
}

/** Listen to every page in `context` (and its service worker requests, where WebKit reports them). */
function watch(context: BrowserContext, host: string): Watch {
  const w: Watch = { problems: [], warnings: [] }
  context.on('console', (msg) => {
    const where = msg.location()
    const at = where.url ? ` (${where.url.replace(/^.*\/upanyway\//, '')}:${where.lineNumber})` : ''
    if (msg.type() === 'error') w.problems.push(`console.error: ${msg.text()}${at}`)
    else if (msg.type() === 'warning') w.warnings.push(`console.warn: ${msg.text()}${at}`)
  })
  context.on('weberror', (err) => {
    const e = err.error()
    w.problems.push(`page error: ${e.message}${e.stack ? `\n${e.stack}` : ''}`)
  })
  context.on('request', (req) => {
    const u = new URL(req.url())
    if ((u.protocol === 'http:' || u.protocol === 'https:') && u.host !== host) w.problems.push(`off-site request: ${req.url()}`)
  })
  return w
}

function report(w: Watch, testInfo: TestInfo): void {
  for (const warning of w.warnings) testInfo.annotations.push({ type: 'console warning', description: warning })
  expect(w.problems, 'console errors, page errors or off-site requests').toEqual([])
}

/** The same options the project gives its own `context` (size, touch, scale, locale…). */
function contextOptions(testInfo: TestInfo): BrowserContextOptions {
  const u = testInfo.project.use
  return {
    baseURL: u.baseURL,
    viewport: u.viewport,
    deviceScaleFactor: u.deviceScaleFactor,
    isMobile: u.isMobile,
    hasTouch: u.hasTouch,
    locale: u.locale,
    reducedMotion: u.reducedMotion,
    serviceWorkers: u.serviceWorkers,
  }
}

export interface Fixtures {
  /** Problems seen so far in this test's own context. The test fails at the end if any are left. */
  problems: string[]
  /**
   * A page in a brand-new context (its own storage and service worker), watched like `page`.
   * Use it for a second "device" or a clean start inside one test.
   */
  freshPage: () => Promise<Page>
}

export const test = base.extend<Fixtures>({
  problems: [
    async ({ context, baseURL }, use, testInfo) => {
      const w = watch(context, hostOf(baseURL))
      await use(w.problems)
      report(w, testInfo)
    },
    { auto: true },
  ],
  freshPage: async ({ browser, baseURL }, use, testInfo) => {
    const opened: { context: BrowserContext; w: Watch }[] = []
    await use(async () => {
      const context = await newContext(browser, testInfo)
      opened.push({ context, w: watch(context, hostOf(baseURL)) })
      return context.newPage()
    })
    for (const o of opened) await o.context.close()
    for (const o of opened) report(o.w, testInfo)
  },
})

function newContext(browser: Browser, testInfo: TestInfo): Promise<BrowserContext> {
  return browser.newContext(contextOptions(testInfo))
}

// ---------------------------------------------------------------------------------------------
// Touch: counted taps and Pointer Event drags

const lastTouch = new WeakMap<Page, number>()
const touches = new WeakMap<Page, number>()

function countTouch(page: Page): void {
  touches.set(page, (touches.get(page) ?? 0) + 1)
}

/** How many touches (taps, field focuses, drags) this page has had since the last reset. */
export function tapCount(page: Page): number {
  return touches.get(page) ?? 0
}

export function resetTapCount(page: Page): void {
  touches.set(page, 0)
}

async function pace(page: Page, gapMs: number): Promise<void> {
  const since = Date.now() - (lastTouch.get(page) ?? 0)
  if (since < gapMs) await page.waitForTimeout(gapMs - since)
}

export interface TapOpts {
  /** Least time since the previous touch on this page. Default TAP_GAP_MS. */
  gapMs?: number
  /** false = don't add this tap to the count (e.g. a check that isn't part of the flow). */
  count?: boolean
}

/** A real touch tap (`locator.tap()`), at a human pace, counted. */
export async function tap(locator: Locator, opts: TapOpts = {}): Promise<void> {
  const page = locator.page()
  await pace(page, opts.gapMs ?? TAP_GAP_MS)
  await locator.tap()
  lastTouch.set(page, Date.now())
  if (opts.count !== false) countTouch(page)
}

export interface Point {
  x: number
  y: number
}

export interface DragOpts {
  /** Dispatch on this element instead of the one under the start point (e.g. 'canvas'). */
  selector?: string
  /** Hold still at the end of the drag before letting go. */
  holdMs?: number
  /** Least time since the previous touch on this page. Default TAP_GAP_MS. */
  gapMs?: number
  count?: boolean
}

/**
 * Touch-drag from `start` (client px) by `delta`, in `steps` moves one animation frame apart, then
 * let go. Fires `pointerdown`, `pointermove` × steps and `pointerup` (pointerType 'touch',
 * pointerId 1, isPrimary) on the element under the start point (or `opts.selector`). Events bubble,
 * so listeners on the element, the document or the window (as `src/game/input.ts` uses for
 * move/up) all hear them. Returns a short description of the element the drag was fired on.
 */
export async function dragFrom(page: Page, start: Point, delta: { dx: number; dy: number }, steps = 12, opts: DragOpts = {}): Promise<string> {
  await pace(page, opts.gapMs ?? TAP_GAP_MS)
  const hit = await page.evaluate(
    async ({ start, delta, steps, selector, holdMs }) => {
      const target = selector ? document.querySelector(selector) : document.elementFromPoint(start.x, start.y)
      if (!target) throw new Error(`dragFrom: nothing ${selector ? `matches ${selector}` : `at ${start.x},${start.y}`}`)
      const fire = (type: string, x: number, y: number, pressed: boolean) =>
        target.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            composed: true,
            pointerId: 1,
            pointerType: 'touch',
            isPrimary: true,
            clientX: x,
            clientY: y,
            screenX: x,
            screenY: y,
            button: type === 'pointermove' ? -1 : 0,
            buttons: pressed ? 1 : 0,
            pressure: pressed ? 0.5 : 0,
            width: 22,
            height: 22,
          }),
        )
      const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      fire('pointerdown', start.x, start.y, true)
      await frame()
      const n = Math.max(1, Math.round(steps))
      for (let i = 1; i <= n; i++) {
        fire('pointermove', start.x + (delta.dx * i) / n, start.y + (delta.dy * i) / n, true)
        await frame()
      }
      if (holdMs) await new Promise((resolve) => setTimeout(resolve, holdMs))
      fire('pointerup', start.x + delta.dx, start.y + delta.dy, false)
      const cls = typeof target.className === 'string' && target.className ? `.${target.className.split(/\s+/).join('.')}` : ''
      return `${target.tagName.toLowerCase()}${cls}`
    },
    { start, delta, steps, selector: opts.selector ?? null, holdMs: opts.holdMs ?? 0 },
  )
  lastTouch.set(page, Date.now())
  if (opts.count !== false) countTouch(page)
  return hit
}

/** Tap a PIN on the on-screen pad, then wait until the pad has taken it (cleared or gone). */
export async function enterPin(page: Page, pin: string): Promise<void> {
  for (const digit of pin) await tap(page.locator(`.pin__key[data-key="${digit}"]`), { gapMs: 120 })
  await expect(page.locator('.pin__dot.is-filled')).toHaveCount(0)
}

/** Tap a text field (counted, as a finger would) and type into it. */
export async function typeInto(field: Locator, text: string): Promise<void> {
  await tap(field)
  await field.fill(text)
}

// ---------------------------------------------------------------------------------------------
// Reading the app

/** The hash route without the query, e.g. "/setup/names". */
export function routeOf(page: Page): string {
  return (new URL(page.url()).hash.replace(/^#/, '').split('?')[0] || '/')
}

/** Wait for the hash route to be exactly `path`. */
export async function expectRoute(page: Page, path: string): Promise<void> {
  await expect.poll(() => routeOf(page), { message: `route should be ${path}` }).toBe(path)
}

/** A deep copy of the save, through the app's read-only debug hook. */
export async function readSave(page: Page): Promise<SaveData> {
  await page.waitForFunction(() => !!window.__upanyway)
  return page.evaluate(() => window.__upanyway!.store())
}

/**
 * Give entrance animations and transitions a moment to finish (loops are ignored), so sizes are
 * measured at rest. Best effort: after `timeoutMs` the checks go ahead anyway.
 */
export async function settle(page: Page, timeoutMs = 3_000): Promise<void> {
  await page
    .waitForFunction(
      () =>
        document.getAnimations().every((a) => {
          const end = Number(a.effect?.getComputedTiming().endTime ?? Infinity)
          return a.playState !== 'running' || !Number.isFinite(end)
        }),
      undefined,
      { timeout: timeoutMs, polling: 100 },
    )
    .catch(() => undefined)
}

// ---------------------------------------------------------------------------------------------
// Per-screen checks

/** The mute toggle is on screen, at least 48 × 48, and nothing covers it. */
export async function assertMuteToggle(page: Page, label = routeOf(page)): Promise<void> {
  const mute = page.locator('#mute-toggle')
  await expect(mute, `mute toggle on ${label}`).toBeVisible()
  const r = await mute.evaluate((el) => {
    const b = el.getBoundingClientRect()
    const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)
    return {
      w: b.width,
      h: b.height,
      inView: b.left >= 0 && b.top >= 0 && b.right <= window.innerWidth && b.bottom <= window.innerHeight,
      onTop: !!top && el.contains(top),
    }
  })
  expect(r.w, `mute toggle width on ${label}`).toBeGreaterThanOrEqual(MIN_TARGET_PX - 0.5)
  expect(r.h, `mute toggle height on ${label}`).toBeGreaterThanOrEqual(MIN_TARGET_PX - 0.5)
  expect(r.inView, `mute toggle inside the viewport on ${label}`).toBe(true)
  expect(r.onTop, `mute toggle not covered on ${label}`).toBe(true)
}

/** Every visible button-like control (and text field) is at least 48 × 48 CSS px. */
export async function assertTapTargets(page: Page, label = routeOf(page)): Promise<void> {
  const small = await page.evaluate((min) => {
    const out: string[] = []
    const sel =
      'button, [role="button"], [role="tab"], [role="switch"], [role="checkbox"], [role="radio"], [role="link"], a[href], input:not([type="hidden"]), select, textarea, summary'
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
      const b = el.getBoundingClientRect()
      // Zero-size (display: none, [hidden]) or visually hidden (sr-only) controls aren't targets.
      if (b.width <= 1 || b.height <= 1) continue
      const st = getComputedStyle(el)
      if (st.visibility === 'hidden' || st.pointerEvents === 'none') continue
      if (el.closest('[aria-hidden="true"], [inert]')) continue
      if (b.width >= min - 0.5 && b.height >= min - 0.5) continue
      const name = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 30)
      const cls = typeof el.className === 'string' ? el.className.split(/\s+/)[0] : ''
      out.push(`${el.tagName.toLowerCase()}${cls ? '.' + cls : ''} "${name}" ${Math.round(b.width)}×${Math.round(b.height)}`)
    }
    return out
  }, MIN_TARGET_PX)
  expect(small, `tap targets under ${MIN_TARGET_PX} px on ${label}`).toEqual([])
}

/** No sideways scrolling: not the page, and no screen clipping content that is too wide. */
export async function assertNoHorizontalScroll(page: Page, label = routeOf(page)): Promise<void> {
  const r = await page.evaluate(() => {
    const doc = document.scrollingElement || document.documentElement
    const screens = Array.from(document.querySelectorAll<HTMLElement>('.screen'))
      .filter((s) => s.scrollWidth > s.clientWidth + 1)
      .map((s) => `${s.className}: ${s.scrollWidth} > ${s.clientWidth}`)
    return { page: doc.scrollWidth, width: window.innerWidth, screens }
  })
  expect(r.page, `page scroll width on ${label}`).toBeLessThanOrEqual(r.width)
  expect(r.screens, `screens wider than the viewport on ${label}`).toEqual([])
}

/** Text fields use 16 px text or more, so Safari never zooms in when one is focused. */
export async function assertInputsNoZoom(page: Page, label = routeOf(page)): Promise<void> {
  const small = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('input:not([type="hidden"]), textarea, select'))
      .filter((el) => el.getBoundingClientRect().width > 1 && parseFloat(getComputedStyle(el).fontSize) < 16)
      .map((el) => `${el.tagName.toLowerCase()}[name=${el.getAttribute('name') ?? ''}] ${getComputedStyle(el).fontSize}`),
  )
  expect(small, `text fields under 16 px on ${label}`).toEqual([])
}

/** All the per-screen checks, once the screen has settled. */
export async function checkScreen(page: Page, label = routeOf(page)): Promise<void> {
  await settle(page)
  await assertMuteToggle(page, label)
  await assertTapTargets(page, label)
  await assertNoHorizontalScroll(page, label)
  await assertInputsNoZoom(page, label)
}

// ---------------------------------------------------------------------------------------------
// The first run

export const FIRST_RUN_STEPS = ['hello', 'names', 'handover', 'climber', 'goat', 'mountain', 'lesson', 'brave', 'cheer'] as const
export type FirstRunStep = (typeof FIRST_RUN_STEPS)[number]
/** A second state inside a step that is worth checking too. */
export type FirstRunPhase = 'confirm-pin' | 'name-goat'

export interface FirstRunOptions {
  pin?: string
  names?: string[]
  /** Open the app first (default true). false = the page is already on /setup/hello. */
  goto?: boolean
  /**
   * Runs once each step's screen is showing, before it is walked (phase undefined), and again at
   * each FirstRunPhase. A reload here is fine on arrival: the step is then walked from the start.
   */
  onScreen?: (step: FirstRunStep, phase?: FirstRunPhase) => Promise<void>
  /** Walks the lesson screen (default `walkLesson`). The real climb lesson swaps in drags here. */
  lesson?: (page: Page) => Promise<void>
}

export interface FirstRunResult {
  /** Touches from the PIN pad to "Let's climb!" (taps, field focuses, drags). */
  taps: number
  ms: number
}

/** The lesson screen: one Next per lesson step (leap, then the rope catching a fall), then on. */
export async function walkLesson(page: Page): Promise<void> {
  const next = page.getByRole('button', { name: 'Next', exact: true })
  const steps = page.locator('.lesson__step')
  const count = await steps.count()
  for (let i = 0; i < count; i++) {
    await expect(steps.nth(i)).toHaveClass(/is-current/)
    await tap(next)
  }
}

/**
 * Walk the whole first run as she (and a grown-up) would, ending on Pitch 1 (`/climb/p01`):
 * PIN + confirm, names, hand-over, the designer (one change), meet + name the goat (suggestion
 * kept), name the mountain (suggestion kept), the lesson, brave vs dangerous, who cheers her on.
 */
export async function completeFirstRun(page: Page, opts: FirstRunOptions = {}): Promise<FirstRunResult> {
  const pin = opts.pin ?? DEFAULT_PIN
  const names = opts.names ?? DEFAULT_NAMES
  const onScreen = opts.onScreen ?? (async () => undefined)
  const arrive = async (step: FirstRunStep) => {
    await expectRoute(page, `/setup/${step}`)
    await onScreen(step)
    await expectRoute(page, `/setup/${step}`)
  }
  const button = (name: string | RegExp) => page.getByRole('button', { name, exact: typeof name === 'string' })

  if (opts.goto !== false) await page.goto('./')
  const started = Date.now()
  resetTapCount(page)

  // Grown-up: a PIN, typed twice.
  await arrive('hello')
  const pinTitle = page.locator('.pin__title')
  const firstTitle = await pinTitle.textContent()
  await enterPin(page, pin)
  await expect(pinTitle).not.toHaveText(firstTitle ?? '')
  await onScreen('hello', 'confirm-pin')
  await enterPin(page, pin)

  // Grown-up: what she calls them.
  await arrive('names')
  for (let i = 0; i < names.length; i++) {
    const field = page.locator(`input[name="grownup-${i + 1}"]`)
    if (!(await field.count())) await tap(button('Add another'))
    await typeInto(field, names[i])
  }
  await tap(button('Done'))

  await arrive('handover')
  await tap(button(/the climber/))

  // Her climber: change one thing on the first tab, then keep it.
  await arrive('climber')
  const pick = await page.locator('.designer__opt[aria-pressed="false"]').first().getAttribute('aria-label')
  expect(pick, 'the designer offers another option').toBeTruthy()
  const option = page.locator(`.designer__opt[aria-label="${pick}"]`)
  await tap(option)
  await expect(option).toHaveAttribute('aria-pressed', 'true')
  await tap(button('Looks like me!'))

  // The goat wiggles out, says hello (three lines), then she keeps the suggested name.
  await arrive('goat')
  await expect(page.locator('.meet__title')).toHaveText(/Look who/, { timeout: 5_000 })
  const said = page.locator('.goat-bubble__text')
  await expect(said).not.toBeEmpty()
  const next = button('Next')
  while (await next.isVisible()) {
    const before = (await said.textContent()) ?? ''
    await tap(next)
    if (await next.isVisible()) await expect(said).not.toHaveText(before)
  }
  const goatField = page.locator('.meet__name input')
  await expect(goatField).toBeVisible()
  await onScreen('goat', 'name-goat')
  const goatName = (await goatField.inputValue()).trim()
  expect(goatName, 'the goat name comes pre-filled').not.toBe('')
  await tap(button(/its name/))

  // Her mountain: keep the suggestion.
  await arrive('mountain')
  const mountainName = (await page.locator('.name-picker input').inputValue()).trim()
  expect(mountainName, 'the mountain name comes pre-filled').not.toBe('')
  await tap(button('Next'))

  await arrive('lesson')
  await (opts.lesson ?? walkLesson)(page)

  await arrive('brave')
  await tap(button('Got it'))

  await arrive('cheer')
  await tap(button(/climb!/))
  await expectRoute(page, '/climb/p01')

  const ms = Date.now() - started
  const save = await readSave(page)
  expect(save.setup.complete).toBe(true)
  expect(save.parent.names).toEqual(names)
  expect(save.profile.goatName).toBe(goatName)
  expect(save.profile.mountainName).toBe(mountainName)
  expect(save.lessonDone).toBe(true)
  expect(save.flags.braveVsDangerousSeen).toBe(true)
  return { taps: tapCount(page), ms }
}
