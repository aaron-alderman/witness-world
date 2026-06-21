# Rust-Owned External Boundary Historical Archive

This file is the preserved long-form snapshot of the earlier roadmap shape.

Use it for:

- historical tranche wording
- older evidence bundles
- rationale that is no longer needed in the short live roadmap

For the current reading path, use:

- [docs/RUST-OWNED-EXTERNAL-BOUNDARY-ROADMAP.md](./RUST-OWNED-EXTERNAL-BOUNDARY-ROADMAP.md)
- [docs/RUST-OWNED-EXTERNAL-BOUNDARY-REMAINING.md](./RUST-OWNED-EXTERNAL-BOUNDARY-REMAINING.md)

Archive rule:

- do not use this file as the live execution contract
- do not restore wording from here into the live roadmap without also restoring the current safeguards
- do not treat older narrative detail as permission to weaken the live fail-closed or proof standards

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

This also does not mean "remove every `node:fs` import from the whole repository."
It means removing direct `node:fs` ownership from authoritative long-running runtime paths.
Tests, fixtures, short-lived utilities, and explicitly scoped non-canonical scratch paths may still use local filesystem access until their own removal or containment tranche lands.

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
  - direct runtime `pg` / `mysql2` ownership
  - public `node:http` server binding
  - canonical `fsWatch.watch(...)`
- [x] The guardrail also freezes the non-SQLite runtime DB direct-owner set at `[]`, so `pg` / `mysql2` cannot silently re-enter product runtime code.
- [x] Add a second guardrail layer that distinguishes canonical-serving/runtime paths from desktop/operator-only paths for broader `node:fs` usage.

Authoritative evidence today:

- `src/runtime-server.js` still imports `node:http` and binds the runtime listener.
- `src/app-snapshot-manager.js` still imports `node:fs` for canonical source rebuild reads, but canonical watcher ownership has already been removed and is separately frozen at `[]`.
- `src/runtime-verification-persistence.js` no longer imports `node:sqlite` or `DatabaseSync`.
- `plugins/sql/provider-runtime.js` and `plugins/sqlite/provider-runtime.js` no longer own `node:sqlite` or `DatabaseSync` at all; the guardrail freezes that zero-owner invariant directly.
- `test/rust-owned-external-boundary-roadmap.test.js` now freezes the stronger invariant that product runtime code under `plugins/` does not dynamically import `pg` or `mysql2/promise` at all.
- `test/rust-owned-external-boundary-roadmap.test.js` now separately freezes `src/` `node:fs` owners into canonical runtime/serving, desktop/operator, and explicit utility buckets.
- `test/rust-owned-external-boundary-roadmap.test.js` now fails if those ownership points spread to new source files.

### Stage 1. Rust Public Ingress

- [x] `witness-core` already supports an optional Rust front door.
- [x] Raw direct CLI startup (`serve`, `bootstrap`, and HTTP `mcp`) no longer defaults to the same `3000` public-ingress port as the Rust frontdoor path.
- [x] The checked-in supervised Engentus development path now defaults to the Rust frontdoor with private templated worker ports.
- [x] Checked-in blank-world bootstrap convenience scripts (`bootstrap`, `authoring:server`) now route through dedicated Rust-supervised frontdoor configs instead of direct Node listener startup as the primary convenience path.
- [x] The checked-in Engentus worker-only utility path no longer falls back to the default public runtime port; it defaults to an explicit private utility port and remains guarded as non-supported ingress.
- [x] Checked-in example convenience scripts (`demo`, `eden`, `master`) no longer invoke direct default-port `node src/cli.js serve ...` launches; they route through explicit worker utility wrappers with private default ports.
- [x] The checked-in Engentus HTTP MCP convenience path now routes through a dedicated Rust-supervised frontdoor config instead of a direct Node HTTP listener on the supported MCP ingress port.
- [x] Node worker ports are private implementation details in every supported run mode.
- [x] Tests and scripts no longer target worker ports directly as the supported product path.
- [x] Audit and demote the remaining raw direct CLI ingress paths so they are explicit loopback utility commands rather than first-class supported product startup names.
- [x] Rust front door is the default and only supported public ingress.
- [x] Remove the remaining legacy raw CLI aliases (`serve`, `bootstrap`, and `mcp`) once downstream usage has moved to the explicit `utility-serve`, `utility-bootstrap`, and `utility-mcp` names or Rust-frontdoored startup paths.
- [x] Remove the remaining legacy compatibility aliases for worker-only scripts (`demo`, `eden`, `master`, `engentus:worker`, and `app:engentus`) once downstream usage has moved to the explicit `utility:*` names or Rust-frontdoored startup paths.

Authoritative evidence today:

- [witness-core.toml](../witness-core.toml) now enables `[frontdoor]` by default for the checked-in supervised Engentus config, uses a templated private `{runtime_port}` worker command, and points health/reload control at that private loopback runtime instead of treating the worker port as the supported public surface.
- [src/cli.js](../src/cli.js) now gives raw direct `serve`, `bootstrap`, and HTTP `mcp` startup explicit utility-port defaults (`4017`, `4015`, `4018`) instead of inheriting `3000`, so direct Node startup no longer defaults to the same listener port as the Rust public frontdoor path.
- [src/runtime-server.js](../src/runtime-server.js) now remains guarded at the actual bind point: every Node runtime listener binds `127.0.0.1`, and [src/cli.js](../src/cli.js) now prints `Ingress: loopback-only Node utility listener` on direct startup so worker ports are surfaced explicitly as private loopback utility listeners rather than implied public ingress.
- [src/cli.js](../src/cli.js) now exposes only `utility-serve`, `utility-bootstrap`, and `utility-mcp` as the raw loopback command names in its own usage text and command parser, so the legacy raw Node listener names are no longer part of the checked-in command contract.
- [witness-core-bootstrap.toml](../witness-core-bootstrap.toml) and [witness-core-authoring.toml](../witness-core-authoring.toml) now provide dedicated Rust-supervised frontdoor configs for blank-world/bootstrap startup and authoring bootstrap startup, and [package.json](../package.json) now points `bootstrap` and `authoring:server` at those configs instead of direct Node listener startup.
- [package.json](../package.json) now points `npm run engentus` and `npm run engentus:core` at `npm run platform:supervised`, while worker-port launches exist only behind explicit utility commands (`utility:engentus-worker`, `utility:demo`, `utility:eden`, `utility:master`) instead of also keeping first-class compatibility aliases.
- [witness-core-engentus-mcp.toml](../witness-core-engentus-mcp.toml) now provides a dedicated Rust-supervised frontdoor config for the checked-in Engentus HTTP MCP surface, and [package.json](../package.json) now points `engentus:mcp` at that config instead of a direct `node src/cli.js mcp ... --transport http --port 8791` listener.
- [scripts/run-app-engentus-with-core.mjs](../scripts/run-app-engentus-with-core.mjs) now injects `--port` from `WITNESS_WORKER_PORT` and defaults that worker-only utility path to `4011` instead of inheriting the public runtime default port, so the direct worker launch no longer silently masquerades as the supported public surface.
- [scripts/run-example-app-worker.mjs](../scripts/run-example-app-worker.mjs) now provides the same explicit worker-utility wrapper shape for checked-in example app launches, and [package.json](../package.json) now points `demo`, `eden`, and `master` at that wrapper with explicit private default utility ports (`4012`, `4013`, `4014`) instead of direct default-port `node src/cli.js serve ...` invocations.
- [README.md](../README.md), [HANDOFF.md](../HANDOFF.md), and [BASELINE.md](../BASELINE.md) now stop describing the raw CLI or worker-port example scripts as the canonical public/operator startup path and instead point supported public/browser-facing startup at the checked-in Rust frontdoor wrappers while demoting direct Node startup to a loopback utility CLI with explicit `utility-*` raw commands and `utility:*` worker commands only.
- [substrate/README.md](../substrate/README.md) now describes the Rust frontdoor at `http://127.0.0.1:3000` as the supported supervised app surface, promotes `npm run bootstrap`, `npm run authoring:server`, and `npm run engentus:mcp` to Rust-supervised frontdoor flows, and keeps the worker launch only in a dedicated utility section instead of the canonical developer-flow list.
- [docs/witness-world-spec.md](../docs/witness-world-spec.md) now clarifies that direct CLI startup is a raw loopback-only Node utility path with explicit `utility-*` command names and utility-port defaults, and that worker-port example launches should prefer `utility:*` commands instead of any compatibility alias names.
- `test/rust-owned-external-boundary-roadmap.test.js` now guards the checked-in config shape, the raw CLI utility-port defaults, the `utility-*` raw command contract, the absence of the removed alias commands/scripts, the loopback-only runtime bind, the bootstrap/authoring/Engentus MCP frontdoor configs, the explicit `utility:*` worker scripts, the operator-browser example loopback exception, and the public-ingress wording so the default supervised paths cannot silently drift back to direct public worker-port startup.
- `cargo test --manifest-path substrate/Cargo.toml -p witness-core checked_in_frontdoor_configs_parse_and_keep_private_worker_health_targets` now proves the checked-in `witness-core.toml`, `witness-core-bootstrap.toml`, `witness-core-authoring.toml`, and `witness-core-engentus-mcp.toml` files parse as real witness-core configs and preserve the private `{runtime_port}` worker-health targeting expected by the frontdoor model.
- `test/witness-core-live-continuity.test.js` still proves the real frontdoor path through the `frontdoor` scenario, including rolling cutover, draining, and preview continuity through the Rust public port.

