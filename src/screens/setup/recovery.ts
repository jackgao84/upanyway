/**
 * First run, grown-up step 2 (right after the PIN is confirmed): the recovery code, shown once for a
 * grown-up to write down. Its hash is saved only on "I've written it down"; a reload before that opens
 * this screen again with a NEW code, so an old one is never shown twice (Decision 87).
 */
import { update } from '../../app/context'
import type { Screen } from '../../app/router'
import { RECOVERY_COPY } from '../../content/copy'
import { makeRecoveryRecord, newRecoveryCode } from '../../model/recovery'
import { screenLayout } from '../../ui/components'
import { recoveryShow } from '../parent/recoveryCode'
import { parentDots } from './common'

export const recoveryScreen: Screen = (root, ctx) => {
  const code = newRecoveryCode()
  const show = recoveryShow({
    code,
    heading: 'h1',
    lead: RECOVERY_COPY.forWhat,
    onDone: () => {
      const record = makeRecoveryRecord(code)
      update((d) => {
        d.parent.recoveryHash = record.recoveryHash
        d.parent.recoverySalt = record.recoverySalt
      })
      // Replace: going back from the names never lands on a code that is no longer shown.
      ctx.navigate('/setup/names', { replace: true })
    },
  })
  root.appendChild(
    screenLayout({
      class: 'setup setup--recovery',
      top: parentDots(1),
      narrow: true,
      body: [show.el],
      footer: show.actions,
    }),
  )
}
