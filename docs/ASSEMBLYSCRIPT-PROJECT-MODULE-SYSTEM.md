# Canonical AssemblyScript Project Module System

## Purpose

This document defines the preferred end-state for project-owned compute:

- project logic does not ship as arbitrary project JavaScript
- project compute modules are authored in AssemblyScript
- AssemblyScript compiles to Wasm
- Wasm executes on demand inside the Rust core
- all host access is explicit, capability-bound, and controlled by Rust

This is both the direction and the current authoring contract. First-class compute module declarations, AssemblyScript source authoring, saved smoke tests, bundle preview materialization, and soft deletion are implemented through MCP/package authoring. Rust/Wasm execution remains shadow/proof-gated and is not authoritative production execution.

## Problem

Today the platform has a useful split:

- generic orchestration, process semantics, host-op routing, and continuity live in platform code
- some high-value project algorithms still live in JS modules under generic plugin locations

That is the wrong long-term ownership boundary.

The Engentus kernels are:

- bespoke project implementations
- not meaningfully generic platform capabilities
- valuable enough that they should remain project-owned
- risky to host as arbitrary project JavaScript

The platform should move toward a model where project-authored compute is Wasm guest code, not project JS.

## Canonical Direction

The canonical shape is:

- Rust owns continuity, generation management, proof execution, module loading, safety boundaries, and controlled bindings
- platform JS continues to own current authoring/runtime glue until those seams are intentionally replaced
- project compute is authored as AssemblyScript modules compiled to Wasm
- project Wasm modules execute through the existing host-operation boundary or an equivalent explicit compute boundary
- third-party project code is never loaded as unrestricted project JavaScript

The key design rule is:

> Do not move the generic runtime into AssemblyScript. Move project-owned compute into AssemblyScript.

## Ownership Boundary

### Generic platform code stays generic

The following remain platform responsibilities:

- process orchestration
- host-operation contract validation
- route and boundary wiring
- generation staging, proof, promotion, rollback
- source capabilities and provenance
- operator surfaces and continuity reporting

These are cross-project concerns. They belong in the platform.

### Project compute moves out of generic plugins

The following are project responsibilities:

- domain algorithms
- proprietary scoring, fitting, classification, or signal-processing logic
- domain-specific chart kernels
- project-specific model helpers that are not reusable platform primitives

These should live in project code, not be absorbed into generic plugin packages.

## Canonical Module Model

The platform should define a first-class project module kind for compute guests.

### V1 scope

V1 guest modules are:

- compute-only
- deterministic for a given input
- loaded on demand
- bounded in memory and time
- unable to perform ambient filesystem, network, process, or shell access

V1 guest modules are not:

- route handlers
- general UI scripts
- mutable world writers
- long-running daemons
- arbitrary plugin bundles

### Canonical package layout

The preferred package materialized layout is:

```text
app/modules/
  health-classify/
    assembly/
      index.ts
    smoke/
      smoke-health-low-risk.json
  burst-fit/
    assembly/
      index.ts
```

The exact path can vary, but the ownership model should not:

- the module declaration is first-class world state
- its source is authored through MCP/package materialized files
- no direct project-tree write occurs when MCP authors source
- its build artifact is a generated Wasm module
- saved smoke fixtures live with the module as package materialized files

### Canonical authored declaration

The platform has a first-class authored declaration for project compute modules:

```wtoml
[[computeModule]]
actor = "system"
id = "engentus.health.classify"
context = "ctx.compute"
source = "app/modules/health-classify/assembly/index.ts"
hostOperation = "engentus.pipeline.health.classify"
language = "assemblyscript"
abi = "world.hostOperation.v1"
export = "invoke"
maxMemoryPages = 64
timeoutMs = 100
allowedBindings = ["host.log", "host.metric"]
```

The source file itself is authored through MCP/package authoring:

