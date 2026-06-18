# Capability Catalog

This document catalogs the compositional capabilities the platform needs in order to accelerate from the current baseline into a truthful, extensible product.

The goal is not only to list features. The goal is to identify the reusable molecules that make larger behaviors cheap to build.

Some of these are boring.
Some are large.
Both matter.

The important distinction is:

- a **feature** is one visible outcome
- a **capability** is a reusable molecule that can power many outcomes

This document therefore focuses on capabilities first.

---

## How To Read This

Each capability area is described in terms of:

- what it is
- why it accelerates the system
- current status
- missing molecules
- do
- do not

Status labels:

- `present`: exists in a meaningful form now
- `partial`: enough exists to prove direction, but the capability is not yet composable or coherent
- `missing`: not yet first-class in the product/runtime

Cross-cutting honesty terms:

- `fake`: a surface that claims a capability or behavior without grounding it in the real world model, runtime behavior, or witnessed persistence
- `stub`: a real capability seam with a simplified local or deterministic provider path
- `projection`: a real derived read model, not canonical truth
- `real but narrow`: a truthful first slice with intentionally limited coverage or scope; not fake, but not yet the final general form
- `compatibility bridge` or `compatibility sugar`: a transitional path that keeps older authored worlds or runtime behavior working while the first-class model catches up

Current honesty snapshot:

- the shared command surface is projection-backed rather than registry-backed
- tutorial recovery commands come from persisted tutorial progress rather than a fake command registry
- shipped backend provider seams such as OAuth, outbound HTTP, email, and SMS are stub-first rather than fake
- legacy capability strings still synthesize placeholder capability objects as a compatibility bridge
- contextual name resolution is real, and covered bootstrap/DSL authoring surfaces no longer allow hidden foreign-scoped canonical-id bypasses
- canonical ids still remain as compatibility sugar for same-context targets, unscoped legacy targets, and foreign targets that are already explicitly visible
- live-page proposal approval is real and now refreshes rendered pages through the witness stream, but the proposal path is still intentionally narrow
- the main remaining gaps are migration and governance gaps, not a fake capability registry
- capability installs are first-class now, widget-version routes now use shared authority derivation, the live inspector, shared Todo routes, shared widget editor, live canvas mutations, asset attach/detach flows, Eden's versions panel, and Eden's capability shelf all now have first proposal-aware operating-surface slices, but remaining app-specific and other operating-surface mutations still do not all use the same shared authority/proposal machinery

Current honesty ledger:

- `fake` at the current core capability/composition layer: none explicitly called out
- `stub`: shipped backend/provider capability seams where realism is intentionally deferred
- `projection but real`: command/search and tutorial recovery surfaces
- `real but narrow`: route-root page placement, contextual name resolution coverage, current-identity editing, and live proposal flows
- `compatibility bridge`: placeholder capability synthesis and the remaining canonical-id compatibility paths

The main risk to watch is not hidden theatre.
It is accidental normalization of placeholder capability definitions, shallow compatibility checks, compatibility-sugar authoring paths, and the remaining non-unified app-specific mutation flows as if they were the final capability model.

---

## Guiding Rule

The default engineering rule for this project should now be:

> Do not hard-code app semantics in JS unless the behavior is truly universal runtime/shell infrastructure or an explicit plugin boundary.

That means:

- universal runtime behavior is allowed in JS
- shell/infrastructure behavior is allowed in JS
- explicit plugin implementation behavior is allowed in JS
- hidden app-specific semantics pretending to be generic are not allowed in JS

This is the most important filter for deciding whether a new piece belongs in the DSL/model, the runtime core, or an explicit plugin.

---

## Capability Layers

The platform now breaks down into eight major capability layers:

1. world truth and witness substrate
2. composition primitives
3. runtime execution and inspection
4. identity, context, and authority
5. authoring surfaces and editing grammar
6. capability/plugin system
7. Sourcery and guided composition
8. shell, distribution, and ecosystem

The rest of this document expands them.

---

## 1. World Truth and Witness Substrate

These are the lowest reusable molecules. If these are weak, everything above them becomes theatre.

### 1.1 Witness log and projection substrate

Status: `present`

What it is:

- append-only witness recording
- derived projections
- replayable world meaning

Why it accelerates:

- everything can be inspected
- history stays available
- later views can be built without rewriting the source of truth

Missing molecules:

- stronger warm/persistent world lifecycle guidance
- clearer operator tooling for persisted worlds
- distributed/replicated witness exchange semantics

Do:

- keep all durable meaning derived from witnesses
- keep read views as projections
- preserve provenance and replayability

Do not:

- create hidden mutable side stores as the real truth
- let product state become authoritative outside the witness model

### 1.2 Thing / relation / process / witness ontology

Status: `present`

What it is:

- the irreducible model beneath everything else

Why it accelerates:

- gives one conceptual grammar across apps, tooling, plugins, and Sourcery

