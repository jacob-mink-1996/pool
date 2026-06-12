import { createCeremonyAutomationDriver } from "./ceremony-automation-driver.mjs";
import { createCeremonyParticipantDriver } from "./ceremony-participant-driver.mjs";
import { createExecutionDriver } from "./execution-driver.mjs";
import { createMergeDriver } from "./merge-driver.mjs";
import { createStore } from "./store.mjs";

const KEEPALIVE_INTERVAL_MS = 2 ** 31 - 1;

export function parsePositiveIntegerEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${name} value: ${raw}`);
  }
  return parsed;
}

export function createWorkerStore(options = {}) {
  return options.store || createStore();
}

export function createExecutionWorker(options = {}) {
  const store = createWorkerStore(options);
  return {
    name: "execution",
    store,
    driver: createExecutionDriver({
      store,
      pollIntervalMs: parsePositiveIntegerEnv("FLOOP_EXECUTION_POLL_MS", 2000),
      logger: options.logger || console,
    }),
  };
}

export function createMergeWorker(options = {}) {
  const store = createWorkerStore(options);
  return {
    name: "merge",
    store,
    driver: createMergeDriver({
      store,
      pollIntervalMs: parsePositiveIntegerEnv("FLOOP_MERGE_POLL_MS", 2000),
      logger: options.logger || console,
    }),
  };
}

export function createCeremonyAutomationWorker(options = {}) {
  const store = createWorkerStore(options);
  return {
    name: "ceremony-automation",
    store,
    driver: createCeremonyAutomationDriver({
      store,
      pollIntervalMs: parsePositiveIntegerEnv("FLOOP_CEREMONY_POLL_MS", 30000),
      logger: options.logger || console,
    }),
  };
}

export function createCeremonyParticipantWorker(options = {}) {
  const store = createWorkerStore(options);
  return {
    name: "ceremony-participant",
    store,
    driver: createCeremonyParticipantDriver({
      store,
      pollIntervalMs: parsePositiveIntegerEnv("FLOOP_CEREMONY_PARTICIPANT_POLL_MS", 2000),
      maxParallel: parsePositiveIntegerEnv("FLOOP_CEREMONY_PARTICIPANT_MAX_PARALLEL", 4),
      logger: options.logger || console,
    }),
  };
}

export function createAllWorkers(options = {}) {
  const store = createWorkerStore(options);
  return [
    createExecutionWorker({ ...options, store }),
    createMergeWorker({ ...options, store }),
    createCeremonyAutomationWorker({ ...options, store }),
    createCeremonyParticipantWorker({ ...options, store }),
  ];
}

export function runWorkerProcess(workersOrFactory, options = {}) {
  const workers = typeof workersOrFactory === "function" ? workersOrFactory(options) : workersOrFactory;
  const workerList = Array.isArray(workers) ? workers : [workers];
  const stores = [...new Set(workerList.map((worker) => worker.store).filter(Boolean))];
  let stopping = false;

  for (const worker of workerList) {
    worker.driver.start();
  }

  const keepalive = setInterval(() => {}, KEEPALIVE_INTERVAL_MS);
  const names = workerList.map((worker) => worker.name).join(", ");
  console.log(`Floop worker process started: ${names}`);
  console.log(`Floop SQLite database: ${process.env.FLOOP_DB_PATH || "default .floop/floop.sqlite"}`);

  const stop = async (signal = "manual") => {
    if (stopping) return;
    stopping = true;
    clearInterval(keepalive);
    const results = await Promise.allSettled(workerList.map((worker) => worker.driver.stop()));
    for (const result of results) {
      if (result.status === "rejected") {
        console.error("Floop worker stop failed", result.reason);
      }
    }
    for (const store of stores) {
      store.close?.();
    }
    console.log(`Floop worker process stopped: ${signal}`);
  };

  process.once("SIGINT", () => {
    stop("SIGINT").finally(() => process.exit(0));
  });
  process.once("SIGTERM", () => {
    stop("SIGTERM").finally(() => process.exit(0));
  });

  return { workers: workerList, stop };
}
