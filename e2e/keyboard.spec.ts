/**
 * Text fields stay visible above the on-screen keyboard (brief: iPad first, and it must work on a
 * phone), on every project — plus a phone held sideways, where the keyboard leaves about 190 px.
 *
 * Playwright's WebKit has no on-screen keyboard, so the page gets a stand-in `visualViewport` (the
 * layout viewport stays put and the visual one shrinks, as on iOS) and `__kb(px)` "opens" a keyboard
 * that tall. For each field: focus it, open the keyboard, and the field must end up inside the part
 * of the screen left above the keyboard, with nothing (a sticky header or footer) on top of it.
 *
 * Fields: the grown-up's names (1–4), the mountain's name, a log's brave thing, worry, what
 * happened and what she learned, and a Spotted! letter.
 */
import type { Locator, Page } from '@playwright/test'
import { PARENT_COPY } from '../src/screens/parent/copy'
import { defaultSave, type SaveData } from '../src/storage/schema'
import {
  DEFAULT_PIN,
  buttonNamed,
  climberSave,
  expect,
  expectRoute,
  mainHeading,
  openGrownups,
  openParentPage,
  seedSave,
  tap,
  tapWeather,
  test,
  typeInto,
  withPin,
} from './helpers'

test.describe.configure({ timeout: 120_000 })

/** About how tall each device's keyboard is, in CSS px (without a hardware keyboard). */
const KEYBOARD: Record<string, number> = { 'ipad-portrait': 370, 'ipad-landscape': 410, phone: 336 }
/** A phone held sideways. */
const PHONE_SIDEWAYS = { width: 844, height: 390, keyboard: 200 }

declare global {
  interface Window {
    __kb?: (px: number) => void
  }
}

/** A stand-in visualViewport whose height drops by the keyboard's height when `__kb(px)` is called. */
async function fakeKeyboard(page: Page): Promise<void> {
  await page.addInitScript(() => {
    let kb = 0
    const events = new EventTarget()
    const vv = {
      get width() {
        return window.innerWidth
      },
      get height() {
        return window.innerHeight - kb
      },
      offsetTop: 0,
      offsetLeft: 0,
      get pageTop() {
        return window.scrollY
      },
      get pageLeft() {
        return window.scrollX
      },
      scale: 1,
      onresize: null,
      onscroll: null,
      addEventListener: (type: string, fn: EventListenerOrEventListenerObject, opts?: AddEventListenerOptions | boolean) =>
        events.addEventListener(type, fn, opts),
      removeEventListener: (type: string, fn: EventListenerOrEventListenerObject, opts?: EventListenerOptions | boolean) =>
        events.removeEventListener(type, fn, opts),
      dispatchEvent: (e: Event) => events.dispatchEvent(e),
    }
    Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => vv })
    window.__kb = (px: number) => {
      kb = px
      events.dispatchEvent(new Event('resize'))
    }
  })
}

/** Where the field is with the keyboard up: 'ok', or what is wrong. */
function fieldInView(field: Locator, kb: number): Promise<string> {
  return field.evaluate((el, px) => {
    const r = el.getBoundingClientRect()
    const bottom = window.innerHeight - px
    if (r.top < -0.5 || r.top + Math.min(r.height, 44) > bottom + 0.5) {
      return `field at ${Math.round(r.top)}–${Math.round(r.bottom)}, but only 0–${Math.round(bottom)} is above the keyboard`
    }
    const y = r.top + Math.min(r.height / 2, 22)
    const hit = document.elementFromPoint(r.left + Math.min(r.width / 2, 60), y)
    if (hit && (hit === el || el.contains(hit))) return 'ok'
    const what = hit ? `${hit.tagName.toLowerCase()}.${String(hit.className).split(' ').join('.')}` : 'nothing'
    return `covered by ${what} at y=${Math.round(y)}`
  }, kb)
}

/** Focus the field, open the keyboard, and check the field is in view; then close it again. */
async function checkField(page: Page, field: Locator, kb: number, label: string): Promise<void> {
  await field.focus()
  await expect(field).toBeFocused()
  await page.evaluate((px) => window.__kb?.(px), kb)
  await expect.poll(() => fieldInView(field, kb), { message: `${label}: keyboard ${kb}px`, timeout: 5_000 }).toBe('ok')
  await page.evaluate(() => window.__kb?.(0))
  await field.blur()
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('kb-open'))).toBe(false)
}

const fields = (page: Page) => page.locator('.screen input[type="text"]:visible, .screen textarea:visible')

