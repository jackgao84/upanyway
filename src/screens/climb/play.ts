/**
 * One climb of one pitch: the stage (canvas, camera, renderer, character, input) plus the HUD, and
 * every engine event turned into what she sees, hears and keeps — saves through ClimbRecorder, sound
 * effects, goat lines, word cards, the flop card, badges, beta, the zone's Looks Scary moment (its
 * set-piece on the canvas, the Fear Forecast, the reveal, "How scary was it really?"), the sunset,
 * the Beta Map and — after the summit pitch — the way on to the Sky Lake finale.
 *
 * Looks Scary (Decision 14): the first time a zone's moment is met, the camp before it asks the Fear
 * Forecast (the thing looms on the canvas); arriving on it plays its gentle reveal with the clock
 * frozen, then asks "How scary was it really?" and shows "Forecast 7. Really 2.". Once answered — and
 * on every night climb — the set-piece is drawn already gentle and nothing is asked.
 *
 * Talking: the goat speaks through one bubble with a small priority system, so a story line (the
 * rope's first catch, a hidden hold, a Looks Scary moment) is never talked over by chatter, and
 * chatter (aiming, hops, gusts) stays rare.
 */
import { ambient } from '../../audio/ambient'
import { sfx } from '../../audio/sfx'
import { goatAvatar, markWordSeen, now, save, update } from '../../app/context'
import type { GoatMoment } from '../../content/goatLines'
import type { GlossaryWord } from '../../content/glossary'
import { fallPoseInfo } from '../../content/fallPoses'
import { setClimbDebug } from '../../debug'
import { pickFallPose } from '../../game/art/fallPosesAnim'
import { classifyMiss, type MissInfo } from '../../game/beta'
import { ClimbSession } from '../../game/engine'
import type { EngineEvents } from '../../game/events'
import { solutionFrom } from '../../game/levels/solutions'
import { TUNING } from '../../game/tuning'
import { ScaryLayer, type ScaryCue, type ScaryPoint } from '../../game/render/scary'
import { PITCH_IDS, type Level, type LevelId, type LooksScary } from '../../game/types'
import { needsScaryForecast, needsScaryReally } from '../../model/attempts'
import { isSunset, sunProgress } from '../../model/climbTime'
import { goatVoice, hintMoment, scriptedLine, type GoatContext, type GoatVars, type SpokenLine } from '../../model/goatVoice'
import { hashString, mulberry32 } from '../../model/rng'
import { isGoatOut, isNightOpen, isPitchOpen } from '../../model/unlocks'
import { button, iconButton, toast } from '../../ui/components'
import { h } from '../../ui/dom'
import { goatBubble, type GoatBubble } from '../../ui/goatBubble'
import { canShowFinale, finalePath } from '../finale'
import { betaMapCard, type BetaMapCard } from './betaMap'
import { badgeCards, CardQueue, flopCard, introduceWord, isNew, wordCard, type WordBook } from './cards'
import { CLIMB_COPY } from './copy'
import { forecastPrompt, reallyPrompt, sunsetLine, sunsetPrompt, type GoatInfo } from './prompts'
import { ClimbRecorder } from './record'
import { ClimbStage, type KeepInView } from './stage'
import { sunDial, type SunDial } from './sun'

export type PromptId = 'forecast' | 'really' | 'reveal' | 'betamap' | 'sunset'

export interface PlayOptions {
  level: Level
  night: boolean
  navigate: (path: string, opts?: { replace?: boolean }) => void
}

/**
 * A phone on its side: the HUD moves into the gutters beside the pitch (climb.css), so the camera
 * can use the whole height and she is drawn about twice as big.
 */
function shortLandscape(): boolean {
  return window.innerHeight < 500 && window.innerWidth > window.innerHeight
}
/** HUD space at the top (camp button row) and bottom, on top of the safe areas (CSS px). */
const hudTop = (): number => (shortLandscape() ? 10 : 74)
/** Keep the camera's picture of her (and her rope swings below a camp) above the goat's bubble. */
const hudBottom = (): number => (shortLandscape() ? 10 : window.innerWidth < 600 ? 104 : 88)
/** Cards slide in at the top of the screen: frame the next target below them. */
const CARD_BAND_PX = 110
/** Half the width of the rock face on screen, in world units (the pitch plus its rugged edges). */
const FACE_HALF_W = 232

/**
 * Where the Looks Scary thing sits on screen (0 = top, 1 = bottom) while the goat talks about it and
 * during the reveal; once a fear card is up (along the bottom) it goes in the middle of the picture
 * left above the card.
 */
const SCARY_FRAC = 0.42
/** Room above her head for the cards that slide in at the top during a reveal (CSS px). */
const SCARY_TOAST_PX = 150

