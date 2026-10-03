/**
 * The UI kit: buttons, cards, the screen layout, text fields, chips, toasts, modals, sheets,
 * steppers, segmented controls, switches, confirm and progress dots. Plain DOM, no framework.
 * Every target is ≥ 48 px and nothing depends on hover. Importing this module brings in the styles.
 */
import './styles/tokens.css'
import './styles/base.css'
import './styles/components.css'
import './styles/screens.css'
import { ROUTE_CHANGE_EVENT } from '../app/router'
import { audio } from '../audio/audio'
import { append, h, type Child } from './dom'
import { icon, type IconName } from './icons'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type Tone =
  | 'paper'
  | 'sun'
  | 'sky'
  | 'leaf'
  | 'coral'
  | 'plum'
  | 'meadow'
  | 'hollow'
  | 'crumble'
  | 'ridge'
  | 'cloud'
  | 'summit'

// ---------------------------------------------------------------------------------------------
// Shared behaviour

/** Adds an .is-pressed class while a finger/pointer is down (reliable :active on iOS). */
export function pressable(el: HTMLElement): void {
  const down = () => el.classList.add('is-pressed')
  const up = () => el.classList.remove('is-pressed')
  el.addEventListener('pointerdown', down)
  el.addEventListener('pointerup', up)
  el.addEventListener('pointercancel', up)
  el.addEventListener('pointerleave', up)
}

/** Click handler that ignores an accidental second tap within `ms` (no double "Next"). */
function onTap(el: HTMLElement, fn: (e: MouseEvent) => void, opts: { guardMs?: number; silent?: boolean } = {}): void {
  const guard = opts.guardMs ?? 380
  let last = -Infinity
  el.addEventListener('click', (e) => {
    if (el.getAttribute('aria-disabled') === 'true') return
    const now = performance.now()
    if (now - last < guard) return
    last = now
    if (!opts.silent) audio.tap()
    fn(e)
  })
}

function toChildren(body: Child): Child[] {
  return Array.isArray(body) ? body : [body]
}

// ---------------------------------------------------------------------------------------------
// Buttons

export interface ButtonOpts {
  onClick: (e: MouseEvent) => void
  variant?: ButtonVariant
  icon?: IconName
  /** Icon after the label instead of before it (e.g. 'next'). */
  iconEnd?: IconName
  size?: 'big' | 'normal'
  /** Required when the label is empty (icon-only button). */
  ariaLabel?: string
  disabled?: boolean
  /** Stretch to the container width. */
  block?: boolean
  class?: string
  /** No tap click sound (for controls that play their own sound). */
  silent?: boolean
}

/** A big friendly button. Empty label + icon = a round icon button. */
export function button(label: string, opts: ButtonOpts): HTMLButtonElement {
  const variant = opts.variant ?? 'primary'
  const iconOnly = !label && !!opts.icon
  const cls = ['btn', `btn--${variant}`]
  if (opts.size === 'big') cls.push('btn--big')
  if (iconOnly) cls.push('btn--icon')
  if (opts.block) cls.push('btn--block')
  if (opts.class) cls.push(opts.class)
  const iconSize = iconOnly ? (opts.size === 'big' ? 34 : 28) : opts.size === 'big' ? 30 : 26
  const el = h(
    'button',
    { type: 'button', class: cls.join(' '), 'aria-label': opts.ariaLabel ?? (iconOnly ? opts.icon : undefined) },
    opts.icon ? h('span', { class: 'btn__icon' }, icon(opts.icon, iconSize)) : null,
    label ? h('span', { class: 'btn__label' }, label) : null,
    opts.iconEnd ? h('span', { class: 'btn__icon btn__icon--end' }, icon(opts.iconEnd, iconSize)) : null,
  )
  if (opts.disabled) setDisabled(el, true)
  pressable(el)
  onTap(el, opts.onClick, { silent: opts.silent })
  return el
}

