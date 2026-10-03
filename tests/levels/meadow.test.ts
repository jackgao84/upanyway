/** Level validator — the lesson and Meadow Slopes (p01–p03). */
import { ALL_LEVELS } from '../../src/game/levels'
import { validateLevels } from './levels'

validateLevels(ALL_LEVELS.filter((l) => l.id === 'lesson' || l.zone === 'meadow'))
