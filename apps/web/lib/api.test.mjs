import test from "node:test";
import assert from "node:assert/strict";

import { ApiError, buildActivityEventsUrl, buildBoardUrl, buildEventsStreamUrl } from "./api.js";

test("buildBoardUrl includes active board filters", () => {
  const url = buildBoardUrl(
    {
      boardFilters: {
        search: "merge",
        state: "READY_TO_MERGE",
        assignedRole: "integrator",
        priority: "high",
      },
    },
    "project_pool",
  );

  assert.equal(
    url,
    "/api/v1/projects/project_pool/board?search=merge&state=READY_TO_MERGE&assignedRole=integrator&priority=high",
  );
});

test("buildActivityEventsUrl includes descending event filters", () => {
  const url = buildActivityEventsUrl(
    {
      activityFilters: {
        ticketId: "ticket_1",
        type: "execution.completed",
        limit: 40,
      },
    },
    "project_pool",
  );

  assert.equal(
    url,
    "/api/v1/projects/project_pool/events?order=desc&limit=40&ticketId=ticket_1&type=execution.completed",
  );
});

test("buildEventsStreamUrl includes live activity filters", () => {
  const url = buildEventsStreamUrl(
    {
      activityFilters: {
        ticketId: "ticket_1",
        type: "execution.completed",
        limit: 10,
      },
    },
    "project_pool",
  );

  assert.equal(
    url,
    "/api/v1/projects/project_pool/events/stream?limit=10&ticketId=ticket_1&type=execution.completed",
  );
});

test("ApiError carries response metadata", () => {
  const error = new ApiError("Merge blocked", {
    status: 409,
    payload: { reasonCode: "merge_policy_blocked" },
    url: "/api/v1/projects/project_pool/tickets/ticket_1/merge",
  });

  assert.equal(error.message, "Merge blocked");
  assert.equal(error.status, 409);
  assert.equal(error.payload.reasonCode, "merge_policy_blocked");
});
