import http from "node:http";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname } from "node:path";
import { isTicketState } from "../../../packages/domain/src/index.mjs";
import {
  parseAddDependencyInput,
  parseCompleteExecutionInput,
  parseContinueExecutionInput,
  parseCreateReviewInput,
  parseCreateExecutionInput,
  parseMergeTicketInput,
  parseCreateProjectInput,
  parseCreateRepoInput,
  parseCreateTicketInput,
  parseCreateValidationInput,
  parseUpdateProjectPolicyInput,
  parseTicketTransitionInput,
  parseUpdateProjectInput,
  parseUpdateRepoInput,
  parseUpdateRoleProfileInput,
  parseUpdateTicketInput,
} from "../../../packages/contracts/src/index.mjs";
import { createStore } from "./store.mjs";

const webAssets = loadWebAssets();

export function createPoolServer(options = {}) {
  const store = options.store || createStore();

  return http.createServer(async (request, response) => {
    try {
      if (request.method === "OPTIONS") {
        response.writeHead(204, corsHeaders());
        response.end();
        return;
      }

      const url = new URL(
        request.url,
        `http://${request.headers.host || `${options.host || "127.0.0.1"}:${options.port || "4318"}`}`,
      );
      if (serveWebSurface(request, response, url)) {
        return;
      }

      const route = matchRoute(request.method || "GET", url.pathname);
      if (!route) {
        sendJson(response, 404, { error: "not_found" });
        return;
      }

      if (route.name === "eventStream") {
        await streamProjectEvents(request, response, route, url, store);
        return;
      }

      const body = await readJsonBody(request);
      const result = handleRoute(route, url, body, store);
      sendJson(response, result.status, result.body);
    } catch (error) {
      const status = error instanceof RequestError ? error.status : inferErrorStatus(error);
      const reasonCode = error instanceof RequestError ? error.reasonCode : inferErrorReasonCode(error);
      sendJson(response, status, {
        error: status === 500 ? "internal_error" : status === 409 ? "conflict" : "bad_request",
        message: error instanceof Error ? error.message : String(error),
        ...(reasonCode ? { reasonCode } : {}),
      });
    }
  });
}

