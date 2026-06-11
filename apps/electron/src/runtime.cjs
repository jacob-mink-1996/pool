const http = require("node:http");
const { existsSync } = require("node:fs");
const path = require("node:path");

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4318;
const HEALTH_TIMEOUT_MS = 10000;

function findRepoRoot(startDirectory) {
  let current = path.resolve(startDirectory);

  while (true) {
    if (
      existsSync(path.join(current, "package.json")) &&
      existsSync(path.join(current, "services", "api", "src", "app.mjs")) &&
      existsSync(path.join(current, "apps", "web-react"))
    ) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error(`Unable to locate Pool repository root from ${startDirectory}`);
    }
    current = parent;
  }
}

function resolveHost(value = process.env.POOL_HOST) {
  return value || DEFAULT_HOST;
}

function resolvePort(value = process.env.POOL_PORT) {
  if (!value) {
    return DEFAULT_PORT;
  }

  const port = Number.parseInt(value, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid POOL_PORT value: ${value}`);
  }
  return port;
}

function createDesktopEnvironment({ userDataPath, env = process.env }) {
  return {
    ...env,
    POOL_HOST: resolveHost(env.POOL_HOST),
    POOL_PORT: String(resolvePort(env.POOL_PORT)),
    POOL_DB_PATH: env.POOL_DB_PATH || path.join(userDataPath, "pool.sqlite"),
    POOL_DESKTOP: "true",
  };
}

function waitForHealth({ host, port, timeoutMs = HEALTH_TIMEOUT_MS }) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const attempt = () => {
      const request = http.get(
        {
          host,
          port,
          path: "/api/v1/health",
          timeout: 1000,
        },
        (response) => {
          response.resume();
          if (response.statusCode === 200) {
            resolve();
            return;
          }
          retryOrReject(new Error(`Pool API health returned ${response.statusCode}`));
        },
      );

      request.on("timeout", () => {
        request.destroy(new Error("Pool API health request timed out"));
      });
      request.on("error", retryOrReject);
    };

    const retryOrReject = (error) => {
      if (Date.now() - startedAt >= timeoutMs) {
        reject(error);
        return;
      }
      setTimeout(attempt, 150);
    };

    attempt();
  });
}

module.exports = {
  DEFAULT_HOST,
  DEFAULT_PORT,
  HEALTH_TIMEOUT_MS,
  createDesktopEnvironment,
  findRepoRoot,
  resolveHost,
  resolvePort,
  waitForHealth,
};
