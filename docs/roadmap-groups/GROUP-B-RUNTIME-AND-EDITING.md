# Group B - Runtime and Editing

`/goal` Make visible behavior locally inspectable, editable, and executable through shared runtime rules, while continuously shrinking hidden compatibility glue and refusing client-side or handler-side truth shortcuts.

This group combines tranche 3 and tranche 4:

- authoring surfaces and editing grammar
- runtime execution and inspection
- executable backend ownership
- live editing, inspection, and evolution

## Mission

Make the system editable and inspectable from the place where users discover structure, while keeping runtime behavior honest and executable.

## End-State

Group B is done when:

- the runtime can explain which authored object owns a visible behavior
- live surfaces can inspect, edit, replace, hide, upgrade, and save back through shared rules
- backend behavior keeps moving out of compatibility handler glue into authored or explicit plugin-owned execution
- migration, rollback, and evolution semantics are visible and not faked through reload tricks

## Non-Goals

- a detached admin console that becomes the only serious editor
- pretending all backend execution is already generic when compatibility seams still own behavior
- hiding ownership boundaries because a surface is easier to wire that way

## Guardrails For New Contributors

The common mistake in this group is to see visible UI and runtime code and assume the solution is normal frontend or server refactoring.

That usually produces:

- local UI state that becomes the real truth
- hidden page-specific mutation rules
- new handler glue that bypasses authored runtime ownership
- more "just reload after change" behavior instead of explicit migration semantics

### Hard Rules

- every live edit must say which authored object changed
- every visible action should have an explainable owner: generic host, backend program, plugin, shell, or compatibility seam
- if a page-local operation exists, it must still lower through shared authority and witness rules
- if a behavior only works through a hidden demo helper, do not describe it as generic runtime capability
- if a reload masks missing migration or rollback semantics, call it a deferral, not completion

### Anti-Cheat Tests

Do not accept a slice as done if it only works because:

- the browser held unpersisted truth that the world model does not know about
- an inspector action mutated state through a special client-only code path
- a backend route stayed on a handler-set helper with no explicit ownership note
- live editing added another detached form instead of improving local editing grammar
- a transition was made "safe" only by forcing refresh and losing explanatory state

## Workstreams

### B1. Runtime Ownership Clarity

Clarify which layer owns each visible behavior:

- generic host
- authored backend program
- runtime plugin
- compatibility handler set
- shell-only behavior

### B2. Live Inspection and Handoff

Turn existing inspectors into first-class explanation surfaces.

### B3. Editable-Everywhere Grammar

Make live surfaces capable of local mutation without detouring into unrelated pages.

### B4. Executable Backend Expansion

Shrink the remaining demo compatibility seam and broaden authored backend execution.

### B5. Evolution, Migration, and Rollback

Generalize safe live change beyond the current widget-version slice.

## Ordered Execution Ladder

### Stage B0. Runtime Ownership Ledger

Objective:
Every visible runtime action should have a declared owner.

Slices:

#### B0.1 Ownership classification pass

Implementation:

- classify each route, page action, and backend endpoint by execution owner
- add explicit tags such as `generic-host`, `backend-program`, `runtime-plugin`, `handler-set`, `shell`
- expose the tags through diagnostics or source inspection

Acceptance:

- no major route or action lacks an owner tag
- compatibility behavior is visible, not implied

#### B0.2 Surface-to-owner explanation

Implementation:

- add "why this works" explanations in inspector or diagnostics surfaces
- show route, runtime profile, plugin, backend program, and compatibility dependencies

Acceptance:

- a user can trace a page action back to its owning runtime structure

### Stage B1. Strengthen Live Inspection

Objective:
Inspection becomes the default local discovery surface.

Slices:

#### B1.1 Inspectable object graph from live page

Implementation:

- widen live-page selection to map widgets, versions, frontend programs, handlers, routes, capabilities, and contexts
- improve handoffs into world, source, process, and witness views

Acceptance:

- the common question "what is this thing?" can be answered from the page

#### B1.2 Process and runtime correlation

Implementation:

- link visible widgets to owning frontend process nodes and backend actions where applicable
- expose last run, active runtime dependencies, and source ownership

