export const migration = {
  version: 6,
  name: "artifact merge run foreign key repair",
  up(database) {
    const artifactForeignKeys = database.prepare("pragma foreign_key_list(artifacts)").all();
    if (artifactForeignKeys.some((row) => row.from === "merge_run_id" && row.table !== "merge_runs")) {
      migrateArtifactsMergeRunReference(database);
    }
  },
};

function migrateArtifactsMergeRunReference(database) {
  database.exec("pragma foreign_keys = off");
  database.exec("pragma legacy_alter_table = on");
  try {
    database.exec("begin");
    database.exec("alter table artifacts rename to artifacts_legacy_merge_run_fk");
    database.exec(`
      create table artifacts (
        id text primary key,
        project_id text not null references projects(id) on delete cascade,
        ticket_id text not null references tickets(id) on delete cascade,
        execution_id text references executions(id) on delete cascade,
        review_id text references reviews(id) on delete cascade,
        validation_run_id text references validation_runs(id) on delete cascade,
        merge_run_id text references merge_runs(id) on delete cascade,
        kind text not null,
        label text not null,
        uri text not null,
        metadata_json text not null default '{}',
        created_at text not null
      )
    `);
    database.exec(`
      insert into artifacts (
        id, project_id, ticket_id, execution_id, review_id, validation_run_id,
        merge_run_id, kind, label, uri, metadata_json, created_at
      )
      select
        id, project_id, ticket_id, execution_id, review_id, validation_run_id,
        merge_run_id, kind, label, uri, metadata_json, created_at
      from artifacts_legacy_merge_run_fk
    `);
    database.exec("drop table artifacts_legacy_merge_run_fk");
    database.exec("create index if not exists idx_artifacts_project_id on artifacts(project_id)");
    database.exec("create index if not exists idx_artifacts_ticket_id on artifacts(ticket_id)");
    database.exec("create index if not exists idx_artifacts_execution_id on artifacts(execution_id)");
    database.exec("create index if not exists idx_artifacts_review_id on artifacts(review_id)");
    database.exec("create index if not exists idx_artifacts_validation_run_id on artifacts(validation_run_id)");
    database.exec("create index if not exists idx_artifacts_merge_run_id on artifacts(merge_run_id)");
    database.exec("commit");
  } catch (error) {
    database.exec("rollback");
    throw error;
  } finally {
    database.exec("pragma legacy_alter_table = off");
    database.exec("pragma foreign_keys = on");
  }
}
