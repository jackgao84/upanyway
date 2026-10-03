/**
 * Dev-only sound lab (served at /upanyway/dev/sound.html by `vite`; not part of the build).
 * - A button for every sound effect (and each argument variant) and every ambient zone, day/night.
 * - Every sound is also rendered offline (OfflineAudioContext) and drawn as a waveform with its
 *   peak, RMS, length, brightness (spectral centroid) and node count, checked against limits.
 * - window.__soundLab exposes the checks for a Playwright script (check(), noCtxCheck(), live*()).
 */
import { ambient, AMBIENT_ZONES, renderAmbientInto } from '../src/audio/ambient'
import { audio } from '../src/audio/audio'
import { renderSfxInto, SFX_VARIANTS, sfx, type SfxArg, type SfxName } from '../src/audio/sfx'
import type { ZoneId } from '../src/game/types'

const SR = 44100
const SFX_WINDOW = 2
const AMBIENT_SECONDS = 24
/** Limits every sound effect must meet. */
const LIMITS = { peak: 0.9, minRms: 0.003, maxSeconds: 1.5, maxNodes: 60, maxEdge: 0.02 }
/** Limits for ambient, measured on 1-second windows after the fade-in. */
const AMBIENT_LIMITS = { peak: 0.5, minRms: 0.004, maxRms: 0.09, maxRatio: 4 }

// ---------------------------------------------------------------------------------------------
// Node counting: wrap the factory methods once, count per context

const nodeCounts = new WeakMap<BaseAudioContext, number>()
const FACTORIES = [
  'createGain',
  'createOscillator',
  'createBiquadFilter',
  'createBufferSource',
  'createDelay',
  'createDynamicsCompressor',
  'createStereoPanner',
  'createConstantSource',
] as const

function countNodes(): void {
  const w = window as unknown as { BaseAudioContext?: { prototype: object }; AudioContext?: { prototype: object } }
  const proto = (w.BaseAudioContext ?? w.AudioContext)?.prototype as Record<string, unknown> | undefined
  if (!proto) return
  for (const name of FACTORIES) {
    const original = proto[name]
    if (typeof original !== 'function') continue
    proto[name] = function (this: BaseAudioContext, ...args: unknown[]) {
      nodeCounts.set(this, (nodeCounts.get(this) ?? 0) + 1)
      return (original as (...a: unknown[]) => unknown).apply(this, args)
    }
  }
}
countNodes()

// ---------------------------------------------------------------------------------------------
// Analysis

interface SfxReport {
  label: string
  name: SfxName
  arg: SfxArg
  peak: number
  rms: number
  seconds: number
  scheduledEnd: number
  centroid: number
  low: number
  /** A-weighted level, dBFS (a rough "how loud it feels"). */
  la: number
  nodes: number
  edge: number
  pass: boolean
  problems: string[]
}

interface AmbientReport {
  zone: ZoneId
  night: boolean
  peak: number
  rmsMin: number
  rmsMax: number
  rmsMean: number
  centroid: number
  low: number
  la: number
  /** Felt loudness of the pad alone and the plucks alone (dBA). */
  padLa: number
  pluckLa: number
  nodes: number
  nodesPerMinute: number
  pass: boolean
  problems: string[]
}

/** In-place radix-2 FFT magnitude of a Hann-windowed frame. */
function magnitudes(frame: Float32Array): Float32Array {
  const n = frame.length
  const re = new Float32Array(n)
  const im = new Float32Array(n)
  for (let i = 0; i < n; i++) re[i] = frame[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)))
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      const tr = re[i]
      re[i] = re[j]
      re[j] = tr
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k)
        const wi = Math.sin(ang * k)
        const ar = re[i + k + len / 2]
        const ai = im[i + k + len / 2]
        const xr = ar * wr - ai * wi
        const xi = ar * wi + ai * wr
        re[i + k + len / 2] = re[i + k] - xr
        im[i + k + len / 2] = im[i + k] - xi
        re[i + k] += xr
        im[i + k] += xi
      }
    }
  }
  const mags = new Float32Array(n / 2)
  for (let i = 0; i < n / 2; i++) mags[i] = Math.hypot(re[i], im[i])
  return mags
}

/** A-weighting gain (linear) at f Hz: how loud a frequency feels compared with 1 kHz. */
function aWeight(f: number): number {
  const f2 = f * f
  const ra = (12194 * 12194 * f2 * f2) / ((f2 + 20.6 * 20.6) * Math.sqrt((f2 + 107.7 * 107.7) * (f2 + 737.9 * 737.9)) * (f2 + 12194 * 12194))
  return ra * 1.2589 // +2 dB: 1 at 1 kHz
}

