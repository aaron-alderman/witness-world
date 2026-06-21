# Operator Workbench Completion TODO

> Superseded by `OPERATOR-WORKBENCH-HEROIC-SPEC-TODO.md`.
>
> Use `OPERATOR-WORKBENCH-HEROIC-SPEC-TODO.md` as the canonical tracker for:
> - current status
> - remaining work
> - tranche boundaries
> - acceptance criteria
> - ATTN notes and blockers
>
> This file remains as historical context only and is no longer the authoritative source of truth.

This document is the canonical self-contained delivery tracker for the operator workbench.

Use it as:

- the product goal
- the honest status readout
- the architecture guardrail
- the phase-by-phase TODO
- the acceptance checklist
- the anti-regression list when implementation pressure rises

---

## How To Use This Document

- Change `[ ]` to `[X]` only when the statement is materially true, not merely started.
- Add `ATTN:` notes when implementation exposes a shortcut, ownership leak, or misleading seam.
- Prefer explicit ownership over convenience duplication.
- If a phase lands only partially, record the real boundary instead of claiming the whole phase.
- Keep this document self-contained; do not make it depend on oral history.
- If a new tranche does not obviously strengthen the authored model, core ownership, compositor, or reusable surface family, it is probably too early.

---

## Product Goal

- [ ] Build the operator workbench as a real authored product surface, not a painted browser prototype.

The intended end state is:

- [ ] One shared operator core owns navigation, selection, search, focus, inspection, references, provenance, preview-read state, intents, and workbench object lifecycle.
- [ ] One canonical RVM/operator authoring pathway defines the workbench.
- [ ] The browser workbench is the first fully correct rich host.
- [ ] Electron is only a host adapter, not a second product implementation.
- [ ] Future native hosts can consume the same compiled workbench model.
- [ ] Rendering is genuinely cell-based and scene-driven rather than HTML layout wearing a TUI costume.
- [ ] Frames, separators, handles, overlays, and junctions are composed globally and deterministically.
- [ ] Menus, help, viewers, references, provenance, editing, and viewport management are first-class workbench objects.

---

## Definition Of Done

This effort is not complete until all of the following are materially true:

- [ ] Product truth lives in the shared operator core.
- [ ] The workbench is authored through canonical RVM/operator definitions.
- [ ] The renderer consumes a host-neutral scene or cell model.
- [ ] The compositor is the universal authority for borders, separators, handles, overlays, and mixed-weight junctions.
- [ ] Right-pane and left-pane surfaces are both renderer-agnostic products, not host-specific implementations.
- [ ] Menus, help, viewers, references, provenance, and editing are expressed through one coherent interaction model.
- [ ] Browser, Electron, and future hosts can consume the same compiled workbench model without product rewrites.

---

## Honest Current State

What is materially true today:

- [X] There is a browser-first operator example under `examples/operator`.
- [X] There is a cell buffer and contiguous memory-map seam.
- [X] There is a glyph-atlas blit path instead of direct per-cell `fillText` for the main render path.
- [X] There is a canonical `operator_viewport` seam in the operator-workbench RVM pathway.
- [X] There are canonical seams for overlays, chrome surfaces, handles, and viewport persistence.
- [X] There is a shared operator-core snapshot export that includes viewport metadata.
- [X] The browser example prefers a live shared-snapshot API at boot.
- [X] The browser example now requires explicit opt-in for fixture-readonly mode instead of silently falling back.
- [X] A narrow but real live interaction slice round-trips through the shared core.
- [X] The browser-side left pane now renders from the canonical `leftPane` model rather than browser-only mirrors.
- [X] Several browser compatibility mirrors have already been removed.
- [X] A first frame-graph/compositor slice exists for pane, separator, and overlay composition.
- [X] The four primary pane interiors now render through explicit base fill-scene entries rather than only implicit clear-buffer background.
- [X] Fill-scene entries now resolve through a normalized fill-style catalog rather than inline runtime fill literals.
- [X] Text-scene and segmented ornament entries now resolve through a normalized text-style catalog rather than inline runtime text-style literals.

