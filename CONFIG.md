# Configuration

## Configuration Philosophy

Pool should be configurable at three levels:

- global
- project
- role profile

Configuration should define behavior, not hide core product logic.

## Global Configuration

Global config should contain installed adapters and shared defaults.

Examples:

- known agent adapters
- default adapter executable paths
- default timeouts
- global artifact storage settings
- global secret references

## Project Configuration

Project config should define how a specific project works.

Examples:

- workspace root
- repos
- merge policy
- review requirements
- validation requirements
- concurrency rules
- ticket defaults
- allowed roles

## Role Profile Configuration

Role profiles define how a role behaves inside a project.

Examples:

- adapter/tool
- model
- system prompt template
- max iteration budget
- allowed ticket classes
- allowed repo targets
- approval escalation rules

## Example Shape

```yaml
project:
  name: pool
  workspaceRoot: /path/to/workspace
  repos:
    - name: app
      path: /path/to/workspace/app
      defaultBranch: main
      validation:
        commands:
          - npm test
          - npm run lint
    - name: docs
      path: /path/to/workspace/docs
      defaultBranch: main

policy:
  requireReviewer: true
  requireValidator: true
  requireHumanApprovalBeforeMerge: true
  maxParallelExecutions: 4
  maxAutoContinueIterations: 5
  agentCreatedTicketsDefaultState: PROPOSED

roles:
  developer:
    adapter: codex
    model: codex-latest
    maxIterations: 5
  reviewer:
    adapter: codex
    model: codex-latest
  validator:
    adapter: opencode
    model: default
```

## Important Early Decisions

### Multi-repo from the beginning

Project config should not assume one repo.

A ticket may:

- target one repo
- target a subset of repos
- require coordinated completion across multiple repos

### Policy-driven agent-created tickets

Agent-created tickets should be configurable as:

- `DRAFT`
- `PROPOSED`
- `READY`

Default should be conservative.

### Validation as project data

Validation commands belong to repo/project config, not hardcoded role logic.

### Role behavior should be composable

A role should be defined by:

- tool
- prompt template
- budget
- permissions

Not by special code paths per role name.
