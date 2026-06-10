import { roleNames } from "../../domain/src/index.mjs";

export function defaultProjectPolicy() {
  return {
    requireReviewer: true,
    requireValidator: true,
    requireHumanApprovalBeforeMerge: true,
    maxParallelExecutions: 3,
    maxAutoContinueIterations: 5,
    agentCreatedTicketDefaultState: "PROPOSED",
  };
}

export function defaultRoleProfiles() {
  return roleNames.map((role) => ({
    role,
    adapter: role === "reviewer" || role === "validator" ? "opencode" : "codex",
    model: role === "reviewer" || role === "validator" ? "default" : "codex-latest",
  }));
}
