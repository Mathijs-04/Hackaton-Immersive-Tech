# Biotopia on GitHub Pages

GitHub Pages only serves static files, so there is no server and no place to hide the Bioto token.
Instead, a GitHub Action fetches the data and publishes it as plain JSON next to the site.

```
                 hourly, 48 h only                      browser
Bioto API  ─────────────────────────►  GitHub Action ─────────────►  Pages  ◄───────  visitors
 (token in GitHub Secrets)             scripts/build-pages.js       api/*.json         (never see a token,
                                       1 request per run                                never call Bioto)
```

## What is public, what is not

| Public on the site / in the repo | Never public |
|---|---|
| Garden name, GPS position, hourly sensor readings (`api/*.json`) | `BIOTO_TOKEN` and `GARDEN_UUID` (only in GitHub Secrets) |
| Area layout and planting plan (`static-data/`) | `.env` (git-ignored) |

`scripts/verify-dist.js` runs before every deploy and **fails the deploy** if the token or garden id appear in
any published file, if `.env` / `.git` / `node_modules` content is present, or if any URL/import is broken.

## API budget (how Bioto is protected from us)

* **One request per run** (`/partner/garden/{uuid}/`). Layout and planting plan are committed once in `static-data/`.
* **One run per hour** (`cron: 17 * * * *`), **only until `activeUntil` in `pages.config.json`** (set it to *go-live + 48 h*).
  The first run after that moment disables the schedule (`gh workflow disable`) and makes no request.
  If `activeUntil` is empty or invalid the workflow never calls the API.
* **Cooldown:** a run skips the API when the published site was refreshed less than 45 minutes ago
  (protects against double triggers and manual runs).
* **Retries:** at most 2 attempts, only for server/network errors; a 4xx (bad token) is never retried.
* Visitors' browsers only read our own `api/*.json`; they never contact Bioto.
* Normal pushes to `main` (`pages-deploy.yml`) have **no secrets** and make **no request**; they reuse the data already online.

Worst case in 48 h: 48 requests (96 if Bioto is down for the whole time, because of the one retry).

> Note: `npm start` (the local server) also calls the API once per hour while it runs, with the same token.
> Stop it when you are not using it, so the combined load stays at about one request per hour.

## One-time setup (repository owner)

1. **Secrets:** repo → Settings → Secrets and variables → Actions → *New repository secret*:
   `BIOTO_TOKEN` and `GARDEN_UUID` (the same values as in your local `.env`).
2. **Pages:** repo → Settings → Pages → *Build and deployment* → Source: **GitHub Actions**.
3. **Start the 48 h window** (at go-live): set `activeUntil` in `pages.config.json` to now + 48 h (UTC, ISO format), merge to `main`.
   The next `hh:17` run starts refreshing. Site: `https://<owner>.github.io/<repo>/`.

## What visitors see after the window

The site stays online with the last data. When the newest reading is more than 6 hours old the app switches to
**archive mode**: the garden shows the last recorded moment (button "Laatste", header "Laatste opname") and the
welcome dialog explains that the live feed has stopped. No fake "now".

## Stopping earlier / restarting

* Stop now: Actions → *Hourly data refresh* → ⋯ → *Disable workflow* (or set `activeUntil` to `null` and push).
* Run once by hand: Actions → *Hourly data refresh* → *Run workflow* (skipped by the 45 min cooldown if too soon).

## Try it locally

```bash
npm ci
node scripts/build-pages.js            # builds dist/ without any API request
node scripts/verify-dist.js            # the same checks as in the workflow
npx serve dist                         # or any static file server
```