/** Goat line priorities: chatter < normal < beta and the send < story lines. */
const CHAT = 1
const NORMAL = 2
const BETA = 3
const STORY = 4

/** Test mode's words met this session (kept out of her record). */
const testWords = new Set<string>()

/** Words she has met: her glossarySeen, or (test mode) an in-memory list that never touches her record. */
export function wordBook(): WordBook {
  if (!save().testMode) return { seen: () => save().glossarySeen, mark: markWordSeen }
  return {
    seen: () => [...save().glossarySeen, ...testWords],
    mark: (w) => {
      testWords.add(w)
    },
  }
}

export class ClimbPlay {
  readonly level: Level
  readonly night: boolean
  private readonly levelId: LevelId
  private readonly nav: PlayOptions['navigate']
  private readonly stage: ClimbStage
  private readonly session: ClimbSession
  /** The zone's Looks Scary set-piece (a no-op on pitches without one). */
  private readonly scary: ScaryLayer
  private readonly recorder: ClimbRecorder
  private readonly bubble: GoatBubble
  private readonly sun: SunDial
  private readonly hintBtn: HTMLButtonElement
  private readonly ghostBtn: HTMLButtonElement
  private readonly betaBox: HTMLElement
  private readonly hud: HTMLElement
  private readonly words: WordBook
  private readonly goat: GoatInfo
  /** At night after Sky Lake the goat climbs beside her instead of riding in the backpack. */
  private readonly goatOutside: boolean
  private readonly ctxBase: GoatContext
  private readonly timers = new Set<ReturnType<typeof setTimeout>>()
  private readonly cards = new CardQueue()
  private readonly unsubs: (() => void)[] = []
  private destroyed = false

  // Talking.
  private sayPrio = 0
  private sayAt = -1e9

  // What happened (for lines, beta and the sunset).
  private lastLaunch: EngineEvents['launch'] | null = null
  private readonly lastMiss = new Map<string, MissInfo>()
  private readonly hintGivenAt = new Map<string, number>()
  private readonly ghostGivenAt = new Map<string, number>()
  private readonly offered = new Set<string>()
  private readonly bigLeapLineAt = new Set<string>()
  private aimLineGap = 99
  private aimedHere = false
  private revealedThisFall = false
  private hiddenSaid = false
  private poseCount = 0
  private gustSaidAt = -1e9
  private gustSoundAt = -1e9
  private hopCount = 0
  private attemptEnded = false

  // Prompts, sunset, Looks Scary, Beta Map.
  private prompt: { id: PromptId; close(): void } | null = null
  private sunsetDue = false
  private sunsetShown = false
  private timeAcc = 0
  private forecastGiven: number | null = null
  private forecastDone = false
  private revealDone = false
  private map: BetaMapCard | null = null

