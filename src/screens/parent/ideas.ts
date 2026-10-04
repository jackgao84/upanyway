/**
 * Idea cards (#/parent/ideas): grown-ups can add their own cards to the ones she picks from when she
 * logs a brave thing — a brave idea or an Oops Mission — and remove the ones they added. The page
 * says plainly that she always chooses: a card is a suggestion, never a task (the brief rejects
 * parent-assigned tasks). The built-in cards can't be changed or deleted, but each one can be hidden
 * from her ideas screen and shown again (model/ideas.ts): they are listed in the groups and order her
 * screen uses, Oops Missions in their own section, each with a Shown/Hidden switch, plus a count of
 * the hidden ones and "Show all again".
 */
import { now, save, update } from '../../app/context'
import type { Screen } from '../../app/router'
import { IDEAS, IDEA_GROUPS, OOPS_INTRO, type Idea, type IdeaGroup } from '../../content/ideas'
import { hiddenCount, hideIdea, isHidden, showAllIdeas, showIdea } from '../../model/ideas'
import type { CustomIdea } from '../../storage/schema'
import { button, card, confirm, emptyState, setDisabled, textField, toast, toggleSwitch, type Switch } from '../../ui/components'
import { clear, h } from '../../ui/dom'
import { icon } from '../../ui/icons'
import { keepInView } from '../../ui/keyboard'
import { GROUP_ICONS, GROUP_TONES } from '../log/ticket'
import { PARENT_COPY } from './copy'
import { addCustomIdea, MAX_IDEA_CHARS, MAX_IDEA_WORDS, removeCustomIdea, wordsIn } from './records'
import { formError, mutate, newestFirst, panel, parentLayout, tag } from './parts'

const c = PARENT_COPY.ideas
const b = c.builtIn

/**
 * Every built-in card with a Shown/Hidden switch, grouped like her ideas screen. Changes save at once
 * and only repaint the rows and counts they touch, so the page keeps its scroll place.
 */
function builtInPanel(): HTMLElement {
  const rows = new Map<string, { item: HTMLElement; sw: Switch; hint: HTMLElement }>()
  const groupCounts = new Map<IdeaGroup, HTMLElement>()
  const count = h('p', { class: 'pp-hide__count', 'aria-live': 'polite' })

  const paintRow = (id: string): void => {
    const row = rows.get(id)
    if (!row) return
    const shown = !isHidden(save(), id)
    row.sw.setChecked(shown)
    row.hint.textContent = shown ? b.shown : b.hidden
    row.item.classList.toggle('is-hidden', !shown)
  }

  const showAll = button(b.showAll, {
    variant: 'secondary',
    icon: 'undo',
    class: 'pp-hide__all',
    onClick: async () => {
      const n = hiddenCount(save())
      if (!n) return
      const ok = await confirm({
        title: b.showAllConfirm.title,
        body: h('p', null, b.showAllConfirm.body(n)),
        yes: b.showAllConfirm.yes,
        no: b.showAllConfirm.no,
      })
      if (!ok) return
      update((d) => {
        showAllIdeas(d)
      })
      for (const id of rows.keys()) paintRow(id)
      paintCounts()
      toast(b.shownAll, { icon: 'check', tone: 'leaf' })
    },
  })

  const paintCounts = (): void => {
    const d = save()
    const n = hiddenCount(d)
    count.textContent = b.count(n)
    setDisabled(showAll, n === 0)
    for (const [group, el] of groupCounts) {
      const k = hiddenCount(d, group)
      el.textContent = k ? b.groupCount(k) : ''
    }
  }

  const row = (idea: Idea): HTMLElement => {
    const sw = toggleSwitch({
      label: idea.text,
      hint: b.shown,
      checked: true,
      onChange: (on) => {
        update((d) => {
          if (on) showIdea(d, idea.id)
          else hideIdea(d, idea.id)
        })
        paintRow(idea.id)
        paintCounts()
      },
    })
    sw.classList.add('pp-hide')
    sw.dataset.idea = idea.id
    const hint = sw.querySelector<HTMLElement>('.switch__hint') ?? h('span')
    const item = h('li', { class: 'pp-hide__item' }, sw)
    rows.set(idea.id, { item, sw, hint })
    return item
  }

  const groups = IDEA_GROUPS.map((g) => {
    const headingId = `pp-hide-${g.id}`
    const groupCount = h('span', { class: 'pp-hide__group-count' })
    groupCounts.set(g.id, groupCount)
    const oops = g.id === 'oops'
    return h(
      'section',
      {
        class: 'pp-hide__group' + (oops ? ' pp-hide__group--oops' : ''),
        dataset: { tone: GROUP_TONES[g.id], group: g.id },
        'aria-labelledby': headingId,
      },
      h(
        'div',
        { class: 'pp-hide__head' },
        h('span', { class: 'pp-hide__icon', 'aria-hidden': 'true' }, icon(GROUP_ICONS[g.id], 26)),
        h('h3', { class: 'pp-hide__title', id: headingId }, g.title),
        groupCount,
      ),
      oops ? h('p', { class: 'pp-hide__intro' }, OOPS_INTRO) : null,
      h('ul', { class: 'pp-hide__list' }, ...IDEAS.filter((i) => i.group === g.id).map(row)),
    )
  })

  for (const id of rows.keys()) paintRow(id)
  paintCounts()

  return panel(
    { title: b.title, icon: 'eye', tone: 'sky', lead: b.lead, class: 'pp-hide-panel' },
    h('ul', { class: 'pp-bullets' }, ...b.points.map((p) => h('li', null, icon('check', 22), h('span', null, p)))),
    h('div', { class: 'pp-hide__status' }, count, showAll),
    ...groups,
  )
}

