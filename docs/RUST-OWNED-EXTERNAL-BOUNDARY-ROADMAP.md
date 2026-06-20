# Rust-Owned External Boundary Roadmap

## Purpose

This document is the standalone execution-boundary contract for the platform.

Its job is to keep new work aligned on one target:

- Rust owns the external world.
- Node owns app compute only.
- Node reaches the outside world only through Rust.

This is not a speculative architecture note.
It is a migration roadmap, a contributor guardrail, and a handoff document for new agents.

If you are new to this area, read [docs/RUST-OWNED-BOUNDARY-PROJECT-ROADMAP.md](./RUST-OWNED-BOUNDARY-PROJECT-ROADMAP.md) first.
Then read [docs/RUST-OWNED-BOUNDARY-DELIVERY-GUIDE.md](./RUST-OWNED-BOUNDARY-DELIVERY-GUIDE.md).
Return here after that for the live checklist state.
Use [docs/RUST-OWNED-EXECUTION-HANDBOOK.md](./RUST-OWNED-EXECUTION-HANDBOOK.md) as the supporting handbook, not the primary entry point.

Primary related documents:

- [docs/RUST-OWNED-BOUNDARY-PROJECT-ROADMAP.md](./RUST-OWNED-BOUNDARY-PROJECT-ROADMAP.md)
- [docs/RUST-OWNED-BOUNDARY-DELIVERY-GUIDE.md](./RUST-OWNED-BOUNDARY-DELIVERY-GUIDE.md)
- [docs/RUST-OWNED-EXECUTION-HANDBOOK.md](./RUST-OWNED-EXECUTION-HANDBOOK.md)
- [docs/LIVE-CORE-GOAL-CONTRACT.md](./LIVE-CORE-GOAL-CONTRACT.md)
- [substrate/README.md](../substrate/README.md)
- [docs/CONTINUOUS-VERIFICATION-ROADMAP.md](./CONTINUOUS-VERIFICATION-ROADMAP.md)
- [docs/BACKEND-SEAMS.md](./BACKEND-SEAMS.md)
- [docs/LLM-AUTHORING-POLICY.md](./LLM-AUTHORING-POLICY.md)

## Executive Summary

The end state is simple to describe:

- Rust binds host ports.
- Rust opens SQLite.
- Rust owns filesystem reads, writes, watches, and path policy.
- Rust supervises Node workers.
- Rust owns outbound network policy.
- Node does not talk directly to the filesystem, database, or host sockets.
- Node does not become the continuity substrate.

Node remains useful, but only as a worker:

- DSL parsing
- compilation
- evaluation
- rendering
- runtime compute
- other bounded tasks that can fail without taking down the platform substrate

The goal is not "rewrite everything in Rust."
The goal is "remove Node tendrils into the external world."

## Why This Exists

The platform is trying to support:

- 24/7 operation
- live edits
- preview and published flows
- supervised continuity
- multiple agents working in parallel

That combination is fragile if the process with the richest dynamic mutation model also:

- owns ports
- owns file watchers
- owns direct disk mutation
- owns database handles
- owns network side effects

The danger is not JavaScript as a language.
The danger is one long-running Node process becoming the uncontrolled owner of too many external boundaries.

## Non-Negotiable End-State Invariants

- Rust is the only public host listener.
- Rust is the only owner of canonical SQLite connections.
- Rust is the only owner of canonical filesystem mutation and watch policy.
- Rust is the only owner of platform-facing process supervision.
- Rust is the only owner of external capability policy.
- Node can be killed, replaced, restarted, or upgraded without losing control of continuity.
- Node may compute over state, but it may not directly own the state boundary.
- Every external effect is attributable through a Rust-controlled capability surface.

## Explicit Non-Goals

- Do not rewrite app semantics into Rust in one jump.
- Do not move all parsing, rendering, or evaluation into Rust first.
- Do not build a second fake runtime beside the existing platform.
- Do not leave "temporary direct FS access" in place without a removal tranche.
- Do not replace Node direct access with many ad hoc Rust exceptions.
- Do not let preview, published, and debug paths drift into separate effect models.
- Do not introduce a general plugin host API before the core boundary is coherent.

## Current State

Today the boundary is mixed:

- Rust already owns:
  - generation continuity
  - proof execution control
  - process supervision
  - optional public frontdoor
  - some source capability endpoints
  - a verification-persistence control-plane seam when `WITNESS_CORE_URL` is configured
  - a SQLite DB capability seam for SQL provider runtimes when `WITNESS_CORE_URL` is configured
  - published authoring transaction staging and activation
