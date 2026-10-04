/**
 * Shared end-to-end helpers: a `test` that fails on any console error, page error or off-site
 * request; human-paced taps that are counted; touch drags as Pointer Events; per-screen checks
 * (mute toggle, tap targets, sideways scroll, input font size); climbing by touch (one leap as a
 * drag, answering the climb's cards, replaying a pitch's saved solution); a walker for the first
 * run, lesson included; and seeded saves (a climber past the first run, stones, a run at a camp).
 */
import { readFileSync } from 'node:fs'
import { test as base, expect, type Browser, type BrowserContext, type BrowserContextOptions, type Locator, type Page, type TestInfo } from '@playwright/test'
import type { ClimbSnapshot } from '../src/debug'
import { dayKey } from '../src/model/clock'
import { makePinRecord } from '../src/model/pin'
import { KEYS } from '../src/storage/keys'
import { defaultPitchProgress, defaultSave, type PitchRun, type SaveData } from '../src/storage/schema'

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

/**
 * Runtime exceptions the app catches and reports as a console warning (so one broken screen teardown
 * or sound never takes the app down): in a test they are failures like any console error.
 */
const CAUGHT_FAILURE = /^\[upanyway\] (unmount|cleanup|sfx|ambient|audio listener|save|backup|download) failed/
/** Caught failures that are expected where they happen (none of these is a bug in the app). */
const EXPECTED_WARNINGS: RegExp[] = [
  // The share sheet was dismissed (AbortError) or isn't allowed here.
  /^\[upanyway\] share failed/,
  // WebKit without navigator.storage.persist().
  /^\[upanyway\] persist\(\) failed/,
]

