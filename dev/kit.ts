/**
 * Dev-only visual lab: mounts every UI-kit component on one page for review.
 * Served by `npm run dev` at /upanyway/dev/kit.html (not part of the build).
 * Query: ?show=modal|sheet|confirm|toast|bubble|pin-error|testmode opens that state on load.
 */
import { audio } from '../src/audio/audio'
import { mountShell } from '../src/app/shell'
import {
  button,
  card,
  chip,
  chips,
  confirm,
  emptyState,
  iconButton,
  modal,
  progressDots,
  screenLayout,
  segmented,
  sheet,
  stepper,
  textField,
  tile,
  toast,
  toggleSwitch,
} from '../src/ui/components'
import { h } from '../src/ui/dom'
import { fearScale } from '../src/ui/fearScale'
import { goatBubble } from '../src/ui/goatBubble'
import { ICON_NAMES, icon, weatherIcon, weatherLabel } from '../src/ui/icons'
import { initKeyboardAvoidance } from '../src/ui/keyboard'
import { pinPad } from '../src/ui/pinPad'
import { firstMentionText, term } from '../src/ui/term'

initKeyboardAvoidance()
audio.init()

const params = new URLSearchParams(location.search)
const show = params.get('show') ?? ''

let muted = false
let testMode = show === 'testmode'
const subs = new Set<() => void>()
const notify = () => subs.forEach((fn) => fn())
const shell = mountShell(document.body, {
  getMuted: () => muted,
  setMuted: (m) => {
    muted = m
    audio.setMuted(m)
    notify()
  },
  isTestMode: () => testMode,
  subscribe: (cb) => {
    subs.add(cb)
    return () => subs.delete(cb)
  },
})

const section = (title: string, ...children: (Node | null)[]) =>
  h('section', { class: 'stack' }, h('h2', { class: 'section-title' }, title), ...children)

// Buttons
const buttons = section(
  'Buttons',
  h(
    'div',
    { class: 'row' },
    button('Climb', { onClick: () => toast('Off we go!'), icon: 'mountain', size: 'big' }),
    button('Log a brave thing', { onClick: () => undefined, variant: 'secondary', icon: 'stone', size: 'big' }),
  ),
  h(
    'div',
    { class: 'row' },
    button('Next', { onClick: () => undefined, iconEnd: 'next' }),
    button('Maybe later', { onClick: () => undefined, variant: 'secondary' }),
    button('Skip', { onClick: () => undefined, variant: 'ghost' }),
    button('Reset everything', { onClick: () => undefined, variant: 'danger', icon: 'trash' }),
    button('Not yet', { onClick: () => undefined, disabled: true }),
  ),
  h(
    'div',
    { class: 'row' },
    iconButton('back', 'Back', () => undefined),
    iconButton('plus', 'Add', () => undefined, { variant: 'primary' }),
    iconButton('pencil', 'Edit', () => undefined),
    iconButton('close', 'Close', () => undefined, { variant: 'ghost' }),
  ),
)

// Icons
const iconGrid = h('div', { class: 'kit-icons' })
for (const name of ICON_NAMES) {
  iconGrid.appendChild(h('div', { class: 'kit-icon' }, icon(name, 36), h('span', null, name)))
}

// Weather
const weatherRow = h('div', { class: 'kit-icons' })
for (let n = 0; n <= 10; n++) {
  weatherRow.appendChild(h('div', { class: 'kit-icon' }, weatherIcon(n, 48), h('span', null, `${n} ${weatherLabel(n)}`)))
}

// Fear scale
const fearOut = h('p', { class: 'muted center' }, 'Tap a tile.')
const fear = section(
  'Fear Forecast',
  h('p', { class: 'ask__q' }, 'How scary does it look?'),
  fearScale({ onPick: (n) => (fearOut.textContent = `Picked ${n}: ${weatherLabel(n)}`), value: 3 }),
  fearOut,
)

