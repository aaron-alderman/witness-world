# Operator Workbench Heroic Spec TODO

This document is the canonical execution plan for the operator workbench.

It is intentionally self-contained. It should be usable as:

- the product goal
- the architecture guardrail
- the phased implementation TODO
- the acceptance checklist
- the "what not to do" list when pressure rises

---

## How To Use This Document

- Change `[ ]` to `[X]` only when the work is materially true, not merely started.
- Add `ATTN:` notes when implementation reveals a risky seam, misleading shortcut, or deliberate compromise.
- Prefer one explicit ownership decision over a half-local, half-shared implementation that nobody can name.
- If a tranche lands partially, record the exact boundary instead of claiming the whole phase.

---

## Goal

- [ ] Build the operator workbench as a real authored product surface, not a painted prototype.

The target end state is:

- [ ] One shared operator core owns truth, navigation, selection, inspection, search, views, focus, preview-read state, and workbench object lifecycle.
- [ ] One canonical RVM/operator authoring pathway defines the workbench.
- [ ] The browser host is the first complete rich host.
- [ ] Electron is only a host adapter, not a second product implementation.
- [ ] Future native hosts can consume the same compiled workbench model.
- [ ] Rendering is genuinely cell-based and scene-driven, not HTML layout wearing a TUI skin.
- [ ] Help, references, provenance, menus, viewers, edit surfaces, handles, and viewports are all first-class authored objects.

---

## Definition Of Done

This effort is not done until all of the following are true:

- [ ] Product truth lives in the shared operator core.
- [ ] The workbench is described through canonical authored definitions.
- [ ] The renderer consumes a host-neutral scene or cell model.
- [ ] Borders and separators are globally composed, not patched after paint.
- [ ] Links, menus, help, viewers, and editors are first-class surface objects.
- [ ] Browser, Electron, and future native hosts can consume the same compiled workbench model without product rewrites.

---

## Honest Current State

What is materially true today:

- [X] There is a browser-first operator example under `examples/operator`.
- [X] There is a cell buffer and contiguous memory-map seam.
- [X] There is a glyph-atlas blit path instead of direct per-cell `fillText` for the main render path.
- [X] There is a canonical `operator_viewport` seam in the operator-workbench RVM pathway.
- [X] There are canonical seams for overlays, chrome surfaces, and handles.
- [X] There is a shared operator-core workbench snapshot export that includes viewport metadata.
- [X] The browser example prefers a live shared-snapshot API at boot.
- [X] The browser example now requires an explicit opt-in to boot in fixture-readonly mode instead of silently falling back when the live bridge is missing.
- [X] A narrow live interaction slice now round-trips through the shared core.
- [X] The browser-side left pane now renders from the canonical `leftPane` model rather than `treeRows`.
- [X] Several browser compatibility mirrors have already been removed.
- [X] The browser snapshot adapter no longer synthesizes command-bar or help-overlay copy as if they were shared snapshot truth.
- [X] The shared snapshot now exposes committed `viewport.layout` geometry for the browser workbench.
- [X] Viewport top, bottom, and split now have an explicit workspace-scoped persistence policy.
- [X] The rich settings surface now exposes explicit top and bottom viewport controls.
- [X] The rich settings surface now exposes an explicit reset-to-authored-default viewport affordance.
- [X] Viewport reset now follows a reusable settings-reset pattern rather than staying a one-off manual hack.
- [X] The browser example no longer keeps separate focused-pane, top-cursor, left-cursor, right-cursor, or help-overlay mirrors when the shared snapshot already owns that truth.
- [X] A narrow generic text-scene path now exists for left-pane body rows, right-pane body text, and overlay body text.
- [X] A narrow generic fill-scene path now handles overlay fills instead of a direct overlay-only paint special case.
- [X] The four primary pane interiors now render through explicit base fill-scene entries instead of depending only on implicit clear-buffer background.
- [X] Fill-scene entries now resolve through a normalized fill-style variant catalog instead of inline runtime fill literals.

What is not materially true yet:

- [ ] The browser host is not yet driven by the real shared operator core for most interactions after boot.
- [ ] The browser host still adapts the shared snapshot into browser-local runtime state and keeps too much truth locally.
- [ ] The browser-side prototype grammar is not yet fully retired behind the canonical authored pathway.
- [ ] The compositor or frame graph is not yet the universal authority for borders, junctions, separators, overlays, and handles.
- [ ] Generic authored surface families are not yet complete.
- [ ] Menus, help, viewers, references, provenance, and editing are not yet expressed through one unified interaction model.
- [ ] Final glyph fidelity is not complete.
- [ ] Cross-host portability is not yet proven end to end.

Plain-English assessment:

- [X] This is beyond mockup territory.
- [ ] This is not yet the finished product architecture.
- [X] The highest-leverage work remains schema tightening, core bridging, compositor correctness, and surface unification.

---

## Global Pitfalls To Avoid

- [ ] Do not let `examples/operator/browser/operator-runtime.js` become the permanent product runtime.
- [ ] Do not let the browser-side grammar remain a forever sidecar detached from canonical RVM.
- [ ] Do not use DOM layout, DOM tables, CSS box layout, or browser scrollbars as the real layout engine.
- [ ] Do not collapse product semantics and rendering logic into one host module.
- [ ] Do not keep fixing border and junction bugs locally instead of introducing a compositor or frame graph.
- [ ] Do not treat host-font-derived glyph output as the final fidelity answer.
- [ ] Do not implement help, menus, viewers, or edit mode as isolated one-off widgets.
- [ ] Do not add more heroic UX while the authored model and compositor boundary are still weak.
- [ ] Do not hard-code host behavior that should instead be authored or normalized.
- [ ] Do not accept sample host state as long-term product truth.
- [ ] Do not push Electron-specific logic into the shared core.

