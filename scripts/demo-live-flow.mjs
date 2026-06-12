const baseUrl = process.env.FLOOP_BASE_URL || "http://127.0.0.1:4318";
const projectId = process.env.FLOOP_DEMO_PROJECT_ID || "project_floop";

async function main() {
  const projects = await fetchJson(`${baseUrl}/api/v1/projects`);
  const project = (projects.projects || []).find((item) => item.id === projectId);
  if (!project) {
    throw new Error(`Project ${projectId} was not found at ${baseUrl}`);
  }

  if ((project.policy?.maxParallelExecutions || 1) < 10) {
    await fetchJson(`${baseUrl}/api/v1/projects/${projectId}/policy`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        maxParallelExecutions: 10,
      }),
    });
  }

  const reposPayload = await fetchJson(`${baseUrl}/api/v1/projects/${projectId}/repos`);
  const repo = reposPayload.repos?.[0];
  if (!repo) {
    throw new Error(`Project ${projectId} has no repos to target`);
  }

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

  const runId = Date.now();
  const createdTicket = await fetchJson(`${baseUrl}/api/v1/projects/${projectId}/tickets`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: `Live operator demo ${runId}`,
      brief: "Exercise the full Mission Control lane flow with durable evidence.",
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

  const ticket = createdTicket.ticket;
  console.log(`Created ${ticket.key} (${ticket.id})`);

  const executionResponse = await fetchJson(
    `${baseUrl}/api/v1/projects/${projectId}/tickets/${ticket.id}/executions`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        role: "developer",
        reason: "Drive a live Mission Control operator demo.",
      }),
    },
  );
  const execution = executionResponse.execution;
  console.log(`Started execution ${execution.id}`);

  await fetchJson(`${baseUrl}/api/v1/projects/${projectId}/executions/${execution.id}/complete`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      outcome: "completed",
      summaryMd: "Execution completed with demo evidence attached.",
      artifacts: [
        {
          kind: "patch",
          label: "Demo implementation diff",
          uri: `file:///tmp/${ticket.key.toLowerCase()}-demo.patch`,
        },
      ],
    }),
  });
  console.log(`Completed execution ${execution.id}`);

  const review = await fetchJson(`${baseUrl}/api/v1/projects/${projectId}/tickets/${ticket.id}/reviews`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      executionId: execution.id,
      verdict: "passed",
      summaryMd: "Review passed for the live operator demo.",
      artifacts: [
        {
          kind: "report",
          label: "Demo reviewer notes",
          uri: `file:///tmp/${ticket.key.toLowerCase()}-review.md`,
        },
      ],
    }),
  });
  console.log(`Recorded review ${review.review.id}`);

  const validation = await fetchJson(`${baseUrl}/api/v1/projects/${projectId}/tickets/${ticket.id}/validations`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      repoIds: [repo.id],
      commandProfile: "ci",
      commands: ["npm test"],
      verdict: "passed",
      summaryMd: "Validation passed for the live operator demo.",
      artifacts: [
        {
          kind: "log",
          label: "Demo validation output",
          uri: `file:///tmp/${ticket.key.toLowerCase()}-validation.log`,
        },
      ],
    }),
  });
  console.log(`Recorded validation ${validation.validations?.[0]?.id || "unknown"}`);

  const merge = await fetchJson(`${baseUrl}/api/v1/projects/${projectId}/tickets/${ticket.id}/merge`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      strategy: "squash",
      status: "completed",
      approvedByKind: "human",
      approvedByRef: "demo-script",
      summaryMd: "Merged by the live operator demo script.",
      artifacts: [
        {
          kind: "record",
          label: "Demo merge record",
          uri: `https://example.invalid/floop/${ticket.key.toLowerCase()}/merge`,
        },
      ],
    }),
  });
  console.log(`Recorded merge ${merge.merge?.latestRun?.id || "unknown"}`);

  await waitForEvent(observedEvents, ticket.id, "merge.completed");
  streamController.abort();
  await streamPromise.catch(() => {});

  const ticketPayload = await fetchJson(`${baseUrl}/api/v1/projects/${projectId}/tickets/${ticket.id}`);
  const finalTicket = ticketPayload.ticket;
  const matchingEvents = observedEvents.filter((event) => event.ticketId === ticket.id);

  console.log("");
  console.log(`Demo flow complete for ${finalTicket.key}`);
  console.log(`Final state: ${finalTicket.state}`);
  console.log(`Artifacts recorded: ${finalTicket.artifacts.length}`);
  console.log(
    `Observed live events: ${matchingEvents.map((event) => `${event.type}${event.sequence ? `#${event.sequence}` : ""}`).join(", ")}`,
  );
}

async function watchProjectStream({ baseUrl, projectId, signal, onEvent }) {
  const response = await fetch(`${baseUrl}/api/v1/projects/${projectId}/events/stream?limit=40`, { signal });
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
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";
    for (const part of parts) {
      const parsed = parseSseChunk(part);
      if (parsed.event === "event" && parsed.data) {
        onEvent(parsed.data);
      }
    }
  }
}

function parseSseChunk(chunk) {
  const lines = chunk.split("\n");
  let event = "message";
  const data = [];
  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      data.push(line.slice(5).trim());
    }
  }

  return {
    event,
    data: data.length ? JSON.parse(data.join("\n")) : null,
  };
}

async function waitForEvent(events, ticketId, type, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (events.some((event) => event.ticketId === ticketId && event.type === type)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${type} on ${ticketId}`);
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || payload.error || `Request failed: ${response.status}`);
  }
  return payload;
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