interface Spectrum {
  /** Power-weighted spectral centroid, Hz. */
  centroid: number
  /** Share of the power below 180 Hz (what an iPad speaker can barely play). */
  low: number
  /** A-weighted power / plain power: added to the RMS level in dB gives a felt loudness. */
  aRatio: number
}

/** Spectrum summary over 2048-sample Hann frames. */
function spectrum(data: Float32Array, from: number, to: number): Spectrum {
  const N = 2048
  let num = 0
  let den = 0
  let low = 0
  let weighted = 0
  for (let start = from; start + N <= Math.max(to, from + N); start += N) {
    if (start + N > data.length) break
    const mags = magnitudes(data.subarray(start, start + N))
    for (let i = 1; i < mags.length; i++) {
      const f = (i * SR) / N
      const p = mags[i] * mags[i]
      num += p * f
      den += p
      if (f < 180) low += p
      const a = aWeight(f)
      weighted += p * a * a
    }
  }
  return den > 0 ? { centroid: num / den, low: low / den, aRatio: weighted / den } : { centroid: 0, low: 0, aRatio: 1 }
}

/** Felt loudness: RMS in dBFS plus the A-weighting correction. */
const loudness = (rms: number, s: Spectrum): number => 20 * Math.log10(Math.max(rms, 1e-9)) + 10 * Math.log10(Math.max(s.aRatio, 1e-9))

function analyse(data: Float32Array): { peak: number; rms: number; seconds: number; edge: number; firstLoud: number } {
  let peak = 0
  let last = 0
  let firstLoud = -1
  for (let i = 0; i < data.length; i++) {
    const a = Math.abs(data[i])
    if (a > peak) peak = a
    if (a > 0.001) {
      last = i
      if (firstLoud < 0) firstLoud = i
    }
  }
  if (firstLoud < 0) firstLoud = 0
  let sum = 0
  for (let i = firstLoud; i <= last; i++) sum += data[i] * data[i]
  const rms = Math.sqrt(sum / Math.max(1, last - firstLoud + 1))
  // Clicks at the very start and end: the first and last samples must be (near) silent.
  const edge = Math.max(Math.abs(data[0]), Math.abs(data[data.length - 1]))
  return { peak, rms, seconds: last / SR, edge, firstLoud }
}

async function renderSfx(name: SfxName, arg: SfxArg): Promise<{ data: Float32Array; end: number; nodes: number }> {
  const ctx = new OfflineAudioContext(1, Math.floor(SR * SFX_WINDOW), SR)
  const end = renderSfxInto(ctx, ctx.destination, name, arg, 0, `lab:${name}:${String(arg)}`)
  const nodes = nodeCounts.get(ctx) ?? 0
  const buffer = await ctx.startRendering()
  return { data: buffer.getChannelData(0), end, nodes }
}

async function checkSfx(): Promise<SfxReport[]> {
  const out: SfxReport[] = []
  for (const v of SFX_VARIANTS) {
    const { data, end, nodes } = await renderSfx(v.name, v.arg)
    const a = analyse(data)
    const problems: string[] = []
    if (a.peak >= LIMITS.peak) problems.push(`peak ${a.peak.toFixed(3)} ≥ ${LIMITS.peak}`)
    if (a.rms <= LIMITS.minRms) problems.push(`rms ${a.rms.toFixed(4)} ≤ ${LIMITS.minRms}`)
    if (a.seconds >= LIMITS.maxSeconds) problems.push(`audible ${a.seconds.toFixed(2)} s ≥ ${LIMITS.maxSeconds}`)
    if (end >= LIMITS.maxSeconds) problems.push(`nodes stop at ${end.toFixed(2)} s ≥ ${LIMITS.maxSeconds}`)
    if (nodes > LIMITS.maxNodes) problems.push(`${nodes} nodes > ${LIMITS.maxNodes}`)
    if (a.edge > LIMITS.maxEdge) problems.push(`edge sample ${a.edge.toFixed(3)}`)
    const spec = spectrum(data, a.firstLoud, Math.floor(a.seconds * SR) + 1)
    const report: SfxReport = {
      label: v.label,
      name: v.name,
      arg: v.arg,
      peak: a.peak,
      rms: a.rms,
      seconds: a.seconds,
      scheduledEnd: end,
      centroid: spec.centroid,
      low: spec.low,
      la: loudness(a.rms, spec),
      nodes,
      edge: a.edge,
      pass: problems.length === 0,
      problems,
    }
    out.push(report)
    drawSfx(v.label, data, report)
  }
  return out
}

