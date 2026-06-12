import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { homedir } from "node:os";
import { resolve, sep } from "node:path";
import { defaultCeremonyAutomation } from "../../config/src/index.mjs";
import { ceremonyRunDto } from "../../contracts/src/index.mjs";
import { isCeremonyType, isRefinementMode } from "../../domain/src/index.mjs";
import { sqliteSchema, migrateSchema } from "./sqlite-schema.mjs";
import {
  mapArtifact,
  mapExecution,
  mapMergeRun,
  mapReview,
  mapValidationRun,
  mapWorktree,
} from "./sqlite-row-mappers.mjs";
import {
  getCountMap,
  getArtifactsByExecutionId,
  getArtifactsByMergeRunId,
  getArtifactsByReviewId,
  getArtifactsByTicketId,
  getArtifactsByValidationRunId,
  buildBoardSummary,
  buildMergePolicyBlocks,
  buildMergeStatus,
  getDependenciesByBlockedTicketId,
  getExecutionsByTicketId,
  getLatestMergeRunRow,
  getLatestReviewRow,
  getLatestReviewVerdictsByTicketId,
  getLatestValidationRunRow,
  getLatestValidationVerdictsByTicketId,
  getRepoTargetsByTicketId,
  getReviewFindingsByReviewId,
  getReviewsByTicketId,
  getValidationRunsByTicketId,
  getWorktreesByExecutionId,
  getWorktreesByTicketId,
  groupWorktreesByExecutionId,
  listProjectArtifacts,
  listProjectEvents,
  listTicketRows,
  listWorktreeRows,
  mapTicketStateToBoardState,
} from "./sqlite-read-models.mjs";
import { seedDemoProject } from "./sqlite-seed.mjs";
import { createEvidenceCommands } from "./sqlite-evidence-commands.mjs";
import { createExecutionCommands } from "./sqlite-execution-commands.mjs";
import { createMergeCommands } from "./sqlite-merge-commands.mjs";
import { createProjectCommands } from "./sqlite-project-commands.mjs";
import { createRepoCommands } from "./sqlite-repo-commands.mjs";
import { defaultDatabasePath, openSqliteDatabase, withTransaction } from "./sqlite-runtime.mjs";
import { createTicketCommands } from "./sqlite-ticket-commands.mjs";

export { defaultDatabasePath } from "./sqlite-runtime.mjs";

