# Floop Frontend Refresh Mockups

Open `index.html` in a browser to review eight static frontend directions for Floop.

Open `interaction-modes.html` to review how hands-off agent flows could change the Control Room and Execution Log surfaces.

Open `floop-inspired.html` to review more brand-native UI directions based on lanes, depth, surface, and deck metaphors.

Open `floop-component-language.html` to review a harder-edged component system that avoids generic rounded rectangles and capsule-heavy UI.

## Reference Signals

- Linear: dense product-development surface, restrained chrome, agent work treated as first-class issue activity, and monitoring/diff surfaces tied into the same system.
- Raycast: command-first interaction, dark launcher density, fast action queue, and inspector-style detail.
- Vercel: monochrome discipline, crisp spacing, and confidence through typography rather than decoration.
- Retool and internal tools: operational density, tables/lists before decorative cards, and clear control placement.

## Mockups

1. **Control Room**: safest incremental path. Keeps board central, adds persistent inspector, reduces visual theme noise.
2. **Command Queue**: keyboard-first action surface. Strong for power users and high ticket volume.
3. **Evidence Ledger**: makes auditability the product center. Strongest expression of governed agent delivery.
4. **Agent Swimlanes**: organizes work by role/agent. Good if assignment and handoff are the core mental model.
5. **Ops Pulse**: monitoring-first daily view. Useful for standups and “what needs attention?” scanning.
6. **Triage Matrix**: dense utilitarian console. Best for backlog routing and batch decisions.
7. **Planning Desk**: refinement-first writing surface. Best if input quality is the main bottleneck.
8. **Execution Log**: live run supervision. Best if Floop should feel like controlled automation.

## Recommendation

Start alignment around **Control Room**, **Evidence Ledger**, and **Command Queue**.

Control Room is the practical bridge from the current React app. Evidence Ledger is the clearest product-positioning move. Command Queue is the strongest power-user interaction direction, but would require more IA and keyboard work.

After the second iteration, the strongest combined direction is:

- **Control Room** as the normal operating surface.
- **Execution Log** as a drill-down surface for active, stalled, or suspicious runs.
- **Exception Queue** as the hands-off/autopilot mode surface.
- Explicit autonomy levels: Ask, Supervise, Autopilot, Hold.

After the Floop-inspired iteration, the most ownable language is:

- **Lanes** for parallel agent work.
- **Depth** for progressive inspection: status, evidence, raw logs.
- **Deck** for exceptions that require operator judgment.
- **Surface** for healthy hands-off automation.

After the component-language iteration, the strongest primitives are:

- **Tile tickets** with lane stripes instead of rounded cards.
- **Stamped state** instead of capsule status clusters.
- **Evidence ledgers** instead of generic timelines.
- **Notched decisions** for operator intervention.
- **Lane rulers** and **waterline navigation** for structure.

## Apply-to-Code Notes

- Replace modal-first ticket detail with a persistent desktop inspector, keeping mobile as a drawer.
- Reduce gradients and large shadows in favor of flat panels, dividers, tighter spacing, and stronger state labels.
- Keep Board and Ops as primary views, but let “needs operator decision” become a first-class queue.
- Move raw agent output behind evidence summaries, except in an Execution Log view.
- Preserve existing domain objects and API contracts: project, board groups, tickets, events, artifacts, merge queue, repos, and policy.
- Add an autonomy-mode model before redesigning screens, because mode changes what information should be primary.
- Use Floop metaphor as structure and interaction language, not as literal decoration.
- Avoid default rounded SaaS geometry; use Floop-specific primitives before adding new generic panels.
