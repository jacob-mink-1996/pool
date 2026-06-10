import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createPoolServer } from "../src/app.mjs";
import { createStore } from "../src/store.mjs";

test("API exposes persistent board and filtered ticket read models", async () => {
  const fixtureDir = mkdtempSync(join(tmpdir(), "pool-api-"));
  const filename = join(fixtureDir, "pool.sqlite");
  const store = createStore({
    filename,
    seedDemo: true,
    workspaceRoot: "/workspace/pool",
  });
  const server = createPoolServer({ store });

  try {
    await listen(server);
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    const boardResponse = await fetch(`${baseUrl}/api/v1/projects/project_pool/board`);
    assert.equal(boardResponse.status, 200);
    const boardPayload = await boardResponse.json();
    assert.equal(boardPayload.board.totalTickets, 2);
    assert.equal(findColumn(boardPayload.board.columns, "READY").count, 1);
    assert.equal(findColumn(boardPayload.board.columns, "WORKING").count, 1);

    const createTicketResponse = await fetch(`${baseUrl}/api/v1/projects/project_pool/tickets`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Reviewer lane readiness",
        brief: "Add filter coverage for reviewer work.",
        state: "READY",
        priority: "medium",
        assignedRole: "reviewer",
        repoTargets: [{ repoId: "repo_project_pool_pool" }],
      }),
    });
    assert.equal(createTicketResponse.status, 201);
    const createdTicketPayload = await createTicketResponse.json();
    assert.equal(createdTicketPayload.ticket.assignedRole, "reviewer");

    const filteredResponse = await fetch(
      `${baseUrl}/api/v1/projects/project_pool/tickets?state=READY&assignedRole=reviewer&search=reviewer`,
    );
    assert.equal(filteredResponse.status, 200);
    const filteredPayload = await filteredResponse.json();
    assert.equal(filteredPayload.tickets.length, 1);
    assert.equal(filteredPayload.tickets[0].key, "POOL-3");

    const childResponse = await fetch(`${baseUrl}/api/v1/projects/project_pool/tickets`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Child reviewer follow-up",
        brief: "Track the next dependency under the reviewer lane.",
        parentTicketId: createdTicketPayload.ticket.id,
        state: "READY",
        priority: "medium",
        assignedRole: "reviewer",
      }),
    });
    assert.equal(childResponse.status, 201);
    const childPayload = await childResponse.json();
    assert.equal(childPayload.ticket.parentTicketId, createdTicketPayload.ticket.id);

    const parentCycleResponse = await fetch(
      `${baseUrl}/api/v1/projects/project_pool/tickets/${createdTicketPayload.ticket.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          parentTicketId: childPayload.ticket.id,
        }),
      },
    );
    assert.equal(parentCycleResponse.status, 400);

    const parentFilteredResponse = await fetch(
      `${baseUrl}/api/v1/projects/project_pool/tickets?parentTicketId=${createdTicketPayload.ticket.id}`,
    );
    assert.equal(parentFilteredResponse.status, 200);
    const parentFilteredPayload = await parentFilteredResponse.json();
    assert.equal(parentFilteredPayload.tickets.length, 1);
    assert.equal(parentFilteredPayload.tickets[0].id, childPayload.ticket.id);
    assert.equal(parentFilteredPayload.tickets[0].parentTicketId, createdTicketPayload.ticket.id);

    const detailResponse = await fetch(
      `${baseUrl}/api/v1/projects/project_pool/tickets/${createdTicketPayload.ticket.id}`,
    );
    assert.equal(detailResponse.status, 200);
    const detailPayload = await detailResponse.json();
    assert.equal(detailPayload.ticket.repoTargets[0].repoSlug, "pool");
    assert.equal(detailPayload.ticket.events.length, 1);
    assert.equal(detailPayload.ticket.dependencies.length, 0);

    const dependencyResponse = await fetch(
      `${baseUrl}/api/v1/projects/project_pool/tickets/${createdTicketPayload.ticket.id}/dependencies`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          blockingTicketId: "ticket_project_pool_1",
          dependencyType: "finish_to_start",
        }),
      },
    );
    assert.equal(dependencyResponse.status, 200);
    const dependencyPayload = await dependencyResponse.json();
    assert.equal(dependencyPayload.ticket.dependencies.length, 1);
    assert.equal(dependencyPayload.ticket.dependencies[0].blockingTicketKey, "POOL-1");

    const dependencyCycleResponse = await fetch(
      `${baseUrl}/api/v1/projects/project_pool/tickets/ticket_project_pool_1/dependencies`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          blockingTicketId: createdTicketPayload.ticket.id,
          dependencyType: "finish_to_start",
        }),
      },
    );
    assert.equal(dependencyCycleResponse.status, 400);

    const invalidFilterResponse = await fetch(
      `${baseUrl}/api/v1/projects/project_pool/tickets?state=NOT_A_REAL_STATE`,
    );
    assert.equal(invalidFilterResponse.status, 400);
  } finally {
    await closeServer(server);
    store.close();
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test("API exposes execution start, completion, continuation, and cancellation flows", async () => {
  const fixtureDir = mkdtempSync(join(tmpdir(), "pool-api-"));
  const filename = join(fixtureDir, "pool.sqlite");
  const store = createStore({
    filename,
    seedDemo: true,
    workspaceRoot: "/workspace/pool",
  });
  const server = createPoolServer({ store });

  try {
    await listen(server);
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    const createExecutionResponse = await fetch(
      `${baseUrl}/api/v1/projects/project_pool/tickets/ticket_project_pool_2/executions`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          role: "developer",
          reason: "Start the contract implementation lane.",
        }),
      },
    );
    assert.equal(createExecutionResponse.status, 201);
    const createExecutionBody = await createExecutionResponse.json();
    assert.equal(createExecutionBody.execution.status, "running");
    assert.equal(createExecutionBody.execution.iteration, 1);
    assert.equal(createExecutionBody.execution.agentProfileId, "profile_project_pool_developer");
    assert.equal(createExecutionBody.execution.worktrees.length, 1);
    assert.equal(createExecutionBody.execution.worktrees[0].repoSlug, "pool");
    assert.match(createExecutionBody.execution.worktrees[0].path, /\/workspace\/pool\/\.pool\/worktrees\/pool-2\/pool\/iter-1$/);

    const listExecutionsResponse = await fetch(
      `${baseUrl}/api/v1/projects/project_pool/tickets/ticket_project_pool_2/executions`,
    );
    assert.equal(listExecutionsResponse.status, 200);
    const listExecutionsBody = await listExecutionsResponse.json();
    assert.equal(listExecutionsBody.executions.length, 1);

    const completeExecutionResponse = await fetch(
      `${baseUrl}/api/v1/projects/project_pool/executions/${createExecutionBody.execution.id}/complete`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          outcome: "completed",
          summaryMd: "Execution landed the shared contract changes.",
        }),
      },
    );
    assert.equal(completeExecutionResponse.status, 200);
    const completeExecutionBody = await completeExecutionResponse.json();
    assert.equal(completeExecutionBody.execution.outcome, "completed");
    assert.equal(completeExecutionBody.execution.worktrees[0].status, "ready_for_review");

    const ticketAfterCompleteResponse = await fetch(
      `${baseUrl}/api/v1/projects/project_pool/tickets/ticket_project_pool_2`,
    );
    const ticketAfterCompleteBody = await ticketAfterCompleteResponse.json();
    assert.equal(ticketAfterCompleteResponse.status, 200);
    assert.equal(ticketAfterCompleteBody.ticket.state, "REVIEWING");
    assert.equal(ticketAfterCompleteBody.ticket.executions.length, 1);
    assert.equal(ticketAfterCompleteBody.ticket.worktrees.length, 1);
    assert.equal(ticketAfterCompleteBody.ticket.executions[0].worktrees[0].status, "ready_for_review");
    assert.equal(ticketAfterCompleteBody.ticket.events.some((event) => event.type === "worktree.created"), true);

    const listWorktreesResponse = await fetch(
      `${baseUrl}/api/v1/projects/project_pool/worktrees?ticketId=ticket_project_pool_2&status=ready_for_review`,
    );
    assert.equal(listWorktreesResponse.status, 200);
    const listWorktreesBody = await listWorktreesResponse.json();
    assert.equal(listWorktreesBody.worktrees.length, 1);
    assert.equal(listWorktreesBody.worktrees[0].executionId, createExecutionBody.execution.id);

    const cleanWorktreeResponse = await fetch(
      `${baseUrl}/api/v1/projects/project_pool/worktrees/${createExecutionBody.execution.worktrees[0].id}/clean`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reason: "Operator cleaned the finished contract worktree.",
        }),
      },
    );
    assert.equal(cleanWorktreeResponse.status, 200);
    const cleanWorktreeBody = await cleanWorktreeResponse.json();
    assert.equal(cleanWorktreeBody.worktree.status, "cleaned");
    assert.ok(cleanWorktreeBody.worktree.cleanedAt);

    const tightenPolicyResponse = await fetch(`${baseUrl}/api/v1/projects/project_pool/policy`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        maxParallelExecutions: 1,
        maxAutoContinueIterations: 1,
      }),
    });
    assert.equal(tightenPolicyResponse.status, 200);

    const seedContinuationResponse = await fetch(
      `${baseUrl}/api/v1/projects/project_pool/tickets/ticket_project_pool_1/executions`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          role: "developer",
          reason: "Start the next implementation pass.",
        }),
      },
    );
    assert.equal(seedContinuationResponse.status, 201);
    const seedContinuationBody = await seedContinuationResponse.json();

    const concurrencyRejectedResponse = await fetch(
      `${baseUrl}/api/v1/projects/project_pool/tickets/ticket_project_pool_2/executions`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          role: "reviewer",
          reason: "Try to exceed the project concurrency cap.",
        }),
      },
    );
    assert.equal(concurrencyRejectedResponse.status, 409);
    const concurrencyRejectedBody = await concurrencyRejectedResponse.json();
    assert.match(concurrencyRejectedBody.message, /Project execution limit reached for POOL-2/);

    const continueExecutionResponse = await fetch(
      `${baseUrl}/api/v1/projects/project_pool/executions/${seedContinuationBody.execution.id}/continue`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reason: "Continue into the follow-up iteration.",
        }),
      },
    );
    assert.equal(continueExecutionResponse.status, 200);
    const continueExecutionBody = await continueExecutionResponse.json();
    assert.equal(continueExecutionBody.execution.iteration, 2);
    assert.equal(continueExecutionBody.execution.status, "running");
    assert.equal(continueExecutionBody.execution.worktrees[0].status, "active");
    assert.match(continueExecutionBody.execution.worktrees[0].path, /\/workspace\/pool\/\.pool\/worktrees\/pool-1\/pool\/iter-2$/);

    const cleanActiveWorktreeResponse = await fetch(
      `${baseUrl}/api/v1/projects/project_pool/worktrees/${continueExecutionBody.execution.worktrees[0].id}/clean`,
      {
        method: "POST",
      },
    );
    assert.equal(cleanActiveWorktreeResponse.status, 409);

    const overContinueResponse = await fetch(
      `${baseUrl}/api/v1/projects/project_pool/executions/${continueExecutionBody.execution.id}/continue`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reason: "Attempt to exceed the continuation budget.",
        }),
      },
    );
    assert.equal(overContinueResponse.status, 409);
    const overContinueBody = await overContinueResponse.json();
    assert.match(overContinueBody.message, /POOL-1 reached the continuation limit of 1 iterations/);

    const cancelExecutionResponse = await fetch(
      `${baseUrl}/api/v1/projects/project_pool/executions/${continueExecutionBody.execution.id}/cancel`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reason: "Operator cancelled the stale continuation.",
        }),
      },
    );
    assert.equal(cancelExecutionResponse.status, 200);
    const cancelExecutionBody = await cancelExecutionResponse.json();
    assert.equal(cancelExecutionBody.execution.status, "cancelled");
    assert.equal(cancelExecutionBody.execution.worktrees[0].status, "cancelled");

    const invalidExecutionResponse = await fetch(
      `${baseUrl}/api/v1/projects/project_pool/tickets/ticket_project_pool_1/executions`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          role: "pilot",
        }),
      },
    );
    assert.equal(invalidExecutionResponse.status, 400);

    const mismatchedProfileResponse = await fetch(
      `${baseUrl}/api/v1/projects/project_pool/tickets/ticket_project_pool_1/executions`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          role: "developer",
          agentProfileId: "profile_project_pool_reviewer",
        }),
      },
    );
    assert.equal(mismatchedProfileResponse.status, 400);
  } finally {
    await closeServer(server);
    store.close();
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test("API exposes review and validation evidence flows", async () => {
  const fixtureDir = mkdtempSync(join(tmpdir(), "pool-api-"));
  const filename = join(fixtureDir, "pool.sqlite");
  const store = createStore({
    filename,
    seedDemo: true,
    workspaceRoot: "/workspace/pool",
  });
  const server = createPoolServer({ store });

  try {
    await listen(server);
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    const createExecutionResponse = await fetch(
      `${baseUrl}/api/v1/projects/project_pool/tickets/ticket_project_pool_2/executions`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          role: "developer",
          reason: "Finish the implementation before evidence lanes.",
        }),
      },
    );
    const createExecutionBody = await createExecutionResponse.json();
    assert.equal(createExecutionResponse.status, 201);

    const completeExecutionResponse = await fetch(
      `${baseUrl}/api/v1/projects/project_pool/executions/${createExecutionBody.execution.id}/complete`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          outcome: "completed",
          summaryMd: "Implementation completed and ready for review.",
        }),
      },
    );
    assert.equal(completeExecutionResponse.status, 200);

    const reviewResponse = await fetch(
      `${baseUrl}/api/v1/projects/project_pool/tickets/ticket_project_pool_2/reviews`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          executionId: createExecutionBody.execution.id,
          verdict: "passed",
          summaryMd: "Reviewer found no blocking issues.",
        }),
      },
    );
    assert.equal(reviewResponse.status, 201);
    const reviewBody = await reviewResponse.json();
    assert.equal(reviewBody.review.verdict, "passed");

    const reviewListResponse = await fetch(
      `${baseUrl}/api/v1/projects/project_pool/tickets/ticket_project_pool_2/reviews`,
    );
    assert.equal(reviewListResponse.status, 200);
    const reviewListBody = await reviewListResponse.json();
    assert.equal(reviewListBody.reviews.length, 1);

    const validationResponse = await fetch(
      `${baseUrl}/api/v1/projects/project_pool/tickets/ticket_project_pool_2/validations`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          executionId: createExecutionBody.execution.id,
          repoIds: ["repo_project_pool_pool"],
          commandProfile: "ci",
          commands: ["npm test"],
          verdict: "passed",
          summaryMd: "Validation checks passed.",
        }),
      },
    );
    assert.equal(validationResponse.status, 201);
    const validationBody = await validationResponse.json();
    assert.equal(validationBody.validations.length, 1);
    assert.equal(validationBody.validations[0].repoSlug, "pool");

    const ticketDetailResponse = await fetch(
      `${baseUrl}/api/v1/projects/project_pool/tickets/ticket_project_pool_2`,
    );
    assert.equal(ticketDetailResponse.status, 200);
    const ticketDetailBody = await ticketDetailResponse.json();
    assert.equal(ticketDetailBody.ticket.state, "READY_TO_MERGE");
    assert.equal(ticketDetailBody.ticket.reviews.length, 1);
    assert.equal(ticketDetailBody.ticket.validations.length, 1);

    const boardResponse = await fetch(`${baseUrl}/api/v1/projects/project_pool/board`);
    assert.equal(boardResponse.status, 200);
    const boardBody = await boardResponse.json();
    const mergeReadyCard = findColumn(boardBody.board.columns, "READY_TO_MERGE").tickets.find(
      (ticket) => ticket.id === "ticket_project_pool_2",
    );
    assert.equal(mergeReadyCard.latestReviewVerdict, "passed");
    assert.equal(mergeReadyCard.latestValidationVerdict, "passed");
  } finally {
    await closeServer(server);
    store.close();
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test("API exposes merge readiness and merge completion flows", async () => {
  const fixtureDir = mkdtempSync(join(tmpdir(), "pool-api-"));
  const filename = join(fixtureDir, "pool.sqlite");
  const store = createStore({
    filename,
    seedDemo: true,
    workspaceRoot: "/workspace/pool",
  });
  const server = createPoolServer({ store });

  try {
    await listen(server);
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    await fetch(`${baseUrl}/api/v1/projects/project_pool/tickets/ticket_project_pool_2/transition`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        targetState: "READY_TO_MERGE",
        reason: "All evidence is already recorded for the merge lane.",
      }),
    });

    const mergeStatusResponse = await fetch(
      `${baseUrl}/api/v1/projects/project_pool/tickets/ticket_project_pool_2/merge`,
    );
    assert.equal(mergeStatusResponse.status, 200);
    const mergeStatusBody = await mergeStatusResponse.json();
    assert.equal(mergeStatusBody.merge.canMerge, true);
    assert.equal(mergeStatusBody.merge.requiresHumanApproval, true);

    const queueResponse = await fetch(`${baseUrl}/api/v1/projects/project_pool/merge-queue`);
    assert.equal(queueResponse.status, 200);
    const queueBody = await queueResponse.json();
    assert.equal(queueBody.queue.length, 1);
    assert.equal(queueBody.queue[0].key, "POOL-2");
    assert.equal(queueBody.queue[0].mergeStatus.canMerge, true);

    const approvalRejectedResponse = await fetch(
      `${baseUrl}/api/v1/projects/project_pool/tickets/ticket_project_pool_2/merge`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          strategy: "squash",
        }),
      },
    );
    assert.equal(approvalRejectedResponse.status, 409);

    const mergeResponse = await fetch(
      `${baseUrl}/api/v1/projects/project_pool/tickets/ticket_project_pool_2/merge`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          strategy: "squash",
          approvedByKind: "human",
          approvedByRef: "jacob",
          summaryMd: "Merged after review and validation passed.",
        }),
      },
    );
    assert.equal(mergeResponse.status, 200);
    const mergeBody = await mergeResponse.json();
    assert.equal(mergeBody.merge.ticketState, "DONE");
    assert.equal(mergeBody.merge.latestRun.status, "completed");
    assert.equal(mergeBody.merge.latestRun.approvedByRef, "jacob");

    const ticketDetailResponse = await fetch(
      `${baseUrl}/api/v1/projects/project_pool/tickets/ticket_project_pool_2`,
    );
    assert.equal(ticketDetailResponse.status, 200);
    const ticketDetailBody = await ticketDetailResponse.json();
    assert.equal(ticketDetailBody.ticket.state, "DONE");
    assert.equal(ticketDetailBody.ticket.mergeStatus.latestRun.strategy, "squash");
    assert.equal(ticketDetailBody.ticket.events.at(-2).type, "merge.started");
    assert.equal(ticketDetailBody.ticket.events.at(-1).type, "merge.completed");

    const queueAfterMergeResponse = await fetch(`${baseUrl}/api/v1/projects/project_pool/merge-queue`);
    assert.equal(queueAfterMergeResponse.status, 200);
    const queueAfterMergeBody = await queueAfterMergeResponse.json();
    assert.equal(queueAfterMergeBody.queue.length, 0);
  } finally {
    await closeServer(server);
    store.close();
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test("API exposes filtered project activity events with ticket and repo context", async () => {
  const fixtureDir = mkdtempSync(join(tmpdir(), "pool-api-"));
  const filename = join(fixtureDir, "pool.sqlite");
  const store = createStore({
    filename,
    seedDemo: true,
    workspaceRoot: "/workspace/pool",
  });
  const server = createPoolServer({ store });

  try {
    await listen(server);
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    const createExecutionResponse = await fetch(
      `${baseUrl}/api/v1/projects/project_pool/tickets/ticket_project_pool_2/executions`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          role: "developer",
          reason: "Generate recent activity for the operator feed.",
        }),
      },
    );
    assert.equal(createExecutionResponse.status, 201);

    const filteredEventsResponse = await fetch(
      `${baseUrl}/api/v1/projects/project_pool/events?ticketId=ticket_project_pool_2&type=worktree.created&limit=1&order=desc`,
    );
    assert.equal(filteredEventsResponse.status, 200);
    const filteredEventsBody = await filteredEventsResponse.json();
    assert.equal(filteredEventsBody.events.length, 1);
    assert.equal(filteredEventsBody.events[0].ticketKey, "POOL-2");
    assert.equal(filteredEventsBody.events[0].ticketTitle, "Define first transport contracts");
    assert.equal(filteredEventsBody.events[0].repoSlug, "pool");
    assert.equal(filteredEventsBody.events[0].repoName, "pool");
    assert.equal(filteredEventsBody.events[0].type, "worktree.created");

    const recentEventsResponse = await fetch(
      `${baseUrl}/api/v1/projects/project_pool/events?ticketId=ticket_project_pool_2&limit=2&order=desc`,
    );
    assert.equal(recentEventsResponse.status, 200);
    const recentEventsBody = await recentEventsResponse.json();
    assert.equal(recentEventsBody.events.length, 2);
    assert.equal(recentEventsBody.events.every((event) => event.ticketId === "ticket_project_pool_2"), true);
    assert.equal(recentEventsBody.events[0].createdAt >= recentEventsBody.events[1].createdAt, true);

    const invalidFilterResponse = await fetch(
      `${baseUrl}/api/v1/projects/project_pool/events?order=sideways&limit=0`,
    );
    assert.equal(invalidFilterResponse.status, 400);
  } finally {
    await closeServer(server);
    store.close();
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

function findColumn(columns, state) {
  const column = columns.find((item) => item.state === state);
  assert.ok(column, `Expected board column ${state}`);
  return column;
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    if (!server.listening) {
      resolve();
      return;
    }

    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