Missing molecules:

- more consistent use of the ontology in product language and editing surfaces

Do:

- keep new concepts explainable in these terms

Do not:

- invent UI/runtime shortcuts that bypass the ontology and then become special cases forever

---

## 2. Composition Primitives

These are the authored building blocks from which apps and capabilities are assembled.

### 2.1 Widget primitives and templates

Status: `present`

What it is:

- primitive widgets
- template widgets
- attach/render semantics

Why it accelerates:

- page composition is already moving away from one-off composite cheats

Missing molecules:

- richer base HTML/CSS primitive coverage
- better layout/style vocabulary
- stronger widget-level editing affordances in-product
- stable widget inspection/edit/replace grammar on live pages

Do:

- keep widget behavior composable from primitives and templates
- keep template/render semantics generic

Do not:

- add new composite cheats for one demo flow when a primitive/template/general render path should exist

### 2.2 Frontend process primitives

Status: `present`

What it is:

- events
- ordered steps
- `when`
- `after`
- `repeat.while`
- `repeat.forEach`
- async boundaries

Why it accelerates:

- app behavior can be described and inspected as authored process rather than hidden browser glue

Missing molecules:

- deeper executable backend/process parity
- shared higher-level flow patterns that can be reused by plugins
- more typed frontend op contracts

Do:

- extend process semantics generically
- keep tracing aligned with execution

Do not:

- add projection-only control-flow features the runtime will not execute

### 2.3 Route and serve composition

Status: `present`

What it is:

- `route`
- `serve`
- `serverRunner`

Why it accelerates:

- app reachability is declarative and projectable

Missing molecules:

- richer route capability metadata
- clearer route grouping by capability/plugin/context
- more directly executable route behavior beyond handler ids

Do:

- keep mounting and routing visible in the model

Do not:

- move route selection logic back into switch statements
- smuggle route defaults into host code when they belong in authored route params or plugin configuration

### 2.4 Shared type/process specs

Status: `present`

What it is:

- runtime-visible shape and validation semantics

Why it accelerates:

- makes builder forms and runtime checks convergent instead of duplicated

Missing molecules:

- broader coverage for more authoring surfaces
- more ergonomic editor-generation from specs
- first-class capability/plugin spec surfaces

Do:

- use the same type/process definitions for UI builders and runtime validation

Do not:

- reimplement compatibility/coercion ad hoc in another layer

---

## 3. Runtime Execution and Inspection

These capabilities make the system trustworthy while it is running.

### 3.1 Generic host/runtime spine

Status: `present`

What it is:

- `serverRunner`
- generic host dispatch
- route mounting
- session transport
- SSE

Why it accelerates:

- creates one real executable backbone rather than many ad hoc entrypoints

Missing molecules:

- more generic executable backend model
- cleaner shell/runtime/plugin separation
- operator-facing runtime diagnostics

Do:

- keep the host generic
- keep app behavior behind explicit plugin/handler boundaries until the model can own more execution honestly

Do not:

- reintroduce demo-shaped runtime shortcuts

### 3.2 World / process / source inspection

Status: `present`

What it is:

- world graph
- process view
- source browser
- witness inspector

Why it accelerates:

- gives users and developers shared evidence

Missing molecules:

- tighter correlation across these views
- direct edit/save from inspection surfaces
- better "explain this thing/process/page" flows

Do:

- keep inspectors truthful and first-class

Do not:

- let them become read-only museums forever if the product goal is editable-everywhere

### 3.3 Live evolution and rollback

Status: `partial`

What it is:

- widget live refresh
- transition gating
- rollback witnesses

Why it accelerates:

- allows safe change while the world is live

Missing molecules:

- broader runtime evolution beyond widgets
- richer migration semantics
- more general rollback/fork policies

Do:

- keep compatibility/migrate/fork/block explicit

Do not:

- hide incompatible transitions behind forced reloads or silent mutation

---

## 4. Identity, Context, and Authority

These capabilities make the system belong to someone and eventually make stewardship native.

### 4.1 Identity and session

Status: `present`

What it is:

- first identity creation
- bootstrap identity update for the current authored record
- login/logout
- cookie-backed session transport

Why it accelerates:

- gives ownership and continuity immediately
- lets truth-reveal handoffs land on a real edit path instead of stopping at read-only inspection

Missing molecules:

- better persistent-world recovery/admin flows
- password reset/operator recovery
- deeper identity lifecycle and recovery semantics beyond `homePerspective` + `homeContext`

Do:

- treat first identity as an ownership event, not only auth plumbing

Do not:

- regress to actor pickers or raw request headers as the normal mental model

Honest caveats:

- The current identity edit slice is real across bootstrap plus the live `F1 -> whoami` shortcut, but it is still intentionally narrow.
- `identity.update` now truthfully edits `label`, `username`, `password`, `homeContext`, and `homePerspective`, but it still keeps identity `id` and `actor` fixed and does not yet cover broader recovery or principal-migration semantics.

