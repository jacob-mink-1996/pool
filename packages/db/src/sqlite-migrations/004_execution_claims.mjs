export const migration = {
  version: 4,
  name: "execution claim leases",
  up(database) {
    const executionColumns = new Set(
      database.prepare("pragma table_info(executions)").all().map((row) => row.name),
    );
    if (!executionColumns.has("claim_token")) {
      database.exec("alter table executions add column claim_token text not null default ''");
    }
    if (!executionColumns.has("claim_expires_at")) {
      database.exec("alter table executions add column claim_expires_at text");
    }
  },
};
