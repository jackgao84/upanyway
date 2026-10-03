/**
 * Log a brave thing (#/log) and finish a plan (#/log/did/:id). The flow itself lives in
 * screens/log/flow.ts; the words in screens/log/copy.ts.
 */
import './log/log.css'
import type { Screen } from '../app/router'
import { runLogFlow } from './log/flow'

/** #/log: a new brave thing, from "What's the brave thing?" on. */
export const logScreen: Screen = (root, ctx) => runLogFlow(root, ctx, { kind: 'new' })

/** #/log/did/:id: "I did it!" on a plan → how scary it really was, what happened, how it went, what I learned. */
export const logDidScreen: Screen = (root, ctx) => runLogFlow(root, ctx, { kind: 'plan', id: ctx.params.id ?? '' })
