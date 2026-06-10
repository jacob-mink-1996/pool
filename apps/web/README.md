# Product Web App

This is the real operator-facing Pool web app.

It should become the primary PM surface:

- board
- ticket detail
- refinement
- review and validation evidence
- merge approvals

## MVP Shape

The current sprint aims at a credible operator console, not a generic admin form:

- mission snapshot and board as the home surface
- ticket detail as the main decision rail
- execution, review, validation, merge, dependency, and worktree workflows in one place
- bundle-free browser modules so the app can keep growing without collapsing back into one file

## Frontend Layout

The app is still intentionally simple:

- `index.html`: shell and surface structure
- `styles.css`: visual system and responsive layout
- `app.js`: orchestration, event binding, and surface-level rendering
- `lib/constants.js`: shared enums and display maps
- `lib/dom.js`: DOM references
- `lib/state.js`: client-side state container
- `lib/api.js`: URL builders and fetch helper
- `lib/helpers.js`: formatting, card/status helpers, and small shared utilities

## Local Development

This app is intentionally served by `services/api`; there is no separate bundler yet.

Run it from the repository root with either:

```bash
npm run dev
```

or the explicit frontend alias:

```bash
npm run dev:web
```

You can also start it from this workspace directly:

```bash
npm --workspace apps/web run dev
```

Then open:

```text
http://127.0.0.1:4318/
```
