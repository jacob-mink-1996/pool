import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createPoolServer } from "./app.mjs";
import { createStore } from "./store.mjs";

async function withServer(run, options = {}) {
  const fixtureDir = mkdtempSync(join(tmpdir(), "pool-app-test-"));
  const store = createStore({
    filename: join(fixtureDir, "pool.sqlite"),
    seedDemo: options.seedDemo ?? true,
    workspaceRoot: options.workspaceRoot || "/workspace/pool",
  });
  const server = createPoolServer({ store });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();

  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    store.close();
    rmSync(fixtureDir, { recursive: true, force: true });
  }
}

test("health endpoint responds successfully", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.service, "pool-api");
  });
});

test("root route serves the operator web app", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/html/);
    assert.match(html, /Pool Mission Control/);
    assert.match(html, /status-banner/);
    assert.match(html, /Operator Overview/);
    assert.match(html, /Create Project/);
    assert.match(html, /Project Settings/);
    assert.match(html, /Delivery Policy/);
    assert.match(html, /Repositories/);
    assert.match(html, /Agent Profiles/);
    assert.match(html, /Merge Queue/);
    assert.match(html, /Execution Lane/);
    assert.match(html, /Reviews/);
    assert.match(html, /Validations/);
    assert.match(html, /Merge Readiness/);
    assert.match(html, /Worktrees/);
    assert.match(html, /Artifacts/);
  });
});

test("web module assets are served with the correct content type", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/lib/helpers.js`);
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/javascript/);
    assert.match(body, /export function prettyState/);
  });
});

test("head requests succeed for web assets", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/app.js`, { method: "HEAD" });
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/javascript/);
    assert.equal(body, "");
  });
});

test("project creation bootstraps a blank Pool workspace", async () => {
  await withServer(
    async (baseUrl) => {
      const projectsResponse = await fetch(`${baseUrl}/api/v1/projects`);
      const projectsBody = await projectsResponse.json();
      assert.equal(projectsResponse.status, 200);
      assert.deepEqual(projectsBody.projects, []);

      const createResponse = await fetch(`${baseUrl}/api/v1/projects`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Client Zero",
          slug: "client-zero",
          workspaceRoot: "/workspace/client-zero",
          description: "Fresh project space for first-run setup.",
          defaultBaseBranch: "trunk",
        }),
      });
      const createBody = await createResponse.json();

      assert.equal(createResponse.status, 201);
      assert.equal(createBody.project.id, "project_client_zero");
      assert.equal(createBody.project.ticketCount, 0);
      assert.equal(createBody.project.defaultBaseBranch, "trunk");

      const boardResponse = await fetch(`${baseUrl}/api/v1/projects/${createBody.project.id}/board`);
      const boardBody = await boardResponse.json();
      assert.equal(boardResponse.status, 200);
      assert.equal(boardBody.board.projectName, "Client Zero");
      assert.equal(boardBody.board.totalTickets, 0);

      const repoResponse = await fetch(`${baseUrl}/api/v1/projects/${createBody.project.id}/repos`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "client-zero-app",
          slug: "client-zero-app",
          localPath: "/workspace/client-zero/app",
          defaultBranch: "trunk",
          isPrimary: true,
        }),
      });
      const repoBody = await repoResponse.json();
      assert.equal(repoResponse.status, 201);

      const ticketResponse = await fetch(`${baseUrl}/api/v1/projects/${createBody.project.id}/tickets`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "Stand up first backlog ticket",
          brief: "Prove the newly created project can accept work immediately.",
          state: "READY",
          assignedRole: "developer",
          repoTargets: [{ repoId: repoBody.repo.id, baseRef: "trunk" }],
        }),
      });
      const ticketBody = await ticketResponse.json();
      assert.equal(ticketResponse.status, 201);
      assert.equal(ticketBody.ticket.key, "POOL-1");
      assert.equal(ticketBody.ticket.repoTargets[0].repoId, repoBody.repo.id);
    },
    { seedDemo: false, workspaceRoot: "/workspace/blank-pool" },
  );
});

