/** Level validator — the summit pitch (p16). */
import { ALL_LEVELS } from '../../src/game/levels'
import { validateLevels } from './levels'

validateLevels(ALL_LEVELS.filter((l) => l.zone === 'summit'))
