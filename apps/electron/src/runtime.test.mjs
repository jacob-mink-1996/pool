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
  assert.throws(() => resolvePort("0"), /Invalid FLOOP_PORT/);
  assert.throws(() => resolvePort("abc"), /Invalid FLOOP_PORT/);
});

test("createDesktopEnvironment defaults to loopback API and user-data database", () => {
  const env = createDesktopEnvironment({
    userDataPath: "/tmp/floop-desktop",
    env: {},
  });

  assert.equal(env.FLOOP_HOST, "127.0.0.1");
  assert.equal(env.FLOOP_PORT, "4318");
  assert.equal(env.FLOOP_DB_PATH, "/tmp/floop-desktop/floop.sqlite");
  assert.equal(env.FLOOP_DESKTOP, "true");
});

test("createDesktopEnvironment preserves explicit API and database settings", () => {
  const env = createDesktopEnvironment({
    userDataPath: "/tmp/floop-desktop",
    env: {
      FLOOP_HOST: "localhost",
      FLOOP_PORT: "4444",
      FLOOP_DB_PATH: "/tmp/custom.sqlite",
    },
  });

  assert.equal(env.FLOOP_HOST, "localhost");
  assert.equal(env.FLOOP_PORT, "4444");
  assert.equal(env.FLOOP_DB_PATH, "/tmp/custom.sqlite");
});

test("findRepoRoot walks upward to the product root", async () => {
  const root = path.join(tmpdir(), `floop-electron-${Date.now()}`);
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
