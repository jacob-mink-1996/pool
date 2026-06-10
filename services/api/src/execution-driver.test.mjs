import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createExecutionDriver } from "./execution-driver.mjs";
import { createStore } from "./store.mjs";

test("execution driver runs configured adapter commands and persists completion evidence", async () => {
  const fixtureDir = mkdtempSync(join(tmpdir(), "pool-driver-"));
  const workspaceRoot = join(fixtureDir, "workspace");
  const store = createStore({
    filename: join(fixtureDir, "pool.sqlite"),
    seedDemo: true,
    workspaceRoot,
  });

  try {
    store.updateRoleProfile("project_pool", "developer", {
      adapter: "shell",
      model: "fixture",
      config: {
        command: `"${process.execPath}" -e "const fs=require('node:fs'); fs.writeFileSync(process.env.POOL_RESULT_PATH, JSON.stringify({ outcome: 'completed', summaryMd: 'Driver landed the ticket.' })); console.log('driver stdout ok')"`,
      },
    });

    const execution = store.createExecution("project_pool", "ticket_project_pool_2", {
      role: "developer",
      reason: "Run through the background driver.",
    });
    const driver = createExecutionDriver({ store, logger: silentLogger() });

    await driver.pollOnce();

    const completed = store.getExecution("project_pool", execution.id);
    const ticket = store.getTicket("project_pool", "ticket_project_pool_2");
    const stdoutArtifact = completed.artifacts.find((artifact) => artifact.label === "Adapter stdout");

    assert.equal(completed.outcome, "completed");
    assert.equal(completed.ticketState, "REVIEWING");
    assert.equal(ticket.state, "REVIEWING");
    assert.equal(existsSync(execution.worktrees[0].path), true);
    assert.ok(stdoutArtifact);
    assert.match(readFileSync(new URL(stdoutArtifact.uri), "utf8"), /driver stdout ok/);
  } finally {
    store.close();
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test("execution driver can launch the codex adapter path and persist the final agent message", async () => {
  const fixtureDir = mkdtempSync(join(tmpdir(), "pool-codex-driver-"));
  const workspaceRoot = join(fixtureDir, "workspace");
  const fakeCodexPath = join(fixtureDir, "fake-codex.js");
  const store = createStore({
    filename: join(fixtureDir, "pool.sqlite"),
    seedDemo: true,
    workspaceRoot,
  });

  writeFileSync(
    fakeCodexPath,
    `#!/usr/bin/env node
const fs = require("node:fs");
const outputIndex = process.argv.indexOf("-o");
const outputFile = outputIndex >= 0 ? process.argv[outputIndex + 1] : "";
let prompt = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  prompt += chunk;
});
process.stdin.on("end", () => {
  fs.writeFileSync(
    process.env.POOL_RESULT_PATH,
    JSON.stringify({
      outcome: "completed",
      summaryMd: prompt.includes(process.env.POOL_TICKET_KEY)
        ? "Codex adapter completed the ticket."
        : "Prompt missing ticket key.",
    }),
  );
  if (outputFile) {
    fs.writeFileSync(outputFile, "Final agent message from fake codex.");
  }
  process.stdout.write("fake codex stdout\\n");
});
`,
    { encoding: "utf8", mode: 0o755 },
  );

  try {
    store.updateRoleProfile("project_pool", "developer", {
      adapter: "codex",
      model: "codex-latest",
      config: {
        executable: fakeCodexPath,
        promptPreamble: "Focus on the Pool governed loop.",
      },
    });

    const execution = store.createExecution("project_pool", "ticket_project_pool_2", {
      role: "developer",
      reason: "Run through the codex adapter path.",
    });
    const driver = createExecutionDriver({ store, logger: silentLogger() });

    await driver.pollOnce();

    const completed = store.getExecution("project_pool", execution.id);
    const ticket = store.getTicket("project_pool", "ticket_project_pool_2");
    const finalMessageArtifact = completed.artifacts.find((artifact) => artifact.label === "Agent final message");
    const stdoutArtifact = completed.artifacts.find((artifact) => artifact.label === "Adapter stdout");

    assert.equal(completed.outcome, "completed");
    assert.equal(completed.summaryMd, "Codex adapter completed the ticket.");
    assert.equal(completed.ticketState, "REVIEWING");
    assert.equal(ticket.state, "REVIEWING");
    assert.ok(finalMessageArtifact);
    assert.ok(stdoutArtifact);
    assert.match(readFileSync(new URL(finalMessageArtifact.uri), "utf8"), /Final agent message/);
    assert.match(readFileSync(new URL(stdoutArtifact.uri), "utf8"), /fake codex stdout/);
  } finally {
    store.close();
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test("execution driver can persist embedded review evidence from the codex reviewer lane", async () => {
  const fixtureDir = mkdtempSync(join(tmpdir(), "pool-reviewer-codex-driver-"));
  const workspaceRoot = join(fixtureDir, "workspace");
  const fakeCodexPath = join(fixtureDir, "fake-reviewer-codex.js");
  const store = createStore({
    filename: join(fixtureDir, "pool.sqlite"),
    seedDemo: true,
    workspaceRoot,
  });

  writeFileSync(
    fakeCodexPath,
    `#!/usr/bin/env node
const fs = require("node:fs");
const outputIndex = process.argv.indexOf("-o");
const outputFile = outputIndex >= 0 ? process.argv[outputIndex + 1] : "";
let prompt = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  prompt += chunk;
});
process.stdin.on("end", () => {
  fs.writeFileSync(
    process.env.POOL_RESULT_PATH,
    JSON.stringify({
      outcome: "completed",
      summaryMd: "Reviewer execution completed.",
      review: {
        verdict: "passed",
        summaryMd: "No blocking issues found.",
        findings: [],
        artifacts: [{ kind: "report", label: "Reviewer notes", uri: "file:///tmp/reviewer-notes.md" }]
      }
    }),
  );
  if (outputFile) {
    fs.writeFileSync(outputFile, "Reviewer final message from fake codex.");
  }
  process.stdout.write(prompt.includes("review.verdict") ? "review contract present\\n" : "review contract missing\\n");
});
`,
    { encoding: "utf8", mode: 0o755 },
  );

  try {
    store.updateRoleProfile("project_pool", "reviewer", {
      adapter: "codex",
      model: "codex-latest",
      config: {
        executable: fakeCodexPath,
      },
    });

    const implementation = store.createExecution("project_pool", "ticket_project_pool_2", {
      role: "developer",
      reason: "Finish implementation before reviewer lane.",
    });
    store.completeExecution("project_pool", implementation.id, {
      outcome: "completed",
      summaryMd: "Implementation completed for reviewer test.",
    });

    const reviewerExecution = store
      .getTicket("project_pool", "ticket_project_pool_2")
      .executions.find((execution) => execution.role === "reviewer");
    assert.ok(reviewerExecution);

    const driver = createExecutionDriver({ store, logger: silentLogger() });
    await driver.pollOnce();

    const ticket = store.getTicket("project_pool", "ticket_project_pool_2");
    const completed = store.getExecution("project_pool", reviewerExecution.id);
    const stdoutArtifact = completed.artifacts.find((artifact) => artifact.label === "Adapter stdout");
    const promptPath = join(workspaceRoot, ".pool", "executions", reviewerExecution.id, "prompt.md");

    assert.equal(completed.outcome, "completed");
    assert.equal(ticket.reviews.length, 1);
    assert.equal(ticket.reviews[0].verdict, "passed");
    assert.equal(ticket.reviews[0].artifacts[0].label, "Reviewer notes");
    assert.match(readFileSync(new URL(stdoutArtifact.uri), "utf8"), /review contract present/);
    assert.match(readFileSync(promptPath, "utf8"), /review\.verdict: one of passed, rework, blocked/);
  } finally {
    store.close();
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test("execution driver can persist embedded validation evidence from the validator lane", async () => {
  const fixtureDir = mkdtempSync(join(tmpdir(), "pool-validator-driver-"));
  const workspaceRoot = join(fixtureDir, "workspace");
  const store = createStore({
    filename: join(fixtureDir, "pool.sqlite"),
    seedDemo: true,
    workspaceRoot,
  });

  try {
    store.updateProjectPolicy("project_pool", {
      requireReviewer: false,
      requireValidator: true,
    });
    store.updateRoleProfile("project_pool", "validator", {
      adapter: "shell",
      model: "fixture",
      config: {
        command: `"${process.execPath}" -e "const fs=require('node:fs'); fs.writeFileSync(process.env.POOL_RESULT_PATH, JSON.stringify({ outcome: 'completed', summaryMd: 'Validator execution completed.', validation: { verdict: 'passed', summaryMd: 'Validation checks passed.', commandProfile: 'ci', commands: ['npm test'], repoIds: ['repo_project_pool_pool'], artifacts: [{ kind: 'log', label: 'Validation output', uri: 'file:///tmp/validation-output.log' }] } }));"`,
      },
    });

    const implementation = store.createExecution("project_pool", "ticket_project_pool_2", {
      role: "developer",
      reason: "Finish implementation before validator lane.",
    });
    store.completeExecution("project_pool", implementation.id, {
      outcome: "completed",
      summaryMd: "Implementation completed for validator test.",
    });

    const validatorExecution = store
      .getTicket("project_pool", "ticket_project_pool_2")
      .executions.find((execution) => execution.role === "validator");
    assert.ok(validatorExecution);

    const driver = createExecutionDriver({ store, logger: silentLogger() });
    await driver.pollOnce();

    const ticket = store.getTicket("project_pool", "ticket_project_pool_2");
    const completed = store.getExecution("project_pool", validatorExecution.id);

    assert.equal(completed.outcome, "completed");
    assert.equal(ticket.validations.length, 1);
    assert.equal(ticket.validations[0].verdict, "passed");
    assert.deepEqual(ticket.validations[0].commands, ["npm test"]);
    assert.equal(ticket.validations[0].artifacts[0].label, "Validation output");
    assert.equal(ticket.state, "READY_TO_MERGE");
  } finally {
    store.close();
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test("execution driver materializes a real git worktree when the target repo exists", async () => {
  const fixtureDir = mkdtempSync(join(tmpdir(), "pool-git-worktree-"));
  const workspaceRoot = join(fixtureDir, "workspace");
  const repoRoot = join(fixtureDir, "repo");
  const store = createStore({
    filename: join(fixtureDir, "pool.sqlite"),
    seedDemo: true,
    workspaceRoot,
  });

  try {
    execFileSync("git", ["init", "-b", "main", repoRoot]);
    execFileSync("git", ["-C", repoRoot, "config", "user.name", "Pool Test"]);
    execFileSync("git", ["-C", repoRoot, "config", "user.email", "pool@example.com"]);
    writeFileSync(join(repoRoot, "README.md"), "# Pool Repo\n", "utf8");
    execFileSync("git", ["-C", repoRoot, "add", "README.md"]);
    execFileSync("git", ["-C", repoRoot, "commit", "-m", "seed repo"]);

    store.updateRepo("project_pool", "repo_project_pool_pool", {
      name: "pool",
      localPath: repoRoot,
      remoteUrl: "",
      defaultBranch: "main",
      isPrimary: true,
    });
    store.updateRoleProfile("project_pool", "developer", {
      adapter: "shell",
      model: "fixture",
      config: {
        command: `"${process.execPath}" -e "const fs=require('node:fs'); fs.writeFileSync(process.env.POOL_RESULT_PATH, JSON.stringify({ outcome: 'completed', summaryMd: 'Git-backed worktree executed.' }));"`,
      },
    });

    const execution = store.createExecution("project_pool", "ticket_project_pool_2", {
      role: "developer",
      reason: "Verify git-backed worktree materialization.",
    });
    const driver = createExecutionDriver({ store, logger: silentLogger() });

    await driver.pollOnce();

    assert.equal(existsSync(join(execution.worktrees[0].path, "README.md")), true);
    assert.equal(existsSync(join(execution.worktrees[0].path, ".git")), true);
  } finally {
    store.close();
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test("execution driver reconciles interrupted active executions on startup", async () => {
  const fixtureDir = mkdtempSync(join(tmpdir(), "pool-driver-reconcile-"));
  const workspaceRoot = join(fixtureDir, "workspace");
  const store = createStore({
    filename: join(fixtureDir, "pool.sqlite"),
    seedDemo: true,
    workspaceRoot,
  });

  try {
    const execution = store.createExecution("project_pool", "ticket_project_pool_2", {
      role: "developer",
      reason: "Run before a simulated restart.",
    });
    const driver = createExecutionDriver({ store, logger: silentLogger() });

    await driver.reconcileOnStart();

    const recovered = store.getExecution("project_pool", execution.id);
    assert.equal(recovered.outcome, "failed");
    assert.equal(recovered.failureKind, "interrupted");
    assert.match(recovered.summaryMd, /recovered after restart/i);
  } finally {
    store.close();
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

function silentLogger() {
  return {
    error() {},
    info() {},
  };
}