### Stage 2. Rust-Owned Published Filesystem Path

- [x] `witness-core` exposes `POST /transactions/published-authoring`.
- [x] Supervised `POST /api/runtime/app-sources` proxies to the Rust transaction path.
- [x] Serving runtimes expose `POST /api/runtime/app-snapshot/reload` for Rust-triggered activation.
- [x] Supervised runtimes can run with watchers disabled.
- [x] Remove remaining non-supervised/local published-write fallback from canonical serving paths where Rust ownership is required.
- [x] Make the published path fail closed everywhere the boundary is declared authoritative, not only on the supervised path.
- [x] Make direct runtime `app.source.write` fail closed when `witness-core` is absent, instead of mutating canonical files locally.
- [x] Prove watcher suppression/update logic prevents duplicate generation pipelines for every published commit path.

Authoritative evidence today:

- `src/app-snapshot-manager.js` now requires `generationBridge.statSource(...)` and `generationBridge.writeSource(...)` for persisted published edits at all times; it no longer falls back to local `fs.mkdir(...)` / `fs.writeFile(...)` for canonical source writes.
- `src/runtime-core-handlers.js` still keeps the supervised published-authoring transaction proxy for watcher-disabled runtimes, but the direct runtime `app.source.write` path now also fails closed when witness-core is absent instead of mutating disk locally.
- `test/app-snapshot-manager.test.js` now proves persisted `applySourceEdits(...)` succeeds only through witness-core source stat/write capabilities, fails closed when the bridge is unavailable, and fails closed even without the legacy `requireGenerationBridgeForPublishedWrites` flag.
- `test/runtime-core-handlers-authoring.test.js` now proves `POST /api/runtime/app-sources` semantics fail closed outside supervised mode both when `WITNESS_CORE_URL` ownership is declared but unavailable and when no witness-core bridge is configured at all.
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
- [x] Make Rust the only owner of canonical dirty-path detection.
- [x] Ensure workers receive explicit invalidation/input updates instead of discovering canonical file changes themselves.

Authoritative evidence today:

- `src/runtime-server.js` now defaults `runtimeSupervision.watchersEnabled` to `false` for all runtimes unless `WITNESS_RUNTIME_WATCHERS_ENABLED === "true"` is supplied, so no-core development no longer silently turns on canonical dirty-path discovery by default.
- `src/runtime-server.js` now owns two explicit invalidation paths only: a no-core local-development poller that is available solely behind the explicit `WITNESS_RUNTIME_WATCHERS_ENABLED === "true"` escape hatch and calls `appSnapshotManager.markDirtyPaths(..., { trigger: "watch" })`, plus the core-connected refresh path through `witness-core` `/events` SSE subscription that translates non-preview `green_local`/`stable` generation events into `markDirtyPaths(..., { trigger: "core" })`.
- `src/runtime-server.js` now treats the local no-core poller as an explicit operator/development-only mode rather than ambient canonical dirty-path ownership, because it requires `activeDevMode === true`, `!appContext.witnessCoreUrl`, and `runtimeSupervision.watchersEnabled === true`.
- `src/runtime-server.js` still calls `appSnapshotManager.ensureFresh({ trigger: "request" })` in dev mode as a fallback hydration path, but the active snapshot manager no longer self-discovers dirty files there.
- `src/runtime-server.js` still exposes `POST /api/runtime/app-snapshot/reload`, so no-core development can rebuild from explicit dirty-path input even when the local poller remains off.
- `src/app-snapshot-manager.js` now supports `dirtyDetectionOwner: "witness-core"`, refreshes `witnessCoreStatusStore` on demand, ignores preview generations for canonical refresh, maps Rust generation `sourcePaths` back onto active source rows, and rebuilds from explicit dirty paths instead of local `detectChangedPaths()` when `witness-core` is the dirty owner.
- `src/app-snapshot-manager.js` no longer contains canonical watcher startup, `fsWatch.watch(...)` ownership, or local dirty-path probing; it now exposes only explicit dirty-path rebuild semantics plus the remaining witness-core status sync for core-connected mode.
- `test/app-snapshot-manager.test.js` now proves `ensureFresh(...)` can rebuild from `witness-core` generation metadata without local filesystem probing and ignores preview-only generations for canonical refresh.
- `test/app-snapshot-runtime.test.js` now proves both sides of the no-core development contract through the deterministic `test/fixtures/live-core-app` fixture: default-off local polling leaves source edits inert until `POST /api/runtime/app-snapshot/reload` is called with explicit dirty paths, while `WITNESS_RUNTIME_WATCHERS_ENABLED === "true"` restores the explicit opt-in `trigger: "watch"` revision and SSE flow after a source edit.
- `test/witness-core-bridge.test.js` now proves the status store consumes `witness-core` SSE events and notifies subscribers with generation payloads.
- `test/support/live-core-smoke-runner.mjs` published-authoring scenario now waits for a `trigger: "core"` app revision event after the Rust-owned transaction, proving the supervised runtime invalidates from the core event path rather than needing a route fetch to discover the change.
- `test/rust-owned-external-boundary-roadmap.test.js` now freezes both the canonical watcher owner set at `[]` and the remaining local poller activation contract at explicit opt-in only, so any reintroduction of implicit no-core watcher ownership in `src/` fails the guardrail immediately.
- `test/witness-core-live-continuity.test.js` still passes for the fixture continuity path after this change, which proves a core-connected runtime continues to pick up valid Rust-proven edits while keeping continuity semantics intact.

