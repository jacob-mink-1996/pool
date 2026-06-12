import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

export function defaultDatabasePath(cwd = process.cwd()) {
  return resolve(cwd, ".floop", "floop.sqlite");
}

export function openSqliteDatabase({ filename = defaultDatabasePath(), schema, migrate }) {
  if (filename !== ":memory:") {
    mkdirSync(dirname(filename), { recursive: true });
  }

  const database = new DatabaseSync(filename);
  database.exec(schema);
  migrate?.(database);
  return database;
}

export function withTransaction(database, action) {
  database.exec("begin");
  try {
    const result = action();
    database.exec("commit");
    return result;
  } catch (error) {
    database.exec("rollback");
    throw error;
  }
}
