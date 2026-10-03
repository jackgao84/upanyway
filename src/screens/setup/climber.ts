/**
 * First run, kid step 1: design your climber. The shared designer (screens/designer.ts): a big
 * animated preview, six category tabs with big option and colour buttons, "Surprise me", and one
 * big "Looks like me!" (sets setup.lookDone). Starts from a random look, or from hers once she has
 * saved one. The goat hasn't been met yet, so the backpack is still (suspiciously) quiet.
 */
import { save, update } from '../../app/context'
import type { Screen } from '../../app/router'
import { SETUP_COPY } from '../../content/copy'
import { normalizeLook, randomLook } from '../../content/wardrobe'
import type { ClimberLook } from '../../storage/schema'
import { button, screenLayout } from '../../ui/components'
import { designer } from '../designer'
import { kidDots } from './common'

export const climberScreen: Screen = (root, ctx) => {
  const c = SETUP_COPY.climber
  const d = save()
  // One live object: the animated preview reads it every frame, so edits show at once.
  const look: ClimberLook = d.setup.lookDone ? normalizeLook({ ...d.profile.look }) : randomLook()

  const design = designer({ look, goat: 'none', hint: c.hint, label: c.title })

  const done = () => {
    update((draft) => {
      draft.profile.look = { ...look, gear: draft.profile.look.gear.slice() }
      draft.setup.lookDone = true
    })
    ctx.navigate('/setup/goat')
  }

  root.appendChild(
    screenLayout({
      class: 'setup setup--climber',
      title: c.title,
      top: kidDots('climber'),
      body: [design.el],
      footer: [button(c.done, { onClick: done, size: 'big', iconEnd: 'next' })],
    }),
  )

  return () => design.destroy()
}