/** Shorthand for a round icon-only button. */
export function iconButton(
  name: IconName,
  ariaLabel: string,
  onClick: (e: MouseEvent) => void,
  opts: Omit<ButtonOpts, 'onClick' | 'icon' | 'ariaLabel'> = {},
): HTMLButtonElement {
  return button('', { variant: 'secondary', ...opts, icon: name, ariaLabel, onClick })
}

/** Disable/enable a control made by this kit (keeps it focusable and announced as disabled). */
export function setDisabled(el: HTMLElement, disabled: boolean): void {
  if (disabled) el.setAttribute('aria-disabled', 'true')
  else el.removeAttribute('aria-disabled')
  el.classList.toggle('is-disabled', disabled)
}

// ---------------------------------------------------------------------------------------------
// Cards

export interface CardOpts {
  title?: string
  text?: string
  /** Extra content under the text. Keep it non-interactive when the card itself is tappable. */
  body?: Child
  /** An icon name, or any element (a small canvas, a weather icon…). */
  icon?: IconName | Element
  tone?: Tone
  onClick?: () => void
  ariaLabel?: string
  selected?: boolean
  class?: string
}

/** A paper card. With onClick it is a big tappable <button>. */
export function card(opts: CardOpts): HTMLElement {
  const cls = ['card']
  if (opts.onClick) cls.push('card--tap')
  if (opts.selected) cls.push('is-selected')
  if (opts.class) cls.push(opts.class)
  const media =
    opts.icon === undefined
      ? null
      : h('span', { class: 'card__icon' }, typeof opts.icon === 'string' ? icon(opts.icon, 34) : opts.icon)
  const content: Child[] = [
    media,
    h(
      'span',
      { class: 'card__content' },
      opts.title ? h('span', { class: 'card__title' }, opts.title) : null,
      opts.text ? h('span', { class: 'card__text' }, opts.text) : null,
      opts.body !== undefined ? h('span', { class: 'card__body' }, ...toChildren(opts.body)) : null,
    ),
  ]
  const attrs = { class: cls.join(' '), dataset: opts.tone ? { tone: opts.tone } : undefined }
  if (!opts.onClick) return h('div', attrs, ...content)
  const onClick = opts.onClick
  const el = h(
    'button',
    { ...attrs, type: 'button', 'aria-label': opts.ariaLabel, 'aria-pressed': opts.selected === undefined ? undefined : String(opts.selected) },
    ...content,
  )
  pressable(el)
  onTap(el, () => onClick())
  return el
}

export interface TileOpts {
  label: string
  icon: IconName | Element
  onClick: () => void
  tone?: Tone
  /** A small count bubble (e.g. unopened letters). Hidden when 0 or undefined. */
  count?: number
  ariaLabel?: string
  /** Spans two columns with the icon beside the label (e.g. the big Climb tile). */
  wide?: boolean
  class?: string
}

/** A big square hub button: icon over label (camp screen). Use inside `.tiles`. */
export function tile(opts: TileOpts): HTMLButtonElement {
  const art = typeof opts.icon === 'string' ? icon(opts.icon, opts.wide ? 48 : 44) : opts.icon
  const el = h(
    'button',
    {
      type: 'button',
      class: 'tile' + (opts.wide ? ' tile--wide' : '') + (opts.class ? ' ' + opts.class : ''),
      dataset: opts.tone ? { tone: opts.tone } : undefined,
      'aria-label': opts.ariaLabel,
    },
    h('span', { class: 'tile__art' }, art),
    h('span', { class: 'tile__label' }, opts.label),
    opts.count ? h('span', { class: 'tile__count', 'aria-hidden': 'true' }, String(opts.count)) : null,
  )
  pressable(el)
  onTap(el, () => opts.onClick())
  return el
}

// ---------------------------------------------------------------------------------------------
// Screen layout