test("board endpoint returns grouped lanes", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/projects/project_pool/board`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.board.projectId, "project_pool");
    assert.equal(findColumn(body.board.columns, "WORKING").count, 1);
    assert.equal(findColumn(body.board.columns, "READY").count, 1);
  });
});

test("project metadata can be patched through the API", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/projects/project_pool`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Pool Mission Control",
        description: "Operational cockpit for governed delivery.",
        workspaceRoot: "/workspace/pool-prod",
        defaultBaseBranch: "trunk",
      }),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.project.name, "Pool Mission Control");
    assert.equal(body.project.description, "Operational cockpit for governed delivery.");
    assert.equal(body.project.workspaceRoot, "/workspace/pool-prod");
    assert.equal(body.project.defaultBaseBranch, "trunk");
  });
});

test("project policy and role profiles can be patched through the API", async () => {
  await withServer(async (baseUrl) => {
    const updatePolicyResponse = await fetch(`${baseUrl}/api/v1/projects/project_pool/policy`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        requireReviewer: false,
        requireValidator: false,
        requireHumanApprovalBeforeMerge: false,
        maxParallelExecutions: 6,
        maxAutoContinueIterations: 9,
        agentCreatedTicketDefaultState: "READY",
      }),
    });
    const updatePolicyBody = await updatePolicyResponse.json();

    const updateProfileResponse = await fetch(
      `${baseUrl}/api/v1/projects/project_pool/agent-profiles/developer`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          adapter: "codex-cli",
          model: "codex-max",
          config: { reasoning: "high" },
        }),
      },
    );
    const updateProfileBody = await updateProfileResponse.json();

    const profilesResponse = await fetch(`${baseUrl}/api/v1/projects/project_pool/agent-profiles`);
    const profilesBody = await profilesResponse.json();

    const projectResponse = await fetch(`${baseUrl}/api/v1/projects/project_pool`);
    const projectBody = await projectResponse.json();

    assert.equal(updatePolicyResponse.status, 200);
    assert.equal(updatePolicyBody.policy.maxParallelExecutions, 6);
    assert.equal(updatePolicyBody.policy.requireReviewer, false);
    assert.equal(updatePolicyBody.policy.requiredValidationCommandProfileForMerge, "");
    assert.equal(updateProfileResponse.status, 200);
    assert.equal(updateProfileBody.profile.role, "developer");
    assert.equal(updateProfileBody.profile.adapter, "codex-cli");
    assert.deepEqual(updateProfileBody.profile.config, { reasoning: "high" });
    assert.equal(profilesResponse.status, 200);
    assert.equal(profilesBody.profiles.find((profile) => profile.role === "developer").model, "codex-max");
    assert.equal(projectResponse.status, 200);
    assert.equal(projectBody.project.policy.maxAutoContinueIterations, 9);
    assert.equal(
      projectBody.project.roleProfiles.find((profile) => profile.role === "developer").adapter,
      "codex-cli",
    );
  });
});

