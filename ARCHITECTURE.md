# Architecture

## Goal

Floop is a project management and execution control plane for autonomous
software work. It coordinates tickets, agents, worktrees, validation,
review, and merge policy across one or more repositories inside a project.

## System Overview

Floop has one backend and two UI surfaces:

- web app
- electron desktop shell

The backend owns all orchestration logic. The electron app is primarily a
desktop wrapper around the web surface with desktop affordances.

## Current MVP Architecture

The current implementation is intentionally local-first:

- Node.js ESM API service in `services/api`
- SQLite persistence in `packages/db`
- shared domain constants in `packages/domain`
- shared request parsing and DTO projection in `packages/contracts`
- React operator UI in `apps/web-react`
- Electron shell in `apps/electron`
- Server-Sent Events for live project event observation
- background execution, merge, ceremony automation, and ceremony participant drivers

SQLite is the product database for the MVP. Postgres remains the target database
when Floop needs multi-user operation, stronger concurrent writers, remote
deployment, or centralized scheduling.

## Target Architecture

The target system keeps the same boundaries but hardens them:

- TypeScript across backend and shared packages
- Postgres as the primary durable store
- explicit migration files instead of only inline schema evolution
- a command layer that separates route handling from workflow policy
- stateless workers that can run in separate processes
- durable artifact storage with local-file and remote-store adapters
- authentication and local-trust controls before exposing beyond loopback

## Architectural Layers

### 1. Control Plane

The control plane owns durable product state and orchestration decisions.

Responsibilities:

- projects
- repos and workspaces
- tickets and dependencies
- agent profiles and role bindings
- policy enforcement
- state transitions
- event log
- real-time updates to the UI

Current stack:

- JavaScript ESM
- Node.js
- SQLite
- Server-Sent Events for live updates

Target stack:

- TypeScript
- Node.js
- Postgres
- WebSocket or SSE for live updates

### 2. Execution Plane

The execution plane turns ticket intent into actual agent runs.

Responsibilities:

- spawn agent CLI runs
- mount correct context
- inject prompts and policy
- capture logs and artifacts
- classify outcomes
- resume or reroute work

Important rule:

Execution workers should be stateless and resumable. Durable truth lives in
the database and artifact store, not in a long-lived in-memory agent process.

### 3. Workspace / Git Plane

This layer manages repository state and worktree lifecycle.

Responsibilities:

- register one or more repos for a project
- create worktrees
- track branches and base refs
- detect dirty state
- support merge and cleanup
- detect integration conflicts

Multi-repo support should be modeled from the beginning:

- a project can own multiple repos
- a ticket can target one repo or many
- a ticket can own one worktree per repo target

### 4. Review / Validation Plane

This layer closes the loop.

Responsibilities:

- reviewer lane execution
- validation command execution
- findings normalization
- merge-readiness decision support
- evidence packaging

This plane must be distinct from implementation.

### 5. Adapter Plane

Each coding agent is just an adapter.

Examples:

- Codex CLI
- Claude Code
- OpenCode
- future internal tools

Adapter responsibilities:

- launch the tool
- inject role-specific prompt material
- stream events
- capture structured completion
- expose supported capabilities

### 6. UI Plane

The UI is for the human operator acting as PM and final approver.

Primary views:

- project board
- ticket detail
- execution timeline
- backlog refinement
- approval and merge queue

The UI should expose complex states when they add value. It does not need to
oversimplify the true workflow into three fake columns.

## Core Domain Model

The current SQLite schema already implements these core entities plus ceremonies,
merge runs, artifacts, and worktree records. The model below is the stable
product model, not a promise that every field name matches the current SQLite
column names exactly.

### Project

A project is a workspace-bound conceptual space.

Fields:

- id
- name
- description
- workspace_root
- repos[]
- default roles
- policies
- backlog settings

### Repo

Fields:

- id
- project_id
- name
- local_path
- remote_url
- default_branch
- validation commands

### Ticket

Fields:

- id
- project_id
- title
- brief
- acceptance_criteria
- state
- priority
- parent_ticket_id
- created_by
- assigned_role
- assigned_agent_profile_id

### TicketDependency

Fields:

- blocking_ticket_id
- blocked_ticket_id
- dependency_type

### TicketRepoTarget

Fields:

- ticket_id
- repo_id
- base_ref
- intended_branch

This lets a ticket span multiple repos without bolting the feature on later.

### Execution

A single agent run against a ticket.

Fields:

- id
- ticket_id
- role
- agent_profile_id
- iteration
- status
- outcome
- started_at
- finished_at
- summary

### Worktree

Fields:

- id
- ticket_id
- repo_id
- execution_id
- path
- branch
- base_ref
- status

### Review

Fields:

- id
- ticket_id
- execution_id
- reviewer_profile_id
- verdict
- findings

### ValidationRun

Fields:

- id
- ticket_id
- repo_id
- commands
- verdict
- artifacts

### Artifact

Fields:

- id
- project_id
- ticket_id
- kind
- path_or_uri
- metadata

### Event

Append-only event log for all important state changes.

Examples:

- ticket created
- dependency added
- execution started
- execution completed
- review failed
- validation passed
- merge completed

## Human vs Agent Responsibilities

### Human

- set direction
- refine backlog
- approve scope and priorities
- approve merges when policy requires it
- handle ambiguous or high-risk decisions

### Agents

- propose decomposition
- implement scoped changes
- review code
- validate behavior
- surface blockers and follow-up tickets

### Floop

- coordinate the system
- enforce policy
- route work
- preserve state and evidence

## Non-Goals For V1

- general chat interface for worker agents
- distributed cluster scheduling
- cross-project optimization
- autonomous release management
- full PR hosting/replacement

## Known Architecture Debt

The MVP has deliberately favored one-place implementation speed. The next
architecture pass should address these issues before adding much more product
surface:

- split `packages/db/src/index.mjs` into bounded store modules while keeping one
  connection and transaction helper
- move workflow decisions out of raw persistence functions into a command/policy
  layer
- make manual ticket transitions go through an explicit transition policy with
  operator override reasons
- promote schema changes to versioned migrations
- decide the artifact durability contract for local files, copied files, and
  future remote stores
- add a local trust and authentication model before non-loopback deployments

## North Star

Floop succeeds when a human can manage autonomous delivery by steering the board,
reviewing evidence, and making final approvals without manually carrying the
agent loop from prompt to prompt.
