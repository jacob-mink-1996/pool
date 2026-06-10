import { createPoolServer } from "./app.mjs";
import { createStore } from "./store.mjs";

const host = process.env.POOL_HOST || "127.0.0.1";
const port = Number.parseInt(process.env.POOL_PORT || "4318", 10);
const store = createStore();
const server = createPoolServer({ store, host, port });

server.listen(port, host, () => {
  console.log(`Pool API listening on http://${host}:${port}`);
  console.log(`Pool SQLite database: ${process.env.POOL_DB_PATH || "default .pool/pool.sqlite"}`);
});
