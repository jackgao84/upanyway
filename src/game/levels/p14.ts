/**
 * Cloud Steps 2 — the giant shadow. From the second camp a huge dark shape looms in the fog across
 * the gap (Looks Scary). Big Leap into the cloud towards it and it's a fluffy marmot, backlit by the
 * sun, sunbathing on the landing ledge. Also new here: long sideways reaches to rock knobs, each one
 * tucked under the next camp so the hang ends with an easy pull-up.
 */
import type { Level } from '../types'
import { camp, hold, ledge } from './build'

export const p14: Level = {
  id: 'p14',
  index: 14,
  zone: 'cloud',
  title: "Who's in the Fog?",
  height: 2300,
  elements: [
    camp('c0', 220, 40, 180),
    ledge('a1', 145, 165, 100),
    ledge('a2', 35, 290, 100),
    ledge('a3', 145, 415, 100),
    camp('c1', 230, 540, 170),
    ledge('g1', 10, 600, 140),
    ledge('b1', 145, 725, 100),
    ledge('b2', 255, 850, 100),
    hold('h1', 120, 910, { style: 'knob' }),
    camp('c2', 0, 960, 165),
    ledge('m1', 250, 980, 150),
    ledge('d1', 145, 1105, 100),
    ledge('d2', 35, 1230, 100),
    ledge('d3', 145, 1355, 100),
    camp('c3', 230, 1480, 170),
    ledge('g3', 10, 1520, 140),
    ledge('e1', 145, 1645, 100),
    ledge('e2', 35, 1770, 100),
    hold('h2', 285, 1835, { style: 'knob' }),
    camp('c4', 230, 1895, 170),
    ledge('e3', 145, 2020, 100),
    ledge('e4', 35, 2145, 100),
    camp('top', 110, 2270, 180),
  ],
  route: [
    'c0', 'a1', 'a2', 'a3', 'c1', 'g1', 'b1', 'b2', 'h1', 'c2', 'm1',
    'd1', 'd2', 'd3', 'c3', 'g3', 'e1', 'e2', 'h2', 'c4', 'e3', 'e4', 'top',
  ],
  bigLeaps: [
    { from: 'c1', to: 'g1' },
    { from: 'c2', to: 'm1' },
    { from: 'c3', to: 'g3' },
  ],
  looksScary: { kind: 'shadow', forecastAt: 'c2', revealAt: 'm1', x: 370, y: 980 },
  decor: [
    { kind: 'rock', x: 380, y: 40 },
    { kind: 'grass', x: 350, y: 40 },
    { kind: 'sign', x: 240, y: 40, text: 'Pitch 14' },
    { kind: 'cloud', x: 70, y: 90, scale: 1.2 },
    { kind: 'flowers', x: 160, y: 165 },
    { kind: 'snow', x: 50, y: 290 },
    { kind: 'cloud', x: 340, y: 300, scale: 1.1 },
    { kind: 'grass', x: 235, y: 415 },
    // Camp 1 and the first Big Leap, rising a little as it crosses.
    { kind: 'tent', x: 380, y: 540 },
    { kind: 'lantern', x: 248, y: 540 },
    { kind: 'cloud', x: 195, y: 520, scale: 1.8 },
    { kind: 'cloud', x: 95, y: 630, scale: 1.4 },
    { kind: 'rock', x: 25, y: 600 },
    { kind: 'grass', x: 160, y: 725 },
    { kind: 'snow', x: 340, y: 850 },
    { kind: 'cloud', x: 330, y: 930, scale: 1.1 },
    // Camp 2: the Fear Forecast. A giant shadow in the fog across the gap...
    { kind: 'tent', x: 30, y: 960 },
    { kind: 'lantern', x: 150, y: 960 },
    { kind: 'cloud', x: 205, y: 935, scale: 2 },
    { kind: 'cloud', x: 320, y: 1015, scale: 1.6 },
    // ...and on the landing, the marmot's sunny spot.
    { kind: 'flowers', x: 268, y: 980 },
    { kind: 'grass', x: 300, y: 980 },
    { kind: 'rock', x: 240, y: 1105 },
    { kind: 'snow', x: 50, y: 1230 },
    { kind: 'cloud', x: 330, y: 1240, scale: 1.2 },
    { kind: 'crystal', x: 160, y: 1355 },
    // Camp 3 and the third Big Leap.
    { kind: 'tent', x: 382, y: 1480 },
    { kind: 'lantern', x: 248, y: 1480 },
    { kind: 'cloud', x: 200, y: 1460, scale: 1.8 },
    { kind: 'cloud', x: 90, y: 1555, scale: 1.4 },
    { kind: 'flowers', x: 30, y: 1520 },
    { kind: 'grass', x: 235, y: 1645 },
    { kind: 'snow', x: 120, y: 1770 },
    { kind: 'cloud', x: 200, y: 1790, scale: 1.2 },
    { kind: 'tent', x: 382, y: 1895 },
    { kind: 'lantern', x: 248, y: 1895 },
    { kind: 'rock', x: 160, y: 2020 },
    { kind: 'cloud', x: 330, y: 2080, scale: 1.3 },
    { kind: 'snow', x: 50, y: 2145 },
    { kind: 'snow', x: 130, y: 2270 },
    { kind: 'flag', x: 272, y: 2270 },
  ],
}
