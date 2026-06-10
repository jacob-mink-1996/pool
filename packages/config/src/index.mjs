import { roleNames } from "../../domain/src/index.mjs";

export function defaultProjectPolicy() {
  return {
    requireReviewer: true,
    requireValidator: true,
    requireHumanApprovalBeforeMerge: true,
    requiredValidationCommandProfileForMerge: "",
    maxParallelExecutions: 3,
    maxParallelMerges: 1,
    maxAutoContinueIterations: 5,
    refinementMode: "user_approved",
    agentCreatedTicketDefaultState: "PROPOSED",
  };
}

export function defaultRoleProfiles() {
  return roleNames.map((role) => ({
    role,
    adapter: role === "reviewer" || role === "validator" ? "opencode" : "codex",
    model: "default",
  }));
}
