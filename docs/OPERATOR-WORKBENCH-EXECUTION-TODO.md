# Operator Workbench Execution TODO

This document is the canonical self-contained delivery tracker for the operator workbench.

Use it as:

- the product goal
- the architecture guardrail
- the implementation TODO
- the acceptance checklist
- the anti-regression list when pressure rises

---

## How To Use This Document

- Change `[ ]` to `[X]` only when the work is materially true, not merely started.
- Add `ATTN:` notes when implementation reveals a risky seam, misleading shortcut, or deliberate compromise.
- Prefer one explicit ownership decision over a half-local, half-shared implementation that nobody can name.
- If a tranche lands partially, record the exact boundary instead of claiming the whole phase.
- Keep this document self-contained; do not make it depend on oral history.

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

This effort is not done until all of the following are materially true:

- [ ] Product truth lives in the shared operator core.
- [ ] The workbench is described through canonical authored definitions.
- [ ] The renderer consumes a host-neutral scene or cell model.
- [ ] Borders, separators, overlays, and junctions are composed globally rather than patched after paint.
- [ ] Links, menus, help, viewers, references, provenance, and editors are first-class surface objects.
- [ ] Browser, Electron, and future native hosts can consume the same compiled workbench model without product rewrites.

---

## Honest Current Assessment

What is already true:

- [X] There is a browser-first operator example under `examples/operator`.
- [X] There is a cell buffer and contiguous memory-map seam.
- [X] There is a glyph-atlas blit path instead of direct per-cell `fillText` for the main render path.
- [X] There is a canonical `operator_viewport` seam in the operator-workbench RVM pathway.
- [X] There are canonical seams for overlays, chrome surfaces, and handles.
- [X] There is a shared operator-core snapshot export that includes viewport metadata.
- [X] The browser example prefers a live shared-snapshot API at boot.
- [X] The browser example now requires explicit opt-in to boot in fixture-readonly mode instead of silently falling back when the live bridge is missing.
- [X] A narrow but real live interaction slice now round-trips through the shared core.
- [X] The browser-side left pane now renders from the canonical `leftPane` model rather than browser-only mirrors.
- [X] Several browser compatibility mirrors have already been removed.
- [X] The shared snapshot now exposes committed `viewport.layout` geometry for the browser workbench.
- [X] Viewport top, bottom, and split now have an explicit workspace-scoped persistence story.
- [X] The first shared frame-graph slice has landed for pane, separator, and overlay composition.

What is not yet true:

- [ ] The browser host is not yet driven by the real shared operator core for most interactions after boot.
- [ ] The browser host still adapts shared snapshot data into too much browser-local runtime state.
- [ ] The browser-side prototype grammar is not yet fully retired behind the canonical authored pathway.
- [ ] The compositor or frame graph is not yet the universal authority for every border, separator, overlay, handle, and mixed line-weight junction.
- [ ] Generic authored surface families are not yet complete.
- [ ] Menus, help, viewers, references, provenance, and editing are not yet unified under one interaction model.
- [ ] Final glyph fidelity is not complete.
- [ ] Cross-host portability is not yet proven end to end.

Plain-English status:

- [X] This is beyond mockup territory.
- [ ] This is not yet the finished product architecture.
- [X] The highest-leverage work remains core bridging, compositor correctness, authored schema tightening, and surface unification.

---

## Current Priority

- [ ] Finish shrinking browser-local product truth in Phase 2.
- [ ] Expand Phase 3 from the first frame-graph slice into the full shared compositor contract.
- [ ] Do not pile on more UI cleverness until Phase 2 and Phase 3 boundaries are stronger.

---

## Global Pitfalls To Avoid

- [ ] Do not let `examples/operator/browser/operator-runtime.js` become the permanent product runtime.
- [ ] Do not let the browser-side grammar remain a forever sidecar detached from canonical RVM.
- [ ] Do not use DOM layout, DOM tables, CSS box layout, or browser scrollbars as the real layout engine.
- [ ] Do not collapse product semantics and rendering logic into one host module.
- [ ] Do not keep fixing border and junction bugs locally instead of expanding the compositor or frame graph.
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