/** Felt loudness (dBA) of one ambient layer, 12 s after the fade-in. */
async function layerLoudness(zone: ZoneId, night: boolean, layer: 'pad' | 'plucks'): Promise<number> {
  const seconds = 16
  const ctx = new OfflineAudioContext(1, SR * seconds, SR)
  renderAmbientInto(ctx, ctx.destination, zone, night, seconds, `lab:${zone}:${night}`, layer)
  const data = (await ctx.startRendering()).getChannelData(0)
  let sum = 0
  for (let i = 4 * SR; i < data.length; i++) sum += data[i] * data[i]
  const rms = Math.sqrt(sum / (data.length - 4 * SR))
  return loudness(rms, spectrum(data, 4 * SR, data.length))
}

async function checkAmbient(): Promise<AmbientReport[]> {
  const out: AmbientReport[] = []
  for (const night of [false, true]) {
    for (const zone of AMBIENT_ZONES) {
      const ctx = new OfflineAudioContext(1, SR * AMBIENT_SECONDS, SR)
      renderAmbientInto(ctx, ctx.destination, zone, night, AMBIENT_SECONDS, `lab:${zone}:${night}`)
      const nodes = nodeCounts.get(ctx) ?? 0
      const buffer = await ctx.startRendering()
      const data = buffer.getChannelData(0)
      let peak = 0
      for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]))
      const windows: number[] = []
      for (let s = 5; s < AMBIENT_SECONDS; s++) {
        let sum = 0
        for (let i = s * SR; i < (s + 1) * SR; i++) sum += data[i] * data[i]
        windows.push(Math.sqrt(sum / SR))
      }
      const rmsMin = Math.min(...windows)
      const rmsMax = Math.max(...windows)
      const rmsMean = windows.reduce((a, b) => a + b, 0) / windows.length
      const problems: string[] = []
      if (peak >= AMBIENT_LIMITS.peak) problems.push(`peak ${peak.toFixed(3)}`)
      if (rmsMin <= AMBIENT_LIMITS.minRms) problems.push(`quiet window rms ${rmsMin.toFixed(4)}`)
      if (rmsMax >= AMBIENT_LIMITS.maxRms) problems.push(`loud window rms ${rmsMax.toFixed(4)}`)
      if (rmsMax / rmsMin >= AMBIENT_LIMITS.maxRatio) problems.push(`unsteady ×${(rmsMax / rmsMin).toFixed(1)}`)
      const spec = spectrum(data, 5 * SR, AMBIENT_SECONDS * SR)
      const padLa = await layerLoudness(zone, night, 'pad')
      const pluckLa = await layerLoudness(zone, night, 'plucks')
      const report: AmbientReport = {
        zone,
        night,
        peak,
        rmsMin,
        rmsMax,
        rmsMean,
        centroid: spec.centroid,
        low: spec.low,
        la: loudness(rmsMean, spec),
        padLa,
        pluckLa,
        nodes,
        nodesPerMinute: (nodes / AMBIENT_SECONDS) * 60,
        pass: problems.length === 0,
        problems,
      }
      out.push(report)
      drawAmbient(report, data)
    }
  }
  return out
}

// ---------------------------------------------------------------------------------------------
// Drawing

function drawWave(canvas: HTMLCanvasElement, data: Float32Array, seconds: number, color: string, scale: number, marker: boolean): void {
  const w = canvas.clientWidth || 200
  const hgt = canvas.clientHeight || 56
  canvas.width = w * 2
  canvas.height = hgt * 2
  const g = canvas.getContext('2d')
  if (!g) return
  g.scale(2, 2)
  g.clearRect(0, 0, w, hgt)
  g.strokeStyle = '#e4d3bd'
  g.beginPath()
  g.moveTo(0, hgt / 2)
  g.lineTo(w, hgt / 2)
  g.stroke()
  // 1.5 s limit marker.
  if (marker && seconds > LIMITS.maxSeconds) {
    const x = (LIMITS.maxSeconds / seconds) * w
    g.strokeStyle = '#e6b3a6'
    g.beginPath()
    g.moveTo(x, 0)
    g.lineTo(x, hgt)
    g.stroke()
  }
  g.fillStyle = color
  const per = data.length / w
  for (let x = 0; x < w; x++) {
    let lo = 0
    let hi = 0
    const from = Math.floor(x * per)
    const to = Math.min(data.length, Math.floor((x + 1) * per))
    for (let i = from; i < to; i++) {
      if (data[i] < lo) lo = data[i]
      if (data[i] > hi) hi = data[i]
    }
    const y0 = hgt / 2 - hi * scale * (hgt / 2)
    const y1 = hgt / 2 - lo * scale * (hgt / 2)
    g.fillRect(x, y0, 1, Math.max(1, y1 - y0))
  }
}

