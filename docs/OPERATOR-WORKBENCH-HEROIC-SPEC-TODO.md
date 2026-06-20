# Operator Workbench Heroic Spec TODO

## Goal

Build the operator workbench as a real authored product surface, not a painted demo.

The end state is:

- renderer-agnostic operator core
- canonical authored workbench/schema in RVM rather than ad hoc host code
- browser-first rich host that renders a true cell grid
- future Electron and Windows-native hosts as adapters over the same core
- search, navigation, inspection, references, provenance, help, context menus, viewports, and editing all expressed through the same authored surface model

This document is the working TODO list and delivery contract for getting from the current browser operator example to that end state.

## Current Honest State

What exists today:

- `examples/operator` is a credible browser-first prototype
- there is a cell buffer and contiguous cell memory map
- there is a browser-side glyph atlas blit path instead of direct per-cell `fillText`
- there is an authored browser workbench prototype file at `examples/operator/browser/operator.workbench.rvm`
- there are tests for layout, buffer composition, scaffold rows, scrolling, and framebuffer metadata

What does not exist yet:

- canonical RVM pathway for the browser workbench model
- integration with the real shared operator core as the source of truth
- generic authored screen shapes across the full workbench
- robust compositor/frame graph
- real interaction system for links, context menus, help, selection, editing, viewport persistence, and structured viewers
- host adapter boundary that is clean enough to support future Electron/native targets without rework

## Primary Product Standard

The workbench is complete only when all of the following are true:

- the operator state truth lives in the shared core, not in host-local sample state
- authored workbench definitions are canonical and expressive enough to describe the product surface
- the renderer consumes a scene/cell model, not DOM layout semantics
- links, help, menus, viewers, and edit surfaces are first-class authored workbench objects
- browser, Electron, and future native hosts can consume the same compiled workbench model

## Pitfalls To Avoid

- Do not keep growing `examples/operator/browser/operator-runtime.js` as a special-case product runtime.
- Do not let the browser DSL stay as a permanent sidecar language detached from RVM.
- Do not reintroduce HTML layout as the real layout engine under a TUI costume.
- Do not let rendering and product semantics collapse into one module.
- Do not treat the glyph atlas as “done” if it still depends on arbitrary host font behavior for product fidelity.
- Do not implement edit-mode, help, or context menus as one-off popups with unique logic paths.
- Do not add more heroic UX without first fixing the authored model and compositor boundary.

## What To Do

- Move toward one canonical authored workbench model.
- Compile authored workbench definitions into a host-neutral surface tree and cell scene.
- Bridge the browser example onto the real operator core.
- Build a deterministic global compositor for panes, borders, separators, overlays, and handles.
- Add interaction as generic intents and authored affordances, not bespoke event handlers per feature.
- Make structured viewers first-class surface shapes.
- Keep tests at three levels:
  - authoring/definition tests
  - core/compositor snapshot tests
  - browser pixel/screenshot tests

## What Not To Do

- Do not treat the current sample state as acceptable long-term runtime state.
- Do not add Electron-specific behavior into the product core.
- Do not use DOM tables, CSS boxes, or browser scrollbars as the real layout or navigation model.
- Do not hard-code screen behavior that should live in authored definitions.
- Do not defer the compositor until after interaction features pile up.
- Do not defer structured viewers until after edit mode; they are part of the core surface family.

## Required Architecture

The target stack is:

1. Authored workbench definition
2. Workbench compiler / normalizer
3. Shared operator core state bridge
4. Surface tree / scene model
5. Layout compositor / frame graph
6. Cell scene / memory map
7. Host renderer adapter

The host should own:

- window lifecycle
- canvas/swapchain/presentation details
- browser/Electron/native platform integration

The core should own:

- navigation
- search
- selection
- inspection
- references
- provenance
- help context
- intent routing
- viewports
- workbench object lifecycle

## Phase 1: Canonical Authored Workbench Schema

### Goal

Replace the experimental browser-side authored model with a canonical RVM/operator authoring pathway that can describe the workbench product.

### Required Work

- Define canonical authored workbench forms for:
  - top strip
  - left pane
  - right pane
  - overlays
  - context menus
  - viewport presets
  - keybindings
  - pane handles
  - viewer surfaces
- Decide whether the browser prototype file becomes:
  - direct RVM syntax
  - or a compiler target generated from canonical RVM forms
- Add validation rules for:
  - pane references
  - surface shape legality
  - binding conflicts
  - viewport constraints
  - overlay ownership
- Define a normalized compiled workbench schema.

### Acceptance Criteria

- There is one canonical authored pathway for workbench definition.
- The browser workbench can be described without relying on an ad hoc sidecar grammar.
- Invalid authored definitions fail clearly and deterministically.
- Tests cover parse, validation, normalization, and compile output.