// PIN pad
let first = ''
const pad = pinPad({
  title: 'Choose a 4-digit grown-ups PIN',
  subtitle: 'You will need it to open grown-ups mode.',
  onComplete: (pin) => {
    if (!first) {
      first = pin
      pad.setTitle('Type it once more', 'Just to be sure.')
      pad.reset()
    } else if (pin === first) {
      toast('PIN saved', { icon: 'check', tone: 'leaf' })
      first = ''
      pad.setTitle('Choose a 4-digit grown-ups PIN', 'You will need it to open grown-ups mode.')
      pad.reset()
    } else {
      first = ''
      pad.setTitle('Choose a 4-digit grown-ups PIN', 'You will need it to open grown-ups mode.')
      pad.error("Those didn't match. Let's start again.")
    }
  },
})
if (show === 'pin-error') setTimeout(() => pad.error("That's not the PIN. Try again."), 300)

// Fields
const fields = section(
  'Text fields',
  textField({
    label: "What's the brave thing?",
    value: '',
    placeholder: 'Ask my teacher a question',
    maxLength: 80,
    onInput: () => undefined,
    onEnter: (v) => toast(`Saved: ${v || '(empty)'}`),
  }),
  textField({
    label: 'What did you learn?',
    value: 'It was over really fast.',
    multiline: true,
    hint: 'Optional',
    maxLength: 140,
    onInput: () => undefined,
  }),
)

// Chips
const chipRow = section(
  'Chips',
  chips(['It was fine', 'People were kind', 'I wobbled', 'Nobody noticed'], (item) => toast(item)),
  chips(['Hair', 'Outfit', 'Helmet', 'Backpack'], () => undefined, { selected: 'Outfit', ariaLabel: 'Part' }),
  h('div', { class: 'chips' }, chip('Odd socks', () => undefined, true), chip('Worst joke', () => undefined, false)),
)

// Controls
const controls = section(
  'Controls',
  h(
    'div',
    { class: 'row' },
    stepper({
      label: 'Minutes of climbing a day',
      value: 20,
      min: 0,
      max: 120,
      step: 5,
      format: (v) => (v === 0 ? 'No limit' : `${v} min`),
      onChange: () => undefined,
    }),
  ),
  segmented({
    ariaLabel: 'Time of day',
    options: [
      { value: 'day', label: 'Day', icon: 'sun' },
      { value: 'night', label: 'Night', icon: 'moon' },
    ],
    value: 'day',
    onChange: () => undefined,
  }),
  toggleSwitch({ label: 'Music', hint: 'Gentle background sounds', checked: true, onChange: () => undefined }),
  toggleSwitch({
    label: 'Test mode',
    hint: 'Opens everything. Nothing she does is saved.',
    checked: testMode,
    onChange: (on) => {
      testMode = on
      shell.setTestMode(on)
    },
  }),
  h('div', { class: 'row' }, progressDots(5, 0), progressDots(5, 2), progressDots(5, 4)),
)

// Cards + tiles
const cards = section(
  'Cards and tiles',
  h(
    'div',
    { class: 'tiles' },
    tile({ label: 'Climb', icon: 'map', onClick: () => undefined, tone: 'meadow', wide: true }),
    tile({ label: 'Cairn', icon: 'cairn', onClick: () => undefined, tone: 'sun' }),
    tile({ label: 'Plans', icon: 'plans', onClick: () => undefined, tone: 'sky' }),
    tile({ label: 'Letters', icon: 'letter', onClick: () => undefined, tone: 'coral', count: 2 }),
    tile({ label: 'Weather Station', icon: 'weather', onClick: () => undefined, tone: 'ridge' }),
    tile({ label: 'Hall of Flops', icon: 'flops', onClick: () => undefined, tone: 'plum' }),
    tile({ label: 'Wardrobe', icon: 'wardrobe', onClick: () => undefined, tone: 'leaf' }),
    tile({ label: 'Badges', icon: 'badge', onClick: () => undefined, tone: 'summit' }),
  ),
  card({ title: 'Ask the teacher a question', text: 'In class, out loud.', icon: 'idea', tone: 'sun', onClick: () => undefined }),
  card({ title: 'Odd socks for a day', text: 'An Oops Mission.', icon: 'oops', tone: 'plum', onClick: () => undefined, selected: true }),
  card({ title: 'Firefly Hollow', text: 'Holds and hanging.', icon: 'mountain', tone: 'hollow' }),
)

