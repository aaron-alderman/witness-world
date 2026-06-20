# Embedded HTML / JS Audit

## Current Status (2026-06-19)

`dispatchDomEvent` is retired. It is no longer an acceptable shared frontend
op or bootstrap integration seam.

Current native replacements are:

- route refresh through canonical `page.surface` refresh behavior
- same-document route changes through authored `navigate`
- submit and recompute flows through authored surface interactions, process
  state, boundary operations, and policy writes
- query mutation through authored state and canonical URL synchronization
- host or desktop actions through explicit capability-backed or runtime-owned
  action contracts, not arbitrary named DOM events

`witness:*` page bridge families in older tranche notes below are historical
migration records, not current design guidance. The live bootstrap/browser path
no longer depends on named page-local `witness:*` DOM-event seams to stay
coherent.

Legacy public app authoring through `frontendProgram` and `frontendStep` is
also retired. `/api/frontend-programs` and `/api/frontend-steps` now return
explicit `410` retirement guidance, and maintained starter/bootstrap app
creation authors native `page.surface` nouns directly.

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
- Use authored `surface + process + collection + boundary + policy` contracts
  for product-significant submits, clicks, URL mutations, and host/runtime
  effects.
- Do not route new app-serving work through retired `page.home` or `compat.legacy-widget-program` seams; legacy routes must uplift onto native `page.surface` before they can serve again.
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
- proven slices now also moved the bootstrap page head/style owner out of `plugins/bootstrap/bootstrap-shell.js`; `plugins/bootstrap/bootstrap-shell-head.js` now owns the large shared shell token/CSS block while the page module consumes that seam instead of keeping the full head/style literal inline
- the remaining live bootstrap frontier is now specific rather than broad: the browser runtime is now split across dedicated transport, binders, guidance, orchestration, support, and render seams; outer page-shell chrome, document wrapper, injected browser-script factory assembly, and page-main slot assembly are helper-owned; the authored slot inventory now lives in `plugins/bootstrap/bootstrap-page-main-slots.wtoml`, and the larger residual debt is now mainly the thin page-main seed/replacement adapters in `plugins/bootstrap/bootstrap-page-main-seed-state.js` and `plugins/bootstrap/bootstrap-page-main-replacement-content.js`
- this tranche is still on track, but it is not close to "fully extracted bootstrap" yet; the document should be read as a live frontier brief, not as a claim that bootstrap is mostly done

Remaining frontier for this tranche:

- [x] remove shell-local ownership of the inline create forms that still live directly in `plugins/bootstrap/bootstrap-shell.js`: `context-form`, `perspective-form`, `widget-form`, `program-form`, `step-form`, `route-form`, `serve-form`, and `runner-form`
  `program-form` and `step-form` were later retired entirely when public legacy frontend authoring was removed; this line remains as extraction provenance only.
- [x] remove shell-local submit routing through `bindCreate(...)`, including its local request-body shaping and unconditional `form.reset()` plus `refresh()` follow-up
- [x] reduce or extract the shell-local `refresh()` owner only after the submit/bridge contracts that depend on it are explicit enough to preserve current reread semantics
- [x] reduce or extract the shell-local starter/desktop/form-access wrapper state owners without pushing their projection logic back into anonymous `render()` branches
- [x] reduce or extract the shell-local render-time summary/status/select-fill owner in `render()` now that refresh, review-view, and state-inventory seams are explicit
- [x] reduce or extract the remaining thin shell-local tutorial/host adapter glue only after its contract is explicit enough to preserve current bootstrap navigation and tutorial semantics
- [x] reduce or extract the remaining shell-local render/runtime glue that still sequences shared seams inside `render()` without pushing bootstrap semantics back into generic helpers
- [x] keep the document aligned to those exact residual owners; do not broaden the tranche back into generic architecture cleanup unless the code frontier actually changes
## Historical Non-Stop Handoff Snapshot (Pre-Retirement Provenance)

This snapshot is retained as provenance for earlier extraction tranches. It
includes intermediate `witness:*` bridge families that were retired later.
Read it as implementation history, not as the current recommended contract for
new work.

