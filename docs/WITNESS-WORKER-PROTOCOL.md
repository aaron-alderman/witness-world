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
- `substrate/witness-core/src/lib.rs` accepts the versioned envelope when parsing build-worker output.

## Not Yet Done

- `evaluate`, `render`, `inspect`, and `bounded_compute` now have explicit protocol profiles and helper support, but they are not yet implemented as shipped Rust-launched worker request/result paths.
- The broader worker runtime still uses HTTP/control-plane coupling outside this build-worker stdout contract.
