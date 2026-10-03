/**
 * The climber designer, shared by the first run (setup/climber.ts) and the Wardrobe (#/wardrobe).
 *
 * A big animated preview of her (the goat in the backpack, or beside her once it has climbed out at
 * Sky Lake), six tabs — hair, hair colour, skin, outfit, helmet, backpack — with big option and
 * colour buttons, "Surprise me", and in the Wardrobe a seventh tab, Treasures: the gear she has
 * unlocked after the summit, each one tried on in a little picture, tap to wear or take off.
 *
 * The designer edits `opts.look` in place and calls `onChange` after every change; the screen
 * decides when to save (the first run on "Looks like me!", the Wardrobe at once).
 */
import './designer.css'
import { animate, fitBox, releaseCanvas, sizeCanvas, type Box } from '../app/context'
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
  randomLook,
  type Swatch,
  type WardrobeOption,
} from '../content/wardrobe'
import { climberBounds, drawClimber, drawPackWithGoat, type Expression } from '../game/art/climber'
import { GEAR_SLOTS, gearSlot, parseGearId, wearGear, type GearSlot } from '../game/art/gear'
import { drawGoat, goatBounds, type GoatMood } from '../game/art/goat'
import { idle, stand } from '../game/art/poses'
import { RIG, solvePose } from '../game/art/rig'
import { TUNING } from '../game/tuning'
import type { ClimberLook } from '../storage/schema'
import { button, pressable } from '../ui/components'
import { clear, h, prefersReducedMotion } from '../ui/dom'
import { icon } from '../ui/icons'

export type DesignerTab = 'hair' | 'hairColor' | 'skin' | 'outfit' | 'helmet' | 'backpack' | 'treasures'

/** Where the goat is in the big preview. */
export type GoatSpot = 'none' | 'pack' | 'beside'

export type DesignerChange = 'style' | 'colour' | 'surprise' | 'undo' | 'gear'

export interface TreasureItem {
  /** The unlockable id worn in look.gear ("gear-scarf", "gear-scarf~sky-blue"). */
  id: string
  name: string
  description: string
  /** Unlocked by a stone placed today: a small "New" ribbon. */
  isNew: boolean
}

export interface DesignerOpts {
  /** The look being edited: changed in place. */
  look: ClimberLook
  goat: GoatSpot
  /**
   * Keep her colours when she switches a style (the Wardrobe: she chose them already). The first
   * run's random look instead takes each new style's own colour until she picks a colour herself.
   */
  keepColours?: boolean
  /** The Treasures tab (the Wardrobe after the summit, or in test mode). Null = no tab. */
  treasures?: TreasureItem[] | null
  /** Offer "Undo" after Surprise me (the Wardrobe saves at once, so a surprise must be undoable). */
  undo?: boolean
  /** A short line above the tabs. */
  hint?: string
  /** The tablist's accessible name. */
  label: string
  onChange?: (look: ClimberLook, what: DesignerChange) => void
}

export interface Designer {
  el: HTMLElement
  destroy(): void
}

export const DESIGNER_COPY = {
  tabs: {
    hair: 'Hair',
    hairColor: 'Hair colour',
    skin: 'Skin',
    outfit: 'Outfit',
    helmet: 'Helmet',
    backpack: 'Backpack',
    treasures: 'Treasures',
  } satisfies Record<DesignerTab, string>,
  colourOf: (thing: string) => `${thing} colour`,
  surprise: 'Surprise me',
  undo: 'Undo',
  undoLabel: 'Undo the surprise',
  preview: 'Your climber',
  treasures: {
    note: 'New treasures arrive with every stone you add.',
    emptyTitle: 'Treasures come with stones',
    tryHint: 'Tap a treasure to try it on. Tap again to take it off.',
    newTag: 'New',
    tookOff: (name: string) => `${name}: back in the backpack.`,
    slots: {
      head: 'On your helmet',
      face: 'On your face',
      neck: 'Round your neck',
      back: 'On your back',
      hands: 'On your hands',
      feet: 'On your feet',
    } satisfies Record<GearSlot, string>,
  },
} as const

type BaseTab = Exclude<DesignerTab, 'treasures'>
type Crop = 'head' | 'body' | 'pack'
type StyleKey = 'hairStyle' | 'outfit' | 'helmet' | 'backpack'
type ColourKey = 'hairColor' | 'skinTone' | 'outfitColor' | 'helmetColor' | 'backpackColor'

interface PanelSpec {
  options?: { list: readonly WardrobeOption[]; key: StyleKey; crop: Crop; colourKey?: ColourKey }
  swatches?: { list: readonly Swatch[]; key: ColourKey; title?: string }
}

const BASE_TABS: BaseTab[] = ['hair', 'hairColor', 'skin', 'outfit', 'helmet', 'backpack']

