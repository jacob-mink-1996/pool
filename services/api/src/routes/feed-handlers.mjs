import { parseArtifactFilters, parseEventFilters, parseRunFilters, parseWorktreeFilters, respondMaybe } from "./shared.mjs";

export function handleFeedRoute(route, url, body, store) {
  switch (route.name) {
    case "runs":
      return respondMaybe(buildRunFeed(store, route.params.projectId, parseRunFilters(url)), "observability");
    case "worktrees":
      return {
        status: 200,
        body: { worktrees: store.listWorktrees(route.params.projectId, parseWorktreeFilters(url)) },
      };
    case "worktreeClean":
      return respondMaybe(
        store.cleanWorktree(route.params.projectId, route.params.worktreeId, body || {}),
        "worktree",
      );
    case "events":
      return {
        status: 200,
        body: { events: store.listEvents(route.params.projectId, parseEventFilters(url)) },
      };
    case "artifacts":
      return {
        status: 200,
        body: { artifacts: store.listArtifacts(route.params.projectId, parseArtifactFilters(url)) },
      };
    default:
      return null;
  }
}

function buildRunFeed(store, projectId, filters = {}) {
  const project = store.getProjectSummary(projectId);
  if (!project) {
    return null;
  }

  const limit = Number.isInteger(filters.limit) && filters.limit > 0 ? Math.min(filters.limit, 100) : 20;
  const executions = store.listProjectExecutions(projectId, { limit }) || [];
  const mergeRuns = store.listMergeRuns(projectId, { limit }) || [];
  const ceremonies = store.listCeremonyRuns(projectId) || [];
  const runs = [
    ...executions.map(executionRunItem),
    ...mergeRuns.map((run) => mergeRunItem(store, projectId, run)),
    ...ceremonies.map(ceremonyRunItem),
  ]
    .sort((left, right) => Date.parse(runSortDate(right)) - Date.parse(runSortDate(left)))
    .slice(0, limit);

  return {
    generatedAt: new Date().toISOString(),
    summary: summarizeRuns(runs),
    runs,
  };
}

function executionRunItem(execution) {
  return {
    id: `execution:${execution.id}`,
    runId: execution.id,
    kind: "execution",
    status: execution.status,
    outcome: execution.outcome || "",
    label: `${execution.ticketKey || "Ticket"} ${execution.role} iteration ${execution.iteration}`,
    summary: execution.summaryMd || execution.remainingWorkMd || execution.expectedNextEvidenceMd || "Execution is waiting for worker output.",
    ticketId: execution.ticketId,
    ticketKey: execution.ticketKey || "",
    ticketTitle: execution.ticketTitle || "",
    role: execution.role,
    failureKind: execution.failureKind || execution.blockedKind || "",
    startedAt: execution.startedAt,
    finishedAt: execution.finishedAt || "",
    artifactCount: execution.artifacts?.length || 0,
    worktreeCount: execution.worktrees?.length || 0,
    needsAttention: execution.status === "needs_continue" || ["failed", "blocked"].includes(execution.outcome),
  };
}

function mergeRunItem(store, projectId, run) {
  const ticket = run.ticketId ? store.getTicket(projectId, run.ticketId) : null;
  return {
    id: `merge:${run.id}`,
    runId: run.id,
    kind: "merge",
    status: run.status,
    outcome: run.status,
    label: `${ticket?.key || "Ticket"} merge`,
    summary: run.summaryMd || "Merge run is waiting for worker output.",
    ticketId: run.ticketId,
    ticketKey: ticket?.key || "",
    ticketTitle: ticket?.title || "",
    role: "integrator",
    failureKind: run.failureKind || "",
    startedAt: run.startedAt,
    finishedAt: run.finishedAt || "",
    artifactCount: run.artifacts?.length || 0,
    worktreeCount: 0,
    needsAttention: ["blocked", "failed"].includes(run.status),
  };
}

function ceremonyRunItem(run) {
  const pendingProposals = run.proposals.filter((proposal) => proposal.status === "pending").length;
  const failedParticipants = run.participants.filter((participant) => ["failed", "blocked"].includes(participant.outcome)).length;
  return {
    id: `ceremony:${run.id}`,
    runId: run.id,
    kind: "ceremony",
    status: run.status,
    outcome: run.status,
    label: `${run.type} ceremony`,
    summary: run.summaryMd || "Ceremony has no summary yet.",
    ticketId: "",
    ticketKey: "",
    ticketTitle: "",
    role: run.deciderRole || "",
    failureKind: failedParticipants ? "participant_attention" : "",
    startedAt: run.startedAt,
    finishedAt: run.finishedAt || "",
    artifactCount: 0,
    worktreeCount: 0,
    needsAttention: pendingProposals > 0 || failedParticipants > 0,
    pendingProposalCount: pendingProposals,
    participantCount: run.participants.length,
  };
}

function summarizeRuns(runs) {
  return {
    total: runs.length,
    running: runs.filter((run) => run.status === "running").length,
    needsAttention: runs.filter((run) => run.needsAttention).length,
    failed: runs.filter((run) => ["failed", "blocked"].includes(run.outcome) || ["failed", "blocked"].includes(run.status)).length,
  };
}

function runSortDate(run) {
  return run.finishedAt || run.startedAt || "";
}
