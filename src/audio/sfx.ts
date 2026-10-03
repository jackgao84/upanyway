/**
 * Sound effects, all synthesised (no audio files). Every sound is soft, warm and short (< 1.5 s):
 * filtered noise for air and dust, sines and triangles for voices and bells, nothing square or
 * buzzy left unfiltered. Peaks sit around 0.1–0.3 on the sfx bus so the master compressor
 * barely touches them.
 *
 * Rules:
 * - No context (before the first tap, during an interruption) or muted → return silently. Mute is
 *   also applied on the bus (audio.ts), so a sound already playing fades with the toggle.
 * - Cheap: a sound is a handful of nodes that disconnect themselves when they end; noise comes from
 *   two buffers made once per context and played from a random offset; at most MAX_VOICES sounds
 *   overlap, and the same sound can't restart within MIN_GAP (events that fire together don't stack).
 * - Small seeded pitch/timing variation so repeats never sound robotic (and the lab is repeatable).
 *
 * `renderSfxInto()` plays a recipe into any context/destination: the dev lab uses it with an
 * OfflineAudioContext to check every sound for level, length and clipping.
 */
import { createRng, type Rng } from '../model/rng'
import { audio } from './audio'

export type BleatMood = 'happy' | 'nervous' | 'wheee' | 'laugh'
export const BLEAT_MOODS: readonly BleatMood[] = ['happy', 'nervous', 'wheee', 'laugh']

export type SfxName =
  | 'whoosh'
  | 'land'
  | 'boing'
  | 'bleat'
  | 'clack'
  | 'chalk'
  | 'crumble'
  | 'gust'
  | 'reveal'
  | 'creak'
  | 'snore'
  | 'splash'
  | 'chime'
  | 'tap'

/** whoosh/gust: 0–1 strength; land: soft (true = catching a hold); bleat: its mood. */
export type SfxArg = number | boolean | BleatMood | undefined

/** Every sound and the argument variants the lab renders. */
export const SFX_VARIANTS: readonly { name: SfxName; arg?: SfxArg; label: string }[] = [
  { name: 'whoosh', arg: 0.2, label: 'whoosh (small leap)' },
  { name: 'whoosh', arg: 0.6, label: 'whoosh (medium leap)' },
  { name: 'whoosh', arg: 1, label: 'whoosh (full power)' },
  { name: 'land', arg: false, label: 'land (ledge)' },
  { name: 'land', arg: true, label: 'land (soft: hold)' },
  { name: 'boing', label: 'boing (rope catch)' },
  { name: 'bleat', arg: 'happy', label: 'bleat happy' },
  { name: 'bleat', arg: 'nervous', label: 'bleat nervous' },
  { name: 'bleat', arg: 'wheee', label: 'bleat wheee' },
  { name: 'bleat', arg: 'laugh', label: 'bleat laugh' },
  { name: 'clack', label: 'clack (cairn stone)' },
  { name: 'chalk', label: 'chalk puff' },
  { name: 'crumble', label: 'crumble' },
  { name: 'gust', arg: 0.3, label: 'gust (light)' },
  { name: 'gust', arg: 1, label: 'gust (strong)' },
  { name: 'reveal', label: 'reveal (hidden hold)' },
  { name: 'creak', label: 'creak (rope bridge)' },
  { name: 'snore', label: 'snore (sleepy bear)' },
  { name: 'splash', label: 'splash (Sky Lake)' },
  { name: 'chime', label: 'chime (new card / badge)' },
  { name: 'tap', label: 'tap (UI)' },
]

const MAX_VOICES = 12
const SILENT = 0.0001
/** Seconds before the same sound may start again. */
const MIN_GAP: Record<SfxName, number> = {
  whoosh: 0.08,
  land: 0.06,
  boing: 0.25,
  bleat: 0.3,
  clack: 0.05,
  chalk: 0.06,
  crumble: 0.3,
  gust: 0.5,
  reveal: 0.3,
  creak: 0.35,
  snore: 0.8,
  splash: 0.5,
  chime: 0.25,
  tap: 0.03,
}

