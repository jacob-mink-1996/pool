import { artifactDto, eventDto } from "../../contracts/src/index.mjs";

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
