/** Tiny helpers so level files read like a map. x is the LEFT edge for ledges, the centre for holds. */
import type { Hold, Ledge } from '../types'

type LedgeExtra = Partial<Omit<Ledge, 'id' | 'kind' | 'x' | 'y' | 'w'>>
type HoldExtra = Partial<Omit<Hold, 'id' | 'kind' | 'x' | 'y'>>

export function ledge(id: string, x: number, y: number, w: number, extra: LedgeExtra = {}): Ledge {
  return { id, kind: 'ledge', x, y, w, ...extra }
}

export function camp(id: string, x: number, y: number, w: number, extra: LedgeExtra = {}): Ledge {
  return { id, kind: 'ledge', x, y, w, camp: true, ...extra }
}

export function hold(id: string, x: number, y: number, extra: HoldExtra = {}): Hold {
  return { id, kind: 'hold', x, y, ...extra }
}
