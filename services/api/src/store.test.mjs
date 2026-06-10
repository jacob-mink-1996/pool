import test from "node:test";
import assert from "node:assert/strict";

import { createStore } from "./store.mjs";

test("store exposes seeded project summary", () => {
  const store = createStore({ filename: ":memory:", seedDemo: true });
  const projects = store.listProjects();

  assert.equal(projects.length, 1);
  assert.equal(projects[0].slug, "pool");
  assert.equal(projects[0].board.WORKING, 1);
  store.close();
});

test("store updates project metadata and records a project event", () => {
  const store = createStore({ filename: ":memory:", seedDemo: true });

  const updated = store.updateProject("project_pool", {
    name: "Pool Mission Control",
    description: "Operator surface for governed autonomous delivery.",
    workspaceRoot: "/workspace/pool-real",
    defaultBaseBranch: "trunk",
  });

  assert.equal(updated.name, "Pool Mission Control");
  assert.equal(updated.description, "Operator surface for governed autonomous delivery.");
  assert.equal(updated.workspaceRoot, "/workspace/pool-real");
  assert.equal(updated.defaultBaseBranch, "trunk");
  assert.equal(store.listEvents("project_pool").at(-1).type, "project.updated");
  store.close();
});

test("store updates project policy and role profiles", () => {
  const store = createStore({ filename: ":memory:", seedDemo: true });

  const updatedPolicy = store.updateProjectPolicy("project_pool", {
    requireReviewer: false,
    requireValidator: false,
    requireHumanApprovalBeforeMerge: false,
    maxParallelExecutions: 5,
    maxAutoContinueIterations: 8,
    agentCreatedTicketDefaultState: "READY",
  });
  const updatedRoleProfile = store.updateRoleProfile("project_pool", "developer", {
    adapter: "codex-cli",
    model: "codex-max",
    config: { reasoning: "high", sandbox: "workspace-write" },
  });

  assert.equal(updatedPolicy.requireReviewer, false);
  assert.equal(updatedPolicy.requireValidator, false);
  assert.equal(updatedPolicy.requireHumanApprovalBeforeMerge, false);
  assert.equal(updatedPolicy.maxParallelExecutions, 5);
  assert.equal(updatedPolicy.maxAutoContinueIterations, 8);
  assert.equal(updatedPolicy.agentCreatedTicketDefaultState, "READY");

  assert.equal(updatedRoleProfile.role, "developer");
  assert.equal(updatedRoleProfile.adapter, "codex-cli");
  assert.equal(updatedRoleProfile.model, "codex-max");
  assert.deepEqual(updatedRoleProfile.config, {
    reasoning: "high",
    sandbox: "workspace-write",
  });

  const project = store.getProjectSummary("project_pool");
  assert.equal(project.policy.maxParallelExecutions, 5);
  assert.equal(project.policy.agentCreatedTicketDefaultState, "READY");
  assert.equal(project.roleProfiles.find((profile) => profile.role === "developer").adapter, "codex-cli");
  assert.equal(store.listEvents("project_pool").at(-1).summary, "Pool developer profile updated");

  store.close();
});

test("store transitions tickets and records events", () => {
  const store = createStore({ filename: ":memory:", seedDemo: true });
  const created = store.createTicket("project_pool", {
    title: "Build board aggregates",
    brief: "Add richer board read models.",
    assignedRole: "developer",
    state: "READY",
  });

  const transitioned = store.transitionTicket("project_pool", created.id, {
    targetState: "WORKING",
    reason: "Developer picked it up.",
  });

  assert.equal(transitioned.state, "WORKING");
  assert.equal(transitioned.events.at(-1).type, "ticket.transitioned");
  store.close();
});