### Stage 5. Rust-Owned SQLite

- [x] When `WITNESS_CORE_URL` is configured, verification persistence can be mediated through `witness-core` without loading `node:sqlite` in Node.
- [x] `witness-core` exposes a verification-persistence control-plane endpoint and journals verification-persistence operations.
- [x] Replace `src/runtime-verification-persistence.js` direct `node:sqlite` ownership with a Rust-owned service or capability surface.
- [x] Remove canonical `DatabaseSync` ownership from Node runtime code.
- [x] Remove the product-local JSON compatibility verification-persistence adapter; no-core runtime verification persistence now fails closed instead of taking local ownership.
- [x] Preserve witness-core-mediated verification persistence rows and artifact content across persistence reopen/restart boundaries.
- [x] SQL provider runtimes can use `witness-core` SQLite capability endpoints for `testConnection`, `migrate`, `query`, `command`, and `transaction` when `WITNESS_CORE_URL` is configured.
- [x] `witness-core` exposes and journals SQLite capability operations used by SQL provider runtimes.
- [x] When SQL provider runtimes are in Rust-owned SQLite mode, witness-core unavailability fails closed with structured runtime errors instead of falling back to local SQLite or throwing uncaught bridge errors.
- [x] Remaining transitional SQLite runtime owners expose explicit boundary ownership metadata in runtime and host inspection (`witness-core` vs local fallback) so the exception set is visible during operation.
- [x] Verification persistence inspection now exposes only the Rust-owned boundary; when `witness-core` is unavailable the runtime reports `witness-core-required` and fails closed.
- [x] Canonical supervised app-serving runtimes fail closed for verification persistence when witness-core ownership is required but unavailable, instead of silently taking local ownership.
- [x] Canonical supervised app-serving SQLite runtimes fail closed when witness-core ownership is required but unavailable, instead of silently opening local `node:sqlite` handles.
- [x] Runtime-owned verification-persistence initialization no longer offers any product-owned scratch fallback; the runtime is Rust-owned or unavailable.
- [x] Runtime-owned SQLite provider runtimes no longer own local `node:sqlite` execution; plugin/provider SQLite access is Rust-owned or fails closed.
- [x] Remove local verification-persistence fallback ownership once Rust-managed mode becomes authoritative for canonical verification persistence.
- [x] Remove local provider-runtime SQLite ownership once Rust-managed mode becomes authoritative for SQL runtime execution.
- [x] Remove the remaining explicit direct-constructor scratch fallbacks once test and utility callers no longer require them.
- [x] Journal canonical DB effects through Rust-controlled provenance.
- [x] Preserve existing verification persistence behavior and continuity across worker restarts.
- [x] Inventory and migrate remaining plugin/provider SQLite runtimes behind the same Rust-owned DB boundary or explicitly scope them as non-canonical scratch runtimes.
- [x] Make remaining direct non-SQLite SQL runtime ownership explicit in runtime inspection and guardrails instead of leaving `postgres` / `mysql` connections as an undocumented exception set.
- [x] Replace the remaining direct `postgres` / `mysql` runtime connections in [plugins/sql/provider-runtime.js](../plugins/sql/provider-runtime.js) with a Rust-owned DB capability path or explicitly demote them out of canonical runtime execution.
- [x] Demote public `db.sql` datasource test routes away from opening direct `postgres` / `mysql` sockets from the long-running Node server.
- [x] Replace the remaining non-canonical direct `postgres` / `mysql` runtime connections in [plugins/sql/provider-runtime.js](../plugins/sql/provider-runtime.js) with a Rust-owned DB capability path so Node no longer owns those client handles even outside canonical app-serving mode.
- [x] Implement the Rust-side `postgres` / `mysql` executor behind `POST /capabilities/db/sql`.
- [ ] Add stronger live integration evidence for the non-SQLite `db.sql` capability path, including successful witness-core journaling against real `postgres` / `mysql` targets.

Authoritative evidence today:

- `src/runtime-verification-persistence.js` now routes witness-core-backed verification persistence operations through the Rust control-plane endpoint instead of loading `node:sqlite`, and it no longer imports `node:fs` or owns a local JSON compatibility ledger/artifact/cache path at all.
- `plugins/platform/verification-persistence.test.js` now proves the two supported product shapes: fail-closed `witness-core-required` behavior when core authority is unavailable, and witness-core-mediated persistence with synthesized backend metadata when core authority is configured.
- `plugins/platform/verification-persistence.test.js` now also proves that witness-core-backed verification persistence survives both a Node-side persistence reopen and a real `witness-core` restart while preserving policies, test runs, reports, reusable cache lookups, and artifact content without loading `node:sqlite`.
- `src/runtime-server.js` now passes `requireCanonicalBoundary: true` into `createRuntimeVerificationPersistence(...)` for supervised app-serving runtimes (`appRoot` present with watchers disabled), and the runtime verification-persistence factory no longer exposes any product-owned scratch fallback toggle.
- `src/runtime-verification-persistence.js` now returns a Rust-owned-unavailable verification-persistence adapter whenever core authority is absent, surfacing `boundaryOwner: "witness-core"`, `boundaryScope: "canonical-runtime"`, `adapterStatus: "witness-core-required"`, and `boundaryAvailability: "unavailable"` while failing mutation calls closed with `WITNESS_CORE_REQUIRED` instead of silently taking local ownership.
- `plugins/sql/provider-runtime.js` and `plugins/sqlite/provider-runtime.js` no longer import `node:sqlite`, open local SQLite handles, or expose non-canonical scratch ownership metadata; sqlite datasources now surface only the Rust-owned boundary (`boundaryOwner: "witness-core"`, `boundaryAuthority: "rust-owned"`, `boundaryTransport: "capability.db.sqlite"`, `boundaryScope: "canonical-runtime"`) and operations route through witness-core SQLite capabilities or fail closed with structured `503` results.
- `plugins/sql/sql.test.js`, `plugins/sqlite/sqlite.test.js`, `test/runtime-provider-runtimes.test.js`, and `test/db-sql-host.test.js` now prove the stronger contract: runtime-owned and route-level SQLite paths require witness-core ownership for `testConnection`, `migrate`, `query`, `command`, and `transaction`, while witness-core-backed SQLite calls still succeed without loading `node:sqlite`.
- `test/rust-owned-external-boundary-roadmap.test.js` now freezes the stronger invariant that no product runtime file under `plugins/sql` or `plugins/sqlite` owns `node:sqlite` or `DatabaseSync` at all, so any reintroduction of local SQLite execution into those runtime paths fails the guardrail immediately.
- `plugins/platform/verification-persistence.test.js`, `plugins/sql/sql.test.js`, `plugins/sqlite/sqlite.test.js`, `test/runtime-server.test.js`, `test/runtime-provider-runtimes.test.js`, and `test/db-sql-host.test.js` now prove the tighter contract: supervised and runtime-owned paths require Rust ownership for verification persistence and SQLite, with no product-owned verification-persistence scratch fallback remaining.
- `substrate/witness-core/src/lib.rs` now exposes `POST /capabilities/db/sqlite`, `POST /capabilities/db/sql`, and `POST /verification-persistence`; SQLite semantics stay inside the Rust-owned capability path, and non-SQLite SQL now executes through Rust-owned `postgres` / `mysql` driver code instead of falling back to Node-owned client handles.
- `cargo test --manifest-path substrate/Cargo.toml -p witness-core emits_journal_event`, `cargo test --manifest-path substrate/Cargo.toml -p witness-core verification_persistence_http_emits_journal_event_and_persists_rows`, and `cargo test --manifest-path substrate/Cargo.toml -p witness-core sqlite_capability_supports_command_query_and_transaction_rollback` now prove the Rust core journals SQLite and verification-persistence operations while preserving SQLite transaction rollback behavior.
- `plugins/sql/provider-runtime.js` no longer dynamically imports `pg` or `mysql2/promise`; non-SQLite datasources now surface the Rust-owned boundary (`boundaryOwner: "witness-core"`, `boundaryAuthority: "rust-owned"`, `boundaryTransport: "capability.db.postgres"` / `capability.db.mysql`) and runtime execution routes through `witness-core` bridge methods or fails closed with `witness-core-required`.
- `plugins/sql/sql.test.js` and `test/runtime-provider-runtimes.test.js` now prove the stronger contract: `postgres` connection tests and pipeline `mysql`/`postgres` execution route through `witness-core` SQL capability calls when the bridge is configured, and fail closed before secret resolution or socket creation when it is not.
- `substrate/witness-core/Cargo.toml` now includes `postgres`, `postgres-native-tls`, `native-tls`, and `mysql`, and `cargo test --manifest-path substrate/Cargo.toml -p witness-core` now proves the crate builds and links with the real non-SQLite driver set instead of a `501` stub.
- `plugins/sql/handlers.js` now makes the public `db.sql.datasource.test` and `db.sql.datasource.testDraft` routes fail closed for non-SQLite datasources with a route-specific `503` before delegating to direct client execution, so the long-running Node HTTP surface no longer opens `postgres/mysql` sockets through those test endpoints.
- `test/db-sql-host.test.js` now proves the public `pg_main` datasource test route returns that fail-closed `503` while still recording the failed test witness/update, rather than attempting a direct connection from the long-running server path.
- `test/witness-core-bridge.test.js` now freezes the `db.sql.test_connection`, `db.sql.read_ordered_batch`, and `db.sql.write_rows` transport shapes against `POST /capabilities/db/sql`.
- `test/rust-owned-external-boundary-roadmap.test.js` now freezes the stronger invariant that no product runtime file under `plugins/` dynamically imports `pg` or `mysql2/promise` at all.

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
- [src/witness-core-bridge.js](../src/witness-core-bridge.js) now exposes `executeHttpOutbound(...)`, while the concrete HTTP/fetch ownership for witness-core control-plane calls lives in [src/witness-core-http-transport.js](../src/witness-core-http-transport.js) instead of being interleaved through the higher-level bridge API.
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
  - `capability.network.loopback.mcp_stdio_bridge` for [src/cli.js](../src/cli.js), now explicitly scoped as a `utility-loopback` exception: stdio MCP traffic is bridged into a private local runtime HTTP endpoint derived from the spawned worker `server.url`, tagged with the internal MCP token, and kept outside the canonical server-runtime side-effect claim while the worker transport/frontdoor tranches remain unfinished.
  - `capability.network.control_plane.witness_core` for [src/witness-core-http-transport.js](../src/witness-core-http-transport.js), which is now the concrete HTTP/fetch transport adapter behind the shared witness-core bridge semantics.
  - `capability.network.server.fetch_injection` for [src/runtime-app-context.js](../src/runtime-app-context.js) and [src/runtime-route-handlers.js](../src/runtime-route-handlers.js), which are the remaining dependency-injection points handing a fetch implementation into server-side runtime factories and handlers.
  - `capability.network.oauth.identity_exchange` for [plugins/oauth/oauth-providers.js](../plugins/oauth/oauth-providers.js), which now uses Rust-owned execution for authoritative configured HTTP and HTTPS OIDC endpoints.
  - `capability.notify.email.http_delivery` and `capability.notify.email.sendgrid_delivery` for [plugins/notifications/email-transports.js](../plugins/notifications/email-transports.js), which now use Rust-owned execution for authoritative configured HTTP and HTTPS delivery endpoints.
  - `capability.network.http.outbound_delivery` for [plugins/http-outbound/glue.js](../plugins/http-outbound/glue.js), which now uses Rust-owned execution for authoritative HTTP and HTTPS delivery while still retaining explicit non-authoritative Node fallback only when `witness-core` ownership is not configured.
- Browser/client fetch paths remain classified separately as `capability.browser.runtime_fetch` in [src/runtime-network-capability-inventory.js](../src/runtime-network-capability-inventory.js); they are intentionally kept out of the server/runtime outbound-boundary claim.

### Stage 7. Worker Runtime Contract

- [x] Define an initial versioned worker result envelope (`witness-worker/v1`) and use it for build-worker stdout.
- [x] Define a stable worker protocol for build, evaluate, render, inspect, and bounded compute.
- [x] Define a versioned supervised worker-control descriptor and move the checked-in supervised paths onto `control_url`.
- [x] Define a versioned runtime-worker control transport contract and shared dispatcher so health, supervision, and reload semantics are no longer owned only by route-local HTTP handlers.
- [x] Define a versioned witness-core control-plane transport contract for runtime-side calls and subscriptions so the HTTP adapter can be replaced by IPC without changing bridge consumers.
- [x] Add a supervised worker IPC transport for witness-core bridge calls and `core.events` subscription so Rust can inject a bounded control-plane carrier into supervised workers without requiring direct Node `fetch(...)` on that path.
- [x] Stop treating ad hoc HTTP/control coupling as the long-term worker contract.
- [x] Distinguish canonical state access from scratch-worker state in the protocol itself.
- [x] Prove that a worker can be killed and replaced without losing platform continuity or external boundary ownership.

Authoritative evidence today:

- [docs/WITNESS-WORKER-PROTOCOL.md](../docs/WITNESS-WORKER-PROTOCOL.md) now defines a versioned outer worker envelope (`witness-worker/v1`) with explicit `request`, `result`, and `event` kinds plus the intended `build`, `evaluate`, `render`, `inspect`, and `bounded_compute` operation names.
- [src/witness-worker-protocol.js](../src/witness-worker-protocol.js) now codifies that protocol version, operation inventory, per-operation worker profiles, canonical-state/scratch-state enums, and shared `request`/`result`/`event` envelope helpers in product code instead of leaving the worker contract as anonymous stdout JSON.
- [src/runtime-worker-control-contract.js](../src/runtime-worker-control-contract.js) now defines the supervised worker-control descriptor (`witness-worker-control/v1`) with explicit `healthUrl`, `activationUrl`, `quiesceUrl`, and `reloadUrl` action surfaces plus the current worker readiness/mutation state.
- [src/runtime-worker-transport-contract.js](../src/runtime-worker-transport-contract.js) now defines the sibling runtime-worker transport contract (`witness-runtime-worker-transport/v1`) with explicit `runtime.control.describe`, `runtime.process_health.read`, `runtime.supervision.activate`, `runtime.supervision.quiesce`, and `runtime.app_snapshot.reload` methods, while [src/runtime-worker-transport.js](../src/runtime-worker-transport.js) centralizes those semantics in one shared dispatcher.
- [docs/WITNESS-CORE-TRANSPORT.md](../docs/WITNESS-CORE-TRANSPORT.md) and [src/witness-core-transport-contract.js](../src/witness-core-transport-contract.js) now define the sibling versioned control-plane transport contract (`witness-core-transport/v1`) with explicit `call`/`result`/`subscribe`/`event` message kinds, the current witness-core method inventory, and the `core.events` subscription channel expected by a future worker IPC adapter.
- [src/witness-core-build-worker.js](../src/witness-core-build-worker.js) now emits the shared `witness-worker/v1` build `result` envelope, including explicit non-canonical scratch metadata (`canonicalStateAccess: "none"`, `scratchState: "worker-local"`), instead of writing loose top-level JSON fields directly to stdout.
- [substrate/witness-core/src/lib.rs](../substrate/witness-core/src/lib.rs) now accepts the versioned worker envelope when parsing build-worker results, so Rust no longer depends on scraping ad hoc top-level fields on that path.
- [src/runtime-server.js](../src/runtime-server.js) now exposes `GET /api/runtime/worker-control`, and [substrate/witness-core/src/lib.rs](../substrate/witness-core/src/lib.rs) now supports `[supervise].control_url` so supervised workers can advertise the owned control surface through one discovered descriptor instead of requiring the checked-in configs to hard-code sibling `health_url` and `reload_url` paths.
- [substrate/witness-core/src/lib.rs](../substrate/witness-core/src/lib.rs) now validates `witness-worker-control/v1` descriptors when probing supervised workers and extracts the explicit action URLs from that descriptor, with the older plain-health JSON shape retained only as compatibility fallback.
- [docs/WITNESS-WORKER-PROTOCOL.md](../docs/WITNESS-WORKER-PROTOCOL.md) now records explicit operation profiles for `build`, `evaluate`, `render`, `inspect`, and `bounded_compute`, including `workerClass`, `canonicalStateAccess`, and `scratchState`, so canonical state visibility is declared by contract instead of inferred ad hoc from a route or worker name.
- [src/runtime-server.js](../src/runtime-server.js) and [src/runtime-core-handlers.js](../src/runtime-core-handlers.js) now delegate process-health, worker-control, supervision, and snapshot-reload behavior through [src/runtime-worker-transport.js](../src/runtime-worker-transport.js) instead of embedding those semantics independently inside each HTTP route handler.
- [src/witness-core-http-transport.js](../src/witness-core-http-transport.js) now implements that control-plane contract over the current HTTP control plane, while [src/witness-core-bridge.js](../src/witness-core-bridge.js) and its status store target only the injected transport `call(...)` / `subscribe(...)` interface instead of embedding fetch/path semantics directly.
- [src/witness-core-ipc-transport.js](../src/witness-core-ipc-transport.js) now implements the same control-plane contract over the Rust-injected supervised worker pipe, and [src/witness-core-bridge.js](../src/witness-core-bridge.js) now prefers that IPC carrier when `WITNESS_CORE_TRANSPORT_PIPE` is present instead of defaulting supervised workers onto direct HTTP `fetch(...)`.
- [substrate/witness-core/src/lib.rs](../substrate/witness-core/src/lib.rs) now starts the supervised worker transport pipe, injects `WITNESS_CORE_TRANSPORT_PIPE` into supervised Node workers, proxies transport `call` requests onto the existing core control plane, and streams `core.events` over the same bounded carrier.
- [test/witness-worker-protocol.test.js](../test/witness-worker-protocol.test.js), [test/witness-core-build-worker.test.js](../test/witness-core-build-worker.test.js), [test/rust-owned-external-boundary-roadmap.test.js](../test/rust-owned-external-boundary-roadmap.test.js), and the Rust unit `build_worker_result_parser_accepts_versioned_worker_protocol_envelope` now guard the shared envelope contract from the JS helper, the Node CLI worker, the roadmap guardrail, and the Rust parser side, including request/event helper support and metadata validation for canonical-state versus scratch-state ownership.
- [test/runtime-worker-transport-contract.test.js](../test/runtime-worker-transport-contract.test.js), [test/runtime-worker-transport.test.js](../test/runtime-worker-transport.test.js), [test/runtime-worker-control-contract.test.js](../test/runtime-worker-control-contract.test.js), and [test/runtime-server.test.js](../test/runtime-server.test.js) now guard the runtime-worker method inventory, message envelope, shared dispatcher behavior, descriptor transport metadata, and maintained route wiring against drift.
- [test/witness-core-transport-contract.test.js](../test/witness-core-transport-contract.test.js), [test/witness-core-bridge.test.js](../test/witness-core-bridge.test.js), [test/witness-core-ipc-transport.test.js](../test/witness-core-ipc-transport.test.js), and [test/rust-owned-external-boundary-roadmap.test.js](../test/rust-owned-external-boundary-roadmap.test.js) now guard the control-plane transport contract, the bridge’s transport injection behavior, the supervised IPC carrier, and the fact that concrete HTTP/fetch ownership remains isolated to the fallback adapter file.
- The checked-in supervised configs ([witness-core.toml](../witness-core.toml), [witness-core-bootstrap.toml](../witness-core-bootstrap.toml), [witness-core-authoring.toml](../witness-core-authoring.toml), and [witness-core-engentus-mcp.toml](../witness-core-engentus-mcp.toml)) plus the live-core fixture harness now point supervision at `control_url = "http://127.0.0.1:{runtime_port}/api/runtime/worker-control"` as the maintained path, while `health_url` / `reload_url` remain only as compatibility fallback fields inside witness-core.
- [test/support/live-core-smoke-runner.mjs](../test/support/live-core-smoke-runner.mjs) now launches supervised and frontdoored worker instances through the maintained `utility-serve` loopback worker command instead of the removed raw `serve` alias, so the continuity proof path exercises the same supervised worker contract shape that the checked-in frontdoor configs use.
- `node --test test/runtime-worker-transport-contract.test.js`, `node --test test/runtime-worker-transport.test.js`, `node --test test/runtime-worker-control-contract.test.js`, `node --test --test-name-pattern "runtime server exposes a versioned worker-control descriptor for supervised runtimes" test/runtime-server.test.js`, `cargo test --manifest-path substrate/Cargo.toml -p witness-core`, and `node --test test/rust-owned-external-boundary-roadmap.test.js` now prove the runtime-worker method inventory, shared dispatcher semantics, descriptor version, explicit action URLs, config parsing, state JSON surfacing, descriptor parsing, and roadmap/config guardrails.
- `node --test --test-name-pattern "witness-core supervised fixture smoke proves process readiness, restart, generation continuity, and restart persistence|witness-core supervised health containment smoke proves policy-triggered stable failover and restart|witness-core frontdoor smoke proves rolling cutover, draining, and preview continuity through the Rust public port" test/witness-core-live-continuity.test.js` now passes again, proving the supervised worker can be restarted, replaced, frontdoored, drained, and health-policy-restarted while continuity, preview state, and Rust-owned external boundaries remain intact.

### Final Target Audit

