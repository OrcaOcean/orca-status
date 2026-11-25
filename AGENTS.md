# AGENTS.md

Guidance for AI agents working in this repository. How the page works is in `README.md`.

## Screenshots in pull requests

A pull request that changes what the page shows (anything in `docs/`, or data the page renders) includes before/after screenshots in its description. Take them with production's live data:

```bash
npm ci
git worktree add --detach /tmp/orca-status-before origin/main
node scripts/screenshot.mjs /tmp/orca-status-before/docs /tmp/shots/before '#release'
node scripts/screenshot.mjs docs /tmp/shots/after '#release'
```

- The last argument is the CSS selector of the changed part of the page. Leave it out for full-page shots.
- Each run saves a desktop, a mobile and a dark-mode shot. Show all three, as a table with a Before and an After column.
- Commit the images to the `screenshots` branch under `pr-<number>/`, and embed them with `https://raw.githubusercontent.com/OrcaOcean/orca-status/<commit>/pr-<number>/<file>.png`, using the full commit hash so the links keep working.
- Look at the screenshots before posting them.
