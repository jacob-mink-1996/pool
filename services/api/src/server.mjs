import { createPoolServer } from "./app.mjs";
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

driver.start();
mergeDriver.start();

server.listen(port, host, () => {
  console.log(`Pool API listening on http://${host}:${port}`);
  console.log(`Pool SQLite database: ${process.env.POOL_DB_PATH || "default .pool/pool.sqlite"}`);
});

server.on("close", () => {
  driver.stop().catch((error) => {
    console.error("Pool execution driver stop failed", error);
  });
  mergeDriver.stop().catch((error) => {
    console.error("Pool merge driver stop failed", error);
  });
});
