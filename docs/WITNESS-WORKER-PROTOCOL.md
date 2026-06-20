# Witness Worker Protocol

## Purpose

This document defines the first stable worker protocol envelope used between `witness-core` and Node workers.

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

## Rules

- The outer envelope is versioned and stable.
- Worker-local scratch state must be declared as non-canonical.
- Canonical state access must be explicit in metadata and must not be inferred from the operation name.
- New worker operations may extend payloads, but should not silently change the outer envelope contract.

## Current Adoption

- `src/witness-core-build-worker.js` emits `witness-worker/v1` `result` envelopes for `build`.
- `substrate/witness-core/src/lib.rs` accepts the versioned envelope when parsing build-worker output.

## Not Yet Done

- `evaluate`, `render`, `inspect`, and `bounded_compute` are defined as protocol operations, but they are not yet implemented as shipped worker request/result paths.
- The broader worker runtime still uses HTTP/control-plane coupling outside this build-worker stdout contract.
