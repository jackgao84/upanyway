/** Level validator — Cloud Steps (p13–p15). */
import { ALL_LEVELS } from '../../src/game/levels'
import { validateLevels } from './levels'

validateLevels(ALL_LEVELS.filter((l) => l.zone === 'cloud'))
