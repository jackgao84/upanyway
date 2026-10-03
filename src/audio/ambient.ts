/**
 * Gentle generative ambient, one character per zone: a slow pad that drifts through four chords
 * and sparse pentatonic plucks wandering over it (a little echo, never a beat). Night is softer,
 * slower, darker and lower.
 *
 *   meadow   bright: G major pentatonic, music-box plucks, easy tempo
 *   hollow   mysterious-cozy: D dorian, kalimba with a long echo, slow
 *   crumble  earthy: A minor pentatonic, wooden marimba, a low drone
 *   ridge    airy: E suspended pentatonic, soft flute, a breath of wind underneath
 *   cloud    dreamy: F lydian, glassy bells, slow swells, long echo
 *   summit   warm: D major pentatonic, harp, a bit more motion
 *
 * CPU: one setInterval (250 ms) schedules ~1.2 s ahead; a pluck is 2–4 nodes, a chord ~5
 * oscillators, all disconnected when they end. Nothing runs while stopped, muted, music-off or
 * before the audio unlock: start() remembers the wish and begins once audio.onChange says it can
 * (settings.music and mute arrive through audio.setMusic / audio.setMuted, which main.ts syncs).
 *
 * `renderAmbientInto()` schedules a zone into any context (the dev lab's OfflineAudioContext check).
 */
import type { ZoneId } from '../game/types'
import { createRng, type Rng } from '../model/rng'
import { audio } from './audio'
import { noiseBuffer } from './sfx'

type PluckKind = 'celesta' | 'kalimba' | 'marimba' | 'flute' | 'glass' | 'harp'

interface ZoneMusic {
  /** MIDI note of the tonal centre (pad voicings are relative to it). */
  root: number
  /** Scale, semitones in an octave above the root's pitch class. */
  scale: readonly number[]
  /** Pad voicings, semitones from the root, played in order and looped. */
  chords: readonly (readonly number[])[]
  bpm: number
  /** Beats per chord. */
  chordBeats: number
  /** Chance of a pluck on each beat. */
  density: number
  /** MIDI range of the plucks. */
  low: number
  high: number
  pluck: PluckKind
  pluckGain: number
  padGain: number
  padCutoff: number
  /** Pad attack (and roughly its release), seconds. */
  padSwell: number
  /** Echo: send level, delay seconds, feedback. */
  echo: number
  echoTime: number
  echoFeedback: number
  /** Breathy wind bed level (0 = none). */
  air: number
}

