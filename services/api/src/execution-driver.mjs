import { spawn } from "node:child_process";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_POLL_INTERVAL_MS = 2000;

export function createExecutionDriver(options = {}) {
  if (!options.store) {
    throw new Error("Execution driver requires a store");
  }

  return new ExecutionDriver({
    store: options.store,
    pollIntervalMs: options.pollIntervalMs || DEFAULT_POLL_INTERVAL_MS,
    logger: options.logger || console,
  });
}

class ExecutionDriver {
  constructor({ store, pollIntervalMs, logger }) {
    this.store = store;
    this.pollIntervalMs = pollIntervalMs;
    this.logger = logger;
    this.timer = null;
    this.inFlight = new Map();
  }

  start() {
    if (this.timer) {
      return;
    }

    this.timer = setInterval(() => {
      this.pollOnce().catch((error) => {
        this.logger.error?.("[pool-driver] poll failed", error);
      });
    }, this.pollIntervalMs);
    this.timer.unref?.();
  }

  async stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    if (this.inFlight.size > 0) {
      await Promise.allSettled(this.inFlight.values());
    }
  }

  async pollOnce() {
    const executions = this.store.listActiveExecutions();
    const runnable = executions.filter((execution) => !this.inFlight.has(execution.id));
    const started = runnable.map((execution) => {
      const promise = this.runExecution(execution)
        .catch((error) => {
          this.logger.error?.("[pool-driver] execution failed", error);
        })
        .finally(() => {
          this.inFlight.delete(execution.id);
        });
      this.inFlight.set(execution.id, promise);
      return promise;
    });

    await Promise.all(started);
  }

  async runExecution(execution) {
    const freshExecution = this.store.getExecution(execution.projectId, execution.id);
    if (!freshExecution || freshExecution.finishedAt) {
      return;
    }

    const project = this.store.getProjectSummary(freshExecution.projectId);
    const ticket = this.store.getTicket(freshExecution.projectId, freshExecution.ticketId);
    if (!project || !ticket) {
      return;
    }

    const profile = project.roleProfiles.find((candidate) => candidate.role === freshExecution.role);
    const adapterRun = selectAdapterRun(profile, freshExecution);
    if (!adapterRun) {
      return;
    }

    try {
      await materializeWorktrees(ticket, freshExecution);
      const runtime = await prepareRuntimeArtifacts(project, ticket, freshExecution);
      const result = await executeAdapterRun(adapterRun, {
        project,
        ticket,
        execution: freshExecution,
        runtime,
        cwd: freshExecution.worktrees[0]?.path || project.workspaceRoot,
        env: buildExecutionEnv(project, ticket, freshExecution, runtime),
      });
      const completion = await buildCompletionPayload(result, runtime, freshExecution);
      this.store.completeExecution(freshExecution.projectId, freshExecution.id, completion);
    } catch (error) {
      const failureSummary = error instanceof Error ? error.message : String(error);
      const latestExecution = this.store.getExecution(execution.projectId, execution.id);
      if (latestExecution && !latestExecution.finishedAt) {
        this.store.completeExecution(execution.projectId, execution.id, {
          outcome: "failed",
          summaryMd: `Execution driver failed before adapter completion.\n\n${failureSummary}`,
          failureKind: "driver_error",
        });
      }
      throw error;
    }
  }
}

function selectAdapterRun(profile, execution) {
  if (!profile) {
    return null;
  }

  if (profile.adapter === "codex") {
    return {
      kind: "codex",
      executable: typeof profile.config?.executable === "string" && profile.config.executable.trim()
        ? profile.config.executable.trim()
        : "codex",
      model: profile.model,
      sandbox: typeof profile.config?.sandbox === "string" && profile.config.sandbox.trim()
        ? profile.config.sandbox.trim()
        : "workspace-write",
      approvalPolicy:
        typeof profile.config?.approvalPolicy === "string" && profile.config.approvalPolicy.trim()
          ? profile.config.approvalPolicy.trim()
          : "never",
      promptPreamble:
        typeof profile.config?.promptPreamble === "string" ? profile.config.promptPreamble.trim() : "",
    };
  }

  if (typeof profile.config?.command === "string" && profile.config.command.trim()) {
    return {
      kind: "shell",
      command: profile.config.command.trim(),
    };
  }

  if (profile.adapter === "mock") {
    return {
      kind: "mock",
      result: normalizeCompletionResult(profile.config?.result, execution),
    };
  }

  return null;
}

