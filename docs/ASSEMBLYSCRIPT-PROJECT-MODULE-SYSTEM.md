# Canonical AssemblyScript Project Module System

## Purpose

This document defines the preferred end-state for project-owned compute:

- project logic does not ship as arbitrary project JavaScript
- project compute modules are authored in AssemblyScript
- AssemblyScript compiles to Wasm
- Wasm executes on demand inside the Rust core
- all host access is explicit, capability-bound, and controlled by Rust

This is a target architecture and migration plan. It does not override the current live-core phase gate in `docs/LIVE-CORE-GOAL-CONTRACT.md`: the platform should not implement Wasm execution until the generation, process, proof, and promotion path is working end-to-end.

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

### Canonical project layout

The preferred project layout is:

```text
examples/engentus/app/modules/
  health-classify/
    module.wtoml
    assembly/
      index.ts
    fixtures/
    proofs/
  burst-fit/
    module.wtoml
    assembly/
      index.ts
    fixtures/
    proofs/
```

The exact path can vary, but the ownership model should not:

- the module is part of the project tree
- its source is authored material
- its build artifact is a generated Wasm module
- its proofs and fixtures live with the module

### Canonical authored declaration

The platform should introduce a first-class authored declaration for project compute modules. A sketch:

```wtoml
project.computeModule "engentus.health.classify"
  source "app/modules/health-classify/assembly/index.ts"
  language "assemblyscript"
  abi "world.hostOperation.v1"
  export "invoke"
  maxMemoryPages 64
  timeoutMs 100
  allowedBindings ["host.log", "host.metric"]
```

And an adapter or host-op binding should reference that module explicitly:

```wtoml
boundary.adapter "engentus.pipeline.health.classify"
  hostOperation "engentus.pipeline.health.classify"
  implementation "module:engentus.health.classify"
```

The important property is that project compute is explicit and authored, not hidden inside platform JS wiring.

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

1. Authored AssemblyScript source changes in the project tree.
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

- a project can describe a compute guest module without executing it yet

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

- create `examples/engentus/app/modules/health-classify/`
- port `classifyChannelHour` and the aggregate helpers to AssemblyScript
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

- create `examples/engentus/app/modules/burst-fit/`
- port `fitBurstRpm` and the minimal required helpers to AssemblyScript
- keep fixtures and proof harnesses beside the module
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

- create `examples/engentus/app/modules/kalman/`
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
