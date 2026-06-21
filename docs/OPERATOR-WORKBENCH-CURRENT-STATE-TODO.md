# Operator Workbench: Current State And Completion TODO

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

Status date: `2026-06-21`

This document is a self-contained execution brief for the operator workbench.

Use it for:

- the real product goal
- the blunt current-state assessment
- the architectural rules
- the phased TODO
- the acceptance criteria for each phase

---

## 1. Blunt Assessment

- [X] The project has crossed the line from mockup into real substrate work.
- [X] There is now a genuine cell-oriented rendering path, a browser-hosted workbench example, a shared operator-core seam, a compositor seam, viewport concepts, overlay concepts, and first-class pane models.
- [X] The work is strong enough to continue as a serious product.
- [ ] The architecture is not yet complete.
- [ ] The browser host still owns too much product behavior.
- [ ] The authored model is not yet strong enough that the workbench can be said to be "defined by authoring" rather than "defined by code plus authoring".
- [ ] The compositor is not yet the one true authority for all borders, separators, handles, overlays, junctions, and mixed line-weight decisions.
- [ ] Text interaction is not yet terminal-grade.
- [ ] The heroic spec is still unfinished by a meaningful margin.

### Honest shorthand

- [X] The foundations are real.
- [ ] The product boundary is still too soft.
- [ ] If the current direction were frozen today, it would still feel like a sophisticated prototype rather than the finished operator surface.

### Practical read

- [ ] Roughly: the low-level rendering/cell direction is proven enough to continue.
- [ ] The middle architecture is only partially complete.
- [ ] The high-level authored product model is still behind where it needs to be.
- [ ] The next success condition is not "more features"; it is "less browser-owned truth".

---

## 2. End Goal

- [ ] Build a renderer-agnostic operator workbench whose product semantics come from canonical authored definitions plus shared operator-core state.

The finished system should materially have all of the following:

- [ ] shared operator core owns navigation, focus, selection, search, inspect, links, references, provenance, preview-read state, viewports, workbench objects, and intents
- [ ] authored workbench/RVM definitions own workbench structure, defaults, reusable surface families, and pane/screen composition
- [ ] compositor owns geometry, borders, separators, handles, overlays, junctions, and line-weight decisions
- [ ] renderer consumes a host-neutral scene/cell model
- [ ] browser/Electron/raw-shell/future native hosts remain adapters, not product definition layers
- [ ] menus/help/viewers/references/provenance/editing all fit one coherent workbench object model
- [ ] copying, selection, rectangular selection, scrolling, and glyph fidelity feel deliberate and exact

---

## 3. What This Must Not Become

- [ ] not a browser UI that merely looks terminal-like
- [ ] not a pile of host-specific event patches
- [ ] not a DOM/CSS layout system with box-drawing sprinkled on top
- [ ] not a one-host architecture that later needs to be "ported"
- [ ] not a product where RVM authoring is decorative while the real truth lives in JavaScript branches

---

## 4. What To Do

- [ ] move product semantics out of browser runtime code and into shared-core snapshot/intents or authored definitions
- [ ] strengthen canonical authored workbench definitions until non-authored/prototype grammar can shrink into tests or generated fixtures
- [ ] finish the global compositor so pane adjacency and junction behavior are deterministic by construction
- [ ] define generic surface families instead of repeatedly hand-building menus/help/viewers
- [ ] prove that left-pane and right-pane screens are both governed by the same architecture
- [ ] keep all new interaction behavior flowing through shared intents where possible

## 5. What Not To Do

- [ ] do not add large new UX areas by bypassing the shared core
- [ ] do not fix structural compositor problems with paint-order hacks
- [ ] do not let compatibility mirrors harden into permanent truth
- [ ] do not let the browser runtime become the long-term product controller
- [ ] do not implement editor-grade mutation flows before viewer/help/provenance/reference surfaces are coherent
- [ ] do not confuse visual polish with architectural completion

---

## 6. Major Pitfalls To Avoid

- [ ] mistaking a strong rendering demo for finished product architecture
- [ ] accepting host-derived state when it changes user-visible semantics
- [ ] allowing one-off overlay/viewer/help behavior to multiply before the surface-family model is complete
- [ ] adding "just one more" browser special case because it is fast
- [ ] treating prototype fixture structure as if it were canonical authoring
- [ ] landing features that only work because the browser host knows too much

---

## 7. Current Reality: What Exists Today

### Landed and real

- [X] browser-first operator example under `examples/operator`
- [X] cell buffer / memory-map seam
- [X] glyph-atlas blit path in the main rendering path
- [X] AssemblyScript/Wasm seam for cell rendering
- [X] shared operator-core snapshot model
- [X] left-pane normalized model
- [X] right-pane section model with section focus/collapse semantics
- [X] canonical viewport metadata in shared snapshot
- [X] overlay model and non-authored built-in overlay defaults
- [X] first compositor/frame-graph slice
- [X] some live shared-core round-tripping in the browser example
- [X] browser composition now preferring canonical overlay rows over conflicting top-level compatibility data