- Node still directly owns:
  - the main runtime HTTP server in [src/runtime-server.js](../src/runtime-server.js)
  - broad filesystem access in [src/app-snapshot-manager.js](../src/app-snapshot-manager.js)
  - local no-core dirty-path detection in [src/runtime-server.js](../src/runtime-server.js), now through explicit runtime-host polling rather than canonical `fsWatch.watch(...)`
  - local JSON compatibility verification persistence in [src/runtime-verification-persistence.js](../src/runtime-verification-persistence.js) when `witness-core` is not configured
  - local fallback SQLite ownership in [plugins/sqlite/provider-runtime.js](../plugins/sqlite/provider-runtime.js) and [plugins/sql/provider-runtime.js](../plugins/sql/provider-runtime.js) when `witness-core` is not configured
  - runtime-level SQLite fallback remains transitional, but the affected datasource inspection paths now report whether SQLite is Rust-owned (`witness-core`) or Node-local fallback
  - direct runtime boot and app hosting in [src/cli.js](../src/cli.js)

This is a transitional state, not the target.

## Execution Checklist

Use this section as the live migration tracker.
Every tranche should update these checkboxes based on current evidence, not intent.

### Core Guardrails

- [x] This document exists as the boundary contract and handoff guide.
- [x] The non-negotiable end-state invariants are written down.
- [x] Known transitional Node owners are explicitly named in this document.
- [x] The codebase has a source-level guardrail test that freezes the current exception set for:
  - `node:sqlite`
  - public `node:http` server binding
  - canonical `fsWatch.watch(...)`
- [x] The guardrail also freezes the remaining plugin/runtime `node:sqlite` fallback exception set to the current SQL provider-runtime files.
- [x] Add a second guardrail layer that distinguishes canonical-serving/runtime paths from desktop/operator-only paths for broader `node:fs` usage.

Authoritative evidence today:

- `src/runtime-server.js` still imports `node:http` and binds the runtime listener.
- `src/app-snapshot-manager.js` still imports `node:fs` and owns canonical watchers.
- `src/runtime-verification-persistence.js` no longer imports `node:sqlite` or `DatabaseSync`.
- `plugins/sql/provider-runtime.js` and `plugins/sqlite/provider-runtime.js` are the only remaining production `node:sqlite` fallback owners, and the guardrail now freezes that set.
- `test/rust-owned-external-boundary-roadmap.test.js` now separately freezes `src/` `node:fs` owners into canonical runtime/serving, desktop/operator, and explicit utility buckets.
- `test/rust-owned-external-boundary-roadmap.test.js` now fails if those ownership points spread to new source files.

### Stage 1. Rust Public Ingress

- [x] `witness-core` already supports an optional Rust front door.
- [ ] Rust front door is the default and only supported public ingress.
- [ ] Node worker ports are private implementation details in every supported run mode.
- [ ] Tests and scripts no longer target worker ports directly as the supported product path.

### Stage 2. Rust-Owned Published Filesystem Path

- [x] `witness-core` exposes `POST /transactions/published-authoring`.
- [x] Supervised `POST /api/runtime/app-sources` proxies to the Rust transaction path.
- [x] Serving runtimes expose `POST /api/runtime/app-snapshot/reload` for Rust-triggered activation.
- [x] Supervised runtimes can run with watchers disabled.
- [x] Remove remaining non-supervised/local published-write fallback from canonical serving paths where Rust ownership is required.
- [x] Make the published path fail closed everywhere the boundary is declared authoritative, not only on the supervised path.
- [x] Prove watcher suppression/update logic prevents duplicate generation pipelines for every published commit path.

Authoritative evidence today:

