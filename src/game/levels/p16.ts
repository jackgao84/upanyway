/**
 * The Summit — Sky Lake. Everything she learned, one last time, all the way up:
 * meadow steps; two big jugs to hang from at the edges of the face (Firefly Hollow); one crumbly
 * stepping stone just after a camp (Crumble Cliffs); one gentle gust on the ridge's beat — leap in
 * the whoosh and it just blows her back onto her own ledge (Gusty Ridge); snowy narrow ledges; and a
 * friendly Big Leap from the last camp onto the shore of Sky Lake (Cloud Steps).
 * No Looks Scary here: nothing on the summit pretends to be scary. The finale plays at the top.
 */
import type { Level } from '../types'
import { camp, hold, ledge } from './build'

export const p16: Level = {
  id: 'p16',
  index: 16,
  zone: 'summit',
  title: 'Up to Sky Lake',
  height: 2000,
  elements: [
    // Meadow memories: easy steps.
    camp('c0', 20, 40, 170),
    ledge('a1', 140, 135, 125),
    ledge('a2', 252, 230, 125),
    ledge('a3', 142, 325, 125),
    camp('c1', 10, 420, 170),
    // Hollow memories: leap to a jug at the edge of the face, hang, then pull up onto the ledge beside it.
    ledge('b1', 110, 515, 125),
    hold('h1', 378, 600, { style: 'jug' }),
    ledge('b2', 225, 670, 125),
    hold('h2', 22, 760, { style: 'jug' }),
    ledge('b4', 55, 830, 125),
    camp('c2', 140, 925, 170),
    // Crumble memories: one crumbly stepping stone. Then the ridge: one gentle gust (e3 → e4).
    ledge('cr', 75, 1020, 125, { crumble: true }),
    ledge('e2', 190, 1115, 125),
    ledge('e3', 270, 1210, 125),
    ledge('e4', 160, 1305, 125),
    camp('c3', 20, 1400, 170),
    // Up in the snow: narrower ledges, then the last camp and the Big Leap to Sky Lake.
    ledge('f1', 148, 1500, 110),
    ledge('f2', 260, 1600, 110),
    ledge('f3', 138, 1705, 110),
    camp('c4', 0, 1810, 150),
    camp('top', 220, 1850, 180),
  ],
  route: [
    'c0', 'a1', 'a2', 'a3', 'c1',
    'b1', 'h1', 'b2', 'h2', 'b4', 'c2',
    'cr', 'e2', 'e3', 'e4', 'c3',
    'f1', 'f2', 'f3', 'c4', 'top',
  ],
  bigLeaps: [{ from: 'c4', to: 'top' }],
  // The ridge's beat (1.2 s whoosh, 3.3 s calm), gentler. It only really matters for e3 → e4: leap in
  // the whoosh and it pushes her back onto e3. Camps c2 and c3 sit in still air.
  wind: [{ id: 'w1', x: 190, y: 1230, w: 210, h: 130, dir: 1, accel: 240, period: 4.5, gust: 1.2, offset: 0 }],
  finale: true,
  decor: [
    { kind: 'tree', x: 35, y: 40, scale: 1.1 },
    { kind: 'flowers', x: 70, y: 40 },
    { kind: 'sign', x: 160, y: 40, text: 'Pitch 16' },
    { kind: 'flowers', x: 250, y: 135 },
    { kind: 'bush', x: 360, y: 230 },
    { kind: 'grass', x: 160, y: 325 },
    { kind: 'tent', x: 35, y: 420 },
    { kind: 'flowers', x: 160, y: 420 },
    // Firefly Hollow memories.
    { kind: 'mushroom', x: 125, y: 515 },
    { kind: 'mushroom', x: 240, y: 670 },
    { kind: 'crystal', x: 335, y: 670 },
    { kind: 'mushroom', x: 70, y: 830 },
    { kind: 'lantern', x: 165, y: 830 },
    { kind: 'tent', x: 285, y: 925 },
    { kind: 'lantern', x: 160, y: 925 },
    // Crumble Cliffs memories: a few pebbles by the crumbly stone.
    { kind: 'rock', x: 90, y: 1020, scale: 0.7 },
    { kind: 'rock', x: 300, y: 1115, scale: 0.8 },
    // Gusty Ridge memories: grass that bends in the whoosh.
    { kind: 'grass', x: 380, y: 1210 },
    { kind: 'sign', x: 290, y: 1210, text: 'Whoosh, then go' },
    { kind: 'grass', x: 175, y: 1305 },
    { kind: 'tent', x: 40, y: 1400 },
    { kind: 'sign', x: 170, y: 1400, text: 'Nearly there!' },
    // Snow and clouds.
    { kind: 'cloud', x: 330, y: 1450, scale: 1.2 },
    { kind: 'snow', x: 245, y: 1500 },
    { kind: 'pine', x: 355, y: 1600, scale: 0.7 },
    { kind: 'snow', x: 150, y: 1705 },
    { kind: 'tent', x: 25, y: 1810 },
    { kind: 'lantern', x: 135, y: 1810 },
    { kind: 'cloud', x: 185, y: 1760, scale: 1.7 },
    // Sky Lake.
    { kind: 'sign', x: 240, y: 1850, text: 'Sky Lake' },
    { kind: 'flowers', x: 350, y: 1850 },
    { kind: 'flag', x: 385, y: 1850 },
    { kind: 'cloud', x: 300, y: 1960, scale: 1.3 },
  ],
}
