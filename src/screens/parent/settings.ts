/**
 * Grown-ups' settings (#/parent/settings): daily climbing minutes (5–120 in fives, or no limit — shown
 * to the climber as a sinking sun, never a countdown), sound (the same master flag as the corner
 * toggle) and music, the names the climber calls the grown-ups, and test mode.
 *
 * Changes save straight away (the store debounces). Switches follow the save, so pressing the corner
 * speaker button while this page is open moves the Sound switch too.
 */
import { save, update } from '../../app/context'
import type { Screen } from '../../app/router'
import { MAX_PARENT_NAMES } from '../../storage/migrations'
import { store } from '../../storage/store'
import { button, iconButton, stepper, textField, toast, toggleSwitch, type TextField } from '../../ui/components'
import { clear, h } from '../../ui/dom'
import { icon } from '../../ui/icons'
import { PARENT_COPY } from './copy'
import { formError, panel, para, parentLayout, setTestMode } from './parts'
import { MIN_MINUTES, MINUTES_STEP, minutesToStep, NO_LIMIT_STEP, stepToMinutes } from './records'

const c = PARENT_COPY.settings

const MAX_NAME_LENGTH = 24

export const settingsScreen: Screen = (root, ctx) => {
  const d = save()

  // ---- Climbing time ------------------------------------------------------------------------
  const savedNote = h('span', { class: 'pp-saved', 'aria-live': 'polite' })
  let savedTimer: ReturnType<typeof setTimeout> | null = null
  const flashSaved = () => {
    savedNote.textContent = c.minutes.saved
    savedNote.classList.add('is-on')
    if (savedTimer) clearTimeout(savedTimer)
    savedTimer = setTimeout(() => savedNote.classList.remove('is-on'), 1600)
  }
  const minutes = stepper({
    value: minutesToStep(d.parent.dailyClimbMinutes),
    min: MIN_MINUTES,
    max: NO_LIMIT_STEP,
    step: MINUTES_STEP,
    label: c.minutes.label,
    format: (v) => (v >= NO_LIMIT_STEP ? c.minutes.noLimit : c.minutes.value(v)),
    onChange: (v) => {
      update((draft) => {
        draft.parent.dailyClimbMinutes = stepToMinutes(v)
      })
      flashSaved()
    },
  })
  const sunArt = h('span', { class: 'pp-sun', 'aria-hidden': 'true' }, h('span', { class: 'pp-sun__disc' }), h('span', { class: 'pp-sun__hill' }))
  const timePanel = panel(
    { title: c.minutes.title, icon: 'sun', tone: 'sun' },
    h('div', { class: 'pp-minutes' }, minutes, savedNote),
    h('div', { class: 'pp-sun-row' }, sunArt, para(c.minutes.sun, 'pp-text--strong')),
    para(c.minutes.end),
  )

  // ---- Sound --------------------------------------------------------------------------------
  const musicNote = h('p', { class: 'pp__text pp__text--faint pp-music-note' }, c.sound.musicWhenMuted)
  const master = toggleSwitch({
    label: c.sound.master,
    hint: c.sound.masterHint,
    checked: !d.settings.muted,
    onChange: (on) =>
      update((draft) => {
        draft.settings.muted = !on
      }),
  })
  const music = toggleSwitch({
    label: c.sound.music,
    hint: c.sound.musicHint,
    checked: d.settings.music,
    onChange: (on) =>
      update((draft) => {
        draft.settings.music = on
      }),
  })
  const soundPanel = panel({ title: c.sound.title, icon: 'sound-on', tone: 'ridge' }, h('div', { class: 'pp-switches' }, master, music), musicNote)

  // ---- Names --------------------------------------------------------------------------------
  const names: string[] = d.parent.names.length ? d.parent.names.slice(0, MAX_PARENT_NAMES) : ['']
  const nameList = h('div', { class: 'pp-names stack stack--sm' })
  const nameError = formError()
  let fields: TextField[] = []
  const addName = button(c.names.add, {
    variant: 'secondary',
    icon: 'plus',
    onClick: () => {
      if (names.length >= MAX_PARENT_NAMES) return
      names.push('')
      renderNames()
      fields[fields.length - 1]?.input.focus()
    },
  })
  function renderNames(): void {
    clear(nameList)
    fields = names.map((value, i) => {
      const field = textField({
        label: c.names.field(i + 1),
        value,
        maxLength: MAX_NAME_LENGTH,
        autocapitalize: 'words',
        enterKeyHint: i < names.length - 1 ? 'next' : 'done',
        name: `grownup-${i + 1}`,
        onInput: (v) => {
          names[i] = v
          nameError.clear()
        },
        onEnter: () => {
          const next = fields[i + 1]
          if (next) next.input.focus()
          else field.input.blur()
        },
      })
      const remove =
        names.length > 1
          ? iconButton(
              'close',
              c.names.remove(i + 1),
              () => {
                names.splice(i, 1)
                renderNames()
              },
              { variant: 'ghost', class: 'pp-names__remove' },
            )
          : null
      nameList.appendChild(h('div', { class: 'pp-names__row' }, field, remove))
      return field
    })
    addName.hidden = names.length >= MAX_PARENT_NAMES
  }
  renderNames()
  const saveNames = button(c.names.save, {
    icon: 'check',
    onClick: () => {
      const clean = names.map((n) => n.trim().replace(/\s+/g, ' ')).filter(Boolean)
      if (!clean.length) {
        nameError.show(c.names.needOne)
        fields[0]?.input.focus()
        return
      }
      update((draft) => {
        draft.parent.names = clean.slice(0, MAX_PARENT_NAMES)
      })
      names.splice(0, names.length, ...clean)
      renderNames()
      toast(c.names.saved, { icon: 'check', tone: 'leaf' })
    },
  })
  const namesPanel = panel(
    { title: c.names.title, icon: 'grownups', tone: 'coral', lead: c.names.hint },
    nameList,
    nameError,
    h('div', { class: 'pp-actions' }, addName, saveNames),
  )

  // ---- Test mode ----------------------------------------------------------------------------
  const test = toggleSwitch({
    label: c.test.label,
    hint: c.test.hint,
    checked: d.testMode,
    onChange: (on) => {
      setTestMode(on)
      toast(on ? c.test.on : c.test.off, { icon: on ? 'info' : 'check', tone: on ? 'plum' : 'leaf' })
    },
  })
  test.classList.add('pp-test-switch')
  const testPanel = panel(
    { title: c.test.title, icon: 'flag', tone: 'plum', class: 'pp-test' },
    test,
    para(c.test.lead),
    h('ul', { class: 'pp-bullets' }, ...c.test.unlocks.map((u) => h('li', null, icon('check', 22), h('span', null, u)))),
    para(c.test.records, 'pp-text--strong'),
    para(c.test.real),
    para(c.test.pill, 'pp__text--faint'),
  )

  // Keep the switches in step with the save (the corner speaker button, test mode turned off at home).
  const paintFromSave = () => {
    const s = save()
    master.setChecked(!s.settings.muted)
    music.setChecked(s.settings.music)
    test.setChecked(s.testMode)
    musicNote.hidden = !s.settings.muted || !s.settings.music
    soundPanel.classList.toggle('is-muted', s.settings.muted)
  }
  paintFromSave()
  const unsubscribe = store().subscribe(paintFromSave)

  root.appendChild(
    parentLayout(ctx, {
      title: c.title,
      class: 'parent--settings',
      body: [timePanel, soundPanel, namesPanel, testPanel],
    }),
  )

  return () => {
    unsubscribe()
    if (savedTimer) clearTimeout(savedTimer)
  }
}
