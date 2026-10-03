/**
 * Gusty Ridge 1 — the wind arrives. The first screen is calm; from the second camp up, gusts
 * sweep the ridge on one slow, steady rhythm: whoosh … calm … whoosh. Every leap is easy in the
 * calm; leaping in a gust blows her sideways. The whole ridge gusts together so the beat is easy
 * to learn: wait for the grass to stand up, then go.
 */
import type { Level } from '../types'
import { camp, ledge } from './build'

export const p10: Level = {
  id: 'p10',
  index: 10,
  zone: 'ridge',
  title: 'Whoosh, Then Go',
  height: 2230,
  elements: [
    camp('c0', 20, 40, 170),
    ledge('a1', 150, 152, 110),
    ledge('a2', 260, 264, 110),
    ledge('a3', 150, 376, 110),
    ledge('a4', 40, 488, 110),
    camp('c1', 125, 600, 170),
    ledge('b1', 260, 712, 110),
    ledge('b2', 150, 824, 110),
    ledge('b3', 40, 936, 110),
    ledge('b4', 150, 1048, 110),
    camp('c2', 225, 1160, 170),
    ledge('d1', 150, 1272, 110),
    ledge('d2', 40, 1384, 110),
    // The crest: a long, low hop along the top of the ridge.
    ledge('d3', 220, 1414, 120),
    ledge('d4', 115, 1526, 110),
    camp('c3', 200, 1638, 170),
    ledge('e1', 120, 1750, 110),
    ledge('e2', 10, 1862, 110),
    ledge('e3', 120, 1974, 110),
    camp('top', 200, 2086, 180),
  ],
  route: [
    'c0', 'a1', 'a2', 'a3', 'a4', 'c1',
    'b1', 'b2', 'b3', 'b4', 'c2',
    'd1', 'd2', 'd3', 'd4', 'c3',
    'e1', 'e2', 'e3', 'top',
  ],
  // One rhythm for the whole pitch: 1.2 s of gust, 3.3 s of calm. Camps sit in the still air between bands.
  wind: [
    { id: 'w1', x: 0, y: 635, w: 400, h: 535, dir: 1, accel: 280, period: 4.5, gust: 1.2, offset: 0 },
    { id: 'w2', x: 0, y: 1195, w: 400, h: 453, dir: -1, accel: 280, period: 4.5, gust: 1.2, offset: 0 },
    { id: 'w3', x: 0, y: 1673, w: 400, h: 423, dir: 1, accel: 280, period: 4.5, gust: 1.2, offset: 0 },
  ],
  decor: [
    { kind: 'pine', x: 40, y: 40, scale: 0.9 },
    { kind: 'sign', x: 160, y: 40, text: 'Pitch 10' },
    { kind: 'grass', x: 240, y: 140 },
    { kind: 'rock', x: 350, y: 240 },
    { kind: 'grass', x: 170, y: 340 },
    { kind: 'bush', x: 60, y: 440 },
    { kind: 'tent', x: 150, y: 540 },
    { kind: 'sign', x: 255, y: 540, text: 'Whoosh, then go' },
    { kind: 'grass', x: 350, y: 640 },
    { kind: 'grass', x: 170, y: 745 },
    { kind: 'rock', x: 60, y: 850 },
    { kind: 'grass', x: 240, y: 955 },
    { kind: 'tent', x: 250, y: 1060 },
    { kind: 'lantern', x: 375, y: 1060 },
    { kind: 'grass', x: 235, y: 1165 },
    { kind: 'pine', x: 50, y: 1270, scale: 0.7 },
    { kind: 'grass', x: 240, y: 1480 },
    { kind: 'tent', x: 360, y: 1585 },
    { kind: 'grass', x: 235, y: 1690 },
    { kind: 'rock', x: 60, y: 1795 },
    { kind: 'grass', x: 170, y: 1900 },
    { kind: 'cloud', x: 300, y: 2120, scale: 1.4 },
    { kind: 'tent', x: 240, y: 2010 },
    { kind: 'flag', x: 370, y: 2010 },
  ],
}
