# 03 - Semantic Authoring Kernel (DESIRE)

## Role in Primary Intent

DESIRE is the smallest honest semantic target for authorship. Source languages (WTOML, RVM) and higher IRs (DESIRE+) lower into it. It expresses domain truth, governed processes, and semantic surfaces **without** committing to DOM, transport, routes, widget trees, or plugin installation mechanics. This keeps authored intent separable from runtime realization.

Primary references: [../DESIRE.md](../DESIRE.md), [../DESIRE-SPA.md](../DESIRE-SPA.md), [../experiment/new-desire/README.md](../experiment/new-desire/README.md), and [../PRIMARY-INTENT.md](../PRIMARY-INTENT.md).

## Core Desires / Intents

### 3.1 DESIRE is the canonical minimal semantic kernel
**Formal definition:**
- [../experiment/new-desire/DESIRE-KERNEL.md](../experiment/new-desire/DESIRE-KERNEL.md): "the smallest semantic kernel that: can express domain truth, can express governed process behavior, can express semantic surfaces without committing to DOM/HTML"
- Principles: stores semantic meaning not authored sugar; smaller than RVM and wtoml; can be normalized aggressively; does not promise reconstruction of original source tree.
- Kernel inventory (from ir.js and kernel doc): context, type, message, store, entity, graph, projection, collection, capability, boundary, policy, process, surface, dataflow.

**Enacted in code (the contract):**
- [../../src/desire/ir.js](../../src/desire/ir.js):
  ```js
  export const DESIRE_KERNEL_KINDS = new Set([
    "context", "type", "message", "store", "entity", "graph",
    "projection", "collection", "capability", "boundary",
    "policy", "process", "surface", "dataflow"
  ]);
  ```
- DESIRE_NODE_KINDS and validation live here. Bridge kinds (`runtime.declaration`, `runtime.doc`) are explicitly separated.

### 3.2 DESIRE+ preserves authored structure and source provenance above the kernel
**Formal definition:**
- [../experiment/new-desire/DESIRE-PLUS.md](../experiment/new-desire/DESIRE-PLUS.md): "the source/debug IR above DESIRE". Preserves modules, imports, source grouping, plugin surface forms, explicit runtime declarations, surface trees, provenance, rewrite history.
- Boundary: DESIRE+ keeps server runners, routes, widget/DOM trees, source module layout; these lower or stay residual.

**Enacted:**
- [../../src/desire/elaborate.js](../../src/desire/elaborate.js) + [../../src/desire/plugins.js](../../src/desire/plugins.js)
- Built-in node kinds: "wtoml.doc", "rvm.form"
- Semantic kinds and source categories defined in ir.js (DESIRE_PLUS_SEMANTIC_KINDS, DESIRE_PLUS_SOURCE_CATEGORIES, DESIRE_PLUS_BOUNDARIES).
- Elaborator registry allows plugins to contribute tree rewrites that stay in DESIRE+ before final lowering.

### 3.3 Honest lowering from source languages; provenance retained
WTOML and RVM are treated as source; they lower through DESIRE+ into DESIRE. Runtime declarations use a bridge + registry pattern.

**Enacted:**
- Lowering: [../../src/desire/wtoml.js](../../src/desire/wtoml.js), [../../src/desire/rvm.js](../../src/desire/rvm.js), [../../src/desire/rvm-forms.js](../../src/desire/rvm-forms.js)
- Application: [../../src/desire/apply.js](../../src/desire/apply.js) — `applyDesire(world, desire)`, `applyDesireNativeOnly`, runtime declaration registry (`createCoreRuntimeDeclarationRegistry`, plugin extensions).
- `NATIVE_RUNTIME_DECLARATION_KINDS`, audit functions for legacy bridge policy.
- Serialize / normalize layers: [../../src/desire/serialize.js](../../src/desire/serialize.js), [../../src/desire/normalize.js](../../src/desire/normalize.js)
- Spec integrity: [../../src/desire/spec-integrity.js](../../src/desire/spec-integrity.js)

### 3.4 Kernel deliberately excludes runtime wiring, DOM, transport, plugin installation
This enforces the separation of authored semantic intent from implementation.

**Defined in:**
- Kernel doc and ir.js comments: routes, server runners, transports, plugin installation, MCP runtime declarations, widget trees, DOM tags, CSS, source spans stay in DESIRE+ or lower layers.
- "Runtime residual bridge" section in DESIRE-KERNEL.md explains the `runtime.declaration` envelope for things that still need traceability while WTOML is the runnable surface.

**Enacted:**
- Runtime declarations are applied via registered handlers after kernel lowering.
- Surface nodes in the kernel are semantic only (see category 09); concrete rendering lives in runtime-surface-* and plugins.

### 3.5 Process and projection execution are generic over the kernel
**Enacted:**
- [../../src/desire/process-eval.js](../../src/desire/process-eval.js): "GENERIC DESIRE process/event execution engine. No domain logic." `createProcessRuntime`, dispatch, deliver, state machines for `desire.defineProcess`.
- Projection eval is likewise generic (see category 02).

## Key Files Implementing the DESIRE Stack

| Concern              | Files (relative to repo root)                          |
|----------------------|-------------------------------------------------------|
| Kernel contract      | src/desire/ir.js                                      |
| Lowering             | src/desire/wtoml.js, rvm.js, rvm-forms.js             |
| Elaboration / +      | src/desire/elaborate.js, plugins.js                   |
| Application          | src/desire/apply.js (core + plugin extensions)        |
| Execution engines    | src/desire/process-eval.js, projection-eval.js        |
| Host / normalization | src/desire/{normalize,serialize,host-operation}.js    |
| Index surface        | src/desire/index.js                                   |

## Source Language Examples (that lower)
- Common traits/types: [../../examples/_lib/common.wtoml](../../examples/_lib/common.wtoml)
- Demo todo split: frontend.wtoml + backend.wtoml
- RVM fixtures under [../../examples_rvm/](../../examples_rvm/)
- Platform console itself is authored in RVM: [../../plugins/platform/platform-console.rvm](../../plugins/platform/platform-console.rvm)

## Honesty Notes
- DESIRE is the "lowering target", not the human-first syntax in all cases.
- Current reality: wtoml remains the primary runnable authored surface for many things; DESIRE is the semantic normalization + execution layer.
- "DESIRE-SPA" work (Engentus) is explicitly about expressing the app in DESIRE terms rather than handwritten browser facades.

## Cross References
- Feeds: 04 (Composition uses kernel primitives), 05 (capabilities/boundaries in kernel), 07 (process execution), 09 (semantic surfaces).
- Governed by: 01–02 (all kernel entities ultimately become witnessed things/relations via apply).
- See [../experiment/new-desire/ROADMAP.md](../experiment/new-desire/ROADMAP.md) for ongoing kernel/desire+ evolution.