const ZONES: Record<ZoneId, ZoneMusic> = {
  meadow: {
    root: 55,
    scale: [0, 2, 4, 7, 9],
    // G add9 · C add9 · Em7 · D sus4
    chords: [
      [-12, -5, 2, 4],
      [-7, 0, 7, 9],
      [-3, 4, 7, 12],
      [-5, 2, 7, 12],
    ],
    bpm: 84,
    chordBeats: 8,
    density: 0.5,
    low: 67,
    high: 86,
    pluck: 'celesta',
    pluckGain: 0.11,
    padGain: 0.04,
    padCutoff: 1300,
    padSwell: 2.2,
    echo: 0.22,
    echoTime: 0.36,
    echoFeedback: 0.3,
    air: 0,
  },
  hollow: {
    root: 50,
    scale: [0, 2, 3, 5, 7, 10],
    // Dm9 · Bbmaj7 · Gm9 · C add9
    chords: [
      [-12, 3, 7, 14],
      [-4, 3, 7, 12],
      [-7, 3, 7, 12],
      [-2, 5, 12, 14],
    ],
    bpm: 64,
    chordBeats: 8,
    density: 0.4,
    low: 62,
    high: 81,
    pluck: 'kalimba',
    pluckGain: 0.09,
    padGain: 0.042,
    padCutoff: 800,
    padSwell: 3,
    echo: 0.38,
    echoTime: 0.47,
    echoFeedback: 0.42,
    air: 0,
  },
  crumble: {
    root: 45,
    scale: [0, 3, 5, 7, 10],
    // Am7 · Dm7 · Fmaj7 · G
    chords: [
      [0, 7, 10, 15],
      [5, 8, 12, 15],
      [-4, 3, 7, 12],
      [-2, 5, 10, 14],
    ],
    bpm: 76,
    chordBeats: 8,
    density: 0.55,
    low: 57,
    high: 74,
    pluck: 'marimba',
    pluckGain: 0.175,
    padGain: 0.042,
    padCutoff: 650,
    padSwell: 2,
    echo: 0.16,
    echoTime: 0.395,
    echoFeedback: 0.25,
    air: 0,
  },
  ridge: {
    root: 52,
    scale: [0, 2, 5, 7, 10],
    // E sus4 add9 · D add9 · A sus2 · Bm7 sus
    chords: [
      [-12, -5, 5, 14],
      [-2, 5, 12, 14],
      [-7, 0, 7, 14],
      [-5, 2, 10, 14],
    ],
    bpm: 70,
    chordBeats: 8,
    density: 0.38,
    low: 64,
    high: 83,
    pluck: 'flute',
    pluckGain: 0.125,
    padGain: 0.034,
    padCutoff: 1100,
    padSwell: 3,
    echo: 0.3,
    echoTime: 0.43,
    echoFeedback: 0.35,
    air: 0.042,
  },
  cloud: {
    root: 53,
    scale: [0, 2, 4, 7, 11],
    // Fmaj9 · Dm9 · Bbmaj7#11 · C add9
    chords: [
      [-12, 4, 11, 14],
      [-3, 4, 7, 11],
      [-7, -3, 4, 11],
      [-5, 2, 9, 11],
    ],
    bpm: 56,
    chordBeats: 8,
    density: 0.4,
    low: 65,
    high: 89,
    pluck: 'glass',
    pluckGain: 0.065,
    padGain: 0.038,
    padCutoff: 1000,
    padSwell: 4,
    echo: 0.45,
    echoTime: 0.54,
    echoFeedback: 0.45,
    air: 0,
  },
  summit: {
    root: 50,
    scale: [0, 2, 4, 7, 9],
    // D add9 · Gmaj7 · Bm7 · A
    chords: [
      [-12, 4, 7, 14],
      [-7, 0, 4, 9],
      [-3, 4, 7, 12],
      [-5, 2, 7, 11],
    ],
    bpm: 80,
    chordBeats: 8,
    density: 0.58,
    low: 62,
    high: 83,
    pluck: 'harp',
    pluckGain: 0.095,
    padGain: 0.047,
    padCutoff: 1200,
    padSwell: 2.4,
    echo: 0.24,
    echoTime: 0.375,
    echoFeedback: 0.3,
    air: 0,
  },
}

/** Night: same zone, softer, slower, darker, a little lower and sparser. */
function nightOf(m: ZoneMusic): ZoneMusic {
  return {
    ...m,
    bpm: Math.round(m.bpm * 0.85),
    density: m.density * 0.7,
    low: m.low - 5,
    high: m.high - 7,
    pluckGain: m.pluckGain * 0.95,
    padGain: m.padGain * 0.72,
    padCutoff: m.padCutoff * 0.65,
    padSwell: m.padSwell * 1.4,
    echo: m.echo * 1.15,
    air: m.air * 0.7,
  }
}

export const AMBIENT_ZONES: readonly ZoneId[] = ['meadow', 'hollow', 'crumble', 'ridge', 'cloud', 'summit']

const LOOKAHEAD = 1.2
const TICK_MS = 250
const FIRST_FADE = 2.5
const CROSSFADE = 3
const STOP_FADE = 1.2
const QUICK_FADE = 0.6
/** Ambient sits well under the sound effects (about 8–10 dB, A-weighted). */
const LEVEL = 0.42

const midiHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12)

// ---------------------------------------------------------------------------------------------
// One zone playing into one destination

interface Note {
  end: number
  nodes: AudioNode[]
  sources: AudioScheduledSourceNode[]
}

const padWaves = new WeakMap<BaseAudioContext, PeriodicWave>()

/** A soft, warm waveform (a few gentle harmonics) shared by every pad note in this context. */
function padWave(ctx: BaseAudioContext): PeriodicWave {
  let wave = padWaves.get(ctx)
  if (!wave) {
    const amps = [0, 1, 0.42, 0.2, 0.1, 0.05, 0.02]
    const real = new Float32Array(amps.length)
    const imag = new Float32Array(amps)
    wave = ctx.createPeriodicWave(real, imag)
    padWaves.set(ctx, wave)
  }
  return wave
}