### 4.2 Context

Status: `partial`

What it is:

- the box that should contain names, authority, local composition, imports/exports, and perspective-local meaning

Why it accelerates:

- avoids one global soup
- makes plugins and worlds understandable

Current molecules:

- first-class authored `context` objects with `owner`, optional `parent`, and optional initial stewards
- bootstrap read/write support for context creation
- optional `context` attachment on governed authored objects in the bootstrap slice
- explicit local alias rows through `contextBinding`
- explicit cross-context export/import rows through `contextExport` and `contextImport`
- explanatory `contextScopes` read models showing local vs imported visibility
- grouped `contextNameResolutions` and `contextNameConflicts` read models so visible names and ambiguous collisions are inspectable
- shared contextual resolution and first-slice scope validation on the bootstrap/DSL authoring paths while preserving canonical stored ids
  Covered first-slice refs are `parentRef`, `rootWidgetRef`, `rootSurfaceRef`, `servesRef`, `backendProgramSoulRef`, `serverRunnerRef`, `serverRef`, `routeRef`, `backendHostRef`, `frontendHostRef`, `targetRef`, and `targetIdRef`.
- covered bootstrap/DSL authoring surfaces now reject direct canonical references to foreign scoped targets that are not explicitly visible in the authoring context

Missing molecules:

- broader context composition semantics beyond the covered first-slice surfaces
- richer package-like behavior: wildcard imports, namespace imports, re-export chains, and transitive import reasoning
- clearer long-term context-aware capability/store semantics
- context-aware composition across canvas and the remaining app-specific runtime behaviors

Do:

- move toward context as the unit of composition and explanation

Do not:

- keep adding globally-scoped ids and relationships when the real semantics are local

Honest caveats:

- Parent context is still an authority/inheritance relation only; it does not imply name visibility.
- Imports are named-import only and visibility is intentionally explicit rather than automatic.
- The current slice only lowers contextual refs for a bounded set of authoring fields.
- Canonical-id authoring is still a compatibility path on those covered surfaces, but it no longer bypasses hidden foreign scoped targets.
  Validation now classifies those canonical-id paths explicitly as `same-context convenience`, `imported-target reference`, or `legacy-only path`.
  The parallel canonical id fields remain valid for same-context targets, unscoped legacy targets, and foreign targets that are already explicitly visible through import/binding until the platform decides whether to narrow compatibility further.
- The low-level JS helper functions still expose permissive witness emitters.
  The honest guardrails for duplicate names, bad exports, and bad imports live on the bootstrap and DSL authoring paths rather than every internal helper call.
- Some read surfaces still lag behind the write semantics.
  Widget parenting can now be authored through `parentRef`, and contextual naming now has grouped resolution/conflict rows, but the bootstrap widget read model is still mostly a flat list rather than a full attachment/placement explanation surface.
- Most app-specific runtime actions still primarily use canonical ids.
  Capability install/remove targets, route root-surface and backend-program attachments, runtime plugin attachment targets, MCP tool attachment targets, stewardship targets, and proposal target ids now also lower through the shared contextual visibility rules when authored with `targetRef`, `rootSurfaceRef`, `backendProgramSoulRef`, `serverRunnerRef`, `serverRef`, and `targetIdRef`.

### 4.3 Authority, delegation, stewardship, proposals

Status: `partial`

What it is:

- the native governance layer implied by the witness model

Why it accelerates:

- allows plugins, editing, and world changes to scale beyond a single trusted operator

Current molecules:

- shared authority derivation for bootstrap mutation handlers
- explicit stewardship grant/revoke flows
- proposal create/approve/reject flows for generic bootstrap/world-authoring mutations
- a first operating-surface extension where signed-in live-inspector users without direct widget authority can create real `widget.update` proposals from the rendered page
- direct `403` enforcement for unauthorized scoped bootstrap writes

Missing molecules:

- authority coverage outside the generic bootstrap mutation surface
- broader principal/role/group semantics
- richer proposal queue/review/workflow behavior
- broader proposal coverage for the remaining app-specific and other operating-surface mutation actions

Do:

- treat this as a first-class model problem, not a bolt-on permissions matrix

Do not:

- hard-code long-term authority decisions into host checks alone

Honest caveats:

- stewardship is currently actor-string based, not yet a richer principal model
- proposals execute a fixed supported set of bootstrap target processes, not arbitrary world mutations
- the first non-bootstrap proposal-authoring path is intentionally narrow
  Today it exists on the live widget inspector for `widget.update` plus first-slice `widgetVersion.activate` / `widgetVersion.rollback` proposal creation, on the shared Todo CRUD routes for `todo.create` / `todo.update` / `todo.delete`, on the shared widget editor for `widget.define`, on live canvas mutation and shared asset attachment routes for `canvas.perspective.create` / `canvas.createThing` / `canvas.batch` / `canvas.thing.setTitle` / `canvas.relate` / `canvas.unrelate` / `asset.attach` / `asset.detach`, on the Eden versions panel for `widgetVersion.activate` / `widgetVersion.rollback` / `edenVersions.publish`, and on the Eden capability shelf for `capability.install`; approval/rejection still runs through the generic proposal APIs and broader remaining operating-surface actions still sit outside this slice.