- [x] the current generic extraction baseline is real and re-proved for authored `load`, `change`, `input`, `keydown`, `navigate`, `setQueryParam`, `setHidden`, `setDisabled`, checkbox coercion, dynamic repeated widget ids, refresh-projection initial-state resync, and WTOML/apply-path parity for renderer-supported `label`/`textarea`/`details`/`summary`/`valueEditor`; `dispatchDomEvent` is retired and no longer part of the supported baseline
- [x] the bootstrap top-card, backend authoring controls, backend-version controls, proposal create controls, proposal review controls, proposal-adjacent runtime-plugin/MCP proposal controls, scoped context/stewardship create-remove controls, capability define/install controls, and runtime-plugin/MCP-tool/capability remove controls are the currently proven embedded authored slices
- [x] the bootstrap page-main runtime-plugin review selects now use direct authored semantic change handling without a named host-event bridge: `plugins/bootstrap/bootstrap-page-main.wtoml` preserves the authored review-select structure, while `plugins/bootstrap/bootstrap-runtime-plugin-review-sync.js` now binds the live review fields directly instead of routing through `dispatchDomEvent` or `witness:bootstrap-runtime-plugin-review-sync`
- [x] the bootstrap runtime-plugin review detail mount no longer depends on HTML-string assembly plus `innerHTML`: `plugins/bootstrap/bootstrap-runtime-plugin-review-view.js` now returns structured `detailItems`, `plugins/bootstrap/bootstrap-state-list-render.js` now owns the reusable `renderBootstrapStateItems(...)` DOM seam for `surface-state-item` / `surface-empty` sections, and `plugins/bootstrap/bootstrap-client-runtime.js` now renders the review detail through that shared state-item path instead of injecting raw review HTML into `#runtime-plugin-review-detail`
- [x] the bootstrap browser-runtime construction layer now owns more of the event-time recompute builder packet explicitly through `plugins/bootstrap/bootstrap-controls-runtime.js`: `createBootstrapControlsRuntimeFromBootstrap(...)` now exposes `buildProposalAdjacentSyncDeps`, `buildScopedControlsSyncDeps`, and `buildRouteAuthoringSyncDeps` alongside the existing backend/proposal/direct-runtime-integration/capability seams, and `plugins/bootstrap/bootstrap-client-runtime.js` now consumes those shared builders instead of re-constructing proposal-adjacent, scoped, and route-authoring deps builders locally
- [x] the bootstrap browser-runtime transport helper is no longer a local closure inside `startBootstrapClientRuntime(...)`: `plugins/bootstrap/bootstrap-client-http.js` now owns `createBootstrapClientHttp(...)` plus `renderBootstrapClientHttpFactory()`, `plugins/bootstrap/bootstrap-page-script.js` injects that helper factory into the browser bundle, and `plugins/bootstrap/bootstrap-client-runtime.js` now consumes `{ request, postJson }` from the shared helper instead of defining request/post wrappers inline. Focused proof: `cmd /c node --test plugins\\bootstrap\\bootstrap-client-http.test.js plugins\\bootstrap\\bootstrap-page-script.test.js plugins\\bootstrap\\bootstrap-client-runtime.test.js plugins\\bootstrap\\bootstrap.test.js`
- [x] the bootstrap browser-runtime binder/wiring layer is no longer embedded inline in `startBootstrapClientRuntime(...)`: `plugins/bootstrap/bootstrap-client-runtime-binders.js` now owns `bindBootstrapClientRuntimeAdapters(...)` plus `renderBootstrapClientRuntimeBindersFactory()`, `plugins/bootstrap/bootstrap-page-script.js` injects that binder factory into the browser bundle, and `plugins/bootstrap/bootstrap-client-runtime.js` now delegates host-refresh, submit, sync, runtime-plugin-review, and host-action bridge registration through that shared seam instead of keeping the registration choreography inline. Focused proof: `cmd /c node --test plugins\\bootstrap\\bootstrap-client-runtime-binders.test.js plugins\\bootstrap\\bootstrap-client-runtime.test.js plugins\\bootstrap\\bootstrap-page-script.test.js plugins\\bootstrap\\bootstrap.test.js`
- [x] the bootstrap browser-runtime support cluster is no longer embedded inline in `startBootstrapClientRuntime(...)`: `plugins/bootstrap/bootstrap-client-runtime-support.js` now owns `escapeBootstrapHtml(...)`, `bootstrapStateInventoryRowKey(...)`, and `createBootstrapClientRuntimeSupport(...)`, `plugins/bootstrap/bootstrap-page-script.js` injects that support factory into the browser bundle, and `plugins/bootstrap/bootstrap-client-runtime.js` now delegates browser-target lookup, desktop API lookup, sleep, inventory snapshot/key support, runtime-plugin-review detail rendering, and runtime-view publication through that shared seam instead of keeping those support locals anonymous inside startup. Focused proof: `cmd /c node --test plugins\\bootstrap\\bootstrap-client-runtime-support.test.js plugins\\bootstrap\\bootstrap-client-runtime.test.js plugins\\bootstrap\\bootstrap-page-script.test.js plugins\\bootstrap\\bootstrap.test.js`
- [x] the bootstrap guidance/runtime boot sequence is no longer embedded inline in `startBootstrapClientRuntime(...)`: `plugins/bootstrap/bootstrap-client-runtime-guidance.js` now owns `createBootstrapNoopGuidanceRuntime(...)` plus `createBootstrapClientRuntimeGuidance(...)`, `plugins/bootstrap/bootstrap-page-script.js` injects that guidance factory into the browser bundle, and `plugins/bootstrap/bootstrap-client-runtime.js` now delegates active-guidance selection, progress-key derivation, step-index/autocomplete setup, guidance runtime construction, and guidance/tutorial fallback normalization through that shared seam instead of keeping the boot sequence local beside refresh/render composition. Focused proof: `cmd /c node --test plugins\\bootstrap\\bootstrap-client-runtime-guidance.test.js plugins\\bootstrap\\bootstrap-client-runtime.test.js plugins\\bootstrap\\bootstrap-page-script.test.js plugins\\bootstrap\\bootstrap.test.js`
- [x] the bootstrap browser-runtime refresh/render startup construction order is no longer embedded inline in `startBootstrapClientRuntime(...)`: `plugins/bootstrap/bootstrap-client-runtime-orchestration.js` now owns `createBootstrapClientRuntimeOrchestration(...)` plus `renderBootstrapClientRuntimeOrchestrationFactory()`, `plugins/bootstrap/bootstrap-page-script.js` injects that orchestration factory into the browser bundle, and `plugins/bootstrap/bootstrap-client-runtime.js` now delegates guidance boot handoff, refresh wiring, binder registration, render-runtime construction, and startup sequencing through that shared seam instead of composing those steps inline beside the support and transport helpers. Focused proof: `cmd /c node --test plugins\\bootstrap\\bootstrap-client-runtime-orchestration.test.js plugins\\bootstrap\\bootstrap-client-runtime-guidance.test.js plugins\\bootstrap\\bootstrap-client-runtime-support.test.js plugins\\bootstrap\\bootstrap-client-runtime.test.js plugins\\bootstrap\\bootstrap-page-script.test.js plugins\\bootstrap\\bootstrap.test.js` plus `cmd /c node --check plugins\\bootstrap\\bootstrap-client-runtime-orchestration.js plugins\\bootstrap\\bootstrap-client-runtime.js plugins\\bootstrap\\bootstrap-page-script.js`
- [x] the bootstrap page-main slot wrapper mechanics are no longer embedded inline in `plugins/bootstrap/bootstrap-page-main-slots.js`: `plugins/bootstrap/bootstrap-page-helpers.js` now owns `renderBootstrapAuthoredSlot(...)`, and `plugins/bootstrap/bootstrap-page-main-slots.js` now delegates seeded initial-state script injection plus authored replacement-slot patching through that shared seam instead of keeping those wrapper mechanics local beside the slot-manifest loop. Focused proof: `cmd /c node --test plugins\\bootstrap\\bootstrap-page-helpers.test.js plugins\\bootstrap\\bootstrap-page-main-slots.test.js plugins\\bootstrap\\bootstrap-page-main.test.js plugins\\bootstrap\\bootstrap-page-script.test.js plugins\\bootstrap\\bootstrap.test.js`
- [x] the bootstrap page-main slot manifest loading/render selection layer is no longer embedded inline in `plugins/bootstrap/bootstrap-page-main-slots.js`: `plugins/bootstrap/bootstrap-page-slot-manifest.js` now owns `loadBootstrapPageSlotDefinitions(...)`, `renderBootstrapPageSlotDefinition(...)`, and `renderBootstrapPageSlotDefinitions(...)`, while `plugins/bootstrap/bootstrap-page-main-slots.js` now only supplies page-main seed and replacement content into that shared manifest seam instead of mixing WTOML parsing, slot-definition selection, and authored-slot rendering in one file. Focused proof: `cmd /c node --test plugins\\bootstrap\\bootstrap-page-slot-manifest.test.js plugins\\bootstrap\\bootstrap-page-main-slots.test.js plugins\\bootstrap\\bootstrap-page-main.test.js plugins\\bootstrap\\bootstrap.test.js` plus `cmd /c node --check plugins\\bootstrap\\bootstrap-page-slot-manifest.js plugins\\bootstrap\\bootstrap-page-main-slots.js`
- [x] the bootstrap identity edit-mode projection owner is no longer mixed into the broader page-main seed adapter: `plugins/bootstrap/bootstrap-identity-view-state.js` now owns `buildBootstrapIdentityView(...)`, while `plugins/bootstrap/bootstrap-page-main-seed-state.js` now only aggregates authored page-main seed state and `plugins/bootstrap/bootstrap-page-main-replacement-content.js` now only composes guidance-card replacement content. This preserves the existing `initialStateScriptId` / `initialStateInto` + authored `load` + edit-path `refreshProjection()` contract while narrowing the remaining page-main adapter debt. Focused proof: `cmd /c node --test plugins\\bootstrap\\bootstrap-page-main-slots.test.js plugins\\bootstrap\\bootstrap-page-main.test.js plugins\\bootstrap\\bootstrap.test.js` plus `cmd /c node --check plugins\\bootstrap\\bootstrap-identity-view-state.js plugins\\bootstrap\\bootstrap-page-main-seed-state.js plugins\\bootstrap\\bootstrap-page-main-replacement-content.js`
- [x] the generic authored starter request-plan interpreter is no longer embedded inline in `buildBootstrapStarterPlan(...)`: `plugins/bootstrap/bootstrap-authored-request-plan.js` now owns `buildBootstrapAuthoredRequestPlanRequests(...)`, and `plugins/bootstrap/bootstrap-starter-plan.js` now only supplies the starter blueprint plus bootstrap-specific dynamic host defaults into that shared request-plan seam instead of mixing authored request iteration, skip logic, placeholder resolution, body shaping, and URL-template expansion inline. Focused proof: `cmd /c node --test plugins\\bootstrap\\bootstrap-authored-request-plan.test.js plugins\\bootstrap\\bootstrap-starter-plan.test.js plugins\\bootstrap\\bootstrap.test.js` plus `cmd /c node --check plugins\\bootstrap\\bootstrap-authored-request-plan.js plugins\\bootstrap\\bootstrap-starter-plan.js`
- [x] the bootstrap read-model contribution packet is no longer assembled inline in `plugins/bootstrap/bootstrap-read-models.js`: `plugins/bootstrap/bootstrap-contribution-state.js` now owns `buildBootstrapContributionState(...)`, and `plugins/bootstrap/bootstrap-read-models.js` now delegates guidance-definition rows, starter-blueprint rows, active bootstrap guidance, and active starter-blueprint selection through that seam instead of mixing contribution packet assembly into the broader bootstrap state projection. Focused proof: `cmd /c node --test plugins\\bootstrap\\bootstrap-contribution-state.test.js plugins\\bootstrap\\bootstrap.test.js` plus `cmd /c node --check plugins\\bootstrap\\bootstrap-contribution-state.js plugins\\bootstrap\\bootstrap-read-models.js`
- [x] the bootstrap app-authoring family contract is no longer hard-coded inline in `plugins/bootstrap/bootstrap-app-authoring-submit.js`: authored family-to-endpoint and field-shaping rules now live in `plugins/bootstrap/bootstrap-app-authoring-submit-contracts.wtoml`, `plugins/bootstrap/bootstrap-app-authoring-submit-contracts.js` now loads/group those WTOML docs, and `plugins/bootstrap/bootstrap-app-authoring-submit.js` now acts as the generic form-read/post/reset/refresh adapter instead of keeping the app-authoring request map inline. Focused proof: `cmd /c node --test plugins\\bootstrap\\bootstrap-app-authoring-submit.test.js plugins\\bootstrap\\bootstrap.test.js` plus `cmd /c node --check plugins\\bootstrap\\bootstrap-app-authoring-submit-contracts.js plugins\\bootstrap\\bootstrap-app-authoring-submit.js`
- [x] the bootstrap scoped create/remove family contract is no longer hard-coded inline in `plugins/bootstrap/bootstrap-scoped-submit.js`: authored family-to-endpoint/method/body-field/success semantics now live in `plugins/bootstrap/bootstrap-scoped-submit-contracts.wtoml`, `plugins/bootstrap/bootstrap-scoped-submit-contracts.js` now loads those WTOML docs, and `plugins/bootstrap/bootstrap-scoped-submit.js` now acts as the generic scoped post/reset/refresh adapter instead of keeping the scoped request map inline. Focused proof: `cmd /c node --test plugins\\bootstrap\\bootstrap-scoped-submit.test.js plugins\\bootstrap\\bootstrap.test.js` plus `cmd /c node --check plugins\\bootstrap\\bootstrap-scoped-submit-contracts.js plugins\\bootstrap\\bootstrap-scoped-submit.js`
- [x] the bootstrap backend authoring family contract is no longer hard-coded inline in `plugins/bootstrap/bootstrap-backend-authoring-submit.js`: authored family-to-endpoint/body-field semantics now live in `plugins/bootstrap/bootstrap-backend-authoring-submit-contracts.wtoml`, `plugins/bootstrap/bootstrap-backend-authoring-submit-contracts.js` now loads those WTOML docs, and `plugins/bootstrap/bootstrap-backend-authoring-submit.js` now acts as the generic backend-authoring post/reset/refresh adapter instead of keeping the backend request map inline. Focused proof: `cmd /c node --test plugins\\bootstrap\\bootstrap-backend-authoring-submit.test.js plugins\\bootstrap\\bootstrap.test.js` plus `cmd /c node --check plugins\\bootstrap\\bootstrap-backend-authoring-submit-contracts.js plugins\\bootstrap\\bootstrap-backend-authoring-submit.js`
- [x] the bootstrap backend activate/rollback family contract is no longer hard-coded inline in `plugins/bootstrap/bootstrap-backend-version-submit.js`: authored family-to-url-template/body-field/success semantics now live in `plugins/bootstrap/bootstrap-backend-version-submit-contracts.wtoml`, `plugins/bootstrap/bootstrap-backend-version-submit-contracts.js` now loads those WTOML docs, and `plugins/bootstrap/bootstrap-backend-version-submit.js` now acts as the generic backend-version post/status/refresh adapter instead of keeping the activate/rollback request map inline. Focused proof: `cmd /c node --test plugins\\bootstrap\\bootstrap-backend-version-submit.test.js plugins\\bootstrap\\bootstrap.test.js` plus `cmd /c node --check plugins\\bootstrap\\bootstrap-backend-version-submit-contracts.js plugins\\bootstrap\\bootstrap-backend-version-submit.js`
- [x] the bootstrap top-cards submit family contract is no longer hard-coded inline in `plugins/bootstrap/bootstrap-top-cards-submit.js`: authored create/edit/session/operator family-to-url/method/body-field/follow-up semantics now live in `plugins/bootstrap/bootstrap-top-cards-submit-contracts.wtoml`, `plugins/bootstrap/bootstrap-top-cards-submit-contracts.js` now loads and groups those WTOML docs, and `plugins/bootstrap/bootstrap-top-cards-submit.js` now acts as the generic top-cards post/status/reset/follow-up adapter instead of keeping the identity/session/operator request map inline. Focused proof: `cmd /c node --test plugins\\bootstrap\\bootstrap-top-cards-submit.test.js plugins\\bootstrap\\bootstrap.test.js` plus `cmd /c node --check plugins\\bootstrap\\bootstrap-top-cards-submit-contracts.js plugins\\bootstrap\\bootstrap-top-cards-submit.js`
- [x] the bootstrap host-action family contract is no longer hard-coded inline in `plugins/bootstrap/bootstrap-host-actions.js`: authored action-to-capability/status semantics now live in `plugins/bootstrap/bootstrap-host-action-contracts.wtoml`, `plugins/bootstrap/bootstrap-host-action-contracts.js` now loads those WTOML docs, and `plugins/bootstrap/bootstrap-host-actions.js` now acts as the thin host bridge that selects a contract, invokes `openAppHome` or the named desktop capability, and applies the documented status target instead of keeping the action/status branch chain inline. Focused proof: `cmd /c node --test plugins\\bootstrap\\bootstrap-host-actions.test.js plugins\\bootstrap\\bootstrap.test.js` plus `cmd /c node --check plugins\\bootstrap\\bootstrap-host-action-contracts.js plugins\\bootstrap\\bootstrap-host-actions.js`
- [x] the bootstrap host-refresh source allowlist is no longer hard-coded inline in `plugins/bootstrap/bootstrap-host-refresh.js`: the authored source contract now lives in `plugins/bootstrap/bootstrap-host-refresh-contracts.wtoml`, `plugins/bootstrap/bootstrap-host-refresh-contracts.js` now loads that WTOML list, and `plugins/bootstrap/bootstrap-host-refresh.js` now acts as the thin refresh bridge that only applies the documented source allowlist plus refresh failure reporting instead of keeping the allowed-source array inline. Focused proof: `cmd /c node --test plugins\\bootstrap\\bootstrap-host-refresh.test.js plugins\\bootstrap\\bootstrap.test.js` plus `cmd /c node --check plugins\\bootstrap\\bootstrap-host-refresh-contracts.js plugins\\bootstrap\\bootstrap-host-refresh.js`
- [x] the bootstrap route-authoring guidance policy is no longer hard-coded inline in `plugins/bootstrap/bootstrap-route-authoring-sync.js`: route-kind field ownership, response-kind defaults, field-summary copy, and handler-specific root-widget requirements now live in `plugins/bootstrap/bootstrap-route-authoring-contracts.wtoml`, `plugins/bootstrap/bootstrap-route-authoring-contracts.js` now loads those WTOML docs, and `plugins/bootstrap/bootstrap-route-authoring-sync.js` now acts as the event-time reader/applier over that documented route-authoring contract instead of keeping the policy strings and handler-specific blockers inline. Focused proof: `cmd /c node --test plugins\\bootstrap\\bootstrap-route-authoring-sync.test.js plugins\\bootstrap\\bootstrap.test.js` plus `cmd /c node --check plugins\\bootstrap\\bootstrap-route-authoring-contracts.js plugins\\bootstrap\\bootstrap-route-authoring-sync.js`
- [x] the bootstrap proposal-adjacent submit family contract is no longer hard-coded inline in `plugins/bootstrap/bootstrap-proposal-adjacent-submit.js`: runtime-plugin and MCP proposal family-to-endpoint/body-builder/action/server-runner-resolution semantics now live in `plugins/bootstrap/bootstrap-proposal-adjacent-submit-contracts.wtoml`, `plugins/bootstrap/bootstrap-proposal-adjacent-submit-contracts.js` now loads those WTOML docs, and `plugins/bootstrap/bootstrap-proposal-adjacent-submit.js` now acts as the generic proposal-adjacent request/status/reset/refresh seam over the existing `runtimePluginProposalBody(...)`, `mcpServerProposalBody(...)`, and `mcpToolProposalBody(...)` builders instead of keeping the family routing chain or proposal-create endpoint inline. Focused proof: `cmd /c node --test plugins\\bootstrap\\bootstrap-proposal-adjacent-submit.test.js plugins\\bootstrap\\bootstrap.test.js` plus `cmd /c node --check plugins\\bootstrap\\bootstrap-proposal-adjacent-submit-contracts.js plugins\\bootstrap\\bootstrap-proposal-adjacent-submit.js`
- [x] the bootstrap proposal submit family contract is no longer hard-coded inline in `plugins/bootstrap/bootstrap-proposal-submit.js`: authored create/approve/reject family-to-url/body-field/success semantics now live in `plugins/bootstrap/bootstrap-proposal-submit-contracts.wtoml`, `plugins/bootstrap/bootstrap-proposal-submit-contracts.js` now loads those WTOML docs, and `plugins/bootstrap/bootstrap-proposal-submit.js` now acts as the generic proposal post/status/reset/refresh adapter instead of keeping the proposal request map inline. Focused proof: `cmd /c node --test plugins\\bootstrap\\bootstrap-proposal-submit.test.js plugins\\bootstrap\\bootstrap.test.js` plus `cmd /c node --check plugins\\bootstrap\\bootstrap-proposal-submit-contracts.js plugins\\bootstrap\\bootstrap-proposal-submit.js`
- [x] the bootstrap capability submit family contract is no longer hard-coded inline in `plugins/bootstrap/bootstrap-capability-submit.js`: authored create/install/remove family-to-endpoint/method/body-field/success semantics now live in `plugins/bootstrap/bootstrap-capability-submit-contracts.wtoml`, `plugins/bootstrap/bootstrap-capability-submit-contracts.js` now loads those WTOML docs, and `plugins/bootstrap/bootstrap-capability-submit.js` now acts as the generic capability post/status/reset/refresh adapter instead of keeping the capability request map inline. Focused proof: `cmd /c node --test plugins\\bootstrap\\bootstrap-capability-submit.test.js plugins\\bootstrap\\bootstrap.test.js` plus `cmd /c node --check plugins\\bootstrap\\bootstrap-capability-submit-contracts.js plugins\\bootstrap\\bootstrap-capability-submit.js`
- [x] the bootstrap direct runtime-integration submit family contract is no longer hard-coded inline in `plugins/bootstrap/bootstrap-runtime-integration-direct-submit.js`: authored runtime-plugin/MCP direct family-to-endpoint/method/body-field/defaulting/success semantics now live in `plugins/bootstrap/bootstrap-runtime-integration-direct-submit-contracts.wtoml`, `plugins/bootstrap/bootstrap-runtime-integration-direct-submit-contracts.js` now loads and groups those WTOML docs, and `plugins/bootstrap/bootstrap-runtime-integration-direct-submit.js` now acts as the generic direct-runtime-integration post/status/reset/refresh adapter instead of keeping the request map and defaulting rules inline. Focused proof: `cmd /c node --test plugins\\bootstrap\\bootstrap-runtime-integration-direct-submit.test.js plugins\\bootstrap\\bootstrap.test.js` plus `cmd /c node --check plugins\\bootstrap\\bootstrap-runtime-integration-direct-submit-contracts.js plugins\\bootstrap\\bootstrap-runtime-integration-direct-submit.js`
- [x] the bootstrap contextual remove slice remains authored in `WTOML`: `context-binding-remove-form`, `context-export-remove-form`, `context-import-remove-form`, and `stewardship-remove-form` all render from `plugins/bootstrap/bootstrap-remove-controls.wtoml`, and the source/desktop proof remains current through `plugins\\bootstrap\\bootstrap.test.js` plus `test\\bootstrap-shell-desktop.test.js`
- [x] re-proved the contextual/stewardship remove slice through the browser once blank bootstrap UI startup was repaired; as of 2026-06-15, both `cmd /c node --test --test-name-pattern="bootstrap UI can bind, export, import, consume, and remove contextual names" test\\ui.bootstrap.test.js` and `cmd /c node --test --test-name-pattern="blank world can bootstrap into a working todo app purely through the UI" test\\ui.bootstrap.test.js` are green again
- [x] bootstrap widget creation in that browser proof now preserves the active tutorial contract by defaulting blank `tutorialTarget` to widget `id` in the local widget-form submit transform instead of letting a hidden type-model requirement cause unrelated proof drift
- [x] `plugins/starter/todo-starter-legacy-fixture.json` now remains as historical starter substrate and uplift input; `plugins/starter/starter-blueprints.js` reuses that file only for legacy widget/program/step and inspect-facing fixture rows while the maintained runnable starter is authored natively on `page.surface`, and the starter browser proof still passes against the live wired path
- [x] shared `widget.define` detached-root semantics are now explicit and re-proved: `attach = false` must keep authored starter root widgets detached even when a caller has a root fallback, so the tutorial-owned starter blueprint can create `todo_app_widget` without the shared authoring path inventing `parent = "todo_app_widget"` and failing with `parent widget not found`
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
- [x] `plugins/inspect/widget-page.js` and `src/runtime-widget-page.js` now fail fast when authored material still tries to use `dispatchDomEvent`, forcing native `page.surface` refresh, navigation, boundary, policy, or capability semantics instead of a generic host-event bridge
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
- [ ] product-significant interaction intent belongs in authored actions,
  semantic events, native process/message flows, or equivalent declared
  contracts
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
- [x] `plugins/inspect/process-view.js` no longer owns its own JSON-script escaping or “inject before frontend program” document surgery; that mechanical initial-state seam now lives in `src/runtime-page-state.js`, and `renderProcessPage(...)` consumes `renderRuntimePageInitialStateScript(...)` plus `injectRuntimePageMarkupBeforeProgram(...)` instead of keeping local helper copies. Focused proof: `cmd /c node --test test\\runtime-page-state.test.js plugins\\inspect\\inspect.test.js`

### 5. `plugins/backend-seams/backend-seams-page.js` is low-risk, high-clarity extraction work

Why it matters:

- The file is small (`170` lines) and almost entirely authored page content.
- It is a good pilot for proving diagnostics pages can be expressed as authored surfaces instead of template strings.

Representative hotspot:

- `plugins/backend-seams/backend-seams-page.js:9`

Recommended target form:

- `WTOML` widgets/templates and repeated collections
- a small renderer that only supplies diagnostics data
- [x] `plugins/backend-seams/backend-seams-page.js` no longer owns its own JSON-script escaping or “inject before frontend program” document surgery; that mechanical initial-state seam now lives in `src/runtime-page-state.js`, and `renderBackendSeamsPage(...)` now consumes `renderRuntimePageInitialStateScript(...)` plus `injectRuntimePageMarkupBeforeProgram(...)` instead of keeping local helper copies. Focused proof: `cmd /c node --test test\\runtime-page-state.test.js plugins\\backend-seams\\backend-seams.test.js`

### 6. `src/desktop-launcher-page.js` should eventually move, but it is not urgent

Why it matters:

- The file is small (`233` lines), but it still hard-codes a full shell and inline client at `src/desktop-launcher-page.js:9`.
- The overall page shell and direct desktop-bridge action wiring still live in `src/desktop-launcher-page.js`.

Current slice status:

- [x] the recent-worlds list no longer assembles rows through inline `innerHTML`; row DOM creation plus delegated row-open handling now live in `src/desktop-launcher-recent-worlds.js`, and `src/desktop-launcher-page.js` consumes that seam instead of rebuilding the list inline
- [x] the desktop launcher shell and the direct open/create bridge action wiring no longer remain owned inline by `src/desktop-launcher-page.js`; shell rendering now lives in `src/desktop-launcher-view.js`, named bridge-action wiring now lives in `src/desktop-launcher-actions.js`, and `renderDesktopLauncherPage(...)` now consumes those seams instead of keeping the full shell template and raw `desktop[action]()` button contract inline
- [x] focused proof for that desktop launcher slice is `cmd /c node --test src\\desktop-launcher-recent-worlds.test.js test\\desktop-shell.test.js`
- [x] focused proof for the shell/action ownership slice is `cmd /c node --test src\\desktop-launcher-actions.test.js src\\desktop-launcher-view.test.js src\\desktop-launcher-recent-worlds.test.js test\\desktop-shell.test.js`
- [x] the desktop launcher shell no longer remains a hard-coded HTML document in `src/desktop-launcher-view.js`; authored shell structure now lives in `src/desktop-launcher-shell.wtoml`, `renderDesktopLauncherShell(...)` now renders it through `applyWitnessToml(...)` plus `renderWidgetPage(...)`, and the existing named desktop bridge action contracts in `src/desktop-launcher-actions.js` remain the live behavior owner
- [x] the desktop launcher page no longer owns browser boot/render/refresh orchestration inline in `src/desktop-launcher-page.js`; that runtime seam now lives in `src/desktop-launcher-runtime.js` through `startDesktopLauncherRuntime(...)`, `refreshDesktopLauncherState(...)`, `renderDesktopLauncherState(...)`, and `setDesktopLauncherStatus(...)`, and `renderDesktopLauncherPage(...)` now only assembles the launcher script packet from the shell, action, recent-world, and runtime seams. Focused proof: `cmd /c node --test src\\desktop-launcher-actions.test.js src\\desktop-launcher-recent-worlds.test.js src\\desktop-launcher-view.test.js src\\desktop-launcher-runtime.test.js test\\desktop-shell.test.js`

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
- [x] inspect surface-command palette/result markup is no longer owned inline by `plugins/inspect/widget-page.js`; that behavior now lives in `plugins/inspect/surface-command-view.js`, and `renderWidgetPage(...)` consumes `renderSurfaceCommandPaletteView(...)` plus `renderSurfaceWhoamiResultView(...)` instead of keeping the raw command-palette/result HTML branches inline
- [x] inspect surface-inspector toggle/close/clear/refresh/select/world/open-process listeners are no longer owned inline by `plugins/inspect/widget-page.js`; that behavior now lives in `plugins/inspect/surface-inspector-actions.js`, and `renderWidgetPage(...)` consumes that seam instead of keeping the raw inspector chrome/navigation listener family inside `updateSurfaceInspectorUi()`
- [x] inspect surface-inspector activate/rollback button wiring is no longer owned inline by `plugins/inspect/widget-page.js`; that behavior now lives in `plugins/inspect/surface-inspector-version-actions.js`, and `renderWidgetPage(...)` consumes that seam instead of keeping the raw `data-surface-inspector-activate` / `data-surface-inspector-rollback` listener family inside `updateSurfaceInspectorUi()`
- [x] inspect surface-inspector edit/proposal/version-proposal submit wiring is no longer owned inline by `plugins/inspect/widget-page.js`; that behavior now lives in `plugins/inspect/surface-inspector-form-actions.js`, and `renderWidgetPage(...)` consumes that seam instead of keeping the raw `data-surface-inspector-edit-form` / `data-surface-inspector-proposal-form` / `data-surface-inspector-version-proposal-form` submit family inside `updateSurfaceInspectorUi()`
- [x] inspect surface-inspector panel/menu/editor markup is no longer owned inline by `plugins/inspect/widget-page.js`; that behavior now lives in `plugins/inspect/surface-inspector-panel-view.js`, and `renderWidgetPage(...)` consumes `renderSurfaceInspectorPanelView(...)`, `renderSurfaceInspectorMenuView(...)`, and `renderSurfaceInspectorEditorView(...)` instead of keeping the raw inspector HTML branches inline
- [x] inspect world command palette toggle/close/query/run/focus/shortcut wiring is no longer owned inline by `plugins/inspect/widget-page.js`; that behavior now lives in `plugins/inspect/world-command-actions.js`, and `renderWidgetPage(...)` consumes that seam instead of keeping the raw `data-world-command-*` listener family, focus branch, and shortcut binding inside `draw()`
- [x] inspect world mode-menu markup, world command-palette markup, and world tutorial-panel markup are no longer owned inline by `plugins/inspect/widget-page.js`; that behavior now lives in `plugins/inspect/world-surface-view.js`, and `renderWidgetPage(...)` now consumes `renderWorldModeMenuView(...)`, `renderWorldCommandPaletteView(...)`, and `renderWorldTutorialPanelView(...)` instead of keeping those raw world-surface HTML branches inline
- [x] inspect world source/workbench, thing-list, witness-browser, process-explorer, and primitive-browser markup are no longer owned inline by `plugins/inspect/widget-page.js`; that behavior now lives in `plugins/inspect/world-browser-view.js`, and `renderWidgetPage(...)` now consumes `renderWorldSourceDocumentView(...)`, `renderWorldThingListView(...)`, `renderWorldWitnessBrowserView(...)`, `renderWorldProcessExplorerView(...)`, and `renderWorldPrimitiveBrowserView(...)` instead of keeping those raw browser-mode HTML branches inline
- [x] inspect world inspector-pane markup plus graph/canvas node-edge-group markup are no longer owned inline by `plugins/inspect/widget-page.js`; that behavior now lives in `plugins/inspect/world-graph-view.js`, and `renderWidgetPage(...)` now consumes `renderWorldInspectorView(...)` plus `renderWorldGraphCanvasView(...)` instead of keeping those raw selected-object, kind-list, svg-edge, context-box, and world-node HTML branches inline
- [x] inspect world tutorial action wiring is no longer owned inline by `plugins/inspect/widget-page.js`; that behavior now lives in `plugins/inspect/world-tutorial-actions.js`, and `renderWidgetPage(...)` consumes that seam instead of keeping the raw `data-world-tutorial-*` listener family inside `draw()`
- [x] inspect world graph navigation/version/process/primitive wiring is no longer owned inline by `plugins/inspect/widget-page.js`; that behavior now lives in `plugins/inspect/world-graph-actions.js`, and `renderWidgetPage(...)` consumes that seam instead of keeping the raw `data-world-mode` / `data-world-node-id` / `data-world-select` / `data-world-kind` / `data-world-clear-kind` / `data-world-source-file` / `data-world-widget-activate` / `data-world-widget-rollback` / `data-world-open-process-program` / `data-world-jump-to-graph` / `data-world-close-source` / `data-world-primitive` / `data-world-primitive-kind-only` / `data-world-close-primitive` listener family inside `draw()`
- [x] inspect overlay shell creation plus world shell/post-render sync are no longer owned inline by `plugins/inspect/widget-page.js`; that behavior now lives in `plugins/inspect/surface-inspector-overlay-view.js`, `plugins/inspect/world-shell-view.js`, and `plugins/inspect/world-post-render.js`, and `renderWidgetPage(...)` now consumes those seams instead of keeping the raw overlay shell string, world shell string, pending-source reload branch, selected-node recenter branch, tutorial refocus/clear branch, and command-focus sync branch inline
- [x] focused source/runtime proof for the current inspect overlay/action slice is `cmd /c node --test plugins\\inspect\\world-graph-view.test.js plugins\\inspect\\world-browser-view.test.js plugins\\inspect\\world-surface-view.test.js plugins\\inspect\\surface-command-view.test.js plugins\\inspect\\surface-inspector-panel-view.test.js plugins\\inspect\\surface-inspector-overlay-view.test.js plugins\\inspect\\world-shell-view.test.js plugins\\inspect\\world-post-render.test.js plugins\\inspect\\world-graph-actions.test.js plugins\\inspect\\world-tutorial-actions.test.js plugins\\inspect\\world-command-actions.test.js plugins\\inspect\\surface-command-actions.test.js plugins\\inspect\\surface-command-identity-actions.test.js plugins\\inspect\\surface-inspector-actions.test.js plugins\\inspect\\surface-inspector-form-actions.test.js plugins\\inspect\\surface-inspector-version-actions.test.js plugins\\inspect\\inspect.test.js`
- [x] the previous Playwright-launch blocker for live tutorial overlay proof is obsolete; browser launch is available again in the current harness, and representative live overlay proof is green through `cmd /c node --test --test-name-pattern="live app tutorial reveals app and perspective concepts only when the tutorial reaches them" test\\ui.tutorial.test.js`
- [x] tutorial client binder/boot orchestration no longer remains page-local in `plugins/tutorial/tutorial-app-client.js`; that sequencing now lives in `plugins/tutorial/tutorial-client-bootstrap.js`, and `renderTutorialClient(...)` consumes `bindTutorialClientRuntimeAdapters(...)` plus `startTutorialClientRuntime(...)` instead of keeping the raw binder/boot handoff inline
- [x] tutorial client runtime assembly, helper wiring, and boot-time state/render composition no longer remain page-local in `plugins/tutorial/tutorial-app-client.js`; that assembly now lives in `plugins/tutorial/tutorial-client-runtime.js`, and `renderTutorialClient(...)` consumes `startTutorialClientRuntimeApp(...)` instead of keeping the remaining helper composition inline

Representative hotspots:

- `plugins/tutorial/tutorial-app-client.js:45`
- `plugins/tutorial/tutorial-app-client.js:104`
- `plugins/tutorial/tutorial-app-client.js:210`
- `plugins/tutorial/tutorial-app-client.js:250`

Recommended target form:

- reusable template widgets
- `frontendProgram`-driven state transitions

Important nuance:

- `plugins/inspect/widget-page.js` should not be treated as wholesale migration debt. Most of it is the generic widget runtime. Only the inspect-specific UI branches and overlay shells should be extracted.

### 8. `plugins/chart-runtime/chart-page.js` should stay code-first for now

Why it matters:

- It acts as a runtime assembly seam rather than authored product UI debt.
- The key behavior is bundling generic runtimes and domain std-lib modules into one module script and emitting the self-contained chart page/mounted runtime assets consumed by `plugin.chart-runtime`.

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
- [x] `plugins/bootstrap/bootstrap-shell.js` is now a thin page adapter that selects guidance and delegates authored page-main/page-shell rendering to `plugins/bootstrap/bootstrap-page-main.js` and `plugins/bootstrap/bootstrap-page-shell.js`, document assembly to `plugins/bootstrap/bootstrap-page-document.js`, and browser boot assembly to `plugins/bootstrap/bootstrap-page-script.js`
- [x] `plugins/eden/eden-page.js` surface shells and repeated panels
- [x] `plugins/chart-runtime/chart-page.js` remains intentionally code-first as a runtime assembly seam; focused proof in `plugins/chart-runtime/chart-runtime.test.js` now locks that it owns runtime bundle/page asset assembly and does not depend on `applyWitnessToml(...)`, `renderWidgetPage(...)`, or authored `frontendProgram` page runtime wiring
- [x] personal-room panel shell, editor fill/render, and login/create-update-delete/cancel/logout bind logic now live in `plugins/eden/eden-personal-client.js` through `renderEdenPersonalClientPrelude()`, `fillEdenPersonalEditor(...)`, `createEdenPersonalBoxSurfaceNode(...)`, and `renderEdenPersonalBoxPanel(...)`; `plugins/eden/eden-page.js` now consumes that seam instead of keeping the raw personal-room panel branch inline
- [x] commons/organization panel shell, summary/list render, and login/action bind logic now live in `plugins/eden/eden-organization-client.js` through `renderEdenOrganizationClientPrelude()`, `createEdenOrganizationSurfaceNode(...)`, and `renderEdenOrganizationPanel(...)`; `plugins/eden/eden-page.js` now consumes that seam instead of keeping the raw commons panel branch inline
- [x] capability-shelf panel shell, summary/list render, and login/refresh/logout bind logic now live in `plugins/eden/eden-capability-install-client.js` through `renderEdenCapabilityInstallClientPrelude()`, `createEdenCapabilityInstallSurfaceNode(...)`, and `renderEdenCapabilityInstallPanel(...)`; `plugins/eden/eden-page.js` now consumes that seam instead of keeping the raw capability-install panel branch inline
- [x] generic goto/default Eden surface shells now live in `plugins/eden/eden-surface-client.js` through `renderEdenSurfaceClientPrelude()`, `createEdenGotoSurfaceNode(...)`, and `createEdenDefaultSurfaceNode(...)`; `plugins/eden/eden-page.js` now consumes that seam instead of keeping the raw transport/default surface branches inline
- [x] chapter checkpoint/tracks/quests rendering now lives in `plugins/eden/eden-chapter-client.js` through `renderEdenChapterClientPrelude()`, `renderEdenCheckpoint(...)`, `renderEdenQuestCard(...)`, and `renderEdenTrackCard(...)`; `plugins/eden/eden-page.js` now consumes that seam instead of keeping the raw checkpoint/chapter card rendering inline
- [x] Eden page document shell, toolbar chrome, and chapter scaffold now live in `plugins/eden/eden-page-document.js` through `renderEdenPageDocument(...)`; `plugins/eden/eden-page.js` now consumes that seam instead of keeping the raw `<!doctype html>`, toolbar, stage shell, and chapter scaffold inline
- [x] embedded board surface shell, inspect/map mode chrome, and iframe load/inspect/command button bind logic now live in `plugins/eden/eden-embedded-client.js` through `renderEdenEmbeddedClientPrelude()`, `createEdenEmbeddedSurfaceNode(...)`, and `syncEdenEmbeddedSurfaceNode(...)`; `plugins/eden/eden-page.js` now consumes that seam instead of keeping the raw embedded board branch inline
- [x] embedded board inspect-mode state, iframe doc/window access, inspector/command palette toggles, command query seed, and inspect-mode sync/toggle bridge now live in `plugins/eden/eden-embedded-bridge.js` through `renderEdenEmbeddedBridgePrelude()`, `ensureEdenEmbeddedMode(...)`, `readEdenEmbeddedDocument(...)`, `setEdenEmbeddedSurfaceCommand(...)`, `syncEdenEmbeddedModeState(...)`, and `toggleEdenEmbeddedInspect(...)`; `plugins/eden/eden-page.js` now consumes that seam instead of keeping the raw embedded bridge/runtime glue inline
- [x] embedded board relief overlay projection and expert shortcut runtime now live in `plugins/eden/eden-embedded-runtime.js` through `renderEdenEmbeddedRuntimePrelude()`, `renderEdenEmbeddedRelief(...)`, `computeEdenReliefBoxes(...)`, and `openEdenExpertShortcut(...)`; `plugins/eden/eden-page.js` now consumes that seam instead of keeping the raw relief/command-surface runtime block inline
- [x] Eden refresh/projection runtime for personal box, page theme, versions, capability shelf, commons, theory annex, process preview, academy state, and multi-surface session rereads now lives in `plugins/eden/eden-refresh-runtime.js` through `renderEdenRefreshRuntimePrelude()`, `refreshEdenPersonalBox(...)`, `refreshEdenAcademyState(...)`, and `refreshEdenSessionSurfaces(...)`; `plugins/eden/eden-page.js` now consumes that seam instead of keeping the raw reread/session mutation block inline
- [x] Eden stage camera/prompt runtime and pointer/wheel/F1/reset/resize binding now live in `plugins/eden/eden-stage-runtime.js` through `renderEdenStageRuntimePrelude()`, `readEdenVisibleCheckpoint(...)`, `renderEdenConnections(...)`, `renderEdenPrompt(...)`, `initEdenCamera(...)`, and `bindEdenStageRuntime(...)`; `plugins/eden/eden-page.js` now consumes that seam instead of keeping the raw stage viewport/runtime block inline
- [x] Eden surface bind/ensure orchestration and main per-surface viewport dispatch now live in `plugins/eden/eden-surface-runtime.js` through `renderEdenSurfaceRuntimePrelude()`, `bindEdenSurfaceNode(...)`, `ensureEdenSurfaceNode(...)`, and `renderEdenSurfaceCollection(...)`; `plugins/eden/eden-page.js` now consumes that seam instead of keeping the raw surface orchestration branch inline
- [x] process-view panel shell, operator summary/quest/preview render, and login/inspect/drill/refresh/logout bind logic now live in `plugins/eden/eden-process-client.js` through `renderEdenProcessClientPrelude()`, `createEdenProcessSurfaceNode(...)`, and `renderEdenProcessPanel(...)`; `plugins/eden/eden-page.js` now consumes that seam instead of keeping the raw machine-room panel branch inline
- [x] theory-annex tree panel shell, summary/quest/lesson render, and login/study/assessment/teach-back/logout bind logic now live in `plugins/eden/eden-theory-client.js` through `renderEdenTheoryClientPrelude()`, `createEdenTheorySurfaceNode(...)`, and `renderEdenTheoryPanel(...)`; `plugins/eden/eden-page.js` now consumes that seam instead of keeping the raw theory-annex tree branch inline
- [x] versions panel shell, summary/diff/list render, and login/activate/restore/publish/refresh/logout bind logic now live in `plugins/eden/eden-versions-client.js` through `renderEdenVersionsClientPrelude()`, `createEdenVersionsSurfaceNode(...)`, and `renderEdenVersionsPanel(...)`; `plugins/eden/eden-page.js` now consumes that seam instead of keeping the raw versions panel branch inline
- [x] edit-page panel shell, treatment preview render, and login/apply/reset/logout bind logic now live in `plugins/eden/eden-edit-client.js` through `renderEdenEditClientPrelude()`, `createEdenEditPageSurfaceNode(...)`, and `renderEdenEditPagePanel(...)`; `plugins/eden/eden-page.js` now consumes that seam instead of keeping the raw page-theme panel branch inline
- [x] Eden page-local CSS now lives in `plugins/eden/eden-page-styles.js` through `EDEN_PAGE_CSS`; `plugins/eden/eden-page.js` now consumes that seam instead of keeping the page-local global `<style>` literal inline. The selectors remain page-local for now and are not yet shared primitives.
- [x] Eden runtime default/projection helpers for personal box, page theme, process view, versions, capability shelf, commons, theory annex, and `actionById(...)` now live in `plugins/eden/eden-projection-runtime.js` through `renderEdenProjectionRuntimePrelude()`, `readEdenPersonalBoxRuntime(...)`, `readEdenOrganizationRuntime(...)`, and `findEdenActionById(...)`; `plugins/eden/eden-page.js` now consumes that seam instead of keeping the raw runtime-default/projection block inline
- [x] Eden viewport/camera-target focus, zoom-range visibility, screen-rect projection, relief selection, surface meta-tag rendering, and checkpoint view recompute now live in `plugins/eden/eden-view-runtime.js` through `renderEdenViewRuntimePrelude()`, `focusEdenTarget(...)`, `projectEdenSurfaceRect(...)`, `applyEdenSurfaceMeta(...)`, and `renderEdenCheckpointView(...)`; `plugins/eden/eden-page.js` now consumes that seam instead of keeping that view-runtime block inline
- [x] Eden per-surface assembly glue and detail-dispatch adapters now live in `plugins/eden/eden-surface-adapters.js` through `renderEdenSurfaceAdaptersPrelude()`, `ensureEdenPageSurface(...)`, and `renderEdenPageSurfaceDetails(...)`; `plugins/eden/eden-page.js` now consumes that seam instead of keeping the `ensureSurface(...)`, `renderSurfaceDetails(...)`, and tree-panel adapter block inline
- [x] canvas page-local CSS and full document shell now live in `plugins/canvas/canvas-page-styles.js` and `plugins/canvas/canvas-page-document.js` through `CANVAS_PAGE_CSS` and `renderCanvasPageDocument(...)`; `plugins/canvas/canvas-page.js` now consumes those seams instead of keeping the page-local `<style>` literal, toolbar shell, timeline shell, stage shell, and inspector scaffold inline
- [x] canvas toolbar/timeline session, perspective, mode, undo/redo, and playback binding now live in `plugins/canvas/canvas-toolbar-runtime.js` through `renderCanvasToolbarRuntimePrelude()`, `runCanvasSessionTransition(...)`, and `bindCanvasToolbarRuntime(...)`; `plugins/canvas/canvas-page.js` now consumes that seam instead of keeping `initToolbar()` and those direct DOM listener registrations inline
- [x] canvas asset attach/detach requests, ingest/search repair actions, byte/download helpers, asset status summaries, and the active preview-mode/source/cache owner now live in `plugins/canvas/canvas-asset-runtime.js` through `renderCanvasAssetRuntimePrelude()`, `attachAsset(...)`, `retryAssetIngest(...)`, `formatBytes(...)`, `assetSearchSummary(...)`, and `ensureAssetPreview(...)`; `plugins/canvas/canvas-page.js` now consumes that seam for live behavior instead of keeping the asset runtime block inline
- [x] canvas session bootstrap/auth flows plus perspective/canvas fetch/process/upload helpers now live in `plugins/canvas/canvas-session-runtime.js` and `plugins/canvas/canvas-io-runtime.js` through `renderCanvasSessionRuntimePrelude()`, `renderCanvasIoRuntimePrelude()`, `initSession(...)`, `openSession(...)`, `post(...)`, `loadPerspectives(...)`, and `loadCanvas(...)`; `plugins/canvas/canvas-page.js` now consumes those seams instead of keeping that session/io runtime block inline
- [x] canvas witness-history fetch, projection-module load, replay projection, history-banner state, playback stop/scrub/exit flow, timeline tick rendering, and live witness-stream reread now live in `plugins/canvas/canvas-history-runtime.js` through `renderCanvasHistoryRuntimePrelude()`, `fetchWitnesses(...)`, `loadCanvasProjectionModule(...)`, `historyProjection(...)`, `setHistoryBanner(...)`, `scrubTo(...)`, `exitHistory(...)`, `renderTimeline(...)`, `toggleTimeline(...)`, and `startCanvasWitnessStream(...)`; `plugins/canvas/canvas-page.js` now consumes that seam instead of keeping the timeline/history runtime block inline
- [x] canvas pending outbox batching, delayed flush scheduling, camera/grid/style/move queueing, batch payload shaping, keepalive batch writeback, and pagehide/visibilitychange keepalive binding now live in `plugins/canvas/canvas-sync-runtime.js` through `renderCanvasSyncRuntimePrelude()`, `queueMove(...)`, `queueStyle(...)`, `queueCamera(...)`, `queueGrid(...)`, `buildBatchParams(...)`, `flushOutbox(...)`, `flushKeepalive(...)`, and `bindCanvasKeepaliveRuntime(...)`; `plugins/canvas/canvas-page.js` now consumes that seam instead of keeping that sync/runtime block inline
- [x] canvas draw-node/connector/grid/marquee rendering, surface resize, and dirty-frame boot now live in `plugins/canvas/canvas-render-runtime.js` through `renderCanvasRenderRuntimePrelude()`, `drawNode(...)`, `drawConnector(...)`, `drawGrid(...)`, `drawMarquee(...)`, `resizeCanvasSurface(...)`, `draw(...)`, `frame(...)`, and `startCanvasRenderRuntime(...)`; `plugins/canvas/canvas-page.js` now consumes that seam instead of keeping the render/runtime block inline
- [x] canvas inspector helper rows, derived-metadata rendering, asset attach/detach picker rendering, node/connector detail rendering, and palette rendering now live in `plugins/canvas/canvas-inspector-runtime.js` through `renderCanvasInspectorRuntimePrelude()`, `propRow(...)`, `appendAssetDerivedMetadata(...)`, `thingCatalog(...)`, `attachmentCandidatesForTarget(...)`, `attachmentTargetsForAsset(...)`, and `renderInspector(...)`; `plugins/canvas/canvas-page.js` now consumes that seam instead of keeping the live inspector runtime block inline
- [x] canvas overlay entry, overlay dismiss/commit handling, mode switching, pan-start helper, duplicate shortcut helper, and global keyboard shortcut binding now live in `plugins/canvas/canvas-interaction-runtime.js` through `renderCanvasInteractionRuntimePrelude()`, `showOverlay(...)`, `hideOverlay(...)`, `setMode(...)`, `startPan(...)`, `duplicateSelected(...)`, `bindCanvasOverlayInput(...)`, and `bindCanvasKeyboardShortcuts(...)`; `plugins/canvas/canvas-page.js` now consumes those seams instead of keeping that interaction/shortcut runtime block inline
- [x] canvas pointer geometry, viewport binding, and file-drop gesture runtime now live in `plugins/canvas/canvas-gesture-runtime.js` through `renderCanvasGestureRuntimePrelude()`, `pointerPosition(...)`, `hitInstance(...)`, `bindCanvasPointerRuntime(...)`, `bindCanvasViewportRuntime(...)`, and `bindCanvasDropRuntime(...)`; `plugins/canvas/canvas-page.js` now consumes that seam instead of keeping the inline gesture/runtime block locally