test("store filters tickets by parent ticket id", () => {
  const store = createStore({ filename: ":memory:", seedDemo: true });
  const parent = store.createTicket("project_pool", {
    title: "Split board work",
    brief: "Create child tasks for board slices.",
    assignedRole: "architect",
    state: "READY",
  });

  store.createTicket("project_pool", {
    title: "Build ticket filters",
    brief: "Add parent-linked child ticket.",
    assignedRole: "developer",
    state: "READY",
    parentTicketId: parent.id,
  });

  const children = store.listTickets("project_pool", { parentTicketId: parent.id });
  assert.equal(children.length, 1);
  assert.equal(children[0].parentTicketId, parent.id);
  store.close();
});

test("store rejects cyclic parent and dependency graphs", () => {
  const store = createStore({ filename: ":memory:", seedDemo: true });
  const parent = store.createTicket("project_pool", {
    title: "Planning parent",
    brief: "Top-level planning ticket.",
    assignedRole: "architect",
    state: "READY",
  });
  const child = store.createTicket("project_pool", {
    title: "Planning child",
    brief: "Child planning ticket.",
    assignedRole: "developer",
    state: "READY",
    parentTicketId: parent.id,
  });

  assert.throws(
    () =>
      store.updateTicket("project_pool", parent.id, {
        parentTicketId: child.id,
      }),
    new RegExp(`Parent cycle detected for ticket ${parent.id}`),
  );

  store.addDependency("project_pool", child.id, {
    blockingTicketId: parent.id,
    dependencyType: "finish_to_start",
  });
  assert.throws(
    () =>
      store.addDependency("project_pool", parent.id, {
        blockingTicketId: child.id,
        dependencyType: "finish_to_start",
      }),
    new RegExp(`Dependency cycle detected for ticket ${parent.id}`),
  );

  store.close();
});

test("store updates editable ticket fields and records an update event", () => {
  const store = createStore({ filename: ":memory:", seedDemo: true });
  const docsRepo = store.createRepo("project_pool", {
    slug: "pool-docs",
    name: "pool-docs",
    localPath: "/workspace/pool/docs",
    defaultBranch: "trunk",
    isPrimary: false,
  });

  const updated = store.updateTicket("project_pool", "ticket_project_pool_2", {
    title: "Define operator-facing transport contracts",
    brief: "Codify real project, repo, ticket, and event DTOs.",
    parentTicketId: "ticket_project_pool_1",
    priority: "urgent",
    assignedRole: "developer",
    latestSummary: "Contracts expanded for the board UI",
    acceptanceCriteriaMd: "- update persists\n- event recorded",
    definitionOfDoneMd: "- API returns updated detail",
    repoTargets: [
      {
        repoId: docsRepo.id,
        branchName: "pool-2-docs-contracts",
        targetScopeMd: "Docs plus API contract notes",
      },
    ],
  });

  assert.equal(updated.title, "Define operator-facing transport contracts");
  assert.equal(updated.parentTicketId, "ticket_project_pool_1");
  assert.equal(updated.priority, "urgent");
  assert.equal(updated.assignedRole, "developer");
  assert.match(updated.acceptanceCriteriaMd, /event recorded/);
  assert.equal(updated.repoTargets.length, 1);
  assert.equal(updated.repoTargets[0].repoId, docsRepo.id);
  assert.equal(updated.repoTargets[0].baseRef, "trunk");
  assert.equal(updated.repoTargets[0].branchName, "pool-2-docs-contracts");
  assert.equal(updated.events.at(-1).type, "ticket.updated");
  assert.match(updated.events.at(-1).detail, /latestSummary/);
  assert.match(updated.events.at(-1).detail, /repoTargets/);
  store.close();
});

test("store rejects duplicate or unknown repo targets during ticket updates", () => {
  const store = createStore({ filename: ":memory:", seedDemo: true });

  assert.throws(
    () =>
      store.updateTicket("project_pool", "ticket_project_pool_2", {
        repoTargets: [
          { repoId: "repo_project_pool_pool" },
          { repoId: "repo_project_pool_pool", branchName: "duplicate-target" },
        ],
      }),
    /Duplicate repo target/,
  );

  assert.throws(
    () =>
      store.updateTicket("project_pool", "ticket_project_pool_2", {
        repoTargets: [{ repoId: "repo_missing" }],
      }),
    /Unknown repo target/,
  );
  assert.throws(
    () =>
      store.updateTicket("project_pool", "ticket_project_pool_2", {
        parentTicketId: "ticket_project_pool_2",
      }),
    /A ticket cannot parent itself/,
  );
  store.close();
});

