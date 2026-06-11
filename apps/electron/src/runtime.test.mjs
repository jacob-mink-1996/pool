import assert from "node:assert/strict";
import http from "node:http";
import { EventEmitter } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createDesktopEnvironment,
  findRepoRoot,
  resolveHost,
  resolvePort,
  waitForHealth,
} from "./runtime.cjs";

test("resolvePort validates explicit port input", () => {
  assert.equal(resolvePort("4321"), 4321);
  assert.throws(() => resolvePort("0"), /Invalid POOL_PORT/);
  assert.throws(() => resolvePort("abc"), /Invalid POOL_PORT/);
});

test("createDesktopEnvironment defaults to loopback API and user-data database", () => {
  const env = createDesktopEnvironment({
    userDataPath: "/tmp/pool-desktop",
    env: {},
  });

  assert.equal(env.POOL_HOST, "127.0.0.1");
  assert.equal(env.POOL_PORT, "4318");
  assert.equal(env.POOL_DB_PATH, "/tmp/pool-desktop/pool.sqlite");
  assert.equal(env.POOL_DESKTOP, "true");
});

test("createDesktopEnvironment preserves explicit API and database settings", () => {
  const env = createDesktopEnvironment({
    userDataPath: "/tmp/pool-desktop",
    env: {
      POOL_HOST: "localhost",
      POOL_PORT: "4444",
      POOL_DB_PATH: "/tmp/custom.sqlite",
    },
  });

  assert.equal(env.POOL_HOST, "localhost");
  assert.equal(env.POOL_PORT, "4444");
  assert.equal(env.POOL_DB_PATH, "/tmp/custom.sqlite");
});

test("findRepoRoot walks upward to the product root", async () => {
  const root = path.join(tmpdir(), `pool-electron-${Date.now()}`);
  const nested = path.join(root, "apps", "electron", "src");
  await mkdir(path.join(root, "services", "api", "src"), { recursive: true });
  await mkdir(path.join(root, "apps", "web-react"), { recursive: true });
  await mkdir(nested, { recursive: true });
  await writeFile(path.join(root, "package.json"), "{}");
  await writeFile(path.join(root, "services", "api", "src", "app.mjs"), "");

  assert.equal(findRepoRoot(nested), root);
});

test("waitForHealth resolves after the API returns healthy", async () => {
  const originalGet = http.get;
  let requestedPath = "";

  try {
    http.get = (options, callback) => {
      requestedPath = options.path;
      const request = new EventEmitter();
      request.setTimeout = () => request;
      request.destroy = (error) => request.emit("error", error);

      queueMicrotask(() => {
        const response = new EventEmitter();
        response.statusCode = 200;
        response.resume = () => {};
        callback(response);
      });

      return request;
    };

    await waitForHealth({ host: resolveHost(), port: 4318, timeoutMs: 1000 });
    assert.equal(requestedPath, "/api/v1/health");
  } finally {
    http.get = originalGet;
  }
});