export const ideasScreen: Screen = (root, ctx) => {
  const formHost = h('div', { class: 'pp-ideas__form' })
  const listHost = h('div', { class: 'pp-ideas__list' })
  let fresh = ''

  function renderForm(): void {
    clear(formHost)
    let text = ''
    let oops = false
    const error = formError()
    const counter = h('span', { class: 'pp-words', 'aria-live': 'polite' })
    const paintCount = () => {
      const n = wordsIn(text)
      counter.textContent = c.words(n, MAX_IDEA_WORDS)
      counter.classList.toggle('is-over', n > MAX_IDEA_WORDS)
    }
    const field = textField({
      label: c.textLabel,
      value: '',
      placeholder: c.placeholder,
      hint: c.voice,
      name: 'idea-text',
      onInput: (v) => {
        text = v
        paintCount()
        error.clear()
      },
    })
    // No onEnter: the keyboard's Done key only puts the keyboard away, so a grown-up can still reach
    // the Oops Mission switch below. "Add idea card" is the only way to add it.
    field.input.setAttribute('enterkeyhint', 'done')
    field.input.setAttribute('maxlength', String(MAX_IDEA_CHARS))
    // The word count sits on the hint's line, where the kit's character count would go.
    const meta = field.querySelector('.field__meta')
    meta?.querySelector('.field__count')?.remove()
    meta?.appendChild(counter)
    paintCount()

    const rule = h('div', { class: 'callout pp-oops-rule', dataset: { tone: 'sun' } }, icon('oops', 30), h('p', null, c.oopsRule))
    const oopsSwitch = toggleSwitch({
      label: c.oops,
      hint: c.oopsHint,
      checked: false,
      onChange: (on) => {
        oops = on
        rule.classList.toggle('is-on', on)
      },
    })

    const submit = () => {
      const n = wordsIn(text)
      if (!n) {
        error.show(c.needText)
        field.input.focus()
        return
      }
      if (n > MAX_IDEA_WORDS) {
        error.show(c.tooLong(MAX_IDEA_WORDS))
        field.input.focus()
        return
      }
      const idea = mutate((d) => addCustomIdea(d, text, oops, now()))
      if (!idea) return
      field.input.blur()
      fresh = idea.id
      toast(c.added, { icon: idea.oops ? 'oops' : 'idea', tone: 'leaf' })
      renderForm()
      renderList()
      const item = listHost.querySelector<HTMLElement>('.is-fresh')
      if (item) keepInView(item)
    }

    formHost.append(
      panel(
        { title: c.addTitle, icon: 'plus', tone: 'summit', class: 'pp-ideas__panel' },
        field,
        oopsSwitch,
        rule,
        error,
        h('div', { class: 'pp-actions pp-actions--end' }, button(c.add, { icon: 'plus', onClick: submit })),
      ),
    )
  }

  function ideaItem(idea: CustomIdea): HTMLElement {
    return h(
      'li',
      { class: 'pp-idea' + (idea.id === fresh ? ' is-fresh' : '') },
      card({
        title: idea.text,
        icon: idea.oops ? 'oops' : 'idea',
        tone: idea.oops ? 'sun' : 'leaf',
        body: tag(idea.oops ? c.oops : c.brave, idea.oops ? 'sun' : 'leaf'),
        class: 'pp-idea__card',
      }),
      button(c.remove, {
        variant: 'ghost',
        icon: 'trash',
        ariaLabel: c.removeLabel(idea.text),
        class: 'pp-item__action pp-item__action--quiet pp-idea__remove',
        onClick: async () => {
          const ok = await confirm({
            title: c.removeConfirm.title,
            body: h('p', null, c.removeConfirm.body),
            yes: c.removeConfirm.yes,
            no: c.removeConfirm.no,
            danger: true,
          })
          if (!ok) return
          update((d) => {
            removeCustomIdea(d, idea.id)
          })
          toast(c.removed, { icon: 'check', tone: 'leaf' })
          renderList()
        },
      }),
    )
  }

  function renderList(): void {
    clear(listHost)
    const ideas = newestFirst(save().customIdeas, (i) => i.createdAt)
    listHost.append(
      panel(
        { title: c.listTitle, icon: 'idea', tone: 'leaf', lead: ideas.length ? c.listLead : undefined },
        ideas.length ? h('ul', { class: 'pp-ideas' }, ...ideas.map(ideaItem)) : emptyState({ icon: 'idea', title: c.none, text: c.noneText }),
      ),
    )
  }

  renderForm()
  renderList()

  root.appendChild(
    parentLayout(ctx, {
      title: c.title,
      class: 'parent--ideas',
      body: [
        h('p', { class: 'pp-page-lead' }, c.lead),
        h(
          'div',
          { class: 'callout pp-choose', dataset: { tone: 'coral' } },
          icon('heart', 32),
          h('div', null, h('strong', { class: 'pp-choose__title' }, c.chooseTitle), h('p', null, c.choose)),
        ),
        h('div', { class: 'callout callout--care pp-safe' }, icon('info', 30), h('p', null, c.safe)),
        formHost,
        listHost,
        builtInPanel(),
      ],
    }),
  )
}
