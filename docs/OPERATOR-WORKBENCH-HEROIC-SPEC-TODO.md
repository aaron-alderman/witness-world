# Operator Workbench Heroic Spec TODO

This document is the canonical self-contained execution spec and TODO tracker for the operator workbench.

Use it as:

- the product goal
- the honest architectural status readout
- the do / do-not-do guardrail
- the phased implementation TODO
- the acceptance checklist
- the anti-regression list when implementation pressure rises

---

## 1. How To Use This Document

- [ ] Treat this file as the default answer to "what next?" for the operator workbench.
- [ ] Read the top sections before changing any phase checkbox so later-phase pressure does not distort the architecture.
- [ ] Change `[ ]` to `[X]` only when the ownership boundary improved, the code exists, and the behavior is tested.
- [ ] Mark partial progress narrowly; do not claim a whole phase when only one slice is genuinely landed.
- [ ] If a tranche lands only partially, record the exact boundary instead of claiming the whole phase.
- [ ] Add `ATTN:` notes when implementation exposes a shortcut, ownership leak, misleading seam, or temporary compatibility shim.
- [ ] Keep "Evidence" tied to concrete tests, runtime paths, or source seams that can be rechecked later.
- [ ] Use the phase sections as the implementation order unless a dependency is explicitly reworked here first.
- [ ] Keep this document self-contained; it should not depend on oral history or scattered chat context.

---

## 2. Product Goal

- [ ] Build the operator workbench as a real authored product surface, not a browser prototype with accumulating paint and event patches.

The intended end state is:

- [ ] One shared operator core owns navigation, selection, focus, search, inspect, references, provenance, preview-read state, intents, and workbench object lifecycle.
- [ ] One canonical RVM/operator authoring pathway defines the workbench.
- [ ] Browser, Electron, raw shell, and future native shells are host adapters over the same compiled product model.
- [ ] Rendering is genuinely cell-based and scene-driven rather than HTML layout wearing a TUI costume.
- [ ] The compositor is the single authority for borders, separators, handles, overlays, junctions, and mixed line weights.
- [ ] Menus, help, viewers, references, provenance, editing, viewport management, and personalization are first-class workbench objects.
- [ ] The architecture is strong enough that new screens, new hosts, and new authored setups do not require product rewrites.

---

## 3. Definition Of Done

This effort is not complete until all of the following are materially true:

- [ ] Product truth lives in the shared operator core.
- [ ] The workbench is authored through canonical RVM/operator definitions.
- [ ] The renderer consumes a host-neutral scene or cell model.
- [ ] The compositor is the universal authority for borders, separators, overlays, handles, junctions, and pane geometry.
- [ ] Left pane and right pane are both first-class renderer-agnostic workbench products.
- [ ] Menus, help, viewers, references, provenance, and editing share one coherent interaction model.
- [ ] Selection, rectangular selection, copy, scroll, and glyph fidelity behave like a serious terminal-grade operator surface.
- [ ] Browser, Electron, raw shell, and future hosts can consume the same compiled workbench model without product rewrites.

---

## 4. Honest Assessment

### 4.1 What Is Materially True Today

- [X] There is a browser-first operator example under `examples/operator`.
- [X] There is a cell buffer and contiguous memory-map seam.
- [X] There is a glyph-atlas blit path instead of direct per-cell `fillText` in the main render path.
- [X] There is an AssemblyScript/Wasm seam for the cell-oriented renderer path.
- [X] There are canonical seams for viewports, overlays, chrome surfaces, pane handles, and viewport persistence.
- [X] There is a shared operator-core workbench snapshot export that includes viewport metadata.
- [X] The browser example prefers a live shared-snapshot API at boot instead of silently defaulting to fixture mode.
- [X] A narrow but real live interaction slice round-trips through the shared core.
- [X] The browser-side left pane renders from a canonical `leftPane` snapshot model instead of only browser-local mirrors.
- [X] Right-pane section focus and collapse semantics now exist as real shared-core concepts.
- [X] A first compositor / frame-graph slice exists for pane, separator, and overlay composition.
- [X] Overlay ordering, focus, cursor, and basic scroll behavior are significantly more core-owned than before.
- [X] Non-authored/default workbench paths now expose canonical built-in overlay definitions and a built-in viewport instead of depending only on authored app fixtures.
- [X] Browser overlay composition now prefers canonical `snapshot.overlays` rows over conflicting top-level compatibility overlay fields.
- [X] The browser snapshot adapter now regenerates top-level compatibility overlay exports from canonical overlay rows before the browser runtime consumes them.
- [X] Shared snapshot truth owns much more top-strip, command-bar, pane, overlay, and right-pane chrome text than the earlier browser prototype did.
- [X] Grid-aligned word selection, line selection, rectangular selection, and exact box-drawing copy now exist in the browser-hosted workbench path.
- [X] Built-in references, source, and provenance screens now route through shared-core screens and typed operator URIs.
- [X] Explicit viewport top, bottom, and split overrides now round-trip through the shared bridge and can reset back to authored defaults.
- [X] The product direction is now clearly cell-first rather than DOM-layout-first.

### 4.2 What Is Not Materially True Yet

- [ ] The browser host is still not just a renderer over shared truth.
- [ ] Too much runtime behavior and too much derived UI truth still live in the browser host.
- [ ] The browser-side prototype grammar is not fully retired behind canonical RVM/operator authoring.
- [ ] The compositor is not yet the universal authority for every pane frame, separator, handle, overlay, junction, and mixed line-weight choice.
- [ ] Generic authored left-pane and right-pane projection families are incomplete.
- [ ] Menus, help, viewers, references, provenance, editing, and personalization do not yet share one complete interaction model.
- [ ] Selection, rectangular selection, copy/paste fidelity, and advanced text behavior are incomplete.
- [ ] Cross-host portability is not yet proven end to end.
- [ ] There are still compatibility shims and fallback behaviors in non-authored paths that should collapse into canonical definitions, but hard-coded help/context close-pairing is no longer required for the default non-authored path.

