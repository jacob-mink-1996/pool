import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createExecutionDriver } from "./execution-driver.mjs";
import { createMergeDriver } from "./merge-driver.mjs";
import { createStore } from "./store.mjs";

test("merge driver auto-merges merge-ready tickets without human approval", async () => {
  const fixtureDir = mkdtempSync(join(tmpdir(), "pool-merge-driver-"));
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
    store.updateProjectPolicy("project_pool", {
      requireReviewer: false,
      requireValidator: false,
      requireHumanApprovalBeforeMerge: false,
    });
    store.updateRoleProfile("project_pool", "developer", {
      adapter: "shell",
      model: "fixture",
      config: {
        command: `"${process.execPath}" -e "const fs=require('node:fs'); const {execFileSync}=require('node:child_process'); const path=require('node:path'); const worktree=process.env.POOL_WORKTREE_PATH; const filename=path.join(worktree, 'feature.txt'); fs.writeFileSync(filename, 'merge me\\n'); execFileSync('git', ['-C', worktree, 'add', 'feature.txt']); execFileSync('git', ['-C', worktree, 'commit', '-m', 'Implement feature']); fs.writeFileSync(process.env.POOL_RESULT_PATH, JSON.stringify({ outcome: 'completed', summaryMd: 'Implementation completed and committed.' }));"`,
      },
    });

    const execution = store.createExecution("project_pool", "ticket_project_pool_2", {
      role: "developer",
      reason: "Prepare merge-ready implementation.",
    });

    const executionDriver = createExecutionDriver({ store, logger: silentLogger() });
    await executionDriver.pollOnce();

    const readyTicket = store.getTicket("project_pool", "ticket_project_pool_2");
    assert.equal(readyTicket.state, "READY_TO_MERGE");

    const mergeDriver = createMergeDriver({ store, logger: silentLogger() });
    await mergeDriver.pollOnce();

    const mergedTicket = store.getTicket("project_pool", "ticket_project_pool_2");
    const mergeArtifact = mergedTicket.mergeStatus.latestRun.artifacts.find((artifact) =>
      artifact.label.includes("merge candidate"),
    );

    assert.equal(mergedTicket.state, "DONE");
    assert.equal(mergedTicket.mergeStatus.latestRun.status, "completed");
    assert.equal(mergedTicket.mergeStatus.latestRun.approvedByRef, "pool-auto");
    assert.ok(mergeArtifact);

    const mergeSummary = JSON.parse(readFileSync(new URL(mergeArtifact.uri), "utf8"));
    assert.equal(mergeSummary.repoSlug, "pool");
    assert.equal(mergeSummary.baseRef, "main");
    assert.equal(mergeSummary.sourceBranch, execution.worktrees[0].branchName);
    assert.deepEqual(mergeSummary.changedFiles, ["feature.txt"]);
  } finally {
    store.close();
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

test("merge driver reconciles interrupted active merge runs on startup", async () => {
  const fixtureDir = mkdtempSync(join(tmpdir(), "pool-merge-driver-reconcile-"));
  const workspaceRoot = join(fixtureDir, "workspace");
  const store = createStore({
    filename: join(fixtureDir, "pool.sqlite"),
    seedDemo: true,
    workspaceRoot,
  });

  try {
    store.updateProjectPolicy("project_pool", {
      requireReviewer: false,
      requireValidator: false,
      requireHumanApprovalBeforeMerge: false,
    });
    const execution = store.createExecution("project_pool", "ticket_project_pool_2", {
      role: "developer",
      reason: "Prepare a merge-ready ticket for recovery test.",
    });
    store.completeExecution("project_pool", execution.id, {
      outcome: "completed",
      summaryMd: "Implementation completed for merge recovery.",
    });
    store.startMergeRun("project_pool", "ticket_project_pool_2", {
      strategy: "squash",
      approvedByKind: "system",
      approvedByRef: "pool-auto",
      claimToken: "merge-worker",
    });

    const driver = createMergeDriver({ store, logger: silentLogger() });
    await driver.reconcileOnStart();

    const mergeStatus = store.getMergeStatus("project_pool", "ticket_project_pool_2");
    const ticket = store.getTicket("project_pool", "ticket_project_pool_2");
    assert.equal(mergeStatus.latestRun.status, "blocked");
    assert.equal(ticket.events.at(-1).reasonCode, "interrupted");
  } finally {
    store.close();
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

function silentLogger() {
  return {
    error() {},
  };
}
