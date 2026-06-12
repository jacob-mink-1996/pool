import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = mkdtempSync(join(tmpdir(), "floop-mvp-verify-"));
const apiDbPath = join(fixtureRoot, "floop.sqlite");
const workspaceRoot = join(fixtureRoot, "workspace");
const targetRepoPath = join(fixtureRoot, "target-repo");
const port = Number.parseInt(process.env.FLOOP_PORT || String(4600 + Math.floor(Math.random() * 1000)), 10);
const baseUrl = process.env.FLOOP_BASE_URL || `http://127.0.0.1:${port}`;
const projectId = process.env.FLOOP_DEMO_PROJECT_ID || "project_floop";
const repeat = Math.max(1, Number.parseInt(process.env.FLOOP_MVP_REPEAT || "1", 10));
const keepFixture = process.env.FLOOP_VERIFY_KEEP_FIXTURE === "true";

let serverProcess = null;
let failed = false;

try {
  initializeTargetRepo(targetRepoPath);
  serverProcess = startServer({
    cwd: repoRoot,
    dbPath: apiDbPath,
    port,
  });

  await waitForHealth(baseUrl);
  await assertMissionControlServed(baseUrl);

  const project = await configureProject(baseUrl, projectId, targetRepoPath);
  const repo = project.repos[0];
  const streamController = new AbortController();
  const observedEvents = [];
  const streamPromise = watchProjectStream({
    baseUrl,
    projectId,
    signal: streamController.signal,
    onEvent(event) {
      observedEvents.push(event);
    },
  });

  const iterations = [];
  for (let index = 0; index < repeat; index += 1) {
    const iteration = await runIteration({
      baseUrl,
      projectId,
      repo,
      ordinal: index + 1,
      observedEvents,
    });
    iterations.push(iteration);
    console.log(
      `Verified ${iteration.ticket.key}: state=${iteration.finalTicket.state}, merge=${iteration.finalTicket.mergeStatus.latestRun.status}, events=${iteration.eventTypes.join(", ")}`,
    );
  }

  streamController.abort();
  await streamPromise.catch(() => {});

  console.log("");
  console.log(`MVP verification passed at ${baseUrl}`);
  console.log(`Project: ${project.name} (${project.id})`);
  console.log(`Repo under test: ${targetRepoPath}`);
  console.log(`Iterations: ${iterations.length}`);
  console.log(`Tickets: ${iterations.map((iteration) => iteration.ticket.key).join(", ")}`);
} catch (error) {
  failed = true;
  if (serverProcess?.floopLogs) {
    console.error("---- Floop API stdout ----");
    console.error(serverProcess.floopLogs.stdout.trim() || "(empty)");
    console.error("---- Floop API stderr ----");
    console.error(serverProcess.floopLogs.stderr.trim() || "(empty)");
  }
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
} finally {
  await stopServer(serverProcess);
  if (!failed || !keepFixture) {
    rmSync(fixtureRoot, { recursive: true, force: true });
  } else {
    console.error(`Preserved fixture root for debugging: ${fixtureRoot}`);
  }
}