// Bits
const bits = section(
  'Notes, callouts, words',
  h(
    'div',
    { class: 'callout callout--care' },
    icon('heart', 28),
    h('span', null, 'Brave means safe but scary. If something could really hurt you or someone else, the brave move is to stop and tell a grown-up.'),
  ),
  h(
    'div',
    { class: 'note' },
    h('span', { class: 'note__from' }, 'Spotted!'),
    h('p', { class: 'note__text' }, 'I saw you order your own lunch today. You looked a bit wobbly and you did it anyway.'),
  ),
  h(
    'div',
    { class: 'compare' },
    h('div', { class: 'compare__item' }, weatherIcon(7, 56), h('span', { class: 'compare__label' }, 'Forecast'), '7'),
    h('span', { class: 'compare__arrow' }, icon('next', 28)),
    h('div', { class: 'compare__item' }, weatherIcon(2, 56), h('span', { class: 'compare__label' }, 'Really'), '2'),
  ),
  h(
    'p',
    { class: 'lead' },
    'Sent in 14 attempts. Every ',
    term('whipper', { seen: [], onSeen: () => undefined }),
    ' got you here. Your next ',
    term('pitch', { seen: ['pitch'], onSeen: () => undefined }),
    ' is waiting.',
  ),
  h('p', { class: 'muted' }, firstMentionText('beta', [])),
  h('div', { class: 'row' }, h('span', { class: 'pill', dataset: { tone: 'meadow' } }, 'Meadow Slopes'), h('span', { class: 'pill' }, 'Pitch 2')),
  emptyState({
    icon: 'weather',
    title: 'Nothing to chart yet',
    text: 'After three brave things, your forecasts and real weather show up here.',
  }),
)

// Goat bubble
const bubble = goatBubble({ name: 'Puff' })
const bubbleSection = section(
  'Goat bubble',
  bubble.el,
  h(
    'div',
    { class: 'row' },
    button('Calm', { variant: 'secondary', onClick: () => bubble.say('Huh. Looked way scarier from down there.') }),
    button('Scared', { variant: 'secondary', onClick: () => bubble.say("My legs are jelly. Let's go anyway?", { mood: 'scared' }) }),
    button('Giggly', { variant: 'secondary', onClick: () => bubble.say("WHEEE! Rope's got us. Now we know.", { mood: 'giggly' }) }),
  ),
)

// Overlays
const overlays = section(
  'Overlays',
  h(
    'div',
    { class: 'row' },
    button('Modal', { variant: 'secondary', onClick: () => openModal() }),
    button('Sheet', { variant: 'secondary', onClick: () => openSheet() }),
    button('Confirm', { variant: 'secondary', onClick: () => void openConfirm() }),
    button('Toast', { variant: 'secondary', onClick: () => openToasts() }),
  ),
)

function openModal() {
  modal({
    title: 'How scary was it really?',
    art: weatherIcon(6, 64),
    body: [h('p', null, 'You forecast a 6. Tap how it really felt.'), fearScale({ onPick: () => undefined })],
    actions: [{ label: 'Done', variant: 'primary' }],
  })
}
function openSheet() {
  sheet({
    title: 'Make it smaller',
    body: [
      card({ title: 'Do half of it', icon: 'smaller', tone: 'leaf', onClick: () => undefined }),
      card({ title: 'Do it with someone first', icon: 'grownups', tone: 'sky', onClick: () => undefined }),
      card({ title: 'Practise at home first', icon: 'tent', tone: 'sun', onClick: () => undefined }),
    ],
  })
}
async function openConfirm() {
  const yes = await confirm({
    title: 'Start over?',
    body: 'This clears her climber, cairn and letters on this iPad. A backup copy is kept.',
    yes: 'Yes, start over',
    no: 'No, keep everything',
    danger: true,
  })
  toast(yes ? 'Starting over' : 'Kept everything')
}
function openToasts() {
  toast('Spotted a hold on the way down!', { icon: 'eye', tone: 'sky' })
  toast('The Starfish', { title: 'New flop unlocked!', icon: 'flops', tone: 'plum' })
  toast(firstMentionText('whipper', []), { icon: 'book', tone: 'sun' })
}