  constructor(root: HTMLElement, opts: PlayOptions) {
    this.level = opts.level
    this.levelId = opts.level.id
    this.night = opts.night
    this.nav = opts.navigate
    const d = save()
    this.words = wordBook()
    // At night the goat climbs beside her — once it has climbed out of the pack at Sky Lake. Until
    // then it rides in the backpack everywhere, moonlight included.
    const goatOutside = this.night && isGoatOut(d)
    this.goatOutside = goatOutside
    this.goat = { look: d.profile.look, name: d.profile.goatName, out: goatOutside }
    this.ctxBase = { zone: this.level.zone, goatOut: goatOutside }

    // The run: resume at its last camp, with found holds and cracked ledges as she left them.
    this.recorder = new ClimbRecorder({ save, update, now }, this.levelId, this.night, true)
    const resume = this.recorder.begin(this.level.route[0])
    this.session = new ClimbSession({
      level: this.level,
      startId: resume.startId,
      revealed: resume.revealed,
      foundCrumbles: resume.foundCrumbles,
      // Seeded and biased to poses she hasn't seen (Decision 9). Physics never uses randomness.
      choosePose: () => {
        const n = save().stats.whippers
        return pickFallPose(save().poses, mulberry32(hashString(`${this.levelId}:${n}:${this.poseCount++}`)))
      },
    })
    for (const arc of resume.recentChalk) this.session.chalk.push({ arc, at: -10 })
    // Her saved last miss at each spot: a hint her earlier falls earned is offered on arrival there.
    for (const [spot, miss] of Object.entries(resume.lastMiss)) this.lastMiss.set(spot, miss)

    // DOM: the stage, then the HUD over it. (`is-climbing` lets the page's cards move aside.)
    document.documentElement.classList.add('is-climbing')
    const container = h('div', { class: 'climb' })
    root.appendChild(container)
    this.stage = new ClimbStage(container, {
      level: this.level,
      session: this.session,
      look: d.profile.look,
      night: this.night,
      goatOutside,
      hudTop,
      hudBottom,
      targetTopPx: CARD_BAND_PX,
      // The space beside the rock face, for the HUD on a phone held sideways (climb.css).
      onResize: (cam) => {
        const gutter = Math.max(0, Math.round(cam.viewW / 2 - FACE_HALF_W * cam.baseScale))
        document.documentElement.style.setProperty('--climb-gutter', `${gutter}px`)
      },
      label: `${this.night ? CLIMB_COPY.nightPitch(this.level.index) : CLIMB_COPY.pitch(this.level.index)}: ${this.level.title}`,
      onFrame: (dt) => this.frame(dt),
    })

    this.bubble = goatBubble({ avatar: () => goatAvatar(d.profile.look, { out: goatOutside }), name: d.profile.goatName, placement: 'float', tapToHide: false })
    this.sun = sunDial({ night: this.night })
    this.sun.set(sunProgress(d, now()))
    this.hintBtn = button(CLIMB_COPY.hint, { onClick: () => this.takeHint(), variant: 'secondary', icon: 'beta', ariaLabel: CLIMB_COPY.hintLabel, class: 'climb-hud__hint' })
    this.ghostBtn = button(CLIMB_COPY.showMe, { onClick: () => this.showGhost(), variant: 'secondary', icon: 'eye', ariaLabel: CLIMB_COPY.showMeLabel, class: 'climb-hud__ghost' })
    this.hintBtn.hidden = true
    this.ghostBtn.hidden = true
    this.betaBox = h('div', { class: 'climb-hud__beta' }, this.hintBtn, this.ghostBtn)
    const campBtn = iconButton('tent', CLIMB_COPY.camp, () => this.nav('/camp'), { class: 'climb-hud__camp' })
    this.hud = h('div', { class: 'hud climb-hud' }, campBtn, this.sun.el, this.betaBox, this.bubble.el)
    container.appendChild(this.hud)

    // The Looks Scary set-piece: looming until she meets it up close; gentle once she has (and at night).
    this.scary = new ScaryLayer(this.level, { night: this.night })
    if (this.scary.kind) {
      const rec = d.looksScary[this.level.zone]
      this.scary.setPhase(this.night || typeof rec?.really === 'number' ? 'revealed' : 'looming', this.stage.time)
      this.scary.onCue = (cue) => this.scaryCue(cue)
      const r = this.stage.renderer
      r.setHook('behind', (ctx, _s, camera, t) => this.scary.draw(ctx, camera, t))
      r.setHook('fog', (ctx, _s, camera, t) => this.scary.drawOnFog(ctx, camera, t))
      r.setHook('front', (ctx, _s, camera, t) => this.scary.drawFront(ctx, camera, t))
      if (this.scary.kind === 'bridge') r.setBridgeGaps(() => this.scary.bridgeGaps())
    }

    setClimbDebug({
      state: () => this.session.snapshot(),
      climberClient: () => this.stage.climberClient(),
      maxDragPx: () => this.stage.maxDragPx(),
      worldToClient: (x, y) => this.stage.worldToClient(x, y),
      levelId: () => this.levelId,
      pendingPrompt: () => this.pendingPrompt(),
      scaryPhase: () => (this.scary.kind ? this.scary.phase : null),
      goatOutside: () => goatOutside,
    })

    this.wire()
    ambient.start(this.level.zone, this.night)

    // No leaping until the arrival check for the spot she starts on has run (the session starts
    // 'ready' without saying so): a quick first leap must not skip the Fear Forecast at its camp.
    this.stage.setFrozen('arrive', true)
    if (isSunset(save(), now())) {
      // Time was already up: the sunset card straight away (no lock icons, no sad faces).
      this.sunsetDue = true
      this.showSunset()
    } else {
      this.later(() => this.enterCard(), 500)
      this.later(() => this.onReady(), 1100)
    }
  }

  // -------------------------------------------------------------------------------------------
  // Housekeeping

  private later(fn: () => void, ms: number): void {
    const id = setTimeout(() => {
      this.timers.delete(id)
      if (!this.destroyed) fn()
    }, ms)
    this.timers.add(id)
  }

  pendingPrompt(): string | null {
    if (this.prompt) return this.prompt.id
    if (this.map) return 'betamap'
    return null
  }

  destroy(): void {
    if (this.destroyed) return
    // Save the last seconds, but open nothing: the screen is going away.
    this.flushTime(false)
    this.destroyed = true
    this.cards.destroy()
    for (const id of this.timers) clearTimeout(id)
    this.timers.clear()
    for (const off of this.unsubs.splice(0)) off()
    this.prompt?.close()
    this.prompt = null
    this.map?.destroy()
    this.map = null
    ambient.stop()
    this.bubble.destroy()
    this.stage.destroy()
    this.scary.destroy()
    document.documentElement.classList.remove('is-climbing')
    document.documentElement.style.removeProperty('--climb-gutter')
    setClimbDebug(null)
  }