### Partial extraction targets

These should be split into authored shell plus code runtime:

- [x] `plugins/canvas/canvas-page.js` is now a thin page adapter that delegates page-local CSS to `plugins/canvas/canvas-page-styles.js`, document assembly to `plugins/canvas/canvas-page-document.js`, browser prelude assembly to `plugins/canvas/canvas-page-script.js`, and live boot sequencing to `plugins/canvas/canvas-client-runtime.js`
- [x] `plugins/eden/eden-page.js` is now a thin page adapter that delegates page-local CSS to `plugins/eden/eden-page-styles.js`, document assembly to `plugins/eden/eden-page-document.js`, browser prelude assembly and model injection to `plugins/eden/eden-page-script.js`, and live runtime boot/state orchestration to `plugins/eden/eden-client-runtime.js`
- [x] `plugins/tutorial/tutorial-app-client.js`
- [x] inspect overlay branches inside `plugins/inspect/widget-page.js`

### Keep in code for now

- [ ] `plugins/chart-runtime/chart-page.js`
- [ ] generic widget rendering and collection instantiation in `plugins/inspect/widget-page.js`
- [x] fallback stub HTML in `src/runtime-core-handlers.js` and `src/runtime-route-handlers.js`

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

- [x] define canonical design tokens once for color roles, spacing, radius, typography, elevation, and motion
- [x] move page-theme behavior onto a stable shared contract instead of ad hoc page-local variables
- [x] bootstrap no longer forks its own page token root in `plugins/bootstrap/bootstrap-shell-head.js`: `src/runtime-presentation.js` now owns the shared `bootstrap` presentation theme preset plus named button/state/status/code token roles, `src/runtime-surface-content-primitives.js` and `src/runtime-surface-form-controls.js` now consume those named roles instead of hard-coded state/button colors, and the authored `backend-seams` / `process-view` / bootstrap surfaces now continue through the same shared presentation/token owner rather than mixing a bootstrap-local `:root` override with shared primitives. Focused proof: `cmd /c node --test test\\runtime-presentation.test.js plugins\\bootstrap\\bootstrap-shell-head.test.js plugins\\bootstrap\\bootstrap.test.js plugins\\backend-seams\\backend-seams.test.js plugins\\inspect\\inspect.test.js` plus `cmd /c node --check src\\runtime-presentation.js src\\runtime-surface-content-primitives.js src\\runtime-surface-form-controls.js plugins\\bootstrap\\bootstrap-shell-head.js`
- [x] the shared presentation contract now names spacing, radius, elevation, and motion tokens in the same owner as the color and typography roles: `src/runtime-presentation.js` now emits shared `--space-*`, `--radius-*`, `--elevation-*`, and `--motion-*` vars, and `src/runtime-surface-content-primitives.js`, `src/runtime-surface-form-controls.js`, and `src/runtime-surface-inspector-primitives.js` now consume those roles instead of scattering more fixed px/radius/shadow values through shared surface CSS. Focused proof: `cmd /c node --test test\\runtime-presentation.test.js plugins\\bootstrap\\bootstrap-shell-head.test.js plugins\\bootstrap\\bootstrap.test.js plugins\\backend-seams\\backend-seams.test.js plugins\\inspect\\inspect.test.js` plus `cmd /c node --check src\\runtime-presentation.js src\\runtime-surface-content-primitives.js src\\runtime-surface-form-controls.js src\\runtime-surface-inspector-primitives.js plugins\\backend-seams\\backend-seams-page.js`
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
- [x] shared `surface-*` primitive selector ownership is now explicit in `src/runtime-surface-kit.js`; `src/runtime-presentation.js` now composes that shared primitive layer instead of owning the selector block inline, and `plugins/inspect/surface-kit-styles.js` re-exports the dedicated module for focused proof
- [x] shared surface primitive family ownership for form/button chrome and card/list/status/content shells is now explicit in `src/runtime-surface-form-controls.js` and `src/runtime-surface-content-primitives.js`; `src/runtime-surface-kit.js` now composes those families instead of owning those selectors as one monolithic block
- [x] shared status-block primitive ownership is now explicit through `surface-status` in `src/runtime-surface-content-primitives.js`; `plugins/backend-seams/backend-seams-page.wtoml` and `plugins/inspect/process-view-page.wtoml` now consume that named primitive instead of continuing to declare the older raw `status` class directly
- [x] shared inspector primitive selector ownership is now explicit in `src/runtime-surface-inspector-primitives.js`; `src/runtime-surface-kit.js` now composes that family, and `plugins/inspect/widget-page-styles.js` no longer keeps the reusable `.surface-inspector-*` selectors or `[data-surface-inspector-selected]` highlight state inline; current proof is `cmd /c node --test plugins\\inspect\\inspect.test.js` plus `cmd /c node --test --test-name-pattern="live page inspector exposes right-click widget inspection, version activation, and world handoff" test\\ui.live-inspector.test.js`
- [x] inspect command/inspector inline editor forms, compact action rows, version item lists, and boxed status notices now consume shared generic `surface-*` primitives instead of keeping that reusable chrome owned under inspect-specific selectors: `plugins/inspect/surface-inspector-panel-view.js` and `plugins/inspect/surface-command-view.js` now render `surface-form`, `surface-field`, `surface-actions-compact`, `surface-item-list`, `surface-item`, and `surface-status-box`; the reusable selector ownership now lives in `src/runtime-surface-form-controls.js` and `src/runtime-surface-content-primitives.js`, while `src/runtime-surface-inspector-primitives.js` is reduced back to inspect-specific panel/menu/grid/highlight chrome. Focused proof: `cmd /c node --test plugins\\inspect\\inspect.test.js plugins\\inspect\\surface-inspector-panel-view.test.js plugins\\inspect\\surface-command-view.test.js` plus `cmd /c node --check plugins\\inspect\\surface-inspector-panel-view.js`, `cmd /c node --check plugins\\inspect\\surface-command-view.js`, `cmd /c node --check src\\runtime-surface-form-controls.js`, `cmd /c node --check src\\runtime-surface-content-primitives.js`, and `cmd /c node --check src\\runtime-surface-inspector-primitives.js`
- [x] inspect world-graph widget-version status and compact activation/rollback chrome now also consume shared generic `surface-*` primitives instead of keeping that reusable status/action/item styling owned under `world-version-*` classes: `plugins/inspect/world-graph-view.js` now renders `surface-status-box`, `surface-actions-compact`, `surface-item-list`, and `surface-item` for the version-status, version-actions, and activation-history blocks, while `plugins/inspect/widget-page-styles.js` now keeps only the world-specific `world-version-item` layout delta instead of owning the shared status/action selector behavior. Focused proof: `cmd /c node --test plugins\\inspect\\inspect.test.js plugins\\inspect\\world-graph-view.test.js plugins\\inspect\\surface-inspector-panel-view.test.js plugins\\inspect\\surface-command-view.test.js` plus `cmd /c node --check plugins\\inspect\\world-graph-view.js` and `cmd /c node --check plugins\\inspect\\widget-page-styles.js`
- [x] inspect world tutorial card chrome, source workbench shell, and primitive/witness browser item rows now also consume shared generic `surface-*` primitives instead of keeping that reusable card/list/code/split-pane/button styling owned under world-local selectors: `plugins/inspect/world-surface-view.js` now renders `surface-card`, `surface-kicker`, `surface-note`, `surface-actions`, `surface-item-list`, and `surface-button-secondary` for the tutorial panel and disabled-scope rows; `plugins/inspect/world-browser-view.js` and `plugins/inspect/world-graph-view.js` now render `surface-split-pane`, `surface-item`, `surface-item-button`, `surface-link-item`, and `surface-code` for the source browser shell, primitive/thing browsers, witness cards, and world inspector/source snippets; selector ownership for those reusable shells now lives in `src/runtime-surface-content-primitives.js`, token values remain in `src/runtime-presentation.js`, and `plugins/inspect/widget-page-styles.js` now keeps only the world-specific residual selectors for tutorial tint/layout (`.world-tutorial-panel`, `.world-tutorial-item`), dark source-workbench theming (`.world-source-workbench`, `.world-source-sidebar`, `.world-source-editor`, `.world-source-title`, `.world-source-line*`, `.world-source-ref`, `.world-source-empty`), primitive browser grid composition (`.world-primitive-grid`, `.world-primitive-list`), and graph geometry/node styling. Focused proof: `cmd /c node --test plugins\\inspect\\world-surface-view.test.js plugins\\inspect\\world-browser-view.test.js plugins\\inspect\\world-graph-view.test.js plugins\\inspect\\inspect.test.js` plus `cmd /c node --check src\\runtime-surface-content-primitives.js plugins\\inspect\\world-surface-view.js plugins\\inspect\\world-browser-view.js plugins\\inspect\\world-graph-view.js plugins\\inspect\\widget-page-styles.js`
- [x] shared toolbar and two-column shell primitive ownership is now also explicit in `src/runtime-surface-content-primitives.js`: the shared layer now owns `surface-toolbar`, `surface-toolbar-spacer`, and `surface-shell-2`; `plugins/inspect/world-surface-view.js` now renders the world mode bar through `surface-header-bar surface-toolbar` plus `surface-toolbar-spacer`, `plugins/inspect/process-view-page.wtoml` now consumes that same `surface-toolbar` primitive for the authored process-view header, and `plugins/inspect/world-shell-view.js` now renders the world outer shell through `surface-shell-2` plus `surface-pane surface-stack` instead of leaving the entire shell structure owned under inspect-local classes alone. Residual page-local selectors in `plugins/inspect/widget-page-styles.js` now only own world-specific shell composition/tint details (`.world-graph-shell` column width + top border, `.world-mode-menu` no-wrap/detached-toolbar overrides, `.world-graph-inspector` flush pane overrides, and `.world-main-pane` row layout) rather than the shared toolbar or shell selector behavior itself. Focused proof: `cmd /c node --test plugins\\inspect\\world-shell-view.test.js plugins\\inspect\\world-surface-view.test.js plugins\\inspect\\inspect.test.js` plus `cmd /c node --check src\\runtime-surface-content-primitives.js plugins\\inspect\\world-shell-view.js plugins\\inspect\\world-surface-view.js plugins\\inspect\\widget-page-styles.js`
- [x] shared empty-state primitive ownership is now also explicit in `src/runtime-surface-content-primitives.js`: the shared layer now owns `surface-empty-state` as the reusable empty-result shell, `plugins/backend-seams/backend-seams-page.wtoml` and `plugins/inspect/process-view-page.wtoml` now consume `surface-empty surface-empty-state` for authored empty templates instead of leaving those states as plain muted text or ad hoc card fallbacks, and `plugins/inspect/world-browser-view.js` now uses the same primitive for source-browser empty states while leaving command-palette empty rows under the separate command-surface primitive family. Residual page-local ownership remains limited to dark-theme tint details for `.world-source-empty` in `plugins/inspect/widget-page-styles.js`; the empty-state structure, spacing, border, and generic muted-shell behavior now live in the shared primitive layer. Focused proof: `cmd /c node --test plugins\\backend-seams\\backend-seams.test.js plugins\\inspect\\world-browser-view.test.js plugins\\inspect\\inspect.test.js` plus `cmd /c node --check src\\runtime-surface-content-primitives.js plugins\\inspect\\world-browser-view.js plugins\\backend-seams\\backend-seams.test.js plugins\\inspect\\world-browser-view.test.js plugins\\inspect\\inspect.test.js`
- [x] the shared starter and inspect substrate chrome now also consumes shared generic `surface-*` primitives instead of leaving inspect-local CSS as the hidden owner of those authored surfaces: the historical starter fixture in `plugins/starter/todo-starter-legacy-fixture.json` still carries `surface-card`, `surface-stack`, `surface-status`, `surface-item-list`, `surface-item`, `surface-empty`, `surface-empty-state`, and `surface-mono` for the retained inspect-facing widget rows, while `src/runtime-surface-form-controls.js` now owns the generic `value-editor-field` selector because `plugins/inspect/widget-page.js` emits that label class from the shared widget runtime, and `plugins/inspect/widget-page-styles.js` now keeps only the inspect-specific residuals for session/editor accent borders (`.session-panel`, `.widget-editor`) rather than the full shared panel/list/item/input chrome. Focused proof: `cmd /c node --test plugins\\starter\\starter.test.js test\\tutorials.test.js plugins\\inspect\\inspect.test.js` plus `cmd /c node --check src\\runtime-surface-form-controls.js plugins\\inspect\\widget-page-styles.js plugins\\starter\\starter.test.js plugins\\inspect\\inspect.test.js`
- [x] shared command-surface primitive selector ownership is now explicit in `src/runtime-surface-command-primitives.js`; `src/runtime-surface-kit.js` now composes that family, and `plugins/inspect/widget-page-styles.js` no longer keeps the reusable `.surface-command-*` or `.world-command-*` palette/result selectors inline; current proof is `cmd /c node --test plugins\\inspect\\inspect.test.js` plus `cmd /c node --test --test-name-pattern="live page command surface can inspect a current-page widget and open its real process view" test\\ui.live-inspector.test.js` and `cmd /c node --test --test-name-pattern="world browser search and command surface can reach capabilities, hidden surfaces, and process view" test\\ui.world-browser.test.js`
- [x] shared tutorial primitive selector ownership is now explicit in `src/runtime-surface-tutorial-primitives.js`; `src/runtime-surface-kit.js` now composes that family, and `plugins/inspect/widget-page-styles.js` no longer keeps the reusable tutorial overlay/current-focus selector family inline (`[data-tutorial-focus-scope="true"]`, `[data-tutorial-current]`, `[data-tutorial-changed="true"]`, `.tutorial-overlay`, `.tutorial-dimmer`, `.tutorial-concept-*`, `.tutorial-resume`, and the tutorial pulse/click keyframes); while re-proving that move, `plugins/inspect/runtime.js` also had to restore active guidance injection on `page.world` so the shipped `/world` surface still embeds tutorial definition/state on reload instead of silently dropping to `surfaceStatus = "idle"`; current proof is `cmd /c node --test plugins\\inspect\\inspect.test.js` plus `cmd /c node --test --test-name-pattern="live app tutorial reveals app and perspective concepts only when the tutorial reaches them" test\\ui.tutorial.test.js` and `cmd /c node --test --test-name-pattern="world browser surfaces a real tutorial panel for world-scope guidance" test\\ui.world-browser.test.js`
- [x] bootstrap guidance card and overlay markup now also consume shared surface/tutorial primitives instead of the older bootstrap-local compatibility class vocabulary in `src/runtime-guidance-bootstrap-ui.js`: the card now uses `surface-card`, `surface-badge`, `surface-grid-2`, `surface-kicker`, `surface-actions`, `surface-button-secondary`, and `surface-status`, the overlay now uses `tutorial-dimmer`, `tutorial-overlay`, `tutorial-overlay-handle`, `tutorial-overlay-meta`, `surface-actions`, and `surface-button-secondary`, and the reusable `.tutorial-suggestion-*`, `.tutorial-disabled-*`, `.tutorial-hidden`, and drag-state selectors now live in `src/runtime-surface-tutorial-primitives.js` rather than being re-owned by the bootstrap helper. Focused proof: `cmd /c node --test src\\runtime-guidance-bootstrap-ui.test.js plugins\\bootstrap\\bootstrap-shell-head.test.js plugins\\bootstrap\\bootstrap-page-main-slots.test.js plugins\\inspect\\inspect.test.js test\\plugin-boundaries.test.js`
- [x] bootstrap guidance concept/suggestion/disabled-scope row DOM assembly now also lives in `src/runtime-guidance-bootstrap-view.js` through `renderBootstrapGuidanceConceptList(...)`, `renderBootstrapGuidanceSuggestionList(...)`, and `renderBootstrapGuidanceDisabledRows(...)`; `src/runtime-guidance-bootstrap-client.js` now serializes and consumes those helpers inside its emitted state runtime instead of keeping the product-visible row construction inline beside guidance progress/state logic. Focused proof: `cmd /c node --test src\\runtime-guidance-bootstrap-view.test.js src\\runtime-guidance-bootstrap-ui.test.js test\\runtime-guidance.test.js plugins\\bootstrap\\bootstrap-page-main-slots.test.js test\\plugin-boundaries.test.js`
- [x] bootstrap guidance card chapter/status/button projection now also lives in `src/runtime-guidance-bootstrap-card-view.js` through `buildBootstrapGuidanceCardView(...)` and `renderBootstrapGuidanceChapterList(...)`; `src/runtime-guidance-bootstrap-controller-client.js` now serializes and consumes that helper inside its emitted controller runtime instead of keeping the chapter-list HTML assembly plus summary/resume/back/skip/exit/reset/restart/disable button-state rules inline beside interaction ceremony. Focused proof: `cmd /c node --test src\\runtime-guidance-bootstrap-card-view.test.js src\\runtime-guidance-bootstrap-view.test.js test\\runtime-guidance.test.js plugins\\bootstrap\\bootstrap-page-main-slots.test.js test\\plugin-boundaries.test.js`
- [x] bootstrap guidance controller-local DOM mechanics now also live in `src/runtime-guidance-bootstrap-interactions.js` through `createBootstrapGuidanceInteractionRuntime(...)`; `src/runtime-guidance-bootstrap-controller-client.js` now serializes and consumes that helper inside its emitted controller runtime instead of keeping target highlight clearing, scope focus, form fill, pulse/auto-click feedback, overlay positioning/drag coordination, and active-step target marking inline beside tutorial state transitions. Focused proof: `cmd /c node --test src\\runtime-guidance-bootstrap-interactions.test.js src\\runtime-guidance-bootstrap-card-view.test.js src\\runtime-guidance-bootstrap-view.test.js test\\runtime-guidance.test.js plugins\\bootstrap\\bootstrap-page-main-slots.test.js test\\plugin-boundaries.test.js`
- [x] bootstrap top cards and starter controls now consume shared surface primitives for badges, secondary-button chrome, two-column field grids, and callout notes through `surface-badge`, `surface-button-secondary`, `surface-grid-2`, and `surface-note-callout` instead of the older local `badge`, `secondary`, `grid two`, and `note` class family
- [x] bootstrap top-card summaries/status blocks, bootstrap guidance chapter/status text, and the live authored bootstrap form roots used by identity/session, app-authoring, backend-authoring, and backend-version controls now consume the shared `surface-mono` form/content contract instead of relying on the bootstrap-shell head to force monospace styling through a page-local id-selector list: `plugins/bootstrap/bootstrap-top-cards.wtoml` now marks the bootstrap/session/desktop text blocks and the operator/identity/session forms with `surface-mono`, `plugins/bootstrap/bootstrap-app-authoring-controls.wtoml`, `plugins/bootstrap/bootstrap-backend-authoring-controls.wtoml`, and `plugins/bootstrap/bootstrap-backend-version-controls.wtoml` now mark the relevant authored form roots with `surface-stack surface-mono`, `src/runtime-guidance-bootstrap-ui.js` and `src/runtime-guidance-bootstrap-card-view.js` now emit `surface-mono` on tutorial summary/status/chapter-id text, `src/runtime-surface-form-controls.js` now owns the reusable `.surface-mono input/select/textarea` rule, and `plugins/bootstrap/bootstrap-shell-head.js` no longer carries the old `#identity-form input`, `#bootstrap-summary`, `#session-summary`, `#tutorial-status`, and related bootstrap-only selector list. Focused proof: `cmd /c node --test plugins\\bootstrap\\bootstrap-shell-head.test.js plugins\\bootstrap\\bootstrap.test.js src\\runtime-guidance-bootstrap-ui.test.js src\\runtime-guidance-bootstrap-card-view.test.js` plus `cmd /c node --check plugins\\bootstrap\\bootstrap-shell-head.js`, `cmd /c node --check src\\runtime-guidance-bootstrap-ui.js`, and `cmd /c node --check src\\runtime-guidance-bootstrap-card-view.js`
- [x] bootstrap page-main inventory and runtime-plugin review sections now consume shared surface primitives for cards, stacks, badges, callout notes, inventory grids, section kickers, and state inventories through `surface-card`, `surface-stack`, `surface-badge`, `surface-note-callout`, `surface-grid-2`, `surface-grid-auto`, `surface-kicker`, `surface-state-list`, and `surface-state-item`; `bootstrap-state-list-render.js` and `bootstrap-runtime-plugin-review-view.js` now emit the shared inventory row classes instead of the older local `state-list` / `state-item` family
- [x] bootstrap top-card operator inventory lists and authored checkbox label rows now also consume the shared `surface-kicker` and `surface-state-list` primitives instead of the older raw `kicker` / `state-list` classes, and `plugins/bootstrap/bootstrap-shell-head.js` no longer carries the bootstrap-only `.state-list` / `.state-item` compatibility block for those authored sections. Focused proof: `cmd /c node --test plugins\\bootstrap\\bootstrap-page-main.test.js plugins\\bootstrap\\bootstrap-page-main-slots.test.js plugins\\bootstrap\\bootstrap.test.js`
- [x] bootstrap runtime-plugin and MCP direct authored controls now consume shared surface primitives for stack layout, action rows, two-column field grids, callout help text, and secondary destructive-adjacent buttons through `surface-stack`, `surface-actions`, `surface-grid-2`, `surface-note-callout`, and `surface-button-secondary` in `bootstrap-runtime-integration-controls.wtoml` and the runtime-plugin/MCP sections of `bootstrap-remove-controls.wtoml`
- [x] bootstrap app-authoring and backend-authoring authored controls now consume shared surface primitives for stacked control groups, action rows, two-column field grids, and authored callout help text through `surface-stack`, `surface-actions`, `surface-grid-2`, and `surface-note-callout` in `bootstrap-app-authoring-controls.wtoml` and `bootstrap-backend-authoring-controls.wtoml`
- [x] bootstrap backend-version authored controls and the capability-remove section of `bootstrap-remove-controls.wtoml` now consume shared surface primitives for stacked control groups, two-column field grids, callout help text, explicit status blocks, action rows, and secondary destructive-adjacent buttons through `surface-stack`, `surface-grid-2`, `surface-note-callout`, `surface-status`, `surface-actions`, and `surface-button-secondary`
- [x] bootstrap contextual remove and stewardship remove authored controls now consume shared surface primitives for stacked control groups, two-column field grids, and action rows through `surface-stack`, `surface-grid-2`, and `surface-actions` in the contextual/stewardship sections of `bootstrap-remove-controls.wtoml`
- [x] the remaining authored bootstrap status blocks and the desktop launcher shell now consume the explicit `surface-status` primitive instead of the older raw `status` class; current authored consumers in `plugins/bootstrap/*.wtoml` and `src/desktop-launcher-shell.wtoml` now align with the shared status primitive boundary
- [x] bootstrap capability define/install controls plus proposal create/review authored controls now consume shared surface primitives for stacked control groups, two-column field grids, action rows, and callout help text through `surface-stack`, `surface-grid-2`, `surface-actions`, and `surface-note-callout` in `bootstrap-capability-controls.wtoml`, `bootstrap-proposal-create-controls.wtoml`, and `bootstrap-proposal-review-controls.wtoml`
- [x] bootstrap scoped create controls now consume shared surface primitives for stacked control groups, two-column field grids, and action rows through `surface-stack`, `surface-grid-2`, and `surface-actions` in `bootstrap-scoped-controls.wtoml`
- [x] extract `card`, `button`, `form`, `status`, `list`, and `inspector` primitives next
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

