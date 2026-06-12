export const migration = {
  version: 3,
  name: "event reason metadata",
  up(database) {
    const eventColumns = new Set(database.prepare("pragma table_info(events)").all().map((row) => row.name));
    if (!eventColumns.has("reason_code")) {
      database.exec("alter table events add column reason_code text not null default ''");
    }
    if (!eventColumns.has("reason_source")) {
      database.exec("alter table events add column reason_source text not null default ''");
    }
  },
};