### Goal

- [X] Prove that a browser-first, canvas-first, cell-first direction is viable.

### Status

- [X] Phase complete

### Required Work

- [X] Create the browser-first prototype scaffold under `examples/operator`.
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

### Do Not

- [ ] Do not mistake prototype viability for finished product architecture.

---

## Phase 1: Canonical Authored Workbench Schema

### Goal

- [ ] Replace the ad hoc browser-side model with one canonical RVM/operator authoring pathway for the workbench.

### Status

- [ ] Phase complete
- [X] Viewport seam landed
- [X] Overlay seam landed
- [X] Handle seam landed
- [X] Chrome-surface seam landed
- [ ] Left-pane authored model is still incomplete
- [ ] Right-pane generic projection model is still incomplete
- [ ] Generic viewer-surface authoring is still intentionally deferred

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
- [ ] The workbench can be described without relying on an ad hoc browser-only product grammar.
- [ ] Invalid authored definitions fail clearly.
- [ ] Tests cover parse, validation, normalization, and compiled output.

### Detailed Tranches

- [X] Tranche A: Canonical viewport schema slice
- [X] Tranche B: Canonical overlay schema slice
- [X] Tranche C: Canonical top-strip, chrome-surface, handle, and separator slice
- [ ] Tranche D: Canonical left-pane and right-pane projection slice
- [ ] Tranche E: Canonical viewer-surface slice

### Pitfalls

- `ATTN:` The biggest Phase 1 risk is accidentally creating a second host-shaped grammar under canonical names.
- `ATTN:` `operator_surface` should stay product-oriented, not become a serialized browser-runtime clone.

---

## Phase 2: Bridge To The Shared Operator Core

### Goal

- [ ] Stop using isolated host sample state as the product truth.

### Status

- [ ] Phase complete
- [X] Shared snapshot contract exists
- [X] Fixture-backed browser bridge exists
- [X] Live snapshot bootstrap API exists
- [X] A narrow live interaction slice now round-trips through the shared core
- [ ] Ongoing browser interaction is still only partially live-core-driven

### Do

- [ ] Bind the browser host to the real operator session and core.
- [X] Use fixture injection only for tests and explicit offline fallback.

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
- [X] Replace browser main-path sample boot with shared snapshot adaptation.
- [X] Keep deterministic fixture injection available for tests.
- [X] Refresh browser-visible state from returned live snapshots for the first live interaction slice.
- [X] Reduce browser-local state for the first live interaction slice by rehydrating from returned snapshots.
- [X] Reduce the remaining browser-local state to presentation-only state wherever possible.
- [ ] Replace browser sample state fully with a real adapter over the operator core.
- [ ] Match raw-shell and browser-host semantics for open, inspect, search, focus, context scoping, references, source, and provenance.
- [ ] Refresh browser-visible state from returned live snapshots for the remaining interaction families.

### Acceptance Criteria

- [ ] The browser workbench is driven by the same live operator truth as other adapters.
- [ ] Search, inspect, focus, and status behave consistently across hosts.
- [X] Sample state survives only as a fixture and testing helper.

### Detailed Tranches

- [X] Tranche A: Shared snapshot contract and fixture-backed browser bridge
- [X] Tranche B: Live snapshot API bootstrap for the browser example
- [X] Tranche C: Live interaction bridge for the browser example
- [ ] Tranche D: Broaden live interaction parity and shrink remaining browser-local truth

### Tranche D Current State

