/**
 * Cloud Steps 1 — Big Leaps through fog. Each camp sits at the edge of a cloud bank; the landing on
 * the far side is hidden in the fog and the dotted preview stops short. Every landing is a wide,
 * nearly level ledge backed by the far wall, so a leap that's a bit too strong still lands.
 * From each landing a tall step goes straight up the far wall (too strong just slides down the wall
 * onto it), then small rock steps swing back across to the next camp. That ledge is high and far
 * from the camp, so the Big Leap is the only easy way on.
 */
import type { Level } from '../types'
import { camp, ledge } from './build'

export const p13: Level = {
  id: 'p13',
  index: 13,
  zone: 'cloud',
  title: 'Into the Clouds',
  height: 2300,
  elements: [
    camp('c0', 10, 40, 180),
    ledge('a1', 150, 155, 110),
    ledge('a2', 260, 270, 110),
    ledge('a3', 150, 385, 110),
    camp('c1', 0, 500, 160),
    ledge('g1', 250, 525, 140),
    ledge('b1', 300, 715, 100),
    ledge('b2', 170, 830, 110),
    camp('c2', 0, 945, 160),
    ledge('g2', 250, 970, 140),
    ledge('d1', 300, 1160, 100),
    ledge('d2', 170, 1275, 110),
    camp('c3', 0, 1390, 160),
    ledge('g3', 250, 1415, 140),
    ledge('e1', 300, 1605, 100),
    ledge('e2', 170, 1720, 110),
    camp('c4', 0, 1835, 160),
    ledge('f1', 150, 1950, 110),
    ledge('f2', 260, 2065, 110),
    camp('top', 110, 2180, 180),
  ],
  route: [
    'c0', 'a1', 'a2', 'a3', 'c1', 'g1', 'b1', 'b2', 'c2', 'g2', 'd1', 'd2',
    'c3', 'g3', 'e1', 'e2', 'c4', 'f1', 'f2', 'top',
  ],
  bigLeaps: [
    { from: 'c1', to: 'g1' },
    { from: 'c2', to: 'g2' },
    { from: 'c3', to: 'g3' },
  ],
  decor: [
    { kind: 'rock', x: 28, y: 40 },
    { kind: 'grass', x: 60, y: 40 },
    { kind: 'sign', x: 165, y: 40, text: 'Pitch 13' },
    { kind: 'cloud', x: 330, y: 90, scale: 1.2 },
    { kind: 'flowers', x: 245, y: 155 },
    { kind: 'cloud', x: 60, y: 250, scale: 1.1 },
    { kind: 'snow', x: 352, y: 270 },
    { kind: 'grass', x: 165, y: 385 },
    // Camp 1, and the first Big Leap: the landing is lost in the cloud bank.
    { kind: 'tent', x: 32, y: 500 },
    { kind: 'lantern', x: 142, y: 500 },
    { kind: 'cloud', x: 205, y: 470, scale: 1.8 },
    { kind: 'cloud', x: 300, y: 560, scale: 1.5 },
    { kind: 'rock', x: 375, y: 525 },
    // Up the far wall, then back across.
    { kind: 'snow', x: 380, y: 715 },
    { kind: 'cloud', x: 90, y: 700, scale: 1.2 },
    { kind: 'grass', x: 185, y: 830 },
    // Camp 2, the second Big Leap.
    { kind: 'tent', x: 32, y: 945 },
    { kind: 'lantern', x: 142, y: 945 },
    { kind: 'cloud', x: 205, y: 915, scale: 1.8 },
    { kind: 'cloud', x: 300, y: 1005, scale: 1.5 },
    { kind: 'flowers', x: 375, y: 970 },
    { kind: 'crystal', x: 380, y: 1160 },
    { kind: 'cloud', x: 90, y: 1150, scale: 1.1 },
    { kind: 'snow', x: 265, y: 1275 },
    // Camp 3, the third Big Leap.
    { kind: 'tent', x: 32, y: 1390 },
    { kind: 'lantern', x: 142, y: 1390 },
    { kind: 'cloud', x: 205, y: 1360, scale: 1.8 },
    { kind: 'cloud', x: 300, y: 1450, scale: 1.4 },
    { kind: 'rock', x: 375, y: 1415 },
    { kind: 'snow', x: 380, y: 1605 },
    { kind: 'cloud', x: 90, y: 1600, scale: 1.2 },
    { kind: 'grass', x: 185, y: 1720 },
    { kind: 'tent', x: 32, y: 1835 },
    { kind: 'lantern', x: 142, y: 1835 },
    { kind: 'flowers', x: 245, y: 1950 },
    { kind: 'cloud', x: 340, y: 1900, scale: 1.2 },
    { kind: 'snow', x: 352, y: 2065 },
    { kind: 'cloud', x: 60, y: 2060, scale: 1.3 },
    { kind: 'snow', x: 130, y: 2180 },
    { kind: 'flag', x: 272, y: 2180 },
  ],
}