function handleRoute(route, url, body, store) {
  switch (route.name) {
    case "health":
      return {
        status: 200,
        body: {
          ok: true,
          service: "pool-api",
          now: new Date().toISOString(),
        },
      };
    case "meta":
      return {
        status: 200,
        body: {
          name: "Pool",
          version: "0.0.1",
          mode: "mvp",
          product: true,
          workspaceRoot: process.cwd(),
        },
      };
    case "projects":
      if (route.method === "GET") {
        return { status: 200, body: { projects: store.listProjects() } };
      }
      return { status: 201, body: { project: store.createProject(parseCreateProjectInput(body)) } };
    case "project":
      if (route.method === "GET") {
        return respondMaybe(store.getProjectSummary(route.params.projectId), "project");
      }
      if (route.method === "DELETE") {
        return respondMaybe(store.deleteProject(route.params.projectId), "project");
      }
      return respondMaybe(
        store.updateProject(route.params.projectId, parseUpdateProjectInput(body)),
        "project",
      );
    case "projectPolicy":
      if (route.method === "GET") {
        return respondMaybe(store.getProjectPolicy(route.params.projectId), "policy");
      }
      return respondMaybe(
        store.updateProjectPolicy(route.params.projectId, parseUpdateProjectPolicyInput(body)),
        "policy",
      );
    case "projectBoard":
      return respondMaybe(
        store.getProjectBoard(route.params.projectId, parseTicketFilters(url)),
        "board",
      );
    case "projectMergeQueue":
      {
        const queue = store.listMergeQueue(route.params.projectId);
        if (!queue) {
          return { status: 404, body: { error: "not_found" } };
        }
        return { status: 200, body: { queue } };
      }
    case "projectAgentProfiles":
      {
        const profiles = store.listRoleProfiles(route.params.projectId);
        if (!profiles) {
          return { status: 404, body: { error: "not_found" } };
        }
        return { status: 200, body: { profiles } };
      }
    case "projectAgentProfile":
      return respondMaybe(
        store.updateRoleProfile(
          route.params.projectId,
          route.params.role,
          parseUpdateRoleProfileInput(body),
        ),
        "profile",
      );
    case "repos":
      if (route.method === "GET") {
        return { status: 200, body: { repos: store.listRepos(route.params.projectId) } };
      }
      return {
        status: 201,
        body: { repo: store.createRepo(route.params.projectId, parseCreateRepoInput(body)) },
      };
    case "repo":
      return respondMaybe(
        store.updateRepo(route.params.projectId, route.params.repoId, parseUpdateRepoInput(body)),
        "repo",
      );
    case "tickets":
      if (route.method === "GET") {
        return {
          status: 200,
          body: { tickets: store.listTickets(route.params.projectId, parseTicketFilters(url)) },
        };
      }
      return {
        status: 201,
        body: { ticket: store.createTicket(route.params.projectId, parseCreateTicketInput(body)) },
      };
    case "ticket":
      return respondMaybe(store.getTicket(route.params.projectId, route.params.ticketId), "ticket");
    case "ticketUpdate":
      return respondMaybe(
        store.updateTicket(route.params.projectId, route.params.ticketId, parseUpdateTicketInput(body)),
        "ticket",
      );
    case "ticketDependencies":
      {
        const input = parseAddDependencyInput(body);
        if (input.blockingTicketId === route.params.ticketId) {
          throw new RequestError(400, "A ticket cannot depend on itself");
        }
        return respondMaybe(
          store.addDependency(route.params.projectId, route.params.ticketId, input),
          "ticket",
        );
      }
    case "ticketDependency":
      return respondMaybe(
        store.removeDependency(
          route.params.projectId,
          route.params.ticketId,
          route.params.dependencyId,
        ),
        "ticket",
      );
    case "ticketTransition":
      return respondMaybe(
        store.transitionTicket(
          route.params.projectId,
          route.params.ticketId,
          parseTicketTransitionInput(body),
        ),
        "ticket",
      );
    case "ticketRestart":
      return respondMaybe(
        store.restartTicket(route.params.projectId, route.params.ticketId, body || {}),
        "ticket",
      );
    case "ticketExecutions":
      if (route.method === "GET") {
        const executions = store.listExecutions(route.params.projectId, route.params.ticketId);
        if (!executions) {
          return { status: 404, body: { error: "not_found" } };
        }
        return { status: 200, body: { executions } };
      }
      return respondCreated(
        store.createExecution(
          route.params.projectId,
          route.params.ticketId,
          parseCreateExecutionInput(body),
        ),
        "execution",
      );
    case "ticketReviews":
      if (route.method === "GET") {
        const reviews = store.listReviews(route.params.projectId, route.params.ticketId);
        if (!reviews) {
          return { status: 404, body: { error: "not_found" } };
        }
        return { status: 200, body: { reviews } };
      }
      return respondCreated(
        store.createReview(
          route.params.projectId,
          route.params.ticketId,
          parseCreateReviewInput(body),
        ),
        "review",
      );
    case "ticketValidations":
      if (route.method === "GET") {
        const validations = store.listValidations(route.params.projectId, route.params.ticketId);
        if (!validations) {
          return { status: 404, body: { error: "not_found" } };
        }
        return { status: 200, body: { validations } };
      }
      return respondCreated(
        store.createValidation(
          route.params.projectId,
          route.params.ticketId,
          parseCreateValidationInput(body),
        ),
        "validations",
      );
    case "ticketMerge":
      if (route.method === "GET") {
        return respondMaybe(store.getMergeStatus(route.params.projectId, route.params.ticketId), "merge");
      }
      try {
        return respondMaybe(
          store.mergeTicket(
            route.params.projectId,
            route.params.ticketId,
            parseMergeTicketInput(body),
          ),
          "merge",
        );
      } catch (error) {
        const status = inferErrorStatus(error);
        if (status === 409) {
          const mergeStatus = store.getMergeStatus(route.params.projectId, route.params.ticketId);
          return {
            status,
            body: {
              error: "conflict",
              message: error instanceof Error ? error.message : String(error),
              reasonCode: currentMergeReasonCode(mergeStatus),
              merge: mergeStatus,
            },
          };
        }
        throw error;
      }
    case "execution":
      return respondMaybe(store.getExecution(route.params.projectId, route.params.executionId), "execution");
    case "executionComplete":
      return respondMaybe(
        store.completeExecution(
          route.params.projectId,
          route.params.executionId,
          parseCompleteExecutionInput(body),
        ),
        "execution",
      );
    case "executionContinue":
      return respondMaybe(
        store.continueExecution(
          route.params.projectId,
          route.params.executionId,
          parseContinueExecutionInput(body),
        ),
        "execution",
      );
    case "executionCancel":
      return respondMaybe(
        store.cancelExecution(route.params.projectId, route.params.executionId, body || {}),
        "execution",
      );
    case "worktrees":
      return {
        status: 200,
        body: { worktrees: store.listWorktrees(route.params.projectId, parseWorktreeFilters(url)) },
      };
    case "worktreeClean":
      return respondMaybe(
        store.cleanWorktree(route.params.projectId, route.params.worktreeId, body || {}),
        "worktree",
      );
    case "events":
      return {
        status: 200,
        body: { events: store.listEvents(route.params.projectId, parseEventFilters(url)) },
      };
    case "artifacts":
      return {
        status: 200,
        body: { artifacts: store.listArtifacts(route.params.projectId, parseArtifactFilters(url)) },
      };
    default:
      return { status: 404, body: { error: "not_found" } };
  }
}

