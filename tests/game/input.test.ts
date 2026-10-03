/**
 * The slingshot gesture (src/game/input.ts) against a real ClimbSession, with a tiny stand-in for
 * the canvas and window (the tests run in node): a drag the engine cancels never comes back to life,
 * a resting thumb hands over to the real finger, a second finger during a real drag cancels, and a
 * touch that starts while she is still settling aims once she is ready.
 */
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { ClimbSession } from '../../src/game/engine'
import { AimInput } from '../../src/game/input'
import { getLevel } from '../../src/game/levels'
import { solutionFrom } from '../../src/game/levels/solutions'
import { TUNING } from '../../src/game/tuning'

type Handler = (e: FakePointer) => void

interface FakePointer {
  pointerId: number
  clientX: number
  clientY: number
  button: number
  preventDefault(): void
}

class FakeTarget {
  readonly handlers = new Map<string, Set<Handler>>()
  readonly style: Record<string, string> = {}
  private captured = new Set<number>()
  addEventListener(type: string, fn: Handler): void {
    let set = this.handlers.get(type)
    if (!set) this.handlers.set(type, (set = new Set()))
    set.add(fn)
  }
  removeEventListener(type: string, fn: Handler): void {
    this.handlers.get(type)?.delete(fn)
  }
  fire(type: string, e: FakePointer): void {
    for (const fn of [...(this.handlers.get(type) ?? [])]) fn(e)
  }
  setPointerCapture(id: number): void {
    this.captured.add(id)
  }
  hasPointerCapture(id: number): boolean {
    return this.captured.has(id)
  }
  releasePointerCapture(id: number): void {
    this.captured.delete(id)
  }
}

const g = globalThis as unknown as { window?: unknown }
let savedWindow: unknown
let win: FakeTarget
let canvas: FakeTarget

beforeEach(() => {
  savedWindow = g.window
  win = new FakeTarget()
  canvas = new FakeTarget()
  g.window = win
})
afterEach(() => {
  g.window = savedWindow
})

const ev = (pointerId: number, x: number, y: number): FakePointer => ({ pointerId, clientX: x, clientY: y, button: 0, preventDefault: () => undefined })
const down = (id: number, x: number, y: number) => canvas.fire('pointerdown', ev(id, x, y))
const move = (id: number, x: number, y: number) => win.fire('pointermove', ev(id, x, y))
const up = (id: number, x: number, y: number) => win.fire('pointerup', ev(id, x, y))

function setup(levelId: 'p01' | 'p07', startId?: string) {
  const s = new ClimbSession({ level: getLevel(levelId)!, startId, choosePose: () => 'starfish' })
  const input = new AimInput(canvas as unknown as HTMLElement, {
    session: () => s,
    // Far from every touch here: no release counts as "back on the climber".
    climberClient: () => ({ x: -1000, y: -1000, r: 22 }),
    maxDragPx: () => 150,
  })
  const launches: string[] = []
  s.events.on('launch', (e) => launches.push(e.fromId))
  return { s, input, launches }
}

function stepUntil(s: ClimbSession, done: () => boolean, maxSeconds = 8): void {
  for (let i = 0; i * TUNING.dt < maxSeconds && !done(); i++) s.fixedStep()
}

describe('AimInput', () => {
  test('a plain drag aims and launches', () => {
    const { s, input, launches } = setup('p01')
    down(1, 200, 200)
    move(1, 160, 290)
    expect(s.aim?.cancel).toBe(false)
    up(1, 160, 290)
    s.fixedStep()
    expect(launches).toEqual(['c0'])
    expect(input.active).toBe(false)
  })

  test('a drag the engine cancels (the ledge crumbled) never comes back to life', () => {
    const { s, input, launches } = setup('p07', 'a3')
    // She has been standing on the crumbly a3 a while: it is about to give way.
    s.crumbleTimers.set('a3', TUNING.crumbleDelay - 0.2)
    down(1, 200, 200)
    move(1, 180, 280)
    expect(s.aim).not.toBeNull()
    stepUntil(s, () => s.phase === 'flying')
    expect(s.aim).toBeNull()
    // Still holding: she falls and is ready somewhere else...
    stepUntil(s, () => s.phase === 'ready')
    expect(s.phase).toBe('ready')
    // ...and moving the same finger does not aim from there, nor does letting go launch her.
    move(1, 170, 300)
    expect(s.aim).toBeNull()
    expect(input.active).toBe(false)
    up(1, 170, 300)
    s.fixedStep()
    expect(launches).toEqual([])
  })

  test('a resting thumb hands over to the finger that really drags', () => {
    const { s, input, launches } = setup('p01')
    down(1, 5, 400) // a thumb resting on the edge
    down(2, 220, 220) // the real finger
    move(2, 190, 320)
    expect(s.aim?.cancel).toBe(false)
    expect(s.aim?.dragY).toBe(100)
    up(1, 5, 400) // the thumb lifting changes nothing
    expect(s.aim).not.toBeNull()
    up(2, 190, 320)
    s.fixedStep()
    expect(launches).toEqual(['c0'])
    expect(input.active).toBe(false)
  })

  test('a second finger during a real drag cancels it (never launches)', () => {
    const { s, input, launches } = setup('p01')
    down(1, 200, 200)
    move(1, 170, 290)
    down(2, 400, 400)
    expect(s.aim).toBeNull()
    expect(input.active).toBe(false)
    up(1, 170, 290)
    up(2, 400, 400)
    s.fixedStep()
    expect(launches).toEqual([])
  })

  test('a touch that starts while she is settling aims once she is ready', () => {
    const { s, input, launches } = setup('p01')
    const sol = solutionFrom('p01', 'c0')!
    s.launch(sol.angle, sol.power)
    stepUntil(s, () => s.phase === 'settling')
    expect(s.phase).toBe('settling')
    down(1, 200, 200)
    expect(input.active).toBe(true)
    expect(s.aim).toBeNull()
    stepUntil(s, () => s.phase === 'ready')
    input.poll()
    expect(s.aim).not.toBeNull()
    move(1, 170, 290)
    expect(s.aim?.cancel).toBe(false)
    up(1, 170, 290)
    s.fixedStep()
    expect(launches).toEqual(['c0', sol.to])
  })

  test('a touch that starts in the air is ignored', () => {
    const { s, input, launches } = setup('p01')
    s.launch(20, 0.5)
    s.fixedStep()
    expect(s.phase).toBe('flying')
    down(1, 200, 200)
    expect(input.active).toBe(false)
    stepUntil(s, () => s.phase === 'ready')
    move(1, 170, 290)
    up(1, 170, 290)
    s.fixedStep()
    expect(launches).toEqual(['c0'])
  })
})