// ---------------------------------------------------------------------------------------------
// Noise buffers: made once per context, shared by every sound (and by ambient.ts)

export type NoiseKind = 'white' | 'brown'
const NOISE_SECONDS = 2
const noiseCache = new WeakMap<BaseAudioContext, Partial<Record<NoiseKind, AudioBuffer>>>()

/** A 2-second mono noise buffer for this context (seeded, so every run sounds the same). */
export function noiseBuffer(ctx: BaseAudioContext, kind: NoiseKind): AudioBuffer {
  let entry = noiseCache.get(ctx)
  if (!entry) {
    entry = {}
    noiseCache.set(ctx, entry)
  }
  const cached = entry[kind]
  if (cached) return cached
  const length = Math.floor(ctx.sampleRate * NOISE_SECONDS)
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  const r = createRng(kind === 'white' ? 'noise-white' : 'noise-brown')
  if (kind === 'white') {
    for (let i = 0; i < length; i++) data[i] = r.next() * 2 - 1
  } else {
    // Leaky integrator over white noise: a soft, low rumble.
    let last = 0
    let peak = 0
    for (let i = 0; i < length; i++) {
      last = (last + 0.02 * (r.next() * 2 - 1)) / 1.02
      data[i] = last
      peak = Math.max(peak, Math.abs(last))
    }
    const scale = peak > 0 ? 0.95 / peak : 1
    for (let i = 0; i < length; i++) data[i] *= scale
  }
  entry[kind] = buffer
  return buffer
}

// ---------------------------------------------------------------------------------------------
// A voice: the nodes of one sound, stopped and disconnected together

class Voice {
  private readonly nodes: AudioNode[] = []
  private readonly sources: AudioScheduledSourceNode[] = []

  constructor(
    readonly ctx: BaseAudioContext,
    readonly out: AudioNode,
    /** Start time. */
    readonly t: number,
    readonly r: Rng,
  ) {}

  /** 1 ± amount, seeded. */
  vary(amount: number): number {
    return 1 + (this.r.next() * 2 - 1) * amount
  }

  gain(value: number): GainNode {
    const g = this.ctx.createGain()
    g.gain.value = value
    this.nodes.push(g)
    return g
  }

  filter(type: BiquadFilterType, freq: number, q = 0.7071): BiquadFilterNode {
    const f = this.ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    f.Q.value = q
    this.nodes.push(f)
    return f
  }

  osc(type: OscillatorType, freq: number, start = this.t): OscillatorNode {
    const o = this.ctx.createOscillator()
    o.type = type
    o.frequency.setValueAtTime(freq, start)
    o.start(start)
    this.nodes.push(o)
    this.sources.push(o)
    return o
  }

  /** Looped noise from a random point in the shared buffer. */
  noise(kind: NoiseKind, start = this.t, rate = 1): AudioBufferSourceNode {
    const src = this.ctx.createBufferSource()
    src.buffer = noiseBuffer(this.ctx, kind)
    src.loop = true
    src.playbackRate.value = rate
    src.start(start, this.r.next() * (NOISE_SECONDS - 0.1))
    this.nodes.push(src)
    this.sources.push(src)
    return src
  }

  /** Connect a → b → c …; returns the last node. */
  chain(...nodes: AudioNode[]): AudioNode {
    for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1])
    return nodes[nodes.length - 1]
  }

  /** Stop every source at `end` and disconnect everything once it has stopped. Returns `end`. */
  finish(end: number): number {
    let cleaned = false
    const cleanup = () => {
      if (cleaned) return
      cleaned = true
      for (const n of this.nodes) {
        try {
          n.disconnect()
        } catch {
          // Already disconnected.
        }
      }
    }
    for (const s of this.sources) s.stop(end)
    if (this.sources.length > 0) this.sources[0].onended = cleanup
    return end
  }
}