const sfxCards = new Map<string, { canvas: HTMLCanvasElement; stats: HTMLElement }>()
const ambientRows = new Map<string, { canvas: HTMLCanvasElement; stats: HTMLElement }>()

function drawSfx(label: string, data: Float32Array, r: SfxReport): void {
  const card = sfxCards.get(label)
  if (!card) return
  drawWave(card.canvas, data, SFX_WINDOW, r.pass ? '#6d8fb8' : '#c2563f', 2.5, true)
  card.stats.innerHTML =
    `peak ${r.peak.toFixed(2)} · rms ${r.rms.toFixed(3)}<br>` +
    `${r.seconds.toFixed(2)} s · ${Math.round(r.centroid)} Hz · ${r.la.toFixed(1)} dBA · ${r.nodes} nodes<br>` +
    (r.pass ? '<span class="pass">ok</span>' : `<span class="fail">${r.problems.join('; ')}</span>`)
}

function drawAmbient(r: AmbientReport, data: Float32Array): void {
  const row = ambientRows.get(`${r.zone}:${r.night}`)
  if (!row) return
  drawWave(row.canvas, data, AMBIENT_SECONDS, r.night ? '#5b5f8f' : '#7aa860', 6, false)
  row.stats.innerHTML =
    `peak ${r.peak.toFixed(2)} · rms ${r.rmsMin.toFixed(3)}–${r.rmsMax.toFixed(3)} (mean ${r.rmsMean.toFixed(3)}) · ` +
    `${Math.round(r.centroid)} Hz · ${r.la.toFixed(1)} dBA (pad ${r.padLa.toFixed(1)}, plucks ${r.pluckLa.toFixed(1)}) · ` +
    `${Math.round(r.nodesPerMinute)} nodes/min · ` +
    (r.pass ? '<span class="pass">ok</span>' : `<span class="fail">${r.problems.join('; ')}</span>`)
}

// ---------------------------------------------------------------------------------------------
// Page

const lab = document.getElementById('lab') as HTMLElement

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text) e.textContent = text
  return e
}

function btn(label: string, onClick: () => void, cls?: string): HTMLButtonElement {
  const b = el('button', cls, label)
  b.type = 'button'
  b.addEventListener('click', onClick)
  return b
}

audio.init()

// Status + switches
const status = el('div')
status.id = 'status'
const muteBtn = btn('Mute', () => {
  audio.setMuted(!audio.isMuted())
})
const musicBtn = btn('Music', () => {
  audio.setMusic(!audio.isMusicOn())
})
function renderStatus(): void {
  const ctx = audio.ctx()
  const a = ambient.current()
  status.textContent =
    `audio: ${ctx ? `running (${ctx.sampleRate} Hz)` : 'locked: tap anything'} · ` +
    `muted: ${audio.isMuted()} · music: ${audio.isMusicOn()} · ` +
    `ambient: ${a ? `${a.zone}${a.night ? ' (night)' : ''}` : 'stopped'} · ` +
    `nodes made: ${ctx ? (nodeCounts.get(ctx) ?? 0) : 0}`
  muteBtn.classList.toggle('on', audio.isMuted())
  musicBtn.classList.toggle('on', audio.isMusicOn())
}
audio.onChange(renderStatus)
setInterval(renderStatus, 500)
const top = el('section')
top.append(el('h2', '', 'Audio'), el('div', 'row'))
;(top.lastChild as HTMLElement).append(muteBtn, musicBtn, status)
lab.append(top)
renderStatus()