---

## What To Do

- [ ] Push toward one canonical authored workbench model.
- [ ] Compile authored workbench definitions into a host-neutral surface tree and scene.
- [ ] Bridge the browser host onto the real operator core.
- [ ] Build a deterministic global compositor for panes, overlays, separators, and handles.
- [ ] Add generic interaction intents instead of bespoke event handling per feature.
- [ ] Promote structured viewers into a real reusable surface family.
- [ ] Keep testing at three levels:
- [ ] authoring and definition validation
- [ ] core, compositor, and snapshot behavior
- [ ] host visual and interaction verification

---

## What Not To Do

- [ ] Do not ship HTML layout disguised as a TUI.
- [ ] Do not invent new screen behavior in the host when it should live in authored definitions.
- [ ] Do not delay the compositor until after interaction features accumulate.
- [ ] Do not delay structured viewers until after editing; they are a core surface family.
- [ ] Do not keep browser convenience mirrors unless their ownership is explicit and temporary.

---

## Required Architecture

Target stack:

- [ ] Authored workbench definition
- [ ] Workbench compiler and normalizer
- [ ] Shared operator core bridge
- [ ] Surface tree and scene model
- [ ] Layout compositor and frame graph
- [ ] Cell scene and memory map
- [ ] Host renderer adapter

Ownership boundary:

- [ ] Host owns window lifecycle, presentation, input capture, clipboard, and platform integration.
- [ ] Core owns navigation, selection, search, focus, inspect, references, provenance, help context, viewports, intents, and workbench object lifecycle.

---

## Phase Summary

- [X] Phase 0: Browser-first rendering prototype
- [ ] Phase 1: Canonical authored workbench schema
- [ ] Phase 2: Bridge to the shared operator core
- [ ] Phase 3: Global compositor and frame graph
- [ ] Phase 4: Final glyph fidelity
- [ ] Phase 5: Generic surface family
- [ ] Phase 6: Interaction model
- [ ] Phase 7: Structured viewers
- [ ] Phase 8: Viewports, settings, and personalization
- [ ] Phase 9: Editing and expansion mode
- [ ] Phase 10: Host adapter completion

---

## Phase 0: Browser-First Rendering Prototype

### Purpose

- [X] Prove that a browser-first, canvas-first, cell-first direction is viable.

### Status

- [X] Phase complete

### Required Work

- [X] Create the browser-first prototype scaffold under `examples/operator`.
- [X] Add a browser-side authored prototype file at `examples/operator/browser/operator.workbench.rvm`.
- [X] Introduce a cell buffer with contiguous memory map.
- [X] Add the AssemblyScript seam and Wasm build path.
- [X] Add an example launcher and browser server.
- [X] Add layout, buffer, scroll, and frame scaffold tests.
- [X] Replace direct per-cell `fillText` with a glyph-atlas blit path.

### Acceptance Criteria

- [X] The repo proves a cell-grid browser host is viable.
- [X] The repo proves rendering can move away from ordinary DOM layout.
- [X] The repo proves there is enough substrate to continue with real architecture work.

### Non-Goals

- [ ] This phase does not mean the product architecture is done.
- [ ] This phase does not mean the canonical authored model exists yet.
- [ ] This phase does not mean the shared operator core is in charge yet.

---

## Phase 1: Canonical Authored Workbench Schema

### Purpose

- [ ] Replace the ad hoc browser-side model with one canonical RVM/operator authoring pathway for the workbench.

### Status

- [ ] Phase complete
- [X] Viewport seam landed
- [X] Overlay seam landed
- [X] Handle seam landed
- [X] Chrome-surface seam landed
- [ ] Left-pane authored model still incomplete
- [ ] Right-pane generic projection model still incomplete
- [ ] Generic viewer-surface authoring intentionally deferred

### Do

- [ ] Make the authored pathway powerful enough to describe the real workbench.
- [ ] Normalize definitions into a stable compiled workbench schema.
- [ ] Reject invalid references and illegal shapes deterministically.

### Do Not

- [ ] Do not keep the browser grammar as the permanent product truth.
- [ ] Do not let critical surface concepts exist only in handwritten host code.

### Required Work

- [X] Define canonical authored forms for top-strip and bottom-strip chrome.
- [X] Define canonical authored forms for overlays and context menus.
- [X] Define canonical authored forms for viewport presets and viewport-scoped bindings.
- [X] Define canonical authored forms for pane handles.
- [ ] Define canonical authored forms for left-pane projections.
- [ ] Define canonical authored forms for right-pane projections.
- [ ] Define canonical authored forms for viewer surfaces.
- [ ] Decide whether the browser prototype grammar disappears entirely or survives only as a generated artifact.
- [ ] Add validation for pane references.
- [ ] Add validation for surface-shape legality.
- [ ] Add validation for viewport constraints.
- [ ] Add validation for overlay ownership.
- [ ] Add a normalized compiled workbench schema contract.

### Acceptance Criteria

- [ ] There is one canonical authored pathway for workbench definition.
- [ ] The browser workbench can be described without relying on an ad hoc product grammar.
- [ ] Invalid authored definitions fail clearly.
- [ ] Tests cover parse, validation, normalization, and compiled output.

### Detailed Tranches

- [X] Tranche A: Canonical viewport schema slice
- [X] Tranche B: Canonical overlay schema slice
- [ ] Tranche C: Canonical top-strip, handles, and viewer-surface definitions
- [X] Tranche D: Canonical handle and separator slice
- [X] Tranche E: Canonical viewer-surface decision slice