test("API surfaces merge-policy blocks when validation profile does not satisfy policy", async () => {
  await withServer(async (baseUrl) => {
    await fetch(`${baseUrl}/api/v1/projects/project_pool/policy`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        requireReviewer: false,
        requireValidator: true,
        requireHumanApprovalBeforeMerge: false,
        requiredValidationCommandProfileForMerge: "ci",
      }),
    });

    const executionResponse = await fetch(`${baseUrl}/api/v1/projects/project_pool/tickets/ticket_project_pool_2/executions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        role: "developer",
        reason: "Prepare merge policy validation mismatch.",
      }),
    });
    const executionBody = await executionResponse.json();

    await fetch(`${baseUrl}/api/v1/projects/project_pool/executions/${executionBody.execution.id}/complete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        outcome: "completed",
        summaryMd: "Implementation completed for merge mismatch test.",
      }),
    });

    const ticketAfterImplementation = await fetch(`${baseUrl}/api/v1/projects/project_pool/tickets/ticket_project_pool_2`);
    const ticketAfterImplementationBody = await ticketAfterImplementation.json();
    const validatorExecution = ticketAfterImplementationBody.ticket.executions.find(
      (item) => item.role === "validator",
    );

    await fetch(`${baseUrl}/api/v1/projects/project_pool/executions/${validatorExecution.id}/complete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        outcome: "completed",
        summaryMd: "Validation completed with the wrong profile.",
        validation: {
          verdict: "passed",
          commandProfile: "smoke",
          commands: ["npm test"],
          repoIds: ["repo_project_pool_pool"],
          summaryMd: "Validation passed but under the wrong profile.",
        },
      }),
    });

    const mergeStatusResponse = await fetch(`${baseUrl}/api/v1/projects/project_pool/tickets/ticket_project_pool_2/merge`);
    const mergeStatusBody = await mergeStatusResponse.json();
    assert.equal(mergeStatusResponse.status, 200);
    assert.equal(mergeStatusBody.merge.canMerge, false);
    assert.equal(mergeStatusBody.merge.readiness, "waiting");
    assert.equal(mergeStatusBody.merge.blockingReasons[0].code, "validation_profile_required");
    assert.match(mergeStatusBody.merge.statusSummary, /Latest validation must use ci profile before merge/);

    const mergeResponse = await fetch(`${baseUrl}/api/v1/projects/project_pool/tickets/ticket_project_pool_2/merge`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        strategy: "squash",
      }),
    });
    const mergeBody = await mergeResponse.json();
    assert.equal(mergeResponse.status, 409);
    assert.equal(mergeBody.reasonCode, "validation_profile_required");
    assert.equal(mergeBody.merge.blockingReasons[0].code, "validation_profile_required");
    assert.match(mergeBody.message, /Latest validation must use ci profile before merge/);
  });
});

test("review and validation endpoints persist evidence and advance ticket state", async () => {
  await withServer(async (baseUrl) => {
    const executionResponse = await fetch(
      `${baseUrl}/api/v1/projects/project_pool/tickets/ticket_project_pool_2/executions`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          role: "developer",
          reason: "Complete the contract implementation lane.",
        }),
      },
    );
    const executionBody = await executionResponse.json();
    assert.equal(executionResponse.status, 201);

    const completeResponse = await fetch(
      `${baseUrl}/api/v1/projects/project_pool/executions/${executionBody.execution.id}/complete`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          outcome: "completed",
          summaryMd: "Implementation is ready for reviewer evidence.",
          artifacts: [
            {
              kind: "patch",
              label: "Implementation diff",
              uri: "file:///workspace/pool/.pool/artifacts/pool-2.patch",
            },
          ],
        }),
      },
    );
    assert.equal(completeResponse.status, 200);

    const reviewResponse = await fetch(
      `${baseUrl}/api/v1/projects/project_pool/tickets/ticket_project_pool_2/reviews`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          executionId: executionBody.execution.id,
          verdict: "rework",
          summaryMd: "Reviewer found a routing issue.",
          artifacts: [
            {
              kind: "report",
              label: "Reviewer notes",
              uri: "file:///workspace/pool/.pool/artifacts/pool-2-review.md",
            },
          ],
          findings: [
            {
              severity: "high",
              category: "correctness",
              filePath: "services/api/src/app.mjs",
              lineNumber: 120,
              title: "Missing route guard",
              detailsMd: "The handler should reject invalid transitions.",
            },
          ],
        }),
      },
    );
    const reviewBody = await reviewResponse.json();
    assert.equal(reviewResponse.status, 201);
    assert.equal(reviewBody.review.findingsCount, 1);
    assert.equal(reviewBody.review.findings[0].severity, "high");
    assert.equal(reviewBody.review.artifacts[0].label, "Reviewer notes");

    const reviewListResponse = await fetch(
      `${baseUrl}/api/v1/projects/project_pool/tickets/ticket_project_pool_2/reviews`,
    );
    const reviewListBody = await reviewListResponse.json();
    assert.equal(reviewListResponse.status, 200);
    assert.equal(reviewListBody.reviews.length, 1);

    const ticketAfterReviewResponse = await fetch(
      `${baseUrl}/api/v1/projects/project_pool/tickets/ticket_project_pool_2`,
    );
    const ticketAfterReviewBody = await ticketAfterReviewResponse.json();
    assert.equal(ticketAfterReviewBody.ticket.state, "REWORK");
    assert.equal(ticketAfterReviewBody.ticket.reviews.length, 1);

    await fetch(`${baseUrl}/api/v1/projects/project_pool/tickets/ticket_project_pool_2/transition`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        targetState: "VALIDATING",
        reason: "Rework landed and validation can begin.",
      }),
    });

    const validationResponse = await fetch(
      `${baseUrl}/api/v1/projects/project_pool/tickets/ticket_project_pool_2/validations`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          executionId: executionBody.execution.id,
          repoIds: ["repo_project_pool_pool"],
          commandProfile: "ci",
          commands: ["npm test"],
          verdict: "passed",
          summaryMd: "Validation checks passed.",
          artifacts: [
            {
              kind: "log",
              label: "Validation output",
              uri: "file:///workspace/pool/.pool/artifacts/pool-2-validation.log",
            },
          ],
        }),
      },
    );
    const validationBody = await validationResponse.json();
    assert.equal(validationResponse.status, 201);
    assert.equal(validationBody.validations.length, 1);
    assert.equal(validationBody.validations[0].verdict, "passed");
    assert.equal(validationBody.validations[0].artifacts[0].kind, "log");

    const validationListResponse = await fetch(
      `${baseUrl}/api/v1/projects/project_pool/tickets/ticket_project_pool_2/validations`,
    );
    const validationListBody = await validationListResponse.json();
    assert.equal(validationListResponse.status, 200);
    assert.equal(validationListBody.validations.length, 1);

    const ticketAfterValidationResponse = await fetch(
      `${baseUrl}/api/v1/projects/project_pool/tickets/ticket_project_pool_2`,
    );
    const ticketAfterValidationBody = await ticketAfterValidationResponse.json();
    assert.equal(ticketAfterValidationBody.ticket.state, "READY_TO_MERGE");
    assert.equal(ticketAfterValidationBody.ticket.validations.length, 1);
    assert.equal(
      ticketAfterValidationBody.ticket.executions.find((execution) => execution.id === executionBody.execution.id)
        .artifacts[0].label,
      "Implementation diff",
    );
    assert.equal(ticketAfterValidationBody.ticket.artifacts.length, 3);
  });
});

test("review and validation endpoints reject out-of-order evidence", async () => {
  await withServer(async (baseUrl) => {
    const executionResponse = await fetch(
      `${baseUrl}/api/v1/projects/project_pool/tickets/ticket_project_pool_2/executions`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          role: "developer",
          reason: "Start implementation before evidence is ready.",
        }),
      },
    );
    const executionBody = await executionResponse.json();
    assert.equal(executionResponse.status, 201);

    const earlyReviewResponse = await fetch(
      `${baseUrl}/api/v1/projects/project_pool/tickets/ticket_project_pool_2/reviews`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          executionId: executionBody.execution.id,
          verdict: "passed",
        }),
      },
    );
    const earlyReviewBody = await earlyReviewResponse.json();
    assert.equal(earlyReviewResponse.status, 409);
    assert.equal(earlyReviewBody.reasonCode, "review_execution_not_finished");
    assert.match(earlyReviewBody.message, /must be finished before review/);

    await fetch(`${baseUrl}/api/v1/projects/project_pool/executions/${executionBody.execution.id}/complete`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        outcome: "completed",
        summaryMd: "Implementation is done and waiting on review.",
      }),
    });

    const earlyValidationResponse = await fetch(
      `${baseUrl}/api/v1/projects/project_pool/tickets/ticket_project_pool_2/validations`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          executionId: executionBody.execution.id,
          repoIds: ["repo_project_pool_pool"],
          verdict: "passed",
        }),
      },
    );
    const earlyValidationBody = await earlyValidationResponse.json();
    assert.equal(earlyValidationResponse.status, 409);
    assert.equal(earlyValidationBody.reasonCode, "ticket_not_ready_for_validation");
    assert.match(earlyValidationBody.message, /not ready for validation/);
  });
});

test("repo metadata can be patched through the API", async () => {
  await withServer(async (baseUrl) => {
    const createResponse = await fetch(`${baseUrl}/api/v1/projects/project_pool/repos`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "pool-docs",
        slug: "pool-docs",
        localPath: "/workspace/pool/docs",
        defaultBranch: "main",
      }),
    });
    const created = await createResponse.json();

    const response = await fetch(
      `${baseUrl}/api/v1/projects/project_pool/repos/${created.repo.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "pool-docs-site",
          localPath: "/workspace/pool/site",
          remoteUrl: "https://example.com/pool-docs.git",
          defaultBranch: "develop",
          isPrimary: true,
        }),
      },
    );
    const body = await response.json();

    assert.equal(createResponse.status, 201);
    assert.equal(response.status, 200);
    assert.equal(body.repo.name, "pool-docs-site");
    assert.equal(body.repo.localPath, "/workspace/pool/site");
    assert.equal(body.repo.remoteUrl, "https://example.com/pool-docs.git");
    assert.equal(body.repo.defaultBranch, "develop");
    assert.equal(body.repo.isPrimary, true);

    const reposResponse = await fetch(`${baseUrl}/api/v1/projects/project_pool/repos`);
    const reposBody = await reposResponse.json();
    assert.equal(reposBody.repos.filter((repo) => repo.isPrimary).length, 1);
    assert.equal(
      reposBody.repos.find((repo) => repo.id === "repo_project_pool_pool").isPrimary,
      false,
    );
  });
});