/** Gain envelope: silent → peak (exponential attack) → silent (exponential decay). Returns end. */
function pluck(p: AudioParam, t: number, attack: number, peak: number, decay: number): number {
  p.setValueAtTime(SILENT, t)
  p.exponentialRampToValueAtTime(Math.max(peak, SILENT * 2), t + attack)
  p.exponentialRampToValueAtTime(SILENT, t + attack + decay)
  return t + attack + decay
}

/** Gain envelope: silent → peak (linear swell) → hold → silent (exponential release). Returns end. */
function swell(p: AudioParam, t: number, attack: number, peak: number, hold: number, release: number): number {
  p.setValueAtTime(0, t)
  p.linearRampToValueAtTime(peak, t + attack)
  p.setValueAtTime(peak, t + attack + hold)
  p.exponentialRampToValueAtTime(SILENT, t + attack + hold + release)
  return t + attack + hold + release
}

function glide(p: AudioParam, points: readonly (readonly [number, number])[]): void {
  // points: [time, value]; exponential between them (all values > 0).
  p.setValueAtTime(points[0][1], points[0][0])
  for (let i = 1; i < points.length; i++) p.exponentialRampToValueAtTime(points[i][1], points[i][0])
}

const clamp01 = (n: number): number => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.5)

// ---------------------------------------------------------------------------------------------
// Recipes. Each returns the time its last node stops.

/** Leap: bandpassed air that rises with the launch and settles; stronger leaps are longer + fuller. */
function whoosh(v: Voice, powerArg: number): number {
  const power = clamp01(powerArg)
  const t = v.t
  const dur = (0.24 + 0.3 * power) * v.vary(0.08)
  const top = (700 + 900 * power) * v.vary(0.08)
  const src = v.noise('white', t)
  const bp = v.filter('bandpass', 320, 1.1)
  glide(bp.frequency, [
    [t, 320 * v.vary(0.05)],
    [t + dur * 0.35, top],
    [t + dur, 380],
  ])
  const lp = v.filter('lowpass', 2600, 0.5)
  const env = v.gain(0)
  const end = swell(env.gain, t, dur * 0.3, 0.19 + 0.16 * power, 0, dur * 0.7)
  v.chain(src, bp, lp, env, v.out)
  return v.finish(end + 0.02)
}

/** Landing: a soft thump of feet (ledge) or a light pat of hands (hold, soft = true), plus dust. */
function land(v: Voice, soft: boolean): number {
  const t = v.t
  const f0 = (soft ? 300 : 215) * v.vary(0.05)
  const body = v.osc('sine', f0, t)
  glide(body.frequency, [
    [t, f0],
    [t + (soft ? 0.07 : 0.11), f0 * 0.6],
  ])
  const bodyEnv = v.gain(0)
  const bodyEnd = pluck(bodyEnv.gain, t, 0.006, soft ? 0.13 : 0.26, soft ? 0.08 : 0.15)
  v.chain(body, bodyEnv, v.out)
  // Overtone so small speakers hear the thump too.
  const over = v.osc('triangle', f0 * 2.02, t)
  const overEnv = v.gain(0)
  pluck(overEnv.gain, t, 0.004, soft ? 0.04 : 0.08, 0.06)
  v.chain(over, overEnv, v.out)
  const dust = v.noise('white', t)
  const lp = v.filter('lowpass', soft ? 1800 : 1000, 0.7)
  const dustEnv = v.gain(0)
  const dustEnd = pluck(dustEnv.gain, t, 0.008, soft ? 0.06 : 0.15, soft ? 0.07 : 0.12)
  v.chain(dust, lp, dustEnv, v.out)
  return v.finish(Math.max(bodyEnd, dustEnd) + 0.02)
}

