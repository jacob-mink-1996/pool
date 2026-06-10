# Pool

Pool is a project-scoped work orchestration system for autonomous software delivery.

Its core job is to move tickets through a governed loop:

1. Discover or refine work.
2. Assign or pick up a ticket.
3. Execute in an isolated worktree.
4. Review and validate with separate lanes.
5. Merge safely.
6. Record what happened and decide what is next.

Pool is not a chat app for agents. It is a control plane for agent-driven work.

## Repository Shape

- repository root: the real Pool product
- bootstrap harness: moved out to Rook's workspace and used internally

The harness still exists, but it is no longer part of this repository's product
architecture.

## Product Thesis

The human should not have to keep saying "looks good, keep going."

Instead, Pool should:

- track durable ticket state
- create and manage isolated worktrees
- spawn role-specific agent executions
- classify outcomes after every run
- route work to review and validation
- enforce merge policy
- surface only the right decisions to the human

## Core Principles

- Tickets are the unit of autonomy.
- Agents do work; Pool owns coordination.
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
- operator web surface in `apps/web` for project settings, delivery policy, agent profiles, board operations, and ticket execution control
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
npm --workspace apps/web run dev
```

The API health endpoint stays available at:

```text
http://127.0.0.1:4318/api/v1/health
```

Optional environment variables:

- `POOL_DB_PATH` to override the SQLite database file location
- `POOL_SEED_DEMO=false` to boot without the seeded demo project
