# Embedded HTML / JS Audit

## Scope

Audit target: HTML, CSS, and browser behavior authored inline inside JavaScript modules, where the content should instead be represented as composable authored surfaces such as `DESIRE`, `RVM`, or `WTOML`.

This document is intended to be execution-driving, not advisory. A later implementation pass should be able to use this file as the primary migration brief without re-deriving the overall approach from source.

This audit distinguishes between:

- authored product/UI content that should move into source forms
- generic runtime/rendering engines that should remain code
- temporary runtime seams that are acceptable until a higher-level surface exists

Out of scope:

- [ ] legacy Engentus SPA migration work

## Goals

- [ ] remove product-authored HTML, CSS, and interaction semantics from page-local JS modules where they belong in authored surfaces or shared runtime contracts
- [ ] preserve working behavior while moving ownership of UI structure, styling, and semantic interaction definitions into reusable authored/runtime layers
- [ ] reduce future drift by making the target architecture explicit enough that implementers do not need to invent it mid-migration

## Non-Goals

- do not introduce a large new JS component framework as the primary solution
- do not rewrite generic rendering engines purely for stylistic consistency
- do not collapse canvas, Eden, inspect, bootstrap, and other surfaces into one monolithic abstraction layer
- do not prioritize cosmetic cleanup over ownership cleanup

## Terms

- `authored surface`: product-visible structure that should be represented in `DESIRE`, `RVM`, `WTOML`, widget definitions, templates, or authored program/action definitions
- `runtime engine`: code that performs rendering, layout, geometry, transport, event binding, state derivation, or other implementation mechanics
- `semantic event`: a named interaction outcome such as `submit:todo_form`, `click:logout`, or `inspect-node`, rather than a raw DOM callback
- `surface kit`: the reusable authored/UI vocabulary of primitives, shells, templates, token contracts, and action/event contracts used across pages
- `formula debt`: product-valid choice derivation, default selection rules, disabled/help/status decisions, and other product-significant view decisions that are still computed in page-local code
- `choreography debt`: multi-step external behavior ordering such as request sequencing, refresh/reprojection timing, navigation timing, host-bridge timing, and success/failure follow-up sequencing that is still computed in page-local code
- `bridge payload`: the explicit detail shape carried across an authored/runtime/host boundary; if the shape is not declared or documented, the bridge is still effectively hard-coded JS
- `residual local owner`: the exact remaining page-local file/function/state slot that still owns part of a migrated behavior after a partial slice

## Decision Rules

When deciding whether something belongs in authored form or runtime code, use these rules in order:

1. If it is product copy, page composition, repeated card/list/form structure, or product-significant interaction meaning, it belongs in authored form.
2. If it is low-level rendering, pointer mechanics, geometry, transport, validation plumbing, or generic event binding, it belongs in runtime code.
3. If it is mixed, split it so authored intent is explicit and runtime mechanics remain code.
4. If a new abstraction only wraps hard-coded page logic without improving ownership boundaries, do not introduce it.
5. Prefer extending the existing semantic event/program model already present in `plugins/inspect/widget-page.js` over inventing a parallel event system.

## Execution Rules

This file is intended to be strong enough to drive unattended execution. Keep the rules short and mechanical:

- Use this document, the live repository code, and focused tests as the only execution brief.
- Checked items are current truth claims. Unchecked checklist items are open migration work. Warnings and cautions are prose, not checkboxes.
- Treat unwired `WTOML`, `RVM`, `DESIRE`, helper, or seam files as draft inventory rather than progress.
- Land missing generic seams before page-local workarounds.
- Move one ownership boundary at a time: authored structure, semantic interaction meaning, shared runtime/event seam, shared primitive/token seam, or explicit residual local-state reduction.
- Preserve externally consumed contracts first: DOM ids, tutorial hooks, seeded state ids, query params, host-event names, and focused tests.
- Update the current snapshot and current frontier in the same change whenever ownership moves.
- If a checked claim is no longer observable in current code or current focused tests, rewrite or uncheck it before continuing.
- If a slice depends on context that is not recoverable from this file, code, or tests, add that context here first.
- Browser-factory seams need browser proof whenever they serialize private helpers or depend on event-time DOM/state reads.

## Targeting Rules

- Default forms, cards, lists, status blocks, repeated collections, and page-shell composition to `WTOML` plus authored semantic actions unless a stronger existing authored form is already present.
- Use shared `frontendProgram` and semantic action/event contracts for product-significant submits, clicks, URL mutations, and host-bridge triggers.
- Use seeded projection state plus authored templates/collections instead of page-local `innerHTML` rebuilds for repeated content.
- Choose `RVM` when the surface is primarily a long-lived stateful tree with nested panels, richer composition, or explicit surface-state transitions that would be awkward as page-local `WTOML` plus adapters.
- Choose `DESIRE` only when it creates a clearer ownership boundary than `WTOML` or `RVM`.
- Reject any shared UI library or higher-order control that still leaves product copy, valid-option derivation, request body shape, endpoint choice, or refresh choreography in page-local JS.
- Shared primitives may own generic structure, token consumption, spacing/layout conventions, field chrome, button/status/note shells, and generic semantic trigger plumbing. They must not become the hidden owner of bootstrap-specific, Eden-specific, or tutorial-specific product semantics.

## Slice Record

Every unattended slice should leave behind one concrete record that answers:

- current owner
- target owner
- preserved contracts
- proof command
- residual local owner
- blocker, if the slice must stop instead of improvising a local workaround

## Execution Precedence

When multiple concerns compete during a migration slice, apply this order:

1. Preserve live contracts that other code, tests, or tutorials already consume.
2. Land a missing generic seam before using it in only one page.
3. Move authored structure, styling ownership, or interaction meaning out of the page module.
4. Re-prove behavior through focused tests at the smallest useful scope.
5. Update this audit to reflect the new steady state before treating the slice as complete.

## Current Tranche

Original goal of the current tranche:

- make `plugins/bootstrap/bootstrap-shell.js` stop being the hidden owner of bootstrap authoring UI, submit semantics, and external-state routing wherever a shared authored or shared runtime seam already exists
- preserve the live bootstrap contracts while shrinking the shell toward a thin page adapter that loads authored controls, seeds state, and routes only the remaining host-specific mechanics

Current position as of 2026-06-14:

- proven slices already moved backend authoring/version controls, proposal controls, proposal-adjacent controls, scoped controls, runtime-integration direct controls, and starter controls into authored `WTOML` plus shared helper seams
- the remaining live bootstrap frontier is now specific rather than broad: the thin tutorial/host adapter glue and final render/runtime sequencing are helper-owned, while the larger residual debt is now the page document shell and broader authored-page extraction still centered on `plugins/bootstrap/bootstrap-shell.js`
- this tranche is still on track, but it is not close to "fully extracted bootstrap" yet; the document should be read as a live frontier brief, not as a claim that bootstrap is mostly done

Remaining frontier for this tranche:

- [x] remove shell-local ownership of the inline create forms that still live directly in `plugins/bootstrap/bootstrap-shell.js`: `context-form`, `perspective-form`, `widget-form`, `program-form`, `step-form`, `route-form`, `serve-form`, and `runner-form`
- [x] remove shell-local submit routing through `bindCreate(...)`, including its local request-body shaping and unconditional `form.reset()` plus `refresh()` follow-up
- [x] reduce or extract the shell-local `refresh()` owner only after the submit/bridge contracts that depend on it are explicit enough to preserve current reread semantics
- [x] reduce or extract the shell-local starter/desktop/form-access wrapper state owners without pushing their projection logic back into anonymous `render()` branches
- [x] reduce or extract the shell-local render-time summary/status/select-fill owner in `render()` now that refresh, review-view, and state-inventory seams are explicit
- [x] reduce or extract the remaining thin shell-local tutorial/host adapter glue only after its contract is explicit enough to preserve current bootstrap navigation and tutorial semantics
- [x] reduce or extract the remaining shell-local render/runtime glue that still sequences shared seams inside `render()` without pushing bootstrap semantics back into generic helpers
- [x] keep the document aligned to those exact residual owners; do not broaden the tranche back into generic architecture cleanup unless the code frontier actually changes
## Current Non-Stop Handoff Snapshot

This snapshot is the current execution handoff for unattended work. It exists so a later pass can continue from repository truth instead of chat memory.

- [x] the current generic extraction baseline is real and re-proved: authored `load`, `change`, `input`, `keydown`, `navigate`, `setQueryParam`, `dispatchDomEvent`, `setHidden`, `setDisabled`, checkbox coercion, dynamic repeated widget ids, refresh-projection initial-state resync, and WTOML/apply-path parity for renderer-supported `label`/`textarea`/`details`/`summary`/`valueEditor`
- [x] the bootstrap top-card, backend authoring controls, backend-version controls, proposal create controls, proposal review controls, proposal-adjacent runtime-plugin/MCP proposal controls, scoped context/stewardship create-remove controls, scoped option-refresh trigger bridges, capability define/install controls, and runtime-plugin/MCP-tool/capability remove controls are the currently proven embedded authored slices
- [x] the bootstrap contextual remove slice is now proven end to end: `context-binding-remove-form`, `context-export-remove-form`, `context-import-remove-form`, and `stewardship-remove-form` all render from authored `WTOML` and are re-proved through the browser in `test\\ui.bootstrap.test.js`
- [x] the current proof set for that contextual/stewardship remove slice is `cmd /c node --test plugins\\bootstrap\\bootstrap.test.js test\\bootstrap-shell-desktop.test.js` plus `cmd /c node --test --test-name-pattern="bootstrap UI can bind, export, import, consume, and remove contextual names" test\\ui.bootstrap.test.js`
- [x] bootstrap widget creation in that browser proof now preserves the active tutorial contract by defaulting blank `tutorialTarget` to widget `id` in the local widget-form submit transform instead of letting a hidden type-model requirement cause unrelated proof drift
- [x] `plugins/tutorial/todo-starter-blueprint.json` is now the live tutorial-owned starter blueprint asset; `plugins/tutorial/tutorials.js` consumes it through a thin loader and the starter browser proof still passes against the live wired path
- do not treat partial code already landed in the workspace as authoritative if this file still records the slice as open or blocked

## Confirmed Runtime Baseline

The following current-state facts are confirmed and should be assumed by later migrations unless code changes them:

- [x] `plugins/inspect/widget-page.js` already routes authored form submission through semantic `submit:<widget>` events
- [x] `plugins/inspect/widget-page.js` already routes `[data-action]` clicks through semantic `click:<action>` events
- [x] `plugins/inspect/widget-page.js` already runs authored `load` semantics on initial boot and again after `refreshProjection()`
- [x] `plugins/inspect/widget-page.js` already supports initial JSON state seeding through `appConfig.initialStateScriptId` and `appConfig.initialStateInto`
- [x] `plugins/inspect/widget-page.js` now keeps authored initial-state scripts synchronized across `refreshProjection()` before re-running authored `load` steps
- [x] `plugins/inspect/widget-page.js` already interpolates cloned template attributes and text content, so repeated authored templates can carry dynamic data without page-local DOM assembly
- [x] `plugins/inspect/widget-page.js` now provides a first-class semantic `change` binding for authored select/range/checkbox interactions
- [x] `plugins/inspect/widget-page.js` now provides a first-class semantic `input` binding for authored text-entry interactions
- [x] `plugins/inspect/widget-page.js` now provides a first-class semantic `keydown` binding for authored widget-scoped and root-scoped keyboard shortcuts
- [x] `plugins/inspect/widget-page.js` now provides generic `setHidden` and `setDisabled` frontend ops for authored view-state shaping that should not fall back to page-local DOM patching
- [x] `plugins/inspect/widget-page.js` now allows embedded authored runtimes to disable process-event recording when the host page does not expose `/api/process-events`
- [x] `src/runtime-host-route-factory.js` and `src/runtime-builtins.js` now expose a shared `navigate` frontend op for authored URL changes
- [x] `plugins/inspect/widget-page.js` now exposes a generic `setQueryParam` frontend op so authored flows can update current-page query state without page-local `history.replaceState(...)` handlers
- [x] `plugins/inspect/widget-page.js` `readForm(...)` now supports generic checkbox-to-boolean coercion for authored forms that must submit real boolean payloads instead of raw `"on"`/missing form values
- [x] `plugins/inspect/widget-page.js` now exposes a generic `dispatchDomEvent` frontend op so embedded authored runtimes can signal host-page adapters without reclaiming page-local submit ownership
- [x] `plugins/inspect/widget-page.js` now resolves authored runtime `fetchJson`/`postJson`/`patchJson`/`deleteJson` URLs against the active page origin so embedded authored runtimes still work under `page.setContent(...)` and similar browser-proof hosts instead of assuming raw relative fetch URLs are always valid
- [x] `plugins/inspect/widget-page.js` `renderCollection(...)` now accepts direct interpolated array input for nested authored collections
- [x] repeated template instances now have an explicit runtime-supported dynamic widget-id mechanism without overloading template lookup ids
- [x] `plugins/inspect/widget-page.js` now supports explicit `appConfig.frontendProgramScriptId` values so multiple embedded authored runtimes can coexist on one page without colliding on one hard-coded program script id
- [x] embedded authored surfaces that rely on typed `readForm(schema=...)` need runtime built-in type/process definitions seeded into their helper render worlds first; bootstrap now does this explicitly with `ensureRuntimeBuiltins(world)` before `applyWitnessToml(...)` in its authored surface render helpers

## Confirmed Authoring Constraints

The following practical constraints are already known and should be treated as part of the migration brief:

- [x] `renderWidgetPage(...)` currently renders `Page`, `Box`, `Section`, `Heading`, `Text`, `Label`, `Form`, `Input`, `Textarea`, `Select`, `Option`, `Details`, `Summary`, `ValueEditor`, `Button`, `Link`, and `List`
- [x] renderer support is not the same as `applyWitnessToml(...)` apply support; a migration must prove the authored declaration kinds are accepted by the DSL path it uses
- [x] authored widgets can preserve legacy/test/runtime DOM hooks through explicit `domId` instead of relying on widget ids alone
- [x] standalone authored page files should carry explicit `[[defaults]]` ownership such as `actor` and `context` instead of assuming ambient loader state
- [x] initial JSON state seeding through `initialStateScriptId` and `initialStateInto` is the preferred way to hand authored surfaces a page projection
- [x] repeated authored structures should prefer seeded projection data plus template/collection expansion over incremental `innerHTML` rebuilding

