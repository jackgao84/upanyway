/**
 * Firefly Hollow 1 — holds and hanging. The first holds sit right above a ledge (just leap straight
 * up and grab), and every hold lets go onto a wide ledge beside it. One short hold-to-hold near the
 * top is a gentle taste of what's coming.
 */
import type { Level } from '../types'
import { camp, hold, ledge } from './build'

export const p04: Level = {
  id: 'p04',
  index: 4,
  zone: 'hollow',
  title: 'Hanging Roots',
  height: 1900,
  elements: [
    camp('c0', 20, 40, 170),
    ledge('a1', 155, 130, 120),
    ledge('a2', 260, 220, 120),
    ledge('a3', 150, 310, 120),
    hold('h1', 24, 440, { style: 'root' }),
    ledge('a4', 60, 470, 120),
    camp('c1', 150, 560, 170),
    hold('h2', 376, 700, { style: 'root' }),
    ledge('b1', 220, 730, 120),
    ledge('b2', 105, 820, 120),
    ledge('b3', 10, 910, 120),
    ledge('b4', 120, 1000, 120),
    camp('c2', 200, 1090, 170),
    hold('h3', 24, 1230, { style: 'jug' }),
    ledge('d1', 60, 1260, 120),
    ledge('d2', 170, 1350, 120),
    hold('h4', 376, 1490, { style: 'root' }),
    ledge('d3', 220, 1520, 120),
    camp('c3', 90, 1610, 170),
    ledge('e1', 230, 1700, 130),
    camp('top', 110, 1790, 170),
  ],
  route: [
    'c0', 'a1', 'a2', 'a3', 'h1', 'a4', 'c1', 'h2', 'b1', 'b2', 'b3', 'b4', 'c2',
    'h3', 'd1', 'd2', 'h4', 'd3', 'c3', 'e1', 'top',
  ],
  decor: [
    { kind: 'sign', x: 170, y: 40, text: 'Pitch 4' },
    { kind: 'mushroom', x: 45, y: 40 },
    { kind: 'lantern', x: 140, y: 40 },
  ],
}
