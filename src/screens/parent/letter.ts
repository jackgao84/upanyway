/**
 * Write a Spotted! letter (#/parent/letter): "I saw you…", signed by one of the grown-ups' names.
 * addLetter() puts it in her Letters at camp; opening it there adds a bonus stone (one a day, extras
 * wait). Below: every letter sent so far, opened or not. An unopened letter can be taken back (a typo,
 * the wrong name) — no stone has been placed for it yet. Opened letters stay: stones are never taken.
 */
import { now, save, update } from '../../app/context'
import type { Screen } from '../../app/router'
import { addLetter } from '../../model/stones'
import type { Letter } from '../../storage/schema'
import { button, confirm, emptyState, textField, toast } from '../../ui/components'
import { clear, h } from '../../ui/dom'
import { icon } from '../../ui/icons'
import { PARENT_COPY } from './copy'
import { takeBackLetter } from './records'
import { formError, mutate, newestFirst, panel, para, parentLayout, parentPath, shortDate, tag, whoPicker } from './parts'

const c = PARENT_COPY.letter
const MAX_LETTER = 400

/** True when the note says more than the starter words. */
export function letterHasWords(text: string): boolean {
  const t = text.trim().replace(/[.…\s]+$/, '')
  return t.length > 0 && t.toLowerCase() !== c.start.trim().toLowerCase()
}

export const letterScreen: Screen = (root, ctx) => {
  const formHost = h('div', { class: 'pp-letter__form' })
  const listHost = h('div', { class: 'pp-letter__list' })

  function renderForm(): void {
    clear(formHost)
    let text: string = c.start
    const who = whoPicker(save().parent.names, { label: c.from, fieldLabel: c.fromField })
    const error = formError()
    const field = textField({
      label: c.textLabel,
      value: text,
      multiline: true,
      maxLength: MAX_LETTER,
      name: 'letter-text',
      onInput: (v) => {
        text = v
        error.clear()
      },
    })
    field.input.classList.add('pp-letter__input')
    const send = () => {
      const from = who.value()
      if (!from) {
        error.show(c.needFrom)
        return
      }
      if (!letterHasWords(text)) {
        error.show(c.tooShort)
        field.input.focus()
        return
      }
      const letter = mutate((d) => addLetter(d, from, text, now()))
      renderSent(letter)
      renderList()
    }
    formHost.append(
      panel(
        { class: 'pp-letter__paper' },
        h('div', { class: 'pp-letter__stamp', 'aria-hidden': 'true' }, c.stamp),
        who.el,
        field,
        h(
          'div',
          { class: 'pp-examples' },
          h('span', { class: 'pp-examples__label' }, c.examplesTitle),
          ...c.examples.map((e) => h('p', { class: 'pp-examples__item' }, `“${e}”`)),
        ),
        error,
        h('div', { class: 'pp-actions pp-actions--end' }, button(c.send, { icon: 'letter', onClick: send })),
      ),
    )
    // Put the caret after "I saw you " (iPad needs the field focused first; only on a tap, not here).
    field.input.addEventListener(
      'focus',
      () => {
        const el = field.input
        if (el.value === c.start) {
          try {
            el.setSelectionRange(el.value.length, el.value.length)
          } catch {
            // Some inputs refuse selection ranges; the caret just lands where it lands.
          }
        }
      },
      { once: true },
    )
  }

  function renderSent(letter: Letter): void {
    clear(formHost)
    formHost.append(
      panel(
        { class: 'pp-sent', tone: 'leaf' },
        h('div', { class: 'pp-sent__icon', 'aria-hidden': 'true' }, icon('letter', 44)),
        h('h2', { class: 'pp-sent__title' }, c.sentTitle),
        para(c.sentText),
        h(
          'article',
          { class: 'note pp-sent__note' },
          h('span', { class: 'note__from' }, c.stamp),
          h('p', { class: 'note__text' }, letter.text),
          h('p', { class: 'pp-sent__sign' }, '— ', letter.from),
        ),
        h(
          'div',
          { class: 'pp-actions pp-actions--center' },
          button(c.another, { variant: 'secondary', icon: 'pencil', onClick: renderForm }),
          button(PARENT_COPY.home.title, { icon: 'grownups', onClick: () => ctx.back(parentPath('home')) }),
        ),
      ),
    )
  }

  function renderList(): void {
    clear(listHost)
    const d = save()
    const today = now()
    const letters = newestFirst(d.letters, (l) => l.createdAt)
    listHost.append(
      panel(
        { title: c.listTitle, icon: 'letter', tone: 'sun' },
        letters.length
          ? h(
              'ul',
              { class: 'pp-list' },
              ...letters.map((l) => {
                const opened = Boolean(l.openedAt)
                const takeBack = opened
                  ? null
                  : button(c.takeBack, {
                      variant: 'ghost',
                      icon: 'undo',
                      ariaLabel: c.takeBackLabel(l.from),
                      class: 'pp-item__action',
                      onClick: async () => {
                        const ok = await confirm({
                          title: c.takeBackConfirm.title,
                          body: h('p', null, c.takeBackConfirm.body),
                          yes: c.takeBackConfirm.yes,
                          no: c.takeBackConfirm.no,
                          danger: true,
                        })
                        if (!ok) return
                        update((draft) => {
                          takeBackLetter(draft, l.id)
                        })
                        toast(c.takenBack, { icon: 'check', tone: 'leaf' })
                        renderList()
                      },
                    })
                return h(
                  'li',
                  { class: 'pp-item pp-letter-item' + (opened ? ' is-opened' : '') },
                  h(
                    'div',
                    { class: 'pp-item__top' },
                    h('span', { class: 'pp-item__who' }, l.from),
                    opened ? tag(c.opened(shortDate(l.openedAt, today)), 'leaf', 'check') : tag(c.unopened, 'sun', 'letter'),
                  ),
                  h('p', { class: 'pp-item__text' }, l.text),
                  h('div', { class: 'pp-item__foot' }, h('span', { class: 'pp-item__date' }, c.sent(shortDate(l.createdAt, today))), takeBack),
                )
              }),
            )
          : emptyState({ icon: 'letter', title: c.none }),
      ),
    )
  }

  renderForm()
  renderList()

  root.appendChild(
    parentLayout(ctx, {
      title: c.title,
      class: 'parent--letter',
      body: [h('p', { class: 'pp-page-lead' }, c.lead), h('p', { class: 'pp-page-note' }, c.how), formHost, listHost],
    }),
  )
}