What is not materially true yet:

- [ ] The browser host is not yet driven by the real shared operator core for most interactions after boot.
- [ ] The browser host still owns too much browser-local runtime truth.
- [ ] The browser-side prototype grammar is not yet fully retired behind the canonical authored pathway.
- [ ] The compositor is not yet the universal authority for every border, separator, overlay, handle, and text-affiliated scene object.
- [ ] Generic authored surface families are not yet complete.
- [ ] Menus, help, viewers, references, provenance, and editing are not yet unified under one interaction model.
- [ ] Final glyph fidelity and selection behavior are not complete.
- [ ] Cross-host portability is not yet proven end to end.

Plain-English assessment:

- [X] This is beyond mockup territory.
- [ ] This is not yet the finished product architecture.
- [X] The highest-leverage remaining work is ownership cleanup, compositor completion, surface-family unification, and authored-model tightening.

ATTN: The runtime-owned style catalogs are a real improvement over inline paint literals, but they are still runtime-owned. They are not yet the final authored scene-policy boundary.

---

## Current Priority

- [ ] Finish shrinking browser-local product truth in Phase 2.
- [ ] Expand Phase 3 from the first frame-graph slice into the full shared compositor contract.
- [ ] Tighten Phase 1 so the canonical authored pathway covers the workbench shapes that still live in browser-specific definition space.
- [ ] Do not pile on more UI cleverness until Phase 2 and Phase 3 are materially stronger.

---

## Global Pitfalls To Avoid

- [ ] Do not let `examples/operator/browser/operator-runtime.js` become the permanent product runtime.
- [ ] Do not let the browser-side grammar remain a forever sidecar detached from canonical RVM.
- [ ] Do not use DOM layout, DOM tables, CSS box layout, or browser scrollbars as the real layout engine.
- [ ] Do not collapse product semantics and rendering logic into one host module.
- [ ] Do not keep fixing border and junction bugs with more render-order exceptions instead of expanding the compositor.
- [ ] Do not treat host-font-derived glyph output as the final fidelity answer.
- [ ] Do not implement help, menus, viewers, or edit mode as isolated one-off widgets.
- [ ] Do not add more heroic UX while the authored model and compositor boundary are still weak.
- [ ] Do not hard-code host behavior that should instead be authored or normalized.
- [ ] Do not accept sample host state as long-term product truth.
- [ ] Do not push Electron-specific logic into the shared core.

---

## What To Do

- [ ] Keep pushing truth into the shared operator core.
- [ ] Compile authored workbench definitions into a host-neutral surface tree and scene.
- [ ] Expand the compositor into the single authority for frame and separator behavior.
- [ ] Promote repeated render patterns into real surface families instead of multiplying special cases.
- [ ] Keep interactions intent-driven rather than host-event-driven.
- [ ] Treat viewers, help, menus, and editing as reusable product surfaces.
- [ ] Verify at three layers:
- [ ] definition parse, validation, and normalization
- [ ] core, compositor, snapshot, and scene behavior
- [ ] host rendering and interaction behavior

---

## What Not To Do

- [ ] Do not ship HTML layout disguised as a TUI.
- [ ] Do not let browser-local convenience mirrors become permanent product truth.
- [ ] Do not keep inventing host-local widgets for help, menus, viewers, or editing.
- [ ] Do not delay the compositor until after interaction features accumulate.
- [ ] Do not delay structured viewers until after editing; they are a core surface family.
- [ ] Do not add more rendering cleverness if it deepens ownership ambiguity.

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

## Phase Dependency Order

The safe execution order is:

- [ ] Phase 1 must be strong enough that the browser is not forced to invent product structure ad hoc.
- [ ] Phase 2 must reduce browser-local truth before large new feature families land.
- [ ] Phase 3 must own borders, separators, overlays, and handles before more visual complexity lands.
- [ ] Phase 5 and Phase 7 must exist before Phase 9 grows serious editing.
- [ ] Phase 10 should be a proof of architecture quality, not a late rescue rewrite.

---

## Phase Summary

