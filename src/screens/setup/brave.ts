/** First run, kid step 5: one screen on brave vs dangerous. */
import { goatAvatar, releaseCanvas, save, update } from '../../app/context'
import type { Screen } from '../../app/router'
import { SETUP_COPY } from '../../content/copy'
import { idle, wobble } from '../../game/art/poses'
import { animateClimberPreview } from '../../game/art/preview'
import { scriptedLine } from '../../model/goatVoice'
import { button, screenLayout } from '../../ui/components'
import { h } from '../../ui/dom'
import { goatBubble } from '../../ui/goatBubble'
import { icon } from '../../ui/icons'
import { kidDots } from './common'

export const braveScreen: Screen = (root, ctx) => {
  const c = SETUP_COPY.brave
  const d = save()
  const bubble = goatBubble({ avatar: () => goatAvatar(d.profile.look), name: d.profile.goatName, tapToHide: false })
  const portrait = h('canvas', { class: 'setup-portrait', 'aria-hidden': 'true' })

  const done = () => {
    update((draft) => {
      draft.flags.braveVsDangerousSeen = true
    })
    ctx.navigate('/setup/cheer')
  }

  root.appendChild(
    screenLayout({
      class: 'setup setup--brave',
      top: kidDots('brave'),
      narrow: true,
      body: [
        h(
          'div',
          { class: 'ask brave' },
          h('div', { class: 'brave__art', 'aria-hidden': 'true' }, portrait),
          h('h1', { class: 'ask__q brave__q' }, c.title),
          h('div', { class: 'callout callout--care brave__care' }, icon('heart', 34), h('p', { class: 'brave__care-text' }, c.care)),
          h('div', { class: 'brave__goat' }, bubble.el),
        ),
      ],
      footer: [button(c.done, { onClick: done, size: 'big', iconEnd: 'next' })],
    }),
  )
  // Knees knocking a little, the goat peeking out nervously: scared, and safe.
  const stop = animateClimberPreview(portrait, d.profile.look, {
    expression: 'scared-but-going',
    pose: (t) => wobble(t, idle(t), 0.4),
    goat: { mood: 'nervous', t: 0, inBackpack: true },
  })
  const goatSays = scriptedLine('brave')
  const timer = setTimeout(() => bubble.say(goatSays.text, { mood: goatSays.mood, durationMs: 0 }), 600)
  return () => {
    clearTimeout(timer)
    stop()
    releaseCanvas(portrait)
    bubble.destroy()
  }
}