/** Rope catch: a soft cartoon spring, "boi-oi-oing", with a decaying wobble. */
function boing(v: Voice): number {
  const t = v.t
  const f0 = 245 * v.vary(0.05)
  const tone = v.osc('triangle', f0, t)
  glide(tone.frequency, [
    [t, f0 * 0.8],
    [t + 0.07, f0 * 1.15],
    [t + 0.6, f0 * 1.3],
  ])
  const wobble = v.osc('sine', 13 * v.vary(0.06), t)
  const depth = v.gain(0)
  glide(depth.gain, [
    [t, f0 * 0.32],
    [t + 0.62, 1],
  ])
  v.chain(wobble, depth)
  depth.connect(tone.frequency)
  const lp = v.filter('lowpass', 1900, 0.8)
  const env = v.gain(0)
  const end = pluck(env.gain, t, 0.012, 0.24, 0.6)
  v.chain(tone, lp, env, v.out)
  // A light "thwip" as the rope goes tight.
  const air = v.noise('white', t)
  const bp = v.filter('bandpass', 1400, 1.5)
  const airEnv = v.gain(0)
  pluck(airEnv.gain, t, 0.01, 0.05, 0.08)
  v.chain(air, bp, airEnv, v.out)
  return v.finish(end + 0.02)
}

interface Syllable {
  at: number
  len: number
  from: number
  to: number
  peak: number
}

const BLEATS: Record<BleatMood, { syllables: Syllable[]; quiver: number; depth: number; f2: number }> = {
  // "Meh-eh!" two little rising bleats.
  happy: {
    syllables: [
      { at: 0, len: 0.16, from: 540, to: 600, peak: 0.2 },
      { at: 0.19, len: 0.24, from: 600, to: 660, peak: 0.22 },
    ],
    quiver: 26,
    depth: 0.035,
    f2: 1900,
  },
  // A shaky, slightly falling "meeeh".
  nervous: {
    syllables: [{ at: 0, len: 0.5, from: 640, to: 540, peak: 0.17 }],
    quiver: 19,
    depth: 0.06,
    f2: 1800,
  },
  // A rising "wheeee" on the way down the rope.
  wheee: {
    syllables: [{ at: 0, len: 0.62, from: 480, to: 880, peak: 0.2 }],
    quiver: 24,
    depth: 0.025,
    f2: 2400,
  },
  // "Meh-heh-heh-heh": a giggle stepping down.
  laugh: {
    syllables: [
      { at: 0, len: 0.12, from: 700, to: 680, peak: 0.2 },
      { at: 0.15, len: 0.11, from: 650, to: 630, peak: 0.18 },
      { at: 0.29, len: 0.11, from: 610, to: 590, peak: 0.16 },
      { at: 0.43, len: 0.16, from: 570, to: 520, peak: 0.14 },
    ],
    quiver: 28,
    depth: 0.03,
    f2: 1950,
  },
}

/** Overall goat level (the syllable peaks are relative). */
const BLEAT_LEVEL = 0.72

