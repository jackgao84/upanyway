/**
 * The route table and the guard that keeps the first run in order.
 *
 * Guard rules:
 * - Until the grown-up part is done, only /setup/hello and /setup/names (names needs a PIN first).
 * - Until the whole first run is done, only /setup/* — her steps up to where she has got to
 *   (and the designer, which the hand-over screen opens). Anything else resumes the first run.
 * - Once it is done, /setup/* goes to camp (a parent reset makes a fresh save, so setup opens again).
 * - /parent/* needs the PIN gate passed in this visit; leaving the grown-up pages locks them again.
 * - '/' goes to camp, or to the right first-run step.
 * - Summit reached but Sky Lake not seen yet (the app was closed during the finale, or reloaded on the
 *   summit pitch's Beta Map): camp, the Trail Map and any climb route open the finale first, so the
 *   goat's first time out of the pack is never skipped.
 */
import { cairnScreen } from '../screens/cairn'
import { campScreen } from '../screens/camp'
import { climbScreen } from '../screens/climb'
import { finaleScreen } from '../screens/finale'
import { badgesScreen } from '../screens/badges'
import { flopsScreen } from '../screens/flops'
import { lettersScreen } from '../screens/letters'
import { mapScreen } from '../screens/map'
import { logDidScreen, logScreen } from '../screens/log'
import { gateScreen } from '../screens/parent/gate'
import { parentScreen } from '../screens/parent/home'
import { plansScreen } from '../screens/plans'
import { braveScreen } from '../screens/setup/brave'
import { cheerScreen } from '../screens/setup/cheer'
import { climberScreen } from '../screens/setup/climber'
import { goatScreen } from '../screens/setup/goat'
import { handoverScreen } from '../screens/setup/handover'
import { helloScreen } from '../screens/setup/hello'
import { lessonScreen } from '../screens/setup/lesson'
import { mountainScreen } from '../screens/setup/mountain'
import { namesScreen } from '../screens/setup/names'
import { wardrobeScreen } from '../screens/wardrobe'
import { weatherScreen } from '../screens/weather'
import { hasPin } from '../model/pin'
import type { SaveData } from '../storage/schema'
import { isParentUnlocked, KID_STEPS, lockParent, save, setupPath, setupStep, type KidStep } from './context'
import type { Guard, Route, RouteMatch, Screen } from './router'

/** Never shown: the guard always redirects these paths first. */
const redirectOnly: Screen = () => undefined

export const ROUTES: Route[] = [
  { pattern: '/', screen: redirectOnly },
  { pattern: '/setup', screen: redirectOnly },
  { pattern: '/setup/hello', screen: helloScreen },
  { pattern: '/setup/names', screen: namesScreen },
  { pattern: '/setup/handover', screen: handoverScreen },
  { pattern: '/setup/climber', screen: climberScreen },
  { pattern: '/setup/goat', screen: goatScreen },
  { pattern: '/setup/mountain', screen: mountainScreen },
  { pattern: '/setup/lesson', screen: lessonScreen, className: 'screen--fixed' },
  { pattern: '/setup/brave', screen: braveScreen },
  { pattern: '/setup/cheer', screen: cheerScreen },
  { pattern: '/camp', screen: campScreen },
  { pattern: '/climb/:id', screen: climbScreen, className: 'screen--climb' },
  { pattern: '/map', screen: mapScreen },
  { pattern: '/log', screen: logScreen },
  { pattern: '/log/did/:id', screen: logDidScreen },
  { pattern: '/plans', screen: plansScreen },
  { pattern: '/cairn', screen: cairnScreen },
  { pattern: '/weather', screen: weatherScreen },
  { pattern: '/flops', screen: flopsScreen },
  { pattern: '/letters', screen: lettersScreen },
  { pattern: '/wardrobe', screen: wardrobeScreen },
  { pattern: '/badges', screen: badgesScreen },
  { pattern: '/finale', screen: finaleScreen, className: 'screen--fixed' },
  { pattern: '/parent', screen: gateScreen },
  { pattern: '/parent/:page', screen: parentScreen },
]

/** Where unknown paths go (the guard then picks camp or the first-run step). */
export const NOT_FOUND = '/'

function isSetupPath(path: string): boolean {
  return path === '/setup' || path.startsWith('/setup/')
}

/** Redirect for a first-run path while the first run isn't finished (null = allowed). */
function setupRedirect(path: string, d: SaveData): string | null {
  const resume = setupPath(d)
  if (!isSetupPath(path) || path === '/setup') return resume
  const step = path.slice('/setup/'.length)
  if (!d.setup.parentDone) {
    if (step === 'hello') return null
    if (step === 'names') return hasPin(d.parent) ? null : '/setup/hello'
    return resume
  }
  const i = KID_STEPS.indexOf(step as KidStep)
  if (i < 0) return resume
  const reached = KID_STEPS.indexOf(setupStep(d) as KidStep)
  // The designer is always open once the grown-ups are done: the hand-over screen leads there.
  return i <= Math.max(reached, KID_STEPS.indexOf('climber')) ? null : resume
}

export const guard: Guard = (m: RouteMatch) => {
  const d = save()
  const path = m.path
  if (!path.startsWith('/parent')) lockParent()
  if (!d.setup.complete) return setupRedirect(path, d)
  const finaleOwed = d.summit.reached && !d.summit.finaleSeen && !d.testMode
  // A reload (or Safari restoring the tab) during the summit pitch's Beta Map lands on its climb
  // route: she goes on to Sky Lake, not back to the bottom of the pitch she just sent.
  if (finaleOwed && (path === '/' || path === '/camp' || path === '/map' || path.startsWith('/climb/'))) return '/finale'
  if (path === '/' || isSetupPath(path)) return '/camp'
  if (path.startsWith('/parent/') && !isParentUnlocked()) return '/parent'
  return null
}