test("contract-backed payload validation returns client errors", async () => {
  await withServer(async (baseUrl) => {
    const invalidRepoResponse = await fetch(`${baseUrl}/api/v1/projects/project_pool/repos`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "pool-docs",
        slug: "pool-docs",
        localPath: "/workspace/pool/docs",
        isPrimary: "yes",
      }),
    });
    const invalidRepoBody = await invalidRepoResponse.json();

    const invalidTicketResponse = await fetch(
      `${baseUrl}/api/v1/projects/project_pool/tickets/ticket_project_pool_2`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ priority: "critical" }),
      },
    );
    const invalidTicketBody = await invalidTicketResponse.json();

    assert.equal(invalidRepoResponse.status, 400);
    assert.match(invalidRepoBody.message, /isPrimary must be a boolean/);
    assert.equal(invalidTicketResponse.status, 400);
    assert.match(invalidTicketBody.message, /Invalid ticket priority/);
  });
});

test("ticket creation and transition flow works end-to-end", async () => {
  await withServer(async (baseUrl) => {
    const createdResponse = await fetch(`${baseUrl}/api/v1/projects/project_pool/tickets`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Add integration tests",
        brief: "Create API integration coverage.",
        state: "READY",
        assignedRole: "developer",
        repoTargets: [{ repoId: "repo_project_pool_pool", baseRef: "main" }],
      }),
    });
    const createdBody = await createdResponse.json();

    const transitionedResponse = await fetch(
      `${baseUrl}/api/v1/projects/project_pool/tickets/${createdBody.ticket.id}/transition`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetState: "WORKING",
          reason: "Developer lane started.",
        }),
      },
    );
    const transitionedBody = await transitionedResponse.json();

    assert.equal(createdResponse.status, 201);
    assert.equal(transitionedResponse.status, 200);
    assert.equal(transitionedBody.ticket.state, "WORKING");
    assert.equal(transitionedBody.ticket.events.at(-1).type, "ticket.transitioned");
  });
});