These are not abstract concerns. They have already affected real migration work and should be assumed unless a later change proves otherwise.

## Known Frontier Constraints

The following are current execution-time constraints, not speculative risks. They should remain documented here until the underlying code and proof state change.

- [x] as of 2026-06-14, the shared DESIRE apply path now natively accepts renderer-supported WTOML widget sections `label`, `textarea`, `details`, `summary`, and `valueEditor` in `src/desire/apply.js` instead of treating them as unsupported runtime declarations
- [x] the shared proof command is now `cmd /c node --test test\\dsl.test.js`, which covers renderer/apply-path parity for those widget sections independently of bootstrap
- [x] bootstrap proposal-create extraction no longer depends on a bootstrap-only textarea escape hatch because the missing capability was landed generically first
- [x] as of 2026-06-14, `src/desire/normalize.js` must preserve explicit `serverRunner.handlerSet` values even when `plugin.demo` is installed; `plugin.demo` provides the runtime bundle, but `handlerSet = "demo"` still selects the demo handler-set factory
- [x] the focused proof for that runner/handler-set contract is `cmd /c node --test --test-name-pattern="minimal runtime plus plugin.demo exposes the demo handler set from the plugin runtime|serverRunner.handlerSet no longer auto-activates the demo bundle under minimal" test\\runtime-profile.test.js`
- [ ] renderer support is still not proof of `applyWitnessToml(...)` support for future widget kinds; continue to add shared proof when new authored section kinds are introduced
- [ ] when renderer support and `applyWitnessToml(...)` support diverge again, treat that mismatch as the next required shared runtime/authoring slice before any page-local extraction continues

## Ownership Layers

Use the following ownership split consistently. This is the target architecture, not a loose suggestion.

### 1. Authored surface ownership

- [ ] page composition, copy, repeated structures, forms, panels, summaries, empty states, and user-visible affordances belong in `DESIRE`, `RVM`, `WTOML`, widget definitions, or authored templates
- [ ] product-significant interaction intent belongs in authored actions, semantic events, `frontendProgram` flows, or equivalent declared contracts
- [ ] if the page needs a new reusable shell pattern, define it as part of the surface kit rather than as page-local markup

### 2. Shared surface-kit ownership

- [ ] tokens own semantic design values such as color roles, spacing, radius, typography, elevation, and motion
- [ ] primitives own reusable styling and structural conventions for cards, panels, forms, lists, toolbars, status blocks, and inspector shells
- [ ] shared event adapters own translation from browser events into semantic actions

### 3. Runtime ownership

- [ ] renderers own element emission, template expansion, collection instantiation, generic event binding, state seeding, and transport plumbing
- [ ] runtime modules may own geometry, canvas drawing, hit-testing, drag math, viewport math, stream wiring, and other true engine mechanics
- [ ] runtime code may project state into authored surfaces, but should not remain the hidden owner of product structure or product meaning

### 4. Page adapter ownership

- [ ] a page module may remain as a small adapter that loads authored sources, seeds projection state, and connects shared semantic actions to existing runtime/server seams
- [ ] a page adapter should shrink over time; it is not an acceptable final home for page-specific HTML, CSS, or behavioral truth

## Success Criteria

The migration direction described here is only successful if all of the following become true:

- [ ] authored surfaces own product structure
- [ ] shared theme/token layers own design tokens
- [ ] shared surface primitives own reusable styling
- [ ] semantic interaction contracts own product-significant event meaning
- [ ] runtime code owns only mechanics, rendering, transport, and binding
- [ ] the dominant pages no longer require large inline HTML documents and page-owned visual systems to evolve

## Drift Warnings

If execution starts drifting, it will usually fail in one of these ways:

- replacing template strings with different template strings while leaving ownership unchanged
- extracting a JS UI library but still defining product semantics in code
- centralizing CSS without defining token ownership or primitive ownership
- keeping direct DOM event handlers as the sole source of product behavior
- moving too much engine logic into authored forms where it becomes awkward or unstable
- rewriting everything at once instead of proving the pattern on smaller pages first

If a proposed change does not clearly improve ownership according to this document, treat it as drift, not progress.

## Contract Preservation Rules

During extraction, preserve the page contracts that other code already depends on.

- preserve stable DOM selectors used by tests, tutorials, browser automation, or follow-on controllers unless the same change updates all dependents
- preserve `data-tutorial-target` and related tutorial focus anchors where tutorial flows already depend on them
- preserve seeded state script ids and destination state keys when an authored page already relies on projection seeding
- preserve query-string and hash behavior when URLs are part of the product/runtime contract
- preserve `data-*` hooks that encode semantic test/runtime meaning; do not remove them just because the markup moved
- when preserving selectors through authored extraction, use explicit authored props such as `domId` rather than reintroducing page-local DOM patch-up code

Known live contracts that should not be broken casually include:

- `plugins/bootstrap/bootstrap-shell.js`: `#identity-form`, `#open-app-link`, `#create-todo-starter`, `#bootstrap-summary`, `#session-summary`, tutorial targets around bootstrap identity/session/app-open flows
- `plugins/inspect/process-view.js`: `data-process-view`, `data-process-catalog-item`, `data-process-run-item`, `data-process-node`, and `data-process-replay-range`
- `plugins/tutorial/tutorial-app-client.js` and tutorial bootstrap flows: target ids and `data-tutorial-target` anchors used to focus authored controls

## Inventory Summary

Ranked by rough migration value, not just file size.

| Area | File | Notes |
| --- | --- | --- |
| High | `plugins/eden/eden-page.js` | Largest concentration of inline surface structure and DOM HTML writes. |
| High | `plugins/bootstrap/bootstrap-shell.js` | Full product shell authored as one JS-returned HTML document plus inline client behavior. |
| High | `plugins/canvas/canvas-page.js` | Full page shell is hard-coded; client mixes generic canvas engine with authored inspector/toolbar UI. |
| High | `plugins/inspect/process-view.js` | Entire process-view UI is authored as HTML/CSS inside module code. |
| Medium | `plugins/backend-seams/backend-seams-page.js` | Diagnostics UI is structured authored content and should be declarative. |
| Medium | `src/desktop-launcher-page.js` | Small shell, but still authored UI embedded in module code. |
| Medium | `plugins/tutorial/tutorial-app-client.js` | Overlay control semantics remain page-local; the DOM skeleton should continue moving toward reusable surface/template content. |
| Medium | `plugins/inspect/widget-page.js` | Mostly generic runtime, but still contains inspect/world-graph UI fragments hard-coded as HTML strings. |
| Low | `plugins/chart-runtime/chart-page.js` | Runtime bundling seam, not primarily authored UI debt. Keep in code for now. |
| Low | `src/runtime-core-handlers.js`, `src/runtime-route-handlers.js` | Fallback stub HTML only; not a migration priority. |

## Findings

### 1. `plugins/eden/eden-page.js` is the biggest authored-surface debt

Why it matters:

- `plugins/eden/eden-page.js` is `3457` lines.
- It contains the largest inline CSS block, a large inline client program, and `53` DOM HTML write sites.
- Many of those writes are not generic rendering internals; they are authored surface layouts for concrete product areas.

Representative hotspots:

- `plugins/eden/eden-page.js:2615`
- `plugins/eden/eden-page.js:2641`
- `plugins/eden/eden-page.js:2686`
- `plugins/eden/eden-page.js:2756`
- `plugins/eden/eden-page.js:2824`
- `plugins/eden/eden-page.js:2918`
- `plugins/eden/eden-page.js:2963`
- `plugins/eden/eden-page.js:3024`
- `plugins/eden/eden-page.js:3413`

What should move:

- surface skeletons for personal room, edit page, commons, capability shelf, machine room, versions, and embedded surfaces
- repeated card/list layouts
- chapter/quest/lesson presentation structure

What should stay in JS:

- camera math
- layout math
- drag/zoom/pan behavior
- low-level event orchestration

Recommended target form:

- `RVM` surface trees for top-level Eden neighborhoods and panels
- `WTOML` widget/template definitions for repeated cards, auth forms, summaries, and lists
- `frontendProgram` or `RVM` process/event forms for interaction wiring

Migration note:

This file should be split into authored surface definitions plus a much smaller Eden runtime that only projects state into those surfaces and handles direct-manipulation behavior.

### 2. `plugins/bootstrap/bootstrap-shell.js` is authored product UI trapped in a JS module

Why it matters:

- `plugins/bootstrap/bootstrap-shell.js` is `2885` lines.
- It returns a full HTML document at `plugins/bootstrap/bootstrap-shell.js:19`.
- It mixes authored shell layout, tutorial content, forms, state panels, and controller logic in one module.

Representative hotspots:

- `plugins/bootstrap/bootstrap-shell.js:19`
- `plugins/bootstrap/bootstrap-shell.js:1091`
- `plugins/bootstrap/bootstrap-shell.js:1465`
- `plugins/bootstrap/bootstrap-shell.js:1471`
- `plugins/bootstrap/bootstrap-shell.js:1490`

What should move:

- the bootstrap page structure
- all form layouts
- status cards and state lists
- tutorial shell composition

Recommended target form:

- `WTOML` widget/page definitions immediately, because the page is mostly forms, text, buttons, and lists
- `frontendProgram` definitions for submit/click flows
- optional later `RVM` surface tree once bootstrap becomes part of a broader authored shell

What should stay in JS:

- generic controller helpers that map authored actions to runtime APIs

Bootstrap-specific migration warning:

- preserve the current operator, identity, session, tutorial, and app-open selectors during each slice because UI tests and tutorial progression depend on them heavily
- treat replacement of the top-level document/template string as insufficient if the page-local controller still remains the only owner of interaction semantics
- prefer extracting one card family at a time into authored widgets while shrinking the controller toward shared `frontendProgram` flows

### 3. `plugins/canvas/canvas-page.js` contains two different kinds of content that should be separated

Why it matters:

- `plugins/canvas/canvas-page.js` is `2000` lines.
- It contains a full HTML shell at `plugins/canvas/canvas-page.js:1934`.
- The file mixes authored toolbar/inspector UI with a genuine canvas engine.

Representative hotspots:

- `plugins/canvas/canvas-page.js:1934`
- `plugins/canvas/canvas-page.js:1421`
- `plugins/canvas/canvas-page.js:1425`
- `plugins/canvas/canvas-page.js:1761`
- `plugins/canvas/canvas-page.js:1787`

What should move:

- toolbar shell
- session controls
- inspector panes
- timeline panel structure
- empty-state copy

What should stay in JS:

- canvas drawing
- hit-testing
- undo/redo mechanics
- pointer gestures
- live event-stream handling

Recommended target form:

- `RVM` or `WTOML` for toolbar and inspector surface composition
- leave the canvas renderer as a runtime plugin invoked by those authored surfaces

### 4. `plugins/inspect/process-view.js` is a strong extraction candidate

Why it matters:

- `plugins/inspect/process-view.js` is only `641` lines, but almost the entire page is authored UI.
- It renders a full document at `plugins/inspect/process-view.js:154`.
- The process graph data model is code; the page shell itself is not.

What should move:

- catalog pane
- run list pane
- inspector cards
- replay controls
- graph layer containers

Recommended target form:

- `WTOML` widgets plus templated repeated collections
- `frontendProgram` behavior for selection and replay navigation

What should stay in JS:

- graph construction and replay-state derivation

### 5. `plugins/backend-seams/backend-seams-page.js` is low-risk, high-clarity extraction work

Why it matters:

- The file is small (`170` lines) and almost entirely authored page content.
- It is a good pilot for proving diagnostics pages can be expressed as authored surfaces instead of template strings.

Representative hotspot:

- `plugins/backend-seams/backend-seams-page.js:9`

Recommended target form:

- `WTOML` widgets/templates and repeated collections
- a small renderer that only supplies diagnostics data

### 6. `src/desktop-launcher-page.js` should eventually move, but it is not urgent

Why it matters:

- The file is small (`233` lines), but it still hard-codes a full shell and inline client at `src/desktop-launcher-page.js:9`.
- The overall page shell and direct desktop-bridge action wiring still live in `src/desktop-launcher-page.js`.

Current slice status:

- [x] the recent-worlds list no longer assembles rows through inline `innerHTML`; row DOM creation plus delegated row-open handling now live in `src/desktop-launcher-recent-worlds.js`, and `src/desktop-launcher-page.js` consumes that seam instead of rebuilding the list inline
- [x] focused proof for that desktop launcher slice is `cmd /c node --test src\\desktop-launcher-recent-worlds.test.js test\\desktop-shell.test.js`
- [ ] the full desktop launcher shell and the direct open/create bridge action wiring still remain page-local and should eventually move to authored structure plus named desktop action contracts

Reason it is not first:

- it is a thin Electron/desktop seam
- it depends on `window.witnessDesktop`, so there is less immediate reuse value than the in-app runtime surfaces

Recommended target form:

- `WTOML` widgets for shell structure
- authored action definitions mapped onto desktop bridge calls

### 7. `plugins/tutorial/tutorial-app-client.js` and inspect overlays should become reusable surface templates

Why it matters:

- The tutorial overlay still owns product-visible state derivation and some tutorial-specific behavior in page-local JS.
- The inspect runtime already has generic collection/template behavior, but some overlays still bypass it.

Current slice status:

- [x] the tutorial overlay DOM skeleton is no longer injected through the large literal `innerHTML` fragments in `plugins/tutorial/tutorial-app-client.js`; overlay DOM construction now lives in `plugins/tutorial/tutorial-overlay-dom.js`, and `renderTutorialClient(...)` consumes that seam instead of assembling the overlay skeleton inline
- [x] disabled-scope row rendering is no longer page-local string assembly in `plugins/tutorial/tutorial-app-client.js`; row-card build/apply now live in `plugins/tutorial/tutorial-disabled-scopes-view.js`, and `renderTutorialClient(...)` consumes that seam instead of rebuilding the rows inline
- [x] disabled-scope toggle/close/delegated panel actions are no longer owned inline by `plugins/tutorial/tutorial-app-client.js`; that behavior now lives in `plugins/tutorial/tutorial-disabled-scopes-actions.js`, and `renderTutorialClient(...)` consumes that seam instead of keeping the raw disabled-scope listener block inline
- [x] overlay button command wiring for resume/next/back/restart/show/disable/exit/reset is no longer owned inline by `plugins/tutorial/tutorial-app-client.js`; that behavior now lives in `plugins/tutorial/tutorial-overlay-actions.js`, and `renderTutorialClient(...)` consumes that seam instead of keeping the raw button-listener block inline
- [x] overlay drag positioning and pointer listener binding are no longer owned inline by `plugins/tutorial/tutorial-app-client.js`; that behavior now lives in `plugins/tutorial/tutorial-overlay-drag.js`, and `renderTutorialClient(...)` consumes that seam instead of keeping the raw pointerdown/move/up block inline
- [x] tutorial advance progression, queued auto-advance, replay-clear observation, and boot sequencing are no longer owned inline by `plugins/tutorial/tutorial-app-client.js`; that behavior now lives in `plugins/tutorial/tutorial-progress-runtime.js`, and `renderTutorialClient(...)` consumes that seam instead of keeping the raw progress/runtime choreography inline
- [x] tutorial scope/context/progress normalization, replay derivation, disabled-guidance row derivation, and surface-state formulas are no longer owned inline by `plugins/tutorial/tutorial-app-client.js`; that behavior now lives in `plugins/tutorial/tutorial-progress-state.js`, and `renderTutorialClient(...)` consumes that seam instead of keeping the raw tutorial formula family inline
- [x] tutorial page continuation, target submit choreography, restart flows, and completion-read checks are no longer owned inline by `plugins/tutorial/tutorial-app-client.js`; that behavior now lives in `plugins/tutorial/tutorial-runtime-actions.js`, and `renderTutorialClient(...)` consumes that seam instead of keeping the raw completion/request/navigation helpers inline
- [x] tutorial overlay render/apply plus runtime witness publishing are no longer owned inline by `plugins/tutorial/tutorial-app-client.js`; that behavior now lives in `plugins/tutorial/tutorial-overlay-view.js`, and `renderTutorialClient(...)` consumes that seam instead of keeping the raw overlay render/publish branch inline
- [x] tutorial highlight clearing, target focus, scope focus, form fill, pulse, and auto-click feedback are no longer owned inline by `plugins/tutorial/tutorial-app-client.js`; that behavior now lives in `plugins/tutorial/tutorial-overlay-interactions.js`, and `renderTutorialClient(...)` consumes that seam instead of keeping the raw interaction helpers inline
- [x] tutorial request/save/render/publish adapter wiring is no longer owned inline by `plugins/tutorial/tutorial-app-client.js`; that behavior now lives in `plugins/tutorial/tutorial-client-adapter.js`, and `renderTutorialClient(...)` consumes that seam instead of keeping the raw `api(...)`, `saveProgress(...)`, `renderDisabledScopes(...)`, `render(...)`, and `publishRuntimeState(...)` bridge/view packet inline
- [x] tutorial local state ownership plus DOM-target/focus/position coordination are no longer owned inline by `plugins/tutorial/tutorial-app-client.js`; that behavior now lives in `plugins/tutorial/tutorial-client-state.js` and `plugins/tutorial/tutorial-client-interactions.js`, and `renderTutorialClient(...)` consumes those seams instead of keeping the raw mutable state slots, step/history selectors, target lookup, highlight clearing, focus wrappers, pulse/flash/fill wrappers, and positioning bridge inline
- [x] focused source/runtime proof for that tutorial overlay slice is `cmd /c node --test plugins\\tutorial\\tutorial-client-state.test.js plugins\\tutorial\\tutorial-client-interactions.test.js plugins\\tutorial\\tutorial-client-adapter.test.js plugins\\tutorial\\tutorial-runtime-actions.test.js plugins\\tutorial\\tutorial-progress-state.test.js plugins\\tutorial\\tutorial-overlay-interactions.test.js plugins\\tutorial\\tutorial-overlay-view.test.js plugins\\tutorial\\tutorial-progress-runtime.test.js plugins\\tutorial\\tutorial-overlay-drag.test.js plugins\\tutorial\\tutorial-overlay-actions.test.js plugins\\tutorial\\tutorial-disabled-scopes-actions.test.js plugins\\tutorial\\tutorial-disabled-scopes-view.test.js plugins\\tutorial\\tutorial-overlay-dom.test.js plugins\\tutorial\\tutorial.test.js`
- [x] inspect surface-command toggle/close/query/run/result-navigation listeners are no longer owned inline by `plugins/inspect/widget-page.js`; that behavior now lives in `plugins/inspect/surface-command-actions.js`, and `renderWidgetPage(...)` consumes that seam instead of keeping the raw surface-command listener family inside `updateSurfaceInspectorUi()`
- [x] inspect surface-command inline identity save wiring is no longer owned inline by `plugins/inspect/widget-page.js`; that behavior now lives in `plugins/inspect/surface-command-identity-actions.js`, and `renderWidgetPage(...)` consumes that seam instead of keeping the raw `data-surface-command-identity-form` submit handler inside `updateSurfaceInspectorUi()`
- [x] inspect surface-inspector toggle/close/clear/refresh/select/world/open-process listeners are no longer owned inline by `plugins/inspect/widget-page.js`; that behavior now lives in `plugins/inspect/surface-inspector-actions.js`, and `renderWidgetPage(...)` consumes that seam instead of keeping the raw inspector chrome/navigation listener family inside `updateSurfaceInspectorUi()`
- [x] inspect surface-inspector activate/rollback button wiring is no longer owned inline by `plugins/inspect/widget-page.js`; that behavior now lives in `plugins/inspect/surface-inspector-version-actions.js`, and `renderWidgetPage(...)` consumes that seam instead of keeping the raw `data-surface-inspector-activate` / `data-surface-inspector-rollback` listener family inside `updateSurfaceInspectorUi()`
- [x] inspect surface-inspector edit/proposal/version-proposal submit wiring is no longer owned inline by `plugins/inspect/widget-page.js`; that behavior now lives in `plugins/inspect/surface-inspector-form-actions.js`, and `renderWidgetPage(...)` consumes that seam instead of keeping the raw `data-surface-inspector-edit-form` / `data-surface-inspector-proposal-form` / `data-surface-inspector-version-proposal-form` submit family inside `updateSurfaceInspectorUi()`
- [x] inspect world command palette toggle/close/query/run/focus/shortcut wiring is no longer owned inline by `plugins/inspect/widget-page.js`; that behavior now lives in `plugins/inspect/world-command-actions.js`, and `renderWidgetPage(...)` consumes that seam instead of keeping the raw `data-world-command-*` listener family, focus branch, and shortcut binding inside `draw()`
- [x] inspect world tutorial action wiring is no longer owned inline by `plugins/inspect/widget-page.js`; that behavior now lives in `plugins/inspect/world-tutorial-actions.js`, and `renderWidgetPage(...)` consumes that seam instead of keeping the raw `data-world-tutorial-*` listener family inside `draw()`
- [x] inspect world graph navigation/version/process/primitive wiring is no longer owned inline by `plugins/inspect/widget-page.js`; that behavior now lives in `plugins/inspect/world-graph-actions.js`, and `renderWidgetPage(...)` consumes that seam instead of keeping the raw `data-world-mode` / `data-world-node-id` / `data-world-select` / `data-world-kind` / `data-world-clear-kind` / `data-world-source-file` / `data-world-widget-activate` / `data-world-widget-rollback` / `data-world-open-process-program` / `data-world-jump-to-graph` / `data-world-close-source` / `data-world-primitive` / `data-world-primitive-kind-only` / `data-world-close-primitive` listener family inside `draw()`
- [x] inspect overlay shell creation plus world shell/post-render sync are no longer owned inline by `plugins/inspect/widget-page.js`; that behavior now lives in `plugins/inspect/surface-inspector-overlay-view.js`, `plugins/inspect/world-shell-view.js`, and `plugins/inspect/world-post-render.js`, and `renderWidgetPage(...)` now consumes those seams instead of keeping the raw overlay shell string, world shell string, pending-source reload branch, selected-node recenter branch, tutorial refocus/clear branch, and command-focus sync branch inline
- [x] focused source/runtime proof for the current inspect overlay/action slice is `cmd /c node --test plugins\\inspect\\surface-inspector-overlay-view.test.js plugins\\inspect\\world-shell-view.test.js plugins\\inspect\\world-post-render.test.js plugins\\inspect\\world-graph-actions.test.js plugins\\inspect\\world-tutorial-actions.test.js plugins\\inspect\\world-command-actions.test.js plugins\\inspect\\surface-command-actions.test.js plugins\\inspect\\surface-command-identity-actions.test.js plugins\\inspect\\surface-inspector-actions.test.js plugins\\inspect\\surface-inspector-form-actions.test.js plugins\\inspect\\surface-inspector-version-actions.test.js plugins\\inspect\\inspect.test.js`
- [ ] browser proof for the live tutorial overlay still needs rerun when Playwright launch is available again; the current sandbox blocks `test\\ui.tutorial.test.js` browser launch with `browserType.launch: spawn EPERM`
- [ ] tutorial client binder/boot orchestration still remains page-local in `plugins/tutorial/tutorial-app-client.js`; the residual local owner is now the thin family that sequences `bindTutorialDisabledScopesActions(...)`, `bindTutorialOverlayDrag(...)`, `bindTutorialOverlayActions(...)`, `bindProgressObservation(...)`, and the final `boot({ publishRuntimeState })` handoff around the extracted seams

Representative hotspots:

- `plugins/tutorial/tutorial-app-client.js:45`
- `plugins/tutorial/tutorial-app-client.js:104`
- `plugins/tutorial/tutorial-app-client.js:208`
- `plugins/tutorial/tutorial-app-client.js:225`
- `plugins/tutorial/tutorial-app-client.js:237`
- `plugins/tutorial/tutorial-app-client.js:269`

Recommended target form:

- reusable template widgets
- `frontendProgram`-driven state transitions

Important nuance:

- `plugins/inspect/widget-page.js` should not be treated as wholesale migration debt. Most of it is the generic widget runtime. Only the inspect-specific UI branches and overlay shells should be extracted.

### 8. `plugins/chart-runtime/chart-page.js` should stay code-first for now

Why it matters:

- It is tiny (`66` lines) and acts as a runtime assembly seam.
- The key behavior is bundling generic runtimes and a domain std-lib into one module script.

Representative hotspot:

- `plugins/chart-runtime/chart-page.js:31`

Recommendation:

- do not spend migration effort here yet
- revisit only after chart surfaces can mount through the same generic authored runtime as other pages

## Extraction Strategy

### Immediate extraction targets

These are mostly authored UI and should move first:

- [x] `plugins/backend-seams/backend-seams-page.js`
- [x] `plugins/inspect/process-view.js`
- [x] prove a partial `plugins/bootstrap/bootstrap-shell.js` extraction by moving the top card stack into authored `WTOML` while preserving its current selectors and tutorial hooks
- [ ] `plugins/bootstrap/bootstrap-shell.js`
- [ ] `plugins/eden/eden-page.js` surface shells and repeated panels

### Partial extraction targets

These should be split into authored shell plus code runtime:

- [ ] `plugins/canvas/canvas-page.js`
- [ ] `plugins/eden/eden-page.js`
- [ ] `plugins/tutorial/tutorial-app-client.js`
- [ ] inspect overlay branches inside `plugins/inspect/widget-page.js`

### Keep in code for now

- [ ] `plugins/chart-runtime/chart-page.js`
- [ ] generic widget rendering and collection instantiation in `plugins/inspect/widget-page.js`
- [ ] fallback stub HTML in `src/runtime-core-handlers.js` and `src/runtime-route-handlers.js`

## CSS And Theming

The current page-local global CSS approach is not sustainable once surfaces become composable.

Current problems:

- tokens are duplicated across pages
- component styling is owned by page shells instead of reusable primitives
- variants are ad hoc and page-specific
- runtime chrome and authored surface styling do not have clear ownership boundaries
- large inline `<style>` blocks make extraction of authored surfaces harder than it should be

### Recommended theming model

#### 1. Theme contract

- [ ] define canonical design tokens once for color roles, spacing, radius, typography, elevation, and motion
- [x] move page-theme behavior onto a stable shared contract instead of ad hoc page-local variables
- [ ] ensure authored surfaces consume token roles rather than hard-coded colors or fonts

#### 2. Surface-kit styles

- [ ] extract reusable primitive styles for `card`, `panel`, `toolbar`, `split-pane`, `status`, `form-row`, `list`, `empty-state`, and `inspector`
- [ ] make primitive styles token-driven so variants are data/config choices rather than new page CSS
- [ ] separate runtime-engine styling from authored-surface styling

#### 3. Page composition

- [ ] make pages choose primitives and variants instead of defining whole visual systems locally
- [ ] reserve page-specific CSS for true one-off layouts such as canvas or geometry-heavy views
- [ ] reduce module-local global CSS to only what cannot yet be expressed through the shared surface kit

### CSS extraction priorities

- [x] extract a shared token file first
- [ ] extract `card`, `button`, `form`, `status`, `list`, and `inspector` primitives next
- [ ] refit `backend-seams`, `process-view`, and `bootstrap` onto the shared token and primitive layer before tackling `eden` and `canvas`
- [ ] decide whether theme tokens live as JS config, authored theme docs, or both, but keep the contract singular
- [ ] stop introducing new page-local visual systems unless they are explicitly experimental

### CSS execution order for unattended work