export function createSqliteStore(options = {}) {
  const filename = options.filename || defaultDatabasePath();
  const database = openSqliteDatabase({
    filename,
    schema: sqliteSchema,
    migrate: migrateSchema,
  });

  if (options.seedDemo !== false && countProjects(database) === 0) {
    seedDemoProject(database, options.workspaceRoot || process.cwd(), {
      insertEvent,
      insertProjectPolicy,
      insertRoleProfiles,
      now,
    });
  }

  let store;

  const projectCommands = createProjectCommands({
    database,
    getProjectRow,
    getProjectPolicyRow,
    insertProjectPolicy,
    insertRoleProfiles,
    insertEvent,
    touchProjectUpdatedAt,
    withTransaction,
    now,
    requiredText,
    optionalText,
    normalizeFilesystemPath,
    slugify,
    applyTextPatch,
    applyBooleanPatch,
    applyPositiveIntegerPatch,
    applyRefinementModePatch,
    applyJsonObjectPatch,
    hasOwn,
    mapProject,
    mapProjectPolicy,
    mapRoleProfile,
    mapTicket,
    buildBoardSummary,
    getCountMap,
    getLatestReviewVerdictsByTicketId,
    getLatestValidationVerdictsByTicketId,
    getRepoTargetsByTicketId,
    listTicketRows,
    mapTicketStateToBoardState,
  });

  const repoCommands = createRepoCommands({
    database,
    getProjectRow,
    insertEvent,
    withTransaction,
    now,
    requiredText,
    optionalText,
    normalizeFilesystemPath,
    slugify,
    applyTextPatch,
    applyBooleanPatch,
    mapRepo,
  });

  const ticketCommands = createTicketCommands({
    database,
    getTicketRow,
    getProjectRow,
    insertEvent,
    withTransaction,
    now,
    requiredText,
    optionalText,
    slugify,
    mapTicket,
    mapWorktree,
    applyTicketTextPatch,
    applyParentTicketPatch,
    assertDeletableWorktreePath,
    assertNoDependencyCycle,
    buildMergeStatus,
    getArtifactsByExecutionId,
    getArtifactsByTicketId,
    getCountMap,
    getDependenciesByBlockedTicketId,
    getExecutionsByTicketId,
    getLatestReviewVerdictsByTicketId,
    getLatestValidationVerdictsByTicketId,
    getRepoTargetsByTicketId,
    getReviewsByTicketId,
    getValidationRunsByTicketId,
    getWorktreesByTicketId,
    groupWorktreesByExecutionId,
    listProjectEvents,
    listTicketRows,
    listWorktreeRows,
    listTicketRepoTargetRows,
    normalizeRepoTargets,
    insertTicketRepoTarget,
    repoTargetsEqual,
    syncTicketRepoTargets,
    deleteWorktreePath,
  });

  const executionCommands = createExecutionCommands({
    database,
    assertProjectCanStartExecution,
    deriveAgentCreatedTicketState,
    deriveExecutionEventReason,
    deriveTicketStateForExecutionOutcome,
    deriveTicketStateForExecutionStart,
    deriveWorktreeStatusForOutcome,
    getExecutionRow,
    getStore: () => store,
    getTicketRow,
    getWorktreeRow,
    insertArtifacts,
    insertEvent,
    planExecutionWorktrees,
    requiredProjectPolicy,
    resolveAgentProfileForExecution,
    startAutoRoutedLaneExecution,
    withTransaction,
    now,
    requiredText,
    optionalText,
    addMs,
    isExpiredIso,
    mapExecution,
    mapWorktree,
    getArtifactsByExecutionId,
    getWorktreesByExecutionId,
    listWorktreeRows,
  });

  const evidenceCommands = createEvidenceCommands({
    database,
    getExecutionRow,
    getTicketRow,
    insertArtifacts,
    insertEvent,
    withTransaction,
    now,
    requiredText,
    optionalText,
    requiredProjectPolicy,
    resolveAgentProfileForExecution,
    deriveTicketStateForReviewVerdict,
    deriveTicketStateForValidationVerdict,
    deriveReviewEventReason,
    deriveValidationEventReason,
    normalizeValidationRepoIds,
    buildMergePolicyBlocks,
    getLatestReviewRow,
    getRepoTargetsByTicketId,
    getReviewsByTicketId,
    getValidationRunsByTicketId,
    listProjectArtifacts,
    startAutoRoutedLaneExecution,
    getStore: () => store,
  });

  const mergeCommands = createMergeCommands({
    database,
    addMs,
    assertProjectCanStartMerge,
    buildMergeStatus,
    deriveMergeEventReason,
    deriveTicketStateForMergeStatus,
    describeMergePolicyBlock,
    getArtifactsByMergeRunId,
    getLatestMergeRunRow,
    getLatestReviewRow,
    getLatestValidationRunRow,
    getProjectRow,
    getTicketRow,
    getWorktreesByTicketId,
    insertArtifacts,
    insertEvent,
    isExpiredIso,
    listTicketRows,
    mapMergeRun,
    mapTicket,
    now,
    optionalText,
    readPolicyBoolean,
    requiredProjectPolicy,
    requiredText,
    withTransaction,
  });

  store = {
    close() {
      database.close();
    },

    ...projectCommands,

    ...mergeCommands,

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
      const participantsByRunId = getCeremonyParticipantsByRunId(
        database,
        projectId,
        runs.map((run) => run.id),
      );
      return runs.map((run) =>
        ceremonyRunDto(run, proposalsByRunId.get(run.id) || [], participantsByRunId.get(run.id) || []),
      );
    },

    getCeremonyRun(projectId, runId) {
      const row = database
        .prepare("select * from ceremony_runs where project_id = ? and id = ?")
        .get(projectId, runId);
      if (!row) {
        return null;
      }
      const run = mapCeremonyRun(row);
      return ceremonyRunDto(
        run,
        getCeremonyProposalsByRunId(database, projectId, [run.id]).get(run.id) || [],
        getCeremonyParticipantsByRunId(database, projectId, [run.id]).get(run.id) || [],
      );
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
      const scope = buildCeremonyScope(input.type, input);
      const proposals = buildCeremonyProposals(input.type, snapshot, timestamp);
      const summary = buildCeremonySummary(input.type, snapshot, proposals, scope);
      const run = {
        id: runId,
        projectId,
        type: input.type,
        status: "proposed",
        scope,
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
          detail: `${snapshot.tickets.length} ticket(s), ${snapshot.repos.length} repo(s) in scope. Participants: ${scope.participantRoles.join(", ")}. Decider: ${scope.deciderRole}.`,
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

        for (const role of scope.participantRoles || []) {
          database
            .prepare(
              `insert into ceremony_participants (
                id, project_id, run_id, role, status, outcome, summary_md,
                questions_md, risk_md, payload_json, started_at, finished_at,
                created_at, updated_at
              ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(
              `ceremony_participant_${randomUUID()}`,
              projectId,
              runId,
              role,
              "pending",
              "",
              "",
              "",
              "",
              "{}",
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

    listPendingCeremonyParticipants() {
      return database
        .prepare(
          `select cp.*, cr.type as ceremony_type
           from ceremony_participants cp
           join ceremony_runs cr on cr.id = cp.run_id
           where cp.status = 'pending'
           order by cp.created_at asc`,
        )
        .all()
        .map(mapCeremonyParticipant);
    },

    startCeremonyParticipant(projectId, participantId) {
      const existing = database
        .prepare("select * from ceremony_participants where project_id = ? and id = ?")
        .get(projectId, participantId);
      if (!existing || existing.status !== "pending") {
        return existing ? mapCeremonyParticipant(existing) : null;
      }
      const timestamp = now();
      database
        .prepare(
          "update ceremony_participants set status = 'running', started_at = ?, updated_at = ? where project_id = ? and id = ?",
        )
        .run(timestamp, timestamp, projectId, participantId);
      database
        .prepare("update ceremony_runs set status = 'running', updated_at = ? where project_id = ? and id = ? and status = 'proposed'")
        .run(timestamp, projectId, existing.run_id);
      return mapCeremonyParticipant(
        database.prepare("select * from ceremony_participants where project_id = ? and id = ?").get(projectId, participantId),
      );
    },

    completeCeremonyParticipant(projectId, participantId, input = {}) {
      const existing = database
        .prepare("select * from ceremony_participants where project_id = ? and id = ?")
        .get(projectId, participantId);
      if (!existing || existing.status === "completed") {
        return existing ? mapCeremonyParticipant(existing) : null;
      }
      const timestamp = now();
      database
        .prepare(
          `update ceremony_participants
           set status = 'completed', outcome = ?, summary_md = ?, questions_md = ?,
               risk_md = ?, payload_json = ?, finished_at = ?, updated_at = ?
           where project_id = ? and id = ?`,
        )
        .run(
          optionalText(input.outcome, "completed"),
          optionalText(input.summaryMd, `${existing.role} completed ceremony participation.`),
          optionalText(input.questionsMd, ""),
          optionalText(input.riskMd, ""),
          JSON.stringify(input.payload || {}),
          timestamp,
          timestamp,
          projectId,
          participantId,
        );
      maybeSynthesizeCeremonyParticipants(database, projectId, existing.run_id, timestamp);
      return mapCeremonyParticipant(
        database.prepare("select * from ceremony_participants where project_id = ? and id = ?").get(projectId, participantId),
      );
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

    ...repoCommands,

    ...ticketCommands,

    ...executionCommands,

    ...evidenceCommands,

    listEvents(projectId, filters = {}) {
      return listProjectEvents(database, projectId, filters);
    },

  };
  return store;
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
    ceremonyAutomation: mergeCeremonyAutomation(parseJsonObject(row.ceremony_automation_json, {})),
  };
}

function mergeCeremonyAutomation(value = {}) {
  const defaults = defaultCeremonyAutomation();
  const triggers = value.triggers && typeof value.triggers === "object" && !Array.isArray(value.triggers)
    ? value.triggers
    : {};
  return {
    ...defaults,
    ...value,
    triggers: Object.fromEntries(
      Object.entries(defaults.triggers).map(([type, trigger]) => [
        type,
        {
          ...trigger,
          ...(triggers[type] || {}),
        },
      ]),
    ),
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

function mapCeremonyParticipant(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    runId: row.run_id,
    role: row.role,
    status: row.status,
    outcome: row.outcome,
    summaryMd: row.summary_md,
    questionsMd: row.questions_md,
    riskMd: row.risk_md,
    payload: parseJsonObject(row.payload_json, {}),
    ceremonyType: row.ceremony_type || "",
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getCeremonyParticipantsByRunId(database, projectId, runIds) {
  const byRunId = new Map(runIds.map((runId) => [runId, []]));
  if (runIds.length === 0) {
    return byRunId;
  }
  const placeholders = runIds.map(() => "?").join(", ");
  const rows = database
    .prepare(
      `select *
       from ceremony_participants
       where project_id = ? and run_id in (${placeholders})
       order by created_at asc`,
    )
    .all(projectId, ...runIds);
  for (const row of rows) {
    byRunId.get(row.run_id)?.push(mapCeremonyParticipant(row));
  }
  return byRunId;
}

function maybeSynthesizeCeremonyParticipants(database, projectId, runId, timestamp) {
  const participants = database
    .prepare("select * from ceremony_participants where project_id = ? and run_id = ? order by created_at asc")
    .all(projectId, runId)
    .map(mapCeremonyParticipant);
  if (participants.length === 0 || participants.some((participant) => participant.status !== "completed")) {
    return;
  }

  const existingSynthesis = database
    .prepare(
      "select id from ceremony_proposals where project_id = ? and run_id = ? and kind = 'note' and summary like 'Agent consensus:%'",
    )
    .get(projectId, runId);
  if (existingSynthesis) {
    return;
  }

  const run = mapCeremonyRun(
    database.prepare("select * from ceremony_runs where project_id = ? and id = ?").get(projectId, runId),
  );
  const deciderRole = run.scope?.deciderRole || "operator";
  const participantSummary = participants
    .map((participant) => `${participant.role}: ${participant.summaryMd || participant.outcome || "completed"}`)
    .join("\n");
  const unresolvedQuestions = participants
    .map((participant) => participant.questionsMd)
    .filter(Boolean)
    .join("\n");
  const risks = participants
    .map((participant) => participant.riskMd)
    .filter(Boolean)
    .join("\n");
  const summary = `Agent consensus: ${deciderRole} synthesized ${participants.length} participant contribution(s).`;

  database
    .prepare(
      `insert into ceremony_proposals (
        id, project_id, run_id, kind, status, summary, ticket_id,
        payload_json, applied_ticket_id, applied_at, created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      `ceremony_proposal_${randomUUID()}`,
      projectId,
      runId,
      "note",
      "pending",
      summary,
      null,
      JSON.stringify({
        note: summary,
        deciderRole,
        participantSummary,
        unresolvedQuestions,
        risks,
      }),
      null,
      null,
      timestamp,
      timestamp,
    );

  database
    .prepare(
      `update ceremony_runs
       set status = 'proposed', summary_md = ?, questions_md = ?, risk_md = ?, finished_at = ?, updated_at = ?
       where project_id = ? and id = ?`,
    )
    .run(
      `${run.summaryMd}\n\n${summary}`,
      unresolvedQuestions || run.questionsMd,
      risks || run.riskMd,
      timestamp,
      timestamp,
      projectId,
      runId,
    );

  insertEvent(database, {
    projectId,
    type: "ceremony.proposed",
    summary,
    detail: participantSummary,
    reasonCode: run.type,
    reasonSource: "ceremony",
  });
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
        acceptanceCriteriaMd: "- Root cause is named\n- One concrete system or process change is proposed\n- Success signal is measurable from Floop events",
        definitionOfDoneMd: "- Improvement is implemented or documented\n- Floop evidence shows the change is inspectable",
        priority: blockedCount > 0 ? "high" : "medium",
        state: "PROPOSED",
        assignedRole: "product_manager",
        repoTargets: [],
      },
    }),
  ];
}