test("ticket detail can be patched through the API", async () => {
  await withServer(async (baseUrl) => {
    const repoResponse = await fetch(`${baseUrl}/api/v1/projects/project_pool/repos`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "pool-docs",
        slug: "pool-docs",
        localPath: "/workspace/pool/docs",
        defaultBranch: "trunk",
      }),
    });
    const repoBody = await repoResponse.json();

    const response = await fetch(`${baseUrl}/api/v1/projects/project_pool/tickets/ticket_project_pool_2`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "Define operator transport contracts",
        parentTicketId: "ticket_project_pool_1",
        latestSummary: "Updated from mission control",
        acceptanceCriteriaMd: "- edit ticket detail\n- persist changes",
        repoTargets: [
          {
            repoId: repoBody.repo.id,
            targetScopeMd: "Docs and operator workflow notes",
          },
        ],
      }),
    });
    const body = await response.json();

    assert.equal(repoResponse.status, 201);
    assert.equal(response.status, 200);
    assert.equal(body.ticket.title, "Define operator transport contracts");
    assert.equal(body.ticket.parentTicketId, "ticket_project_pool_1");
    assert.equal(body.ticket.latestSummary, "Updated from mission control");
    assert.match(body.ticket.acceptanceCriteriaMd, /persist changes/);
    assert.equal(body.ticket.repoTargets.length, 1);
    assert.equal(body.ticket.repoTargets[0].repoId, repoBody.repo.id);
    assert.equal(body.ticket.repoTargets[0].baseRef, "trunk");
    assert.match(body.ticket.repoTargets[0].targetScopeMd, /Docs and operator workflow notes/);
    assert.equal(body.ticket.events.at(-1).type, "ticket.updated");
  });
});