async function configureProject(baseUrl, projectId, targetRepoPath) {
  const projectsPayload = await fetchJson(`${baseUrl}/api/v1/projects`);
  const project = projectsPayload.projects.find((item) => item.id === projectId);
  if (!project) {
    throw new Error(`Project ${projectId} was not found at ${baseUrl}`);
  }

  await fetchJson(`${baseUrl}/api/v1/projects/${projectId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      workspaceRoot,
      defaultBaseBranch: "main",
    }),
  });

  await fetchJson(`${baseUrl}/api/v1/projects/${projectId}/policy`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      requireReviewer: true,
      requireValidator: true,
      requireHumanApprovalBeforeMerge: false,
      requiredValidationCommandProfileForMerge: "ci",
      maxParallelExecutions: 4,
      maxParallelMerges: 2,
      maxAutoContinueIterations: 5,
    }),
  });

  const reposPayload = await fetchJson(`${baseUrl}/api/v1/projects/${projectId}/repos`);
  const repo = reposPayload.repos[0];
  if (!repo) {
    throw new Error(`Project ${projectId} has no repos to target`);
  }

  await fetchJson(`${baseUrl}/api/v1/projects/${projectId}/repos/${repo.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: repo.name,
      localPath: targetRepoPath,
      remoteUrl: "",
      defaultBranch: "main",
      isPrimary: true,
    }),
  });

  await updateRoleProfile(baseUrl, projectId, "developer", {
    adapter: "shell",
    model: "fixture",
    config: {
      command: `"${process.execPath}" -e "const fs=require('node:fs'); const path=require('node:path'); const {execFileSync}=require('node:child_process'); const worktree=process.env.FLOOP_WORKTREE_PATH; const ticketKey=process.env.FLOOP_TICKET_KEY.toLowerCase(); const filename=path.join(worktree, ticketKey + '-implementation.txt'); fs.writeFileSync(filename, 'implemented by automated MVP verification\\n'); execFileSync('git', ['-C', worktree, 'add', '-A']); execFileSync('git', ['-C', worktree, 'commit', '-m', 'Implement ' + process.env.FLOOP_TICKET_KEY]); fs.writeFileSync(process.env.FLOOP_RESULT_PATH, JSON.stringify({ outcome: 'completed', summaryMd: 'Developer lane completed automatically.', artifacts: [{ kind: 'patch', label: 'Developer diff note', uri: 'file:///tmp/' + ticketKey + '-developer.patch' }] }));"`,
    },
  });

  await updateRoleProfile(baseUrl, projectId, "reviewer", {
    adapter: "opencode",
    model: "default",
    config: {},
  });

  await updateRoleProfile(baseUrl, projectId, "validator", {
    adapter: "opencode",
    model: "default",
    config: {},
  });

  const profilesPayload = await fetchJson(`${baseUrl}/api/v1/projects/${projectId}/agent-profiles`);
  const developerProfile = profilesPayload.profiles.find((item) => item.role === "developer");
  assert.ok(developerProfile, "Expected developer profile to exist");
  assert.equal(typeof developerProfile.config?.command, "string");
  assert.equal(developerProfile.config.command.length > 0, true);

  const projectPayload = await fetchJson(`${baseUrl}/api/v1/projects/${projectId}`);
  return {
    ...projectPayload.project,
    repos: (await fetchJson(`${baseUrl}/api/v1/projects/${projectId}/repos`)).repos,
  };
}

