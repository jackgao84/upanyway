/**
 * Gusty Ridge 2 — the rope bridge. Looks Scary: from the second camp she sees a long, rickety rope
 * bridge swaying over a misty gap in the ridge, right in the gusts. Up close it is the widest, friendliest
 * landing on the pitch: it creaks, it sways, and it holds. Same steady rhythm as before (whoosh … calm),
 * a little stronger, and a long sideways reach to a hold across a notch.
 */
import type { Level } from '../types'
import { camp, hold, ledge } from './build'

export const p11: Level = {
  id: 'p11',
  index: 11,
  zone: 'ridge',
  title: 'The Wobbly Bridge',
  height: 2250,
  elements: [
    // The first screen climbs right to left, up to the far wall from the bridge: a3 is tucked under the
    // camp and the last move is a tall pull straight up, so the bridge is out of reach until she stands
    // on c1 (and gets her Fear Forecast).
    camp('c0', 225, 40, 170),
    ledge('a1', 170, 145, 110),
    ledge('a2', 85, 250, 110),
    ledge('a3', 0, 365, 110),
    camp('c1', 10, 520, 160),
    // The rope bridge: rickety-looking, swaying in the gusts, and very wide. She walks to its far end.
    ledge('bridge', 150, 620, 230, { bridge: true, standX: 330 }),
    ledge('b1', 165, 740, 110),
    ledge('b2', 40, 860, 110),
    // A long sideways reach across the notch.
    hold('h1', 295, 940, { style: 'jug' }),
    camp('c2', 215, 1040, 170),
    ledge('d1', 150, 1160, 110),
    ledge('d2', 40, 1280, 110),
    ledge('d3', 150, 1400, 110),
    ledge('d4', 260, 1520, 110),
    camp('c3', 115, 1640, 170),
    ledge('e1', 30, 1760, 110),
    // The crest again: a long, low hop along the top of the ridge.
    ledge('e2', 215, 1790, 120),
    ledge('e3', 110, 1910, 110),
    ledge('e4', 5, 2030, 110),
    camp('top', 100, 2150, 180),
  ],
  route: [
    'c0', 'a1', 'a2', 'a3', 'c1',
    'bridge', 'b1', 'b2', 'h1', 'c2',
    'd1', 'd2', 'd3', 'd4', 'c3',
    'e1', 'e2', 'e3', 'e4', 'top',
  ],
  // One rhythm for the whole pitch: 1.4 s of gust, 2.8 s of calm; the bands blow alternately right and left.
  wind: [
    { id: 'w1', x: 0, y: 75, w: 400, h: 455, dir: 1, accel: 340, period: 4.2, gust: 1.4, offset: 0 },
    { id: 'w2', x: 0, y: 555, w: 400, h: 495, dir: -1, accel: 340, period: 4.2, gust: 1.4, offset: 0 },
    { id: 'w3', x: 0, y: 1075, w: 400, h: 575, dir: 1, accel: 340, period: 4.2, gust: 1.4, offset: 0 },
    { id: 'w4', x: 0, y: 1675, w: 400, h: 485, dir: -1, accel: 340, period: 4.2, gust: 1.4, offset: 0 },
  ],
  looksScary: { kind: 'bridge', forecastAt: 'c1', revealAt: 'bridge', x: 265, y: 620 },
  decor: [
    { kind: 'sign', x: 250, y: 40, text: 'Pitch 11' },
    { kind: 'pine', x: 360, y: 40, scale: 0.8 },
  ],
}