const PANELS: Record<BaseTab, PanelSpec> = {
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

// ---------------------------------------------------------------------------------------------
// Option and try-on pictures

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

let gearBoxes: Record<GearSlot, Box> | null = null
let hipBox: Box | null = null

/** A crop of her standing, framed on where each slot's gear sits (climber frame, y down). */
export function gearCrop(slot: GearSlot): Box {
  if (!gearBoxes) {
    const p = stand()
    const sk = solvePose(p)
    const r = RIG.headR
    const body = climberBounds(p, 1, false)
    const hx = sk.head.x
    const hy = sk.head.y
    const w = sk.wristR
    const feetX = (sk.ankleL.x + sk.ankleR.x) / 2
    const ankleY = Math.min(sk.ankleL.y, sk.ankleR.y)
    // The chalk bag hangs at her back hip (it's "hands" gear: chalk is for grippy hands).
    hipBox = { minX: sk.hip.x - 15, maxX: sk.hip.x + 7, minY: sk.hip.y - 12, maxY: sk.hip.y + 9 }
    gearBoxes = {
      head: { minX: hx - r - 8, maxX: hx + r + 6, minY: hy - r - 10, maxY: hy + r + 2 },
      face: { minX: hx - r - 1, maxX: hx + r + 2, minY: hy - r * 0.75, maxY: hy + r * 1.05 },
      neck: { minX: hx - r - 6, maxX: hx + r + 4, minY: hy - r + 1, maxY: sk.hip.y - 2 },
      // Her back and the pack, head to hips: capes, rope coils, the pack's flag, the sleeping roll.
      back: { minX: body.minX - 4, maxX: hx + r * 0.6, minY: hy - r - 6, maxY: sk.hip.y + 9 },
      hands: { minX: w.x - 8.5, maxX: w.x + 8.5, minY: w.y - 11, maxY: w.y + 5 },
      feet: { minX: feetX - 10, maxX: feetX + 10, minY: ankleY - 10, maxY: body.maxY + 1.5 },
    }
  }
  return gearBoxes[slot]
}

/** The crop for one item's try-on picture: its slot's, except for gear worn away from its slot. */
function tryOnCrop(id: string, slot: GearSlot): Box {
  const box = gearCrop(slot)
  return parseGearId(id)?.baseId === 'gear-chalk-bag' && hipBox ? hipBox : box
}

function sizedSquare(canvas: HTMLCanvasElement): { g: CanvasRenderingContext2D; dpr: number } | null {
  const dpr = Math.min(TUNING.maxDpr, Math.max(1, window.devicePixelRatio || 1))
  const px = Math.round(OPTION_PX * dpr)
  if (canvas.width !== px) canvas.width = px
  if (canvas.height !== px) canvas.height = px
  const g = canvas.getContext('2d')
  return g ? { g, dpr } : null
}

function paintOption(canvas: HTMLCanvasElement, look: ClimberLook, crop: Crop): void {
  const s = sizedSquare(canvas)
  if (!s) return
  fitBox(s.g, { w: OPTION_PX, h: OPTION_PX, dpr: s.dpr }, cropBoxes()[crop], crop === 'body' ? 0.05 : 0.02)
  if (crop === 'pack') drawPackWithGoat(s.g, look, null)
  else drawClimber(s.g, { look, pose: stand(), expression: 'happy', facing: 1, t: 0.4, goat: null })
}

/** Her wearing just this one item (plus her look), framed on its slot. */
export function paintTryOn(canvas: HTMLCanvasElement, look: ClimberLook, id: string): void {
  const slot = gearSlot(id)
  const s = sizedSquare(canvas)
  if (!s || !slot) return
  fitBox(s.g, { w: OPTION_PX, h: OPTION_PX, dpr: s.dpr }, tryOnCrop(id, slot), 0.03)
  const tryLook: ClimberLook = { ...look, gear: wearGear(look.gear, id, true) }
  drawClimber(s.g, { look: tryLook, pose: stand(), expression: 'happy', facing: 1, t: 0.4, goat: null })
}

// ---------------------------------------------------------------------------------------------
// The big preview

/** The goat stands this far in front of her (climber units), facing her. */
const GOAT_BESIDE_X = 27

function union(a: Box, b: Box): Box {
  return { minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY), maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY) }
}

function stageBox(goat: GoatSpot): Box {
  let box = climberBounds(idle(0), 1, goat === 'pack')
  for (let t = 0.1; t <= 3; t += 0.1) box = union(box, climberBounds(idle(t), 1, goat === 'pack'))
  if (goat === 'beside') {
    // Only once it has climbed out at Sky Lake (the Wardrobe passes 'beside' when isGoatOut).
    const g = goatBounds({ inBackpack: goat !== 'beside', facing: -1 })
    box = union(box, { minX: GOAT_BESIDE_X + g.minX, maxX: GOAT_BESIDE_X + g.maxX, minY: g.minY, maxY: g.maxY })
  }
  // A little floor under them.
  return { ...box, maxY: box.maxY + 2 }
}

