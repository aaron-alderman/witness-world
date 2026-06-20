# Operator Workbench Completion TODO

This document is the self-contained completion tracker for the operator workbench.

Use it as:

- the goal statement
- the honest status readout
- the architecture guardrail
- the phase-by-phase TODO
- the acceptance checklist
- the anti-regression list when implementation pressure rises

---

## How To Use This Document

- Change `[ ]` to `[X]` only when the statement is materially true.
- Add `ATTN:` notes when implementation exposes a shortcut, ownership leak, or misleading seam.
- Prefer explicit ownership over convenience duplication.
- If a phase lands only partially, record the real boundary instead of claiming the whole thing.
- Keep this document self-contained; do not rely on oral history.

---

## Product Goal

- [ ] Build the operator workbench as a real authored product surface, not a painted browser prototype.

The target end state is:

- [ ] One shared operator core owns navigation, selection, search, focus, inspection, references, provenance, preview-read state, intents, and workbench object lifecycle.
- [ ] One canonical RVM/operator authoring pathway defines the workbench.
- [ ] The browser workbench is the first fully correct rich host.
- [ ] Electron is only a host adapter, not a second product implementation.
- [ ] Future native hosts can consume the same compiled workbench model.
- [ ] Rendering is genuinely cell-based and scene-driven.
- [ ] Frames, separators, handles, overlays, and junctions are composed globally and deterministically.
- [ ] Menus, help, viewers, references, provenance, editing, and viewport management are first-class workbench objects.

---

## Definition Of Done

This effort is not complete until all of the following are true:

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
- [X] Several text and ornament surfaces have already moved away from ad hoc paint order toward explicit composition seams.

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

---

## Primary Risks

- [ ] Browser runtime becomes the permanent product implementation by accident.
- [ ] RVM/operator authoring remains partial while more host logic accumulates.
- [ ] More UX features are added before ownership and compositor boundaries are stable.
- [ ] Electron-specific behavior leaks into shared product logic.
- [ ] Text, frames, and interactions continue to be added as one-off render cases rather than scene families.
- [ ] Viewers and editors arrive too late, forcing incompatible local widgets.

---

## What To Do

- [ ] Keep pushing truth into the shared operator core.
- [ ] Compile authored workbench definitions into a host-neutral surface tree and scene.
- [ ] Expand the compositor into the single authority for frame and separator behavior.
- [ ] Promote repeated browser render patterns into real surface families.
- [ ] Keep interactions intent-driven rather than host-event-driven.
- [ ] Treat viewers, help, menus, and editing as reusable product surfaces.
- [ ] Verify at three layers:
- [ ] definition parse, validation, and normalization
- [ ] core, compositor, snapshot, and scene behavior
- [ ] host rendering and interaction behavior

---

## What Not To Do

- [ ] Do not ship HTML layout disguised as a TUI.
- [ ] Do not let `examples/operator/browser/operator-runtime.js` become the permanent product runtime.
- [ ] Do not keep browser-only mirrors unless their ownership is explicit and temporary.
- [ ] Do not fix junction bugs with paint-order hacks instead of compositor ownership.
- [ ] Do not keep inventing host-local widgets for help, menus, viewers, or editing.
- [ ] Do not hard-code behavior in Electron that belongs in authored workbench definitions.
- [ ] Do not add more UX cleverness while Phase 2 and Phase 3 are still structurally incomplete.

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

- [X] Viewport seam landed
- [X] Overlay seam landed
- [X] Handle seam landed
- [X] Chrome-surface seam landed
- [ ] Left-pane authored model is incomplete
- [ ] Right-pane generic projection model is incomplete
- [ ] Viewer-surface authoring is still deferred

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

### Acceptance Criteria

- [ ] There is one canonical authored pathway for workbench definition.
- [ ] The workbench can be described without relying on a browser-only product grammar.
- [ ] Invalid authored definitions fail clearly.
- [ ] Tests cover parse, validation, normalization, and compiled output.

### Pitfalls To Avoid

- [ ] Do not let critical surface concepts exist only in handwritten host code.
- [ ] Do not keep browser grammar and canonical grammar both acting as product truth.

---

## Phase 2: Bridge To The Shared Operator Core

### Goal

- [ ] Make the shared operator core the real owner of workbench truth rather than a boot-time input source.

### Current Status

- [X] Boot prefers a live shared snapshot.
- [X] A narrow live interaction slice round-trips through the shared core.
- [X] Browser mirrors for pane cursors and focus have been reduced.
- [ ] Most interactions still depend on browser-local runtime adaptation.
- [ ] Search, overlays, help, references, and inspector state still have too much browser-local ownership.

### Required Work

- [ ] Remove remaining browser-local product mirrors where the shared snapshot already owns truth.
- [ ] Move left-pane and right-pane state transitions to shared intents wherever ownership belongs in the core.
- [ ] Move overlay lifecycle and active overlay semantics to the shared snapshot contract.
- [ ] Move help-context ownership into shared snapshot state.
- [ ] Normalize row primary-action behavior so host adapters only dispatch intents.
- [ ] Tighten snapshot contracts so the browser stops inferring product semantics from raw data.

### Acceptance Criteria

- [ ] Browser workbench state after boot is materially driven by the shared operator core.
- [ ] Browser runtime no longer invents product truth that should belong to the core.
- [ ] Shared snapshot tests cover focus, pane state, overlays, help context, and viewport state.
- [ ] Host interaction tests prove the browser is dispatching intents rather than reimplementing product logic.

