# 02 - Witness Substrate & Projections

## Role in Primary Intent

All durable meaning lives only in append-only witnessed events. Projections (read models, UI, ownership, authority, charts, etc.) are always derived and never treated as canonical truth. This is the mechanical heart that makes "truth before convenience" enforceable.

Root reference: [../PRIMARY-INTENT.md](../PRIMARY-INTENT.md) and the ontology in category 01.

## Core Desires / Intents

### 2.1 Append-only witness log is the sole source of canonical durable truth
**Formal definition:**
- [../README.md](../README.md): "a canonical append-only witness log"
- [../SYSTEM.md](../SYSTEM.md): Witnesses are immutable evidence.
- [../CAPABILITIES.md](../CAPABILITIES.md#11-witness-log-and-projection-substrate): "append-only witness recording", "derived projections", "replayable world meaning".

**Do / Do not (from CAPABILITIES):**
- Do: keep all durable meaning derived from witnesses; keep read views as projections; preserve provenance and replayability.
- Do not: create hidden mutable side stores as the real truth; let product state become authoritative outside the witness model.

**Enacted in code:**
- Core log: [../../src/witness-log.js](../../src/witness-log.js)
  - `append(witness)` pushes and fs.appendFileSync as JSONL.
  - `replace`, `all()`, `last()`, `count()`.
- World construction: [../../src/kernel.js](../../src/kernel.js)
  - `createWorld`, `emit()`, `observe()`, `makeWorldFromLog`.
  - Every world change goes through `emit` which creates a witnessed claim set and appends.
- Snapshot / restore paths: [../../src/app-snapshot-manager.js](../../src/app-snapshot-manager.js) explicitly separates `witnessDocs` (canonical) from authored desire docs.
- Application entry: [../../src/app-runtime.js](../../src/app-runtime.js) loads via `applyWitnessDocsWithRuntimePlugins`.

### 2.2 All read views, ownership, authority, state, and UI are projections
**Formal definition:**
- Multiple docs emphasize: ownership/stewardship/authority/souls are "projections over witnessed relations/history".
- [../EXPERIENCE.md](../EXPERIENCE.md) and CAPABILITIES repeatedly label surfaces as "projection-backed" vs. fake.

**Enacted in code:**
- Projection evaluation: [../../src/desire/projection-eval.js](../../src/desire/projection-eval.js) (formatters, truthiness, derive ops).
- Core projectors: [../../src/projectors-core.js](../../src/projectors-core.js) (thing/relation/retract + projector registry).
- Runtime page / widget / world projections in many places:
  - [../../src/runtime-page-state.js](../../src/runtime-page-state.js)
  - [../../src/projectors-core.js](../../src/projectors-core.js) usage throughout runtime-*
  - Plugin projections e.g. [../../plugins/demo/projections.js](../../plugins/demo/projections.js), [../../plugins/eden/eden-projection.js](../../plugins/eden/eden-projection.js)
- Command/search surface is explicitly "projection-backed, not a hidden registry".

### 2.3 Replay, fork, snapshot, and recovery are first-class operations on the log
**Enacted:**
- `fork()` in kernel.js creates child world with copied log + separate obs log.
- `project(...)` always runs a projector against `log.all()`.
- `allWitnesses()`, `lastWitness()`, observation log for side effects.
- Desktop and operator persistence use full world homes that replay the log on startup.
- Bootstrap and app loading always go through witnessed application.

### 2.4 Provenance and cause chains are preserved
Every emitted witness records its `cause` (prior witness id). This enables inspection and reasoning about history.

**Enacted:**
- `emit` always computes `actualCause = cause === undefined ? prior : cause`
- World inspector, process view, and witness surfaces expose these chains.
- See [../../plugins/inspect/](../../plugins/inspect/) (world-graph, witness views).

## Implementation Highlights

| Layer | File(s) | Notes |
|-------|---------|-------|
| Log primitive | [../../src/witness-log.js](../../src/witness-log.js) | Append-only + JSONL persistence |
| World factory | [../../src/kernel.js](../../src/kernel.js) | Genesis, emit, project, fork |
| Projection algebra | [../../src/desire/projection-eval.js](../../src/desire/projection-eval.js) + projectors-core | Generic derive + format |
| Runtime loading | [../../src/app-runtime.js](../../src/app-runtime.js), [../../src/app-snapshot-manager.js](../../src/app-snapshot-manager.js) | Witness docs are the payload |
| UI projections | runtime-page-state, runtime-surface-*, plugin projections | All derived |

## Honesty / Status
- `present` per CAPABILITIES for the core substrate.
- Missing: stronger warm/persistent world lifecycle guidance, distributed witness exchange.
- Current desktop and server starts correctly report `warm` / `cold` based on existing log.

## Cross References
- Depends on: 01 (Ontology)
- Enables: 03 (DESIRE lowering produces witnessed claims), 06 (governance via projections), 07 (process execution emits witnesses), 11 (platform self-modeling lives in the same log)
- See also [../CAPABILITIES.md](../CAPABILITIES.md#1-world-truth-and-witness-substrate)

## Key Related Code & Docs
- Definition & rules: [../CAPABILITIES.md](../CAPABILITIES.md#11-witness-log-and-projection-substrate), [../SYSTEM.md](../SYSTEM.md)
- Kernel & log: [../../src/kernel.js](../../src/kernel.js), [../../src/witness-log.js](../../src/witness-log.js)
- Desire projection layer: [../../src/desire/projection-eval.js](../../src/desire/projection-eval.js)
- Inspector surfaces that make it visible: [../../plugins/inspect/world-graph.js](../../plugins/inspect/world-graph.js) and siblings
