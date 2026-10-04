/**
 * Helpers shared by screens: store shortcuts, first-run progress (where to resume after a reload),
 * the grown-ups' unlock, glossary bookkeeping, a few device checks, and small canvas helpers
 * (DPR-capped sizing, fitting a drawing into a box, a self-stopping animation loop).
 */
import type { GlossaryWord } from '../content/glossary'
import { drawPackWithGoat } from '../game/art/climber'
import { drawGoat, type GoatMood as ArtGoatMood } from '../game/art/goat'
import { TUNING } from '../game/tuning'
import { hasPin } from '../model/pin'
import { hasRecoveryCode } from '../model/recovery'
import type { ClimberLook, SaveData } from '../storage/schema'
import { requestPersistence, store } from '../storage/store'
import { h, prefersReducedMotion } from '../ui/dom'
import type { GoatAvatar, GoatMood } from '../ui/goatBubble'

export const now = (): Date => new Date()

/** The live save (read-only outside update()). */
export const save = (): SaveData => store().data

export function update(fn: (d: SaveData) => void): void {
  store().update(fn)
}

// ---------------------------------------------------------------------------------------------
// First run

/** Kid steps of the first run, in order (the grown-up steps 'hello', 'recovery' and 'names' come first). */
export const KID_STEPS = ['handover', 'climber', 'goat', 'mountain', 'lesson', 'brave', 'cheer'] as const
export type KidStep = (typeof KID_STEPS)[number]
export type SetupStep = 'hello' | 'recovery' | 'names' | KidStep

/**
 * The first-run step to show now, derived from what has been saved so far, so a reload resumes
 * in the right place: each step saves its answer before moving on.
 */
export function setupStep(d: SaveData): SetupStep {
  if (!hasPin(d.parent)) return 'hello'
  // The recovery code is saved on "I've written it down"; until then each visit shows a new one. A save
  // from before recovery codes that is already past the grown-ups' part carries on with her steps (the
  // grown-ups' home invites them to make one later).
  if (!d.setup.parentDone) return hasRecoveryCode(d.parent) ? 'names' : 'recovery'
  if (!d.profile.goatName) return d.setup.lookDone ? 'goat' : 'handover'
  if (!d.profile.mountainName) return 'mountain'
  if (!d.lessonDone) return 'lesson'
  if (!d.flags.braveVsDangerousSeen) return 'brave'
  return 'cheer'
}

export function setupPath(d: SaveData): string {
  return `/setup/${setupStep(d)}`
}

// ---------------------------------------------------------------------------------------------
// Grown-ups' unlock (in memory only: a reload or leaving the parent pages locks it again)

let parentUnlocked = false

export function unlockParent(): void {
  parentUnlocked = true
}

export function lockParent(): void {
  parentUnlocked = false
}

export function isParentUnlocked(): boolean {
  return parentUnlocked
}

// ---------------------------------------------------------------------------------------------
// Glossary + persistence

/** Record that a climbing word has been introduced (term()'s onSeen may fire twice: de-duped). */
export function markWordSeen(word: GlossaryWord): void {
  if (save().glossarySeen.includes(word)) return
  update((d) => {
    if (!d.glossarySeen.includes(word)) d.glossarySeen.push(word)
  })
}

let persistAsked = false

/**
 * Ask the browser to keep our storage (navigator.storage.persist), once, and record the answer in
 * flags.persistGranted. Unsupported browsers leave the flag null.
 */
export function requestPersistenceOnce(): void {
  if (persistAsked || save().flags.persistGranted !== null) return
  persistAsked = true
  const supported = typeof navigator !== 'undefined' && !!navigator.storage && typeof navigator.storage.persist === 'function'
  if (!supported) return
  void requestPersistence().then((granted) => {
    update((d) => {
      d.flags.persistGranted = granted
    })
  })
}

// ---------------------------------------------------------------------------------------------
// Device

/** Running from the Home Screen icon (iOS `navigator.standalone`, or display-mode standalone). */
export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean }
  if (nav.standalone === true) return true
  return typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches
}

/** "iPad" or "phone", for copy like "Hand the iPad to your climber". */
export function deviceWord(): 'iPad' | 'phone' {
  const ua = navigator.userAgent
  if (/iPhone|iPod/.test(ua) || /Android.+Mobile/.test(ua)) return 'phone'
  const short = Math.min(window.screen?.width || window.innerWidth, window.screen?.height || window.innerHeight)
  return short < 600 ? 'phone' : 'iPad'
}

// ---------------------------------------------------------------------------------------------
// Canvas helpers

