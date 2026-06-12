export const migration = {
  version: 1,
  name: "project policy merge, refinement, and ceremony controls",
  up(database) {
    const policyColumns = new Set(
      database.prepare("pragma table_info(project_policies)").all().map((row) => row.name),
    );
    if (!policyColumns.has("required_validation_command_profile_for_merge")) {
      database.exec(
        "alter table project_policies add column required_validation_command_profile_for_merge text not null default ''",
      );
    }
    if (!policyColumns.has("max_parallel_merges")) {
      database.exec("alter table project_policies add column max_parallel_merges integer not null default 1");
    }
    if (!policyColumns.has("refinement_mode")) {
      database.exec("alter table project_policies add column refinement_mode text not null default 'user_approved'");
    }
    if (!policyColumns.has("ceremony_automation_json")) {
      database.exec("alter table project_policies add column ceremony_automation_json text not null default '{}'");
    }
  },
};
