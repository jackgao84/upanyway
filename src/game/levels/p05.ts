/**
 * Firefly Hollow 2 — Looks Scary: glowing eyes in a dark cave. From camp c1 two eyes blink in a cave
 * mouth up the right-hand wall. The route climbs straight to its lip — and the "eyes" are fireflies.
 * A hidden root on the left wall is a shortcut for anyone who falls past it.
 */
import type { Level } from '../types'
import { camp, hold, ledge } from './build'

export const p05: Level = {
  id: 'p05',
  index: 5,
  zone: 'hollow',
  title: 'Who’s in the Cave?',
  height: 1960,
  elements: [
    camp('c0', 200, 40, 170),
    ledge('a1', 120, 130, 120),
    hold('h1', 24, 270, { style: 'root' }),
    ledge('a2', 60, 300, 120),
    ledge('a3', 170, 390, 120),
    ledge('a4', 270, 480, 120),
    camp('c1', 150, 570, 170),
    ledge('b1', 30, 660, 120),
    ledge('b2', 140, 750, 120),
    ledge('lip', 255, 840, 135),
    ledge('b3', 140, 930, 120),
    camp('c2', 20, 1020, 170),
    ledge('d1', 150, 1110, 120),
    hold('h2', 376, 1250, { style: 'root' }),
    ledge('d2', 220, 1280, 120),
    ledge('d3', 110, 1370, 120),
    hold('h3', 24, 1510, { style: 'jug' }),
    camp('c3', 60, 1540, 170),
    ledge('e1', 230, 1630, 120),
    ledge('e2', 110, 1720, 120),
    ledge('e3', 230, 1810, 120),
    camp('top', 100, 1900, 170),
    hold('secret', 24, 1260, { style: 'root', hidden: true }),
  ],
  route: [
    'c0', 'a1', 'h1', 'a2', 'a3', 'a4', 'c1', 'b1', 'b2', 'lip', 'b3', 'c2',
    'd1', 'h2', 'd2', 'd3', 'h3', 'c3', 'e1', 'e2', 'e3', 'top',
  ],
  looksScary: { kind: 'eyes', forecastAt: 'c1', revealAt: 'lip', x: 362, y: 880 },
  decor: [
    { kind: 'sign', x: 340, y: 40, text: 'Pitch 5' },
    { kind: 'cave', x: 362, y: 840, scale: 1.3 },
  ],
}
