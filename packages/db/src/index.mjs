import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { defaultProjectPolicy, defaultRoleProfiles } from "../../config/src/index.mjs";
import {
  artifactDto,
  ceremonyRunDto,
  executionDto,
  eventDto,
  mergeRunDto,
  mergeQueueItemDto,
  projectBoardDto,
  projectSummaryDto,
  repoDto,
  reviewDto,
  ticketDetailDto,
  ticketSummaryDto,
  validationRunDto,
  worktreeDto,
} from "../../contracts/src/index.mjs";
import { boardStates, isCeremonyType, isRefinementMode, isRoleName, isTicketState } from "../../domain/src/index.mjs";

const SQLITE_SCHEMA = `
pragma foreign_keys = on;

create table if not exists projects (
  id text primary key,
  slug text not null unique,
  name text not null,
  description text not null default '',
  workspace_root text not null,
  default_base_branch text not null,
  created_at text not null,
  updated_at text not null
);

create table if not exists project_policies (
  id text primary key,
  project_id text not null unique references projects(id) on delete cascade,
  require_reviewer integer not null default 1,
  require_validator integer not null default 1,
  require_human_approval_before_merge integer not null default 1,
  required_validation_command_profile_for_merge text not null default '',
  max_parallel_executions integer not null default 1,
  max_parallel_merges integer not null default 1,
  max_auto_continue_iterations integer not null default 3,
  refinement_mode text not null default 'user_approved',
  agent_created_ticket_default_state text not null,
  created_at text not null,
  updated_at text not null
);

create table if not exists agent_profiles (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  role text not null,
  adapter text not null,
  model text not null,
  config_json text not null default '{}',
  created_at text not null,
  updated_at text not null,
  unique (project_id, role)
);

create table if not exists repos (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  slug text not null,
  name text not null,
  local_path text not null,
  remote_url text not null default '',
  default_branch text not null,
  is_primary integer not null default 0,
  created_at text not null,
  updated_at text not null,
  unique (project_id, slug),
  unique (project_id, local_path)
);

create table if not exists tickets (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  parent_ticket_id text references tickets(id) on delete set null,
  key text not null,
  title text not null,
  brief text not null,
  acceptance_criteria_md text not null default '',
  definition_of_done_md text not null default '',
  state text not null,
  priority text not null,
  assigned_role text not null,
  latest_summary text not null default '',
  created_at text not null,
  updated_at text not null,
  unique (project_id, key)
);

create table if not exists ticket_dependencies (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  blocking_ticket_id text not null references tickets(id) on delete cascade,
  blocked_ticket_id text not null references tickets(id) on delete cascade,
  dependency_type text not null default 'finish_to_start',
  created_at text not null,
  unique (blocking_ticket_id, blocked_ticket_id, dependency_type)
);

create table if not exists ticket_repo_targets (
  id text primary key,
  ticket_id text not null references tickets(id) on delete cascade,
  repo_id text not null references repos(id) on delete cascade,
  base_ref text not null,
  branch_name text not null default '',
  target_scope_md text not null default '',
  created_at text not null,
  updated_at text not null,
  unique (ticket_id, repo_id)
);

create table if not exists executions (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  ticket_id text not null references tickets(id) on delete cascade,
  agent_profile_id text references agent_profiles(id) on delete set null,
  role text not null,
  iteration integer not null,
  status text not null,
  outcome text,
  summary_md text not null default '',
  remaining_work_md text not null default '',
  expected_next_evidence_md text not null default '',
  failure_kind text not null default '',
  blocked_kind text not null default '',
  claim_token text not null default '',
  claim_expires_at text,
  started_at text not null,
  finished_at text,
  created_at text not null,
  updated_at text not null,
  unique (ticket_id, role, iteration)
);

create table if not exists worktrees (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  repo_id text not null references repos(id) on delete cascade,
  ticket_id text not null references tickets(id) on delete cascade,
  execution_id text not null references executions(id) on delete cascade,
  path text not null,
  branch_name text not null,
  base_ref text not null,
  status text not null,
  is_dirty integer not null default 0,
  created_at text not null,
  updated_at text not null,
  cleaned_at text,
  unique (repo_id, path)
);

create table if not exists reviews (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  ticket_id text not null references tickets(id) on delete cascade,
  execution_id text not null references executions(id) on delete cascade,
  reviewer_profile_id text references agent_profiles(id) on delete set null,
  verdict text not null,
  summary_md text not null default '',
  findings_count integer not null default 0,
  blocked_kind text not null default '',
  created_at text not null
);

create table if not exists review_findings (
  id text primary key,
  review_id text not null references reviews(id) on delete cascade,
  severity text not null,
  category text not null,
  file_path text not null default '',
  line_number integer,
  title text not null,
  details_md text not null default '',
  created_at text not null
);

create table if not exists validation_runs (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  ticket_id text not null references tickets(id) on delete cascade,
  repo_id text not null references repos(id) on delete cascade,
  execution_id text references executions(id) on delete set null,
  status text not null,
  verdict text not null,
  command_profile text not null default '',
  commands_json text not null default '[]',
  summary_md text not null default '',
  blocked_kind text not null default '',
  started_at text not null,
  finished_at text not null
);

create table if not exists artifacts (
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
);

create table if not exists merge_runs (
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
);

create table if not exists events (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  repo_id text references repos(id) on delete set null,
  ticket_id text references tickets(id) on delete set null,
  type text not null,
  summary text not null,
  detail text not null default '',
  reason_code text not null default '',
  reason_source text not null default '',
  created_at text not null
);

create table if not exists ceremony_runs (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  type text not null,
  status text not null,
  scope_json text not null default '{}',
  input_snapshot_json text not null default '{}',
  summary_md text not null default '',
  questions_md text not null default '',
  risk_md text not null default '',
  created_by_kind text not null default 'human',
  created_by_ref text not null default 'operator',
  started_at text not null,
  finished_at text,
  applied_at text,
  created_at text not null,
  updated_at text not null
);

create table if not exists ceremony_proposals (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  run_id text not null references ceremony_runs(id) on delete cascade,
  kind text not null,
  status text not null,
  summary text not null,
  ticket_id text references tickets(id) on delete set null,
  payload_json text not null default '{}',
  applied_ticket_id text references tickets(id) on delete set null,
  applied_at text,
  created_at text not null,
  updated_at text not null
);

create index if not exists idx_repos_project_id on repos(project_id);
create index if not exists idx_tickets_project_id on tickets(project_id);
create index if not exists idx_ticket_repo_targets_ticket_id on ticket_repo_targets(ticket_id);
create index if not exists idx_ticket_dependencies_blocked_ticket_id on ticket_dependencies(blocked_ticket_id);
create index if not exists idx_executions_project_id on executions(project_id);
create index if not exists idx_executions_ticket_id on executions(ticket_id);
create index if not exists idx_worktrees_project_id on worktrees(project_id);
create index if not exists idx_worktrees_ticket_id on worktrees(ticket_id);
create index if not exists idx_worktrees_execution_id on worktrees(execution_id);
create index if not exists idx_reviews_project_id on reviews(project_id);
create index if not exists idx_reviews_ticket_id on reviews(ticket_id);
create index if not exists idx_review_findings_review_id on review_findings(review_id);
create index if not exists idx_validation_runs_project_id on validation_runs(project_id);
create index if not exists idx_validation_runs_ticket_id on validation_runs(ticket_id);
create index if not exists idx_artifacts_project_id on artifacts(project_id);
create index if not exists idx_artifacts_ticket_id on artifacts(ticket_id);
create index if not exists idx_artifacts_execution_id on artifacts(execution_id);
create index if not exists idx_artifacts_review_id on artifacts(review_id);
create index if not exists idx_artifacts_validation_run_id on artifacts(validation_run_id);
create index if not exists idx_artifacts_merge_run_id on artifacts(merge_run_id);
create index if not exists idx_merge_runs_project_id on merge_runs(project_id);
create index if not exists idx_merge_runs_ticket_id on merge_runs(ticket_id);
create index if not exists idx_events_project_id on events(project_id);
create index if not exists idx_events_ticket_id on events(ticket_id);
create index if not exists idx_ceremony_runs_project_id on ceremony_runs(project_id);
create index if not exists idx_ceremony_proposals_run_id on ceremony_proposals(run_id);
`;

export function defaultDatabasePath(cwd = process.cwd()) {
  return resolve(cwd, ".pool", "pool.sqlite");
}

