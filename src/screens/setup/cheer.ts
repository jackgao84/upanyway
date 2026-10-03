/** First run, kid step 6: one line about who cheers her on, then "Let's climb!" → Pitch 1. */
import { goatAvatar, markWordSeen, releaseCanvas, requestPersistenceOnce, save, update } from '../../app/context'
import type { Screen } from '../../app/router'
import { SETUP_COPY, joinNames } from '../../content/copy'
import { cheer } from '../../game/art/poses'
import { animateClimberPreview } from '../../game/art/preview'
import { scriptedLine } from '../../model/goatVoice'
import { button, screenLayout } from '../../ui/components'
import { h } from '../../ui/dom'
import { goatBubble } from '../../ui/goatBubble'
import { icon } from '../../ui/icons'
import { definition, isNewWord } from '../../ui/term'
import { kidDots } from './common'

export const cheerScreen: Screen = (root, ctx) => {
  const c = SETUP_COPY.cheer
  const d = save()
  const who = joinNames(d.parent.names) || c.nobody
  const bubble = goatBubble({ avatar: () => goatAvatar(d.profile.look), name: d.profile.goatName, tapToHide: false })
  const portrait = h('canvas', { class: 'setup-portrait', 'aria-hidden': 'true' })

  // The sentence ends with its full stop; the first time, "cairn" is explained in a caption under it
  // (not inline in heading type, where it read as one long run-on sentence).
  const newWord = isNewWord('cairn', d.glossarySeen)
  const line = h(
    'p',
    { class: 'ask__q cheer__line' },
    `${who} `,
    ...splitAround(c.line, 'cairn', () => h('span', { class: 'term' }, 'cairn')),
    '.',
  )
  const meaning = newWord
    ? h('p', { class: 'term__def cheer__def', role: 'note' }, h('span', { class: 'sr-only' }, 'cairn means: '), definition('cairn') ?? '')
    : null
  if (newWord) queueMicrotask(() => markWordSeen('cairn'))

  const go = () => {
    update((draft) => {
      draft.setup.complete = true
    })
    // Inside the tap, so browsers that want a gesture for persist() get one.
    requestPersistenceOnce()
    ctx.navigate('/climb/p01', { replace: true })
  }

  root.appendChild(
    screenLayout({
      class: 'setup setup--cheer',
      top: kidDots('cheer'),
      narrow: true,
      body: [
        h(
          'div',
          { class: 'ask cheer' },
          h('div', { class: 'cheer__art', 'aria-hidden': 'true' }, portrait, h('span', { class: 'cheer__cairn' }, icon('cairn', 88), icon('heart', 36))),
          line,
          meaning,
          h('div', { class: 'cheer__goat' }, bubble.el),
        ),
      ],
      footer: [button(c.go, { onClick: go, size: 'big', icon: 'mountain' })],
    }),
  )
  const stop = animateClimberPreview(portrait, d.profile.look, {
    expression: 'happy',
    pose: cheer,
    goat: { mood: 'happy', t: 0, inBackpack: true },
  })
  const goatSays = scriptedLine('cheer')
  const timer = setTimeout(() => bubble.say(goatSays.text, { mood: goatSays.mood, durationMs: 0 }), 900)
  return () => {
    clearTimeout(timer)
    stop()
    releaseCanvas(portrait)
    bubble.destroy()
  }
}

/** Split `text` around the first `word`, putting `make()` in its place. */
function splitAround(text: string, word: string, make: () => Node): (string | Node)[] {
  const i = text.indexOf(word)
  if (i < 0) return [text]
  return [text.slice(0, i), make(), text.slice(i + word.length)]
}
