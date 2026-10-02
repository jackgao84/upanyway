/**
 * Hash router: `#/camp`, `#/climb/p03?night=1`. Hash routing works on GitHub Pages without
 * 404 tricks and inside the service-worker app shell.
 */
import { clear } from '../ui/dom'

export type Unmount = () => void

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
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(s[i])
    else if (p[i] !== s[i]) return null
  }
  return params
}

export class Router {
  private current: { unmount?: Unmount; el: HTMLElement } | null = null
  private depth = 0
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
    window.addEventListener('hashchange', () => this.render())
    this.render()
  }

  navigate(path: string, opts: { replace?: boolean } = {}): void {
    const target = '#' + (path.startsWith('/') ? path : '/' + path)
    if (location.hash === target) {
      this.render()
      return
    }
    if (opts.replace) {
      history.replaceState(history.state, '', target)
      this.render()
    } else {
      this.depth++
      location.hash = target
    }
  }

  back(fallback = '/camp'): void {
    if (this.depth > 0) {
      this.depth--
      history.back()
    } else {
      this.navigate(fallback, { replace: true })
    }
  }

  currentPath(): string {
    return parseHash(location.hash).path
  }

  private render(): void {
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
    this.current = { el, unmount }
    el.scrollTop = 0
  }
}
