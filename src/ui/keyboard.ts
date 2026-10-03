/**
 * Keeps text inputs visible above the on-screen keyboard (iPad first) and stops pinch zoom.
 *
 * - `--kb-inset` on :root = how much of the layout viewport the keyboard covers (from visualViewport).
 *   `.screen` uses it as its bottom, so each screen's own scroll container shrinks above the keyboard.
 * - `--vh` = 1% of innerHeight (fallback for browsers without dvh).
 * - Focusing an input scrolls it into view inside its scroll container; blurring scrolls the window back.
 */

const EDITABLE = 'input, textarea, [contenteditable="true"]'

function isEditable(el: EventTarget | null): el is HTMLElement {
  return el instanceof HTMLElement && el.matches(EDITABLE)
}

function scrollParent(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement
  while (node && node !== document.body) {
    const oy = getComputedStyle(node).overflowY
    if ((oy === 'auto' || oy === 'scroll') && node.scrollHeight > node.clientHeight) return node
    node = node.parentElement
  }
  return null
}

/** Scroll `el` into the visible part of its scroll container (above the keyboard, below the header). */
export function keepInView(el: HTMLElement): void {
  const container = scrollParent(el)
  if (!container) return
  const vv = window.visualViewport
  const viewTop = vv ? vv.offsetTop : 0
  const viewBottom = vv ? vv.offsetTop + vv.height : window.innerHeight
  const box = container.getBoundingClientRect()
  const top = Math.max(box.top, viewTop)
  const bottom = Math.min(box.bottom, viewBottom)
  const header = container.querySelector<HTMLElement>('.layout__header')
  const headerH = header ? header.getBoundingClientRect().height : 0
  const footer = container.querySelector<HTMLElement>('.layout__footer')
  const footerH = footer ? Math.min(footer.getBoundingClientRect().height, (bottom - top) / 3) : 0
  const visTop = top + headerH + 12
  const visBottom = bottom - footerH - 12
  const r = el.getBoundingClientRect()
  if (r.top >= visTop && r.bottom <= visBottom) return
  // Bring the whole field (label + input) to the top of the visible area when it fits.
  const field = el.closest('.field')
  const want = field ? field.getBoundingClientRect() : r
  const anchor = want.height <= visBottom - visTop ? want.top : r.top
  const delta = anchor - visTop
  if (Math.abs(delta) < 2) return
  container.scrollTo({ top: container.scrollTop + delta, behavior: reduceMotion() ? 'auto' : 'smooth' })
}

function reduceMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

let active = false

/** Install the listeners (once). Returns a cleanup that removes them. */
export function initKeyboardAvoidance(): () => void {
  if (active || typeof window === 'undefined') return () => {}
  active = true
  const root = document.documentElement
  const offs: (() => void)[] = []
  const on = (target: EventTarget, type: string, fn: (e: Event) => void, opts?: AddEventListenerOptions) => {
    target.addEventListener(type, fn, opts)
    offs.push(() => target.removeEventListener(type, fn, opts))
  }
  const timers = new Set<ReturnType<typeof setTimeout>>()
  const later = (fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      timers.delete(t)
      fn()
    }, ms)
    timers.add(t)
  }

  const setVh = () => root.style.setProperty('--vh', `${window.innerHeight * 0.01}px`)
  let lastInset = -1
  const setInset = () => {
    const vv = window.visualViewport
    if (!vv) return
    const covered = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))
    // Small differences are browser chrome, not a keyboard.
    const inset = covered > 80 ? covered : 0
    if (inset === lastInset) return
    lastInset = inset
    root.style.setProperty('--kb-inset', `${inset}px`)
    root.classList.toggle('kb-open', inset > 0)
    const focused = document.activeElement
    if (inset > 0 && isEditable(focused)) later(() => keepInView(focused), 60)
  }
  const onResize = () => {
    setVh()
    setInset()
  }

  setVh()
  setInset()
  on(window, 'resize', onResize)
  on(window, 'orientationchange', () => {
    onResize()
    // iOS reports the old size right at orientationchange.
    later(onResize, 350)
  })
  if (window.visualViewport) {
    on(window.visualViewport, 'resize', setInset)
    on(window.visualViewport, 'scroll', setInset)
  }

  on(document, 'focusin', (e) => {
    const target = e.target
    if (!isEditable(target)) return
    later(() => keepInView(target), 60)
    // Again once the keyboard has finished sliding up.
    later(() => {
      if (document.activeElement === target) keepInView(target)
    }, 380)
  })
  on(document, 'focusout', () => {
    later(() => {
      if (isEditable(document.activeElement)) return
      if (window.scrollX !== 0 || window.scrollY !== 0) window.scrollTo(0, 0)
      setInset()
    }, 80)
  })

  // No pinch zoom (Safari's gesture events; user-scalable=no is ignored by iOS).
  const stop = (e: Event) => e.preventDefault()
  on(document, 'gesturestart', stop, { passive: false })
  on(document, 'gesturechange', stop, { passive: false })
  on(document, 'gestureend', stop, { passive: false })

  return () => {
    for (const off of offs.splice(0)) off()
    for (const t of timers) clearTimeout(t)
    timers.clear()
    root.style.removeProperty('--kb-inset')
    root.classList.remove('kb-open')
    active = false
  }
}