/** The goat: a small nasal voice with the quick quiver that makes a bleat a bleat. */
function bleat(v: Voice, mood: BleatMood): number {
  const spec = BLEATS[mood]
  const t = v.t
  const pitch = v.vary(0.04)
  const first = spec.syllables[0]
  const lastSyl = spec.syllables[spec.syllables.length - 1]
  const voice = v.osc('sawtooth', first.from * pitch, t)
  // Pitch contour across the syllables.
  for (const s of spec.syllables) {
    voice.frequency.setValueAtTime(s.from * pitch, t + s.at)
    voice.frequency.exponentialRampToValueAtTime(s.to * pitch, t + s.at + s.len)
  }
  // The quiver: one LFO wobbles both pitch and loudness.
  const lfo = v.osc('sine', spec.quiver * v.vary(0.05), t)
  const vib = v.gain(first.from * pitch * spec.depth)
  v.chain(lfo, vib)
  vib.connect(voice.frequency)
  const trem = v.gain(0.7)
  const tremDepth = v.gain(0.3)
  v.chain(lfo, tremDepth)
  tremDepth.connect(trem.gain)
  // Two vowel formants ("eh"), summed, then softened.
  const f1 = v.filter('bandpass', 820, 2.2)
  const f2 = v.filter('bandpass', spec.f2, 4)
  const f2Gain = v.gain(0.55)
  const sum = v.gain(1.6)
  voice.connect(f1)
  voice.connect(f2)
  f1.connect(sum)
  v.chain(f2, f2Gain, sum)
  const lp = v.filter('lowpass', 2800, 0.6)
  const env = v.gain(0)
  env.gain.setValueAtTime(0, t)
  for (const s of spec.syllables) {
    const a = t + s.at
    env.gain.setValueAtTime(SILENT, a)
    env.gain.exponentialRampToValueAtTime(s.peak * BLEAT_LEVEL, a + 0.025)
    env.gain.setValueAtTime(s.peak * BLEAT_LEVEL, a + s.len * 0.6)
    env.gain.exponentialRampToValueAtTime(SILENT, a + s.len)
  }
  v.chain(sum, lp, trem, env, v.out)
  return v.finish(t + lastSyl.at + lastSyl.len + 0.03)
}

/** Stone on stone (the cairn): a rounded "tock" and a smaller settling tick. */
function clack(v: Voice): number {
  const t = v.t
  let end = t
  const knock = (at: number, level: number, pitch: number): void => {
    const partials: readonly (readonly [number, number, number])[] = [
      [480, 1, 0.09],
      [1130, 0.55, 0.05],
      [2050, 0.22, 0.03],
    ]
    for (const [f, g, d] of partials) {
      const o = v.osc('sine', f * pitch, at)
      const e = v.gain(0)
      end = Math.max(end, pluck(e.gain, at, 0.002, 0.2 * level * g, d))
      v.chain(o, e, v.out)
    }
    const click = v.noise('white', at)
    const bp = v.filter('bandpass', 1600 * pitch, 1.2)
    const ce = v.gain(0)
    end = Math.max(end, pluck(ce.gain, at, 0.001, 0.12 * level, 0.025))
    v.chain(click, bp, ce, v.out)
  }
  const pitch = v.vary(0.07)
  knock(t, 1, pitch)
  knock(t + 0.085 * v.vary(0.15), 0.35, pitch * 1.06)
  return v.finish(end + 0.02)
}

/** Chalk: a tiny soft "pff". */
function chalk(v: Voice): number {
  const t = v.t
  const src = v.noise('white', t)
  const bp = v.filter('bandpass', 1700 * v.vary(0.1), 0.6)
  const lp = v.filter('lowpass', 3200, 0.5)
  const env = v.gain(0)
  const end = pluck(env.gain, t, 0.02, 0.07, 0.17)
  v.chain(src, bp, lp, env, v.out)
  return v.finish(end + 0.02)
}

/** Crumbly ledge: a gentle low rumble and a few pebbles trickling down (more "oops" than scary). */
function crumble(v: Voice): number {
  const t = v.t
  const rumble = v.noise('brown', t)
  const lp = v.filter('lowpass', 650, 0.8)
  const hp = v.filter('highpass', 150, 0.7)
  const env = v.gain(0)
  let end = swell(env.gain, t, 0.08, 0.34, 0.12, 0.55)
  v.chain(rumble, hp, lp, env, v.out)
  // Pebbles: short bright ticks, getting quieter and further apart.
  let at = t + 0.05
  for (let i = 0; i < 6; i++) {
    at += (0.06 + 0.035 * i) * v.vary(0.4)
    const pebble = v.noise('white', at)
    const bp = v.filter('bandpass', 1500 + 1400 * v.r.next(), 5)
    const pe = v.gain(0)
    end = Math.max(end, pluck(pe.gain, at, 0.002, 0.2 * (1 - i * 0.12), 0.04))
    v.chain(pebble, bp, pe, v.out)
  }
  return v.finish(end + 0.02)
}

