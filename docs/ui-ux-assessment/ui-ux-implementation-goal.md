# Floop UI/UX Implementation Goal

## Summary

Implement a full app UI/UX sweep centered on the three selected directions:

- Ticket detail: combine A1, A4, and A5 into a cockpit header, plan checklist, evidence rail, and two-click dispatch sheet.
- Ceremonies: combine B1 and B4 into an agent constellation where participant nodes show live status and reveal heatmap-style consensus/risk details on hover or focus.
- Ops: combine C2 and C4 into a run subway with a log dock for stdout/stderr, movement reasons, and attention state.
- Apply the same calmer graphical language to board cards, top summary, project rail, settings, and onboarding so the new surfaces feel native.

No backend/API changes are required for v1. Use existing React data, existing Radix Dialog/Tabs/Tooltip, existing lucide icons, and CSS only.

## Key Changes

- Add a small shared visual component layer in `apps/web-react/src/OperationalVisuals.tsx`:
  - `StateDot`, `PhaseRail`, `ChecklistRail`, `EvidenceRail`, `ActionDock`, `LogChip`, `StatusMeter`.
  - Pure presentational components only; no API calls.
  - Shared helpers for state-to-tone, phase completion, and compact label formatting.
- Update `apps/web-react/src/main.tsx` to use those components across the app.
- Extend `apps/web-react/src/styles.css` with the new calm operational language:
  - fewer paragraph blocks
  - more rails, nodes, meters, compact chips
  - restrained color states: neutral, active blue, done green, attention amber, blocked red, primary teal
  - responsive layouts with no nested cards and no horizontal overflow.

## Surface Implementation

### Ticket Detail Modal

- Replace the current document-like opening stack with a `TicketCockpit` at the top.
- Cockpit layout:
  - left: ticket key/title/state and active phase rail
  - center: current actor/run status from `ticket.executions`, latest review, validation, and merge readiness
  - right: primary `Dispatch` button and compact facts: priority, role, repos, updated
- Replace always-open dispatch form with a two-click `ActionDock`:
  - click 1: open inline dispatch sheet
  - click 2: submit action with required "why" note
  - preserve current action behavior for start execution, record outcome, review, validation, merge, and move ticket.
- Convert `TicketPlanSummary` into a graphical checklist:
  - parse checklist-like lines from acceptance criteria and definition of done
  - fallback to three locked checklist rows: brief, acceptance criteria, definition of done
  - show completion based on evidence: execution, review, validation, merge readiness.
- Convert evidence into a horizontal/stacked evidence ladder:
  - Execution, Review, Validation, Merge
  - each step shows empty/current/done/attention state and one short summary
  - detailed text remains available lower in the modal.
- Move restart/destructive controls into a bottom utility section, visually separated from routine dispatch.
- Keep edit, scope, worktrees/artifacts, merge readiness, and timeline, but reduce visible copy and use collapsible/detail-first presentation where possible.

### Ceremonies

- Rebuild `CeremoniesPanel` around a facilitation surface.
- Center column becomes `CeremonyConstellation`:
  - participant nodes arranged in a calm constellation/grid
  - node colors: waiting neutral, running blue, completed green, failed/blocked red, pending proposals amber
  - decider node is visually marked.
- Hover/focus on a participant node shows a heatmap-style detail popover:
  - outcome, summary, questions, risk
  - proposal count or objection/risk signal when derivable from participant/proposal data.
- Latest run header shows ceremony status, consensus policy, proposal meter, and primary actions.
- Proposal area becomes grouped buckets:
  - Pending
  - Applied
  - Held/Other
- `Apply pending` remains one primary action; individual proposal apply remains a quiet secondary action.
- Ceremony picker/history stay present but become supporting rails, not the dominant visual surface.

### Ops / Run Observability

- Replace the text-heavy run feed with `RunSubway`.
- Each run row shows a subway line with phases:
  - claimed/running
  - output
  - attention
  - completed/failed
- Surface current activity first:
  - running now
  - attention
  - retrying/failed
  - completed recent
- Add `LogDock` behavior per run:
  - stdout/stderr chips shown as compact buttons when artifact URIs exist
  - worktree path and movement reason are revealed in an expanded dock
  - no new artifact fetch API in this pass; show URI/path/reason only.
- Merge decision queue into the attention model visually:
  - decisions stay actionable
  - layout makes them part of "what needs operator attention," not a separate text list.
- Keep merge queue, activity, and artifacts as compact secondary columns.

### Full App Alignment

- Board cards:
  - reduce summary paragraph prominence
  - add mini phase rail and evidence glyphs
  - keep title, key, state, next action, priority/role/repos.
- Summary strip:
  - convert numeric blocks into a project flow meter across backlog, working, evidence, merge, done/attention.
- Project rail:
  - add tiny project health glyphs from project board counts: active, attention, merge-ready.
- Settings:
  - add a profile/status matrix treatment for agent profiles when expanded
  - keep existing forms and data behavior.
- Onboarding:
  - add a three-step setup meter: source, project details, repo/policy readiness
  - keep existing form flow and validation behavior.

## Tests And Validation

- Run `npm run build:web`.
- Run `npm run check:ui`.
- Run `npm test`.
- Browser validation:
  - desktop around `1440x1000`
  - tablet around `900x900`
  - mobile around `390x844`
  - verify ticket modal, ceremonies, ops, settings drawer, onboarding dialog, and board have no horizontal overflow.
- Interaction checks:
  - ticket dispatch opens in one click and submits in second click
  - existing ticket actions still call the same API helpers
  - ceremony run/apply flows still work
  - ops run rows expand/collapse without losing ticket-open behavior
  - keyboard focus reaches participant nodes, dispatch controls, proposal actions, and log chips.

## Assumptions

- This is an app UI implementation, not another static mockup pass.
- No backend contract changes for v1.
- No compatibility with old pool naming or old visual patterns is needed.
- "Full app sweep" means meaningful visual alignment across shell/board/settings/onboarding, while the deepest interaction work remains on ticket detail, ceremonies, and ops.
- Keep the existing square, restrained Floop design language; no decorative gradients, no card-heavy dashboard rewrite, and no new dependencies.
