# UI

## UI Philosophy

Floop should feel like mission control for autonomous delivery.

The operator is not chatting with a worker agent. The operator is:

- shaping backlog
- watching progress
- inspecting evidence
- approving decisions
- steering the system

## Primary Surfaces

### 1. Project Board

The board is the home screen.

Recommended columns for the first version:

- `PROPOSED`
- `READY`
- `WORKING`
- `REVIEWING`
- `VALIDATING`
- `REWORK`
- `BLOCKED`
- `READY_TO_MERGE`
- `DONE`

If that feels too wide on smaller screens, grouped views can collapse them later.

### 2. Ticket Detail

Ticket detail is the primary operational surface.

Sections:

- title and current state
- brief
- acceptance criteria
- repo targets
- dependencies
- execution timeline
- review findings
- validation results
- worktrees
- artifacts
- merge readiness

### 3. Backlog Refinement

Purpose:

- create tickets
- edit criteria
- accept agent proposals
- manage decomposition and dependencies

### 4. Merge / Approval Queue

Purpose:

- show tickets waiting on approval or integration
- show evidence for each merge candidate
- let the operator accept or reject merge

## Card Design

Each ticket card should show:

- key and title
- priority
- assigned role or current lane
- repo count
- dependency count
- latest summary
- state badge
- review/validation health badges

## Visual Priorities

- board first
- evidence second
- transcript third

Avoid making raw agent output the center of the experience.

## Mobile / Remote Considerations

Because Floop should work over Tailscale from a phone:

- board must remain readable on narrow screens
- ticket detail should stack vertically
- the operator must be able to:
  - move tickets
  - inspect state
  - read findings
  - approve or block merge

Desktop-specific detail can go deeper, but mobile should still be usable.