  // -------------------------------------------------------------------------------------------
  // Talking

  private say(line: SpokenLine | null, prio: number, ms?: number): void {
    if (!line || this.destroyed || this.map) return
    const t = performance.now()
    if (this.bubble.isShowing() && prio < this.sayPrio && t - this.sayAt < 2600) return
    this.sayPrio = prio
    this.sayAt = t
    this.bubble.say(line.text, { mood: line.mood, durationMs: ms })
  }

  private pick(moment: GoatMoment, vars: GoatVars = {}, extra: GoatContext = {}): SpokenLine {
    return goatVoice().pick(moment, vars, { ...this.ctxBase, ...extra })
  }

  // -------------------------------------------------------------------------------------------
  // Engine events

  private wire(): void {
    const ev = this.session.events
    const on = <K extends keyof EngineEvents>(name: K, fn: (e: EngineEvents[K]) => void) => this.unsubs.push(ev.on(name, fn))

    on('aimStart', (e) => this.onAimStart(e.bigLeap))
    // A cancelled aim (a tap, a drag back onto her) brings back the beta buttons it hid.
    on('aimCancel', () =>
      this.later(() => {
        const s = this.session
        if (s.phase === 'ready' && !s.aim && !s.frozen && !this.prompt && !this.map && !this.sunsetShown) this.offerBeta()
      }, 0),
    )
    on('launch', (e) => this.onLaunch(e))
    on('land', (e) => this.onLand(e))
    on('hop', () => this.onHop())
    on('reveal', (e) => this.onReveal(e.ids))
    on('whipper', (e) => this.onWhipper(e))
    on('ropeCatch', () => {
      sfx.boing()
      // In the backpack the goat rides the rope with her; beside her, it cheers from the ledge.
      this.later(() => sfx.bleat(this.goatOutside ? 'happy' : 'wheee'), 240)
      this.recorder.ropeCatch()
    })
    on('ready', () => this.onReady())
    on('crumbleStart', () => sfx.crumble())
    on('crumbled', () => sfx.crumble())
    on('crumbleFound', (e) => {
      this.recorder.crumbleFound(e.id)
      this.say(this.pick('crumbleFound'), NORMAL)
    })
    on('gust', (e) => this.onGust(e.zoneId, e.starting))
    on('send', () => this.onSend())
  }

  private onAimStart(bigLeap: boolean): void {
    this.hideBeta()
    const spot = this.session.elementId
    if (bigLeap) {
      if (!this.bigLeapLineAt.has(spot)) {
        this.bigLeapLineAt.add(spot)
        this.say(this.pick('aimBigLeap'), NORMAL)
        sfx.bleat('nervous')
      }
      return
    }
    // The goat chats about aiming only now and then: the first aim, then every few new spots.
    if (this.aimedHere) return
    this.aimedHere = true
    if (this.aimLineGap >= 3) {
      this.aimLineGap = 0
      this.say(this.pick('aim'), CHAT)
    } else this.aimLineGap++
  }

  private onLaunch(e: EngineEvents['launch']): void {
    this.lastLaunch = e
    this.hideBeta()
    this.revealedThisFall = false
    sfx.whoosh(e.power)
    if (e.bigLeap && e.towardBigLeapTarget) {
      sfx.bleat('nervous')
      badgeCards(this.recorder.bigLeapTried(), this.cards)
    }
  }

  private onLand(e: EngineEvents['land']): void {
    const from = this.lastLaunch?.fromId ?? null
    const facts = this.recorder.landing(e, from)
    this.aimedHere = false
    if (e.isCamp) this.attemptEnded = true
    if (e.isTop) return // the send speaks for itself
    sfx.land(e.kind === 'hold')
    if (e.kind === 'hold' || facts.newCamp) this.later(() => sfx.chalk(), 90)
    if (e.kind === 'hold') this.cards.push(() => wordCard(this.words, 'hold'))
    const n = facts.attemptsHere
    if (e.bigLeap) this.say(this.pick('bigLeapLanded', { n }), NORMAL)
    else if (facts.newCamp) this.say(this.pick('campReached', {}, { campKey: `${this.levelId}:${e.id}:${this.session.t}` }), NORMAL)
    else if (n >= 2) this.say(this.pick('land', { n }), NORMAL)
    else if (Math.random() < 0.3) this.say(this.pick('land'), CHAT)
  }

  private onHop(): void {
    this.aimedHere = false
    if (this.hopCount++ % 3 === 0) this.say(this.pick('hop'), CHAT)
  }

  private onReveal(ids: string[]): void {
    this.recorder.revealHolds(ids)
    this.revealedThisFall = true
    sfx.reveal()
    const line = this.hiddenSaid ? this.pick('hiddenHold') : scriptedLine('hiddenHold')
    this.hiddenSaid = true
    this.say(line, STORY, 5000)
  }

