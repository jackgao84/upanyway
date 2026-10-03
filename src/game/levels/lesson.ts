/**
 * The 20-second first-run lesson: one easy leap to a ledge, then "fall practice" — from that ledge
 * nothing else is reachable, so leaping off the edge always ends with the rope catching her.
 */
import type { Level } from '../types'
import { camp } from './build'

export const lesson: Level = {
  id: 'lesson',
  index: 0,
  zone: 'meadow',
  title: 'Practice Rock',
  height: 600,
  elements: [
    camp('c0', 30, 40, 150),
    // A camp too, so the rope anchors here for fall practice.
    camp('c1', 175, 130, 140),
  ],
  route: ['c0', 'c1'],
  decor: [
    { kind: 'tree', x: 20, y: 40, scale: 1.1 },
    { kind: 'flowers', x: 120, y: 40 },
    { kind: 'grass', x: 250, y: 130 },
    { kind: 'sign', x: 290, y: 130, text: 'Fall practice' },
  ],
}