- [ ] do not extract a shared primitive until the token source of truth it depends on is named explicitly
- [ ] do not migrate a second page onto a primitive until the primitive boundary is clear enough to explain which classes are token roles, which are primitive classes, and which are temporary composition classes
- [ ] prefer proving token extraction and primitive extraction on `backend-seams`, `process-view`, and the already-partial `bootstrap` shell before expanding the same kit into `eden` or `canvas`
- [ ] if a page still needs page-local CSS after a slice, record exactly which selectors remain page-local and why they are not yet primitive-worthy
- [ ] when a page consumes shared `surface-*` primitives, keep the page as the owner of token values and composition choices, not as a forked owner of primitive selector behavior
- [ ] do not expand shared primitive CSS with bootstrap-only, Eden-only, or process-view-only selector rules; split those into tokens, a new generic primitive, or a documented temporary page-local exception
- [ ] if a slice leaves both shared primitive CSS and page-local CSS affecting the same authored block, document which layer owns structure, which layer owns theme, and which layer is temporary

### Required CSS slice record

When unattended execution touches styling or theming, the slice record should be specific enough that a later pass can tell whether ownership really improved.

- [ ] name the token owner: which file or contract now defines the semantic token values involved in the slice
- [ ] name the primitive owner: which shared primitive or primitive family now owns the reusable selector behavior
- [ ] name the page-composition owner: which page or authored surface still chooses variants, layout composition, or page-local exceptions
- [ ] name the load/cascade owner: which layer is expected to load first and which later layer is intentionally allowed to override it during the temporary mixed state
- [ ] name every surviving page-local selector that still affects the migrated block, plus why each one is still allowed
- [ ] do not mark a CSS slice complete if token, primitive, and page-specific layout ownership are still mixed in one file without an explicit exception record

### Theming implementation warnings

- do not let each page pick slightly different names for the same semantic color role; token naming must converge, not proliferate
- do not treat copied CSS custom properties as token extraction; token ownership only improves when there is one canonical source of truth
- do not let primitive classes silently depend on page ancestry or cascade quirks for layout or color correctness
- if a primitive needs variants, express them as explicit variant inputs or classes, not as page-local override piles
- do not move bootstrap, process-view, or backend-seams to authored markup while leaving their visual system effectively frozen in page-local CSS
- do not let token names encode page ownership such as `bootstrap-*` or `eden-*` when the intended role is semantic; page identity belongs in composition choices or temporary exception records, not in the shared token contract

### CSS ownership rule

- [ ] page modules should not be the long-term owners of typography scales, elevation, spacing systems, or semantic color roles
- [ ] reusable surfaces should own primitive class styling
- [ ] themes should own tokens
- [ ] runtime modules should only own engine-specific layout or rendering styles

### CSS extraction order

- [ ] decide token ownership before or alongside primitive extraction; do not move primitive selectors first and postpone token meaning indefinitely
- [ ] decide primitive ownership before or alongside page-shell class cleanup; do not promote page-local layout classes into shared CSS without naming their reusable role
- [ ] if a page still needs temporary global CSS during extraction, record whether that CSS owns layout, visual treatment, tutorial behavior, or a pure stopgap compatibility layer
- [ ] treat "moved to shared CSS" as insufficient unless the resulting shared file has a clear layer identity: token contract, primitive family, or shared shell
- [ ] do not let shared CSS become a dumping ground for page leftovers; every moved selector should have an explicit reason it belongs above the page level

### CSS drift warnings

- do not freeze current page-local class names as the de facto design system without first deciding whether they are tokens, primitives, or one-off composition classes
- do not move inline `<style>` blocks into one shared file if the result still mixes token definitions, primitive styling, and page-specific layout in the same ownership layer
- do not let authored pages depend on implicit global cascade ordering for correctness; shared primitives and tokens should be sufficient to explain appearance
- when a temporary page-specific class must survive an extraction slice, record it as temporary instead of silently promoting it into the shared kit

## Event And External State Capture

Another sustainability concern is interaction capture: clicks, submits, focus changes, selection changes, drag gestures, command invocations, and similar external state changes should not be trapped inside page-local hard-coded JS.

### Concrete audit

#### Current hotspots by module

| Module | `addEventListener` count | Current pattern | Audit |
| --- | ---: | --- | --- |
| `plugins/inspect/widget-page.js` | 60 | generic semantic runtime plus inspect overlays | best existing foundation, but mixed with hard-coded inspect UI |
| `plugins/eden/eden-page.js` | 57 | panel-local handlers calling endpoints and mutating local state | high event debt |
| `plugins/bootstrap/bootstrap-shell.js` | 55 | form/button/change handlers directly invoking `postJson` and local refresh helpers | high event debt |
| `plugins/canvas/canvas-page.js` | 47 | mixed low-level gesture runtime plus hard-coded toolbar/product actions | mixed; split needed |
| `plugins/tutorial/tutorial-app-client.js` | 20 | overlay-local controls plus generic page observation hooks | mixed; partly reusable |
| `plugins/inspect/process-view.js` | 1 | simple direct URL mutation | low debt |
| `src/desktop-launcher-page.js` | 2 | direct desktop bridge calls | low debt |

#### Positive baseline already present

`plugins/inspect/widget-page.js` already contains a reusable semantic event layer:

- `plugins/inspect/widget-page.js:3717` binds authored `submit:<widget>` events through `safeRun(...)` instead of hard-coding endpoint calls in each form
- `plugins/inspect/widget-page.js:3900` routes `[data-action]` clicks through semantic `click:<action>` handling
- `src/runtime-host-route-factory.js:7` defines the supported frontend op vocabulary (`logout`, `fetchJson`, `readForm`, `refreshProjection`, `postJson`, `patchJson`, `deleteJson`, `run`, etc.)

This is the model to expand, not replace.

#### External state capture rule

External state changes must be captured at the semantic-action boundary, not hidden in page-local DOM callbacks.

- [ ] browser events such as `click`, `submit`, `change`, `input`, and keyboard shortcuts should be translated once by shared runtime code, then routed as semantic actions/events
- [ ] URL/search-param changes count as external state changes and should be owned by a named semantic action or frontend op rather than ad hoc `window.location` mutation
- [ ] durable state transitions should land in the appropriate state owner (`frontendProgram`, witnessed process state, server state, or runtime store), not in anonymous closures that mutate page-local state
- [ ] direct-manipulation runtimes may keep low-level pointer mechanics in code, but must still expose the resulting product meaning through stable named events
- [ ] if a page still requires page-local event code, the reason it cannot yet be expressed through the shared event model should be recorded explicitly

#### External state capture ledger

Every unattended slice that touches clicks, submits, URL changes, selection changes, mode changes, refresh triggers, or host-bridge events should leave behind an explicit ownership record here or in the slice record below.

- [ ] name the producer hook: selector, widget `domId`, or semantic trigger that originates the state change
- [ ] name the semantic owner: authored action, `frontendProgram` trigger, or runtime semantic event that now owns the meaning of that change
- [ ] name the resulting state owner: runtime state, witnessed/process state, server resource, URL/query state, or thin host adapter
- [ ] name any bridge hop explicitly: event name, payload shape, and receiving adapter capability
- [ ] name the focused proof that re-proves the change end to end
- [ ] do not leave external state changes split across authored flow and page-local follow-up code unless this file explicitly describes the split and why it still exists

#### Bridge event contract requirements

- [ ] every bridge event should record one producer, one semantic purpose, one receiving adapter, and one resulting state owner
- [ ] every bridge event should record its payload shape by field name when later slices depend on that payload
- [ ] bridge events should ask for semantic recompute, host action, or projection refresh; they should not become a hidden transport for unrelated product decisions
- [ ] if a bridge event starts carrying enough detail to recreate business logic in the listener, stop and promote the reusable logic into authored state or a shared runtime seam first
- [ ] do not create parallel bridge events with overlapping purpose when one documented family can be extended without obscuring ownership
- [ ] if a bridge payload includes DOM ids, family names, or target kinds, record whether those fields are stable contract or temporary adapter detail; do not let later slices infer that distinction from listener code alone

#### External choreography warnings

- do not hide request ordering, fan-out, or retry semantics inside anonymous helper loops when that choreography is the real product behavior under migration
- do not treat `refresh()`, `host-refresh`, or similar follow-up hooks as proof that a flow is generic; record which semantic outcome triggers the refresh and which state owner it is synchronizing
- do not collapse multiple distinct semantic outcomes into one "submit and refresh" bucket if the downstream state owners differ
- do not let bridge events carry unnamed ad hoc payloads; if the payload shape matters to later slices, record that shape here when the bridge is introduced
- do not let page-local closures remain the only place where edit mode, selection mode, or proposal/activation mode transitions are explained
- do not assume embedded authored runtime transport can keep using raw relative URLs forever; if a surface must also boot under embedded/browser-proof hosts, keep URL resolution in the shared runtime seam so the surface does not regress under `page.setContent(...)`-style execution

#### State-owner mapping

When deciding where an interaction outcome should land, use this ownership mapping:

- [ ] `frontendProgram` or authored semantic action owns user-facing flow transitions, form submits, button actions, URL changes, and other page/app behavior
- [ ] witnessed/process state owns durable domain transitions that should be inspectable or replayable outside one DOM session
- [ ] runtime state store owns transient UI/runtime mechanics such as local expansion state, hover state, viewport state, drag state, and temporary async status
- [ ] server resources own persistent multi-session state and validation outcomes
- [ ] page-local closures should not become a fifth hidden state owner

#### Host-bridge contract

When authored flows need help from a containing page shell, the bridge must remain explicit and thin:

- [x] authored semantic actions may use shared generic frontend ops such as `dispatchDomEvent`, `navigate`, and `setQueryParam`
- [x] the current generic host-bridge path is `dispatchDomEvent`, which allows authored programs to name a host event and payload without reclaiming submit/click ownership in page-local JS
- [ ] host listeners should act as adapters that translate one named semantic outcome into one existing shell/runtime capability; they should not become a second hidden controller for the whole page
- [ ] when a host listener exists, record the producer action, event name, receiving adapter, and remaining reason it cannot yet collapse into a shared runtime seam
- [ ] do not encode endpoint choreography, edit-mode branching, or product validation logic inside host listeners just because the listener is now "generic"
- [ ] if multiple authored actions start dispatching the same host event, document the expected contract and payload shape here before expanding that pattern further
- [ ] do not use `dispatchDomEvent` as a generic escape hatch for arbitrary page scripting; if the receiving behavior is broadly reusable, promote it into a shared runtime op instead
- [ ] do not let host listeners become the hidden owner of external state changes simply because the initiating click or submit is now authored
- [ ] if a host action can target the current URL, document whether the contract expects assign-style navigation, reload semantics, or explicit shell handoff; same-URL navigation inside embedded shells is a recurring drift trap

#### Event extraction warnings

- do not replace direct DOM handlers with a page-local helper layer that still hard-codes product endpoint paths and state transitions
- do not treat `fetch(...)`, `postJson(...)`, or `window.location = ...` calls embedded in page modules as an acceptable long-term semantic contract
- do not let authored forms rely on follow-up imperative DOM repair to become valid after submit; the resulting state should come back through the declared state owner
- do not leave keyboard shortcuts, selection changes, or mode toggles undocumented just because they are not form submissions
- when a direct-manipulation runtime emits semantic outcomes, name the outcome explicitly and document where the resulting state lands

Allowed temporary exceptions:

- low-level gesture capture, geometry, drag/drop, and viewport math may remain local runtime code when they are genuinely engine mechanics
- transient DOM helpers that repopulate authored selects/lists from seeded state are acceptable only as a temporary bridge while their semantic trigger path is being extracted
- direct DOM listeners are acceptable only when they are clearly bridging into a shared semantic action path rather than owning product behavior themselves

#### Required shared runtime seams before broader page extraction

The next migrations should assume these shared seams are the correct place to add capability rather than recreating them per page:

- [x] add generic semantic `change` event binding in `plugins/inspect/widget-page.js` for authored controls such as select, range, and checkbox
- [x] add generic semantic `input` event binding in `plugins/inspect/widget-page.js` for authored text-entry controls so text input no longer requires page-local listeners just to expose semantic typing events
- [x] add generic semantic `keydown` event binding in `plugins/inspect/widget-page.js` for authored keyboard shortcuts, including root-scoped page shortcuts
- [x] allow embedded authored runtimes to disable process-event recording generically through config when their host page has not yet adopted the process trace route contract
- [x] add shared `navigate` frontend op support in `src/runtime-host-route-factory.js`, `src/runtime-builtins.js`, and the widget-page runtime so authored programs can own URL changes
- [x] add generic `setQueryParam` support in `plugins/inspect/widget-page.js`, `src/runtime-host-route-factory.js`, and `src/runtime-builtins.js` so authored flows can mutate current-page query state without bespoke page-local URL handlers
- [x] add generic authored `readForm(...)` checkbox coercion in `plugins/inspect/widget-page.js` so authored forms can opt into real boolean payloads for checkbox fields instead of page-local `boolValue(...)` transforms
- [x] add generic `dispatchDomEvent` support in `plugins/inspect/widget-page.js`, `src/runtime-host-route-factory.js`, and `src/runtime-builtins.js` so embedded authored runtimes can request host-page adapter work without inventing page-specific runtime ops
- [x] keep shared WTOML/apply-path coverage aligned with renderer-supported widget sections by adding native runtime declaration support for `label`, `textarea`, `details`, `summary`, and `valueEditor` in `src/desire/apply.js`, then re-prove that parity in `test/dsl.test.js`
- [x] extend `renderCollection(...)` to accept either a state-path string or a direct interpolated array value
- [x] add an explicit runtime-supported way to assign dynamic instance widget ids for repeated templates while keeping template ids stable for lookup
- [x] keep these seams generic; do not add `process-view`-specific or `bootstrap`-specific variants of them

#### Hard-coded product behavior: `bootstrap-shell`

Observed shape:

- `plugins/bootstrap/bootstrap-shell.js` now renders the extracted bootstrap authoring controls through authored `WTOML` helper renderers rather than keeping the create-form markup inline; the previously residual `context-form`, `perspective-form`, `widget-form`, `program-form`, `step-form`, `route-form`, `serve-form`, and `runner-form` are no longer hard-coded in the returned document string
- `plugins/bootstrap/bootstrap-shell.js` no longer owns `bindCreate(...)`; create-form request shaping and submit/reset/refresh follow-up now live in `plugins/bootstrap/bootstrap-app-authoring-submit.js`
- the page-level reread choreography for `/api/bootstrap-model`, `/api/bootstrap-state`, `/api/session`, desktop shell state, runtime-plugin review reload, tutorial progress reload, and the `render(); await requestMaybeAdvanceTutorial(); render();` sequence now lives in `plugins/bootstrap/bootstrap-refresh-runtime.js`
- the starter/desktop/form-access wrapper sync/apply projection is no longer shell-local; those view owners now live in the extracted helper seams already named in this audit
- the direct `witness:bootstrap-proposal-adjacent-submit` listener is no longer shell-local; submit registration now lives in `plugins/bootstrap/bootstrap-proposal-adjacent-submit.js` through `bindBootstrapProposalAdjacentSubmit(...)`
- the thin tutorial state/controller/host adapter assembly is no longer shell-local; that bootstrap-specific assembly now lives in `plugins/bootstrap/bootstrap-tutorial-runtime.js`
- the final render/runtime sequencing that used to stay inline in `render()` is no longer shell-local; that bootstrap-specific render pipeline now lives in `plugins/bootstrap/bootstrap-shell-render-runtime.js`
- direct review and route-authoring change listeners are now bound through their extracted seams in `plugins/bootstrap/bootstrap-runtime-plugin-review-sync.js` and `plugins/bootstrap/bootstrap-route-authoring-sync.js`

Audit conclusion:

- bootstrap now has a real authored action/event layer for the extracted top-card submit/click flows
- the page module is no longer the owner of every bootstrap interaction, but it still owns the full bootstrap HTML document shell plus the helper/runtime wiring that composes the remaining page adapter
- this is the clearest case where product interactions should move into authored program/action definitions

#### Mixed direct-manipulation and product behavior: `canvas-page`

Observed shape:

- `plugins/canvas/canvas-page.js` has `47` event bindings and `15` network/stream calls
- `plugins/canvas/canvas-page.js:742`, `:826`, `:895`, `:940`, `:950`, `:962` are genuine engine-level pointer/wheel/drag/drop mechanics and should remain runtime code
- `plugins/canvas/canvas-page.js:1812` through `:1891` bind login, logout, perspective switch, create thing, mode switch, undo/redo, and timeline controls directly in the page module
- `plugins/canvas/canvas-page.js:742` through `:959` also translate gestures directly into product operations such as `canvas.createThing`, `canvas.relate`, move/resize queueing, and selection changes

Audit conclusion:

- low-level gestures are correctly runtime-local
- semantic outcomes are not exposed through a shared authored contract
- toolbar and timeline actions should be extracted first
- gesture outcomes should gain named semantic events even if the gesture plumbing stays in JS

#### Hard-coded panel semantics: `eden-page`

Observed shape:

- `plugins/eden/eden-page.js` has `57` event bindings and `42` network/stream calls
- major panel actions are hard-coded inline:
  - `plugins/eden/eden-page.js:2692` personal login
  - `plugins/eden/eden-page.js:2711` personal widget save
  - `plugins/eden/eden-page.js:2762` edit login
  - `plugins/eden/eden-page.js:2782` theme apply
  - `plugins/eden/eden-page.js:2850` create context
  - `plugins/eden/eden-page.js:2862` grant stewardship
  - `plugins/eden/eden-page.js:2875` create proposal
  - `plugins/eden/eden-page.js:2887` approve proposal
  - `plugins/eden/eden-page.js:2990` inspect process
  - `plugins/eden/eden-page.js:3131` publish version
- the same module mutates `state.session`, `surface.runtime`, and triggers `render()` / refresh helpers directly after actions
- `plugins/eden/eden-page.js:3374` through `:3407` are genuine camera and shortcut runtime behavior

Audit conclusion:

- Eden mixes runtime interaction mechanics with authored product semantics in one place
- panel-level behavior should move into authored actions/events
- camera pan/zoom and direct manipulation can stay in code, but their meaningful outcomes should be surfaced semantically

#### Mixed reusable observer plus hard-coded controls: `tutorial-app-client`

Observed shape:

- `plugins/tutorial/tutorial-app-client.js` already observes generic page `click` and `submit` activity
- the overlay DOM skeleton is now helper-owned in `plugins/tutorial/tutorial-overlay-dom.js`
- disabled-scope row rendering is now helper-owned in `plugins/tutorial/tutorial-disabled-scopes-view.js`
- disabled-scope toggle/close/delegated panel actions are now helper-owned in `plugins/tutorial/tutorial-disabled-scopes-actions.js`
- overlay button command wiring is now helper-owned in `plugins/tutorial/tutorial-overlay-actions.js`
- overlay drag positioning and pointer listener binding are now helper-owned in `plugins/tutorial/tutorial-overlay-drag.js`
- tutorial-local state/render choreography outside those seams still remains hard-coded inside `plugins/tutorial/tutorial-app-client.js`

Audit conclusion:

- tutorial progress observation is generic and reusable
- tutorial command controls are still page-local product behavior
- the overlay should eventually consume a shared action vocabulary instead of owning each command directly

#### Low-debt seams

- `plugins/inspect/process-view.js:310` only binds replay range change to URL state; low priority
- `src/desktop-launcher-page.js:184` and `:211` directly call desktop bridge actions; low priority

### Current problems confirmed by audit

- event exposure is inconsistent across pages
- only `widget-page.js` currently provides a reusable semantic event model
- bootstrap, Eden, and canvas still define product-significant interactions in page-local JS
- local modules often mutate state immediately after DOM events without routing through an authored event contract
- direct-manipulation runtimes do not consistently expose semantic outcomes separately from gesture code

### Recommended event model

#### 1. Authored intent layer

- [ ] expand the `frontendProgram` / semantic event pattern already present in `widget-page.js`
- [ ] define user-visible interactions in authored form where possible: submit, click action, select item, open detail, change mode, scrub timeline, inspect node
- [ ] model these as stable semantic actions/events rather than raw DOM callbacks
- [ ] keep page composition responsible for declaring what interactions exist, not for hard-coding how the DOM is wired

#### 2. Runtime binding layer

- [ ] let the runtime bind DOM events to authored actions through a shared event adapter
- [ ] centralize common bindings such as `click`, `submit`, `input`, `change`, and keyboard shortcuts
- [ ] keep low-level pointer and canvas gestures in code, but expose their semantic outcomes through stable events

#### 3. State transition layer

- [ ] route interaction outcomes into the correct state owner: `frontendProgram`, process graph, witnessed events, or runtime state store
- [ ] prevent page-local handlers from becoming the hidden source of truth for app behavior
- [ ] make inspectable state transitions explicit so the world can explain why the UI changed

### Event extraction priorities

- [ ] convert `bootstrap-shell` form/button actions to authored semantic actions instead of direct `postJson(...)` bindings
- [ ] convert Eden panel actions to authored semantic actions instead of panel-local endpoint handlers
- [ ] extract canvas toolbar and timeline controls into authored actions while keeping pointer/gesture code in runtime code
- [ ] define named semantic outcomes for canvas gestures: selection change, node move, node resize, relation create intent, camera change, history scrub
- [ ] define named semantic outcomes for Eden interactions: session change, panel open, inspect mode toggle, proposal action, theme apply, version publish
- [ ] move inspect overlays in `widget-page.js` onto the same semantic action vocabulary used by the generic widget runtime
- [ ] document which interactions remain intentionally runtime-local because they are pure rendering mechanics

### Event/state stop conditions

- [ ] if an interaction still needs a page-local DOM listener after extraction, document the reason and the intended eventual state owner in the same change
- [ ] if a listener directly calls endpoint helpers such as `postJson(...)`, `patchJson(...)`, `deleteJson(...)`, or mutates `window.location`, do not call the interaction extracted unless the listener is clearly just bridging into a shared semantic action path
- [ ] if a migration introduces a new semantic action family, document its owner, expected inputs, and expected state destination before reusing it across pages
- [ ] if runtime-local gesture code changes durable product state, name the resulting semantic outcome explicitly even if the gesture plumbing remains local

### Event ownership rule

- [ ] authored surfaces should declare interaction affordances
- [ ] shared runtimes should translate browser events into authored/runtime actions
- [ ] process/state systems should own durable state transitions
- [ ] local JS should not be the only place where product-significant interactions are defined

## Recommended Migration Order

- [x] prove the pattern on `backend-seams-page` using `WTOML` widgets plus authored repeated collections
- [x] move `process-view` to authored widgets/templates and keep the process-graph projection in JS
- [ ] extract `bootstrap-shell` into authored page plus `frontendProgram` flows
- [x] extract a shared theme token contract before further page migrations
- [x] extract primitive surface styles before refitting larger shells
- [x] extract a shared event/action contract before further page migrations that add new interaction behavior
- [ ] split `canvas-page` into authored chrome and a JS canvas engine
- [ ] split `eden-page` into authored surfaces plus a small Eden interaction runtime

## Historical slice notes

Historical slice-by-slice notes were intentionally removed. Use the current handoff snapshot, the current frontier sections, and the bootstrap execution contract snapshot as the live execution brief.

### Current starter residual debt

The dedicated starter browser proof is green again, but there is still residual ownership debt to keep explicit so later unattended passes do not overclaim extraction progress.

- [x] the previous app-open regression is resolved: the dedicated browser proof `cmd /c node --test --test-name-pattern="blank world can bootstrap into a working todo app purely through the UI" test\\ui.bootstrap.test.js` now passes again
- [x] the tutorial-owned starter blueprint asset now lives in `plugins/tutorial/todo-starter-blueprint.json`, and `todoStarterBlueprint()` in `plugins/tutorial/tutorials.js` is reduced to a thin live loader that returns a fresh clone per call
- [x] bootstrap no longer manually injects the tutorial-owned blueprint into the starter seam; `buildBootstrapStarterPlan(...)` now loads the live starter blueprint asset by default while the shell injects only `bootstrapModel` and `bootstrapState`
- [x] the real starter request order now lives in authored `requestPlan` rows inside `plugins/tutorial/todo-starter-blueprint.json`, and `buildBootstrapStarterPlan(...)` interprets those rows instead of hard-coding the request sequence locally
- [x] starter existing-state elision now lives in authored `skipIfPresentIn` plus `matchField` request-plan rows inside `plugins/tutorial/todo-starter-blueprint.json`, and `buildBootstrapStarterPlan(...)` now interprets those rows generically instead of hard-coding `existingContext` / `existingRunner` branches
- [x] starter host-owner remapping and activation-body shaping no longer live as starter-specific `bodyMap` branches inside `plugins/bootstrap/bootstrap-starter-plan.js`; the live blueprint now supplies generic placeholder and `pickFields` intent while the helper interprets those mechanics generically
- [x] starter/open-app host-action binding plus action-family meaning now live in `plugins/bootstrap/bootstrap-host-actions.js`, injected into the live shell/browser runtime through `renderBootstrapHostActionFactory()`, rather than remaining embedded directly in `plugins/bootstrap/bootstrap-shell.js`
- [x] starter success refresh binding plus source allow-list routing now live in `plugins/bootstrap/bootstrap-host-refresh.js`, injected into the live shell/browser runtime through `renderBootstrapHostRefreshFactory()`, rather than remaining embedded directly in `plugins/bootstrap/bootstrap-shell.js`
- [x] starter button enable/disable projection now lives in `plugins/bootstrap/bootstrap-starter-controls-view.js`, injected into the live shell/browser runtime through `renderBootstrapStarterControlsViewFactory()`, rather than remaining embedded directly in `plugins/bootstrap/bootstrap-shell.js`
- [x] starter app-home reread/same-URL navigation policy now lives in `plugins/bootstrap/bootstrap-host-navigation.js`, injected into the live shell/browser runtime through `renderBootstrapHostNavigationFactory()`, rather than remaining embedded directly in `plugins/bootstrap/bootstrap-shell.js`
- [x] starter no longer keeps a unique shell-local post-create follow-up path; the previous refresh-binding, host-action, navigation, and button-disabled owners now all have explicit shared or authored seams
- do not treat the starter slice as proof that broader bootstrap projection cleanup is complete; the authored trigger path, live blueprint asset, authored request order, authored skip/pick rules, explicit host refresh, explicit host-action bridge, shared host-refresh seam, shared host-action seam, shared same-URL handoff policy, shared starter control-view seam, shared desktop control-view seam, and shared form-access seam are proven here, but other bootstrap-specific submit/help/option projection still remains local

### Bootstrap residual local-state warnings

The remaining bootstrap debt is not just "more forms". The following local-state patterns are the current places most likely to cause unattended drift if they are migrated casually.