/** Wind: an airy swell (with a faint whistle when it's strong). */
function gust(v: Voice, strengthArg: number): number {
  const s = clamp01(strengthArg)
  const t = v.t
  const src = v.noise('white', t)
  const bp = v.filter('bandpass', 380, 0.8)
  const top = (650 + 450 * s) * v.vary(0.08)
  glide(bp.frequency, [
    [t, 380],
    [t + 0.5, top],
    [t + 1.15, 420],
  ])
  const lp = v.filter('lowpass', 1900, 0.5)
  const env = v.gain(0)
  const end = swell(env.gain, t, 0.42, 0.08 + 0.12 * s, 0.18, 0.6)
  v.chain(src, bp, lp, env, v.out)
  if (s > 0.35) {
    const whistle = v.filter('bandpass', 1250 * v.vary(0.06), 22)
    glide(whistle.frequency, [
      [t, 1150],
      [t + 0.55, 1350],
      [t + 1.1, 1180],
    ])
    const we = v.gain(0)
    swell(we.gain, t, 0.45, 0.6 * (s - 0.3), 0.15, 0.55)
    v.chain(src, whistle, we, v.out)
  }
  return v.finish(end + 0.02)
}

/** Hidden hold spotted: a quick rising sparkle of five soft bells. */
function reveal(v: Voice): number {
  const t = v.t
  const notes = [1047, 1175, 1319, 1568, 1760]
  let end = t
  notes.forEach((f, i) => {
    const at = t + i * 0.06 * v.vary(0.1)
    const o = v.osc('sine', f * v.vary(0.006), at)
    const e = v.gain(0)
    end = Math.max(end, pluck(e.gain, at, 0.004, 0.075 - i * 0.007, 0.32))
    v.chain(o, e, v.out)
    const shimmer = v.osc('sine', f * 2.01, at)
    const se = v.gain(0)
    pluck(se.gain, at, 0.003, 0.02, 0.12)
    v.chain(shimmer, se, v.out)
  })
  return v.finish(end + 0.02)
}

/** Rope bridge: a slow wooden creak (stick-slip pulses ringing through a plank). */
function creak(v: Voice): number {
  const t = v.t
  const rate = v.osc('sawtooth', 40, t)
  glide(rate.frequency, [
    [t, 38 * v.vary(0.08)],
    [t + 0.25, 64 * v.vary(0.08)],
    [t + 0.55, 46],
  ])
  const body = v.filter('bandpass', 560 * v.vary(0.08), 7)
  glide(body.frequency, [
    [t, 520],
    [t + 0.55, 640],
  ])
  const ring = v.filter('bandpass', 1250, 9)
  const ringGain = v.gain(0.45)
  const sum = v.gain(1)
  rate.connect(body)
  rate.connect(ring)
  body.connect(sum)
  v.chain(ring, ringGain, sum)
  const env = v.gain(0)
  const end = swell(env.gain, t, 0.07, 0.42, 0.33, 0.16)
  v.chain(sum, env, v.out)
  return v.finish(end + 0.02)
}