- `authoring.write` action `computeModule.source.upsert`
- required body fields: `package`, `revision`, `module`, `path`, `content`
- `path` must exactly match the compute module declaration's `source`
- the result is a package materialized-file record with `sourceLanguage = "assemblyscript"`
- package bundle preview emits the file under `materialized/<path>`

The important property is that project compute is explicit and authored, not hidden inside platform JS wiring.

## MCP Authoring Contract

AssemblyScript compute module authoring is exposed through these MCP actions:

- `computeModule.create`
- `computeModule.source.upsert`
- `computeModule.source.markDeleted`
- `computeModuleSmokeTest.upsert`
- `computeModuleSmokeTest.markDeleted`
- `computeModuleSmokeTest.run`

Package materialized-file records are first-class world material:

- fields: `id`, `package`, `revision`, `path`, `content`, `sourceLanguage`, optional `deletedAt`
- active projections use the latest non-deleted record per `revision + path`
- audit/debug reads can include tombstones with `includeDeleted: true`
- bundle previews include only active materialized files by default

Direct source/file mutation pathways are blocked during this tranche:

- `/api/runtime/app-sources`
- MCP `fs.blob` write/delete via `storage.blob`
- MCP `fs.stream` write/copy via `storage.stream`
- MCP `platform.changeSet` file edit, removeEdit, and apply operations

Read-only source/file views remain available. Package authoring, proposal review, and non-source runtime capabilities remain available.

## Saved Smoke Tests

Saved smoke tests are authored records and package fixtures:

- record fields: `id`, `module`, `package`, `revision`, `hostOperation`, `request`, `expected`, optional `timeoutMs`, optional `deletedAt`
- saving a smoke test creates `app/modules/<module-slug>/smoke/<test-id>.json`
- fixture schema: `world.computeModuleSmokeTest.v1`

Fixture content:

```json
{
  "schema": "world.computeModuleSmokeTest.v1",
  "id": "smoke.health.low-risk",
  "module": "engentus.health.classify",
  "hostOperation": "engentus.pipeline.health.classify",
  "request": { "score": 1 },
  "expected": { "ok": true, "result": { "band": "low" } }
}
```

`computeModuleSmokeTest.run`:

- ignores deleted saved tests unless an inline body is supplied
- builds `inputJson` as `{ "hostOperation": "...", "request": ... }`
- treats `expected` as the complete expected result envelope
- calls `appContext.witnessCoreBridge.shadowInvokeComputeModule(...)`
- returns pass/fail, witness-core payload, expected envelope, and mismatch details
- returns `503` with `WITNESS_CORE_REQUIRED` when shadow invocation is unavailable

If the module source is marked deleted, smoke runs fail clearly with `compute module source marked deleted`.

## Soft Deletion

Mark-for-deletion emits tombstone witnesses. It never removes prior authored records.

- source/materialized files use `deletedAt`
- saved smoke tests use `deletedAt`
- normal MCP/world reads filter deleted rows
- `includeDeleted: true` exposes tombstoned rows for audit/debug views
- re-upserting the same `revision + path` creates a new active record and leaves the tombstone in history

## Canonical ABI

V1 should favor simplicity and safety over peak performance.

### Invocation contract

The module should satisfy the same stable conceptual contract already used by host operations:

- input: `{ host_operation, request }`
- output: `{ status, payload }`

For Wasm guest execution, the V1 runtime ABI is frozen as UTF-8 JSON in linear memory. That is not the final highest-performance shape, but it is the simplest safe bootstrap because:

- it matches the current host-op boundary
- it keeps parity and migration simple
- it avoids inventing a second compute model

Later versions may introduce a typed ABI or component-model form, but V1 should not block on that.

### `world.hostOperation.v1`

The canonical V1 guest ABI is:

- required export: `memory`
- required export: `invoke(inputPtr: i32, inputLen: i32) -> i32`
- required import module name: `world_host_operation_v1`

Supported host imports:

- `output(ptr: i32, len: i32) -> void`
- `log(ptr: i32, len: i32) -> void` only when `allowedBindings` includes `host.log`
- `metric(ptr: i32, len: i32) -> void` only when `allowedBindings` includes `host.metric`