- older worlds remain valid with many unscoped objects, so direct ownership is still a compatibility path alongside context governance

---

## 5. Authoring Surfaces and Editing Grammar

These capabilities determine whether the product feels compositional or bureaucratic.

### 5.1 Bootstrap seam and typed builders

Status: `present`

What it is:

- blank-world recovery
- focused builders for missing baseline structures

Why it accelerates:

- proves the product can recover and author itself enough to become useful

Missing molecules:

- stronger differentiation between app content and harness content
- better higher-level capability assembly surfaces above the raw builders

Do:

- keep bootstrap honest and semi-internal

Do not:

- let bootstrap become the only long-term authoring experience

### 5.2 Editable-everywhere page grammar

Status: `partial`

What it is:

- inspect widget
- hide widget
- replace widget
- upgrade widget
- show source
- show process
- show witnesses

Why it accelerates:

- makes discovery local and action immediate

Current molecules:

- world-surface object inspection through the graph inspector
- live-page right-click inspection on rendered app widgets through the surface inspector
- live-page hide/show for supported non-versioned widgets through real `widget.update` save-back
- live-page proposal creation for read-only widget edits through real `widget.update` proposals when the actor is signed in but lacks direct authority
- widget version upgrade and rollback from the operating surface
- widget version activate/rollback from the live-page inspector
- source-definition handoff for selected/source-backed objects
- witness-browser handoff for the selected object
- process-view handoff for frontend programs and semantic execution/action nodes
- live-page world/source/witness/process handoff from a selected rendered widget

Missing molecules:

- replace editing actions
- page-local edit affordances
- broader save/apply flows that write back to the world
- a universal object-to-process mapping beyond the current frontend-program/event handoff

Do:

- make editing available from where the user discovers the need

Do not:

- force every structural edit through a detached admin page if the live surface could own the action

Honest caveats:

- The current slice is no longer world-surface only, but it is still far from editable-everywhere.
- Live-page inspection currently depends on rendered `[data-widget]` ancestry and projected world-graph metadata rather than a deeper universal page/entity editing contract.
- `show process` is a deep-link handoff into the dedicated process page, not an in-place process editor.
- The current live-page process handoff is grounded in authored frontend-program/event structure around the selected widget, not arbitrary generic process inference for every object.
- `hide` is no longer missing for supported non-versioned widgets with actor authority, and signed-in non-authoritative users now get a narrow proposal path instead of only a dead end, but `replace` and broader live save-back editing still are.

### 5.3 Search and command surface

Status: `partial`

What it is:

- first slice today: a world-page command palette over projected objects and real surface handoffs
- intended: one universal search/command layer across the world

Why it accelerates:

- reduces friction between discovery and action

Current molecules:

- world-page command palette over graph nodes including widgets, capabilities, routes, processes, and source-backed objects
- live-page command palette over current rendered widgets plus world-graph-backed capability/source/world/process handoffs
- a first `F1 -> whoami` expert shortcut on live app pages and Eden's embedded board, revealing current-user truth through the same command surface
- a first inline current-identity edit path from `whoami` on live app pages and Eden's embedded board, backed by real `identity.update` writes and active-session refresh
- bootstrap identity edit handoff from `whoami`, backed by real `PATCH /api/identities/:id` updates and current-session refresh when the signed-in identity is edited
- command entries for real hidden browser modes such as source browser, primitive browser, and process explorer
- direct handoff commands into real product surfaces such as `/process`, `/_bootstrap`, and `/backend-seams`
- recovery commands for disabled tutorial guidance on the world page, derived from persisted tutorial progress rather than a fake command registry
- explicit app / harness / internal surface-tier labels on command entries and route-backed operating surfaces

Missing molecules:

- universal indexing across pages/widgets/plugins/witnesses/processes in every shell, not only the world page
- disabled-surface discovery and recovery beyond the current builtin handoffs and tutorial-page recovery state
- context-aware ranking without dishonesty
- deeper action semantics beyond navigation, selection, and the current narrow expert shortcut

Do:

- treat search as a first-class operating primitive

Do not:

- relegate navigation/discovery to manually browsing ever-growing sidebars

Honest caveats:

- The current slice is no longer world-surface only.
- Results come from the truthful projected graph, current rendered widget ancestry, and a small set of explicit real surfaces and tutorial recovery state, not from a hidden assistant-owned registry.
- Because the surface is projection-backed rather than registry-backed, the honest limitation is coverage, not truthfulness.
- Surface-tier classification is still narrow and explicit.
  Today it covers route-backed operating surfaces plus builtin handoffs such as home, bootstrap, process, and backend seams; it is not yet a universal content-boundary model for every widget or shell surface.