const layout = screenLayout({
  title: 'UI kit',
  back: () => toast('Back'),
  top: progressDots(4, 1),
  body: [
    h('div', { class: 'ask' }, h('p', { class: 'ask__q' }, 'Every piece of the kit, on one page.'), h('p', { class: 'ask__hint' }, 'Tap things. Nothing here is saved.')),
    buttons,
    section('Icons', iconGrid),
    section('Weather 0 to 10', weatherRow),
    fear,
    section('PIN pad', pad.el),
    fields,
    chipRow,
    controls,
    cards,
    bits,
    bubbleSection,
    overlays,
  ],
  footer: [
    button('Back', { variant: 'secondary', size: 'big', onClick: () => undefined }),
    button('Next', { size: 'big', iconEnd: 'next', onClick: () => toast('Next!') }),
  ],
})

const style = h(
  'style',
  null,
  `.kit-icons{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:10px}
   .kit-icon{display:flex;flex-direction:column;align-items:center;gap:6px;padding:12px 6px;border-radius:16px;background:var(--card);box-shadow:var(--shadow-paper);color:var(--ink);font-size:12px;font-weight:700;text-align:center}
   .kit-icon:nth-child(4n+1){color:var(--coral)}.kit-icon:nth-child(4n+2){color:var(--sky-deep)}.kit-icon:nth-child(4n+3){color:var(--leaf-deep)}`,
)
document.head.appendChild(style)

/** Sample screens built only from the kit: ?layout=ask (one question) or ?layout=hub (tiles, no footer). */
function sampleLayout(kind: string): HTMLElement | null {
  if (kind === 'ask') {
    return screenLayout({
      back: () => undefined,
      top: progressDots(5, 0),
      narrow: true,
      body: [
        h(
          'div',
          { class: 'ask' },
          h('h2', { class: 'ask__q' }, "What's the brave thing?"),
          textField({ label: "What's the brave thing?", hideLabel: true, value: '', placeholder: 'Type it here', maxLength: 80, onInput: () => undefined }),
          h('div', { class: 'row row--center' }, button('Pick an idea', { variant: 'secondary', icon: 'idea', onClick: () => undefined })),
        ),
      ],
      footer: [button('Next', { size: 'big', iconEnd: 'next', onClick: () => undefined })],
    })
  }
  if (kind === 'hub') {
    const say = goatBubble()
    setTimeout(() => say.say('I can see Sky Lake from here. Sort of.', { mood: 'happy', durationMs: 0 }), 100)
    return screenLayout({
      title: 'Camp',
      tone: 'meadow',
      body: [
        say.el,
        h(
          'div',
          { class: 'tiles' },
          tile({ label: 'Climb', icon: 'map', onClick: () => undefined, tone: 'meadow', wide: true }),
          tile({ label: 'Log a brave thing', icon: 'stone', onClick: () => undefined, tone: 'coral', wide: true }),
          tile({ label: 'Cairn', icon: 'cairn', onClick: () => undefined, tone: 'sun' }),
          tile({ label: 'Plans', icon: 'plans', onClick: () => undefined, tone: 'sky' }),
          tile({ label: 'Letters', icon: 'letter', onClick: () => undefined, tone: 'coral', count: 1 }),
          tile({ label: 'Weather Station', icon: 'weather', onClick: () => undefined, tone: 'ridge' }),
          tile({ label: 'Hall of Flops', icon: 'flops', onClick: () => undefined, tone: 'plum' }),
          tile({ label: 'Wardrobe', icon: 'wardrobe', onClick: () => undefined, tone: 'leaf' }),
          tile({ label: 'Badges', icon: 'badge', onClick: () => undefined, tone: 'summit' }),
        ),
        h('div', { class: 'row row--center' }, button('Grown-ups', { variant: 'ghost', icon: 'grownups', onClick: () => undefined })),
      ],
    })
  }
  return null
}

const screen = h('main', { class: 'screen' }, sampleLayout(params.get('layout') ?? '') ?? layout)
document.getElementById('app')?.appendChild(screen)

setTimeout(() => {
  if (show === 'modal') openModal()
  if (show === 'sheet') openSheet()
  if (show === 'confirm') void openConfirm()
  if (show === 'toast') openToasts()
  if (show === 'bubble' || show === '') bubble.say("My legs are jelly. Let's go anyway?", { mood: 'scared', durationMs: 0 })
  const target = { 'pin-error': pad.el, fear, bubble: bubbleSection }[show]
  if (target) target.scrollIntoView({ block: 'center' })
}, 200)