async function materializeWorktrees(ticket, execution) {
  const repoTargetsByRepoId = new Map(ticket.repoTargets.map((target) => [target.repoId, target]));
  for (const worktree of execution.worktrees) {
    const target = repoTargetsByRepoId.get(worktree.repoId);
    if (!target) {
      continue;
    }

    await ensureWorktreeMaterialized(target, worktree);
    await writeFile(
      join(worktree.path, ".pool-worktree.json"),
      JSON.stringify(
        {
          projectId: execution.projectId,
          ticketId: execution.ticketId,
          executionId: execution.id,
          repoId: worktree.repoId,
          repoSlug: worktree.repoSlug,
          repoLocalPath: target.repoLocalPath,
          baseRef: worktree.baseRef,
          branchName: worktree.branchName,
        },
        null,
        2,
      ),
      "utf8",
    );
  }
}

async function ensureWorktreeMaterialized(target, worktree) {
  if (await fileExists(join(worktree.path, ".git"))) {
    return;
  }

  if (await isGitRepository(target.repoLocalPath)) {
    await mkdir(dirname(worktree.path), { recursive: true });
    if (await fileExists(worktree.path)) {
      await rm(worktree.path, { recursive: true, force: true });
    }

    const materialized = await runProcess(
      "git",
      [
        "-C",
        target.repoLocalPath,
        "worktree",
        "add",
        "-B",
        worktree.branchName,
        worktree.path,
        worktree.baseRef,
      ],
      {
        cwd: target.repoLocalPath,
        env: process.env,
      },
    );
    if (materialized.exitCode !== 0) {
      throw new Error(
        `Failed to materialize git worktree for ${target.repoSlug}: ${materialized.stderr || materialized.stdout}`.trim(),
      );
    }
    return;
  }

  await mkdir(worktree.path, { recursive: true });
}

async function prepareRuntimeArtifacts(project, ticket, execution) {
  const executionRoot = resolve(project.workspaceRoot, ".pool", "executions", execution.id);
  const artifactRoot = resolve(project.workspaceRoot, ".pool", "artifacts", "executions", execution.id);
  const contextPath = join(executionRoot, "context.json");
  const resultPath = join(executionRoot, "result.json");
  const promptPath = join(executionRoot, "prompt.md");
  const finalMessagePath = join(artifactRoot, "agent-final-message.md");
  const stdoutPath = join(artifactRoot, "stdout.log");
  const stderrPath = join(artifactRoot, "stderr.log");

  await mkdir(dirname(contextPath), { recursive: true });
  await mkdir(dirname(stdoutPath), { recursive: true });
  await writeFile(
    contextPath,
    JSON.stringify(
      {
        project,
        ticket,
        execution,
      },
      null,
      2,
    ),
    "utf8",
  );

  return {
    contextPath,
    resultPath,
    promptPath,
    finalMessagePath,
    stdoutPath,
    stderrPath,
  };
}

function buildExecutionEnv(project, ticket, execution, runtime) {
  return {
    ...process.env,
    POOL_PROJECT_ID: project.id,
    POOL_PROJECT_SLUG: project.slug,
    POOL_PROJECT_ROOT: project.workspaceRoot,
    POOL_TICKET_ID: ticket.id,
    POOL_TICKET_KEY: ticket.key,
    POOL_TICKET_TITLE: ticket.title,
    POOL_EXECUTION_ID: execution.id,
    POOL_EXECUTION_ROLE: execution.role,
    POOL_EXECUTION_ITERATION: String(execution.iteration),
    POOL_WORKTREE_PATH: execution.worktrees[0]?.path || "",
    POOL_CONTEXT_PATH: runtime.contextPath,
    POOL_RESULT_PATH: runtime.resultPath,
  };
}

