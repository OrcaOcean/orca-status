# Orca status

- **Status page** for clients and sales: https://orcaocean.github.io/orca-status/

## Branches

- `main` holds the source and is changed through pull requests. Nothing writes to it automatically.
- `pages` is what GitHub Pages serves (Settings → Pages → branch `pages`, folder `/`). Only the `Publish status page` workflow writes to it, so don't edit it by hand: the next run replaces everything except `data/history.json`.

## How it works

The page is made of static files with no build step and no dependencies.

- **Live status.** The visitor's browser requests `version.json` from each production service every minute. A service that answers is operational.
- **Publishing.** The `Publish status page` workflow runs on every push to `main` and every 30 minutes. It copies `docs/` to the `pages` branch and keeps the `data/history.json` already there.
- **History.** On each run the workflow also runs `scripts/collect.mjs`, which makes the same requests and records the result in `data/history.json` on `pages`: passed and failed checks per day for the last 90 days. A check only fails after three attempts.
- **Updates.** When the collector sees a new version on production, it adds the time to `releases` in the same file. `scripts/history.seed.json` is the starting point used when `pages` has no history yet; its dates come from the `release-*` tags of the `orca` repository.

The services and their addresses are listed once, in `docs/lib.js`.

## Working on it

Apart from the Orca apps themselves, the services only let `https://orcaocean.github.io` read `version.json`, so the live checks fail when the pages are opened from `localhost` or from a file. The collector has no such limit:

```bash
cp scripts/history.seed.json /tmp/history.json
node scripts/collect.mjs /tmp/history.json
```

Moving the pages to another address (for example `status.withorca.com`) needs that origin added to the `version.json` CORS rules in the `orca` repository.