- The command surface is still not universal across every shell or plugin-owned surface.
  It now spans `/world` plus rendered app pages, but it does not yet index every disabled surface, every shell-local action, or every capability-owned page.
- The expert shortcut is still only a first truth-reveal slice.
  `F1 -> whoami` can reveal the current user, edit the current signed-in identity inline, refresh the active session when that identity changes, and still hand off into real world/source views plus the bootstrap identity editor.
  It still does not provide a broader expert transport grammar or a full identity lifecycle surface.

### 5.4 Live editable inspector

Status: `partial`

What it is:

- a devtools-like live inspector that can save changes back into the world

Why it accelerates:

- collapses the gap between seeing, understanding, and changing

Current molecules:

- live-page inspect toggle plus right-click selection grammar on rendered app pages
- DOM-to-widget mapping through rendered `data-widget` ancestry
- selected-widget highlight and side-panel metadata
- truthful handoff from a live selection into `/world`, witnesses, source, and process view
- in-place widget version activate/rollback actions for versioned widgets
- narrow real `widgetVersion.activate` / `widgetVersion.rollback` proposal creation for signed-in actors who can inspect shared versioned widgets but cannot change versions directly
- narrow real `widget.update` save-back for non-versioned widget `text`, `title`, `class`, and `hidden`
- narrow real `widget.update` proposal creation for signed-in actors who can inspect a shared widget but cannot save it directly

Missing molecules:

- editable property/schema panels
- broader safe save/apply/rollback behavior
- replace/widget-structure mutation from the live page
- broader shell/page coverage beyond the currently supported rendered app surfaces

Do:

- keep the inspector grounded in real authored structures

Do not:

- build a fake DOM-only editor that cannot explain or persist its changes truthfully

Honest caveats:

- The current inspector is a first live-page operating slice, not yet a full live editor.
- It can inspect, explain, hand off, and drive widget version changes, and it now has a narrow real `widget.update` save-back path for non-versioned widget `text`, `title`, `class`, and `hidden`.
- That save-back path is authority-bounded rather than universal.
  The shipped demo world now explicitly grants `aaron` stewardship over the `frontend` context so the save-back path is demonstrable on real app chrome, while non-stewards such as `callan` do not get direct save and instead get a first narrow proposal path.
- It still cannot mutate arbitrary widget properties or structure and save those edits back into the world.
- The new `hidden` support makes hide/show truthful for supported widgets, but it is still not a general replace/restructure editing grammar.
- That proposal path is still shallow.
  Approval continues through the generic proposal API; both `widget.update` and the first verified `widgetVersion.activate` / `widgetVersion.rollback` proposal paths now refresh through the live witness stream, but the review/approval experience is still not in-surface or broadly generalized.
- Its process mapping is intentionally narrow and derived from selected-widget context, nearest form context, and root load behavior rather than a full generic execution-model explanation layer.

---

## 6. Capability / Plugin System

This is the largest missing acceleration layer.

### 6.1 First-class capability object model

Status: `partial`

What it is:

- a plugin/capability as a real expressed object in the world

Why it accelerates:

- turns "I want sessions/charts/database browsing" into a composable unit rather than a hand-wired checklist

Current molecules:

- capability definition shape in the DSL/model
- typed facet groups for `publicApi`, `config`, `internals`, `authority`, and `placement`
- dependency declaration through `dependsOn`
- provenance/version fields in capability projections
- first-class capability nodes in the world graph

Still missing:

- stronger version semantics beyond a projected version field
- richer dependency/import semantics beyond local dependency ids
- stronger authority/compatibility reasoning at install time
- a cleaner migration path away from legacy capability sugar

Do:

- make capabilities visible as themselves
- let a capability present public API, configuration, and internals as different views over the same thing

Do not:

- silently create routes/widgets/handlers with no first-class representation of the capability that owns them

### 6.2 Capability installation and placement

Status: `partial`

What it is:

- install/add capability from the point of need

Why it accelerates:

- keeps composition local and reduces ceremony

Current molecules:

- installation flow
- removal flow
- placement into `context`, `serverRunner`, and route-root `Page`
- duplicate/dependency/placement validation
- bootstrap install/remove surface and read models

Still missing:

- placement into richer page/widget/world scopes
- shell-specific capability awareness as a clean public surface
- deeper conflict reporting beyond current placement/dependency checks
- richer update/replace semantics

Do:

- let installation happen where the user discovers the need

Do not:

- force plugin composition to be detached from the page/world context where it will be used

### 6.3 Capability catalog / store

Status: `partial`

What it is:

- the discoverable marketplace/index of capabilities

Why it accelerates:

- shared composition becomes exponential once reusable capability packages exist