- `src/runtime-server.js` now sets `requireGenerationBridgeForPublishedWrites: Boolean(appContext.witnessCoreUrl)` whenever a runtime is connected to `witness-core`, not only in supervised mode.
- `src/app-snapshot-manager.js` now fails closed for published `stat` and `write` operations whenever `requireGenerationBridgeForPublishedWrites` is enabled, instead of silently falling back to local filesystem mutation.
- `src/runtime-core-handlers.js` keeps the supervised published-authoring proxy for watcher-disabled runtimes, while the non-supervised `app.source.write` route still traverses the same fail-closed `AppSnapshotManager` path when Rust ownership is declared.
- `test/runtime-core-handlers-authoring.test.js` now proves `POST /api/runtime/app-sources` semantics fail closed outside supervised mode when `WITNESS_CORE_URL` ownership is declared but unavailable.
- `test/support/live-core-smoke-runner.mjs` and `test/witness-core-live-continuity.test.js` already prove the supervised published-authoring path journals through Rust, rejects stale hashes, preserves canonical files on compile/proof failure, and returns `WITNESS_CORE_UNAVAILABLE` when the core is down.
- `substrate/witness-core/src/lib.rs` refreshes the watcher baseline immediately after `transaction.commit.applied` and before the generation is marked `green_local`.
- `test/support/live-core-smoke-runner.mjs` now waits past the watcher poll interval after a successful published transaction and proves the registry still contains exactly one generation with one `generation.candidate` -> `proof.started` -> `generation.green_local` lifecycle, rather than a duplicate watcher-driven pipeline.

### Stage 3. Rust-Owned Preview Filesystem Path

- [x] Preview sessions use Rust FS capability reads when `WITNESS_CORE_URL` is present.
- [x] Preview sessions use Rust FS capability patch writes when `WITNESS_CORE_URL` is present.
- [x] When preview Rust ownership is required, preview rebuilds use bridge-backed source `read`/`stat` instead of local canonical file reads.
- [x] When preview Rust ownership is required, overlay patch failures fail closed instead of silently falling back to in-memory-only mutation.
- [x] Runtime boot now enables strict preview Rust ownership automatically when `WITNESS_CORE_URL` is configured.
- [x] Make preview-session continuity fail closed when the configured boundary owner is unavailable.
- [x] Remove preview fallback to local canonical file reads for shared-lib-backed apps.
- [x] Extend witness-core source addressing/config so shared-library imports such as `examples/_lib` can run under strict preview Rust ownership.

### Stage 4. Rust-Owned Canonical Watchers

- [x] Supervised runtimes can disable canonical watchers.
- [x] When watchers are disabled, `AppSnapshotManager` switches to explicit dirty-path input mode and `ensureFresh(...)` no longer probes filesystem state opportunistically.
- [x] Core-connected runtimes derive canonical dirty paths from `witness-core` generation metadata instead of local `fs.watch(...)` or request-time `detectChangedPaths()`.
- [x] Remove canonical watcher ownership from `src/app-snapshot-manager.js`.
- [x] Remove local dirty-path probing from `AppSnapshotManager`; no-core dev invalidation now arrives through explicit runtime-host `markDirtyPaths(...)` input.
- [x] Core-connected runtimes consume `witness-core` `/events` SSE and translate non-preview generation events into immediate `markDirtyPaths(...)` invalidation.
- [ ] Make Rust the only owner of canonical dirty-path detection.
- [x] Ensure workers receive explicit invalidation/input updates instead of discovering canonical file changes themselves.

Authoritative evidence today:

- `src/runtime-server.js` now defaults `runtimeSupervision.watchersEnabled` to `false` when `WITNESS_CORE_URL` is configured, so core-connected runtimes do not advertise local watcher ownership as their active canonical path.
- `src/runtime-server.js` now owns both remaining explicit invalidation paths: local no-core dev refresh through a runtime-host poller that detects changed source rows and calls `appSnapshotManager.markDirtyPaths(..., { trigger: "watch" })`, and core-connected refresh through `witness-core` `/events` SSE subscription that translates non-preview `green_local`/`stable` generation events into `markDirtyPaths(..., { trigger: "core" })`.
- `src/runtime-server.js` still calls `appSnapshotManager.ensureFresh({ trigger: "request" })` in dev mode as a fallback hydration path, but the active snapshot manager no longer self-discovers dirty files there.
- `src/runtime-server.js` now owns the local no-core dev refresh loop through a runtime-level poller that detects changed source rows and calls `appSnapshotManager.markDirtyPaths(..., { trigger: "watch" })`, so local dev hot refresh remains available without reintroducing self-discovery into the snapshot manager.
- `src/app-snapshot-manager.js` now supports `dirtyDetectionOwner: "witness-core"`, refreshes `witnessCoreStatusStore` on demand, ignores preview generations for canonical refresh, maps Rust generation `sourcePaths` back onto active source rows, and rebuilds from explicit dirty paths instead of local `detectChangedPaths()` when `witness-core` is the dirty owner.
- `src/app-snapshot-manager.js` no longer contains canonical watcher startup, `fsWatch.watch(...)` ownership, or local dirty-path probing; it now exposes only explicit dirty-path rebuild semantics plus the remaining witness-core status sync for core-connected mode.
- `test/app-snapshot-manager.test.js` now proves `ensureFresh(...)` can rebuild from `witness-core` generation metadata without local filesystem probing and ignores preview-only generations for canonical refresh.
- `test/app-snapshot-runtime.test.js` now proves the remaining local dev refresh behavior through the deterministic `test/fixtures/live-core-app` fixture, with a `trigger: "watch"` revision event and SSE update emitted after a source edit.
- `test/witness-core-bridge.test.js` now proves the status store consumes `witness-core` SSE events and notifies subscribers with generation payloads.
- `test/support/live-core-smoke-runner.mjs` published-authoring scenario now waits for a `trigger: "core"` app revision event after the Rust-owned transaction, proving the supervised runtime invalidates from the core event path rather than needing a route fetch to discover the change.
- `test/rust-owned-external-boundary-roadmap.test.js` now freezes the canonical watcher owner set at `[]`, so any reintroduction of `fsWatch.watch(...)` in `src/` fails the guardrail immediately.
- `test/witness-core-live-continuity.test.js` still passes for the fixture continuity path after this change, which proves a core-connected runtime continues to pick up valid Rust-proven edits while keeping continuity semantics intact.

