/**
 * Plays the Sky Lake finale: the clock, the cues (sounds and the goat's lines), tap-to-skip-a-beat,
 * the Skip button, reduced motion's still frames, the closing card and — the first time — writing
 * down that she reached the summit.
 *
 * - A tap anywhere skips ahead ONE beat (a quick crossfade), never the whole thing; a "Skip" button
 *   (top-left, clear of the mute toggle) appears after the first 3 seconds and goes to the card.
 * - The first day finale (the one that records the summit) always shows the goat's first time out of
 *   the backpack: taps do nothing from 'out' to 'splash', and Skip waits until it pops up laughing.
 *   She has just come from a game where touching the screen is the main input. Replays and the night
 *   ending skip freely.
 * - Reduced motion: each beat is one still frame, held for a few seconds, with gentle crossfades.
 * - The goat's lines come from SCRIPTED.finale / nightSplash (content/goatLines.ts); the card's one
 *   goat line is SCRIPTED.finale[3] (in the summit group).
 * - The summit is recorded when the card comes up (reached + at, finaleSeen), only on the first
 *   day finale and never in test mode — replays and the night ending write nothing.
 */
import { now, save, sizeCanvas, releaseCanvas, update } from '../../app/context'
import { ambient } from '../../audio/ambient'
import { sfx } from '../../audio/sfx'
import { extendDebug } from '../../debug'
import { FinaleRenderer, type FinaleScene, type Region } from '../../game/render/finale'
import { scriptedLine, type SpokenLine } from '../../model/goatVoice'
import { button } from '../../ui/components'
import { h, prefersReducedMotion } from '../../ui/dom'
import { goatBubble, type GoatBubble } from '../../ui/goatBubble'
import { finaleAvatar, type FinaleAvatar } from './avatar'
import { finaleCard, type FinaleCard } from './card'
import { FINALE_COPY } from './copy'
import {
  beatAt,
  beatsFor,
  cardAt,
  cuesFor,
  goatWhereAt,
  nextBeatAt,
  sceneAt,
  skipAllFrom,
  UNSKIPPABLE_BEATS,
  type CueId,
  type FinaleMode,
} from './timeline'

export interface FinalePlayOptions {
  night: boolean
  /** The first day finale: record the summit when the card comes up. */
  record: boolean
  navigate: (path: string, opts?: { replace?: boolean }) => void
  /** Where "Watch again" goes. */
  againPath: string
  /** Dev lab: start here (seconds) and/or hold the clock still. */
  startAt?: number
  frozen?: boolean
  /** Dev lab: force reduced motion on or off. */
  reducedMotion?: boolean
}

/** Seconds before the Skip button shows. */
const SKIP_AFTER = 3
/** Reduced motion: how long each still frame stays, and the crossfade between them. */
const STILL_HOLD = 3.6
const STILL_FADE = 1.0
/** A tap-skip's quick crossfade. */
const TAP_FADE = 0.35

interface Fade {
  from: FinaleScene
  region: Region
  /** Real seconds since it started, and how long it lasts. */
  age: number
  dur: number
}

interface Safe {
  top: number
  right: number
  bottom: number
  left: number
}

export class FinalePlay {
  readonly el: HTMLElement
  private readonly mode: FinaleMode
  private readonly opts: FinalePlayOptions
  private readonly canvas: HTMLCanvasElement
  private readonly stage: HTMLElement
  private readonly probe: HTMLElement
  private readonly renderer: FinaleRenderer
  private readonly avatar: FinaleAvatar
  private readonly bubble: GoatBubble
  private readonly skipBtn: HTMLButtonElement
  private readonly reduced: boolean
  private card: FinaleCard | null = null
  private t = 0
  /** Real seconds on screen (the Skip button waits for 3). */
  private age = 0
  private raf = 0
  private lastMs = -1
  private destroyed = false
  private frozen: boolean
  private nextCue = 0
  private fade: Fade | null = null
  private region: Region = { left: 0, top: 0, right: 1, bottom: 1 }
  private regionReady = false
  private size: { w: number; h: number; dpr: number } | null = null
  private needResize = true
  private lastSkipMs = -Infinity
  private beatId = ''
  private stillIndex = 0
  private stillAge = 0
  private dirty = true
  private readonly cleanups: (() => void)[] = []

