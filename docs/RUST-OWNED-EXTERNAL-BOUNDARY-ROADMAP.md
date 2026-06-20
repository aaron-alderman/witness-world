# Rust-Owned External Boundary Roadmap

## Purpose

This document is the standalone execution-boundary contract for the platform.

Its job is to keep new work aligned on one target:

- Rust owns the external world.
- Node owns app compute only.
- Node reaches the outside world only through Rust.

This is not a speculative architecture note.
It is a migration roadmap, a contributor guardrail, and a handoff document for new agents.

Primary related documents:

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
  - published authoring transaction staging and activation
- Node still directly owns:
  - the main runtime HTTP server in [src/runtime-server.js](../src/runtime-server.js)
  - broad filesystem access in [src/app-snapshot-manager.js](../src/app-snapshot-manager.js)
  - SQLite verification persistence in [src/runtime-verification-persistence.js](../src/runtime-verification-persistence.js)
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
- [ ] Add a second guardrail layer that distinguishes canonical-serving/runtime paths from desktop/operator-only paths for broader `node:fs` usage.

Authoritative evidence today:

- `src/runtime-server.js` still imports `node:http` and binds the runtime listener.
- `src/app-snapshot-manager.js` still imports `node:fs` and owns canonical watchers.
- `src/runtime-verification-persistence.js` still imports `node:sqlite`.
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
- [ ] Remove remaining non-supervised/local published-write fallback from canonical serving paths where Rust ownership is required.
- [ ] Make the published path fail closed everywhere the boundary is declared authoritative, not only on the supervised path.
- [ ] Prove watcher suppression/update logic prevents duplicate generation pipelines for every published commit path.

### Stage 3. Rust-Owned Preview Filesystem Path

- [x] Preview sessions use Rust FS capability reads when `WITNESS_CORE_URL` is present.
- [x] Preview sessions use Rust FS capability patch writes when `WITNESS_CORE_URL` is present.
- [ ] Remove preview fallback to local canonical file reads.
- [ ] Remove preview fallback to in-memory-only overlay mutation when Rust ownership is required.
- [ ] Make preview-session continuity fail closed when the configured boundary owner is unavailable.

### Stage 4. Rust-Owned Canonical Watchers

- [x] Supervised runtimes can disable canonical watchers.
- [ ] Remove canonical watcher ownership from `src/app-snapshot-manager.js`.
- [ ] Make Rust the only owner of canonical dirty-path detection.
- [ ] Ensure workers receive explicit invalidation/input updates instead of discovering canonical file changes themselves.

### Stage 5. Rust-Owned SQLite

- [ ] Replace `src/runtime-verification-persistence.js` direct `node:sqlite` ownership with a Rust-owned service or capability surface.
- [ ] Remove canonical `DatabaseSync` ownership from Node runtime code.
- [ ] Journal canonical DB effects through Rust-controlled provenance.
- [ ] Preserve existing verification persistence behavior and continuity across worker restarts.

### Stage 6. Rust-Owned Outbound Network

- [ ] Inventory all direct outbound network paths in Node runtime code.
- [ ] Classify those paths into typed Rust-mediated capabilities.
- [ ] Move canonical remote side effects under Rust execution and policy.
- [ ] Make denied outbound effects fail visibly instead of silently bypassing the boundary.

### Stage 7. Worker Runtime Contract

- [ ] Define a stable worker protocol for build, evaluate, render, inspect, and bounded compute.
- [ ] Stop treating ad hoc HTTP/control coupling as the long-term worker contract.
- [ ] Distinguish canonical state access from scratch-worker state in the protocol itself.
- [ ] Prove that a worker can be killed and replaced without losing platform continuity or external boundary ownership.

### Final Target Audit

- [ ] Node runtime code no longer imports canonical `node:sqlite`.
- [ ] Node runtime code no longer binds the public host listener.
- [ ] Node runtime code no longer owns canonical file watchers.
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
