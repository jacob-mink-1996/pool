import test from "node:test";
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { createPoolServer } from "../services/api/src/app.mjs";
import { createStore } from "../services/api/src/store.mjs";

const execFileAsync = promisify(execFile);

async function withServer(run, options = {}) {
  const fixtureDir = mkdtempSync(join(tmpdir(), "pool-bootstrap-script-"));
  const store = createStore({
    filename: join(fixtureDir, "pool.sqlite"),
    seedDemo: options.seedDemo ?? false,
    workspaceRoot: options.workspaceRoot || join(fixtureDir, "workspace"),
  });
  const server = createPoolServer({ store });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();

  try {
    await run({
      fixtureDir,
      baseUrl: `http://127.0.0.1:${address.port}`,
    });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    store.close();
    rmSync(fixtureDir, { recursive: true, force: true });
  }
}

test("bootstrap-project script creates a runnable local project setup", async () => {
  await withServer(async ({ fixtureDir, baseUrl }) => {
    const repoRoot = join(fixtureDir, "client-zero");
    execFileSync("git", ["init", "-b", "main", repoRoot]);
    execFileSync("git", ["-C", repoRoot, "config", "user.name", "Pool Test"]);
    execFileSync("git", ["-C", repoRoot, "config", "user.email", "pool@example.com"]);
    writeFileSync(join(repoRoot, "README.md"), "# Client Zero\n", "utf8");
    execFileSync("git", ["-C", repoRoot, "add", "README.md"]);
    execFileSync("git", ["-C", repoRoot, "commit", "-m", "seed repo"]);

    const { stdout: output } = await execFileAsync(
      process.execPath,
      [
        "scripts/bootstrap-project.mjs",
        "--base-url",
        baseUrl,
        "--repo-path",
        repoRoot,
        "--project-name",
        "Client Zero",
        "--project-slug",
        "client-zero",
        "--default-branch",
        "main",
        "--ci-command",
        "npm test",
      ],
      {
        cwd: process.cwd(),
        encoding: "utf8",
      },
    );

    assert.match(output, /Bootstrapped Pool project Client Zero/);

    const projects = await fetch(`${baseUrl}/api/v1/projects`);
    const projectsBody = await projects.json();
    assert.equal(projectsBody.projects.length, 1);
    assert.equal(projectsBody.projects[0].slug, "client-zero");

    const projectId = projectsBody.projects[0].id;
    const repos = await fetch(`${baseUrl}/api/v1/projects/${projectId}/repos`);
    const reposBody = await repos.json();
    assert.equal(reposBody.repos.length, 1);
    assert.equal(reposBody.repos[0].localPath, repoRoot);
    assert.equal(reposBody.repos[0].isPrimary, true);

    const policy = await fetch(`${baseUrl}/api/v1/projects/${projectId}/policy`);
    const policyBody = await policy.json();
    assert.equal(policyBody.policy.requireReviewer, true);
    assert.equal(policyBody.policy.requireValidator, true);
    assert.equal(policyBody.policy.requireHumanApprovalBeforeMerge, false);
    assert.equal(policyBody.policy.requiredValidationCommandProfileForMerge, "ci");
    assert.equal(policyBody.policy.agentCreatedTicketDefaultState, "READY");

    const profiles = await fetch(`${baseUrl}/api/v1/projects/${projectId}/agent-profiles`);
    const profilesBody = await profiles.json();
    const reviewer = profilesBody.profiles.find((profile) => profile.role === "reviewer");
    const validator = profilesBody.profiles.find((profile) => profile.role === "validator");
    assert.equal(reviewer.adapter, "codex");
    assert.equal(validator.adapter, "shell");
    assert.match(validator.config.command, /POOL_CONTEXT_PATH/);
    assert.match(validator.config.command, /npm test/);
  });
});
