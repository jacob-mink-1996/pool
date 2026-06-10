export function prettyState(value) {
  return value.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function prettyRole(value) {
  return prettyState(value);
}

export function splitLines(value) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function prettyDependencyType(value) {
  return value.replace(/_/g, " ");
}

export function prettyEventType(value) {
  return value.replace(/[._]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function repoDefaultBranch(state, repoId) {
  return state.repos.find((repo) => repo.id === repoId)?.defaultBranch || "main";
}

export function roleProfileForRole(state, role) {
  return state.project?.roleProfiles?.find((profile) => profile.role === role) || null;
}

export function setFormControlsDisabled(form, disabled) {
  for (const element of form.elements) {
    element.disabled = disabled;
  }
}

export function createRepoField(labelText, name, value) {
  const label = document.createElement("label");
  label.className = "field";

  const title = document.createElement("span");
  title.textContent = labelText;
  label.append(title);

  const input = document.createElement("input");
  input.name = name;
  input.type = "text";
  input.value = value || "";
  label.append(input);

  return label;
}

export function currentActiveExecution(ticketDetail) {
  return ticketDetail?.executions?.find((execution) => execution.status === "running") || null;
}

export function reviewVerdictClass(verdict) {
  if (verdict === "passed") return "ready-to-merge";
  if (verdict === "blocked") return "blocked";
  return "rework";
}

export function validationVerdictClass(verdict) {
  if (verdict === "passed") return "ready-to-merge";
  if (verdict === "blocked") return "blocked";
  return "rework";
}

export function laneSnapshotNote(ticketState) {
  switch (ticketState) {
    case "BLOCKED":
      return "Blocked work is piling up and likely needs operator intervention.";
    case "READY_TO_MERGE":
      return "Delivery is done; the main decision left is integration.";
    case "REWORK":
      return "Review or validation bounced work back for another pass.";
    case "WORKING":
      return "This is the live execution lane right now.";
    case "REVIEWING":
      return "Completed work is waiting on reviewer evidence.";
    case "VALIDATING":
      return "Implementation exists, but proof still needs to land.";
    default:
      return "Backlog is accumulating in this lane.";
  }
}

export function roleLoadoutNote(role, count) {
  if (role === "unassigned") {
    return count === 1 ? "One ticket still needs an owner." : "Several tickets still need owners.";
  }
  return count === 1
    ? `${prettyRole(role)} owns one active thread of work.`
    : `${prettyRole(role)} is carrying the heaviest visible load.`;
}

export function executionBadgeClass(execution) {
  if (execution.status === "running") return "working";
  if (execution.status === "cancelled") return "blocked";
  if (execution.outcome === "completed") return "reviewing";
  if (execution.outcome === "needs_continue") return "working";
  if (execution.outcome === "blocked" || execution.outcome === "failed") return "blocked";
  if (execution.outcome === "followup_created") return "ready";
  return "subtle";
}

export function mergeStatusClass(ticket, mergeStatus) {
  const latestRun = mergeStatus?.latestRun;
  if (latestRun?.status === "completed" || ticket.state === "DONE") return "done";
  if (latestRun?.status === "blocked") return "blocked";
  if (latestRun?.status === "rework") return "rework";
  if (mergeStatus?.canMerge) return "ready-to-merge";
  return "subtle";
}

export function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function parseLocation(value) {
  const trimmed = value.trim();
  if (!trimmed) {
    return { filePath: "", lineNumber: null };
  }

  const match = trimmed.match(/^(.*?):(\d+)$/);
  if (!match) {
    return { filePath: trimmed, lineNumber: null };
  }

  return {
    filePath: match[1],
    lineNumber: Number.parseInt(match[2], 10),
  };
}

export function formatDate(value) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