### Stage 5. Rust-Owned SQLite

- [x] When `WITNESS_CORE_URL` is configured, verification persistence can be mediated through `witness-core` without loading `node:sqlite` in Node.
- [x] `witness-core` exposes a verification-persistence control-plane endpoint and journals verification-persistence operations.
- [x] Replace `src/runtime-verification-persistence.js` direct `node:sqlite` ownership with a Rust-owned service or capability surface.
- [x] Remove canonical `DatabaseSync` ownership from Node runtime code.
- [x] Preserve durable local verification persistence without `node:sqlite` by using the JSON compatibility adapter when `witness-core` is absent.
- [x] Preserve witness-core-mediated verification persistence rows and artifact content across persistence reopen/restart boundaries.
- [x] SQL provider runtimes can use `witness-core` SQLite capability endpoints for `testConnection`, `migrate`, `query`, `command`, and `transaction` when `WITNESS_CORE_URL` is configured.
- [x] `witness-core` exposes and journals SQLite capability operations used by SQL provider runtimes.
- [x] When SQL provider runtimes are in Rust-owned SQLite mode, witness-core unavailability fails closed with structured runtime errors instead of falling back to local SQLite or throwing uncaught bridge errors.
- [x] Remaining transitional SQLite runtime owners expose explicit boundary ownership metadata in runtime and host inspection (`witness-core` vs local fallback) so the exception set is visible during operation.
- [ ] Remove local verification-persistence fallback ownership once Rust-managed mode becomes authoritative for canonical verification persistence.
- [ ] Remove local provider-runtime SQLite ownership once Rust-managed mode becomes authoritative for SQL runtime execution.
- [x] Journal canonical DB effects through Rust-controlled provenance.
- [x] Preserve existing verification persistence behavior and continuity across worker restarts.
- [ ] Inventory and migrate remaining plugin/provider SQLite runtimes behind the same Rust-owned DB boundary or explicitly scope them as non-canonical scratch runtimes.

Authoritative evidence today:

- `src/runtime-verification-persistence.js` now routes witness-core-backed verification persistence operations through the Rust control-plane endpoint instead of loading `node:sqlite`, while preserving the JSON compatibility adapter only for the explicit no-core fallback mode.
- `plugins/platform/verification-persistence.test.js` now proves three distinct shapes: local JSON compatibility durability, synthesized backend metadata on the compatibility path, and witness-core-mediated verification persistence without loading `node:sqlite`.
- `plugins/platform/verification-persistence.test.js` now also proves that witness-core-backed verification persistence survives both a Node-side persistence reopen and a real `witness-core` restart while preserving policies, test runs, reports, reusable cache lookups, and artifact content without loading `node:sqlite`.
- `plugins/sql/provider-runtime.js` and `plugins/sqlite/provider-runtime.js` now decorate sqlite datasources with explicit boundary metadata (`boundaryOwner`, `boundaryAuthority`, `boundaryTransport`, `boundaryFallbackAllowed`, `boundaryAvailability`) and route `testConnection`, `migrate`, `query`, `command`, and `transaction` through witness-core SQLite capabilities when `WITNESS_CORE_URL` is configured.
- `plugins/sql/sql.test.js` and `plugins/sqlite/sqlite.test.js` now prove that witness-core-backed SQLite operations succeed without loading `node:sqlite`, and that witness-core unavailability fails closed with structured runtime errors instead of silently falling back local.
- `test/db-sql-host.test.js` and `test/runtime-provider-runtimes.test.js` now surface the transitional local-fallback ownership metadata explicitly on sqlite datasources, so the remaining Node-owned fallback path is visible during operation instead of hidden.
- `substrate/witness-core/src/lib.rs` now exposes `POST /capabilities/db/sqlite` and `POST /verification-persistence`, emits journal events for both surfaces, and keeps SQLite command/query/transaction semantics inside the Rust-owned capability path.
- `cargo test --manifest-path substrate/Cargo.toml -p witness-core emits_journal_event`, `cargo test --manifest-path substrate/Cargo.toml -p witness-core verification_persistence_http_emits_journal_event_and_persists_rows`, and `cargo test --manifest-path substrate/Cargo.toml -p witness-core sqlite_capability_supports_command_query_and_transaction_rollback` now prove the Rust core journals SQLite and verification-persistence operations while preserving SQLite transaction rollback behavior.