  constructor(parent: HTMLElement, opts: FinalePlayOptions) {
    this.opts = opts
    this.mode = opts.night ? 'night' : 'day'
    this.reduced = opts.reducedMotion ?? prefersReducedMotion()
    this.frozen = !!opts.frozen
    const d = save()
    const look = d.profile.look
    const sent = Array.from({ length: 16 }, (_, i) => {
      if (d.testMode) return true
      const id = `p${String(i + 1).padStart(2, '0')}` as keyof typeof d.pitches
      const p = d.pitches[id]
      return i === 15 || !!(p && (p.sends > 0 || p.firstSentAt))
    })
    this.renderer = new FinaleRenderer({ night: opts.night, look, mountainName: d.profile.mountainName, camps: sent })

    this.canvas = h('canvas', { class: 'finale__canvas', role: 'img', 'aria-label': '' })
    this.probe = h('div', { class: 'finale__safe', 'aria-hidden': 'true' })
    this.stage = h('div', { class: 'stage finale__stage' }, this.canvas, this.probe)
    this.avatar = finaleAvatar(look, opts.night ? 'out' : 'pack')
    this.bubble = goatBubble({ avatar: () => this.avatar, name: d.profile.goatName, placement: 'float', tapToHide: false })
    this.skipBtn = button(FINALE_COPY.skip, {
      onClick: () => this.skipAll(),
      variant: 'secondary',
      iconEnd: 'next',
      ariaLabel: FINALE_COPY.skipLabel,
      class: 'finale__skip',
    })
    this.el = h('div', { class: `finale${opts.night ? ' finale--night' : ''}` }, this.stage, this.bubble.el, this.skipBtn)
    parent.appendChild(this.el)

    // A tap anywhere on the picture skips ahead one beat.
    const onTap = () => this.skipBeat()
    this.stage.addEventListener('click', onTap)
    this.cleanups.push(() => this.stage.removeEventListener('click', onTap))
    const onResize = () => {
      this.needResize = true
      this.dirty = true
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    this.cleanups.push(() => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    })

    ambient.start('summit', opts.night)

    if (opts.startAt !== undefined) this.seek(opts.startAt, false)
    else if (this.reduced) this.showStill(0, false)

    extendDebug('finale', {
      state: () => ({
        t: this.t,
        beat: beatAt(this.mode, this.t).id,
        night: opts.night,
        record: opts.record,
        card: !!this.card,
        reduced: this.reduced,
        skipShown: this.skipBtn.classList.contains('is-shown'),
      }),
      skipBeat: () => this.skipBeat(true),
      skipAll: () => this.skipAll(),
      seek: (t: number) => this.seek(t, false),
      freeze: (on: boolean) => {
        this.frozen = on
      },
    })

    this.raf = requestAnimationFrame((ms) => this.tick(ms))
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    cancelAnimationFrame(this.raf)
    for (const fn of this.cleanups.splice(0)) fn()
    ambient.stop()
    this.card?.destroy()
    this.card = null
    this.bubble.destroy()
    this.renderer.destroy()
    releaseCanvas(this.canvas)
    extendDebug('finale', null)
    this.el.remove()
  }

  // -------------------------------------------------------------------------------------------
  // The clock

  private tick(ms: number): void {
    if (this.destroyed) return
    this.raf = requestAnimationFrame((m) => this.tick(m))
    const dt = this.lastMs < 0 ? 0 : Math.min(0.1, Math.max(0, (ms - this.lastMs) / 1000))
    this.lastMs = ms
    this.age += dt
    if (this.age >= SKIP_AFTER && !this.card && this.maySkipAll()) this.skipBtn.classList.add('is-shown')
    if (this.needResize) this.resize()
    if (!this.size) return

    if (this.fade) {
      this.fade.age += dt
      if (this.fade.age >= this.fade.dur) this.fade = null
      this.dirty = true
    }
    if (this.reduced) {
      if (!this.frozen && !this.card) {
        this.stillAge += dt
        if (this.stillAge >= STILL_HOLD) this.showStill(this.stillIndex + 1, true)
      }
    } else if (!this.frozen) {
      this.t += dt
      this.dirty = true
      this.fireCues()
    }
    if (!this.card && this.t >= cardAt(this.mode) - 1e-6) this.openCard()

    const changed = this.updateRegion(dt)
    if (changed) this.dirty = true
    this.avatar.setWhere(goatWhereAt(this.mode, this.t))
    this.describe()
    if (this.dirty || !this.reduced) this.draw()
  }