/** The sleeping bear: a low, purring snore and a little whistle on the way out. Cute, not scary. */
function snore(v: Voice): number {
  const t = v.t
  // In: a soft rattle.
  const rattle = v.osc('sawtooth', 68 * v.vary(0.05), t)
  glide(rattle.frequency, [
    [t, 64],
    [t + 0.65, 74],
  ])
  const hp = v.filter('highpass', 130, 0.7)
  const lp = v.filter('lowpass', 620, 1)
  const inEnv = v.gain(0)
  swell(inEnv.gain, t, 0.3, 0.19, 0.2, 0.22)
  v.chain(rattle, hp, lp, inEnv, v.out)
  const breathIn = v.noise('white', t)
  const bIn = v.filter('bandpass', 480, 1.2)
  const bInEnv = v.gain(0)
  swell(bInEnv.gain, t, 0.3, 0.07, 0.2, 0.22)
  v.chain(breathIn, bIn, bInEnv, v.out)
  // Out: a breathy "fwee" whistle.
  const out = t + 0.78
  const whistle = v.osc('sine', 980, out)
  glide(whistle.frequency, [
    [out, 980 * v.vary(0.04)],
    [out + 0.42, 720],
  ])
  const wEnv = v.gain(0)
  swell(wEnv.gain, out, 0.06, 0.07, 0.12, 0.28)
  v.chain(whistle, wEnv, v.out)
  const breathOut = v.noise('white', out)
  const bOut = v.filter('bandpass', 900, 0.9)
  const bOutEnv = v.gain(0)
  const end = swell(bOutEnv.gain, out, 0.05, 0.05, 0.12, 0.3)
  v.chain(breathOut, bOut, bOutEnv, v.out)
  return v.finish(end + 0.02)
}

/** Sky Lake: a soft splash, a low plunk and a few bloops of droplets. */
function splash(v: Voice): number {
  const t = v.t
  const water = v.noise('white', t)
  const lp = v.filter('lowpass', 3200, 0.7)
  glide(lp.frequency, [
    [t, 3200],
    [t + 0.55, 520],
  ])
  const env = v.gain(0)
  let end = pluck(env.gain, t, 0.012, 0.26, 0.75)
  v.chain(water, lp, env, v.out)
  const plunk = v.osc('sine', 300, t)
  glide(plunk.frequency, [
    [t, 300 * v.vary(0.05)],
    [t + 0.15, 150],
  ])
  const pe = v.gain(0)
  pluck(pe.gain, t, 0.005, 0.22, 0.2)
  v.chain(plunk, pe, v.out)
  let at = t + 0.16
  for (let i = 0; i < 4; i++) {
    at += 0.1 + 0.12 * v.r.next()
    const f = 650 + 450 * v.r.next()
    const drop = v.osc('sine', f, at)
    glide(drop.frequency, [
      [at, f],
      [at + 0.04, f * 1.7],
    ])
    const de = v.gain(0)
    end = Math.max(end, pluck(de.gain, at, 0.003, 0.09 - i * 0.015, 0.07))
    v.chain(drop, de, v.out)
  }
  return v.finish(end + 0.02)
}

/** New flop card or badge: two soft music-box notes, a fourth apart. Gentle, not a jackpot. */
function chime(v: Voice): number {
  const t = v.t
  const notes: readonly (readonly [number, number])[] = [
    [784, 0],
    [1047, 0.13],
  ]
  let end = t
  for (const [f, delay] of notes) {
    const at = t + delay
    const o = v.osc('sine', f, at)
    const e = v.gain(0)
    end = Math.max(end, pluck(e.gain, at, 0.005, 0.105, 0.95))
    v.chain(o, e, v.out)
    const h2 = v.osc('sine', f * 2, at)
    const e2 = v.gain(0)
    pluck(e2.gain, at, 0.004, 0.025, 0.35)
    v.chain(h2, e2, v.out)
  }
  return v.finish(end + 0.02)
}

/** UI tap: the same quiet wooden "tok" as audio.tap(). */
function tap(v: Voice): number {
  const t = v.t
  const o = v.osc('triangle', 720, t)
  o.frequency.exponentialRampToValueAtTime(380, t + 0.06)
  const e = v.gain(0)
  const end = pluck(e.gain, t, 0.006, 0.05, 0.084)
  v.chain(o, e, v.out)
  return v.finish(end + 0.02)
}

const isMood = (a: SfxArg): a is BleatMood => typeof a === 'string' && (BLEAT_MOODS as readonly string[]).includes(a)
const num = (a: SfxArg, fallback: number): number => (typeof a === 'number' ? a : fallback)

