import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createStore } from "../src/store.mjs";

test("SQLite store persists ticket state and board aggregates across reopen", () => {
  const fixtureDir = mkdtempSync(join(tmpdir(), "pool-store-"));
  const filename = join(fixtureDir, "pool.sqlite");

  try {
    const store = createStore({
      filename,
      seedDemo: true,
      workspaceRoot: "/workspace/pool",
    });

    const createdTicket = store.createTicket("project_pool", {
      title: "Implement board read model",
      brief: "Add grouped project board aggregates for the operator UI.",
      state: "PROPOSED",
      priority: "high",
      assignedRole: "developer",
      repoTargets: [
        {
          repoId: "repo_project_pool_pool",
          baseRef: "main",
          branchName: "pool-3-board-aggregate",
          targetScopeMd: "services/api read models",
        },
      ],
    });

    store.transitionTicket("project_pool", createdTicket.id, {
      targetState: "WORKING",
      reason: "Picked up for the next MVP implementation pass.",
    });

    const boardBeforeClose = store.getProjectBoard("project_pool");
    const workingColumnBeforeClose = boardBeforeClose.columns.find((column) => column.state === "WORKING");
    assert.equal(workingColumnBeforeClose.count, 2);

    store.close();

    const reopenedStore = createStore({
      filename,
      seedDemo: false,
      workspaceRoot: "/workspace/pool",
    });

    const filteredTickets = reopenedStore.listTickets("project_pool", {
      states: ["WORKING"],
      search: "board read model",
    });
    assert.equal(filteredTickets.length, 1);
    assert.equal(filteredTickets[0].key, "POOL-3");
    assert.equal(filteredTickets[0].repoCount, 1);

    const persistedTicket = reopenedStore.getTicket("project_pool", createdTicket.id);
    assert.equal(persistedTicket.state, "WORKING");
    assert.equal(persistedTicket.events.length, 2);
    assert.equal(persistedTicket.repoTargets[0].repoName, "pool");

    reopenedStore.close();
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});