function parseTicketFilters(url) {
  const filters = {};
  const statesParam = url.searchParams.get("state");
  if (statesParam) {
    const states = statesParam
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    for (const state of states) {
      if (!isTicketState(state)) {
        throw new RequestError(400, `Invalid ticket state filter: ${state}`);
      }
    }
    filters.states = states;
  }

  const priority = url.searchParams.get("priority");
  if (priority) {
    filters.priority = priority.trim();
  }

  const assignedRole = url.searchParams.get("assignedRole");
  if (assignedRole) {
    filters.assignedRole = assignedRole.trim();
  }

  const search = url.searchParams.get("search");
  if (search) {
    filters.search = search.trim();
  }

  const parentTicketId = url.searchParams.get("parentTicketId");
  if (parentTicketId) {
    filters.parentTicketId = parentTicketId.trim();
  }

  return filters;
}

function parseWorktreeFilters(url) {
  const filters = {};

  const ticketId = url.searchParams.get("ticketId");
  if (ticketId) {
    filters.ticketId = ticketId.trim();
  }

  const executionId = url.searchParams.get("executionId");
  if (executionId) {
    filters.executionId = executionId.trim();
  }

  const status = url.searchParams.get("status");
  if (status) {
    filters.status = status.trim();
  }

  return filters;
}

function parseEventFilters(url) {
  const filters = {};

  const ticketId = url.searchParams.get("ticketId");
  if (ticketId) {
    filters.ticketId = ticketId.trim();
  }

  const repoId = url.searchParams.get("repoId");
  if (repoId) {
    filters.repoId = repoId.trim();
  }

  const type = url.searchParams.get("type");
  if (type) {
    filters.type = type.trim();
  }

  const order = url.searchParams.get("order");
  if (order) {
    if (order !== "asc" && order !== "desc") {
      throw new RequestError(400, `Invalid event order filter: ${order}`);
    }
    filters.order = order;
  }

  const limit = url.searchParams.get("limit");
  if (limit) {
    const parsedLimit = Number.parseInt(limit, 10);
    if (!Number.isInteger(parsedLimit) || parsedLimit <= 0) {
      throw new RequestError(400, `Invalid event limit filter: ${limit}`);
    }
    filters.limit = parsedLimit;
  }

  return filters;
}

