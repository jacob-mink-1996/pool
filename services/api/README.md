# Product API

This is the real backend service for Pool's MVP control plane.

Current implemented surface:

- SQLite-backed persistence through `packages/db`
- project, repo, ticket, event, and board read-model endpoints
- seeded demo project for local development

Useful environment variables:

- `POOL_DB_PATH` to choose the SQLite file path
- `POOL_SEED_DEMO=false` to start without demo data

Next steps:

- add dependency CRUD
- deepen ticket detail aggregates
- add execution/review/validation resources