class ZoneVoice {
  readonly output: GainNode
  private readonly pluckBus: GainNode
  private readonly padBus: BiquadFilterNode
  private readonly persistent: AudioNode[] = []
  private readonly persistentSources: AudioScheduledSourceNode[] = []
  private readonly notes = new Set<Note>()
  private readonly pool: number[]
  private readonly beat: number
  private nextBeat: number
  private chordIndex = -1
  private chordEndsAt = -Infinity
  private chordPcs: number[] = []
  private melody: number
  private phrase = 0
  private rest = 0
  private fade = { from: 0, to: 0, t0: 0, t1: 0 }
  /** When fading out for good: dispose once ctx time passes this. */
  disposeAt = Infinity
  disposed = false

  constructor(
    readonly ctx: BaseAudioContext,
    dest: AudioNode,
    readonly zone: ZoneId,
    readonly night: boolean,
    private readonly m: ZoneMusic,
    private readonly r: Rng,
    start: number,
  ) {
    this.output = ctx.createGain()
    this.output.gain.value = 0
    this.output.connect(dest)
    this.persistent.push(this.output)

    // Pad: a lowpass that breathes slowly.
    this.padBus = ctx.createBiquadFilter()
    this.padBus.type = 'lowpass'
    this.padBus.frequency.value = m.padCutoff
    this.padBus.Q.value = 0.5
    this.padBus.connect(this.output)
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.045 + r.next() * 0.02
    const lfoDepth = ctx.createGain()
    lfoDepth.gain.value = m.padCutoff * 0.22
    lfo.connect(lfoDepth)
    lfoDepth.connect(this.padBus.frequency)
    lfo.start(start)
    this.persistent.push(this.padBus, lfo, lfoDepth)
    this.persistentSources.push(lfo)

    // Plucks: dry + echo (feedback loop through a lowpass so repeats get darker).
    this.pluckBus = ctx.createGain()
    this.pluckBus.connect(this.output)
    const send = ctx.createGain()
    send.gain.value = m.echo
    const delay = ctx.createDelay(2)
    delay.delayTime.value = m.echoTime
    const loopLp = ctx.createBiquadFilter()
    loopLp.type = 'lowpass'
    loopLp.frequency.value = 1800
    const feedback = ctx.createGain()
    feedback.gain.value = m.echoFeedback
    this.pluckBus.connect(send)
    send.connect(delay)
    delay.connect(loopLp)
    loopLp.connect(feedback)
    feedback.connect(delay)
    loopLp.connect(this.output)
    this.persistent.push(this.pluckBus, send, delay, loopLp, feedback)

    // Wind bed (ridge).
    if (m.air > 0) {
      const noise = ctx.createBufferSource()
      noise.buffer = noiseBuffer(ctx, 'white')
      noise.loop = true
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = 620
      bp.Q.value = 0.7
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 1300
      const level = ctx.createGain()
      level.gain.value = m.air
      const sway = ctx.createOscillator()
      sway.frequency.value = 0.08 + r.next() * 0.03
      const swayDepth = ctx.createGain()
      swayDepth.gain.value = m.air * 0.7
      sway.connect(swayDepth)
      swayDepth.connect(level.gain)
      noise.connect(bp)
      bp.connect(lp)
      lp.connect(level)
      level.connect(this.output)
      noise.start(start, r.next() * 1.5)
      sway.start(start)
      this.persistent.push(noise, bp, lp, level, sway, swayDepth)
      this.persistentSources.push(noise, sway)
    }

    this.pool = []
    for (let n = m.low; n <= m.high; n++) {
      const pc = (((n - m.root) % 12) + 12) % 12
      if (m.scale.includes(pc)) this.pool.push(n)
    }
    this.melody = Math.floor(this.pool.length / 2)
    this.beat = 60 / m.bpm
    this.nextBeat = start + 0.15
  }

  // --- level --------------------------------------------------------------------------------

  private levelAt(t: number): number {
    const f = this.fade
    if (t <= f.t0) return f.from
    if (t >= f.t1) return f.to
    return f.from + ((f.to - f.from) * (t - f.t0)) / (f.t1 - f.t0)
  }

