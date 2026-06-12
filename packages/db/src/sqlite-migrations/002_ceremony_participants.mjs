export const migration = {
  version: 2,
  name: "ceremony participants",
  up(database) {
    database.exec(`
      create table if not exists ceremony_participants (
        id text primary key,
        project_id text not null references projects(id) on delete cascade,
        run_id text not null references ceremony_runs(id) on delete cascade,
        role text not null,
        status text not null,
        outcome text not null default '',
        summary_md text not null default '',
        questions_md text not null default '',
        risk_md text not null default '',
        payload_json text not null default '{}',
        started_at text,
        finished_at text,
        created_at text not null,
        updated_at text not null,
        unique (run_id, role)
      );
      create index if not exists idx_ceremony_participants_status on ceremony_participants(status);
    `);
  },
};
