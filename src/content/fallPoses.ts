/**
 * The 16 silly fall poses (whippers). Every fall plays one; a new one pops "New flop unlocked!" and
 * joins the Hall of Flops. Names and descriptions celebrate the flop: never mean, never about
 * anyone's body, never about real people or places. Descriptions: at most 12 words.
 *
 * The order here is the Hall of Flops order. The animations live in game/art/fallPosesAnim.ts.
 */

export type FallPoseId =
  | 'starfish'
  | 'pancake'
  | 'spaghetti-arms'
  | 'dramatic-swoon'
  | 'windmill'
  | 'superhero'
  | 'cannonball'
  | 'flamingo'
  | 'bicycle'
  | 'jellyfish'
  | 'teapot'
  | 'surprised-cat'
  | 'ballerina'
  | 'sleepy-sloth'
  | 'doggy-paddle'
  | 'disco'

export interface FallPoseInfo {
  id: FallPoseId
  name: string
  /** Kid-facing, at most 12 words, celebrates the flop. */
  description: string
}

export const FALL_POSES: readonly FallPoseInfo[] = [
  { id: 'starfish', name: 'The Starfish', description: 'Arms out, legs out, spread wide. A five-point flop!' },
  { id: 'pancake', name: 'The Pancake', description: 'Flat, stiff and ready for syrup.' },
  { id: 'spaghetti-arms', name: 'The Spaghetti Arms', description: 'Your arms turned into noodles. Extra wiggly, no sauce.' },
  { id: 'dramatic-swoon', name: 'The Dramatic Swoon', description: 'Hand to forehead. A great big sigh. The crowd goes wild.' },
  { id: 'windmill', name: 'The Windmill', description: 'Arms whirling so fast you could power a lamp.' },
  { id: 'superhero', name: 'The Superhero', description: 'One fist out front. Flying! Well, mostly falling.' },
  { id: 'cannonball', name: 'The Cannonball', description: 'Knees hugged tight, rolling round and round. Splash not included.' },
  { id: 'flamingo', name: 'The Flamingo', description: 'Perfect balance on one leg, in the middle of the air.' },
  { id: 'bicycle', name: 'The Bicycle', description: 'Pedalling as fast as you can. The bike is invisible.' },
  { id: 'jellyfish', name: 'The Jellyfish', description: 'Bloop, bloop. Drifting down like the sky is the sea.' },
  { id: 'teapot', name: 'The Teapot', description: 'One hand a handle, one hand a spout. Time for tea!' },
  { id: 'surprised-cat', name: 'The Surprised Cat', description: 'Every hair standing up. Did somebody say bath time?' },
  { id: 'ballerina', name: 'The Ballerina', description: 'A perfect twirl, all the way down. Take a bow!' },
  { id: 'sleepy-sloth', name: 'The Sleepy Sloth', description: "Hanging upside down from a branch that isn’t there. Five more minutes." },
  { id: 'doggy-paddle', name: 'The Doggy Paddle', description: "Paddling through thin air like it’s the deep end." },
  { id: 'disco', name: 'The Disco', description: 'Point up, point down, strike a pose. Falling, but groovy.' },
]

const BY_ID = new Map<string, FallPoseInfo>(FALL_POSES.map((p) => [p.id, p]))

/** The pose's name and description, or undefined for an id that isn't one of the 16. */
export function fallPoseInfo(id: string): FallPoseInfo | undefined {
  return BY_ID.get(id)
}

export function isFallPoseId(id: string): id is FallPoseId {
  return BY_ID.has(id)
}
