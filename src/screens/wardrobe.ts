/**
 * The Wardrobe (#/wardrobe): the same climber designer as the first run (screens/designer.ts) —
 * hair, hair colour, skin, outfit, helmet, backpack — with a live animated preview: the goat
 * peeking out of the backpack, or standing beside her once it has climbed out at Sky Lake.
 * Every change saves at once ("Surprise me" can be undone).
 *
 * After the summit (or in test mode) a seventh tab, Treasures, holds the gear her stones have
 * unlocked: tap to wear, tap again to take off (look.gear), one thing per place on her. Locked
 * gear is never shown; the tab carries one gentle line: "New treasures arrive with every stone you
 * add." Before the summit there is no Treasures tab at all.
 */
import { now, save, update } from '../app/context'
import type { Screen } from '../app/router'
import { normalizeLook } from '../content/wardrobe'
import { pruneGear } from '../game/art/gear'
import { dayKey } from '../model/clock'
import { stoneOrder } from '../model/stones'
import { isGoatOut } from '../model/unlocks'
import { unlockedGear } from '../model/unlockables'
import type { ClimberLook, SaveData } from '../storage/schema'
import { screenLayout } from '../ui/components'
import { designer, type TreasureItem } from './designer'

export const WARDROBE_COPY = {
  title: 'Wardrobe',
  hint: 'Change anything you like. It saves straight away.',
  tabs: 'Wardrobe',
  back: 'Back to camp',
} as const

/** The Treasures tab's items (null = no tab: before the summit, outside test mode). */
export function treasureItems(d: SaveData, at: Date): TreasureItem[] | null {
  if (!d.summit.reached && !d.testMode) return null
  const today = dayKey(at)
  const dayOf = new Map(stoneOrder(d).map((s) => [s.id, s.day]))
  // Test mode shows every item; anything her own stones have unlocked (colour variants too) stays.
  const items = d.testMode ? [...unlockedGear(d), ...unlockedGear({ ...d, testMode: false })] : unlockedGear(d)
  const seen = new Set<string>()
  const out: TreasureItem[] = []
  for (const g of items) {
    if (seen.has(g.id)) continue
    seen.add(g.id)
    out.push({ id: g.id, name: g.name, description: g.description, isNew: g.stoneId !== null && dayOf.get(g.stoneId) === today })
  }
  return out
}

export const wardrobeScreen: Screen = (root, ctx) => {
  const c = WARDROBE_COPY
  const d = save()
  const treasures = treasureItems(d, now())
  const look: ClimberLook = normalizeLook({ ...d.profile.look, gear: d.profile.look.gear.slice() })

  // Gear she can't see in Treasures any more (tried on in test mode) comes off.
  const wearable = pruneGear(look.gear, new Set((treasures ?? []).map((t) => t.id)))
  if (wearable.length !== look.gear.length || wearable.some((id, i) => id !== look.gear[i])) {
    look.gear = wearable
    update((draft) => {
      draft.profile.look.gear = wearable.slice()
    })
  }

  const design = designer({
    look,
    goat: isGoatOut(d) ? 'beside' : 'pack',
    keepColours: true,
    treasures,
    undo: true,
    hint: c.hint,
    label: c.tabs,
    onChange: (l) => {
      update((draft) => {
        draft.profile.look = { ...l, gear: l.gear.slice() }
      })
    },
  })

  root.appendChild(
    screenLayout({
      class: 'wardrobe',
      title: c.title,
      back: () => ctx.back('/camp'),
      backLabel: c.back,
      body: [design.el],
    }),
  )

  return () => design.destroy()
}
