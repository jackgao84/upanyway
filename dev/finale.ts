/**
 * Dev-only Sky Lake finale lab (served by `npm run dev` at /upanyway/dev/finale.html; not part of the
 * build). Mounts the real finale (screens/finale/play.ts) over an in-memory save, so nothing touches
 * the app's own storage.
 *
 * Query:
 *   night=1        the moonlight ending
 *   t=<seconds>    start there, clock held still (screenshots); without it the finale plays live
 *   rm=1           reduced motion (still frames + crossfades)
 *   ui=1           a scrubber panel at the bottom (play/pause, time)
 *   look=<n>       one of a few sample looks (0–3)
 *   mountain=<s>   the mountain's name on the summit sign; goat=<s> the goat's name
 *   camps=<n>      how many pitch camps she has passed (default 16)
 * `window.__lab` = { seek(t), freeze(on) } for screenshot scripts; `window.__upanyway.finale` is the
 * screen's own debug hook.
 */
import { audio } from '../src/audio/audio'
import { mountShell } from '../src/app/shell'
import { DAY_BEATS, NIGHT_BEATS } from '../src/screens/finale/timeline'
import { FinalePlay } from '../src/screens/finale/play'
import { finalePath } from '../src/screens/finale'
import '../src/screens/finale/finale.css'
import { initStore, MemoryStorage } from '../src/storage/store'
import { defaultLook, defaultSave, type ClimberLook } from '../src/storage/schema'
import '../src/ui/components'
import { h } from '../src/ui/dom'
import type { LevelId } from '../src/game/types'
import { installDebugHook } from '../src/debug'

const params = new URLSearchParams(location.search)
const night = params.get('night') === '1'
const tParam = params.get('t')
const startAt = tParam !== null ? Number(tParam) : undefined
const reduced = params.get('rm') === '1'
const camps = Math.max(0, Math.min(16, Number(params.get('camps') ?? '16')))

const LOOKS: ClimberLook[] = [
  defaultLook(),
  { ...defaultLook(), hairStyle: 'bob', hairColor: '#1f1a17', skinTone: '#8d5a3b', outfit: 'hoodie', outfitColor: '#7a5bb0', helmet: 'cat', helmetColor: '#58b6c9', backpackColor: '#e8735a' },
  { ...defaultLook(), hairStyle: 'buns', hairColor: '#d9a35b', skinTone: '#f3cfb1', outfit: 'overalls', outfitColor: '#4c8fac', helmetColor: '#ef8fa0', backpackColor: '#f5b83d' },
  { ...defaultLook(), hairStyle: 'braids', hairColor: '#3b2219', skinTone: '#c68a5e', outfit: 'tee', outfitColor: '#7fb069', helmetColor: '#f5b83d', backpackColor: '#8a6bb0' },
]
const look = LOOKS[Number(params.get('look') ?? '0') % LOOKS.length] ?? defaultLook()

// An in-memory save at the top of the mountain.
const storage = new MemoryStorage()
const store = initStore(storage)
const d = defaultSave(new Date())
d.setup = { parentDone: true, lookDone: true, complete: true }
d.lessonDone = true
d.profile = { look, goatName: params.get('goat') ?? 'Pebble', mountainName: params.get('mountain') ?? 'Mount Wobbletop' }
d.stats = { whippers: 211, sends: 16, bigLeapsTried: 9, betaAsked: 3 }
d.summit = { reached: true, at: new Date().toISOString(), finaleSeen: false }
for (let i = 1; i <= 16; i++) {
  const id = `p${String(i).padStart(2, '0')}` as LevelId
  d.pitches[id] = {
    sends: i <= camps ? 1 : 0,
    nightSends: 0,
    totalAttempts: 10,
    run: null,
    nightRun: null,
    lastSend: null,
    revealedHolds: [],
    foundCrumbles: [],
    ...(i <= camps ? { firstSentAt: new Date().toISOString() } : {}),
  }
}
store.replace(d)

let muted = false
mountShell(document.body, {
  getMuted: () => muted,
  setMuted: (m) => {
    muted = m
    audio.setMuted(m)
  },
  isTestMode: () => false,
  subscribe: () => () => undefined,
})
audio.init()
installDebugHook()

const app = document.getElementById('app') as HTMLElement
const main = h('main', { class: 'screen screen--fixed', dataset: { route: '/finale' } })
app.appendChild(main)

let play: FinalePlay | null = null
const mount = (at?: number, frozen = false) => {
  play?.destroy()
  main.replaceChildren()
  play = new FinalePlay(main, {
    night,
    record: false,
    navigate: (path) => {
      console.info('[finale lab] navigate', path)
      if (path.startsWith('/finale')) mount()
    },
    againPath: finalePath({ night, replay: true }),
    startAt: at,
    frozen,
    reducedMotion: reduced,
  })
}
mount(startAt, startAt !== undefined)

type FinaleDebug = { seek(t: number): void; freeze(on: boolean): void; state(): { t: number } }
const dbg = (): FinaleDebug | null => (window.__upanyway?.finale as FinaleDebug | undefined) ?? null

declare global {
  interface Window {
    __lab?: { seek(t: number): void; freeze(on: boolean): void; beats: readonly { id: string; at: number; still: number }[] }
  }
}
window.__lab = {
  seek: (t: number) => dbg()?.seek(t),
  freeze: (on: boolean) => dbg()?.freeze(on),
  beats: night ? NIGHT_BEATS : DAY_BEATS,
}

if (params.get('ui') === '1') {
  let paused = startAt !== undefined
  const range = h('input', { type: 'range', min: '0', max: night ? '14' : '32', step: '0.05', value: String(startAt ?? 0) }) as HTMLInputElement
  const label = h('span', null, '0.00')
  const playBtn = h('button', { type: 'button' }, paused ? 'Play' : 'Pause')
  playBtn.addEventListener('click', () => {
    paused = !paused
    dbg()?.freeze(paused)
    playBtn.textContent = paused ? 'Play' : 'Pause'
  })
  range.addEventListener('input', () => {
    paused = true
    dbg()?.freeze(true)
    dbg()?.seek(Number(range.value))
    playBtn.textContent = 'Play'
  })
  const restart = h('button', { type: 'button' }, 'Restart')
  restart.addEventListener('click', () => mount())
  document.body.appendChild(h('div', { id: 'lab-panel' }, restart, playBtn, range, label))
  const loop = () => {
    const s = dbg()?.state()
    if (s) {
      label.textContent = s.t.toFixed(2)
      if (!paused) range.value = String(s.t)
    }
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
}