async function executeAdapterRun(adapterRun, options) {
  if (adapterRun.kind === "mock") {
    return {
      exitCode: 0,
      stdout: "mock adapter completed",
      stderr: "",
      result: adapterRun.result,
    };
  }

  if (adapterRun.kind === "codex") {
    const prompt = buildCodexPrompt(options.project, options.ticket, options.execution, adapterRun, options.runtime);
    await writeFile(options.runtime.promptPath, prompt, "utf8");

    return runProcess(adapterRun.executable, buildCodexArgs(adapterRun, options), {
      cwd: options.cwd,
      env: options.env,
      stdin: prompt,
    });
  }

  return runShellCommand(adapterRun.command, options);
}

function runShellCommand(command, { cwd, env }) {
  return runProcess(command, [], {
    cwd,
    env,
    shell: true,
  });
}

function runProcess(command, args, { cwd, env, shell = false, stdin = "" }) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd,
      env,
      shell,
      stdio: [stdin ? "pipe" : "ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    if (stdin) {
      child.stdin?.end(stdin);
    }

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", rejectPromise);
    child.on("close", (code) => {
      resolvePromise({
        exitCode: code ?? 1,
        stdout,
        stderr,
      });
    });
  });
}

async function buildCompletionPayload(result, runtime, execution) {
  await writeFile(runtime.stdoutPath, result.stdout || "", "utf8");
  await writeFile(runtime.stderrPath, result.stderr || "", "utf8");

  const fileResult = result.result || (await readResultFile(runtime.resultPath));
  const normalized = normalizeCompletionResult(fileResult, execution);
  const artifacts = [
    {
      kind: "log",
      label: "Adapter stdout",
      uri: pathToFileURL(runtime.stdoutPath).href,
    },
    {
      kind: "log",
      label: "Adapter stderr",
      uri: pathToFileURL(runtime.stderrPath).href,
    },
    ...(normalized.artifacts || []),
  ];

  if (await fileExists(runtime.finalMessagePath)) {
    artifacts.push({
      kind: "report",
      label: "Agent final message",
      uri: pathToFileURL(runtime.finalMessagePath).href,
    });
  }

  if (result.exitCode !== 0) {
    return {
      outcome: "failed",
      summaryMd:
        normalized.summaryMd ||
        `Adapter command exited with code ${result.exitCode}.${result.stderr ? `\n\n${result.stderr.trim()}` : ""}`,
      remainingWorkMd: normalized.remainingWorkMd || "",
      expectedNextEvidenceMd: normalized.expectedNextEvidenceMd || "",
      failureKind: normalized.failureKind || "adapter_command_failed",
      blockedKind: normalized.blockedKind || "",
      artifacts,
    };
  }

  return {
    outcome: normalized.outcome,
    summaryMd: normalized.summaryMd,
    remainingWorkMd: normalized.remainingWorkMd,
    expectedNextEvidenceMd: normalized.expectedNextEvidenceMd,
    failureKind: normalized.failureKind,
    blockedKind: normalized.blockedKind,
    artifacts,
    review: normalized.review,
    validation: normalized.validation,
  };
}

async function readResultFile(filename) {
  try {
    const file = await readFile(filename, "utf8");
    if (!file.trim()) {
      return null;
    }
    return JSON.parse(file);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function normalizeCompletionResult(result, execution = null) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return {
      outcome: "completed",
      summaryMd: execution
        ? `${execution.ticketKey} ${execution.role} iteration ${execution.iteration} completed.`
        : "Execution completed through the background adapter driver.",
      remainingWorkMd: "",
      expectedNextEvidenceMd: "",
      failureKind: "",
      blockedKind: "",
      artifacts: [],
      review: undefined,
      validation: undefined,
    };
  }

  return {
    outcome: typeof result.outcome === "string" ? result.outcome : "completed",
    summaryMd:
      typeof result.summaryMd === "string"
        ? result.summaryMd
        : execution
          ? `${execution.ticketKey} ${execution.role} iteration ${execution.iteration} completed.`
          : "Execution completed through the background adapter driver.",
    remainingWorkMd: typeof result.remainingWorkMd === "string" ? result.remainingWorkMd : "",
    expectedNextEvidenceMd:
      typeof result.expectedNextEvidenceMd === "string" ? result.expectedNextEvidenceMd : "",
    failureKind: typeof result.failureKind === "string" ? result.failureKind : "",
    blockedKind: typeof result.blockedKind === "string" ? result.blockedKind : "",
    artifacts: normalizeArtifacts(result.artifacts),
    review: normalizeEmbeddedReviewResult(result.review),
    validation: normalizeEmbeddedValidationResult(result.validation),
  };
}