### 4.3 Blunt Read

- [X] This is well past mockup territory.
- [ ] This is not yet the finished product architecture.
- [X] The highest-leverage remaining work is still shared-core ownership cleanup, compositor completion, authored-model tightening, and reusable surface-family work.

ATTN:

- [ ] The main architectural risk remains browser-local behavior defining product semantics.
- [ ] If that continues, the workbench hardens into a permanent prototype instead of a reusable platform surface.
- [ ] Compatibility fallbacks are acceptable only as temporary bridges while canonical authored and shared-core paths are strengthened.
- [ ] The remaining overlay compatibility surface is now mainly overlay-model fallback for legacy snapshot/fixture paths, not hard-coded close-pairing rules in the default path.
- [ ] Top-level `helpOverlay` / `contextMenu` compatibility exports still exist and are still mirrored in some browser fallback paths even though composition now prefers canonical overlay rows.
- [ ] The remaining overlay compatibility seam is now smaller, but the adapter still preserves some richer legacy-only fields while canonical overlay rows are not yet fully sufficient for every fixture/runtime path.
- [ ] Custom window chrome is now a real tested host path, but it is not yet fully lowered into the same universal compositor/cell-scene authority as pane and overlay geometry.

---

## 5. Product Rules

- [ ] The workbench is authored once, normalized once, composed once, and rendered by multiple hosts.
- [ ] Hosts may present the product differently, but they must not invent product semantics.
- [ ] Shared intents should absorb interaction behavior instead of each host growing its own event logic.
- [ ] Surface families should be generalized instead of repeatedly reimplemented.
- [ ] Visual improvement alone does not count as architectural progress.
- [ ] A compatibility shim is acceptable only when it clearly points toward removal.

---

## 6. What To Do

- [ ] Push user-visible truth into shared operator core state or canonical authored definitions.
- [ ] Compile authored workbench definitions into host-neutral pane, surface, scene, compositor, and cell inputs.
- [ ] Expand the compositor until borders, separators, handles, overlays, and junctions are composed globally and deterministically.
- [ ] Promote repeated browser behavior into reusable surface families instead of adding more host-local branches.
- [ ] Add generic intents instead of bespoke per-feature event plumbing.
- [ ] Treat viewers, menus, help, references, provenance, editing, and personalization as product surfaces, not isolated widgets.
- [ ] Verify each tranche at three levels:
- [ ] authoring parse, validation, and normalization
- [ ] core, snapshot, compositor, scene, and surface behavior
- [ ] host rendering and interaction behavior

---

## 7. What Not To Do

- [ ] Do not ship HTML layout disguised as a TUI.
- [ ] Do not let `examples/operator/browser/operator-runtime.js` become the permanent product runtime.
- [ ] Do not let browser-local convenience mirrors become permanent product truth.
- [ ] Do not invent product structure in the host when that structure should live in authored definitions or normalized snapshot state.
- [ ] Do not keep fixing border and junction bugs with paint-order patches instead of improving the compositor.
- [ ] Do not treat host-font-derived rendering as the final fidelity answer.
- [ ] Do not implement help, menus, viewers, references, provenance, or edit mode as isolated one-off widgets.
- [ ] Do not add more ambitious UX while authored truth, shared-core ownership, and compositor authority are still weak.
- [ ] Do not push Electron-specific or browser-specific product logic into the shared core.

---

## 8. Global Pitfalls To Avoid

- [ ] Mistaking a good-looking browser surface for a correct architecture.
- [ ] Expanding interaction features before compositor and surface-family work are strong enough.
- [ ] Treating browser-host state as a harmless adapter concern when it actually defines user-visible behavior.
- [ ] Adding editor features before viewers, overlays, help, references, and provenance are coherent.
- [ ] Letting sample fixtures, prototype defaults, or compatibility shims silently become product truth.
- [ ] Solving rendering problems with CSS- or DOM-shaped thinking when the product target is a cell compositor.
- [ ] Accepting "the host can derive that" when that derived state changes product semantics.

---

## 9. Target Architecture

### 9.1 Target Stack

- [ ] Authored workbench definition
- [ ] Workbench compiler and normalizer
- [ ] Shared operator core bridge
- [ ] Surface tree and scene model
- [ ] Layout compositor and frame graph
- [ ] Cell scene and memory map
- [ ] Host renderer adapter

### 9.2 Ownership Boundary

- [ ] Host owns window lifecycle, presentation, input capture, clipboard, IME, accessibility, and platform integration.
- [ ] Core owns navigation, selection, search, focus, inspect, references, provenance, help context, viewports, intents, and workbench object lifecycle.
- [ ] Authoring owns workbench shape, defaults, families, pane setup, surface composition, and reusable semantics.
- [ ] Compositor owns geometry, separators, borders, mixed line-weight choices, and deterministic junction behavior.

### 9.3 Product Rule

- [ ] The workbench is authored once, normalized once, composed once, and rendered by multiple hosts without those hosts inventing product semantics.

---

## 10. Delivery Order

- [ ] First shrink browser-local truth.
- [ ] Then complete compositor authority.
- [ ] Then tighten the authored model so the browser is not forced to invent product structure.
- [ ] Then land reusable surface families for menus, help, viewers, references, provenance, and editing.
- [ ] Then finish glyph fidelity, text interaction, and host portability proof.

### Dependency Rules