async function runIteration({ baseUrl, projectId, repo, ordinal, observedEvents }) {
  const created = await fetchJson(`${baseUrl}/api/v1/projects/${projectId}/tickets`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: `Automated MVP verification ${Date.now()}-${ordinal}`,
      brief: "Drive the full governed loop with live automation.",
      state: "READY",
      priority: "medium",
      assignedRole: "developer",
      repoTargets: [
        {
          repoId: repo.id,
          baseRef: repo.defaultBranch,
        },
      ],
    }),
  });
  const ticket = created.ticket;

  const executionResponse = await fetchJson(
    `${baseUrl}/api/v1/projects/${projectId}/tickets/${ticket.id}/executions`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        role: "developer",
        reason: "Automated MVP verification run.",
      }),
    },
  );
  const developerExecution = await waitForExecution(
    baseUrl,
    projectId,
    executionResponse.execution.id,
    (execution) => execution.status === "completed",
    30000,
  );
  if (developerExecution.outcome !== "completed") {
    const stdoutArtifact = developerExecution.artifacts.find((artifact) => artifact.label === "Adapter stdout");
    const stderrArtifact = developerExecution.artifacts.find((artifact) => artifact.label === "Adapter stderr");
    const stdoutLog = stdoutArtifact ? readFileSync(new URL(stdoutArtifact.uri), "utf8").trim() : "";
    const stderrLog = stderrArtifact ? readFileSync(new URL(stderrArtifact.uri), "utf8").trim() : "";
    throw new Error(
      `Developer execution failed: ${developerExecution.summaryMd || "no summary"}${stdoutLog ? `\nSTDOUT:\n${stdoutLog}` : ""}${stderrLog ? `\nSTDERR:\n${stderrLog}` : ""}`,
    );
  }

  const ticketAwaitingReview = await waitForTicket(
    baseUrl,
    projectId,
    ticket.id,
    (currentTicket) => currentTicket.executions.some((execution) => execution.role === "reviewer"),
    10000,
  );
  const reviewerExecution = latestExecutionForRole(ticketAwaitingReview, "reviewer");
  assert.ok(reviewerExecution, "Expected reviewer execution to be auto-routed");

  await fetchJson(`${baseUrl}/api/v1/projects/${projectId}/executions/${reviewerExecution.id}/complete`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      outcome: "completed",
      summaryMd: "Automated reviewer lane completed.",
      review: {
        verdict: "passed",
        summaryMd: "Automated reviewer found no blocking issues.",
        findings: [],
        artifacts: [
          {
            kind: "report",
            label: "Reviewer notes",
            uri: `file://${join(fixtureRoot, `${ticket.key.toLowerCase()}-review.md`)}`,
          },
        ],
      },
    }),
  });

  const ticketAwaitingValidation = await waitForTicket(
    baseUrl,
    projectId,
    ticket.id,
    (currentTicket) =>
      currentTicket.reviews.length >= 1 &&
      currentTicket.executions.some((execution) => execution.role === "validator"),
    10000,
  );
  const validatorExecution = latestExecutionForRole(ticketAwaitingValidation, "validator");
  assert.ok(validatorExecution, "Expected validator execution to be auto-routed");

  await fetchJson(`${baseUrl}/api/v1/projects/${projectId}/executions/${validatorExecution.id}/complete`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      outcome: "completed",
      summaryMd: "Automated validator lane completed.",
      validation: {
        verdict: "passed",
        summaryMd: "Automated validation checks passed.",
        commandProfile: "ci",
        commands: ["npm test"],
        repoIds: [repo.id],
        artifacts: [
          {
            kind: "log",
            label: "Validation output",
            uri: `file://${join(fixtureRoot, `${ticket.key.toLowerCase()}-validation.log`)}`,
          },
        ],
      },
    }),
  });

  const finalTicket = await waitForTicket(
    baseUrl,
    projectId,
    ticket.id,
    (currentTicket) =>
      currentTicket.mergeStatus?.latestRun?.status === "completed" ||
      currentTicket.mergeStatus?.latestRun?.status === "rework" ||
      currentTicket.mergeStatus?.latestRun?.status === "blocked",
    30000,
  );

  await waitForObservedEvent(
    observedEvents,
    (event) => event.ticketId === ticket.id && event.type === "merge.completed" && event.lane === "merge",
    5000,
  );
  const matchingEvents = observedEvents.filter((event) => event.ticketId === ticket.id);
  const eventTypes = matchingEvents.map((event) => event.type);
  const mergeArtifact = finalTicket.mergeStatus.latestRun.artifacts.find((artifact) =>
    artifact.label.includes("merge candidate"),
  );
  const mergeSummary = mergeArtifact ? JSON.parse(readFileSync(new URL(mergeArtifact.uri), "utf8")) : null;
  const mergeConflictArtifact = finalTicket.mergeStatus.latestRun.artifacts.find((artifact) =>
    artifact.label.includes("merge conflict summary"),
  );
  const mergeConflictSummary = mergeConflictArtifact
    ? JSON.parse(readFileSync(new URL(mergeConflictArtifact.uri), "utf8"))
    : null;
  const mergeStdoutArtifact = finalTicket.mergeStatus.latestRun.artifacts.find((artifact) =>
    artifact.label.includes("merge stdout"),
  );
  const mergeStderrArtifact = finalTicket.mergeStatus.latestRun.artifacts.find((artifact) =>
    artifact.label.includes("merge stderr"),
  );
  const mergeStdout = mergeStdoutArtifact ? readFileSync(new URL(mergeStdoutArtifact.uri), "utf8").trim() : "";
  const mergeStderr = mergeStderrArtifact ? readFileSync(new URL(mergeStderrArtifact.uri), "utf8").trim() : "";

  if (finalTicket.mergeStatus.latestRun.status !== "completed") {
    throw new Error(
      `Merge lane ended as ${finalTicket.mergeStatus.latestRun.status}: ${mergeConflictSummary?.detail || finalTicket.mergeStatus.latestRun.summaryMd || "no summary"}${mergeStdout ? `\nMERGE STDOUT:\n${mergeStdout}` : ""}${mergeStderr ? `\nMERGE STDERR:\n${mergeStderr}` : ""}`,
    );
  }

  assert.equal(executionResponse.execution.role, "developer");
  assert.equal(finalTicket.state, "DONE");
  assert.equal(finalTicket.reviews.length >= 1, true);
  assert.equal(finalTicket.validations.length >= 1, true);
  assert.equal(finalTicket.mergeStatus.latestRun.status, "completed");
  assert.equal(finalTicket.executions.some((execution) => execution.role === "developer"), true);
  assert.equal(finalTicket.executions.some((execution) => execution.role === "reviewer"), true);
  assert.equal(finalTicket.executions.some((execution) => execution.role === "validator"), true);
  assert.equal(finalTicket.executions.every((execution) => execution.outcome === "completed"), true);
  assert.equal(finalTicket.validations.some((validation) => validation.commandProfile === "ci"), true);
  assert.equal(
    matchingEvents.some((event) => event.type === "merge.completed" && event.lane === "merge"),
    true,
  );
  assert.equal(
    matchingEvents.every(
      (event) =>
        typeof event.cursor === "string" &&
        event.cursor.length > 0 &&
        typeof event.type === "string" &&
        event.type.length > 0 &&
        typeof event.lane === "string" &&
        event.lane.length > 0,
    ),
    true,
  );
  assert.ok(mergeArtifact);
  assert.ok(mergeSummary);
  assert.equal(mergeSummary.repoSlug, repo.slug);
  assert.equal(mergeSummary.baseRef, repo.defaultBranch);
  assert.equal(Array.isArray(mergeSummary.changedFiles), true);
  assert.equal(
    mergeSummary.changedFiles.includes(`${ticket.key.toLowerCase()}-implementation.txt`),
    true,
  );
  assert.equal(typeof mergeSummary.commitSha, "string");
  assert.equal(mergeSummary.commitSha.length > 0, true);

  return {
    ticket,
    finalTicket,
    eventTypes,
  };
}