export interface LayoutOpts {
  title?: string
  /** Shows a round back button top-left. */
  back?: () => void
  backLabel?: string
  body: Child[]
  /** Pinned to the bottom (above the keyboard and the home indicator): the main actions. */
  footer?: Child[]
  /** Shown under the title (e.g. progressDots). */
  top?: Child
  tone?: Tone
  /** Paper hills along the bottom (default true). */
  scenery?: boolean
  /** Narrower reading column (one-question screens). */
  narrow?: boolean
  class?: string
}

/** A full-screen layout for the router's scrollable `.screen`: safe areas, header, body, footer. */
export function screenLayout(opts: LayoutOpts): HTMLElement {
  const cls = ['layout']
  if (opts.narrow) cls.push('layout--narrow')
  if (opts.class) cls.push(opts.class)
  const hasHeader = !!(opts.title || opts.back || opts.top)
  const header = hasHeader
    ? h(
        'header',
        { class: 'layout__header' },
        h(
          'div',
          { class: 'layout__bar' },
          h(
            'div',
            { class: 'layout__side' },
            opts.back ? iconButton('back', opts.backLabel ?? 'Back', () => opts.back?.(), { class: 'layout__back' }) : null,
          ),
          opts.title ? h('h1', { class: 'layout__title' }, opts.title) : h('div', { class: 'layout__title' }),
          h('div', { class: 'layout__side layout__side--end' }),
        ),
        opts.top ? h('div', { class: 'layout__top' }, ...toChildren(opts.top)) : null,
      )
    : h('div', { class: 'layout__spacer' })
  return h(
    'div',
    { class: cls.join(' '), dataset: opts.tone ? { tone: opts.tone } : undefined },
    opts.scenery === false ? null : scenery(),
    header,
    h('div', { class: 'layout__body' }, ...opts.body),
    opts.footer && opts.footer.length ? h('footer', { class: 'layout__footer' }, h('div', { class: 'layout__footer-inner' }, ...opts.footer)) : null,
  )
}

/** Soft paper-cut hills behind the content (pure CSS shapes, no images). */
export function scenery(): HTMLElement {
  return h(
    'div',
    { class: 'scenery', 'aria-hidden': 'true' },
    h('span', { class: 'scenery__hill scenery__hill--far' }),
    h('span', { class: 'scenery__hill scenery__hill--mid' }),
    h('span', { class: 'scenery__hill scenery__hill--near' }),
  )
}

// ---------------------------------------------------------------------------------------------
// Text field

export interface TextFieldOpts {
  label: string
  value: string
  placeholder?: string
  maxLength?: number
  onInput: (value: string) => void
  /** Enter on a single-line field (or the keyboard's Go/Next key). */
  onEnter?: (value: string) => void
  multiline?: boolean
  /** Small helper line under the field. */
  hint?: string
  /** Keep the label for screen readers only (when the screen's question already says it). */
  hideLabel?: boolean
  autocapitalize?: 'sentences' | 'words' | 'none'
  enterKeyHint?: 'done' | 'next' | 'go' | 'send'
  inputMode?: 'text' | 'numeric'
  name?: string
}

export type TextField = HTMLLabelElement & {
  input: HTMLInputElement | HTMLTextAreaElement
  setValue(value: string): void
}