test("store adds and removes ticket dependencies with projected detail", () => {
  const store = createStore({ filename: ":memory:", seedDemo: true });

  const added = store.addDependency("project_pool", "ticket_project_pool_2", {
    blockingTicketId: "ticket_project_pool_1",
    dependencyType: "finish_to_start",
  });

  assert.equal(added.dependencies.length, 1);
  assert.equal(added.dependencies[0].blockingTicketKey, "POOL-1");
  assert.equal(added.dependencyCount, 1);
  assert.equal(added.events.at(-1).type, "dependency.added");

  const removed = store.removeDependency(
    "project_pool",
    "ticket_project_pool_2",
    added.dependencies[0].id,
  );

  assert.equal(removed.dependencies.length, 0);
  assert.equal(removed.dependencyCount, 0);
  assert.equal(removed.events.at(-1).type, "dependency.removed");
  store.close();
});

test("store updates repo metadata and keeps a single primary repo", () => {
  const store = createStore({ filename: ":memory:", seedDemo: true });

  const created = store.createRepo("project_pool", {
    slug: "pool-docs",
    name: "pool-docs",
    localPath: "/workspace/pool/docs",
    defaultBranch: "main",
    isPrimary: false,
  });

  const updated = store.updateRepo("project_pool", created.id, {
    name: "pool-docs-site",
    localPath: "/workspace/pool/site",
    remoteUrl: "https://example.com/pool-docs.git",
    defaultBranch: "develop",
    isPrimary: true,
  });

  assert.equal(updated.name, "pool-docs-site");
  assert.equal(updated.localPath, "/workspace/pool/site");
  assert.equal(updated.remoteUrl, "https://example.com/pool-docs.git");
  assert.equal(updated.defaultBranch, "develop");
  assert.equal(updated.isPrimary, true);

  const repos = store.listRepos("project_pool");
  assert.equal(repos.filter((repo) => repo.isPrimary).length, 1);
  assert.equal(repos.find((repo) => repo.id === "repo_project_pool_pool").isPrimary, false);
  assert.equal(store.listEvents("project_pool").at(-1).type, "repo.updated");
  store.close();
});