- [ ] Phase 1 must be strong enough that the browser is not forced to invent product structure ad hoc.
- [ ] Phase 2 must reduce browser-local truth before large new UI families land.
- [ ] Phase 3 must own borders, separators, overlays, handles, and junctions before visual complexity grows much further.
- [ ] Phase 5 and Phase 7 must be strong before serious editing work in Phase 9.
- [ ] Phase 10 should prove architecture quality, not rescue a weak architecture late.

### Execution Rule For Every Phase

- [ ] State the ownership boundary the phase is supposed to improve before implementing feature breadth.
- [ ] Land authored schema or normalized snapshot seams before host-specific rendering branches where possible.
- [ ] Prefer shared-core intents and normalized models over browser-only event logic.
- [ ] Add or update tests for parse/validation, shared-core behavior, and host rendering/interaction where relevant.
- [ ] Record evidence and `ATTN:` notes immediately after landing a bounded slice so the tracker stays honest.
- [ ] Do not start a later-phase convenience feature by weakening an earlier-phase architectural boundary.

---

## 11. Immediate High-Impact Next Moves

- [ ] Finish collapsing the remaining top-level overlay compatibility export and fallback behavior for legacy snapshot/fixture paths into canonical overlay rows.
- [ ] Keep moving browser overlay, help, viewer, and right-pane interaction behavior into shared intents and normalized snapshot metadata.
- [ ] Expand the compositor from "pane/overlay frame slice" into a real global frame graph that owns every separator and junction.
- [ ] Tighten authored screen / pane / surface definitions until the browser prototype grammar can only survive as a generated or test-only artifact.
- [ ] Start defining generic surface families for viewers, menus, help, and docs so future editing does not get built on one-off surfaces.

---

## 12. Phase Summary

- [X] Phase 0: Browser-first rendering prototype
- [ ] Phase 1: Canonical authored workbench schema
- [ ] Phase 2: Shared-core ownership and browser-host bridge
- [ ] Phase 3: Global compositor and frame graph
- [ ] Phase 4: Final glyph fidelity and terminal-grade text behavior
- [ ] Phase 5: Generic authored surface family
- [ ] Phase 6: Unified interaction model
- [ ] Phase 7: Structured viewers, help, references, and provenance
- [ ] Phase 8: Viewports, pane sizing, settings, and personalization
- [ ] Phase 9: Editing, mutation, and expansion mode
- [ ] Phase 10: Host adapter completion

---

## 13. Phase 0: Browser-First Rendering Prototype

### Goal

- [X] Prove that a browser-first, canvas-first, cell-first direction is viable.

### Current Status

- [X] Phase complete

### Required Work

- [X] Create the browser-first prototype scaffold under `examples/operator`.
- [X] Add a browser-side authored prototype file under `examples/operator/browser`.
- [X] Introduce a cell buffer with a contiguous memory map.
- [X] Add the AssemblyScript seam and Wasm build path.
- [X] Add an example launcher and browser server.
- [X] Add initial layout, buffer, scroll, and frame scaffold tests.
- [X] Replace direct per-cell `fillText` with a glyph-atlas blit path.

### Acceptance Criteria

- [X] The repo proves a cell-grid browser host is viable.
- [X] The repo proves rendering can move away from ordinary DOM layout.
- [X] The repo proves there is enough substrate to continue with real architecture work.

### Pitfalls To Avoid

- [ ] Do not treat prototype viability as proof that the final architecture is already correct.

---

## 14. Phase 1: Canonical Authored Workbench Schema

### Goal

- [ ] Replace the ad hoc browser-side model with one canonical RVM/operator authoring pathway for the workbench.

### Current Status

- [ ] Phase complete
- [X] Viewport seam landed.
- [X] Authored viewport-theme seam landed for the current `ansi16` browser-example slice.
- [X] Overlay seam landed.
- [X] Handle seam landed.
- [X] Chrome-surface seam landed.
- [X] Non-authored/default workbench definitions now include canonical built-in overlays and a built-in viewport.
- [X] Browser runtime composition now resolves built-in overlay rendering from canonical overlay rows first.
- [X] Basic authored left-pane screen forms now exist for `tree` and `table` projections with default-left-screen and per-right-screen override resolution.
- [X] Basic authored right-pane custom-screen forms now exist for `detail`, `list-detail`, and `table-detail`, including sectioned screens and authored default sections.
- [ ] Left-pane authored model is still incomplete beyond the current built-in/authored tree-table slice.
- [ ] Right-pane generic projection model is still incomplete beyond the current custom-screen/detail-table slice.
- [ ] Viewer-surface authoring is still intentionally deferred.
- [ ] Some non-authored defaults and compatibility paths still stand in for canonical definitions, but the default viewport/overlay path is now explicit and test-covered.

### Required Work

- [X] Define canonical authored forms for top-strip and bottom-strip chrome.
- [X] Define canonical authored forms for overlays and context menus.
- [X] Define canonical authored forms for viewport presets and viewport-scoped bindings.
- [X] Define canonical authored forms for viewport theme references in the current browser-example slice.
- [X] Define canonical authored forms for pane handles and separators.
- [X] Add canonical built-in overlay definitions and a built-in default viewport for non-authored/default paths.
- [X] Allow authored `operator_setup.default_viewport` to reference the built-in default viewport explicitly.
- [X] Define canonical authored forms for left-pane projections.
- [X] Define canonical authored forms for right-pane projections.
- [ ] Define broader canonical authored forms for theme families, presentation capabilities, and host color-mode constraints.
- [ ] Define canonical authored forms for viewer surfaces.
- [ ] Define canonical authored forms for menus, help surfaces, and docs/help viewers.
- [ ] Decide whether the browser prototype grammar disappears entirely or survives only as a generated artifact.
- [ ] Add validation for pane references.
- [ ] Add validation for screen/surface shape legality.
- [ ] Add validation for viewport constraints.
- [ ] Add validation for overlay ownership and close/open policy references.
- [ ] Add a normalized compiled workbench schema contract that future hosts can consume directly.