function buildCeremonyScope(type, input = {}) {
  const defaults = defaultCeremonyFanOut(type);
  const participantRoles = normalizeRoleList(input.participantRoles, defaults.participantRoles);
  const deciderRole =
    typeof input.deciderRole === "string" && input.deciderRole.trim()
      ? input.deciderRole.trim()
      : defaults.deciderRole;
  const consensusPolicy =
    typeof input.consensusPolicy === "string" && input.consensusPolicy.trim()
      ? input.consensusPolicy.trim()
      : defaults.consensusPolicy;

  return {
    ...(input.scope || {}),
    participantRoles,
    deciderRole,
    consensusPolicy,
  };
}

function defaultCeremonyFanOut(type) {
  switch (type) {
    case "planning":
      return {
        participantRoles: ["product_manager", "architect", "developer", "integrator"],
        deciderRole: "integrator",
        consensusPolicy: "decider_synthesizes_objections",
      };
    case "daily_triage":
      return {
        participantRoles: ["product_manager", "developer", "reviewer", "validator"],
        deciderRole: "product_manager",
        consensusPolicy: "blockers_and_stale_work_win",
      };
    case "review_demo_prep":
      return {
        participantRoles: ["product_manager", "reviewer", "validator", "integrator"],
        deciderRole: "reviewer",
        consensusPolicy: "only_evidence_backed_done_work_is_demoable",
      };
    case "retro":
      return {
        participantRoles: ["product_manager", "architect", "developer", "reviewer", "validator"],
        deciderRole: "product_manager",
        consensusPolicy: "recurring_systemic_risk_wins",
      };
    case "refinement":
    default:
      return {
        participantRoles: ["product_manager", "architect", "developer", "reviewer"],
        deciderRole: "product_manager",
        consensusPolicy: "decider_synthesizes_objections",
      };
  }
}