function latestExecutionForRole(ticket, role) {
  return [...ticket.executions].reverse().find((execution) => execution.role === role);
}

async function waitForObservedEvent(events, predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (events.some(predicate)) {
      return;
    }
    await sleep(100);
  }

  const summary = events.map((event) => `${event.ticketKey || event.ticketId || "?"}:${event.type}`).join(", ");
  throw new Error(`Timed out waiting for expected SSE event. Observed: ${summary || "none"}`);
}

async function waitForTicket(baseUrl, projectId, ticketId, predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let latestTicket = null;

  while (Date.now() < deadline) {
    const payload = await fetchJson(`${baseUrl}/api/v1/projects/${projectId}/tickets/${ticketId}`);
    latestTicket = payload.ticket;
    if (predicate(latestTicket)) {
      return latestTicket;
    }
    await sleep(200);
  }

  const executionSummary = (latestTicket?.executions || [])
    .map(
      (execution) =>
        `${execution.role}:${execution.status}/${execution.outcome || "pending"}:${(execution.summaryMd || "").replace(/\s+/g, " ").trim()}`,
    )
    .join(", ");
  throw new Error(
    `Timed out waiting for ticket ${ticketId}. Last state: ${latestTicket?.state || "unknown"}, merge: ${latestTicket?.mergeStatus?.latestRun?.status || "unknown"}, executions: ${executionSummary || "none"}, reviews: ${(latestTicket?.reviews || []).length}, validations: ${(latestTicket?.validations || []).length}`,
  );
}