export interface Box {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface CanvasSize {
  w: number
  h: number
  dpr: number
}

/** Size the backing store to the canvas's CSS size × DPR (capped). Null while it has no size. */
export function sizeCanvas(canvas: HTMLCanvasElement): CanvasSize | null {
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  if (!w || !h) return null
  const dpr = Math.min(TUNING.maxDpr, Math.max(1, window.devicePixelRatio || 1))
  const bw = Math.round(w * dpr)
  const bh = Math.round(h * dpr)
  if (canvas.width !== bw) canvas.width = bw
  if (canvas.height !== bh) canvas.height = bh
  return { w, h, dpr }
}

/** Clear the canvas and set a transform that fits `box` (local units) centred inside it. */
export function fitBox(ctx: CanvasRenderingContext2D, size: CanvasSize, box: Box, padding = 0.06): void {
  const { w, h, dpr } = size
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  const avail = 1 - padding * 2
  const s = Math.min((w * avail) / (box.maxX - box.minX), (h * avail) / (box.maxY - box.minY))
  const cx = (box.minX + box.maxX) / 2
  const cy = (box.minY + box.maxY) / 2
  ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (w / 2 - cx * s), dpr * (h / 2 - cy * s))
}

/**
 * Run `frame(t)` every animation frame until stop() is called or the canvas leaves the page (then
 * its memory is given back too).
 * Reduced motion: one still frame, repainted on resize (call redraw() to paint again after a change).
 */
export function animate(
  canvas: HTMLCanvasElement,
  frame: (t: number) => void,
  opts: { fps?: number } = {},
): { stop(): void; redraw(): void } {
  let t = 0
  let seen = false
  /** False once the canvas has been on the page and left it. */
  const alive = () => {
    if (canvas.isConnected) seen = true
    return canvas.isConnected || !seen
  }
  const redraw = () => frame(t)
  if (prefersReducedMotion()) {
    const onResize = () => {
      if (alive()) requestAnimationFrame(redraw)
      else {
        window.removeEventListener('resize', onResize)
        releaseCanvas(canvas)
      }
    }
    window.addEventListener('resize', onResize)
    requestAnimationFrame(() => {
      if (alive()) redraw()
    })
    return { stop: () => window.removeEventListener('resize', onResize), redraw }
  }
  const minStep = opts.fps ? 1000 / opts.fps - 2 : 0
  let raf = 0
  let stopped = false
  let start = -1
  let last = -Infinity
  const tick = (ms: number) => {
    if (stopped) return
    if (!alive()) {
      stopped = true
      releaseCanvas(canvas)
      return
    }
    if (start < 0) start = ms
    if (ms - last >= minStep) {
      last = ms
      t = (ms - start) / 1000
      frame(t)
    }
    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)
  return {
    stop() {
      stopped = true
      cancelAnimationFrame(raf)
    },
    redraw,
  }
}

/** Give a canvas's memory back (iOS keeps a tight budget for canvas backing stores). */
export function releaseCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 0
  canvas.height = 0
}

const BUBBLE_TO_ART: Record<GoatMood, ArtGoatMood> = {
  calm: 'peek',
  happy: 'happy',
  scared: 'nervous',
  giggly: 'laugh',
  wobbly: 'wobbly',
}

/**
 * The goat's face over the backpack rim, for the goat bubble's avatar (it follows each line's mood).
 * `out`: the goat climbs beside her (night climbs after Sky Lake) — just its head, no backpack.
 */
export function goatAvatar(look: ClimberLook, opts: { out?: boolean } = {}): GoatAvatar {
  const canvas = h('canvas', { class: 'goat-avatar', 'aria-hidden': 'true' })
  const el = h('span', { class: 'goat-avatar-wrap' }, canvas) as GoatAvatar
  let mood: ArtGoatMood = 'peek'
  let moodAt = 0
  let lastT = 0
  // The goat's head and the top of the pack (the rim sits 17 units above the ground origin), or
  // its head and shoulders on their own.
  const box: Box = opts.out ? { minX: -12, minY: -25, maxX: 14, maxY: 3 } : { minX: -14, minY: -42, maxX: 15, maxY: -9 }
  const loop = animate(
    canvas,
    (t) => {
      lastT = t
      const size = sizeCanvas(canvas)
      const ctx = canvas.getContext('2d')
      if (!size || !ctx) return
      fitBox(ctx, size, box, 0.02)
      // A little hop when the mood changes, as if it popped up to talk.
      const pop = Math.max(0, 1 - (t - moodAt) * 3)
      ctx.translate(0, -pop * 1.5)
      const state = { mood, t, inBackpack: true, earFlap: mood === 'happy' ? 0.3 * pop : 0 }
      if (opts.out) drawGoat(ctx, state)
      else drawPackWithGoat(ctx, look, state)
    },
    { fps: 30 },
  )
  el.setMood = (m: GoatMood) => {
    mood = BUBBLE_TO_ART[m]
    moodAt = lastT
    loop.redraw()
  }
  el.destroy = () => {
    loop.stop()
    releaseCanvas(canvas)
  }
  return el
}
