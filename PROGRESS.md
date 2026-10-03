# Up Anyway — PROGRESS

> Single source of truth for resuming work. A cold session should be able to
> continue from this file alone. Keep **Status**, **Stages**, **Decisions** and
> **Known issues** current at the end of every stage (and commit).

## Status

- **Current stage:** 3 — Climb engine (Stage 2 done and committed)
- **Ahead of schedule:** the Stage 3 engine core (physics, solver, validator, engine, camera, input, beta) and
  ALL 16 pitches + the lesson are written and validated (`npm run validate` green; engine replays every saved
  solution with zero whippers — tests/game/engine.test.ts).
- **Next:** Stage 3 workflow (scratchpad draft `stage3.js` — re-create from the Stages list if lost): world
  renderer, character animator, 16 fall poses, sound, goat voice → climb screen + real lesson → e2e replay → review.
- **Stage 2 verified:** typecheck clean; vitest 226/226; Playwright WebKit 9/9 (first run on 820×1180,
  1180×820, 390×844: 23 taps ≈ 13 s scripted, reload resumes, mute remembered, zero console errors).
- **Machine note:** this Mac (16 GB) is shared with other sessions running Playwright; keep ≤ 3 agents that run
  dev servers/browsers at once, and Playwright workers ≤ 3.

## How to resume

```bash
npm install
npm run dev          # http://localhost:5173/upanyway/
npm run typecheck    # tsc --noEmit
npm test             # vitest: unit + level validator (writes src/game/levels/solutions.json)
npm run e2e          # playwright (webkit) against a production build + preview
npm run build        # dist/ for GitHub Pages
```

- The original brief lives at `.brief/SPEC.md` (gitignored — it contains family
  context and must never be committed). The **Requirements checklist** below is
  the de-personalised, committed version of it; when they disagree, the brief wins.
- Work in stages (see **Stages**). Commit at the end of each stage with the
  stage name in the message, and update this file in the same commit.
- Never ask the owner questions unless truly blocked: decide, then log it under
  **Decisions**.

---

## Requirements checklist (from the brief, condensed — nothing dropped)

`[R]` = an explicit *reject* rule from the brief. Treat these as hard constraints.

### Purpose and feel
- Teaches through play (never lectures): (1) it's okay to be scared and do it
  anyway — fear comes along but doesn't decide; (2) it's okay to fail — a flop is
  information, not a verdict.
- Main currency = REAL brave things done in life; they open the mountain. Climbing
  is where she practises failing somewhere safe.
- Feel: warmth of *A Short Hike*, Celeste's attitude to falling (instant retry,
  attempts worn with pride). Spirit only — nothing copied.

### Platform
- Static web app, installable PWA, fully offline after first load. iPad Safari
  first (portrait + landscape); must also work on a phone.
- Vite + TypeScript. Canvas 2D for the climb; plain DOM/CSS for everything else.
  Pointer Events; `touch-action: none` on the canvas. [R] no game engine, no UI framework.
- GitHub Pages under this repo's path (`/upanyway/`). Provide step-by-step hosting
  + "Add to Home Screen" instructions.
- Shared origin with another family app: prefix EVERY storage key and cache name
  with `upanyway:`; SW scoped to the app path; only ever delete caches with that
  prefix. [R] generic keys/cache names like "state", "save", "v1".
- Data on-device only: localStorage, versioned schema + migrations;
  `navigator.storage.persist()` where supported. Export/Import JSON in parent mode.
- Public repo: no personal names/data in source; all personal data entered at first
  run. No runtime network requests, no analytics; font bundled locally.
- Touch: targets ≥ 48px; nothing depends on hover; no double-tap zoom; no page
  scroll/bounce during play; safe areas respected; text inputs stay visible above
  the iPad keyboard. Audio unlocks on first tap; a mute toggle is ALWAYS visible.
- Performance: cap devicePixelRatio at 2; pre-render parallax layers offscreen.

### World and look
- Working title "Up Anyway". She names her mountain at first run.
- Climber fully customisable: hair style + colour, skin tone, outfit, helmet, backpack.
- Companion: fluffy baby mountain goat in the backpack, scared of heights; she names
  it. Peeks out, covers its eyes on big leaps, ears flap when she falls.
- Cozy storybook: layered paper-cut parallax mountains, soft gradients,
  sunrise→sunset palette by zone, rounded shapes, gentle particles (fireflies,
  leaves, snow). Juice: squash-and-stretch on launch/landing, dust + chalk puffs,
  smooth camera. Not a loud arcade game.
- Everything drawn in code; original art. [R] placeholder shapes for climber or goat —
  both need faces, expressions, personality.
- Web Audio synthesis only: leap whoosh, soft landing, rope "boing", cartoon goat
  bleat, stone clack, gentle generative ambient.
- Plain English for a young climber (audience and reading level: see .brief/). Introduce each climbing word (pitch, whipper,
  beta, send) with one line the first time it appears.

### Story rules
- She climbs for herself: to reach Sky Lake at the summit and see everything from
  the top. Nobody needs rescuing; nothing bad happens if she stops.
  [R] rescue plots, anyone in danger, ticking clocks.
- Fear is a passenger, not a monster: the goat IS the fear — it comes along, says so
  out loud, the climb goes on anyway. [R] fear as villain/boss.
- Each zone: one Looks Scary moment that turns out gentle up close. Before: one-tap
  Fear Forecast (0–10, weather icons sun→thunderstorm). After: "How scary was it
  really?" + one-line comparison ("Forecast 7. Really 2.").
- Finale at Sky Lake: goat climbs out of the backpack for the first time, makes its
  own wobbly leap, flops into the lake, they both laugh.
- Teach by doing. At most one line of moral per camp, from the goat, never a
  narrator. [R] lectures, quizzes, "the lesson here is…".

### The climb
- One gesture: touch, drag back, release (slingshot). Power ∝ drag length, clamped.
  Dotted arc previews the first ~40% of the flight. Dragging back onto the climber cancels.
- Lands on ledges (stand) or catches holds (hang) when the path passes within reach.
  Side contact stops horizontal motion — no pinball bouncing.
- Fixed-timestep deterministic physics (same input → same result). Every difficulty
  knob (gravity, max power, preview length, hold reach, crumble delay, wind) in ONE
  `tuning.ts`.
- THE ROPE: a fall below her last camp is caught and swings her back to camp, in play
  again in < 1 s — no screens, no penalty. First time: goat explains the rope is why
  climbers can try hard moves. [R] lives, "Game Over", losing progress past last camp.
- CHALK: every failed leap leaves its full arc as a faint chalk line (last 3 visible,
  fading).
- WHIPPERS: every fall plays one of 16 silly named fall poses (The Starfish, The
  Pancake, The Spaghetti Arms, The Dramatic Swoon, …) — short limb-angle animation on
  a simple rig. A new one pops "New flop unlocked!" and joins the Hall of Flops.