- [x] authored semantic actions may use native route refresh, `navigate`, canonical query-state synchronization, and route-backed boundary operations
- [x] there is no longer a generic host-bridge frontend op; reusable behavior must lower into first-class route, surface, process, boundary, policy, or capability semantics
- [ ] host listeners should act as adapters that translate one named semantic outcome into one existing shell/runtime capability; they should not become a second hidden controller for the whole page
- [ ] when a host listener exists, record the producer action, event name, receiving adapter, and remaining reason it cannot yet collapse into a shared runtime seam
- [ ] do not encode endpoint choreography, edit-mode branching, or product validation logic inside host listeners just because the listener is now "generic"
- [ ] if multiple authored actions start dispatching the same host event, document the expected contract and payload shape here before expanding that pattern further
- [x] do not use `dispatchDomEvent` as a generic escape hatch for arbitrary page scripting; the primitive is retired, and reusable behavior must be promoted into first-class native runtime semantics instead
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
- [x] remove generic `dispatchDomEvent` support from `plugins/inspect/widget-page.js`, `src/runtime-host-route-factory.js`, and `src/runtime-builtins.js`, and fail fast when authored material still attempts to use it
- [x] keep shared WTOML/apply-path coverage aligned with renderer-supported widget sections by adding native runtime declaration support for `label`, `textarea`, `details`, `summary`, and `valueEditor` in `src/desire/apply.js`, then re-prove that parity in `test/dsl.test.js`
- [x] extend `renderCollection(...)` to accept either a state-path string or a direct interpolated array value
- [x] add an explicit runtime-supported way to assign dynamic instance widget ids for repeated templates while keeping template ids stable for lookup
- [x] keep these seams generic; do not add `process-view`-specific or `bootstrap`-specific variants of them

#### Hard-coded product behavior: `bootstrap-shell`

Observed shape:

- `plugins/bootstrap/bootstrap-shell.js` now renders the extracted bootstrap authoring controls through authored `WTOML` helper renderers rather than keeping the create-form markup inline; the previously residual `context-form`, `perspective-form`, `widget-form`, `program-form`, `step-form`, `route-form`, `serve-form`, and `runner-form` are no longer hard-coded in the returned document string
  The legacy `program-form` and `step-form` controls were subsequently removed after hard retirement of public `frontendProgram` and `frontendStep` authoring.
- `plugins/bootstrap/bootstrap-shell.js` no longer owns `bindCreate(...)`; create-form request shaping and submit/reset/refresh follow-up now live in `plugins/bootstrap/bootstrap-app-authoring-submit.js`
- the page-level reread choreography for `/api/bootstrap-model`, `/api/bootstrap-state`, `/api/session`, desktop shell state, runtime-plugin review reload, tutorial progress reload, and the `render(); await requestMaybeAdvanceTutorial(); render();` sequence now lives in `plugins/bootstrap/bootstrap-refresh-runtime.js`
- the starter/desktop/form-access wrapper sync/apply projection is no longer shell-local; those view owners now live in the extracted helper seams already named in this audit
- the direct `witness:bootstrap-proposal-adjacent-submit` listener is no longer shell-local; submit registration now lives in `plugins/bootstrap/bootstrap-proposal-adjacent-submit.js` through `bindBootstrapProposalAdjacentSubmit(...)`
- the thin tutorial state/controller/host adapter assembly is no longer shell-local; that bootstrap-specific assembly now lives in `plugins/bootstrap/bootstrap-tutorial-runtime.js`
- the final render/runtime sequencing that used to stay inline in `render()` is no longer shell-local; that bootstrap-specific render pipeline now lives in `plugins/bootstrap/bootstrap-shell-render-runtime.js`
- route-authoring change ownership now comes from direct authored field change and input handling on the bootstrap route form, while runtime-plugin review change ownership now comes from the authored `bootstrap_page_main_program` in `plugins/bootstrap/bootstrap-page-main.wtoml`; the receiving adapters remain `plugins/bootstrap/bootstrap-route-authoring-sync.js` and `plugins/bootstrap/bootstrap-runtime-plugin-review-sync.js` without routing through `dispatchDomEvent`

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
- tutorial client runtime assembly now lives in `plugins/tutorial/tutorial-client-runtime.js`, leaving `plugins/tutorial/tutorial-app-client.js` as a thin script wrapper

