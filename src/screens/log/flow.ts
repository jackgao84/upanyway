/**
 * Logging a real brave thing (#/log), one question per screen, big buttons, under a minute:
 *
 *   1 what (type, or 1b Pick an idea) → 2 forecast → 3 worry (optional) → 4 when
 *     "I'll do it later"  → a plan (addBraveThing) → toast → #/plans (the goat greets it there)
 *     "I already did it!" → 5a really → 5b what happened (required) → 5c how it went → 5d what I learned
 *                           (optional) → completeBraveThing → #/cairn?new=<id> (the stacking animation)
 *
 * #/log/did/:id runs 5a–5d for a plan ("I did it!" on Plans).
 *
 * The steps live inside one screen (one history entry): the in-screen Back goes to the previous step
 * and keeps every answer; finishing replaces the entry, so Back from Plans or the cairn goes where she
 * came from, never into a finished flow. Nothing is saved before step 4, so leaving early leaves no
 * trace. Rewards never read the numbers: one stone, whatever the forecast, "really" or outcome.
 */
import { animate, fitBox, goatAvatar, now, releaseCanvas, save, sizeCanvas, update } from '../../app/context'
import type { ScreenContext, Unmount } from '../../app/router'
import { audio } from '../../audio/audio'
import { sfx } from '../../audio/sfx'
import type { BadgeId } from '../../content/badges'
import { HAPPENED_CHIPS } from '../../content/happenedChips'
import type { Idea } from '../../content/ideas'
import { LEARN_CHIPS } from '../../content/learnChips'
import { drawPackWithGoat } from '../../game/art/climber'
import type { GoatMood as ArtGoatMood } from '../../game/art/goat'
import { evaluateBadges } from '../../model/badges'
import { goatVoice } from '../../model/goatVoice'
import { visibleIdeas } from '../../model/ideas'
import { addBraveThing, completeBraveThing } from '../../model/stones'
import type { BraveOutcome } from '../../storage/schema'
import {
  button,
  card,
  chips,
  progressDots,
  screenLayout,
  setDisabled,
  textField,
  toast,
  type Chips,
  type TextField,
} from '../../ui/components'
import { Disposer, h, type Child } from '../../ui/dom'
import { fearScale } from '../../ui/fearScale'
import { goatBubble } from '../../ui/goatBubble'
import { icon } from '../../ui/icons'
import { LOG_COPY } from './copy'
import { SAVED_TOAST_MS, holdBadgesForCairn, notePlanSaved } from './events'
import { ideasView } from './ideasView'
import { OUTCOMES, ticket } from './ticket'

type Step = 'what' | 'ideas' | 'forecast' | 'worry' | 'when' | 'really' | 'happened' | 'outcome' | 'learned'

const BEFORE: readonly Step[] = ['what', 'forecast', 'worry', 'when']
const AFTER: readonly Step[] = ['really', 'happened', 'outcome', 'learned']

/** Text limits (one line each; long enough for a sentence). */
const MAX_WHAT = 100
const MAX_WORRY = 100
const MAX_HAPPENED = 140
const MAX_LEARNED = 140

/** A beat after a one-tap answer so she sees her pick light up before the next question. */
const ADVANCE_MS = 260

/**
 * The goat riding along in the backpack at the foot of the short questions (tall screens only: on
 * shorter ones the question needs the room). Its face follows the step, never her numbers: curious
 * about the brave thing, a bit nervous while she forecasts (the fear comes along), proud once she
 * did it. The busy steps (ideas, what I learned) leave it out.
 */
const PEEK_MOODS: Partial<Record<Step, ArtGoatMood>> = {
  what: 'curious',
  forecast: 'nervous',
  worry: 'peek',
  when: 'curious',
  really: 'proud',
  happened: 'peek',
  outcome: 'happy',
}
/** The backpack (origin: the ground under it) and the goat's ears above the rim. */
const PEEK_BOX = { minX: -17, minY: -47, maxX: 17, maxY: 2 }

interface Draft {
  text: string
  ideaId?: string
  oops: boolean
  forecast: number | null
  worry: string
  really: number | null
  happened: string
  outcome: BraveOutcome | null
  learned: string
}

export type FlowMode = { kind: 'new' } | { kind: 'plan'; id: string }

