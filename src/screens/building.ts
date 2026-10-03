/** The stand-in for a part of the app a later stage builds: a friendly card and a way back to camp. */
import type { Screen } from '../app/router'
import { BUILDING_COPY } from '../content/copy'
import { button, emptyState, screenLayout } from '../ui/components'

export const buildingScreen: Screen = (root, ctx) => {
  const toCamp = () => ctx.navigate('/camp')
  root.appendChild(
    screenLayout({
      back: toCamp,
      backLabel: BUILDING_COPY.back,
      narrow: true,
      body: [
        emptyState({
          icon: 'mountain',
          title: BUILDING_COPY.title,
          text: BUILDING_COPY.text,
          action: button(BUILDING_COPY.back, { onClick: toCamp, icon: 'tent', size: 'big' }),
        }),
      ],
    }),
  )
}