Audit conclusion:

- tutorial progress observation is generic and reusable
- tutorial client assembly is now a thin adapter over helper-owned runtime seams
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
- [x] the historical starter substrate now lives in `plugins/starter/todo-starter-legacy-fixture.json`, and `todoStarterBlueprint()` in `plugins/starter/starter-blueprints.js` now clones that legacy fixture only for non-runnable historical rows while composing the maintained runnable starter from native `page.surface` nouns
- [x] bootstrap no longer manually injects the starter blueprint into the starter seam; the starter provider in `plugins/starter/runtime.js` contributes the maintained native starter into runtime contributions, `preferredBootstrapStarter(...)` selects the active bootstrap starter upstream, and `buildBootstrapStarterPlan(...)` now receives only `bootstrapModel`, `bootstrapState`, and the already-selected `blueprint`
- [x] the real maintained starter request order now lives in authored `requestPlan` rows returned by `todoStarterBlueprint()`, and `buildBootstrapStarterPlan(...)` plus `buildBootstrapAuthoredRequestPlanRequests(...)` interpret those rows instead of hard-coding the request sequence locally; the helper now omits retired `/api/frontend-programs` and `/api/frontend-steps` calls from the runnable path
- [x] starter existing-state elision now lives in authored `skipIfPresentIn` plus `matchField` request-plan rows returned by `todoStarterBlueprint()`, and the starter plan/request-plan seams now interpret those rows generically instead of hard-coding `existingContext` / `existingRunner` branches
- [x] starter host-owner remapping and activation-body shaping no longer live as starter-specific `bodyMap` branches inside `plugins/bootstrap/bootstrap-starter-plan.js`; the maintained native starter blueprint now supplies generic placeholder and `pickFields` intent while the helper interprets those mechanics generically
- [x] starter authored request iteration, placeholder resolution, skip logic, body shaping, and URL-template expansion no longer live inline inside `plugins/bootstrap/bootstrap-starter-plan.js`; those generic request-plan mechanics now live in `plugins/bootstrap/bootstrap-authored-request-plan.js`, while `buildBootstrapStarterPlan(...)` keeps only starter-specific blueprint selection plus bootstrap host default selection
- [x] starter/open-app host-action binding plus action-family meaning now live in `plugins/bootstrap/bootstrap-host-actions.js`, injected into the live shell/browser runtime through `renderBootstrapHostActionFactory()`, rather than remaining embedded directly in `plugins/bootstrap/bootstrap-shell.js`
- [x] starter success refresh binding plus source allow-list routing now live in `plugins/bootstrap/bootstrap-host-refresh.js`, injected into the live shell/browser runtime through `renderBootstrapHostRefreshFactory()`, rather than remaining embedded directly in `plugins/bootstrap/bootstrap-shell.js`
- [x] starter button enable/disable projection now lives in `plugins/bootstrap/bootstrap-starter-controls-view.js`, injected into the live shell/browser runtime through `renderBootstrapStarterControlsViewFactory()`, rather than remaining embedded directly in `plugins/bootstrap/bootstrap-shell.js`
- [x] starter app-home reread/same-URL navigation policy now lives in `plugins/bootstrap/bootstrap-host-navigation.js`, injected into the live shell/browser runtime through `renderBootstrapHostNavigationFactory()`, rather than remaining embedded directly in `plugins/bootstrap/bootstrap-shell.js`
- [x] starter no longer keeps a unique shell-local post-create follow-up path; the previous refresh-binding, host-action, navigation, and button-disabled owners now all have explicit shared or authored seams
- do not treat the starter slice as proof that broader bootstrap projection cleanup is complete; the authored trigger path, maintained native starter blueprint, authored request order, authored skip/pick rules, explicit host refresh, explicit host-action bridge, shared host-refresh seam, shared host-action seam, shared same-URL handoff policy, shared starter control-view seam, shared desktop control-view seam, and shared form-access seam are proven here, but other bootstrap-specific submit/help/option projection still remains local

### Bootstrap residual local-state warnings

The remaining bootstrap debt is not just "more forms". The following local-state patterns are the current places most likely to cause unattended drift if they are migrated casually.

- as of 2026-06-15, the exact residual shell-local owners are narrower than the earlier create-form frontier: the full bootstrap HTML document shell plus the remaining refresh/render construction order that still composes extracted seams into the page adapter
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
- [x] starter request-plan choreography now lives across `plugins/starter/starter-blueprints.js`, `plugins/starter/runtime.js`, `preferredBootstrapStarter(...)`, `plugins/bootstrap/bootstrap-contribution-state.js`, `plugins/bootstrap/bootstrap-starter-plan.js`, and `plugins/bootstrap/bootstrap-authored-request-plan.js`: the starter plugin contributes the maintained native blueprint, `buildBootstrapContributionState(...)` exposes the selected active blueprint to bootstrap state, `buildBootstrapStarterPlan(...)` supplies bootstrap host defaults, and `buildBootstrapAuthoredRequestPlanRequests(...)` interprets the authored `requestPlan` rows for the real request order plus `skipIfPresentIn` / `matchField` / `pickFields` rules while the old JSON asset remains historical substrate only
- [x] backend authoring control-view build/apply choreography now lives in `plugins/bootstrap/bootstrap-backend-authoring-controls-view.js` and reaches the browser runtime through `renderBootstrapBackendAuthoringControlsViewFactory()` in `plugins/bootstrap/bootstrap-shell.js`
- [x] backend authoring submit choreography no longer lives as raw authored `postJson` plus `witness:host-refresh` steps inside `plugins/bootstrap/bootstrap-backend-authoring-controls.wtoml`; those authored controls now dispatch `witness:bootstrap-backend-authoring-submit`, while `plugins/bootstrap/bootstrap-backend-authoring-submit.js` owns the request/status/reset/refresh contract through `renderBootstrapBackendAuthoringSubmitFactory()` in `plugins/bootstrap/bootstrap-page-script.js` plus `bindBootstrapBackendAuthoringSubmit(...)` in `plugins/bootstrap/bootstrap-client-runtime.js`. Focused proof: `cmd /c node --test plugins\\bootstrap\\bootstrap-backend-authoring-submit.test.js plugins\\bootstrap\\bootstrap-client-runtime.test.js plugins\\bootstrap\\bootstrap.test.js test\\bootstrap-shell-desktop.test.js`
- [x] backend authoring option/fallback projection now also lives in `plugins/bootstrap/bootstrap-backend-authoring-controls-view.js` through `buildBootstrapBackendAuthoringControlsProjection(...)`, while current form reads now flow through the shared backend sync/dependency seam instead of a shell-local backend state slot
- [x] authored backend version controls currently live in `plugins/bootstrap/bootstrap-backend-version-controls.wtoml`
- [x] backend version control-view build/apply choreography now lives in `plugins/bootstrap/bootstrap-backend-version-controls-view.js` and reaches the browser runtime through `renderBootstrapBackendVersionControlsViewFactory()` in `plugins/bootstrap/bootstrap-shell.js`
- [x] backend activate/rollback submit choreography no longer lives as raw authored `postJson` plus `witness:host-refresh` steps inside `plugins/bootstrap/bootstrap-backend-version-controls.wtoml`; those authored controls now dispatch `witness:bootstrap-backend-version-submit`, while `plugins/bootstrap/bootstrap-backend-version-submit.js` owns the request/status/refresh contract through `renderBootstrapBackendVersionSubmitFactory()` in `plugins/bootstrap/bootstrap-page-script.js` plus `bindBootstrapBackendVersionSubmit(...)` in `plugins/bootstrap/bootstrap-client-runtime.js`. Focused proof: `cmd /c node --test plugins\\bootstrap\\bootstrap-backend-version-submit.test.js plugins\\bootstrap\\bootstrap-client-runtime.test.js plugins\\bootstrap\\bootstrap.test.js test\\bootstrap-shell-desktop.test.js`
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
  Current truth: only the canonical forms remain live in bootstrap; the legacy `program-form` and `step-form` authored roots were removed when public legacy frontend authoring was retired.