test("ticket patch rejects repo targets outside the project", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/projects/project_pool/tickets/ticket_project_pool_2`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        repoTargets: [{ repoId: "repo_does_not_exist" }],
      }),
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.match(body.message, /Unknown repo target/);
  });
});

test("ticket patch rejects invalid parent ticket changes", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/projects/project_pool/tickets/ticket_project_pool_2`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        parentTicketId: "ticket_project_pool_2",
      }),
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.match(body.message, /A ticket cannot parent itself/);
  });
});

test("dependency endpoints project ticket blockers and removal", async () => {
  await withServer(async (baseUrl) => {
    const addedResponse = await fetch(
      `${baseUrl}/api/v1/projects/project_pool/tickets/ticket_project_pool_2/dependencies`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          blockingTicketId: "ticket_project_pool_1",
          dependencyType: "finish_to_start",
        }),
      },
    );
    const addedBody = await addedResponse.json();

    assert.equal(addedResponse.status, 200);
    assert.equal(addedBody.ticket.dependencies.length, 1);
    assert.equal(addedBody.ticket.dependencies[0].blockingTicketTitle, "Stand up real API service skeleton");

    const removedResponse = await fetch(
      `${baseUrl}/api/v1/projects/project_pool/tickets/ticket_project_pool_2/dependencies/${addedBody.ticket.dependencies[0].id}`,
      {
        method: "DELETE",
      },
    );
    const removedBody = await removedResponse.json();

    assert.equal(removedResponse.status, 200);
    assert.equal(removedBody.ticket.dependencies.length, 0);
    assert.equal(removedBody.ticket.events.at(-1).type, "dependency.removed");
  });
});

test("dependency endpoint rejects missing blocker tickets with not found", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/api/v1/projects/project_pool/tickets/ticket_project_pool_2/dependencies`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          blockingTicketId: "ticket_does_not_exist",
          dependencyType: "finish_to_start",
        }),
      },
    );
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.equal(body.error, "not_found");
  });
});

test("API exposes a live SSE event stream for project activity", async () => {
  await withServer(async (baseUrl) => {
    const abortController = new AbortController();
    const response = await fetch(`${baseUrl}/api/v1/projects/project_pool/events/stream?limit=10`, {
      signal: abortController.signal,
    });

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/event-stream/);

    const reader = response.body.getReader();
    const initialChunk = await readStreamChunk(reader);
    assert.match(initialChunk, /event: snapshot/);
    const initialSnapshot = parseFirstSsePayload(initialChunk);
    assert.equal(initialSnapshot.events[0].family.length > 0, true);
    assert.equal(initialSnapshot.events[0].lane.length > 0, true);
    assert.match(initialSnapshot.events[0].cursor, /:/);
    assert.equal(typeof initialSnapshot.events[0].reasonCode, "string");

    await fetch(`${baseUrl}/api/v1/projects/project_pool/tickets/ticket_project_pool_2/transition`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        targetState: "WORKING",
        reason: "Drive a live event for the stream.",
      }),
    });

    const nextChunk = await readStreamUntil(reader, /ticket\.transitioned|WORKING/);
    assert.match(nextChunk, /event: event/);
    assert.match(nextChunk, /ticket\.transitioned/);
    const nextEvent = parseLastSsePayload(nextChunk);
    assert.equal(nextEvent.family, "ticket");
    assert.equal(nextEvent.action, "transitioned");
    assert.equal(nextEvent.lane, "ticket");
    assert.equal(typeof nextEvent.reasonCode, "string");

    abortController.abort();
  });
});

function findColumn(columns, state) {
  return columns.find((column) => column.state === state);
}

async function readStreamChunk(reader) {
  const { value, done } = await reader.read();
  assert.equal(done, false);
  return new TextDecoder().decode(value);
}

async function readStreamUntil(reader, pattern, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  let text = "";
  while (Date.now() < deadline) {
    text += await readStreamChunk(reader);
    if (pattern.test(text)) {
      return text;
    }
  }
  throw new Error(`Timed out waiting for stream pattern: ${pattern}`);
}

function parseFirstSsePayload(text) {
  const match = text.match(/data: (.+)/);
  assert.ok(match);
  return JSON.parse(match[1]);
}

function parseLastSsePayload(text) {
  const matches = [...text.matchAll(/data: (.+)/g)];
  assert.ok(matches.length > 0);
  return JSON.parse(matches.at(-1)[1]);
}