/** Listen to every page in `context` (and its service worker requests, where WebKit reports them). */
function watch(context: BrowserContext, host: string): Watch {
  const w: Watch = { problems: [], warnings: [] }
  context.on('console', (msg) => {
    const where = msg.location()
    const at = where.url ? ` (${where.url.replace(/^.*\/upanyway\//, '')}:${where.lineNumber})` : ''
    const text = msg.text()
    if (msg.type() === 'error') w.problems.push(`console.error: ${text}${at}`)
    else if (msg.type() === 'warning') {
      if (CAUGHT_FAILURE.test(text) && !EXPECTED_WARNINGS.some((re) => re.test(text))) w.problems.push(`caught failure: ${text}${at}`)
      else w.warnings.push(`console.warn: ${text}${at}`)
    }
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
// Climbing: leaps as touch drags, the climb's cards, saved solutions

/** One step of a saved solution, as the level validator wrote it. */
export interface SolutionStep {
  from: string
  to: string
  /** Launch angle in degrees: world y-up, 0 = right, 90 = straight up. */
  angle: number
  /** 0–1 of full power. */
  power: number
  launchTime: number
}

export interface Solution {
  levelId: string
  steps: SolutionStep[]
}

/** A pitch's (or the lesson's) saved solution: src/game/levels/solutions/<levelId>.json. */
export function loadSolution(levelId: string): Solution {
  const file = new URL(`../src/game/levels/solutions/${levelId}.json`, import.meta.url)
  return JSON.parse(readFileSync(file, 'utf8')) as Solution
}

/** The climb (or lesson) on screen right now, from the debug hook; null when none is mounted. */
export async function climbState(page: Page): Promise<ClimbSnapshot | null> {
  return page.evaluate(() => window.__upanyway?.climb.state() ?? null)
}

/** The climb's open blocking card: 'forecast', 'reveal' (on its way to 'really'), 'really', 'betamap', 'sunset' or null. */
export async function pendingPrompt(page: Page): Promise<string | null> {
  return page.evaluate(() => window.__upanyway?.climb.pendingPrompt() ?? null)
}

/** Why the climb has stopped moving (see `waitClimbPause`). */
export type ClimbPause = 'ready' | 'sent' | 'prompt'

/**
 * Wait until the climb is at rest: she can leap ('ready': standing or hanging, not frozen, no card
 * open), the pitch is sent ('sent'), or a blocking card is open ('prompt').
 */
export async function waitClimbPause(page: Page, timeout = 30_000): Promise<ClimbPause> {
  const handle = await page.waitForFunction(
    () => {
      const c = window.__upanyway?.climb
      const s = c?.state()
      if (!c || !s) return null
      if (c.pendingPrompt() !== null) return 'prompt'
      if (s.phase === 'sent') return 'sent'
      return s.phase === 'ready' && !s.frozen ? 'ready' : null
    },
    undefined,
    { timeout, polling: 50 },
  )
  return (await handle.jsonValue()) as ClimbPause
}

/** Where a leap ends: standing (or hanging) again, or at the top. Cards opening on arrival don't matter. */
async function waitLanded(page: Page, timeout = 15_000): Promise<ClimbSnapshot> {
  await page.waitForFunction(
    () => {
      const s = window.__upanyway?.climb.state()
      return !!s && (s.phase === 'ready' || s.phase === 'sent')
    },
    undefined,
    { timeout, polling: 50 },
  )
  return (await climbState(page)) as ClimbSnapshot
}

/** The climb canvas (the lesson's too). */
export const CLIMB_CANVAS = '.climb-stage__canvas'

/**
 * One leap as a finger would do it: press on the canvas just outside her hit radius, on the side the
 * drag goes, pull back power × maxDragPx() CSS px opposite the launch direction (8 moves, a frame
 * apart), let go. The touch goes to whatever is under the finger, and that must be the canvas
 * (nothing may sit over her). Waits until she has left the ground; fails if the drag didn't launch.
 */
export async function leapDrag(page: Page, angle: number, power: number, opts: { count?: boolean } = {}): Promise<void> {
  const g = await page.evaluate(() => {
    const c = window.__upanyway?.climb
    return c ? { at: c.climberClient(), maxDrag: c.maxDragPx() } : null
  })
  if (!g?.at) throw new Error('leapDrag: no climb on screen')
  const a = (angle * Math.PI) / 180
  // Screen y is down: the drag goes opposite the launch.
  const ux = -Math.cos(a)
  const uy = Math.sin(a)
  const start = { x: g.at.x + ux * (g.at.r + 6), y: g.at.y + uy * (g.at.r + 6) }
  const len = power * g.maxDrag
  const hit = await dragFrom(page, start, { dx: ux * len, dy: uy * len }, 8, { count: opts.count })
  expect(hit, `the touch at ${Math.round(start.x)},${Math.round(start.y)} lands on the climb canvas`).toContain(CLIMB_CANVAS)
  // The engine launches on its next fixed step.
  await page
    .waitForFunction(() => window.__upanyway?.climb.state()?.phase !== 'ready', undefined, { timeout: 3_000, polling: 'raf' })
    .catch(() => {
      throw new Error(`leapDrag(${angle}°, power ${power}): the drag didn't launch her`)
    })
}

/** Answers for the Looks Scary cards. */
export interface PromptAnswers {
  /** "How scary does it look?" (default 7). */
  forecast?: number
  /** "How scary was it really?" (default 2). */
  really?: number
}

/**
 * Answer the climb's open Looks Scary card the way she would: wait out the reveal, one tap on the
 * weather scale, then "Keep climbing" under the comparison. Returns the card's id (null if none was
 * open). The Beta Map and the sunset card end the climb and are left alone.
 *
 * `forecastGiven`: the forecast she answered earlier in this climb, if any. Then "How scary was it
 * really?" MUST be followed by the comparison card ("Forecast 7. Really 2."); without it the
 * comparison is optional (a forecast from an earlier climb may or may not be on record).
 */
export async function answerPrompt(page: Page, answers: PromptAnswers = {}, forecastGiven: number | null = null): Promise<string | null> {
  const id = await pendingPrompt(page)
  if (id === 'reveal') {
    // The sparkle and the goat's line come first; then "How scary was it really?".
    await expect.poll(() => pendingPrompt(page), { message: 'the reveal moves on', timeout: 10_000 }).not.toBe('reveal')
    return id
  }
  if (id !== 'forecast' && id !== 'really') return id
  const n = id === 'forecast' ? (answers.forecast ?? 7) : (answers.really ?? 2)
  await tap(page.locator('.climb-prompt--fear').getByRole('radio', { name: new RegExp(`^${n},`) }))
  if (id === 'really') {
    // "Forecast 7. Really 2." and Keep climbing (no comparison if there's no forecast on record).
    const go = page.getByRole('button', { name: 'Keep climbing', exact: true })
    const compare = page.locator('.climb-prompt--compare')
    if (forecastGiven !== null) {
      await expect(compare, 'the comparison card after a forecast this climb').toBeVisible()
      await expect(compare).toContainText(`Forecast ${forecastGiven}. Really ${n}.`)
      await tap(go)
    } else {
      await expect.poll(async () => (await go.isVisible()) || (await pendingPrompt(page)) === null, { message: 'the comparison card' }).toBe(true)
      if (await go.isVisible()) {
        await expect(compare).toContainText(`Really ${n}.`)
        await tap(go)
      }
    }
  }
  await expect.poll(() => pendingPrompt(page), { message: `the ${id} card closes` }).toBeNull()
  return id
}

/**
 * Wait until she stands ready again, answering any Looks Scary cards on the way (the comparison is
 * required after a forecast answered in this climb — see `log`). Returns where she stands.
 */
export async function answerUntilReady(page: Page, log: ClimbLog, answers: PromptAnswers = {}, label = 'climb'): Promise<ClimbSnapshot> {
  return readyToLeap(page, answers, label, log)
}

/** What a climb has asked so far (replaySolutions keeps one per climb; pass your own to carry on). */
export interface ClimbLog {
  /** The Fear Forecast she answered in this climb (null: none asked yet). */
  forecastGiven: number | null
}

/** Wait until she can leap, answering any Looks Scary card on the way; anything else is a failure. */
async function readyToLeap(page: Page, answers: PromptAnswers, label: string, log: ClimbLog): Promise<ClimbSnapshot> {
  for (;;) {
    const pause = await waitClimbPause(page)
    if (pause === 'ready') return (await climbState(page)) as ClimbSnapshot
    const id = await pendingPrompt(page)
    if (pause === 'sent' || (id !== 'forecast' && id !== 'reveal' && id !== 'really')) {
      throw new Error(`${label}: expected to stand ready, but the climb is ${pause === 'sent' ? 'sent' : `showing "${id}"`}`)
    }
    const answered = await answerPrompt(page, answers, log.forecastGiven)
    if (answered === 'forecast') log.forecastGiven = answers.forecast ?? 7
  }
}

/**
 * Climb a pitch by replaying its saved solution, step by step, as touch drags — the leaps the level
 * validator proved. Before each leap she must be ready on the step's `from`, and after it she must be
 * on its `to` (element ids from the debug hook, never pixels). Looks Scary cards on the way are
 * answered. Every leap is let go straight away, so pitches whose steps wait for the wind's beat need
 * more than this (p01–p03 have no wind). `stopAt`: stop once she stands ready there (cards on
 * arrival answered). `log` records what was asked. Returns the number of leaps.
 */
export async function replaySolutions(
  page: Page,
  levelId: string,
  answers: PromptAnswers = {},
  opts: { stopAt?: string; log?: ClimbLog } = {},
): Promise<number> {
  const { steps } = loadSolution(levelId)
  expect(steps.length, `a saved solution for ${levelId}`).toBeGreaterThan(0)
  await expect.poll(() => page.evaluate(() => window.__upanyway?.climb.levelId() ?? null), { message: `climbing ${levelId}` }).toBe(levelId)
  const log: ClimbLog = opts.log ?? { forecastGiven: null }
  for (const [i, step] of steps.entries()) {
    const label = `${levelId} leap ${i + 1}/${steps.length} (${step.from} → ${step.to})`
    const before = await readyToLeap(page, answers, label, log)
    if (step.from === opts.stopAt) return i
    expect(before.elementId, `${label}: she starts on ${step.from}`).toBe(step.from)
    await leapDrag(page, step.angle, step.power)
    const after = await waitLanded(page)
    expect(after.elementId, `${label}: she lands on ${step.to} (phase ${after.phase})`).toBe(step.to)
  }
  return steps.length
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
  /** Walks the lesson screen (default `walkLesson`: two drags and a tap). */
  lesson?: (page: Page) => Promise<void>
}

export interface FirstRunResult {
  /** Touches from the PIN pad to "Let's climb!" (taps, field focuses, drags). */
  taps: number
  ms: number
}

/** Fall practice: up and off the far end of the ledge (nothing is reachable from there). */
export const LESSON_FALL = { angle: 45, power: 0.55 } as const

/**
 * The real lesson on Practice Rock, by touch: leap onto the higher ledge with the lesson's saved
 * solution, leap off it (the rope catches her: step 2), then Next beside the "New flop unlocked!"
 * card. Two drags and a tap.
 */
export async function walkLesson(page: Page): Promise<void> {
  const steps = page.locator('.lesson__step')
  const next = page.getByRole('button', { name: 'Next', exact: true })
  await expect.poll(() => page.evaluate(() => window.__upanyway?.climb.levelId() ?? null), { message: 'the lesson climb is up' }).toBe('lesson')
  await expect(steps.nth(0)).toHaveClass(/is-current/)
  await expect(next).toBeHidden()

  // 1. Leap.
  const [leap] = loadSolution('lesson').steps
  expect(await waitClimbPause(page), 'ready for the first leap').toBe('ready')
  expect((await climbState(page))?.elementId).toBe(leap.from)
  await leapDrag(page, leap.angle, leap.power)
  expect((await waitLanded(page)).elementId, 'the first leap lands on the ledge').toBe(leap.to)
  await expect(steps.nth(1)).toHaveClass(/is-current/)
  await expect(steps.nth(0)).toHaveClass(/is-done/)

  // 2. Fall: the rope catches her and she's back on the ledge.
  expect(await waitClimbPause(page), 'ready for fall practice').toBe('ready')
  await leapDrag(page, LESSON_FALL.angle, LESSON_FALL.power)
  await expect(steps.nth(1)).toHaveClass(/is-done/, { timeout: 15_000 })
  await expect(page.locator('.flop-panel')).toContainText('New flop unlocked!')
  await expect(page.locator('.flop-panel')).toContainText(/whipper/i)
  await tap(next)
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

// ---------------------------------------------------------------------------------------------
// Seeded saves: start a spec somewhere in the middle of the game

/**
 * A save that has finished the first run (setup, lesson, words met) and climbed nothing yet. No
 * daily limit, so no sunset interrupts a spec. Change it, then `seedSave` it.
 */
export function climberSave(now = new Date()): SaveData {
  const d = defaultSave(now)
  d.setup = { parentDone: true, lookDone: true, complete: true }
  d.parent.names = [...DEFAULT_NAMES]
  d.parent.dailyClimbMinutes = 0
  d.profile.goatName = 'Pebble'
  d.profile.mountainName = 'Mount Maybe'
  d.lessonDone = true
  d.flags = { ropeExplained: true, firstCampVisit: true, braveVsDangerousSeen: true, persistGranted: null }
  d.glossarySeen = ['pitch', 'whipper', 'beta', 'send', 'cairn', 'chalk', 'hold']
  return d
}

/**
 * Add `n` done brave things with their stones placed (three a day, on past days): enough stones for
 * pitch n + 2, which opens once the pitch below it is sent too (see `sendPitches`).
 */
export function addStones(d: SaveData, n: number, now = new Date()): void {
  for (let i = 0; i < n; i++) {
    const day = new Date(now.getTime() - (Math.floor(i / 3) + 1) * 86_400_000)
    const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
    d.brave.push({
      id: `seed-${i}`,
      createdAt: day.toISOString(),
      text: `Brave thing ${i + 1}`,
      oops: false,
      forecast: 6,
      status: 'done',
      notTodayCount: 0,
      doneAt: day.toISOString(),
      really: 3,
      whatHappened: 'It went fine.',
      outcome: 'wobbly',
      stoneDay: key,
    })
  }
}

/**
 * Pitches 1…`n` sent once by day (one attempt each), so pitch n + 1 opens as soon as the cairn holds
 * enough stones (Decision 5: a pitch needs its stones AND the pitch below sent).
 */
export function sendPitches(d: SaveData, n: number, now = new Date()): void {
  for (let i = 1; i <= n; i++) {
    const id = `p${String(i).padStart(2, '0')}` as keyof SaveData['pitches']
    d.pitches[id] = { ...defaultPitchProgress(), ...d.pitches[id], sends: 1, totalAttempts: 1, firstSentAt: now.toISOString() }
  }
}

/** A run in progress that resumes at `campId` (its index in the level's route). */
export function runAt(campId: string, routeIndex: number, night = false, now = new Date()): PitchRun {
  return {
    startedAt: now.toISOString(),
    lastCampId: campId,
    lastCampRouteIndex: routeIndex,
    whippers: 0,
    failedArcs: [],
    routeArcs: [],
    routePath: [campId],
    fallsBySpot: {},
    lastMissBySpot: {},
    highestRouteIndex: routeIndex,
    night,
  }
}

/** A pitch record with a day (and/or night) run waiting at a camp. */
export function pitchWithRuns(day: PitchRun | null, night: PitchRun | null = null): ReturnType<typeof defaultPitchProgress> {
  return { ...defaultPitchProgress(), run: day, nightRun: night }
}

/**
 * Put `save` in place before the app boots (the first load of a fresh context). Later reloads keep
 * whatever the app has saved since.
 */
export async function seedSave(page: Page, save: SaveData): Promise<void> {
  await page.addInitScript(
    ({ key, json }) => {
      try {
        if (!localStorage.getItem(key)) localStorage.setItem(key, json)
      } catch {
        // Storage refused: the app starts fresh and the spec's own checks will say so.
      }
    },
    { key: KEYS.save, json: JSON.stringify(save) },
  )
}

/** The Looks Scary set-piece on the climb right now ('looming' | 'revealing' | 'revealed', or null). */
export async function scaryPhase(page: Page): Promise<string | null> {
  return page.evaluate(() => window.__upanyway?.climb.scaryPhase() ?? null)
}

// ---------------------------------------------------------------------------------------------
// Camp, the kid's screens and the grown-ups' pages

/** Give a seeded save the specs' PIN (hashed, as the first run stores it). Returns the save. */
export function withPin(d: SaveData, pin = DEFAULT_PIN): SaveData {
  Object.assign(d.parent, makePinRecord(pin))
  return d
}

/** Today's local day key ("2026-10-03"), as the app writes `stoneDay`. */
export function todayKey(now = new Date()): string {
  return dayKey(now)
}

/** A button by its exact accessible name (or a pattern). */
export function buttonNamed(scope: Page | Locator, name: string | RegExp): Locator {
  return scope.getByRole('button', { name, exact: typeof name === 'string' })
}

/** The screen's main heading (`h1`), e.g. "Hall of Flops" or a log question. */
export function mainHeading(page: Page): Locator {
  return page.locator('main.screen h1, .screen h1').first()
}

/** Tap weather `n` (0–10) on the fear scale inside `scope` (its radios are named "7, Stormy"). */
export async function tapWeather(scope: Page | Locator, n: number): Promise<void> {
  await tap(scope.getByRole('radio', { name: new RegExp(`^${n},`) }))
}

/** Open camp (a seeded climber starts here) and wait for its tiles. */
export async function gotoCamp(page: Page): Promise<void> {
  await page.goto('./#/camp')
  await expectRoute(page, '/camp')
  await expect(page.locator('.camp__tiles')).toBeVisible()
}

/** The tent button on a climb, back to camp. */
export async function climbToCamp(page: Page): Promise<void> {
  await tap(page.locator('.climb-hud__camp'))
  await expectRoute(page, '/camp')
  await expect(page.locator('.camp__tiles')).toBeVisible()
}

/** From camp: the small Grown-ups button, the PIN door, then the grown-ups' home. */
export async function openGrownups(page: Page, pin = DEFAULT_PIN): Promise<void> {
  await tap(buttonNamed(page.locator('.camp__grownups'), 'Grown-ups'))
  await expectRoute(page, '/parent')
  await enterPin(page, pin)
  await expectRoute(page, '/parent/home')
  await expect(mainHeading(page)).toHaveText('Grown-ups')
}

/** On the grown-ups' home: open one of its page cards by title. */
export async function openParentPage(page: Page, title: string, path: string): Promise<void> {
  await tap(page.locator('.pp-home__card').filter({ has: page.locator('.card__title', { hasText: title }) }))
  await expectRoute(page, path)
}

export interface QuickLog {
  text: string
  forecast?: number
  really?: number
  /** The outcome card's words (default "Wobbly, but I did it"). */
  outcome?: string
}

/**
 * On the log flow's first question (#/log): log a brave thing she already did, the quick way — type
 * it, a forecast, skip the worry, "I already did it!", how scary it really was, the first "what
 * happened" chip, an outcome, no "what I learned", "Add my stone". Ends on the cairn.
 */
export async function logDoneBraveThing(page: Page, log: QuickLog): Promise<void> {
  const q = mainHeading(page)
  await expect(q).toHaveText('What’s the brave thing?')
  await typeInto(page.getByRole('textbox', { name: 'The brave thing' }), log.text)
  await tap(buttonNamed(page, 'Next'))
  await expect(q).toHaveText('How scary does it look?')
  await tapWeather(page.locator('.log-fear'), log.forecast ?? 6)
  await expect(q).toHaveText('What are you worried might happen?')
  await tap(buttonNamed(page, 'Skip'))
  await expect(q).toHaveText('Have you done it yet?')
  await tap(page.getByRole('button', { name: /^I already did it!/ }))
  await expect(q).toHaveText('How scary was it really?')
  await tapWeather(page.locator('.log-fear'), log.really ?? 2)
  await expect(q).toHaveText('What actually happened?')
  await tap(page.locator('.log-chips button').first())
  await tap(buttonNamed(page, 'Next'))
  await expect(q).toHaveText('How did it go?')
  await tap(page.getByRole('button', { name: log.outcome ?? 'Wobbly, but I did it' }))
  await expect(q).toHaveText('What did I learn?')
  await tap(buttonNamed(page, 'Add my stone'))
  await expectRoute(page, '/cairn')
}

/**
 * A climber well into the game, with something on every camp screen: a PIN, `stones` done brave
 * things with their stones (default 5), a framed flop with what she learned, an Oops Mission, a plan
 * and its smaller step (after a "Not today"), a read letter with its stone and a sealed one, a
 * Grown-ups' Wing flop, a custom idea card, fall poses, badges and the first pitches sent.
 * `summit`: after Sky Lake (finale seen, every pitch sent), so the stones also brought treasures.
 */
export function richSave(opts: { stones?: number; summit?: boolean; now?: Date } = {}): SaveData {
  const now = opts.now ?? new Date()
  const d = withPin(climberSave(now))
  const at = (days: number, hours = 0) => new Date(now.getTime() - days * 86_400_000 - hours * 3_600_000)
  const iso = (days: number, hours = 0) => at(days, hours).toISOString()
  addStones(d, opts.stones ?? (opts.summit ? 20 : 5), now)
  d.brave.push(
    {
      id: 'flop-1',
      createdAt: iso(9),
      text: 'Read my story out loud in class',
      oops: false,
      forecast: 9,
      status: 'done',
      notTodayCount: 0,
      doneAt: iso(9),
      really: 4,
      whatHappened: 'I lost my place twice',
      outcome: 'flopped',
      learned: 'People were kinder than I expected',
      stoneDay: dayKey(at(9)),
    },
    {
      id: 'oops-1',
      createdAt: iso(10),
      text: 'Wear odd socks for a whole day',
      ideaId: 'oops-odd-socks',
      oops: true,
      forecast: 5,
      status: 'done',
      notTodayCount: 0,
      doneAt: iso(10),
      really: 1,
      whatHappened: 'Nobody minded at all',
      outcome: 'nailed',
      stoneDay: dayKey(at(10)),
    },
    {
      id: 'plan-1',
      createdAt: iso(3),
      text: 'Jump into the deep end at swimming lessons',
      ideaId: 'school-deep-end',
      oops: false,
      forecast: 8,
      worry: 'I swallow water',
      status: 'planned',
      notTodayCount: 1,
      stoneDay: null,
    },
    {
      id: 'plan-2',
      createdAt: iso(2),
      text: 'Sit on the edge of the deep end first',
      oops: false,
      forecast: 4,
      status: 'planned',
      notTodayCount: 0,
      smallerOf: 'plan-1',
      afterNotToday: true,
      stoneDay: null,
    },
  )
  d.letters.push(
    {
      id: 'letter-1',
      createdAt: iso(4, 2),
      from: DEFAULT_NAMES[0],
      text: 'I saw you ask for help when you were stuck. That took guts.',
      openedAt: iso(4),
      stoneDay: dayKey(at(4)),
    },
    { id: 'letter-2', createdAt: iso(0, 1), from: DEFAULT_NAMES[1], text: 'I saw you try the high board, wobbly legs and all.', stoneDay: null },
  )
  d.grownupFlops.push({
    id: 'gf-1',
    createdAt: iso(6),
    who: DEFAULT_NAMES[1],
    what: 'I tried a new recipe for guests and it came out like soup.',
    learned: 'Practise new things on a quiet night.',
  })
  d.customIdeas.push({ id: 'idea-1', createdAt: iso(5), text: 'Order a new ice-cream flavour', oops: false })
  d.poses = { starfish: { firstAt: iso(12), count: 3 }, pancake: { firstAt: iso(6), count: 1 } }
  d.stats = { whippers: 9, sends: 3, bigLeapsTried: 1, betaAsked: 1 }
  d.badges = { 'first-whipper': iso(12), 'attempts-10': iso(6), 'still-here': iso(9), oops: iso(10), 'smaller-step': iso(2) }
  const sent = opts.summit ? 16 : 3
  for (let i = 1; i <= sent; i++) {
    const id = `p${String(i).padStart(2, '0')}` as keyof SaveData['pitches']
    d.pitches[id] = { ...defaultPitchProgress(), sends: 1, totalAttempts: 2, firstSentAt: iso(12) }
  }
  if (opts.summit) d.summit = { reached: true, at: iso(30), finaleSeen: true }
  return d
}
