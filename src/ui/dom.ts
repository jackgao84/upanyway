/** Tiny DOM helpers. No framework: screens build elements with h() and clean up after themselves. */

export type Child = Node | string | number | null | undefined | false | Child[]

type Handler = (event: Event) => void
export type Attrs = {
  class?: string
  style?: string | Partial<Record<keyof CSSStyleDeclaration, string>>
  dataset?: Record<string, string>
  [key: string]: unknown
}

/**
 * Create an element. `onClick: fn` style keys become event listeners; `class`, `style`,
 * `dataset` are handled specially; booleans set/remove attributes; everything else is an attribute
 * (or a property for value/checked/disabled/textContent/innerHTML-free keys).
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Attrs | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  if (attrs) applyAttrs(el, attrs)
  append(el, ...children)
  return el
}

export function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string | number> | null,
  ...children: (SVGElement | null | undefined | false)[]
): SVGElementTagNameMap[K] {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag)
  if (attrs) for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v))
  for (const c of children) if (c) el.appendChild(c)
  return el
}

const PROPS = new Set(['value', 'checked', 'disabled', 'selected', 'textContent', 'tabIndex', 'type', 'name'])

function applyAttrs(el: HTMLElement, attrs: Attrs): void {
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null) continue
    if (key === 'class') {
      el.className = String(value)
    } else if (key === 'style') {
      if (typeof value === 'string') el.setAttribute('style', value)
      else Object.assign(el.style, value)
    } else if (key === 'dataset') {
      Object.assign(el.dataset, value as Record<string, string>)
    } else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value as Handler)
    } else if (PROPS.has(key)) {
      ;(el as unknown as Record<string, unknown>)[key] = value
    } else if (typeof value === 'boolean') {
      if (value) el.setAttribute(key, '')
      else el.removeAttribute(key)
    } else {
      el.setAttribute(key, String(value))
    }
  }
}

export function append(parent: Node, ...children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue
    if (Array.isArray(child)) append(parent, ...child)
    else if (child instanceof Node) parent.appendChild(child)
    else parent.appendChild(document.createTextNode(String(child)))
  }
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild)
}

/** Add a listener and get back a function that removes it. */
export function listen<K extends keyof WindowEventMap>(
  target: Window,
  type: K,
  fn: (e: WindowEventMap[K]) => void,
  opts?: AddEventListenerOptions,
): () => void
export function listen<K extends keyof DocumentEventMap>(
  target: Document,
  type: K,
  fn: (e: DocumentEventMap[K]) => void,
  opts?: AddEventListenerOptions,
): () => void
export function listen<K extends keyof HTMLElementEventMap>(
  target: HTMLElement,
  type: K,
  fn: (e: HTMLElementEventMap[K]) => void,
  opts?: AddEventListenerOptions,
): () => void
export function listen(
  target: EventTarget,
  type: string,
  fn: (e: Event) => void,
  opts?: AddEventListenerOptions,
): () => void {
  target.addEventListener(type, fn, opts)
  return () => target.removeEventListener(type, fn, opts)
}

/** Collects cleanup callbacks; call dispose() once on unmount. */
export class Disposer {
  private fns: (() => void)[] = []
  add(fn: (() => void) | void | undefined): void {
    if (fn) this.fns.push(fn)
  }
  dispose(): void {
    const fns = this.fns.splice(0).reverse()
    for (const fn of fns) {
      try {
        fn()
      } catch (err) {
        console.warn('[upanyway] cleanup failed', err)
      }
    }
  }
}

export function qs<T extends Element = HTMLElement>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector)
  if (!el) throw new Error(`Missing element: ${selector}`)
  return el
}

export function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export const prefersReducedMotion = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
