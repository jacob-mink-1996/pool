import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { basename, resolve } from "node:path";

await main().then(
  () => process.exit(0),
  (error) => {
    console.error(error.stack || error.message || String(error));
    process.exit(1);
  },
);

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  const baseUrl = args.baseUrl || process.env.POOL_BASE_URL || "http://127.0.0.1:4318";
  const workspaceRoot = args.workspaceRoot ? resolve(args.workspaceRoot) : process.cwd();
  const repoPath = args.repoPath ? resolve(args.repoPath) : workspaceRoot;
  const repoSlug = args.repoSlug || slugify(basename(repoPath)) || "pool-project";
  const projectName = args.projectName || humanizeSlug(repoSlug);
  const projectSlug = args.projectSlug || slugify(projectName) || repoSlug;
  const defaultBranch = args.defaultBranch || "main";
  const projectDescription = args.projectDescription || "Pool-managed autonomous delivery project.";
  const ciCommand = args.ciCommand || "npm test";
  const humanApproval = parseBooleanFlag(args.humanApprovalBeforeMerge, false);

  if (!existsSync(repoPath)) {
    throw new Error(`Repo path does not exist: ${repoPath}`);
  }

  const project = await ensureProject({
    baseUrl,
    projectName,
    projectSlug,
    projectDescription,
    workspaceRoot,
    defaultBranch,
  });
  const repo = await ensurePrimaryRepo({
    baseUrl,
    projectId: project.id,
    repoPath,
    repoSlug,
    defaultBranch,
  });

  await patchProjectPolicy({
    baseUrl,
    projectId: project.id,
    humanApproval,
  });

  await patchRoleProfiles({
    baseUrl,
    projectId: project.id,
    ciCommand,
  });

  const projectSummary = await fetchJson(`${baseUrl}/api/v1/projects/${project.id}`);
  const repos = await fetchJson(`${baseUrl}/api/v1/projects/${project.id}/repos`);
  const policy = await fetchJson(`${baseUrl}/api/v1/projects/${project.id}/policy`);
  const profiles = await fetchJson(`${baseUrl}/api/v1/projects/${project.id}/agent-profiles`);

  assert.equal(projectSummary.project.id, project.id);
  assert.equal(repos.repos.some((item) => item.id === repo.id), true);
  assert.equal(policy.policy.requiredValidationCommandProfileForMerge, "ci");
  assert.equal(profiles.profiles.some((item) => item.role === "developer"), true);

  console.log(`Bootstrapped Pool project ${projectSummary.project.name} (${projectSummary.project.id})`);
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Workspace: ${projectSummary.project.workspaceRoot}`);
  console.log(`Primary repo: ${repo.name} (${repo.localPath})`);
  console.log(`Default branch: ${repo.defaultBranch}`);
  console.log(`Merge approval required: ${policy.policy.requireHumanApprovalBeforeMerge ? "yes" : "no"}`);
  console.log(`Validation profile required for merge: ${policy.policy.requiredValidationCommandProfileForMerge}`);
  console.log("");
  console.log("Next steps:");
  console.log(`- open ${baseUrl}/`);
  console.log(`- run a ticket through Mission Control or use npm run verify:mvp for the seeded demo harness`);
}

async function ensureProject({
  baseUrl,
  projectName,
  projectSlug,
  projectDescription,
  workspaceRoot,
  defaultBranch,
}) {
  const projects = await fetchJson(`${baseUrl}/api/v1/projects`);
  const existing = projects.projects.find((item) => item.slug === projectSlug);
  if (existing) {
    const updated = await fetchJson(`${baseUrl}/api/v1/projects/${existing.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: projectName,
        description: projectDescription,
        workspaceRoot,
        defaultBaseBranch: defaultBranch,
      }),
    });
    return updated.project;
  }

  const created = await fetchJson(`${baseUrl}/api/v1/projects`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: projectName,
      slug: projectSlug,
      description: projectDescription,
      workspaceRoot,
      defaultBaseBranch: defaultBranch,
    }),
  });
  return created.project;
}