### Stage 6. Rust-Owned Outbound Network

- [x] Inventory all direct outbound network paths in Node runtime code.
- [x] Classify those paths into typed Rust-mediated capabilities.
- [x] Move the `http.outbound` seam under Rust-mediated execution for authoritative HTTP and HTTPS targets.
- [x] Move the `auth.oauth` identity-exchange seam under Rust-mediated execution for authoritative configured HTTP and HTTPS endpoints.
- [x] Move the `notify.email` delivery seam under Rust-mediated execution for authoritative configured HTTP and HTTPS endpoints.
- [x] Move canonical remote side effects under Rust execution and policy.
- [x] Make denied outbound effects fail visibly instead of silently bypassing the boundary.
- [x] Extend Rust-owned outbound execution from the `http.outbound` seam to HTTPS/TLS targets for the current canonical remote-effect families (`oauth`, `notify.email`, and `http.outbound`).

Authoritative evidence today:

- [src/runtime-network-capability-inventory.js](../src/runtime-network-capability-inventory.js) now codifies the remaining outbound owner set into typed capability families rather than leaving them as an unstructured file list.
- `test/rust-owned-external-boundary-roadmap.test.js` now freezes both the raw outbound owner sets and the typed capability-family classification, so new direct Node network ownership cannot spread silently and existing owners cannot drift between buckets unnoticed.
- [src/witness-core-bridge.js](../src/witness-core-bridge.js) now exposes `executeHttpOutbound(...)`, which serializes outbound HTTP requests onto the Rust control plane at `POST /capabilities/network/http-outbound`.
- [plugins/http-outbound/glue.js](../plugins/http-outbound/glue.js) now keeps `stub://` local, but routes real non-stub `http.outbound` delivery through `witness-core` whenever core authority is configured; if that Rust-owned path is unavailable, the request now fails visibly instead of silently falling back to direct Node `fetch(...)`.
- [plugins/oauth/oauth-providers.js](../plugins/oauth/oauth-providers.js) now routes OIDC token and userinfo exchange through `witness-core` whenever core authority is configured for both `http://` and `https://` provider endpoints; if that Rust-owned path fails, the provider now propagates the structured error instead of silently falling back to direct Node `fetch(...)`.
- [plugins/oauth/handlers.js](../plugins/oauth/handlers.js) now passes the active `witness-core` bridge and request correlation into the provider resolution flow so real `auth.oauth.callback` execution can traverse the Rust-owned network seam.
- [plugins/notifications/email-transports.js](../plugins/notifications/email-transports.js) now routes generic HTTP email delivery and SendGrid delivery through `witness-core` whenever core authority is configured for both `http://` and `https://` provider endpoints; if that Rust-owned path fails, delivery now propagates the structured error instead of silently falling back to direct Node `fetch(...)`.
- [plugins/notifications/job-handlers.js](../plugins/notifications/job-handlers.js) and [src/runtime-app-context.js](../src/runtime-app-context.js) now pass the active `witness-core` bridge down into the notification job transport path, so the real `notify.email.deliver` worker flow can traverse the Rust-owned network seam.
- [substrate/witness-core/src/lib.rs](../substrate/witness-core/src/lib.rs) now exposes `POST /capabilities/network/http-outbound`, performs outbound plain HTTP directly in Rust, performs HTTPS/TLS requests through a Rust-owned `curl` subprocess path, returns the response payload, and journals `capability.network.http.outbound.execute` events with request provenance.
- `plugins/http-outbound/http-outbound.test.js`, `test/witness-core-bridge.test.js`, and `cargo test --manifest-path substrate/Cargo.toml -p witness-core http_outbound_capability_` now prove the routed consumer, fail-closed behavior, request serialization, Rust execution, HTTPS/TLS support, and journal emission for the canonical `http.outbound` seam.
- `plugins/oauth/oauth.test.js` now proves that a real OIDC provider consumes the Rust-owned outbound seam for both plain-HTTP and HTTPS token and userinfo exchange, and that bridge failure remains fail-closed instead of silently bypassing the boundary.
- `test/runtime-builtin-job-handlers.test.js` now proves that real `notify.email` HTTP delivery and SendGrid delivery consume the Rust-owned outbound seam for both plain-HTTP and HTTPS configured endpoints, and that authoritative bridge failure remains fail-closed.
- Together with the `http.outbound` bridge path, the current canonical remote-effect families now route both `http://` and `https://` targets through Rust instead of dropping back to direct Node network execution.
- The current classified families are:
  - `capability.network.loopback.mcp_stdio_bridge` for [src/cli.js](../src/cli.js), where stdio MCP traffic is bridged into the local runtime HTTP endpoint.
  - `capability.network.control_plane.witness_core` for [src/witness-core-bridge.js](../src/witness-core-bridge.js) and [src/runtime-verification-persistence.js](../src/runtime-verification-persistence.js), which are the intentional Rust-owned control-plane channels.
  - `capability.network.server.fetch_injection` for [src/runtime-app-context.js](../src/runtime-app-context.js) and [src/runtime-route-handlers.js](../src/runtime-route-handlers.js), which are the remaining dependency-injection points handing a fetch implementation into server-side runtime factories and handlers.
  - `capability.network.oauth.identity_exchange` for [plugins/oauth/oauth-providers.js](../plugins/oauth/oauth-providers.js), which now uses Rust-owned execution for authoritative configured HTTP and HTTPS OIDC endpoints.
  - `capability.notify.email.http_delivery` and `capability.notify.email.sendgrid_delivery` for [plugins/notifications/email-transports.js](../plugins/notifications/email-transports.js), which now use Rust-owned execution for authoritative configured HTTP and HTTPS delivery endpoints.
  - `capability.network.http.outbound_delivery` for [plugins/http-outbound/glue.js](../plugins/http-outbound/glue.js), which now uses Rust-owned execution for authoritative HTTP and HTTPS delivery while still retaining explicit non-authoritative Node fallback only when `witness-core` ownership is not configured.
