/**
 * EVERY difficulty knob lives here. Physics, the engine, the renderer and the level validator
 * all read from this one object, so changing a number here changes the game and the proof together.
 *
 * Units: world units (y-up), seconds. One screen ≈ 600 units tall; the pitch is 400 wide.
 */
export const TUNING = {
  /** Fixed physics step (s). Deterministic: no variable dt anywhere in physics. */
  dt: 1 / 120,

  /** Downward acceleration (units/s²). */
  gravity: 1150,
  /** Launch speed at full drag (units/s). */
  maxPower: 960,

  /** Drag length (CSS px) that means full power: clamp(fraction × min(viewW, viewH), min, max). */
  maxDragFraction: 0.28,
  maxDragPxMin: 110,
  maxDragPxMax: 190,
  /** Releasing with the drag shorter than this cancels the leap (as does releasing on the climber). */
  cancelPx: 26,
  /** On-screen climber hit radius for "drag back onto the climber cancels": clamp(halfHeightPx, min, max). */
  climberHitMinPx: 22,
  climberHitMaxPx: 44,

  /** Dotted preview shows this fraction of the reference flight time. */
  previewFraction: 0.4,
  /** On Big Leaps the preview is shorter: she can't see the landing. */
  bigLeapPreviewFraction: 0.18,
  /** Reference flight time floor for the preview (s). */
  previewMinTime: 0.6,

  /** Hand reach: holds are caught when the hand's path passes within this distance. */
  holdReach: 26,
  /** Feet may land this far past a ledge's ends. */
  landTolerance: 6,

  /** Climber collision box. Feet point is the bottom centre. */
  bodyHalfWidth: 11,
  bodyHeight: 40,
  /** Hand point above the feet while flying / hanging. */
  handOffset: 44,

  /** Seconds after landing before a crumbly ledge gives way. */
  crumbleDelay: 2.4,
  /** Seconds the ledge visibly shakes before crumbling (part of crumbleDelay). */
  crumbleWarn: 1.1,

  /** Multiplies every wind zone's accel (difficulty knob for wind). */
  windScale: 1,
  /** Seconds of visual warning before a gust starts. */
  windTelegraph: 0.6,

  /** How far below the last camp's ledge top she may drop before the rope catches. */
  ropeSlack: 70,
  /** Rope catch: swing + fall pose (s), then reel back to camp (s). Total must stay < 1 s. */
  ropeSwingTime: 0.5,
  ropeReelTime: 0.32,

  /** After landing she steps to the ledge's stand point over this time (s). */
  settleTime: 0.18,
  /** Max flight time before a flight is treated as a fall (safety net, s). */
  maxFlightTime: 6,

  /** Camera: follow smoothing (per second), Big Leap pull-back zoom factor. */
  cameraFollow: 6,
  bigLeapZoom: 0.72,

  /** Minimum view the camera always fits (world units). */
  viewMinW: 420,
  viewMinH: 640,
  /** Devices render at most this pixel ratio. */
  maxDpr: 2,

  /** A leap ending on a non-route element more than this far below the launch point is a whipper (a slip). */
  slipDrop: 40,
  /** Hidden holds reveal when her hand passes within this distance while falling. */
  hiddenRevealRadius: 70,

  /** Beta: falls from one spot before the goat offers a hint, and before the ghost arc is available. */
  hintAfterFalls: 3,
  ghostAfterFalls: 6,

  /** How many recent failed arcs stay visible as chalk while climbing. */
  chalkVisible: 3,
} as const

export type Tuning = typeof TUNING