Wire format:

- input JSON: `{ "hostOperation": string, "request": any }`
- output success JSON: `{ "status": "success", "payload": any }`
- output failure JSON: `{ "status": "error", "error": { "code": string, "message": string } }`

Return-code rule:

- `0` means the guest wrote an output envelope through `output(...)`
- non-zero means guest failure; if no valid error envelope was written, Rust synthesizes a guest failure from the return code

Runtime validation before execution:

- the module must export `memory`
- the module must export `invoke(i32, i32) -> i32`
- imports must be limited to the declared `allowedBindings` plus required `output`
- any undeclared, ambient, or non-`world_host_operation_v1` import is rejected for runtime use

### Controlled host bindings

Guest modules should get no ambient authority.

V1 should expose at most:

- input buffer access
- output buffer write
- structured failure return
- optional logging/metrics hooks
- optional deterministic helper functions explicitly provided by Rust

Not allowed in V1:

- direct file reads or writes
- direct network calls
- arbitrary clock access
- random entropy without explicit deterministic policy
- direct world mutation
- spawning processes

## Build And Generation Model

The Wasm module system should plug into the same continuity model as other authored assets.

### Source to generation flow

1. Authored AssemblyScript source is upserted through MCP as a package materialized file.
2. Rust stages the module as a candidate generation input.
3. The module compiles in isolation to Wasm.
4. The smallest impacted proof set runs.
5. Candidate stays rejected on compile or proof failure.
6. Candidate promotes only through the same generation model already used by the live core.

### Durable artifact ownership

Candidate-local Wasm artifacts are build outputs, not runtime-trusted assets.

The runtime-owned store lives under:

```text
.witness-core/artifacts/compute-modules/<sha256>.wasm
```

For the live-core runtime tranche:

- the build worker still emits candidate-local staged artifacts
- `witness-core` copies successful artifacts into the durable store keyed by `artifactHash`
- generation metadata records both the staged `artifactPath` and durable `storePath`
- only durable stored artifacts are eligible for runtime execution

### Runtime modes

`witness-core` owns the first runtime execution policy:

```toml
[compute_modules]
engine = "wasmtime"
execution_mode = "disabled" # or "shadow"
artifact_store_root = ".witness-core/artifacts/compute-modules"
```

Mode semantics:

- `disabled`: no guest execution
- `shadow`: eligible guest modules execute beside the incumbent JS handler, parity is observed, and JS remains authoritative

The first live target is only `engentus.pipeline.health.classify`.

### Required proof lanes

Each compute module should support:

- compile proof
- ABI validation proof
- fixture replay proof
- parity proof against the current oracle or incumbent implementation
- optional performance budget proof

This keeps Wasm guest code governed by the same proof discipline as the rest of the platform.

## Migration Rule

The migration rule is:

1. identify a project-owned JS compute implementation
2. move it under project ownership conceptually
3. keep the existing host-op boundary stable
4. port the implementation to AssemblyScript
5. run parity proofs against the incumbent JS or oracle
6. flip execution to Rust-hosted Wasm only after proof passes
7. remove the project JS implementation once the Wasm path is trusted

This keeps platform semantics stable while replacing project compute underneath.

## Engentus Roadmap

Engentus is the first vertical slice because the candidate modules are already visible and bounded.

### Phase 0: Platform decision and constraints

- Declare project JS compute a temporary migration state, not a desired end-state.
- Declare AssemblyScript to Wasm as the canonical project compute module form.
- Keep the live-core phase gate: do not land Wasm runtime work before generation/proof continuity is real.

### Phase 1: Introduce the project module declaration

- Add a first-class authored declaration for project compute modules.
- Add module discovery, metadata, and provenance rules.
- Define the V1 host-operation ABI for Wasm guests.
- Define the capability/binding model and hard authority limits.

Deliverable:

- a project can describe a compute guest module, author its AssemblyScript source through package materialized files, and save smoke fixtures without authoritative Wasm execution

