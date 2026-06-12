import assert from "node:assert/strict";
import test from "node:test";
import {
  createAllWorkers,
  createCeremonyParticipantWorker,
  createExecutionWorker,
  createMergeWorker,
  parsePositiveIntegerEnv,
} from "./worker-runtime.mjs";

test("worker runtime parses positive integer environment values", () => {
  const previous = process.env.FLOOP_TEST_INTEGER;
  try {
    delete process.env.FLOOP_TEST_INTEGER;
    assert.equal(parsePositiveIntegerEnv("FLOOP_TEST_INTEGER", 42), 42);
    process.env.FLOOP_TEST_INTEGER = "250";
    assert.equal(parsePositiveIntegerEnv("FLOOP_TEST_INTEGER", 42), 250);
    process.env.FLOOP_TEST_INTEGER = "0";
    assert.throws(() => parsePositiveIntegerEnv("FLOOP_TEST_INTEGER", 42), /Invalid FLOOP_TEST_INTEGER/);
  } finally {
    if (previous === undefined) {
      delete process.env.FLOOP_TEST_INTEGER;
    } else {
      process.env.FLOOP_TEST_INTEGER = previous;
    }
  }
});

test("worker factories build named drivers against the provided store", () => {
  const store = stubStore();
  const execution = createExecutionWorker({ store });
  const merge = createMergeWorker({ store });
  const participant = createCeremonyParticipantWorker({ store });

  assert.equal(execution.name, "execution");
  assert.equal(merge.name, "merge");
  assert.equal(participant.name, "ceremony-participant");
  assert.equal(execution.store, store);
  assert.equal(merge.store, store);
  assert.equal(participant.store, store);
  assert.equal(typeof execution.driver.start, "function");
  assert.equal(typeof execution.driver.stop, "function");
});

test("all-worker factory shares one store across worker drivers", () => {
  const store = stubStore();
  const workers = createAllWorkers({ store });

  assert.deepEqual(workers.map((worker) => worker.name), [
    "execution",
    "merge",
    "ceremony-automation",
    "ceremony-participant",
  ]);
  assert.equal(workers.every((worker) => worker.store === store), true);
});

function stubStore() {
  return {
    close() {},
    reconcileActiveExecutions() {
      return [];
    },
    reconcileActiveMergeRuns() {
      return [];
    },
    listProjects() {
      return [];
    },
    listActiveExecutions() {
      return [];
    },
    listMergeQueue() {
      return [];
    },
    listPendingCeremonyParticipants() {
      return [];
    },
  };
}