// Sound effects
const sfxSection = el('section')
sfxSection.append(el('h2', '', 'Sound effects'))
const cards = el('div', 'cards')
sfxSection.append(cards)
function playLive(name: SfxName, arg: SfxArg): void {
  switch (name) {
    case 'whoosh':
      sfx.whoosh(typeof arg === 'number' ? arg : 0.6)
      break
    case 'land':
      sfx.land(arg === true)
      break
    case 'bleat':
      sfx.bleat(arg === 'nervous' || arg === 'wheee' || arg === 'laugh' ? arg : 'happy')
      break
    case 'gust':
      sfx.gust(typeof arg === 'number' ? arg : 0.5)
      break
    default:
      sfx[name]()
  }
}
for (const v of SFX_VARIANTS) {
  const card = el('div', 'sound')
  const canvas = document.createElement('canvas')
  const stats = el('div', 'stats', '…')
  card.append(btn(v.label, () => playLive(v.name, v.arg)), canvas, stats)
  cards.append(card)
  sfxCards.set(v.label, { canvas, stats })
}
lab.append(sfxSection)

// Ambient
const ambSection = el('section', 'amb')
ambSection.append(el('h2', '', 'Ambient'))
const ambButtons = el('div', 'row')
for (const zone of AMBIENT_ZONES) {
  ambButtons.append(btn(zone, () => (ambient.current() ? ambient.setZone(zone, false) : ambient.start(zone, false))))
  ambButtons.append(btn(`${zone} night`, () => (ambient.current() ? ambient.setZone(zone, true) : ambient.start(zone, true)), 'night'))
}
ambButtons.append(btn('Stop', () => ambient.stop()))
let tour: ReturnType<typeof setInterval> | null = null
ambButtons.append(
  btn('Tour (8 s each)', () => {
    if (tour) {
      clearInterval(tour)
      tour = null
      return
    }
    let i = 0
    ambient.start(AMBIENT_ZONES[0])
    tour = setInterval(() => {
      i = (i + 1) % AMBIENT_ZONES.length
      ambient.setZone(AMBIENT_ZONES[i])
    }, 8000)
  }),
)
ambSection.append(ambButtons)
for (const night of [false, true]) {
  for (const zone of AMBIENT_ZONES) {
    const row = el('div', 'amb-row')
    const canvas = document.createElement('canvas')
    const stats = el('div', 'stats', `${zone}${night ? ' night' : ''}: …`)
    row.append(el('div', 'stats', `${zone}${night ? ' · night' : ''}`), canvas, stats)
    ambSection.append(row)
    ambientRows.set(`${zone}:${night}`, { canvas, stats })
  }
}
lab.append(ambSection)

// ---------------------------------------------------------------------------------------------
// Hooks for the scripted check

/** Calls every sound and the ambient API before any gesture: must not throw or log errors. */
function noCtxCheck(): { ok: boolean; error?: string; running: boolean } {
  try {
    for (const v of SFX_VARIANTS) playLive(v.name, v.arg)
    ambient.start('hollow', true)
    ambient.setZone('ridge')
    ambient.stop()
    ambient.setZone('cloud')
    return { ok: ambient.current() === null, running: audio.isRunning() }
  } catch (err) {
    return { ok: false, error: String(err), running: audio.isRunning() }
  }
}

/** Live probe: an analyser on the music bus (ambient only) and node counts on the live context. */
let probe: AnalyserNode | null = null
const probeBuf = new Float32Array(2048)
function liveMusicRms(): number {
  const ctx = audio.ctx()
  const bus = audio.musicOut()
  if (!ctx || !bus) return -1
  if (!probe) {
    probe = ctx.createAnalyser()
    probe.fftSize = 2048
    bus.connect(probe)
  }
  probe.getFloatTimeDomainData(probeBuf)
  let sum = 0
  for (let i = 0; i < probeBuf.length; i++) sum += probeBuf[i] * probeBuf[i]
  return Math.sqrt(sum / probeBuf.length)
}

declare global {
  interface Window {
    __soundLab?: unknown
  }
}

window.__soundLab = {
  check: async () => {
    const effects = await checkSfx()
    const amb = await checkAmbient()
    return { effects, ambient: amb }
  },
  noCtxCheck,
  liveState: () => ({
    running: audio.isRunning(),
    muted: audio.isMuted(),
    music: audio.isMusicOn(),
    ambient: ambient.current(),
    nodes: (() => {
      const ctx = audio.ctx()
      return ctx ? (nodeCounts.get(ctx) ?? 0) : 0
    })(),
    time: audio.ctx()?.currentTime ?? 0,
    musicRms: liveMusicRms(),
  }),
  play: (name: SfxName, arg?: SfxArg) => playLive(name, arg),
  ambient,
  audio,
}