### Acceptance Criteria

- [ ] There is one canonical authored pathway for workbench definition.
- [ ] Invalid authored definitions fail clearly.
- [ ] The browser prototype grammar is no longer a peer truth source.
- [ ] Non-authored defaults are narrow, explicit, and moving toward removal.
- [ ] Tests cover parse, validation, normalization, and compiled output.

### Evidence

- [X] `operator example current app project authoring loads through the existing workbench plugin seam`.
- [X] `operator example prototype RVM parses themes, surfaces, overlays, and bindings`.
- [X] `workbench controller resolves a default authored left screen when no search overlay is active`.
- [X] `workbench controller lets the active right screen override the authored left screen`.
- [X] `search overlay takes precedence over authored left screens and clear restores them`.
- [X] `workbench controller opens authored custom screens and preserves screen mode on activation`.
- [X] `workbench controller normalizes sectioned authored screens and activates the first actionable section`.
- [X] `workbench controller honors authored default sections on first open`.
- [X] `renderOperatorWorkbenchState renders authored custom screen tables`.
- [X] `renderOperatorWorkbenchState renders stacked screen sections and only activates the chosen section rows`.
- [X] `renderOperatorWorkbenchState renders collapsed sections header-only`.

### Pitfalls To Avoid

- [ ] Do not let critical surface concepts exist only in handwritten host code.
- [ ] Do not let "temporary" prototype grammar become permanent product truth.

---

## 15. Phase 2: Shared-Core Ownership And Browser-Host Bridge

### Goal

- [ ] Make the browser host consume shared operator-core truth for behavior, not just for initial data and selected text.

### Current Status

- [ ] Phase complete
- [X] Shared snapshot now owns much more chrome, overlay, and section metadata than before.
- [X] Overlay ordering, active overlay state, cursor, and basic scroll semantics now route materially through the shared core.
- [X] Right-pane section focus, per-section cursor memory, and collapse state now exist as core concepts.
- [X] Default non-authored snapshots now consume canonical built-in overlay policy and viewport definitions.
- [X] Browser overlay composition and overlay-line/item lookup now read canonical overlay rows before compatibility top-level fields.
- [X] The browser snapshot adapter regenerates compatibility `helpOverlay` / `contextMenu` exports from canonical overlay rows so conflicting top-level fixture data no longer wins by default.
- [X] The current overlapping raw-shell/browser slice now shares primary row activation, number-buffer selection, top/right navigation, screen switching, section movement, and unwind semantics through the core/bridge path.
- [X] The current overlapping slice now also shares top-strip title/navigation/status text plus help-context/help-summary metadata through the snapshot path instead of host-only synthesis.
- [X] The current overlapping slice now also shares left-pane cursoring, number-buffer activation, pointer row activation, and search-overlay rendering through the canonical `leftPane` snapshot and shared intents.
- [ ] The browser host still derives too much runtime truth locally.
- [ ] Compatibility fallback behavior still exists for some legacy overlay-model and fixture paths.

### Required Work

- [ ] Remove browser-local copies of product state wherever a normalized shared snapshot can own the truth.
- [ ] Continue moving overlay, help, menu, viewer, and reader interaction into shared intents.
- [X] Collapse hard-coded help/context overlay close-pairing into canonical overlay definitions for the default non-authored path.
- [X] Make browser overlay composition prefer canonical overlay rows even when compatibility top-level fields disagree.
- [X] Regenerate top-level compatibility overlay exports from canonical overlay rows before lowering the snapshot into browser runtime state.
- [ ] Collapse the remaining overlay-model compatibility behavior into canonical overlay definitions for authored and non-authored paths.
- [X] Route the current left-pane cursor, number-buffer, pointer activation, and search-overlay slice through shared row/action models instead of browser-local heuristics.
- [ ] Make left-pane and right-pane interactions route through shared row/action models across the broader viewer/editor surface set instead of browser-local heuristics.
- [X] Normalize active-screen, help-context, and top-strip status metadata in the snapshot for the current overlapping slice.
- [ ] Normalize the broader active-screen, active-surface, help-context, and status metadata set in the snapshot across the remaining viewer/editor surface families.
- [X] Ensure raw shell and browser consume the same intent semantics for the current overlapping navigation/activation slice even if their presentation differs.
- [ ] Ensure raw shell and browser consume the same intent semantics across the broader viewer/help/menu/edit surface set.
- [ ] Keep browser-only state limited to host concerns such as pointer tracking, platform clipboard integration, and presentation-only affordances.

### Acceptance Criteria

- [ ] The browser host is primarily a renderer and input adapter over shared truth.
- [ ] Major interaction families use shared intents instead of browser-local rule tables.
- [ ] Snapshot metadata is sufficient that hosts are not forced to invent product semantics.
- [ ] Compatibility fallbacks are either removed or explicitly isolated and documented as temporary.
- [ ] Controller, snapshot, and host interaction tests prove the bridge is real.

### Evidence

- [X] `buildOperatorWorkbenchDefinition(null)` now exposes `help_overlay`, `context_menu`, and `builtin.default`.
- [X] `buildOperatorWorkbenchSnapshot(...)` with no authored app project now emits canonical overlay policy rows for the default viewport.
- [X] Authored `operator_setup.default_viewport builtin.default` now validates and resolves successfully.
- [X] Browser overlay composition now renders canonical overlay-row frame/title/body content even when `snapshot.contextMenu` conflicts.
- [X] Browser snapshot lowering now rewrites conflicting top-level compatibility overlay exports from canonical overlay rows before runtime composition.
- [X] Raw shell and browser both exercise shared primary activation, screen switching, section control, and unwind semantics over the current overlapping workbench slice.
- [X] Shared snapshot output now carries top-pane title/navigation/status lines plus help-context/help-summary fields that the host renders directly.
- [X] Browser runtime left-pane cursor movement, Enter activation, number-buffer activation, pointer row activation, and search-overlay rendering now round-trip through the live core and shared `leftPane` snapshot model.
- [X] Verified by `cmd /c node --test test\\operator-workbench.test.js`.
- [X] Regression-checked by `cmd /c node --test test\\operator-browser-example.test.js`.

