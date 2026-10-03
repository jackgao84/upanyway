/**
 * Firefly Hollow 3 — the hardest hollow pitch: long hold-to-hold sequences. Roots hang down both walls
 * of the hollow and glowing knobs dangle in the middle; she swings wall to knob to wall.
 */
import type { Level } from '../types'
import { camp, hold, ledge } from './build'

export const p06: Level = {
  id: 'p06',
  index: 6,
  zone: 'hollow',
  title: 'Firefly Ladder',
  height: 2000,
  elements: [
    camp('c0', 20, 40, 170),
    ledge('a1', 150, 130, 120),
    ledge('a2', 260, 220, 120),
    ledge('a3', 150, 310, 120),
    hold('hL1', 24, 450, { style: 'root' }),
    hold('m1', 215, 470, { style: 'knob' }),
    hold('hR1', 376, 540, { style: 'root' }),
    camp('c1', 200, 570, 170),
    ledge('d1', 110, 660, 120),
    hold('hL2', 24, 800, { style: 'root' }),
    hold('m2', 210, 800, { style: 'knob' }),
    hold('hR2', 376, 870, { style: 'root' }),
    hold('m3', 190, 900, { style: 'knob' }),
    hold('hL3', 24, 980, { style: 'root' }),
    ledge('e1', 60, 1010, 120),
    camp('c2', 145, 1100, 170),
    ledge('f1', 40, 1190, 120),
    ledge('f2', 150, 1280, 120),
    hold('hR3', 376, 1420, { style: 'root' }),
    ledge('f3', 220, 1450, 120),
    camp('c3', 60, 1540, 170),
    ledge('g1', 200, 1640, 120),
    ledge('g2', 80, 1745, 120),
    camp('top', 170, 1850, 170),
    hold('secret', 24, 1440, { style: 'root', hidden: true }),
  ],
  route: [
    'c0', 'a1', 'a2', 'a3', 'hL1', 'm1', 'hR1', 'c1',
    'd1', 'hL2', 'm2', 'hR2', 'm3', 'hL3', 'e1', 'c2',
    'f1', 'f2', 'hR3', 'f3', 'c3', 'g1', 'g2', 'top',
  ],
  decor: [
    { kind: 'sign', x: 150, y: 40, text: 'Pitch 6' },
  ],
}