/** A labelled text input (font-size ≥ 16 px: no iOS focus zoom). ui/keyboard.ts keeps it above the keyboard. */
export function textField(opts: TextFieldOpts): TextField {
  const common = {
    class: 'field__input',
    placeholder: opts.placeholder,
    maxlength: opts.maxLength,
    autocomplete: 'off',
    autocorrect: 'on',
    spellcheck: 'true',
    autocapitalize: opts.autocapitalize ?? 'sentences',
    enterkeyhint: opts.enterKeyHint ?? (opts.onEnter ? 'next' : 'done'),
    inputmode: opts.inputMode,
    name: opts.name,
  }
  const input: HTMLInputElement | HTMLTextAreaElement = opts.multiline
    ? h('textarea', { ...common, rows: 3 })
    : h('input', { ...common, type: 'text' })
  input.value = opts.value
  const count = h('span', { class: 'field__count', 'aria-live': 'polite' })
  const updateCount = () => {
    if (!opts.maxLength) return
    const left = opts.maxLength - input.value.length
    count.textContent = left <= 20 ? `${left} left` : ''
  }
  input.addEventListener('input', () => {
    updateCount()
    opts.onInput(input.value)
  })
  input.addEventListener('keydown', (e) => {
    const ke = e as KeyboardEvent
    if (ke.key !== 'Enter' || ke.isComposing || ke.keyCode === 229) return
    if (opts.multiline && !opts.onEnter) return
    if (opts.multiline && ke.shiftKey) return
    e.preventDefault()
    // Without onEnter, the keyboard's Done key just puts the keyboard away.
    if (opts.onEnter) opts.onEnter(input.value)
    else input.blur()
  })
  updateCount()
  const el = h(
    'label',
    { class: 'field' + (opts.multiline ? ' field--multi' : '') },
    h('span', { class: 'field__label' + (opts.hideLabel ? ' sr-only' : '') }, opts.label),
    input,
    opts.hint || opts.maxLength ? h('span', { class: 'field__meta' }, h('span', { class: 'field__hint' }, opts.hint ?? ''), count) : null,
  ) as TextField
  el.input = input
  el.setValue = (value: string) => {
    input.value = value
    updateCount()
  }
  return el
}

// ---------------------------------------------------------------------------------------------
// Chips

/** A pill chip. Pass `selected` (true/false) to make it a toggle (aria-pressed). */
export function chip(label: string, onClick: () => void, selected?: boolean): HTMLButtonElement {
  const el = h(
    'button',
    { type: 'button', class: 'chip' + (selected ? ' is-selected' : ''), 'aria-pressed': selected === undefined ? undefined : String(selected) },
    label,
  )
  pressable(el)
  onTap(el, () => onClick(), { guardMs: 250 })
  return el
}

export interface ChipsOpts {
  /** Selected item(s). Passing this (or `multi`) makes the chips selectable. */
  selected?: string | string[] | null
  /** Tapping toggles each chip independently. */
  multi?: boolean
  ariaLabel?: string
}

export type Chips = HTMLDivElement & { setSelected(items: string[]): void }

/**
 * A wrapping group of chips. Without `selected`/`multi` the chips are quick picks (each tap calls
 * onPick, e.g. to fill a text field). Selectable chips call onPick(item, index, isNowSelected).
 */
export function chips(items: string[], onPick: (item: string, index: number, selected: boolean) => void, opts: ChipsOpts = {}): Chips {
  const selectable = opts.multi || opts.selected !== undefined
  let selected = new Set<string>(
    opts.selected == null ? [] : Array.isArray(opts.selected) ? opts.selected : [opts.selected],
  )
  const group = h('div', { class: 'chips', role: 'group', 'aria-label': opts.ariaLabel }) as Chips
  const buttons: HTMLButtonElement[] = []
  const paint = () =>
    buttons.forEach((b, i) => {
      const on = selected.has(items[i])
      b.classList.toggle('is-selected', on)
      if (selectable) b.setAttribute('aria-pressed', String(on))
    })
  items.forEach((item, i) => {
    const b = chip(
      item,
      () => {
        let now = true
        if (selectable) {
          if (opts.multi) {
            now = !selected.has(item)
            if (now) selected.add(item)
            else selected.delete(item)
          } else {
            now = !selected.has(item)
            selected = new Set(now ? [item] : [])
          }
          paint()
        } else {
          b.classList.remove('chip--flash')
          void b.offsetWidth
          b.classList.add('chip--flash')
        }
        onPick(item, i, now)
      },
      selectable ? selected.has(item) : undefined,
    )
    buttons.push(b)
    group.appendChild(b)
  })
  group.setSelected = (next: string[]) => {
    selected = new Set(next)
    paint()
  }
  return group
}

