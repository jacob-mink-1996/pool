export const migration = {
  version: 5,
  name: "merge run claims and nullable finished_at",
  up(database) {
    let mergeRunInfo = database.prepare("pragma table_info(merge_runs)").all();
    let mergeRunColumns = new Set(mergeRunInfo.map((row) => row.name));
    if (!mergeRunColumns.has("failure_kind")) {
      database.exec("alter table merge_runs add column failure_kind text not null default ''");
    }
    if (!mergeRunColumns.has("claim_token")) {
      database.exec("alter table merge_runs add column claim_token text not null default ''");
    }
    if (!mergeRunColumns.has("claim_expires_at")) {
      database.exec("alter table merge_runs add column claim_expires_at text");
    }
    mergeRunInfo = database.prepare("pragma table_info(merge_runs)").all();
    if (mergeRunInfo.find((row) => row.name === "finished_at")?.notnull) {
      migrateMergeRunsFinishedAtNullable(database);
    }
  },
};

function migrateMergeRunsFinishedAtNullable(database) {
  database.exec("pragma foreign_keys = off");
  database.exec("pragma legacy_alter_table = on");
  try {
    database.exec("begin");
    database.exec("alter table merge_runs rename to merge_runs_legacy_notnull_finished_at");
    database.exec(`
      create table merge_runs (
        id text primary key,
        project_id text not null references projects(id) on delete cascade,
        ticket_id text not null references tickets(id) on delete cascade,
        status text not null,
        strategy text not null,
        approved_by_kind text not null default '',
        approved_by_ref text not null default '',
        summary_md text not null default '',
        failure_kind text not null default '',
        claim_token text not null default '',
        claim_expires_at text,
        started_at text not null,
        finished_at text
      )
    `);
    database.exec(`
      insert into merge_runs (
        id, project_id, ticket_id, status, strategy, approved_by_kind,
        approved_by_ref, summary_md, failure_kind, claim_token,
        claim_expires_at, started_at, finished_at
      )
      select
        id, project_id, ticket_id, status, strategy, approved_by_kind,
        approved_by_ref, summary_md, failure_kind, claim_token,
        claim_expires_at, started_at, finished_at
      from merge_runs_legacy_notnull_finished_at
    `);
    database.exec("drop table merge_runs_legacy_notnull_finished_at");
    database.exec("create index if not exists idx_merge_runs_project_id on merge_runs(project_id)");
    database.exec("create index if not exists idx_merge_runs_ticket_id on merge_runs(ticket_id)");
    database.exec("commit");
  } catch (error) {
    database.exec("rollback");
    throw error;
  } finally {
    database.exec("pragma legacy_alter_table = off");
    database.exec("pragma foreign_keys = on");
  }
}
