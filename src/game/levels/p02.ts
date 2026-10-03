/**
 * Meadow Slopes 2 — the first Big Leap. Looks Scary: a huge-looking gap above a misty drop.
 * Up close it is easy: a wide landing ledge only a little higher than the camp.
 */
import type { Level } from '../types'
import { camp, ledge } from './build'

export const p02: Level = {
  id: 'p02',
  index: 2,
  zone: 'meadow',
  title: 'The Big Gap',
  height: 1840,
  elements: [
    camp('c0', 205, 40, 170),
    ledge('a1', 122, 130, 125),
    ledge('a2', 22, 220, 125),
    // Tucked under the camp's far side: the last step in is a tall straight-up pull, and the landing
    // across the gap stays out of easy reach from down here, so she always stands on the forecast camp.
    ledge('a3', 5, 310, 120),
    camp('c1', 10, 490, 150),
    ledge('gap', 240, 520, 150),
    // Past the landing the way on climbs straight up the far side, out of reach from c1, so the leap
    // is the only way on (and nothing sits low over the camp).
    ledge('b1', 262, 700, 125),
    ledge('b2', 150, 795, 125),
    ledge('b3', 258, 885, 125),
    camp('c2', 115, 970, 170),
    ledge('d1', 28, 1060, 125),
    ledge('d2', 138, 1150, 125),
    ledge('d3', 248, 1240, 125),
    ledge('d4', 138, 1330, 125),
    camp('c3', 5, 1420, 170),
    ledge('e1', 138, 1510, 125),
    ledge('e2', 248, 1600, 125),
    camp('top', 115, 1690, 170),
  ],
  route: ['c0', 'a1', 'a2', 'a3', 'c1', 'gap', 'b1', 'b2', 'b3', 'c2', 'd1', 'd2', 'd3', 'd4', 'c3', 'e1', 'e2', 'top'],
  bigLeaps: [{ from: 'c1', to: 'gap' }],
  looksScary: { kind: 'bigleap', forecastAt: 'c1', revealAt: 'gap', x: 200, y: 470 },
  decor: [
    { kind: 'flowers', x: 240, y: 40 },
    { kind: 'sign', x: 350, y: 40, text: 'Pitch 2' },
    { kind: 'bush', x: 150, y: 130 },
    { kind: 'flowers', x: 228, y: 130 },
    { kind: 'grass', x: 50, y: 220 },
    { kind: 'mushroom', x: 25, y: 310 },
    { kind: 'tent', x: 40, y: 490 },
    { kind: 'cloud', x: 200, y: 430, scale: 1.8 },
    { kind: 'flowers', x: 360, y: 520 },
    { kind: 'grass', x: 284, y: 700 },
    { kind: 'tree', x: 172, y: 795, scale: 0.8 },
    { kind: 'bush', x: 340, y: 885 },
    { kind: 'tent', x: 260, y: 970 },
    { kind: 'mushroom', x: 60, y: 1060 },
    { kind: 'flowers', x: 280, y: 1240 },
    { kind: 'tent', x: 30, y: 1420 },
    { kind: 'grass', x: 270, y: 1600 },
    { kind: 'flag', x: 260, y: 1690 },
  ],
}