// ---------------------------------------------------------------------------------------------
// Toasts

export interface ToastOpts {
  /** Default: long enough to read (≈ 3–7 s). 0 = stays until tapped or closed. */
  durationMs?: number
  icon?: IconName
  title?: string
  /** A small picture (e.g. a fall-pose canvas) shown at the left. */
  media?: Node
  tone?: Tone
}

export interface ToastHandle {
  el: HTMLElement
  close(): void
}

let toastHost: HTMLElement | null = null
const MAX_TOASTS = 3
const liveToasts: (() => void)[] = []

function getToastHost(): HTMLElement {
  if (toastHost && toastHost.isConnected) return toastHost
  toastHost = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' })
  document.body.appendChild(toastHost)
  return toastHost
}

/** A non-blocking note that stacks top-centre below the HUD and hides itself. Tap to dismiss. */
export function toast(message: string | Node, opts: ToastOpts = {}): ToastHandle {
  const host = getToastHost()
  const text = typeof message === 'string' ? message : message.textContent ?? ''
  const media = opts.media ?? (opts.icon ? icon(opts.icon, 30) : null)
  const el = h(
    'div',
    { class: 'toast', dataset: opts.tone ? { tone: opts.tone } : undefined },
    media ? h('span', { class: 'toast__media' }, media) : null,
    h(
      'span',
      { class: 'toast__content' },
      opts.title ? h('span', { class: 'toast__title' }, opts.title) : null,
      h('span', { class: 'toast__text' }, message),
    ),
  )
  let closed = false
  let timer: ReturnType<typeof setTimeout> | null = null
  const close = () => {
    if (closed) return
    closed = true
    if (timer) clearTimeout(timer)
    const i = liveToasts.indexOf(close)
    if (i >= 0) liveToasts.splice(i, 1)
    el.classList.remove('is-in')
    el.classList.add('is-out')
    setTimeout(() => el.remove(), 260)
  }
  el.addEventListener('click', close)
  host.appendChild(el)
  liveToasts.push(close)
  while (liveToasts.length > MAX_TOASTS) liveToasts[0]()
  requestAnimationFrame(() => el.classList.add('is-in'))
  const words = (opts.title ?? '').length + text.length
  const duration = opts.durationMs ?? Math.min(7000, Math.max(3000, 1800 + words * 55))
  if (duration > 0) timer = setTimeout(close, duration)
  return { el, close }
}

// ---------------------------------------------------------------------------------------------
// Overlays: modal (blocking) and sheet (bottom)

export interface ModalAction {
  label: string
  variant?: ButtonVariant
  icon?: IconName
  ariaLabel?: string
  /** Return false to keep the overlay open. */
  onClick?: () => void | boolean
}

export interface OverlayOpts {
  title?: string
  body: Child
  actions?: (ModalAction | HTMLElement)[]
  /** Backdrop tap / Escape closes it (modal default false, sheet default true). */
  dismissible?: boolean
  /** Called once, however it closes. */
  onClose?: () => void
  /** Picture above the title (an icon name or any element). */
  art?: IconName | Element
  tone?: Tone
  /** Close automatically when the route changes (default true). */
  closeOnRoute?: boolean
  class?: string
}

export interface OverlayHandle {
  el: HTMLElement
  close(): void
}

const openOverlays: { close(): void; panel: HTMLElement }[] = []

function focusables(root: HTMLElement): HTMLElement[] {
  return [
    ...root.querySelectorAll<HTMLElement>(
      'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])',
    ),
  ].filter((el) => !el.hasAttribute('disabled') && el.getClientRects().length > 0)
}

