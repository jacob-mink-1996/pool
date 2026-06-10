import test from "node:test";
import assert from "node:assert/strict";

import { buildActivityEventsUrl, buildBoardUrl } from "./api.js";

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
