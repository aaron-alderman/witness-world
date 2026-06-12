# Plugin Migration Control

This document is the operational control surface for the current plugin migration.

It is not a general roadmap.
It is not a vision document.
It is not a place to count adjacent improvements as migration progress.

If a change does not remove one of the blocking seams listed here, it does not count as plugin-migration progress.

---

## 1. Scope

Primary target:

- migrate the current maintained project runtime from implicit/internal composition onto explicit plugin-driven runtime composition

Current project in scope:

- the maintained demo runtime and its served entrypoints
- the maintained demo runner `demo_server`
- the blank-world bootstrap/tutorial runtime path, but only after the maintained demo migration is complete

Out of scope until the blocking seams below are removed:

- broader plugin store work
- remote registry or package download flows
- trust/signature/review lifecycle expansion
- third-party code loading
- general roadmap cleanup
- docs-only migration work not paired with code that removes a blocking seam

---

## 2. Non-Goals

The following do not count as migration work by themselves:

- wording cleanup
- roadmap checkbox gardening
- architecture prose improvements
- review/reconcile/store UX expansion
- new plugin-management surfaces that do not remove a current runtime seam
- broad “plugin platform” work that leaves the maintained demo on compatibility seams

Allowed doc work during this migration:

- update docs only when the same tranche lands a real code/runtime migration step
- record new evidence after code changes remove a blocking seam

Do not open a docs-only migration tranche.

---

## 3. Remaining Blocking Seams

The plugin migration is not complete until every seam in this list is removed or explicitly closed.

### A. Maintained demo still depends on `handlerSet = "demo"`

Current problem:

- the maintained demo runner still depends on `serverRunner.handlerSet = "demo"`
- that means runtime behavior is not explained purely by profile + authored plugins

Required end state:

- the maintained demo no longer needs `handlerSet = "demo"`

### B. Maintained demo still activates `bundle-demo`

Current problem:

- startup still adds `bundle-demo` for the maintained demo
- the maintained demo is therefore not yet running from authored plugins alone

Required end state:

- the maintained demo runs on `minimal` plus its authored runtime plugins
- `bundle-demo` is absent from the effective active bundle set for maintained demo startup

### C. Authored backend programs still depend on demo model helper shims

Current problem:

- some authored backend programs still route through demo-specific helper seams in `src/demo-handler-set.js`
- the known remaining helper families are:
  - `todos.*Model`
  - `privateNotes.*Model`
  - `widgets.createModel`
  - `network.simulateModel`

Required end state:

- maintained demo backend behavior no longer depends on those demo handler-set model helpers
- the executable behavior is instead owned by authored/backend-program or bundle-owned runtime seams

### D. Blank-world bootstrap/tutorial still uses a separate composition path

Current problem:

- blank-world recovery and bootstrap/tutorial continuity are still outside the same explicit plugin-composition story as the maintained demo

Required end state:

- blank-world bootstrap/tutorial startup is explained by the same honest runtime-composition model
- if tutorial/bootstrap behavior remains runtime-owned, that ownership is still resolved through explicit composition rather than a parallel hidden path

---

## 4. Required Execution Order

Do the work in this order.
Do not treat later items as substitutes for earlier seam removal.

1. Remove the maintained demo dependency on `handlerSet = "demo"`.
2. Remove the maintained demo dependency on `bundle-demo`.
3. Remove the remaining demo model helper shims from maintained demo backend execution.
4. Prove the maintained demo runs on `minimal` plus authored runtime plugins only.
5. Only after the maintained demo is clean, migrate the blank-world bootstrap/tutorial path onto the same explicit composition story.

If a tranche does not advance the next incomplete item in this order, it is probably off track.

---

## 5. Current Tranche

Active tranche:

- remove the maintained demo dependency on `handlerSet = "demo"` and `bundle-demo`

This tranche is successful only if it removes real runtime dependence, not if it merely reports, documents, or explains the dependence more clearly.

Immediate sub-goals:

1. inventory every maintained-demo behavior still sourced through `src/demo-handler-set.js`
2. identify which of those behaviors are still required by the maintained demo paths
3. move those behaviors onto authored/backend-program or bundle-owned seams
4. remove `handlerSet = "demo"` from the maintained demo runner
5. verify `bundle-demo` no longer activates for maintained demo startup

---

## 6. Done Criteria

The maintained demo migration is complete only when all of the following are true:

1. `examples/demo-todo-server.wtoml` starts under `--runtime-profile minimal`.
2. The maintained demo still works under its expected authoring, inspect, and canvas flows.
3. `demo_server` does not require `handlerSet = "demo"`.
4. Maintained demo startup diagnostics do not include `bundle-demo` in active bundles.
5. The maintained demo runtime composition is fully explained by:
   - profile `minimal`
   - authored runtime plugin installs
   - any still-explicit runtime-owned bundles that are intentionally part of the composition model
6. Maintained demo backend behavior no longer depends on the known demo model helper shim families:
   - `todos.*Model`
   - `privateNotes.*Model`
   - `widgets.createModel`
   - `network.simulateModel`
7. There is at least one negative proof test showing that removing the authored plugins causes expected optional runtime behavior to disappear rather than silently falling back.

The broader plugin migration is complete only when the blank-world bootstrap/tutorial path also satisfies the same honesty standard.

---

## 7. Evidence Rules

What counts as progress:

- code that removes one of the blocking seams
- tests that prove the seam is gone
- diagnostics or startup reporting that prove composition changed
- deletion of compatibility logic that is no longer needed

What does not count as progress by itself:

- better caveat wording
- more accurate docs without code change
- new future-tranche planning
- broader plugin-system improvements that do not remove a listed blocker
- “honest reporting” of a seam that still exists

Rule:

- no roadmap or migration-status update should be treated as meaningful progress unless a code/runtime seam was removed in the same tranche

---

## 8. Verification Checklist

Use this checklist before claiming a seam is gone:

1. Inspect the current maintained demo world and runner configuration.
2. Inspect runtime startup/composition code for remaining compatibility activations.
3. Inspect maintained demo backend-program execution for remaining calls into `src/demo-handler-set.js`.
4. Run focused fast tests that prove:
   - maintained demo starts on `minimal`
   - expected authored plugin ids are active
   - `bundle-demo` is absent
   - expected inspect/authoring/canvas behavior still works
   - negative proof: missing plugins remove optional behavior
5. Only then update docs to reflect the landed removal.

---

## 9. Restart Rule

When restarting work from this file:

- treat this document as the migration target
- choose the next incomplete blocking seam
- do code first
- only update docs after the seam removal is implemented and verified

If a proposed action cannot be tied directly to one of the blocking seams above, do not count it as migration work.
