# Floop

Floop, short for Fleet Loop, is a project-scoped work orchestration system for autonomous software delivery.

Its core job is to move tickets through a governed loop:

1. Discover or refine work.
2. Assign or pick up a ticket.
3. Execute in an isolated worktree.
4. Review and validate with separate lanes.
5. Merge safely.
6. Record what happened and decide what is next.

Floop is not a chat app for agents. It is a control plane for agent-driven work.

## Repository Shape

- repository root: the real Floop product
- bootstrap harness: moved out to Rook's workspace and used internally

The harness still exists, but it is no longer part of this repository's product
architecture.

## Product Thesis

The human should not have to keep saying "looks good, keep going."

Instead, Floop should:

- track durable ticket state
- create and manage isolated worktrees
- spawn role-specific agent executions
- classify outcomes after every run
- route work to review and validation
- enforce merge policy
- surface only the right decisions to the human

## Core Principles

- Tickets are the unit of autonomy.
- Agents do work; Floop owns coordination.
- Execution, review, and validation are separate lanes.
- Every continuation needs an explicit reason.
- Merge is a controlled action, never an implicit side effect.
- Multi-repo work is a first-class design concern.
- The UI is for project management, not agent chit-chat.

## Initial Spec Pack

- [RESEARCH.md](./RESEARCH.md)
- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [STATE_MACHINE.md](./STATE_MACHINE.md)
- [CONFIG.md](./CONFIG.md)
- [PHASES.md](./PHASES.md)
- [DB_SCHEMA.md](./DB_SCHEMA.md)
- [API.md](./API.md)
- [UI.md](./UI.md)

## MVP Status

This repository now contains the first real MVP implementation track:

- typed shared domain constants in `packages/domain`
- default policy/profile helpers in `packages/config`
- executable SQLite persistence scaffolding in `packages/db`
- API service with durable project/repo/ticket/event storage in `services/api`
- board and ticket read models backed by shared contracts
- React operator web surface in `apps/web-react` for project settings, delivery policy, agent profiles, board operations, and ticket execution control
- mission-control style frontend polish for board summaries, decision-oriented ticket cards, and a grouped ticket detail rail

### Run The API And Frontend

```bash
npm install
npm run dev
```

The operator UI is served by the API process, so once it is running you can open:

```text
http://127.0.0.1:4318/
```

The root workspace now also exposes explicit frontend aliases:

```bash
npm run dev:web
npm run start:web
```

If you prefer to launch from the frontend workspace directly:

```bash
npm --workspace apps/web-react run dev
```

The API health endpoint stays available at:

```text
http://127.0.0.1:4318/api/v1/health
```

Optional environment variables:

- `FLOOP_DB_PATH` to override the SQLite database file location
- `FLOOP_SEED_DEMO=false` to boot without the seeded demo project
- `FLOOP_HOST` defaults to `127.0.0.1`; setting a non-loopback host requires
  `FLOOP_AUTH_TOKEN`
- `FLOOP_AUTH_TOKEN` protects LAN or Tailscale access via bearer token or
  `x-floop-auth`

### Bootstrap A Real Local Project

To turn a real local git repo into a ready-to-use Floop project without hand-editing project,
repo, policy, and profile settings:

```bash
npm run bootstrap:project -- --repo-path /absolute/path/to/repo --project-name "Client Zero"
```

This command:

- creates or updates the Floop project
- points the primary repo at your local checkout
- enables reviewer and validator gates
- sets the merge-required validation profile to `ci`
- configures a default shell validator profile that records passed `ci` evidence

Optional flags:

- `--base-url http://127.0.0.1:4318`
- `--workspace-root /absolute/path/to/workspace`
- `--project-slug client-zero`
- `--repo-slug client-zero-app`
- `--default-branch main`
- `--ci-command "npm test"`
- `--human-approval-before-merge true`

### Run The Live Operator Demo

Once the API is up with the seeded project, you can drive an end-to-end Mission Control flow against it:

```bash
npm run demo:live
```

This script:

- creates a fresh demo ticket in the seeded project
- starts and completes an execution
- records review and validation evidence
- records a merge with approval metadata
- watches the live project event stream while it runs

Override the target if needed with:

- `FLOOP_BASE_URL=http://127.0.0.1:4318`
- `FLOOP_DEMO_PROJECT_ID=project_floop`

### Record The Usage Demo

To run the self-contained Playwright walkthrough without keeping video output:

```bash
npm run demo:proof
```

To record the walkthrough:

```bash
npm run demo:record
```

Use `npm run demo:proof:keep` to keep the temporary fixture for inspection, or
`npm run demo:record:open` to record and ask the OS to open the latest `.webm`.

Recordings are written under `demo-recordings/` by default and ignored by git.
Set `FLOOP_DEMO_OUTPUT_DIR=/path/to/output` to write them elsewhere. Set
`FLOOP_DEMO_KEEP_FIXTURE=true` only when you need to inspect the temporary
workspace and SQLite database after a run.

### Verify The MVP Loop Automatically

To boot a temporary API instance, point it at a temporary real git repo, and verify the full
execution -> review -> validation -> merge loop automatically:

```bash
npm run verify:mvp
```

Optional environment variables:

- `FLOOP_MVP_REPEAT=3` to run the verification flow multiple times in a row
- `FLOOP_PORT=4318` to pin the temporary API port

### Run Workers Separately

The API process is HTTP-only. Start the background workers in a separate process
against the same SQLite database when you want execution, review, validation,
merge, and ceremony automation to progress:

```bash
npm run start
npm run start:workers
```

You can also run individual worker classes:

```bash
npm run start:worker:execution
npm run start:worker:merge
npm run start:worker:ceremony-automation
npm run start:worker:ceremony-participant
```