### Phase 2: Add Rust guest execution

- Add Wasm module loading and caching to `witness-core`
- Add bounded execution, memory limits, timeout limits, and structured errors
- Add controlled host bindings
- Add proof hooks for compile, ABI, and fixture replay

Deliverable:

- Rust can compile/load/invoke a Wasm compute guest on demand under proof

### Phase 3: Migrate Engentus health classify first

Initial target:

- `plugins/pipeline-runtime/health-kernels.js`

Why first:

- pure classification logic
- deterministic
- small input and output surface
- existing typed enums and thresholds
- lowest migration risk

Steps:

- author `app/modules/health-classify/assembly/index.ts` through `computeModule.source.upsert`
- port `classifyChannelHour` and the aggregate helpers to AssemblyScript
- save smoke fixtures through `computeModuleSmokeTest.upsert`
- keep the host-operation shape unchanged
- run parity proofs against the current real fixtures and incumbent behavior
- flip `engentus.pipeline.health.classify` to the Wasm module

Success criteria:

- exact row-for-row parity with the current verified oracle set
- no platform runtime changes beyond the guest execution seam

### Phase 4: Migrate Engentus burst fit

Initial target:

- `plugins/pipeline-runtime/burst-fit-kernels.js`

Why second:

- still bounded and compute-only
- higher value than health because it is a real numeric kernel
- good performance candidate for Rust-hosted Wasm
- narrower risk than Kalman

Steps:

- author `app/modules/burst-fit/assembly/index.ts` through `computeModule.source.upsert`
- port `fitBurstRpm` and the minimal required helpers to AssemblyScript
- keep smoke fixtures and proof harnesses beside the module as package materialized files where applicable
- prove parity against the current real-signal fixtures
- flip the host-operation implementation after proof passes

Success criteria:

- parity with current verified burst fixtures
- predictable runtime budget under Rust supervision

### Phase 5: Migrate Engentus Kalman

Initial target:

- `plugins/pipeline-runtime/kalman-kernels.js`

Why third:

- highest value among the current kernels
- likely a hot path
- materially higher parity and stability risk than health or burst fit

Steps:

- author `app/modules/kalman/assembly/index.ts` through `computeModule.source.upsert`
- port the 3-state joint Kalman implementation and required math helpers
- preserve the current oracle and fixture lane
- run stronger numeric tolerance and stability proofs than the earlier modules
- flip only after repeated parity confidence

Success criteria:

- parity with the chosen canonical oracle
- stable resource limits in Rust-hosted execution

### Phase 6: Remove project JS compute from generic plugin locations

After the first Engentus modules are stable:

- remove Engentus-owned compute from generic plugin packages
- keep only generic orchestration and host-op infrastructure in platform code
- deprecate project-supplied JS compute handlers
- require new project compute to use the AssemblyScript module system

Success criteria:

- project algorithms live in project-owned modules
- platform packages stop accumulating bespoke domain math

## Non-Goals

This plan does not imply:

- rewriting the generic DESIRE process runtime in AssemblyScript
- moving UI/client/browser code to Wasm
- making Wasm the authoring format for everything
- allowing Wasm guests to mutate the world arbitrarily
- bypassing the existing proof and promotion model

## Acceptance Criteria For The Direction

This direction is successful when:

- project-owned compute has a first-class authored module system
- third-party project code is not hosted as unrestricted project JavaScript
- Rust executes project compute guests on demand through controlled bindings
- generic runtime semantics remain in platform code
- Engentus health, burst-fit, and Kalman run as project-owned Wasm modules
- the platform can reject, prove, promote, and roll back compute module generations using the same continuity model as the rest of the live core

## Decision

The platform should head in this direction.

AssemblyScript-to-Wasm is the canonical project compute module system.

Engentus is the first migration vertical:

- health first
- burst-fit second
- Kalman third

The platform should treat that sequence as the proving ground for the module system, the Rust guest runner, and the proof-driven swap path.
