import assert from "node:assert/strict";
import test from "node:test";

import { createCeremonyParticipantDriver } from "./ceremony-participant-driver.mjs";
import { createStore } from "./store.mjs";

test("ceremony participant driver runs participant fan-out and synthesizes consensus", async () => {
  const store = createStore({ filename: ":memory:", seedDemo: true });
  try {
    for (const role of ["product_manager", "developer"]) {
      store.updateRoleProfile("project_pool", role, {
        adapter: "mock",
        model: "fixture",
        config: {
          result: {
            outcome: "completed",
            summaryMd: `${role} ceremony advice`,
            questionsMd: `${role} question`,
            riskMd: `${role} risk`,
            payload: { role },
          },
        },
      });
    }
    const run = store.createCeremonyRun("project_pool", {
      type: "refinement",
      participantRoles: ["product_manager", "developer"],
      deciderRole: "product_manager",
      consensusPolicy: "decider_synthesizes_objections",
    });

    const driver = createCeremonyParticipantDriver({ store, logger: silentLogger(), maxParallel: 2 });
    await driver.pollOnce();

    const completed = store.getCeremonyRun("project_pool", run.id);
    const synthesis = completed.proposals.find((proposal) => proposal.summary.startsWith("Agent consensus:"));

    assert.equal(completed.participants.length, 2);
    assert.equal(completed.participants.every((participant) => participant.status === "completed"), true);
    assert.equal(completed.participants.find((participant) => participant.role === "developer").summaryMd, "developer ceremony advice");
    assert.ok(synthesis);
    assert.match(synthesis.payload.participantSummary, /product_manager ceremony advice/);
    assert.match(completed.summaryMd, /Agent consensus/);
  } finally {
    store.close();
  }
});

function silentLogger() {
  return {
    error() {},
    info() {},
    warn() {},
  };
}