const RECIPES: Record<SfxName, (v: Voice, arg: SfxArg) => number> = {
  whoosh: (v, a) => whoosh(v, num(a, 0.6)),
  land: (v, a) => land(v, a === true),
  boing: (v) => boing(v),
  bleat: (v, a) => bleat(v, isMood(a) ? a : 'happy'),
  clack: (v) => clack(v),
  chalk: (v) => chalk(v),
  crumble: (v) => crumble(v),
  gust: (v, a) => gust(v, num(a, 0.5)),
  reveal: (v) => reveal(v),
  creak: (v) => creak(v),
  snore: (v) => snore(v),
  splash: (v) => splash(v),
  chime: (v) => chime(v),
  tap: (v) => tap(v),
}

// ---------------------------------------------------------------------------------------------
// Playing

const rng = createRng('sfx')
const lastStart: Partial<Record<SfxName, number>> = {}
/** End times of the sounds still playing (pruned on every play). */
const playingUntil: number[] = []

function play(name: SfxName, arg?: SfxArg): void {
  if (audio.isMuted()) return
  const ctx = audio.ctx()
  const out = audio.out()
  if (!ctx || !out) return
  const now = ctx.currentTime
  const last = lastStart[name]
  if (last !== undefined && now - last < MIN_GAP[name] && now >= last) return
  for (let i = playingUntil.length - 1; i >= 0; i--) if (playingUntil[i] <= now) playingUntil.splice(i, 1)
  if (playingUntil.length >= MAX_VOICES) return
  try {
    const end = RECIPES[name](new Voice(ctx, out, now + 0.005, rng), arg)
    lastStart[name] = now
    playingUntil.push(end)
  } catch (err) {
    // A sound must never break the game.
    console.warn('[upanyway] sfx failed', name, err)
  }
}

/**
 * Play one recipe into any context (the dev lab renders into an OfflineAudioContext). Ignores
 * mute, throttling and the voice cap. Returns the time the sound's last node stops.
 */
export function renderSfxInto(
  ctx: BaseAudioContext,
  dest: AudioNode,
  name: SfxName,
  arg?: SfxArg,
  when = 0,
  seed: number | string = name,
): number {
  return RECIPES[name](new Voice(ctx, dest, when, createRng(seed)), arg)
}

export const sfx = {
  /** Launch. power 0–1 (fraction of max power). */
  whoosh(power: number): void {
    play('whoosh', power)
  },
  /** Landing on a ledge; soft = catching a hold (hands, lighter). */
  land(soft?: boolean): void {
    play('land', soft === true)
  },
  /** The rope catches her: a soft cartoon spring. */
  boing(): void {
    play('boing')
  },
  /** The goat. happy (default), nervous (Big Leap, Looks Scary), wheee (rope ride), laugh (finale). */
  bleat(mood?: BleatMood): void {
    play('bleat', mood ?? 'happy')
  },
  /** Stone on stone, for the cairn. */
  clack(): void {
    play('clack')
  },
  /** A soft chalk puff. */
  chalk(): void {
    play('chalk')
  },
  /** A crumbly ledge giving way: gentle rumble + pebbles. */
  crumble(): void {
    play('crumble')
  },
  /** Wind. strength 0–1. */
  gust(strength: number): void {
    play('gust', strength)
  },
  /** Hidden hold spotted: a sparkle. */
  reveal(): void {
    play('reveal')
  },
  /** The rope bridge creaks (and holds). */
  creak(): void {
    play('creak')
  },
  /** The rumbling cliff turns out to be a sleeping bear. */
  snore(): void {
    play('snore')
  },
  /** Sky Lake finale. */
  splash(): void {
    play('splash')
  },
  /** New flop card or badge. */
  chime(): void {
    play('chime')
  },
  /** Very subtle UI tick. */
  tap(): void {
    play('tap')
  },
}
