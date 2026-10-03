/**
 * Crumble Cliffs 2 — the rumbling cliff. Looks Scary: from the second camp the whole wall rumbles and
 * a dark cave mouth waits above. Up close it is a bear, fast asleep and snoring. The fork in the first
 * section starts on a crumbly rock (choose quickly!), there is a long swing across to a root, and the
 * last screen ends with two crumbly stepping stones in a row.
 */
import type { Level } from '../types'
import { camp, hold, ledge } from './build'

export const p08: Level = {
  id: 'p08',
  index: 8,
  zone: 'crumble',
  title: 'Rumbly Wall',
  height: 2140,
  elements: [
    camp('c0', 20, 40, 180),
    ledge('a1', 165, 140, 110),
    ledge('a2', 265, 245, 110),
    ledge('a3', 158, 350, 105, { crumble: true }),
    ledge('a4', 265, 455, 110),
    ledge('dA', 15, 365, 105, { crumble: true }),
    camp('c1', 220, 585, 170),
    ledge('b1', 140, 695, 105),
    ledge('b2', 30, 800, 110),
    ledge('den', 10, 910, 160, { standX: 125 }),
    ledge('b4', 178, 1015, 105, { crumble: true }),
    camp('c2', 215, 1120, 165),
    ledge('e1', 145, 1230, 105),
    ledge('e2', 25, 1335, 105),
    hold('h1', 295, 1390, { style: 'root' }),
    ledge('e3', 152, 1455, 105),
    ledge('e4', 35, 1560, 105, { crumble: true }),
    camp('c3', 20, 1685, 165),
    ledge('f1', 150, 1790, 105, { crumble: true }),
    ledge('f2', 255, 1895, 105, { crumble: true }),
    camp('top', 110, 2000, 170),
  ],
  route: ['c0', 'a1', 'a2', 'a3', 'a4', 'c1', 'b1', 'b2', 'den', 'b4', 'c2', 'e1', 'e2', 'h1', 'e3', 'e4', 'c3', 'f1', 'f2', 'top'],
  looksScary: { kind: 'rumble', forecastAt: 'c1', revealAt: 'den', x: 45, y: 910 },
  decor: [],
}