### Pitfalls

- `ATTN:` The biggest Phase 1 risk is accidentally creating a second host-shaped grammar under canonical names.
- `ATTN:` `operator_surface` is intentionally narrow today. Do not bloat it into a browser-runtime clone.

---

## Phase 2: Bridge To The Shared Operator Core

### Purpose

- [ ] Stop using isolated host sample state as the product truth.

### Status

- [ ] Phase complete
- [X] Shared snapshot contract exists
- [X] Fixture-backed browser bridge exists
- [X] Live snapshot bootstrap API exists
- [X] A narrow live interaction slice now round-trips through the shared core
- [ ] Ongoing browser interaction is still only partially live-core-driven

### Do

- [ ] Bind the browser host to the real operator session/core.
- [X] Use fixture injection only for tests and offline fallback.

### Do Not

- [ ] Do not let the browser workbench become a parallel product.
- [ ] Do not duplicate semantics already present in the operator core.

### Required Work

- [X] Define the core-to-host snapshot contract for navigation location.
- [X] Define the core-to-host snapshot contract for active left pane.
- [X] Define the core-to-host snapshot contract for active right screen.
- [X] Define the core-to-host snapshot contract for active right section.
- [X] Define the core-to-host snapshot contract for search-result overlays deeply enough to remove browser-local assumptions.
- [X] Define the core-to-host snapshot contract for focus state.
- [X] Define the core-to-host snapshot contract for status and preview-read state.
- [X] Define the core-to-host snapshot contract for links and actions.
- [ ] Replace browser sample state fully with a real adapter over the operator core.
- [X] Replace browser main-path sample boot with shared snapshot adaptation.
- [X] Keep deterministic fixture injection available for tests.
- [X] Refresh browser-visible state from returned live snapshots for the first live interaction slice.
- [X] Reduce browser-local state for the first live interaction slice by rehydrating from returned snapshots.
- [ ] Match raw-shell and browser-host semantics for open, inspect, search, focus, context scoping, references, source, and provenance.
- [ ] Refresh browser-visible state from returned live snapshots for the remaining interaction families.
- [X] Reduce the remaining browser-local state to presentation-only state wherever possible.

### Acceptance Criteria

- [ ] The browser workbench is driven by the same live operator truth as other adapters.
- [ ] Search, inspect, focus, and status behave consistently across hosts.
- [X] Sample state survives only as a fixture and testing helper.

### Detailed Tranches

- [X] Tranche A: Shared snapshot contract and fixture-backed browser bridge
- [X] Tranche B: Live snapshot API bootstrap for the browser example
- [X] Tranche C: Live interaction bridge for the browser example
- [ ] Tranche D: Broaden live interaction parity and shrink remaining browser-local truth

### Tranche C Delivered

- [X] Round-trip at least one meaningful navigation path through the live core.
- [X] Start with left-pane cursor movement and primary activation.
- [X] Rehydrate browser state from live snapshots instead of mutating only local state.
- [X] Add test coverage proving browser interactions dispatch intents and redraw from returned snapshots.

### Tranche D Current State

- [X] Route pane-focus changes through live core intents.
- [X] Route top-strip navigation activation through live core intents.
- [X] Surface top-pane navigation state in the browser runtime from shared snapshots.
- [X] Route right-pane row cursor movement and activation through live core intents.
- [X] Route right-pane section switching and collapse/expand through live core intents.
- [X] Render left-pane search overlays from shared snapshot `mode`, `shape`, `title`, `header`, `columns`, `rows`, and `paging`.
- [X] Normalize the standalone browser sample-state path onto the canonical left-pane model.
- [X] Remove the browser-state `treeRows` compatibility mirror.
- [X] Remove top-strip and status compatibility mirrors.
- [X] Remove right-pane row/title compatibility mirrors.
- [X] Remove the `sessionLines` compatibility mirror.
- [X] Remove `commandText` and `helpLines` from the browser snapshot adapter and derive them in the browser runtime as host-presentation helpers.
- [X] Keep context-menu item content explicitly host-owned instead of treating it as shared snapshot truth.
- [X] Decide which overlay state remains truly local presentation and which overlay state belongs to the shared core.
- [X] Route `help_overlay` through shared-core help state and keep `context_menu` explicitly local for now.
- [X] Decide whether split-handle drag state remains local presentation or needs a canonical core contract before more work lands.
- [X] Persist vertical split release through the shared display-settings seam without surrendering transient drag ownership.
- [X] Replace the temporary mixed split bridge with a canonical `viewport.layout` snapshot and `set-viewport-layout` intent contract.
- [X] Resolve ownership of remaining convenience fields such as `commandText`, `helpLines`, and `contextMenuItems`.
- [X] Decide and implement the long-term persistence policy for top and bottom viewport layout.
- [X] Collapse duplicated browser-runtime focus, cursor, and help-overlay state onto shared snapshot fields and keep only local presentation overlays outside the snapshot contract.
- [X] Replace the mutable offline browser fallback path with an explicit fixture-readonly adapter that does not mutate product navigation, focus, help, or committed viewport truth locally.
- [X] Remove silent bridge-failure fallback from browser boot and require explicit fixture-mode entry for offline/testing launches.

### Acceptance Criteria For Remaining Tranche D Work

- [X] Split-handle ownership is explicit and tested.
- [X] Browser-local UI state is reduced to presentation-only concerns or documented as a deliberate exception.
- [ ] Shared-core snapshot authority is clear for the remaining high-value interaction families.
- [X] The browser example no longer carries authored viewport cuts locally once a canonical viewport-layout contract exists.
- [X] The browser example no longer needs legacy sample-state fallbacks once offline/demo fixture mode is retired or normalized.

