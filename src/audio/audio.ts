/**
 * The one AudioContext and its buses. Nothing is created until the first user gesture: WebKit only
 * unlocks audio from pointerup / touchend / click (and keydown), never from pointerdown. The unlock
 * listeners stay armed until the context reports 'running', and re-arm whenever it drops back to
 * 'suspended' / 'interrupted' (phone call, app switch) or the page becomes visible again.
 *
 * Graph: sfx bus ─┐
 *                 ├─ master (mute) ─ compressor ─ destination
 *      music bus ─┘   (music on/off)
 *
 * sfx.ts / ambient.ts: `audio.ctx()` and the buses are null until the context is running, so a sound
 * requested before the unlock (or during an interruption) is simply skipped, never queued.
 */

type Listener = () => void

const UNLOCK_EVENTS = ['pointerup', 'touchend', 'click', 'keydown'] as const
const MUTE_RAMP = 0.15
const MUSIC_RAMP = 0.8

let context: AudioContext | null = null
let master: GainNode | null = null
let sfxBus: GainNode | null = null
let musicBus: GainNode | null = null
let muted = false
let musicOn = true
let initialised = false
let armed = false
let unsupported = false
const listeners = new Set<Listener>()

function emit(): void {
  for (const fn of [...listeners]) {
    try {
      fn()
    } catch (err) {
      console.warn('[upanyway] audio listener failed', err)
    }
  }
}

function running(): boolean {
  return !!context && context.state === 'running'
}

function createContext(): AudioContext | null {
  if (context || unsupported) return context
  const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }
  const Ctor = w.AudioContext || w.webkitAudioContext
  if (!Ctor) {
    unsupported = true
    return null
  }
  try {
    const ctx = new Ctor()
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -14
    comp.knee.value = 10
    comp.ratio.value = 4
    comp.attack.value = 0.004
    comp.release.value = 0.25
    comp.connect(ctx.destination)
    master = ctx.createGain()
    master.gain.value = muted ? 0 : 1
    master.connect(comp)
    sfxBus = ctx.createGain()
    sfxBus.gain.value = 1
    sfxBus.connect(master)
    musicBus = ctx.createGain()
    musicBus.gain.value = musicOn ? 1 : 0
    musicBus.connect(master)
    ctx.onstatechange = onStateChange
    context = ctx
    return ctx
  } catch (err) {
    console.warn('[upanyway] AudioContext unavailable', err)
    unsupported = true
    return null
  }
}

/** A one-sample silent buffer: the classic WebKit unlock nudge. */
function playSilence(ctx: AudioContext): void {
  try {
    const buffer = ctx.createBuffer(1, 1, 22050)
    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.connect(ctx.destination)
    src.start(0)
    src.onended = () => src.disconnect()
  } catch {
    // Harmless: the resume() call is what matters.
  }
}

function onGesture(): void {
  const ctx = createContext()
  if (!ctx) {
    disarm()
    return
  }
  if (ctx.state !== 'running') {
    try {
      const p = ctx.resume()
      if (p && typeof p.then === 'function') p.then(settle, settle)
    } catch {
      // Some WebKit builds throw if resume() races a close; the next gesture retries.
    }
  }
  playSilence(ctx)
  settle()
}

function settle(): void {
  if (running()) {
    disarm()
    emit()
  }
}

function arm(): void {
  if (armed || unsupported) return
  armed = true
  for (const type of UNLOCK_EVENTS) window.addEventListener(type, onGesture, { capture: true, passive: true })
}

function disarm(): void {
  if (!armed) return
  armed = false
  for (const type of UNLOCK_EVENTS) window.removeEventListener(type, onGesture, { capture: true })
}

function onStateChange(): void {
  if (!context) return
  const state = context.state as string
  if (state === 'running') {
    disarm()
  } else if (state === 'suspended' || state === 'interrupted') {
    arm()
    if (document.visibilityState === 'visible') tryResume()
  }
  emit()
}

function tryResume(): void {
  if (!context || context.state === 'running' || (context.state as string) === 'closed') return
  try {
    const p = context.resume()
    if (p && typeof p.then === 'function') p.then(settle, () => undefined)
  } catch {
    // Needs a gesture; the armed listeners will catch the next tap.
  }
}

function onVisible(): void {
  if (document.visibilityState !== 'visible' || !context) return
  if (!running()) {
    arm()
    tryResume()
  }
}

function ramp(param: AudioParam, to: number, seconds: number): void {
  if (!context) return
  const t = context.currentTime
  param.cancelScheduledValues(t)
  param.setValueAtTime(param.value, t)
  param.linearRampToValueAtTime(to, t + seconds)
}

export const audio = {
  /** Arm the unlock listeners. Creates nothing until the first gesture. Safe to call twice. */
  init(): void {
    if (initialised || typeof window === 'undefined') return
    initialised = true
    arm()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pageshow', onVisible)
  },

  /** Master mute (her toggle + the parent setting share this). Ramps, never clicks. */
  setMuted(m: boolean): void {
    if (muted === m) return
    muted = m
    if (master) ramp(master.gain, m ? 0 : 1, MUTE_RAMP)
    emit()
  },

  isMuted(): boolean {
    return muted
  },

  /** Ambient music on/off (parent setting). Sound effects are unaffected. */
  setMusic(on: boolean): void {
    if (musicOn === on) return
    musicOn = on
    if (musicBus) ramp(musicBus.gain, on ? 1 : 0, MUSIC_RAMP)
    emit()
  },

  isMusicOn(): boolean {
    return musicOn
  },

  /** The running context, or null before the unlock / while suspended or interrupted. */
  ctx(): AudioContext | null {
    return running() ? context : null
  },

  /** Sound-effect destination (under master). Null until running. */
  out(): AudioNode | null {
    return running() ? sfxBus : null
  },

  /** Ambient music destination (under master, own on/off gain). Null until running. */
  musicOut(): AudioNode | null {
    return running() ? musicBus : null
  },

  /** True once audio has started at least once and is playing now. */
  isRunning(): boolean {
    return running()
  },

  /** Called on unlock, interruption, mute and music changes. Returns an unsubscribe. */
  onChange(fn: Listener): () => void {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },

  /** A soft wooden "tok" for taps on buttons and tiles. Very quiet; skipped when muted or locked. */
  tap(): void {
    const ctx = running() ? context : null
    if (!ctx || !sfxBus || muted) return
    try {
      const t = ctx.currentTime + 0.005
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'triangle'
      osc.frequency.setValueAtTime(720, t)
      osc.frequency.exponentialRampToValueAtTime(380, t + 0.06)
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(0.05, t + 0.006)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.09)
      osc.connect(gain)
      gain.connect(sfxBus)
      osc.start(t)
      osc.stop(t + 0.11)
      osc.onended = () => {
        osc.disconnect()
        gain.disconnect()
      }
    } catch {
      // Never let a click sound break a tap.
    }
  },
}