type Stage = { name: string; save: () => SaveData; path: string; check: (page: Page, kb: number, where: string) => Promise<void> }

/** Each stage opens the app on its own device (a fresh context) with its own save. */
const STAGES: Stage[] = [
  {
    name: 'the grown-ups’ names',
    save: () => withPin(defaultSave()),
    path: './#/setup/names',
    check: async (page, kb, where) => {
      await expectRoute(page, '/setup/names')
      for (let i = 0; i < 4; i++) {
        const add = buttonNamed(page, 'Add another')
        if ((await fields(page).count()) >= 4 || !(await add.isVisible())) break
        await tap(add)
      }
      const names = fields(page)
      expect(await names.count()).toBe(4)
      for (let i = 0; i < 4; i++) await checkField(page, names.nth(i), kb, `${where}: grown-up ${i + 1}`)
    },
  },
  {
    name: 'the mountain’s name',
    save: () => {
      const d = withPin(defaultSave())
      d.setup = { parentDone: true, lookDone: true, complete: false }
      d.parent.names = ['Mum']
      d.profile.goatName = 'Pebble'
      return d
    },
    path: './#/setup/mountain',
    check: async (page, kb, where) => {
      await expectRoute(page, '/setup/mountain')
      await checkField(page, fields(page).first(), kb, `${where}: the mountain’s name`)
    },
  },
  {
    name: 'a brave thing',
    save: () => withPin(climberSave()),
    path: './#/log',
    check: async (page, kb, where) => {
      const q = mainHeading(page)
      await expect(q).toHaveText('What’s the brave thing?')
      const what = page.getByRole('textbox', { name: 'The brave thing' })
      await checkField(page, what, kb, `${where}: the brave thing`)
      await typeInto(what, 'Ask the lifeguard a question')
      await tap(buttonNamed(page, 'Next'))
      await expect(q).toHaveText('How scary does it look?')
      await tapWeather(page.locator('.log-fear'), 6)
      await expect(q).toHaveText('What are you worried might happen?')
      await checkField(page, fields(page).first(), kb, `${where}: the worry`)
      await tap(buttonNamed(page, 'Skip'))
      await expect(q).toHaveText('Have you done it yet?')
      await tap(page.getByRole('button', { name: /^I already did it!/ }))
      await expect(q).toHaveText('How scary was it really?')
      await tapWeather(page.locator('.log-fear'), 2)
      await expect(q).toHaveText('What actually happened?')
      await checkField(page, fields(page).first(), kb, `${where}: what happened`)
      await tap(page.locator('.log-chips button').first())
      await tap(buttonNamed(page, 'Next'))
      await expect(q).toHaveText('How did it go?')
      await tap(page.getByRole('button', { name: 'Wobbly, but I did it' }))
      await expect(q).toHaveText('What did I learn?')
      await checkField(page, fields(page).first(), kb, `${where}: what she learned`)
    },
  },
  {
    name: 'a Spotted! letter',
    save: () => withPin(climberSave()),
    path: './#/camp',
    check: async (page, kb, where) => {
      await expectRoute(page, '/camp')
      await openGrownups(page, DEFAULT_PIN)
      await openParentPage(page, PARENT_COPY.home.pages.letter.title, '/parent/letter')
      const letter = fields(page)
      const n = await letter.count()
      // The note itself (who it's from is a picker, not a text field).
      expect(n).toBeGreaterThanOrEqual(1)
      for (let i = 0; i < n; i++) await checkField(page, letter.nth(i), kb, `${where}: letter field ${i + 1}`)
    },
  },
]

async function walkStages(freshPage: () => Promise<Page>, kb: number, where: string, size?: { width: number; height: number }): Promise<void> {
  for (const stage of STAGES) {
    const page = await freshPage()
    if (size) await page.setViewportSize(size)
    await fakeKeyboard(page)
    await seedSave(page, stage.save())
    await page.goto(stage.path)
    await stage.check(page, kb, `${where}, ${stage.name}`)
    await page.context().close()
  }
}

test('text fields stay in view above the keyboard', async ({ freshPage }, testInfo) => {
  const kb = KEYBOARD[testInfo.project.name]
  expect(kb, `a keyboard height for ${testInfo.project.name}`).toBeDefined()
  await walkStages(freshPage, kb, testInfo.project.name)
})

test('text fields stay in view above the keyboard on a phone held sideways', async ({ freshPage }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'phone only')
  const { keyboard, ...size } = PHONE_SIDEWAYS
  await walkStages(freshPage, keyboard, 'phone sideways', size)
})
