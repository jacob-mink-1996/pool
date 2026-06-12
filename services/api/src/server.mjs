import { createPoolServer } from "./app.mjs";
import { createCeremonyAutomationDriver } from "./ceremony-automation-driver.mjs";
import { createCeremonyParticipantDriver } from "./ceremony-participant-driver.mjs";
import { createExecutionDriver } from "./execution-driver.mjs";
import { createMergeDriver } from "./merge-driver.mjs";
import { createStore } from "./store.mjs";

const host = process.env.POOL_HOST || "127.0.0.1";
const port = Number.parseInt(process.env.POOL_PORT || "4318", 10);
const store = createStore();
const server = createPoolServer({ store, host, port });
const driver = createExecutionDriver({
  store,
  pollIntervalMs: Number.parseInt(process.env.POOL_EXECUTION_POLL_MS || "2000", 10),
});
const mergeDriver = createMergeDriver({
  store,
  pollIntervalMs: Number.parseInt(process.env.POOL_MERGE_POLL_MS || "2000", 10),
});
const ceremonyAutomationDriver = createCeremonyAutomationDriver({
  store,
  pollIntervalMs: Number.parseInt(process.env.POOL_CEREMONY_POLL_MS || "30000", 10),
});
const ceremonyParticipantDriver = createCeremonyParticipantDriver({
  store,
  pollIntervalMs: Number.parseInt(process.env.POOL_CEREMONY_PARTICIPANT_POLL_MS || "2000", 10),
  maxParallel: Number.parseInt(process.env.POOL_CEREMONY_PARTICIPANT_MAX_PARALLEL || "4", 10),
});

driver.start();
mergeDriver.start();
ceremonyAutomationDriver.start();
ceremonyParticipantDriver.start();

server.listen(port, host, () => {
  console.log(`Floop API listening on http://${host}:${port}`);
  console.log(`Floop SQLite database: ${process.env.POOL_DB_PATH || "default .pool/pool.sqlite"}`);
});

server.on("close", () => {
  driver.stop().catch((error) => {
    console.error("Floop execution driver stop failed", error);
  });
  mergeDriver.stop().catch((error) => {
    console.error("Floop merge driver stop failed", error);
  });
  ceremonyAutomationDriver.stop().catch((error) => {
    console.error("Floop ceremony automation driver stop failed", error);
  });
  ceremonyParticipantDriver.stop().catch((error) => {
    console.error("Floop ceremony participant driver stop failed", error);
  });
});