### Pitfalls To Avoid

- [ ] Do not keep browser-local runtime truth just because it is convenient.
- [ ] Do not accept host-derived semantics for overlays, readers, panes, or selection if the shared core can own them.

---

## 16. Phase 3: Global Compositor And Frame Graph

### Goal

- [ ] Replace overlapping-rectangle paint logic with a global compositor and intentional frame graph that owns every border, separator, handle, and junction.

### Current Status

- [ ] Phase complete
- [X] A first pane/separator/overlay frame-composition slice exists.
- [X] Deterministic mixed single/heavy/double frame-glyph resolution now exists as an explicit frame-graph policy with regression coverage.
- [X] Overlay frames now participate in the same frame-graph composition slice as panes and separators rather than rendering only as independent rectangle paint patches.
- [ ] The compositor is not yet the sole authority for all junctions and mixed line weights.
- [ ] Some rendering behavior still depends on paint order rather than fully composed geometry.

### Required Work

- [ ] Move every pane frame, separator, overlay frame, and handle into one global composition model.
- [X] Define deterministic junction resolution for single lines, double lines, tees, corners, crossovers, and mixed-weight seams.
- [X] Ensure selected-window emphasis does not clobber adjacent pane borders.
- [X] Make overlay frames integrate into the same composition model rather than painting as independent rectangles.
- [ ] Move title-bar and custom chrome composition into the same cell-scene / compositor model.
- [ ] Support tasteful line-weight choices instead of global overuse of double borders.
- [ ] Add compositor tests that assert junction determinism instead of relying on screenshots alone.

### Evidence

- [X] `operator example frame graph models pane frames, separators, and overlay frames deterministically`.
- [X] `operator example frame graph resolves heavy and mixed frame glyphs deterministically`.
- [X] `operator example frame graph exposes explicit variant policy for mixed and normalized cases`.
- [X] `operator example frame graph normalizes double-heavy corners and tees deterministically`.
- [X] `operator example focused pane composition uses heavy borders without losing separator determinism`.
- [X] `operator example overlay frame geometry and title placement use shared snapshot metadata`.
- [X] `operator example top-strip and command bar render through segmented compositor ornaments`.
- [X] `operator example pane frame titles render from the shared snapshot instead of browser surface labels`.
- [X] `operator example right-pane section header and divider render through compositor ornaments`.
- [X] `operator example left-pane header, table columns, and body rows render through explicit composition seams`.
- [X] `renderOperatorWorkbenchState composes deterministic shared frame junctions`.
- [X] Verified by `C:\\Users\\aaron\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\bin\\node.exe --test test\\operator-browser-example.test.js`.
- [X] Verified by `C:\\Users\\aaron\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\bin\\node.exe --test test\\operator-workbench.test.js`.

### Acceptance Criteria

- [ ] There is one global frame graph for pane and overlay geometry.
- [ ] Shared-border conflicts no longer depend on paint order.
- [ ] Junction behavior is deterministic and testable.
- [ ] Hosts render compositor output rather than improvising borders.
- [ ] Box-drawing fidelity is good enough that frame errors are now model errors, not ad hoc paint bugs.

### Pitfalls To Avoid

- [ ] Do not keep patching visual seams after paint.
- [ ] Do not let overlay frames remain special cases outside the compositor.

---

## 17. Phase 4: Final Glyph Fidelity And Terminal-Grade Text Behavior

### Goal

- [ ] Deliver believable terminal-grade cell rendering and text interaction.

### Current Status

- [ ] Phase complete
- [X] Glyph-atlas blitting exists.
- [ ] Final glyph fidelity is still incomplete.
- [X] Word selection, line selection, rectangular selection, and exact box-drawing copy now exist in the browser-hosted workbench path.
- [X] Shared right-pane reader scrolling and overlay scrolling now route through the workbench bridge instead of only host-local clipping.
- [X] The current right-pane text-reader slice now scrolls through shared reader state and renders only shared `bodyLines`, not host fallback detail text.
- [ ] Final text behavior is still incomplete across all surface families and glyph classes.

### Required Work

- [ ] Ensure every visible grid cell is rendered as an intentional cell output, not DOM text disguised as a grid.
- [ ] Tighten glyph metrics, atlas packing, clipping, and baseline behavior.
- [ ] Support extended box-drawing glyphs and mixed line weights reliably.
- [X] Add text selection, word/line selection, and rectangular selection that respect the cell grid.
- [X] Preserve copied box-drawing output exactly as rendered.
- [X] Make the current right-pane text-reader slice behave consistently within the cell model.
- [ ] Make scrollable text widgets and readers behave consistently across all relevant surface families within the cell model.
- [ ] Validate low-color / 16-color and reduced-density presentation modes.

### Evidence