### Still incomplete

- [ ] browser runtime still contains too much behavioral ownership
- [ ] canonical authored workbench model is not yet the singular definition source
- [ ] left-pane authored screens are not yet the full product model
- [ ] generic viewer/help/menu/reference/provenance families are incomplete
- [ ] global compositor authority is incomplete
- [ ] terminal-grade text interaction is incomplete
- [ ] cross-host proof is incomplete

---

## 8. Completion Standard

Mark the work complete only when these statements are true in code, behavior, and tests:

- [ ] the browser host can mostly be described as "input + rendering adapter"
- [ ] authored workbench definitions drive default pane/screen behavior
- [ ] the compositor can deterministically render every pane adjacency without patch logic
- [ ] overlays, menus, help, viewers, references, provenance, and edit surfaces are all built from reusable product concepts
- [ ] the renderer path is cell-first from composition through paint
- [ ] text selection/copy behavior preserves what the user sees
- [ ] there is a clear path for Electron and future native shells without redefining product behavior

---

## 9. Phase Plan

## Phase 0: Prove The Direction

### Goal

- [X] Prove that a browser-hosted, canvas-based, cell-first workbench is viable.

### Status

- [X] Complete

### Acceptance criteria

- [X] Cell rendering is real.
- [X] Browser-hosted workbench boot exists.
- [X] There is enough substrate to continue toward full architecture.

---

## Phase 1: Collapse Browser-Owned Product Truth

### Goal

- [ ] Make the browser host consume shared truth instead of inventing it.

### Required work

- [ ] remove remaining browser-local product semantics where snapshot/intents should own them
- [ ] keep shrinking top-level compatibility exports and fallback logic
- [ ] move overlay behavior, right-pane behavior, and left-pane behavior toward canonical models
- [ ] ensure browser state mirrors are transitional only and clearly removable
- [ ] make shared-core snapshot metadata sufficient for host rendering and interaction

### Acceptance criteria

- [ ] browser host mostly renders and dispatches
- [ ] shared snapshot/intents explain the behavior without needing host-specific oral history
- [ ] compatibility fallbacks are narrow and explicitly temporary

### Pitfalls

- [ ] do not land new browser-only branches while claiming cleanup is happening
- [ ] do not preserve convenience mirrors unless removal is planned and documented

---

## Phase 2: Canonical Authored Workbench Model

### Goal

- [ ] Make RVM/operator authoring the primary workbench definition path.

### Required work

- [ ] tighten screen/pane/viewport/surface authoring definitions
- [ ] ensure workbench defaults come from authored definitions where appropriate
- [ ] reduce reliance on browser prototype grammar
- [ ] define stable normalization rules for built-in and authored paths
- [ ] make left-pane authored screens and right-pane authored screens fit the same overall model

### Acceptance criteria

- [ ] the workbench's structure can be explained through authored definitions first
- [ ] built-in fallback paths are deliberate, not accidental
- [ ] prototype/fixture definitions no longer behave like shadow product truth

### Pitfalls

- [ ] do not treat ad hoc fixture objects as a substitute for authoring design
- [ ] do not add authoring fields unless their ownership boundary is clear

---

## Phase 3: Global Compositor Authority

### Goal

- [ ] Make one compositor own every border, separator, handle, overlay, and junction.

### Required work

- [ ] replace overlapping-rectangle assumptions with a global frame graph
- [ ] encode pane adjacency and separator ownership explicitly
- [ ] support mixed line weights and tasteful line-style variation deterministically
- [ ] render pane handles and resizers through the same global composition model
- [ ] ensure overlay composition and pane composition share the same authority rules

### Acceptance criteria

- [ ] no more glommed borders or paint-order clobbering between neighboring panes
- [ ] junction behavior is deterministic by construction
- [ ] mixed single/double framing is intentional rather than patched

### Pitfalls

- [ ] do not solve compositor failures with render order tweaks alone
- [ ] do not allow the host to reintroduce private frame logic

---

## Phase 4: Final Cell/Glyph Fidelity

### Goal

- [ ] Make the renderer feel like a real terminal-grade surface rather than a browser approximation.

### Required work

- [ ] complete glyph atlas coverage for the intended box-drawing and extended character set
- [ ] ensure cell metrics and baseline alignment are exact
- [ ] harden clipping, wrapping, truncation, and scroll behavior
- [ ] verify color treatment, container colors, focus colors, and low-color modes
- [ ] ensure no DOM scrollbars or layout bleed remain in the workbench surface

### Acceptance criteria

- [ ] every visible cell is renderer-owned
- [ ] box-drawing lines align cleanly
- [ ] color usage is consistent and host-independent enough for the product style

### Pitfalls

- [ ] do not reintroduce HTML layout as a shortcut for text fidelity issues

---

## Phase 5: Generic Surface Families

### Goal

- [ ] Stop building workbench surfaces as one-offs.

### Required work

