# Phases

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
