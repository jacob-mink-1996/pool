import { createSqliteStore, defaultDatabasePath } from "../../../packages/db/src/index.mjs";

export function createStore(options = {}) {
  return createSqliteStore({
    filename: options.filename || process.env.POOL_DB_PATH || defaultDatabasePath(process.cwd()),
    seedDemo: options.seedDemo ?? process.env.POOL_SEED_DEMO !== "false",
    workspaceRoot: options.workspaceRoot || process.cwd(),
  });
}
