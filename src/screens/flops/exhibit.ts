/**
 * One framed piece in the Hall of Flops: a gilded frame around a calm painting, and a museum
 * placard under it with the title (the brave thing, or the grown-up's flop), who and when, and the
 * caption ("What I learned: …"). Used for her flops and for the Grown-ups' Wing alike: the same
 * respect for both. Never a joke, never a fall pose.
 */
import { h } from '../../ui/dom'
import { painting } from './painting'

export interface ExhibitOpts {
  /** Seeds the painting (the record's id). */
  seed: string
  /** The brave thing / what flopped. */
  title: string
  /** "by Mum" (Grown-ups' Wing). */
  artist?: string
  /** "Tried on 3 October". */
  date?: string
  /** "What I learned:" — the caption is left out when there is no caption text. */
  captionLabel: string
  caption?: string
  /** A little ribbon over the frame, e.g. "Just hung". */
  ribbon?: string
  id?: string
}

export function exhibit(opts: ExhibitOpts): HTMLElement {
  const meta = [opts.artist, opts.date].filter(Boolean).join(' · ')
  return h(
    'figure',
    { class: 'exhibit', dataset: opts.id ? { id: opts.id } : undefined },
    h(
      'div',
      { class: 'exhibit__hang', 'aria-hidden': 'true' },
      h('span', { class: 'exhibit__lamp' }),
      h('span', { class: 'exhibit__glow' }),
    ),
    h(
      'div',
      { class: 'exhibit__frame' },
      h('div', { class: 'exhibit__mat' }, h('div', { class: 'exhibit__art' }, painting(opts.seed))),
      opts.ribbon ? h('span', { class: 'exhibit__ribbon' }, opts.ribbon) : null,
    ),
    h(
      'figcaption',
      { class: 'placard' },
      h('h3', { class: 'placard__title' }, opts.title),
      meta ? h('p', { class: 'placard__meta' }, meta) : null,
      opts.caption
        ? h('p', { class: 'placard__caption' }, h('span', { class: 'placard__label' }, opts.captionLabel), ' ', opts.caption)
        : null,
    ),
  )
}