- Browser/client fetch paths remain classified separately as `capability.browser.runtime_fetch` in [src/runtime-network-capability-inventory.js](../src/runtime-network-capability-inventory.js); they are intentionally kept out of the server/runtime outbound-boundary claim.

### Stage 7. Worker Runtime Contract

- [ ] Define a stable worker protocol for build, evaluate, render, inspect, and bounded compute.
- [ ] Stop treating ad hoc HTTP/control coupling as the long-term worker contract.
- [ ] Distinguish canonical state access from scratch-worker state in the protocol itself.
- [ ] Prove that a worker can be killed and replaced without losing platform continuity or external boundary ownership.

### Final Target Audit

- [x] Node runtime code no longer imports canonical `node:sqlite`.
- [ ] Node runtime code no longer binds the public host listener.
- [x] Node runtime code no longer owns canonical file watchers.
- [ ] Node runtime code no longer mutates canonical files except through Rust-owned capabilities.
- [ ] Node runtime code no longer performs canonical outbound network side effects directly.
- [ ] Node operates as supervised compute only, with Rust as the sole owner of external boundaries.

## Architectural Target

### Rust Responsibilities

- host port binding
- internal control plane
- public frontdoor and request routing
- process supervision
- filesystem capability enforcement
- SQLite connection ownership
- watch policy and change detection
- external network policy
- append-only event journal
- promotion, rollback, continuity, and last-good control

### Node Responsibilities

- parse authored sources
- compile or lower authored sources
- evaluate runtime logic
- prepare render outputs
- execute bounded compute tasks requested by Rust

### Communication Model

Node communicates with Rust through one owned channel:

- stdio
- named pipe
- Unix domain socket on non-Windows later if useful

The exact transport can change.
The invariant is that Node does not bypass Rust for external effects.

## What "No Tendrils" Means

The phrase "no other tendrils into the external world" has to be concrete.

It means Node should not:

- call `node:fs` against canonical workspace state
- open `DatabaseSync` or other canonical DB handles
- bind `http`, `https`, `net`, or WebSocket listeners for public serving
- own filesystem watchers against canonical source roots
- perform direct outbound `fetch` for platform effects
- mutate published or preview state except through a Rust-mediated request

It does not forbid:

- in-memory data structures
- pure compute
- temporary scratch files inside a Rust-controlled worker sandbox if explicitly allowed
- IPC back to Rust

## Migration Principles

### 1. Boundary first, semantics second

Do not wait for a Rust rewrite of semantics before moving ownership of:

- ports
- SQLite
- filesystem

The boundary can move before the logic moves.

### 2. Replace ambient access with typed capability calls

Do not replace direct access with another hidden helper.
Every new seam should be:

- typed
- explicit
- policy-checkable
- attributable
- testable

### 3. One external authority

If a resource is external, Rust should be the authority.
Node may request.
Node should not own.

### 4. Preserve last-good behavior throughout migration

Do not land a boundary move that weakens:

- rollback
- serve-stable behavior
- process recovery
- preview isolation

### 5. Prefer vertical slices

A slice should move one real user path fully across the boundary.
Do not build wide abstractions with no routed consumer.

## Workstreams

### Workstream A. Port Ownership

Target:

- Rust is the only public listener.
- Node workers never expose public host ports directly.

Required outcomes:

- frontdoor mode becomes the default serving mode
- Node runtime ports become private worker details
- public request ingress, drain, and cutover remain Rust-owned

Do not:

- keep dual public serving paths indefinitely
- let new features bind directly in Node "just for now"

Acceptance:

- all app HTTP traffic enters through Rust
- worker restart does not change the public port
- rolling cutover remains available

### Workstream B. Filesystem Ownership

Target:

- Node cannot directly read or write canonical workspace files.

Required outcomes:

- Rust-owned `read`, `write`, `stat`, `list`, `watch`, and staged workspace capabilities
- Node loaders and snapshot builders consume Rust-provided source content
- watchers move fully into Rust

Do not:

- leave `node:fs/promises` in app-serving code paths for canonical sources
- keep fallback local writes in production-facing paths
- use path strings as hidden permission bypasses

Acceptance:

- published flow already uses Rust transaction commit
- preview flow also uses Rust-owned source access
- runtime rebuild paths no longer depend on direct Node file reads
- canonical change detection is Rust-only

### Workstream C. SQLite Ownership

Target:

- Rust owns all canonical SQLite connections.

Required outcomes:

- replace Node `DatabaseSync` use with Rust capability endpoints or a Rust-backed service
- migrate verification persistence first because it is already a narrow seam
- keep schema ownership explicit and journaled

Do not:

- embed raw SQL strings across many Node modules and call that "temporary"
- create a second SQLite truth in Rust while Node still writes the first one

Acceptance:

- Node no longer imports `node:sqlite` for canonical platform data
- Rust can restart workers without losing DB continuity
- DB effects are visible in Rust events and policy

### Workstream D. Network Ownership

Target:

- outbound network side effects are Rust-mediated.

Required outcomes:

- OAuth, webhook, notification, remote fetch, and future sync paths become capability-mediated
- Node emits a typed request instead of calling the network directly

Do not:

- allow "small direct fetches" to proliferate
- mix policy in route handlers and worker code

Acceptance:

- host egress policy is inspectable and enforceable in Rust
- denied network operations fail visibly and predictably

### Workstream E. Worker Runtime Contract

Target:

- Node runs as a worker engine, not a platform host.

Required outcomes:

- define a stable worker protocol for:
  - build
  - evaluate
  - render
  - inspect
  - compute module compile
- workers can be restarted without losing platform continuity
- worker scratch state is non-canonical

Do not:

- let the worker protocol become an untyped JSON soup
- let worker-local caches quietly become authoritative

Acceptance:

- Rust can launch, replace, and stop workers deterministically
- worker failure becomes a contained event, not a platform failure

## Ordered Execution Plan

### Stage 0. Freeze the Boundary Contract

Objective:

- stop boundary drift while migration proceeds

Tasks:

- document all remaining direct Node ownership points
- reject new direct Node ownership of ports, DB, or canonical FS
- label all transitional seams as transitional

Done when:

- new contributors can identify allowed versus forbidden patterns quickly

### Stage 1. Make Rust Public Ingress Mandatory

Objective:

- all public HTTP enters through Rust

Tasks:

- promote frontdoor model from optional to standard
- treat worker runtime ports as internal only
- audit tests and scripts that still target worker ports directly

