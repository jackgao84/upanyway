/**
 * The Grown-ups' Wing (#/parent/flop): hang one of your own flops in the Hall of Flops — whose it is,
 * what happened, what you learned — and change or take down the ones already hanging. Her side shows
 * them as framed exhibits with "What I learned" as the caption (screens/flops.ts).
 *
 * "Whose flop?" is a short text field with the grown-ups' names as quick picks, so a grandparent's
 * or a teacher's flop can hang there too.
 */
import { now, save, update } from '../../app/context'
import type { Screen } from '../../app/router'
import type { GrownupFlop } from '../../storage/schema'
import { button, chips, confirm, emptyState, textField, toast } from '../../ui/components'
import { clear, h } from '../../ui/dom'
import { keepInView } from '../../ui/keyboard'
import { PARENT_COPY } from './copy'
import { addGrownupFlop, editGrownupFlop, MAX_FLOP_TEXT, removeGrownupFlop, type FlopInput } from './records'
import { formError, mutate, newestFirst, panel, parentLayout, shortDate } from './parts'

const c = PARENT_COPY.flop
const MAX_WHO = 24

export const grownupFlopScreen: Screen = (root, ctx) => {
  const formHost = h('div', { class: 'pp-flop__form' })
  const listHost = h('div', { class: 'pp-flop__list' })
  let fresh = ''

  /** The form: a new flop, or `editing` one that already hangs in the Wing. */
  function renderForm(editing?: GrownupFlop): void {
    clear(formHost)
    const names = save()
      .parent.names.map((n) => n.trim())
      .filter(Boolean)
    const input: FlopInput = {
      who: editing ? editing.who : names[0] ?? '',
      what: editing?.what ?? '',
      learned: editing?.learned ?? '',
    }
    const error = formError()

    const who = textField({
      label: c.who,
      value: input.who,
      maxLength: MAX_WHO,
      autocapitalize: 'words',
      name: 'flop-who',
      onInput: (v) => {
        input.who = v
        quick?.setSelected(names.includes(v.trim()) ? [v.trim()] : [])
        error.clear()
      },
    })
    const quick =
      names.length > 1
        ? chips(
            names,
            (name, _i, on) => {
              const v = on ? name : ''
              input.who = v
              who.setValue(v)
              error.clear()
            },
            { selected: names.includes(input.who.trim()) ? input.who.trim() : null, ariaLabel: c.who },
          )
        : null
    quick?.classList.add('pp-flop__names')

    const what = textField({
      label: c.what,
      value: input.what,
      placeholder: c.whatPlaceholder,
      multiline: true,
      maxLength: MAX_FLOP_TEXT,
      name: 'flop-what',
      onInput: (v) => {
        input.what = v
        error.clear()
      },
    })
    const learned = textField({
      label: c.learned,
      value: input.learned,
      placeholder: c.learnedPlaceholder,
      multiline: true,
      maxLength: MAX_FLOP_TEXT,
      hint: c.learnedHint,
      name: 'flop-learned',
      onInput: (v) => {
        input.learned = v
      },
    })

    const submit = () => {
      if (!input.who.trim()) {
        error.show(c.needWho)
        who.input.focus()
        return
      }
      if (!input.what.trim()) {
        error.show(c.needWhat)
        what.input.focus()
        return
      }
      if (editing) {
        const ok = mutate((d) => editGrownupFlop(d, editing.id, input))
        toast(ok ? c.updated : c.gone, { icon: 'check', tone: 'leaf' })
        fresh = ok ? editing.id : ''
      } else {
        const flop = mutate((d) => addGrownupFlop(d, input, now()))
        if (!flop) return
        toast(c.added, { icon: 'flops', tone: 'plum' })
        fresh = flop.id
      }
      renderForm()
      renderList()
      const item = listHost.querySelector<HTMLElement>('.is-fresh')
      if (item) keepInView(item)
    }

    formHost.append(
      panel(
        { title: editing ? c.editTitle : c.addTitle, icon: editing ? 'pencil' : 'plus', tone: 'plum', class: 'pp-flop__panel' },
        h('div', { class: 'pp-flop__who' }, who, quick),
        what,
        learned,
        error,
        h(
          'div',
          { class: 'pp-actions pp-actions--end' },
          editing ? button(c.cancel, { variant: 'secondary', onClick: () => renderForm() }) : null,
          button(editing ? c.save : c.add, { icon: editing ? 'check' : 'flops', onClick: submit }),
        ),
      ),
    )
    if (editing) keepInView(formHost)
  }

  function renderList(): void {
    clear(listHost)
    const today = now()
    const flops = newestFirst(save().grownupFlops, (f) => f.createdAt)
    listHost.append(
      panel(
        { title: c.listTitle, icon: 'flops', tone: 'plum' },
        flops.length
          ? h(
              'ul',
              { class: 'pp-list' },
              ...flops.map((f) =>
                h(
                  'li',
                  { class: 'pp-item pp-flop-item' + (f.id === fresh ? ' is-fresh' : '') },
                  h(
                    'div',
                    { class: 'pp-item__top' },
                    h('span', { class: 'pp-item__who' }, f.who || c.someone),
                    h('span', { class: 'pp-item__date' }, shortDate(f.createdAt, today)),
                  ),
                  h('p', { class: 'pp-item__text' }, f.what),
                  f.learned ? h('p', { class: 'pp-flop-item__learned' }, h('strong', null, c.learnedCaption), ' ', f.learned) : null,
                  h(
                    'div',
                    { class: 'pp-item__foot pp-item__foot--end' },
                    button(c.edit, {
                      variant: 'ghost',
                      icon: 'pencil',
                      ariaLabel: c.editLabel(f.what),
                      class: 'pp-item__action',
                      onClick: () => renderForm(f),
                    }),
                    button(c.remove, {
                      variant: 'ghost',
                      icon: 'trash',
                      ariaLabel: c.removeLabel(f.what),
                      class: 'pp-item__action pp-item__action--quiet',
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
                          removeGrownupFlop(d, f.id)
                        })
                        toast(c.removed, { icon: 'check', tone: 'leaf' })
                        renderForm()
                        renderList()
                      },
                    }),
                  ),
                ),
              ),
            )
          : emptyState({ icon: 'flops', title: c.none, text: c.noneText }),
      ),
    )
  }

  renderForm()
  renderList()

  root.appendChild(
    parentLayout(ctx, {
      title: c.title,
      class: 'parent--flop',
      body: [
        h('p', { class: 'pp-page-lead' }, c.lead),
        h('p', { class: 'pp-page-note' }, c.tip),
        formHost,
        listHost,
      ],
    }),
  )
}