async function waitForExecution(baseUrl, projectId, executionId, predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let latestExecution = null;

  while (Date.now() < deadline) {
    const payload = await fetchJson(`${baseUrl}/api/v1/projects/${projectId}/executions/${executionId}`);
    latestExecution = payload.execution;
    if (predicate(latestExecution)) {
      return latestExecution;
    }
    await sleep(200);
  }

  throw new Error(
    `Timed out waiting for execution ${executionId}. Last status: ${latestExecution?.status || "unknown"}, outcome: ${latestExecution?.outcome || "unknown"}`,
  );
}

async function watchProjectStream({ baseUrl, projectId, signal, onEvent }) {
  try {
    const response = await fetch(`${baseUrl}/api/v1/projects/${projectId}/events/stream?limit=200`, { signal });
    if (!response.ok) {
      throw new Error(`Could not open project stream: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() || "";
      for (const chunk of chunks) {
        const parsed = parseSseChunk(chunk);
        if (parsed.event === "event" && parsed.data) {
          onEvent(parsed.data);
        }
        if (parsed.event === "snapshot" && parsed.data?.events) {
          for (const event of parsed.data.events) {
            onEvent(event);
          }
        }
      }
    }
  } catch (error) {
    if (signal.aborted) {
      return;
    }
    if (String(error?.message || error).includes("terminated")) {
      return;
    }
    throw error;
  }
}

function parseSseChunk(chunk) {
  const lines = chunk.split("\n");
  let event = "message";
  const data = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
      continue;
    }
    if (line.startsWith("data:")) {
      data.push(line.slice(5).trim());
    }
  }

  return {
    event,
    data: data.length ? JSON.parse(data.join("\n")) : null,
  };
}

async function assertMissionControlServed(baseUrl) {
  const response = await fetch(baseUrl);
  const html = await response.text();
  assert.equal(response.ok, true);
  assert.match(html, /Floop Mission Control/);
}

function initializeTargetRepo(targetRepoPath) {
  execFileSync("mkdir", ["-p", workspaceRoot]);
  execFileSync("mkdir", ["-p", targetRepoPath]);
  execFileSync("git", ["init", "-b", "main", targetRepoPath]);
  execFileSync("git", ["-C", targetRepoPath, "config", "user.name", "Floop MVP Verify"]);
  execFileSync("git", ["-C", targetRepoPath, "config", "user.email", "floop-mvp@example.com"]);
  writeFileSync(join(targetRepoPath, "README.md"), "# Floop MVP verification repo\n", "utf8");
  execFileSync("git", ["-C", targetRepoPath, "add", "README.md"]);
  execFileSync("git", ["-C", targetRepoPath, "commit", "-m", "Seed verification repo"]);
}

function startServer({ cwd, dbPath, port }) {
  const child = spawn(process.execPath, ["services/api/src/server.mjs"], {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      FLOOP_DB_PATH: dbPath,
      FLOOP_PORT: String(port),
      FLOOP_EXECUTION_POLL_MS: process.env.FLOOP_EXECUTION_POLL_MS || "100",
      FLOOP_MERGE_POLL_MS: process.env.FLOOP_MERGE_POLL_MS || "100",
    },
  });

  let stderr = "";
  let stdout = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  child.on("exit", (code) => {
    if (code && process.exitCode === undefined) {
      console.error(stdout.trim());
      console.error(stderr.trim());
    }
  });
  child.floopLogs = { get stdout() { return stdout; }, get stderr() { return stderr; } };
  return child;
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) {
    return;
  }
  child.kill("SIGTERM");
  await Promise.race([once(child, "exit"), sleep(3000)]);
  if (child.exitCode === null) {
    child.kill("SIGKILL");
    await Promise.race([once(child, "exit"), sleep(1000)]);
  }
  child.stdout?.destroy();
  child.stderr?.destroy();
}

async function waitForHealth(baseUrl, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/v1/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // keep retrying while the server boots
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for Floop API health at ${baseUrl}`);
}

async function updateRoleProfile(baseUrl, projectId, role, payload) {
  return fetchJson(`${baseUrl}/api/v1/projects/${projectId}/agent-profiles/${role}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || payload.error || `Request failed: ${response.status}`);
  }
  return payload;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