test("store persists execution history and routes ticket state from outcomes", () => {
  const store = createStore({ filename: ":memory:", seedDemo: true });

  const started = store.createExecution("project_pool", "ticket_project_pool_2", {
    role: "developer",
    reason: "Start implementation on the contract surface.",
  });

  assert.equal(started.iteration, 1);
  assert.equal(started.status, "running");
  assert.equal(started.agentProfileId, "profile_project_pool_developer");
  assert.equal(started.worktrees.length, 1);
  assert.equal(started.worktrees[0].repoSlug, "pool");
  assert.match(started.worktrees[0].path, /\/\.pool\/worktrees\/pool-2\/pool\/iter-1$/);
  assert.equal(started.worktrees[0].status, "active");

  const completed = store.completeExecution("project_pool", started.id, {
    outcome: "completed",
    summaryMd: "Execution landed the shared contract changes.",
  });

  assert.equal(completed.status, "completed");
  assert.equal(completed.outcome, "completed");
  assert.equal(completed.worktrees[0].status, "ready_for_review");

  const ticketAfterComplete = store.getTicket("project_pool", "ticket_project_pool_2");
  assert.equal(ticketAfterComplete.state, "REVIEWING");
  assert.equal(ticketAfterComplete.executions.length, 1);
  assert.equal(ticketAfterComplete.executions[0].id, started.id);
  assert.equal(ticketAfterComplete.executions[0].worktrees[0].status, "ready_for_review");
  assert.equal(ticketAfterComplete.worktrees.length, 1);
  assert.equal(ticketAfterComplete.worktrees[0].executionId, started.id);
  assert.equal(ticketAfterComplete.events.some((event) => event.type === "worktree.created"), true);

  const listedWorktrees = store.listWorktrees("project_pool", {
    ticketId: "ticket_project_pool_2",
    status: "ready_for_review",
  });
  assert.equal(listedWorktrees.length, 1);
  assert.equal(listedWorktrees[0].executionId, started.id);

  const cleaned = store.cleanWorktree("project_pool", started.worktrees[0].id, {
    reason: "Operator cleaned the completed contract worktree.",
  });
  assert.equal(cleaned.status, "cleaned");
  assert.ok(cleaned.cleanedAt);
  assert.equal(store.listEvents("project_pool").at(-1).type, "worktree.cleaned");

  const continuedSeed = store.createExecution("project_pool", "ticket_project_pool_1", {
    role: "developer",
    agentProfileId: "profile_project_pool_developer",
    reason: "Resume the API skeleton execution.",
  });
  const continued = store.continueExecution("project_pool", continuedSeed.id, {
    reason: "Carry the remaining work into a bounded continuation.",
  });

  assert.equal(continued.iteration, 2);
  assert.equal(continued.status, "running");
  assert.equal(continued.worktrees[0].status, "active");
  assert.match(continued.worktrees[0].path, /\/\.pool\/worktrees\/pool-1\/pool\/iter-2$/);

  const priorIteration = store
    .listExecutions("project_pool", "ticket_project_pool_1")
    .find((execution) => execution.id === continuedSeed.id);
  assert.equal(priorIteration.outcome, "needs_continue");

  const priorIterationDetail = store.getExecution("project_pool", continuedSeed.id);
  assert.equal(priorIterationDetail.worktrees[0].status, "needs_continue");

  assert.throws(
    () => store.cleanWorktree("project_pool", continued.worktrees[0].id),
    /Cannot clean an active worktree/,
  );

  const cancelled = store.cancelExecution("project_pool", continued.id, {
    reason: "Operator cancelled the stale continuation.",
  });
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.failureKind, "cancelled");
  assert.equal(cancelled.worktrees[0].status, "cancelled");
  assert.equal(store.listEvents("project_pool").at(-1).type, "execution.completed");

  store.close();
});

test("store persists review and validation evidence and advances the ticket loop", () => {
  const store = createStore({ filename: ":memory:", seedDemo: true });

  const started = store.createExecution("project_pool", "ticket_project_pool_2", {
    role: "developer",
    reason: "Complete the contract implementation lane.",
  });
  store.completeExecution("project_pool", started.id, {
    outcome: "completed",
    summaryMd: "Implementation is ready for reviewer evidence.",
  });

  const review = store.createReview("project_pool", "ticket_project_pool_2", {
    executionId: started.id,
    verdict: "passed",
    summaryMd: "Reviewer found no blocking issues.",
  });
  assert.equal(review.verdict, "passed");
  assert.equal(review.findingsCount, 0);

  const ticketAfterReview = store.getTicket("project_pool", "ticket_project_pool_2");
  assert.equal(ticketAfterReview.state, "VALIDATING");
  assert.equal(ticketAfterReview.reviews.length, 1);
  assert.equal(ticketAfterReview.events.at(-1).type, "review.completed");

  const validations = store.createValidation("project_pool", "ticket_project_pool_2", {
    executionId: started.id,
    repoIds: ["repo_project_pool_pool"],
    commandProfile: "ci",
    commands: ["npm test", "npm run lint"],
    verdict: "passed",
    summaryMd: "Validation passed for the targeted repo.",
  });
  assert.equal(validations.length, 1);
  assert.equal(validations[0].repoSlug, "pool");
  assert.deepEqual(validations[0].commands, ["npm test", "npm run lint"]);

  const ticketAfterValidation = store.getTicket("project_pool", "ticket_project_pool_2");
  assert.equal(ticketAfterValidation.state, "READY_TO_MERGE");
  assert.equal(ticketAfterValidation.validations.length, 1);
  assert.equal(ticketAfterValidation.events.at(-1).type, "validation.completed");

  const listedTicket = store
    .listTickets("project_pool", { states: ["READY_TO_MERGE"] })
    .find((ticket) => ticket.id === "ticket_project_pool_2");
  assert.equal(listedTicket.latestReviewVerdict, "passed");
  assert.equal(listedTicket.latestValidationVerdict, "passed");

  const boardTicket = store
    .getProjectBoard("project_pool")
    .columns.find((column) => column.state === "READY_TO_MERGE")
    .tickets.find((ticket) => ticket.id === "ticket_project_pool_2");
  assert.equal(boardTicket.latestReviewVerdict, "passed");
  assert.equal(boardTicket.latestValidationVerdict, "passed");

  store.close();
});

