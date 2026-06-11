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
- login/logout
- cookie-backed session transport

Why it accelerates:

- gives ownership and continuity immediately

Missing molecules:

- better persistent-world recovery/admin flows
- password reset/operator recovery
- deeper identity lifecycle and recovery semantics beyond `homePerspective` + `homeContext`

Do:

- treat first identity as an ownership event, not only auth plumbing

Do not:

- regress to actor pickers or raw request headers as the normal mental model

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

Missing molecules:

- local naming/import/export mechanics
- broader context composition semantics beyond bootstrap governance
- clearer long-term context-aware capability/store semantics

Do:

- move toward context as the unit of composition and explanation

Do not:

- keep adding globally-scoped ids and relationships when the real semantics are local

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
- direct `403` enforcement for unauthorized scoped bootstrap writes

Missing molecules:

- authority coverage outside the generic bootstrap mutation surface
- broader principal/role/group semantics
- richer proposal queue/review/workflow behavior
- proposal coverage for app-specific handler-set actions

Do:

- treat this as a first-class model problem, not a bolt-on permissions matrix

Do not:

- hard-code long-term authority decisions into host checks alone

Honest caveats:

- stewardship is currently actor-string based, not yet a richer principal model
- proposals execute a fixed supported set of bootstrap target processes, not arbitrary world mutations
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

Status: `missing`

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

Missing molecules:

- stable context menus/selection grammar
- widget-to-definition mapping in live surfaces
- page-local edit affordances
- save/apply flows that write back to the world

Do:

- make editing available from where the user discovers the need

Do not:

- force every structural edit through a detached admin page if the live surface could own the action

### 5.3 Search and command surface

Status: `missing`

What it is:

- one universal search/command layer across the world

Why it accelerates:

- reduces friction between discovery and action

Missing molecules:

- indexed search over pages/widgets/plugins/witnesses/processes
- command palette/action model
- hidden/disabled surface discovery
- context-aware ranking without dishonesty

Do:

- treat search as a first-class operating primitive

Do not:

- relegate navigation/discovery to manually browsing ever-growing sidebars

### 5.4 Live editable inspector

Status: `missing`

What it is:

- a devtools-like live inspector that can save changes back into the world

Why it accelerates:

- collapses the gap between seeing, understanding, and changing

Missing molecules:

- DOM-to-widget mapping
- live selection/highlight mechanics
- editable property/schema panels
- safe save/apply/rollback behavior

Do:

- keep the inspector grounded in real authored structures

Do not:

- build a fake DOM-only editor that cannot explain or persist its changes truthfully

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

Still missing:

- remote catalog/store protocol
- update lifecycle
- trust/review/report surfaces
- richer version compatibility semantics

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

Still missing:

- packaging/bundling semantics
- installable export format
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
- `routePage` means the served route plus its root `Page` widget only; it is not a general page/entity/subtree placement model.
- Validation is typed and dependency-aware, but not yet a deep semantic solver for version, authority, or cross-surface conflicts.
- The local catalog behaves like a projected index, not yet like a full ecosystem/store protocol.

These are acceptable for the first vertical slice, but they should stay visible so later work can tighten or replace them intentionally rather than accrete around them by accident.

---

## 7. Sourcery and Guided Composition

This is not just onboarding. It is the future companion layer.

### 7.1 Contextual Sourcery

Status: `partial`

What it is:

- today: bootstrap tutorial
- intended: contextual guide across world/page/section/widget/chapter scopes

Why it accelerates:

- converts complexity into learnable adventure without hiding the real system

Missing molecules:

- per-scope enable/disable
- restart from current context
- page-aware/section-aware state
- world-level "where is Sourcery active/disabled" view

Do:

- keep Sourcery truthful and optional

Do not:

- let it become a fake simplified product that users later "graduate out of"

### 7.2 Concept-aware guidance

Status: `missing`

What it is:

- teaching concepts when they become relevant

Why it accelerates:

- users learn composition in the order it becomes real

Missing molecules:

- concept graph
- trigger conditions based on authored/runtime state
- explanation surfaces tied to concrete visible structures

Do:

- teach "you", then "your environment", then "your tools", then "your world", then "your app"

Do not:

- front-load implementation nouns before the user has a reason to care

### 7.3 Ambient assistance and curation

Status: `missing`

What it is:

- suggestions and ranking without deception

Why it accelerates:

- good things surface, bad things remain available, the user stays in control

Missing molecules:

- usage-driven ranking
- local-context recommendation model
- explanation of why something is surfaced
- filters for universal/advanced/disabled/internal things

Do:

- rank honestly and explain surfacing decisions

Do not:

- hide real capabilities because the assistant decided they were not fashionable

---

## 8. Shell, Distribution, and Ecosystem

These capabilities decide whether the system becomes a serious operating environment.

### 8.1 Multi-shell core

Status: `partial`

What it is:

- browser/hosted operation now
- future desktop shell alongside it

Why it accelerates:

- same world can be owned locally and reached remotely

Missing molecules:

- explicit shell contract
- shell-specific capability boundaries
- desktop integration story

Do:

- keep shell powers explicit and capability-shaped

Do not:

- let Electron or browser APIs leak into the core model as hidden assumptions

### 8.2 Desktop shell

Status: `missing`

What it is:

- the "real program" shell

Why it accelerates:

- restores local ownership feel
- enables filesystem/native integrations cleanly

Missing molecules:

- Electron or equivalent wrapper
- file/open/save integration model
- desktop notifications/system integrations
- local packaging/update lifecycle

Do:

- model desktop-only powers as explicit capabilities

Do not:

- assume the desktop shell is "just the web app in a box"

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
- trust/review/report surfaces

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
