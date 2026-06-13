# Embedded HTML / JS Audit

## Scope

Audit target: HTML, CSS, and browser behavior authored inline inside JavaScript modules, where the content should instead be represented as composable authored surfaces such as `DESIRE`, `RVM`, or `WTOML`.

This audit distinguishes between:

- authored product/UI content that should move into source forms
- generic runtime/rendering engines that should remain code
- temporary runtime seams that are acceptable until a higher-level surface exists

Out of scope:

- [ ] legacy Engentus SPA migration work

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
| Medium | `plugins/tutorial/tutorial-app-client.js` | Overlay DOM skeleton is injected with `innerHTML`; should become reusable surface/template content. |
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
- The recent-worlds list is assembled through `innerHTML` at `src/desktop-launcher-page.js:174`.

Reason it is not first:

- it is a thin Electron/desktop seam
- it depends on `window.witnessDesktop`, so there is less immediate reuse value than the in-app runtime surfaces

Recommended target form:

- `WTOML` widgets for shell structure
- authored action definitions mapped onto desktop bridge calls

### 7. `plugins/tutorial/tutorial-app-client.js` and inspect overlays should become reusable surface templates

Why it matters:

- The tutorial overlay is currently injected with large literal `innerHTML` fragments.
- The inspect runtime already has generic collection/template behavior, but some overlays still bypass it.

Representative hotspots:

- `plugins/tutorial/tutorial-app-client.js:25`
- `plugins/tutorial/tutorial-app-client.js:51`
- `plugins/inspect/widget-page.js:1392`
- `plugins/inspect/widget-page.js:3353`

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

- [ ] `plugins/backend-seams/backend-seams-page.js`
- [ ] `plugins/inspect/process-view.js`
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
- [ ] move page-theme behavior onto a stable shared contract instead of ad hoc page-local variables
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

- [ ] extract a shared token file first
- [ ] extract `card`, `button`, `form`, `status`, `list`, and `inspector` primitives next
- [ ] refit `backend-seams`, `process-view`, and `bootstrap` onto the shared token and primitive layer before tackling `eden` and `canvas`
- [ ] decide whether theme tokens live as JS config, authored theme docs, or both, but keep the contract singular
- [ ] stop introducing new page-local visual systems unless they are explicitly experimental

### CSS ownership rule

- [ ] page modules should not be the long-term owners of typography scales, elevation, spacing systems, or semantic color roles
- [ ] reusable surfaces should own primitive class styling
- [ ] themes should own tokens
- [ ] runtime modules should only own engine-specific layout or rendering styles

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

#### Hard-coded product behavior: `bootstrap-shell`

Observed shape:

- `plugins/bootstrap/bootstrap-shell.js` has `55` event bindings and `32` network/stream calls
- `plugins/bootstrap/bootstrap-shell.js:2349` and `:2364` define local generic submit helpers, but they still bind directly to concrete paths
- `plugins/bootstrap/bootstrap-shell.js:2418`, `:2446`, `:2509`, `:2603`, `:2675`, `:2701` and many similar lines wire product-significant forms directly to `postJson(...)`
- `plugins/bootstrap/bootstrap-shell.js:2740` through `:2870` encode page-specific change/input semantics in local JS

Audit conclusion:

- bootstrap does not have an authored action/event layer
- the page module is the primary owner of interaction semantics
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

- `plugins/tutorial/tutorial-app-client.js:864` and `:868` already observe generic page `click` and `submit` activity
- `plugins/tutorial/tutorial-app-client.js:767` through `:827` hard-code tutorial control semantics into the overlay implementation

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

### Event ownership rule

- [ ] authored surfaces should declare interaction affordances
- [ ] shared runtimes should translate browser events into authored/runtime actions
- [ ] process/state systems should own durable state transitions
- [ ] local JS should not be the only place where product-significant interactions are defined

## Recommended Migration Order

- [ ] prove the pattern on `backend-seams-page` using `WTOML` widgets plus authored repeated collections
- [ ] move `process-view` to authored widgets/templates and keep the process-graph projection in JS
- [ ] extract `bootstrap-shell` into authored page plus `frontendProgram` flows
- [ ] extract a shared theme token contract before further page migrations
- [ ] extract primitive surface styles before refitting larger shells
- [ ] extract a shared event/action contract before further page migrations that add new interaction behavior
- [ ] split `canvas-page` into authored chrome and a JS canvas engine
- [ ] split `eden-page` into authored surfaces plus a small Eden interaction runtime

## Architectural Rule Going Forward

When a module contains:

- product copy
- page layout
- repeated cards/lists/forms
- app-specific action wiring

that content should default to `DESIRE` / `RVM` / `WTOML`, not a JS template string.

Authoring TODOs:

- [ ] default new product copy, page layout, repeated UI structure, and app-specific flows to authored surfaces
- [ ] reject new large inline HTML documents unless they are deliberate temporary seams
- [ ] reject new page-local global CSS unless the style cannot yet be represented in the shared theme or surface kit
- [ ] reject new page-local event semantics that bypass the authored action/event layer

When a module contains:

- generic rendering logic
- geometry/canvas behavior
- state derivation
- runtime transport glue

that content can remain code.

Runtime TODOs:

- [ ] keep generic rendering engines in code
- [ ] keep geometry and canvas behavior in code
- [ ] keep transport and runtime glue in code
- [ ] keep authored-surface extraction focused on removing product UI from modules, not on wrapping every engine in another abstraction layer
- [ ] keep low-level DOM and pointer handling in code only when the semantic event/state transition is still exposed through a stable contract
