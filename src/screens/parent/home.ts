/**
 * The grown-ups' home (#/parent/home) and the dispatcher for every #/parent/<page> route.
 *
 * Home: a big card for each page, a note while test mode is on (with a one-tap "turn it off"), and
 * "Back to camp", which locks the grown-ups' pages again (the route guard locks on any non-parent
 * path). Leaving with test mode still on asks first, so a child isn't handed a game that records
 * nothing.
 */
import { save } from '../../app/context'
import type { Screen, ScreenContext } from '../../app/router'
import { unopenedLetters } from '../../model/stones'
import { button, card, modal, toast, type Tone } from '../../ui/components'
import { h } from '../../ui/dom'
import type { IconName } from '../../ui/icons'
import { icon } from '../../ui/icons'
import { parentCheerScreen } from './cheer'
import { PARENT_COPY } from './copy'
import { dataScreen } from './data'
import { grownupFlopScreen } from './grownupFlop'
import { ideasScreen } from './ideas'
import { letterScreen } from './letter'
import { PARENT_PAGES, parentLayout, parentPath, setTestMode, type ParentPage } from './parts'
import { pinScreen } from './pin'
import { readCairnScreen } from './readCairn'
import { settingsScreen } from './settings'

const c = PARENT_COPY.home

type Sub = Exclude<ParentPage, 'home'>

interface CardSpec {
  page: Sub
  icon: IconName
  tone: Tone
}

/** Cheering her on first; the grown-up housekeeping (settings, backups, PIN) after. */
const CHEER_CARDS: CardSpec[] = [
  { page: 'cheer', icon: 'heart', tone: 'coral' },
  { page: 'cairn', icon: 'cairn', tone: 'leaf' },
  { page: 'letter', icon: 'letter', tone: 'sun' },
  { page: 'flop', icon: 'flops', tone: 'plum' },
  { page: 'ideas', icon: 'idea', tone: 'summit' },
]
const KEEP_CARDS: CardSpec[] = [
  { page: 'settings', icon: 'settings', tone: 'sky' },
  { page: 'data', icon: 'download', tone: 'ridge' },
  { page: 'pin', icon: 'grownups', tone: 'paper' },
]

export const homeScreen: Screen = (root, ctx) => {
  const d = save()
  const waiting = unopenedLetters(d).length

  const leave = () => {
    if (!save().testMode) {
      ctx.back('/camp')
      return
    }
    modal({
      title: c.testLeave.title,
      body: h('p', null, c.testLeave.body),
      art: 'info',
      dismissible: true,
      actions: [
        { label: c.testLeave.keep, variant: 'secondary', onClick: () => ctx.back('/camp') },
        {
          label: c.testLeave.off,
          onClick: () => {
            setTestMode(false)
            toast(PARENT_COPY.settings.test.off, { icon: 'check', tone: 'leaf' })
            ctx.back('/camp')
          },
        },
      ],
    })
  }

  const testNote = h(
    'div',
    { class: 'callout pp-test-note', dataset: { tone: 'plum' } },
    icon('info', 32),
    h(
      'div',
      { class: 'pp-test-note__text' },
      h('strong', { class: 'pp-test-note__title' }, c.testOn.title),
      h('span', null, c.testOn.text),
      button(c.testOn.off, {
        variant: 'secondary',
        icon: 'close',
        onClick: () => {
          setTestMode(false)
          testNote.hidden = true
          toast(PARENT_COPY.settings.test.off, { icon: 'check', tone: 'leaf' })
        },
      }),
    ),
  )
  testNote.hidden = !d.testMode

  const group = (title: string, specs: CardSpec[], cls: string) =>
    h(
      'section',
      { class: 'pp-home__group' },
      h('h2', { class: 'pp-section-title pp-home__group-title' }, title),
      h(
        'nav',
        { class: 'pp-home__cards ' + cls, 'aria-label': title },
        ...specs.map(({ page, icon: name, tone }) => {
          const words = c.pages[page]
          const extra = page === 'letter' && waiting ? c.lettersWaiting(waiting) : null
          return card({
            title: words.title,
            text: words.text,
            body: extra ? h('span', { class: 'pp-home__extra' }, icon('letter', 18), extra) : undefined,
            icon: name,
            tone,
            class: 'pp-home__card' + (page === 'cheer' ? ' pp-home__card--cheer' : ''),
            onClick: () => ctx.navigate(parentPath(page)),
          })
        }),
      ),
    )
  const cards = [group(c.groups.cheer, CHEER_CARDS, 'pp-home__cards--cheer'), group(c.groups.keep, KEEP_CARDS, 'pp-home__cards--keep')]

  root.appendChild(
    parentLayout(ctx, {
      title: c.title,
      class: 'parent--home',
      back: leave,
      backLabel: c.backToCamp,
      body: [h('p', { class: 'pp-page-lead' }, c.lead), testNote, ...cards],
      footer: [
        button(c.backToCamp, { icon: 'tent', size: 'big', variant: 'secondary', onClick: leave }),
        h('p', { class: 'pp-home__lock' }, c.lockNote),
      ],
    }),
  )
}

const SCREENS: Record<ParentPage, Screen> = {
  home: homeScreen,
  cheer: parentCheerScreen,
  cairn: readCairnScreen,
  letter: letterScreen,
  flop: grownupFlopScreen,
  ideas: ideasScreen,
  settings: settingsScreen,
  data: dataScreen,
  pin: pinScreen,
}

function isPage(p: string): p is ParentPage {
  return (PARENT_PAGES as readonly string[]).includes(p)
}

/** #/parent/:page — the router guard has already checked the PIN for this visit. */
export const parentScreen: Screen = (root, ctx: ScreenContext) => {
  const page = ctx.params.page ?? ''
  if (!isPage(page)) {
    ctx.navigate(parentPath('home'), { replace: true })
    return
  }
  return SCREENS[page](root, ctx)
}
