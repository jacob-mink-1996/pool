# Research

This file captures the early research framing for Floop.

## What "Loop Engineering" Means

Recent writing around coding agents has started naming a real shift:
the human stops being the person who manually prompts the agent turn by turn
and instead designs the system that discovers work, runs agents, checks
outcomes, records state, and decides the next action.

That framing maps directly to Floop.

## Sources

### Addy Osmani, "Loop Engineering" (June 7, 2026)

Source:
- https://addyosmani.com/blog/loop-engineering/

Key takeaways:

- loop engineering sits above a single-agent harness
- a useful loop needs automation, worktrees, skills/project knowledge,
  tool integrations, sub-agents, and external memory
- the repo or task system must hold memory outside the single conversation
- worktree isolation is foundational for parallel agent execution

Why it matters for Floop:

- Floop should be designed as a loop system, not a prompt surface
- project memory and durable ticket state are not optional
- reviewer/validator agents should be first-class citizens

### Batty

Source:
- https://github.com/battysh/batty

Key takeaways:

- positions itself as a control plane for agent software teams
- uses role definitions, worktree isolation, verification, and auto-merge
- explicitly separates execution from the merge path

Why it matters for Floop:

- validates the "control plane, not chat app" direction
- reinforces worktree-per-executor and verification-gated delivery
- shows that hierarchical role routing is a real operator need

What to do differently:

- Floop should lead with a cleaner web/electron PM UX
- Floop should treat tickets and dependencies as the product center of gravity
- Floop should support richer project policy and multi-repo modeling earlier

### agtx

Source:
- https://github.com/fynnfluegge/agtx

Key takeaways:

- explicitly supports different agents for different phases
- treats lifecycle phases and plugin-driven workflows as first-class concerns
- manages autonomous execution around worktree sync and phase gating

Why it matters for Floop:

- role and phase configuration should be data-driven
- "same project, different agent by phase" should be built in from the start
- Floop should expose lifecycle phase state clearly instead of hiding it

### AI Agent Board

Source:
- https://github.com/DanWahlin/ai-agent-board

Key takeaways:

- demonstrates demand for a board-first interface for AI task execution
- supports multiple agent providers behind a common interface
- streams normalized events to the UI
- includes task groups, worktree isolation, and local merge/PR flows

Why it matters for Floop:

- confirms that web-first orchestration can work well
- validates a provider/adapter abstraction
- suggests that grouped or batched ticket work will matter later

What to do differently:

- Floop should be stricter about review/validation gates
- Floop should center the autonomous completion loop, not just run agents from cards

### Upsun, "Git worktrees for parallel AI coding agents"

Source:
- https://developer.upsun.com/posts/ai/git-worktrees-for-parallel-ai-coding-agents

Key takeaways:

- worktrees are the right isolation primitive for parallel agent work
- they avoid clone sprawl and share repository history efficiently
- they also introduce cleanup, naming, lifecycle, and coordination complexity

Why it matters for Floop:

- worktree lifecycle must be a first-class subsystem
- cleanup, pruning, merge safety, and stale worktree recovery need product support
- multi-repo work will magnify these concerns and should be modeled early

### Agentic Software Engineering: Foundational Pillars and a Research Roadmap

Source:
- https://arxiv.org/abs/2509.06216

Key takeaways:

- agentic software engineering needs structured environments, explicit process,
  and trustworthy handoff between humans and agents
- merge-readiness and trustworthiness are major bottlenecks
- human/agent collaboration benefits from structured workbenches and artifacts

Why it matters for Floop:

- Floop should produce durable evidence, not just transcripts
- review packs, validation artifacts, and approval surfaces should be first-class
- "merge-ready" should be a machine-supported status with evidence attached

## Research Conclusions

The external landscape strongly supports these design choices:

- board-first UI over chat-first UI
- worktree isolation for every active implementation lane
- separate reviewer and validator lanes
- durable memory outside chat context
- role and phase configuration as data, not special-case code
- event timelines and evidence packs over raw conversation history

## Implications For Floop

### 1. Floop should be a control plane

It should coordinate agents, policies, repositories, worktrees, and evidence.
It should not feel like a glorified terminal multiplexer or a messaging client.

### 2. Ticket state must be richer than Kanban columns

The board can stay intuitive, but the engine needs real sub-states in order to
route work correctly.

### 3. Multi-repo support should exist in the domain model from the start

Even if v1 usage begins with a primary repo, Floop should not assume that a
ticket always maps to one repository or one worktree forever.

### 4. "Continue" must be structured

Every loop iteration should record:

- what remains
- why it was not done yet
- what new evidence is expected next

### 5. Review and validation are not optional embellishments

They are the product feature that solves the "looks good, keep going" problem.