- [x] Node runtime code no longer imports canonical `node:sqlite`.
- [x] Node runtime code no longer binds the public host listener.
- [x] Node runtime code no longer owns canonical file watchers.
- [x] Node runtime code no longer mutates canonical files except through Rust-owned capabilities.
- [x] Node runtime code no longer performs canonical outbound network side effects directly.
- [x] Core-connected canonical snapshot rebuilds read source content and source stats through witness-core capabilities instead of local Node filesystem reads.
- [x] Initial supervised app-project manifest loading no longer depends on local Node filesystem reads.
- [x] Supervised runtime plugin catalog discovery no longer depends on direct Node filesystem reads of canonical plugin state.
- [ ] Remove the temporary core-workspace local-import fallback from supervised runtime plugin runtime-module loading so authoritative core-connected startup no longer relies on local workspace imports for transitive first-party plugin/source graphs.
- [x] Core-connected WCSS adapter loading no longer depends on direct Node filesystem reads/import of canonical app-owned adapter modules.
- [ ] Remove the temporary workspace-root local-import escape hatch from core-connected startup/plugin loading so authoritative startup and plugin helper paths fail closed instead of using local workspace imports when bridged transitive materialization is incomplete.
- [x] Core-connected strict canonical-read helpers fail closed when Rust-owned mode is declared but the witness-core bridge object itself is unavailable.
- [x] Core-connected runtime request-path static source reads can use witness-core source capabilities instead of local canonical disk reads.
- [x] Shared runtime subsystems use the shared witness-core bridge instead of opening separate direct control-plane fetch clients.
- [ ] Node operates as supervised compute only, with Rust as the sole owner of external boundaries.

Authoritative evidence today:

- `src/runtime-server.js` still creates a Node HTTP listener, but `test/rust-owned-external-boundary-roadmap.test.js` freezes that listener to `server.listen(port, "127.0.0.1", ...)`, and the checked-in docs/scripts/configs now treat it only as a private loopback worker/utility surface rather than supported public ingress.
- `test/rust-owned-external-boundary-roadmap.test.js` and the checked-in `witness-core*.toml` configs prove the supported public/browser-facing app and MCP surfaces are frontdoored through Rust (`[frontdoor].public_addr`) while Node worker ports remain templated private loopback targets behind health/reload URLs.
- `test/rust-owned-external-boundary-roadmap.test.js` freezes the direct Node outbound owner set at `src/cli.js` and `src/runtime-widget-page.js`, while separately freezing injected fetch points, the typed capability-family inventory, and the precise loopback MCP bridge shape in the CLI.
- [src/runtime-network-capability-inventory.js](../src/runtime-network-capability-inventory.js) now classifies `src/cli.js` as a `utility-loopback` MCP bridge exception and `src/runtime-widget-page.js` as browser/client fetch, both intentionally outside the canonical server-runtime side-effect claim.
- `src/runtime-verification-persistence.js` no longer owns its own `fetch`-based witness-core client; verification persistence now routes witness-core control-plane requests through [src/witness-core-bridge.js](../src/witness-core-bridge.js), while the concrete fetch transport has been isolated behind [src/witness-core-http-transport.js](../src/witness-core-http-transport.js) and a versioned transport contract.
- `test/witness-core-transport-contract.test.js`, `test/witness-core-bridge.test.js`, `plugins/platform/verification-persistence.test.js`, and `test/rust-owned-external-boundary-roadmap.test.js` now prove the control-plane method/channel inventory, the bridge’s transport injection behavior, the verification subsystem’s witness-core-backed reopen/restart survival, and the fact that the remaining direct control-plane fetch owner is only `src/witness-core-http-transport.js`.
- Stage 6 proof now covers the canonical server-side remote-effect families (`http.outbound`, `auth.oauth`, and `notify.email`) through Rust-owned execution for authoritative HTTP and HTTPS targets.
- `src/app-snapshot-manager.js` no longer falls back to local disk mutation for persisted published source edits; canonical source writes now require witness-core `statSource(...)` and `writeSource(...)` capability calls or fail closed with `WITNESS_CORE_REQUIRED`.
- `test/app-snapshot-manager.test.js` and `test/runtime-core-handlers-authoring.test.js` now prove both the direct manager path and the direct runtime `POST /api/runtime/app-sources` path fail closed when witness-core source capabilities are absent or unavailable, instead of mutating canonical app sources locally.
- `test/app-snapshot-manager.test.js` now also proves the serving-pointer controls remain explicit and testable under witness-core state: failed latest generations fall back to the stable snapshot, explicit witness-core serving-mode metadata overrides the local preference, and `promoteActiveSnapshot()` / `rollbackToStable()` / `requestServeLive()` move the serving pointer intentionally instead of depending on ambient filesystem discovery.
- `src/app-snapshot-manager.js` now builds a bridge-backed canonical source `fsModule` when `generationBridge.readSource(...)` / `statSource(...)` are available, so `buildCompiledSnapshot(...)` and manifest reloads during `consumeDirtyAndRebuild(...)` read canonical app/shared-lib source through witness-core capabilities instead of local Node reads in core-connected mode.
- `test/app-snapshot-manager.test.js` now proves `AppSnapshotManager.create(...)` and a follow-up dirty rebuild can succeed with canonical app-root filesystem reads/stat calls blocked locally while witness-core source capabilities supply `app.wtoml` and `shell.rvm`.
- `src/runtime-server.js` now enables `requireGenerationBridgeForCanonicalReads: Boolean(appContext.witnessCoreUrl)` when constructing `AppSnapshotManager`, so supervised/core-connected runtime snapshot rebuilds fail closed if a canonical read cannot be expressed through witness-core authority instead of silently falling back to local disk.
- `test/app-snapshot-manager.test.js` and `test/rust-owned-external-boundary-roadmap.test.js` now prove and freeze the strict snapshot canonical-read contract both for successful bridge-backed rebuilds and for `WITNESS_CORE_REQUIRED` failures on out-of-scope canonical reads.
- `src/app-project.js` now accepts a witness-core-backed startup source/stat module and uses it for `resolveAppProjectEntry(...)` plus manifest/import reads whenever `generationBridge.readSource(...)` / `statSource(...)` are available, while still leaving `.witness-core` cache files on the explicit local scratch path.
- `src/cli.js`, `src/runtime-server.js`, and `substrate/witness-core/src/lib.rs` now align supervised worker boot around `WITNESS_CORE_WORKSPACE_ROOT`, so fixture-first and supervised startup resolve manifests, runtime plugin roots, and static/runtime source ids against the actual witness-core workspace rather than the repo process `cwd`.
- `test/support/witness-core-harness.js` now creates workspace-local links for `plugins/`, `src/`, and `store/` inside the tracked fixture workspace and rebuilds `witness-core` when its Rust inputs change, so the supervised fixture path exercises the same first-party plugin/source graph shape that the real workspace expects instead of relying on stale binaries or missing roots.
- `src/cli.js` now creates a startup witness-core bridge from `WITNESS_CORE_URL` and passes it into `loadAppProjectWithStableFallback(...)` for the supervised `utility-serve` and `utility-mcp` worker flows, so those worker boot paths no longer depend on local canonical manifest/import reads before the runtime starts.
- `test/app-project.test.js` now proves `loadAppProjectWithStableFallback(...)` can resolve an app directory and read both `app.wtoml` and imported app sources through witness-core capabilities with local canonical filesystem reads/stat calls blocked.
- `substrate/witness-core/src/lib.rs` now exposes `GET /capabilities/fs/list`, journals `capability.fs.list`, and returns typed directory-entry metadata for scoped roots, so Rust can mediate plugin-root directory discovery instead of leaving it to Node `readdir(...)`.
- `src/runtime-plugin-utils.js` now builds a witness-core-backed discovery `fsModule` when `generationBridge.readSource(...)`, `statSource(...)`, and `listSourceDirectory(...)` are available; `discoverRuntimePluginPackages(...)` and `readRuntimePluginCatalog(...)` now use that bridge-backed module for plugin-root listing, manifest reads, and `runtime.entry` existence checks in supervised/core-connected mode.
- `src/dsl.js`, `src/app-project.js`, and `src/runtime-server.js` now thread `generationBridge` through runtime plugin catalog reads, so both app-project startup loading and server startup catalog discovery can avoid local canonical plugin manifest reads when `WITNESS_CORE_URL` is configured.
- `test/runtime-plugin-utils.test.js` now proves plugin catalog discovery can list a plugin root, read `plugin.json`, stat `runtime.js` through witness-core capabilities with local plugin-root filesystem reads blocked, and treat an in-scope missing plugin root as an empty catalog instead of crashing when the bridge returns a scoped `404`.
- `src/runtime-plugin-loader.js` now materializes plugin-owned runtime modules into `.witness-core/runtime-plugin-modules/...` from witness-core `listSourceDirectory(...)` and `readSource(...)` capability calls before importing them, so supervised/core-connected runtime-module loading prefers a bridge-fed scratch mirror. Those writes are explicit non-canonical scratch outputs rather than canonical plugin-source mutation.
- `src/dsl.js` and `src/runtime-server.js` now thread `generationBridge` into `loadRuntimePluginModules(...)`, so both DSL-driven plugin loading and supervised server startup load plugin-owned runtime modules from the witness-core-fed scratch mirror when `WITNESS_CORE_URL` is configured.
- `src/runtime-plugin-loader.js` also still carries an explicit `preferLocalWorkspaceImports` fallback for first-party transitive plugin/source graphs inside the declared witness-core workspace root, so the fixture-first matrix is green again but pure bridge-owned transitive runtime-module closure is not yet complete.
- `test/runtime-plugin-loader.test.js` now proves a plugin runtime with `./helper.js` relative imports can load successfully from the materialized scratch mirror while local canonical plugin-root `readFile(...)`, `readdir(...)`, and `stat(...)` calls are blocked.
- The fixture-first continuity matrix is green again end to end: `continuity`, `preview`, `published-authoring`, `supervised`, `supervised-health`, `frontdoor`, and `soak` all pass through [test/support/live-core-smoke-runner.mjs](../test/support/live-core-smoke-runner.mjs), and the full [test/witness-core-live-continuity.test.js](../test/witness-core-live-continuity.test.js) suite passes again against the real `witness-core` binary after the workspace-root alignment fixes.
- `test/rust-owned-external-boundary-roadmap.test.js` now freezes the strict plugin discovery/materialization contract while leaving the explicit core-workspace local-import fallback visible as transitional debt rather than pretending canonical plugin-path imports are fully eliminated already.
- `src/runtime-wcss-adapter.js` now materializes authored adapter modules plus their relative local JS import graph into `.witness-core/runtime-wcss-adapters/...` from witness-core `readSource(...)` / `statSource(...)` capability calls before importing them, so core-connected WCSS runtime/authoring routes no longer import canonical app-owned adapter modules directly from local disk.
- `plugins/wcss-runtime/runtime.js` and `plugins/wcss-authoring/runtime.js` now thread `appContext.witnessCoreBridge` plus a strict `Boolean(appContext.witnessCoreUrl)` requirement into `loadWcssAdapterExport(...)`, so core-connected WCSS adapter loading becomes fail-closed when witness-core authority is declared but unavailable, and those handlers now surface `WITNESS_CORE_REQUIRED` in structured error payloads instead of silently falling back to local imports.
- `plugins/wcss-runtime/wcss-runtime.test.js`, `plugins/wcss-authoring/wcss-authoring.test.js`, and `test/rust-owned-external-boundary-roadmap.test.js` now prove and freeze bridge-backed WCSS adapter loading, including relative helper imports, with local canonical adapter reads/stats blocked.
- `src/app-project.js`, `src/runtime-plugin-utils.js`, and `src/runtime-plugin-loader.js` now expose explicit strict bridge modes (`requireGenerationBridgeForCanonicalReads` / `requireGenerationBridgeForCanonicalImports`) that turn previously silent source-id fallbacks into `WITNESS_CORE_REQUIRED` failures for core-connected startup and plugin-loading flows, and `resolveAppProjectEntry(...)` no longer masks those failures as ordinary “path not found” misses.
- `src/cli.js`, `src/dsl.js`, and `src/runtime-server.js` now enable those strict modes for core-connected startup/plugin paths, so `WITNESS_CORE_URL` no longer merely prefers witness-core for startup/plugin reads; it requires witness-core authority for canonical-source scope on those paths.
- `src/app-project.js`, `src/runtime-plugin-utils.js`, `src/runtime-plugin-loader.js`, and `src/app-snapshot-manager.js` now also fail closed when strict Rust-owned mode is declared but the witness-core bridge object itself is unavailable, instead of quietly handing the same canonical reads back to local `fsModule` helpers.
- `test/app-project.test.js`, `test/runtime-plugin-utils.test.js`, `test/runtime-plugin-loader.test.js`, `test/app-snapshot-manager.test.js`, and `test/rust-owned-external-boundary-roadmap.test.js` now prove and freeze the fail-closed behavior both for out-of-scope core-connected app-project startup/plugin loading/snapshot reads and for missing-bridge strict-mode cases.
- `substrate/witness-core/src/lib.rs` now supports binary-safe source reads through `GET /capabilities/fs/read?...&encoding=base64`, and [src/witness-core-bridge.js](../src/witness-core-bridge.js) now forwards optional source-read encodings through the shared bridge.
- `src/runtime-server.js` now routes core-connected `/app-static/*` and `/canvas-lib/*` request-path reads through witness-core source capabilities (`readRuntimeSourceBytes(...)` / `readRuntimeSourceText(...)`) instead of always reading canonical files from local disk when `WITNESS_CORE_URL` is configured, and those paths now fail closed instead of silently falling back to local disk when the asset path is outside witness-core source scope.
- `src/runtime-server.js` now treats `requireWitnessCoreAuthority: Boolean(appContext.witnessCoreUrl)` as a hard gate for core-connected request-path static reads, so missing bridge objects fail closed with `WITNESS_CORE_REQUIRED` instead of falling back to local `fs.readFile(...)`.
- `test/runtime-server.test.js`, `test/witness-core-bridge.test.js`, `test/rust-owned-external-boundary-roadmap.test.js`, and the Rust unit `capability_read_stat_and_patch_are_scoped_to_configured_roots` now prove the binary-safe fs-read seam, bridge serialization, successful core-connected runtime-server static serving, and fail-closed behavior for both out-of-scope static asset paths and missing-bridge strict-mode cases.
- `src/desire/wtoml.js` now accepts an injected `readFile(...)` capability in `compileWtomlFileToDesirePlus(...)`, and `test/desire.test.js` now proves the WTOML file compiler can compile through that injected capability without relying on a local canonical file read.
- `src/desire/rvm.js`, `src/desire/wtoml.js`, and `src/dsl.js` now expose a shared strict helper layer (`requireReadCapability`) that fails closed with `WITNESS_CORE_REQUIRED` when file-based DESIRE compilation or witness app loading is declared Rust-owned but no injected read capability is available, and `src/app-project.js` now threads that stricter contract into core-connected app startup.
- `test/desire.test.js`, `test/dsl.test.js`, `test/app-project.test.js`, and `test/rust-owned-external-boundary-roadmap.test.js` now prove and freeze that helper-level fail-closed behavior for both file compilers and witness app loaders, and also freeze that the only remaining non-test product call sites already inject a reader or run in strict mode rather than relying on ambient helper fallback.
- `plugins/pipeline-runtime/rvm-model-loader.js` now centralizes pipeline model-body loading behind the same `readFile(...)` / `requireReadCapability` contract, and `plugins/pipeline-runtime/burst-fit-kernels.js`, `plugins/pipeline-runtime/clip-kernels.js`, `plugins/pipeline-runtime/health-kernels.js`, and `plugins/pipeline-runtime/kalman-kernels.js` now default that contract to fail closed instead of compiling model files from local disk unless an injected reader or custom loader is supplied.
- `plugins/pipeline-runtime/model-body-loader.test.js`, `test/desire-engentus-clip-in-ir.test.js`, `test/desire-engentus-health-in-ir.test.js`, `test/desire-engentus-kalman-in-ir.test.js`, and `test/rust-owned-external-boundary-roadmap.test.js` now prove the pipeline model-body seam can compile through an injected reader, the in-IR handlers fail closed by default when no injected reader is supplied, and the existing clip/health/kalman in-IR handler behavior still works when tests pass an explicit reader against the canonical Engentus models.
- `test/rust-owned-external-boundary-roadmap.test.js` now freezes canonical runtime write owners to the explicit scratch/cache exception set only: [src/runtime-plugin-loader.js](../src/runtime-plugin-loader.js) for `.witness-core/runtime-plugin-modules`, [src/runtime-stable-source-cache.js](../src/runtime-stable-source-cache.js) for `.witness-core/stable-app-snapshots`, [src/runtime-wcss-adapter.js](../src/runtime-wcss-adapter.js) for `.witness-core/runtime-wcss-adapters`, and [src/witness-core-build-worker.js](../src/witness-core-build-worker.js) for staged `.witness-core/compute-modules` artifacts. Those writes are non-canonical cache/worker outputs rather than canonical source mutation paths.
- Together, those strict-mode, static-serving, and explicit-opt-in poller proofs materially shrink the canonical filesystem blocker for [src/runtime-server.js](../src/runtime-server.js), [src/app-snapshot-manager.js](../src/app-snapshot-manager.js), [src/app-project.js](../src/app-project.js), [src/runtime-plugin-utils.js](../src/runtime-plugin-utils.js), and [src/runtime-plugin-loader.js](../src/runtime-plugin-loader.js); the surviving runtime `node:fs` owners on those paths are explicit `.witness-core/...` scratch outputs, the demoted operator/development-only no-core poller escape hatch, and the still-open core-workspace local-import fallback used while bridged transitive plugin/source materialization remains incomplete.
- `src/operator-browser-example-server.js` remains a deliberate operator/example exception: it still owns a loopback Node HTTP listener and local static-file reads for the operator browser example, but that surface is not a supported public ingress path or canonical serving runtime and must stay explicitly classified outside the canonical boundary claim until it is either frontdoored or retired.

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