### Verification

- [X] `cmd /c node --test test\operator-browser-example.test.js`
- [X] `cmd /c node --test --test-name-pattern "operator workbench definitions|invalid authored viewport|invalid authored overlay|invalid authored chrome surface|authored text_reader operator surfaces|invalid authored handle|split handle axis|duplicate authored viewport|examples root contains only" test\app-project.test.js`
- [X] Viewport-layout commit and vertical split persistence are covered in `test\operator-browser-example.test.js`.
- [X] Left-pane search overlay rendering from the shared snapshot model is covered in `test\operator-browser-example.test.js`.
- [X] Standalone sample-state rendering now exercises the canonical left-pane model in `test\operator-browser-example.test.js`.
- [X] `treeRows` mirror removal is covered in `test\operator-browser-example.test.js`.
- [X] Top-strip/status mirror removal is covered in `test\operator-browser-example.test.js`.
- [X] Right-pane row/title mirror removal is covered in `test\operator-browser-example.test.js`.
- [X] `sessionLines` mirror removal is covered in `test\operator-browser-example.test.js`.
- [X] Browser-helper ownership for `commandText`, `helpLines`, and `contextMenuItems` is covered in `test\operator-browser-example.test.js`.
- [X] Canonical `viewport.layout` snapshot adaptation and `set-viewport-layout` intent flow are covered in `test\operator-browser-example.test.js`.
- [X] `cmd /c node --test test\operator-workbench.test.js`
- [X] Workspace-scoped persistence for `viewportTop` and `viewportBottom` is covered in `test\operator-workbench.test.js` and `test\operator-browser-example.test.js`.
- [X] Rich-host settings save now includes explicit `viewportTop` and `viewportBottom` controls in `test\operator-workbench.test.js`.
- [X] Rich-host viewport reset-to-authored-default behavior is covered in `test\operator-workbench.test.js`.
- [X] The first scoped settings-reset pattern, including `data-settings-reset-scope="viewport"` dispatch, is covered in `test\operator-workbench.test.js`.
- [X] Snapshot-derived browser focus, cursor, and help-overlay ownership is covered in `test\operator-browser-example.test.js`.
- [X] Fixture-readonly browser fallback behavior, including local context-menu/scroll preservation without local product-state mutation, is covered in `test\operator-browser-example.test.js`.
- [X] Explicit fixture-bootstrap gating and no-silent-fallback behavior are covered in `test\operator-browser-example.test.js`.
- [X] Fixture-launcher demotion is reflected in `package.json` and `examples\operator\README.md`, while fixture bootstrap remains reachable through lower-level developer/testing entrypoints.

### Pitfalls

- `ATTN:` This is the highest-leverage architectural step after Phase 1.
- `ATTN:` The browser example still has a browser runtime adapter after boot, but it no longer needs a mutable offline pseudo-runtime for product navigation state.
- `ATTN:` The current overlay decision is intentionally asymmetric.
- `ATTN:` `help_overlay` now belongs to shared-core session/UI state.
- `ATTN:` `context_menu` is still local presentation because there is not yet a canonical shared-core menu ownership contract.
- `ATTN:` Do not silently spread more overlay types into local-only behavior without an explicit ownership decision.
- `ATTN:` Split-handle ownership is now explicitly mixed on purpose, not by accident.
- `ATTN:` Committed viewport geometry now lives in `snapshot.viewport.layout` and is updated through `set-viewport-layout`.
- `ATTN:` Transient drag preview remains browser-local presentation by design; committed geometry no longer does.
- `ATTN:` Viewport top, bottom, and split now persist as workspace-scoped display settings.
- `ATTN:` Authored viewport values remain the fallback defaults when no workspace-specific layout override exists.
- `ATTN:` The viewport reset affordance clears layout overrides rather than pinning the current authored values into workspace settings, so future authored viewport changes can still flow through.
- `ATTN:` Settings reset now dispatches through a generic scope-based host path; `viewport` is only the first implemented scope, and broader authored-backed settings adoption is still ahead.
- `ATTN:` The runtime save path must read settings values before triggering focus-refresh flows; otherwise host refresh can clobber pending edits.
- `ATTN:` The pane-split control should render the effective committed layout, not merely the raw persisted `paneSplit` setting, or reset semantics become misleading.
- `ATTN:` The browser adapter no longer needs `treeRows`, `metaChips`, `topNavigationChips`, `statusChips`, `rightRows`, `rightSectionTitle`, or `sessionLines`.
- `ATTN:` `commandText` and `helpLines` are now explicitly host-presentation helpers derived in the runtime, not shared snapshot fields.
- `ATTN:` `contextMenuItems` is still intentionally host-owned content. If the product later wants authored or core-owned menu composition, add a canonical menu-content contract instead of quietly reintroducing snapshot-local sugar.
- `ATTN:` Offline fixture boot is now explicit read-only adapter mode. Local context-menu presentation, scroll offsets, and drag preview may remain host-local there, but product navigation, focus, help, and committed viewport truth must not mutate locally.
- `ATTN:` The browser example should treat fixture-readonly mode as offline/testing infrastructure, not as the normal product boot path. Keep the live bridge path primary in docs and launch scripts.
- `ATTN:` The fixture-readonly launcher has now been demoted out of top-level package scripts. Keep it accessible through lower-level developer/testing entrypoints only unless the product later needs a deliberate offline demo surface.

---

## Phase 3: Global Compositor And Frame Graph

### Purpose

- [ ] Replace overlapping pane painting with a real compositor that owns borders, junctions, separators, overlays, and handles.

### Status