- [X] Phase 0: Browser-first rendering prototype
- [ ] Phase 1: Canonical authored workbench schema
- [ ] Phase 2: Bridge to the shared operator core
- [ ] Phase 3: Global compositor and frame graph
- [ ] Phase 4: Final glyph fidelity and terminal-grade behavior
- [ ] Phase 5: Generic surface family
- [ ] Phase 6: Interaction model
- [ ] Phase 7: Structured viewers and docs/help surfaces
- [ ] Phase 8: Viewports, pane sizing, and personalization
- [ ] Phase 9: Editing and expansion mode
- [ ] Phase 10: Host adapter completion

---

## Phase 0: Browser-First Rendering Prototype

### Goal

- [X] Prove that a browser-first, canvas-first, cell-first direction is viable.

### Current Status

- [X] Phase complete

### Required Work

- [X] Create the browser-first scaffold under `examples/operator`.
- [X] Add a browser-side authored prototype file.
- [X] Introduce a cell buffer with contiguous memory map.
- [X] Add the AssemblyScript seam and Wasm build path.
- [X] Add an example launcher and browser server.
- [X] Add layout, buffer, scroll, and frame scaffold tests.
- [X] Replace direct per-cell `fillText` with a glyph-atlas blit path.

### Acceptance Criteria

- [X] The repo proves a cell-grid browser host is viable.
- [X] The repo proves rendering can move away from ordinary DOM layout.
- [X] The repo proves there is enough substrate to continue with real architecture work.

### Pitfalls To Avoid

- [ ] Do not confuse viability with completion.

---

## Phase 1: Canonical Authored Workbench Schema

### Goal

- [ ] Replace the ad hoc browser-side model with one canonical RVM/operator authoring pathway for the workbench.

### Current Status

- [ ] Phase complete
- [X] Viewport seam landed
- [X] Overlay seam landed
- [X] Handle seam landed
- [X] Chrome-surface seam landed
- [ ] Left-pane authored model is incomplete
- [ ] Right-pane generic projection model is incomplete
- [ ] Viewer-surface authoring is still deferred
- [ ] Theme and scene-style ownership is not yet canonical

### Required Work

- [X] Define canonical authored forms for top-strip and bottom-strip chrome.
- [X] Define canonical authored forms for overlays and context menus.
- [X] Define canonical authored forms for viewport presets and viewport-scoped bindings.
- [X] Define canonical authored forms for pane handles and separators.
- [ ] Define canonical authored forms for left-pane projections.
- [ ] Define canonical authored forms for right-pane projections.
- [ ] Define canonical authored forms for viewer surfaces.
- [ ] Decide whether the browser prototype grammar disappears entirely or survives only as a generated artifact.
- [ ] Add validation for pane references.
- [ ] Add validation for surface-shape legality.
- [ ] Add validation for viewport constraints.
- [ ] Add validation for overlay ownership.
- [ ] Add a normalized compiled workbench schema contract.
- [ ] Decide whether themes, text styles, and fill styles remain runtime-owned or become authored workbench assets.

### Acceptance Criteria

- [ ] There is one canonical authored pathway for workbench definition.
- [ ] The browser workbench can be described without relying on an ad hoc product grammar.
- [ ] Invalid authored definitions fail clearly.
- [ ] Tests cover parse, validation, normalization, and compiled output.
- [ ] Theme and scene-style ownership is explicit rather than split across runtime and authoring seams.

### Pitfalls To Avoid

- [ ] Do not keep the browser grammar as permanent product truth.
- [ ] Do not let critical surface concepts exist only in handwritten host code.
- [ ] Do not add more authored fields without defining who compiles and owns them.

---

## Phase 2: Bridge To The Shared Operator Core

### Goal

- [ ] Make the shared operator core the real owner of workbench truth and reduce browser-local runtime state to adapter concerns.

### Current Status

- [ ] Phase complete
- [X] Shared workbench snapshot export exists
- [X] Browser boot prefers live shared snapshot data
- [X] Fixture-readonly boot requires explicit opt-in
- [X] A narrow live interaction slice round-trips through the shared core
- [X] Browser left-pane rendering now consumes the canonical `leftPane` snapshot model
- [ ] Most interactions after boot are still browser-runtime-driven
- [ ] The browser still owns too much cursor, help, viewer, and render-prep truth