  private onWhipper(e: EngineEvents['whipper']): void {
    this.aimedHere = false
    this.attemptEnded = true
    this.lastMiss.set(e.spotId, { kind: e.kind, arc: e.arc, launch: e.launch, bumped: e.bumped, gusted: e.gusted })
    const facts = this.recorder.whipper(e)
    if (e.kind === 'slip') sfx.land(false)

    // The card first, then any badge, then a new word.
    if (facts.newPose) this.cards.push(() => flopCard(e.poseId, this.goat.look))
    badgeCards(facts.badges, this.cards)
    if (isNew(this.words, 'whipper')) this.cards.push(() => wordCard(this.words, 'whipper'))
    else if (isNew(this.words, 'chalk')) this.cards.push(() => wordCard(this.words, 'chalk'))

    if (this.revealedThisFall) return // "Spotted a hold on the way down!" says it all
    const whipper = e.kind
    const big = this.lastLaunch?.bigLeap && this.lastLaunch.towardBigLeapTarget && e.launch !== null
    if (e.kind === 'rope' && !save().flags.ropeExplained && !save().testMode) {
      this.recorder.ropeExplained()
      this.say(scriptedLine('ropeFirst'), STORY, 6000)
    } else if (big) {
      this.say(this.pick('bigLeapMissed', {}, { whipper }), NORMAL)
    } else if (facts.fallsAtSpot >= 2 && facts.fallsAtSpot % 2 === 0) {
      this.say(this.pick('repeatFall', { n: facts.fallsAtSpot }, { whipper }), NORMAL)
    } else {
      this.say(this.pick('fall', { pose: fallPoseInfo(e.poseId)?.name }, { whipper }), NORMAL)
    }
  }

  private onGust(zoneId: string, starting: boolean): void {
    if (!starting) return
    const z = (this.level.wind ?? []).find((w) => w.id === zoneId)
    if (!z) return
    const b = this.session.body
    const mid = b.y + TUNING.bodyHeight / 2
    const near = mid > z.y - 260 && mid < z.y + z.h + 260
    if (!near) return
    const t = performance.now()
    if (t - this.gustSoundAt > 1000) {
      this.gustSoundAt = t
      sfx.gust(Math.max(0.3, Math.min(1, z.accel / 450)))
    }
    if (this.session.phase === 'ready' && t - this.gustSaidAt > 45000) {
      this.gustSaidAt = t
      this.say(this.pick('gustSoon'), CHAT)
    }
  }

  private onSend(): void {
    const facts = this.recorder.send()
    const attempts = facts.send.attempts
    this.hideBeta()
    sfx.chime()
    this.later(() => sfx.bleat('happy'), 300)
    this.say(this.pick('send', { n: attempts }), BETA, 2400)
    // The goat says "sent": the first time, the word's meaning comes with it (the Beta Map then
    // doesn't repeat it).
    introduceWord(this.words, 'send', this.cards)
    this.later(() => badgeCards(facts.badges, this.cards), 1800)
    this.later(() => this.openMap(facts.send.failedArcs, facts.send.routeArcs, attempts), 1600)
  }

  // -------------------------------------------------------------------------------------------
  // Ready again: the sunset, Looks Scary moments, beta offers — in that order

  private onReady(): void {
    if (this.destroyed) return
    this.stage.setFrozen('arrive', false)
    if (this.prompt || this.map || this.session.phase !== 'ready') return
    const here = this.session.el(this.session.elementId)
    const onCrumbly = here.kind === 'ledge' && !!here.crumble
    if (this.sunsetDue && !onCrumbly && (this.attemptEnded || (here.kind === 'ledge' && here.camp))) {
      this.showSunset()
      return
    }
    this.attemptEnded = false
    const ls = this.level.looksScary
    if (ls && !onCrumbly) {
      if (here.id === ls.forecastAt && !this.forecastDone) {
        this.forecastDone = true
        if (this.forecastMoment()) return
      } else if (!this.revealDone && this.revealDue(here.id)) {
        this.revealDone = true
        if (this.revealMoment()) return
      }
    }
    this.offerBeta()
  }

  /**
   * The reveal plays on the Looks Scary spot — or on the first ready spot past it on the route when
   * she leapt over it, as long as there is a "How scary was it really?" still to ask (a shortcut
   * must not swallow the "after it" half of the moment).
   */
  private revealDue(hereId: string): boolean {
    const ls = this.level.looksScary
    if (!ls) return false
    if (hereId === ls.revealAt) return true
    const ri = this.session.routeIndexOf(hereId)
    const revealIdx = this.level.route.indexOf(ls.revealAt)
    if (ri === null || revealIdx < 0 || ri <= revealIdx) return false
    return this.forecastGiven !== null || needsScaryReally(save(), this.level.zone)
  }