  fadeTo(level: number, t: number, seconds: number): void {
    const from = this.levelAt(t)
    this.fade = { from, to: level, t0: t, t1: t + seconds }
    const g = this.output.gain
    g.cancelScheduledValues(t)
    g.setValueAtTime(from, t)
    g.linearRampToValueAtTime(level, t + seconds)
  }

  fadeOutAndDispose(t: number, seconds: number): void {
    this.fadeTo(0, t, seconds)
    this.disposeAt = t + seconds + 0.05
  }

  /** Back to full level (a stop() quickly followed by start() of the same zone). */
  revive(t: number): void {
    this.disposeAt = Infinity
    this.fadeTo(LEVEL, t, QUICK_FADE)
  }

  get fadingOut(): boolean {
    return this.disposeAt !== Infinity
  }

  // --- scheduling -----------------------------------------------------------------------------

  /** Schedule every beat that starts before `until`. Late beats (throttled timers) are skipped. */
  schedule(until: number, now = 0): void {
    if (this.disposed) return
    // Belt and braces: free any note whose 'ended' event never came.
    for (const note of this.notes) if (note.end < now - 1) this.release(note)
    while (this.nextBeat < now - 0.05) this.nextBeat += this.beat
    while (this.nextBeat < until) {
      this.onBeat(this.nextBeat)
      this.nextBeat += this.beat
    }
  }

  private onBeat(t: number): void {
    const m = this.m
    let downbeat = false
    if (t >= this.chordEndsAt - 0.01) {
      downbeat = true
      this.chordIndex = (this.chordIndex + 1) % m.chords.length
      const chordLen = m.chordBeats * this.beat
      this.chordEndsAt = t + chordLen
      this.playChord(m.chords[this.chordIndex], t, chordLen)
    }
    if (this.rest > 0) {
      this.rest--
      return
    }
    if (this.r.next() >= (downbeat ? Math.min(1, m.density + 0.25) : m.density)) return
    this.step(downbeat)
    const jitter = (this.r.next() - 0.5) * 0.024
    const vel = (downbeat ? 1 : 0.65 + this.r.next() * 0.3) * m.pluckGain
    this.playPluck(this.pool[this.melody], t + Math.max(0, jitter), vel)
    // Now and then a quiet neighbour note on the off-beat.
    if (this.r.next() < 0.16) {
      const next = Math.min(this.pool.length - 1, Math.max(0, this.melody + (this.r.next() < 0.5 ? -1 : 1)))
      this.playPluck(this.pool[next], t + this.beat / 2, vel * 0.6)
    }
    this.phrase++
    if (this.phrase >= 5 + this.r.int(4)) {
      this.phrase = 0
      this.rest = 2 + this.r.int(3)
    }
  }

  /** Melody: a gentle random walk over the scale; chord tones on the downbeat. */
  private step(downbeat: boolean): void {
    const moves = [-2, -1, -1, 1, 1, 2, 0, 3, -3]
    let i = this.melody + moves[this.r.int(moves.length)]
    if (i < 0) i = -i
    if (i >= this.pool.length) i = 2 * (this.pool.length - 1) - i
    i = Math.min(this.pool.length - 1, Math.max(0, i))
    if (downbeat && this.chordPcs.length > 0) {
      let best = i
      let bestDist = Infinity
      for (let j = 0; j < this.pool.length; j++) {
        const pc = (((this.pool[j] - this.m.root) % 12) + 12) % 12
        if (!this.chordPcs.includes(pc)) continue
        const d = Math.abs(j - i)
        if (d < bestDist) {
          bestDist = d
          best = j
        }
      }
      i = best
    }
    this.melody = i
  }

  private track(note: Note): void {
    this.notes.add(note)
    const ended = note.sources[0]
    if (ended) ended.onended = () => this.release(note)
  }

  private release(note: Note): void {
    if (!this.notes.delete(note)) return
    for (const n of note.nodes) {
      try {
        n.disconnect()
      } catch {
        // Already gone.
      }
    }
  }

