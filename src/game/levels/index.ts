/** All levels, in climbing order. Levels are pure data; tests/levels/* proves each one is climbable. */
import type { Level, LevelId } from '../types'
import { lesson } from './lesson'
import { p01 } from './p01'
import { p02 } from './p02'
import { p03 } from './p03'
import { p04 } from './p04'
import { p05 } from './p05'
import { p06 } from './p06'
import { p07 } from './p07'
import { p08 } from './p08'
import { p09 } from './p09'
import { p10 } from './p10'
import { p11 } from './p11'
import { p12 } from './p12'
import { p13 } from './p13'
import { p14 } from './p14'
import { p15 } from './p15'
import { p16 } from './p16'

export const PITCHES: Level[] = [p01, p02, p03, p04, p05, p06, p07, p08, p09, p10, p11, p12, p13, p14, p15, p16]

export const ALL_LEVELS: Level[] = [lesson, ...PITCHES]

export function getLevel(id: LevelId): Level | undefined {
  return ALL_LEVELS.find((l) => l.id === id)
}
