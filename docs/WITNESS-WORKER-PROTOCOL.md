# Witness Worker Protocol

## Purpose

This document defines the stable worker protocol envelope used between `witness-core` and Node workers.

The immediate shipped consumer is the build worker.
The protocol is defined broadly enough to cover the next worker classes without changing the outer envelope shape.

## Version

- `protocol: "witness-worker/v1"`

## Envelope Shape

```json
{
  "protocol": "witness-worker/v1",
  "kind": "result",
  "operation": "build",
  "requestId": "req-build-1",
  "ok": true,
  "payload": {},
  "error": null,
  "warnings": [],
  "metadata": {
    "workerClass": "node-build-worker",
    "canonicalStateAccess": "none",
    "scratchState": "worker-local"
  }
}
```

## Kinds

- `request`
- `result`
- `event`

## Operations

- `build`
- `evaluate`
- `render`
- `inspect`
- `bounded_compute`

## Operation Profiles

- `build`
  - `workerClass: "node-build-worker"`
  - `canonicalStateAccess: "none"`
  - `scratchState: "worker-local"`
- `evaluate`
  - `workerClass: "node-evaluate-worker"`
  - `canonicalStateAccess: "delegated_read_only"`
  - `scratchState: "worker-local"`
- `render`
  - `workerClass: "node-render-worker"`
  - `canonicalStateAccess: "delegated_read_only"`
  - `scratchState: "worker-local"`
- `inspect`
  - `workerClass: "node-inspect-worker"`
  - `canonicalStateAccess: "delegated_read_only"`
  - `scratchState: "worker-local"`
- `bounded_compute`
  - `workerClass: "node-bounded-compute-worker"`
  - `canonicalStateAccess: "none"`
  - `scratchState: "worker-local"`

## Shared Fields

- `requestId`
  - correlates a worker `request`, `event`, and `result`
- `metadata.workerClass`
  - identifies the worker class expected to handle the operation
- `metadata.canonicalStateAccess`
  - declares whether canonical state is unavailable to the worker (`none`) or only visible through delegated read-only/read-write contracts
- `metadata.scratchState`
  - declares whether the worker is using no scratch state, worker-local scratch, or Rust-staged scratch

## Envelope Examples

Request:

```json
{
  "protocol": "witness-worker/v1",
  "kind": "request",
  "operation": "render",
  "requestId": "req-render-1",
  "payload": {
    "route": "/live-core"
  },
  "metadata": {
    "workerClass": "node-render-worker",
    "canonicalStateAccess": "delegated_read_only",
    "scratchState": "worker-local"
  }
}
```

Event:

```json
{
  "protocol": "witness-worker/v1",
  "kind": "event",
  "operation": "evaluate",
  "requestId": "req-evaluate-1",
  "eventName": "progress",
  "payload": {
    "phase": "load"
  },
  "metadata": {
    "workerClass": "node-evaluate-worker",
    "canonicalStateAccess": "delegated_read_only",
    "scratchState": "worker-local"
  }
}
```

## Rules

- The outer envelope is versioned and stable.
- `request`, `event`, and `result` all carry a shared `requestId` correlation field when the worker interaction is request-driven.
- Worker-local scratch state must be declared as non-canonical.
- Canonical state access must be explicit in metadata and must not be inferred from the operation name.
- New worker operations may extend payloads, but should not silently change the outer envelope contract.

## Current Adoption

- `src/witness-core-build-worker.js` emits `witness-worker/v1` `result` envelopes for `build`.
- `src/witness-worker-protocol.js` exports shared request/result/event helpers plus operation profiles so all worker classes can use the same stable outer contract even before each worker class is fully adopted.
- `src/runtime-worker-transport-contract.js` defines the sibling `witness-runtime-worker-transport/v1` method inventory for runtime control (`runtime.control.describe`, `runtime.process_health.read`, `runtime.supervision.activate`, `runtime.supervision.quiesce`, `runtime.app_snapshot.reload`).
- `src/runtime-worker-transport.js` centralizes those runtime-worker control semantics in one dispatcher, and the current HTTP routes in `src/runtime-server.js` plus `src/runtime-core-handlers.js` delegate through that dispatcher instead of owning separate route-local implementations.
- `src/runtime-worker-control-client.js` lets a runtime worker connect outward to a Rust-provided control socket and answer those same `witness-runtime-worker-transport/v1` calls without requiring inbound HTTP control requests.
- `substrate/witness-core/src/lib.rs` accepts the versioned envelope when parsing build-worker output.
- `docs/WITNESS-CORE-TRANSPORT.md` and `src/witness-core-transport-contract.js` now define the sibling request/subscribe contract used by runtime-side witness-core control calls, and the supervised IPC carrier now uses that named payload inventory instead of inheriting raw HTTP endpoint knowledge from the old fetch bridge.

## Not Yet Done

- `evaluate`, `render`, `inspect`, and `bounded_compute` now have explicit protocol profiles and helper support, but they are not yet implemented as shipped Rust-launched worker request/result paths.
- The broader worker runtime still uses a private HTTP listener as the concrete carrier for the runtime-worker control contract. The old standalone witness-core HTTP transport has been removed from product `src/`; only a test-side compatibility adapter remains for fixture coverage. The private runtime listener remains open replacement work even though the semantics are now versioned and shared.