## Remaining Blockers To Final Closure

These items are the concrete blockers behind the final unchecked audit item:

- [ ] Replace the remaining loopback Node HTTP worker listener in [src/runtime-server.js](../src/runtime-server.js) with a Rust-owned worker transport or frontdoored worker channel so Node no longer owns `node:http` or `server.listen(...)` even privately.
- [x] Replace route-local worker control semantics with a shared runtime-worker transport contract and dispatcher so process health, supervision, worker-control, and snapshot reload behavior are defined once and can survive a later HTTP-to-IPC carrier swap without re-encoding those semantics per route.
- [x] Demote direct `postgres` / `mysql` runtime execution in [plugins/sql/provider-runtime.js](../plugins/sql/provider-runtime.js) out of canonical app-serving mode so supervised canonical runtimes fail closed before opening secrets or sockets.
- [x] Replace the remaining non-canonical direct `postgres` / `mysql` runtime database connections in [plugins/sql/provider-runtime.js](../plugins/sql/provider-runtime.js) with a Rust-owned capability path so Node no longer owns those DB client handles at all.
- [x] Implement the concrete Rust-side `postgres` / `mysql` executor behind `POST /capabilities/db/sql`.
- [ ] Add stronger live integration evidence for the Rust-owned non-SQLite `db.sql` capability path, including successful journaling against real `postgres` / `mysql` targets.
- [ ] Remove the temporary `preferLocalWorkspaceImports` fallback from [src/runtime-plugin-loader.js](../src/runtime-plugin-loader.js) by extending bridged materialization to cover transitive first-party plugin/source dependencies, then tighten the guardrail so authoritative supervised startup/plugin loading no longer uses workspace-local imports.
- [ ] Re-close the final canonical-source `node:fs` audit for supervised runtime startup/plugin paths in [src/runtime-server.js](../src/runtime-server.js), [src/app-project.js](../src/app-project.js), [src/runtime-plugin-utils.js](../src/runtime-plugin-utils.js), and [src/runtime-plugin-loader.js](../src/runtime-plugin-loader.js) after the core-workspace local-import fallback is removed and only explicit `.witness-core/...` scratch outputs remain local.
- [x] Retire the remaining no-core/local-development canonical change-discovery path in [src/runtime-server.js](../src/runtime-server.js) (`detectLocallyChangedSnapshotPaths(...)` / `localSnapshotPoller`) so Node no longer self-discovers canonical source mutations outside Rust-owned invalidation or an explicitly demoted operator-only mode.
- [x] Remove ambient helper fallback as a live product runtime owner for generic file-based compiler and witness-app loader helpers by ensuring every non-test product call site for [src/desire/rvm.js](../src/desire/rvm.js), [src/desire/wtoml.js](../src/desire/wtoml.js), and [src/dsl.js](../src/dsl.js) now injects a reader or enables strict capability mode instead of depending on local fallback.
- [x] Remove direct runtime model-file compilation fallback from [plugins/pipeline-runtime/burst-fit-kernels.js](../plugins/pipeline-runtime/burst-fit-kernels.js), [plugins/pipeline-runtime/health-kernels.js](../plugins/pipeline-runtime/health-kernels.js), and [plugins/pipeline-runtime/kalman-kernels.js](../plugins/pipeline-runtime/kalman-kernels.js) by making their model-body loaders fail closed unless an injected reader or custom loader is supplied.
- [x] Separate witness-core bridge semantics from the concrete HTTP/fetch transport so runtime consumers target an injected transport contract instead of depending on `fetch` ownership directly.
- [x] Add a Rust-injected supervised worker IPC transport alongside the HTTP adapter so authoritative supervised workers can reach witness-core through the same bounded channel for request/response control calls and `core.events` streaming.
- [ ] Remove the remaining HTTP fallback adapter requirement from authoritative supervised/runtime paths in [src/witness-core-http-transport.js](../src/witness-core-http-transport.js) and retire direct control-plane `fetch(...)` ownership there once supervised/manual attachment flows have converged on the bounded worker carrier.
- [x] Re-audit utility-only direct outbound owners such as [src/cli.js](../src/cli.js) and classify whether they remain acceptable loopback/operator exceptions or need removal once the Rust-owned worker transport exists.

Close [ ] `Node operates as supervised compute only, with Rust as the sole owner of external boundaries.` only when every blocker above is complete and the guardrail tests have been tightened to freeze the new zero-direct-ownership state.
4. move verification SQLite under Rust
5. move outbound network effects under Rust
6. replace the HTTP control-plane adapter with the Node worker IPC transport
7. make Rust ingress the only supported public serving mode

## One-Sentence Test

If a Node worker can still independently touch the outside world in a way that changes canonical platform behavior, the target has not been reached.