### Pitfalls To Avoid

- [ ] Do not leave half-owned state split between browser runtime and shared snapshot.
- [ ] Do not move rendering concerns into the core while trying to move product truth out of the browser.

---

## Phase 3: Global Compositor And Frame Graph

### Goal

- [ ] Make one deterministic compositor/frame-graph the universal authority for borders, separators, handles, overlays, and text-affiliated scene objects.

### Current Status

- [X] A first frame-graph slice exists.
- [X] Pane, separator, and overlay composition is no longer entirely ad hoc.
- [X] Several ornament and text surfaces have been moved into explicit composed seams.
- [ ] Runtime-specific paint loops still exist for too many surface families.
- [ ] Junction resolution, mixed weight line rules, and scene-family ownership are not fully centralized.

### Required Work

- [ ] Move every pane frame and separator into one global frame graph.
- [ ] Move every overlay frame, divider, and ownership rule into the compositor contract.
- [ ] Introduce a generic scene family for text-bearing surfaces instead of runtime-specific paint loops.
- [ ] Centralize mixed single/double/heavy line-weight policy.
- [ ] Make handles, resize rails, and viewport dividers compositor-owned rather than patch-painted.
- [ ] Ensure right-pane and left-pane share the same box/junction rules.
- [ ] Add deterministic layering rules for base scene, overlay fills, overlay text, and overlay frames.

### Acceptance Criteria

- [ ] Junction behavior is deterministic and testable.
- [ ] Shared separators do not get clobbered by paint order.
- [ ] Frame and separator rendering is driven by scene data rather than patched after the fact.
- [ ] New panes or overlays can be added without inventing new junction logic.

### Pitfalls To Avoid

- [ ] Do not keep fixing compositor problems with more render-order exceptions.
- [ ] Do not let each pane surface own its own border math.

---

## Phase 4: Final Glyph Fidelity And Terminal-Grade Behavior

### Goal

- [ ] Finish the renderer so it behaves like a serious cell-grid workbench rather than a canvas approximation.

### Required Work

- [ ] Complete the extended box-drawing glyph policy, including tasteful single/double/heavy usage.
- [ ] Ensure glyph metrics are stable across the atlas and do not drift by pane or font path.
- [ ] Finish text selection behavior for word, line, and rectangular selection.
- [ ] Preserve copied text exactly as rendered, including box-drawing characters.
- [ ] Eliminate residual HTML affordances such as browser scrollbars or DOM-looking controls in the workbench surface.
- [ ] Ensure title/chrome controls and status ornaments are rendered as cell content, not incidental host widgets.

### Acceptance Criteria

- [ ] The workbench visually reads as cell-grid-first rather than HTML-first.
- [ ] Selection and copy preserve rendered glyphs exactly.
- [ ] The renderer does not depend on browser scrollbars or DOM layout behavior for core UX.
- [ ] Glyph regressions are covered by visual or structural rendering tests.

### Pitfalls To Avoid

- [ ] Do not overuse heavy or double frames everywhere.
- [ ] Do not allow font fallback or inconsistent metrics to create false layout bugs.

---

## Phase 5: Generic Surface Family

### Goal

- [ ] Replace one-off pane renderers with reusable authored surface families.

### Required Work

- [ ] Define reusable surface families for detail, list, table, tree, menu, help, inspector, and text-reader behavior.
- [ ] Normalize section behavior so authored sections are real workbench objects, not just render decoration.
- [ ] Make left-pane and right-pane consume the same family contracts where appropriate.
- [ ] Introduce a generic scene or surface descriptor that can be compiled from authored workbench definitions.
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
- [ ] Define right-click/context-menu flow as a real workbench surface.
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

- [ ] Add structured JSON/source/help/provenance/reference viewers.
- [ ] Support navigable trees for ownership and provenance.
- [ ] Support long-content horizontal and vertical browsing where required without reintroducing browser scrollbars as product truth.
- [ ] Make F1 help a first-class authored window or overlay surface.
- [ ] Ensure property and metadata rows can expose links and inline actions consistently.

### Acceptance Criteria

- [ ] JSON, source, docs/help, provenance, and references all render as real workbench surfaces.
- [ ] Help and viewer surfaces can be resized, focused, and navigated consistently.
- [ ] Viewer behavior is shared and reusable instead of host-local.

### Pitfalls To Avoid

- [ ] Do not leave JSON/source/help as one-off text-reader hacks.
- [ ] Do not let viewer behavior diverge between browser and Electron.

---

## Phase 8: Viewports, Pane Sizing, And Personalization

### Goal

- [ ] Make viewport control, pane sizing, and user-personalized layouts first-class and eventually authorable.

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

## Near-Term Execution Order

If work resumed immediately, the highest-value order is:

- [ ] Finish Phase 2 ownership cleanup before expanding more host-side product logic.
- [ ] Finish Phase 3 compositor centralization before adding more surface richness.
- [ ] Finish Phase 5 surface-family normalization so viewers/help/editing have a real substrate.
- [ ] Finish Phase 7 structured viewers before broad editing features.
- [ ] Use Phase 8 and Phase 9 to expand capability only after the ownership and compositor boundaries are stable.

---

## Completion Standard

This work is not “done enough” when:

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

