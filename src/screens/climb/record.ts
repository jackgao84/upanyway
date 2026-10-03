/**
 * The climb's record keeping: turns engine events into changes to her save (runs, attempts, poses,
 * badges, found holds and crumbly ledges, Looks Scary answers, climb time) and reports back the facts
 * the screen needs for goat lines and cards. Pure over SaveData (no DOM), so it is unit-tested in
 * node — including that test mode writes nothing to her record.
 *
 * The lesson uses it with level id 'lesson' and no run: its whipper counts (stats, pose, first-whipper
 * badge) but no pitch record is made, so nothing shows up as a pitch anywhere else.
 */
import type { BadgeId } from '../../content/badges'
import type { EngineEvents, LandInfo } from '../../game/events'
import type { LevelId, ZoneId } from '../../game/types'
import {
  currentRun,
  markCrumbleFound,
  recordBetaAsked,
  recordBigLeapTried,
  recordLanding,
  recordPose,
  recordRopeCatch,
  recordScaryForecast,
  recordScaryReally,
  recordSend,
  recordWhipper,
  revealHold,
  startRun,
} from '../../model/attempts'
import { evaluateBadges } from '../../model/badges'
import { addClimbSeconds, isSunset } from '../../model/climbTime'
import type { PitchRun, SaveData, SendRecord } from '../../storage/schema'

export interface RecorderDeps {
  save(): SaveData
  update(fn: (d: SaveData) => void): void
  now(): Date
}

export interface ResumeInfo {
  /** Camp to start at (the run's last camp, or the start camp). */
  startId: string
  revealed: string[]
  foundCrumbles: string[]
  /** The run's most recent failed arcs (newest last), to show as chalk again. */
  recentChalk: number[][]
  /** True when this climb continues a run already in progress. */
  resumed: boolean
}

export interface WhipperFacts {
  whippersThisRun: number
  fallsAtSpot: number
  /** First time this pose was ever seen (never in test mode). */
  newPose: boolean
  /** Her very first whipper (stats were at 0 before it). */
  firstEver: boolean
  badges: BadgeId[]
}

export interface LandingFacts {
  newCamp: boolean
  /** Tries from the spot she leapt from, this one included (falls there this run + 1). */
  attemptsHere: number
}

export interface SendFacts {
  send: SendRecord
  /** First send she has ever made (nothing changes in test mode). */
  firstSend: boolean
  badges: BadgeId[]
}

export class ClimbRecorder {
  private startedRun = false

  constructor(
    private readonly deps: RecorderDeps,
    readonly levelId: LevelId,
    readonly night: boolean,
    /** Pitches keep a run (resume at the last camp, beta map); the lesson doesn't. */
    private readonly keepsRun: boolean,
  ) {}

  private get testMode(): boolean {
    return this.deps.save().testMode
  }

  /** Begin (or resume) the run. Call once before the session is made. */
  begin(startCampId: string): ResumeInfo {
    const d0 = this.deps.save()
    const before = this.keepsRun ? currentRun(d0, this.levelId, this.night) : null
    let run: PitchRun | null = before
    if (this.keepsRun) {
      this.deps.update((d) => {
        run = startRun(d, this.levelId, startCampId, this.night, this.deps.now())
        // A resumed run starts again at its last camp, so its bright route goes back there too (she
        // may have left from higher up).
        if (before) recordRopeCatch(d, this.levelId, this.night)
      })
      this.startedRun = true
    }
    const d = this.deps.save()
    const p = d.pitches[this.levelId]
    const r = run as PitchRun | null
    return {
      startId: r ? r.lastCampId : startCampId,
      revealed: p ? p.revealedHolds.slice() : [],
      foundCrumbles: p ? p.foundCrumbles.slice() : [],
      recentChalk: r ? r.failedArcs.slice(-3) : [],
      resumed: before !== null,
    }
  }

  run(): PitchRun | null {
    if (!this.startedRun) return null
    return currentRun(this.deps.save(), this.levelId, this.night)
  }