export function createSqliteStore(options = {}) {
  const filename = options.filename || defaultDatabasePath();
  if (filename !== ":memory:") {
    mkdirSync(dirname(filename), { recursive: true });
  }

  const database = new DatabaseSync(filename);
  database.exec(SQLITE_SCHEMA);
  migrateSchema(database);

  if (options.seedDemo !== false && countProjects(database) === 0) {
    seed(database, options.workspaceRoot || process.cwd());
  }

  return {
    close() {
      database.close();
    },

    listProjects() {
      return database
        .prepare("select id from projects order by created_at asc")
        .all()
        .map((row) => this.getProjectSummary(row.id))
        .filter(Boolean);
    },

    createProject(input) {
      const timestamp = now();
      const slug = requiredText(input.slug, "slug");
      const name = requiredText(input.name, "name");
      const workspaceRoot = normalizeFilesystemPath(requiredText(input.workspaceRoot, "workspaceRoot"));
      const id = `project_${slugify(slug)}`;
      const policy = defaultProjectPolicy();
      const roleProfiles = defaultRoleProfiles();

      withTransaction(database, () => {
        database
          .prepare(
            `insert into projects (
              id, slug, name, description, workspace_root, default_base_branch, created_at, updated_at
            ) values (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            id,
            slug,
            name,
            optionalText(input.description),
            workspaceRoot,
            optionalText(input.defaultBaseBranch, "main"),
            timestamp,
            timestamp,
          );

        insertProjectPolicy(database, id, policy, timestamp);
        insertRoleProfiles(database, id, roleProfiles, timestamp);
        insertEvent(database, {
          projectId: id,
          type: "project.created",
          summary: `Project ${name} created`,
        });
      });

      return this.getProjectSummary(id);
    },

    updateProject(projectId, input) {
      const existing = getProjectRow(database, projectId);
      if (!existing) {
        return null;
      }

      const updates = {};
      const changedFields = [];
      applyTextPatch(updates, changedFields, input, existing, "name", { required: true });
      applyTextPatch(updates, changedFields, input, existing, "description");
      applyTextPatch(updates, changedFields, input, existing, "workspaceRoot", {
        column: "workspace_root",
        required: true,
        transform: normalizeFilesystemPath,
      });
      applyTextPatch(updates, changedFields, input, existing, "defaultBaseBranch", {
        column: "default_base_branch",
        required: true,
      });

      if (changedFields.length === 0) {
        return this.getProjectSummary(projectId);
      }

      const timestamp = now();
      withTransaction(database, () => {
        const clauses = [];
        const values = [];
        for (const [column, value] of Object.entries(updates)) {
          clauses.push(`${column} = ?`);
          values.push(value);
        }

        clauses.push("updated_at = ?");
        values.push(timestamp, projectId);

        database.prepare(`update projects set ${clauses.join(", ")} where id = ?`).run(...values);

        insertEvent(database, {
          projectId,
          type: "project.updated",
          summary: `${existing.name} settings updated`,
          detail: `Updated ${changedFields.join(", ")}`,
        });
      });

      return this.getProjectSummary(projectId);
    },

    deleteProject(projectId) {
      const existing = this.getProjectSummary(projectId);
      if (!existing) {
        return null;
      }

      withTransaction(database, () => {
        database.prepare("delete from projects where id = ?").run(projectId);
      });

      return existing;
    },

    getProjectPolicy(projectId) {
      if (!getProjectRow(database, projectId)) {
        return null;
      }

      const policy = getProjectPolicyRow(database, projectId);
      return policy ? mapProjectPolicy(policy) : null;
    },

    updateProjectPolicy(projectId, input) {
      const project = getProjectRow(database, projectId);
      if (!project) {
        return null;
      }

      const existing = getProjectPolicyRow(database, projectId);
      if (!existing) {
        return null;
      }

      const updates = {};
      const changedFields = [];
      applyBooleanPatch(updates, changedFields, input, existing, "requireReviewer", {
        column: "require_reviewer",
      });
      applyBooleanPatch(updates, changedFields, input, existing, "requireValidator", {
        column: "require_validator",
      });
      applyBooleanPatch(updates, changedFields, input, existing, "requireHumanApprovalBeforeMerge", {
        column: "require_human_approval_before_merge",
      });
      applyTextPatch(updates, changedFields, input, existing, "requiredValidationCommandProfileForMerge", {
        column: "required_validation_command_profile_for_merge",
      });
      applyPositiveIntegerPatch(updates, changedFields, input, existing, "maxParallelExecutions", {
        column: "max_parallel_executions",
      });
      applyPositiveIntegerPatch(updates, changedFields, input, existing, "maxParallelMerges", {
        column: "max_parallel_merges",
      });
      applyPositiveIntegerPatch(updates, changedFields, input, existing, "maxAutoContinueIterations", {
        column: "max_auto_continue_iterations",
      });
      applyRefinementModePatch(updates, changedFields, input, existing);
      applyTextPatch(updates, changedFields, input, existing, "agentCreatedTicketDefaultState", {
        column: "agent_created_ticket_default_state",
        required: true,
      });

      if (changedFields.length === 0) {
        return mapProjectPolicy(existing);
      }

      const timestamp = now();
      withTransaction(database, () => {
        const clauses = [];
        const values = [];
        for (const [column, value] of Object.entries(updates)) {
          clauses.push(`${column} = ?`);
          values.push(value);
        }

        clauses.push("updated_at = ?");
        values.push(timestamp, projectId);

        database.prepare(`update project_policies set ${clauses.join(", ")} where project_id = ?`).run(...values);
        touchProjectUpdatedAt(database, projectId, timestamp);

        insertEvent(database, {
          projectId,
          type: "project.updated",
          summary: `${project.name} policy updated`,
          detail: `Updated policy fields: ${changedFields.join(", ")}`,
        });
      });

      return this.getProjectPolicy(projectId);
    },

    listRoleProfiles(projectId) {
      if (!getProjectRow(database, projectId)) {
        return null;
      }

      return database
        .prepare("select role, adapter, model, config_json from agent_profiles where project_id = ? order by role asc")
        .all(projectId)
        .map(mapRoleProfile);
    },

    updateRoleProfile(projectId, role, input) {
      if (!isRoleName(role)) {
        throw new Error(`Invalid assigned role: ${role}`);
      }

      const project = getProjectRow(database, projectId);
      if (!project) {
        return null;
      }

      const existing = database
        .prepare("select * from agent_profiles where project_id = ? and role = ?")
        .get(projectId, role);
      if (!existing) {
        return null;
      }

      const updates = {};
      const changedFields = [];
      applyTextPatch(updates, changedFields, input, existing, "adapter", { required: true });
      applyTextPatch(updates, changedFields, input, existing, "model", { required: true });

      if (hasOwn(input, "config")) {
        const configJson = JSON.stringify(input.config || {});
        if (existing.config_json !== configJson) {
          updates.config_json = configJson;
          changedFields.push("config");
        }
      }

      if (changedFields.length === 0) {
        return mapRoleProfile(existing);
      }

      const timestamp = now();
      withTransaction(database, () => {
        const clauses = [];
        const values = [];
        for (const [column, value] of Object.entries(updates)) {
          clauses.push(`${column} = ?`);
          values.push(value);
        }

        clauses.push("updated_at = ?");
        values.push(timestamp, projectId, role);

        database
          .prepare(`update agent_profiles set ${clauses.join(", ")} where project_id = ? and role = ?`)
          .run(...values);
        touchProjectUpdatedAt(database, projectId, timestamp);

        insertEvent(database, {
          projectId,
          type: "project.updated",
          summary: `${project.name} ${role} profile updated`,
          detail: `Updated role profile fields: ${changedFields.join(", ")}`,
        });
      });

      return mapRoleProfile(
        database
          .prepare("select role, adapter, model, config_json from agent_profiles where project_id = ? and role = ?")
          .get(projectId, role),
      );
    },

    getProjectSummary(projectId) {
      const project = getProjectRow(database, projectId);
      if (!project) {
        return null;
      }

      const tickets = listTicketRows(database, projectId);
      const repoCount = Number(
        database.prepare("select count(*) as count from repos where project_id = ?").get(projectId).count,
      );

      return projectSummaryDto(
        mapProject(database, project),
        repoCount,
        tickets.length,
        buildBoardSummary(tickets),
      );
    },

    getProjectBoard(projectId, filters = {}) {
      const project = getProjectRow(database, projectId);
      if (!project) {
        return null;
      }

      const ticketRows = listTicketRows(database, projectId, filters);
      const ticketIds = ticketRows.map((ticket) => ticket.id);
      const repoTargetsByTicketId = getRepoTargetsByTicketId(database, ticketIds);
      const latestReviewVerdictsByTicketId = getLatestReviewVerdictsByTicketId(database, projectId, ticketIds);
      const latestValidationVerdictsByTicketId = getLatestValidationVerdictsByTicketId(
        database,
        projectId,
        ticketIds,
      );
      const eventCountsByTicketId = getCountMap(
        database,
        "select ticket_id as ticketId, count(*) as count from events where project_id = ? and ticket_id is not null group by ticket_id",
        [projectId],
      );
      const dependencyCountsByTicketId = getCountMap(
        database,
        "select blocked_ticket_id as ticketId, count(*) as count from ticket_dependencies where project_id = ? group by blocked_ticket_id",
        [projectId],
      );

      const columns = boardStates.map((state) => ({
        state,
        tickets: [],
      }));
      const columnsByState = new Map(columns.map((column) => [column.state, column]));

      for (const ticket of ticketRows) {
        const summary = ticketSummaryDto(mapTicket(ticket), {
          repoTargets: repoTargetsByTicketId.get(ticket.id) || [],
          latestReviewVerdict: latestReviewVerdictsByTicketId.get(ticket.id) || "",
          latestValidationVerdict: latestValidationVerdictsByTicketId.get(ticket.id) || "",
          eventCount: eventCountsByTicketId.get(ticket.id) || 0,
          dependencyCount: dependencyCountsByTicketId.get(ticket.id) || 0,
        });
        const column = columnsByState.get(mapTicketStateToBoardState(ticket.state));
        column.tickets.push(summary);
      }

      for (const column of columns) {
        column.tickets.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
      }

      return projectBoardDto(mapProject(database, project), columns, {
        totalTickets: ticketRows.length,
        generatedAt: now(),
      });
    },

    listMergeQueue(projectId) {
      if (!getProjectRow(database, projectId)) {
        return null;
      }

      const tickets = listTicketRows(database, projectId, {
        states: ["READY_TO_MERGE"],
      }).map(mapTicket);
      const worktreesByTicketId = getWorktreesByTicketId(database, projectId, tickets.map((ticket) => ticket.id));

      return tickets.map((ticket) =>
        mergeQueueItemDto(ticket, buildMergeStatus(database, ticket, worktreesByTicketId.get(ticket.id) || [])),
      );
    },

    listCeremonyRuns(projectId) {
      if (!getProjectRow(database, projectId)) {
        return null;
      }

      const runs = database
        .prepare("select * from ceremony_runs where project_id = ? order by created_at desc limit 20")
        .all(projectId)
        .map(mapCeremonyRun);
      const proposalsByRunId = getCeremonyProposalsByRunId(
        database,
        projectId,
        runs.map((run) => run.id),
      );
      return runs.map((run) => ceremonyRunDto(run, proposalsByRunId.get(run.id) || []));
    },

    getCeremonyRun(projectId, runId) {
      const row = database
        .prepare("select * from ceremony_runs where project_id = ? and id = ?")
        .get(projectId, runId);
      if (!row) {
        return null;
      }
      const run = mapCeremonyRun(row);
      return ceremonyRunDto(run, getCeremonyProposalsByRunId(database, projectId, [run.id]).get(run.id) || []);
    },

    createCeremonyRun(projectId, input) {
      const project = getProjectRow(database, projectId);
      if (!project) {
        return null;
      }
      if (!isCeremonyType(input.type)) {
        throw new Error(`Invalid ceremony type: ${input.type}`);
      }

      const timestamp = now();
      const runId = `ceremony_${randomUUID()}`;
      const snapshot = buildCeremonyInputSnapshot(database, projectId);
      const proposals = buildCeremonyProposals(input.type, snapshot, timestamp);
      const summary = buildCeremonySummary(input.type, snapshot, proposals);
      const run = {
        id: runId,
        projectId,
        type: input.type,
        status: "proposed",
        scope: input.scope || {},
        inputSnapshot: snapshot,
        summaryMd: summary.summaryMd,
        questionsMd: summary.questionsMd,
        riskMd: summary.riskMd,
        createdByKind: optionalText(input.createdByKind, "human"),
        createdByRef: optionalText(input.createdByRef, "operator"),
        startedAt: timestamp,
        finishedAt: timestamp,
        appliedAt: "",
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      withTransaction(database, () => {
        database
          .prepare(
            `insert into ceremony_runs (
              id, project_id, type, status, scope_json, input_snapshot_json, summary_md,
              questions_md, risk_md, created_by_kind, created_by_ref, started_at,
              finished_at, applied_at, created_at, updated_at
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            run.id,
            run.projectId,
            run.type,
            run.status,
            JSON.stringify(run.scope),
            JSON.stringify(run.inputSnapshot),
            run.summaryMd,
            run.questionsMd,
            run.riskMd,
            run.createdByKind,
            run.createdByRef,
            run.startedAt,
            run.finishedAt,
            run.appliedAt || null,
            run.createdAt,
            run.updatedAt,
          );

        insertEvent(database, {
          projectId,
          type: "ceremony.started",
          summary: `${prettyCeremonyType(input.type)} started`,
          detail: `${snapshot.tickets.length} ticket(s), ${snapshot.repos.length} repo(s) in scope.`,
          reasonCode: input.type,
          reasonSource: "ceremony",
        });

        for (const proposal of proposals) {
          database
            .prepare(
              `insert into ceremony_proposals (
                id, project_id, run_id, kind, status, summary, ticket_id,
                payload_json, applied_ticket_id, applied_at, created_at, updated_at
              ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(
              proposal.id,
              projectId,
              runId,
              proposal.kind,
              "pending",
              proposal.summary,
              proposal.ticketId || null,
              JSON.stringify(proposal.payload || {}),
              null,
              null,
              timestamp,
              timestamp,
            );
        }

        insertEvent(database, {
          projectId,
          type: "ceremony.proposed",
          summary: `${prettyCeremonyType(input.type)} proposed ${proposals.length} change(s)`,
          detail: summary.summaryMd,
          reasonCode: input.type,
          reasonSource: "ceremony",
        });
      });

      return this.getCeremonyRun(projectId, runId);
    },

    applyCeremonyRun(projectId, runId, input = {}) {
      const run = database
        .prepare("select * from ceremony_runs where project_id = ? and id = ?")
        .get(projectId, runId);
      if (!run) {
        return null;
      }

      const requestedIds = new Set(input.proposalIds || []);
      const proposals = getCeremonyProposalRows(database, projectId, runId)
        .filter((proposal) => proposal.status === "pending")
        .filter((proposal) => requestedIds.size === 0 || requestedIds.has(proposal.id));
      const timestamp = now();
      const applied = [];

      for (const proposal of proposals) {
        const payload = parseJsonObject(proposal.payload_json, {});
        const appliedTicketId = applyCeremonyProposal(this, projectId, proposal, payload);
        database
          .prepare(
            `update ceremony_proposals
             set status = 'applied', applied_ticket_id = ?, applied_at = ?, updated_at = ?
             where project_id = ? and id = ?`,
          )
          .run(appliedTicketId || null, timestamp, timestamp, projectId, proposal.id);
        applied.push(proposal);
      }

      const pendingCount = Number(
        database
          .prepare("select count(*) as count from ceremony_proposals where project_id = ? and run_id = ? and status = 'pending'")
          .get(projectId, runId).count,
      );
      database
        .prepare("update ceremony_runs set status = ?, applied_at = ?, updated_at = ? where project_id = ? and id = ?")
        .run(pendingCount === 0 ? "applied" : "partially_applied", timestamp, timestamp, projectId, runId);

      insertEvent(database, {
        projectId,
        type: "ceremony.applied",
        summary: `${prettyCeremonyType(run.type)} applied ${applied.length} proposal(s)`,
        detail: applied.map((proposal) => proposal.summary).join("\n"),
        reasonCode: run.type,
        reasonSource: "ceremony",
      });

      return this.getCeremonyRun(projectId, runId);
    },

    listRepos(projectId) {
      return database
        .prepare("select * from repos where project_id = ? order by created_at asc")
        .all(projectId)
        .map((row) => repoDto(mapRepo(row)));
    },

    createRepo(projectId, input) {
      if (!getProjectRow(database, projectId)) {
        return null;
      }

      const timestamp = now();
      const slug = requiredText(input.slug, "slug");
      const name = requiredText(input.name, "name");
      const localPath = normalizeFilesystemPath(requiredText(input.localPath, "localPath"));
      const repo = {
        id: `repo_${slugify(projectId)}_${slugify(slug)}`,
        projectId,
        slug,
        name,
        localPath,
        remoteUrl: optionalText(input.remoteUrl),
        defaultBranch: optionalText(input.defaultBranch, "main"),
        isPrimary: Boolean(input.isPrimary),
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      withTransaction(database, () => {
        database
          .prepare(
            `insert into repos (
              id, project_id, slug, name, local_path, remote_url, default_branch, is_primary, created_at, updated_at
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            repo.id,
            repo.projectId,
            repo.slug,
            repo.name,
            repo.localPath,
            repo.remoteUrl,
            repo.defaultBranch,
            repo.isPrimary ? 1 : 0,
            repo.createdAt,
            repo.updatedAt,
          );

        insertEvent(database, {
          projectId,
          repoId: repo.id,
          type: "repo.created",
          summary: `Repo ${repo.name} registered`,
        });
      });

      return repoDto(repo);
    },

    updateRepo(projectId, repoId, input) {
      const existing = database.prepare("select * from repos where project_id = ? and id = ?").get(projectId, repoId);
      if (!existing) {
        return null;
      }

      const updates = {};
      const changedFields = [];
      applyTextPatch(updates, changedFields, input, existing, "name", { required: true });
      applyTextPatch(updates, changedFields, input, existing, "localPath", {
        column: "local_path",
        required: true,
        transform: normalizeFilesystemPath,
      });
      applyTextPatch(updates, changedFields, input, existing, "remoteUrl", { column: "remote_url" });
      applyTextPatch(updates, changedFields, input, existing, "defaultBranch", {
        column: "default_branch",
        required: true,
      });
      applyBooleanPatch(updates, changedFields, input, existing, "isPrimary", { column: "is_primary" });

      if (changedFields.length === 0) {
        return repoDto(mapRepo(existing));
      }

      const timestamp = now();
      withTransaction(database, () => {
        if (updates.is_primary === 1) {
          database.prepare("update repos set is_primary = 0, updated_at = ? where project_id = ?").run(timestamp, projectId);
        }

        const clauses = [];
        const values = [];
        for (const [column, value] of Object.entries(updates)) {
          clauses.push(`${column} = ?`);
          values.push(value);
        }

        clauses.push("updated_at = ?");
        values.push(timestamp, projectId, repoId);

        database
          .prepare(`update repos set ${clauses.join(", ")} where project_id = ? and id = ?`)
          .run(...values);

        insertEvent(database, {
          projectId,
          repoId,
          type: "repo.updated",
          summary: `${existing.name} repo updated`,
          detail: `Updated ${changedFields.join(", ")}`,
        });
      });

      const repo = database.prepare("select * from repos where project_id = ? and id = ?").get(projectId, repoId);
      return repoDto(mapRepo(repo));
    },

    listTickets(projectId, filters = {}) {
      const tickets = listTicketRows(database, projectId, filters);
      const ticketIds = tickets.map((ticket) => ticket.id);
      const repoTargetsByTicketId = getRepoTargetsByTicketId(database, ticketIds);
      const latestReviewVerdictsByTicketId = getLatestReviewVerdictsByTicketId(database, projectId, ticketIds);
      const latestValidationVerdictsByTicketId = getLatestValidationVerdictsByTicketId(
        database,
        projectId,
        ticketIds,
      );
      const eventCountsByTicketId = getCountMap(
        database,
        `select ticket_id as ticketId, count(*) as count
         from events
         where project_id = ? and ticket_id is not null
         group by ticket_id`,
        [projectId],
      );
      const dependencyCountsByTicketId = getCountMap(
        database,
        `select blocked_ticket_id as ticketId, count(*) as count
         from ticket_dependencies
         where project_id = ?
         group by blocked_ticket_id`,
        [projectId],
      );

      return tickets.map((ticket) =>
        ticketSummaryDto(mapTicket(ticket), {
          repoTargets: repoTargetsByTicketId.get(ticket.id) || [],
          latestReviewVerdict: latestReviewVerdictsByTicketId.get(ticket.id) || "",
          latestValidationVerdict: latestValidationVerdictsByTicketId.get(ticket.id) || "",
          eventCount: eventCountsByTicketId.get(ticket.id) || 0,
          dependencyCount: dependencyCountsByTicketId.get(ticket.id) || 0,
        }),
      );
    },

    createTicket(projectId, input) {
      if (!getProjectRow(database, projectId)) {
        return null;
      }

      const timestamp = now();
      const state = optionalText(input.state, "PROPOSED");
      if (!isTicketState(state)) {
        throw new Error(`Invalid ticket state: ${state}`);
      }

      const nextIndex =
        Number(
          database
            .prepare(
              "select coalesce(max(cast(substr(key, instr(key, '-') + 1) as integer)), 0) as max_key_index from tickets where project_id = ?",
            )
            .get(projectId).max_key_index,
        ) + 1;
      const key = `POOL-${nextIndex}`;
      const ticketId = `ticket_${slugify(projectId)}_${nextIndex}`;
      const ticket = {
        id: ticketId,
        projectId,
        key,
        title: requiredText(input.title, "title"),
        brief: requiredText(input.brief, "brief"),
        state,
        priority: optionalText(input.priority, "medium"),
        acceptanceCriteriaMd: optionalText(input.acceptanceCriteriaMd),
        definitionOfDoneMd: optionalText(input.definitionOfDoneMd),
        assignedRole: optionalText(input.assignedRole, "developer"),
        latestSummary: optionalText(input.latestSummary, "Ticket created"),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const repoTargets = normalizeRepoTargets(database, projectId, input.repoTargets || []);

      withTransaction(database, () => {
        database
          .prepare(
            `insert into tickets (
              id, project_id, parent_ticket_id, key, title, brief, acceptance_criteria_md,
              definition_of_done_md, state, priority, assigned_role, latest_summary, created_at, updated_at
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            ticket.id,
            ticket.projectId,
            input.parentTicketId || null,
            ticket.key,
            ticket.title,
            ticket.brief,
            ticket.acceptanceCriteriaMd,
            ticket.definitionOfDoneMd,
            ticket.state,
            ticket.priority,
            ticket.assignedRole,
            ticket.latestSummary,
            ticket.createdAt,
            ticket.updatedAt,
          );

        for (const target of repoTargets) {
          insertTicketRepoTarget(database, ticket.id, target, timestamp);
        }

        insertEvent(database, {
          projectId,
          ticketId: ticket.id,
          type: "ticket.created",
          summary: `${ticket.key} created`,
        });
      });

      return this.getTicket(projectId, ticket.id);
    },

    getTicket(projectId, ticketId) {
      const ticket = database
        .prepare("select * from tickets where project_id = ? and id = ?")
        .get(projectId, ticketId);
      if (!ticket) {
        return null;
      }

      const repoTargets = getRepoTargetsByTicketId(database, [ticket.id]).get(ticket.id) || [];
      const dependencies = getDependenciesByBlockedTicketId(database, projectId, [ticket.id]).get(ticket.id) || [];
      const executions = getExecutionsByTicketId(database, projectId, [ticket.id]).get(ticket.id) || [];
      const reviews = getReviewsByTicketId(database, projectId, [ticket.id]).get(ticket.id) || [];
      const validations = getValidationRunsByTicketId(database, projectId, [ticket.id]).get(ticket.id) || [];
      const worktrees = getWorktreesByTicketId(database, projectId, [ticket.id]).get(ticket.id) || [];
      const worktreesByExecutionId = groupWorktreesByExecutionId(worktrees);
      const executionArtifactsByExecutionId = getArtifactsByExecutionId(
        database,
        projectId,
        executions.map((execution) => execution.id),
      );
      const mergeStatus = buildMergeStatus(database, mapTicket(ticket), worktrees);
      const events = this.listEvents(projectId, { ticketId });
      const artifacts = getArtifactsByTicketId(database, projectId, [ticket.id]).get(ticket.id) || [];
      const dependencyCount = Number(
        database
          .prepare("select count(*) as count from ticket_dependencies where project_id = ? and blocked_ticket_id = ?")
          .get(projectId, ticketId).count,
      );

      return ticketDetailDto(mapTicket(ticket), {
        dependencies,
        executions: executions.map((execution) => ({
          ...execution,
          artifacts: executionArtifactsByExecutionId.get(execution.id) || [],
          worktrees: worktreesByExecutionId.get(execution.id) || [],
        })),
        reviews,
        validations,
        repoTargets,
        worktrees,
        artifacts,
        mergeStatus,
        dependencyCount,
        eventCount: events.length,
        events,
      });
    },

    updateTicket(projectId, ticketId, input) {
      const existing = database
        .prepare("select * from tickets where project_id = ? and id = ?")
        .get(projectId, ticketId);
      if (!existing) {
        return null;
      }

      const updates = {};
      const changedFields = [];
      applyTicketTextPatch(updates, changedFields, input, existing, "title", { required: true });
      applyTicketTextPatch(updates, changedFields, input, existing, "brief", { required: true });
      applyTicketTextPatch(updates, changedFields, input, existing, "acceptanceCriteriaMd", {
        column: "acceptance_criteria_md",
      });
      applyTicketTextPatch(updates, changedFields, input, existing, "definitionOfDoneMd", {
        column: "definition_of_done_md",
      });
      applyTicketTextPatch(updates, changedFields, input, existing, "priority", { required: true });
      applyTicketTextPatch(updates, changedFields, input, existing, "assignedRole", {
        column: "assigned_role",
        required: true,
      });
      applyTicketTextPatch(updates, changedFields, input, existing, "latestSummary", {
        column: "latest_summary",
      });
      applyParentTicketPatch(database, updates, changedFields, projectId, ticketId, input, existing);
      const nextRepoTargets =
        input.repoTargets === undefined ? null : normalizeRepoTargets(database, projectId, input.repoTargets);
      const repoTargetsChanged =
        nextRepoTargets !== null &&
        !repoTargetsEqual(listTicketRepoTargetRows(database, ticketId), nextRepoTargets);
      if (repoTargetsChanged) {
        changedFields.push("repoTargets");
      }

      if (changedFields.length === 0) {
        return this.getTicket(projectId, ticketId);
      }

      const timestamp = now();
      withTransaction(database, () => {
        const clauses = [];
        const values = [];
        for (const [column, value] of Object.entries(updates)) {
          clauses.push(`${column} = ?`);
          values.push(value);
        }

        if (clauses.length > 0 || repoTargetsChanged) {
          clauses.push("updated_at = ?");
          values.push(timestamp, projectId, ticketId);

          database
            .prepare(`update tickets set ${clauses.join(", ")} where project_id = ? and id = ?`)
            .run(...values);
        }

        if (repoTargetsChanged) {
          syncTicketRepoTargets(database, ticketId, nextRepoTargets, timestamp);
        }

        insertEvent(database, {
          projectId,
          ticketId,
          type: "ticket.updated",
          summary: `${existing.key} updated`,
          detail: `Updated ${changedFields.join(", ")}`,
        });
      });

      return this.getTicket(projectId, ticketId);
    },

    addDependency(projectId, blockedTicketId, input) {
      const blockedTicket = database
        .prepare("select id, key from tickets where project_id = ? and id = ?")
        .get(projectId, blockedTicketId);
      if (!blockedTicket) {
        return null;
      }

      const blockingTicketId = requiredText(input.blockingTicketId, "blockingTicketId");
      if (blockingTicketId === blockedTicketId) {
        throw new Error("A ticket cannot depend on itself");
      }

      const blockingTicket = database
        .prepare("select id, key from tickets where project_id = ? and id = ?")
        .get(projectId, blockingTicketId);
      if (!blockingTicket) {
        return null;
      }
      assertNoDependencyCycle(database, projectId, blockedTicketId, blockingTicketId);

      const existingDependency = database
        .prepare(
          `select id
           from ticket_dependencies
           where project_id = ? and blocked_ticket_id = ? and blocking_ticket_id = ? and dependency_type = ?`,
        )
        .get(
          projectId,
          blockedTicketId,
          blockingTicketId,
          optionalText(input.dependencyType, "finish_to_start"),
        );
      if (existingDependency) {
        return this.getTicket(projectId, blockedTicketId);
      }

      const timestamp = now();
      const dependency = {
        id: `dependency_${randomUUID()}`,
        projectId,
        blockedTicketId,
        blockingTicketId,
        dependencyType: optionalText(input.dependencyType, "finish_to_start"),
        createdAt: timestamp,
      };

      withTransaction(database, () => {
        database
          .prepare(
            `insert into ticket_dependencies (
              id, project_id, blocking_ticket_id, blocked_ticket_id, dependency_type, created_at
            ) values (?, ?, ?, ?, ?, ?)`,
          )
          .run(
            dependency.id,
            dependency.projectId,
            dependency.blockingTicketId,
            dependency.blockedTicketId,
            dependency.dependencyType,
            dependency.createdAt,
          );

        insertEvent(database, {
          projectId,
          ticketId: blockedTicketId,
          type: "dependency.added",
          summary: `${blockedTicket.key} blocked by ${blockingTicket.key}`,
          detail: dependency.dependencyType,
        });
      });

      return this.getTicket(projectId, blockedTicketId);
    },

    removeDependency(projectId, blockedTicketId, dependencyId) {
      const blockedTicket = database
        .prepare("select id, key from tickets where project_id = ? and id = ?")
        .get(projectId, blockedTicketId);
      if (!blockedTicket) {
        return null;
      }

      const dependency = database
        .prepare(
          `select td.id, td.blocked_ticket_id, td.blocking_ticket_id, td.dependency_type, bt.key as blocking_ticket_key
           from ticket_dependencies td
           join tickets bt on bt.id = td.blocking_ticket_id
           where td.project_id = ? and td.blocked_ticket_id = ? and td.id = ?`,
        )
        .get(projectId, blockedTicketId, dependencyId);
      if (!dependency) {
        return null;
      }

      withTransaction(database, () => {
        database.prepare("delete from ticket_dependencies where project_id = ? and id = ?").run(projectId, dependencyId);

        insertEvent(database, {
          projectId,
          ticketId: blockedTicketId,
          type: "dependency.removed",
          summary: `${blockedTicket.key} unblocked from ${dependency.blocking_ticket_key}`,
          detail: dependency.dependency_type,
        });
      });

      return this.getTicket(projectId, blockedTicketId);
    },

    transitionTicket(projectId, ticketId, input) {
      const nextState = requiredText(input.targetState, "targetState");
      if (!isTicketState(nextState)) {
        throw new Error(`Invalid ticket state: ${nextState}`);
      }

      const existing = database
        .prepare("select key from tickets where project_id = ? and id = ?")
        .get(projectId, ticketId);
      if (!existing) {
        return null;
      }

      const timestamp = now();
      const detail = optionalText(input.reason, `Transitioned to ${nextState}`);
      withTransaction(database, () => {
        database
          .prepare("update tickets set state = ?, latest_summary = ?, updated_at = ? where project_id = ? and id = ?")
          .run(nextState, detail, timestamp, projectId, ticketId);

        insertEvent(database, {
          projectId,
          ticketId,
          type: "ticket.transitioned",
          summary: `${existing.key} -> ${nextState}`,
          detail,
        });
      });

      return this.getTicket(projectId, ticketId);
    },

    listExecutions(projectId, ticketId) {
      if (!getTicketRow(database, projectId, ticketId)) {
        return null;
      }

      return database
        .prepare(
          `select * from executions
           where project_id = ? and ticket_id = ?
           order by started_at desc, iteration desc`,
        )
        .all(projectId, ticketId)
        .map((row) => this.getExecution(projectId, row.id));
    },

    listReviews(projectId, ticketId) {
      if (!getTicketRow(database, projectId, ticketId)) {
        return null;
      }

      return (getReviewsByTicketId(database, projectId, [ticketId]).get(ticketId) || []).map(reviewDto);
    },

    createReview(projectId, ticketId, input) {
      const ticket = getTicketRow(database, projectId, ticketId);
      if (!ticket) {
        return null;
      }
      const execution = getExecutionRow(database, projectId, requiredText(input.executionId, "executionId"));
      if (!execution || execution.ticket_id !== ticketId) {
        throw new Error(`Unknown execution for ticket ${ticket.key}: ${input.executionId}`);
      }
      if (!execution.finished_at) {
        throw new Error(`Execution ${execution.id} must be finished before review`);
      }
      if (execution.outcome !== "completed") {
        throw new Error(`Execution ${execution.id} must complete successfully before review`);
      }
      if (ticket.state !== "REVIEWING") {
        throw new Error(`Ticket ${ticket.key} is not ready for review`);
      }

      const policy = requiredProjectPolicy(database, projectId);
      const reviewerProfile = resolveAgentProfileForExecution(
        database,
        projectId,
        "reviewer",
        input.reviewerProfileId,
      );
      const verdict = requiredText(input.verdict, "verdict");
      const findings = input.findings || [];
      const artifacts = input.artifacts || [];
      const timestamp = now();
      const review = {
        id: `review_${randomUUID()}`,
        projectId,
        ticketId,
        executionId: execution.id,
        reviewerProfileId: reviewerProfile.id,
        verdict,
        summaryMd: optionalText(input.summaryMd),
        findingsCount: findings.length,
        blockedKind: optionalText(input.blockedKind),
        createdAt: timestamp,
      };
      const nextState = deriveTicketStateForReviewVerdict(policy, verdict);
      const ticketSummary =
        review.summaryMd ||
        `${ticket.key} review ${verdict === "passed" ? "passed" : verdict === "rework" ? "requested rework" : "blocked"}`;

      withTransaction(database, () => {
        database
          .prepare(
            `insert into reviews (
              id, project_id, ticket_id, execution_id, reviewer_profile_id,
              verdict, summary_md, findings_count, blocked_kind, created_at
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            review.id,
            review.projectId,
            review.ticketId,
            review.executionId,
            review.reviewerProfileId,
            review.verdict,
            review.summaryMd,
            review.findingsCount,
            review.blockedKind,
            review.createdAt,
          );

        for (const finding of findings) {
          database
            .prepare(
              `insert into review_findings (
                id, review_id, severity, category, file_path, line_number, title, details_md, created_at
              ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(
              `review_finding_${randomUUID()}`,
              review.id,
              finding.severity,
              finding.category,
              optionalText(finding.filePath),
              finding.lineNumber || null,
              finding.title,
              optionalText(finding.detailsMd),
              timestamp,
            );
        }

        insertArtifacts(
          database,
          projectId,
          ticketId,
          {
            reviewId: review.id,
          },
          artifacts,
          timestamp,
        );

        database
          .prepare("update tickets set state = ?, latest_summary = ?, updated_at = ? where project_id = ? and id = ?")
          .run(nextState, ticketSummary, timestamp, projectId, ticketId);

        insertEvent(database, {
          projectId,
          ticketId,
          type: "review.completed",
          summary: `${ticket.key} review ${verdict}`,
          detail: review.summaryMd || `${findings.length} finding${findings.length === 1 ? "" : "s"}`,
          ...deriveReviewEventReason(review),
        });
      });

      if (verdict === "passed") {
        startAutoRoutedLaneExecution({
          store: this,
          database,
          projectId,
          ticketId,
          reason: `${ticket.key} review passed; Pool routed the validator lane.`,
        });
      }

      return reviewDto(getReviewsByTicketId(database, projectId, [ticketId]).get(ticketId)[0]);
    },

    listValidations(projectId, ticketId) {
      if (!getTicketRow(database, projectId, ticketId)) {
        return null;
      }

      return (getValidationRunsByTicketId(database, projectId, [ticketId]).get(ticketId) || []).map(
        validationRunDto,
      );
    },

    createValidation(projectId, ticketId, input) {
      const ticket = getTicketRow(database, projectId, ticketId);
      if (!ticket) {
        return null;
      }

      if (input.executionId) {
        const execution = getExecutionRow(database, projectId, input.executionId);
        if (!execution || execution.ticket_id !== ticketId) {
          throw new Error(`Unknown execution for ticket ${ticket.key}: ${input.executionId}`);
        }
        if (!execution.finished_at) {
          throw new Error(`Execution ${execution.id} must be finished before validation`);
        }
        if (execution.outcome !== "completed") {
          throw new Error(`Execution ${execution.id} must complete successfully before validation`);
        }
      }

      if (ticket.state !== "VALIDATING") {
        throw new Error(`Ticket ${ticket.key} is not ready for validation`);
      }

      const repoTargets = getRepoTargetsByTicketId(database, [ticketId]).get(ticketId) || [];
      const repoIds = normalizeValidationRepoIds(database, projectId, ticket, repoTargets, input.repoIds || []);
      const verdict = requiredText(input.verdict, "verdict");
      const timestamp = now();
      const policy = requiredProjectPolicy(database, projectId);
      const nextState = deriveTicketStateForValidationVerdict(policy, verdict);
      const summaryMd = optionalText(input.summaryMd);
      const ticketSummary =
        summaryMd ||
        `${ticket.key} validation ${verdict === "passed" ? "passed" : verdict === "failed" ? "found rework" : "blocked"}`;
      const commandProfile = optionalText(input.commandProfile);
      const commands = input.commands || [];
      const artifacts = input.artifacts || [];
      const validationIds = [];
      const mergePolicyBlocks =
        verdict === "passed"
          ? buildMergePolicyBlocks(policy, getLatestReviewRow(database, projectId, ticketId), {
              verdict,
              command_profile: commandProfile,
            })
          : [];

      withTransaction(database, () => {
        for (const repoId of repoIds) {
          const validationId = `validation_${randomUUID()}`;
          validationIds.push(validationId);
          database
            .prepare(
              `insert into validation_runs (
                id, project_id, ticket_id, repo_id, execution_id, status, verdict,
                command_profile, commands_json, summary_md, blocked_kind, started_at, finished_at
              ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(
              validationId,
              projectId,
              ticketId,
              repoId,
              input.executionId || null,
              "completed",
              verdict,
              commandProfile,
              JSON.stringify(commands),
              summaryMd,
              optionalText(input.blockedKind),
              timestamp,
              timestamp,
            );
        }

        for (const validationId of validationIds) {
          insertArtifacts(
            database,
            projectId,
            ticketId,
            {
              validationRunId: validationId,
            },
            artifacts,
            timestamp,
          );
        }

        database
          .prepare("update tickets set state = ?, latest_summary = ?, updated_at = ? where project_id = ? and id = ?")
          .run(nextState, ticketSummary, timestamp, projectId, ticketId);

        insertEvent(database, {
          projectId,
          ticketId,
          type: "validation.completed",
          summary: `${ticket.key} validation ${verdict}`,
          detail:
            summaryMd ||
            `${repoIds.length} repo target${repoIds.length === 1 ? "" : "s"} · ${commands.length} command${commands.length === 1 ? "" : "s"}`,
          ...deriveValidationEventReason({
            verdict,
            blockedKind: optionalText(input.blockedKind),
            mergePolicyBlock: mergePolicyBlocks[0] || null,
          }),
        });
      });

      return this.listValidations(projectId, ticketId);
    },

    getMergeStatus(projectId, ticketId) {
      const ticket = getTicketRow(database, projectId, ticketId);
      if (!ticket) {
        return null;
      }

      const worktrees = getWorktreesByTicketId(database, projectId, [ticketId]).get(ticketId) || [];
      return buildMergeStatus(database, mapTicket(ticket), worktrees);
    },

    listActiveMergeRuns(projectId = "") {
      const rows = projectId
        ? database
            .prepare(
              `select project_id, id
               from merge_runs
               where project_id = ? and status = 'running' and finished_at is null
               order by started_at asc`,
            )
            .all(projectId)
        : database
            .prepare(
              `select project_id, id
               from merge_runs
               where status = 'running' and finished_at is null
               order by started_at asc`,
            )
            .all();

      return rows.map((row) => this.getMergeRun(row.project_id, row.id)).filter(Boolean);
    },

    getMergeRun(projectId, mergeRunId) {
      const row = database.prepare("select * from merge_runs where project_id = ? and id = ?").get(projectId, mergeRunId);
      if (!row) {
        return null;
      }
      const artifacts = getArtifactsByMergeRunId(database, [mergeRunId]).get(mergeRunId) || [];
      return mergeRunDto({ ...mapMergeRun(row), artifacts });
    },

    startMergeRun(projectId, ticketId, input = {}) {
      const ticket = getTicketRow(database, projectId, ticketId);
      if (!ticket) {
        return null;
      }
      if (ticket.state !== "READY_TO_MERGE") {
        throw new Error(`Ticket ${ticket.key} is not ready for merge`);
      }

      const policy = requiredProjectPolicy(database, projectId);
      const latestReview = getLatestReviewRow(database, projectId, ticketId);
      const latestValidation = getLatestValidationRunRow(database, projectId, ticketId);
      const requiresHumanApproval = readPolicyBoolean(
        policy,
        "requireHumanApprovalBeforeMerge",
        "require_human_approval_before_merge",
      );
      const mergePolicyBlock = describeMergePolicyBlock(policy, latestReview, latestValidation);
      const approvedByKind = optionalText(input.approvedByKind);
      const approvedByRef = optionalText(input.approvedByRef);

      if (mergePolicyBlock) {
        throw new Error(mergePolicyBlock);
      }
      if (input.requireApproval !== false && requiresHumanApproval && (!approvedByKind || !approvedByRef)) {
        throw new Error(`Ticket ${ticket.key} requires human approval before merge`);
      }

      const timestamp = optionalText(input.startedAt, now());
      const claimToken = requiredText(input.claimToken, "claimToken");
      const leaseMs = Number.isInteger(input.leaseMs) && input.leaseMs > 0 ? input.leaseMs : 30_000;
      const mergeRun = {
        id: `merge_${randomUUID()}`,
        projectId,
        ticketId,
        status: "running",
        strategy: requiredText(input.strategy, "strategy"),
        approvedByKind,
        approvedByRef,
        summaryMd: optionalText(input.summaryMd, `${ticket.key} merge running`),
        failureKind: "",
        claimToken,
        claimExpiresAt: addMs(timestamp, leaseMs),
        startedAt: timestamp,
        finishedAt: null,
      };
      const approvalDetail =
        approvedByKind && approvedByRef ? `Approved by ${approvedByKind}:${approvedByRef}` : "No approval recorded";
      assertProjectCanStartMerge(database, projectId, ticket.key);

      const started = withTransaction(database, () => {
        const latestRun = getLatestMergeRunRow(database, projectId, ticketId);
        if (latestRun?.status === "running" && !latestRun.finished_at && !isExpiredIso(latestRun.claim_expires_at, timestamp)) {
          return false;
        }
        if (latestRun?.status === "running" && !latestRun.finished_at && isExpiredIso(latestRun.claim_expires_at, timestamp)) {
          database
            .prepare(
              `update merge_runs
               set status = 'blocked', failure_kind = 'interrupted', summary_md = ?, claim_token = '', claim_expires_at = null, finished_at = ?, started_at = started_at
               where project_id = ? and id = ?`,
            )
            .run(
              "Pool recovered after restart before this merge lane reported a final result.",
              timestamp,
              projectId,
              latestRun.id,
            );
        }

        database
          .prepare(
            `insert into merge_runs (
              id, project_id, ticket_id, status, strategy, approved_by_kind,
              approved_by_ref, summary_md, failure_kind, claim_token, claim_expires_at, started_at, finished_at
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            mergeRun.id,
            mergeRun.projectId,
            mergeRun.ticketId,
            mergeRun.status,
            mergeRun.strategy,
            mergeRun.approvedByKind,
            mergeRun.approvedByRef,
            mergeRun.summaryMd,
            mergeRun.failureKind,
            mergeRun.claimToken,
            mergeRun.claimExpiresAt,
            mergeRun.startedAt,
            mergeRun.finishedAt,
          );

        database
          .prepare("update tickets set latest_summary = ?, updated_at = ? where project_id = ? and id = ?")
          .run(mergeRun.summaryMd, timestamp, projectId, ticketId);

        insertEvent(database, {
          projectId,
          ticketId,
          type: "merge.started",
          summary: `${ticket.key} merge started`,
          detail: `${mergeRun.strategy} · ${approvalDetail}`,
          reasonCode: approvedByKind && approvedByRef ? "merge_approved" : "",
          reasonSource: approvedByKind && approvedByRef ? "approval" : "",
        });
        return true;
      });

      return started ? this.getMergeRun(projectId, mergeRun.id) : null;
    },

    completeMergeRun(projectId, mergeRunId, input = {}) {
      const mergeRun = database.prepare("select * from merge_runs where project_id = ? and id = ?").get(projectId, mergeRunId);
      if (!mergeRun) {
        return null;
      }
      if (mergeRun.finished_at) {
        return this.getMergeRun(projectId, mergeRunId);
      }

      const ticket = getTicketRow(database, projectId, mergeRun.ticket_id);
      const timestamp = optionalText(input.finishedAt, now());
      const status = optionalText(input.status, "completed");
      const summaryMd = optionalText(input.summaryMd);
      const failureKind = optionalText(input.failureKind);
      const artifacts = input.artifacts || [];
      const ticketSummary =
        summaryMd ||
        `${ticket.key} merge ${status === "completed" ? "completed" : status === "blocked" ? "blocked" : "needs rework"}`;
      const nextState = deriveTicketStateForMergeStatus(status);
      const approvalDetail =
        mergeRun.approved_by_kind && mergeRun.approved_by_ref
          ? `Approved by ${mergeRun.approved_by_kind}:${mergeRun.approved_by_ref}`
          : "No approval recorded";

      withTransaction(database, () => {
        database
          .prepare(
            `update merge_runs
             set status = ?, summary_md = ?, failure_kind = ?, claim_token = '', claim_expires_at = null, finished_at = ?
             where project_id = ? and id = ?`,
          )
          .run(status, summaryMd, failureKind, timestamp, projectId, mergeRunId);

        insertArtifacts(
          database,
          projectId,
          mergeRun.ticket_id,
          {
            mergeRunId,
          },
          artifacts,
          timestamp,
        );

        database
          .prepare("update tickets set state = ?, latest_summary = ?, updated_at = ? where project_id = ? and id = ?")
          .run(nextState, ticketSummary, timestamp, projectId, mergeRun.ticket_id);

        insertEvent(database, {
          projectId,
          ticketId: mergeRun.ticket_id,
          type: "merge.completed",
          summary: `${ticket.key} merge ${status}`,
          detail: summaryMd || `${mergeRun.strategy} · ${approvalDetail}`,
          ...deriveMergeEventReason(status, failureKind),
        });
      });

      return this.getMergeRun(projectId, mergeRunId);
    },

    reconcileActiveMergeRuns(input = {}) {
      const summaryMd = optionalText(
        input.summaryMd,
        "Pool recovered after restart before this merge lane reported a final result.",
      );
      return this.listActiveMergeRuns()
        .map((mergeRun) =>
          this.completeMergeRun(mergeRun.projectId, mergeRun.id, {
            status: "blocked",
            summaryMd,
            failureKind: "interrupted",
          }),
        )
        .filter(Boolean);
    },

    mergeTicket(projectId, ticketId, input) {
      const ticket = getTicketRow(database, projectId, ticketId);
      if (!ticket) {
        return null;
      }
      if (ticket.state !== "READY_TO_MERGE") {
        throw new Error(`Ticket ${ticket.key} is not ready for merge`);
      }

      const policy = requiredProjectPolicy(database, projectId);
      const status = optionalText(input.status, "completed");
      const latestReview = getLatestReviewRow(database, projectId, ticketId);
      const latestValidation = getLatestValidationRunRow(database, projectId, ticketId);
      const requiresHumanApproval = readPolicyBoolean(
        policy,
        "requireHumanApprovalBeforeMerge",
        "require_human_approval_before_merge",
      );
      const mergePolicyBlock = describeMergePolicyBlock(policy, latestReview, latestValidation);
      const approvedByKind = optionalText(input.approvedByKind);
      const approvedByRef = optionalText(input.approvedByRef);

      if (mergePolicyBlock) {
        throw new Error(mergePolicyBlock);
      }
      if (status === "completed" && requiresHumanApproval && (!approvedByKind || !approvedByRef)) {
        throw new Error(`Ticket ${ticket.key} requires human approval before merge`);
      }

      const timestamp = now();
      const summaryMd = optionalText(input.summaryMd);
      const ticketSummary =
        summaryMd ||
        `${ticket.key} merge ${status === "completed" ? "completed" : status === "blocked" ? "blocked" : "needs rework"}`;
      const mergeRun = {
        id: `merge_${randomUUID()}`,
        projectId,
        ticketId,
        status,
        strategy: requiredText(input.strategy, "strategy"),
        approvedByKind,
        approvedByRef,
        summaryMd,
        startedAt: timestamp,
        finishedAt: timestamp,
      };
      const artifacts = input.artifacts || [];
      const nextState = deriveTicketStateForMergeStatus(status);
      const approvalDetail =
        approvedByKind && approvedByRef ? `Approved by ${approvedByKind}:${approvedByRef}` : "No approval recorded";

      const started = this.startMergeRun(projectId, ticketId, {
        strategy: mergeRun.strategy,
        approvedByKind,
        approvedByRef,
        summaryMd: `${ticket.key} merge started`,
        claimToken: `manual-${mergeRun.id}`,
        startedAt: timestamp,
        requireApproval: status === "completed",
      });
      this.completeMergeRun(projectId, started.id, {
        status,
        summaryMd: ticketSummary,
        failureKind: status === "blocked" ? "merge_blocked" : "",
        artifacts,
        finishedAt: timestamp,
      });
      return this.getMergeStatus(projectId, ticketId);
    },

    getExecution(projectId, executionId) {
      const execution = getExecutionRow(database, projectId, executionId);
      if (!execution) {
        return null;
      }

      const ticket = getTicketRow(database, projectId, execution.ticket_id);
      const worktrees = getWorktreesByExecutionId(database, projectId, [execution.id]).get(execution.id) || [];
      const artifacts = getArtifactsByExecutionId(database, projectId, [execution.id]).get(execution.id) || [];
      return executionDto({
        ...mapExecution(execution),
        ticketKey: ticket?.key || "",
        ticketTitle: ticket?.title || "",
        ticketState: ticket?.state || "",
        artifacts,
        worktrees,
      });
    },

    listActiveExecutions() {
      return database
        .prepare(
          `select project_id, id
           from executions
           where finished_at is null and status = 'running'
           order by started_at asc`,
        )
        .all()
        .map((row) => this.getExecution(row.project_id, row.id))
        .filter(Boolean);
    },

    claimExecution(projectId, executionId, input = {}) {
      const claimToken = requiredText(input.claimToken, "claimToken");
      const claimedAt = optionalText(input.claimedAt, now());
      const leaseMs = Number.isInteger(input.leaseMs) && input.leaseMs > 0 ? input.leaseMs : 30_000;
      const leaseExpiresAt = addMs(claimedAt, leaseMs);

      const claimed = withTransaction(database, () => {
        const execution = getExecutionRow(database, projectId, executionId);
        if (!execution || execution.finished_at || execution.status !== "running") {
          return false;
        }
        if (execution.claim_token && execution.claim_token !== claimToken && !isExpiredIso(execution.claim_expires_at, claimedAt)) {
          return false;
        }

        database
          .prepare(
            `update executions
             set claim_token = ?, claim_expires_at = ?, updated_at = ?
             where project_id = ? and id = ?`,
          )
          .run(claimToken, leaseExpiresAt, claimedAt, projectId, executionId);
        return true;
      });

      return claimed ? this.getExecution(projectId, executionId) : null;
    },

    renewMergeRunClaim(projectId, mergeRunId, input = {}) {
      const claimToken = requiredText(input.claimToken, "claimToken");
      const renewedAt = optionalText(input.renewedAt, now());
      const leaseMs = Number.isInteger(input.leaseMs) && input.leaseMs > 0 ? input.leaseMs : 30_000;
      const leaseExpiresAt = addMs(renewedAt, leaseMs);
      const result = database
        .prepare(
          `update merge_runs
           set claim_expires_at = ?
           where project_id = ? and id = ? and claim_token = ? and finished_at is null`,
        )
        .run(leaseExpiresAt, projectId, mergeRunId, claimToken);
      return result.changes > 0 ? this.getMergeRun(projectId, mergeRunId) : null;
    },

    releaseExecutionClaim(projectId, executionId, input = {}) {
      const claimToken = requiredText(input.claimToken, "claimToken");
      const releasedAt = optionalText(input.releasedAt, now());
      database
        .prepare(
          `update executions
           set claim_token = '', claim_expires_at = null, updated_at = ?
           where project_id = ? and id = ? and claim_token = ? and finished_at is null`,
        )
        .run(releasedAt, projectId, executionId, claimToken);
      return this.getExecution(projectId, executionId);
    },

    reconcileActiveExecutions(input = {}) {
      const activeExecutions = this.listActiveExecutions();
      const summaryMd = optionalText(
        input.summaryMd,
        "Pool recovered after restart before this lane reported a final result.",
      );
      const remainingWorkMd = optionalText(
        input.remainingWorkMd,
        "Retry or continue this lane now that the control plane is back online.",
      );

      return activeExecutions
        .map((execution) =>
          this.completeExecution(execution.projectId, execution.id, {
            outcome: "failed",
            summaryMd,
            remainingWorkMd,
            failureKind: "interrupted",
            releaseClaim: true,
          }),
        )
        .filter(Boolean);
    },

    createExecution(projectId, ticketId, input) {
      const ticket = getTicketRow(database, projectId, ticketId);
      if (!ticket) {
        return null;
      }

      const role = requiredText(input.role, "role");
      const agentProfile = resolveAgentProfileForExecution(
        database,
        projectId,
        role,
        input.agentProfileId,
      );

      const runningExecution = database
        .prepare(
          `select id
           from executions
           where project_id = ? and ticket_id = ? and role = ? and status = 'running'`,
        )
        .get(projectId, ticketId, role);
      if (runningExecution) {
        throw new Error(`Execution already running for ${ticket.key} in role ${role}`);
      }

      assertProjectCanStartExecution(database, projectId, ticket.key);

      const nextIteration =
        input.iteration ||
        Number(
          database
            .prepare(
              `select coalesce(max(iteration), 0) as max_iteration
               from executions
               where ticket_id = ? and role = ?`,
            )
            .get(ticketId, role).max_iteration,
        ) +
          1;
      const timestamp = now();
      const reason = optionalText(input.reason, `${ticket.key} execution started`);
      const execution = {
        id: `execution_${randomUUID()}`,
        projectId,
        ticketId,
        agentProfileId: agentProfile.id,
        role,
        iteration: nextIteration,
        status: "running",
        outcome: null,
        summaryMd: "",
        remainingWorkMd: "",
        expectedNextEvidenceMd: "",
        failureKind: "",
        blockedKind: "",
        claimToken: "",
        claimExpiresAt: null,
        startedAt: timestamp,
        finishedAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const worktrees = planExecutionWorktrees(database, projectId, ticket, execution, timestamp);

      withTransaction(database, () => {
        database
          .prepare(
            `insert into executions (
              id, project_id, ticket_id, agent_profile_id, role, iteration, status, outcome,
              summary_md, remaining_work_md, expected_next_evidence_md, failure_kind, blocked_kind,
              claim_token, claim_expires_at, started_at, finished_at, created_at, updated_at
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            execution.id,
            execution.projectId,
            execution.ticketId,
            execution.agentProfileId,
            execution.role,
            execution.iteration,
            execution.status,
            execution.outcome,
            execution.summaryMd,
            execution.remainingWorkMd,
            execution.expectedNextEvidenceMd,
            execution.failureKind,
            execution.blockedKind,
            execution.claimToken,
            execution.claimExpiresAt,
            execution.startedAt,
            execution.finishedAt,
            execution.createdAt,
            execution.updatedAt,
          );

        for (const worktree of worktrees) {
          database
            .prepare(
              `insert into worktrees (
                id, project_id, repo_id, ticket_id, execution_id, path, branch_name,
                base_ref, status, is_dirty, created_at, updated_at, cleaned_at
              ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(
              worktree.id,
              worktree.projectId,
              worktree.repoId,
              worktree.ticketId,
              worktree.executionId,
              worktree.path,
              worktree.branchName,
              worktree.baseRef,
              worktree.status,
              worktree.isDirty ? 1 : 0,
              worktree.createdAt,
              worktree.updatedAt,
              worktree.cleanedAt,
            );
        }

        database
          .prepare(
            "update tickets set state = ?, latest_summary = ?, updated_at = ? where project_id = ? and id = ?",
          )
          .run(deriveTicketStateForExecutionStart(role), reason, timestamp, projectId, ticketId);

        insertEvent(database, {
          projectId,
          ticketId,
          type: "execution.started",
          summary: `${ticket.key} ${role} iteration ${nextIteration} started`,
          detail: reason,
        });

        for (const worktree of worktrees) {
          insertEvent(database, {
            projectId,
            repoId: worktree.repoId,
            ticketId,
            type: "worktree.created",
            summary: `${ticket.key} worktree planned for ${worktree.repoName}`,
            detail: `${worktree.path} @ ${worktree.branchName}`,
          });
        }
      });

      return this.getExecution(projectId, execution.id);
    },

    completeExecution(projectId, executionId, input) {
      const execution = getExecutionRow(database, projectId, executionId);
      if (!execution) {
        return null;
      }

      if (execution.finished_at) {
        return this.getExecution(projectId, executionId);
      }

      const ticket = getTicketRow(database, projectId, execution.ticket_id);
      const policy = requiredProjectPolicy(database, projectId);
      const timestamp = now();
      const outcome = requiredText(input.outcome, "outcome");
      const summaryMd = optionalText(input.summaryMd);
      const remainingWorkMd = optionalText(input.remainingWorkMd);
      const expectedNextEvidenceMd = optionalText(input.expectedNextEvidenceMd);
      const failureKind = optionalText(input.failureKind);
      const blockedKind = optionalText(input.blockedKind);
      const releaseClaim = input.releaseClaim !== false;
      const artifacts = input.artifacts || [];
      const embeddedReview = input.review || null;
      const embeddedValidation = input.validation || null;
      const followupTickets = input.followupTickets || [];
      const nextState = deriveTicketStateForExecutionOutcome(
        ticket.state,
        outcome,
        blockedKind,
        policy,
        execution.role,
      );
      const ticketSummary =
        summaryMd ||
        remainingWorkMd ||
        `${ticket.key} ${execution.role} iteration ${execution.iteration} ${outcome.replace(/_/g, " ")}`;

      withTransaction(database, () => {
        database
          .prepare(
            `update executions
             set status = ?, outcome = ?, summary_md = ?, remaining_work_md = ?,
                 expected_next_evidence_md = ?, failure_kind = ?, blocked_kind = ?,
                 claim_token = ?, claim_expires_at = ?, finished_at = ?, updated_at = ?
             where project_id = ? and id = ?`,
          )
          .run(
            "completed",
            outcome,
            summaryMd,
            remainingWorkMd,
            expectedNextEvidenceMd,
            failureKind,
            blockedKind,
            releaseClaim ? "" : execution.claim_token,
            releaseClaim ? null : execution.claim_expires_at,
            timestamp,
            timestamp,
            projectId,
            executionId,
          );

        database
          .prepare("update worktrees set status = ?, updated_at = ? where project_id = ? and execution_id = ?")
          .run(deriveWorktreeStatusForOutcome(outcome), timestamp, projectId, executionId);

        database
          .prepare("update tickets set state = ?, latest_summary = ?, updated_at = ? where project_id = ? and id = ?")
          .run(nextState, ticketSummary, timestamp, projectId, execution.ticket_id);

        insertArtifacts(
          database,
          projectId,
          execution.ticket_id,
          {
            executionId,
          },
          artifacts,
          timestamp,
        );

        insertEvent(database, {
          projectId,
          ticketId: execution.ticket_id,
          type: "execution.completed",
          summary: `${ticket.key} ${execution.role} iteration ${execution.iteration} ${outcome}`,
          detail: summaryMd || remainingWorkMd || failureKind || blockedKind || "",
          ...deriveExecutionEventReason({ outcome, failureKind, blockedKind }),
        });
      });

      for (const followupTicket of followupTickets) {
        this.createTicket(projectId, {
          ...followupTicket,
          parentTicketId: execution.ticket_id,
          state: deriveAgentCreatedTicketState(policy, followupTicket.state),
        });
      }

      if (outcome === "completed" && execution.role === "developer") {
        startAutoRoutedLaneExecution({
          store: this,
          database,
          projectId,
          ticketId: execution.ticket_id,
          reason: `${ticket.key} implementation completed; Pool routed the next evidence lane.`,
        });
      }

      if (outcome === "completed" && execution.role === "reviewer" && embeddedReview) {
        this.createReview(projectId, execution.ticket_id, {
          executionId,
          verdict: embeddedReview.verdict,
          summaryMd: embeddedReview.summaryMd,
          blockedKind: embeddedReview.blockedKind,
          artifacts: embeddedReview.artifacts || [],
          findings: embeddedReview.findings || [],
        });
      }

      if (outcome === "completed" && execution.role === "validator" && embeddedValidation) {
        this.createValidation(projectId, execution.ticket_id, {
          executionId,
          repoIds: embeddedValidation.repoIds || [],
          commandProfile: embeddedValidation.commandProfile,
          commands: embeddedValidation.commands || [],
          verdict: embeddedValidation.verdict,
          summaryMd: embeddedValidation.summaryMd,
          blockedKind: embeddedValidation.blockedKind,
          artifacts: embeddedValidation.artifacts || [],
        });
      }

      return this.getExecution(projectId, executionId);
    },

    continueExecution(projectId, executionId, input) {
      const execution = getExecutionRow(database, projectId, executionId);
      if (!execution) {
        return null;
      }
      if (execution.status === "cancelled") {
        throw new Error("Cancelled executions cannot be continued");
      }

      const ticket = getTicketRow(database, projectId, execution.ticket_id);
      const policy = requiredProjectPolicy(database, projectId);
      const nextIteration = Number(execution.iteration) + 1;
      if (nextIteration - 1 > Number(policy.max_auto_continue_iterations)) {
        throw new Error(
          `${ticket.key} reached the continuation limit of ${policy.max_auto_continue_iterations} iterations`,
        );
      }

      if (!execution.finished_at) {
        this.completeExecution(projectId, executionId, {
          outcome: "needs_continue",
          summaryMd: optionalText(input.reason, "Continuation requested"),
          remainingWorkMd: optionalText(input.reason),
        });
      } else if (execution.outcome !== "needs_continue") {
        throw new Error("Execution must be active or marked needs_continue before continuing");
      }

      return this.createExecution(projectId, execution.ticket_id, {
        role: execution.role,
        agentProfileId: execution.agent_profile_id,
        iteration: nextIteration,
        reason: optionalText(input.reason, "Continuation requested"),
      });
    },

    cancelExecution(projectId, executionId, input = {}) {
      const execution = getExecutionRow(database, projectId, executionId);
      if (!execution) {
        return null;
      }

      if (execution.finished_at) {
        return this.getExecution(projectId, executionId);
      }

      const ticket = getTicketRow(database, projectId, execution.ticket_id);
      const timestamp = now();
      const reason = optionalText(input.reason, "Execution cancelled by operator");

      withTransaction(database, () => {
        database
          .prepare(
            `update executions
             set status = ?, outcome = ?, summary_md = ?, failure_kind = ?, claim_token = '', claim_expires_at = null, finished_at = ?, updated_at = ?
             where project_id = ? and id = ?`,
          )
          .run("cancelled", "failed", reason, "cancelled", timestamp, timestamp, projectId, executionId);

        database
          .prepare("update worktrees set status = ?, updated_at = ? where project_id = ? and execution_id = ?")
          .run("cancelled", timestamp, projectId, executionId);

        database
          .prepare("update tickets set latest_summary = ?, updated_at = ? where project_id = ? and id = ?")
          .run(reason, timestamp, projectId, execution.ticket_id);

        insertEvent(database, {
          projectId,
          ticketId: execution.ticket_id,
          type: "execution.completed",
          summary: `${ticket.key} ${execution.role} iteration ${execution.iteration} cancelled`,
          detail: reason,
          reasonCode: "cancelled",
          reasonSource: "execution",
        });
      });

      return this.getExecution(projectId, executionId);
    },

    listWorktrees(projectId, filters = {}) {
      return listWorktreeRows(database, projectId, filters).map((row) => worktreeDto(mapWorktree(row)));
    },

    cleanWorktree(projectId, worktreeId, input = {}) {
      const worktree = getWorktreeRow(database, projectId, worktreeId);
      if (!worktree) {
        return null;
      }
      if (worktree.status === "active") {
        throw new Error("Cannot clean an active worktree");
      }
      if (worktree.cleaned_at) {
        return worktreeDto(mapWorktree(worktree));
      }

      const ticket = getTicketRow(database, projectId, worktree.ticket_id);
      const repo = database
        .prepare("select name from repos where project_id = ? and id = ?")
        .get(projectId, worktree.repo_id);
      const timestamp = now();
      const reason = optionalText(input.reason, "Operator cleaned the completed worktree");

      withTransaction(database, () => {
        database
          .prepare(
            `update worktrees
             set status = ?, cleaned_at = ?, updated_at = ?
             where project_id = ? and id = ?`,
          )
          .run("cleaned", timestamp, timestamp, projectId, worktreeId);

        insertEvent(database, {
          projectId,
          repoId: worktree.repo_id,
          ticketId: worktree.ticket_id,
          type: "worktree.cleaned",
          summary: `${ticket.key} worktree cleaned for ${repo.name}`,
          detail: `${reason}\n${worktree.path}`,
        });
      });

      return worktreeDto(mapWorktree(getWorktreeRow(database, projectId, worktreeId)));
    },

    restartTicket(projectId, ticketId, input = {}) {
      const ticket = getTicketRow(database, projectId, ticketId);
      if (!ticket) {
        return null;
      }

      const timestamp = now();
      const reason = optionalText(input.reason, `Restart requested for ${ticket.key}`);
      const targetState = optionalText(input.targetState, "READY");
      if (!isTicketState(targetState)) {
        throw new Error(`Invalid ticket state: ${targetState}`);
      }

      const runningExecutions = database
        .prepare("select * from executions where project_id = ? and ticket_id = ? and status = 'running'")
        .all(projectId, ticketId);
      const worktrees = listWorktreeRows(database, projectId, { ticketId }).map(mapWorktree);
      const worktreesToDelete = worktrees.filter((worktree) => worktree.status !== "cleaned");
      for (const worktree of worktreesToDelete) {
        assertDeletableWorktreePath(worktree.path);
      }

      withTransaction(database, () => {
        for (const execution of runningExecutions) {
          database
            .prepare(
              `update executions
               set status = ?, outcome = ?, summary_md = ?, failure_kind = ?, claim_token = '', claim_expires_at = null, finished_at = ?, updated_at = ?
               where project_id = ? and id = ?`,
            )
            .run("cancelled", "failed", reason, "restart_cancelled", timestamp, timestamp, projectId, execution.id);

          insertEvent(database, {
            projectId,
            ticketId,
            type: "execution.completed",
            summary: `${ticket.key} ${execution.role} iteration ${execution.iteration} cancelled for restart`,
            detail: reason,
            reasonCode: "restart_cancelled",
            reasonSource: "execution",
          });
        }

        for (const worktree of worktreesToDelete) {
          database
            .prepare(
              `update worktrees
               set status = ?, cleaned_at = ?, updated_at = ?
               where project_id = ? and id = ?`,
            )
            .run("cleaned", timestamp, timestamp, projectId, worktree.id);

          insertEvent(database, {
            projectId,
            repoId: worktree.repoId,
            ticketId,
            type: "worktree.cleaned",
            summary: `${ticket.key} worktree deleted for ${worktree.repoName}`,
            detail: `${reason}\n${worktree.path}`,
            reasonCode: "restart_deleted",
            reasonSource: "worktree",
          });
        }

        database
          .prepare(
            `update tickets
             set state = ?, latest_summary = ?, updated_at = ?
             where project_id = ? and id = ?`,
          )
          .run(targetState, reason, timestamp, projectId, ticketId);

        insertEvent(database, {
          projectId,
          ticketId,
          type: "ticket.updated",
          summary: `${ticket.key} restarted`,
          detail: reason,
          reasonCode: "ticket_restarted",
          reasonSource: "operator",
        });
      });

      for (const worktree of worktreesToDelete) {
        deleteWorktreePath(worktree.path);
      }

      return this.getTicket(projectId, ticketId);
    },

    listEvents(projectId, filters = {}) {
      const clauses = ["e.project_id = ?"];
      const params = [projectId];

      if (filters.ticketId) {
        clauses.push("e.ticket_id = ?");
        params.push(filters.ticketId);
      }

      if (filters.repoId) {
        clauses.push("e.repo_id = ?");
        params.push(filters.repoId);
      }

      if (filters.type) {
        clauses.push("e.type = ?");
        params.push(filters.type);
      }

      const order = filters.order === "desc" ? "desc" : "asc";
      const limit =
        Number.isInteger(filters.limit) && filters.limit > 0 ? ` limit ${filters.limit}` : "";

      return database
        .prepare(
          `select
             e.*,
             e.rowid as event_sequence,
             r.slug as repo_slug,
             r.name as repo_name,
             t.key as ticket_key,
             t.title as ticket_title
           from events e
           left join repos r on r.project_id = e.project_id and r.id = e.repo_id
           left join tickets t on t.project_id = e.project_id and t.id = e.ticket_id
           where ${clauses.join(" and ")}
           order by e.created_at ${order}, e.rowid ${order}${limit}`,
        )
        .all(...params)
        .map((row) => eventDto(mapEvent(row)));
    },

    listArtifacts(projectId, filters = {}) {
      const clauses = ["a.project_id = ?"];
      const params = [projectId];

      for (const [field, column] of [
        ["ticketId", "a.ticket_id"],
        ["executionId", "a.execution_id"],
        ["reviewId", "a.review_id"],
        ["validationRunId", "a.validation_run_id"],
        ["mergeRunId", "a.merge_run_id"],
        ["kind", "a.kind"],
      ]) {
        if (filters[field]) {
          clauses.push(`${column} = ?`);
          params.push(filters[field]);
        }
      }

      const limit =
        Number.isInteger(filters.limit) && filters.limit > 0 ? ` limit ${filters.limit}` : "";

      return database
        .prepare(
          `select
             a.*,
             t.key as ticket_key,
             t.title as ticket_title
           from artifacts a
           left join tickets t on t.project_id = a.project_id and t.id = a.ticket_id
           where ${clauses.join(" and ")}
           order by a.created_at desc, a.rowid desc${limit}`,
        )
        .all(...params)
        .map((row) => artifactDto(mapArtifact(row)));
    },
  };
}

function countProjects(database) {
  return Number(database.prepare("select count(*) as count from projects").get().count);
}

function getProjectRow(database, projectId) {
  return database.prepare("select * from projects where id = ?").get(projectId);
}

function getTicketRow(database, projectId, ticketId) {
  return database.prepare("select * from tickets where project_id = ? and id = ?").get(projectId, ticketId);
}

function getExecutionRow(database, projectId, executionId) {
  return database
    .prepare("select * from executions where project_id = ? and id = ?")
    .get(projectId, executionId);
}

function getWorktreeRow(database, projectId, worktreeId) {
  return database
    .prepare(
      `select
        w.*,
        r.slug as repo_slug,
        r.name as repo_name,
        e.role as execution_role,
        e.iteration as execution_iteration
       from worktrees w
       join repos r on r.id = w.repo_id
       join executions e on e.id = w.execution_id
       where w.project_id = ? and w.id = ?`,
    )
    .get(projectId, worktreeId);
}

function getLatestMergeRunRow(database, projectId, ticketId) {
  return database
    .prepare(
      `select *
       from merge_runs
       where project_id = ? and ticket_id = ?
       order by started_at desc
       limit 1`,
    )
    .get(projectId, ticketId);
}

function requiredProjectPolicy(database, projectId) {
  const policy = getProjectPolicyRow(database, projectId);
  if (!policy) {
    throw new Error(`Missing project policy for ${projectId}`);
  }
  return policy;
}

function assertProjectCanStartExecution(database, projectId, ticketKey) {
  const policy = requiredProjectPolicy(database, projectId);
  const runningCount = Number(
    database
      .prepare(
        `select count(*) as count
         from executions
         where project_id = ? and status = 'running'`,
      )
      .get(projectId).count,
  );

  if (runningCount >= Number(policy.max_parallel_executions)) {
    throw new Error(
      `Project execution limit reached for ${ticketKey}: ${policy.max_parallel_executions} active runs allowed`,
    );
  }
}

function assertProjectCanStartMerge(database, projectId, ticketKey) {
  const policy = requiredProjectPolicy(database, projectId);
  const runningCount = Number(
    database
      .prepare(
        `select count(*) as count
         from merge_runs
         where project_id = ? and status = 'running' and finished_at is null`,
      )
      .get(projectId).count,
  );

  if (runningCount >= Number(policy.max_parallel_merges)) {
    throw new Error(
      `Project merge limit reached for ${ticketKey}: ${policy.max_parallel_merges} active merges allowed`,
    );
  }
}

function startAutoRoutedLaneExecution({ store, database, projectId, ticketId, reason }) {
  const ticket = getTicketRow(database, projectId, ticketId);
  if (!ticket) {
    return null;
  }

  let nextRole = null;
  if (ticket.state === "REVIEWING") {
    nextRole = "reviewer";
  } else if (ticket.state === "VALIDATING") {
    nextRole = "validator";
  } else {
    return null;
  }

  const runningExecution = database
    .prepare(
      `select id
       from executions
       where project_id = ? and ticket_id = ? and role = ? and status = 'running'`,
    )
    .get(projectId, ticketId, nextRole);
  if (runningExecution) {
    return store.getExecution(projectId, runningExecution.id);
  }

  try {
    return store.createExecution(projectId, ticketId, {
      role: nextRole,
      reason,
    });
  } catch {
    return null;
  }
}

function listTicketRows(database, projectId, filters = {}) {
  const clauses = ["project_id = ?"];
  const values = [projectId];

  if (filters.states?.length) {
    clauses.push(`state in (${filters.states.map(() => "?").join(", ")})`);
    values.push(...filters.states);
  }
  if (filters.priority) {
    clauses.push("priority = ?");
    values.push(filters.priority);
  }
  if (filters.assignedRole) {
    clauses.push("assigned_role = ?");
    values.push(filters.assignedRole);
  }
  if (filters.parentTicketId) {
    clauses.push("parent_ticket_id = ?");
    values.push(filters.parentTicketId);
  }
  if (filters.search) {
    clauses.push("lower(key || ' ' || title || ' ' || brief || ' ' || latest_summary) like ?");
    values.push(`%${filters.search.toLowerCase()}%`);
  }

  return database
    .prepare(`select * from tickets where ${clauses.join(" and ")} order by created_at asc`)
    .all(...values);
}

function listWorktreeRows(database, projectId, filters = {}) {
  const clauses = ["w.project_id = ?"];
  const values = [projectId];

  if (filters.ticketId) {
    clauses.push("w.ticket_id = ?");
    values.push(filters.ticketId);
  }
  if (filters.executionId) {
    clauses.push("w.execution_id = ?");
    values.push(filters.executionId);
  }
  if (filters.status) {
    clauses.push("w.status = ?");
    values.push(filters.status);
  }

  return database
    .prepare(
      `select
        w.*,
        r.slug as repo_slug,
        r.name as repo_name,
        e.role as execution_role,
        e.iteration as execution_iteration
       from worktrees w
       join repos r on r.id = w.repo_id
       join executions e on e.id = w.execution_id
       where ${clauses.join(" and ")}
       order by w.updated_at desc, e.iteration desc, r.slug asc`,
    )
    .all(...values);
}

function getRepoTargetsByTicketId(database, ticketIds) {
  const byTicketId = new Map();
  for (const ticketId of ticketIds) {
    byTicketId.set(ticketId, []);
  }
  if (ticketIds.length === 0) {
    return byTicketId;
  }

  const placeholders = ticketIds.map(() => "?").join(", ");
  const rows = database
    .prepare(
      `select
        trt.id,
        trt.ticket_id,
        trt.repo_id,
        trt.base_ref,
        trt.branch_name,
        trt.target_scope_md,
        r.slug as repo_slug,
        r.name as repo_name,
        r.local_path as repo_local_path,
        r.default_branch as repo_default_branch
      from ticket_repo_targets trt
      join repos r on r.id = trt.repo_id
      where trt.ticket_id in (${placeholders})
      order by trt.created_at asc`,
    )
    .all(...ticketIds);

  for (const row of rows) {
    const targets = byTicketId.get(row.ticket_id) || [];
    targets.push({
      id: row.id,
      repoId: row.repo_id,
      repoSlug: row.repo_slug,
      repoName: row.repo_name,
      repoLocalPath: row.repo_local_path,
      repoDefaultBranch: row.repo_default_branch,
      baseRef: row.base_ref,
      branchName: row.branch_name,
      targetScopeMd: row.target_scope_md,
    });
    byTicketId.set(row.ticket_id, targets);
  }

  return byTicketId;
}

function getDependenciesByBlockedTicketId(database, projectId, blockedTicketIds) {
  const byBlockedTicketId = new Map();
  for (const blockedTicketId of blockedTicketIds) {
    byBlockedTicketId.set(blockedTicketId, []);
  }
  if (blockedTicketIds.length === 0) {
    return byBlockedTicketId;
  }

  const placeholders = blockedTicketIds.map(() => "?").join(", ");
  const rows = database
    .prepare(
      `select
        td.id,
        td.project_id,
        td.blocked_ticket_id,
        td.blocking_ticket_id,
        td.dependency_type,
        td.created_at,
        bt.key as blocking_ticket_key,
        bt.title as blocking_ticket_title,
        bt.state as blocking_ticket_state
      from ticket_dependencies td
      join tickets bt on bt.id = td.blocking_ticket_id
      where td.project_id = ? and td.blocked_ticket_id in (${placeholders})
      order by td.created_at asc`,
    )
    .all(projectId, ...blockedTicketIds);

  for (const row of rows) {
    const dependencies = byBlockedTicketId.get(row.blocked_ticket_id) || [];
    dependencies.push({
      id: row.id,
      projectId: row.project_id,
      blockedTicketId: row.blocked_ticket_id,
      blockingTicketId: row.blocking_ticket_id,
      blockingTicketKey: row.blocking_ticket_key,
      blockingTicketTitle: row.blocking_ticket_title,
      blockingTicketState: row.blocking_ticket_state,
      dependencyType: row.dependency_type,
      createdAt: row.created_at,
    });
    byBlockedTicketId.set(row.blocked_ticket_id, dependencies);
  }

  return byBlockedTicketId;
}

function getExecutionsByTicketId(database, projectId, ticketIds) {
  const byTicketId = new Map();
  for (const ticketId of ticketIds) {
    byTicketId.set(ticketId, []);
  }
  if (ticketIds.length === 0) {
    return byTicketId;
  }

  const placeholders = ticketIds.map(() => "?").join(", ");
  const rows = database
    .prepare(
      `select *
       from executions
       where project_id = ? and ticket_id in (${placeholders})
       order by started_at desc, iteration desc`,
    )
    .all(projectId, ...ticketIds);

  for (const row of rows) {
    const executions = byTicketId.get(row.ticket_id) || [];
    executions.push(mapExecution(row));
    byTicketId.set(row.ticket_id, executions);
  }

  return byTicketId;
}

function getWorktreesByTicketId(database, projectId, ticketIds) {
  const byTicketId = new Map();
  for (const ticketId of ticketIds) {
    byTicketId.set(ticketId, []);
  }
  if (ticketIds.length === 0) {
    return byTicketId;
  }

  const placeholders = ticketIds.map(() => "?").join(", ");
  const rows = database
    .prepare(
      `select
        w.*,
        r.slug as repo_slug,
        r.name as repo_name,
        e.role as execution_role,
        e.iteration as execution_iteration
      from worktrees w
      join repos r on r.id = w.repo_id
      join executions e on e.id = w.execution_id
      where w.project_id = ? and w.ticket_id in (${placeholders})
      order by w.created_at desc, e.iteration desc`,
    )
    .all(projectId, ...ticketIds);

  for (const row of rows) {
    const worktrees = byTicketId.get(row.ticket_id) || [];
    worktrees.push(mapWorktree(row));
    byTicketId.set(row.ticket_id, worktrees);
  }

  return byTicketId;
}

function getWorktreesByExecutionId(database, projectId, executionIds) {
  const byExecutionId = new Map();
  for (const executionId of executionIds) {
    byExecutionId.set(executionId, []);
  }
  if (executionIds.length === 0) {
    return byExecutionId;
  }

  const placeholders = executionIds.map(() => "?").join(", ");
  const rows = database
    .prepare(
      `select
        w.*,
        r.slug as repo_slug,
        r.name as repo_name,
        e.role as execution_role,
        e.iteration as execution_iteration
      from worktrees w
      join repos r on r.id = w.repo_id
      join executions e on e.id = w.execution_id
      where w.project_id = ? and w.execution_id in (${placeholders})
      order by w.created_at asc, r.slug asc`,
    )
    .all(projectId, ...executionIds);

  for (const row of rows) {
    const worktrees = byExecutionId.get(row.execution_id) || [];
    worktrees.push(mapWorktree(row));
    byExecutionId.set(row.execution_id, worktrees);
  }

  return byExecutionId;
}

function getArtifactsByTicketId(database, projectId, ticketIds) {
  const byTicketId = new Map();
  for (const ticketId of ticketIds) {
    byTicketId.set(ticketId, []);
  }
  if (ticketIds.length === 0) {
    return byTicketId;
  }

  const placeholders = ticketIds.map(() => "?").join(", ");
  const rows = database
    .prepare(
      `select *
       from artifacts
       where project_id = ? and ticket_id in (${placeholders})
       order by created_at desc`,
    )
    .all(projectId, ...ticketIds);

  for (const row of rows) {
    const artifacts = byTicketId.get(row.ticket_id) || [];
    artifacts.push(mapArtifact(row));
    byTicketId.set(row.ticket_id, artifacts);
  }

  return byTicketId;
}

function getArtifactsByExecutionId(database, projectId, executionIds) {
  const byExecutionId = new Map();
  for (const executionId of executionIds) {
    byExecutionId.set(executionId, []);
  }
  if (executionIds.length === 0) {
    return byExecutionId;
  }

  const placeholders = executionIds.map(() => "?").join(", ");
  const rows = database
    .prepare(
      `select *
       from artifacts
       where project_id = ? and execution_id in (${placeholders})
       order by created_at asc`,
    )
    .all(projectId, ...executionIds);

  for (const row of rows) {
    const artifacts = byExecutionId.get(row.execution_id) || [];
    artifacts.push(mapArtifact(row));
    byExecutionId.set(row.execution_id, artifacts);
  }

  return byExecutionId;
}

function getArtifactsByReviewId(database, reviewIds) {
  const byReviewId = new Map();
  for (const reviewId of reviewIds) {
    byReviewId.set(reviewId, []);
  }
  if (reviewIds.length === 0) {
    return byReviewId;
  }

  const placeholders = reviewIds.map(() => "?").join(", ");
  const rows = database
    .prepare(
      `select *
       from artifacts
       where review_id in (${placeholders})
       order by created_at asc`,
    )
    .all(...reviewIds);

  for (const row of rows) {
    const artifacts = byReviewId.get(row.review_id) || [];
    artifacts.push(mapArtifact(row));
    byReviewId.set(row.review_id, artifacts);
  }

  return byReviewId;
}

function getArtifactsByValidationRunId(database, validationRunIds) {
  const byValidationRunId = new Map();
  for (const validationRunId of validationRunIds) {
    byValidationRunId.set(validationRunId, []);
  }
  if (validationRunIds.length === 0) {
    return byValidationRunId;
  }

  const placeholders = validationRunIds.map(() => "?").join(", ");
  const rows = database
    .prepare(
      `select *
       from artifacts
       where validation_run_id in (${placeholders})
       order by created_at asc`,
    )
    .all(...validationRunIds);

  for (const row of rows) {
    const artifacts = byValidationRunId.get(row.validation_run_id) || [];
    artifacts.push(mapArtifact(row));
    byValidationRunId.set(row.validation_run_id, artifacts);
  }

  return byValidationRunId;
}

function getArtifactsByMergeRunId(database, mergeRunIds) {
  const byMergeRunId = new Map();
  for (const mergeRunId of mergeRunIds) {
    byMergeRunId.set(mergeRunId, []);
  }
  if (mergeRunIds.length === 0) {
    return byMergeRunId;
  }

  const placeholders = mergeRunIds.map(() => "?").join(", ");
  const rows = database
    .prepare(
      `select *
       from artifacts
       where merge_run_id in (${placeholders})
       order by created_at asc`,
    )
    .all(...mergeRunIds);

  for (const row of rows) {
    const artifacts = byMergeRunId.get(row.merge_run_id) || [];
    artifacts.push(mapArtifact(row));
    byMergeRunId.set(row.merge_run_id, artifacts);
  }

  return byMergeRunId;
}

function getReviewsByTicketId(database, projectId, ticketIds) {
  const byTicketId = new Map();
  for (const ticketId of ticketIds) {
    byTicketId.set(ticketId, []);
  }
  if (ticketIds.length === 0) {
    return byTicketId;
  }

  const placeholders = ticketIds.map(() => "?").join(", ");
  const reviewRows = database
    .prepare(
      `select *
       from reviews
       where project_id = ? and ticket_id in (${placeholders})
       order by created_at desc`,
    )
    .all(projectId, ...ticketIds);

  const reviewIds = reviewRows.map((row) => row.id);
  const findingsByReviewId = getReviewFindingsByReviewId(database, reviewIds);
  const artifactsByReviewId = getArtifactsByReviewId(database, reviewIds);

  for (const row of reviewRows) {
    const reviews = byTicketId.get(row.ticket_id) || [];
    reviews.push({
      ...mapReview(row),
      artifacts: artifactsByReviewId.get(row.id) || [],
      findings: findingsByReviewId.get(row.id) || [],
    });
    byTicketId.set(row.ticket_id, reviews);
  }

  return byTicketId;
}

function getReviewFindingsByReviewId(database, reviewIds) {
  const byReviewId = new Map();
  for (const reviewId of reviewIds) {
    byReviewId.set(reviewId, []);
  }
  if (reviewIds.length === 0) {
    return byReviewId;
  }

  const placeholders = reviewIds.map(() => "?").join(", ");
  const rows = database
    .prepare(
      `select *
       from review_findings
       where review_id in (${placeholders})
       order by created_at asc`,
    )
    .all(...reviewIds);

  for (const row of rows) {
    const findings = byReviewId.get(row.review_id) || [];
    findings.push({
      id: row.id,
      severity: row.severity,
      category: row.category,
      filePath: row.file_path,
      lineNumber: row.line_number ? Number(row.line_number) : null,
      title: row.title,
      detailsMd: row.details_md,
      createdAt: row.created_at,
    });
    byReviewId.set(row.review_id, findings);
  }

  return byReviewId;
}

function getValidationRunsByTicketId(database, projectId, ticketIds) {
  const byTicketId = new Map();
  for (const ticketId of ticketIds) {
    byTicketId.set(ticketId, []);
  }
  if (ticketIds.length === 0) {
    return byTicketId;
  }

  const placeholders = ticketIds.map(() => "?").join(", ");
  const rows = database
    .prepare(
      `select
        vr.*,
        r.slug as repo_slug,
        r.name as repo_name
       from validation_runs vr
       join repos r on r.id = vr.repo_id
       where vr.project_id = ? and vr.ticket_id in (${placeholders})
       order by vr.started_at desc, r.slug asc`,
    )
    .all(projectId, ...ticketIds);

  const validationIds = rows.map((row) => row.id);
  const artifactsByValidationRunId = getArtifactsByValidationRunId(database, validationIds);

  for (const row of rows) {
    const validations = byTicketId.get(row.ticket_id) || [];
    validations.push({
      ...mapValidationRun(row),
      artifacts: artifactsByValidationRunId.get(row.id) || [],
    });
    byTicketId.set(row.ticket_id, validations);
  }

  return byTicketId;
}

function getLatestReviewVerdictsByTicketId(database, projectId, ticketIds) {
  const byTicketId = new Map();
  for (const ticketId of ticketIds) {
    byTicketId.set(ticketId, "");
  }
  if (ticketIds.length === 0) {
    return byTicketId;
  }

  const placeholders = ticketIds.map(() => "?").join(", ");
  const rows = database
    .prepare(
      `select ticket_id, verdict, created_at
       from reviews
       where project_id = ? and ticket_id in (${placeholders})
       order by created_at desc`,
    )
    .all(projectId, ...ticketIds);

  for (const row of rows) {
    if (!byTicketId.get(row.ticket_id)) {
      byTicketId.set(row.ticket_id, row.verdict);
    }
  }

  return byTicketId;
}

function getLatestValidationVerdictsByTicketId(database, projectId, ticketIds) {
  const byTicketId = new Map();
  for (const ticketId of ticketIds) {
    byTicketId.set(ticketId, "");
  }
  if (ticketIds.length === 0) {
    return byTicketId;
  }

  const placeholders = ticketIds.map(() => "?").join(", ");
  const rows = database
    .prepare(
      `select ticket_id, verdict, finished_at
       from validation_runs
       where project_id = ? and ticket_id in (${placeholders})
       order by finished_at desc`,
    )
    .all(projectId, ...ticketIds);

  for (const row of rows) {
    if (!byTicketId.get(row.ticket_id)) {
      byTicketId.set(row.ticket_id, row.verdict);
    }
  }

  return byTicketId;
}

function getLatestReviewRow(database, projectId, ticketId) {
  return database
    .prepare(
      `select id, verdict, summary_md, blocked_kind, created_at
       from reviews
       where project_id = ? and ticket_id = ?
       order by created_at desc
       limit 1`,
    )
    .get(projectId, ticketId);
}

function getLatestValidationRunRow(database, projectId, ticketId) {
  return database
    .prepare(
      `select id, verdict, command_profile, summary_md, blocked_kind, finished_at
       from validation_runs
       where project_id = ? and ticket_id = ?
       order by finished_at desc
       limit 1`,
    )
    .get(projectId, ticketId);
}

function groupWorktreesByExecutionId(worktrees) {
  const byExecutionId = new Map();
  for (const worktree of worktrees) {
    const items = byExecutionId.get(worktree.executionId) || [];
    items.push(worktree);
    byExecutionId.set(worktree.executionId, items);
  }
  return byExecutionId;
}

function getCountMap(database, sql, params) {
  return new Map(database.prepare(sql).all(...params).map((row) => [row.ticketId, Number(row.count)]));
}

function mapProject(database, row) {
  const policy = getProjectPolicyRow(database, row.id);
  const roleProfiles = database
    .prepare("select role, adapter, model, config_json from agent_profiles where project_id = ? order by role asc")
    .all(row.id);

      return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    workspaceRoot: row.workspace_root,
    defaultBaseBranch: row.default_base_branch,
    policy: mapProjectPolicy(policy),
    roleProfiles: roleProfiles.map(mapRoleProfile),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapProjectPolicy(row) {
  return {
    requireReviewer: Boolean(row.require_reviewer),
    requireValidator: Boolean(row.require_validator),
    requireHumanApprovalBeforeMerge: Boolean(row.require_human_approval_before_merge),
    requiredValidationCommandProfileForMerge: row.required_validation_command_profile_for_merge || "",
    maxParallelExecutions: Number(row.max_parallel_executions),
    maxParallelMerges: Number(row.max_parallel_merges),
    maxAutoContinueIterations: Number(row.max_auto_continue_iterations),
    refinementMode: row.refinement_mode || "user_approved",
    agentCreatedTicketDefaultState: row.agent_created_ticket_default_state,
  };
}

function mapRoleProfile(row) {
  return {
    role: row.role,
    adapter: row.adapter,
    model: row.model,
    config: JSON.parse(row.config_json),
  };
}

function resolveAgentProfileForExecution(database, projectId, role, agentProfileId) {
  if (agentProfileId) {
    const profile = database
      .prepare("select id, role from agent_profiles where project_id = ? and id = ?")
      .get(projectId, agentProfileId);
    if (!profile) {
      throw new Error(`Unknown agent profile: ${agentProfileId}`);
    }
    if (profile.role !== role) {
      throw new Error(`Agent profile ${agentProfileId} does not match role ${role}`);
    }
    return profile;
  }

  const profile = database
    .prepare("select id, role from agent_profiles where project_id = ? and role = ?")
    .get(projectId, role);
  if (!profile) {
    throw new Error(`No agent profile configured for role: ${role}`);
  }
  return profile;
}

function mapRepo(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    slug: row.slug,
    name: row.name,
    localPath: row.local_path,
    remoteUrl: row.remote_url,
    defaultBranch: row.default_branch,
    isPrimary: Boolean(row.is_primary),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTicket(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    parentTicketId: row.parent_ticket_id,
    key: row.key,
    title: row.title,
    brief: row.brief,
    state: row.state,
    priority: row.priority,
    acceptanceCriteriaMd: row.acceptance_criteria_md,
    definitionOfDoneMd: row.definition_of_done_md,
    assignedRole: row.assigned_role,
    latestSummary: row.latest_summary,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCeremonyRun(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    type: row.type,
    status: row.status,
    scope: parseJsonObject(row.scope_json, {}),
    inputSnapshot: parseJsonObject(row.input_snapshot_json, {}),
    summaryMd: row.summary_md,
    questionsMd: row.questions_md,
    riskMd: row.risk_md,
    createdByKind: row.created_by_kind,
    createdByRef: row.created_by_ref,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    appliedAt: row.applied_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCeremonyProposal(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    runId: row.run_id,
    kind: row.kind,
    status: row.status,
    summary: row.summary,
    ticketId: row.ticket_id,
    ticketKey: row.ticket_key,
    ticketTitle: row.ticket_title,
    payload: parseJsonObject(row.payload_json, {}),
    appliedTicketId: row.applied_ticket_id,
    appliedAt: row.applied_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getCeremonyProposalRows(database, projectId, runId) {
  return database
    .prepare(
      `select cp.*, t.key as ticket_key, t.title as ticket_title
       from ceremony_proposals cp
       left join tickets t on t.project_id = cp.project_id and t.id = cp.ticket_id
       where cp.project_id = ? and cp.run_id = ?
       order by cp.created_at asc`,
    )
    .all(projectId, runId);
}

function getCeremonyProposalsByRunId(database, projectId, runIds) {
  const byRunId = new Map(runIds.map((runId) => [runId, []]));
  if (runIds.length === 0) {
    return byRunId;
  }
  const placeholders = runIds.map(() => "?").join(", ");
  const rows = database
    .prepare(
      `select cp.*, t.key as ticket_key, t.title as ticket_title
       from ceremony_proposals cp
       left join tickets t on t.project_id = cp.project_id and t.id = cp.ticket_id
       where cp.project_id = ? and cp.run_id in (${placeholders})
       order by cp.created_at asc`,
    )
    .all(projectId, ...runIds);
  for (const row of rows) {
    byRunId.get(row.run_id)?.push(mapCeremonyProposal(row));
  }
  return byRunId;
}

function buildCeremonyInputSnapshot(database, projectId) {
  const tickets = listTicketRows(database, projectId).map(mapTicket);
  const ticketIds = tickets.map((ticket) => ticket.id);
  const repoTargetsByTicketId = getRepoTargetsByTicketId(database, ticketIds);
  const dependencyCountsByTicketId = getCountMap(
    database,
    "select blocked_ticket_id as ticketId, count(*) as count from ticket_dependencies where project_id = ? group by blocked_ticket_id",
    [projectId],
  );
  return {
    generatedAt: now(),
    policy: mapProjectPolicy(getProjectPolicyRow(database, projectId)),
    repos: database.prepare("select * from repos where project_id = ? order by created_at asc").all(projectId).map(mapRepo),
    tickets: tickets.map((ticket) => ({
      ...ticket,
      repoTargets: repoTargetsByTicketId.get(ticket.id) || [],
      dependencyCount: dependencyCountsByTicketId.get(ticket.id) || 0,
    })),
  };
}

function buildCeremonyProposals(type, snapshot, timestamp) {
  switch (type) {
    case "refinement":
      return buildRefinementProposals(snapshot, timestamp);
    case "planning":
      return buildPlanningProposals(snapshot, timestamp);
    case "daily_triage":
      return buildDailyTriageProposals(snapshot, timestamp);
    case "review_demo_prep":
      return buildReviewDemoPrepProposals(snapshot, timestamp);
    case "retro":
      return buildRetroProposals(snapshot, timestamp);
    default:
      return [];
  }
}

function buildRefinementProposals(snapshot, timestamp) {
  const candidates = snapshot.tickets
    .filter((ticket) => ticket.state === "DRAFT" || ticket.state === "PROPOSED")
    .slice(0, 6);
  const proposals = candidates.map((ticket) => {
    const patch = {
      latestSummary: "Refinement pass proposed clearer scope and readiness criteria.",
    };
    if (!ticket.brief || ticket.brief.length < 40) {
      patch.brief = `${ticket.brief || ticket.title}\n\nRefinement note: clarify the user outcome, repo touch points, and expected evidence before execution.`;
    }
    if (!ticket.acceptanceCriteriaMd) {
      patch.acceptanceCriteriaMd = "- Scope is explicit enough for an agent to execute\n- Expected behavior and evidence are named\n- Blocking decisions are captured before work starts";
    }
    if (!ticket.definitionOfDoneMd) {
      patch.definitionOfDoneMd = "- Acceptance criteria satisfied\n- Review and validation evidence attached\n- Follow-up work captured as separate tickets";
    }
    return proposal("ticket_patch", `Refine ${ticket.key} before agent execution`, timestamp, {
      ticketId: ticket.id,
      patch,
    }, ticket.id);
  });
  return proposals.length ? proposals : [noteProposal("Backlog refinement found no draft or proposed tickets needing action.", timestamp)];
}

function buildPlanningProposals(snapshot, timestamp) {
  const capacity = Number(snapshot.policy?.maxParallelExecutions || 1);
  const ready = snapshot.tickets.filter((ticket) => ticket.state === "READY");
  const proposedReady = snapshot.tickets
    .filter((ticket) => ticket.state === "PROPOSED" && ticket.acceptanceCriteriaMd && ticket.repoTargets.length > 0)
    .slice(0, Math.max(1, capacity));
  const proposals = proposedReady.map((ticket) =>
    proposal("ticket_transition", `Promote ${ticket.key} into the next agent-ready plan`, timestamp, {
      ticketId: ticket.id,
      targetState: "READY",
      reason: "Planning ceremony approved this refined ticket for agent execution.",
    }, ticket.id),
  );
  proposals.push(noteProposal(`Planning snapshot: ${ready.length} ticket(s) already Ready; execution capacity is ${capacity}.`, timestamp));
  return proposals;
}

function buildDailyTriageProposals(snapshot, timestamp) {
  const active = snapshot.tickets.filter((ticket) => ["WORKING", "REVIEWING", "VALIDATING"].includes(ticket.state));
  const blocked = snapshot.tickets.filter((ticket) => ticket.state === "BLOCKED" || ticket.state === "REWORK");
  const proposals = blocked.slice(0, 5).map((ticket) =>
    proposal("ticket_patch", `Triage ${ticket.key} for PO decision or unblock path`, timestamp, {
      ticketId: ticket.id,
      patch: {
        latestSummary: "Daily triage flagged this ticket for an unblock decision.",
      },
    }, ticket.id),
  );
  proposals.push(noteProposal(`Daily triage: ${active.length} active ticket(s), ${blocked.length} blocked or rework ticket(s).`, timestamp));
  return proposals;
}

function buildReviewDemoPrepProposals(snapshot, timestamp) {
  const demoTickets = snapshot.tickets
    .filter((ticket) => ticket.state === "READY_TO_MERGE" || ticket.state === "DONE")
    .slice(-6);
  if (demoTickets.length === 0) {
    return [noteProposal("Review/demo prep found no done or merge-ready tickets.", timestamp)];
  }
  return [
    noteProposal(
      `Demo prep candidate set: ${demoTickets.map((ticket) => `${ticket.key} ${ticket.title}`).join("; ")}.`,
      timestamp,
    ),
  ];
}

function buildRetroProposals(snapshot, timestamp) {
  const reworkCount = snapshot.tickets.filter((ticket) => ticket.state === "REWORK").length;
  const blockedCount = snapshot.tickets.filter((ticket) => ticket.state === "BLOCKED").length;
  if (reworkCount + blockedCount === 0) {
    return [noteProposal("Retro found no blocked or rework tickets in the current board snapshot.", timestamp)];
  }
  return [
    proposal("ticket_create", "Create a process-improvement follow-up from retro findings", timestamp, {
      ticket: {
        title: "Reduce blocked and rework loops",
        brief: `Retro observed ${blockedCount} blocked ticket(s) and ${reworkCount} rework ticket(s). Identify one policy, prompt, or validation improvement that would reduce repeat stalls.`,
        acceptanceCriteriaMd: "- Root cause is named\n- One concrete system or process change is proposed\n- Success signal is measurable from Pool events",
        definitionOfDoneMd: "- Improvement is implemented or documented\n- Pool evidence shows the change is inspectable",
        priority: blockedCount > 0 ? "high" : "medium",
        state: "PROPOSED",
        assignedRole: "product_manager",
        repoTargets: [],
      },
    }),
  ];
}

function buildCeremonySummary(type, snapshot, proposals) {
  const pendingMutations = proposals.filter((item) => item.kind !== "note").length;
  return {
    summaryMd: `${prettyCeremonyType(type)} reviewed ${snapshot.tickets.length} ticket(s) and produced ${proposals.length} proposal(s), including ${pendingMutations} ticket change(s).`,
    questionsMd: pendingMutations > 0 ? "Approve the proposals that match your current PO intent; leave the rest pending." : "",
    riskMd: "Ceremony proposals do not mutate tickets until applied by an operator.",
  };
}

function proposal(kind, summary, timestamp, payload, ticketId = "") {
  return {
    id: `ceremony_proposal_${randomUUID()}`,
    kind,
    summary,
    ticketId,
    payload,
    createdAt: timestamp,
  };
}

function noteProposal(summary, timestamp) {
  return proposal("note", summary, timestamp, { note: summary });
}

function applyCeremonyProposal(store, projectId, proposalRow, payload) {
  switch (proposalRow.kind) {
    case "ticket_patch":
      store.updateTicket(projectId, requiredText(payload.ticketId, "ticketId"), payload.patch || {});
      return payload.ticketId;
    case "ticket_create":
      return store.createTicket(projectId, payload.ticket || {})?.id || "";
    case "ticket_transition":
      store.transitionTicket(projectId, requiredText(payload.ticketId, "ticketId"), {
        targetState: payload.targetState,
        reason: payload.reason || proposalRow.summary,
      });
      return payload.ticketId;
    case "dependency":
      store.addDependency(projectId, requiredText(payload.blockedTicketId, "blockedTicketId"), {
        blockingTicketId: payload.blockingTicketId,
        dependencyType: payload.dependencyType,
      });
      return payload.blockedTicketId;
    case "note":
      return "";
    default:
      throw new Error(`Unsupported ceremony proposal kind: ${proposalRow.kind}`);
  }
}

function prettyCeremonyType(type) {
  return String(type || "").replace(/_/g, " ");
}

function parseJsonObject(value, fallback) {
  try {
    const parsed = JSON.parse(value || "");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function mapEvent(row) {
  const family = String(row.type || "").split(".", 1)[0] || "";
  return {
    id: row.id,
    sequence: Number(row.event_sequence || 0),
    cursor: row.created_at ? `${row.created_at}:${Number(row.event_sequence || 0)}` : row.id,
    projectId: row.project_id,
    repoId: row.repo_id,
    repoSlug: row.repo_slug,
    repoName: row.repo_name,
    ticketId: row.ticket_id,
    ticketKey: row.ticket_key,
    ticketTitle: row.ticket_title,
    type: row.type,
    lane: deriveEventLane(family),
    summary: row.summary,
    detail: row.detail,
    reasonCode: row.reason_code || "",
    reasonSource: row.reason_source || "",
    createdAt: row.created_at,
  };
}

function mapArtifact(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    ticketId: row.ticket_id,
    ticketKey: row.ticket_key,
    ticketTitle: row.ticket_title,
    executionId: row.execution_id,
    reviewId: row.review_id,
    validationRunId: row.validation_run_id,
    mergeRunId: row.merge_run_id,
    kind: row.kind,
    label: row.label,
    uri: row.uri,
    metadata: JSON.parse(row.metadata_json),
    createdAt: row.created_at,
  };
}

function mapExecution(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    ticketId: row.ticket_id,
    agentProfileId: row.agent_profile_id,
    role: row.role,
    iteration: Number(row.iteration),
    status: row.status,
    outcome: row.outcome,
    summaryMd: row.summary_md,
    remainingWorkMd: row.remaining_work_md,
    expectedNextEvidenceMd: row.expected_next_evidence_md,
    failureKind: row.failure_kind,
    blockedKind: row.blocked_kind,
    claimToken: row.claim_token || "",
    claimExpiresAt: row.claim_expires_at || "",
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

function mapReview(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    ticketId: row.ticket_id,
    executionId: row.execution_id,
    reviewerProfileId: row.reviewer_profile_id,
    verdict: row.verdict,
    summaryMd: row.summary_md,
    findingsCount: Number(row.findings_count),
    blockedKind: row.blocked_kind,
    createdAt: row.created_at,
  };
}

function mapValidationRun(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    ticketId: row.ticket_id,
    repoId: row.repo_id,
    repoSlug: row.repo_slug,
    repoName: row.repo_name,
    executionId: row.execution_id,
    status: row.status,
    verdict: row.verdict,
    commandProfile: row.command_profile,
    commands: JSON.parse(row.commands_json),
    summaryMd: row.summary_md,
    blockedKind: row.blocked_kind,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

function mapMergeRun(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    ticketId: row.ticket_id,
    status: row.status,
    strategy: row.strategy,
    approvedByKind: row.approved_by_kind,
    approvedByRef: row.approved_by_ref,
    summaryMd: row.summary_md,
    failureKind: row.failure_kind || "",
    claimToken: row.claim_token || "",
    claimExpiresAt: row.claim_expires_at || "",
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

function mapWorktree(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    repoId: row.repo_id,
    ticketId: row.ticket_id,
    executionId: row.execution_id,
    repoSlug: row.repo_slug,
    repoName: row.repo_name,
    executionRole: row.execution_role,
    executionIteration: Number(row.execution_iteration),
    path: row.path,
    branchName: row.branch_name,
    baseRef: row.base_ref,
    status: row.status,
    isDirty: Boolean(row.is_dirty),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    cleanedAt: row.cleaned_at,
  };
}

function deriveEventLane(family) {
  switch (family) {
    case "execution":
      return "execution";
    case "review":
      return "review";
    case "validation":
      return "validation";
    case "merge":
      return "merge";
    case "worktree":
      return "worktree";
    case "ticket":
      return "ticket";
    case "dependency":
      return "dependency";
    case "repo":
      return "repo";
    case "project":
      return "project";
    default:
      return "system";
  }
}

function deriveExecutionEventReason({ outcome, failureKind, blockedKind }) {
  if (outcome === "blocked") {
    return {
      reasonCode: blockedKind || "execution_blocked",
      reasonSource: blockedKind ? "policy" : "execution",
    };
  }
  if (outcome === "failed") {
    return {
      reasonCode: failureKind || blockedKind || "execution_failed",
      reasonSource: failureKind ? "execution" : blockedKind ? "policy" : "execution",
    };
  }
  if (outcome === "needs_continue") {
    return {
      reasonCode: "needs_continue",
      reasonSource: "execution",
    };
  }
  return {
    reasonCode: "",
    reasonSource: "",
  };
}

function deriveReviewEventReason(review) {
  if (review.verdict === "blocked") {
    return {
      reasonCode: review.blockedKind || "review_blocked",
      reasonSource: review.blockedKind ? "policy" : "review",
    };
  }
  if (review.verdict === "rework") {
    return {
      reasonCode: "review_rework",
      reasonSource: "review",
    };
  }
  return {
    reasonCode: "",
    reasonSource: "",
  };
}

function deriveValidationEventReason({ verdict, blockedKind, mergePolicyBlock }) {
  if (mergePolicyBlock?.code) {
    return {
      reasonCode: mergePolicyBlock.code,
      reasonSource: mergePolicyBlock.source || "validation",
    };
  }
  if (verdict === "blocked") {
    return {
      reasonCode: blockedKind || "validation_blocked",
      reasonSource: blockedKind ? "policy" : "validation",
    };
  }
  if (verdict === "failed") {
    return {
      reasonCode: "validation_failed",
      reasonSource: "validation",
    };
  }
  return {
    reasonCode: "",
    reasonSource: "",
  };
}

function deriveMergeEventReason(status, failureKind = "") {
  if (status === "blocked") {
    return {
      reasonCode: failureKind || "merge_blocked",
      reasonSource: failureKind ? "merge" : "merge",
    };
  }
  if (status === "rework") {
    return {
      reasonCode: "merge_rework",
      reasonSource: "merge",
    };
  }
  return {
    reasonCode: "",
    reasonSource: "",
  };
}

function buildBoardSummary(tickets) {
  const summary = {};
  for (const ticket of tickets) {
    const boardState = mapTicketStateToBoardState(ticket.state);
    summary[boardState] = (summary[boardState] || 0) + 1;
  }
  return summary;
}

function buildMergeStatus(database, ticket, worktrees = []) {
  const policy = requiredProjectPolicy(database, ticket.projectId);
  const latestRun = getLatestMergeRunRow(database, ticket.projectId, ticket.id);
  const latestReview = getLatestReviewRow(database, ticket.projectId, ticket.id);
  const latestValidation = getLatestValidationRunRow(database, ticket.projectId, ticket.id);
  const latestRunArtifacts =
    latestRun ? getArtifactsByMergeRunId(database, [latestRun.id]).get(latestRun.id) || [] : [];
  const requiresHumanApproval = readPolicyBoolean(
    policy,
    "requireHumanApprovalBeforeMerge",
    "require_human_approval_before_merge",
  );
  const mergePolicyBlocks = buildMergePolicyBlocks(policy, latestReview, latestValidation);
  const mergePolicyBlock = mergePolicyBlocks[0]?.message || "";
  const mergeable = ticket.state === "READY_TO_MERGE" && !mergePolicyBlock;
  const uncleanedWorktreeCount = worktrees.filter((worktree) => worktree.status !== "cleaned").length;
  const approval = {
    required: requiresHumanApproval,
    satisfied: !requiresHumanApproval,
    approvedByKind: latestRun?.approved_by_kind || "",
    approvedByRef: latestRun?.approved_by_ref || "",
  };

  if (approval.required && approval.approvedByKind && approval.approvedByRef) {
    approval.satisfied = true;
  }

  if (latestRun?.status === "completed" || ticket.state === "DONE") {
    return {
      projectId: ticket.projectId,
      ticketId: ticket.id,
      ticketKey: ticket.key,
      ticketTitle: ticket.title,
      ticketState: ticket.state,
      requiresHumanApproval,
      approval,
      canMerge: false,
      readiness: "closed",
      statusSummary: "Merge recorded and ticket closed.",
      blockingReasons: [],
      uncleanedWorktreeCount,
      latestRun: latestRun ? mergeRunDto({ ...mapMergeRun(latestRun), artifacts: latestRunArtifacts }) : null,
    };
  }

  if (latestRun?.status === "running" && !latestRun?.finished_at) {
    return {
      projectId: ticket.projectId,
      ticketId: ticket.id,
      ticketKey: ticket.key,
      ticketTitle: ticket.title,
      ticketState: ticket.state,
      requiresHumanApproval,
      approval,
      canMerge: false,
      readiness: "running",
      statusSummary: "Merge run in progress.",
      blockingReasons: [],
      uncleanedWorktreeCount,
      latestRun: latestRun ? mergeRunDto({ ...mapMergeRun(latestRun), artifacts: latestRunArtifacts }) : null,
    };
  }

  if (latestRun?.status === "blocked") {
    return {
      projectId: ticket.projectId,
      ticketId: ticket.id,
      ticketKey: ticket.key,
      ticketTitle: ticket.title,
      ticketState: ticket.state,
      requiresHumanApproval,
      approval,
      canMerge: mergeable,
      readiness: "blocked",
      statusSummary: latestRun.summary_md || "Latest merge attempt is blocked.",
      blockingReasons: [],
      uncleanedWorktreeCount,
      latestRun: mergeRunDto({ ...mapMergeRun(latestRun), artifacts: latestRunArtifacts }),
    };
  }

  if (latestRun?.status === "rework") {
    return {
      projectId: ticket.projectId,
      ticketId: ticket.id,
      ticketKey: ticket.key,
      ticketTitle: ticket.title,
      ticketState: ticket.state,
      requiresHumanApproval,
      approval,
      canMerge: mergeable,
      readiness: "rework",
      statusSummary: latestRun.summary_md || "Latest merge attempt requires rework.",
      blockingReasons: [],
      uncleanedWorktreeCount,
      latestRun: mergeRunDto({ ...mapMergeRun(latestRun), artifacts: latestRunArtifacts }),
    };
  }

  const blockingReasons = [];
  if (ticket.state !== "READY_TO_MERGE") {
    blockingReasons.push({
      code: "ticket_not_ready",
      source: "ticket",
      message: "Ticket must reach READY_TO_MERGE before merge can start.",
    });
  }
  blockingReasons.push(...mergePolicyBlocks);

  return {
    projectId: ticket.projectId,
    ticketId: ticket.id,
    ticketKey: ticket.key,
    ticketTitle: ticket.title,
    ticketState: ticket.state,
    requiresHumanApproval,
    approval,
    canMerge: mergeable,
    readiness: mergeable ? (requiresHumanApproval ? "approval_required" : "ready") : "waiting",
    statusSummary: mergeable
      ? requiresHumanApproval
        ? "Ready to merge after operator approval is recorded."
        : "Ready to merge."
      : mergePolicyBlock || "Ticket must reach READY_TO_MERGE before merge can start.",
    blockingReasons,
    uncleanedWorktreeCount,
    latestRun: latestRun ? mergeRunDto({ ...mapMergeRun(latestRun), artifacts: latestRunArtifacts }) : null,
  };
}

function mapTicketStateToBoardState(ticketState) {
  if (ticketState === "DRAFT") return "PROPOSED";
  if (ticketState === "MERGING") return "READY_TO_MERGE";
  if (ticketState === "CANCELLED") return "DONE";
  return ticketState;
}

function deriveTicketStateForExecutionOutcome(currentState, outcome, blockedKind, policy, role) {
  if (role === "reviewer") {
    if (outcome === "completed" || outcome === "needs_continue") return "REVIEWING";
    if (outcome === "blocked") return "BLOCKED";
    if (outcome === "failed" && blockedKind) return "BLOCKED";
    if (outcome === "followup_created") return "DONE";
    return "REVIEWING";
  }
  if (role === "validator") {
    if (outcome === "completed" || outcome === "needs_continue") return "VALIDATING";
    if (outcome === "blocked") return "BLOCKED";
    if (outcome === "failed" && blockedKind) return "BLOCKED";
    if (outcome === "followup_created") return "DONE";
    return "VALIDATING";
  }
  if (outcome === "completed") {
    const requireReviewer = readPolicyBoolean(policy, "requireReviewer", "require_reviewer");
    const requireValidator = readPolicyBoolean(policy, "requireValidator", "require_validator");
    if (requireReviewer) {
      return "REVIEWING";
    }
    if (requireValidator) {
      return "VALIDATING";
    }
    return "READY_TO_MERGE";
  }
  if (outcome === "needs_continue") return "WORKING";
  if (outcome === "blocked") return "BLOCKED";
  if (outcome === "failed" && blockedKind) return "BLOCKED";
  if (outcome === "followup_created") return "DONE";
  return "WORKING";
}

function deriveAgentCreatedTicketState(policy, requestedState) {
  const defaultState = requestedState || policy.agentCreatedTicketDefaultState || policy.agent_created_ticket_default_state;
  if ((policy.refinementMode || policy.refinement_mode) === "autonomous") {
    return defaultState;
  }
  return defaultState === "DRAFT" ? "DRAFT" : "PROPOSED";
}

function deriveTicketStateForExecutionStart(role) {
  if (role === "reviewer") return "REVIEWING";
  if (role === "validator") return "VALIDATING";
  return "WORKING";
}

function deriveTicketStateForReviewVerdict(policy, verdict) {
  const requireValidator = readPolicyBoolean(policy, "requireValidator", "require_validator");
  if (verdict === "passed") {
    return requireValidator ? "VALIDATING" : "READY_TO_MERGE";
  }
  if (verdict === "blocked") {
    return "BLOCKED";
  }
  return "REWORK";
}

function deriveTicketStateForValidationVerdict(_policy, verdict) {
  if (verdict === "passed") {
    return "READY_TO_MERGE";
  }
  if (verdict === "blocked") {
    return "BLOCKED";
  }
  return "REWORK";
}

function deriveTicketStateForMergeStatus(status) {
  if (status === "completed") {
    return "DONE";
  }
  if (status === "blocked") {
    return "BLOCKED";
  }
  if (status === "rework") {
    return "REWORK";
  }
  throw new Error(`Invalid merge status: ${status}`);
}

function describeMergePolicyBlock(policy, latestReview, latestValidation) {
  return buildMergePolicyBlocks(policy, latestReview, latestValidation)[0]?.message || "";
}

function buildMergePolicyBlocks(policy, latestReview, latestValidation) {
  const requireReviewer = readPolicyBoolean(policy, "requireReviewer", "require_reviewer");
  const requireValidator = readPolicyBoolean(policy, "requireValidator", "require_validator");
  const requiredValidationCommandProfile = optionalText(
    policy.requiredValidationCommandProfileForMerge || policy.required_validation_command_profile_for_merge,
  );
  const blocks = [];

  if (requireReviewer && latestReview?.verdict !== "passed") {
    blocks.push({
      code: "review_required",
      source: "review",
      message: "Latest review must pass before merge",
    });
  }
  if (requireValidator && latestValidation?.verdict !== "passed") {
    blocks.push({
      code: "validation_required",
      source: "validation",
      message: "Latest validation must pass before merge",
    });
  }
  if (requiredValidationCommandProfile && latestValidation?.command_profile !== requiredValidationCommandProfile) {
    blocks.push({
      code: "validation_profile_required",
      source: "validation",
      message: `Latest validation must use ${requiredValidationCommandProfile} profile before merge`,
      requiredCommandProfile: requiredValidationCommandProfile,
      actualCommandProfile: latestValidation?.command_profile || "",
    });
  }

  return blocks;
}

function deriveWorktreeStatusForOutcome(outcome) {
  if (outcome === "completed") return "ready_for_review";
  if (outcome === "needs_continue") return "needs_continue";
  if (outcome === "blocked") return "blocked";
  if (outcome === "followup_created") return "handoff";
  return "failed";
}

function planExecutionWorktrees(database, projectId, ticket, execution, timestamp) {
  const project = getProjectRow(database, projectId);
  const repoTargets = getRepoTargetsByTicketId(database, [ticket.id]).get(ticket.id) || [];
  const worktreeLeaf =
    execution.role === "developer" ? `iter-${execution.iteration}` : `${execution.role}-iter-${execution.iteration}`;

  return repoTargets.map((target) => ({
    id: `worktree_${randomUUID()}`,
    projectId,
    repoId: target.repoId,
    ticketId: ticket.id,
    executionId: execution.id,
    repoName: target.repoName,
    path: resolve(
      project.workspace_root,
      ".pool",
      "worktrees",
      ticket.key.toLowerCase(),
      target.repoSlug,
      worktreeLeaf,
    ),
    branchName: target.branchName || defaultWorktreeBranchName(ticket, execution.role, execution.iteration),
    baseRef: target.baseRef,
    status: "active",
    isDirty: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    cleanedAt: null,
  }));
}

function defaultWorktreeBranchName(ticket, role = "developer", iteration = 1) {
  const base = `${ticket.key.toLowerCase()}-${slugify(ticket.title).replaceAll("_", "-")}`;
  if (role === "developer") {
    return base.slice(0, 63);
  }
  return `${base}-${role}-iter-${iteration}`.slice(0, 63);
}

function normalizeRepoTargets(database, projectId, repoTargets) {
  const reposById = new Map(
    database
      .prepare("select id, default_branch from repos where project_id = ?")
      .all(projectId)
      .map((row) => [row.id, row]),
  );
  const seenRepoIds = new Set();

  return repoTargets.map((target, index) => {
    const repoId = requiredText(target.repoId, `repoTargets[${index}].repoId`);
    if (seenRepoIds.has(repoId)) {
      throw new Error(`Duplicate repo target: ${repoId}`);
    }

    const repo = reposById.get(repoId);
    if (!repo) {
      throw new Error(`Unknown repo target: ${repoId}`);
    }

    seenRepoIds.add(repoId);
    return {
      repoId,
      baseRef: optionalText(target.baseRef, repo.default_branch),
      branchName: optionalText(target.branchName),
      targetScopeMd: optionalText(target.targetScopeMd),
    };
  });
}

function normalizeValidationRepoIds(database, projectId, ticket, repoTargets, repoIds) {
  const targetedRepoIds = new Set(repoTargets.map((target) => target.repoId));
  const candidateRepoIds = repoIds.length > 0 ? repoIds : [...targetedRepoIds];
  if (candidateRepoIds.length === 0) {
    throw new Error(`No repo targets configured for validation on ${ticket.key}`);
  }

  const seenRepoIds = new Set();
  return candidateRepoIds.map((repoId) => {
    const normalizedRepoId = requiredText(repoId, "repoId");
    if (seenRepoIds.has(normalizedRepoId)) {
      throw new Error(`Duplicate validation repo target: ${normalizedRepoId}`);
    }
    seenRepoIds.add(normalizedRepoId);

    const repo = database
      .prepare("select id from repos where project_id = ? and id = ?")
      .get(projectId, normalizedRepoId);
    if (!repo) {
      throw new Error(`Unknown validation repo target: ${normalizedRepoId}`);
    }
    if (targetedRepoIds.size > 0 && !targetedRepoIds.has(normalizedRepoId)) {
      throw new Error(`Validation repo target is not attached to ${ticket.key}: ${normalizedRepoId}`);
    }
    return normalizedRepoId;
  });
}

function readPolicyBoolean(policy, mappedKey, rawKey) {
  if (Object.prototype.hasOwnProperty.call(policy, mappedKey)) {
    return Boolean(policy[mappedKey]);
  }
  return Boolean(policy[rawKey]);
}

function applyParentTicketPatch(database, updates, changedFields, projectId, ticketId, input, existing) {
  if (!hasOwn(input, "parentTicketId")) {
    return;
  }

  const parentTicketId = input.parentTicketId ?? null;
  if (parentTicketId === ticketId) {
    throw new Error("A ticket cannot parent itself");
  }

  if (parentTicketId) {
    const parentTicket = database
      .prepare("select id from tickets where project_id = ? and id = ?")
      .get(projectId, parentTicketId);
    if (!parentTicket) {
      throw new Error(`Unknown parent ticket: ${parentTicketId}`);
    }
    assertNoParentCycle(database, projectId, ticketId, parentTicketId);
  }

  if ((existing.parent_ticket_id || null) === parentTicketId) {
    return;
  }

  updates.parent_ticket_id = parentTicketId;
  changedFields.push("parentTicketId");
}

function assertNoParentCycle(database, projectId, ticketId, parentTicketId) {
  let currentTicketId = parentTicketId;
  while (currentTicketId) {
    if (currentTicketId === ticketId) {
      throw new Error(`Parent cycle detected for ticket ${ticketId}`);
    }

    currentTicketId = (
      database
        .prepare("select parent_ticket_id from tickets where project_id = ? and id = ?")
        .get(projectId, currentTicketId) || {}
    ).parent_ticket_id;
  }
}

function assertNoDependencyCycle(database, projectId, blockedTicketId, blockingTicketId) {
  const pendingTicketIds = [blockingTicketId];
  const seenTicketIds = new Set();

  while (pendingTicketIds.length > 0) {
    const currentTicketId = pendingTicketIds.pop();
    if (!currentTicketId || seenTicketIds.has(currentTicketId)) {
      continue;
    }

    if (currentTicketId === blockedTicketId) {
      throw new Error(`Dependency cycle detected for ticket ${blockedTicketId}`);
    }

    seenTicketIds.add(currentTicketId);
    const blockingTicketIds = database
      .prepare(
        `select blocking_ticket_id
         from ticket_dependencies
         where project_id = ? and blocked_ticket_id = ?`,
      )
      .all(projectId, currentTicketId)
      .map((row) => row.blocking_ticket_id);
    pendingTicketIds.push(...blockingTicketIds);
  }
}

function listTicketRepoTargetRows(database, ticketId) {
  return database
    .prepare(
      `select id, repo_id, base_ref, branch_name, target_scope_md
       from ticket_repo_targets
       where ticket_id = ?
       order by repo_id asc`,
    )
    .all(ticketId)
    .map((row) => ({
      id: row.id,
      repoId: row.repo_id,
      baseRef: row.base_ref,
      branchName: row.branch_name,
      targetScopeMd: row.target_scope_md,
    }));
}

function repoTargetsEqual(currentTargets, nextTargets) {
  if (currentTargets.length !== nextTargets.length) {
    return false;
  }

  const currentByRepoId = new Map(currentTargets.map((target) => [target.repoId, target]));
  for (const nextTarget of nextTargets) {
    const currentTarget = currentByRepoId.get(nextTarget.repoId);
    if (!currentTarget) {
      return false;
    }

    if (
      currentTarget.baseRef !== nextTarget.baseRef ||
      currentTarget.branchName !== nextTarget.branchName ||
      currentTarget.targetScopeMd !== nextTarget.targetScopeMd
    ) {
      return false;
    }
  }

  return true;
}

function syncTicketRepoTargets(database, ticketId, repoTargets, timestamp) {
  const existingTargets = listTicketRepoTargetRows(database, ticketId);
  const existingByRepoId = new Map(existingTargets.map((target) => [target.repoId, target]));
  const nextByRepoId = new Map(repoTargets.map((target) => [target.repoId, target]));

  for (const existingTarget of existingTargets) {
    if (!nextByRepoId.has(existingTarget.repoId)) {
      database.prepare("delete from ticket_repo_targets where ticket_id = ? and repo_id = ?").run(ticketId, existingTarget.repoId);
    }
  }

  for (const target of repoTargets) {
    const existingTarget = existingByRepoId.get(target.repoId);
    if (!existingTarget) {
      insertTicketRepoTarget(database, ticketId, target, timestamp);
      continue;
    }

    if (
      existingTarget.baseRef === target.baseRef &&
      existingTarget.branchName === target.branchName &&
      existingTarget.targetScopeMd === target.targetScopeMd
    ) {
      continue;
    }

    database
      .prepare(
        `update ticket_repo_targets
         set base_ref = ?, branch_name = ?, target_scope_md = ?, updated_at = ?
         where ticket_id = ? and repo_id = ?`,
      )
      .run(target.baseRef, target.branchName, target.targetScopeMd, timestamp, ticketId, target.repoId);
  }
}

function insertTicketRepoTarget(database, ticketId, target, timestamp) {
  database
    .prepare(
      `insert into ticket_repo_targets (
        id, ticket_id, repo_id, base_ref, branch_name, target_scope_md, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      `ticket_target_${slugify(ticketId)}_${slugify(target.repoId)}`,
      ticketId,
      target.repoId,
      target.baseRef,
      target.branchName,
      target.targetScopeMd,
      timestamp,
      timestamp,
    );
}

function insertArtifacts(database, projectId, ticketId, scope, artifacts, timestamp) {
  for (const artifact of artifacts) {
    database
      .prepare(
        `insert into artifacts (
          id, project_id, ticket_id, execution_id, review_id, validation_run_id, merge_run_id,
          kind, label, uri, metadata_json, created_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        `artifact_${randomUUID()}`,
        projectId,
        ticketId,
        scope.executionId || null,
        scope.reviewId || null,
        scope.validationRunId || null,
        scope.mergeRunId || null,
        requiredText(artifact.kind, "artifact.kind"),
        requiredText(artifact.label, "artifact.label"),
        requiredText(artifact.uri, "artifact.uri"),
        JSON.stringify(artifact.metadata || {}),
        timestamp,
      );
  }
}

function insertProjectPolicy(database, projectId, policy, timestamp) {
  database
    .prepare(
      `insert into project_policies (
        id, project_id, require_reviewer, require_validator,
        require_human_approval_before_merge, required_validation_command_profile_for_merge,
        max_parallel_executions, max_parallel_merges, max_auto_continue_iterations,
        refinement_mode, agent_created_ticket_default_state, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      `policy_${slugify(projectId)}`,
      projectId,
      policy.requireReviewer ? 1 : 0,
      policy.requireValidator ? 1 : 0,
      policy.requireHumanApprovalBeforeMerge ? 1 : 0,
      policy.requiredValidationCommandProfileForMerge || "",
      policy.maxParallelExecutions,
      policy.maxParallelMerges ?? 1,
      policy.maxAutoContinueIterations,
      policy.refinementMode || "user_approved",
      policy.agentCreatedTicketDefaultState,
      timestamp,
      timestamp,
    );
}

function insertRoleProfiles(database, projectId, roleProfiles, timestamp) {
  for (const profile of roleProfiles) {
    database
      .prepare(
        `insert into agent_profiles (
          id, project_id, role, adapter, model, config_json, created_at, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        `profile_${slugify(projectId)}_${slugify(profile.role)}`,
        projectId,
        profile.role,
        profile.adapter,
        profile.model,
        JSON.stringify(profile.config || {}),
        timestamp,
        timestamp,
      );
  }
}

function insertEvent(database, input) {
  database
    .prepare(
      `insert into events (
        id, project_id, repo_id, ticket_id, type, summary, detail, reason_code, reason_source, created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      `event_${randomUUID()}`,
      input.projectId,
      input.repoId || null,
      input.ticketId || null,
      input.type,
      input.summary,
      input.detail || "",
      input.reasonCode || "",
      input.reasonSource || "",
      now(),
    );
}

function seed(database, workspaceRoot) {
  const timestamp = now();
  const projectId = "project_pool";
  const repoId = "repo_project_pool_pool";

  withTransaction(database, () => {
    database
      .prepare(
        `insert into projects (
          id, slug, name, description, workspace_root, default_base_branch, created_at, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        projectId,
        "pool",
        "Pool",
        "Governed autonomous delivery control plane.",
        workspaceRoot,
        "main",
        timestamp,
        timestamp,
      );

    insertProjectPolicy(database, projectId, defaultProjectPolicy(), timestamp);
    insertRoleProfiles(database, projectId, defaultRoleProfiles(), timestamp);

    database
      .prepare(
        `insert into repos (
          id, project_id, slug, name, local_path, remote_url, default_branch, is_primary, created_at, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(repoId, projectId, "pool", "pool", workspaceRoot, "", "main", 1, timestamp, timestamp);

    const seededTickets = [
      {
        id: "ticket_project_pool_1",
        key: "POOL-1",
        title: "Stand up real API service skeleton",
        brief: "Replace bootstrap-root API with the actual product service.",
        state: "WORKING",
        priority: "high",
        acceptanceCriteriaMd: "- health endpoint\n- project listing\n- ticket CRUD shape",
        definitionOfDoneMd: "- service boots\n- domain package wired\n- MVP endpoints respond",
        assignedRole: "developer",
        latestSummary: "API scaffolding in progress",
        branchName: "pool-1-api-skeleton",
        targetScopeMd: "services/api and shared packages",
      },
      {
        id: "ticket_project_pool_2",
        key: "POOL-2",
        title: "Define first transport contracts",
        brief: "Codify project, repo, ticket, and event response shapes.",
        state: "READY",
        priority: "high",
        acceptanceCriteriaMd: "- contracts package exists\n- DTOs are shared",
        definitionOfDoneMd: "- backend uses shared contracts",
        assignedRole: "architect",
        latestSummary: "Ready for contract pass",
        branchName: "pool-2-contracts",
        targetScopeMd: "packages/contracts",
      },
    ];

    for (const [index, ticket] of seededTickets.entries()) {
      database
        .prepare(
          `insert into tickets (
            id, project_id, parent_ticket_id, key, title, brief, acceptance_criteria_md,
            definition_of_done_md, state, priority, assigned_role, latest_summary, created_at, updated_at
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          ticket.id,
          projectId,
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
          `ticket_target_project_pool_${index + 1}`,
          ticket.id,
          repoId,
          "main",
          ticket.branchName,
          ticket.targetScopeMd,
          timestamp,
          timestamp,
        );
    }

    insertEvent(database, {
      projectId,
      type: "project.created",
      summary: "Project Pool seeded",
    });
    insertEvent(database, {
      projectId,
      repoId,
      type: "repo.created",
      summary: "Repo pool seeded",
    });
    for (const ticket of seededTickets) {
      insertEvent(database, {
        projectId,
        ticketId: ticket.id,
        type: "ticket.created",
        summary: `${ticket.key} seeded`,
      });
    }
  });
}

function now() {
  return new Date().toISOString();
}

function addMs(timestamp, milliseconds) {
  return new Date(new Date(timestamp).getTime() + milliseconds).toISOString();
}

function isExpiredIso(timestamp, referenceTimestamp = now()) {
  if (!timestamp) {
    return true;
  }
  return new Date(timestamp).getTime() <= new Date(referenceTimestamp).getTime();
}

function requiredText(value, fieldName) {
  const text = optionalText(value);
  if (!text) {
    throw new Error(`Missing required field: ${fieldName}`);
  }
  return text;
}

function optionalText(value, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }
  return value.trim() || fallback;
}

function normalizeFilesystemPath(value) {
  const text = requiredText(value, "path");
  if (text === "~") {
    return homedir();
  }
  if (text.startsWith("~/")) {
    return resolve(homedir(), text.slice(2));
  }
  return text;
}

function deleteWorktreePath(worktreePath) {
  const resolvedPath = resolve(worktreePath);
  assertDeletableWorktreePath(resolvedPath);
  rmSync(resolvedPath, { recursive: true, force: true });
}

function assertDeletableWorktreePath(worktreePath) {
  const resolvedPath = resolve(worktreePath);
  const marker = `${sep}.pool${sep}worktrees${sep}`;
  if (!resolvedPath.includes(marker)) {
    throw new Error(`Refusing to delete non-Pool worktree path: ${worktreePath}`);
  }
}

function applyTicketTextPatch(updates, changedFields, input, existing, field, options = {}) {
  applyTextPatch(updates, changedFields, input, existing, field, options);
}

function applyTextPatch(updates, changedFields, input, existing, field, options = {}) {
  if (!hasOwn(input, field)) {
    return;
  }

  const rawValue = input[field];
  if (typeof rawValue !== "string") {
    throw new Error(`Field ${field} must be a string`);
  }

  const textValue = options.required ? requiredText(rawValue, field) : rawValue.trim();
  const value = options.transform ? options.transform(textValue) : textValue;
  const column = options.column || camelToSnake(field);
  if (existing[column] === value) {
    return;
  }

  updates[column] = value;
  changedFields.push(field);
}

function applyBooleanPatch(updates, changedFields, input, existing, field, options = {}) {
  if (!hasOwn(input, field)) {
    return;
  }

  if (typeof input[field] !== "boolean") {
    throw new Error(`Field ${field} must be a boolean`);
  }

  const column = options.column || camelToSnake(field);
  const value = input[field] ? 1 : 0;
  if (Number(existing[column]) === value) {
    return;
  }

  updates[column] = value;
  changedFields.push(field);
}

function applyPositiveIntegerPatch(updates, changedFields, input, existing, field, options = {}) {
  if (!hasOwn(input, field)) {
    return;
  }

  if (!Number.isInteger(input[field]) || input[field] <= 0) {
    throw new Error(`Field ${field} must be a positive integer`);
  }

  const column = options.column || camelToSnake(field);
  if (Number(existing[column]) === input[field]) {
    return;
  }

  updates[column] = input[field];
  changedFields.push(field);
}

function applyRefinementModePatch(updates, changedFields, input, existing) {
  if (!hasOwn(input, "refinementMode")) {
    return;
  }

  const refinementMode = requiredText(input.refinementMode, "refinementMode");
  if (!isRefinementMode(refinementMode)) {
    throw new Error(`Invalid refinement mode: ${refinementMode}`);
  }

  if (existing.refinement_mode === refinementMode) {
    return;
  }

  updates.refinement_mode = refinementMode;
  changedFields.push("refinementMode");
}

function camelToSnake(value) {
  return value.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);
}

function hasOwn(value, key) {
  return Boolean(value) && Object.prototype.hasOwnProperty.call(value, key);
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function getProjectPolicyRow(database, projectId) {
  return database.prepare("select * from project_policies where project_id = ?").get(projectId);
}

function migrateSchema(database) {
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

  const eventColumns = new Set(database.prepare("pragma table_info(events)").all().map((row) => row.name));
  if (!eventColumns.has("reason_code")) {
    database.exec("alter table events add column reason_code text not null default ''");
  }
  if (!eventColumns.has("reason_source")) {
    database.exec("alter table events add column reason_source text not null default ''");
  }

  const executionColumns = new Set(database.prepare("pragma table_info(executions)").all().map((row) => row.name));
  if (!executionColumns.has("claim_token")) {
    database.exec("alter table executions add column claim_token text not null default ''");
  }
  if (!executionColumns.has("claim_expires_at")) {
    database.exec("alter table executions add column claim_expires_at text");
  }

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
  const artifactForeignKeys = database.prepare("pragma foreign_key_list(artifacts)").all();
  if (artifactForeignKeys.some((row) => row.from === "merge_run_id" && row.table !== "merge_runs")) {
    migrateArtifactsMergeRunReference(database);
  }
}

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

function touchProjectUpdatedAt(database, projectId, timestamp) {
  database.prepare("update projects set updated_at = ? where id = ?").run(timestamp, projectId);
}

function withTransaction(database, action) {
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
