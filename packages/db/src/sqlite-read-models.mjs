import { artifactDto, eventDto } from "../../contracts/src/index.mjs";

export function listTicketRows(database, projectId, filters = {}) {
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

export function listWorktreeRows(database, projectId, filters = {}) {
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

export function getRepoTargetsByTicketId(database, ticketIds) {
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

export function getDependenciesByBlockedTicketId(database, projectId, blockedTicketIds) {
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

export function getLatestReviewVerdictsByTicketId(database, projectId, ticketIds) {
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

export function getLatestValidationVerdictsByTicketId(database, projectId, ticketIds) {
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

export function getLatestReviewRow(database, projectId, ticketId) {
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

export function getLatestValidationRunRow(database, projectId, ticketId) {
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

export function getCountMap(database, sql, params) {
  return new Map(database.prepare(sql).all(...params).map((row) => [row.ticketId, Number(row.count)]));
}

export function listProjectEvents(database, projectId, filters = {}) {
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
  const limit = Number.isInteger(filters.limit) && filters.limit > 0 ? ` limit ${filters.limit}` : "";

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
}

export function listProjectArtifacts(database, projectId, filters = {}) {
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

  const limit = Number.isInteger(filters.limit) && filters.limit > 0 ? ` limit ${filters.limit}` : "";

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