### Done Means

- the browser example can be rebuilt from canonical authored definitions
- no product-critical surface concept exists only in handwritten browser example code

## Phase 2: Bridge To The Shared Operator Core

### Goal

Stop using isolated sample state as the workbench truth and bind the browser workbench to the real operator session/core.

### Required Work

- Define the core-to-host snapshot contract for:
  - navigation location
  - active left pane
  - active right screen
  - active right section
  - search results
  - focus
  - status
  - preview read state
  - links and actions
- Replace browser sample state with:
  - a real adapter over the operator core
  - deterministic fixture injection for tests only
- Ensure the browser host uses the same semantics as the raw shell/rich host:
  - default primary action
  - search/view state
  - focus
  - context scoping
  - references/source/provenance

### Acceptance Criteria

- The browser workbench is driven by the same operator truth as the other adapters.
- Search, inspect, focus, and status behave the same across hosts.
- Sample state remains only as a fixture/testing helper.

### Done Means

- the browser workbench is no longer a parallel product

## Phase 3: Global Compositor And Frame Graph

### Goal

Replace overlapping pane drawing with a real layout compositor that produces deterministic separators and junctions.

### Required Work

- Introduce a global frame/separator graph.
- Model:
  - pane bounds
  - separator ownership
  - junction types
  - overlay stacking
  - handle segments
- Ensure borders are composed once globally, not painted independently by each pane.
- Add explicit style variants for:
  - primary frame
  - passive frame
  - container frame
  - handle/separator
  - overlay frame
- Support tasteful line-weight variation:
  - single
  - double
  - heavy
  - mixed junctions

### Acceptance Criteria

- Shared borders never clobber each other due to draw order.
- Junctions are deterministic and testable.
- Container coloring can be applied without breaking separator logic.
- Frame output can be snapshot-tested from the cell buffer.

### Done Means

- there are no “patched after the fact” junction fixes left in the host

## Phase 4: Real Glyph Fidelity

### Goal

Move from generated font-backed atlas behavior to deliberate glyph fidelity suitable for a true TUI-like surface.

### Required Work

- Decide glyph strategy:
  - generated atlas from a constrained font pipeline
  - fixed glyph sheet
  - bitmap font
- Support the required character sets:
  - ASCII
  - box drawing
  - line-drawing junctions
  - selected symbols/cues
- Add deterministic glyph metrics and baseline control.
- Add color-layered rendering rules for:
  - foreground
  - background
  - inverse
  - underline
  - selection
  - cursor

### Acceptance Criteria

- At target sizes, glyphs render crisply and consistently.
- The appearance is no longer materially dependent on arbitrary browser font rasterization.
- Copy/export preserves the exact character stream backing the rendered view.

### Done Means

- the visual output is honestly cell/glyph-based, not browser-text-shaped

## Phase 5: Generic Surface Family

### Goal

Express the workbench as a family of generic surface shapes rather than one-off screens.

### Required Work

- Define surface shapes for:
  - tree
  - list
  - table
  - detail
  - text-reader
  - menu
  - popup
  - json-tree
  - provenance-tree
  - references list
  - editor surface
- Define common surface capabilities:
  - focus
  - scrolling
  - paging
  - selection
  - activation
  - linkable tokens
  - resizable bounds
  - collapsible sections
- Compile all surfaces into the same scene model.

### Acceptance Criteria

- New screens are authored by choosing shapes and bindings, not by writing bespoke host code.
- JSON, references, provenance, help, and menus all use the same surface framework.
- Surface capabilities are composable and testable.

### Done Means

- “screen development” becomes authored assembly, not runtime invention

## Phase 6: Interaction Model

### Goal

Build the workbench interaction system as first-class product behavior rather than host event glue.

### Required Work

- Define generic intents for:
  - open
  - inspect
  - back
  - home
  - next/prev page
  - sort
  - filter
  - activate link
  - open context menu
  - open help
  - rename
  - edit
  - clone
  - undo
  - redo
  - viewport save/open
- Add hit-testing for:
  - rows
  - tokens
  - links
  - handles
  - headers
  - menu items
- Add text interaction:
  - single-click caret/row select
  - double-click word select
  - triple-click line select
  - rectangular selection mode
  - copy preserving box drawing

### Acceptance Criteria

- Every actionable visible object has a generic interaction path.
- Contextual F1 works based on the focused token/property/surface.
- Right-click opens a TUI-native context menu and actions route through generic intents.
- Selection and copy preserve what the user sees.

### Done Means

- interaction semantics are part of the product model, not browser-specific affordances

## Phase 7: Structured Viewers

