/**
 * Crumble Cliffs 1 — some ledges crumble a moment after she lands; they look solid until she has
 * stood on one. The route's crumbly rocks are quick stepping stones with an easy hop off them (and a
 * solid ledge right below, so the first surprise only costs a step or two). Two forks offer a
 * tempting crumbly twin beside the real step: that one is a dead end, and when it gives way the fall
 * is how she learns which way the route goes.
 */
import type { Level } from '../types'
import { camp, ledge } from './build'

export const p07: Level = {
  id: 'p07',
  index: 7,
  zone: 'crumble',
  title: 'Wobbly Rocks',
  height: 2000,
  elements: [
    camp('c0', 20, 40, 180),
    ledge('a1', 160, 140, 120),
    ledge('a2', 260, 240, 120),
    ledge('a3', 155, 340, 110, { crumble: true }),
    ledge('a4', 40, 440, 120),
    camp('c1', 130, 545, 170),
    ledge('b1', 260, 645, 120),
    ledge('b2', 150, 745, 120),
    ledge('b3', 262, 845, 115),
    ledge('dB', 45, 795, 110, { crumble: true }),
    ledge('b4', 275, 965, 110, { crumble: true }),
    camp('c2', 130, 1065, 170),
    ledge('e1', 20, 1165, 120),
    ledge('e2', 130, 1265, 120),
    ledge('e3', 23, 1365, 115),
    ledge('dC', 245, 1315, 110, { crumble: true }),
    ledge('e4', 15, 1485, 110, { crumble: true }),
    camp('c3', 100, 1585, 170),
    ledge('f1', 235, 1685, 120),
    ledge('f2', 135, 1785, 110, { crumble: true }),
    camp('top', 10, 1885, 170),
  ],
  route: ['c0', 'a1', 'a2', 'a3', 'a4', 'c1', 'b1', 'b2', 'b3', 'b4', 'c2', 'e1', 'e2', 'e3', 'e4', 'c3', 'f1', 'f2', 'top'],
  decor: [
    { kind: 'pine', x: 40, y: 40, scale: 1.1 },
    { kind: 'sign', x: 175, y: 40, text: 'Pitch 7' },
    { kind: 'rock', x: 140, y: 40, scale: 0.7 },
    { kind: 'grass', x: 250, y: 140 },
    { kind: 'rock', x: 350, y: 240, scale: 0.6 },
    { kind: 'grass', x: 60, y: 440 },
    { kind: 'tent', x: 260, y: 540 },
    { kind: 'bush', x: 150, y: 540 },
    { kind: 'mushroom', x: 70, y: 640 },
    { kind: 'grass', x: 260, y: 740 },
    { kind: 'rock', x: 355, y: 840, scale: 0.7 },
    { kind: 'tent', x: 150, y: 1060 },
    { kind: 'lantern', x: 270, y: 1060 },
    { kind: 'grass', x: 250, y: 1250 },
    { kind: 'pine', x: 360, y: 1550, scale: 0.8 },
    { kind: 'tent', x: 150, y: 1550 },
    { kind: 'mushroom', x: 60, y: 1650 },
    { kind: 'bush', x: 250, y: 1860 },
    { kind: 'flag', x: 360, y: 1860 },
  ],
}