  private draw(): void {
    const ctx = this.canvas.getContext('2d')
    if (!ctx || !this.size) return
    this.dirty = false
    const scene = sceneAt(this.mode, this.t, this.aspect())
    if (this.fade) {
      this.renderer.render(ctx, scene, this.region, { from: this.fade.from, k: this.fade.age / this.fade.dur, region: this.fade.region })
      return
    }
    this.renderer.render(ctx, scene, this.region)
  }

  /** Width / height of the framing region (the timeline frames a phone a little differently). */
  private aspect(): number {
    const r = this.region
    return Math.max(1, r.right - r.left) / Math.max(1, r.bottom - r.top)
  }

  private resize(): void {
    this.needResize = false
    const size = sizeCanvas(this.canvas)
    if (!size) {
      this.needResize = true
      return
    }
    const same = this.size && this.size.w === size.w && this.size.h === size.h && this.size.dpr === size.dpr
    this.size = size
    if (!same) this.renderer.resize(size.w, size.h, size.dpr)
    this.regionReady = false
    this.dirty = true
  }

  private safe(): Safe {
    const cs = getComputedStyle(this.probe)
    const n = (v: string) => parseFloat(v) || 0
    return { top: n(cs.paddingTop), right: n(cs.paddingRight), bottom: n(cs.paddingBottom), left: n(cs.paddingLeft) }
  }

  /** Where the camera box goes: clear of the Skip/mute row, the goat's bubble (measured) and the card. */
  private targetRegion(): Region {
    const size = this.size ?? { w: 1, h: 1, dpr: 1 }
    const s = this.safe()
    const r: Region = {
      left: s.left + 10,
      right: size.w - s.right - 10,
      top: s.top + 70,
      bottom: size.h - s.bottom - (size.h < 500 ? 92 : 104),
    }
    if (this.card) {
      const rect = this.card.el.getBoundingClientRect()
      const host = this.canvas.getBoundingClientRect()
      if (this.card.isSide()) {
        // The side card sits right (a tablet) or left (a phone on its side): frame beside it.
        if (rect.left + rect.width / 2 > host.left + host.width / 2) r.right = Math.max(r.left + 120, rect.left - host.left - 14)
        else r.left = Math.min(r.right - 120, rect.right - host.left + 14)
        r.bottom = size.h - s.bottom - 16
      } else {
        r.bottom = Math.max(r.top + 120, rect.top - host.top - 12)
        r.top = s.top + 62
      }
    } else if (this.bubble.isShowing()) {
      // The goat's bubble floats over the bottom of the picture (on a phone held sideways it is
      // taller than the room kept for it): frame above it while it shows, so nothing — the first
      // camps lighting up at the mountain's foot — hides behind it. The camera eases between the two.
      const b = this.bubble.el.getBoundingClientRect()
      const host = this.canvas.getBoundingClientRect()
      if (b.height > 0) r.bottom = Math.max(r.top + 120, Math.min(r.bottom, b.top - host.top - 8))
    }
    return r
  }

  private updateRegion(dt: number): boolean {
    const target = this.targetRegion()
    if (!this.regionReady) {
      this.region = target
      this.regionReady = true
      return true
    }
    const k = 1 - Math.exp(-dt * 5)
    let moved = false
    const r = this.region
    for (const key of ['left', 'top', 'right', 'bottom'] as const) {
      const d = target[key] - r[key]
      if (Math.abs(d) > 0.25) {
        r[key] += d * k
        moved = true
      } else r[key] = target[key]
    }
    return moved
  }

  // -------------------------------------------------------------------------------------------
  // Cues

  private fireCues(): void {
    const cues = cuesFor(this.mode)
    while (this.nextCue < cues.length && cues[this.nextCue].at <= this.t) {
      this.play(cues[this.nextCue].id)
      this.nextCue++
    }
  }

  /**
   * Move the clock to `t1`. Cues passed over are dropped, except the goat's latest line (so a skipped
   * beat's line still shows) — and with `latestSound`, the latest sound too (a still frame's sound).
   */
  private seek(t1: number, latestSound: boolean): void {
    const cues = cuesFor(this.mode)
    let say: CueId | null = null
    let sound: CueId | null = null
    let i = 0
    while (i < cues.length && cues[i].at <= t1) {
      if (i >= this.nextCue) {
        if (cues[i].id.startsWith('say:')) say = cues[i].id
        else sound = cues[i].id
      }
      i++
    }
    this.nextCue = i
    this.t = t1
    if (say) this.play(say)
    if (sound && latestSound) this.play(sound)
    this.dirty = true
  }

