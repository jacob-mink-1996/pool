import assert from "node:assert/strict";
import { test } from "node:test";
import { sqliteSchema, migrateSchema } from "./sqlite-schema.mjs";
import { latestSqliteMigrationVersion } from "./sqlite-migrations/index.mjs";
import { openSqliteDatabase } from "./sqlite-runtime.mjs";

test("SQLite migrations record the latest ordered schema version", () => {
  const database = openSqliteDatabase({
    filename: ":memory:",
    schema: sqliteSchema,
    migrate: migrateSchema,
  });

  assert.equal(
    Number(database.prepare("pragma user_version").get().user_version),
    latestSqliteMigrationVersion,
  );
  database.close();
});