- [ ] Phase complete
- [X] First shared frame-graph slice landed in the browser example
- [X] Shared pane/separator composition no longer depends only on per-pane `drawFrame()` order
- [X] Focused-pane heavy frame emphasis landed through the shared frame graph
- [X] Mixed light/heavy and light/double junction selection is now deterministic
- [X] Double/heavy junction policy is now explicit and tested
- [X] Pane-title rails and right-pane status-edge adorners now paint through compositor ornaments
- [X] Overlay titles, right-pane section headers, and section-divider rules now paint through compositor ornaments
- [X] Left-pane header text and table-column headings now paint through compositor ornaments
- [X] Top-strip status text and command-surface text now paint through segmented compositor ornaments
- [X] A narrow generic text-scene path now handles left-pane body rows, right-pane body text, and overlay body text
- [X] A narrow generic fill-scene path now handles overlay fills
- [X] The current top, left, right, and bottom pane interiors now render through explicit base fill-scene entries
- [X] Fill-scene entries now carry normalized fill-style ids resolved through a shared fill-style catalog

### Do

- [X] Introduce one global frame and separator graph.
- [X] Compose borders once globally.
- [X] Support deterministic junction selection.

### Do Not

- [ ] Do not treat panes as independently painted overlapping rectangles.
- [ ] Do not keep fixing junctions after paint.

### Required Work

- [X] Model pane bounds.
- [X] Model separator ownership.
- [X] Model junction types.
- [X] Model overlay stacking.
- [X] Model handle segments.
- [X] Add explicit style variants for primary frame.
- [X] Add explicit style variants for passive frame.
- [X] Add explicit style variants for container frame.
- [X] Add explicit style variants for separator and handle.
- [X] Add explicit style variants for overlay frame.
- [X] Add explicit style variants for heavy frame emphasis.
- [X] Support deterministic mixed light/heavy junction selection.
- [X] Keep mixed double/heavy crossings on an explicit normalized fallback path instead of ad hoc host patching.
- [X] Support tasteful line-weight variation for the current single, heavy, double, and mixed junction vocabulary.
- [X] Move pane-title rails behind a more canonical compositor ornament path.
- [X] Move right-pane status-edge adorners behind a more canonical compositor ornament path.
- [X] Move overlay titles behind a compositor-owned overlay ornament path.
- [X] Move right-pane section headers and divider rules behind compositor-owned ornaments.
- [X] Move left-pane header text and results-table column headings behind compositor-owned ornaments.
- [X] Move top-strip status text and command-surface text behind segmented compositor ornaments.
- [X] Introduce a narrow generic text-scene path for non-frame surface body text.
- [X] Move right-pane text-reader body content off direct runtime paint and onto the text-scene path.
- [X] Move overlay body text off direct runtime paint and onto the text-scene path.
- [X] Move left-pane body rows off direct runtime paint and onto the text-scene path.
- [X] Introduce a narrow generic fill-scene path for surface fill regions.
- [X] Move overlay fills off the direct runtime paint path and onto the fill-scene path.
- [X] Remove the leftover dead surface-render pass after frame/title/body composition moved to frame-graph and scene layers.
- [X] Move the current four primary pane interiors off implicit clear-buffer background and onto explicit base fill-scene entries.
- [X] Move fill-scene entries off inline runtime style literals and onto normalized fill-style ids.
- [X] Resolve fill-scene paint through a shared fill-style variant catalog instead of per-entry ad hoc style objects.

### Acceptance Criteria

- [X] Shared borders never clobber each other due to draw order.
- [X] Junctions are deterministic and testable.
- [X] Container coloring can be applied without breaking separator logic.
- [X] Frame output can be snapshot-tested directly from the cell buffer.
- [X] Focused pane emphasis can change line weight without reintroducing local border patching.
- [X] Remaining mixed line-weight edge cases have an explicit final policy and test coverage.

### Tranche B Delivered

- [X] Introduce heavy-weight focused pane framing through shared frame-style variants.
- [X] Expand frame-graph glyph resolution to cover light/heavy and light/double mixed junctions.
- [X] Normalize currently unrepresentable double/heavy crossings deterministically instead of leaving them to paint order.

### Tranche C Delivered

- [X] Extend the frame graph with explicit ornament entries and layered text painting.
- [X] Move pane title rails out of direct host paint calls and into compositor-owned ornaments.
- [X] Move the right-pane status edge adorner out of direct host paint calls and into compositor-owned ornaments.

### Tranche D Delivered

- [X] Paint base and overlay frame-graph layers separately so overlay ornaments can render after overlay fills.
- [X] Move overlay title text out of direct host paint calls and into overlay-layer compositor ornaments.
- [X] Move right-pane section header and divider rule text out of direct host paint calls and into compositor-owned ornaments.

### Tranche E Delivered

- [X] Move left-pane header text out of direct host paint calls and into compositor-owned ornaments.
- [X] Move left-pane results-table column headings out of direct host paint calls and into compositor-owned ornaments.
- [X] Reuse the same ornament path for both tree-mode and results-mode left-pane heading content.

### Tranche F Delivered

- [X] Extend ornaments to support segmented text runs with per-segment styling.
- [X] Move top-strip status/meta text off direct runtime paint and onto the ornament path.
- [X] Move command-surface text off direct runtime paint and onto the ornament path.

### Tranche G Delivered

- [X] Introduce a narrow generic text-scene path for body-text surface content.
- [X] Move right-pane body text off direct runtime paint and onto the text-scene path.
- [X] Move overlay body text off direct runtime paint and onto the text-scene path.
- [X] Move left-pane body rows off direct runtime paint and onto the text-scene path.
- [X] Keep base text-scene and overlay text-scene layering deterministic relative to overlay fills and frame-graph layers.