- [X] `startOperatorWorkbenchRuntime` copies selected canvas text.
- [X] `startOperatorWorkbenchRuntime` selects a canvas word on double click.
- [X] `startOperatorWorkbenchRuntime` selects the visible canvas line on triple click.
- [X] `startOperatorWorkbenchRuntime` copies rectangular canvas selections with exact box drawing.
- [X] `operator browser runtime routes reader scrolling through the live core`.
- [X] `operator browser runtime routes help overlay scrolling through the live core`.
- [X] `operator example text reader scrolling shifts horizontal content instead of clipping the pane model`.
- [X] `operator example right-pane reader content comes only from shared bodyLines`.
- [X] Verified by `C:\\Users\\aaron\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\bin\\node.exe --test test\\operator-workbench.test.js`.
- [X] Verified by `C:\\Users\\aaron\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\bin\\node.exe --test test\\operator-browser-example.test.js`.

### Acceptance Criteria

- [ ] The workbench looks and behaves like a serious cell-rendered operator surface.
- [ ] Copy/paste preserves box-drawing and layout exactly.
- [ ] Selection modes are predictable and grid-aligned.
- [ ] Hosts do not leak DOM text-selection behavior into the product model.

### Pitfalls To Avoid

- [ ] Do not leave critical text behavior split between DOM semantics and cell semantics.
- [ ] Do not assume font rendering quirks will solve layout fidelity.

ATTN:

- [ ] The current reader slice is strong enough for shared scrolling/copy/selection claims, but the broader viewer family still spans help overlays, text readers, and custom screens with incomplete unification.

---

## 18. Phase 5: Generic Authored Surface Family

### Goal

- [ ] Replace one-off surface implementations with reusable authored surface families.

### Current Status

- [ ] Phase complete
- [X] Overlay families now have a real compiled `interaction.family` slice for at least `menu` and `doc_view`.
- [X] Shared screen-shape normalization now covers practical built-in/authored families such as `tree`, `table`, `detail`, `list-detail`, and `table-detail`.
- [ ] Menus, help, doc readers, property viewers, JSON viewers, references, and provenance still have too much bespoke behavior.

### Required Work

- [ ] Define generic surface families such as menu, doc-view, reader, tree, table, kv/detail, inspector, and viewer.
- [X] Normalize family-level interaction and rendering metadata in the compiled workbench model for the current overlay-family slice.
- [X] Ensure both built-in and authored surfaces resolve through the same family-level rules for the current screen-shape and overlay-family slice.
- [ ] Use family-level semantics for scrollability, cursoring, activation, collapse/expand, and row action behavior.
- [ ] Add authored defaults for common screen families so future screens are cheap to create.

### Evidence

- [X] `snapshot.overlays?.[0]?.interaction?.family === "doc_view"` and `snapshot.overlays?.[1]?.interaction?.family === "menu"` are asserted in `test/operator-browser-example.test.js`.
- [X] `plugins/operator-workbench/tui-engine.js` builds overlay interaction families via `buildOverlayInteractionModel(...)` with explicit `menu` and `doc_view` semantics.
- [X] `plugins/operator-workbench/tui-engine.js` normalizes screen shapes through `legacySectionKindForScreenShape(...)` and `buildWorkbenchScreenSection(...)`.
- [X] `buildAuthoredLeftPaneModel(...)` lowers authored left-pane `tree` and `table` screens through the same workbench row/section machinery.
- [X] `workbench controller opens authored custom screens and preserves screen mode on activation`.
- [X] `workbench controller normalizes sectioned authored screens and activates the first actionable section`.

### Acceptance Criteria

- [ ] New help, menu, and viewer surfaces can be authored without new host-specific branches.
- [ ] Built-in surfaces and authored surfaces normalize through the same family machinery.
- [ ] Surface behavior is mostly family-driven rather than id-driven.

### Pitfalls To Avoid

- [ ] Do not keep adding id-specific behavior when a family abstraction is clearly available.
- [ ] Do not build editing on top of bespoke read-only viewers.

---

## 19. Phase 6: Unified Interaction Model

### Goal

- [ ] Make navigation, activation, focus, overlay behavior, and unwind behavior coherent across the whole workbench.

### Current Status

- [ ] Phase complete
- [X] Overlay focus/cursor/scroll and right-pane section focus now have real shared-core slices.
- [X] Structured unwind, context-menu cursor activation, overlay ordering, top-pane navigation, section key routing, and published screen shortcuts now have real shared-core or bridge-backed coverage.
- [X] The current overlapping slice now has shared primary-action, left-pane number-buffer activation, help, context-menu, references, source, and provenance flows across raw shell/browser entrypoints.
- [ ] The interaction model is still incomplete across panes, overlays, viewers, menus, and future editors.

### Required Work

- [ ] Define one coherent focus model for top strip, left pane, right pane, command bar, overlays, and popups.
- [X] Define primary action, alternate action, context menu, references, and help flows consistently for the current overlapping navigation/inspect/source/reference slice.
- [ ] Define primary action, alternate action, context menu, references, and help flows consistently across the broader custom-viewer/editor surface set.
- [X] Define structured unwind behavior for `Esc`.
- [X] Define consistent keyboard routing for the current left-pane number-buffer and primary-activation slice.
- [ ] Define consistent keyboard routing for paging, sort, filter, and broader screen/view transitions.
- [X] Define shared interaction metadata so hosts can expose contextual help without inventing rules for the current top-strip/right-pane/help-overlay slice.
- [ ] Define shared interaction metadata so hosts can expose contextual help without inventing rules across the broader viewer/editor surface set.
- [ ] Move any remaining special-case browser input handling into shared intents where it affects semantics.

### Evidence

