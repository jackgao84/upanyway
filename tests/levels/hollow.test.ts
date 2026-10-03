/** Level validator — Firefly Hollow (p04–p06). */
import { ALL_LEVELS } from '../../src/game/levels'
import { validateLevels } from './levels'

validateLevels(ALL_LEVELS.filter((l) => l.zone === 'hollow'))
