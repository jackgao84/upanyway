/**
 * "Pick an idea" (step 1b of the log flow): idea cards by group, the grown-ups' extra ideas, and the
 * Oops Missions in their own section with a one-line explanation. The brave-vs-dangerous line is
 * ALWAYS at the top. Picking a card hands its idea back; she can still change the words after.
 * It shows the cards it is given (model/ideas.ts visibleIdeas: built-in ones a grown-up hid are left
 * out); a group with nothing left to show has no heading and no jump chip.
 */
import { IDEA_GROUPS, OOPS_INTRO, type Idea } from '../../content/ideas'
import { card, chip, emptyState, type Tone } from '../../ui/components'
import { h } from '../../ui/dom'
import { icon, type IconName } from '../../ui/icons'
import { LOG_COPY } from './copy'
import { GROUP_ICONS, GROUP_TONES } from './ticket'

interface Section {
  key: string
  title: string
  icon: IconName
  tone: Tone
  ideas: Idea[]
  intro?: string
  oops?: boolean
}

function sections(cards: readonly Idea[]): Section[] {
  const out: Section[] = []
  const builtIn = cards.filter((i) => !i.custom)
  const extraBrave = cards.filter((i) => i.custom && !i.oops)
  const extraOops = cards.filter((i) => i.custom && i.oops)
  for (const g of IDEA_GROUPS) {
    // The grown-ups' extra ideas sit among the others (just before the Oops Missions): ideas to
    // choose from, never a list of jobs.
    if (g.id === 'oops' && extraBrave.length) {
      out.push({ key: 'extra', title: LOG_COPY.ideas.extra, icon: 'idea', tone: 'summit', ideas: extraBrave })
    }
    const inGroup = builtIn.filter((i) => i.group === g.id)
    const ideas = g.id === 'oops' ? [...inGroup, ...extraOops] : inGroup
    if (!ideas.length) continue
    out.push({
      key: g.id,
      title: g.title,
      icon: GROUP_ICONS[g.id],
      tone: GROUP_TONES[g.id],
      ideas,
      intro: g.id === 'oops' ? OOPS_INTRO : undefined,
      oops: g.id === 'oops',
    })
  }
  return out
}

export interface IdeasViewOpts {
  /** The cards to show (model/ideas.ts visibleIdeas), built-in and the grown-ups' own. */
  ideas: readonly Idea[]
  /** The idea she picked before (shown as selected). */
  selectedId?: string
  onPick: (idea: Idea) => void
  /** The screen's scroll container (for the jump chips). */
  scroller: HTMLElement
}

/** The body of the ideas screen. */
export function ideasView(opts: IdeasViewOpts): HTMLElement[] {
  const c = LOG_COPY.ideas
  const list = sections(opts.ideas)

  const care = h(
    'div',
    { class: 'callout callout--care ideas__care' },
    icon('heart', 34),
    h('p', { class: 'ideas__care-text' }, h('strong', { class: 'ideas__care-title' }, c.brave), ' ', c.care),
  )

  const sectionEls = new Map<string, HTMLElement>()
  const jumpTo = (key: string) => {
    const el = sectionEls.get(key)
    if (!el) return
    const scroller = opts.scroller
    const header = scroller.querySelector<HTMLElement>('.layout__header')
    const headerH = header ? header.getBoundingClientRect().height : 0
    const top = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - headerH - 8
    const smooth = typeof matchMedia === 'function' && !matchMedia('(prefers-reduced-motion: reduce)').matches
    scroller.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' })
  }
  const jump = h(
    'nav',
    { class: 'chips ideas__jump', 'aria-label': c.jump },
    ...list.map((s) => {
      const b = chip(s.title, () => jumpTo(s.key))
      b.classList.add('ideas__jump-chip')
      b.dataset.tone = s.tone
      b.prepend(h('span', { class: 'ideas__jump-icon', 'aria-hidden': 'true' }, icon(s.icon, 22)))
      return b
    }),
  )

  const blocks = list.map((s) => {
    const headingId = `ideas-${s.key}`
    const el = h(
      'section',
      {
        class: 'ideas__section' + (s.oops ? ' ideas__section--oops' : ''),
        dataset: { tone: s.tone, group: s.key },
        'aria-labelledby': headingId,
      },
      h(
        'div',
        { class: 'ideas__head' },
        h('span', { class: 'ideas__head-icon', 'aria-hidden': 'true' }, icon(s.icon, 30)),
        h('h2', { class: 'ideas__title', id: headingId }, s.title),
      ),
      s.intro ? h('p', { class: 'ideas__intro' }, s.intro) : null,
      h(
        'div',
        { class: 'ideas__grid' },
        ...s.ideas.map((idea) =>
          card({
            title: idea.text,
            icon: icon(s.icon, 26),
            tone: s.tone,
            class: 'idea-card',
            selected: opts.selectedId === idea.id ? true : undefined,
            onClick: () => opts.onPick(idea),
          }),
        ),
      ),
    )
    sectionEls.set(s.key, el)
    return el
  })

  // Every card hidden and none added: she can still type her own (the field is one step back).
  if (!blocks.length) return [care, emptyState({ icon: 'idea', title: c.none.title, text: c.none.text })]
  return [care, jump, ...blocks]
}