- [ ] define reusable families for help, menus, viewers, references, provenance, docs, and property/detail screens
- [ ] describe these families in authoring terms instead of browser-only component terms
- [ ] make popups/overlays/windows follow the same workbench object rules
- [ ] ensure surface families expose the right hooks for context, links, focus, and actions

### Acceptance criteria

- [ ] new surfaces can be authored by choosing a family plus data, not by inventing fresh browser logic
- [ ] help, context menu, and viewers share obvious structural rules

### Pitfalls

- [ ] do not ship a "generic" family that is really just one hard-coded screen in disguise

---

## Phase 6: Unified Interaction Model

### Goal

- [ ] Make navigation and activation coherent across the whole workbench.

### Required work

- [ ] unify pane focus, row focus, section focus, and overlay focus under shared intents
- [ ] preserve default primary action semantics consistently
- [ ] define secondary/alternative actions without overloading the primary action
- [ ] formalize context menu, help, and link activation behavior
- [ ] make keyboard guidance/contextual help derive from shared state

### Acceptance criteria

- [ ] the same action model makes sense in tree/results/right-pane/overlay contexts
- [ ] hosts are dispatching intents, not deciding semantics

### Pitfalls

- [ ] do not let keyboard support and pointer support drift into different products

---

## Phase 7: Serious Viewer And Knowledge Surfaces

### Goal

- [ ] Make help, docs, JSON/source, provenance, ownership, and references feel like first-class operator surfaces.

### Required work

- [ ] add structured viewers for JSON/source/doc/help/reference/provenance use cases
- [ ] make links first-class within these viewers
- [ ] support contextual help such as `F1` over meaningful entities
- [ ] define scrollable text/viewer widgets as explicit product surfaces
- [ ] make tree/list/detail variants reusable across these knowledge surfaces

### Acceptance criteria

- [ ] JSON/source/provenance/reference/help are coherent and navigable
- [ ] the workbench does not need custom-case rendering rules for each one

### Pitfalls

- [ ] do not implement these as isolated modal hacks

---

## Phase 8: Viewports, Layout Control, And Personalization

### Goal

- [ ] Make pane sizing, viewport save/restore, keybinding customization, and settings part of the authored/system model.

### Required work

- [ ] add pane handles and layout resizing through canonical workbench state
- [ ] define viewport persistence and named viewport flows
- [ ] define keybinding customization seams
- [ ] support compact/low-color profiles such as a `640x480` / `16-colour` style mode
- [ ] separate product truth from per-user presentation preferences

### Acceptance criteria

- [ ] users can resize and restore layout without the host inventing private semantics
- [ ] viewport save/open behavior is coherent and testable

### Pitfalls

- [ ] do not mix user settings with canonical workbench truth

---

## Phase 9: Editing And Mutation

### Goal

- [ ] Introduce editing and mutation only after the read/view architecture is solid.

### Required work

- [ ] define edit surfaces as part of the same surface-family model
- [ ] ensure mutation flows reuse shared intents, focus, links, help, and provenance
- [ ] support expandable edit layouts without breaking the core workbench model
- [ ] reconnect preview-backed or other mutation lanes only after the read lane is stable enough

### Acceptance criteria

- [ ] edit mode feels like a natural extension of the same workbench, not a second product
- [ ] mutation semantics do not leak back into host-specific code

### Pitfalls

- [ ] do not rush editing before viewers/help/provenance/reference flows are complete

---

## Phase 10: Host Adapter Completion

### Goal

- [ ] Prove the architecture can support multiple hosts cleanly.

### Required work

- [ ] keep browser host as one adapter
- [ ] keep raw-shell as a legacy/adapter path
- [ ] keep Electron-specific concerns outside product semantics
- [ ] prepare the architecture so a future Windows-native shell or other renderer can consume the same product model
- [ ] verify the same compiled workbench truth can feed multiple hosts

### Acceptance criteria

- [ ] host differences are presentation/integration differences, not product rewrites
- [ ] the shared core and authored model remain stable across hosts

### Pitfalls

- [ ] do not let one host secretly become the canonical behavior owner

---

## 10. Immediate Next Moves

- [ ] finish shrinking the remaining overlay compatibility/fallback surface into canonical overlay rows
- [ ] keep moving browser-side interaction behavior into shared snapshot metadata and intents
- [ ] expand the compositor from the current frame slice into a real global pane/separator graph
- [ ] define the first true generic viewer/help/menu surface family
- [ ] tighten authored left/right pane definitions so browser prototype grammar keeps shrinking

---

## 11. Short Version

If someone asks "where is this really at?", the answer is:

- [X] The low-level direction is real.
- [X] The project is worth continuing exactly because the hard substrate work is now meaningful.
- [ ] The main remaining work is architectural consolidation, not just feature addition.
- [ ] The browser host still knows too much.
- [ ] The compositor still needs to become the universal geometry authority.
- [ ] The authored model still needs to become the real product definition.
- [ ] The heroic spec is achievable, but only if the next work keeps collapsing local truth instead of expanding it.