interface Stage {
  /** Something changed: a proud face and a happy goat for a moment. */
  bump(): void
  stop(): void
}

function startStage(canvas: HTMLCanvasElement, look: ClimberLook, goat: GoatSpot): Stage {
  const box = stageBox(goat)
  let changedAt = -10
  let lastT = 0
  const goatMood = (t: number): GoatMood => {
    if (t - changedAt < 1.4) return 'happy'
    const cycle: GoatMood[] = goat === 'beside' ? ['happy', 'curious', 'happy', 'proud'] : ['peek', 'curious', 'peek', 'happy']
    return cycle[Math.floor(t / 4) % cycle.length]
  }
  const loop = animate(
    canvas,
    (t) => {
      lastT = t
      const size = sizeCanvas(canvas)
      const g = canvas.getContext('2d')
      if (!size || !g) return
      fitBox(g, size, box, 0.07)
      // Soft shadow on the ground.
      g.fillStyle = 'rgba(110, 62, 34, 0.12)'
      g.beginPath()
      g.ellipse(goat === 'beside' ? GOAT_BESIDE_X / 2 : 0, 0.4, goat === 'beside' ? 30 : 15, 2, 0, 0, Math.PI * 2)
      g.fill()
      const expression: Expression = t - changedAt < 0.9 ? 'proud' : 'happy'
      const mood = goatMood(t)
      drawClimber(g, {
        look,
        pose: idle(t),
        expression,
        facing: 1,
        t,
        goat: goat === 'pack' ? { mood, t, inBackpack: true } : null,
      })
      if (goat === 'beside') {
        g.save()
        g.translate(GOAT_BESIDE_X, 0)
        drawGoat(g, { mood, t, inBackpack: goat !== 'beside', facing: -1, earFlap: t - changedAt < 0.6 ? 0.4 : 0 })
        g.restore()
      }
    },
    { fps: 40 },
  )
  return {
    bump() {
      changedAt = lastT
      if (prefersReducedMotion()) loop.redraw()
    },
    stop() {
      loop.stop()
      releaseCanvas(canvas)
    },
  }
}

// ---------------------------------------------------------------------------------------------