async function streamProjectEvents(request, response, route, url, store) {
  if (!store.getProjectSummary(route.params.projectId)) {
    sendJson(response, 404, { error: "not_found" });
    return;
  }

  const filters = {
    ...parseEventFilters(url),
    order: "asc",
    limit: Math.min(parseEventFilters(url).limit || 100, 200),
  };
  const seenEventIds = new Set();

  response.writeHead(200, {
    ...corsHeaders(),
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
  });

  const initialEvents = store.listEvents(route.params.projectId, filters);
  for (const event of initialEvents) {
    seenEventIds.add(event.id);
  }
  writeSseEvent(response, "snapshot", { events: initialEvents });

  const pollTimer = setInterval(() => {
    const nextEvents = store
      .listEvents(route.params.projectId, filters)
      .filter((event) => !seenEventIds.has(event.id));
    for (const event of nextEvents) {
      seenEventIds.add(event.id);
      writeSseEvent(response, "event", event);
    }
  }, 500);
  pollTimer.unref?.();

  const heartbeatTimer = setInterval(() => {
    writeSseEvent(response, "heartbeat", { now: new Date().toISOString() });
  }, 15000);
  heartbeatTimer.unref?.();

  const cleanup = () => {
    clearInterval(pollTimer);
    clearInterval(heartbeatTimer);
    if (!response.writableEnded) {
      response.end();
    }
  };

  request.on("close", cleanup);
  request.on("error", cleanup);
}

function parseArtifactFilters(url) {
  const filters = {};

  for (const key of ["ticketId", "executionId", "reviewId", "validationRunId", "mergeRunId", "kind"]) {
    const value = url.searchParams.get(key);
    if (value) {
      filters[key] = value.trim();
    }
  }

  const limit = url.searchParams.get("limit");
  if (limit) {
    const parsedLimit = Number.parseInt(limit, 10);
    if (!Number.isInteger(parsedLimit) || parsedLimit <= 0) {
      throw new RequestError(400, `Invalid artifact limit filter: ${limit}`);
    }
    filters.limit = parsedLimit;
  }

  return filters;
}

function respondMaybe(value, key) {
  if (!value) {
    return { status: 404, body: { error: "not_found" } };
  }
  return { status: 200, body: { [key]: value } };
}

function respondCreated(value, key) {
  if (!value) {
    return { status: 404, body: { error: "not_found" } };
  }
  return { status: 201, body: { [key]: value } };
}

async function readJsonBody(request) {
  if (request.method === "GET" || request.method === "HEAD") {
    return null;
  }

  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return null;
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    throw new RequestError(
      400,
      error instanceof Error ? `Invalid JSON body: ${error.message}` : "Invalid JSON body",
    );
  }
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    ...corsHeaders(),
    "content-type": "application/json; charset=utf-8",
  });
  response.end(`${JSON.stringify(body, null, 2)}\n`);
}

function sendText(response, status, body, contentType, method = "GET", extraHeaders = {}) {
  response.writeHead(status, {
    ...corsHeaders(),
    "content-type": contentType,
    ...extraHeaders,
  });
  response.end(method === "HEAD" ? "" : body);
}

function writeSseEvent(response, event, payload) {
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function currentMergeReasonCode(mergeStatus) {
  if (!mergeStatus) {
    return "merge_conflict";
  }
  if (mergeStatus.blockingReasons?.length) {
    return mergeStatus.blockingReasons[0].code;
  }
  if (mergeStatus.approval?.required && !mergeStatus.approval?.satisfied) {
    return "human_approval_required";
  }
  if (mergeStatus.readiness) {
    return `merge_${mergeStatus.readiness}`;
  }
  return "merge_conflict";
}

function inferErrorReasonCode(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith("Unknown execution for ticket ")) return "unknown_execution";
  if (message.startsWith("Execution already running for ")) return "execution_already_running";
  if (message.startsWith("Project execution limit reached for ")) return "execution_capacity_reached";
  if (message.startsWith("Project merge limit reached for ")) return "merge_capacity_reached";
  if (message.includes(" reached the continuation limit of ")) return "execution_continue_limit_reached";
  if (message.includes(" must be finished before review")) return "review_execution_not_finished";
  if (message.includes(" must complete successfully before review")) return "review_execution_not_completed";
  if (message.includes(" must be finished before validation")) return "validation_execution_not_finished";
  if (message.includes(" must complete successfully before validation")) return "validation_execution_not_completed";
  if (message.includes(" is not ready for review")) return "ticket_not_ready_for_review";
  if (message.includes(" is not ready for validation")) return "ticket_not_ready_for_validation";
  if (message.includes(" is not ready for merge")) return "ticket_not_ready";
  if (message.includes(" requires human approval before merge")) return "human_approval_required";
  if (message.includes("Latest review must pass before merge")) return "review_required";
  if (message.includes("Latest validation must pass before merge")) return "validation_required";
  if (message.includes("Latest validation must use ")) return "validation_profile_required";
  if (message === "Cannot clean an active worktree") return "worktree_active";
  return "";
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers": "content-type",
  };
}