function normalizeEmbeddedReviewResult(review) {
  if (!review || typeof review !== "object" || Array.isArray(review)) {
    return undefined;
  }

  const verdict = typeof review.verdict === "string" ? review.verdict : "";
  if (!verdict) {
    return undefined;
  }

  const normalized = {
    verdict,
  };

  if (typeof review.summaryMd === "string") {
    normalized.summaryMd = review.summaryMd;
  }
  if (typeof review.blockedKind === "string") {
    normalized.blockedKind = review.blockedKind;
  }

  const artifacts = normalizeArtifacts(review.artifacts);
  if (artifacts.length > 0) {
    normalized.artifacts = artifacts;
  }

  const findings = normalizeReviewFindings(review.findings);
  if (findings) {
    normalized.findings = findings;
  }

  return normalized;
}

function normalizeEmbeddedValidationResult(validation) {
  if (!validation || typeof validation !== "object" || Array.isArray(validation)) {
    return undefined;
  }

  const verdict = typeof validation.verdict === "string" ? validation.verdict : "";
  if (!verdict) {
    return undefined;
  }

  const normalized = {
    verdict,
  };

  if (typeof validation.summaryMd === "string") {
    normalized.summaryMd = validation.summaryMd;
  }
  if (typeof validation.blockedKind === "string") {
    normalized.blockedKind = validation.blockedKind;
  }
  if (typeof validation.commandProfile === "string") {
    normalized.commandProfile = validation.commandProfile;
  }

  const artifacts = normalizeArtifacts(validation.artifacts);
  if (artifacts.length > 0) {
    normalized.artifacts = artifacts;
  }

  const commands = normalizeStringList(validation.commands);
  if (commands) {
    normalized.commands = commands;
  }

  const repoIds = normalizeStringList(validation.repoIds);
  if (repoIds) {
    normalized.repoIds = repoIds;
  }

  return normalized;
}

function normalizeReviewFindings(findings) {
  if (!Array.isArray(findings)) {
    return undefined;
  }

  return findings
    .filter((finding) => finding && typeof finding === "object" && !Array.isArray(finding))
    .map((finding) => {
      const normalized = {
        severity: typeof finding.severity === "string" ? finding.severity : "",
        category: typeof finding.category === "string" ? finding.category : "",
        title: typeof finding.title === "string" ? finding.title : "",
      };
      if (typeof finding.filePath === "string") {
        normalized.filePath = finding.filePath;
      }
      if (typeof finding.lineNumber === "number" && Number.isInteger(finding.lineNumber) && finding.lineNumber > 0) {
        normalized.lineNumber = finding.lineNumber;
      }
      if (typeof finding.detailsMd === "string") {
        normalized.detailsMd = finding.detailsMd;
      }
      return normalized;
    })
    .filter((finding) => finding.severity && finding.category && finding.title);
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.filter((entry) => typeof entry === "string" && entry.trim());
}

function normalizeArtifacts(value) {
  return Array.isArray(value)
    ? value.filter(isArtifactLike).map((artifact) => ({
        kind: artifact.kind,
        label: artifact.label,
        uri: artifact.uri,
        metadata: artifact.metadata && typeof artifact.metadata === "object" ? artifact.metadata : undefined,
      }))
    : [];
}

function isArtifactLike(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof value.kind === "string" &&
      typeof value.label === "string" &&
      typeof value.uri === "string",
  );
}

