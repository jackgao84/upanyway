/**
 * Crumble Cliffs 3 — the hardest crumble pitch. It opens with a wobbly staircase (three crumbly rocks
 * in a row), hides a hold above the second camp's first ledge (spotted on the way down after a
 * straight-up leap; a shortcut past the long swing), forks on a crumbly rock with a low crumbly trap
 * beside the real step, and finishes with a swing across to a root and two last wobbly rocks.
 */
import type { Level } from '../types'
import { camp, hold, ledge } from './build'

export const p09: Level = {
  id: 'p09',
  index: 9,
  zone: 'crumble',
  title: 'Crumble Crest',
  height: 2110,
  elements: [
    camp('c0', 20, 40, 180),
    ledge('a1', 160, 145, 105, { crumble: true }),
    ledge('a2', 265, 250, 105, { crumble: true }),
    ledge('a3', 155, 355, 105, { crumble: true }),
    ledge('a4', 45, 460, 110),
    camp('c1', 130, 570, 170),
    ledge('b1', 255, 675, 110),
    ledge('b2', 140, 780, 110),
    ledge('b3', 30, 885, 105),
    ledge('b4', 140, 990, 110),
    camp('c2', 220, 1100, 165),
    ledge('e1', 150, 1205, 105, { crumble: true }),
    ledge('e2', 255, 1310, 110, { crumble: true }),
    ledge('dC', 35, 1230, 105, { crumble: true }),
    ledge('e3', 270, 1430, 110),
    camp('c3', 130, 1535, 170),
    ledge('f1', 25, 1640, 110),
    hold('h1', 300, 1690, { style: 'root' }),
    hold('hh', 250, 1650, { hidden: true, style: 'crystal' }),
    ledge('f2', 150, 1755, 105, { crumble: true }),
    ledge('f3', 35, 1860, 105, { crumble: true }),
    camp('top', 120, 1965, 170),
  ],
  route: ['c0', 'a1', 'a2', 'a3', 'a4', 'c1', 'b1', 'b2', 'b3', 'b4', 'c2', 'e1', 'e2', 'e3', 'c3', 'f1', 'h1', 'f2', 'f3', 'top'],
  decor: [],
}