test("store enforces review and validation sequencing", () => {
  const store = createStore({ filename: ":memory:", seedDemo: true });

  const execution = store.createExecution("project_pool", "ticket_project_pool_2", {
    role: "developer",
    reason: "Start implementation before evidence lanes.",
  });

  assert.throws(
    () =>
      store.createReview("project_pool", "ticket_project_pool_2", {
        executionId: execution.id,
        verdict: "passed",
      }),
    new RegExp(`Execution ${execution.id} must be finished before review`),
  );

  store.completeExecution("project_pool", execution.id, {
    outcome: "completed",
    summaryMd: "Implementation finished and ready for review.",
  });

  assert.throws(
    () =>
      store.createValidation("project_pool", "ticket_project_pool_2", {
        executionId: execution.id,
        repoIds: ["repo_project_pool_pool"],
        verdict: "passed",
      }),
    /Ticket POOL-2 is not ready for validation/,
  );

  store.createReview("project_pool", "ticket_project_pool_2", {
    executionId: execution.id,
    verdict: "passed",
  });

  assert.throws(
    () =>
      store.createReview("project_pool", "ticket_project_pool_2", {
        executionId: execution.id,
        verdict: "passed",
      }),
    /Ticket POOL-2 is not ready for review/,
  );

  store.close();
});

test("store respects review and validation policy skips after execution completion", () => {
  const store = createStore({ filename: ":memory:", seedDemo: true });
  store.updateProjectPolicy("project_pool", {
    requireReviewer: false,
    requireValidator: true,
  });

  const execution = store.createExecution("project_pool", "ticket_project_pool_2", {
    role: "developer",
    reason: "Finish the implementation without a reviewer lane.",
  });
  store.completeExecution("project_pool", execution.id, {
    outcome: "completed",
    summaryMd: "Implementation completed under relaxed review policy.",
  });

  assert.equal(store.getTicket("project_pool", "ticket_project_pool_2").state, "VALIDATING");

  store.updateProjectPolicy("project_pool", {
    requireReviewer: false,
    requireValidator: false,
  });
  const secondExecution = store.createExecution("project_pool", "ticket_project_pool_1", {
    role: "developer",
    reason: "Finish a ticket with all gates disabled.",
  });
  store.completeExecution("project_pool", secondExecution.id, {
    outcome: "completed",
    summaryMd: "Implementation completed with direct merge readiness.",
  });

  assert.equal(store.getTicket("project_pool", "ticket_project_pool_1").state, "READY_TO_MERGE");

  store.close();
});

