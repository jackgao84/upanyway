/**
 * "How to cheer" (#/parent/cheer): the one page for grown-ups — six ways to cheer, each with a couple
 * of things to try saying, then how the game works (stones, the sinking sun, brave = safe but scary…).
 * Words from content/cheer.ts.
 */
import type { Screen } from '../../app/router'
import { CHEER, type CheerFactId, type CheerTipId } from '../../content/cheer'
import { button, type Tone } from '../../ui/components'
import { h } from '../../ui/dom'
import { icon, type IconName } from '../../ui/icons'
import { panel, parentLayout, parentPath } from './parts'

const TIP_ART: Record<CheerTipId, { icon: IconName; tone: Tone }> = {
  try: { icon: 'heart', tone: 'coral' },
  learn: { icon: 'idea', tone: 'sun' },
  flops: { icon: 'flops', tone: 'plum' },
  rescue: { icon: 'rope', tone: 'leaf' },
  bargain: { icon: 'stone', tone: 'ridge' },
  compare: { icon: 'mountain', tone: 'summit' },
}

const FACT_ICONS: Record<CheerFactId, IconName> = {
  brave: 'heart',
  stones: 'cairn',
  trail: 'map',
  sun: 'sun',
  falls: 'whipper',
  weather: 'weather',
  plans: 'plans',
}

export const parentCheerScreen: Screen = (root, ctx) => {
  const tips = CHEER.tips.map((tip, i) => {
    const art = TIP_ART[tip.id]
    return h(
      'article',
      { class: 'pp-tip', dataset: { tone: art.tone, tip: tip.id } },
      h(
        'div',
        { class: 'pp-tip__head' },
        h('span', { class: 'pp-tip__num', 'aria-hidden': 'true' }, String(i + 1)),
        h('h3', { class: 'pp-tip__title' }, tip.title),
        h('span', { class: 'pp-tip__icon', 'aria-hidden': 'true' }, icon(art.icon, 30)),
      ),
      h('p', { class: 'pp-tip__body' }, tip.body),
      h(
        'div',
        { class: 'pp-tip__say' },
        h('span', { class: 'pp-tip__say-label' }, CHEER.tryLabel),
        h('ul', { class: 'pp-tip__quotes' }, ...tip.tryThese.map((q) => h('li', { class: 'pp-tip__quote' }, `“${q}”`))),
      ),
      tip.id === 'flops'
        ? h(
            'div',
            { class: 'pp-tip__action' },
            button(CHEER.flopLink, { variant: 'secondary', icon: 'flops', onClick: () => ctx.navigate(parentPath('flop')) }),
          )
        : null,
    )
  })

  const facts = CHEER.facts.map((f) =>
    h(
      'div',
      { class: 'pp-fact', dataset: { fact: f.id } },
      h('span', { class: 'pp-fact__icon', 'aria-hidden': 'true' }, icon(FACT_ICONS[f.id], 26)),
      h('div', { class: 'pp-fact__text' }, h('h3', { class: 'pp-fact__title' }, f.title), h('p', { class: 'pp-fact__body' }, f.body)),
    ),
  )

  root.appendChild(
    parentLayout(ctx, {
      title: CHEER.title,
      class: 'parent--cheer',
      body: [
        h('div', { class: 'pp-cheer__intro' }, ...CHEER.intro.map((p) => h('p', null, p))),
        h('h2', { class: 'pp-section-title' }, CHEER.tipsTitle),
        h('div', { class: 'pp-tips' }, ...tips),
        panel({ title: CHEER.factsTitle, icon: 'book', tone: 'sky', class: 'pp-facts' }, ...facts),
        h('p', { class: 'pp-cheer__closing' }, CHEER.closing),
      ],
    }),
  )
}