function buildCodexArgs(adapterRun, { project, execution, runtime }) {
  const args = [
    "exec",
    "-C",
    execution.worktrees[0]?.path || project.workspaceRoot,
    "--add-dir",
    project.workspaceRoot,
    "--skip-git-repo-check",
    "-s",
    adapterRun.sandbox,
    "-a",
    adapterRun.approvalPolicy,
    "-o",
    runtime.finalMessagePath,
    "-m",
    adapterRun.model,
    "-",
  ];

  return args;
}

function buildCodexPrompt(project, ticket, execution, adapterRun, runtime) {
  const scopes = ticket.repoTargets
    .map((target) => `- ${target.repoSlug}: ${target.targetScopeMd || "no explicit scope"}`)
    .join("\n");
  const worktrees = execution.worktrees
    .map((worktree) => `- ${worktree.repoSlug}: ${worktree.path} (${worktree.branchName} from ${worktree.baseRef})`)
    .join("\n");

  const preamble = adapterRun.promptPreamble ? `${adapterRun.promptPreamble}\n\n` : "";
  const resultContract = buildCodexResultContract(execution.role, runtime.resultPath);
  return `${preamble}You are the ${execution.role} lane for Pool ticket ${ticket.key}.

Operate inside the provided worktree and make the required code changes directly.

Project: ${project.name}
Ticket: ${ticket.key} - ${ticket.title}
Brief: ${ticket.brief}
Acceptance criteria:
${ticket.acceptanceCriteriaMd || "None recorded."}

Definition of done:
${ticket.definitionOfDoneMd || "None recorded."}

Repo targets:
${scopes || "- none"}

Planned worktrees:
${worktrees || "- none"}

Execution context JSON: ${runtime.contextPath}
Required result JSON output path: ${runtime.resultPath}

Before finishing:
1. Inspect the execution context file.
2. Complete the ${execution.role} lane work in the worktree.
3. Summarize what you changed, verified, and what remains.
4. Write a JSON object to ${runtime.resultPath} with:
${resultContract}

If you are blocked or incomplete, say so explicitly in the JSON outcome fields instead of pretending success.`;
}

function buildCodexResultContract(role, resultPath) {
  const shared = [
    `   - outcome: one of completed, needs_continue, blocked, followup_created, failed`,
    `   - summaryMd: markdown summary`,
    `   - remainingWorkMd: markdown string`,
    `   - expectedNextEvidenceMd: markdown string`,
    `   - failureKind: optional short string`,
    `   - blockedKind: optional short string`,
    `   - artifacts: optional array of { kind, label, uri, metadata } for execution-level evidence`,
  ];

  if (role === "reviewer") {
    return `${shared.join("\n")}
   - review: required on successful review completions, shaped as:
     { verdict, summaryMd?, blockedKind?, artifacts?, findings? }
   - review.verdict: one of passed, rework, blocked
   - review.artifacts: optional array of { kind, label, uri, metadata } for durable review evidence
   - review.findings: optional array of
     { severity, category, title, filePath?, lineNumber?, detailsMd? }

The JSON file at ${resultPath} should include the top-level execution outcome plus the nested review result.`;
  }

  if (role === "validator") {
    return `${shared.join("\n")}
   - validation: required on successful validation completions, shaped as:
     { verdict, summaryMd?, blockedKind?, commandProfile?, commands?, repoIds?, artifacts? }
   - validation.verdict: one of passed, failed, blocked
   - validation.commands: optional array of commands you ran
   - validation.repoIds: optional array of repo ids you validated
   - validation.artifacts: optional array of { kind, label, uri, metadata } for durable validation evidence

The JSON file at ${resultPath} should include the top-level execution outcome plus the nested validation result.`;
  }

  return shared.join("\n");
}

async function fileExists(filename) {
  try {
    await access(filename);
    return true;
  } catch {
    return false;
  }
}

async function isGitRepository(path) {
  if (!path) {
    return false;
  }
  if (!(await fileExists(path))) {
    return false;
  }

  const probe = await runProcess("git", ["-C", path, "rev-parse", "--is-inside-work-tree"], {
    cwd: process.cwd(),
    env: process.env,
  });
  return probe.exitCode === 0 && probe.stdout.trim() === "true";
}