- as of 2026-06-14, the exact residual shell-local owners are narrower than the earlier create-form frontier: the full bootstrap HTML document shell, helper/runtime construction order, live request/post helpers, residual DOM write wrappers such as the runtime-plugin review detail mount, and the remaining binder/wiring layer that composes extracted seams into the page adapter
- identity edit mode now depends on the shared `initialStateScriptId`/`initialStateInto` + authored `load` + edit-path `refreshProjection()` contract; preserve that projection-driven seam rather than moving identity prefill/disable behavior back into bootstrap-local DOM patching
- `bindCreate(...)` and the remaining page-local submit/click helpers prove that many flows share a shape, but that is evidence for shared semantic/program extraction rather than justification for keeping the page module as the owner
- `create-todo-starter` no longer owns the starter blueprint semantics inline, no longer hard-codes the real request order locally, no longer keeps starter-specific skip/remap branching in `buildBootstrapStarterPlan(...)`, no longer keeps app-home reread/same-URL policy embedded directly in the shell, no longer keeps the host-action bridge/binding or action-family meaning embedded directly in the shell, no longer keeps refresh binding embedded directly in the shell, and no longer keeps the starter button-disabled rule embedded directly in `render()`, but bootstrap still keeps broader page-shell composition and helper wiring local; do not count the authored top-card button extraction, starter-plan helper seam, host-navigation helper seam, host-action helper seam, host-refresh helper seam, starter control-view seam, desktop control-view seam, form-access seam, tutorial-runtime seam, or shell-render-runtime seam as proof that the full bootstrap page is generic
- broader backend article choreography still remains bootstrap-local even after the backend authoring trio moved unless the remaining multi-form refresh/order/state-owner rules are also reduced to authored state or a clearly documented thin adapter
- backend activate/rollback option/help/disabled application, backend authoring option/fallback projection, and backend render-time authoring-before-version sync/apply ordering no longer live inline in `render()` or the raw backend sync listeners, but broader backend article sequencing still remains local; do not count the backend control-view seams or `runBootstrapBackendControlsRender(...)` as proof that backend article ownership is already generic
- the previous proposal-adjacent shell-local `state` boundary is gone, but the broader state/live-runtime boundary in `plugins/bootstrap/bootstrap-controls-runtime.js` still remains a real owner; do not let later slices quietly push proposal-adjacent semantics back into that runtime-construction layer
- proposal-adjacent sync now depends on event-time dependency resolution through `createBootstrapControlsRuntimeFromBootstrap(...)`, `createBootstrapProposalAdjacentSyncDepsBuilder(...)`, and `createBootstrapLiveStateReaders(...)`; if a later slice captures proposal-adjacent state or current DOM reads once during initial binding, expect stale options/help text and treat that as a regression even if the bridge event name stayed the same
- scoped dependent-select recompute now depends on event-time dependency resolution through `createBootstrapControlsRuntimeFromBootstrap(...)`, `createBootstrapScopedControlsSyncDepsBuilder(...)`, and `createBootstrapLiveStateReaders(...)`; if a later slice captures scoped state or current DOM reads once during initial binding, expect stale scoped options/help/disabled state and treat that as a regression even if the bridge event name stayed the same
- the previous scoped shell-local `state` boundary is gone, but the broader state/live-runtime boundary in `plugins/bootstrap/bootstrap-controls-runtime.js` still remains a real owner; do not let later slices quietly push scoped semantics back into that runtime-construction layer
- direct runtime-plugin install, direct MCP server create, and direct MCP tool install no longer keep submit ownership in shell-local `bindCreate(...)`, but they do still depend on the explicit authored `witness:bootstrap-runtime-integration-direct-submit` bridge plus the shared `plugins/bootstrap/bootstrap-runtime-integration-direct-submit.js` write seam; do not mistake that reduction for full runtime-integration extraction while broader bootstrap write choreography still remains elsewhere
- direct MCP payload quirks remain part of the live contract even after submit extraction: blank `mcp-server` fields are still stripped before POST, `mcp-tool-install` still defaults `actingMode` to `"delegated"`, and blank `scopeContextsJson` / `scopeTargetsJson` are still coerced to `"[]"`; later changes must either preserve those exact rules explicitly or replace them with an audited contract change
- the direct submit seam is now also a browser-factory serialization risk surface; if `renderBootstrapRuntimeIntegrationDirectSubmitFactory()` starts closing over module-scope helpers again, expect browser-only failures even when source/unit proof stays green
- backend browser helpers now have the same serialization risk surface: `renderBootstrapBackendVersionControlsViewFactory()` must stay self-contained and must not re-emit helper declarations already injected by `renderBootstrapVersionGuidanceFactory()`, or the browser runtime will fail with duplicate identifier errors even when source/unit proof stays green
- bootstrap widget creation still contains a local `tutorialTarget -> id` default to satisfy the active tutorial type-model contract; preserve that contract during later widget-authoring extraction rather than rediscovering it through failing browser proof
- forms that currently call `refresh()` after submit are not automatically "generic"; the owning authored/program path must still make the post-submit state transition explicit
- remove-form and proposal-form slices should preserve their current selector and status-message contracts instead of collapsing them into one anonymous action bucket
- if a remaining bootstrap flow needs a temporary bridge listener, document the exact semantic action it is bridging toward and the reason the bridge still exists
- if a remaining bootstrap flow exposes a new external click, input, change, or submit trigger, give it one explicit owner up front: authored semantics, a named `witness:*` bridge with documented payload, or a thin host adapter; do not hide new external state changes inside anonymous page-local callbacks

### Bootstrap execution contract snapshot

This section exists so a later unattended pass does not have to reverse-engineer the current bootstrap seam from `plugins/bootstrap/bootstrap-shell.js`.

