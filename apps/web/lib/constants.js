export const stateOptions = [
  "PROPOSED",
  "READY",
  "WORKING",
  "REVIEWING",
  "VALIDATING",
  "REWORK",
  "BLOCKED",
  "READY_TO_MERGE",
  "DONE",
];

export const policyTicketStateOptions = ["DRAFT", ...stateOptions];

export const roleOptions = [
  "product_manager",
  "architect",
  "developer",
  "reviewer",
  "validator",
  "integrator",
];

export const priorityOptions = ["low", "medium", "high", "urgent"];

export const executionOutcomeOptions = [
  "completed",
  "needs_continue",
  "blocked",
  "followup_created",
  "failed",
];

export const activityEventTypes = [
  "project.created",
  "project.updated",
  "repo.created",
  "repo.updated",
  "ticket.created",
  "ticket.updated",
  "ticket.transitioned",
  "dependency.added",
  "dependency.removed",
  "execution.started",
  "execution.completed",
  "review.completed",
  "validation.completed",
  "worktree.created",
  "worktree.cleaned",
  "merge.started",
  "merge.completed",
];

export const stateClassMap = new Map(stateOptions.map((state) => [state, slugify(state)]));

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
