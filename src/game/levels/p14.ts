/**
 * Cloud Steps 2 — the giant shadow. From the second camp a huge dark shape looms in the fog across
 * the gap (Looks Scary). Big Leap into the cloud towards it and it's a fluffy marmot, backlit by the
 * sun, sunbathing on the landing ledge. Also new here: long sideways reaches to rock knobs, each one
 * tucked under the next camp so the hang ends with an easy pull-up.
 * After every Big Leap the way on is a tall step straight up the wall above the landing (too strong
 * just slides down the wall onto it) — high and far from the camp, so the leap can't be skipped.
 * The way up to the forecast camp stays low and on the far side from the marmot's ledge: the knob
 * hangs against the left wall under the camp's far end (a tall straight pull up), so nothing below
 * the camp can reach the landing — she always stands on the camp and gets asked first.
 */
import type { Level } from '../types'
import { camp, hold, ledge } from './build'

export const p14: Level = {
  id: 'p14',
  index: 14,
  zone: 'cloud',
  title: "Who's in the Fog?",
  height: 2350,
  elements: [
    camp('c0', 220, 40, 180),
    ledge('a1', 145, 165, 100),
    ledge('a2', 35, 290, 100),
    ledge('a3', 145, 415, 100),
    camp('c1', 230, 540, 170),
    ledge('g1', 10, 580, 140),
    ledge('b1', 0, 755, 100),
    ledge('b2', 140, 855, 100),
    hold('h1', 22, 962, { style: 'knob' }),
    camp('c2', 0, 1095, 165),
    ledge('m1', 250, 1120, 150),
    ledge('d1', 300, 1310, 100),
    ledge('d2', 170, 1425, 110),
    camp('c3', 0, 1540, 160),
    ledge('g3', 250, 1580, 140),
    ledge('e1', 300, 1755, 100),
    ledge('e2', 170, 1870, 110),
    ledge('e3', 35, 1985, 100),
    hold('h2', 285, 2050, { style: 'knob' }),
    camp('c4', 230, 2110, 170),
    camp('top', 110, 2225, 180),
  ],
  route: [
    'c0', 'a1', 'a2', 'a3', 'c1', 'g1', 'b1', 'b2', 'h1', 'c2', 'm1',
    'd1', 'd2', 'c3', 'g3', 'e1', 'e2', 'e3', 'h2', 'c4', 'top',
  ],
  bigLeaps: [
    { from: 'c1', to: 'g1' },
    { from: 'c2', to: 'm1' },
    { from: 'c3', to: 'g3' },
  ],
  looksScary: { kind: 'shadow', forecastAt: 'c2', revealAt: 'm1', x: 370, y: 1120 },
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
    { kind: 'cloud', x: 95, y: 615, scale: 1.4 },
    { kind: 'rock', x: 25, y: 580 },
    { kind: 'snow', x: 20, y: 755 },
    { kind: 'grass', x: 155, y: 855 },
    { kind: 'snow', x: 225, y: 855 },
    { kind: 'cloud', x: 330, y: 1065, scale: 1.1 },
    // Camp 2: the Fear Forecast. A giant shadow in the fog across the gap...
    { kind: 'tent', x: 30, y: 1095 },
    { kind: 'lantern', x: 150, y: 1095 },
    { kind: 'cloud', x: 205, y: 1070, scale: 2 },
    { kind: 'cloud', x: 320, y: 1155, scale: 1.6 },
    // ...and on the landing, the marmot's sunny spot.
    { kind: 'flowers', x: 268, y: 1120 },
    { kind: 'grass', x: 300, y: 1120 },
    { kind: 'rock', x: 385, y: 1310 },
    { kind: 'cloud', x: 90, y: 1330, scale: 1.2 },
    { kind: 'snow', x: 185, y: 1425 },
    // Camp 3 and the third Big Leap.
    { kind: 'tent', x: 32, y: 1540 },
    { kind: 'lantern', x: 142, y: 1540 },
    { kind: 'cloud', x: 205, y: 1510, scale: 1.8 },
    { kind: 'cloud', x: 300, y: 1615, scale: 1.4 },
    { kind: 'flowers', x: 375, y: 1580 },
    { kind: 'crystal', x: 385, y: 1755 },
    { kind: 'grass', x: 265, y: 1870 },
    { kind: 'snow', x: 50, y: 1985 },
    { kind: 'cloud', x: 200, y: 2005, scale: 1.2 },
    { kind: 'tent', x: 382, y: 2110 },
    { kind: 'lantern', x: 248, y: 2110 },
    { kind: 'cloud', x: 40, y: 2170, scale: 1.3 },
    { kind: 'snow', x: 130, y: 2225 },
    { kind: 'flag', x: 272, y: 2225 },
  ],
}
