import test from "node:test";
import assert from "node:assert/strict";

import {
  escapeHtml,
  laneSnapshotNote,
  mergeStatusClass,
  prettyState,
  prettyReasonCode,
  prettyReasonSource,
  roleLoadoutNote,
  slugify,
} from "./helpers.js";

test("prettyState humanizes enum-like values", () => {
  assert.equal(prettyState("READY_TO_MERGE"), "Ready To Merge");
});

test("slugify normalizes freeform names", () => {
  assert.equal(slugify("Pool Mission Control"), "pool-mission-control");
});

test("escapeHtml escapes markup-sensitive characters", () => {
  assert.equal(escapeHtml('<tag attr="1">'), "&lt;tag attr=&quot;1&quot;&gt;");
});

test("laneSnapshotNote explains the operational implication of a lane", () => {
  assert.match(laneSnapshotNote("BLOCKED"), /operator intervention/);
});

test("roleLoadoutNote explains assigned load", () => {
  assert.match(roleLoadoutNote("developer", 2), /heaviest visible load/);
});

test("prettyReasonCode humanizes structured block reasons", () => {
  assert.equal(prettyReasonCode("validation_profile_required"), "Validation profile required");
  assert.equal(prettyReasonCode("ticket_not_ready_for_validation"), "Ticket is not ready for validation");
  assert.equal(prettyReasonCode("merge_capacity_reached"), "Merge capacity reached");
});

test("prettyReasonSource humanizes structured reason sources", () => {
  assert.equal(prettyReasonSource("approval"), "Approval");
});

test("mergeStatusClass reflects latest merge state", () => {
  assert.equal(
    mergeStatusClass(
      { state: "READY_TO_MERGE" },
      {
        canMerge: true,
        latestRun: { status: "blocked" },
      },
    ),
    "blocked",
  );
});