export function designer(opts: DesignerOpts): Designer {
  const c = DESIGNER_COPY
  const look = opts.look
  const tabs: DesignerTab[] = opts.treasures ? [...BASE_TABS, 'treasures'] : [...BASE_TABS]
  const colourChosen: Partial<Record<ColourKey, boolean>> = {}
  if (opts.keepColours) for (const k of ['hairColor', 'skinTone', 'outfitColor', 'helmetColor', 'backpackColor'] as ColourKey[]) colourChosen[k] = true
  let tab: DesignerTab = 'hair'
  let beforeSurprise: ClimberLook | null = null

  const stageCanvas = h('canvas', { class: 'designer__canvas', role: 'img', 'aria-label': c.preview })
  let stage: Stage | null = null

  const tabButtons = tabs.map((cat) => {
    const b = h(
      'button',
      {
        type: 'button',
        class: 'designer__tab' + (cat === 'treasures' ? ' designer__tab--treasures' : ''),
        role: 'tab',
        id: `tab-${cat}`,
        'aria-controls': 'designer-panel',
      },
      cat === 'treasures' ? h('span', { class: 'designer__tab-star', 'aria-hidden': 'true' }, '★') : null,
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
      const next = tabButtons[(tabs.indexOf(cat) + d + tabs.length) % tabs.length]
      next.focus()
      next.click()
    })
    return b
  })
  const panel = h('div', { class: 'designer__panel', role: 'tabpanel', id: 'designer-panel' })

  let repaint: () => void = () => undefined
  // The option pictures of the open tab: released whenever the panel is rebuilt or the designer goes.
  let optionCanvases: HTMLCanvasElement[] = []
  const releaseOptions = () => {
    optionCanvases.forEach(releaseCanvas)
    optionCanvases = []
  }

  const undoButton = button(c.undo, {
    variant: 'secondary',
    icon: 'undo',
    class: 'designer__undo',
    ariaLabel: c.undoLabel,
    onClick: () => {
      if (!beforeSurprise) return
      Object.assign(look, beforeSurprise)
      beforeSurprise = null
      changed('undo')
    },
  })
  undoButton.hidden = true

  function changed(what: DesignerChange): void {
    if (what !== 'surprise') beforeSurprise = null
    undoButton.hidden = !beforeSurprise
    stage?.bump()
    repaint()
    opts.onChange?.(look, what)
  }

  function buildBasePanel(cat: BaseTab, painters: (() => void)[]): void {
    const spec = PANELS[cat]
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
          changed('style')
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
      const row = h('div', { class: 'designer__swatches', role: 'group', 'aria-label': s.title ? c.colourOf(s.title) : c.tabs[cat] })
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
          changed('colour')
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
  }

  function buildTreasures(items: TreasureItem[], painters: (() => void)[]): void {
    const t = c.treasures
    panel.classList.add('designer__panel--treasures')
    panel.appendChild(
      h('p', { class: 'treasures__note' }, h('span', { class: 'treasures__note-icon', 'aria-hidden': 'true' }, icon('stone', 24)), t.note),
    )
    if (!items.length) {
      panel.appendChild(
        h(
          'div',
          { class: 'treasures__empty' },
          h('span', { class: 'treasures__empty-art', 'aria-hidden': 'true' }, icon('cairn', 52)),
          h('p', { class: 'treasures__empty-title' }, t.emptyTitle),
        ),
      )
      return
    }
    const caption = h('p', { class: 'treasures__caption', role: 'status', 'aria-live': 'polite' }, t.tryHint)
    panel.appendChild(caption)
    for (const slot of GEAR_SLOTS) {
      const here = items.filter((i) => gearSlot(i.id) === slot)
      if (!here.length) continue
      panel.appendChild(h('h3', { class: 'designer__sub treasures__slot' }, t.slots[slot]))
      const grid = h('div', { class: 'designer__options treasures__grid' })
      for (const item of here) {
        const canvas = h('canvas', { class: 'designer__opt-art', 'aria-hidden': 'true' })
        optionCanvases.push(canvas)
        const b = h(
          'button',
          { type: 'button', class: 'designer__opt treasure', 'aria-label': `${item.name}. ${item.description}`, dataset: { gear: item.id } },
          canvas,
          h('span', { class: 'designer__opt-name' }, item.name),
          item.isNew ? h('span', { class: 'treasure__new', 'aria-hidden': 'true' }, t.newTag) : null,
          h('span', { class: 'treasure__check', 'aria-hidden': 'true' }, icon('check', 18)),
        )
        pressable(b)
        b.addEventListener('click', () => {
          const on = !look.gear.includes(item.id)
          look.gear = wearGear(look.gear, item.id, on)
          caption.textContent = on ? `${item.name}: ${item.description}` : t.tookOff(item.name)
          changed('gear')
        })
        painters.push(() => {
          const on = look.gear.includes(item.id)
          b.setAttribute('aria-pressed', String(on))
          b.classList.toggle('is-selected', on)
          paintTryOn(canvas, look, item.id)
        })
        grid.appendChild(b)
      }
      panel.appendChild(grid)
    }
  }

  function buildPanel(): void {
    tabButtons.forEach((b, i) => {
      const on = tabs[i] === tab
      b.setAttribute('aria-selected', String(on))
      b.classList.toggle('is-selected', on)
      b.tabIndex = on ? 0 : -1
    })
    panel.setAttribute('aria-labelledby', `tab-${tab}`)
    panel.classList.remove('designer__panel--treasures')
    releaseOptions()
    clear(panel)
    const painters: (() => void)[] = []
    if (tab === 'treasures') buildTreasures(opts.treasures ?? [], painters)
    else buildBasePanel(tab, painters)
    repaint = () => painters.forEach((p) => p())
    repaint()
  }

  const surprise = button(c.surprise, {
    variant: 'secondary',
    icon: 'idea',
    class: 'designer__surprise',
    onClick: () => {
      const before: ClimberLook = { ...look, gear: look.gear.slice() }
      // A surprise changes how she looks, never what treasures she's wearing.
      Object.assign(look, randomLook(), { gear: look.gear.slice() })
      if (opts.undo) beforeSurprise = before
      changed('surprise')
    },
  })

  const el = h(
    'div',
    { class: 'designer' + (opts.treasures ? ' designer--seven' : '') },
    h(
      'div',
      { class: 'designer__stage scene' },
      stageCanvas,
      h('div', { class: 'designer__stage-buttons' }, opts.undo ? undoButton : null, surprise),
    ),
    h(
      'div',
      { class: 'designer__controls' },
      opts.hint ? h('p', { class: 'muted center small designer__hint' }, opts.hint) : null,
      h('div', { class: 'designer__tabs', role: 'tablist', 'aria-label': opts.label }, ...tabButtons),
      panel,
    ),
  )
  buildPanel()
  stage = startStage(stageCanvas, look, opts.goat)

  return {
    el,
    destroy() {
      stage?.stop()
      stage = null
      releaseOptions()
    },
  }
}