### Required Work

- [ ] Make the browser host consume the real shared workbench snapshot for most interactions after boot.
- [ ] Remove remaining browser-local mirrors where the shared snapshot already owns the same truth.
- [ ] Move help, references, provenance, and viewer context ownership into the core snapshot or compiled scene model.
- [ ] Tighten the host-facing contract for top strip, left pane, right pane, command bar, overlays, and viewport state.
- [ ] Ensure row activation, focus movement, unwind, and screen changes dispatch core-owned intents rather than host-local product logic.
- [ ] Keep the browser runtime limited to rendering, event capture, clipboard, and adapter glue.

### Acceptance Criteria

- [ ] The browser host is mostly a renderer plus input adapter.
- [ ] Shared snapshot truth is sufficient for pane state, focus state, view state, and workbench context.
- [ ] Removing a browser-local mirror no longer changes product behavior because the host was not the true owner.
- [ ] Tests cover live shared-snapshot flows rather than fixture-only browser behavior.

### Pitfalls To Avoid

- [ ] Do not keep adding features on browser-owned state and promise to normalize them later.
- [ ] Do not move renderer-specific concerns into the core just to make the adapter thinner.

---

## Phase 3: Global Compositor And Frame Graph

### Goal

- [ ] Make the compositor and frame graph the universal authority for pane boundaries, overlays, separators, handles, and junctions.

### Current Status

- [ ] Phase complete
- [X] A first frame-graph slice exists
- [X] Pane, separator, and overlay composition already use that slice in narrow paths
- [X] Base pane interiors now render through explicit fill-scene entries
- [X] Fill scenes now resolve through normalized fill-style ids
- [X] Text scenes and segmented ornaments now resolve through normalized text-style ids
- [ ] Not every border, junction, or overlay-affiliated text object is yet owned by the compositor
- [ ] Some render correctness still depends on runtime ordering knowledge

### Required Work

- [ ] Finish the global frame graph so panes do not paint overlapping rectangles independently.
- [ ] Centralize border, separator, handle, overlay, and shared-junction ownership in the compositor.
- [ ] Normalize mixed single, double, and heavy line behavior through graph-owned rules rather than local paint tricks.
- [ ] Define deterministic layering rules for base fills, base frame graph, base text, overlay fills, overlay text, and overlay frame graph.
- [ ] Move remaining host-local separator and junction math into graph composition.
- [ ] Ensure active vs passive pane styling does not clobber shared borders due to paint order.

### Acceptance Criteria

- [ ] Junction behavior is deterministic and testable.
- [ ] Shared separators do not get clobbered by paint order.
- [ ] Frame and separator rendering is driven by graph and scene data rather than patched after the fact.
- [ ] New panes or overlays can be added without inventing new junction logic.

### Pitfalls To Avoid

- [ ] Do not keep fixing compositor problems with more render-order exceptions.
- [ ] Do not let each pane surface own its own border math.
- [ ] Do not let active-pane emphasis override graph correctness.

---

## Phase 4: Final Glyph Fidelity And Terminal-Grade Behavior

### Goal

- [ ] Finish the renderer so it behaves like a serious cell-grid workbench rather than a canvas approximation.

### Required Work

- [ ] Complete the extended box-drawing glyph policy, including tasteful single, double, and heavy usage.
- [ ] Ensure glyph metrics are stable across the atlas and do not drift by pane or font path.
- [ ] Finish text selection behavior for word, line, and rectangular selection.
- [ ] Preserve copied text exactly as rendered, including box-drawing characters.
- [ ] Eliminate residual HTML affordances such as browser scrollbars or DOM-looking controls in the workbench surface.
- [ ] Ensure title, chrome controls, and status ornaments are rendered as cell content, not incidental host widgets.
- [ ] Support copy and selection without breaking cell-accurate layout.

### Acceptance Criteria

