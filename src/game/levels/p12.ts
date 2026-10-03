/**
 * Gusty Ridge 3 — the wind takes turns. Two bands of wind share one steady beat but blow half a
 * beat apart: the lower band gusts, then the upper band, then calm again (whoosh-low … whoosh-high …
 * calm). Each camp sits in a sheltered pocket under a rock, so she can watch the band above her and
 * pick her moment. Longer crest hops and two big sideways reaches to holds make it the hardest
 * pitch of the ridge, but every leap is easy to time once she hears the beat.
 */
import type { Level } from '../types'
import { camp, hold, ledge } from './build'

export const p12: Level = {
  id: 'p12',
  index: 12,
  zone: 'ridge',
  title: 'The Wind Takes Turns',
  height: 2280,
  elements: [
    camp('c0', 15, 40, 170),
    ledge('a1', 155, 170, 100),
    // A secret knob by the left wall, spotted only by falling past it: from the first camp it skips a1.
    hold('s1', 30, 200, { hidden: true, style: 'knob' }),
    ledge('a2', 45, 300, 100),
    ledge('a3', 155, 430, 100),
    camp('c1', 10, 560, 170),
    // A long sideways reach across the notch to a jug.
    hold('h1', 295, 655, { style: 'jug' }),
    ledge('b2', 140, 741, 100),
    ledge('b3', 35, 871, 100),
    ledge('b4', 145, 1001, 100),
    camp('c2', 215, 1131, 170),
    ledge('d1', 145, 1261, 100),
    ledge('d2', 30, 1391, 100),
    // The crest: a long, low hop along the top of the ridge.
    ledge('d3', 220, 1436, 120),
    ledge('d4', 120, 1566, 100),
    camp('c3', 10, 1696, 170),
    hold('h2', 295, 1791, { style: 'jug' }),
    ledge('e2', 140, 1877, 100),
    ledge('e3', 35, 2007, 100),
    camp('top', 150, 2137, 180),
  ],
  route: [
    'c0', 'a1', 'a2', 'a3', 'c1',
    'h1', 'b2', 'b3', 'b4', 'c2',
    'd1', 'd2', 'd3', 'd4', 'c3',
    'h2', 'e2', 'e3', 'top',
  ],
  // One 4.2 s beat for the whole pitch. Each gust rolls up the ridge: the lower band of each pair gusts
  // first (0–1.3 s), the band above it a moment later (0.7–2 s), then everything is calm for 2.2 s.
  // Camps sit in the still air between bands.
  wind: [
    { id: 'high1', x: 0, y: 595, w: 400, h: 546, dir: -1, accel: 420, period: 4.2, gust: 1.3, offset: 0.7 },
    { id: 'low1', x: 0, y: 75, w: 400, h: 495, dir: 1, accel: 420, period: 4.2, gust: 1.3, offset: 0 },
    { id: 'low2', x: 0, y: 1166, w: 400, h: 540, dir: 1, accel: 420, period: 4.2, gust: 1.3, offset: 0 },
    { id: 'high2', x: 0, y: 1731, w: 400, h: 416, dir: -1, accel: 420, period: 4.2, gust: 1.3, offset: 0.7 },
  ],
  decor: [
    { kind: 'sign', x: 40, y: 40, text: 'Pitch 12' },
  ],
}
