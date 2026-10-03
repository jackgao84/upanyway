/** Level validator — Crumble Cliffs (p07–p09). */
import { ALL_LEVELS } from '../../src/game/levels'
import { validateLevels } from './levels'

validateLevels(ALL_LEVELS.filter((l) => l.zone === 'crumble'))
