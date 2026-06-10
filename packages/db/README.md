# Database Package

This package holds the real Pool database artifacts.

The current MVP pass includes:

- the original Postgres-oriented schema draft in `schema.sql`
- an executable SQLite-backed store in `src/index.mjs`
- demo seeding used by the API service and tests

SQLite is the immediate executable persistence path for local MVP work.
Postgres remains the intended long-term control-plane database.