  // -------------------------------------------------------------------------------------------
  // Beta

  private offerBeta(): void {
    const spot = this.session.elementId
    const falls = this.recorder.fallsAt(spot)
    const hint = falls >= TUNING.hintAfterFalls && this.lastMiss.has(spot) && this.hintGivenAt.get(spot) !== falls
    const ghost = falls >= TUNING.ghostAfterFalls && this.ghostGivenAt.get(spot) !== falls && solutionFrom(this.levelId, spot) !== null
    this.hintBtn.hidden = !hint
    this.ghostBtn.hidden = !ghost
    this.hud.classList.toggle('has-beta', hint || ghost)
    if (ghost && !this.offered.has(`ghost:${spot}`)) {
      this.offered.add(`ghost:${spot}`)
      this.say(this.pick('ghost'), BETA, 6000)
      introduceWord(this.words, 'beta', this.cards)
    } else if (hint && !this.offered.has(`hint:${spot}`)) {
      this.offered.add(`hint:${spot}`)
      // The goat may say "beta" here: the first time, its one-line meaning comes with it.
      this.say(this.pick('betaOffer'), BETA, 6000)
      introduceWord(this.words, 'beta', this.cards)
    }
  }

  private hideBeta(): void {
    this.hintBtn.hidden = true
    this.ghostBtn.hidden = true
    this.hud.classList.remove('has-beta')
  }

  private askedForBeta(): void {
    this.cards.push(() => wordCard(this.words, 'beta'))
    badgeCards(this.recorder.betaAsked(), this.cards)
  }

  private takeHint(): void {
    const s = this.session
    if (s.phase !== 'ready') return
    const spot = s.elementId
    const miss = this.lastMiss.get(spot)
    // Judged against where a leap from THIS spot goes (her highest point may be further up).
    const sol = solutionFrom(this.levelId, spot)
    const targetId = sol?.to ?? s.nextTargetId()
    if (!miss || !targetId) return
    const cls = classifyMiss(this.level, s.el(spot), s.el(targetId), miss, sol)
    this.hintGivenAt.set(spot, this.recorder.fallsAt(spot))
    this.hintBtn.hidden = true
    if (this.ghostBtn.hidden) this.hud.classList.remove('has-beta')
    this.say(this.pick(hintMoment(cls)), STORY, 7000)
    this.askedForBeta()
  }

  private showGhost(): void {
    const s = this.session
    if (s.phase !== 'ready') return
    const spot = s.elementId
    const sol = solutionFrom(this.levelId, spot)
    if (!sol) return
    this.stage.ghost = s.ghostPath(sol)
    this.ghostGivenAt.set(spot, this.recorder.fallsAt(spot))
    this.ghostBtn.hidden = true
    if (this.hintBtn.hidden) this.hud.classList.remove('has-beta')
    this.askedForBeta()
  }

  // -------------------------------------------------------------------------------------------
  // Looks Scary: the Fear Forecast at the camp before it, the reveal up close

  /** Sounds the set-piece asks for (its rumbles, snores, creaks and the reveal's sparkle). */
  private scaryCue(cue: ScaryCue): void {
    if (this.destroyed) return
    // The far-off rumble IS the bear's snore, heard through the rock (never the crumbly-ledge sound).
    if (cue === 'rumble') sfx.rumble()
    else if (cue === 'snore') sfx.snore()
    else if (cue === 'creak') sfx.creak()
    else sfx.reveal()
  }

  /** The middle of the scary thing as seen from the forecast camp, and the reveal's centre. */
  private scaryPoint(which: 'forecast' | 'reveal'): ScaryPoint {
    const ls = this.level.looksScary
    if (!this.scary.kind) return { x: ls?.x ?? 200, y: ls?.y ?? 0 }
    return which === 'forecast' ? this.scary.forecastFocus() : this.scary.focus()
  }

  /** Her, feet to head: the camera keeps her in the picture while it looks at the scary thing. */
  private herInView(topPx?: number): KeepInView {
    const y = this.session.body.y
    return { lo: y - 8, hi: y + TUNING.bodyHeight + 22, topPx }
  }

  /**
   * Once a fear card is up: the scary thing in the middle of the picture left above the card, with
   * her still in it (on a phone the card is tall, so it may only just fit).
   */
  private frameAboveCard(at: ScaryPoint): void {
    const cam = this.stage.camera
    const top = this.stage.topWithin(document.querySelector('.overlay .modal.climb-prompt'))
    const frac = top === null ? 0.3 : Math.max(0.12, Math.min(0.45, (cam.insets.top + top) / 2 / cam.viewH))
    this.stage.lookAt(at.y, 1, frac, this.herInView(0))
  }