- [x] bootstrap app-authoring create-form submit routing now lives in `plugins/bootstrap/bootstrap-app-authoring-submit.js` through `buildBootstrapAppAuthoringSubmitRequest(...)`, `runBootstrapAppAuthoringSubmit(...)`, and `bindBootstrapAppAuthoringSubmit(...)`, while `plugins/bootstrap/bootstrap-shell.js` now binds that seam instead of owning `bindCreate(...)`
- [x] route-authoring guidance recompute now lives in `plugins/bootstrap/bootstrap-route-authoring-sync.js` through `buildBootstrapRouteAuthoringView(...)`, `applyBootstrapRouteAuthoringView(...)`, `runBootstrapRouteAuthoringSync(...)`, `bindBootstrapRouteAuthoringSync(...)`, `buildBootstrapRouteAuthoringSyncDeps(...)`, and `createBootstrapRouteAuthoringSyncDepsBuilder(...)`; `plugins/bootstrap/bootstrap-app-authoring-controls.wtoml` now dispatches `witness:bootstrap-route-authoring-sync`, and `plugins/bootstrap/bootstrap-shell.js` now consumes that seam instead of keeping `updateRouteAuthoringFields()` plus the route-field listener loop inline
- [x] runtime-plugin review change/recompute ownership now lives in `plugins/bootstrap/bootstrap-runtime-plugin-review-sync.js` through `resolveBootstrapRuntimePluginReviewSelection(...)`, `loadBootstrapRuntimePluginReview(...)`, `selectBootstrapRuntimePluginReviewPlugin(...)`, `createBootstrapRuntimePluginReviewSyncHandler(...)`, and `bindBootstrapRuntimePluginReviewSync(...)`; `plugins/bootstrap/bootstrap-page-main.wtoml` now declares the runner/plugin review `change` intent through `bootstrap_page_main_program` plus `witness:bootstrap-runtime-plugin-review-sync`, and the bootstrap browser runtime consumes that seam instead of binding raw review-field listeners inline
- [x] runtime-plugin review option-label, summary-text, and detail-block rendering now also live in `plugins/bootstrap/bootstrap-runtime-plugin-review-view.js` through `runtimePluginReviewRows(...)`, `runtimePluginReviewOptionLabel(...)`, `buildBootstrapRuntimePluginPreviewSummary(...)`, and `buildBootstrapRuntimePluginReviewView(...)`; the review view now returns structured `detailItems` rather than HTML strings, `plugins/bootstrap/bootstrap-state-list-render.js` owns the shared `renderBootstrapStateItems(...)` DOM write seam, and the bootstrap browser runtime consumes those seams instead of keeping raw review display formulas or `innerHTML` assembly inline
- [x] bootstrap state inventory row-label and changed-row rendering now also live in `plugins/bootstrap/bootstrap-state-list-render.js` through `renderBootstrapStateList(...)`, `mcpServerInventoryLabel(...)`, `mcpToolInventoryLabel(...)`, and `renderBootstrapStateInventory(...)`, and `plugins/bootstrap/bootstrap-shell.js` now consumes that seam instead of keeping the state-list render cluster inline
- [x] bootstrap render-time summary/status copy plus direct select-fill ownership now also live in `plugins/bootstrap/bootstrap-shell-render-view.js` through `buildBootstrapShellStatusView(...)`, `applyBootstrapShellStatusView(...)`, and `applyBootstrapShellSelectFill(...)`, and `plugins/bootstrap/bootstrap-shell.js` now consumes that seam instead of keeping those summary strings and direct `fillSelect(...)` calls inline
- [x] bootstrap tutorial runtime snapshot publication now also lives in `plugins/bootstrap/bootstrap-tutorial-runtime-view.js` through `buildBootstrapTutorialRuntimeView(...)`, and `plugins/bootstrap/bootstrap-shell.js` now consumes that seam instead of assembling `window.__witnessTutorial` inline
- [x] bootstrap tutorial state/controller/host adapter assembly now also lives in `plugins/bootstrap/bootstrap-tutorial-runtime.js` through `createBootstrapTutorialRuntime(...)`, and `plugins/bootstrap/bootstrap-shell.js` now consumes that seam instead of keeping the bootstrap-specific tutorial/runtime assembly inline
- [x] bootstrap proposal-adjacent submit registration now also lives in `plugins/bootstrap/bootstrap-proposal-adjacent-submit.js` through `bindBootstrapProposalAdjacentSubmit(...)`, and `plugins/bootstrap/bootstrap-shell.js` now consumes that seam instead of keeping the raw `witness:bootstrap-proposal-adjacent-submit` listener inline
- [x] bootstrap render/runtime sequencing now also lives in `plugins/bootstrap/bootstrap-shell-render-runtime.js` through `createBootstrapRenderRuntime(...)`, and `plugins/bootstrap/bootstrap-shell.js` now consumes that seam instead of sequencing the remaining render pipeline inline
- [x] bootstrap browser-runtime assembly now also lives in `plugins/bootstrap/bootstrap-client-runtime.js` through `startBootstrapClientRuntime(...)`, and `plugins/bootstrap/bootstrap-shell.js` now consumes that seam instead of keeping the remaining state/request/binder composition inline beside the authored page document
- [x] bootstrap live request/post transport now also lives in `plugins/bootstrap/bootstrap-client-http.js` through `createBootstrapClientHttp(...)` plus `renderBootstrapClientHttpFactory()`, and `plugins/bootstrap/bootstrap-client-runtime.js` now consumes that shared helper instead of keeping request/status-code/error decoding and JSON submit body serialization inline in `startBootstrapClientRuntime(...)`
- [x] bootstrap outer page-shell chrome now also lives in authored `plugins/bootstrap/bootstrap-page-shell.wtoml` through `renderBootstrapAuthoredPageShell(...)`, and `plugins/bootstrap/bootstrap-shell.js` now consumes that seam instead of keeping the sticky header copy and body wrapper inline
- [x] bootstrap document wrapper now also lives in `plugins/bootstrap/bootstrap-page-document.js` through `renderBootstrapPageDocument(...)`, and `plugins/bootstrap/bootstrap-shell.js` now consumes that seam instead of keeping the raw `<!doctype html>`, `<html>`, `<body>`, and script-tag framing inline
- [x] bootstrap injected browser-script factory assembly now also lives in `plugins/bootstrap/bootstrap-page-script.js` through `renderBootstrapPageScript(...)`, and `plugins/bootstrap/bootstrap-shell.js` now consumes that seam instead of keeping the long factory import/injection list and final `startBootstrapClientRuntime(...)` boot call inline
- [x] bootstrap page-main slot assembly now also lives in `plugins/bootstrap/bootstrap-page-main-slots.js` through `buildBootstrapPageMainSlots(...)`, while the authored slot inventory now lives in `plugins/bootstrap/bootstrap-page-main-slots.wtoml`; `plugins/bootstrap/bootstrap-shell.js` now consumes that seam instead of enumerating the authored control-root slot inventory inline
- [x] bootstrap page-main seed aggregation now lives in `plugins/bootstrap/bootstrap-page-main-seed-state.js` through `buildBootstrapPageMainSeedState(...)`, tutorial-card replacement composition now lives in `plugins/bootstrap/bootstrap-page-main-replacement-content.js` through `buildBootstrapPageMainReplacementContent(...)`, and bootstrap identity edit-mode parsing now lives in `plugins/bootstrap/bootstrap-identity-view-state.js` through `buildBootstrapIdentityView(...)`; `plugins/bootstrap/bootstrap-page-main-slots.js` now consumes those seams instead of keeping bootstrap-specific seed/projection adapter logic inline beside the slot renderer
- [x] bootstrap authored page helper mechanics now also live in `plugins/bootstrap/bootstrap-page-helpers.js` through `renderBootstrapJsonForScript(...)`, `bootstrapWtomlSource(...)`, `extractBootstrapBodyInner(...)`, `replaceBootstrapSectionSlot(...)`, `replaceBootstrapWholeSection(...)`, `renderBootstrapAuthoredWidget(...)`, and `renderBootstrapAuthoredSlot(...)`; `plugins/bootstrap/bootstrap-page-main.js`, `plugins/bootstrap/bootstrap-page-shell.js`, `plugins/bootstrap/bootstrap-page-script.js`, and `plugins/bootstrap/bootstrap-page-main-slots.js` now consume that seam instead of each keeping their own JSON-script escaping, WTOML loading, body extraction, slot-replacement, or seeded-slot wrapper helpers. Focused proof: `cmd /c node --test plugins\\bootstrap\\bootstrap-page-helpers.test.js plugins\\bootstrap\\bootstrap-page-main.test.js plugins\\bootstrap\\bootstrap-page-main-slots.test.js plugins\\bootstrap\\bootstrap-page-shell.test.js plugins\\bootstrap\\bootstrap-page-script.test.js` plus `cmd /c node --test plugins\\bootstrap\\bootstrap.test.js`
- [x] bootstrap page-main slot manifest loading plus authored-slot render selection now also live in `plugins/bootstrap/bootstrap-page-slot-manifest.js` through `loadBootstrapPageSlotDefinitions(...)`, `renderBootstrapPageSlotDefinition(...)`, and `renderBootstrapPageSlotDefinitions(...)`; `plugins/bootstrap/bootstrap-page-main-slots.js` now consumes that seam instead of mixing manifest parsing, per-slot definition mapping, and final slot-object assembly inline beside the page-main seed/replacement adapters
- [x] the current focused proof set for the bootstrap render/view/tutorial slices is `cmd /c node --test plugins\\bootstrap\\bootstrap-shell-render-runtime.test.js plugins\\bootstrap\\bootstrap-tutorial-runtime.test.js plugins\\bootstrap\\bootstrap-tutorial-runtime-view.test.js plugins\\bootstrap\\bootstrap-shell-render-view.test.js plugins\\bootstrap\\bootstrap-state-list-render.test.js plugins\\bootstrap\\bootstrap-runtime-plugin-review-view.test.js plugins\\bootstrap\\bootstrap-refresh-runtime.test.js plugins\\bootstrap\\bootstrap-shell-view-state.test.js plugins\\bootstrap\\bootstrap.test.js plugins\\bootstrap\\bootstrap-route-authoring-sync.test.js plugins\\bootstrap\\bootstrap-runtime-plugin-review-sync.test.js plugins\\bootstrap\\bootstrap-app-authoring-submit.test.js plugins\\bootstrap\\bootstrap-proposal-adjacent-submit.test.js test\\bootstrap-shell-desktop.test.js` plus `cmd /c node --test --test-name-pattern="bootstrap tutorial reveals authored concepts as relevant steps become current|blank world can bootstrap into a working todo app purely through the UI|bootstrap UI shows authored runtime plugin review details and composition previews|bootstrap UI shows inline route handler guidance while authoring routes" test\\ui.tutorial.test.js test\\ui.bootstrap.test.js`
- focused proof for the bootstrap client-runtime / page-main-slots / starter-plan / contribution-state / page-shell / page-document / page-script slice is `cmd /c node --test plugins\\bootstrap\\bootstrap-contribution-state.test.js plugins\\bootstrap\\bootstrap-starter-plan-hosts.test.js plugins\\bootstrap\\bootstrap-authored-request-plan.test.js plugins\\bootstrap\\bootstrap-starter-plan.test.js plugins\\bootstrap\\bootstrap-page-slot-manifest.test.js plugins\\bootstrap\\bootstrap-page-helpers.test.js plugins\\bootstrap\\bootstrap-page-main-slots.test.js plugins\\bootstrap\\bootstrap-page-main.test.js plugins\\bootstrap\\bootstrap-client-runtime-orchestration.test.js plugins\\bootstrap\\bootstrap-client-runtime-guidance.test.js plugins\\bootstrap\\bootstrap-client-runtime-support.test.js plugins\\bootstrap\\bootstrap-client-runtime.test.js plugins\\bootstrap\\bootstrap-page-shell.test.js plugins\\bootstrap\\bootstrap-page-document.test.js plugins\\bootstrap\\bootstrap-page-script.test.js plugins\\bootstrap\\bootstrap.test.js` plus `cmd /c node --check plugins\\bootstrap\\bootstrap-shell.js`, `cmd /c node --check plugins\\bootstrap\\bootstrap-contribution-state.js`, `cmd /c node --check plugins\\bootstrap\\bootstrap-read-models.js`, `cmd /c node --check plugins\\bootstrap\\bootstrap-starter-plan-hosts.js`, `cmd /c node --check plugins\\bootstrap\\bootstrap-authored-request-plan.js`, `cmd /c node --check plugins\\bootstrap\\bootstrap-starter-plan.js`, `cmd /c node --check plugins\\bootstrap\\bootstrap-identity-view-state.js`, `cmd /c node --check plugins\\bootstrap\\bootstrap-page-main-seed-state.js`, `cmd /c node --check plugins\\bootstrap\\bootstrap-page-main-replacement-content.js`, `cmd /c node --check plugins\\bootstrap\\bootstrap-page-slot-manifest.js`, `cmd /c node --check plugins\\bootstrap\\bootstrap-page-helpers.js`, `cmd /c node --check plugins\\bootstrap\\bootstrap-page-main-slots.js`, `cmd /c node --check plugins\\bootstrap\\bootstrap-client-runtime-orchestration.js`, `cmd /c node --check plugins\\bootstrap\\bootstrap-client-runtime-guidance.js`, `cmd /c node --check plugins\\bootstrap\\bootstrap-client-runtime-support.js`, `cmd /c node --check plugins\\bootstrap\\bootstrap-page-document.js`, `cmd /c node --check plugins\\bootstrap\\bootstrap-page-script.js`, `cmd /c node --check plugins\\bootstrap\\bootstrap-page-shell.js`, `cmd /c node --check plugins\\inspect\\widget-page.js`, and `cmd /c node --check src\\runtime-builtins.js`
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
- [x] proposal-adjacent help/option recompute now depends on the broader shared runtime-construction owner in `plugins/bootstrap/bootstrap-controls-runtime.js`; `createBootstrapControlsRuntimeFromBootstrap(...)` now exposes `buildProposalAdjacentSyncDeps`, which still delegates the event-time state/live-runtime packet construction to `buildBootstrapProposalAdjacentSyncDeps(...)` in `plugins/bootstrap/bootstrap-proposal-adjacent-sync.js`
- [x] scoped option recompute now depends on the broader shared runtime-construction owner in `plugins/bootstrap/bootstrap-controls-runtime.js`; `createBootstrapControlsRuntimeFromBootstrap(...)` now exposes `buildScopedControlsSyncDeps`, which still delegates the event-time `liveState`/`dom` packet construction to `buildBootstrapScopedControlsSyncDeps(...)` in `plugins/bootstrap/bootstrap-scoped-controls-sync.js`
- [x] route-authoring help/disabled recompute now also depends on the broader shared runtime-construction owner in `plugins/bootstrap/bootstrap-controls-runtime.js`; `createBootstrapControlsRuntimeFromBootstrap(...)` now exposes `buildRouteAuthoringSyncDeps`, which still delegates the event-time `liveState`/`dom` packet construction to `buildBootstrapRouteAuthoringSyncDeps(...)` in `plugins/bootstrap/bootstrap-route-authoring-sync.js`
- [x] scoped dependent-select recompute currently signals through exactly one host bridge event, `witness:bootstrap-dependent-select-sync`, including the stewardship target-kind family
- [x] backend guidance recompute currently signals through `witness:bootstrap-backend-help-sync`
- [x] proposal guidance recompute currently signals through `witness:bootstrap-proposal-create-help-sync` and `witness:bootstrap-proposal-approve-help-sync`
- [x] proposal guidance sync registration, transient proposal control state sync/apply ownership, and proposal live dependency-packet construction now also live in `plugins/bootstrap/bootstrap-proposal-controls-sync.js` through `bindBootstrapProposalControlsSync(...)`, `syncBootstrapProposalControlsState(...)`, `applyBootstrapProposalControlsState(...)`, `runBootstrapProposalControlsSync(...)`, `buildBootstrapProposalControlsSyncDeps(...)`, and `createBootstrapProposalControlsSyncDepsBuilder(...)`, while the broader shared bootstrap runtime owner in `plugins/bootstrap/bootstrap-controls-runtime.js` now exposes `buildProposalControlsSyncDeps`
- [x] bootstrap no longer owns a shell-local `proposalControlsView` state slot; pure proposal create/review view formulas live in `plugins/bootstrap/bootstrap-proposal-controls-view.js`, and the shell now consumes the shared proposal sync/state/runtime seam instead of keeping proposal-specific wrapper functions inline
- [x] proposal create/approve/reject submit choreography no longer lives as raw authored `postJson` plus `witness:host-refresh` steps inside `plugins/bootstrap/bootstrap-proposal-create-controls.wtoml` and `plugins/bootstrap/bootstrap-proposal-review-controls.wtoml`; those authored controls now dispatch `witness:bootstrap-proposal-submit`, while `plugins/bootstrap/bootstrap-proposal-submit.js` owns the request/status/reset/refresh contract through `renderBootstrapProposalSubmitFactory()` in `plugins/bootstrap/bootstrap-page-script.js` plus `bindBootstrapProposalSubmit(...)` in `plugins/bootstrap/bootstrap-client-runtime.js`. Focused proof: `cmd /c node --test plugins\\bootstrap\\bootstrap-proposal-submit.test.js plugins\\bootstrap\\bootstrap-client-runtime.test.js plugins\\bootstrap\\bootstrap.test.js test\\bootstrap-shell-desktop.test.js`
- [x] capability define/install/remove submit choreography no longer lives as raw authored `postJson` plus `clearForm` or `witness:host-refresh` steps inside `plugins/bootstrap/bootstrap-capability-controls.wtoml` and the capability section of `plugins/bootstrap/bootstrap-remove-controls.wtoml`; those authored controls now dispatch `witness:bootstrap-capability-submit`, while `plugins/bootstrap/bootstrap-capability-submit.js` owns the request/status/reset/refresh contract through `renderBootstrapCapabilitySubmitFactory()` in `plugins/bootstrap/bootstrap-page-script.js` plus `bindBootstrapCapabilitySubmit(...)` in `plugins/bootstrap/bootstrap-client-runtime.js`. Focused proof: `cmd /c node --test plugins\\bootstrap\\bootstrap-capability-submit.test.js plugins\\bootstrap\\bootstrap-client-runtime.test.js plugins\\bootstrap\\bootstrap.test.js test\\bootstrap-shell-desktop.test.js`
- [x] scoped context/stewardship create-remove submit choreography no longer lives as raw authored `postJson` plus `clearForm` or `witness:host-refresh` steps inside `plugins/bootstrap/bootstrap-scoped-controls.wtoml` and the contextual/stewardship sections of `plugins/bootstrap/bootstrap-remove-controls.wtoml`; those authored controls now dispatch the live `witness:bootstrap-scoped-submit` bridge with `detail.source` set to `bootstrap-scoped-controls` or `bootstrap-remove-controls` plus `family`, `statusId`, optional `formId`, and the current draft fields, while `plugins/bootstrap/bootstrap-scoped-submit.js` owns the receiving seam and request/status/reset/refresh contract through `renderBootstrapScopedSubmitFactory()` in `plugins/bootstrap/bootstrap-page-script.js` plus `bindBootstrapScopedSubmit(...)` in `plugins/bootstrap/bootstrap-client-runtime.js`. Resulting state owner remains persistent bootstrap/context/stewardship server state first, followed by explicit `refresh()` on success. Focused proof: `cmd /c node --test plugins\\bootstrap\\bootstrap-scoped-submit.test.js plugins\\bootstrap\\bootstrap-client-runtime.test.js plugins\\bootstrap\\bootstrap.test.js test\\bootstrap-shell-desktop.test.js`
- [x] direct runtime-plugin remove and MCP-tool remove submit choreography no longer lives as raw authored `postJson` plus `witness:host-refresh` steps inside the runtime-integration sections of `plugins/bootstrap/bootstrap-remove-controls.wtoml`; those authored controls now dispatch the existing live `witness:bootstrap-runtime-integration-direct-submit` bridge with `detail.source = "bootstrap-remove-controls"` plus `family`, `statusId`, optional `formId`, and the current draft fields, while `plugins/bootstrap/bootstrap-runtime-integration-direct-submit.js` now owns the widened install/create/remove request/status/reset/refresh contract through `renderBootstrapRuntimeIntegrationDirectSubmitFactory()` in `plugins/bootstrap/bootstrap-page-script.js` plus `bindBootstrapRuntimeIntegrationDirectSubmit(...)` in `plugins/bootstrap/bootstrap-client-runtime.js`. Resulting state owner remains persistent bootstrap/runtime-integration server state first, followed by explicit `refresh()` on success. Focused proof: `cmd /c node --test plugins\\bootstrap\\bootstrap-runtime-integration-direct-submit.test.js plugins\\bootstrap\\bootstrap-client-runtime.test.js plugins\\bootstrap\\bootstrap.test.js test\\bootstrap-shell-desktop.test.js`
- [x] top-card identity/session/operator external writes no longer live as raw authored `patchJson`/`postJson`/`deleteJson`/`reloadPage` steps inside `plugins/bootstrap/bootstrap-top-cards.wtoml`; those authored controls now dispatch the live `witness:bootstrap-top-cards-submit` bridge with `detail.source = "bootstrap-top-cards"` plus `family`, `statusId`, optional `formId`, and the current draft fields, while `plugins/bootstrap/bootstrap-top-cards-submit.js` owns the receiving seam and request/status/reset/follow-up contract through `renderBootstrapTopCardsSubmitFactory()` in `plugins/bootstrap/bootstrap-page-script.js` plus `bindBootstrapTopCardsSubmit(...)` in `plugins/bootstrap/bootstrap-client-runtime.js`. Resulting state owner remains persistent bootstrap/session/operator server state first, followed by explicit `refresh()` for identity/session flows or explicit page reload for operator backup/export/restore/import flows. Focused proof: `cmd /c node --test plugins\\bootstrap\\bootstrap-top-cards-submit.test.js plugins\\bootstrap\\bootstrap-client-runtime.test.js plugins\\bootstrap\\bootstrap.test.js test\\bootstrap-shell-desktop.test.js`
- [x] governed backend/proposal version guidance helpers now live in `plugins/bootstrap/bootstrap-version-guidance.js` and reach the browser runtime through `renderBootstrapVersionGuidanceFactory()` in `plugins/bootstrap/bootstrap-shell.js`
- [x] proposal-adjacent runtime-plugin/MCP proposal body helpers now live in `plugins/bootstrap/bootstrap-proposal-adjacent.js` and reach the browser runtime through `renderBootstrapProposalAdjacentFactory()` in `plugins/bootstrap/bootstrap-shell.js`
- [x] proposal-adjacent submit choreography now lives in `plugins/bootstrap/bootstrap-proposal-adjacent-submit.js` and reaches the browser runtime through `renderBootstrapProposalAdjacentSubmitFactory()` in `plugins/bootstrap/bootstrap-shell.js`
- [x] runtime-plugin and MCP control help/submit-disabled helpers now live in `plugins/bootstrap/bootstrap-runtime-integration-controls-view.js` and reach the browser runtime through `renderBootstrapRuntimeIntegrationControlsViewFactory()` in `plugins/bootstrap/bootstrap-shell.js`
- [x] runtime-plugin and MCP option-projection helpers now live in `plugins/bootstrap/bootstrap-runtime-integration-options-view.js` and reach the browser runtime through `renderBootstrapRuntimeIntegrationOptionsViewFactory()` in `plugins/bootstrap/bootstrap-shell.js`
- [x] bootstrap helper render worlds now call `ensureRuntimeBuiltins(world)` before `applyWitnessToml(...)` so typed backend authored `readForm(schema=...)` steps have the shared runtime process/value definitions they rely on
- [x] `plugins/bootstrap/bootstrap-dom-helpers.js` is now consumed by the broader shared bootstrap controls runtime owner through `renderBootstrapDomHelpersFactory()` plus `createBootstrapDomHelpers({ document })`, and that live seam is re-proved through focused source/runtime tests and the proposal-adjacent browser proofs
- [x] keep the shared bootstrap DOM helper seam mechanical only: `plugins/bootstrap/bootstrap-dom-helpers.js` now stays limited to DOM lookup, field lookup, select fill/apply, selected-value preservation, submit-disabled writes, and status-text writes; focused proof in `plugins/bootstrap/bootstrap-dom-helpers.test.js` plus `plugins/bootstrap/bootstrap.test.js` now asserts the helper exports only that mechanical contract and does not carry bootstrap-specific recompute or request logic such as `postJson`, `refresh`, `resolveServerRunner`, scoped target derivation, or stewardship target derivation
- [x] event-time dependency resolution is currently part of the live bootstrap contract for recompute paths; focused proof in `plugins/bootstrap/bootstrap-scoped-controls-sync.test.js`, `plugins/bootstrap/bootstrap-proposal-adjacent-sync.test.js`, `plugins/bootstrap/bootstrap-route-authoring-sync.test.js`, `plugins/bootstrap/bootstrap-controls-sync.test.js`, `plugins/bootstrap/bootstrap-runtime-integration-direct-controls-sync.test.js`, and `plugins/bootstrap/bootstrap.test.js` now proves both source-level handler shape and repeated bound-event behavior, so a future slice that captures `liveState` results or DOM readers once during initial bind instead of resolving them through the current builder/listener seams at event time should be treated as a regression even if selectors and event names still match
- [x] live helper-promotion record for the 2026-06-15 client binder extraction: producer `source` remains the existing authored bridge families (`bootstrap-top-cards`, `bootstrap-backend-authoring-controls`, `bootstrap-proposal-adjacent-controls`, `bootstrap-scoped-controls`, `bootstrap-remove-controls`, `bootstrap-page-main`, and related authored controls) and their already-documented payload fields; the receiving seam is now live `plugins/bootstrap/bootstrap-client-runtime-binders.js` through `bindBootstrapClientRuntimeAdapters(...)`, which delegates to the existing bridge helpers without inventing new payload shape; resulting state owners remain unchanged from those helper seams (`refresh()` / local runtime projection for host refresh, persistent server state for submit helpers, and runtime/browser state for sync helpers); focused proof: `cmd /c node --test plugins\\bootstrap\\bootstrap-client-runtime-binders.test.js plugins\\bootstrap\\bootstrap-client-runtime.test.js plugins\\bootstrap\\bootstrap-page-script.test.js plugins\\bootstrap\\bootstrap.test.js` plus `cmd /c node --check plugins\\bootstrap\\bootstrap-client-runtime-binders.js plugins\\bootstrap\\bootstrap-client-runtime.js plugins\\bootstrap\\bootstrap-page-script.js`
- [x] live helper-promotion record for the 2026-06-15 client runtime support extraction: producer `source` is not an authored bridge family here because this is a mechanical startup/helper promotion rather than a new host event; payload fields remain unchanged and stay owned by the existing bridge/helper seams; the receiving seam is now live `plugins/bootstrap/bootstrap-client-runtime-support.js` through `createBootstrapClientRuntimeSupport(...)`, which owns browser-target lookup, desktop API lookup, sleep, inventory snapshot/key support, runtime-plugin-review detail rendering, and runtime-view publication without changing state contracts; resulting state owners remain unchanged (`state.runtimePluginReview` plus DOM projection for review detail, transient runtime/browser state for inventory snapshots and published runtime view, and desktop shell state through the existing refresh/runtime seams); focused proof: `cmd /c node --test plugins\\bootstrap\\bootstrap-client-runtime-support.test.js plugins\\bootstrap\\bootstrap-client-runtime.test.js plugins\\bootstrap\\bootstrap-page-script.test.js plugins\\bootstrap\\bootstrap.test.js` plus `cmd /c node --check plugins\\bootstrap\\bootstrap-client-runtime-support.js plugins\\bootstrap\\bootstrap-client-runtime.js plugins\\bootstrap\\bootstrap-page-script.js`
- [x] live helper-promotion record for the 2026-06-15 client runtime guidance extraction: producer `source` is not an authored bridge family here because this is a mechanical startup/helper promotion rather than a new host event; payload fields remain unchanged and stay owned by the existing guidance/runtime seams; the receiving seam is now live `plugins/bootstrap/bootstrap-client-runtime-guidance.js` through `createBootstrapClientRuntimeGuidance(...)`, which owns active-guidance selection, progress-key derivation, step-index/autocomplete setup, guidance runtime construction, and guidance/tutorial fallback normalization without changing user-facing state contracts; resulting state owners remain unchanged (`state.guidanceProgress` / `state.tutorialProgress` plus the existing guidance runtime/controller state and published runtime view); focused proof: `cmd /c node --test plugins\\bootstrap\\bootstrap-client-runtime-guidance.test.js plugins\\bootstrap\\bootstrap-client-runtime.test.js plugins\\bootstrap\\bootstrap-page-script.test.js plugins\\bootstrap\\bootstrap.test.js` plus `cmd /c node --check plugins\\bootstrap\\bootstrap-client-runtime-guidance.js plugins\\bootstrap\\bootstrap-client-runtime.js plugins\\bootstrap\\bootstrap-page-script.js`
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
- [x] request owner for runtime-plugin and MCP proposal submission is the shared helper seam in `plugins/bootstrap/bootstrap-proposal-adjacent-submit.js`, which now owns the `/api/proposals` write target as well as the family-specific proposal body shaping, not the page-local shell or client-runtime binder glue
- [x] external state owner for proposal submission is persistent proposal/bootstrap server state first, followed by an explicit reread through `refresh()` after success
- [x] success/reset owner for proposal submission is still explicit in the submit seam: status update, `form.reset()`, and `refresh()` are part of the documented proposal-adjacent submit choreography rather than hidden side effects
- [x] trigger owner for proposal-adjacent help/option recompute is now the authored proposal-adjacent `WTOML` change/input path, which dispatches `witness:bootstrap-proposal-adjacent-sync`
- [x] request owner for proposal-adjacent help/option recompute remains pure projection/help recompute through the shared sync bridge; the sync bridge does not perform proposal creation, host refresh, or unrelated server requests
- [x] state owner for proposal-adjacent help/option recompute remains explicit help/submit-disabled state or pure select-option projection; the sync bridge does not own persisted bootstrap state transitions
- [x] state owner for proposal-adjacent help/option recompute now remains a transient shared view object produced inside the shared sync seam; the shared sync seam routes families and owns recompute/application orchestration, and the shared proposal-adjacent controls-view seam performs the family-specific build/apply choreography
- [x] live dependency owner for proposal-adjacent help/option recompute remains explicit in the dedicated proposal-adjacent seam, but the builder is now handed out by the broader shared runtime owner: `plugins/bootstrap/bootstrap-controls-runtime.js` exposes `buildProposalAdjacentSyncDeps`, which delegates to `buildBootstrapProposalAdjacentSyncDeps(...)` in `plugins/bootstrap/bootstrap-proposal-adjacent-sync.js`; that packet still preserves event-time `liveState`/`dom` reads, and a later slice must preserve that live-reader behavior or replace it with a documented stronger owner in the same change
- if those live dependency inputs narrow further, preserve event-time reads and writes in the remaining seam and keep `plugins/bootstrap/bootstrap-dom-helpers.js` mechanical; do not let it become the hidden owner of runtime-plugin/MCP/proposal semantics simply because it now touches the DOM
- refresh owner for proposal-adjacent submit must stay explicit after extraction; if a later slice narrows the reread path below `refresh()`, record the new state landing and reread owner here in the same change
- if a future slice introduces a second proposal-adjacent bridge event, document why the existing submit bridge cannot carry that responsibility without becoming semantically overloaded

