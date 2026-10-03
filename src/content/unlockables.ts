/**
 * Post-summit rewards: every new stone after the summit unlocks the next item here (camp decorations
 * and gear, interleaved so both keep coming). Past the end, model/unlockables.ts generates colour
 * variants of these, so there is always something new.
 */

export type GearSlot = 'head' | 'neck' | 'back' | 'hands' | 'feet' | 'face'

export interface Unlockable {
  id: string
  name: string
  kind: 'decoration' | 'gear'
  /** Where gear is worn (gear only). */
  slot?: GearSlot
  /** Kid-facing, at most 10 words. */
  description: string
  /** Already every colour of the rainbow: no colour variants are generated from it. */
  multicolour?: true
}

export const UNLOCKABLES: readonly Unlockable[] = [
  { id: 'deco-bunting', name: 'Bunting', kind: 'decoration', description: 'Little flags that flutter over the tent.', multicolour: true },
  { id: 'gear-star-stickers', name: 'Star stickers', kind: 'gear', slot: 'head', description: 'Shiny stars stuck all over your helmet.' },
  { id: 'deco-lantern', name: 'Paper lantern', kind: 'decoration', description: 'A warm glow for evenings at camp.' },
  { id: 'gear-scarf', name: 'Cozy scarf', kind: 'gear', slot: 'neck', description: 'A long stripy scarf that flaps when you leap.' },
  { id: 'deco-hammock', name: 'Hammock', kind: 'decoration', description: 'For swinging and cloud-watching between climbs.' },
  { id: 'gear-headlamp', name: 'Headlamp', kind: 'gear', slot: 'head', description: 'A bright beam for climbing under the stars.' },
  { id: 'deco-telescope', name: 'Telescope', kind: 'decoration', description: 'Spot the summit by day and stars by night.' },
  { id: 'gear-rainbow-rope', name: 'Rainbow rope', kind: 'gear', slot: 'back', description: 'A rope coil in every colour of the rainbow.', multicolour: true },
  { id: 'deco-flower-pots', name: 'Flower pots', kind: 'decoration', description: 'Three pots of mountain daisies by the tent.' },
  { id: 'gear-sunglasses', name: 'Round sunglasses', kind: 'gear', slot: 'face', description: 'Round shades for bright, high places.' },
  { id: 'deco-kite', name: 'Fish kite', kind: 'decoration', description: 'A fish-shaped kite that swims in the wind.' },
  { id: 'gear-chalk-bag', name: 'Sparkly chalk bag', kind: 'gear', slot: 'hands', description: 'A chalk bag that glitters in the sun.' },
  { id: 'deco-wind-chime', name: 'Wind chime', kind: 'decoration', description: 'Tinkles softly whenever the breeze drops by.' },
  { id: 'gear-rainbow-laces', name: 'Rainbow laces', kind: 'gear', slot: 'feet', description: 'Boot laces in every single colour.', multicolour: true },
  { id: 'deco-fairy-lights', name: 'Fairy lights', kind: 'decoration', description: 'Tiny twinkly lights strung between the trees.' },
  { id: 'gear-cape', name: 'Little cape', kind: 'gear', slot: 'back', description: 'A short cape that swooshes on every leap.' },
  { id: 'deco-picnic', name: 'Picnic blanket', kind: 'decoration', description: 'A checked blanket for snacks with a view.' },
  { id: 'gear-bobble', name: 'Bobble topper', kind: 'gear', slot: 'head', description: 'A woolly bobble that sits on your helmet.' },
  { id: 'deco-bird-feeder', name: 'Bird feeder', kind: 'decoration', description: 'Little mountain birds stop by for seeds.' },
  { id: 'gear-bandana', name: 'Bandana', kind: 'gear', slot: 'neck', description: 'A spotty bandana tied around your neck.' },
  { id: 'deco-swing', name: 'Tree swing', kind: 'decoration', description: 'A wooden swing on a strong branch.' },
  { id: 'gear-gloves', name: 'Fingerless gloves', kind: 'gear', slot: 'hands', description: 'Warm hands, with fingers free to grip.' },
  { id: 'deco-pinwheels', name: 'Pinwheels', kind: 'decoration', description: 'Bright pinwheels that whirl when the wind blows.' },
  { id: 'gear-stripy-socks', name: 'Stripy socks', kind: 'gear', slot: 'feet', description: 'Long socks with bold stripes peeking out.' },
  { id: 'deco-kettle', name: 'Camp kettle', kind: 'decoration', description: 'It whistles when it is cocoa time.' },
  { id: 'gear-goggles', name: 'Snow goggles', kind: 'gear', slot: 'face', description: 'Big goggles for the windy, snowy bits.' },
  { id: 'deco-veggie-patch', name: 'Veggie patch', kind: 'decoration', description: 'Carrots, peas and one very big pumpkin.' },
  { id: 'gear-flower-crown', name: 'Flower crown', kind: 'gear', slot: 'head', description: 'Daisies woven in a ring around your helmet.' },
  { id: 'deco-signpost', name: 'Signpost', kind: 'decoration', description: 'Arrows pointing to Sky Lake and back home.' },
  { id: 'gear-pebble-necklace', name: 'Pebble necklace', kind: 'gear', slot: 'neck', description: 'Smooth mountain pebbles on a string.' },
  { id: 'deco-goat-bed', name: 'Goat bed', kind: 'decoration', description: 'A soft round bed for your goat to nap in.' },
  { id: 'gear-backpack-flag', name: 'Backpack flag', kind: 'gear', slot: 'back', description: 'A tiny flag poking out of your backpack.' },
  { id: 'deco-moon-lamp', name: 'Moon lamp', kind: 'decoration', description: 'A round lamp that glows like a tiny moon.' },
  { id: 'gear-bracelets', name: 'Friendship bracelets', kind: 'gear', slot: 'hands', description: 'Woven bracelets in your favourite colours.' },
  { id: 'deco-log-bench', name: 'Log bench', kind: 'decoration', description: 'Room for two, or one and a goat.' },
  { id: 'gear-puffy-boots', name: 'Puffy boots', kind: 'gear', slot: 'feet', description: 'Squishy, puffy boots for snowy ledges.' },
  { id: 'deco-camp-flag', name: 'Camp flag', kind: 'decoration', description: 'Your own flag, waving from a tall pole.' },
  { id: 'gear-face-paint', name: 'Star face paint', kind: 'gear', slot: 'face', description: 'A little painted star on your cheek.' },
  { id: 'deco-paper-birds', name: 'Paper birds', kind: 'decoration', description: 'A string of folded paper birds that twirl.' },
  { id: 'gear-sleeping-roll', name: 'Sleeping roll', kind: 'gear', slot: 'back', description: 'A rolled-up mat strapped under your backpack.' },
]

/** Colours for generated variants ("Sunset-pink paper lantern"). `tint` is a hex the renderer applies. */
export interface VariantColour {
  id: string
  name: string
  tint: string
}

export const VARIANT_COLOURS: readonly VariantColour[] = [
  { id: 'sunset-pink', name: 'Sunset-pink', tint: '#f29bab' },
  { id: 'sky-blue', name: 'Sky-blue', tint: '#7cc4e8' },
  { id: 'meadow-green', name: 'Meadow-green', tint: '#8cc084' },
  { id: 'lemon', name: 'Lemon-yellow', tint: '#f5d76e' },
  { id: 'berry', name: 'Berry-purple', tint: '#a678c8' },
  { id: 'ember', name: 'Ember-orange', tint: '#f0a050' },
  { id: 'snow', name: 'Snow-white', tint: '#f4f1ea' },
  { id: 'midnight', name: 'Midnight-blue', tint: '#3d4f8a' },
  { id: 'peach', name: 'Peach', tint: '#f7b99a' },
  { id: 'mint', name: 'Mint', tint: '#a8e0c8' },
  { id: 'coral', name: 'Coral', tint: '#f07c6c' },
  { id: 'lilac', name: 'Lilac', tint: '#c8b4e8' },
]