- [ ] The workbench visually reads as cell-grid-first rather than HTML-first.
- [ ] Selection and copy preserve rendered glyphs exactly.
- [ ] The renderer does not depend on browser scrollbars or DOM layout behavior for core UX.
- [ ] Glyph regressions are covered by visual or structural rendering tests.

### Pitfalls To Avoid

- [ ] Do not overuse heavy or double frames everywhere.
- [ ] Do not allow font fallback or inconsistent metrics to create false layout bugs.
- [ ] Do not call the renderer finished while text selection or copy still diverge from the displayed grid.

---

## Phase 5: Generic Surface Family

### Goal

- [ ] Replace one-off pane renderers with reusable authored surface families.

### Required Work

- [ ] Define reusable surface families for detail, list, table, tree, menu, help, inspector, and text-reader behavior.
- [ ] Normalize section behavior so authored sections are real workbench objects, not just render decoration.
- [ ] Make left-pane and right-pane consume the same family contracts where appropriate.
- [ ] Introduce a generic surface descriptor that can be compiled from authored workbench definitions.
- [ ] Stop encoding repeated surface semantics in browser runtime conditionals.

### Acceptance Criteria

- [ ] Most pane rendering is driven by compiled surface families rather than handwritten host branching.
- [ ] New screens can be authored by composing surface families instead of adding host-specific code.
- [ ] Shared tests cover surface normalization and rendering expectations.

### Pitfalls To Avoid

- [ ] Do not keep every viewer or inspector as a special case.
- [ ] Do not hide product decisions inside renderer-specific branching.

---

## Phase 6: Interaction Model

### Goal

- [ ] Make interactions intent-driven, consistent, and authorable.

### Required Work

- [ ] Formalize pane focus, section focus, selection, activation, context menu, and unwind semantics.
- [ ] Move keyboard and pointer behavior onto generic intents rather than bespoke browser handlers.
- [ ] Finish primary-action and alternate-action ownership.
- [ ] Make links first-class actionable targets across panes and surfaces.
- [ ] Define contextual help ownership and trigger flow.
- [ ] Define right-click and context-menu flow as a real workbench surface.
- [ ] Introduce customizable keybinding seams without leaking host-specific behavior into core logic.

### Acceptance Criteria

- [ ] Keyboard and mouse interactions map to core-owned intents.
- [ ] Links, menus, help, and navigation use one coherent interaction model.
- [ ] Interaction tests cover focus movement, activation, unwind, menu invocation, and link inspection.

### Pitfalls To Avoid

- [ ] Do not bolt new interactions onto individual widgets without generalizing the intent model.
- [ ] Do not let the browser host become the permanent owner of keybinding semantics.

---

## Phase 7: Structured Viewers And Docs/Help Surfaces

### Goal

- [ ] Promote readers and inspectors into real structured surfaces rather than plain text dumps.

### Required Work

- [ ] Add structured JSON, source, help, provenance, and reference viewers.
- [ ] Support navigable trees for ownership and provenance.
- [ ] Support long-content horizontal and vertical browsing where required without reintroducing browser scrollbars as product truth.
- [ ] Make F1 help a first-class authored window or overlay surface.
- [ ] Ensure property and metadata rows can expose links and inline actions consistently.
- [ ] Define text-reader and structured-reader surface families that can scale into edit mode later.

### Acceptance Criteria

- [ ] JSON, source, docs/help, provenance, and references all render as real workbench surfaces.
- [ ] Help and viewer surfaces can be resized, focused, and navigated consistently.
- [ ] Viewer behavior is shared and reusable instead of host-local.

### Pitfalls To Avoid

- [ ] Do not leave JSON, source, or help as one-off text-reader hacks.
- [ ] Do not let viewer behavior diverge between browser and Electron.

---

## Phase 8: Viewports, Pane Sizing, And Personalization

### Goal

- [ ] Make viewport control, pane sizing, and user-personalized layouts first-class and eventually authorable.

### Current Status