function serveWebSurface(request, response, url) {
  const method = request.method || "GET";
  if (method !== "GET" && method !== "HEAD") {
    return false;
  }

  const assetPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const asset = webAssets.get(assetPath);
  if (asset) {
    sendText(response, 200, asset.body, asset.contentType, method, {
      "cache-control": "no-store",
    });
    return true;
  }

  return false;
}

function loadWebAssets() {
  const reactBuildRoot = new URL("../../../apps/web-react/dist/", import.meta.url);
  if (!existsSync(reactBuildRoot)) {
    throw new Error("Missing apps/web-react/dist. Run npm run build:web before starting the API.");
  }

  const assets = new Map();
  walkWebAssetTree(reactBuildRoot, "", assets);
  return assets;
}

function walkWebAssetTree(directoryUrl, prefix, assets) {
  for (const entry of readdirSync(directoryUrl, { withFileTypes: true })) {
    const childUrl = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directoryUrl);
    const childPath = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      walkWebAssetTree(childUrl, childPath, assets);
      continue;
    }

    assets.set(childPath, {
      body: readFileSync(childUrl, "utf8"),
      contentType: contentTypeForExtension(extname(entry.name)),
    });
  }
}

function contentTypeForExtension(extension) {
  switch (extension) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".ico":
      return "image/x-icon";
    default:
      return "text/plain; charset=utf-8";
  }
}