### Tranche H Delivered

- [X] Introduce a narrow generic fill-scene path for fill-only surface content.
- [X] Move overlay fills off direct runtime paint and onto the fill-scene path.
- [X] Remove the leftover no-op surface-render pass so viewport composition is more explicitly frame-graph plus scene layers.
- [X] Return `fillScene` alongside `textScene` from browser composition for testable scene-layer inspection.

### Tranche I Delivered

- [X] Move the current top, left, right, and bottom pane interiors onto explicit base fill-scene entries.
- [X] Stop relying on implicit clear-buffer background as the only source of pane interior fill behavior.
- [X] Keep current visual output stable while making pane fill ownership inspectable in the returned composition model.

### Tranche J Delivered

- [X] Introduce a normalized fill-style variant catalog alongside the frame-style variants.
- [X] Move base and overlay fill-scene entries to style-id ownership instead of inline runtime fill objects.
- [X] Resolve fill painting through the shared fill-style catalog while keeping current visual output stable.
- [X] Add test coverage proving fill-scene entries expose style ids and resolve overlay flags through the fill-style catalog.

### Verification

- [X] `cmd /c node --test test\operator-browser-example.test.js`
- [X] `cmd /c node --test test\operator-workbench.test.js`
- [X] Mixed frame-glyph resolution coverage now lives in `test\operator-browser-example.test.js`.
- [X] Focused heavy-border composition and separator determinism are covered in `test\operator-browser-example.test.js`.
- [X] Explicit `double/heavy` normalization policy coverage now lives in `test\operator-browser-example.test.js`.
- [X] Compositor-owned frame ornaments are covered in `test\operator-browser-example.test.js`.
- [X] Overlay title and right-pane section ornament coverage now lives in `test\operator-browser-example.test.js`.
- [X] Left-pane header and table-column ornament coverage now lives in `test\operator-browser-example.test.js`.
- [X] Top-strip segmented ornaments and command-surface ornament coverage now live in `test\operator-browser-example.test.js`.
- [X] Right-pane body text-scene coverage now lives in `test\operator-browser-example.test.js`.
- [X] Overlay body text-scene coverage now lives in `test\operator-browser-example.test.js`.
- [X] Left-pane body text-scene coverage now lives in `test\operator-browser-example.test.js`.
- [X] Overlay fill-scene coverage now lives in `test\operator-browser-example.test.js`.
- [X] Base pane fill-scene coverage now lives in `test\operator-browser-example.test.js`.
- [X] Fill-style variant and fill-scene style-id coverage now live in `test\operator-browser-example.test.js`.

### Pitfalls

- `ATTN:` This phase is mandatory. Do not keep shipping local border patches in place of a compositor.
- `ATTN:` The current final policy for `double/heavy` crossings is to normalize to the double-line glyph family for portability and deterministic output. Revisit only if the renderer later gains a bespoke authored glyph vocabulary beyond standard Unicode box drawing.
- `ATTN:` The browser example should keep deriving frame glyphs from the graph. Do not quietly reintroduce independent pane `drawFrame()` calls for future polish.
- `ATTN:` Frame ornaments now have a compositor path, but the browser runtime still decides ornament content strings and placement rules. A later scene-model tranche may want authored ornament descriptors rather than runtime-composed labels.
- `ATTN:` The left pane still decides ornament content from normalized pane state in the runtime. This is a better ownership boundary than direct paint calls, but it is not yet the same thing as authored scene objects.
- `ATTN:` Segmented ornaments reduce runtime paint ownership further, but chip layout and truncation policy still live in the runtime. That is a scene-policy seam, not yet authored scene object ownership.
- `ATTN:` A narrow text-scene seam now exists for left-pane, right-pane, and overlay body text, but scene construction still lives in the browser runtime. This is a real compositor/scene boundary improvement, not yet authored scene-object ownership.
- `ATTN:` Base pane fills and overlay fills now both flow through the fill-scene path and a normalized fill-style catalog, but that catalog is still runtime-owned and mostly uniform. If richer viewer or editor surfaces need differentiated fills, extend the fill-style catalog deliberately and eventually decide whether it becomes authored rather than reintroducing direct special-case paints.

---

## Phase 4: Final Glyph Fidelity

### Purpose

- [ ] Turn the current glyph path from viable to intentionally controlled and portable.

### Status

- [ ] Not started

### Do

- [ ] Treat glyph output as a product-quality rendering problem.
- [ ] Keep the scene and cell contract fixed while improving fidelity beneath it.

### Do Not

- [ ] Do not rely on host font luck as the final answer.
- [ ] Do not optimize fidelity before the scene and compositor contracts are stable enough.

### Required Work

- [ ] Audit box-drawing coverage across the target glyph set.
- [ ] Harden glyph-atlas generation for box-drawing, shading, and UI marks.
- [ ] Support exact copy and export of rendered box-drawing content.
- [ ] Preserve highlight, selection, and rectangular-selection fidelity.
- [ ] Verify color-layer ordering and cursor/highlight composition.
- [ ] Define the target strategy for fallback glyph rendering when atlas generation is unavailable.

### Acceptance Criteria

- [ ] Rendered tables, frames, and separators are visually intentional and stable.
- [ ] Selection and copy preserve box-drawing output exactly.
- [ ] The renderer no longer depends on incidental font behavior for critical UI geometry.

---

## Phase 5: Generic Surface Family

### Purpose

- [ ] Replace bespoke screen logic with reusable authored surface families.

### Status

- [ ] Not started

### Do

- [ ] Promote recurring surfaces into generic authored shapes.
- [ ] Make the authored model strong enough to dogfood the workbench itself.