Acceptance:

- a widget and its runtime behavior can be inspected together

### Stage B2. Editable-Everywhere Grammar

Objective:
Local edits become normal product behavior.

Slices:

#### B2.1 Replace and upgrade grammar

Implementation:

- define replace, swap, and upgrade actions as explicit authored operations
- support preview before apply
- thread authority and proposals through the same path

Acceptance:

- replace or upgrade is not a bespoke per-surface implementation

#### B2.2 Save-back semantics

Implementation:

- decide what "save" means for each local edit:
  - widget definition update
  - version change
  - page-local placement change
  - capability install at point of need
- write through shared authored objects instead of detached client state

Acceptance:

- each local edit path says exactly what world object changed

#### B2.3 Page-local creation and mutation

Implementation:

- support adding a widget, action, relation, or capability from the surface where it is needed
- maintain context and authority semantics

Acceptance:

- a user can compose forward from the page without losing semantic ownership

### Stage B3. Executable Backend Expansion

Objective:
Keep removing handler-set glue from shipped behavior.

Priority order:

1. remove dead legacy demo handler exports such as `todos.createModel`, `todos.updateModel`, `todos.deleteModel`, `privateNotes.createModel`, and `widgets.createModel` now that maintained backend programs lower through `process.request`
2. remaining demo helpers after those

Slices:

#### B3.1 Replace model helper calls with authored or plugin-owned backend units

Implementation:

- inventory every helper still required by shipped backend-program versions
- define whether each should become:
  - authored backend program logic
  - generic runtime primitive
  - explicit plugin implementation
- migrate one helper family at a time

Acceptance:

- maintained demo logic no longer routes through compatibility helpers for that family
- runtime diagnostics show the new owner clearly

#### B3.2 Blank-world bootstrap and maintained demo convergence

Implementation:

- compare runtime composition of bootstrap path and demo path
- move bootstrap toward the same explicit composition story where possible
- keep bootstrap semantically narrow if it remains a special path

Acceptance:

- the project can explain why bootstrap and demo differ, or they share one explicit composition story

### Stage B4. Migration and Rollback Generalization

Objective:
Safe change semantics become reusable, not widget-version-only.

Slices:

#### B4.1 Generic migration contract

Implementation:

- define when a change is compatible, migratable, fork-required, or blocked
- expose that contract for more than widget versions

Acceptance:

- at least one additional authored noun uses the shared migration contract

#### B4.2 Candidate, preview, and rollback flow

Implementation:

- add preview state for larger edits
- capture rollback references and decision points
- keep witness and runtime explanation aligned

Acceptance:

- live changes have an inspectable transition story

## Detailed Task Backlog

### Immediate tranche of concrete work

1. Create a runtime ownership catalog for routes and actions.
2. Add inspector output showing the owner chain for a selected widget or action.
3. Define replace and save-back operations for live widget editing.
4. Inventory every remaining demo handler helper used by authored backend programs.
5. Migrate the first helper family off the compatibility seam.
6. Write a generic migration-state enum and use it beyond widget versions.

### "Trivialized" implementation breakdown for the first two slices

#### Runtime ownership catalog

- add metadata tags where routes and handlers are defined
- expose tags through one read route
- show tags in bootstrap or inspector UI
- add tests that new route definitions must declare an owner class

#### Live inspector owner chain

- start from selected widget id
- resolve widget version
- resolve route and serve mount
- resolve runner and active profile
- list plugin, backend program, and compatibility dependencies
- render the chain in one inspector panel

## Acceptance Gates

- live editing adds shared semantics, not more one-off UI actions
- backend execution ownership becomes clearer after each slice
- compatibility handler-set usage shrinks measurably
- runtime inspection explains more after each tranche than before
- a newcomer following normal JS instincts would hit visible ownership and persistence constraints before they could smuggle in hidden state

## Primary Source Map

- [ROADMAP.md](../ROADMAP.md)
- [BASELINE.md](../BASELINE.md)
- [docs/CAPABILITIES.md](../CAPABILITIES.md)
- [docs/ROADMAP-TRANCHES.md](../ROADMAP-TRANCHES.md)
