/**
 * Idea cards (#/parent/ideas): grown-ups can add their own cards to the ones she picks from when she
 * logs a brave thing — a brave idea or an Oops Mission — and remove the ones they added. The page
 * says plainly that she always chooses: a card is a suggestion, never a task (the brief rejects
 * parent-assigned tasks). The built-in cards can't be removed or changed here.
 */
import { now, save, update } from '../../app/context'
import type { Screen } from '../../app/router'
import type { CustomIdea } from '../../storage/schema'
import { button, card, confirm, emptyState, textField, toast, toggleSwitch } from '../../ui/components'
import { clear, h } from '../../ui/dom'
import { icon } from '../../ui/icons'
import { keepInView } from '../../ui/keyboard'
import { PARENT_COPY } from './copy'
import { addCustomIdea, MAX_IDEA_CHARS, MAX_IDEA_WORDS, removeCustomIdea, wordsIn } from './records'
import { formError, mutate, newestFirst, panel, parentLayout, tag } from './parts'

const c = PARENT_COPY.ideas

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
      ],
    }),
  )
}