Current molecules:

- local catalog projection
- local install/remove lifecycle
- provenance surfaced in the bootstrap read models
- metadata-first local plugin package discovery and validation through `plugins/<plugin-id>/plugin.json`
- runtime and bootstrap read models that expose package validity, compatibility, installability-in-principle, and declared capability sources
- startup-local plugin activation through `PluginManifest.activatesBundles`, repeatable CLI `--runtime-plugin <id>`, and `RUNTIME_PLUGINS=plugin.a,plugin.b`
- authored `serverRunner` plugin installs through witnessed `runtimePlugin.install` / `runtimePlugin.remove`, with direct-route proposal fallback, proposal parity, and additive operator overlay
- bootstrap runtime-plugin install/remove/proposal forms plus runner-scoped availability rows that show authored installability, missing dependencies, and metadata-only packages without pretending CLI/env overlays are durable world state
- runtime-owned review reads plus bootstrap plugin detail panels that preview authored runner composition, no-op installs, reverse dependencies, and declared-vs-resolved plugin contributions before mutation
- runtime composition reads that expose requested, eligible, active, rejected, resolved-bundle, and resolved-runtime-contribution state for local plugin packages
- the maintained demo example now uses authored runner installs for `plugin.authoring`, `plugin.inspect`, `plugin.canvas`, and `plugin.demo`, and served demo entrypoints run on `minimal` so plugin composition is proven in the actual project path rather than only in abstract runtime tests

Still missing:

- remote catalog/store protocol
- update lifecycle
- broader store-grade trust/review/report surfaces beyond the shipped local runtime-plugin review/detail and composition-preview reads
- richer version compatibility semantics
- runner-scoped reconcile and repair flows for broken authored runtime-plugin installs
- finishing the migration of remaining bootstrap/tutorial and demo compatibility seams onto the same explicit runtime-composition story
- executable plugin loader boundaries beyond the current bundle-bridge-only activation path

Do:

- treat the catalog/store as a first-class product surface with provenance and authority visible

Do not:

- reduce it to a package downloader with no world-model integration

### 6.4 Capability authoring

Status: `partial`

What it is:

- the ability to build a capability/plugin using the same product surfaces

Why it accelerates:

- this is how the Todo app builder becomes a plugin builder and eventually a meta-editor

Current molecules:

- capability authoring DSL/model
- bootstrap capability authoring form
- a concrete external `PluginManifest` shape distinct from the internal executable bundle contract

Still missing:

- packaging/bundling semantics
- installable export/import flows beyond the local filesystem manifest shape
- capability testing/preview
- less JSON-heavy product-grade authoring surfaces

Do:

- ensure capability authoring is itself part of the compositional story

Do not:

- make plugins a privileged platform-developer-only format forever

### 6.5 Honesty notes on the current slice

Status: `active caution`

The current capability slice is real, but a few parts are still bridge-quality rather than obviously final:

- Host capabilities currently travel through an internal `host` install target kind so startup and bootstrap compatibility continue to work.
- Legacy `context.capabilities` arrays and legacy host capability strings synthesize placeholder capability objects rather than forcing an authored migration.
- The world graph still carries legacy context capability strings as badges on context nodes even though capability nodes and install edges now exist.
- `routePage` means the served route plus its root `Page` widget only; it is not a general page/entity/subtree placement model.
- Validation is typed and dependency-aware, but not yet a deep semantic solver for version, authority, or cross-surface conflicts.
- Internal bundles are now the executable extension contract, while local plugin packages can only activate those bundles through a manifest-to-bundle bridge.
- The local catalog behaves like a projected index plus package-discovery and runtime-composition read model, not yet like a full ecosystem/store protocol.
- Activated plugin packages still do not execute package-local providers, load local JS, register runtime routes directly, or auto-install capabilities into the world model.
- Authored runtime-plugin installs persist runner intent, but they still resolve only to pre-registered internal bundles; they are not yet a third-party executable loader or a remote store install lifecycle.
- The maintained demo now proves authored plugin composition on `minimal`, but it still relies on one explicit compatibility seam: `handlerSet = "demo"` currently causes startup to add `bundle-demo`.
- Blank-world bootstrap/tutorial startup still follows a separate runtime path from the pluginized maintained demo, so the project does not yet have one fully unified runtime-composition story across both entry modes.
- None of those caveats make the capability slice fake.
  They mean the current slice still mixes real first-class behavior with compatibility bridges, narrow placement semantics, projection-backed cataloging, and an explicit bundle-bridge-only local plugin boundary.

These are acceptable for the first vertical slice, but they should stay visible so later work can tighten or replace them intentionally rather than accrete around them by accident.

---

## 7. Sourcery and Guided Composition

This is not just onboarding. It is the future companion layer.

### 7.1 Contextual Sourcery

Status: `partial`

What it is:

- today: bootstrap tutorial, live-app overlay, and world-page guidance panel, with persisted chapter restart, step-level restart-from-here replay pins, page-aware continuation across those real surfaces, and per-page disable/re-enable on those real surfaces
- intended: contextual guide across world/page/section/widget/chapter scopes

Why it accelerates:

- converts complexity into learnable adventure without hiding the real system

Current molecules:

- page-aware continuation between bootstrap, the live app, and the real `/world` operating surface
- per-page disable/re-enable on those three shipped surfaces
- bootstrap-visible disabled-surface rows so guidance that was turned off elsewhere stays visible and recoverable without resetting progress
- authored-step replay pins for restart-from-here on those same surfaces
- a shipped Todo tutorial path that now ends on the real `/world` surface with a world-page guidance panel driven by the same persisted tutorial progress state

Missing molecules:

- broader per-scope enable/disable beyond the current bootstrap/app/world page slice
- restart from current context beyond authored-step replay
- section-aware/widget-aware/world-aware state
- world-level "where is Sourcery active/disabled" view

Do:

- keep Sourcery truthful and optional

Do not:

- let it become a fake simplified product that users later "graduate out of"

Honest caveats:

- The current contextual slice is page-aware only for the real bootstrap, live-app, and `/world` surfaces.
- It can now say "this step belongs on the other page" and can disable guidance per page on those surfaces, but it still does not understand section/widget/world-as-scope semantics.
- Bootstrap can now show disabled guidance surfaces and re-enable them directly, but this is still recovery around page-disabled state, not a richer general scope model.
- Restart now supports chapter rewind plus authored-step replay pins on the shipped surfaces.
  That replay is guidance-only, does not roll back app/world state, and does not yet imply true page-level, section-level, or widget-level restart-from-here semantics.

### 7.2 Concept-aware guidance

Status: `partial`

What it is:

- today: authored concept metadata on tutorial steps, revealed on the bootstrap card and live-app overlay as progress reaches them
- intended: teaching concepts when they become relevant across broader product surfaces

Why it accelerates:

- users learn composition in the order it becomes real

Current molecules:

- authored concept definitions on the Todo tutorial itself
- per-step concept tags for identity, session, runtime wiring, widget structure, frontend programs, routes/mounts, app boundary, witnessed app state, and perspective-bound data
- progressive concept reveal derived from real tutorial progress rather than hidden inference
- concept explanation surfaces on both bootstrap and live-app tutorial UI

Missing molecules:

- broader concept graphs beyond one authored tutorial
- trigger conditions based on arbitrary authored/runtime state rather than tutorial step progress alone
- explanation surfaces tied to concrete visible structures outside the tutorial shell
- cross-world and cross-surface concept reuse rather than one tutorial-local catalog

Do:

- teach "you", then "your environment", then "your tools", then "your world", then "your app"

Do not:

- front-load implementation nouns before the user has a reason to care

Honest caveats:

- The current concept slice is tutorial-authored and progress-derived.
- It is not yet a general semantic layer that discovers concepts automatically across arbitrary worlds, pages, widgets, or capabilities.
- Concepts are currently revealed in the authored step order of the Todo tutorial.
  That is truthful for now, but broader Sourcery curation will need a richer model than one linear tutorial sequence.

### 7.3 Ambient assistance and curation

Status: `missing`

What it is:

- today: bootstrap-first next-step suggestions derived from real tutorial, session, and world state and wired to visible controls or real surface handoffs
- intended: broader suggestions and ranking without deception

Why it accelerates:

- good things surface, bad things remain available, the user stays in control

Current molecules:

- deterministic next-step suggestions on the bootstrap tutorial card
- suggestion explanations tied to concrete visible conditions such as missing identity, missing session, starter-ready world, active tutorial step, off-page continuation, or completed tutorial state
- suggestion actions constrained to real controls (`identity-form`, `session-form`, starter button, authored-state view) or real surface handoffs (`Open App`, continue on the relevant surface)

Missing molecules:

- usage-driven ranking
- cross-surface and live-app ambient curation beyond the bootstrap-first slice
- broader local-context recommendation models beyond the current hand-authored derivation
- filters for universal/advanced/disabled/internal things
- richer explanation/debug surfaces for why one suggestion outranked another

Do:

- rank honestly and explain surfacing decisions

Do not:

- hide real capabilities because the assistant decided they were not fashionable

Honest caveats:

- The current ambient slice is bootstrap-first, not product-wide.
- Suggestions come from a small deterministic derivation over visible tutorial/session/world state, not from learned ranking or opaque assistant judgement.
- Suggestion actions are intentionally narrow.
  They point at real controls or real page handoffs rather than executing hidden authoring flows on the user's behalf.

---

## 8. Shell, Distribution, and Ecosystem

These capabilities decide whether the system becomes a serious operating environment.

### 8.1 Multi-shell core

Status: `partial`

What it is:

- browser/hosted operation now
- a first local MCP automation shell over the same world and runtime seams
- a first local desktop ownership shell alongside it

Why it accelerates:

- same world can be owned locally and reached remotely
- the same witnessed authority model can serve people, browsers, and automation without inventing a second hidden control plane

Current molecules:

- browser-hosted operation through `serverRunner`
- first local MCP server model through authored `mcpServer`
- per-server tool exposure, acting mode, and local scope through authored `mcpToolInstall`, with direct `mcpServer.define` / `mcpTool.install` / `mcpTool.remove` routes now proposing instead of dead-ending when target authority is missing
- stdio and local-first HTTP MCP transports over the real witnessed host/tool surface
- delegated versus service identity execution instead of one implicit global automation identity
- a real `desktop` startup mode over the same runtime/profile/operator seams
- a desktop launcher window that chooses or creates `WORLD_HOME` before the runtime-backed app page loads
- a single-active-world desktop session manager with recent-world persistence outside world truth
- explicit desktop shell state and a narrow `window.witnessDesktop` bridge for world-home open/create/reveal flows

Still missing:

- broader in-product explanation for shell-specific absence and profile-gated surface differences
- wider desktop-native breadth beyond local ownership
- MCP prompts/resources/completions and richer remote auth/discovery semantics

Do:

- keep shell powers explicit and capability-shaped
- make automation identity, transport, and scope as inspectable as any other world object

Do not:

- let Electron, browser APIs, or automation transports leak into the core model as hidden assumptions

### 8.2 Desktop shell

Status: `partial`

What it is:

- the first local ownership shell over the same runtime and world model

Why it accelerates:

- restores local ownership feel
- makes `WORLD_HOME` ownership explicit through a native launcher and directory selection flow
- proves that shell-local powers can stay explicit without becoming ambient core/runtime capabilities

Current molecules:

- Electron wrapper over the shared runtime startup path
- launcher window for `Open Existing World` / `Create New World`
- single-active-world session manager with recent-world persistence
- explicit `openWorldHome`, `createWorldHome`, `revealWorldHome`, and `getDesktopShellState` bridge methods
- bootstrap-visible desktop shell status over the running world

Still missing:

- broader file/open/save document semantics beyond world-home ownership
- desktop notifications/system integrations
- local packaging/update lifecycle
- stronger end-to-end non-mock desktop testing and ops breadth

Do:

- keep desktop-only powers explicit and shell-local
- keep desktop ownership anchored to `WORLD_HOME`

Do not:

- assume the desktop shell is "just the web app in a box"
- turn native world-home ownership into an ambient generic filesystem bridge

### 8.3 Persistence, backup, and operator lifecycle

Status: `partial`

What it is:

- warm worlds
- backup/recovery
- operator flows

Why it accelerates:

- makes worlds durable enough to matter

Missing molecules:

- better persistent runtime lifecycle docs and tooling
- backup/export/import flows
- operator-owned reset/recovery flows

Do:

- treat persistence as part of product ownership, not only an implementation detail

Do not:

- leave long-term world survival as an undocumented temp-dir convention

### 8.4 Universal ecosystem/store protocol

Status: `missing`

What it is:

- the larger capability exchange layer across worlds and operators

Why it accelerates:

- reusable capabilities become a network effect instead of one-world local hacks

Missing molecules:

- signed provenance
- install/update channels
- compatibility semantics
- broader trust/review/report surfaces beyond the shipped local runtime-plugin review/detail and composition-preview layer

Do:

- keep provenance, authority, and compatibility visible

Do not:

- treat distribution as merely file hosting

---

## The Most Important Missing Molecules

If the question is "what most accelerates everything from here?", the highest-leverage missing molecules are:

1. first-class capability/plugin object model
2. explicit context model for names, scope, and authority
3. editable-everywhere page grammar
4. search/command surface
5. live editable inspector
6. contextual Sourcery beyond the one tutorial
7. capability catalog/store
8. multi-shell contract with explicit desktop capabilities

These are the molecules that turn the current baseline from a coherent prototype into a compounding system.

---

## Current Engineering Do / Don't Summary

### Do

- make reusable concepts first-class in the model
- prefer capability objects over hidden expansion
- keep app/plugin/runtime/shell boundaries explicit
- add generic primitives when many features depend on the same shape
- keep inspection and execution aligned
- keep curation truthful and reversible
- make editing local to the point of discovery where possible

### Do not

- hard-code app-specific behavior in JS and call it generic
- hide important structure behind convenience flows
- let global ids replace real context boundaries
- treat plugins as black boxes
- make Sourcery a separate fake product
- build shell-specific powers directly into the core truth model
- add features without asking which reusable molecule is actually missing

---

## Relationship To The Roadmap

The roadmap describes sequence.

This document describes capability shape.

When new work is discovered, it should ideally be captured in both places:

- the roadmap should say **when** and **why**
- this catalog should say **what reusable molecule is being added**
