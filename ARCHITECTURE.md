# Architecture

## Goal

Pool is a project management and execution control plane for autonomous
software work. It coordinates tickets, agents, worktrees, validation,
review, and merge policy across one or more repositories inside a project.

## System Overview

Pool should have one backend and two UI surfaces:

- web app
- electron desktop shell

The backend owns all orchestration logic. The electron app is primarily a
desktop wrapper around the web surface with desktop affordances.

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

Suggested stack:

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

### Pool

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

## North Star

Pool succeeds when a human can manage autonomous delivery by steering the board,
reviewing evidence, and making final approvals without manually carrying the
agent loop from prompt to prompt.