function matchRoute(method, pathname) {
  const routes = [
    { method: "GET", pattern: /^\/api\/v1\/health$/, name: "health" },
    { method: "GET", pattern: /^\/api\/v1\/meta$/, name: "meta" },
    { method: "GET", pattern: /^\/api\/v1\/projects$/, name: "projects" },
    { method: "POST", pattern: /^\/api\/v1\/projects$/, name: "projects" },
    { method: "PATCH", pattern: /^\/api\/v1\/projects\/([^/]+)$/, name: "project", keys: ["projectId"] },
    { method: "DELETE", pattern: /^\/api\/v1\/projects\/([^/]+)$/, name: "project", keys: ["projectId"] },
    { method: "GET", pattern: /^\/api\/v1\/projects\/([^/]+)\/policy$/, name: "projectPolicy", keys: ["projectId"] },
    { method: "PATCH", pattern: /^\/api\/v1\/projects\/([^/]+)\/policy$/, name: "projectPolicy", keys: ["projectId"] },
    { method: "GET", pattern: /^\/api\/v1\/projects\/([^/]+)\/agent-profiles$/, name: "projectAgentProfiles", keys: ["projectId"] },
    { method: "PATCH", pattern: /^\/api\/v1\/projects\/([^/]+)\/agent-profiles\/([^/]+)$/, name: "projectAgentProfile", keys: ["projectId", "role"] },
    { method: "GET", pattern: /^\/api\/v1\/projects\/([^/]+)\/board$/, name: "projectBoard", keys: ["projectId"] },
    { method: "GET", pattern: /^\/api\/v1\/projects\/([^/]+)\/merge-queue$/, name: "projectMergeQueue", keys: ["projectId"] },
    { method: "GET", pattern: /^\/api\/v1\/projects\/([^/]+)$/, name: "project", keys: ["projectId"] },
    { method: "GET", pattern: /^\/api\/v1\/projects\/([^/]+)\/repos$/, name: "repos", keys: ["projectId"] },
    { method: "POST", pattern: /^\/api\/v1\/projects\/([^/]+)\/repos$/, name: "repos", keys: ["projectId"] },
    { method: "PATCH", pattern: /^\/api\/v1\/projects\/([^/]+)\/repos\/([^/]+)$/, name: "repo", keys: ["projectId", "repoId"] },
    { method: "GET", pattern: /^\/api\/v1\/projects\/([^/]+)\/tickets$/, name: "tickets", keys: ["projectId"] },
    { method: "POST", pattern: /^\/api\/v1\/projects\/([^/]+)\/tickets$/, name: "tickets", keys: ["projectId"] },
    { method: "GET", pattern: /^\/api\/v1\/projects\/([^/]+)\/tickets\/([^/]+)$/, name: "ticket", keys: ["projectId", "ticketId"] },
    { method: "PATCH", pattern: /^\/api\/v1\/projects\/([^/]+)\/tickets\/([^/]+)$/, name: "ticketUpdate", keys: ["projectId", "ticketId"] },
    { method: "GET", pattern: /^\/api\/v1\/projects\/([^/]+)\/tickets\/([^/]+)\/executions$/, name: "ticketExecutions", keys: ["projectId", "ticketId"] },
    { method: "POST", pattern: /^\/api\/v1\/projects\/([^/]+)\/tickets\/([^/]+)\/executions$/, name: "ticketExecutions", keys: ["projectId", "ticketId"] },
    { method: "GET", pattern: /^\/api\/v1\/projects\/([^/]+)\/tickets\/([^/]+)\/reviews$/, name: "ticketReviews", keys: ["projectId", "ticketId"] },
    { method: "POST", pattern: /^\/api\/v1\/projects\/([^/]+)\/tickets\/([^/]+)\/reviews$/, name: "ticketReviews", keys: ["projectId", "ticketId"] },
    { method: "GET", pattern: /^\/api\/v1\/projects\/([^/]+)\/tickets\/([^/]+)\/validations$/, name: "ticketValidations", keys: ["projectId", "ticketId"] },
    { method: "POST", pattern: /^\/api\/v1\/projects\/([^/]+)\/tickets\/([^/]+)\/validations$/, name: "ticketValidations", keys: ["projectId", "ticketId"] },
    { method: "GET", pattern: /^\/api\/v1\/projects\/([^/]+)\/tickets\/([^/]+)\/merge$/, name: "ticketMerge", keys: ["projectId", "ticketId"] },
    { method: "POST", pattern: /^\/api\/v1\/projects\/([^/]+)\/tickets\/([^/]+)\/merge$/, name: "ticketMerge", keys: ["projectId", "ticketId"] },
    { method: "POST", pattern: /^\/api\/v1\/projects\/([^/]+)\/tickets\/([^/]+)\/dependencies$/, name: "ticketDependencies", keys: ["projectId", "ticketId"] },
    { method: "DELETE", pattern: /^\/api\/v1\/projects\/([^/]+)\/tickets\/([^/]+)\/dependencies\/([^/]+)$/, name: "ticketDependency", keys: ["projectId", "ticketId", "dependencyId"] },
    { method: "POST", pattern: /^\/api\/v1\/projects\/([^/]+)\/tickets\/([^/]+)\/transition$/, name: "ticketTransition", keys: ["projectId", "ticketId"] },
    { method: "POST", pattern: /^\/api\/v1\/projects\/([^/]+)\/tickets\/([^/]+)\/restart$/, name: "ticketRestart", keys: ["projectId", "ticketId"] },
    { method: "GET", pattern: /^\/api\/v1\/projects\/([^/]+)\/executions\/([^/]+)$/, name: "execution", keys: ["projectId", "executionId"] },
    { method: "POST", pattern: /^\/api\/v1\/projects\/([^/]+)\/executions\/([^/]+)\/complete$/, name: "executionComplete", keys: ["projectId", "executionId"] },
    { method: "POST", pattern: /^\/api\/v1\/projects\/([^/]+)\/executions\/([^/]+)\/continue$/, name: "executionContinue", keys: ["projectId", "executionId"] },
    { method: "POST", pattern: /^\/api\/v1\/projects\/([^/]+)\/executions\/([^/]+)\/cancel$/, name: "executionCancel", keys: ["projectId", "executionId"] },
    { method: "GET", pattern: /^\/api\/v1\/projects\/([^/]+)\/worktrees$/, name: "worktrees", keys: ["projectId"] },
    { method: "POST", pattern: /^\/api\/v1\/projects\/([^/]+)\/worktrees\/([^/]+)\/clean$/, name: "worktreeClean", keys: ["projectId", "worktreeId"] },
    { method: "GET", pattern: /^\/api\/v1\/projects\/([^/]+)\/events$/, name: "events", keys: ["projectId"] },
    { method: "GET", pattern: /^\/api\/v1\/projects\/([^/]+)\/events\/stream$/, name: "eventStream", keys: ["projectId"] },
    { method: "GET", pattern: /^\/api\/v1\/projects\/([^/]+)\/artifacts$/, name: "artifacts", keys: ["projectId"] },
  ];

  for (const route of routes) {
    if (route.method !== method) {
      continue;
    }

    const match = pathname.match(route.pattern);
    if (!match) {
      continue;
    }

    const params = {};
    for (const [index, key] of (route.keys || []).entries()) {
      params[key] = match[index + 1];
    }
    return { name: route.name, method: route.method, params };
  }

  return null;
}