test("store persists merge runs and closes merge-ready tickets", () => {
  const store = createStore({ filename: ":memory:", seedDemo: true });
  store.updateProjectPolicy("project_pool", {
    requireHumanApprovalBeforeMerge: true,
  });
  store.transitionTicket("project_pool", "ticket_project_pool_2", {
    targetState: "READY_TO_MERGE",
    reason: "All evidence is in and the ticket can merge.",
  });

  const queue = store.listMergeQueue("project_pool");
  assert.equal(queue.length, 1);
  assert.equal(queue[0].key, "POOL-2");
  assert.equal(queue[0].mergeStatus.canMerge, true);

  const mergeStatus = store.mergeTicket("project_pool", "ticket_project_pool_2", {
    strategy: "squash",
    approvedByKind: "human",
    approvedByRef: "jacob",
    summaryMd: "Merged cleanly into main after approvals.",
  });

  assert.equal(mergeStatus.ticketState, "DONE");
  assert.equal(mergeStatus.canMerge, false);
  assert.equal(mergeStatus.latestRun.status, "completed");
  assert.equal(mergeStatus.latestRun.strategy, "squash");
  assert.equal(mergeStatus.latestRun.approvedByRef, "jacob");

  const ticket = store.getTicket("project_pool", "ticket_project_pool_2");
  assert.equal(ticket.state, "DONE");
  assert.equal(ticket.mergeStatus.latestRun.status, "completed");
  assert.equal(ticket.events.at(-2).type, "merge.started");
  assert.equal(ticket.events.at(-1).type, "merge.completed");
  assert.equal(store.listMergeQueue("project_pool").length, 0);
  store.close();
});

test("store enforces merge readiness and approval policy", () => {
  const store = createStore({ filename: ":memory:", seedDemo: true });
  store.transitionTicket("project_pool", "ticket_project_pool_2", {
    targetState: "READY_TO_MERGE",
    reason: "Ready for merge policy checks.",
  });

  assert.throws(
    () =>
      store.mergeTicket("project_pool", "ticket_project_pool_2", {
        strategy: "merge_commit",
      }),
    /POOL-2 requires human approval before merge/,
  );

  const blocked = store.mergeTicket("project_pool", "ticket_project_pool_2", {
    strategy: "merge_commit",
    status: "blocked",
    summaryMd: "Repo branch protection is still preventing integration.",
  });
  assert.equal(blocked.ticketState, "BLOCKED");
  assert.equal(blocked.latestRun.status, "blocked");

  assert.throws(
    () =>
      store.mergeTicket("project_pool", "ticket_project_pool_1", {
        strategy: "squash",
        approvedByKind: "human",
        approvedByRef: "jacob",
      }),
    /Ticket POOL-1 is not ready for merge/,
  );

  store.close();
});

test("store enforces project execution concurrency limits", () => {
  const store = createStore({ filename: ":memory:", seedDemo: true });
  store.updateProjectPolicy("project_pool", {
    maxParallelExecutions: 1,
  });

  const started = store.createExecution("project_pool", "ticket_project_pool_1", {
    role: "developer",
    reason: "Use the single active execution slot.",
  });

  assert.equal(started.status, "running");
  assert.throws(
    () =>
      store.createExecution("project_pool", "ticket_project_pool_2", {
        role: "reviewer",
        reason: "This second run should be rejected by project policy.",
      }),
    /Project execution limit reached for POOL-2: 1 active runs allowed/,
  );

  store.close();
});

test("store enforces continuation budgets before mutating the active run", () => {
  const store = createStore({ filename: ":memory:", seedDemo: true });
  store.updateProjectPolicy("project_pool", {
    maxAutoContinueIterations: 1,
  });

  const started = store.createExecution("project_pool", "ticket_project_pool_1", {
    role: "developer",
    reason: "Start the bounded continuation lane.",
  });
  const continued = store.continueExecution("project_pool", started.id, {
    reason: "Spend the only continuation budget.",
  });

  assert.equal(continued.iteration, 2);
  assert.equal(continued.status, "running");
  assert.throws(
    () =>
      store.continueExecution("project_pool", continued.id, {
        reason: "Attempt to exceed the continuation limit.",
      }),
    /POOL-1 reached the continuation limit of 1 iterations/,
  );
  assert.equal(store.getExecution("project_pool", continued.id).status, "running");

  store.close();
});