function normalizeRoleList(value, fallback) {
  const source = Array.isArray(value) && value.length > 0 ? value : fallback;
  const roles = [];
  for (const role of source) {
    if (typeof role === "string" && role.trim() && !roles.includes(role.trim())) {
      roles.push(role.trim());
    }
  }
  return roles;
}

function buildCeremonySummary(type, snapshot, proposals, scope = {}) {
  const pendingMutations = proposals.filter((item) => item.kind !== "note").length;
  const participantText =
    Array.isArray(scope.participantRoles) && scope.participantRoles.length > 0
      ? scope.participantRoles.join(", ")
      : "none";
  const deciderText = scope.deciderRole || "operator";
  const consensusText = scope.consensusPolicy || "decider_synthesizes_objections";
  return {
    summaryMd: `${prettyCeremonyType(type)} reviewed ${snapshot.tickets.length} ticket(s) with ${participantText}. ${deciderText} is the decider and consensus policy is ${consensusText}. The run produced ${proposals.length} proposal(s), including ${pendingMutations} ticket change(s).`,
    questionsMd:
      pendingMutations > 0
        ? "Approve the proposals that match your current PO intent; leave the rest pending. Agent objections should remain visible when the decider synthesizes consensus."
        : "No ticket mutation is proposed. Use comments or direct chat follow-up to resolve open questions before asking implementation agents to work.",
    riskMd:
      "Fan-out participants advise the ceremony. The decider synthesizes consensus, but proposals do not mutate tickets until applied by an operator.",
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
      ".floop",
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
        refinement_mode, agent_created_ticket_default_state, ceremony_automation_json,
        created_at, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      JSON.stringify(policy.ceremonyAutomation || defaultCeremonyAutomation()),
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
  const marker = `${sep}.floop${sep}worktrees${sep}`;
  if (!resolvedPath.includes(marker)) {
    throw new Error(`Refusing to delete non-Floop worktree path: ${worktreePath}`);
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

function applyJsonObjectPatch(updates, changedFields, input, existing, field, options = {}) {
  if (!hasOwn(input, field)) {
    return;
  }

  const value = input[field];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Field ${field} must be a JSON object`);
  }

  const column = options.column || camelToSnake(field);
  const serialized = JSON.stringify(value);
  if ((existing[column] || "{}") === serialized) {
    return;
  }

  updates[column] = serialized;
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

function touchProjectUpdatedAt(database, projectId, timestamp) {
  database.prepare("update projects set updated_at = ? where id = ?").run(timestamp, projectId);
}