- [X] `workbench controller exposes root tree and primary navigation action`.
- [X] `workbench controller inspects records as the primary left-pane action`.
- [X] `operator TUI raw shell accepts a bare index as the current row primary action`.
- [X] `workbench controller escape unwinds number buffer, help, references, and results in order`.
- [X] `workbench controller routes context-menu state through the shared UI snapshot and escape closes it first`.
- [X] `workbench controller routes generic overlay ordering through the shared UI snapshot`.
- [X] `workbench controller routes context-menu cursor movement and activation through shared overlay state`.
- [X] `workbench controller opens the generic references screen on F2 and activates rows through operator URIs`.
- [X] `workbench controller opens built-in source and provenance custom screens and preserves in-place activation`.
- [X] `startOperatorWorkbenchRuntime routes top-pane navigation keys through the bridge`.
- [X] `startOperatorWorkbenchRuntime maps right-pane section keys onto section intents`.
- [X] `startOperatorWorkbenchRuntime maps F2 to the generic references screen`.
- [X] `startOperatorWorkbenchRuntime maps F3 and F4 to source and provenance custom screens`.
- [X] `startOperatorWorkbenchRuntime maps authored F5 shortcuts to custom screens`.
- [X] `operator browser runtime routes left-pane number-buffer digits and clear through the live core`.
- [X] `operator browser runtime routes pointer row selection and mouse primary activation through the live core`.
- [X] `renderOperatorWorkbenchState surfaces active section context in help copy`.
- [X] `renderOperatorWorkbenchState renders the shared top-pane status line instead of host-only synthesis`.
- [X] `renderOperatorWorkbenchState renders the shared top-pane navigation line instead of host-only synthesis`.
- [X] `renderOperatorWorkbenchState renders the shared top-pane title line instead of host-only synthesis`.

### Acceptance Criteria

- [ ] The workbench has one understandable interaction grammar.
- [ ] Pane focus, overlay focus, and section focus do not conflict.
- [ ] `Esc`, `Enter`, navigation keys, and action keys behave predictably across surface families.

### Pitfalls To Avoid

- [ ] Do not let each pane or overlay family invent different rules for focus and unwind.
- [ ] Do not hard-code host-specific key semantics in the core.

ATTN:

- [ ] The current left-pane activation slice is now strong enough to document, but broad keyboard grammar for result-table paging/sort/filter and richer viewer/editor surfaces is still not unified.

---

## 20. Phase 7: Structured Viewers, Help, References, And Provenance

### Goal

- [ ] Turn viewers into first-class structured product surfaces instead of fallback text dumps.

### Current Status

- [ ] Phase complete
- [X] Built-in references, source, and provenance screens now exist as shared-core workbench screens with typed operator-URI activation and shortcut routing.
- [X] Authored help overlay routing through `F1` exists in the shared workbench path.
- [X] The current help/context-menu popup slice now exists as centered shared overlay windows with shared placement, close policy, focus, cursor, and scroll behavior.
- [ ] Help, docs, JSON/source views, references, provenance trees, and ownership trees are not yet fully generalized.

### Required Work

- [ ] Build structured JSON/source readers with collapse/expand and bounded list/object rendering.
- [ ] Build navigable provenance, ownership, and references viewers using shared tree/list/table families.
- [X] Ensure the current references/source/provenance/view slice can become typed operator-link targets where appropriate.
- [ ] Ensure every important inspector property can become a link target where appropriate across the broader inspector/viewer surface set.
- [X] Make F1/contextual help route into real authored help surfaces.
- [X] Support popup/windowed help and viewers within the shared overlay/window model for the current help/context-menu overlay slice.
- [X] Ensure the current help/context-menu overlay slice reuses the same interaction, compositor, and cell-rendering machinery.
- [ ] Ensure the broader viewer set reuses the same interaction, compositor, and cell-rendering machinery.

### Evidence

- [X] `engine link output includes typed operator URIs and open-link reopens source targets`.
- [X] `engine open-link restores saved result views`.
- [X] `engine screen commands expose source and provenance custom screens for the shell adapter`.
- [X] `workbench controller opens the generic references screen on F2 and activates rows through operator URIs`.
- [X] `workbench controller opens built-in source and provenance custom screens and preserves in-place activation`.
- [X] `workbench controller pins inspected records and activates typed references`.
- [X] `workbench controller can open source representations from references and direct commands`.
- [X] `operator browser runtime routes the help overlay and context menu through the live core and renders menu content from the shared snapshot`.
- [X] `operator browser runtime routes context-menu cursor movement and Enter activation through the live core`.
- [X] `operator browser runtime routes overlay focus clicks through the live core`.
- [X] `operator browser runtime routes overlay focus traversal through the live core`.
- [X] `operator browser runtime routes help-overlay wheel scrolling through the live core`.
- [X] `operator browser runtime routes help overlay scrolling through the live core`.
- [X] `operator browser runtime routes published screen shortcuts through the live core`.

### Acceptance Criteria

- [ ] Help, references, provenance, and source viewers are product surfaces, not one-off readouts.
- [ ] Linked navigation across properties, docs, provenance, and references is coherent.
- [ ] Viewers are expressive enough that editing can build on top of them later.

### Pitfalls To Avoid

- [ ] Do not leave JSON/source/help/reference rendering as special-case host widgets.
- [ ] Do not build editing before viewer surfaces are strong.

ATTN:

- [ ] Typed operator URIs are now a real current-slice navigation seam, but scalar property-level linking inside richer inspector/viewer content is still incomplete.

---

## 21. Phase 8: Viewports, Pane Sizing, Settings, And Personalization

### Goal

- [ ] Make viewport layout, pane sizing, theme modes, and operator personalization real first-class workbench behavior.

### Current Status

- [ ] Phase complete
- [X] There is a viewport seam and workspace-scoped persistence story for top, bottom, and split layout.
- [X] Authored viewport theme metadata now resolves through the shared snapshot path for the current `ansi16` example slice.
- [X] Explicit viewport top, bottom, and split overrides now round-trip through the host bridge and can reset to authored defaults.
- [X] The viewport-layout commit path now fails closed without a live bridge instead of fabricating local committed layout state.
- [ ] Rich viewport objects, named viewport switching, and full personalization are incomplete.