function inferErrorStatus(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("UNIQUE constraint failed")) {
    return 409;
  }
  if (message.includes("FOREIGN KEY constraint failed")) {
    return 400;
  }
  if (
    message.startsWith("Missing project policy for ") ||
    message.startsWith("Missing required field:") ||
    message.startsWith("Invalid ticket state") ||
    message.startsWith("Invalid ticket state filter:") ||
    message.startsWith("Invalid ticket priority:") ||
    message.startsWith("Invalid assigned role:") ||
    message.startsWith("Invalid execution outcome:") ||
    message.startsWith("Invalid review verdict:") ||
    message.startsWith("Invalid validation verdict:") ||
    message.startsWith("Invalid merge status:") ||
    message.startsWith("Invalid review finding severity:") ||
    message.startsWith("Invalid dependency type:") ||
    message.startsWith("Unknown repo target:") ||
    message.startsWith("Duplicate repo target:") ||
    message.startsWith("Unknown execution for ticket ") ||
    message.startsWith("Unknown validation repo target:") ||
    message.startsWith("Duplicate validation repo target:") ||
    message.startsWith("Validation repo target is not attached to ") ||
    message.startsWith("No repo targets configured for validation on ") ||
    message.startsWith("Unknown parent ticket:") ||
    message.startsWith("Parent cycle detected for ticket ") ||
    message.startsWith("Dependency cycle detected for ticket ") ||
    message.startsWith("Field ") ||
    message.startsWith("Unknown agent profile:") ||
    message.startsWith("Agent profile ") ||
    message.startsWith("No agent profile configured for role:") ||
    message.startsWith("approvedByKind and approvedByRef must be provided together") ||
    message.startsWith("Invalid artifact limit filter:") ||
    message.startsWith("Cancelled executions cannot be continued") ||
    message.startsWith("Execution must be active or marked needs_continue before continuing") ||
    message === "A ticket cannot depend on itself" ||
    message === "A ticket cannot parent itself"
  ) {
    return 400;
  }
  if (
    message.startsWith("Execution already running for ") ||
    message.startsWith("Project execution limit reached for ") ||
    message.startsWith("Project merge limit reached for ") ||
    message.includes(" reached the continuation limit of ") ||
    message === "Cannot clean an active worktree" ||
    message.startsWith("Execution execution_") ||
    message.includes(" must be finished before review") ||
    message.includes(" must complete successfully before review") ||
    message.includes(" must be finished before validation") ||
    message.includes(" must complete successfully before validation") ||
    message.includes(" is not ready for review") ||
    message.includes(" is not ready for validation") ||
    message.includes(" is not ready for merge") ||
    message.includes(" requires human approval before merge") ||
    message.includes("Latest review must pass before merge") ||
    message.includes("Latest validation must pass before merge") ||
    message.includes("Latest validation must use ")
  ) {
    return 409;
  }
  return 500;
}

class RequestError extends Error {
  constructor(status, message, reasonCode = "") {
    super(message);
    this.status = status;
    this.reasonCode = reasonCode;
  }
}