function overlay(kind: 'modal' | 'sheet', opts: OverlayOpts): OverlayHandle {
  const dismissible = opts.dismissible ?? kind === 'sheet'
  const titleId = `ov-${Math.random().toString(36).slice(2, 9)}`
  let closed = false
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null

  const actions = (opts.actions ?? []).map((a) => {
    if (a instanceof HTMLElement) return a
    return button(a.label, {
      variant: a.variant ?? 'primary',
      icon: a.icon,
      ariaLabel: a.ariaLabel,
      size: 'big',
      onClick: () => {
        const keep = a.onClick?.() === false
        if (!keep) close()
      },
    })
  })

  const art =
    opts.art === undefined
      ? null
      : h('div', { class: `${kind}__art` }, typeof opts.art === 'string' ? icon(opts.art, 48) : opts.art)
  const panel = h(
    'div',
    {
      class: `${kind}${opts.class ? ' ' + opts.class : ''}`,
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': opts.title ? titleId : undefined,
      tabindex: '-1',
      dataset: opts.tone ? { tone: opts.tone } : undefined,
    },
    kind === 'sheet' ? h('div', { class: 'sheet__grabber', 'aria-hidden': 'true' }) : null,
    dismissible ? iconButton('close', 'Close', () => close(), { variant: 'ghost', class: `${kind}__close` }) : null,
    h(
      'div',
      { class: `${kind}__scroll` },
      art,
      opts.title ? h('h2', { class: `${kind}__title`, id: titleId }, opts.title) : null,
      h('div', { class: `${kind}__body` }, ...toChildren(opts.body)),
    ),
    actions.length ? h('div', { class: `${kind}__actions` + (actions.length > 2 ? ' is-stacked' : '') }, ...actions) : null,
  )
  const backdrop = h('div', { class: 'backdrop' })
  const root = h('div', { class: `overlay overlay--${kind}` }, backdrop, panel)

  const onKey = (e: KeyboardEvent) => {
    if (openOverlays[openOverlays.length - 1]?.panel !== panel) return
    if (e.key === 'Escape' && dismissible) {
      e.preventDefault()
      close()
    } else if (e.key === 'Tab') {
      const list = focusables(panel)
      if (!list.length) {
        e.preventDefault()
        panel.focus()
        return
      }
      const first = list[0]
      const last = list[list.length - 1]
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
  }
  const onRoute = () => close()

  function close(): void {
    if (closed) return
    closed = true
    document.removeEventListener('keydown', onKey)
    window.removeEventListener(ROUTE_CHANGE_EVENT, onRoute)
    const i = openOverlays.findIndex((o) => o.panel === panel)
    if (i >= 0) openOverlays.splice(i, 1)
    if (!openOverlays.length) document.getElementById('app')?.removeAttribute('aria-hidden')
    root.classList.remove('is-open')
    root.classList.add('is-closing')
    setTimeout(() => root.remove(), 260)
    if (previous && previous.isConnected) {
      try {
        previous.focus({ preventScroll: true })
      } catch {
        previous.focus()
      }
    }
    opts.onClose?.()
  }

  if (dismissible) backdrop.addEventListener('click', () => close())
  document.addEventListener('keydown', onKey)
  if (opts.closeOnRoute !== false) window.addEventListener(ROUTE_CHANGE_EVENT, onRoute)
  openOverlays.push({ close, panel })
  document.getElementById('app')?.setAttribute('aria-hidden', 'true')
  document.body.appendChild(root)
  requestAnimationFrame(() => {
    root.classList.add('is-open')
    try {
      panel.focus({ preventScroll: true })
    } catch {
      panel.focus()
    }
  })
  return { el: panel, close }
}

/** A blocking dialog card. Actions close it unless their onClick returns false. Call close() on unmount. */
export function modal(opts: OverlayOpts): OverlayHandle {
  return overlay('modal', opts)
}

/** A bottom sheet (dismissible by default: backdrop tap, close button, Escape). */
export function sheet(opts: OverlayOpts): OverlayHandle {
  return overlay('sheet', opts)
}

/** Close every open modal and sheet (e.g. before a hard navigation). */
export function closeAllOverlays(): void {
  for (const o of [...openOverlays].reverse()) o.close()
}

export interface ConfirmOpts {
  title: string
  body?: Child
  yes?: string
  no?: string
  /** The yes button is the red "danger" style (reset, delete). */
  danger?: boolean
  art?: IconName | Element
}

/** Ask a yes/no question. Resolves false if dismissed. */
export function confirm(opts: ConfirmOpts | string): Promise<boolean> {
  const o: ConfirmOpts = typeof opts === 'string' ? { title: opts } : opts
  return new Promise((resolve) => {
    let answer = false
    modal({
      title: o.title,
      body: o.body ?? [],
      art: o.art,
      dismissible: true,
      onClose: () => resolve(answer),
      actions: [
        { label: o.no ?? 'No, go back', variant: 'secondary' },
        {
          label: o.yes ?? 'Yes',
          variant: o.danger ? 'danger' : 'primary',
          onClick: () => {
            answer = true
          },
        },
      ],
      class: 'modal--confirm',
    })
  })
}

// ---------------------------------------------------------------------------------------------
// Stepper, segmented control, switch

export interface StepperOpts {
  value: number
  min: number
  max: number
  step: number
  format?: (value: number) => string
  onChange: (value: number) => void
  /** Accessible name (e.g. "Minutes of climbing a day"). */
  label: string
}

export type Stepper = HTMLDivElement & { setValue(value: number): void; getValue(): number }

/** − value + with big buttons. Press and hold repeats. */
export function stepper(opts: StepperOpts): Stepper {
  const format = opts.format ?? ((v: number) => String(v))
  let value = clampStep(opts.value)
  function clampStep(v: number): number {
    const snapped = Math.round((v - opts.min) / opts.step) * opts.step + opts.min
    return Math.min(opts.max, Math.max(opts.min, Number(snapped.toFixed(6))))
  }
  const out = h('output', { class: 'stepper__value', 'aria-live': 'polite' })
  const minus = iconButton('minus', `Less (${opts.label})`, () => undefined, { class: 'stepper__btn', silent: true })
  const plus = iconButton('plus', `More (${opts.label})`, () => undefined, { class: 'stepper__btn', silent: true })
  const el = h('div', { class: 'stepper', role: 'group', 'aria-label': opts.label }, minus, out, plus) as Stepper
  const paint = () => {
    out.textContent = format(value)
    setDisabled(minus, value <= opts.min)
    setDisabled(plus, value >= opts.max)
  }
  const nudge = (dir: 1 | -1): boolean => {
    const next = clampStep(value + dir * opts.step)
    if (next === value) return false
    value = next
    audio.tap()
    paint()
    opts.onChange(value)
    return true
  }
  for (const [btn, dir] of [
    [minus, -1],
    [plus, 1],
  ] as const) {
    let hold: ReturnType<typeof setTimeout> | null = null
    let repeated = false
    const stop = () => {
      if (hold) clearTimeout(hold)
      hold = null
    }
    btn.addEventListener('pointerdown', () => {
      repeated = false
      stop()
      const tick = (delay: number) => {
        hold = setTimeout(() => {
          repeated = true
          if (nudge(dir)) tick(110)
        }, delay)
      }
      tick(480)
    })
    btn.addEventListener('pointerup', stop)
    btn.addEventListener('pointercancel', stop)
    btn.addEventListener('pointerleave', stop)
    btn.addEventListener('click', () => {
      if (repeated) {
        repeated = false
        return
      }
      if (btn.getAttribute('aria-disabled') !== 'true') nudge(dir)
    })
  }
  el.setValue = (v: number) => {
    value = clampStep(v)
    paint()
  }
  el.getValue = () => value
  paint()
  return el
}

export interface SegmentOption<T extends string> {
  value: T
  label: string
  icon?: IconName
}

export type Segmented<T extends string> = HTMLDivElement & { setValue(value: T): void }

/** A row of 2–4 choices, one selected (radiogroup). */
export function segmented<T extends string>(opts: {
  options: SegmentOption<T>[]
  value: T
  onChange: (value: T) => void
  ariaLabel: string
}): Segmented<T> {
  let value = opts.value
  const el = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': opts.ariaLabel }) as Segmented<T>
  const btns = opts.options.map((o) => {
    const b = h(
      'button',
      { type: 'button', class: 'segmented__opt', role: 'radio', dataset: { value: o.value } },
      o.icon ? icon(o.icon, 24) : null,
      h('span', null, o.label),
    )
    pressable(b)
    onTap(b, () => {
      if (value === o.value) return
      value = o.value
      paint()
      opts.onChange(value)
    }, { guardMs: 200 })
    b.addEventListener('keydown', (e) => {
      const i = opts.options.indexOf(o)
      const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
      if (!d) return
      e.preventDefault()
      const next = btns[(i + d + btns.length) % btns.length]
      next.focus()
      next.click()
    })
    return b
  })
  const paint = () =>
    btns.forEach((b, i) => {
      const on = opts.options[i].value === value
      b.setAttribute('aria-checked', String(on))
      b.tabIndex = on ? 0 : -1
      b.classList.toggle('is-selected', on)
    })
  append(el, btns)
  el.style.setProperty('--count', String(btns.length))
  el.setValue = (v: T) => {
    value = v
    paint()
  }
  paint()
  return el
}

export type Switch = HTMLButtonElement & { setChecked(on: boolean): void }

/** A labelled on/off row (role=switch). */
export function toggleSwitch(opts: { label: string; checked: boolean; onChange: (on: boolean) => void; hint?: string }): Switch {
  let on = opts.checked
  const el = h(
    'button',
    { type: 'button', class: 'switch', role: 'switch' },
    h(
      'span',
      { class: 'switch__text' },
      h('span', { class: 'switch__label' }, opts.label),
      opts.hint ? h('span', { class: 'switch__hint' }, opts.hint) : null,
    ),
    h('span', { class: 'switch__track', 'aria-hidden': 'true' }, h('span', { class: 'switch__thumb' })),
  ) as Switch
  const paint = () => {
    el.setAttribute('aria-checked', String(on))
    el.classList.toggle('is-on', on)
  }
  pressable(el)
  onTap(el, () => {
    on = !on
    paint()
    opts.onChange(on)
  }, { guardMs: 250 })
  el.setChecked = (v: boolean) => {
    on = v
    paint()
  }
  paint()
  return el
}

// ---------------------------------------------------------------------------------------------
// Small bits

/** n dots, the i-th (0-based) current; earlier ones filled. */
export function progressDots(n: number, i: number): HTMLElement {
  const el = h('div', { class: 'dots', role: 'img', 'aria-label': `Step ${Math.min(n, i + 1)} of ${n}` })
  for (let k = 0; k < n; k++) {
    el.appendChild(h('span', { class: 'dots__dot' + (k < i ? ' is-done' : k === i ? ' is-current' : '') }))
  }
  return el
}

/** A friendly empty state: icon, a short title and one line. */
export function emptyState(opts: { icon: IconName | Element; title: string; text?: string; action?: HTMLElement }): HTMLElement {
  return h(
    'div',
    { class: 'empty' },
    h('div', { class: 'empty__art' }, typeof opts.icon === 'string' ? icon(opts.icon, 56) : opts.icon),
    h('h2', { class: 'empty__title' }, opts.title),
    opts.text ? h('p', { class: 'empty__text' }, opts.text) : null,
    opts.action ?? null,
  )
}