- [x] authored backend authoring controls currently live in `plugins/bootstrap/bootstrap-backend-authoring-controls.wtoml`
- [x] authored proposal-adjacent runtime-plugin/MCP proposal controls currently live in `plugins/bootstrap/bootstrap-proposal-adjacent-controls.wtoml`
- [x] authored scoped create controls currently live in `plugins/bootstrap/bootstrap-scoped-controls.wtoml`
- [x] authored scoped remove controls currently live in `plugins/bootstrap/bootstrap-remove-controls.wtoml`
- [x] authored starter controls currently live in `plugins/bootstrap/bootstrap-starter-controls.wtoml`
- [x] starter request-plan choreography now lives in `plugins/bootstrap/bootstrap-starter-plan.js`, which loads the tutorial-owned blueprint from `plugins/tutorial/todo-starter-blueprint.json` by default, interprets authored `requestPlan` rows there for the real request order plus `skipIfPresentIn` / `matchField` / `pickFields` rules, and now receives only the current `bootstrapModel` and `bootstrapState` from `plugins/bootstrap/bootstrap-shell.js`
- [x] backend authoring control-view build/apply choreography now lives in `plugins/bootstrap/bootstrap-backend-authoring-controls-view.js` and reaches the browser runtime through `renderBootstrapBackendAuthoringControlsViewFactory()` in `plugins/bootstrap/bootstrap-shell.js`
- [x] backend authoring option/fallback projection now also lives in `plugins/bootstrap/bootstrap-backend-authoring-controls-view.js` through `buildBootstrapBackendAuthoringControlsProjection(...)`, while current form reads now flow through the shared backend sync/dependency seam instead of a shell-local backend state slot
- [x] authored backend version controls currently live in `plugins/bootstrap/bootstrap-backend-version-controls.wtoml`
- [x] backend version control-view build/apply choreography now lives in `plugins/bootstrap/bootstrap-backend-version-controls-view.js` and reaches the browser runtime through `renderBootstrapBackendVersionControlsViewFactory()` in `plugins/bootstrap/bootstrap-shell.js`
- [x] backend activate/rollback option/guidance projection now also lives in `plugins/bootstrap/bootstrap-backend-version-controls-view.js` through `buildBootstrapBackendVersionControlsProjection(...)`, and that browser seam must stay self-contained because `renderBootstrapVersionGuidanceFactory()` is already injected separately on the same page
- [x] governed backend/widget proposal target summary state wiring now also lives in `plugins/bootstrap/bootstrap-version-guidance.js` through `summarizeGovernedProposalTargetFromBootstrap(...)`, and `plugins/bootstrap/bootstrap-shell.js` now consumes that seam instead of keeping backend/widget row selectors plus authority-summary stitching inline beside proposal control view sync/apply
- [x] backend control sync registration now also lives in `plugins/bootstrap/bootstrap-controls-sync.js` through `bindBootstrapBackendAuthoringControlsSync(...)` and `bindBootstrapBackendVersionControlsSync(...)`, and `plugins/bootstrap/bootstrap-shell.js` now consumes those seams instead of keeping the raw backend listener bodies inline
- [x] backend transient authoring/version state sync/apply ownership now also lives in `plugins/bootstrap/bootstrap-controls-sync.js` through `syncBootstrapBackendAuthoringControlsState(...)`, `applyBootstrapBackendAuthoringControlsState(...)`, `syncBootstrapBackendVersionControlsState(...)`, and `applyBootstrapBackendVersionControlsState(...)`, and `plugins/bootstrap/bootstrap-shell.js` now consumes that seam instead of keeping backend-specific view-state slots and wrapper functions inline
- [x] backend live dependency-packet construction now also lives in `plugins/bootstrap/bootstrap-controls-sync.js` through `buildBootstrapBackendControlsSyncDeps(...)` and `createBootstrapBackendControlsSyncDepsBuilder(...)`, while the broader shared bootstrap runtime owner in `plugins/bootstrap/bootstrap-controls-runtime.js` now exposes `buildBackendControlsSyncDeps` beside the proposal-adjacent, scoped, direct runtime-integration, and capability runtime builders
- [x] backend render-time authoring/version sequencing now also lives in `plugins/bootstrap/bootstrap-controls-sync.js` through `runBootstrapBackendControlsRender(...)`, and `plugins/bootstrap/bootstrap-shell.js` now consumes that seam instead of sequencing backend sync/apply calls directly inside `render()`
- [x] scoped control-view build/apply choreography now lives in `plugins/bootstrap/bootstrap-scoped-controls-view.js` and reaches the browser runtime through `renderBootstrapScopedControlsViewFactory()` in `plugins/bootstrap/bootstrap-shell.js`
- [x] scoped sync registration, state sync/apply orchestration, and live dependency-packet construction now also live in `plugins/bootstrap/bootstrap-scoped-controls-sync.js` through `bindBootstrapScopedControlsSync(...)`, `syncBootstrapScopedControlsState(...)`, `applyBootstrapScopedControlsState(...)`, `runBootstrapScopedControlsSync(...)`, `buildBootstrapScopedControlsSyncDeps(...)`, and `createBootstrapScopedControlsSyncDepsBuilder(...)`, and `plugins/bootstrap/bootstrap-shell.js` now consumes that seam instead of keeping `state.scopedControlsView`, `syncScopedControlsView()`, `applyScopedControlsView()`, the render-time scoped sync/apply pairing, and the scoped selector bundle inline
- [x] bootstrap live state-reader ownership now also lives in `plugins/bootstrap/bootstrap-live-state.js` through `createBootstrapLiveStateReaders(...)`, and both `plugins/bootstrap/bootstrap-proposal-adjacent-sync.js` and `plugins/bootstrap/bootstrap-scoped-controls-sync.js` now consume that seam instead of reaching into the raw shell `state` object directly for event-time authored/session/model/scoped-selector/runtime-integration reads
- [x] page-level bootstrap reread choreography now lives in `plugins/bootstrap/bootstrap-refresh-runtime.js` through `selectBootstrapRefreshReviewRunnerId(...)` and `runBootstrapRefresh(...)`, and `plugins/bootstrap/bootstrap-shell.js` now consumes that seam instead of inlining the `/api/bootstrap-model`, `/api/bootstrap-state`, `/api/session`, desktop-shell, runtime-plugin-review, tutorial-load, and render/advance/render sequence directly in `refresh()`
- [x] authored submit success currently signals page refresh through `witness:host-refresh`, and the shared `bindBootstrapHostRefresh(...)` seam in `plugins/bootstrap/bootstrap-host-refresh.js` now binds and routes that event family into `refresh()`
- [x] desktop button enable/disable projection now lives in `plugins/bootstrap/bootstrap-desktop-controls-view.js` and reaches the browser runtime through `renderBootstrapDesktopControlsViewFactory()` in `plugins/bootstrap/bootstrap-shell.js`
- [x] broad authored-form access gating now lives in `plugins/bootstrap/bootstrap-form-access-view.js` and reaches the browser runtime through `renderBootstrapFormAccessViewFactory()` in `plugins/bootstrap/bootstrap-shell.js`
- [x] starter button enable/disable projection now lives in `plugins/bootstrap/bootstrap-starter-controls-view.js` and reaches the browser runtime through `renderBootstrapStarterControlsViewFactory()` in `plugins/bootstrap/bootstrap-shell.js`
- [x] desktop/form/starter derived-view sync/apply ownership now also lives in `plugins/bootstrap/bootstrap-shell-view-state.js` through `syncBootstrapShellViewState(...)` and `applyBootstrapShellViewState(...)`, and `plugins/bootstrap/bootstrap-shell.js` now consumes that seam instead of keeping wrapper sync/apply functions inline
- [x] authored bootstrap app-authoring create forms now live in `plugins/bootstrap/bootstrap-app-authoring-controls.wtoml`; `plugins/bootstrap/bootstrap-shell.js` renders those authored roots for `context-form`, `perspective-form`, `widget-form`, `program-form`, `step-form`, `route-form`, `serve-form`, and `runner-form` instead of keeping their markup inline
- [x] bootstrap app-authoring create-form submit routing now lives in `plugins/bootstrap/bootstrap-app-authoring-submit.js` through `buildBootstrapAppAuthoringSubmitRequest(...)`, `runBootstrapAppAuthoringSubmit(...)`, and `bindBootstrapAppAuthoringSubmit(...)`, while `plugins/bootstrap/bootstrap-shell.js` now binds that seam instead of owning `bindCreate(...)`
- [x] route-authoring guidance recompute now lives in `plugins/bootstrap/bootstrap-route-authoring-sync.js` through `buildBootstrapRouteAuthoringView(...)`, `applyBootstrapRouteAuthoringView(...)`, `runBootstrapRouteAuthoringSync(...)`, `bindBootstrapRouteAuthoringSync(...)`, `buildBootstrapRouteAuthoringSyncDeps(...)`, and `createBootstrapRouteAuthoringSyncDepsBuilder(...)`; `plugins/bootstrap/bootstrap-app-authoring-controls.wtoml` now dispatches `witness:bootstrap-route-authoring-sync`, and `plugins/bootstrap/bootstrap-shell.js` now consumes that seam instead of keeping `updateRouteAuthoringFields()` plus the route-field listener loop inline
- [x] runtime-plugin review change/recompute ownership now lives in `plugins/bootstrap/bootstrap-runtime-plugin-review-sync.js` through `resolveBootstrapRuntimePluginReviewSelection(...)`, `loadBootstrapRuntimePluginReview(...)`, `selectBootstrapRuntimePluginReviewPlugin(...)`, and `bindBootstrapRuntimePluginReviewSync(...)`, and `plugins/bootstrap/bootstrap-shell.js` now consumes that seam instead of keeping direct review listeners inline
- [x] runtime-plugin review option-label, summary-text, and detail-block rendering now also live in `plugins/bootstrap/bootstrap-runtime-plugin-review-view.js` through `runtimePluginReviewRows(...)`, `runtimePluginReviewOptionLabel(...)`, `buildBootstrapRuntimePluginPreviewSummary(...)`, and `buildBootstrapRuntimePluginReviewView(...)`, and `plugins/bootstrap/bootstrap-shell.js` now consumes that seam instead of keeping the review display formulas inline
- [x] bootstrap state inventory row-label and changed-row rendering now also live in `plugins/bootstrap/bootstrap-state-list-render.js` through `renderBootstrapStateList(...)`, `mcpServerInventoryLabel(...)`, `mcpToolInventoryLabel(...)`, and `renderBootstrapStateInventory(...)`, and `plugins/bootstrap/bootstrap-shell.js` now consumes that seam instead of keeping the state-list render cluster inline
- [x] bootstrap render-time summary/status copy plus direct select-fill ownership now also live in `plugins/bootstrap/bootstrap-shell-render-view.js` through `buildBootstrapShellStatusView(...)`, `applyBootstrapShellStatusView(...)`, and `applyBootstrapShellSelectFill(...)`, and `plugins/bootstrap/bootstrap-shell.js` now consumes that seam instead of keeping those summary strings and direct `fillSelect(...)` calls inline
- [x] bootstrap tutorial runtime snapshot publication now also lives in `plugins/bootstrap/bootstrap-tutorial-runtime-view.js` through `buildBootstrapTutorialRuntimeView(...)`, and `plugins/bootstrap/bootstrap-shell.js` now consumes that seam instead of assembling `window.__witnessTutorial` inline
- [x] bootstrap tutorial state/controller/host adapter assembly now also lives in `plugins/bootstrap/bootstrap-tutorial-runtime.js` through `createBootstrapTutorialRuntime(...)`, and `plugins/bootstrap/bootstrap-shell.js` now consumes that seam instead of keeping the bootstrap-specific tutorial/runtime assembly inline
- [x] bootstrap proposal-adjacent submit registration now also lives in `plugins/bootstrap/bootstrap-proposal-adjacent-submit.js` through `bindBootstrapProposalAdjacentSubmit(...)`, and `plugins/bootstrap/bootstrap-shell.js` now consumes that seam instead of keeping the raw `witness:bootstrap-proposal-adjacent-submit` listener inline
- [x] bootstrap render/runtime sequencing now also lives in `plugins/bootstrap/bootstrap-shell-render-runtime.js` through `createBootstrapRenderRuntime(...)`, and `plugins/bootstrap/bootstrap-shell.js` now consumes that seam instead of sequencing the remaining render pipeline inline
- [x] the current focused proof set for the bootstrap render/view/tutorial slices is `cmd /c node --test plugins\\bootstrap\\bootstrap-shell-render-runtime.test.js plugins\\bootstrap\\bootstrap-tutorial-runtime.test.js plugins\\bootstrap\\bootstrap-tutorial-runtime-view.test.js plugins\\bootstrap\\bootstrap-shell-render-view.test.js plugins\\bootstrap\\bootstrap-state-list-render.test.js plugins\\bootstrap\\bootstrap-runtime-plugin-review-view.test.js plugins\\bootstrap\\bootstrap-refresh-runtime.test.js plugins\\bootstrap\\bootstrap-shell-view-state.test.js plugins\\bootstrap\\bootstrap.test.js plugins\\bootstrap\\bootstrap-route-authoring-sync.test.js plugins\\bootstrap\\bootstrap-runtime-plugin-review-sync.test.js plugins\\bootstrap\\bootstrap-app-authoring-submit.test.js plugins\\bootstrap\\bootstrap-proposal-adjacent-submit.test.js test\\bootstrap-shell-desktop.test.js` plus `cmd /c node --test --test-name-pattern="bootstrap tutorial reveals authored concepts as relevant steps become current|blank world can bootstrap into a working todo app purely through the UI|bootstrap UI shows authored runtime plugin review details and composition previews|bootstrap UI shows inline route handler guidance while authoring routes" test\\ui.tutorial.test.js test\\ui.bootstrap.test.js`
- [x] backend authoring dependent-select recompute currently signals through `witness:bootstrap-backend-authoring-sync`
- [x] proposal-adjacent runtime-plugin/MCP proposal submit currently signals through `witness:bootstrap-proposal-adjacent-submit`
- [x] proposal-adjacent help/option recompute now signals through `witness:bootstrap-proposal-adjacent-sync`
- [x] proposal-adjacent sync bridge family routing now lives in `plugins/bootstrap/bootstrap-proposal-adjacent-sync.js` and reaches the browser runtime through `renderBootstrapProposalAdjacentSyncFactory()` in `plugins/bootstrap/bootstrap-shell.js`
- [x] proposal-adjacent sync registration now also lives in `plugins/bootstrap/bootstrap-proposal-adjacent-sync.js` through `bindBootstrapProposalAdjacentSync(...)`, and `plugins/bootstrap/bootstrap-shell.js` now consumes that seam instead of keeping the raw `window.addEventListener("witness:bootstrap-proposal-adjacent-sync", ...)` body inline
- [x] proposal-adjacent live dependency-packet construction now also lives in `plugins/bootstrap/bootstrap-proposal-adjacent-sync.js` through `buildBootstrapProposalAdjacentSyncDeps(...)`, `createBootstrapProposalAdjacentSyncDepsBuilder(...)`, and `createBootstrapProposalAdjacentSyncDepsBuilderFromBootstrap(...)`, and `plugins/bootstrap/bootstrap-shell.js` now consumes that seam instead of keeping the inline `buildDeps: () => ({ ... })` closure
- [x] runtime-plugin availability and MCP inventory selectors now also live in `plugins/bootstrap/bootstrap-runtime-integration-state.js` through `buildBootstrapRuntimeIntegrationState(...)`, and both the direct shell runtime-plugin/MCP option-help helpers plus the shared proposal-adjacent dep-builder now consume that seam through `liveState.runtimeIntegrationState()` instead of keeping inline selector functions or a shell-local runtime-integration wrapper
- [x] proposal-adjacent control-view build/apply choreography now lives in `plugins/bootstrap/bootstrap-proposal-adjacent-controls-view.js` and reaches the browser runtime through `renderBootstrapProposalAdjacentControlsViewFactory()` in `plugins/bootstrap/bootstrap-shell.js`
- [x] proposal-adjacent control-view state sync/apply orchestration now also lives in `plugins/bootstrap/bootstrap-proposal-adjacent-sync.js`, which reaches the browser runtime through `renderBootstrapProposalAdjacentSyncFactory()` and owns both family-by-family event recompute/application and render-time full refresh against a transient shared view object rather than a shell-local state slot
- [x] bootstrap no longer owns a shell-local `proposalAdjacentControlsView` state slot; the transient proposal-adjacent view now stays inside the shared sync/apply seam
- [ ] proposal-adjacent help/option recompute still depends on the broader shared runtime-construction owner in `plugins/bootstrap/bootstrap-controls-runtime.js`; that owner now supplies `buildProposalAdjacentSyncDeps`, and every future slice should describe any change to that remaining state/live-runtime packet explicitly
- [x] scoped dependent-select recompute currently signals through exactly one host bridge event, `witness:bootstrap-dependent-select-sync`, including the stewardship target-kind family
- [x] backend guidance recompute currently signals through `witness:bootstrap-backend-help-sync`
- [x] proposal guidance recompute currently signals through `witness:bootstrap-proposal-create-help-sync` and `witness:bootstrap-proposal-approve-help-sync`
- [x] proposal guidance sync registration, transient proposal control state sync/apply ownership, and proposal live dependency-packet construction now also live in `plugins/bootstrap/bootstrap-proposal-controls-sync.js` through `bindBootstrapProposalControlsSync(...)`, `syncBootstrapProposalControlsState(...)`, `applyBootstrapProposalControlsState(...)`, `runBootstrapProposalControlsSync(...)`, `buildBootstrapProposalControlsSyncDeps(...)`, and `createBootstrapProposalControlsSyncDepsBuilder(...)`, while the broader shared bootstrap runtime owner in `plugins/bootstrap/bootstrap-controls-runtime.js` now exposes `buildProposalControlsSyncDeps`
- [x] bootstrap no longer owns a shell-local `proposalControlsView` state slot; pure proposal create/review view formulas live in `plugins/bootstrap/bootstrap-proposal-controls-view.js`, and the shell now consumes the shared proposal sync/state/runtime seam instead of keeping proposal-specific wrapper functions inline
- [x] governed backend/proposal version guidance helpers now live in `plugins/bootstrap/bootstrap-version-guidance.js` and reach the browser runtime through `renderBootstrapVersionGuidanceFactory()` in `plugins/bootstrap/bootstrap-shell.js`
- [x] proposal-adjacent runtime-plugin/MCP proposal body helpers now live in `plugins/bootstrap/bootstrap-proposal-adjacent.js` and reach the browser runtime through `renderBootstrapProposalAdjacentFactory()` in `plugins/bootstrap/bootstrap-shell.js`
- [x] proposal-adjacent submit choreography now lives in `plugins/bootstrap/bootstrap-proposal-adjacent-submit.js` and reaches the browser runtime through `renderBootstrapProposalAdjacentSubmitFactory()` in `plugins/bootstrap/bootstrap-shell.js`
- [x] runtime-plugin and MCP control help/submit-disabled helpers now live in `plugins/bootstrap/bootstrap-runtime-integration-controls-view.js` and reach the browser runtime through `renderBootstrapRuntimeIntegrationControlsViewFactory()` in `plugins/bootstrap/bootstrap-shell.js`
- [x] runtime-plugin and MCP option-projection helpers now live in `plugins/bootstrap/bootstrap-runtime-integration-options-view.js` and reach the browser runtime through `renderBootstrapRuntimeIntegrationOptionsViewFactory()` in `plugins/bootstrap/bootstrap-shell.js`
- [x] bootstrap helper render worlds now call `ensureRuntimeBuiltins(world)` before `applyWitnessToml(...)` so typed backend authored `readForm(schema=...)` steps have the shared runtime process/value definitions they rely on
- [x] `plugins/bootstrap/bootstrap-dom-helpers.js` is now consumed by the broader shared bootstrap controls runtime owner through `renderBootstrapDomHelpersFactory()` plus `createBootstrapDomHelpers({ document })`, and that live seam is re-proved through focused source/runtime tests and the proposal-adjacent browser proofs
- [ ] keep the shared bootstrap DOM helper seam mechanical only: DOM lookup, field lookup, select fill/apply, selected-value preservation, submit-disabled writes, and status-text writes are allowed there; bootstrap-specific option derivation, proposal semantics, endpoint choreography, refresh rules, and state-owner decisions must stay outside that helper
- [ ] event-time dependency resolution is currently part of the live bootstrap contract for recompute paths; if a future slice captures `liveState` results or DOM readers once during initial bind instead of resolving them through the current builder/listener seams at event time, treat that as a regression even if selectors and event names still match
- [ ] every new bootstrap host bridge or helper promotion must record whether it is live or draft, plus its producer `source`, payload fields, receiving seam, resulting state owner, and focused proof command, in this section during the same change

### Bootstrap things to notice during unattended work

This section is intentionally short. It is here to highlight things worth noticing during later non-stop passes, not to create more migration scope.

- Prefer one ownership move at a time. If a slice changes authored controls, bridge routing, and write choreography together, the baseline becomes hard to prove and easy to misread later.
- Name every external state change explicitly. `submit:*`, `click:*`, `input:*`, and `change:*` should land in authored semantics, a narrow `witness:*` bridge, or a thin host adapter rather than disappearing back into bootstrap-local callbacks.
- Treat `witness:*` bridges as recompute-only by default. If one is allowed to write, refresh, navigate, or call a host action, record that widened contract and its payload in the same change.
- Keep browser helper factories self-contained. A factory that closes over unserialized helpers, or re-emits helpers already injected elsewhere on the page, is a browser-only failure surface even when source/unit proof stays green.
- Preserve event-time freshness for recompute seams. If a later simplification captures `liveState` results or DOM reads once during bind instead of resolving them at event time, treat that as a regression.
- When a slice lands, update the current snapshot, the current frontier, and the execution contract snapshot together so the audit does not drift away from the code.

### Proposal-adjacent external state capture packet

The remaining proposal-adjacent work should preserve the following state-owner split. This packet exists so a later unattended slice does not "simplify" the flow by pushing product-significant state changes back into hard-coded local JS.