  /** Falls from this spot this run (beta: a hint after 3, a ghost after 6). */
  fallsAt(spotId: string): number {
    return this.run()?.fallsBySpot[spotId] ?? 0
  }

  landing(info: LandInfo, fromId: string | null): LandingFacts {
    const falls = fromId ? this.fallsAt(fromId) : 0
    let newCamp = false
    if (this.startedRun) {
      this.deps.update((d) => {
        newCamp = recordLanding(d, this.levelId, this.night, {
          elementId: info.id,
          routeIndex: info.routeIndex,
          isCamp: info.isCamp,
          arc: info.arc,
        }).newCamp
      })
    }
    return { newCamp, attemptsHere: falls + 1 }
  }

  whipper(e: EngineEvents['whipper']): WhipperFacts {
    const facts: WhipperFacts = { whippersThisRun: 0, fallsAtSpot: 0, newPose: false, firstEver: false, badges: [] }
    this.deps.update((d) => {
      facts.firstEver = !d.testMode && d.stats.whippers === 0
      if (this.keepsRun) {
        const r = recordWhipper(d, this.levelId, this.night, {
          spotId: e.spotId,
          arc: e.arc,
          kind: e.kind,
          restId: e.landedId,
        })
        facts.whippersThisRun = r.whippersThisRun
        facts.fallsAtSpot = r.fallsAtSpot
      } else if (!d.testMode) {
        // The lesson: the whipper counts, but no pitch record is made for it.
        d.stats.whippers++
      }
      facts.newPose = recordPose(d, e.poseId, this.deps.now()).isNew
      facts.badges = evaluateBadges(d, this.deps.now())
    })
    return facts
  }

  ropeCatch(): void {
    if (!this.startedRun) return
    this.deps.update((d) => recordRopeCatch(d, this.levelId, this.night))
  }

  send(): SendFacts {
    let send: SendRecord | null = null
    let firstSend = false
    let badges: BadgeId[] = []
    this.deps.update((d) => {
      firstSend = !d.testMode && d.stats.sends === 0
      send = recordSend(d, this.levelId, this.night, this.deps.now())
      badges = evaluateBadges(d, this.deps.now())
    })
    this.startedRun = false
    return { send: send as unknown as SendRecord, firstSend, badges }
  }

  /** A non-cancelled launch from a Big Leap's start toward its target. */
  bigLeapTried(): BadgeId[] {
    let badges: BadgeId[] = []
    this.deps.update((d) => {
      recordBigLeapTried(d)
      badges = evaluateBadges(d, this.deps.now())
    })
    return badges
  }

  /** She took a hint or tapped "Show me". */
  betaAsked(): BadgeId[] {
    let badges: BadgeId[] = []
    this.deps.update((d) => {
      recordBetaAsked(d)
      badges = evaluateBadges(d, this.deps.now())
    })
    return badges
  }

  revealHolds(ids: readonly string[]): void {
    if (this.testMode || ids.length === 0) return
    this.deps.update((d) => {
      for (const id of ids) revealHold(d, this.levelId, id)
    })
  }

  crumbleFound(id: string): void {
    if (this.testMode) return
    this.deps.update((d) => markCrumbleFound(d, this.levelId, id))
  }

  scaryForecast(zone: ZoneId, n: number): void {
    if (this.testMode) return
    this.deps.update((d) => recordScaryForecast(d, zone, n, this.deps.now()))
  }

  scaryReally(zone: ZoneId, n: number): void {
    if (this.testMode) return
    this.deps.update((d) => recordScaryReally(d, zone, n))
  }

  /** The goat has explained the rope (first rope catch). Not in test mode. */
  ropeExplained(): void {
    if (this.testMode || this.deps.save().flags.ropeExplained) return
    this.deps.update((d) => {
      d.flags.ropeExplained = true
    })
  }

  /** Add climbing seconds (never in test mode). Returns true once today's time is up. */
  addTime(seconds: number): boolean {
    if (seconds > 0 && !this.testMode) this.deps.update((d) => addClimbSeconds(d, seconds, this.deps.now()))
    return isSunset(this.deps.save(), this.deps.now())
  }
}
