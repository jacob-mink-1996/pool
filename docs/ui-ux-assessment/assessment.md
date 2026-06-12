# Floop UI/UX Assessment

Date: 2026-06-12

## Executive Read

Floop has the right operational primitives: board state, ticket detail, ceremonies, run feed, artifacts, role profiles, and project controls. The next UX step is not adding more panels. It is converting text-heavy status into graphical state, making the current system activity obvious, and reducing dispatch to a calm two-step pattern: choose the action, state why.

The strongest opportunities are:

- Ticket detail modal: make current status, next action, and evidence progression visible before the operator reads anything.
- Ceremonies: move from a text/proposal list into a facilitation surface with participants, proposals, and apply decisions grouped by workflow.
- Ops / Run Observability: turn the run feed into a monitor that shows what is live, what needs attention, and why movement happened.

Lower-priority polish areas:

- Board: make each ticket card more graphical and less paragraph-driven.
- Settings / Adapter profiles: already improved, but testing status can be more visual.
- Onboarding / project rail: usable, but can be quieter once the primary operational surfaces are stronger.

## Surface Assessment

### Board

What works:

- Lane model is understandable.
- Cards have key, state, role, priority, repo count, and next action.
- Drag interaction gives a clear board affordance.

Issues:

- Cards still rely on summaries and next-action sentences.
- Board-level status is numeric but not directional. It does not show flow health or stuckness.
- Work currently happening is visible only as ticket state, not as active run progress.

Recommended direction:

- Replace most card paragraphs with compact progress glyphs: plan, run, review, validation, merge.
- Add a thin project flow bar above lanes showing counts in each phase.
- Use one line of ticket copy plus visual chips for blockers, artifacts, active run, and merge readiness.

### Ticket Detail Modal

What works:

- Important operations exist: dispatch, edit, scope, evidence, artifacts, merge readiness, restart.
- The next-action panel is correctly near the top.
- Evidence and timeline are available.

Issues:

- The modal reads like a document. It asks the operator to scan many sections before understanding status.
- Dispatch is embedded in a larger detail stack; it should feel like the primary control surface.
- Evidence state is text-heavy and split across several areas.
- Timeline is event text, not a story of movement and decisions.
- Danger zone appears before merge readiness and timeline; destructive actions are visually close to routine inspection.

Recommended direction:

- Lead with a compact ticket cockpit: state, progress rail, current actor/run, next action.
- Make dispatch at most two clicks: primary action opens a short reason sheet; submit.
- Convert evidence into a checklist/progress ladder.
- Make plan readable as checklist items with completion state, not paragraphs.
- Move restart/destructive controls behind an overflow or bottom utility zone.

### Ceremonies

What works:

- Ceremony types are discoverable.
- Participant fan-out is configurable.
- Latest run, proposals, participant output, and history are all available.

Issues:

- The surface is still dominated by text blocks and proposal rows.
- It does not visually explain who is participating, who decided, or what consensus state is.
- Proposal application is mixed with raw proposal payload display.
- Running a ceremony feels like configuring a backend job instead of facilitating a decision ritual.

Recommended direction:

- Put ceremony type, participants, decider, and consensus state into a graphical facilitation surface.
- Use participant lanes or rings with status dots and outcome marks.
- Group proposals into approve/apply/hold buckets.
- Collapse raw payload to reveal-on-demand.
- Make "Run" and "Apply" feel like ceremony actions, not generic form buttons.

### Ops / Run Observability

What works:

- The new run feed has the right data: run kind, attention state, claim state, stdout/stderr, worktree paths, retry attempts, and movement reason.
- Decision queue, merge queue, activity, and artifacts are all in one place.

Issues:

- The feed still displays many strings at once.
- "Currently happening" is not visually dominant enough.
- Decision queue and run feed are separate even though attention often comes from the same state.
- stdout/stderr and worktree paths are present as text labels rather than usable affordances.

Recommended direction:

- Use a live operations strip: running now, attention, blocked, retrying.
- Present runs as a timeline with graphical phases and compact metadata.
- Expose stdout/stderr as stream chips or expandable drawers.
- Connect movement reason directly to each run: "moved because X."
- Merge decision queue into the attention model so the operator sees one priority stack.

### Settings / Adapter Profiles

What works:

- Presets, structured config fields, JSON validation, and profile test actions are now present.
- Role cards are direct and operational.

Issues:

- Testing is still textual: "Profile test passed."
- Multiple profile forms can feel dense when opened together.
- Adapter capabilities are not visually differentiated.

Recommended direction:

- Add a profile matrix with roles as rows and adapter/test status as columns.
- Show test status as pass/fail dots with last checked time.
- Keep detailed JSON behind an advanced disclosure.

### Project Onboarding / Rail

What works:

- Project creation covers existing, new, and clone paths.
- Rail is simple.

Issues:

- Onboarding fields are dense for first-time setup.
- Rail uses counts but not project health.

Recommended direction:

- Show a three-step setup meter: source, repo, policy.
- Add small project health glyphs in rail: active, attention, clean.

## Mockup Priorities

The mockup gallery focuses on the three surfaces with the largest UX payoff:

1. Ticket detail modal
2. Ceremonies
3. Ops / Run Observability

Each has five directions. The intent is exploration, not immediate implementation. The strongest implementation path is likely a hybrid:

- Ticket: Cockpit header + action dock + evidence ladder.
- Ceremonies: Facilitation board + participant constellation.
- Ops: Live strip + attention stack + run timeline.