  private play(id: CueId): void {
    switch (id) {
      case 'say:0':
      case 'say:1':
      case 'say:2':
        this.say(scriptedLine('finale', { index: Number(id.slice(4)) }))
        return
      case 'say:night':
        this.say(scriptedLine('nightSplash'))
        return
      case 'bleat:happy':
      case 'bleat:nervous':
      case 'bleat:wheee':
      case 'bleat:laugh':
        sfx.bleat(id.slice(6) as 'happy' | 'nervous' | 'wheee' | 'laugh')
        return
      case 'hop':
        sfx.land(true)
        return
      case 'whoosh':
        sfx.whoosh(0.45)
        return
      case 'splash':
        sfx.splash()
        return
      case 'chime':
        sfx.chime()
        return
      case 'sparkle':
        sfx.reveal()
        return
      case 'swoosh':
        sfx.whoosh(0.2)
        return
    }
  }

  private say(line: SpokenLine): void {
    if (this.card) return
    this.bubble.say(line.text, { mood: line.mood, durationMs: 5200 })
  }

  // -------------------------------------------------------------------------------------------
  // Skipping

  /** The first day finale: the goat's first time out plays in full (see the file comment). */
  private guarded(): boolean {
    return this.opts.record && this.mode === 'day'
  }

  /** May the Skip button go straight to the card yet? */
  private maySkipAll(): boolean {
    return !this.guarded() || this.t >= skipAllFrom() - 1e-6
  }

  /** One beat ahead (a tap on the picture). Taps closer together than 0.3 s count once. */
  private skipBeat(force = false): void {
    if (this.card || this.destroyed) return
    if (this.guarded() && UNSKIPPABLE_BEATS.includes(beatAt(this.mode, this.t).id)) return
    const ms = performance.now()
    if (!force && ms - this.lastSkipMs < 300) return
    this.lastSkipMs = ms
    if (this.reduced) {
      this.showStill(this.stillIndex + 1, true)
      return
    }
    const target = nextBeatAt(this.mode, this.t)
    this.startFade(TAP_FADE)
    this.seek(target, false)
  }

  /** Straight to the closing card (the Skip button). */
  private skipAll(): void {
    if (this.card || this.destroyed || !this.maySkipAll()) return
    const beats = beatsFor(this.mode)
    if (this.reduced) {
      this.showStill(beats.length - 1, true)
      return
    }
    this.startFade(TAP_FADE * 1.6)
    this.seek(cardAt(this.mode), false)
    this.openCard()
  }

  private startFade(dur: number): void {
    if (!this.size) return
    this.fade = { from: sceneAt(this.mode, this.t, this.aspect()), region: { ...this.region }, age: 0, dur }
  }

  /** Reduced motion: show beat `i`'s still frame, crossfading from the one before. */
  private showStill(i: number, fade: boolean): void {
    const beats = beatsFor(this.mode)
    const idx = Math.min(beats.length - 1, Math.max(0, i))
    if (fade && idx === this.stillIndex) return
    if (fade) this.startFade(STILL_FADE)
    this.stillIndex = idx
    this.stillAge = 0
    this.seek(beats[idx].still, true)
    if (idx === beats.length - 1) this.openCard()
  }

  // -------------------------------------------------------------------------------------------
  // The card

  private openCard(): void {
    if (this.card || this.destroyed) return
    this.bubble.hide()
    this.skipBtn.classList.remove('is-shown')
    this.skipBtn.hidden = true
    const d = save()
    if (this.opts.record && !d.testMode) {
      update((draft) => {
        draft.summit.reached = true
        if (!draft.summit.at) draft.summit.at = now().toISOString()
        draft.summit.finaleSeen = true
      })
    }
    const attempts = d.stats.whippers + d.stats.sends
    this.card = finaleCard({
      night: this.opts.night,
      mountainName: d.profile.mountainName,
      goatName: d.profile.goatName,
      look: d.profile.look,
      attempts,
      line: this.opts.night ? null : scriptedLine('finale', { index: 3 }),
      onCamp: () => this.opts.navigate('/camp', { replace: true }),
      onAgain: () => this.opts.navigate(this.opts.againPath, { replace: true }),
    })
    this.el.appendChild(this.card.el)
    sfx.chime()
    this.dirty = true
  }

  private describe(): void {
    const beat = beatAt(this.mode, this.t).id
    if (beat === this.beatId) return
    this.beatId = beat
    const d = save()
    this.canvas.setAttribute('aria-label', FINALE_COPY.stage(beat, this.opts.night, d.profile.goatName, d.profile.mountainName))
  }
}
