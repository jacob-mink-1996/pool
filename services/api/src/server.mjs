import { createFloopServer } from "./app.mjs";
import { createStore } from "./store.mjs";

const host = process.env.FLOOP_HOST || "127.0.0.1";
const port = Number.parseInt(process.env.FLOOP_PORT || "4318", 10);
const store = createStore();
const server = createFloopServer({ store, host, port, authToken: process.env.FLOOP_AUTH_TOKEN || "" });

server.listen(port, host, () => {
  console.log(`Floop API listening on http://${host}:${port}`);
  console.log(`Floop SQLite database: ${process.env.FLOOP_DB_PATH || "default .floop/floop.sqlite"}`);
  console.log("Floop workers are not running in this API process; start them with `npm run start:workers`.");
});

server.on("close", () => {
  store.close?.();
});