### Do Not

- [ ] Do not keep growing one-off inspect/help/menu/viewer implementations.

### Required Work

- [ ] Define canonical surface families for `detail`.
- [ ] Define canonical surface families for `list`.
- [ ] Define canonical surface families for `table`.
- [ ] Define canonical surface families for `tree`.
- [ ] Define canonical surface families for `kv`.
- [ ] Define canonical surface families for `menu`.
- [ ] Define canonical surface families for `viewer`.
- [ ] Define canonical surface families for `json-viewer`.
- [ ] Normalize authored inputs into one surface contract.
- [ ] Make left and right pane rendering consume the same surface family model where appropriate.

### Acceptance Criteria

- [ ] New workbench screens are mostly authoring exercises, not host rewrites.
- [ ] Viewer, menu, and detail surfaces reuse the same underlying product model.
- [ ] The browser prototype grammar can shrink materially because the canonical surface family is sufficient.

---

## Phase 6: Interaction Model

### Purpose

- [ ] Unify navigation, activation, help, menus, references, and focus changes under one interaction model.

### Status

- [ ] Not started

### Do

- [ ] Define intents first.
- [ ] Keep host input mapping thin and replaceable.

### Do Not

- [ ] Do not encode product behavior directly in browser keyboard and mouse handlers.

### Required Work

- [ ] Define core intents for primary activation.
- [ ] Define core intents for alternative action and context menu.
- [ ] Define core intents for pane focus changes.
- [ ] Define core intents for section focus changes.
- [ ] Define core intents for references, source, provenance, and help switching.
- [ ] Define core intents for viewport switching.
- [ ] Define core intents for unwind and escape.
- [ ] Define core intents for save, open, and close view.
- [ ] Define core intents for rename, edit, and clone hooks.
- [ ] Support number-buffer plus `Enter` as a host binding over a core action model.
- [ ] Support context-menu routing as a real workbench object.
- [ ] Support per-surface help context and actionable links.

### Acceptance Criteria

- [ ] The same product action can be invoked from keyboard, mouse, and future native bindings.
- [ ] Help, references, and menus are no longer special-case host widgets.
- [ ] Host event code becomes an input adapter, not business logic.

---

## Phase 7: Structured Viewers

### Purpose

- [ ] Turn text-reader style surfaces into deliberate reusable viewers.

### Status

- [ ] Not started

### Do

- [ ] Treat JSON, provenance, ownership, docs, and references as viewer-family problems.

### Do Not

- [ ] Do not ship JSON or provenance as long unstructured text forever.

### Required Work

- [ ] Add a generic text viewer.
- [ ] Add a JSON viewer with object collapse and expand behavior.
- [ ] Add a provenance and ownership tree viewer.
- [ ] Add a link-aware documentation viewer.
- [ ] Support viewer-local scroll state, cursor, and navigation without host-only hacks.

### Acceptance Criteria

- [ ] `jsonSource` style content can open in a structured authored viewer.
- [ ] Ownership and provenance can be navigated as trees.
- [ ] Viewer behavior is reusable across help, docs, source, and provenance.

---

## Phase 8: Viewports, Settings, And Personalization

### Purpose

- [ ] Let users shape the workbench without breaking the product boundary.

### Status

- [ ] Not started

### Do

- [ ] Keep user preferences above rendering and below product truth.

### Do Not

- [ ] Do not bake per-host presentation preferences into core semantics.

### Required Work

- [ ] Add workspace-scoped display settings.
- [ ] Add settings for font size.
- [ ] Add settings for row density.
- [ ] Add settings for pane split.
- [ ] Add settings for default visible columns.
- [ ] Add settings for page size.
- [ ] Add settings for color mode.
- [ ] Add settings for keybindings.
- [ ] Add authored minimum pane sizes.
- [ ] Add authored overlay default sizes.
- [ ] Add authored resizable handles.
- [ ] Add authored profile modes such as `640x480` and `16-color`.
- [ ] Add named viewport save and restore behavior.

### Acceptance Criteria

- [ ] Users can save named viewport arrangements and reopen them.
- [ ] Keybindings are customizable without rewriting host code.
- [ ] The workbench can intentionally run in constrained classic profiles.

---

## Phase 9: Editing And Expansion Mode

### Purpose

- [ ] Bring editing into the same workbench language, including expansion and open-out behavior.

### Status

- [ ] Not started

### Do

- [ ] Keep edit mode inside the same product.
- [ ] Let edit surfaces use the same compositor and interaction model.

### Do Not

- [ ] Do not create a separate app experience for editing.

### Required Work

- [ ] Define edit surfaces.
- [ ] Define edit intents.
- [ ] Support expanded workbench mode while editing.
- [ ] Support larger canvas or window footprint in expansion mode.
- [ ] Support additional panels where needed.
- [ ] Add animated transition only if it can be done cleanly through the compositor.
- [ ] Route property editing, rename, and clone through the same action model.

### Acceptance Criteria

- [ ] Right-click edit and keyboard edit intents open the same authored edit surface.
- [ ] Edit mode remains inside the workbench product language.
- [ ] Expanded layouts are compositor-driven, not host hacks.

---

## Phase 10: Host Adapter Completion

### Purpose

- [ ] Make browser the first complete host while preserving a clean path to Electron and native.

### Status

- [ ] Not started

### Do

- [ ] Freeze the host-adapter boundary.
- [ ] Keep host ownership minimal and explicit.

### Do Not

- [ ] Do not allow Electron to become a second product implementation.

### Required Work