### Goal

Replace generic text placeholders with specialized viewers for the actual operator objects.

### Required Work

- Build:
  - JSON viewer
  - references viewer
  - provenance viewer
  - ownership viewer
  - source viewer
  - property/detail viewer
- Add capabilities:
  - collapse/expand
  - partial list display
  - token linking
  - scrolling
  - search within viewer
  - contextual help

### Acceptance Criteria

- `jsonSource` opens in a dedicated structured viewer, not a plain text block.
- provenance and ownership are navigable tree surfaces.
- references are inspectable/actionable from the same general workbench language.

### Done Means

- the right pane is an actual operator surface family, not generic text boxes

## Phase 8: Viewports, Settings, And Personalization

### Goal

Support user-defined viewport layouts and keybinding customization in a principled authored/runtime model.

### Required Work

- Add viewport save/load/open flows.
- Add workspace/user settings for:
  - font size
  - density
  - pane split
  - color mode
  - default columns
  - keybindings
- Add authored constraints for:
  - minimum pane sizes
  - overlay default sizes
  - resizable handles
  - profile modes such as `640x480` / `16-color`

### Acceptance Criteria

- Users can save named viewport arrangements and reopen them.
- Keybindings are customizable without rewriting host code.
- The workbench can intentionally run in a constrained classic mode profile.

### Done Means

- layout and controls are user-shapable within the authored/runtime model

## Phase 9: Editing And Expansion Mode

### Goal

Bring edit mode into the same workbench language, including expansion/open-out behavior.

### Required Work

- Define edit surfaces and edit intents.
- Support expanded workbench mode when editing:
  - larger canvas/window footprint
  - additional panels
  - animated transition if practical
- Ensure edit mode is not a separate app.
- Route property editing, rename, and clone through the same action model.

### Acceptance Criteria

- Right-click edit and keyboard edit intents open the same authored edit surface.
- Edit mode remains inside the workbench product language.
- Expanded layouts are compositor-driven, not host hacks.

### Done Means

- authoring, viewing, and editing are one coherent surface family

## Phase 10: Host Adapter Completion

### Goal

Make browser the first complete host, then preserve a clean path to Electron and native.

### Required Work

- Freeze the host adapter boundary.
- Ensure browser host owns only:
  - DOM/canvas lifecycle
  - input event capture
  - clipboard integration
  - browser-specific persistence
- Verify the same compiled workbench model can be consumed by:
  - browser host
  - Electron host
  - future native host

### Acceptance Criteria

- No product logic has to move when adding a new host.
- Electron does not become a second product implementation.
- Native-host experimentation can start without core redesign.

### Done Means

- the rendering target is flexible because the product architecture is tight

## Testing Strategy

The final system needs all of the following:

### 1. Authoring Tests

- parse/normalize/validate workbench definitions
- invalid references
- invalid bindings
- shape legality
- viewport constraints

### 2. Core/Compositor Tests

- layout snapshots
- junction snapshots
- separator ownership
- scene model determinism
- interaction routing

### 3. Buffer/Glyph Tests

- cell memory map layout
- glyph coverage
- glyph atlas generation
- selection/copy fidelity
- color/layer correctness

### 4. Browser Visual Tests

- screenshot tests
- size-profile tests
- overlay positioning
- handle dragging
- hover/focus/selection states

### 5. Cross-Host Contract Tests

- same input state -> same scene model
- same scene model -> acceptable host render

## Suggested Execution Order

Do the work in this order:

1. Phase 1: canonical authored schema
2. Phase 2: shared core bridge
3. Phase 3: global compositor
4. Phase 5: generic surface family
5. Phase 6: interaction model
6. Phase 7: structured viewers
7. Phase 8: viewports/settings
8. Phase 9: editing/expansion
9. Phase 4: final glyph fidelity pass
10. Phase 10: host adapter completion

Reason:

- schema and core boundary must come first
- compositor must happen before large interaction growth
- viewers and edit surfaces should build on the generic surface family
- final glyph work is better done after the scene/compositor contract is stable

## Completion Standard

This effort is complete only when:

- the browser workbench is driven by canonical authored workbench definitions
- the browser workbench is driven by the shared operator core, not isolated sample state
- the workbench is composed from generic authored surfaces
- links, menus, help, viewers, and edit surfaces are first-class workbench objects
- separators and frames are globally composed, not patched after paint
- glyph output is intentionally controlled
- future Electron/native support is an adapter exercise, not a rewrite

## Immediate Next Move

The highest-leverage next tranche is:

- Phase 1: canonical authored workbench schema
- plus the Phase 2 bridge contract definition in parallel

That is the point where this stops being “a strong prototype” and starts becoming “the actual product pathway.”
