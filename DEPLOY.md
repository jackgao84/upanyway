# Putting Up Anyway online and on the iPad

Up Anyway is a static web app. GitHub Pages hosts it for free at
`https://<your-github-name>.github.io/upanyway/`, and the iPad keeps a full copy so it plays with no
internet at all after the first visit. Everything she enters stays on the iPad.

Allow about 15 minutes the first time.

## Before the first push: keep your name out of the public history

The repository is public, and every commit carries an author name and email. Check what yours say:

```bash
git config user.name
git config user.email
git log --format='%an <%ae>' | sort -u
```

If they show your real name or personal email, switch this repository to your GitHub handle and
GitHub's private "noreply" address (find it under GitHub → Settings → Emails, it looks like
`12345678+handle@users.noreply.github.com`):

```bash
git config user.name  "your-github-handle"
git config user.email "12345678+your-github-handle@users.noreply.github.com"
```

Commits made before that still carry the old identity. If you want them changed too, rewrite them
once, before anything is pushed (this changes every commit id, which is fine while nothing is online):

```bash
git rebase -r --root --exec 'git commit --amend --no-edit --reset-author'
```

Optional: GitHub → Settings → Emails → tick **Keep my email addresses private** and **Block command
line pushes that expose my email**.

## 1. Put it on GitHub Pages

1. **Create the repository.** On github.com, make a new **public** repository named exactly
   `upanyway` (no README, no licence; this folder already has them).
   - A different name works too: then add a repository variable (Settings → Secrets and variables →
     Actions → **Variables** → New variable) named `VITE_BASE` with the value `/<the-name>/`, for
     example `/climb/`. The app must be built for the path it is served from.
2. **Push the code** to the `main` branch:
   ```bash
   git remote add origin https://github.com/<your-github-name>/upanyway.git
   git push -u origin main
   ```
3. **Turn on Pages.** In the repository: Settings → Pages → *Build and deployment* → Source:
   **GitHub Actions**. (Nothing else to choose; the workflow in `.github/workflows/deploy.yml` builds
   and publishes the site.)
4. **Wait for the deploy.** Open the **Actions** tab and wait for **Deploy to GitHub Pages** to get a
   green tick (about two minutes). If it ran before Pages was switched on and failed, press
   **Re-run all jobs**.
5. **Open it** in any browser: `https://<your-github-name>.github.io/upanyway/`. You should see
   "Hello, grown-up!". Don't set it up here yet if you're on the iPad — do that from the Home Screen
   icon (next section).

To try it on your computer instead: `npm install`, then `npm run build` and `npm run preview`, and
open `http://localhost:4173/upanyway/`.

## 2. Add it to the iPad Home Screen

1. On the iPad, open **Safari** (it has to be Safari) and go to
   `https://<your-github-name>.github.io/upanyway/`.
2. Tap the **Share** button (the square with an arrow pointing up), scroll down, and tap
   **Add to Home Screen**, then **Add**. An "Up Anyway" icon appears on the Home Screen.
3. **Open Up Anyway from that icon while the iPad is online**, and wait a few seconds on the first
   screen. That first open downloads everything the app needs to play offline.
4. **Do the first-run setup inside the Home Screen app** (PIN, recovery code, what she calls you, then
   hand it over). A Home Screen app keeps its own storage, separate from Safari: a game set up in a
   Safari tab does not appear in the icon's app, and the other way round. Use the icon from now on.
5. **Write down the recovery code.** Right after the PIN, the app shows a 12-character recovery code
   (like `K7QM-4XPA-TR9D`) once. Write it down and keep it somewhere she won't find it, then tap
   **I've written it down**. If the PIN is ever forgotten, **Forgot PIN?** on the grown-ups' door asks
   for this code and lets you choose a new PIN (you then get a new code, because each one works once).
   Lost the code? While you still know the PIN, **Grown-ups → Change PIN → Make a new recovery code**.

## 3. Check that it plays offline

1. Close the app (swipe it away in the app switcher).
2. Turn on **Airplane Mode** (and make sure Wi-Fi is off).
3. Open Up Anyway from the icon. Camp should appear, and Pitch 1 should play.
4. Turn Airplane Mode off again.

If it shows Safari's "not connected" page instead, open it once more from the icon while online,
wait ten seconds on camp, and try again.

## 4. Updates

When you push a change to `main`, the workflow publishes it in about two minutes. On the iPad, the
app downloads the new version quietly the next time it is opened while online, and switches to it
the next time it starts or she goes back to camp (never in the middle of a climb). So: open the app,
wait a moment, close it, open it again. Grown-ups → **Backup and data** also shows **Update ready →
Restart now** when a new version is waiting. Nothing she has saved is lost by an update.

## 5. Backups

Her cairn, plans and climbs live only on the iPad. Every so often, open **Grown-ups → Backup and
data → Save a backup** and keep the file (Share / Save to Files, or Download file). The same page
restores it on a new or reset iPad. Deleting the Home Screen icon deletes the app's data, so save a
backup first. A backup carries the grown-ups' PIN and recovery code as they were when it was saved, and
restoring it brings those back too.

## 6. Sharing the address with another app

GitHub Pages gives all your project sites one web address (`<your-github-name>.github.io`), so Up
Anyway shares it with any other app you host there. Up Anyway is built for that: every saved key and
cache starts with `upanyway:`, its service worker only looks after `/upanyway/`, and it never
deletes anything that isn't its own.

The other app should play by the same rules. In particular, it must **not** register a service
worker at the site root (`/`) that answers every page with its own fallback page: such a worker can
catch `/upanyway/` on the very first visit, before Up Anyway's own worker has installed. If the
other app lives at its own path (for example `/otherapp/`) with its worker scoped there, all is well.
