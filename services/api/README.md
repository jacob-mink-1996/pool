# Product API

This is the real backend service for Floop's MVP control plane.

Current implemented surface:

- SQLite-backed persistence through `packages/db`
- project, repo, ticket, event, and board read-model endpoints
- seeded demo project for local development
- background execution driver for scriptable adapter profiles

Useful environment variables. These keep the existing `POOL_*` names for compatibility:

- `POOL_DB_PATH` to choose the SQLite file path
- `POOL_SEED_DEMO=false` to start without demo data
- `POOL_EXECUTION_POLL_MS` to tune background execution polling

Execution driver notes:

- the API process includes a background execution driver
- `codex` profiles run through `codex exec` automatically
- generic scriptable profiles can still run through `config.command`
- adapter runs receive `POOL_CONTEXT_PATH`, `POOL_RESULT_PATH`, and `POOL_WORKTREE_PATH`
- if the adapter writes structured JSON to `POOL_RESULT_PATH`, Floop persists that outcome and any returned artifacts
- Codex runs also persist the final agent message as a durable artifact

Next steps:

- add dependency CRUD
- deepen ticket detail aggregates
- add a native OpenCode adapter beside the new Codex path