Done when:

- all supported app run modes use Rust as the host-facing ingress

### Stage 2. Finish Rust-Owned Published Filesystem Path

Objective:

- published authoring has no direct Node disk mutation

Tasks:

- remove any remaining local fallback on supervised published writes
- keep build, proof, commit, and reload fully Rust-owned
- ensure core-down behavior fails closed

Done when:

- published source changes cannot persist unless Rust approves them

### Stage 3. Move Preview Filesystem Path Under Rust

Objective:

- preview sessions stop using Node-owned canonical source reads and writes

Tasks:

- route preview source reads and overlays fully through Rust FS capabilities
- keep last-good preview behavior
- preserve preview-session journaling and generation linkage

Done when:

- preview and published flows both rely on the same boundary owner

### Stage 4. Move Canonical Watchers Into Rust Only

Objective:

- Node no longer watches canonical source trees

Tasks:

- remove Node file watching from app-serving code
- make Rust publish changed inputs explicitly to workers
- keep rebuild invalidation accurate

Done when:

- all canonical source watching and dirty-path detection is Rust-owned

### Stage 5. Move SQLite Under Rust

Objective:

- Node loses direct DB handles

Tasks:

- migrate verification persistence first
- add typed Rust data APIs for required reads and writes
- preserve existing data model and tests where possible

Done when:

- Node imports no canonical SQLite API

### Stage 6. Move Outbound Network Under Rust

Objective:

- Node has no direct network side-effect path

Tasks:

- inventory all fetch and remote integration paths
- classify them into typed capabilities
- make Rust the only egress executor

Done when:

- outbound effects are capability-mediated and inspectable

### Stage 7. Harden the Worker Protocol

Objective:

- Node becomes a replaceable engine

Tasks:

- formalize IPC request and response shapes
- split canonical versus scratch paths clearly
- add worker crash containment and protocol conformance tests

Done when:

- worker replacement is operationally boring

## Rules For New Agents

Before changing anything:

- read this document
- read [docs/LIVE-CORE-GOAL-CONTRACT.md](./LIVE-CORE-GOAL-CONTRACT.md)
- inspect current direct Node ownership points
- state which workstream and stage the change advances

When proposing a change:

- prefer one real boundary move over a broad abstraction
- include failure mode, rollback story, and acceptance path
- name the exact direct access being removed

When reviewing a change:

- ask whether Node still has a side path to the same resource
- ask whether the change improves containment or merely adds one more layer
- reject anything that adds new direct Node ownership of external resources

## What Not To Do

- Do not add new `node:sqlite` canonical usage.
- Do not add new public `http.createServer` or `server.listen(...)` platform surfaces in Node.
- Do not add new canonical `fs.readFile`, `fs.writeFile`, or `fs.watch` use in serving paths unless the tranche is explicitly about removing them and the use is temporary scaffolding inside the migration.
- Do not create "helper" wrappers that still directly call the external resource from Node.
- Do not keep permanent fallback-to-local behavior in supervised or Rust-owned modes.
- Do not make preview a special exception to the boundary rules.
- Do not let test harness shortcuts become the production model.
- Do not widen the worker API before one user path depends on it.

## What Good Work Looks Like

Good slices:

- move one real route or subsystem from direct Node filesystem access to Rust capability access
- remove one direct SQLite owner from Node and replace it with a typed Rust service
- move one network side effect from direct worker code to Rust capability handling
- convert one public serving mode from Node-bound to Rust-fronted only

Bad slices:

- add a new abstraction but leave the old direct path in place everywhere
- move state into Rust but still let Node mutate it directly
- add a fallback that silently bypasses Rust on failure
- hide a boundary dependency inside "utility" code

## Acceptance Standard

A tranche is only done when:

- the direct Node ownership path is actually removed or fenced off
- a real consumer uses the new Rust-owned seam
- tests prove fail-closed behavior where required
- continuity and last-good behavior remain intact
- the migration leaves fewer tendrils, not merely different tendrils

## Suggested Next Tranches

If starting fresh from today, the recommended order is:

1. finish Rust-owned published path with no local supervised fallback
2. move preview source access fully through Rust
3. remove canonical Node watchers
4. move verification SQLite under Rust
5. move outbound network effects under Rust
6. formalize the Node worker IPC contract
7. make Rust ingress the only supported public serving mode

## One-Sentence Test

If a Node worker can still independently touch the outside world in a way that changes canonical platform behavior, the target has not been reached.
