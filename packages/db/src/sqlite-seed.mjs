import { defaultProjectPolicy, defaultRoleProfiles } from "../../config/src/index.mjs";
import { withTransaction } from "./sqlite-runtime.mjs";

const demoProjectId = "project_floop";
const demoRepoId = "repo_project_floop_floop";

const demoTickets = [
  {
    id: "ticket_project_floop_1",
    key: "FLOOP-1",
    title: "Stand up real API service skeleton",
    brief: "Replace bootstrap-root API with the actual product service.",
    state: "WORKING",
    priority: "high",
    acceptanceCriteriaMd: "- health endpoint\n- project listing\n- ticket CRUD shape",
    definitionOfDoneMd: "- service boots\n- domain package wired\n- MVP endpoints respond",
    assignedRole: "developer",
    latestSummary: "API scaffolding in progress",
    branchName: "floop-1-api-skeleton",
    targetScopeMd: "services/api and shared packages",
  },
  {
    id: "ticket_project_floop_2",
    key: "FLOOP-2",
    title: "Define first transport contracts",
    brief: "Codify project, repo, ticket, and event response shapes.",
    state: "READY",
    priority: "high",
    acceptanceCriteriaMd: "- contracts package exists\n- DTOs are shared",
    definitionOfDoneMd: "- backend uses shared contracts",
    assignedRole: "architect",
    latestSummary: "Ready for contract pass",
    branchName: "floop-2-contracts",
    targetScopeMd: "packages/contracts",
  },
];

export function seedDemoProject(database, workspaceRoot, helpers) {
  const timestamp = helpers.now();

  withTransaction(database, () => {
    database
      .prepare(
        `insert into projects (
          id, slug, name, description, workspace_root, default_base_branch, created_at, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        demoProjectId,
        "floop",
        "Floop",
        "Fleet Loop autonomous delivery control plane.",
        workspaceRoot,
        "main",
        timestamp,
        timestamp,
      );

    helpers.insertProjectPolicy(database, demoProjectId, defaultProjectPolicy(), timestamp);
    helpers.insertRoleProfiles(database, demoProjectId, defaultRoleProfiles(), timestamp);

    database
      .prepare(
        `insert into repos (
          id, project_id, slug, name, local_path, remote_url, default_branch, is_primary, created_at, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(demoRepoId, demoProjectId, "floop", "floop", workspaceRoot, "", "main", 1, timestamp, timestamp);

    for (const [index, ticket] of demoTickets.entries()) {
      database
        .prepare(
          `insert into tickets (
            id, project_id, parent_ticket_id, key, title, brief, acceptance_criteria_md,
            definition_of_done_md, state, priority, assigned_role, latest_summary, created_at, updated_at
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          ticket.id,
          demoProjectId,
          null,
          ticket.key,
          ticket.title,
          ticket.brief,
          ticket.acceptanceCriteriaMd,
          ticket.definitionOfDoneMd,
          ticket.state,
          ticket.priority,
          ticket.assignedRole,
          ticket.latestSummary,
          timestamp,
          timestamp,
        );

      database
        .prepare(
          `insert into ticket_repo_targets (
            id, ticket_id, repo_id, base_ref, branch_name, target_scope_md, created_at, updated_at
          ) values (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          `ticket_target_project_floop_${index + 1}`,
          ticket.id,
          demoRepoId,
          "main",
          ticket.branchName,
          ticket.targetScopeMd,
          timestamp,
          timestamp,
        );
    }

    helpers.insertEvent(database, {
      projectId: demoProjectId,
      type: "project.created",
      summary: "Project Floop seeded",
    });
    helpers.insertEvent(database, {
      projectId: demoProjectId,
      repoId: demoRepoId,
      type: "repo.created",
      summary: "Repo floop seeded",
    });
    for (const ticket of demoTickets) {
      helpers.insertEvent(database, {
        projectId: demoProjectId,
        ticketId: ticket.id,
        type: "ticket.created",
        summary: `${ticket.key} seeded`,
      });
    }
  });
}
