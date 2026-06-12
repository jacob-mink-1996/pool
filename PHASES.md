# Phases

## Current Status

Floop has passed the original MVP boundary for phases 1 through 7 in a local-first
form:

- project, repo, ticket, dependency, event, and board state persist in SQLite
- execution, review, validation, worktree, artifact, and merge records are durable
- execution and merge drivers claim work with leases and recover interrupted runs
- ceremony runs, participant fan-out, and proposal application are implemented
- React and Electron operator surfaces exist

The next phase is not more feature sprawl. It is hardening the architecture so
the current MVP can keep growing without turning the store, router, and UI shell
into bottlenecks.

## Current Refactor Plan

Goal:

Finish the greenfield Floop consolidation and then harden the architecture around
clear store, policy, migration, durability, trust, and operator-decision
boundaries.

Steps:

1. Seed/demo extraction - complete.
2. Read-model/query helper extraction - complete.
3. Project/repo command extraction - complete.
4. Ticket/dependency command extraction - complete.
5. Execution/evidence command extraction - complete.
6. Merge command extraction - complete.
7. Extract ceremony commands - complete.
8. Transition policy layer - complete.
9. Versioned migrations - complete.
10. Artifact durability contract - complete.
11. Local trust/auth model - next.
12. Decision queue UI - pending.
13. Push/PR hygiene - pending.

Immediate next work:

- clarify loopback, LAN, Tailscale, and Electron access assumptions
- add basic protection before non-loopback use

## Phase 9: Rebrand Consolidation

Goal:

Finish the greenfield Floop identity with no legacy naming surface.

Deliverables:

- `FLOOP_*` environment variables only
- `.floop/floop.sqlite` default data path
- Floop seed IDs, ticket keys, repo slugs, UI copy, docs, and tests
- no package, script, fixture, IPC, or artifact paths using old product names

Exit criteria:

- repository-wide search has no legacy product-name matches outside external
  dependency contents
- full test suite passes

Status:

- complete in current working tree

## Phase 10: Control Plane Boundaries

Goal:

Split MVP implementation boundaries without changing product behavior.

Deliverables:

- store modules for project, repo, ticket, execution, evidence, merge, ceremony,
  event, artifact, and read-model operations
- shared database connection, transaction, and migration helpers
- route handlers grouped by resource area
- no behavior changes except where tests expose hidden coupling

Exit criteria:

- the store no longer has one module owning schema, commands, read models,
  workflow policy, seed data, and cleanup safety
- tests still cover the current MVP loop end to end

## Phase 11: Transition Policy

Goal:

Make ticket state movement explicit and auditable.

Deliverables:

- transition graph for normal workflow movement
- separate operator override path with required reason
- reason codes for policy, operator, execution, review, validation, merge, and
  ceremony transitions
- tests proving invalid automatic transitions are rejected

Exit criteria:

- normal commands cannot silently bypass the state machine
- manual overrides remain possible but are visible in the event stream

## Phase 12: Operational Hardening

Goal:

Prepare Floop for real daily use on local workspaces.

Deliverables:

- versioned migrations
- artifact durability contract
- local trust/auth model for loopback, LAN, and Tailscale use
- decision queue surface for approvals, blocked work, failed validations, stale
  active runs, and pending ceremony proposals

Exit criteria:

- startup, upgrade, restart, and recovery behavior are boring and inspectable
- the operator can see the next decision without scanning the whole board

## Phase 0: Spec Pack

Goal:

Lock the product model before implementation sprawls.

Deliverables:

- `RESEARCH.md`
- `ARCHITECTURE.md`
- `STATE_MACHINE.md`
- `CONFIG.md`
- initial UI notes

Exit criteria:

- clear lifecycle
- clear role model
- clear multi-repo stance
- clear merge/review boundaries

## Phase 1: Single-Project Control Plane MVP

Goal:

Build the first usable Floop for one project space with one or more repos.

Deliverables:

- create/open project
- register repos
- ticket CRUD
- dependency editing
- project board
- ticket detail view
- event timeline
- project and role config loading

Exit criteria:

- operator can manage a backlog in the UI
- system persists state durably

## Phase 2: Execution MVP

Goal:

Turn tickets into real work.

Deliverables:

- worktree manager
- first adapter integration, likely Codex first
- execution creation and lifecycle
- structured execution outcomes
- logs and artifacts capture
- bounded auto-continue

Exit criteria:

- a developer role can pick up and work a ticket in an isolated worktree
- Floop can tell whether the run completed, needs continuation, or is blocked

## Phase 3: Review + Validation Loop

Goal:

Close the autonomy loop safely.

Deliverables:

- reviewer lane
- validation lane
- findings capture
- `REWORK` routing
- `BLOCKED` routing
- `READY_TO_MERGE` decisioning

Exit criteria:

- implementer output is not trusted directly
- separate evidence drives merge readiness

## Phase 4: Merge and Integration Control

Goal:

Make synchronized merge the safe closing action for parallel work.

Deliverables:

- merge queue
- branch integration logic
- merge conflict handling
- worktree cleanup policy
- post-merge ticket closure

Exit criteria:

- multiple tickets can execute in parallel while merges stay serialized and safe

## Phase 5: Multi-Repo Depth

Goal:

Support the real-world shape of work that spans repositories.

Deliverables:

- ticket-to-multi-repo targeting
- per-repo worktree tracking
- repo-scoped validation
- coordinated merge readiness for multi-repo tickets
- cross-repo dependency visibility

Exit criteria:

- one ticket can coordinate changes across multiple repos without the model breaking

## Phase 6: Project Manager Mode

Goal:

Turn backlog refinement into a first-class workflow.

Deliverables:

- agent-generated backlog proposals
- decomposition suggestions
- acceptance criteria refinement
- dependency planning assistance
- PM-oriented board controls

Exit criteria:

- backlog grooming becomes part of the product, not a side conversation

## Phase 7: Surface Polish

Goal:

Make Floop excellent as a daily operator surface.

Deliverables:

- electron shell
- desktop notifications
- mobile-friendly web layout
- better artifact browsing
- better long-running execution summaries

Exit criteria:

- Floop feels good on desktop and over Tailscale from a phone

## Phase 8: Advanced Coordination

Goal:

Add higher-order orchestration once the basics are trustworthy.

Deliverables:

- richer concurrency policies
- conflict/risk detection
- role-specific analytics
- reusable project templates
- project memory and decision logging

Exit criteria:

- Floop scales to many projects and many simultaneous agent lanes without operator chaos