async function ensurePrimaryRepo({ baseUrl, projectId, repoPath, repoSlug, defaultBranch }) {
  const repos = await fetchJson(`${baseUrl}/api/v1/projects/${projectId}/repos`);
  const existing = repos.repos.find((item) => item.slug === repoSlug || item.localPath === repoPath || item.isPrimary);
  if (existing) {
    const updated = await fetchJson(`${baseUrl}/api/v1/projects/${projectId}/repos/${existing.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: humanizeSlug(repoSlug),
        localPath: repoPath,
        remoteUrl: "",
        defaultBranch,
        isPrimary: true,
      }),
    });
    return updated.repo;
  }

  const created = await fetchJson(`${baseUrl}/api/v1/projects/${projectId}/repos`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: humanizeSlug(repoSlug),
      slug: repoSlug,
      localPath: repoPath,
      remoteUrl: "",
      defaultBranch,
      isPrimary: true,
    }),
  });
  return created.repo;
}

async function patchProjectPolicy({ baseUrl, projectId, humanApproval }) {
  await fetchJson(`${baseUrl}/api/v1/projects/${projectId}/policy`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      requireReviewer: true,
      requireValidator: true,
      requireHumanApprovalBeforeMerge: humanApproval,
      requiredValidationCommandProfileForMerge: "ci",
      maxParallelExecutions: 3,
      maxParallelMerges: 1,
      maxAutoContinueIterations: 5,
      agentCreatedTicketDefaultState: "READY",
    }),
  });
}

async function patchRoleProfiles({ baseUrl, projectId, ciCommand }) {
  await fetchJson(`${baseUrl}/api/v1/projects/${projectId}/agent-profiles/developer`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      adapter: "codex",
      model: "default",
      config: {},
    }),
  });
  await fetchJson(`${baseUrl}/api/v1/projects/${projectId}/agent-profiles/reviewer`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      adapter: "codex",
      model: "default",
      config: {},
    }),
  });
  await fetchJson(`${baseUrl}/api/v1/projects/${projectId}/agent-profiles/validator`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      adapter: "shell",
      model: "fixture",
      config: {
        command: `"${process.execPath}" -e "const fs=require('node:fs'); const context=JSON.parse(fs.readFileSync(process.env.POOL_CONTEXT_PATH,'utf8')); const repoIds=(context.execution?.worktrees||[]).map((worktree)=>worktree.repoId).filter(Boolean); fs.writeFileSync(process.env.POOL_RESULT_PATH, JSON.stringify({ outcome: 'completed', summaryMd: 'Validator execution completed.', validation: { verdict: 'passed', summaryMd: 'Validation checks passed.', commandProfile: 'ci', commands: ['${escapeSingleQuoted(ciCommand)}'], repoIds, artifacts: [{ kind: 'log', label: 'Validation output', uri: 'file:///tmp/pool-validation.log' }] } }));"`,
      },
    }),
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

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const entry = argv[index];
    if (entry === "--help" || entry === "-h") {
      parsed.help = true;
      continue;
    }
    if (!entry.startsWith("--")) {
      continue;
    }
    const [rawKey, inlineValue] = entry.slice(2).split("=", 2);
    const key = rawKey.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    if (inlineValue !== undefined) {
      parsed[key] = inlineValue;
      continue;
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = "true";
      continue;
    }
    parsed[key] = next;
    index += 1;
  }
  return parsed;
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function humanizeSlug(value) {
  return String(value || "")
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function parseBooleanFlag(value, fallback) {
  if (value === undefined) {
    return fallback;
  }
  return !/^(false|0|no)$/i.test(String(value));
}

function escapeSingleQuoted(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function printHelp() {
  console.log(`Pool project bootstrap

Usage:
  node scripts/bootstrap-project.mjs --repo-path /path/to/repo [options]

Options:
  --base-url URL
  --repo-path PATH
  --workspace-root PATH
  --project-name NAME
  --project-slug SLUG
  --project-description TEXT
  --repo-slug SLUG
  --default-branch BRANCH
  --ci-command "npm test"
  --human-approval-before-merge true|false
`);
}
