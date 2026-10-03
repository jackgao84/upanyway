/**
 * Shared bits for the grown-ups' pages: the page layout (back to the grown-ups' home), paper panels
 * with a heading, dates in plain words, the "from" picker for a grown-up's name, form error lines,
 * and switching test mode.
 */
import './parent.css'
import { update } from '../../app/context'
import type { ScreenContext } from '../../app/router'
import type { SaveData } from '../../storage/schema'
import { screenLayout, segmented, textField, type Tone } from '../../ui/components'
import { h, type Child } from '../../ui/dom'
import { icon, type IconName } from '../../ui/icons'
import { PARENT_COPY } from './copy'
import { applyTestMode } from './records'

/** Grown-ups' pages, by the last part of their path (#/parent/<page>). */
export const PARENT_PAGES = ['home', 'cheer', 'cairn', 'letter', 'flop', 'ideas', 'settings', 'data', 'pin'] as const
export type ParentPage = (typeof PARENT_PAGES)[number]

export function parentPath(page: ParentPage): string {
  return `/parent/${page}`
}

export interface ParentLayoutOpts {
  title: string
  body: Child[]
  footer?: Child[]
  /** Extra class on the layout (e.g. 'parent--data'). */
  class?: string
  /** Back goes here (default: the grown-ups' home). */
  back?: () => void
  backLabel?: string
  /** A narrower reading column (the PIN pad). */
  narrow?: boolean
}

/** A grown-ups' page: the sky-toned layout with a back button to the grown-ups' home. */
export function parentLayout(ctx: ScreenContext, opts: ParentLayoutOpts): HTMLElement {
  return screenLayout({
    class: 'parent' + (opts.class ? ' ' + opts.class : ''),
    title: opts.title,
    tone: 'sky',
    back: opts.back ?? (() => ctx.back(parentPath('home'))),
    backLabel: opts.backLabel ?? PARENT_COPY.back,
    body: opts.body,
    footer: opts.footer,
    narrow: opts.narrow,
  })
}

/** Test mode on or off (see applyTestMode). */
export function setTestMode(on: boolean): void {
  update((d) => applyTestMode(d, on))
}

export interface PanelOpts {
  title?: string
  icon?: IconName
  tone?: Tone
  /** A line of plain explanation under the title. */
  lead?: string
  class?: string
  /** For aria-labelledby (defaults to a generated id when there is a title). */
  id?: string
}

let panelIds = 0

/** A paper panel: optional icon + heading, an explanation line, then the content. */
export function panel(opts: PanelOpts, ...children: Child[]): HTMLElement {
  const headingId = opts.title ? opts.id ?? `pp-${++panelIds}` : undefined
  return h(
    'section',
    {
      class: 'pp' + (opts.class ? ' ' + opts.class : ''),
      dataset: opts.tone ? { tone: opts.tone } : undefined,
      'aria-labelledby': headingId,
    },
    opts.title
      ? h(
          'div',
          { class: 'pp__head' },
          opts.icon ? h('span', { class: 'pp__icon', 'aria-hidden': 'true' }, icon(opts.icon, 28)) : null,
          h('h2', { class: 'pp__title', id: headingId }, opts.title),
        )
      : null,
    opts.lead ? h('p', { class: 'pp__lead' }, opts.lead) : null,
    ...children,
  )
}

/** update() that hands back what the change made (a new letter, a new idea…). */
export function mutate<T>(fn: (d: SaveData) => T): T {
  let out: { v: T } | null = null
  update((d) => {
    out = { v: fn(d) }
  })
  return (out as { v: T } | null)!.v
}

/** A short plain-English paragraph inside a panel. */
export function para(text: Child, cls = ''): HTMLParagraphElement {
  return h('p', { class: 'pp__text' + (cls ? ' ' + cls : '') }, text)
}

/** A little coloured label (Oops Mission, Not opened yet…). */
export function tag(text: string, tone: Tone = 'paper', iconName?: IconName): HTMLElement {
  return h('span', { class: 'pp-tag', dataset: { tone } }, iconName ? icon(iconName, 18) : null, text)
}

/** "Tue 3 Oct" (this year) or "3 Oct 2025"; "" for a missing or broken date. */
export function shortDate(iso: string | undefined, now: Date): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  const d = new Date(t)
  try {
    return d.getFullYear() === now.getFullYear()
      ? d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
      : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return d.toDateString()
  }
}

/** Newest first, by an ISO field (broken dates last). */
export function newestFirst<T>(items: readonly T[], at: (item: T) => string | undefined): T[] {
  const time = (item: T) => {
    const t = Date.parse(at(item) ?? '')
    return Number.isFinite(t) ? t : -Infinity
  }
  return [...items].sort((a, b) => time(b) - time(a))
}

export interface WhoPicker {
  el: HTMLElement
  value(): string
  setValue(name: string): void
}

/**
 * Pick which grown-up something is from: a segmented control for 2–4 names, a fixed label for one,
 * a short text field when no names were saved (or the saved value isn't one of them).
 */
export function whoPicker(names: readonly string[], opts: { label: string; fieldLabel: string; value?: string; onChange?: () => void }): WhoPicker {
  const clean = names.map((n) => n.trim()).filter(Boolean).slice(0, 4)
  const start = opts.value?.trim() ?? ''
  if (clean.length >= 2 && (!start || clean.includes(start))) {
    let value = start || clean[0]
    const seg = segmented({
      options: clean.map((n) => ({ value: n, label: n })),
      value,
      ariaLabel: opts.label,
      onChange: (v) => {
        value = v
        opts.onChange?.()
      },
    })
    seg.classList.add('pp-who__seg')
    const el = h('div', { class: 'pp-who' }, h('span', { class: 'pp-who__label', 'aria-hidden': 'true' }, opts.label), seg)
    return {
      el,
      value: () => value,
      setValue: (v) => {
        if (!clean.includes(v)) return
        value = v
        seg.setValue(v)
      },
    }
  }
  if (clean.length === 1 && (!start || start === clean[0])) {
    const el = h(
      'div',
      { class: 'pp-who pp-who--one' },
      h('span', { class: 'pp-who__label' }, opts.label),
      h('span', { class: 'pp-who__name' }, clean[0]),
    )
    return { el, value: () => clean[0], setValue: () => undefined }
  }
  let typed = start || clean[0] || ''
  const field = textField({
    label: opts.fieldLabel,
    value: typed,
    maxLength: 24,
    autocapitalize: 'words',
    name: 'who',
    onInput: (v) => {
      typed = v
      opts.onChange?.()
    },
  })
  return {
    el: h('div', { class: 'pp-who pp-who--field' }, field),
    value: () => typed.trim().replace(/\s+/g, ' '),
    setValue: (v) => {
      typed = v
      field.setValue(v)
    },
  }
}

/** A line under a form for a problem ("Say what happened first."), read out when it appears. */
export function formError(): HTMLParagraphElement & { show(msg: string): void; clear(): void } {
  const el = h('p', { class: 'pp-error', role: 'alert' }) as HTMLParagraphElement & { show(msg: string): void; clear(): void }
  el.show = (msg: string) => {
    el.textContent = msg
  }
  el.clear = () => {
    el.textContent = ''
  }
  return el
}
