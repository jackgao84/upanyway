/**
 * Hash router: `#/camp`, `#/climb/p03?night=1`. Hash routing works on GitHub Pages without
 * 404 tricks and inside the service-worker app shell.
 */
import { clear } from '../ui/dom'

export type Unmount = () => void

/**
 * Fired on window for every route change (push, replace, back/forward, guard redirects), just
 * before the old screen unmounts. Overlays and the glossary listen to it: a replace navigation
 * fires no 'hashchange'.
 */
export const ROUTE_CHANGE_EVENT = 'upanyway:route'

export interface RouteMatch {
  path: string
  params: Record<string, string>
  query: URLSearchParams
}

export interface ScreenContext extends RouteMatch {
  /** Navigate to an app path like '/camp' (no leading '#'). */
  navigate: (path: string, opts?: { replace?: boolean }) => void
  /** Go back if there is in-app history, otherwise to `fallback`. */
  back: (fallback?: string) => void
}

export type Screen = (root: HTMLElement, ctx: ScreenContext) => Unmount | void

export interface Route {
  pattern: string
  screen: Screen
  /** Optional CSS class added to the screen root (e.g. 'screen--climb'). */
  className?: string
}

/** A guard may redirect (return a path) or allow (return null). */
export type Guard = (match: RouteMatch) => string | null

export function parseHash(hash: string): { path: string; query: URLSearchParams } {
  const raw = hash.replace(/^#/, '') || '/'
  const [pathPart, queryPart = ''] = raw.split('?')
  const path = '/' + pathPart.replace(/^\/+/, '').replace(/\/+$/, '')
  return { path, query: new URLSearchParams(queryPart) }
}

export function matchPattern(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split('/').filter(Boolean)
  const s = path.split('/').filter(Boolean)
  if (p.length !== s.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) {
      let v: string
      try {
        v = decodeURIComponent(s[i])
      } catch {
        return null // a malformed escape like '%E0' matches nothing (→ not found)
      }
      params[p[i].slice(1)] = v
    } else if (p[i] !== s[i]) return null
  }
  return params
}

/** In-app history depth, kept in history.state so it survives reloads and follows back/forward. */
interface HistoryState {
  upDepth?: number
}

function depthNow(): number {
  const d = (history.state as HistoryState | null)?.upDepth
  return typeof d === 'number' && d > 0 ? d : 0
}

export class Router {
  private current: { unmount?: Unmount; el: HTMLElement } | null = null
  /** The hash the current screen was rendered for (back/forward to the same hash is a no-op). */
  private renderedHash: string | null = null
  /** Bumped by every render, so a render that a screen's own mount navigated away from can tell. */
  private renderId = 0
  private started = false

  constructor(
    private readonly root: HTMLElement,
    private readonly routes: Route[],
    private readonly notFound: string,
    private readonly guard?: Guard,
  ) {}

  start(): void {
    if (this.started) return
    this.started = true
    // Back/forward and typed URLs. Both events can fire for one traversal: render once per hash.
    const onLocation = () => {
      if (location.hash !== this.renderedHash) this.render()
    }
    window.addEventListener('hashchange', onLocation)
    window.addEventListener('popstate', onLocation)
    this.render()
  }

  navigate(path: string, opts: { replace?: boolean } = {}): void {
    const target = '#' + (path.startsWith('/') ? path : '/' + path)
    if (location.hash !== target) {
      const cur = depthNow()
      try {
        if (opts.replace) history.replaceState({ upDepth: cur }, '', target)
        else history.pushState({ upDepth: cur + 1 }, '', target)
      } catch {
        // Safari throttles history calls (100 per 30 s); a plain hash change still navigates.
        if (opts.replace) location.replace(target)
        else location.hash = target
      }
    }
    this.render()
  }

  back(fallback = '/camp'): void {
    if (depthNow() > 0) history.back()
    else this.navigate(fallback, { replace: true })
  }

  currentPath(): string {
    return parseHash(location.hash).path
  }

  private render(): void {
    const id = ++this.renderId
    this.renderedHash = location.hash
    const { path, query } = parseHash(location.hash)
    let found: { route: Route; params: Record<string, string> } | null = null
    for (const route of this.routes) {
      const params = matchPattern(route.pattern, path)
      if (params) {
        found = { route, params }
        break
      }
    }
    if (!found) {
      this.navigate(this.notFound, { replace: true })
      return
    }
    const match: RouteMatch = { path, params: found.params, query }
    const redirect = this.guard?.(match)
    if (redirect && redirect !== path) {
      this.navigate(redirect, { replace: true })
      return
    }

    window.dispatchEvent(new Event(ROUTE_CHANGE_EVENT))
    if (this.current) {
      try {
        this.current.unmount?.()
      } catch (err) {
        console.warn('[upanyway] unmount failed', err)
      }
      this.current.el.remove()
      this.current = null
    }

    clear(this.root)
    const el = document.createElement('main')
    el.className = 'screen' + (found.route.className ? ' ' + found.route.className : '')
    el.dataset.route = found.route.pattern
    this.root.appendChild(el)
    const ctx: ScreenContext = {
      ...match,
      navigate: (p, o) => this.navigate(p, o),
      back: (f) => this.back(f),
    }
    const unmount = found.route.screen(el, ctx) ?? undefined
    if (id !== this.renderId) {
      // The screen navigated while mounting: the newer render owns the page now.
      try {
        unmount?.()
      } catch (err) {
        console.warn('[upanyway] unmount failed', err)
      }
      el.remove()
      return
    }
    this.current = { el, unmount }
    el.scrollTop = 0
  }
}
