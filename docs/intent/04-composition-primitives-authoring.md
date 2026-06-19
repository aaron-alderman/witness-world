# 04 - Composition Primitives & Authoring

## Role in Primary Intent

Applications and platform features are assembled from a small set of first-class modeled primitives rather than ad-hoc code or hidden component trees. Authoring (including the bootstrap seam that can recover a blank world) must itself be expressed through these primitives and lower into the witnessed world model.

See [../CAPABILITIES.md](../CAPABILITIES.md#2-composition-primitives) and the DESIRE kernel (category 03).

## Core Desires / Intents

### 4.1 First-class modeled primitives as the building blocks
Primitives include (but are not limited to): context, entity, store, message, type, process, projection, dataflow, surface, capability, boundary, policy, graph, widget primitives + templates, routes/serves.

**Formal definition:**
- [../CAPABILITIES.md](../CAPABILITIES.md#2-composition-primitives)
- Kernel kinds in [../../src/desire/ir.js](../../src/desire/ir.js) (DESIRE_KERNEL_KINDS)
- Widget and template rules in CAPABILITIES 2.1

**Enacted in code:**
- Kernel kinds + DESIRE application directly create these as witnessed objects.
- DSL loading: [../../src/dsl.js](../../src/dsl.js) and [../../src/app-project.js](../../src/app-project.js) that turn wtoml into desire docs + witnesses.
- Type model: [../../src/type-model.js](../../src/type-model.js)
- Shared specs: used for both builder UIs and runtime validation (see widget editor, form controls).

### 4.2 Widget primitives + templates + attach/render semantics
**Defined:**
- CAPABILITIES 2.1: "page composition is already moving away from one-off composite cheats"

**Enacted:**
- Core widget registry and rendering: [../../src/widgets.js](../../src/widgets.js)
- Runtime surface widget page: [../../src/runtime-widget-page.js](../../src/runtime-widget-page.js)
- Many plugin widget definitions (e.g. inspect widget-page.js, eden embedded, canvas widgets).
- Value editors and schema-driven forms in the widget editor surface (uses valueType from specs).

### 4.3 Frontend (and backend) process primitives
Events, ordered steps, when/after/repeat, async boundaries.

**Enacted:**
- [../../src/desire/process-eval.js](../../src/desire/process-eval.js) — generic engine.
- Frontend programs and steps authored in wtoml and lowered.
- Runtime execution runner: [../../src/runtime-execution-runner.js](../../src/runtime-execution-runner.js)
- Process graph visualization: [../../src/process-graph.js](../../src/process-graph.js)

### 4.4 Route, serve, and serverRunner composition
**Defined in CAPABILITIES 2.3:**
- App reachability is declarative and projectable.

**Enacted:**
- [../../src/runtime-routing.js](../../src/runtime-routing.js)
- [../../src/runtime-host-route-factory.js](../../src/runtime-host-route-factory.js)
- Route and serve nodes in wtoml lower into runtime declarations + desire surfaces.
- Server runner authoring plugin: [../../plugins/server-runner-authoring/](../../plugins/server-runner-authoring/)

### 4.5 Bootstrap seam + typed builders that recover blank worlds into runnable apps
The bootstrap path is not a separate wizard; it is modeled authoring that produces real world objects.

**Enacted:**
- [../../plugins/bootstrap/](../../plugins/bootstrap/) (large directory of builders, tutorial, recovery).
- Runtime authoring services: [../../src/runtime-authoring-services.js](../../src/runtime-authoring-services.js)
- MCP authoring and program authoring plugins also feed the same path.
- Guidance bootstrap cards and interactions live on real surfaces.

### 4.6 Authoring must be honest and lower only at genuine symmetry breaks
From DESIRE-SPA thesis:
- "The app must be authored in DESIRE terms. Handwritten browser facades must not regain authority over shell structure or app flow."
- Lazy transport and route-local payload slicing are runtime responsibilities.

**Implementation examples:**
- [../../plugins/mcp-authoring/](../../plugins/mcp-authoring/)
- [../../plugins/program-authoring/](../../plugins/program-authoring/)
- Authoring core: [../../plugins/authoring-core/](../../plugins/authoring-core/)
- WCSS / uplift work for Engentus parity is evidence gathering, not authority (see docs/ENGENTUS-* and WHTML-WCSS-UPLIFT).

## DSL / Example Authoring Surface
- Demo app composition: [../../examples/demo-todo-app/app.wtoml](../../examples/demo-todo-app/app.wtoml) + split files in [../../examples/_lib/](../../examples/_lib/)
- Common library (traits, valueTypes, processSpecs): [../../examples/_lib/common.wtoml](../../examples/_lib/common.wtoml)
- Platform console itself: platform-console.rvm + .wcss under [../../plugins/platform/](../../plugins/platform/)

## Current Molecules vs. Missing
Present: core primitives, widget templates, route composition, shared specs, bootstrap recovery.
Partial/Missing (per CAPABILITIES): richer base primitive coverage, deeper backend/frontend process parity, broader context composition, more ergonomic editor generation from specs.

## Cross References
- Relies on: 03 (DESIRE kernel is the vocabulary)
- Produces material for: 05 (capabilities as authored objects), 07 (executable processes), 09 (surfaces)
- Authoring honesty enforced by runtime-authoring-policy: [../../src/runtime-authoring-policy.js](../../src/runtime-authoring-policy.js)

## Key Links
- Definition: [../CAPABILITIES.md](../CAPABILITIES.md#2-composition-primitives)
- Kernel primitives: [../../src/desire/ir.js](../../src/desire/ir.js)
- Process execution: [../../src/desire/process-eval.js](../../src/desire/process-eval.js)
- Widget core: [../../src/widgets.js](../../src/widgets.js)
- Bootstrap: [../../plugins/bootstrap/](../../plugins/bootstrap/)
- Authoring plugins: authoring-core, program-authoring, mcp-authoring, server-runner-authoring
