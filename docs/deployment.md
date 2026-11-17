# Deployment on GitHub Pages

GitHub Pages only serves static files, so there is no server and nowhere to hide the Bioto token. Instead, a GitHub Action fetches the data and publishes it as plain JSON next to the website.

```
                  every hour                              browser
Bioto API ────────────────────────►  GitHub Action ───────────────►  Pages  ◄────────  visitors
(token in GitHub Secrets)            scripts/build-pages.js          api/*.json         never see a token,
                                     1 request per run                                  never call Bioto
```

The live site is <https://mathijs-04.github.io/Hackaton-Immersive-Tech/>.

## The two workflows (`.github/workflows/`)

| Workflow | When | Secrets | Bioto requests |
|---|---|---|---|
| `pages-refresh.yml` — *Hourly data refresh* | every hour at :17 (and manually) | yes | **one** per run |
| `pages-deploy.yml` — *Deploy site* | on every push to `main` (and manually) | **no** | none; reuses the data already online |

Both run `scripts/build-pages.js` (build the site into `dist/`) and `scripts/verify-dist.js` (check it), and then publish `dist/`.

## One-time setup (repository owner)

1. **Secrets:** repository → Settings → Secrets and variables → Actions → *New repository secret*: `BIOTO_TOKEN` and `GARDEN_UUID` (the same values as in your local `.env`).
2. **Pages:** Settings → Pages → *Build and deployment* → Source: **GitHub Actions**.
3. Push to `main`. The site is published, and the next `hh:17` run starts refreshing the data. (Free GitHub Pages needs a public repository.)

## What is public, what is not

| Public (site and repository) | Never public |
|---|---|
| Garden name, GPS position and the hourly sensor readings (`api/*.json`) | `BIOTO_TOKEN` and `GARDEN_UUID` (only in GitHub Secrets) |
| Area layout and planting plan (`static-data/`) | `.env` (git-ignored) |

`scripts/verify-dist.js` **fails the deploy** if the token or garden id appears in any published file, if `.env`, `.git` or `node_modules` content is present, or if any link or import is broken (including wrong upper/lower case, which matters on GitHub's Linux servers).

## The API request budget

- **One request per run** (`/partner/garden/{uuid}/`). The layout and planting plan are committed in `static-data/` and never requested again.
- **One run per hour**, so at most **24 requests a day**, with no end date.
- **Cooldown:** a run skips the API if the published site was refreshed less than 45 minutes ago (protects against double triggers and manual runs).
- **Retries:** at most two attempts, only for server or network errors. A 4xx answer such as a bad token is never retried, and the site keeps its existing data.
- Visitors' browsers only read our own `api/*.json`.
- Optional end date: set `activeUntil` in `pages.config.json` (ISO date, UTC) to stop automatically. The first run after that moment disables the workflow. An unreadable date counts as "ended", so a typo can never cause extra calls. `null` means no end.

> `npm start` with a token also calls the API once per hour. Stop the local server when you are not using it, so the combined load stays at about one request per hour.

> GitHub switches off scheduled workflows in a public repository after 60 days without any repository activity (a push is enough). If the data stops updating after a quiet period, re-enable *Hourly data refresh* under Actions.

## Operating it

- **Refresh now:** Actions → *Hourly data refresh* → *Run workflow* (skipped by the cooldown if the last refresh was less than 45 minutes ago).
- **Stop:** Actions → *Hourly data refresh* → ⋯ → *Disable workflow*.
- **If the live data stops** (a bad token, an outage, or a disabled workflow), the site stays online. After 6 hours without a new reading the garden switches to *archive mode*: it shows the last recorded moment ("Laatste opname") and says so.
- **Plants or layout changed in Bioto:** see [how it works](how-it-works.md#9-changing-the-plants); the new `layout.json` and `planting.json` go into `static-data/`.

## Building the site yourself

```bash
npm ci
npm run build:site       # builds dist/ without any API request
npm run verify:site      # the same checks as in the workflows
npx serve dist           # or any static file server
```

Add `--refresh` (and set `BIOTO_TOKEN` and `GARDEN_UUID`) to `scripts/build-pages.js` for the single API request the workflow makes.