- [X] Route pane-focus changes through live core intents.
- [X] Route top-strip navigation activation through live core intents.
- [X] Surface top-pane navigation state from shared snapshots.
- [X] Route right-pane row cursor movement and activation through live core intents.
- [X] Route right-pane section switching and collapse and expand through live core intents.
- [X] Render left-pane search overlays from shared snapshot `mode`, `shape`, `title`, `header`, `columns`, `rows`, and `paging`.
- [X] Normalize the standalone browser sample-state path onto the canonical left-pane model.
- [X] Remove the browser-state `treeRows` compatibility mirror.
- [X] Remove top-strip and status compatibility mirrors.
- [X] Remove right-pane row and title compatibility mirrors.
- [X] Remove the `sessionLines` compatibility mirror.
- [X] Replace the temporary mixed split bridge with a canonical `viewport.layout` snapshot and `set-viewport-layout` intent contract.
- [X] Decide and implement the long-term persistence policy for top and bottom viewport layout.
- [X] Collapse duplicated browser-runtime focus, cursor, and help-overlay state onto shared snapshot fields.
- [X] Replace the mutable offline browser fallback path with an explicit fixture-readonly adapter.
- [X] Remove silent bridge-failure fallback from browser boot.
- [ ] Finish moving the remaining high-value interaction families onto live shared snapshots.

### Verification

- [X] `cmd /c node --test test\operator-browser-example.test.js`
- [X] `cmd /c node --test test\operator-workbench.test.js`
- [X] Fixture-readonly browser fallback behavior is covered in `test\operator-browser-example.test.js`.
- [X] Canonical `viewport.layout` adaptation and `set-viewport-layout` intent flow are covered in `test\operator-browser-example.test.js`.
- [X] Workspace-scoped viewport persistence and reset behavior are covered in `test\operator-workbench.test.js` and `test\operator-browser-example.test.js`.

### Pitfalls

- `ATTN:` This is the highest-leverage architectural step after Phase 1.
- `ATTN:` The current overlay decision is intentionally asymmetric: `help_overlay` belongs to shared-core session/UI state, while `context_menu` remains host-local presentation for now.
- `ATTN:` Split-handle ownership is intentionally mixed: transient drag preview remains local presentation, committed geometry no longer does.
- `ATTN:` Fixture-readonly mode is offline and testing infrastructure, not the normal product boot path.

---

## Phase 3: Global Compositor And Frame Graph

### Goal

- [ ] Replace overlapping pane painting with a real compositor that owns borders, junctions, separators, overlays, and handles.

### Status

- [ ] Phase complete
- [X] First shared frame-graph slice landed in the browser example
- [X] Shared pane and separator composition no longer depends only on per-pane `drawFrame()` order
- [X] Focused-pane heavy frame emphasis landed through the shared frame graph
- [X] Mixed light/heavy and light/double junction selection is now deterministic
- [X] Double/heavy junction policy is now explicit and tested
- [X] Pane-title rails and right-pane status-edge adorners now paint through compositor ornaments
- [X] Overlay titles, right-pane section headers, and section-divider rules now paint through compositor ornaments
- [X] Left-pane header text and table-column headings now paint through compositor ornaments
- [X] Top-strip status text and command-surface text now paint through segmented compositor ornaments

### Do

- [ ] Introduce one global frame and separator graph.
- [ ] Compose borders once globally.
- [ ] Support deterministic junction selection.

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
- [ ] Move the remaining frame semantics out of host paint code and into the compositor contract.

### Acceptance Criteria

- [X] Shared borders never clobber each other due to draw order.
- [X] Junctions are deterministic and testable.
- [X] Container coloring can be applied without breaking separator logic.
- [X] Frame output can be snapshot-tested directly from the cell buffer.
- [ ] The final workbench no longer needs local border patch-ups for any normal layout path.

### Tranche A Delivered

- [X] Introduce a shared frame-graph module for pane, separator, and overlay frames.
- [X] Rewire the browser example to paint frames from the graph instead of per-pane draw order.
- [X] Add graph-level tests and keep framebuffer visual assertions green.

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

### Verification