- [ ] Freeze the host-adapter contract.
- [ ] Ensure the browser host owns DOM and canvas lifecycle only.
- [ ] Ensure the browser host owns input capture only.
- [ ] Ensure the browser host owns clipboard integration only.
- [ ] Ensure the browser host owns browser-specific persistence only.
- [ ] Verify the same compiled workbench model can be consumed by the browser host.
- [ ] Verify the same compiled workbench model can be consumed by the Electron host.
- [ ] Verify the same compiled workbench model can be consumed by a future native host.

### Acceptance Criteria

- [ ] No product logic has to move when adding a new host.
- [ ] Electron remains a host adapter over the same core.
- [ ] Native-host experimentation can begin without core redesign.

---

## Testing Strategy

### Authoring And Definition Tests

- [ ] Parse and normalize authored workbench definitions.
- [ ] Reject invalid references.
- [ ] Reject invalid bindings.
- [ ] Enforce shape legality.
- [ ] Enforce viewport constraints.
- [ ] Enforce overlay and handle constraints.

### Core And Compositor Tests

- [ ] Snapshot layout output.
- [ ] Snapshot junction output.
- [ ] Verify separator ownership.
- [ ] Verify scene-model determinism.
- [ ] Verify interaction routing.

### Buffer And Glyph Tests

- [X] Cell memory-map layout.
- [X] Glyph coverage helpers.
- [ ] Glyph-atlas generation quality.
- [ ] Selection and copy fidelity.
- [ ] Color and layer correctness.

### Browser Visual Tests

- [ ] Screenshot tests.
- [ ] Size-profile tests.
- [ ] Overlay positioning tests.
- [ ] Handle dragging tests.
- [ ] Hover, focus, and selection-state tests.

### Cross-Host Contract Tests

- [ ] Same input state produces the same scene model.
- [ ] Same scene model renders acceptably across hosts.

---

## Immediate Next Moves

Execution order from here:

1. Finish Phase 2 Tranche D.
2. Expand Phase 3 from the first landed compositor slices into the full frame-graph policy.
3. Tighten Phase 1 left/right projection authoring where the compositor or surface-family work exposes gaps.
4. Move into Phase 5 and Phase 6 only after the compositor boundary is real.

Concrete next checklist:

- [X] Reduce the remaining browser-local state to presentation-only state.
- [X] Decide whether remaining convenience fields such as `commandText`, `helpLines`, and `contextMenuItems` should stay host-owned presentation helpers or move to a more canonical authored/snapshot shape.
- [X] Introduce a canonical viewport-layout contract so top, bottom, and split handle state no longer live as mixed browser-local geometry.
- [X] Decide and implement the long-term persistence policy for top and bottom viewport layout.
- [X] Expose explicit top and bottom viewport controls in the rich settings surface, or intentionally leave them handle-only and document that choice.
- [X] Add an explicit reset-to-authored-default affordance for viewport top, bottom, and split, or deliberately document that saved values must be edited manually.
- [X] Decide whether viewport reset should remain a dedicated one-off control or become part of a generic settings-reset pattern for authored-backed preferences.
- [X] Remove duplicated browser-runtime mirrors for focused pane, row cursors, top selection, and help overlay state where the shared snapshot already owns that truth.
- [ ] Decide whether additional authored-backed settings should migrate onto the same scoped reset pattern before or during the compositor phase.
- [X] Decide whether the remaining offline browser fallback path should stay mutable for demo mode or be replaced with a fixture-only no-edit adapter before compositor work.
- [X] Decide whether fixture-readonly browser boot should remain a user-facing demo path or become an explicit testing/offline-only launch mode before compositor work.
- [X] Decide whether the explicit fixture-readonly launcher should stay as a package script or move behind a lower-level developer/testing workflow once the compositor phase starts.
- [X] Stop patching frame junctions locally and move to the compositor phase.
- [X] Land the first shared frame-graph slice for pane, separator, and overlay frames.
- [X] Add focused heavy-frame emphasis and deterministic light-heavy/light-double mixed junction selection through the compositor.
- [X] Decide the final product policy for double/heavy crossings and the remaining current mixed glyph edge cases.
- [X] Move host-painted frame-adjacent ornaments such as title rails and status-edge adorners behind a more canonical compositor or scene contract where appropriate.
- [X] Decide whether remaining frame-affiliated content like overlay titles and section-divider rules should also become compositor or scene-owned ornaments.
- [X] Decide whether left-pane header text and results-table headings should also become compositor-owned ornaments.
- [X] Move top-strip status/meta text and command-surface text behind the ornament path.
- [X] Move the first non-frame body-text surfaces onto a generic text-scene path rather than direct runtime paint loops.
- [X] Move the first fill-only surface region onto a generic fill-scene path rather than a direct runtime paint special case.
- [X] Move the current primary pane interiors onto explicit base fill-scene entries.
- [X] Normalize fill-scene styling behind shared fill-style ids rather than inline runtime fill objects.
- [ ] Decide whether the remaining surface-affiliated headings or separators should become authored scene objects rather than runtime-composed ornaments.
- [ ] Decide whether the normalized fill-style catalog should remain runtime-owned or move into a broader authored fill-scene contract before richer viewer and editor surfaces arrive.
- [ ] Keep moving the remaining frame semantics out of host paint code and into the compositor contract.

Why this is next:

- [X] More browser-host behavior without live-core truth creates rework.
- [X] The browser can now boot from live core state and complete one real live navigation path.
- [X] The next meaningful step is to broaden that parity before the browser runtime hardens around more local truth.
- [X] The compositor should begin before more border, pane, overlay, and handle polish accumulates.

`ATTN:` If there is any doubt between adding more UX polish and strengthening schema/core/compositor boundaries, choose schema/core/compositor first.