  /** At the camp below it. Returns true when a card is on its way (she waits for it). */
  private forecastMoment(): boolean {
    const ls = this.level.looksScary
    // Already met (or a night climb): it is drawn gentle, so there's nothing to look scary.
    if (!ls || this.scary.phase === 'revealed') return false
    const at = this.scaryPoint('forecast')
    const asking = !this.night && needsScaryForecast(save(), this.level.zone)
    // The first time, the goat names what it sees (the moment's own lines, never a generic one).
    const line = this.pick('looksScaryBefore', {}, { scary: ls.kind, scaryOnly: asking })
    this.stage.animator.lookAt(at.x, at.y, 3, 'nervous')
    if (!asking) {
      // A forecast is on record already (she left before the reveal last time): the goat still
      // notices it; no question.
      this.say(line, STORY)
      return false
    }
    this.askForecast(at, line, () => this.endPrompt())
    return true
  }

  /** The Fear Forecast card, the camera on the scary thing. `then` runs once she has answered. */
  private askForecast(at: ScaryPoint, line: SpokenLine, then: () => void): void {
    this.hideBeta()
    this.prompt = { id: 'forecast', close: () => undefined }
    this.stage.setFrozen('prompt', true)
    this.stage.lookAt(at.y, 1, SCARY_FRAC, this.herInView())
    this.say(line, STORY, 2400)
    sfx.bleat('nervous')
    this.later(() => {
      this.bubble.hide()
      const p = forecastPrompt(this.goat, line, (n) => {
        this.forecastGiven = n
        this.recorder.scaryForecast(this.level.zone, n)
        then()
      })
      if (this.prompt) this.prompt.close = p.close
      this.later(() => this.frameAboveCard(at), 60)
    }, 1700)
  }

  /**
   * Up close: the gentle reveal plays with the clock frozen and the camera on it, then "How scary was
   * it really?" and the comparison. Replays: the goat just remembers. Returns true when cards follow.
   *
   * Met up close with no forecast given (she leapt past the forecast camp, or left it before its card
   * came up): the forecast is asked right here first, while the thing still looms — so the moment is
   * never used up without being asked, and it never looms again once she has seen it turn gentle.
   */
  private revealMoment(): boolean {
    const ls = this.level.looksScary
    if (!ls) return false
    const owed = !this.night && this.forecastGiven === null && needsScaryForecast(save(), this.level.zone)
    if (owed && this.scary.kind !== null && this.scary.phase === 'looming') {
      const at = this.scaryPoint('reveal')
      const line = this.pick('looksScaryBefore', {}, { scary: ls.kind, scaryOnly: true })
      this.stage.animator.lookAt(at.x, at.y, 3, 'nervous')
      this.askForecast(at, line, () => this.playReveal(ls))
      return true
    }
    return this.playReveal(ls)
  }

  private playReveal(ls: LooksScary): boolean {
    const zone = this.level.zone
    const rec = save().looksScary[zone]
    const forecast = rec ? rec.forecast : this.forecastGiven
    const askReally = !this.night && ((rec ? rec.really === null : false) || (save().testMode && this.forecastGiven !== null))
    const reveals = this.scary.kind !== null && this.scary.phase !== 'revealed'
    // The first time (and in its card) the goat says what the scary thing turned out to be.
    const line = this.pick('looksScaryAfter', {}, { scary: ls.kind, scaryOnly: reveals || askReally })
    const at = this.scaryPoint('reveal')
    if (reveals) this.scary.setPhase('revealing', this.stage.time)
    this.stage.animator.lookAt(at.x, at.y, 3, 'happy')
    if (!askReally) {
      // Seen before: no stopping her. (A first reveal with nothing to ask still plays, around her.)
      if (this.prompt) this.endPrompt()
      this.say(line, STORY)
      return false
    }
    this.hideBeta()
    this.prompt = { id: 'reveal', close: () => undefined }
    this.stage.setFrozen('prompt', true)
    this.stage.lookAt(at.y, 1, SCARY_FRAC, this.herInView(SCARY_TOAST_PX))
    const ms = reveals ? this.scary.revealDuration() * 1000 : 1200
    // The goat says it once the scary thing has started turning gentle, then the question.
    this.later(() => this.say(line, STORY, ms * 0.5 + 400), ms * 0.5)
    this.later(() => {
      this.bubble.hide()
      if (this.prompt) this.prompt.id = 'really'
      const p = reallyPrompt(
        this.goat,
        line,
        forecast,
        (n) => this.recorder.scaryReally(zone, n),
        () => this.endPrompt(),
      )
      if (this.prompt) this.prompt.close = p.close
      this.later(() => this.frameAboveCard(at), 60)
    }, ms + 400)
    return true
  }