### Scoped external state capture packet

The scoped slice now has both authored submit flows and a shared recompute bridge. Keep the owner split explicit so later unattended work does not merge transient option recompute with persistent external writes.

- [x] trigger owner for scoped option recompute is the authored `change` path on the scoped create/remove controls, which currently dispatches `witness:bootstrap-dependent-select-sync`
- [x] request owner for scoped option recompute is no network request; the shared `bindBootstrapScopedControlsSync(...)` / `runBootstrapScopedControlsSync(...)` seam only rebuilds transient scoped view state and reapplies options or submit-disabled state
- [x] transient state owner for scoped option recompute is the shared scoped sync seam plus `buildBootstrapScopedControlsView(...)` / `applyBootstrapScopedControlsView(...)`; that recompute path does not own persisted bootstrap mutations
- [x] trigger owner for scoped create/grant/revoke/remove external writes is the authored scoped `WTOML` submit path for `context-binding-form`, `context-export-form`, `context-import-form`, `stewardship-form`, `context-binding-remove-form`, `context-export-remove-form`, `context-import-remove-form`, and `stewardship-remove-form`
- [x] request owner for scoped create/grant/revoke/remove external writes is now the shared `bindBootstrapScopedSubmit(...)` / `runBootstrapScopedSubmit(...)` seam in `plugins/bootstrap/bootstrap-scoped-submit.js`, which accepts the `witness:bootstrap-scoped-submit` detail packet and preserves the `/api/context-bindings`, `/api/context-exports`, `/api/context-imports`, and `/api/stewardships` request contracts rather than leaving those writes embedded in authored `postJson`/body-carrying `DELETE` steps or a raw page-local submit listener
- [x] external state owner for scoped create/grant/revoke/remove writes remains persistent bootstrap/server state first, followed by explicit reread through the shared scoped submit seam calling `refresh()` on success
- [x] live dependency owner for scoped option recompute remains explicit in the dedicated scoped seam, but the builder is now handed out by the broader shared runtime owner: `plugins/bootstrap/bootstrap-controls-runtime.js` exposes `buildScopedControlsSyncDeps`, which delegates to `buildBootstrapScopedControlsSyncDeps(...)` in `plugins/bootstrap/bootstrap-scoped-controls-sync.js`; that packet still preserves event-time `liveState`/`dom` reads, and a later slice must preserve that live-reader behavior or replace it with a documented stronger owner in the same change
- do not move scoped target/export/help/disabled formulas into anonymous change listeners or into `plugins/bootstrap/bootstrap-dom-helpers.js`; if a stronger shared owner is needed, extract and prove it as a named seam first

### Direct runtime-integration external state capture packet

The direct runtime-plugin and MCP install/create/remove slice now has both shared recompute ownership and explicit authored/shared submit ownership. Preserve the following owner split unless the same change updates code, proof, and this file together.

- [x] trigger owner for direct runtime-plugin install, direct MCP server create, direct MCP tool install, direct runtime-plugin remove, and direct MCP tool remove is now the authored submit path in `plugins/bootstrap/bootstrap-runtime-integration-controls.wtoml` plus the runtime-integration sections of `plugins/bootstrap/bootstrap-remove-controls.wtoml`, all of which dispatch `witness:bootstrap-runtime-integration-direct-submit`
- [x] payload owner for direct runtime-plugin install and direct runtime-plugin remove is now `buildBootstrapRuntimeIntegrationDirectSubmitRequest({ detail })`, which still preserves the pass-through `{ serverRunner, plugin }` body for `/api/runtime-plugin-installs` while selecting `POST` for install and `DELETE` for remove
- [x] payload owner for direct MCP server create is now `buildBootstrapRuntimeIntegrationDirectSubmitRequest({ detail })`, which still preserves the blank-field omission rule before POST to `/api/mcp-servers`
- [x] payload owner for direct MCP tool install and direct MCP tool remove is now `buildBootstrapRuntimeIntegrationDirectSubmitRequest({ detail })`, which still preserves the body-defaulting rule before POST to `/api/mcp-tool-installs` for install (`actingMode` defaults to `"delegated"`, blank `scopeContextsJson` becomes `"[]"`, and blank `scopeTargetsJson` becomes `"[]"`) and now preserves the narrowed `{ server, tool }` body plus `DELETE` method for remove
- [x] request owner for all five direct install/create/remove flows is now `runBootstrapRuntimeIntegrationDirectSubmit(...)` in `plugins/bootstrap/bootstrap-runtime-integration-direct-submit.js`, which accepts the bridge detail packet and calls `postJson(...)`
- [x] external state owner for all five direct install/create/remove flows is still persistent bootstrap/server state first, followed by an explicit reread through `refresh()` after success
- [x] success/reset owner for the direct runtime-integration install/create/remove flows is now the shared direct-submit seam: install/create status nodes resolve to `"Saved."`, remove status nodes resolve to `"Removed."`, only install/create forms reset, and all success paths still end in `refresh()`
- [x] error owner for all five direct install/create/remove flows is now the shared direct-submit seam writing `error.message` into the matching status node; if a later extraction changes error rendering semantics, record that change explicitly here
- [x] live dependency owner for direct help/option recompute remains the broader shared runtime owner in `plugins/bootstrap/bootstrap-controls-runtime.js` plus the shared direct recompute seam in `plugins/bootstrap/bootstrap-runtime-integration-direct-controls-sync.js`; do not merge that view-only owner with submit-side request ownership without documenting the new contract
- do not let `serviceIdentity`, `transportsJson`, `actingMode`, `scopeContextsJson`, or `scopeTargetsJson` semantics disappear into undocumented callback logic during later edits; whichever layer owns those request fields must stay named explicitly as the payload owner in the slice record
- if a later slice changes the direct submit bridge payload, status semantics, reread owner, or preserved DOM ids, record that contract change in the same change so later unattended work does not infer it from obsolete `bindCreate(...)` history

### Starter external state capture packet

The starter slice now has enough moving parts that unattended work should not infer its state routing from the browser proof alone. Preserve the following owner split unless the same change updates code, proof, and this file together.

- [x] trigger owner for starter creation is the authored `click:createBootstrapTodoStarter` path rendered from `plugins/bootstrap/bootstrap-starter-controls.wtoml`
- [x] request owner for starter creation is the shared starter-plan seam in `plugins/bootstrap/bootstrap-starter-plan.js`, executed by the shared authored runtime as a serial repeated `postJson` plan rather than by a page-local submit/click controller
- [x] blueprint owner for starter creation is now explicit and file-backed: `todoStarterBlueprint()` in `plugins/starter/starter-blueprints.js` owns the maintained native starter blueprint, `plugins/starter/runtime.js` contributes it through the starter provider, bootstrap consumes the already-selected active blueprint from state so the shell no longer has to thread blueprint ownership manually, and `plugins/starter/todo-starter-legacy-fixture.json` remains only as historical starter substrate for inspect/uplift input
- [x] external state owner for starter creation is persistent bootstrap/app/server state first, including the created context, runner, runtime-plugin installs, frontend/backend programs, routes, and serve mounts, followed by an explicit reread through `refresh()`
- [x] refresh owner for starter creation is the shared `witness:host-refresh` bridge emitted by the authored starter program and accepted by the shared `bindBootstrapHostRefresh(...)` seam for `bootstrap-starter-controls`
- [x] starter button-disabled view owner is the shared `buildBootstrapStarterControlsView(...)` / `applyBootstrapStarterControlsView(...)` seam in `plugins/bootstrap/bootstrap-starter-controls-view.js`, which now derives `appReady` / edit-gating button state instead of leaving that decision embedded directly in `render()`
- [x] host-action bridge for starter/open-app handoff is explicit: authored top-card `action = "openBootstrapAppHome"` emits the named `witness:bootstrap-host-action` family with `detail.action = "open-app"`, and the shared `bindBootstrapHostActions(...)` / `runBootstrapHostAction(...)` seam now binds and handles that event instead of keeping a raw `#open-app-link` click listener
- [x] navigation/host owner after starter success is the shared helper seam in `plugins/bootstrap/bootstrap-host-navigation.js`, where `openBootstrapAppHome(...)` re-checks freshness before same-URL app navigation and `continueBootstrapTutorialOnPage(...)` owns bootstrap/world/app same-page continuation policy
- if a later slice changes starter request ordering, route/home-page authoring order, or the `serverRunner.handlerSet = "demo"` invariant, record the new invariant list here and re-prove it with the dedicated starter browser command in the same change
- do not let a future starter slice hide persistent creation semantics inside host listeners or DOM-only status mutation; the resulting world/app state must still land server-side first and be re-read before navigation

### Historical Bootstrap DOM and Event Contracts

Unattended work should treat the DOM ids below as compatibility constraints
only where current code and tests still prove them. The host-event names in
this historical section are provenance, not a recommended lane for new work.

- [x] preserved scoped create/remove DOM ids include `#context-binding-form`, `#context-binding-target`, `#context-binding-remove-form`, `#context-export-form`, `#context-export-target`, `#context-export-remove-form`, `#context-import-form`, `#context-import-export-name`, `#context-import-remove-form`, `#context-import-remove-export-name`, `#stewardship-form`, and `#stewardship-remove-form`
- [x] preserved direct runtime-integration DOM ids currently include `#runtime-plugin-install-form`, `#runtime-plugin-install-status`, `#runtime-plugin-install-runner`, `#runtime-plugin-install-plugin`, `#mcp-server-form`, `#mcp-server-status`, `#mcp-server-runner`, `#mcp-server-help`, `#mcp-tool-install-form`, `#mcp-tool-install-status`, `#mcp-tool-install-server`, `#mcp-tool-install-tool`, and `#mcp-tool-install-acting-mode`; those anchors now survive through authored `WTOML` plus shared submit/recompute seams, and any later rename still needs proof plus an audit update in the same change
- [x] preserved starter/identity/top-card DOM ids include `#identity-form`, `#identity-status`, `#session-form`, `#session-summary`, `#create-todo-starter`, `#starter-status`, and `#open-app-link`
- [x] historical bootstrap host-event names formerly included `witness:host-refresh`, `witness:bootstrap-backend-authoring-sync`, `witness:bootstrap-proposal-adjacent-submit`, `witness:bootstrap-proposal-adjacent-sync`, `witness:bootstrap-runtime-integration-direct-submit`, `witness:bootstrap-runtime-integration-direct-sync`, `witness:bootstrap-dependent-select-sync`, `witness:bootstrap-backend-help-sync`, `witness:bootstrap-proposal-create-help-sync`, `witness:bootstrap-proposal-approve-help-sync`, `witness:bootstrap-scoped-submit`, `witness:bootstrap-top-cards-submit`, and `witness:bootstrap-host-action`
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
