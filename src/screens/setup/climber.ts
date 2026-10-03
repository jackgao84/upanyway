/**
 * First run, kid step 1: design your climber. A big animated preview, six category tabs with big
 * option and colour buttons, "Surprise me", and one big "Looks like me!" (sets setup.lookDone).
 * Starts from a random look, or from hers once she has saved one.
 */
import { fitBox, releaseCanvas, save, update, type Box } from '../../app/context'
import type { Screen } from '../../app/router'
import { SETUP_COPY } from '../../content/copy'
import {
  BACKPACKS,
  BACKPACK_COLORS,
  HAIR_COLORS,
  HAIR_STYLES,
  HELMETS,
  HELMET_COLORS,
  OUTFITS,
  OUTFIT_COLORS,
  SKIN_TONES,
  normalizeLook,
  randomLook,
  type Swatch,
  type WardrobeOption,
} from '../../content/wardrobe'
import { climberBounds, drawClimber, drawPackWithGoat, type Expression } from '../../game/art/climber'
import { stand } from '../../game/art/poses'
import { animateClimberPreview, renderClimberPreview } from '../../game/art/preview'
import { RIG, solvePose } from '../../game/art/rig'
import { TUNING } from '../../game/tuning'
import type { ClimberLook } from '../../storage/schema'
import { button, pressable, screenLayout } from '../../ui/components'
import { clear, h, prefersReducedMotion } from '../../ui/dom'
import { kidDots } from './common'

type Cat = 'hair' | 'hairColor' | 'skin' | 'outfit' | 'helmet' | 'backpack'
type Crop = 'head' | 'body' | 'pack'
type StyleKey = 'hairStyle' | 'outfit' | 'helmet' | 'backpack'
type ColourKey = 'hairColor' | 'skinTone' | 'outfitColor' | 'helmetColor' | 'backpackColor'

interface PanelSpec {
  options?: { list: readonly WardrobeOption[]; key: StyleKey; crop: Crop; colourKey?: ColourKey }
  swatches?: { list: readonly Swatch[]; key: ColourKey; title?: string }
}

const TABS: Cat[] = ['hair', 'hairColor', 'skin', 'outfit', 'helmet', 'backpack']

const PANELS: Record<Cat, PanelSpec> = {
  hair: { options: { list: HAIR_STYLES, key: 'hairStyle', crop: 'head' } },
  hairColor: { swatches: { list: HAIR_COLORS, key: 'hairColor' } },
  skin: { swatches: { list: SKIN_TONES, key: 'skinTone' } },
  outfit: {
    options: { list: OUTFITS, key: 'outfit', crop: 'body', colourKey: 'outfitColor' },
    swatches: { list: OUTFIT_COLORS, key: 'outfitColor', title: 'Outfit' },
  },
  helmet: {
    options: { list: HELMETS, key: 'helmet', crop: 'head', colourKey: 'helmetColor' },
    swatches: { list: HELMET_COLORS, key: 'helmetColor', title: 'Helmet' },
  },
  backpack: {
    options: { list: BACKPACKS, key: 'backpack', crop: 'pack', colourKey: 'backpackColor' },
    swatches: { list: BACKPACK_COLORS, key: 'backpackColor', title: 'Backpack' },
  },
}

const OPTION_PX = 76

let crops: Record<Crop, Box> | null = null

/** Crop boxes for the option previews: her head (hair, helmets), all of her (outfits), the pack. */
function cropBoxes(): Record<Crop, Box> {
  if (crops) return crops
  const p = stand()
  const sk = solvePose(p)
  const r = RIG.headR
  const body = climberBounds(p, 1, false)
  crops = {
    head: { minX: sk.head.x - r - 12, maxX: sk.head.x + r + 6, minY: sk.head.y - r - 8, maxY: sk.head.y + r + 6 },
    body: { minX: body.minX, maxX: body.maxX, minY: sk.neck.y - 6, maxY: body.maxY },
    pack: { minX: -13, minY: -24, maxX: 13, maxY: 2 },
  }
  return crops
}

function paintOption(canvas: HTMLCanvasElement, look: ClimberLook, crop: Crop): void {
  const dpr = Math.min(TUNING.maxDpr, Math.max(1, window.devicePixelRatio || 1))
  const px = Math.round(OPTION_PX * dpr)
  if (canvas.width !== px) canvas.width = px
  if (canvas.height !== px) canvas.height = px
  const g = canvas.getContext('2d')
  if (!g) return
  fitBox(g, { w: OPTION_PX, h: OPTION_PX, dpr }, cropBoxes()[crop], crop === 'body' ? 0.05 : 0.02)
  if (crop === 'pack') drawPackWithGoat(g, look, null)
  else drawClimber(g, { look, pose: stand(), expression: 'happy', facing: 1, t: 0.4, goat: null })
}