  private endPrompt(): void {
    this.prompt = null
    // From 'revealing' it finishes playing, then stays gentle.
    if (this.scary.phase === 'revealing') this.scary.setPhase('revealed', this.stage.time)
    this.stage.clearLook()
    this.stage.setFrozen('prompt', false)
    this.later(() => this.offerBeta(), 300)
  }

  // -------------------------------------------------------------------------------------------
  // Climb time and the sunset

  private frame(dt: number): void {
    if (this.destroyed) return
    this.scary.update(dt, this.stage.camera, this.session.body)
    if (!this.session.frozen && document.visibilityState === 'visible') this.timeAcc += dt
    if (this.timeAcc >= 5) this.flushTime()
  }

  private flushTime(ui = true): void {
    if (this.destroyed) return
    const secs = this.timeAcc
    this.timeAcc = 0
    const due = this.recorder.addTime(secs)
    if (!ui) return
    this.sun.set(sunProgress(save(), now()))
    if (due && !this.sunsetDue) {
      this.sunsetDue = true
      // Standing at a camp already: nothing left to finish.
      const s = this.session
      const here = s.el(s.elementId)
      if (s.phase === 'ready' && !s.aim && here.kind === 'ledge' && here.camp && !this.prompt && !this.map) this.showSunset()
    }
  }

  private showSunset(): void {
    if (this.sunsetShown || this.destroyed) return
    this.sunsetShown = true
    this.hideBeta()
    this.bubble.hide()
    this.stage.setFrozen('sunset', true)
    this.stage.setFrozen('arrive', false)
    this.prompt?.close()
    const p = sunsetPrompt(this.goat, sunsetLine(now()), () => this.nav('/camp'))
    this.prompt = { id: 'sunset', close: p.close }
  }

  // -------------------------------------------------------------------------------------------
  // Entering, and the Beta Map at the top

  private enterCard(): void {
    const title = this.night ? CLIMB_COPY.nightPitch(this.level.index) : CLIMB_COPY.pitch(this.level.index)
    const full = `${title} · ${this.level.title}`
    this.cards.push(() => wordCard(this.words, 'pitch', full) ?? toast(this.level.title, { title, icon: 'mountain', tone: this.level.zone, durationMs: 2800 }))
  }

  /** The pitch after this one, open or not (null after the summit pitch and the lesson). */
  private followingPitch(): LevelId | null {
    const i = PITCH_IDS.indexOf(this.levelId as (typeof PITCH_IDS)[number])
    return i >= 0 ? (PITCH_IDS[i + 1] ?? null) : null
  }

  private nextPitch(): LevelId | null {
    const next = this.followingPitch()
    if (!next) return null
    const d = save()
    const open = this.night ? isNightOpen(d) : isPitchOpen(d, next)
    return open ? next : null
  }

  /**
   * After the summit pitch: the Sky Lake finale — the first day send (until it has been seen), and the
   * short moonlight ending after every night send. Null for every other pitch.
   */
  private finaleNext(): string | null {
    if (!this.level.finale) return null
    if (this.night) return canShowFinale(true) ? finalePath({ night: true }) : null
    return canShowFinale(false) && !save().summit.finaleSeen ? finalePath() : null
  }

  private openMap(failed: number[][], route: number[][], attempts: number): void {
    if (this.destroyed || this.map) return
    this.bubble.hide()
    this.stage.setFrozen('map', true)
    const q = this.night ? '?night=1' : ''
    const next = this.nextPitch()
    const finale = this.finaleNext()
    // The next pitch is still in the fog: the Beta Map says why, and offers a brave thing to log.
    const locked = !finale && !next && !this.night && this.followingPitch() !== null
    // When the sun has gone down, more climbing waits for tomorrow (the finale always plays).
    const orSunset = (go: () => void) => () => (this.sunsetDue ? this.showSunset() : go())
    const card = betaMapCard({
      attempts,
      seen: this.words.seen(),
      onSeen: (w: GlossaryWord) => this.words.mark(w),
      onNext: finale
        ? () => this.nav(finale, { replace: true })
        : next
          ? orSunset(() => this.nav(`/climb/${next}${q}`, { replace: true }))
          : null,
      onLocked: locked ? () => this.nav('/log') : null,
      nextLabel: finale ? CLIMB_COPY.map.skyLake : undefined,
      // The first time, Sky Lake is where this climb ends: nothing else to pick.
      onlyNext: finale !== null && !this.night,
      onAgain: orSunset(() => this.nav(`/climb/${this.levelId}${q}`, { replace: true })),
      onCamp: () => this.nav('/camp'),
      regionTop: () => this.regionTop(),
    })
    this.map = card
    this.hud.classList.add('has-map')
    this.hud.appendChild(card.el)
    this.stage.showMap(failed, route, () => card.region())
  }

  private regionTop(): number {
    const cam = this.stage.camera
    return cam.insets.top + 8
  }
}
