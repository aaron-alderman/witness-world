# Witness Core Transport Contract

## Purpose

This document defines the versioned transport contract used by Node runtime code to talk to `witness-core`, independent of the concrete transport.

Today there are two concrete adapters in the broader toolchain:

- supervised worker IPC in `src/witness-core-ipc-transport.js`
- test-only HTTP compatibility adapter in `test/support/witness-core-http-compat-transport.js`

The point of this contract is to let the concrete carrier change without rewriting every runtime consumer.

## Version

- `protocol: "witness-core-transport/v1"`

## Message Kinds

- `call`
- `result`
- `subscribe`
- `event`

## Method Inventory

- `generation.publish`
- `source.read`
- `source.stat`
- `source.list`
- `source.write`
- `source.patch`
- `verification.persistence.request`
- `network.http_outbound.execute`
- `db.sqlite.test_connection`
- `db.sqlite.migrate`
- `db.sqlite.query`
- `db.sqlite.command`
- `db.sqlite.transaction`
- `db.sql.test_connection`
- `db.sql.read_ordered_batch`
- `db.sql.write_rows`
- `transaction.published_authoring`
- `preview_session.create`
- `preview_session.read`
- `preview_session.write`
- `preview_session.delete`
- `generation.promote`
- `generation.rollback`
- `compute_module.shadow_invoke`
- `serving.read`
- `serving.request_live`
- `serving.request_stable`
- `soak.read`
- `soak.start`
- `soak.mark`
- `soak.sample`
- `soak.complete`
- `soak.fail`
- `status.read_generations`
- `status.read_health`
- `status.read_serving`

## Subscription Inventory

- `core.events`

## Shape

Call:

```json
{
  "protocol": "witness-core-transport/v1",
  "kind": "call",
  "method": "source.read",
  "requestId": "req-1",
  "args": {
    "query": {
      "path": "app/content.wtoml"
    }
  }
}
```

Subscribe:

```json
{
  "protocol": "witness-core-transport/v1",
  "kind": "subscribe",
  "channel": "core.events",
  "requestId": "sub-1",
  "args": {
    "scope": "status"
  }
}
```

Event:

```json
{
  "protocol": "witness-core-transport/v1",
  "kind": "event",
  "channel": "core.events",
  "requestId": "sub-1",
  "eventName": "generation.green_local",
  "payload": {
    "generationId": "gen-1"
  }
}
```

## Current Adoption

- `src/witness-core-bridge.js` targets this contract through an injected transport interface with `call(...)` and `subscribe(...)`, and no longer constructs or owns an HTTP control-plane transport.
- `src/witness-core-ipc-transport.js` implements that contract over the Rust-injected supervised worker pipe, including `core.events` subscription forwarding.
- `test/support/witness-core-http-compat-transport.js` exists only as a test-only compatibility adapter so bridge/status-store serialization can still be exercised against HTTP-shaped fixtures without restoring runtime `fetch(...)` ownership to `src/`.
- `test/witness-core-transport-contract.test.js` freezes the version, method inventory, subscription inventory, and envelope parsing rules.

## Not Yet Done

- The supervised IPC carrier is the authoritative checked-in runtime path, but the worker runtime still has a separate private HTTP listener that has not yet been retired.
- Non-SQLite `db.sql` live proof still needs stronger real-target evidence.
- Final zero-direct-ownership guardrails still need to tighten after the remaining runtime listener work is gone.