### Required Work

- [ ] Support named viewports and viewport switching.
- [X] Support persisted top, bottom, and split viewport layout overrides through the shared bridge for the current browser/electron workbench slice.
- [ ] Support persistent pane sizes, overlay sizes, and popup sizes where appropriate across the broader surface set.
- [ ] Support customizable keybindings and operator preferences.
- [X] Support authored 16-color viewport theme metadata for the current browser-example slice.
- [ ] Support operator-switchable theme modes such as reduced-color / 16-color presentation across hosts.
- [ ] Keep session-only state and workspace/user-persisted state clearly separated.
- [ ] Express viewport and presentation behavior through canonical authored/runtime seams, not host-only config files.
- [X] Persist explicit viewport top, bottom, and split overrides through the shared bridge and allow reset to authored defaults.

### Evidence

- [X] `operator example shared core can build a workbench snapshot for the browser bridge`.
- [X] `workbench controller persists updated display settings through the host seam`.
- [X] `operator browser runtime commits viewport layout through the shared core and persists the vertical split setting`.
- [X] `operator browser runtime without a live bridge in live mode fails closed for viewport drag commits`.
- [X] `startOperatorWorkbenchRuntime saves explicit viewport top and bottom settings through the host bridge`.
- [X] `startOperatorWorkbenchRuntime resets viewport overrides back to authored defaults through the host bridge`.

### Acceptance Criteria

- [ ] Operators can save and restore meaningful viewport setups.
- [ ] Pane sizing and windowed viewer sizes are controllable and persistent where intended.
- [ ] Personalization does not weaken the core ownership model.

### Pitfalls To Avoid

- [ ] Do not let personalized settings leak into authored product truth.
- [ ] Do not make viewports host-local if they materially affect workbench semantics.

ATTN:

- [ ] The current theme slice proves authored viewport-theme metadata and an `ansi16` example path, not a full operator-facing theme-switching or reduced-color runtime story yet.

---

## 22. Phase 9: Editing, Mutation, And Expansion Mode

### Goal

- [ ] Add real editing only after read surfaces, viewer surfaces, compositor, and interaction rules are strong enough.

### Current Status

- [ ] Phase complete
- [ ] Preview-read work exists conceptually, but mutation remains intentionally deferred or disabled in major paths.

### Required Work

- [ ] Add read/write surface families for property editing, structured text editing, rename flows, and mutation menus.
- [ ] Integrate preview sessions as the canonical preview-edit lane where appropriate.
- [ ] Support structured expansion mode where the workbench can open out into larger editing surfaces.
- [ ] Ensure undo/redo, history, mutation provenance, and failure behavior are deterministic.
- [ ] Keep edit-mode surfaces inside the same compositor, focus, and viewer architecture.

### Acceptance Criteria

- [ ] Editing is not a second product with separate rules.
- [ ] Preview, mutation, undo/redo, and provenance are coherent and testable.
- [ ] Expansion mode is part of the same workbench model, not a host-only transition trick.

### Pitfalls To Avoid

- [ ] Do not bolt mutation onto weak read surfaces.
- [ ] Do not invent a separate editor architecture detached from the workbench model.

---

## 23. Phase 10: Host Adapter Completion

### Goal

- [ ] Prove that the workbench architecture is truly host-portable.

### Current Status

- [ ] Phase complete
- [X] Browser-first host exists.
- [X] Electron launch path exists, but it is not yet the proof of a fully finished adapter boundary.
- [X] The raw shell still exercises overlapping operator-core semantics such as primary row activation, screen switching, and section control.
- [X] The rich workbench shell page and custom window-chrome bridge path are both covered by runtime tests.
- [ ] Raw shell, browser, Electron, and future native hosts are not yet proven against the same final compiled model end to end.

### Required Work

- [ ] Keep the browser host as a renderer and input adapter over the shared product model.
- [ ] Keep Electron as a host adapter, not a second product implementation.
- [X] Keep the raw shell as a thin adapter over the same operator core semantics.
- [ ] Prove that new hosts can consume the same compiled model without product rewrites.
- [ ] Keep platform chrome, clipboard, drag, IME, and accessibility concerns host-local.

### Evidence

- [X] `operator TUI raw shell accepts a bare index as the current row primary action`.
- [X] `engine screen commands expose source and provenance custom screens for the shell adapter`.
- [X] `operator TUI raw shell section commands switch and collapse authored sections`.
- [X] `startOperatorWorkbenchRuntime routes custom window chrome controls through the bridge`.
- [X] `operator workbench page renders the multi-pane shell`.

### Acceptance Criteria

- [ ] At least browser, Electron, and raw shell consume the same real product model for the overlapping feature set.
- [ ] Host-specific logic is visibly limited to platform integration and rendering concerns.
- [ ] Adding a future native host would be additive, not a rewrite.

### Pitfalls To Avoid

- [ ] Do not let Electron become the new place where product semantics hide.
- [ ] Do not declare portability proven until the compiled-model boundary is materially real.

---

## 24. Completion Test

When this document is close to done, the following should be true without hand-waving:

- [ ] A team can author a workbench in canonical RVM/operator definitions.
- [ ] The compiled workbench model is sufficient for multiple hosts.
- [ ] The browser host is mostly a renderer/input adapter over shared truth.
- [ ] The compositor owns junctions, separators, overlays, and pane borders globally.
- [ ] The surface family model makes new viewers/help/menus cheap to add.
- [ ] Text rendering, selection, and copy fidelity are terminal-grade.
- [ ] Structured viewers are strong enough that editing can reuse them.
- [ ] Viewports, personalization, and future native adapters do not require product-semantics rewrites.

If those are not true, the heroic spec is not complete.