  private playChord(chord: readonly number[], t: number, length: number): void {
    const ctx = this.ctx
    const m = this.m
    this.chordPcs = chord.map((s) => ((s % 12) + 12) % 12)
    const swellT = m.padSwell
    const end = t + length + swellT * 1.2
    const env = ctx.createGain()
    env.gain.setValueAtTime(0, t)
    env.gain.linearRampToValueAtTime(m.padGain / Math.sqrt(chord.length), t + swellT)
    env.gain.setValueAtTime(m.padGain / Math.sqrt(chord.length), t + length)
    env.gain.linearRampToValueAtTime(0, end)
    env.connect(this.padBus)
    const note: Note = { end, nodes: [env], sources: [] }
    const wave = padWave(ctx)
    chord.forEach((semi, k) => {
      const hz = midiHz(m.root + semi)
      const count = k === 0 ? 2 : 1
      for (let c = 0; c < count; c++) {
        const o = ctx.createOscillator()
        o.setPeriodicWave(wave)
        // A few cents apart so the pad shimmers instead of buzzing.
        o.frequency.value = hz * (1 + (c === 0 ? (this.r.next() - 0.5) * 0.003 : 0.0035))
        o.connect(env)
        o.start(t)
        o.stop(end + 0.05)
        note.nodes.push(o)
        note.sources.push(o)
      }
    })
    this.track(note)
  }

  private playPluck(midi: number, t: number, vel: number): void {
    const ctx = this.ctx
    const f = midiHz(midi)
    const note: Note = { end: t, nodes: [], sources: [] }
    const partial = (type: OscillatorType, hz: number, attack: number, peak: number, decay: number): void => {
      const o = ctx.createOscillator()
      o.type = type
      o.frequency.value = hz
      const g = ctx.createGain()
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack)
      g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay)
      o.connect(g)
      g.connect(this.pluckBus)
      o.start(t)
      note.end = Math.max(note.end, t + attack + decay + 0.02)
      note.nodes.push(o, g)
      note.sources.push(o)
    }
    switch (this.m.pluck) {
      case 'celesta':
        partial('sine', f, 0.004, vel, 1.1)
        partial('sine', f * 4, 0.003, vel * 0.1, 0.22)
        break
      case 'kalimba':
        partial('sine', f, 0.005, vel, 1.6)
        partial('sine', f * 5.95, 0.002, vel * 0.07, 0.06)
        break
      case 'marimba':
        partial('sine', f, 0.004, vel, 0.6)
        partial('sine', f * 3.98, 0.002, vel * 0.18, 0.12)
        break
      case 'flute':
        partial('triangle', f, 0.07, vel, 1.2)
        partial('sine', f * 2, 0.09, vel * 0.08, 0.6)
        break
      case 'glass':
        partial('sine', f, 0.006, vel, 2.4)
        partial('sine', f * 2.01, 0.004, vel * 0.22, 1)
        break
      case 'harp':
        partial('triangle', f, 0.005, vel, 1.4)
        partial('sine', f * 2, 0.004, vel * 0.14, 0.4)
        break
    }
    for (const s of note.sources) s.stop(note.end)
    this.track(note)
  }

  /** Stop everything now and disconnect. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    const t = this.ctx.currentTime
    for (const note of [...this.notes]) {
      for (const s of note.sources) {
        try {
          s.stop(t)
        } catch {
          // Not started yet or already stopped.
        }
      }
      this.release(note)
    }
    for (const s of this.persistentSources) {
      try {
        s.stop(t)
      } catch {
        // Already stopped.
      }
    }
    for (const n of this.persistent) {
      try {
        n.disconnect()
      } catch {
        // Already gone.
      }
    }
  }
}

function musicFor(zone: ZoneId, night: boolean): ZoneMusic {
  const m = ZONES[zone] ?? ZONES.meadow
  return night ? nightOf(m) : m
}

/**
 * Schedule `seconds` of a zone into any context (fading in over the first 2.5 s), for offline
 * rendering in the dev lab. `layer` isolates the pad (+ wind bed) or the plucks to balance them.
 * Returns nothing; render the context afterwards.
 */
export function renderAmbientInto(
  ctx: BaseAudioContext,
  dest: AudioNode,
  zone: ZoneId,
  night: boolean,
  seconds: number,
  seed: number | string = zone,
  layer: 'all' | 'pad' | 'plucks' = 'all',
): void {
  const base = musicFor(zone, night)
  const m = layer === 'pad' ? { ...base, pluckGain: 0 } : layer === 'plucks' ? { ...base, padGain: 0, air: 0 } : base
  const v = new ZoneVoice(ctx, dest, zone, night, m, createRng(seed), 0)
  v.fadeTo(LEVEL, 0, FIRST_FADE)
  v.schedule(seconds, 0)
}