- BIG LEAPS: marked gaps; shorter preview (can't see landing); camera pulls back to
  show the drop; knees wobble; goat gulps. Wobble is visual only. Trying one counts
  as brave whether or not she lands it.
- BETA: after 3 falls at one spot the goat offers a hint from her last attempt ("We
  were a bit short. More power?"). After 6, she can tap to see a faint ghost of a
  working arc. Asking for beta is what real climbers do.
  [R] hints that cost anything or are framed as giving up.
- Attempts, not deaths: attempts = whippers + the send. End of every pitch: BETA MAP —
  all failed arcs as faint chalk under the bright route that worked: "Sent in 14
  attempts. Every whipper got you here." [R] stars/medals/timers for fewer falls.
- No visible clock while climbing.

### The mountain
- 5 zones × 3 pitches + summit pitch = 16. Each pitch 3–4 screens tall; a camp at
  least every screen. Gentle ramp; every pitch takes a few attempts; none impossible.
  1. Meadow Slopes — leaping, ledges, rope, chalk. Looks Scary: first Big Leap (looks huge, is easy).
  2. Firefly Hollow — holds + hanging. Looks Scary: glowing eyes in a dark cave (fireflies).
  3. Crumble Cliffs — ledges crumble a moment after landing; you only find out by
     landing on them. Looks Scary: rumbling cliff (a bear snoring in a cave).
  4. Gusty Ridge — wind gusts on a learnable rhythm. Looks Scary: rickety rope bridge (it holds).
  5. Cloud Steps — Big Leaps through fog. Looks Scary: giant shadow (a fluffy marmot, backlit).
  6. Summit pitch → Sky Lake finale.
- Hidden holds: some shortcut holds reveal only when she falls past them ("Spotted a
  hold on the way down!"). Never on the required route.
- Levels are data; each lists its required route as ordered ledge/hold ids.

### The Cairn (main currency)
- Logged from camp; one question per screen; big buttons; under a minute:
  1. What's the brave thing? (type or pick an idea card)
  2. Fear Forecast 0–10 (weather icons)
  3. What are you worried might happen? (optional, one line)
  4. "I'll do it later" (→ Plans) or "I already did it!"
  5. After: How scary was it really? What actually happened? How did it go —
     "Nailed it" / "Wobbly, but I did it" / "Flopped — and I'm still here".
     What did I learn? (optional, suggestion chips)
- Each adds a stone with a satisfying stacking animation; tap a stone to read it.
  All three outcomes earn the same stone; a flop is also framed in the Hall of Flops.
- Flat rewards: one stone per brave thing regardless of fear number; max 3 a day.
  [R] rewards scaling with fear rating.
- Plans: "I did it!", "Not today", "Make it smaller". Not today costs nothing ("Fear
  won this round. That's allowed."). Make it smaller suggests smaller versions (half
  of it, with someone first, practise at home first) or write her own.
  [R] streaks, expiry, guilt, sad faces, nagging reminders.
- Brave = safe but scary. Say so once at first run AND on the ideas screen: if
  something could really hurt you or someone else, the brave move is to stop and
  tell a grown-up.
- She always chooses. Parents can add idea cards, never assign. [R] parent-assigned tasks.
- Idea cards: ≥ 30 brave ideas a young climber would recognise (audience and reading level: see
  .brief/; school canteen, swimming lessons, everyday school life — nothing identifying) (ask the teacher a question, order food yourself, jump in the deep end,
  join a game with kids you don't know, say "I don't know" out loud, ask for help, say
  what you actually want even when it's different) + ≥ 16 OOPS MISSIONS (small
  deliberate imperfections: odd socks for a day, draw with your other hand and show
  someone, draw in pen so you can't erase, leave one mistake in a note and don't fix
  it, tell your worst joke, stop a puzzle when the timer rings). Oops missions never
  touch graded schoolwork, safety, or anyone's feelings.

### Connecting the halves
- Stones never spent. Pitches 1–2 free; pitch n opens when the cairn holds n−2 stones
  ("The trail ahead is hidden. Add a stone to your cairn to find the way.").
  Unlocked pitches replay freely.
- After the summit: each new stone also unlocks a camp decoration or gear; the
  mountain can be re-climbed at night with the goat climbing beside her.
- Daily climb time = parent setting (default 20 min), shown as a small sun sinking,
  never a countdown. When it runs out she finishes her current attempt, then "The
  sun's going down. The mountain will be here tomorrow." Camp, cairn and museum
  (Hall of Flops) stay open.

### Camp (hub)
- Cairn; Weather Station (forecast vs really across real brave things; caption "Fear
  forecasts usually come in stormier than the real weather."; friendly empty state
  until 3); Hall of Flops (16 pose cards; her real flops framed with respect, "what I
  learned" as caption; Grown-ups' Wing for parents' flops) [R] jokey treatment of her
  real flops; Letters ("Spotted!" notes from parents; each adds a bonus stone, max one
  a day); Wardrobe; Trail Map; Badges.
- Badges for attempts + courage only: first whipper; 10/50/100 attempts; first Big
  Leap tried; first Oops Mission; first "Flopped — and I'm still here"; first Not
  today turned into a smaller step; first time asking for beta; 5 forecasts stormier
  than the real thing. [R] badges for speed, streaks, flawless runs.

### Goat's voice
- 80+ lines, each ≤ 12 words, grouped by moment: aiming, aiming at a Big Leap,
  landing, Big Leap landed, Big Leap missed, falling, repeat falls, hints, Looks Scary
  before + after, camp idle, stone added, flop logged, Not today, summit.
- Scared is allowed and named; going anyway is the move ("My legs are jelly. Let's go
  anyway?", "WHEEE — rope's got us. Now we know.", "Huh. Looked way scarier from down
  there."). [R] "Don't be scared!", "Nothing to be scared of!", "Be brave!";
  [R] generic "Good job!" (name the specific try); [R] "Oh no", "You failed",
  "Try harder", disappointed reactions.

### First run (< 3 minutes)
Parent: sets 4-digit PIN, enters what she calls each parent, hands over. Kid: designs
climber, meets + names the goat, names her mountain, 20-second lesson (leap, fall,
rope catches), one screen on brave vs dangerous, one line telling her that her parents
can read her cairn to cheer her on. Then Pitch 1.

### Parent mode (PIN)
- Daily climb minutes; sound. Write a Spotted! letter; add a Grown-ups' Wing flop;
  add idea cards. Read her cairn and plans. One-page "How to cheer" (praise the try
  not the result; ask "What did you learn?" not "Why didn't you…?"; tell her about your
  own flops; don't rescue too fast; never use the game as reward/punishment for other
  things; never compare her with a sibling). Export/Import JSON, reset, Test mode
  (unlocks everything). No leaderboards; nothing compares her with anyone.

### Quality bar (run, don't claim)
- Level validator (Vitest) with the REAL physics: for every step of every pitch's
  required route, search angle × power for a leap landing on the next element. Assert
  one exists at ≤ 85% max power that is forgiving: still lands across ±4° and ±6%
  power around the best input. Wind steps may wait for a calm phase; crumble steps
  must launch inside the crumble delay. Save solutions. Fix failing pitches by editing
  the level, never the validator. [R] loosening tolerances or skipping a pitch.
- Unit tests: schema migrations, export/import round-trip, stone limits, daily cap,
  attempt counting.
- Playwright on WebKit with touch at 820×1180, 1180×820 and a phone size: complete
  first run; log a brave thing; open pitch 3; send pitch 1 by replaying its saved
  solution as pointer drags; open every camp screen; export + re-import. Zero console errors.
- Before done: search repo for TODO, FIXME, lorem, "coming soon", placeholder text,
  empty content arrays. [R] content stubbed "to fill in later".
- If everything passes, say so plainly. No invented polish rounds.

### Done means
Installed on an iPad, set up in < 3 minutes, playable offline from Meadow Slopes to
Sky Lake with real brave things opening the way, every check above passing.

---

## Architecture

### Overview
- **No framework, single bundle.** `src/main.ts` boots: CSS + bundled font, `initStore(localStorage)`,
  persistent shell (mute toggle), hash router, audio unlock listeners, service-worker registration
  (production only). Screens are statically imported (no lazy chunks → no chunk-load failures offline).
- **Hash router** (`#/camp`, `#/climb/p03?night=1`) — works on GitHub Pages with no 404 tricks and inside
  the SW app shell. Each screen exports `(root: HTMLElement, ctx: ScreenContext) => Unmount | void`.
  Navigation uses `pushState`/`replaceState` and renders synchronously; the in-app depth for `ctx.back()`
  lives in `history.state.upDepth`. Every route change (push, replace, back/forward, guard redirect) fires
  `ROUTE_CHANGE_EVENT` ('upanyway:route') on window before the old screen unmounts — overlays and the
  glossary listen to that, never to 'hashchange'. A screen may navigate while mounting (render token).
- **Store** (`storage/store.ts`, written): one JSON document at `upanyway:save`; `store().update(fn)`
  mutates, debounces a save (150 ms; flush on `pagehide`/`visibilitychange`), notifies subscribers.
  Writes are try/caught (quota) and surfaced in parent mode. `upanyway:save:backup` holds the previous
  good copy before every migration/import/reset.
- **Model** (`src/model/*`): pure functions over `SaveData` with an explicit `now: Date` — stones + daily
  caps, unlocks, attempts/whippers/sends, badges, climb time, unlockables, PIN hash. All rules live here
  and are unit-tested without a DOM.
- **Game** (`src/game/*`): pure deterministic physics (`physics.ts`, written) + solver (`solver.ts`,
  written) shared by the engine and the validator; level data; `ClimbSession` state machine (fixed
  1/120 s step, accumulator, frame delta clamped to 0.1 s); input; camera; renderer.
- **Art** (`src/game/art/*`): climber + goat drawn with Canvas paths on a simple rig; also used by DOM
  screens through small `<canvas>` previews.
- **Audio** (`src/audio/*`): one `AudioContext` (`window.AudioContext || webkitAudioContext`), master gain,
  mute; synthesized sfx + generative ambient per zone.
- **PWA**: `src/sw/sw-template.js` + Vite plugin in `vite.config.ts` (written) inject the precache list and
  a content hash → `dist/sw.js`. Cache `upanyway:precache:<hash>`; install fetches with
  `cache: 'reload'` (GitHub Pages sends `max-age=600`) and fails if any entry fails; `activate` deletes only
  `upanyway:`-prefixed caches that aren't current; navigations within scope answer with cached
  `index.html` (ignoreSearch); requests outside the scope are never touched. Registered with
  `scope: import.meta.env.BASE_URL`. Manifest (`public/manifest.webmanifest`): `start_url: "./"`,
  `scope: "./"`, `id: "upanyway"` (resolved against the origin → `https://<host>/upanyway`, unique on the
  shared origin and unchanged if `VITE_BASE` moves the path — never change it once installed),
  `display: "standalone"`, no orientation lock, relative icon URLs.
- **Dialogs** are always in-DOM (`ui/components.ts` modal/confirm) — never `window.confirm/alert/prompt`.
- **Debug hook** for e2e: `window.__upanyway` exposes read-only state + coordinate helpers
  (`climb.state()`, `climb.climberClient()`, `climb.maxDragPx()`, `climb.worldToClient(x,y)`).
- **Platform floor**: iPadOS/iOS 15+. `build.target: 'safari15'`. Never use `crypto.randomUUID`,
  `crypto.subtle`, `structuredClone`, `OffscreenCanvas`, `ctx.filter`, `Array.prototype.at` without
  feature detection. `dvh` always has an `innerHeight` CSS-var fallback.

### Coordinates and units
- World units, **y-up** (altitude). Pitch width `WORLD_W = 400` (x ∈ [0, 400], solid side walls).
  "One screen" = `SCREEN_H = 600` units. Pitch heights 1800–2400.
- Camera scale `s = min(viewW / 420, viewH / 640)`; DPR capped at 2. Portrait iPad ≈ 445×640 units;
  landscape ≈ 920×640 (parallax fills the sides); phone ≈ 420×900.
- Angles in degrees: 0° = right, 90° = straight up, 180° = left. Power = fraction of `TUNING.maxPower`.

### iPad/touch rules (base.css + ui/keyboard.ts)
- `touch-action: manipulation` on `html` AND on every scroll container (`.screen`, `.modal__scroll`,
  `.sheet__scroll`): WebKit restarts touch-action at each `overflow: auto` element. `touch-action: none`
  only on the play surface: `.stage > canvas` (the climb + lesson canvas must sit in a `.stage`; `AimInput`
  also sets it on its canvas) — decorative canvases (camp scene, designer, portraits) let the page scroll.
  `html, body { position: fixed; inset: 0; overflow: hidden; overscroll-behavior: none }`, height `100dvh`
  with a `--vh` fallback from `innerHeight`. Each scrollable screen has its own `overflow-y: auto;
  overscroll-behavior: contain` container. `-webkit-user-select: none; -webkit-touch-callout: none` everywhere except text inputs.
  `-webkit-tap-highlight-color: transparent`. `:hover` styles only inside `@media (hover: hover)`.
- Safe areas: `env(safe-area-inset-*)` padding on the shell, HUD and every screen. The climb canvas is
  full-bleed but the HUD sits inside the insets and the camera keeps the climber + next target inside the
  inset-reduced rect.
- Targets ≥ 48×48 px (CSS var `--tap: 56px` for primary buttons). Inputs/textarea font-size ≥ 16 px (no
  focus zoom; the rule sits after `font: inherit` so it wins). `gesturestart` is prevented (no pinch zoom).
  Dismissible dialogs put their close button top-LEFT (the mute toggle owns the top-right corner).
- Keyboard: `visualViewport` resize/scroll → `--kb-inset`; one-question screens put the input in the top
  half; on focus the input scrolls into view inside the screen's scroll container; on blur
  `window.scrollTo(0, 0)`. The PIN uses a custom on-screen pad (no keyboard).
- Audio unlock on `pointerup`/`touchend`/`click` (WebKit doesn't count `pointerdown` as activation):
  `ctx.resume()` + a 1-sample silent buffer; the listener stays until `ctx.state === 'running'`; re-armed on
  `visibilitychange` → visible and when the context reports `suspended`/`interrupted`.
- Canvas memory: parallax layers are viewport-wide strips ≤ 2048 device px tall, generated lazily as the
  camera rises; far layers at DPR 1; offscreen budget ≈ 24 M px; rebuilt on resize/orientation change;
  every canvas is released (`width = height = 0`) on unmount. Always `document.createElement('canvas')`.
- Night, fog and cave darkness come from palette swaps + pre-rendered overlay bitmaps (cached per resize),
  at most one radial light sprite composited per frame. No per-frame full-screen gradients.

### File layout
```
index.html                 viewport-fit=cover, no zoom, apple-* meta, manifest link   (written)
vite.config.ts             base '/upanyway/' (VITE_BASE overrides), SW plugin           (written)
vitest.config.ts           node env; tests/**                                           (written)
playwright.config.ts       webkit; ipad-portrait 820x1180, ipad-landscape 1180x820, phone 390x844
tsconfig.json (src, browser) + tsconfig.node.json (tests, e2e, scripts, configs)        (written)
.github/workflows/deploy.yml   build + deploy to GitHub Pages via Actions
public/manifest.webmanifest, public/icons/*.png (generated by scripts/make-icons.mjs from in-code art)
scripts/make-icons.mjs  scripts/check-solutions.mjs (prebuild: solutions.json level hashes match)
src/
  main.ts  debug.ts
  sw/sw-template.js                                                                       (written)
  app/router.ts (written)  app/shell.ts  app/screens.ts (route table + guard)  app/sw-register.ts
  ui/dom.ts (written)  ui/components.ts  ui/icons.ts  ui/keyboard.ts  ui/fearScale.ts  ui/pinPad.ts
  ui/term.ts (glossary words: first mention shows its one-line definition)  ui/goatBubble.ts
  ui/styles/{tokens,base,components,screens}.css
  storage/keys.ts (written)  schema.ts (written)  migrations.ts  store.ts (written)  backup.ts
  model/clock.ts (written)  ids.ts  rng.ts  hash.ts  pin.ts  stones.ts  unlocks.ts  attempts.ts
        badges.ts  climbTime.ts  unlockables.ts  goatVoice.ts (line picker: shuffle-bag, moral cap)
  content/goatLines.ts  ideas.ts  fallPoses.ts  badges.ts  glossary.ts  copy.ts  unlockables.ts
          learnChips.ts  happenedChips.ts  smaller.ts  wardrobe.ts  names.ts  cheer.ts
  game/tuning.ts (written)  types.ts (written)  physics.ts (written)  solver.ts (written)  beta.ts
  game/levels/{index.ts, lesson.ts, p01.ts … p16.ts, solutions.json}
  game/engine.ts (ClimbSession)  game/input.ts  game/camera.ts  game/chalk.ts  game/events.ts
  game/render/{renderer.ts, parallax.ts, palette.ts, terrain.ts, particles.ts, effects.ts, scary.ts,
               overlays.ts, fog.ts, nightGoat.ts, finale.ts}
  game/art/{rig.ts, poses.ts, fallPosesAnim.ts, climber.ts, goat.ts, preview.ts}
  audio/{audio.ts, sfx.ts, ambient.ts}
  screens/setup/{hello,names,handover,climber,goat,mountain,lesson,brave,cheer}.ts
  screens/{camp,climb,cairn,log,plans,weather,flops,letters,wardrobe,map,badges,finale}.ts
  screens/parent/{gate,home,settings,letter,grownupFlop,ideas,readCairn,cheer,data}.ts
tests/unit/*.test.ts       storage, migrations, backup, stones, climbTime, attempts, badges, unlocks,
                           keys-prefix scan, content rules, beta classification, goat voice
tests/levels/validator.ts + tests/levels/zone-*.test.ts (one file per zone so they run in parallel)
e2e/*.spec.ts  e2e/helpers.ts
```

---

## Data schema (`src/storage/schema.ts`, schemaVersion 1 — written; keep this in sync)

```ts
type DayKey = string                       // local 'YYYY-MM-DD'
type Arc = number[]                        // flattened [x0,y0,x1,y1,…] world units, ints, ≤ 16 points

interface ClimberLook { hairStyle; hairColor; skinTone; outfit; outfitColor; helmet; helmetColor;
                        backpack; backpackColor; gear: string[] }
interface BraveThing { id; createdAt; text; ideaId?; oops: boolean; forecast: number /*0-10*/; worry?
  status: 'planned' | 'done'; notTodayCount: number /*never displayed*/; smallerOf?: string
  doneAt?; really?: number; whatHappened?: string; outcome?: 'nailed'|'wobbly'|'flopped'; learned?
  stoneDay: DayKey | null }          // day its stone was placed; null = not done yet, or waiting (cap)
interface Letter { id; createdAt; from: string; text; openedAt?; stoneDay: DayKey | null }
interface GrownupFlop { id; createdAt; who; what; learned }
interface CustomIdea { id; createdAt; text; oops: boolean }
interface PitchRun { startedAt; lastCampId; lastCampRouteIndex /*index of lastCampId in level.route*/
  whippers; failedArcs: Arc[] /*≤ 200*/
  routeArcs: Arc[] /*truncated back to the last camp on every rope catch*/
  routePath: string[] /*element ids: [start, landing of routeArcs[0], …] — always routeArcs.length + 1*/
  fallsBySpot: Record<elementId, number>; highestRouteIndex: number; night: boolean }
interface SendRecord { at; attempts; failedArcs: Arc[]; routeArcs: Arc[]; night: boolean }
interface PitchProgress { sends; nightSends; totalAttempts; firstSentAt?
  run: PitchRun | null; nightRun: PitchRun | null; lastSend: SendRecord | null
  revealedHolds: string[]            // persists per pitch (a found shortcut stays found)
  foundCrumbles: string[] }          // crumbly ledges she has landed on: drawn cracked from then on
interface SaveData { schemaVersion; createdAt
  setup: { parentDone; lookDone /*she saved a look in the designer*/; complete }
  parent: { pinHash; pinSalt; names: string[]; dailyClimbMinutes /*default 20; 0 = no limit*/ }
  settings: { muted: boolean /*master: kid toggle + parent*/; music: boolean /*ambient, parent*/ }
  profile: { look; goatName; mountainName }; lessonDone
  pitches: Partial<Record<LevelId, PitchProgress>>
  stats: { whippers; sends; bigLeapsTried; betaAsked }
  poses: Record<poseId, { firstAt; count }>
  brave; letters; grownupFlops; customIdeas; badges: Record<badgeId, earnedAtIso>
  glossarySeen: string[]; looksScary: Partial<Record<ZoneId, { forecast; really; at }>>
  climbTime: { day: DayKey; seconds }; summit: { reached; at?; finaleSeen }
  flags: { ropeExplained; firstCampVisit; braveVsDangerousSeen; persistGranted: boolean | null }
  testMode: boolean }
```
- Attempts = `stats.whippers + stats.sends`. Per-pitch send attempts = `run.whippers + 1`.
- **Stones** = brave things with `stoneDay` + letters with `stoneDay`. A brave thing is eligible when
  `status = 'done'`; ≤ 3 brave-thing stones placed per local day; ≤ 1 letter stone per day (eligible when
  the letter is opened). Over-cap stones wait (`stoneDay = null`) and are placed, oldest first, on the
  first Camp/Cairn visit of a later day with room — with the stacking animation then. Stone look (size,
  colour, sound, animation) is seeded from the id only — never from forecast, really or outcome.
- **Unlockables** are derived, never stored: stones whose `stoneDay` ≥ the summit day (in placement order,
  letters included) map onto `content/unlockables.ts` (≥ 40 items, half camp decorations, half gear);
  past the end of the list a deterministic colour-variant generator keeps giving one item per stone.
- Storage keys only from `storage/keys.ts`: `upanyway:save`, `upanyway:save:backup`. Caches
  `upanyway:precache:<hash>`. A unit test scans `src/` for string literals passed to
  `localStorage`/`caches` and fails on any unprefixed key, any `localStorage.clear(`/`sessionStorage.clear(`,
  and any `caches.delete(` not guarded by the prefix.
- **Load** (`migrations.ts: loadSave(storage)`): missing save → fresh (never the backup). Corrupt JSON →
  backup → else fresh (info `recovered`). No `schemaVersion` → v0. Run `MIGRATIONS[v]` up to current, then
  `normalize()` fills missing fields from `defaultSave()`. Newer-than-current → best-effort normalize,
  raw copy kept in the backup key, notice in parent mode. Import uses the same path but refuses newer files.
- **Reset** (parent, confirm + "Export first?"): copy current save to backup, write a fresh `defaultSave()`
  (never just delete), route to `#/setup`. Never `localStorage.clear()`, never touches caches.
- **Export**: file `upanyway-backup-YYYY-MM-DD.json`. Buttons: "Share / Save to Files"
  (`navigator.share({files})` when `navigator.canShare({files})`), "Download file" (`<a download>` Blob —
  the path e2e drives), "Copy as text". **Import**: `<input type=file accept=".json,application/json,
  text/plain">` + "Paste backup text" textarea; preview of what will be restored, then confirm.

---

## Level format (`src/game/types.ts` — written)

`Ledge {id, kind:'ledge', x, y(top), w, h?, camp?, crumble?, bridge?, standX?}` ·
`Hold {id, kind:'hold', x, y, hidden?, style?}` · `WindZone {id, x, y, w, h, dir, accel, period, gust,
offset}` · `Level {id, index, zone, title, height, elements, route, bigLeaps?, wind?, looksScary?,
decor?, finale?}` · `LooksScary {kind, forecastAt, revealAt, x, y}`.

Rules (all validator-enforced):
- `route[0]` is a camp with `y ≤ 100`; the last route element is the pitch top (it counts as a camp: rope
  anchor + beta map) with `y ≥ height − 150`; consecutive camps along the route (including last camp → top)
  ≤ 600 apart; every id exists; ids unique; pitch height 1800–2400.
- Camps are never crumble, hidden, or inside a wind zone. No hidden hold on the route.
- All wind zones of a level share one `period`. A step launching from a crumble ledge never needs wind.
- `looksScary`: exactly one in each zone 1–5, on the middle pitch (p02, p05, p08, p11, p14);
  `forecastAt` is a camp before `revealAt` in the route. No `bigLeaps` in the lesson or p01 (p02's Big Leap
  is "the first Big Leap").
- Hidden holds: (a) some failing leap from a route element passes within `hiddenRevealRadius` of it before
  the rope line; (b) some route element `i` reaches it with a forgiving solution; (c) from it a forgiving
  leap lands on route element `j > i + 1` (a real shortcut).

## Physics (`physics.ts`, `tuning.ts` — written; tune values in Stage 3)

- Fixed step `dt = 1/120 s`, semi-implicit Euler, pure functions, no randomness.
- Body: feet point `(x, y)`; box half-width 11, height 40; hand point `(x, y + 44)`.
- After landing she settles (`settleTime`) to the ledge's `standX`, so every attempt from a spot starts at
  the same place. Hanging: hand at the hold centre.
- **Input → launch**: drag can start anywhere on the canvas. `D = P − S` (CSS px). Direction `−D`,
  power `p = clamp(|D| / maxDragPx, 0, 1)`, `maxDragPx = clamp(0.28·min(vw, vh), 110, 190)`.
  **Cancel** when `|D| < cancelPx` OR the release point P is within the climber's on-screen hit radius
  (`clamp(halfHeightPx, 22, 44)`) — i.e. dragging back onto the climber. While a release would cancel,
  the band and preview are hidden. `pointercancel`/`lostpointercapture`/second finger → cancel, never
  launch. Only the first `pointerId` is tracked; `setPointerCapture` is try/caught. Input only in `ready`.
- Ledges are solid rectangles: feet crossing the top while descending within
  `[x − landTol − halfW, x + w + landTol + halfW]` → land; box overlap → side contact sets `vx = 0`;
  underside sets `vy ≤ 0`; pitch walls are side contact.
- Holds: caught when the hand point's swept segment passes within `holdReach` of the centre (launch
  element ignored; hidden holds only once revealed).
- **Wind** acts only in flight: inside a zone `ax = dir · accel · windScale` while
  `(t − offset) mod period < gust`. Pitch clock `t` advances in fixed steps; gusts are telegraphed
  `windTelegraph` s early (bending grass, streaks, flag). The preview simulates with wind at the live clock.
- **Crumble**: timer starts at landing; shake/cracks/dust only (no numeric or radial countdown); gives way at
  `crumbleDelay`. A crumbled ledge comes back when she lands/catches anywhere else or after a rope catch,
  never while she stands on it. Crumbly ledges draw exactly like solid ones until she has landed on them
  once (`foundCrumbles`), then show cracks.
- **Hidden holds**: revealed when the hand point passes within `hiddenRevealRadius` while descending on a
  leap that ends as a whipper; collidable only from the next launch; persisted in `revealedHolds`;
  "Spotted a hold on the way down!" (goat line).
- **Whipper** (a fall) = the rope catches her (below `lastCamp.y − ropeSlack`), OR the leap ends on an
  element more than `slipDrop` (40) units below the launch point that isn't the next route element, OR a
  crumble collapse. Every whipper: chalk arc (launch → rest), fall pose (rope catch: during the swing;
  slip: a flop-landing), `whippers++`, `fallsBySpot[launchId]++`. Landing back on the launch element is a
  neutral hop (no count). Rope catch: swing (`ropeSwingTime`) + reel to camp (`ropeReelTime`), ready again
  < 0.9 s, routeArcs truncated back to that camp, crumbled ledges restored.
- **Preview**: dotted arc of the first `previewFraction` (0.40; Big Leap 0.18) of
  `T_ref = max(2·vy/g, previewMinTime)` — always before the apex for upward leaps; cut at first contact;
  no contact marker. Validator asserts each route solution lands after its preview ends, and Big Leap
  previews end ≥ 60 units short of the target.
- **Clock freeze**: pitch clock, crumble timers and wind freeze while a blocking prompt is open or
  `document.hidden`; frame delta clamped to 0.1 s. Blocking prompts never open while she stands on a
  crumbly ledge.

## Validator (`tests/levels/*.test.ts` + `src/game/solver.ts`)

Brief-mandated thresholds are **literal constants in the validator test file**, passed into the solver —
NOT imported from `tuning.ts`: `MAX_POWER = 0.85`, `ANGLE_TOL = 4`, `POWER_TOL = 0.06` (absolute),
`AIM_ALLOWANCE = 1.2 s`, `WIND_TIMING_TOL = 0.25 s`. Changing them is a reject. Grid resolution (1°, 0.01)
lives in the solver.

For each level (lesson + p01–p16) and each route step `route[i] → route[i+1]`:
1. Start state = standing at `standX`, or hanging; candidate launch time = the pitch clock.
2. Grid: angle −20°…200° × power `minPower`…0.91, `minPower = ceil100(cancelPx / maxDragPxMin)` (the
   smallest leap a phone can release). Success = first contact lands/catches `route[i+1]`, in every world
   variant (hidden holds hidden AND revealed).
3. Forgiving cell: every cell within ±4° and ±0.06 succeeds (whole box ≥ `minPower`). Best = forgiving
   cell at ≤ 0.85 maximising the scaled box, tie → lower power.
4. Wind levels: search launch times (calm first, 0.05 s steps) and require the forgiving box to also land
   at ±0.25 s. Crumble launch steps: `settleTime + AIM_ALLOWANCE < crumbleDelay`.
5. Structural rules above (route, camps, Looks Scary placement, hidden-hold checks, preview checks).
6. Writes `src/game/levels/solutions.json`: per level `{ levelHash, steps: StepSolution[], ghosts:
   Record<elementId, StepSolution> (every non-route element → nearest route element above),
   difficulty: { minSuccessFraction, meanSuccessFraction } }`. Rewritten only when changed.
   `scripts/check-solutions.mjs` (prebuild) fails the build if a level hash is stale.
7. Ramp (reported, checked by eye in the Stage 4/7 reports — not hard-asserted, so levels aren't bent to a
   metric): per-pitch smallest forgiving margin + success fraction; p01 should be the most forgiving and
   later zones should not be more forgiving than earlier ones.
8. Also asserted: level ids are exactly lesson + p01–p16; zones p01–03 meadow, p04–06 hollow, p07–09
   crumble, p10–12 ridge, p13–15 cloud, p16 summit; every route has ≥ 2 steps; each step's rope line is the
   last route camp at or before `route[i]`; the lesson's fall spot reaches nothing (every non-cancelled
   release from it ends in a rope catch); `looksScary.kind` matches its zone.
Failing pitch → edit the LEVEL. Never the validator, thresholds or tolerances.

---

## Screens and flows

- **Shell**: persistent mute toggle (top-right, safe-area aware, 56 px, every screen incl. setup + climb).
  "Test mode" pill on camp + climb HUD while test mode is on.
- **Words** (`ui/term.ts` + `content/glossary.ts`): pitch, whipper, beta, send, cairn, chalk, hold. The
  first time a word renders anywhere (DOM or climb toast) its ≤ 12-word definition shows inline once and
  the word joins `glossarySeen`.
- **First run** `#/setup/*` (target ≈ 150 s, every kid screen pre-filled with one big Next):
  - parent `hello` (what this is in 2 lines; tip to set up from the Home Screen icon when not standalone;
    PIN pad, enter + confirm) ≈ 25 s → `names` (what she calls each parent, 1–4 fields; daily minutes
    stepper, default 20) ≈ 20 s → `handover` ("Hand it to your climber") ≈ 5 s.
  - kid `climber` (designer, random starting look) ≈ 35 s → `goat` (the goat peeks out of the backpack,
    says it's scared of heights; name it, suggestions from `names.ts`) ≈ 20 s → `mountain` (name it,
    suggestions) ≈ 10 s → `lesson` (~20 s: goat prompts a leap to a ledge; then fall practice from a spot
    where nothing is reachable — every release falls; a miss on step 1 counts as the fall; idle 6 s → goat
    repeats the aiming hint; the rope catches her: goat's rope line, then "New flop unlocked!" card with
    the whipper definition) → `brave` (brave = safe but scary; if it could really hurt you or someone
    else, stop and tell a grown-up) ≈ 10 s → `cheer` ("{names} can read your cairn to cheer you on.") →
    `#/climb/p01`. The lesson whipper counts (stats, first-whipper badge, its pose).
- **Camp** `#/camp`: cozy scene (tent, fire, cairn, the goat peeking from the backpack, idle line; first
  visit: goat names Sky Lake as where they're going) + big buttons: Climb (Trail Map), Log a brave thing,
  Plans, Cairn, Weather Station, Hall of Flops, Letters (unread count), Wardrobe, Badges, small grown-ups
  (PIN) button. Waiting stones are placed here on a new day.
- **Climb** `#/climb/:id[?night=1]`: full-bleed canvas + DOM HUD (camp button, sinking sun — no numbers,
  goat bubble, beta button when offered). Non-blocking toasts: "New flop unlocked!", word cards,
  "Spotted a hold on the way down!". Blocking (clock frozen): Fear Forecast, How-scary-really, Beta Map,
  Sunset.
- **Log** `#/log` (one question per screen, big buttons): 1 `what` (text field + "Pick an idea" →
  1b `ideas` screen: idea + Oops cards, ALWAYS shows the brave-vs-dangerous line at the top) → 2
  `forecast` (fear scale, tap = next) → 3 `worry` (optional, Skip) → 4 `when` ("I'll do it later" → saved
  to Plans → `#/plans` with goat line | "I already did it!") → 5a `really` (fear scale) → 5b `happened`
  (one line, quick chips, required) → 5c `outcome` (Nailed it / Wobbly, but I did it / Flopped — and I'm
  still here) → 5d `learned` (optional, chips) → `#/cairn?new=<id>` stacking animation + goat stone line
  (over-cap: "The cairn's full for today — this stone goes on tomorrow." and a waiting stone beside the
  pile, tappable).
- **Plans** `#/plans`: each plan: "I did it!" (→ 5a–5d), "Not today" (goat: "Fear won this round. That's
  allowed." + offer "Make it smaller?"; nothing else changes), "Make it smaller" (half of it / with someone
  first / practise at home first / write my own → a NEW plan, `smallerOf` = original, asks its own
  forecast; the original stays unchanged). No dates, counters, streaks or expiry shown.
- **Cairn** `#/cairn[?new=id]`: stacked stones (seeded shapes), stacking animation + clack, tap → read
  back (brave thing story or letter), waiting stones beside the pile, total + what it opened.
- **Weather** `#/weather`: forecast vs really per done brave thing (weather icons), caption "Fear
  forecasts usually come in stormier than the real weather."; friendly empty state until 3.
- **Flops** `#/flops` (museum): tabs Fall poses (16 cards; collected = animated mini rig + name; others
  silhouettes) · My flops (her `flopped` brave things, framed with respect: the brave thing, then
  "What I learned: …"; fallback "What happened: …"; never a joke) · Grown-ups' Wing.
- **Letters** `#/letters`: envelopes; opening one reads the Spotted! note and places a bonus stone (1/day,
  else waits).
- **Wardrobe** `#/wardrobe`: the designer + unlocked gear. **Badges** `#/badges`. **Finale** `#/finale`.
- **Map** `#/map`: the mountain with Sky Lake at the top; 16 pitch markers by zone; locked pitches: "The
  trail ahead is hidden. Add a stone to your cairn to find the way."; after the summit a Day/Night toggle
  (all pitches open at night).
- **Sunset**: when the day's minutes run out she keeps climbing until the current attempt ends (a whipper,
  the send, or reaching a camp — run saved), then "The sun's going down. The mountain will be here
  tomorrow." → camp. Climb/Map taps afterwards show the same card. No lock icons, no sad state. The finale
  always plays even if time ran out on that send. `dailyClimbMinutes = 0` means no limit.
- **Finale** (first send of p16): Beta Map → camera pulls out over all zones ("see everything from the
  top") → the goat climbs out of the backpack for the first time → wobbly leap → splash into Sky Lake →
  both laughing → `summit.reached` (unlocks night + gear). Until `summit.finaleSeen`, every drawing of the
  goat (camp, wardrobe, cards) shows it in/peeking from the backpack. Night summit send: short ending (both
  splash in).
- **Parent** `#/parent` (PIN pad; "Forgot PIN?" → 3 s press-and-hold, then a 2-digit × 2-digit product
  written in words, typed as digits → set a new PIN; a deterrent, not security): settings (daily minutes,
  sound master + music), Spotted! letter, Grown-ups' Wing flop, idea cards (add/remove her custom ones;
  never assign), read cairn + plans (read-only; no counts like "Not today ×4"), How to cheer, data
  (export/import/reset, storage-persist status, update-ready button), test mode toggle.

## Story/voice rules (enforced in content + tests)
- Goat lines: `Record<GoatMoment, GoatLine[]>`, `GoatLine = { text; moral?: true }`, moments: aim,
  aimBigLeap, land, bigLeapLanded, bigLeapMissed, fall, repeatFall, hint (per class: short, long, steep,
  flat, bumped, gust, crumbled), ghost, looksScaryBefore, looksScaryAfter, campIdle, stoneAdded,
  stoneWaiting, flopLogged, notToday, summit, rope (first whipper), lesson, meet, hiddenHold, sunset, send,
  firstCamp. ≥ 80 lines total, each group ≥ 4 (single-purpose groups ≥ 1), each ≤ 12 words. Templates
  (`{goat}`, `{pose}`, `{n}`) are filled from the event (attempt count, pose name, "longer than last
  time") so praise names the specific try. Every goat-spoken string lives in this file.
- Banned (case-insensitive, straight + curly apostrophes, in goat lines AND copy): "don't be scared",
  "do not be scared", "nothing to be scared of", "be brave", "good job", "great job", "well done",
  "nice job", "oh no", "you failed", "try harder", "the lesson", "the moral", "you should", "remember to".
- Line picker (`model/goatVoice.ts`): shuffle-bag per group, never reads forecast/really; at most ONE
  `moral` line per camp arrival (in-pitch camp or hub visit). Narrator copy (`copy.ts`) states no morals.
- Beta hint (`game/beta.ts`): target = next route element after the highest route element reached this
  run. Classify her last failed arc against the saved solution / target: short, long, steep, flat,
  bumped (side contact), gust, crumbled → that hint group. Unit-tested per class. Hints are free; accepting
  one or tapping the ghost counts as "asked for beta". On wind steps the ghost pulses in time with the
  calm launch window.

## Badges (`content/badges.ts` + `model/badges.ts`) — exactly these, attempts + courage only
| id | name | trigger |
|---|---|---|
| first-whipper | First Whipper | `stats.whippers ≥ 1` (lesson included) |
| attempts-10 / -50 / -100 | 10 / 50 / 100 Attempts | `whippers + sends ≥ n` |
| big-leap | First Big Leap Tried | a non-cancelled launch from a `bigLeaps.from` toward its `to` |
| oops | First Oops Mission | an Oops brave thing reaches `done` |
| still-here | Flopped — and Still Here | a brave thing with outcome `flopped` |
| smaller-step | A Smaller Step | "Make it smaller" used on a plan with `notTodayCount > 0` |
| beta | Asked for Beta | accepted a hint or tapped the ghost |
| stormy-5 | Stormy Forecasts ×5 | 5 done brave things with `forecast > really` |
Test mode never writes stats, poses, badges, stones or attempts.

## Testing

- **Vitest** (node): migrations (v0 + v1 fixtures, newer-version, corrupt → backup, missing → fresh),
  export/import round-trip, reset keeps backup, stone limits (3/day + queue, letters 1/day, day change),
  climb-time daily cap, attempt counting (whippers/sends/slips/neutral hops), unlock rule (0 stones →
  p01–p02; 1 → p03; 14 → p16), unlockables derivation, badge triggers, storage-key prefix scan,
  content rules (goat lines, banned phrases, ≥ 30 ideas, ≥ 16 oops, 16 poses, ≥ 40 unlockables, glossary
  definitions ≤ 12 words, no empty arrays), beta classification, goat picker (moral cap, no fear input),
  and the level validator.
- **`npm run check:stubs`** (Stage 7): scans src/, index.html, public/, tests/, e2e/ case-insensitively for
  TODO|FIXME|lorem|coming soon|TBD|`.skip(`|`.only(`|`.todo(` and empty content arrays; "placeholder" hits are
  reviewed by hand (HTML input `placeholder=` attributes are legitimate).
- **Playwright** (webkit, `hasTouch`) against `vite preview` of the production build at `/upanyway/`,
  projects 820×1180, 1180×820, 390×844. Drags = dispatched `PointerEvent`s (`pointerType: 'touch'`) that
  start just outside the climber's hit radius; taps via `locator.tap()`. Every test fails on any
  `console.error` / `pageerror`. Specs: first run (incl. lesson; asserts tap count); log a brave thing;
  open pitch 3; send pitch 1 by replaying `solutions.json`; open every camp screen; export (download) +
  re-import; fear-scale targets ≥ 48 px on the phone; offline relaunch (SW controller → `setOffline` →
  reload → camp + climb; Chromium fallback if WebKit can't drive it, logged as a Known issue).

---

## Stages

- [x] **1. Plan** — this file (architecture, schema, level format, file layout), audited against the brief.
- [x] **2. Shell** — Vite/TS, PWA (SW, manifest, icons, deploy workflow), storage + migrations + backup +
      model rules + unit tests, router + guard, shell + mute + audio unlock, UI kit (components, fear scale,
      PIN pad, keyboard avoidance, term helper, goat bubble), climber + goat art (needed by first run),
      first run (lesson route wired; engine lands in Stage 3), parent PIN gate. Exit: first-run e2e passes
      up to the lesson on all three viewports.
- [ ] **3. Climb engine** — physics tuning, input, camera, rope, chalk, Big Leaps, crumble, wind, hidden
      holds, fall-pose rig (16 poses), sfx basics, validator, lesson + pitches 1–2. Exit: validator green
      for lesson/p01/p02; first-run e2e incl. lesson; send-p01 replay e2e.
- [ ] **4. Mountain** — p03–p16 validated, zone art/palettes/particles/fog, Looks Scary moments, 80+ goat
      lines + picker, beta hints + ghost, beta map, night mode, finale.
- [ ] **5. Camp** — cairn + logging flow, plans, weather station, hall of flops, letters, wardrobe, trail
      map, badges, daily stone cap + climb-time sunset, ideas (≥ 30) + Oops (≥ 16) + chips + smaller
      content, post-summit unlockables (≥ 40) in camp + wardrobe.
- [ ] **6. Parent + sound** — parent mode (all pages), How to cheer, export/import/reset, test mode, full
      sound pass (sfx + generative ambient + music toggle).
- [ ] **7. Verify + ship** — full test pass (unit, validator, e2e ×3 + offline), stub search (TODO, FIXME,
      lorem, "coming soon", placeholder text, empty content arrays), personal-identifier grep (pattern kept
      outside the repo), every Oops card checked against schoolwork/safety/feelings (logged), fixes,
      README + DEPLOY.md, final report.

## Decisions

(What + why. Newest last.)

1. **World units, y-up, width 400, "screen" = 600.** Altitude-based authoring; camera fits ≥ 420×640.
2. **She settles to a fixed stand point after landing** so attempts from a spot are comparable (chalk shows
   "exactly how short or long"), solutions replay exactly, determinism is visible to her.
3. **Drag starts anywhere; cancel = tiny drag OR release on the climber.** The band is drawn from the
   climber; releasing on her cancels, matching "dragging back onto the climber cancels".
4. **"±6% power" = ±0.06 of max power (absolute)** — stricter than relative → more forgiving for her.
   Wind steps must also tolerate ±0.25 s launch timing. Validator thresholds are literals in the test.
5. **Unlock rule exactly as the brief:** pitches 1–2 free; pitch n opens at n−2 stones (placed). No
   "previous pitch sent" gate. Test mode bypasses.
6. **Daily cap overflow waits, never discards.** A 4th brave thing (or 2nd letter) is fully recorded; its
   stone waits beside the cairn and is placed on a later day with room (goat: the cairn's full for today).
7. **Sunset ends at the end of the current attempt** (whipper, send, or reaching a camp). Climb time counts
   only while the climb screen is visible and not frozen.
8. **The lesson's fall is "fall practice"** from a spot where nothing is reachable — leaping knowing you'll
   fall is normal and safe. It counts as her first whipper.
9. **Fall pose choice: seeded RNG biased to unseen poses** (physics never uses randomness).
10. **Climber + goat art are built in Stage 2** (first run needs them); the lesson engine lands in Stage 3.
11. **Service worker without automatic skipWaiting.** An update installs in the background; a waiting
    worker is activated (skip-waiting + one reload) only at boot or while at camp, never mid-climb. Only
    `upanyway:` caches are ever deleted. DEPLOY.md explains how to force an update on the iPad.
12. **The brief stays in `.brief/` (gitignored)**; this file carries the de-personalised checklist. No
    `author` in package.json; LICENSE holder "Up Anyway contributors"; fixtures use generic names.
13. **Forgot PIN = 3 s press-and-hold + a 2-digit × 2-digit product written in words.** A deterrent beyond
    her school maths, not security.
14. **Looks Scary prompts are asked the first time each zone's moment is met**; replays show the reveal
    only. Weather Station + the stormy-5 badge use real brave things only.
15. **Whipper definition** covers rope catches, slips onto a lower non-route ledge (> 40 units down), and
    crumble collapses, so every failed leap gets chalk, a pose and counts as an attempt.
16. **Crumbly ledges look solid until she's landed on them once**, then show cracks forever (her learning
    made visible, like chalk). They regrow after any other landing or a rope catch → no soft-locks.
17. **Hidden holds** reveal on a falling pass, catchable from the next launch, persist per pitch.
18. **Night climbs** use a separate `nightRun`; Trail Map Day/Night toggle after the summit; all pitches
    open at night; the night goat is render-only (never physics/validator).
19. **Sound settings:** `settings.muted` is the one master (her toggle and the parent page change the same
    flag); `settings.music` toggles only the ambient (parent page). `parent.soundOn` removed.
20. **No WebCrypto.** PIN hash = pure-TS SHA-256 with a salt; ids from `crypto.getRandomValues` (works in
    insecure contexts) with a `Math.random` fallback. Lets her play over LAN-http during testing too.
21. **Test mode is a read-time override** (all pitches, night, unlockables, finale replay, no climb cap)
    and climbs in test mode write nothing to her record.
22. **Make it smaller creates a new plan** with its own forecast; the original plan stays, unchanged.
23. **Stone visuals never depend on forecast, really or outcome** (seeded from id only).
24. **Ideas may use everyday, non-identifying school-life details** (canteen, swimming lessons,
    assembly, playtime) but never names of schools, places or people.
25. **Unlockables are derived from stones placed on/after the summit day** (letters included); ≥ 40 items,
    then generated colour variants, so every post-summit stone unlocks something.
26. **Preview includes live wind** (bends during telegraphed gusts — the rhythm is readable) and never
    passes the apex on upward leaps; the ghost on wind steps pulses with the calm window.
27. **"What actually happened?" is required but quick** (chips + free text); worry and learned are
    optional as the brief marks them.
28. **Single JS bundle, `build.target: 'safari15'`, iPadOS 15+ floor.**
29. **Ledges are solid from the top and sides, soft from below** (she can leap up through a ledge and
    land on it on the way down). Head-bonks under unseen ledges were the most frustrating thing in the
    solver data; side contact still stops horizontal motion ("no pinball").
30. **Validator solutions must be clean leaps**: no touching the side of a ledge other than the target.
    Scraping up the target's own side and mantling on, or sliding down a pitch wall, is fine (that is the
    forgiving "side contact stops horizontal motion" rule doing its job).
31. **The take-off ledge holds her until she leaves it**, so a flat or downward leap slides her off the
    edge instead of instantly re-landing. `PHYSICS_VERSION` is part of each level's hash.
32. **Tuning: gravity 980, maxPower 885** (range at full power ≈ 800 units). The ratio maxPower²/gravity
    sets the geometry; raising power made ±6% windows *less* forgiving, so typical steps use 60–80%
    power. Design bands (from solver sweeps): rises 80–120 with dx 100–120 on 110–130 ledges ≈ ×1.25–2.5
    forgiving; rises > 170 are only possible with holds; long traverses (dx > 200) are hard.
33. **Level layout rule** (for every pitch): the next-next element must not sit low above a take-off
    point unless it is ≥ 250 higher; "swing" patterns (3 steps one way, then back) work well.
34. **First-run progress uses explicit flags, never "is the value still the default?"** —
    `setup.lookDone` is set by "Looks like me!" (the default look is a look she can pick). Saves without
    the flag count as past the designer once the goat has a name.
35. **Router: pushState + synchronous render + `ROUTE_CHANGE_EVENT`.** Replace navigations fire no
    'hashchange', so overlays/glossary listen to the router's own event; back-depth lives in
    `history.state` so OS back gestures can't desync it; a screen that navigates while mounting is
    unmounted at once (render token); a malformed `%` escape in a route param is "not found", not a crash.
36. **Interim lesson sets `flags.ropeExplained`** (its fall step is the goat's rope line, which says WHY:
    the rope is why climbers can try hard moves). Stage 3's real lesson must play the rope line on its first
    rope catch and set the flag there.
37. **Stored `unlocked` list removed** from SaveData (unlockables are derived — Decision 25). Schema v1 has
    not shipped, so no migration; normalize drops the old field.

## Difficulty ramp (validator report, mean success % of the searched input space / min margin)

| zone | pitches | mean success | min margin |
|---|---|---|---|
| Meadow | p01 9.1 · p02 8.9 · p03 8.6 | ≈ 8.9 | ×1.25 |
| Firefly Hollow | p04 9.0 · p05 9.3 · p06 8.7 | ≈ 9.0 | ×1.00 (p05) |
| Crumble Cliffs | p07 8.1 · p08 7.9 · p09 6.9 | ≈ 7.6 | ×1.00 |
| Gusty Ridge | p10 6.7 · p11 6.2 · p12 5.7 | ≈ 6.2 | ×1.00 |
| Cloud Steps | p13 7.3 · p14 6.9 · p15 6.3 | ≈ 6.8 | ×1.00 |
| Summit | p16 7.9 | 7.9 | ×1.25 |

Holds make Firefly Hollow about as forgiving as the meadow (holds catch from any direction); wind makes Gusty
Ridge the hardest zone by this metric, and the fog zone's Big Leaps are deliberately generous. Real difficulty
for her also comes from the mechanic (crumbles, gust timing, hidden landings), which this metric can't see.

## Known issues

- `src/screens/building.ts` (Stage 2 interim screen for routes built in later stages) must be gone by Stage 5.
- First-run and camp goat lines live in `content/copy.ts` (`GOAT_SETUP`, `GOAT_CAMP`) until Stage 4 creates
  `content/goatLines.ts`: move them into its meet/lesson/campIdle/firstCamp moments, have `screens/camp.ts`
  use the `model/goatVoice.ts` shuffle-bag instead of its local `idleBag`, and point
  `tests/unit/content.test.ts` (banned phrases, ≤ 12 words, no empty lists) at goatLines.ts too.
