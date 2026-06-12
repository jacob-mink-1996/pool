# Product API

This is the real backend service for Floop's MVP control plane.

Current implemented surface:

- SQLite-backed persistence through `packages/db`
- project, repo, ticket, event, and board read-model endpoints
- seeded demo project for local development
- background execution driver for scriptable adapter profiles

Useful environment variables:

- `FLOOP_DB_PATH` to choose the SQLite file path
- `FLOOP_SEED_DEMO=false` to start without demo data
- `FLOOP_EXECUTION_POLL_MS` to tune background execution polling
- `FLOOP_MERGE_POLL_MS` to tune background merge polling
- `FLOOP_CEREMONY_POLL_MS` to tune ceremony automation polling
- `FLOOP_CEREMONY_PARTICIPANT_POLL_MS` to tune ceremony participant polling
- `FLOOP_HOST` defaults to `127.0.0.1`; non-loopback hosts require `FLOOP_AUTH_TOKEN`
- `FLOOP_AUTH_TOKEN` is accepted as `Authorization: Bearer <token>` or `x-floop-auth`

Execution driver notes:

- the API process includes a background execution driver
- `codex` profiles run through `codex exec` automatically
- generic scriptable profiles can still run through `config.command`
- adapter runs receive `FLOOP_CONTEXT_PATH`, `FLOOP_RESULT_PATH`, and `FLOOP_WORKTREE_PATH`
- if the adapter writes structured JSON to `FLOOP_RESULT_PATH`, Floop persists that outcome and any returned artifacts
- Codex runs also persist the final agent message as a durable artifact

Next steps:

- add dependency CRUD
- deepen ticket detail aggregates
- add a native OpenCode adapter beside the new Codex path