// ---------------------------------------------------------------------------------------------
// The live player

let wanted: { zone: ZoneId; night: boolean } | null = null
let current: ZoneVoice | null = null
const fading = new Set<ZoneVoice>()
let timer: ReturnType<typeof setInterval> | null = null
let subscribed = false
const rng = createRng('ambient')

function canPlay(): { ctx: AudioContext; dest: AudioNode } | null {
  if (!wanted || audio.isMuted() || !audio.isMusicOn()) return null
  const ctx = audio.ctx()
  const dest = audio.musicOut()
  return ctx && dest ? { ctx, dest } : null
}

function retire(v: ZoneVoice, seconds: number): void {
  const t = v.ctx.currentTime
  if (seconds <= 0) {
    v.dispose()
    fading.delete(v)
    return
  }
  v.fadeOutAndDispose(t, seconds)
  fading.add(v)
}

function tick(): void {
  const ctx = audio.ctx()
  if (!ctx) {
    // Suspended or interrupted: time has stopped, so nothing can fade. Let go of everything;
    // sync() starts again (with a fade-in) when audio is back.
    disposeAll()
    return
  }
  const t = ctx.currentTime
  for (const v of fading) {
    if (t >= v.disposeAt) {
      v.dispose()
      fading.delete(v)
    }
  }
  if (current) current.schedule(t + LOOKAHEAD, t)
  if (!current && fading.size === 0) stopTimer()
}

function startTimer(): void {
  if (timer !== null) return
  timer = setInterval(tick, TICK_MS)
}

function stopTimer(): void {
  if (timer === null) return
  clearInterval(timer)
  timer = null
}

function disposeAll(): void {
  if (current) current.dispose()
  current = null
  for (const v of fading) v.dispose()
  fading.clear()
  stopTimer()
}

function sync(): void {
  const live = canPlay()
  if (!live) {
    if (!audio.ctx()) {
      disposeAll()
      return
    }
    if (current) {
      // Muted, music off or stopped: fade out (the bus fades too), then free everything.
      retire(current, wanted ? QUICK_FADE : STOP_FADE)
      current = null
    }
    if (fading.size > 0) startTimer()
    return
  }
  const { ctx, dest } = live
  const want = wanted as { zone: ZoneId; night: boolean }
  const t = ctx.currentTime
  if (current && current.ctx === ctx && current.zone === want.zone && current.night === want.night) {
    startTimer()
    return
  }
  // A voice for this zone still fading out (stop then start again): bring it back.
  for (const v of fading) {
    if (v.ctx === ctx && v.zone === want.zone && v.night === want.night && !v.disposed) {
      fading.delete(v)
      if (current) retire(current, CROSSFADE)
      v.revive(t)
      current = v
      startTimer()
      tick()
      return
    }
  }
  const hadSound = !!current || fading.size > 0
  if (current) retire(current, CROSSFADE)
  try {
    current = new ZoneVoice(ctx, dest, want.zone, want.night, musicFor(want.zone, want.night), rng, t)
    current.fadeTo(LEVEL, t, hadSound ? CROSSFADE : FIRST_FADE)
  } catch (err) {
    console.warn('[upanyway] ambient failed to start', err)
    current = null
  }
  startTimer()
  tick()
}

function subscribe(): void {
  if (subscribed) return
  subscribed = true
  audio.onChange(sync)
}

export const ambient = {
  /**
   * Play a zone's ambient (fades in; crossfades if another zone is playing). Safe before the audio
   * unlock: it starts as soon as audio can. Calling it again with the same zone does nothing.
   */
  start(zone: ZoneId, night = false): void {
    subscribe()
    wanted = { zone, night: !!night }
    sync()
  },

  /** Fade out and stop scheduling. Safe to call when nothing is playing. */
  stop(): void {
    wanted = null
    sync()
  },

  /** Crossfade to another zone (or day/night). Does nothing while stopped. */
  setZone(zone: ZoneId, night = false): void {
    if (!wanted) return
    wanted = { zone, night: !!night }
    sync()
  },

  /** What start() last asked for (null when stopped). */
  current(): { zone: ZoneId; night: boolean } | null {
    return wanted ? { ...wanted } : null
  },
}
