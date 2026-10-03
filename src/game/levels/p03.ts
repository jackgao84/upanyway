/**
 * Meadow Slopes 3 — the last meadow pitch, where the grass runs out at the edge of the woods.
 * Same leaping-and-ledges language as p01/p02, ramping gently inside the pitch: a warm-up swing on
 * 115-wide ledges, a second swing on 110s, then one friendly Big Leap across a misty gully (a wide
 * landing only a little higher than the camp), then narrower ledges (105, then 100) with taller rises
 * up through the first pines. The top is a wide, easy step. A lantern at the top hints at Firefly Hollow.
 */
import type { Level } from '../types'
import { camp, ledge } from './build'

export const p03: Level = {
  id: 'p03',
  index: 3,
  zone: 'meadow',
  title: 'Edge of the Woods',
  height: 1900,
  elements: [
    camp('c0', 205, 40, 170),
    ledge('a1', 140, 130, 115),
    ledge('a2', 25, 220, 115),
    ledge('a3', 140, 310, 115),
    ledge('a4', 262, 400, 115),
    camp('c1', 120, 490, 170),
    ledge('b1', 28, 585, 110),
    ledge('b2', 143, 680, 110),
    ledge('b3', 265, 775, 110),
    ledge('b4', 143, 870, 110),
    camp('c2', 10, 965, 160),
    // The Big Leap: across the misty gully to a wide ledge, only 45 higher than the camp.
    ledge('hop', 245, 1010, 145),
    ledge('d1', 145, 1115, 105),
    ledge('d2', 30, 1220, 105),
    ledge('d3', 145, 1325, 105),
    camp('c3', 215, 1430, 170),
    ledge('e1', 148, 1540, 100),
    ledge('e2', 33, 1650, 100),
    ledge('e3', 148, 1760, 100),
    camp('top', 215, 1855, 170),
  ],
  route: [
    'c0', 'a1', 'a2', 'a3', 'a4', 'c1', 'b1', 'b2', 'b3', 'b4', 'c2', 'hop',
    'd1', 'd2', 'd3', 'c3', 'e1', 'e2', 'e3', 'top',
  ],
  bigLeaps: [{ from: 'c2', to: 'hop' }],
  decor: [
    // Meadow: flowers, grass, bushes.
    { kind: 'flowers', x: 228, y: 40 },
    { kind: 'sign', x: 350, y: 40, text: 'Pitch 3' },
    { kind: 'grass', x: 160, y: 130 },
    { kind: 'flowers', x: 45, y: 220 },
    { kind: 'grass', x: 235, y: 310 },
    { kind: 'bush', x: 355, y: 400 },
    { kind: 'tent', x: 265, y: 490 },
    { kind: 'flowers', x: 140, y: 490 },
    { kind: 'grass', x: 50, y: 585 },
    { kind: 'flowers', x: 235, y: 680 },
    { kind: 'bush', x: 355, y: 775 },
    { kind: 'mushroom', x: 160, y: 870 },
    // The gully: mist below the Big Leap, flowers waiting on the far side.
    { kind: 'tent', x: 32, y: 965 },
    { kind: 'cloud', x: 205, y: 935, scale: 1.7 },
    { kind: 'cloud', x: 320, y: 960, scale: 1.1 },
    { kind: 'flowers', x: 370, y: 1010 },
    // Into the first pines.
    { kind: 'mushroom', x: 235, y: 1115 },
    { kind: 'pine', x: 48, y: 1220, scale: 0.7 },
    { kind: 'grass', x: 160, y: 1325 },
    { kind: 'pine', x: 235, y: 1430, scale: 0.85 },
    { kind: 'tent', x: 365, y: 1430 },
    { kind: 'mushroom', x: 165, y: 1540 },
    { kind: 'pine', x: 50, y: 1650, scale: 0.8 },
    { kind: 'rock', x: 232, y: 1760 },
    // The edge of the woods: tall pines, a lantern for the hollow ahead, the flag.
    { kind: 'pine', x: 232, y: 1855, scale: 1.1 },
    { kind: 'lantern', x: 345, y: 1855 },
    { kind: 'flag', x: 375, y: 1855 },
  ],
}