export const climberScreen: Screen = (root, ctx) => {
  const c = SETUP_COPY.climber
  const d = save()
  // One live object: the animated preview reads it every frame, so edits show at once.
  const look: ClimberLook = d.setup.lookDone ? normalizeLook({ ...d.profile.look }) : randomLook()
  const colourChosen: Partial<Record<ColourKey, boolean>> = {}
  let tab: Cat = 'hair'
  let lastT = 0
  let changedAt = -10

  const stageCanvas = h('canvas', { class: 'designer__canvas', role: 'img', 'aria-label': 'Your climber' })
  const expression = (t: number): Expression => {
    lastT = t
    return t - changedAt < 0.9 ? 'proud' : 'happy'
  }

  const tabButtons = TABS.map((cat) => {
    const b = h(
      'button',
      { type: 'button', class: 'designer__tab', role: 'tab', id: `tab-${cat}`, 'aria-controls': 'designer-panel' },
      c.tabs[cat],
    )
    pressable(b)
    b.addEventListener('click', () => {
      if (tab === cat) return
      tab = cat
      buildPanel()
    })
    b.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
      if (!d) return
      e.preventDefault()
      const next = tabButtons[(TABS.indexOf(cat) + d + TABS.length) % TABS.length]
      next.focus()
      next.click()
    })
    return b
  })
  const panel = h('div', { class: 'designer__panel', role: 'tabpanel', id: 'designer-panel' })

  let repaint: () => void = () => undefined
  // The option pictures of the open tab: released whenever the panel is rebuilt or the screen goes.
  let optionCanvases: HTMLCanvasElement[] = []
  const releaseOptions = () => {
    optionCanvases.forEach(releaseCanvas)
    optionCanvases = []
  }

  function changed(): void {
    changedAt = lastT
    if (prefersReducedMotion()) renderClimberPreview(stageCanvas, look, { expression: 'proud', goat: null, padding: 0.08 })
    repaint()
  }

  function buildPanel(): void {
    tabButtons.forEach((b, i) => {
      const on = TABS[i] === tab
      b.setAttribute('aria-selected', String(on))
      b.classList.toggle('is-selected', on)
      b.tabIndex = on ? 0 : -1
    })
    panel.setAttribute('aria-labelledby', `tab-${tab}`)
    releaseOptions()
    clear(panel)
    const spec = PANELS[tab]
    const painters: (() => void)[] = []

    if (spec.options) {
      const o = spec.options
      const grid = h('div', { class: 'designer__options' })
      for (const option of o.list) {
        const canvas = h('canvas', { class: 'designer__opt-art', 'aria-hidden': 'true' })
        optionCanvases.push(canvas)
        const b = h(
          'button',
          { type: 'button', class: 'designer__opt', 'aria-label': option.name },
          canvas,
          h('span', { class: 'designer__opt-name' }, option.name),
        )
        pressable(b)
        b.addEventListener('click', () => {
          if (look[o.key] === option.id) return
          look[o.key] = option.id
          if (o.colourKey && !colourChosen[o.colourKey]) look[o.colourKey] = option.defaultColor
          changed()
        })
        painters.push(() => {
          const on = look[o.key] === option.id
          b.setAttribute('aria-pressed', String(on))
          b.classList.toggle('is-selected', on)
          paintOption(canvas, { ...look, [o.key]: option.id }, o.crop)
        })
        grid.appendChild(b)
      }
      panel.appendChild(grid)
    }

    if (spec.swatches) {
      const s = spec.swatches
      if (s.title) panel.appendChild(h('h3', { class: 'designer__sub' }, c.colourOf(s.title)))
      const row = h('div', { class: 'designer__swatches', role: 'group', 'aria-label': s.title ? c.colourOf(s.title) : c.tabs[tab] })
      for (const sw of s.list) {
        const b = h('button', {
          type: 'button',
          class: 'designer__swatch',
          'aria-label': sw.name,
          style: `--swatch: ${sw.color}`,
        })
        pressable(b)
        b.addEventListener('click', () => {
          colourChosen[s.key] = true
          if (look[s.key] === sw.color) return
          look[s.key] = sw.color
          changed()
        })
        painters.push(() => {
          const on = look[s.key].toLowerCase() === sw.color.toLowerCase()
          b.setAttribute('aria-pressed', String(on))
          b.classList.toggle('is-selected', on)
        })
        row.appendChild(b)
      }
      panel.appendChild(row)
    }

    repaint = () => painters.forEach((p) => p())
    repaint()
  }

  const surprise = button(c.surprise, {
    variant: 'secondary',
    icon: 'idea',
    class: 'designer__surprise',
    onClick: () => {
      Object.assign(look, randomLook())
      changed()
    },
  })

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
      body: [
        h(
          'div',
          { class: 'designer' },
          h('div', { class: 'designer__stage scene' }, stageCanvas, surprise),
          h(
            'div',
            { class: 'designer__controls' },
            h('p', { class: 'muted center small designer__hint' }, c.hint),
            h('div', { class: 'designer__tabs', role: 'tablist', 'aria-label': c.title }, ...tabButtons),
            panel,
          ),
        ),
      ],
      footer: [button(c.done, { onClick: done, size: 'big', iconEnd: 'next' })],
    }),
  )
  buildPanel()

  const stop = animateClimberPreview(stageCanvas, look, { expression, goat: null, padding: 0.08 })
  return () => {
    stop()
    releaseCanvas(stageCanvas)
    releaseOptions()
  }
}
