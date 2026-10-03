/** Level validator — Gusty Ridge (p10–p12). */
import { ALL_LEVELS } from '../../src/game/levels'
import { validateLevels } from './levels'

validateLevels(ALL_LEVELS.filter((l) => l.zone === 'ridge'))