const clean = (s: string): string => s.trim().replace(/\s+/g, ' ')

/** The chip that matches what's in the field (as setSelected's list). */
const chipFor = (items: readonly string[], value: string): string[] => {
  const v = clean(value)
  return items.includes(v) ? [v] : []
}

export function runLogFlow(root: HTMLElement, ctx: ScreenContext, mode: FlowMode): Unmount | void {
  let draft: Draft
  if (mode.kind === 'plan') {
    const plan = save().brave.find((b) => b.id === mode.id)
    if (!plan || plan.status !== 'planned') {
      ctx.navigate('/plans', { replace: true })
      return
    }
    draft = {
      text: plan.text,
      ideaId: plan.ideaId,
      oops: plan.oops,
      forecast: plan.forecast,
      worry: plan.worry ?? '',
      really: null,
      happened: '',
      outcome: null,
      learned: '',
    }
  } else {
    draft = { text: '', oops: false, forecast: null, worry: '', really: null, happened: '', outcome: null, learned: '' }
  }

  let step: Step = mode.kind === 'plan' ? 'really' : 'what'
  /** She chose "I already did it!" (the dots grow to show the after part). */
  let did = mode.kind === 'plan'
  let finished = false
  let stepDisposer = new Disposer()
  let advanceTimer: ReturnType<typeof setTimeout> | null = null

  const leave = () => ctx.back(mode.kind === 'plan' ? '/plans' : '/camp')

  // The goat at the foot of the page: one canvas for the whole flow (moved into each step's page,
  // hidden on the steps without it, so its animation loop keeps going).
  const look = save().profile.look
  const peekCanvas = h('canvas', { class: 'log-peek__canvas' })
  const peek = h('div', { class: 'log-peek', 'aria-hidden': 'true' }, peekCanvas)
  let peekMood: ArtGoatMood = 'curious'
  let peekAt = -10
  let peekT = 0
  const peekLoop = animate(
    peekCanvas,
    (t) => {
      peekT = t
      const size = sizeCanvas(peekCanvas)
      const g = peekCanvas.getContext('2d')
      if (!size || !g) return
      fitBox(g, size, PEEK_BOX, 0.02)
      // A little hop when the step changes or she answers.
      const hop = Math.max(0, Math.min(1, (t - peekAt) * 2.6))
      g.translate(0, -Math.sin(hop * Math.PI) * 3.2)
      drawPackWithGoat(g, look, { mood: peekMood, t, inBackpack: true })
    },
    { fps: 30 },
  )
  const hopPeek = () => {
    peekAt = peekT
    peekLoop.redraw()
  }

  function previous(s: Step): Step | null {
    switch (s) {
      case 'what':
        return null
      case 'ideas':
      case 'forecast':
        return 'what'
      case 'worry':
        return 'forecast'
      case 'when':
        return 'worry'
      case 'really':
        return mode.kind === 'plan' ? null : 'when'
      case 'happened':
        return 'really'
      case 'outcome':
        return 'happened'
      case 'learned':
        return 'outcome'
    }
  }

  function goBack(): void {
    const p = previous(step)
    if (p) go(p)
    else leave()
  }

  function dots(): HTMLElement {
    const path: readonly Step[] = mode.kind === 'plan' ? AFTER : did ? [...BEFORE, ...AFTER] : BEFORE
    const at = path.indexOf(step === 'ideas' ? 'what' : step)
    return progressDots(path.length, Math.max(0, at))
  }

  function go(next: Step): void {
    if (finished) return
    if (advanceTimer) clearTimeout(advanceTimer)
    advanceTimer = null
    step = next
    render()
  }

  /** Move on after a one-tap answer (once, even if she taps twice). */
  function advance(next: Step): void {
    if (advanceTimer) return
    hopPeek()
    advanceTimer = setTimeout(() => {
      advanceTimer = null
      go(next)
    }, ADVANCE_MS)
  }

  function brief(): HTMLElement {
    return ticket({
      text: draft.text,
      oops: draft.oops,
      forecast: step === 'forecast' ? null : draft.forecast,
      really: step === 'happened' || step === 'outcome' || step === 'learned' ? draft.really : null,
    })
  }

  function question(text: string, hint?: string): Child[] {
    return [
      h('h1', { class: 'ask__q log__q', tabindex: '-1' }, text),
      hint ? h('p', { class: 'ask__hint' }, hint) : null,
    ]
  }

  /** A one-line answer field with an optional Next button kept in step with it. */
  function answerField(opts: {
    label: string
    value: string
    placeholder: string
    maxLength: number
    onInput: (v: string) => void
    onEnter?: () => void
  }): TextField {
    return textField({
      label: opts.label,
      hideLabel: true,
      value: opts.value,
      placeholder: opts.placeholder,
      maxLength: opts.maxLength,
      enterKeyHint: opts.onEnter ? 'next' : 'done',
      onInput: opts.onInput,
      onEnter: opts.onEnter,
    })
  }

  /**
   * Suggestion chips for a one-line answer: a tap fills the field (and lights the chip up), tapping
   * it again empties it; typing something else turns the light off.
   */
  function quickChips(items: readonly string[], value: string, label: string, set: (v: string) => void): Chips {
    const group = chips([...items], (item, _i, on) => set(on ? item : ''), { selected: chipFor(items, value)[0] ?? null, ariaLabel: label })
    group.classList.add('log-chips')
    return group
  }

  function layout(body: Child[], footer?: Child[], extraClass = ''): HTMLElement {
    return screenLayout({
      class: `log log--${step}${extraClass ? ' ' + extraClass : ''}`,
      tone: 'coral',
      narrow: step !== 'ideas',
      back: goBack,
      backLabel: previous(step) ? LOG_COPY.back : mode.kind === 'plan' ? LOG_COPY.toPlans : LOG_COPY.toCamp,
      title: step === 'ideas' ? LOG_COPY.ideas.title : undefined,
      top: step === 'ideas' ? undefined : dots(),
      body: [h('div', { class: 'log-step' }, ...body, peek)],
      footer: footer as HTMLElement[] | undefined,
    })
  }

  // ---------------------------------------------------------------------------------------------
  // Steps

  function whatStep(): HTMLElement {
    const c = LOG_COPY.what
    const next = button(LOG_COPY.next, { size: 'big', iconEnd: 'next', onClick: () => submit() })
    const sync = () => setDisabled(next, !clean(draft.text))
    const submit = () => {
      draft.text = clean(draft.text)
      if (!draft.text) return
      field.input.blur()
      go('forecast')
    }
    const field = answerField({
      label: c.label,
      value: draft.text,
      placeholder: c.placeholder,
      maxLength: MAX_WHAT,
      onInput: (v) => {
        draft.text = v
        // An emptied field is a new thing: it no longer comes from the idea card.
        if (!v.trim()) {
          draft.ideaId = undefined
          draft.oops = false
        }
        sync()
      },
      onEnter: () => submit(),
    })
    field.classList.add('log-field')
    sync()
    const pick = button(c.pick, { variant: 'secondary', size: 'big', icon: 'idea', onClick: () => go('ideas'), class: 'log-pick' })
    return layout([h('div', { class: 'ask log-ask' }, ...question(c.q), field, pick)], [next])
  }

  function ideasStep(): HTMLElement {
    const onPick = (idea: Idea) => {
      if (advanceTimer) return
      draft.text = idea.text
      draft.ideaId = idea.id
      draft.oops = idea.oops
      advance('forecast')
    }
    return layout(ideasView({ ideas: visibleIdeas(save()), selectedId: draft.ideaId, onPick, scroller: root }))
  }

  function weatherStep(q: string, label: string, value: number | null, onPick: (n: number) => void, next: Step): HTMLElement {
    const scale = fearScale({ value, label, onPick: (n) => onPick(n) })
    scale.classList.add('log-fear')
    // Coming back to a question she has answered: Next keeps the answer (a tap changes it).
    const footer = value === null ? undefined : [button(LOG_COPY.next, { size: 'big', iconEnd: 'next', onClick: () => go(next) })]
    return layout([brief(), h('div', { class: 'ask log-ask' }, ...question(q, LOG_COPY.tapWeather), scale)], footer)
  }

  function worryStep(): HTMLElement {
    const c = LOG_COPY.worry
    const next = button(LOG_COPY.next, { size: 'big', iconEnd: 'next', onClick: () => submit() })
    const skip = button(LOG_COPY.skip, { variant: 'secondary', size: 'big', onClick: () => {
      draft.worry = ''
      go('when')
    } })
    const sync = () => setDisabled(next, !clean(draft.worry))
    const submit = () => {
      draft.worry = clean(draft.worry)
      if (!draft.worry) return
      field.input.blur()
      go('when')
    }
    const field = answerField({
      label: c.label,
      value: draft.worry,
      placeholder: c.placeholder,
      maxLength: MAX_WORRY,
      onInput: (v) => {
        draft.worry = v
        sync()
      },
      onEnter: () => submit(),
    })
    sync()
    return layout([brief(), h('div', { class: 'ask log-ask' }, ...question(c.q, c.hint), field)], [skip, next])
  }

  function whenStep(): HTMLElement {
    const c = LOG_COPY.when
    const later = card({
      title: c.later,
      text: c.laterHint,
      icon: icon('plans', 40),
      tone: 'sky',
      class: 'log-choice',
      onClick: () => saveForLater(),
    })
    const done = card({
      title: c.did,
      text: c.didHint,
      icon: icon('check', 40),
      tone: 'leaf',
      class: 'log-choice',
      onClick: () => {
        did = true
        go('really')
      },
    })
    return layout([brief(), h('div', { class: 'ask log-ask' }, ...question(c.q), h('div', { class: 'log-choices log-choices--two' }, later, done))])
  }

  function happenedStep(): HTMLElement {
    const c = LOG_COPY.happened
    const next = button(LOG_COPY.next, { size: 'big', iconEnd: 'next', onClick: () => submit() })
    const sync = () => setDisabled(next, !clean(draft.happened))
    const submit = () => {
      draft.happened = clean(draft.happened)
      if (!draft.happened) return
      field.input.blur()
      go('outcome')
    }
    const field = answerField({
      label: c.label,
      value: draft.happened,
      placeholder: c.placeholder,
      maxLength: MAX_HAPPENED,
      onInput: (v) => {
        draft.happened = v
        quick.setSelected(chipFor(HAPPENED_CHIPS, v))
        sync()
      },
      onEnter: () => submit(),
    })
    const quick = quickChips(HAPPENED_CHIPS, draft.happened, c.hint, (v) => {
      draft.happened = v
      field.setValue(v)
      sync()
    })
    sync()
    return layout([brief(), h('div', { class: 'ask log-ask' }, ...question(c.q, c.hint), field, quick)], [next])
  }

  function outcomeStep(): HTMLElement {
    const choices = OUTCOMES.map((o) =>
      card({
        title: o.label,
        icon: o.art(),
        tone: o.tone,
        class: 'log-choice log-choice--outcome',
        selected: draft.outcome === o.id ? true : undefined,
        onClick: () => {
          if (advanceTimer) return
          draft.outcome = o.id
          advance('learned')
        },
      }),
    )
    return layout([brief(), h('div', { class: 'ask log-ask' }, ...question(LOG_COPY.outcome.q), h('div', { class: 'log-choices log-choices--three' }, ...choices))])
  }

  function learnedStep(): HTMLElement {
    const c = LOG_COPY.learned
    const flopped = draft.outcome === 'flopped'
    // Optional: one button either way. An empty answer just leaves it out.
    const addStone = button(c.done, { size: 'big', icon: 'stone', onClick: () => finish() })
    const field = answerField({
      label: c.label,
      value: draft.learned,
      placeholder: c.placeholder,
      maxLength: MAX_LEARNED,
      onInput: (v) => {
        draft.learned = v
        quick.setSelected(chipFor(LEARN_CHIPS, v))
      },
      onEnter: () => {
        field.input.blur()
        finish()
      },
    })
    const quick = quickChips(LEARN_CHIPS, draft.learned, c.hint, (v) => {
      draft.learned = v
      field.setValue(v)
    })

    let goat: HTMLElement | null = null
    if (flopped) {
      // Respect, never a joke: the goat's flop line, and where her flop will hang.
      const bubble = goatBubble({ avatar: () => goatAvatar(look), name: save().profile.goatName, tapToHide: false })
      stepDisposer.add(() => bubble.destroy())
      const line = goatVoice().pick('flopLogged')
      const timer = setTimeout(() => bubble.say(line.text, { mood: line.mood, durationMs: 0 }), 300)
      stepDisposer.add(() => clearTimeout(timer))
      goat = h(
        'div',
        { class: 'log-flop' },
        bubble.el,
        h('p', { class: 'callout log-flop__note', dataset: { tone: 'plum' } }, icon('flops', 30), h('span', null, c.flop)),
      )
    }
    return layout([brief(), goat, h('div', { class: 'ask log-ask' }, ...question(c.q, c.hint), field, quick)], [addStone])
  }

  // ---------------------------------------------------------------------------------------------
  // Saving

  function saveForLater(): void {
    if (finished || draft.forecast === null) return
    finished = true
    let id = ''
    update((dd) => {
      id = addBraveThing(
        dd,
        { text: draft.text, forecast: draft.forecast ?? 0, ideaId: draft.ideaId, oops: draft.oops, worry: draft.worry },
        now(),
      ).id
    })
    notePlanSaved(id)
    if (audio.isRunning()) sfx.bleat('happy')
    toast(LOG_COPY.saved, { icon: 'plans', tone: 'sky', durationMs: SAVED_TOAST_MS })
    ctx.navigate('/plans', { replace: true })
  }

  function finish(): void {
    if (finished || draft.really === null || !draft.outcome || !clean(draft.happened)) return
    finished = true
    let id = mode.kind === 'plan' ? mode.id : ''
    let badges: BadgeId[] = []
    /** Older waiting stones that went on first (they hop onto the cairn before the new one drops). */
    let before: string[] = []
    const t = now()
    update((dd) => {
      if (mode.kind === 'new') {
        id = addBraveThing(
          dd,
          { text: draft.text, forecast: draft.forecast ?? 0, ideaId: draft.ideaId, oops: draft.oops, worry: draft.worry },
          t,
        ).id
      }
      before = completeBraveThing(
        dd,
        id,
        { really: draft.really ?? 0, whatHappened: clean(draft.happened), outcome: draft.outcome ?? 'wobbly', learned: clean(draft.learned) },
        t,
      ).waitingPlaced
      badges = evaluateBadges(dd, t)
    })
    // The stone first: the badges wait until it has landed on the cairn.
    holdBadgesForCairn(badges)
    ctx.navigate(`/cairn?new=${[...before, id].map(encodeURIComponent).join(',')}`, { replace: true })
  }

  // ---------------------------------------------------------------------------------------------

  function build(): HTMLElement {
    switch (step) {
      case 'what':
        return whatStep()
      case 'ideas':
        return ideasStep()
      case 'forecast':
        return weatherStep(LOG_COPY.forecast.q, LOG_COPY.forecast.label, draft.forecast, (n) => {
          draft.forecast = n
          advance('worry')
        }, 'worry')
      case 'worry':
        return worryStep()
      case 'when':
        return whenStep()
      case 'really':
        return weatherStep(LOG_COPY.really.q, LOG_COPY.really.label, draft.really, (n) => {
          draft.really = n
          advance('happened')
        }, 'happened')
      case 'happened':
        return happenedStep()
      case 'outcome':
        return outcomeStep()
      case 'learned':
        return learnedStep()
    }
  }

  function render(): void {
    stepDisposer.dispose()
    stepDisposer = new Disposer()
    const active = document.activeElement
    if (active instanceof HTMLElement && root.contains(active)) active.blur()
    while (root.firstChild) root.removeChild(root.firstChild)
    const mood = PEEK_MOODS[step]
    peek.hidden = !mood
    if (mood && mood !== peekMood) {
      peekMood = mood
      hopPeek()
    }
    root.appendChild(build())
    root.scrollTop = 0
    const q = root.querySelector<HTMLElement>('.log__q, h1.layout__title')
    if (q) {
      q.setAttribute('tabindex', '-1')
      try {
        q.focus({ preventScroll: true })
      } catch {
        // Old WebKit without focus options: focusing would scroll, and the page is already at the top.
      }
    }
  }

  render()

  return () => {
    finished = true
    if (advanceTimer) clearTimeout(advanceTimer)
    stepDisposer.dispose()
    peekLoop.stop()
    releaseCanvas(peekCanvas)
  }
}