- [ ] Phase complete
- [X] Top, bottom, and split viewport settings persist
- [X] Reset-to-authored-default viewport behavior exists
- [ ] Grabbable pane handles are not yet complete
- [ ] Saved named viewports are not yet complete
- [ ] Ownership of authored defaults vs session state vs workspace state still needs tightening

### Required Work

- [X] Persist top, bottom, and split viewport settings.
- [X] Expose reset-to-authored-default viewport behavior.
- [ ] Add grabbable left/right and up/down handles for pane resizing.
- [ ] Add viewport save and restore flows.
- [ ] Define which viewport behaviors are workspace-scoped, session-scoped, or authored defaults.
- [ ] Ensure authored definitions can express pane sizing and viewport presets cleanly.

### Acceptance Criteria

- [ ] Users can resize panes and restore authored defaults predictably.
- [ ] Viewport settings do not leak into product truth incorrectly.
- [ ] Viewport behavior is test-covered and renderer-agnostic.

### Pitfalls To Avoid

- [ ] Do not entangle viewport persistence with authored truth.
- [ ] Do not make pane sizing a browser-only behavior.

---

## Phase 9: Editing And Expansion Mode

### Goal

- [ ] Turn the workbench from read-mostly inspection into an authored editing environment without breaking the cell-grid product model.

### Required Work

- [ ] Define the edit-mode surface family.
- [ ] Define expansion or multi-panel behavior for deeper editing flows.
- [ ] Ensure editing surfaces are authored through the same workbench language set.
- [ ] Add rename, edit, clone, and property-edit actions through menus and direct intents.
- [ ] Reconcile preview-read, future preview-write, and editing surfaces without inventing a second architecture.
- [ ] Ensure editors can grow the canvas or viewport model coherently rather than escaping into host-native widgets.

### Acceptance Criteria

- [ ] Edit mode is a coherent extension of the same workbench architecture.
- [ ] Editing does not force DOM controls or host-native widgets into the product surface.
- [ ] Editing flows reuse shared surface families and intents.

### Pitfalls To Avoid

- [ ] Do not build editing as a parallel UI stack.
- [ ] Do not postpone viewer architecture so long that editing has nothing reusable to build on.

---

## Phase 10: Host Adapter Completion

### Goal

- [ ] Prove the workbench architecture is actually host-agnostic.

### Required Work

- [ ] Keep the browser host as the first complete rich host.
- [ ] Keep Electron as a host adapter over the same product model.
- [ ] Move OS chrome, menu, and shell concerns into adapter-owned presentation seams.
- [ ] Prove the compiled workbench model can be consumed without rewriting product semantics.
- [ ] Define the boundary needed for future native or Rust-owned hosts.

### Acceptance Criteria

- [ ] Browser and Electron consume the same compiled workbench and core truth.
- [ ] Electron-specific behavior does not leak into product semantics.
- [ ] A future native host path is obvious from the architecture rather than speculative.

### Pitfalls To Avoid

- [ ] Do not let Electron become a second product implementation.
- [ ] Do not hard-code browser assumptions into the compiled workbench contract.

---

## Recommended Near-Term Execution Order

If work resumed immediately, the highest-value order is:

- [ ] Finish Phase 2 ownership cleanup before expanding more host-side product logic.
- [ ] Finish Phase 3 compositor centralization before adding more surface richness.
- [ ] Tighten Phase 1 around canonical authored themes, left-pane projections, right-pane projections, and viewer surfaces.
- [ ] Finish Phase 5 surface-family normalization so viewers, help, menus, and editing have a real substrate.
- [ ] Finish Phase 7 structured viewers before broad editing features.
- [ ] Use Phase 8 and Phase 9 to expand capability only after the ownership and compositor boundaries are stable.

---

## Completion Standard

This work is not "done enough" when:

- [ ] it merely looks like a TUI
- [ ] the browser example feels impressive
- [ ] Electron boots
- [ ] a few panes render correctly

This work is only done when:

- [ ] the ownership boundary is clean
- [ ] the authored model is canonical
- [ ] the compositor is authoritative
- [ ] the renderer is cell-native
- [ ] the interaction model is unified
- [ ] the host adapters are genuinely adapters
