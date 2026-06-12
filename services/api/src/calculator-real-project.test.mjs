import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createExecutionDriver } from "./execution-driver.mjs";
import { createStore } from "./store.mjs";

test("bounded real project goal can create runnable calculator tickets", async () => {
  const fixtureDir = mkdtempSync(join(tmpdir(), "pool-calculator-real-project-"));
  const workspaceRoot = join(fixtureDir, "workspace");
  const targetRepoPath = join(fixtureDir, "calculator-cli");
  const goalAgentPath = join(fixtureDir, "goal-agent.cjs");
  const developerAgentPath = join(fixtureDir, "developer-agent.cjs");
  const store = createStore({
    filename: join(fixtureDir, "pool.sqlite"),
    seedDemo: false,
    workspaceRoot,
  });

  try {
    initializeCalculatorRepo(targetRepoPath);
    writeGoalAgent(goalAgentPath);
    writeDeveloperAgent(developerAgentPath);

    const project = store.createProject({
      name: "CLI Calculator",
      slug: "cli-calculator",
      workspaceRoot,
      description: "Bounded real-project fixture for proving goal-driven ticket extension.",
      defaultBaseBranch: "main",
    });
    const repo = store.createRepo(project.id, {
      name: "calculator-cli",
      slug: "calculator-cli",
      localPath: targetRepoPath,
      defaultBranch: "main",
      isPrimary: true,
    });
    store.updateProjectPolicy(project.id, {
      requireReviewer: false,
      requireValidator: false,
      requireHumanApprovalBeforeMerge: false,
      refinementMode: "autonomous",
      agentCreatedTicketDefaultState: "READY",
      maxParallelExecutions: 2,
      maxAutoContinueIterations: 2,
    });
    store.updateRoleProfile(project.id, "product_manager", {
      adapter: "shell",
      model: "fixture",
      config: {
        command: `${quote(process.execPath)} ${quote(goalAgentPath)}`,
      },
    });

    const goalTicket = store.createTicket(project.id, {
      title: "Refine CLI calculator goal",
      brief:
        "Turn the goal 'build a CLI calculator tool' into a small set of execution-ready tickets.",
      acceptanceCriteriaMd:
        "- Follow-up tickets cover implementation, usage docs, and validation.\n- Tickets are children of this goal ticket.\n- Implementation ticket can be picked up by the autonomous harness.",
      definitionOfDoneMd:
        "- Follow-up tickets are READY and have repo targets.\n- The implementation ticket names calculator CLI behavior clearly.",
      state: "READY",
      priority: "high",
      assignedRole: "product_manager",
      repoTargets: [
        {
          repoId: repo.id,
          baseRef: "main",
          branchName: "calculator-goal-refinement",
          targetScopeMd: "Decompose the CLI calculator goal into a runnable ticket set.",
        },
      ],
    });
    const goalExecution = store.createExecution(project.id, goalTicket.id, {
      role: "product_manager",
      reason: "Bounded goal refinement for the calculator project.",
    });

    const driver = createExecutionDriver({ store, logger: silentLogger() });
    await driver.pollOnce();

    const completedGoalExecution = store.getExecution(project.id, goalExecution.id);
    const followups = store.listTickets(project.id, { parentTicketId: goalTicket.id });
    const implementationTicket = followups.find((ticket) => ticket.title === "Implement calculator CLI");

    assert.equal(completedGoalExecution.outcome, "followup_created");
    assert.equal(followups.length, 3);
    assert.ok(implementationTicket);
    assert.equal(implementationTicket.state, "READY");
    assert.equal(implementationTicket.repoCount, 1);
    assert.equal(followups.every((ticket) => ticket.parentTicketId === goalTicket.id), true);

    store.updateRoleProfile(project.id, "developer", {
      adapter: "shell",
      model: "fixture",
      config: {
        command: `${quote(process.execPath)} ${quote(developerAgentPath)}`,
      },
    });
    const implementationExecution = store.createExecution(project.id, implementationTicket.id, {
      role: "developer",
      reason: "Implement the bounded calculator CLI ticket.",
    });
    await driver.pollOnce();

    const completedImplementation = store.getExecution(project.id, implementationExecution.id);
    const implementedTicket = store.getTicket(project.id, implementationTicket.id);
    const calculatorPath = join(implementationExecution.worktrees[0].path, "bin", "calc.mjs");

    assert.equal(completedImplementation.outcome, "completed");
    assert.equal(implementedTicket.state, "READY_TO_MERGE");
    assert.equal(existsSync(calculatorPath), true);
    assert.equal(runCalculator(calculatorPath, ["add", "2", "3"]), "5");
    assert.equal(runCalculator(calculatorPath, ["sub", "7", "4"]), "3");
    assert.equal(runCalculator(calculatorPath, ["mul", "6", "5"]), "30");
    assert.equal(runCalculator(calculatorPath, ["div", "8", "2"]), "4");
  } finally {
    store.close();
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});

function initializeCalculatorRepo(targetRepoPath) {
  mkdirSync(targetRepoPath, { recursive: true });
  writeFileSync(
    join(targetRepoPath, "package.json"),
    `${JSON.stringify(
      {
        name: "calculator-cli",
        version: "0.0.0",
        type: "module",
        bin: {
          calc: "bin/calc.mjs",
        },
        scripts: {
          test: "node test/calculator.test.mjs",
        },
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(join(targetRepoPath, "README.md"), "# CLI Calculator\n\nA small calculator CLI fixture.\n");
  execFileSync("git", ["-C", targetRepoPath, "init", "-b", "main"], { stdio: "ignore" });
  execFileSync("git", ["-C", targetRepoPath, "config", "user.email", "pool@example.invalid"]);
  execFileSync("git", ["-C", targetRepoPath, "config", "user.name", "Floop Test"]);
  execFileSync("git", ["-C", targetRepoPath, "add", "-A"]);
  execFileSync("git", ["-C", targetRepoPath, "commit", "-m", "Seed calculator project"], {
    stdio: "ignore",
  });
}

function writeGoalAgent(goalAgentPath) {
  writeFileSync(
    goalAgentPath,
    `const fs = require("node:fs");
const context = JSON.parse(fs.readFileSync(process.env.POOL_CONTEXT_PATH, "utf8"));
const target = context.ticket.repoTargets[0];
const followupTickets = [
  {
    title: "Implement calculator CLI",
    brief: "Build a Node CLI that supports add, sub, mul, and div commands.",
    acceptanceCriteriaMd: "- calc add 2 3 prints 5.\\n- calc sub 7 4 prints 3.\\n- calc mul 6 5 prints 30.\\n- calc div 8 2 prints 4.",
    definitionOfDoneMd: "- CLI entrypoint exists under bin/calc.mjs.\\n- npm test passes in the worktree.",
    priority: "high",
    assignedRole: "developer",
    repoTargets: [{ repoId: target.repoId, baseRef: target.baseRef, branchName: "calculator-cli-implementation", targetScopeMd: "CLI implementation and tests." }]
  },
  {
    title: "Document calculator usage",
    brief: "Add concise README usage examples for the calculator CLI.",
    assignedRole: "developer",
    repoTargets: [{ repoId: target.repoId, baseRef: target.baseRef, branchName: "calculator-cli-docs", targetScopeMd: "README usage examples." }]
  },
  {
    title: "Validate calculator edge cases",
    brief: "Add validation coverage for invalid operations and division by zero.",
    assignedRole: "validator",
    repoTargets: [{ repoId: target.repoId, baseRef: target.baseRef, branchName: "calculator-cli-validation", targetScopeMd: "CLI validation scenarios." }]
  }
];
fs.writeFileSync(process.env.POOL_RESULT_PATH, JSON.stringify({
  outcome: "followup_created",
  summaryMd: "Created a bounded calculator delivery slice from the goal.",
  followupTickets
}));
`,
  );
}

function writeDeveloperAgent(developerAgentPath) {
  writeFileSync(
    developerAgentPath,
    `const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const worktree = process.env.POOL_WORKTREE_PATH;
fs.mkdirSync(path.join(worktree, "bin"), { recursive: true });
fs.mkdirSync(path.join(worktree, "test"), { recursive: true });
fs.writeFileSync(path.join(worktree, "bin", "calc.mjs"), \`#!/usr/bin/env node
const [, , operation, leftRaw, rightRaw] = process.argv;
const left = Number(leftRaw);
const right = Number(rightRaw);
if (!operation || !Number.isFinite(left) || !Number.isFinite(right)) {
  console.error("Usage: calc <add|sub|mul|div> <left> <right>");
  process.exit(1);
}
const operations = {
  add: (a, b) => a + b,
  sub: (a, b) => a - b,
  mul: (a, b) => a * b,
  div: (a, b) => {
    if (b === 0) throw new Error("Cannot divide by zero");
    return a / b;
  },
};
if (!operations[operation]) {
  console.error(\\\`Unknown operation: \\\${operation}\\\`);
  process.exit(1);
}
try {
  console.log(String(operations[operation](left, right)));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
\`);
fs.writeFileSync(path.join(worktree, "test", "calculator.test.mjs"), \`import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const cli = new URL("../bin/calc.mjs", import.meta.url).pathname;
function calc(args) {
  return execFileSync(process.execPath, [cli, ...args], { encoding: "utf8" }).trim();
}

assert.equal(calc(["add", "2", "3"]), "5");
assert.equal(calc(["sub", "7", "4"]), "3");
assert.equal(calc(["mul", "6", "5"]), "30");
assert.equal(calc(["div", "8", "2"]), "4");
\`);
execFileSync("npm", ["test"], { cwd: worktree, stdio: "inherit" });
execFileSync("git", ["-C", worktree, "add", "-A"]);
execFileSync("git", ["-C", worktree, "commit", "-m", "Implement calculator CLI"], { stdio: "ignore" });
fs.writeFileSync(process.env.POOL_RESULT_PATH, JSON.stringify({
  outcome: "completed",
  summaryMd: "Implemented and tested the calculator CLI."
}));
`,
  );
}

function runCalculator(calculatorPath, args) {
  return execFileSync(process.execPath, [calculatorPath, ...args], { encoding: "utf8" }).trim();
}

function quote(value) {
  return `"${String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function silentLogger() {
  return {
    info() {},
    warn() {},
    error() {},
  };
}