- [X] `cmd /c node --test test\operator-browser-example.test.js`
- [X] `cmd /c node --test test\operator-workbench.test.js`
- [X] Shared frame-graph structure and deterministic separator ownership are covered in `test\operator-browser-example.test.js`.
- [X] Cell-buffer frame-row expectations still pass through the compositor path in `test\operator-browser-example.test.js`.
- [X] Explicit `double/heavy` normalization policy coverage now lives in `test\operator-browser-example.test.js`.
- [X] Compositor-owned frame ornaments are covered in `test\operator-browser-example.test.js`.
- [X] Overlay title and right-pane section ornament coverage now lives in `test\operator-browser-example.test.js`.
- [X] Left-pane header and table-column ornament coverage now lives in `test\operator-browser-example.test.js`.
- [X] Top-strip segmented ornaments and command-surface ornament coverage now live in `test\operator-browser-example.test.js`.

### Pitfalls

- `ATTN:` This phase is mandatory. Do not keep shipping local border patches in place of a compositor.
- `ATTN:` The current final policy for `double/heavy` crossings is to normalize to the double-line glyph family for portability and deterministic output. Revisit only if the renderer later gains a bespoke authored glyph vocabulary beyond standard Unicode box drawing.
- `ATTN:` The browser example should keep deriving frame glyphs from the graph. Do not quietly reintroduce independent pane `drawFrame()` calls for future polish.
- `ATTN:` Frame ornaments now have a compositor path, but the browser runtime still decides ornament content strings and placement rules. A later scene-model tranche may want authored ornament descriptors rather than runtime-composed labels.
- `ATTN:` The left pane still decides ornament content from normalized pane state in the runtime. This is a better ownership boundary than direct paint calls, but it is not yet the same thing as authored scene objects.
- `ATTN:` Segmented ornaments reduce runtime paint ownership further, but chip layout and truncation policy still live in the runtime. That is a scene-policy seam, not yet authored scene object ownership.

---

## Phase 4: Final Glyph Fidelity

### Goal

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
- [ ] Verify color-layer ordering and cursor and highlight composition.
- [ ] Define the target strategy for fallback glyph rendering when atlas generation is unavailable.

### Acceptance Criteria

- [ ] Rendered tables, frames, and separators are visually intentional and stable.
- [ ] Selection and copy preserve box-drawing output exactly.
- [ ] The renderer no longer depends on incidental font behavior for critical UI geometry.

---

## Phase 5: Generic Surface Family

### Goal

- [ ] Replace bespoke screen logic with reusable authored surface families.

### Status

- [ ] Not started

### Do

- [ ] Promote recurring surfaces into generic authored shapes.
- [ ] Make the authored model strong enough to dogfood the workbench itself.

### Do Not

- [ ] Do not keep growing one-off inspect, help, menu, and viewer implementations.

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

### Goal

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

### Goal

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

### Goal

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

### Goal

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

### Goal

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

### Core, Snapshot, And Compositor Tests

- [ ] Verify shared snapshot ownership boundaries.
- [ ] Verify cross-host semantic parity for core navigation actions.
- [ ] Verify compositor frame, separator, junction, and overlay output.
- [ ] Verify viewport persistence and reset semantics.
- [ ] Verify structured viewer state and interaction behavior once landed.

### Host Verification

- [ ] Verify browser rendering from the shared snapshot and scene contracts.
- [ ] Verify browser input dispatch stays adapter-thin.
- [ ] Verify copy and selection fidelity for box-drawing content.
- [ ] Verify Electron consumes the same compiled workbench model without host-specific product logic.

---

## Immediate Next Moves

- [ ] Finish the remaining shared-core interaction parity work in Phase 2 Tranche D.
- [ ] Expand the frame graph so the remaining mixed line-weight vocabulary is owned by Phase 3 instead of host paint patches.
- [ ] Keep migrating border and separator semantics out of host code and into the compositor contract.
- [ ] Tighten Phase 1 left-pane and right-pane authored projection definitions so Phase 5 does not invent a second schema later.

---

## Completion Rule

- [ ] Do not mark this effort complete just because the browser example looks convincing.
- [ ] Mark the whole effort complete only when the product boundary, authored model, compositor, surface family, interaction model, viewers, and host adapter story are all materially true.
