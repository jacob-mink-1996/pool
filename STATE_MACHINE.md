# State Machine

## Purpose

Pool needs a richer state machine than a simple Kanban board in order to
govern autonomous work safely.

The UI may group states for simplicity, but the engine should preserve the
true sub-state.

## Canonical Ticket States

- `DRAFT`
- `PROPOSED`
- `READY`
- `WORKING`
- `REVIEWING`
- `VALIDATING`
- `REWORK`
- `BLOCKED`
- `READY_TO_MERGE`
- `MERGING`
- `DONE`
- `CANCELLED`

## State Meanings

### `DRAFT`

Work item is incomplete and not yet eligible for execution.

### `PROPOSED`

Ticket was proposed, often by an agent, and awaits acceptance into backlog.

### `READY`

Ticket is well-formed, unblocked, and eligible for pickup.

### `WORKING`

An implementation lane currently owns the ticket.

### `REVIEWING`

Implementation claims completion and is awaiting reviewer evaluation.

### `VALIDATING`

Required checks are running or pending.

### `REWORK`

Review or validation produced actionable findings; the ticket loops back to
implementation with concrete follow-up.

### `BLOCKED`

Progress cannot continue without a missing dependency, human decision,
environment repair, or policy override.

### `READY_TO_MERGE`

The ticket has sufficient evidence to enter the merge path.

### `MERGING`

The integrator lane or control plane is applying the change back to the
target branch or branches.

### `DONE`

Merge succeeded and the ticket is complete.

### `CANCELLED`

The ticket was intentionally abandoned or superseded.

## Execution Outcomes

Every execution should end in one of these outcomes:

- `completed`
- `needs_continue`
- `blocked`
- `followup_created`
- `failed`

## Routing Rules

### If outcome is `completed`

- move from `WORKING` to `REVIEWING`
- do not trust the implementer alone

### If outcome is `needs_continue`

- remain in `WORKING`
- increment iteration count
- record:
  - what remains
  - why the ticket is not complete
  - what evidence is expected next

### If outcome is `blocked`

- move to `BLOCKED`
- classify blocker:
  - `needs_human_input`
  - `needs_dependency`
  - `needs_environment_fix`
  - `needs_policy_override`

### If outcome is `followup_created`

- keep parent ticket in current or follow-on state based on execution summary
- create linked child ticket in `PROPOSED` or `READY` according to policy

### If outcome is `failed`

- remain in `WORKING` or move to `BLOCKED` based on failure class
- preserve failure evidence

## Review Transitions

- `REVIEWING` -> `VALIDATING`
  - reviewer passed
- `REVIEWING` -> `REWORK`
  - reviewer failed
- `REVIEWING` -> `BLOCKED`
  - reviewer cannot proceed due to ambiguity or environment issue

## Validation Transitions

- `VALIDATING` -> `READY_TO_MERGE`
  - required checks passed
- `VALIDATING` -> `REWORK`
  - checks failed with actionable findings
- `VALIDATING` -> `BLOCKED`
  - validation infrastructure or environment is broken

## Merge Transitions

- `READY_TO_MERGE` -> `MERGING`
- `MERGING` -> `DONE`
  - merge succeeded
- `MERGING` -> `REWORK`
  - merge conflict or follow-up integration issue requires additional changes
- `MERGING` -> `BLOCKED`
  - merge could not proceed due to policy or repo state

## Board Mapping

Suggested user-facing column mapping:

- Backlog:
  - `DRAFT`
  - `PROPOSED`
  - `READY`
- Working:
  - `WORKING`
  - `REVIEWING`
  - `VALIDATING`
  - `REWORK`
- Blocked:
  - `BLOCKED`
- Done:
  - `DONE`
  - optionally `CANCELLED`

If the richer state is visible directly, that is acceptable and may be better
for operator comprehension.
