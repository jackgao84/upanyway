# Up Anyway

A cozy climbing game about being scared and doing it anyway, made for a young climber and an iPad.

Real brave things she does in everyday life go on her cairn as stones, and the stones open the
mountain. On the mountain she practises failing somewhere safe: the rope always catches her, every
fall leaves a chalk line and a silly fall pose, and a pitch is "sent in 14 attempts", never "failed
13 times". A fluffy baby mountain goat rides in her backpack. It is scared of heights, says so, and
comes along anyway.

- **Plays offline** once it has been opened from the Home Screen. No accounts, no analytics, no
  network requests; everything stays on the device.
- **Set up in under three minutes**: a grown-up picks a PIN and the names she calls them, then hands
  it over.
- **Grown-ups' corner** (behind the PIN): daily climbing time, Spotted! letters, idea cards, reading
  her cairn, How to cheer, backups, and a test mode.

## Put it on an iPad

See **[DEPLOY.md](DEPLOY.md)**: hosting on GitHub Pages step by step, adding it to the iPad Home
Screen, checking it works offline, updates and backups.

## Work on it

```bash
npm install
npm run dev          # http://localhost:5173/upanyway/
npm run typecheck
npm test             # unit tests + the level validator
npm run validate     # the level validator only
npm run e2e          # Playwright (WebKit, touch) against a production build
npm run check:stubs  # no unfinished-work markers, skipped tests or empty content lists
npm run build        # dist/ for GitHub Pages
```

### Levels are data, proven by a validator

Each pitch is a plain data file in `src/game/levels/` (`p01.ts` … `p16.ts`, plus the first-run lesson):
ledges, holds, camps, wind zones and the required route as an ordered list of ids. The level validator
(`tests/levels/`) uses the game's real, deterministic physics to search angle × power for every step
of every route and insists on a *forgiving* leap: one that still lands at ±4° and ±6% power, at no
more than 85% of full power. It also checks camps (at least one per screen), Big Leaps, hidden holds,
Looks Scary moments and more, and saves the solutions it finds (`src/game/levels/solutions/`), which
the in-game ghost hint and the end-to-end tests replay. To add or change a level: edit the data, run
`npm run validate`, and if a step fails, change the level, never the validator. Every difficulty knob
lives in `src/game/tuning.ts`.

Vite + TypeScript, Canvas 2D for the climb and plain DOM for everything else; no game engine or UI
framework. `PROGRESS.md` explains the architecture, the save format, the level format and every
design decision.

## Licence

MIT. See [LICENSE](LICENSE).