- [x] trigger owner for runtime-plugin and MCP proposal submission is the authored proposal-adjacent `WTOML` submit path, which currently dispatches `witness:bootstrap-proposal-adjacent-submit`
- [x] request owner for runtime-plugin and MCP proposal submission is the shared helper seam in `plugins/bootstrap/bootstrap-proposal-adjacent-submit.js`, not the page-local shell
- [x] external state owner for proposal submission is persistent proposal/bootstrap server state first, followed by an explicit reread through `refresh()` after success
- [x] success/reset owner for proposal submission is still explicit in the submit seam: status update, `form.reset()`, and `refresh()` are part of the documented proposal-adjacent submit choreography rather than hidden side effects
- [x] trigger owner for proposal-adjacent help/option recompute is now the authored proposal-adjacent `WTOML` change/input path, which dispatches `witness:bootstrap-proposal-adjacent-sync`
- [x] request owner for proposal-adjacent help/option recompute remains pure projection/help recompute through the shared sync bridge; the sync bridge does not perform proposal creation, host refresh, or unrelated server requests
- [x] state owner for proposal-adjacent help/option recompute remains explicit help/submit-disabled state or pure select-option projection; the sync bridge does not own persisted bootstrap state transitions
- [x] state owner for proposal-adjacent help/option recompute now remains a transient shared view object produced inside the shared sync seam; the shared sync seam routes families and owns recompute/application orchestration, the shared proposal-adjacent controls-view seam performs the family-specific build/apply choreography, and the broader shared bootstrap controls runtime owner now supplies the remaining live dependency packet
- [ ] live dependency owner for proposal-adjacent help/option recompute must remain explicit: `plugins/bootstrap/bootstrap-controls-runtime.js` now supplies the broader event-time `liveState`/`dom` packet consumed by `buildProposalAdjacentSyncDeps`, while the shared proposal-adjacent seam still owns recompute/application behavior; a later slice must either preserve that live-reader behavior or replace it with a documented stronger owner in the same change
- if those live dependency inputs narrow further, preserve event-time reads and writes in the remaining seam and keep `plugins/bootstrap/bootstrap-dom-helpers.js` mechanical; do not let it become the hidden owner of runtime-plugin/MCP/proposal semantics simply because it now touches the DOM
- refresh owner for proposal-adjacent submit must stay explicit after extraction; if a later slice narrows the reread path below `refresh()`, record the new state landing and reread owner here in the same change
- if a future slice introduces a second proposal-adjacent bridge event, document why the existing submit bridge cannot carry that responsibility without becoming semantically overloaded

### Scoped external state capture packet

The scoped slice now has both authored submit flows and a shared recompute bridge. Keep the owner split explicit so later unattended work does not merge transient option recompute with persistent external writes.

- [x] trigger owner for scoped option recompute is the authored `change` path on the scoped create/remove controls, which currently dispatches `witness:bootstrap-dependent-select-sync`
- [x] request owner for scoped option recompute is no network request; the shared `bindBootstrapScopedControlsSync(...)` / `runBootstrapScopedControlsSync(...)` seam only rebuilds transient scoped view state and reapplies options or submit-disabled state
- [x] transient state owner for scoped option recompute is the shared scoped sync seam plus `buildBootstrapScopedControlsView(...)` / `applyBootstrapScopedControlsView(...)`; that recompute path does not own persisted bootstrap mutations
- [x] trigger owner for scoped create/grant/revoke/remove external writes is the authored scoped `WTOML` submit path for `context-binding-form`, `context-export-form`, `context-import-form`, `stewardship-form`, `context-binding-remove-form`, `context-export-remove-form`, `context-import-remove-form`, and `stewardship-remove-form`
- [x] request owner for scoped create/grant/revoke/remove external writes is the authored runtime `postJson`/body-carrying `DELETE` path already wired for `/api/context-bindings`, `/api/context-exports`, `/api/context-imports`, and `/api/stewardships`, not a raw page-local submit listener
- [x] external state owner for scoped create/grant/revoke/remove writes is persistent bootstrap/server state first, followed by explicit reread through `witness:host-refresh` -> `bindBootstrapHostRefresh(...)` -> `refresh()`
- [ ] live dependency owner for scoped option recompute must remain explicit: `plugins/bootstrap/bootstrap-controls-runtime.js` now supplies the broader event-time `liveState`/`dom` packet consumed by `buildScopedControlsSyncDeps`, while the shared scoped seam still owns recompute/application behavior; later slices must preserve or replace that packet deliberately
- do not move scoped target/export/help/disabled formulas into anonymous change listeners or into `plugins/bootstrap/bootstrap-dom-helpers.js`; if a stronger shared owner is needed, extract and prove it as a named seam first

### Direct runtime-integration external state capture packet

The direct runtime-plugin and MCP install/create slice now has both shared recompute ownership and explicit authored/shared submit ownership. Preserve the following owner split unless the same change updates code, proof, and this file together.

- [x] trigger owner for direct runtime-plugin install, direct MCP server create, and direct MCP tool install is now the authored submit path in `plugins/bootstrap/bootstrap-runtime-integration-controls.wtoml`, which dispatches `witness:bootstrap-runtime-integration-direct-submit`
- [x] payload owner for direct runtime-plugin install is now `buildBootstrapRuntimeIntegrationDirectSubmitRequest({ detail })`, which still preserves the pass-through `{ serverRunner, plugin }` body for `/api/runtime-plugin-installs`
- [x] payload owner for direct MCP server create is now `buildBootstrapRuntimeIntegrationDirectSubmitRequest({ detail })`, which still preserves the blank-field omission rule before POST to `/api/mcp-servers`
- [x] payload owner for direct MCP tool install is now `buildBootstrapRuntimeIntegrationDirectSubmitRequest({ detail })`, which still preserves the body-defaulting rule before POST to `/api/mcp-tool-installs`: `actingMode` defaults to `"delegated"`, blank `scopeContextsJson` becomes `"[]"`, and blank `scopeTargetsJson` becomes `"[]"`
- [x] request owner for all three direct install/create flows is now `runBootstrapRuntimeIntegrationDirectSubmit(...)` in `plugins/bootstrap/bootstrap-runtime-integration-direct-submit.js`, which accepts the bridge detail packet and calls `postJson(...)`
- [x] external state owner for all three direct install/create flows is still persistent bootstrap/server state first, followed by an explicit reread through `refresh()` after success
- [x] success/reset owner for all three direct install/create flows is now the shared direct-submit seam: matching status node set to `"Saved."`, `form.reset()`, then `refresh()`
- [x] error owner for all three direct install/create flows is now the shared direct-submit seam writing `error.message` into the matching status node; if a later extraction changes error rendering semantics, record that change explicitly here
- [x] live dependency owner for direct help/option recompute remains the broader shared runtime owner in `plugins/bootstrap/bootstrap-controls-runtime.js` plus the shared direct recompute seam in `plugins/bootstrap/bootstrap-runtime-integration-direct-controls-sync.js`; do not merge that view-only owner with submit-side request ownership without documenting the new contract
- do not let `serviceIdentity`, `transportsJson`, `actingMode`, `scopeContextsJson`, or `scopeTargetsJson` semantics disappear into undocumented callback logic during later edits; whichever layer owns those request fields must stay named explicitly as the payload owner in the slice record
- if a later slice changes the direct submit bridge payload, status semantics, reread owner, or preserved DOM ids, record that contract change in the same change so later unattended work does not infer it from obsolete `bindCreate(...)` history

### Starter external state capture packet

The starter slice now has enough moving parts that unattended work should not infer its state routing from the browser proof alone. Preserve the following owner split unless the same change updates code, proof, and this file together.

- [x] trigger owner for starter creation is the authored `click:createBootstrapTodoStarter` path rendered from `plugins/bootstrap/bootstrap-starter-controls.wtoml`
- [x] request owner for starter creation is the shared starter-plan seam in `plugins/bootstrap/bootstrap-starter-plan.js`, executed by the shared authored runtime as a serial repeated `postJson` plan rather than by a page-local submit/click controller
- [x] blueprint owner for starter creation is now explicit and file-backed: `plugins/tutorial/todo-starter-blueprint.json` defines the current starter semantics, `todoStarterBlueprint()` in `plugins/tutorial/tutorials.js` is a thin live loader around that asset, and `buildBootstrapStarterPlan(...)` consumes that loader by default so the shell no longer has to thread blueprint ownership manually
- [x] external state owner for starter creation is persistent bootstrap/app/server state first, including the created context, runner, runtime-plugin installs, frontend/backend programs, routes, and serve mounts, followed by an explicit reread through `refresh()`
- [x] refresh owner for starter creation is the shared `witness:host-refresh` bridge emitted by the authored starter program and accepted by the shared `bindBootstrapHostRefresh(...)` seam for `bootstrap-starter-controls`
- [x] starter button-disabled view owner is the shared `buildBootstrapStarterControlsView(...)` / `applyBootstrapStarterControlsView(...)` seam in `plugins/bootstrap/bootstrap-starter-controls-view.js`, which now derives `appReady` / edit-gating button state instead of leaving that decision embedded directly in `render()`
- [x] host-action bridge for starter/open-app handoff is explicit: authored top-card `action = "openBootstrapAppHome"` emits the named `witness:bootstrap-host-action` family with `detail.action = "open-app"`, and the shared `bindBootstrapHostActions(...)` / `runBootstrapHostAction(...)` seam now binds and handles that event instead of keeping a raw `#open-app-link` click listener
- [x] navigation/host owner after starter success is the shared helper seam in `plugins/bootstrap/bootstrap-host-navigation.js`, where `openBootstrapAppHome(...)` re-checks freshness before same-URL app navigation and `continueBootstrapTutorialOnPage(...)` owns bootstrap/world/app same-page continuation policy
- if a later slice changes starter request ordering, route/home-page authoring order, or the `serverRunner.handlerSet = "demo"` invariant, record the new invariant list here and re-prove it with the dedicated starter browser command in the same change
- do not let a future starter slice hide persistent creation semantics inside host listeners or DOM-only status mutation; the resulting world/app state must still land server-side first and be re-read before navigation

### Bootstrap preserved DOM and event contracts

Unattended work should treat these identifiers as live compatibility constraints unless the same change intentionally updates code, tests, and this audit together.

- [x] preserved scoped create/remove DOM ids include `#context-binding-form`, `#context-binding-target`, `#context-binding-remove-form`, `#context-export-form`, `#context-export-target`, `#context-export-remove-form`, `#context-import-form`, `#context-import-export-name`, `#context-import-remove-form`, `#context-import-remove-export-name`, `#stewardship-form`, and `#stewardship-remove-form`
- [x] preserved direct runtime-integration DOM ids currently include `#runtime-plugin-install-form`, `#runtime-plugin-install-status`, `#runtime-plugin-install-runner`, `#runtime-plugin-install-plugin`, `#mcp-server-form`, `#mcp-server-status`, `#mcp-server-runner`, `#mcp-server-help`, `#mcp-tool-install-form`, `#mcp-tool-install-status`, `#mcp-tool-install-server`, `#mcp-tool-install-tool`, and `#mcp-tool-install-acting-mode`; those anchors now survive through authored `WTOML` plus shared submit/recompute seams, and any later rename still needs proof plus an audit update in the same change
- [x] preserved starter/identity/top-card DOM ids include `#identity-form`, `#identity-status`, `#session-form`, `#session-summary`, `#create-todo-starter`, `#starter-status`, and `#open-app-link`
- [x] preserved bootstrap host-event names currently include `witness:host-refresh`, `witness:bootstrap-backend-authoring-sync`, `witness:bootstrap-proposal-adjacent-submit`, `witness:bootstrap-proposal-adjacent-sync`, `witness:bootstrap-runtime-integration-direct-submit`, `witness:bootstrap-runtime-integration-direct-sync`, `witness:bootstrap-dependent-select-sync`, `witness:bootstrap-backend-help-sync`, `witness:bootstrap-proposal-create-help-sync`, `witness:bootstrap-proposal-approve-help-sync`, and `witness:bootstrap-host-action`
- do not treat DOM-id preservation as a mere testing concern; these ids are also runtime anchors for refresh, tutorial, and host-bridge behavior
- if a slice renames any of the above ids or host events, the same change must update the focused proof and the corresponding residual-debt note so the next unattended pass does not follow stale contracts

### Bootstrap external state routing rules

The main anti-drift question for bootstrap is not "did the button still work?" but "where does the resulting external state land, and who owns that transition?"

- form submissions that create, remove, approve, reject, activate, rollback, bind, export, import, or grant should continue to originate from authored semantic submit paths, not from page-local `addEventListener("submit", ...)` ownership reclaim
- browser events should remain generic at the shared runtime boundary; bootstrap-local code should only translate from already-semantic host bridge events into refresh/projection work that still cannot live in authored state
- external state that changes persistent world data should land in the existing API/resource owner first, then be re-read through `refresh()` or a narrower declared projection path; do not patch the DOM as the primary source of truth after a request succeeds
- external state that only affects view guidance, valid-option sets, or button-disabled outcomes should either land in explicit projection state or remain in one documented local helper family; do not split one decision across authored widgets, local listeners, and random inline DOM mutation
- do not let `witness:bootstrap-host-action` become an anonymous event tunnel; each `detail.action` value should map to one named semantic family and one documented helper or residual shell owner, with focused proof updated in the same change
- desktop shell actions and same-URL navigation handoff remain host-adapter mechanics, but the user-visible action intent should stay authored and the resulting host event name should remain explicit in this file
- if a future slice adds a new product-significant click/change outcome, document whether its state owner is authored frontend state, server-side bootstrap state, query state, or host-adapter state before landing the slice

### External state capture packet

For unattended work, "external state captured correctly" means the slice can answer the packet below without reopening chat history or reverse-engineering local listeners:

- trigger owner: which authored action, semantic event, or documented bridge is allowed to initiate the change
- payload owner: where the request body or host-event detail shape is declared or at least documented; if that shape only exists implicitly inside a local listener, the event is not really extracted
- request owner: which shared runtime op, host bridge, or page-local temporary adapter performs the external request or host handoff
- state owner: whether the resulting state lands in server/bootstrap data, authored frontend projection state, query state, host state, or a documented temporary local adapter
- refresh owner: what explicitly causes the post-change reread or reprojection, such as `refresh()`, `refreshProjection()`, or a named authored load/change path
- contract owner: which DOM ids, host-event names, status ids, or query params are intentionally preserved for the slice
- residual risk: what still remains page-local enough that a later slice could accidentally recapture the same state transition

## Change Control

- If a migration step changes the target architecture, update this document in the same change.
- If a module cannot yet fit the target model, record the exception explicitly instead of silently improvising.
- If a new shared primitive, token contract, or semantic event family is introduced, document its intended ownership here.
- If a later slice depends on a decision that only exists in local memory or review comments, promote that decision into this document before continuing.

## Architectural Rule Going Forward

When a module contains product copy, page layout, repeated cards/lists/forms, or app-specific action wiring, that content should default to `DESIRE`, `RVM`, or `WTOML` rather than a JS template string.

When a module contains generic rendering logic, geometry/canvas behavior, state derivation, or runtime transport glue, that content can remain code.
