/**
 * Every storage key and cache name this app uses. The web origin is shared with another
 * family app, so EVERYTHING is prefixed "upanyway:" — never use a bare key anywhere else.
 */
export const PREFIX = 'upanyway:'

export const KEYS = {
  /** The whole save document (JSON, versioned). */
  save: `${PREFIX}save`,
  /** Last known-good copy, written before migrations, imports and resets. */
  backup: `${PREFIX}save:backup`,
} as const

/** Service worker caches are named `${CACHE_PREFIX}<build hash>` (see src/sw/sw-template.js). */
export const CACHE_PREFIX = `${PREFIX}precache:`

/** Message posted to a waiting service worker to activate an update. */
export const SW_SKIP_WAITING = `${PREFIX}skip-waiting`
