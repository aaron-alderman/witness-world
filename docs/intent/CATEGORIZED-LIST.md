# Canonical List of Platform Desires / Intents

This document contains:

1. A raw compiled list of platform desires and intents (drawn from documentation statements and realized in code).
2. Sorted into categories.

Each item links to primary documentation sources and to relevant implementation locations.

---

## Raw List (Unsorted)

1. Preserve witnessed truth as the only source of durable canonical meaning via an append-only witness log; all state, ownership, authority and views are projections. ([../SYSTEM.md](../SYSTEM.md), [../CAPABILITIES.md](../CAPABILITIES.md#11-witness-log-and-projection-substrate), [../../src/witness-log.js](../../src/witness-log.js))
2. Model reality using the irreducible ontology of Thing, Relation, Process, Witness and their derived concepts (Soul, Ownership, Stewardship, Authority, Proxy, Perspective, Governance). ([../SYSTEM.md](../SYSTEM.md))
3. Provide a minimal canonical semantic kernel (DESIRE) that can express domain truth, governed processes, and semantic surfaces independent of any specific renderer, transport, or widget DOM. ([../DESIRE.md](../DESIRE.md), [../experiment/new-desire/DESIRE-KERNEL.md](../experiment/new-desire/DESIRE-KERNEL.md), [../../src/desire/ir.js](../../src/desire/ir.js))
4. Support multiple source languages (WTOML, RVM) and an intermediate DESIRE+ form that lower honestly into the DESIRE kernel while preserving provenance and authored structure where useful. ([../DESIRE-SPA.md](../DESIRE-SPA.md), [../experiment/new-desire/DESIRE-PLUS.md](../experiment/new-desire/DESIRE-PLUS.md), [../../src/desire/wtoml.js](../../src/desire/wtoml.js), [../../src/desire/rvm.js](../../src/desire/rvm.js), [../../src/desire/elaborate.js](../../src/desire/elaborate.js))
5. Author applications and behavior declaratively from first-class composition primitives: contexts, entities, stores, messages, types, processes, projections, dataflows, surfaces, capabilities, boundaries, and policies. ([../CAPABILITIES.md](../CAPABILITIES.md#2-composition-primitives), [../../src/desire/ir.js](../../src/desire/ir.js), examples under [../../examples/](../../examples/))
6. Make capabilities and plugins first-class glass objects that remain fully inspectable after installation; never hide them inside runtime magic. ([../CAPABILITIES.md](../CAPABILITIES.md#6-capability--plugin-system), [../../plugins/capability-authoring/](../../plugins/capability-authoring/), [../../src/runtime-plugin-loader.js](../../src/runtime-plugin-loader.js))
7. Express all mutations through an explicit authority + proposal + stewardship + governance model rather than direct hidden writes. ([../AUTHORITY-MODEL.md](../AUTHORITY-MODEL.md), [../CAPABILITIES.md](../CAPABILITIES.md#43-authority-delegation-stewardship-proposals), [../../plugins/proposals/](../../plugins/proposals/), [../../src/runtime-governance.js](../../src/runtime-governance.js))
8. Treat contexts as the normal semantic, naming, visibility, and authority boundaries. ([../EXPERIENCE.md](../EXPERIENCE.md), [../CAPABILITIES.md](../CAPABILITIES.md#42-context), [../../src/context-naming-world.js](../../src/context-naming-world.js))
9. Keep all read models (UI, search, inspectors, charts) as explicit projections over witnessed data. Never treat a projection as source truth. ([../SYSTEM.md](../SYSTEM.md), [../../src/desire/projection-eval.js](../../src/desire/projection-eval.js), [../../src/projectors-core.js](../../src/projectors-core.js))
10. Model stateful effectful behavior explicitly as processes with rules, messages, commands, and traceable execution. ([../DESIRE.md](../DESIRE.md), [../../src/desire/process-eval.js](../../src/desire/process-eval.js), [../../src/process-graph.js](../../src/process-graph.js), [../../src/runtime-execution-runner.js](../../src/runtime-execution-runner.js))
11. Describe UI at the level of semantic surface intent rather than committing to DOM tags or renderer specifics in the kernel. ([../DESIRE.md](../DESIRE.md#surface), [../../src/desire/ir.js](../../src/desire/ir.js), [../../src/runtime-surface-*.js](../../src/))
12. Enable editable-everywhere: every meaningful surface (page, widget, theme, capability) must be inspectable and, when the actor holds authority, directly mutable in place with changes witnessed back into the world. ([../EXPERIENCE.md](../EXPERIENCE.md), [../CAPABILITIES.md](../CAPABILITIES.md#55-editable-everywhere-page-grammar))
13. Deliver the first user experience as a genuinely useful attractive app facade (the Todo starter) that spatially and physically reveals the larger world model rather than through an onboarding wizard. ([../FIRST-5-MINUTES.md](../FIRST-5-MINUTES.md), [../EXPERIENCE.md](../EXPERIENCE.md))
14. Provide truthful guided progression (Sourcery / Academy) that operates over real world state, tutorial progress, and actual practice rather than fake static copy. Guidance is always optional and never mandatory. ([../EXPERIENCE.md](../EXPERIENCE.md), [../ACADEMY.md](../ACADEMY.md), [../../plugins/tutorial/](../../plugins/tutorial/), [../../plugins/eden/](../../plugins/eden/), runtime-guidance-* under [../../src/](../../src/))
15. Support coherent multi-shell operation (browser, desktop ownership shell, hosted) over exactly the same core world model. Shells are thin adapters. ([../SHELLS-PERSISTENCE-ECOSYSTEM.md](../SHELLS-PERSISTENCE-ECOSYSTEM.md), [../../src/desktop-*.js](../../src/))
16. Make the authoring experience itself a set of modeled platform capabilities (bootstrap seam, typed builders, MCP authoring, program authoring, server runner authoring) rather than a separate privileged path. ([../CAPABILITIES.md](../CAPABILITIES.md#51-bootstrap-seam-and-typed-builders), [../../plugins/bootstrap/](../../plugins/bootstrap/), [../../plugins/mcp-authoring/](../../plugins/mcp-authoring/), [../../plugins/program-authoring/](../../plugins/program-authoring/))
17. Offer first-class transparent inspection surfaces: world graph/browser, process view, witness log, canvas, source browser, live inspector. ([../CAPABILITIES.md](../CAPABILITIES.md#32-world--process--source-inspection), [../../plugins/inspect/](../../plugins/inspect/))
18. Dogfood the platform: model platform change itself (intents, proposals, branches, docs, tests, verification gates, change sets) as first-class objects inside the world. ([../PLATFORM-ALL-THE-WAY-ROADMAP.md](../PLATFORM-ALL-THE-WAY-ROADMAP.md), [../../plugins/platform/](../../plugins/platform/))
19. Maintain an intent registry + ContextHub layer so that intent, documentation, code, tests, and reports stay linked and near-context. ([../INTENT-REGISTRY-ROADMAP.md](../INTENT-REGISTRY-ROADMAP.md), [../CONTEXTHUB-SPEC.md](../CONTEXTHUB-SPEC.md))
20. Treat external systems (HTTP, OAuth, notifications, storage, SQL, jobs, webhooks, MCP) as explicit boundary capabilities rather than invisible host privileges. ([../BACKEND-SEAMS.md](../BACKEND-SEAMS.md), [../../plugins/http-outbound/](../../plugins/http-outbound/), [../../plugins/oauth/](../../plugins/oauth/), etc.)
21. Provide a spatial infinite canvas surface as a primary discovery and composition environment (objects, wires, pipes, pages-as-slides, undo/redo and serialization first). ([../CANVAS.md](../CANVAS.md), [../../plugins/canvas/](../../plugins/canvas/))
22. Enforce continuous verification where tests, gates and reports are linked back to the intents and features they exercise. ([../CONTINUOUS-VERIFICATION-ROADMAP.md](../CONTINUOUS-VERIFICATION-ROADMAP.md))
23. Maintain strict honesty vocabulary and discipline (`fake`, `stub`, `projection`, `real but narrow`, `compatibility bridge`) so that narrow truthful slices are never accidentally normalized into permanent lies. (Repeated across [../EXPERIENCE.md](../EXPERIENCE.md), [../CAPABILITIES.md](../CAPABILITIES.md), [../DESIRE-SPA.md](../DESIRE-SPA.md))

---

## Categorized

### 1. Foundational Philosophy & Ontology
- Irreducible ontology (Thing / Relation / Process / Witness + derived) — [../SYSTEM.md](../SYSTEM.md)
- Preserve continuity of agency through witnessed memory — [../SYSTEM.md](../SYSTEM.md)
- Anti-goal: never become a social credit / virtue scoring system

### 2. Witness Substrate & Projections
- Append-only witness log as sole durable truth source — [../CAPABILITIES.md](../CAPABILITIES.md#11-witness-log-and-projection-substrate), [../../src/witness-log.js](../../src/witness-log.js)
- All read models are projections — [../../src/desire/projection-eval.js](../../src/desire/projection-eval.js), [../../src/projectors-core.js](../../src/projectors-core.js)
- Snapshot, replay, and recovery semantics

### 3. Semantic Authoring Kernel (DESIRE)
- DESIRE as the small honest kernel — [../DESIRE.md](../DESIRE.md), [../../src/desire/ir.js](../../src/desire/ir.js)
- DESIRE+ as source/debug IR above the kernel — [../experiment/new-desire/DESIRE-PLUS.md](../experiment/new-desire/DESIRE-PLUS.md)
- Lowering from WTOML / RVM with provenance — [../../src/desire/wtoml.js](../../src/desire/wtoml.js), [../../src/desire/rvm.js](../../src/desire/rvm.js), [../../src/desire/apply.js](../../src/desire/apply.js)
- DESIRE is not runtime wiring, not DOM, not transport

### 4. Composition Primitives & Authoring
- First-class modeled primitives (entity, process, surface, capability, etc.) — [../CAPABILITIES.md](../CAPABILITIES.md#2-composition-primitives)
- Declarative route / serve / serverRunner composition
- Widget primitives + template composition
- Shared type / process specs used for both UI builders and runtime validation
- Bootstrap seam that can recover a blank world into a runnable app through real surfaces — [../../plugins/bootstrap/](../../plugins/bootstrap/)

### 5. Capabilities, Plugins & Extensibility
- Capabilities as first-class authored objects with verbs, scope, install flows — [../../plugins/capability-authoring/](../../plugins/capability-authoring/)
- Plugin runtime loader and contribution model (desireExtensions, handlers) — [../../src/runtime-plugin-loader.js](../../src/runtime-plugin-loader.js)
- Catalog, placement, and visibility of installed capabilities
- "Glass atoms" — plugins never disappear into hidden expansion

### 6. Identity, Context, Authority & Governance
- Actor-based authority tuple (direct / assumed / service) — [../AUTHORITY-MODEL.md](../AUTHORITY-MODEL.md)
- Context as naming + authority boundary — [../../src/context-naming-world.js](../../src/context-naming-world.js)
- Stewardship, delegation, and ownership as witnessed projections
- Proposal flows for safe mutation under authority — [../../plugins/proposals/](../../plugins/proposals/), [../../src/runtime-governance.js](../../src/runtime-governance.js)
- Live proposal approval that refreshes rendered pages through witnesses

### 7. Runtime Execution, Processes & Inspection
- Explicit process model with rules, state, messages, commands — [../../src/desire/process-eval.js](../../src/desire/process-eval.js)
- Execution traces, process graphs, replay — [../../src/runtime-execution-runner.js](../../src/runtime-execution-runner.js), [../../src/process-graph.js](../../src/process-graph.js)
- World browser, process view, witness inspector, live inspector — [../../plugins/inspect/](../../plugins/inspect/)
- Canvas as spatial execution/composition surface — [../../plugins/canvas/](../../plugins/canvas/)

### 8. Product Experience, Guidance & Academy
- Todo facade as attractive first impression that then spatially reveals the world — [../FIRST-5-MINUTES.md](../FIRST-5-MINUTES.md)
- Zoom-out / reveal interaction as physical discovery
- Personal Box + bounded first agency
- Named capability gates rather than arbitrary lockouts
- Sourcery as optional truthful companion (not steering) — [../../src/runtime-guidance-*.js](../../src/)
- Academy / quests driven from real witnessed practice — [../../plugins/eden/](../../plugins/eden/), [../../plugins/tutorial/](../../plugins/tutorial/)

### 9. Surfaces & Editing Grammar
- Semantic `surface` nodes in the kernel
- Editable-everywhere grammar (right-click, inspector, in-place replace/upgrade)
- Versioned widgets with activate / rollback under governance
- Theme / material / local mood editing as safe first editing surface
- Last-good-version + restore as first-class recovery

### 10. Shells, Persistence & Ecosystem
- Single world model across browser / desktop / hosted shells
- Desktop ownership shell as first shipped narrow but real ownership adapter — [../../src/desktop-main.js](../../src/desktop-main.js)
- Preferred operator persistence via WORLD_HOME (logs, runtime, backups, exports)
- Thin shells; authority, risk, and presentation change by posture — not the model

### 11. Platform Self-Modeling, Verification & Knowledge Alignment
- Platform models its own change (intents → proposals → branches → gates → apply) — [../PLATFORM-ALL-THE-WAY-ROADMAP.md](../PLATFORM-ALL-THE-WAY-ROADMAP.md), [../../plugins/platform/](../../plugins/platform/)
- Intent registry scaffold — [../INTENT-REGISTRY-ROADMAP.md](../INTENT-REGISTRY-ROADMAP.md)
- ContextHub as the near-context knowledge + intent linking surface — [../CONTEXTHUB-SPEC.md](../CONTEXTHUB-SPEC.md)
- Continuous verification roadmap (tests and reports linked to intent) — [../CONTINUOUS-VERIFICATION-ROADMAP.md](../CONTINUOUS-VERIFICATION-ROADMAP.md)
- Honesty discipline and explicit vocabulary for current state of every capability slice

### 12. Backend & External Integration Seams
- All external concerns exposed as explicit boundary capabilities (fetch, OAuth, email/SMS, fs-*, sql-*, jobs, webhooks, MCP)
- Stub-first where full realism is intentionally deferred
- Never let host privileges become the implicit product contract — [../BACKEND-SEAMS.md](../BACKEND-SEAMS.md)

---

See [INTENT-TREE.md](./INTENT-TREE.md) for the hierarchical tree form with the primary intent as root.
