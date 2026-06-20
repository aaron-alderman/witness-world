# Rust-Owned Execution Handbook

## Purpose

This document is the stand-alone execution handbook for moving the platform to the target boundary:

- Rust owns the external world.
- Node owns bounded app compute only.
- Node reaches files, databases, ports, and network only through Rust.

If a new agent starts here, this document should be enough to:

- understand the target
- understand the current transitional state
- choose the next safe tranche
- avoid the common failure modes
- leave the repo in a better, not wider, state

This document is deliberately opinionated.
It exists to prevent drift.

The primary start-here document for new agents is [docs/RUST-OWNED-BOUNDARY-PROJECT-ROADMAP.md](./RUST-OWNED-BOUNDARY-PROJECT-ROADMAP.md).
Use [docs/RUST-OWNED-BOUNDARY-DELIVERY-GUIDE.md](./RUST-OWNED-BOUNDARY-DELIVERY-GUIDE.md) immediately after that as the operating brief.
This handbook is the supporting rulebook and detailed reference.

Primary related documents:

- [docs/RUST-OWNED-BOUNDARY-PROJECT-ROADMAP.md](./RUST-OWNED-BOUNDARY-PROJECT-ROADMAP.md)
- [docs/RUST-OWNED-BOUNDARY-DELIVERY-GUIDE.md](./RUST-OWNED-BOUNDARY-DELIVERY-GUIDE.md)
- [docs/RUST-OWNED-EXTERNAL-BOUNDARY-ROADMAP.md](./RUST-OWNED-EXTERNAL-BOUNDARY-ROADMAP.md)
- [docs/LIVE-CORE-GOAL-CONTRACT.md](./LIVE-CORE-GOAL-CONTRACT.md)
- [substrate/README.md](../substrate/README.md)
- [docs/CONTINUOUS-VERIFICATION-ROADMAP.md](./CONTINUOUS-VERIFICATION-ROADMAP.md)

## One-Sentence Target

Build a platform where the long-running continuity substrate is Rust, and Node can be restarted, replaced, or restricted without losing ownership of ports, filesystem mutation, watch policy, SQLite continuity, or network policy.

## Why This Matters

The problem is not "JavaScript is bad."
The problem is that a dynamic long-running process becomes dangerous when it owns too many ambient external powers at once.

The specific dangers are:

- memory leaks in the process that also owns continuity
- open-handle leaks in the process that also owns lifecycle
- race conditions around file change discovery and rebuild
- mixed ownership of source-of-truth state
- hidden side effects that bypass provenance and policy
- "just for now" fallbacks that quietly become permanent architecture

The migration is successful when Node can fail as a worker without becoming a platform outage.

## End-State Boundary Contract

### Rust owns

- host port binding
- public ingress
- worker supervision
- canonical filesystem reads and writes
- canonical filesystem watch policy
- canonical SQLite connections
- outbound network policy and mediation
- append-only event journaling
- generation continuity
- promotion, rollback, and last-good serving
- capability attribution and enforcement

### Node owns

- parsing
- compilation/lowering
- runtime evaluation
- rendering
- inspection helpers
- bounded worker compute
- scratch local in-memory state that is not canonical

### Node must not own

- public listeners
- canonical `node:sqlite` handles
- canonical `fsWatch.watch(...)`
- direct canonical filesystem mutation
- direct canonical outbound network effects
- hidden side-channel reads that bypass Rust policy

## Architectural Rule

If the resource is external, Rust is the authority.

Node may:

- request
- compute
- return results

Node may not:

- silently own
- silently persist
- silently publish

## Current Transitional Truth

At the time of writing, the boundary is partially moved, not complete.

Rust already owns meaningful slices:

- generation registry
- proof execution control
- supervised process lifecycle
- optional frontdoor/public ingress
- append-only journal
- preview and published source capability seams in some paths
- published transaction staging/commit/reload control in supervised mode

Node still owns important transitional seams:

- the main runtime HTTP server in [src/runtime-server.js](/C:/Users/aaron/Documents/world/src/runtime-server.js)
- canonical watcher logic in [src/app-snapshot-manager.js](/C:/Users/aaron/Documents/world/src/app-snapshot-manager.js)
- verification persistence logic in [src/runtime-verification-persistence.js](/C:/Users/aaron/Documents/world/src/runtime-verification-persistence.js)
- direct app boot/orchestration in [src/cli.js](/C:/Users/aaron/Documents/world/src/cli.js)

Treat those as named exceptions to remove, not as precedent.

## Core Migration Laws

### 1. Boundary first, semantics second

Do not block on a Rust rewrite of app semantics.
Move ownership of the external boundary first.

### 2. Vertical slice over abstract framework

Every tranche must move a real path end to end.
Do not build broad "future" interfaces with no real consumer.

### 3. Fail closed when Rust ownership is declared authoritative

If the code path says Rust owns this boundary, Node must not quietly fall back to direct local ownership.

### 4. Preserve last-good behavior

Every move must preserve:

- rollback
- serve-stable behavior
- process restart safety
- preview isolation

### 5. No hidden dual truth

Do not let Rust and Node both be canonical owners of the same external state.
Transitional read-through or proxy arrangements are acceptable only if the canonical owner is still explicit.

### 6. Evidence over intent

Do not mark roadmap stages complete because the code "basically does it."
A stage is complete only when tests and guardrails prove the ownership change.

## Mandatory Working Style

Every agent working in this area must follow this order:

1. Read this handbook.
2. Read [docs/RUST-OWNED-EXTERNAL-BOUNDARY-ROADMAP.md](./RUST-OWNED-EXTERNAL-BOUNDARY-ROADMAP.md).
3. Read [docs/LIVE-CORE-GOAL-CONTRACT.md](./LIVE-CORE-GOAL-CONTRACT.md).
4. Check current `git status`.
5. Identify which stage and which exact ownership point the change advances.
6. State what will be left unchanged on purpose.
7. Implement one vertical slice.
8. Run targeted tests.
9. Update docs/checklists honestly.
10. Leave explicit notes on what remains.

If those steps are skipped, the risk of drift is high.

## What Not To Do

Do not:

- add new direct `node:fs` access to canonical runtime-serving paths
- add new direct `node:sqlite` usage for canonical platform state
- add new public `node:http` or `net` listeners in Node runtime code
- add new canonical watchers in Node
- hide fallback behavior behind "helper" utilities that still bypass Rust
- create one boundary model for preview and another for published if they touch the same canonical sources
- widen the exception set in `test/rust-owned-external-boundary-roadmap.test.js`
- build UI-first validation when a fixture-first proof path would be more deterministic
- migrate multiple external boundaries in one tranche unless the consumer path truly requires it
- introduce Wasm/AssemblyScript/runtime-rewrite work before the external boundary is actually contained

## What Good Looks Like

Good work in this area usually has these properties:

- one boundary moves materially
- one real consumer switches to that boundary
- one old bypass path is reduced or removed
- tests prove fail-closed behavior
- journal/provenance becomes more explicit
- the exception list gets smaller, not larger

Bad work usually looks like this:

- a new abstraction layer with no routed consumer
- extra configuration without ownership transfer
- Node still doing the real effect after a Rust "pre-check"
- "temporary" local fallbacks in the supposedly authoritative path
- browser/Sourcery polish used as a substitute for fixture-level proof

## The Recommended Execution Order

This order is deliberate.
Do not reorder casually.

### Stage A. Public ingress

Goal:

- Rust becomes the only supported public host listener

Why first:

- without ingress ownership, the process boundary is still blurry

Done when:

- public clients hit Rust only
- worker ports are private implementation details

### Stage B. Published filesystem path

Goal:

- published authoring becomes Rust-mediated end to end

Why here:

- published writes are high-risk and easy to reason about as transactions

Done when:

- Node does not directly persist canonical published writes on the authoritative path
- reload happens only after Rust-approved commit

### Stage C. Preview filesystem path

Goal:

- preview sessions use the same external boundary owner as published flows

Why here:

- preview is lower-risk than published but still exercises the same source boundary

Done when:

- preview reads and writes for authoritative mode are Rust-mediated
- Node does not silently fall back to local canonical reads/writes

### Stage D. Canonical watchers

Goal:

- Rust becomes the only owner of canonical dirty-path detection

Why here:

- mixed watch ownership is a major source of race conditions and rebuild soup

Done when:

- canonical app-serving watchers are removed from Node
- workers receive explicit invalidation/update inputs instead of ambient discovery

### Stage E. SQLite ownership

Goal:

- Rust owns canonical SQLite lifecycle and access policy

Why here:

- DB continuity matters, but it is safer to move after the source/rebuild boundary is more controlled

Recommended first seam:

- verification persistence

Done when:

- Node no longer owns canonical `DatabaseSync` handles for platform state
- DB effects are journaled through Rust

### Stage F. Outbound network ownership

Goal:

- Node has no direct canonical side-effect path to the network

Why after SQLite:

- by this point the platform should already have a clear external authority model

Done when:

- outbound effects are typed capabilities
- denied effects fail visibly

### Stage G. Worker protocol hardening

Goal:

- Node becomes a well-defined worker engine rather than a soft platform host

Done when:

- worker lifecycle is deterministic
- scratch state is non-canonical
- the protocol expresses state ownership clearly

## How To Choose The Next Tranche

When several tasks are available, choose the one that:

1. removes direct Node ownership of one external boundary
2. has a real consumer path already present
3. can be tested fixture-first
4. shrinks the known exception set
5. does not require a speculative rewrite

If two options are close, prefer the one that:

- reduces ambient filesystem ownership
- reduces public listener ambiguity
- reduces direct DB ownership
- reduces hidden fallback behavior

Avoid tranches that mainly:

- add observability without moving ownership
- add indirection without removing the old path
- create another UI surface before the control plane is proven

## Acceptance Standard For Any Boundary Move

Every tranche should prove:

- the new Rust-owned path is used by a real consumer
- failure is explicit and fail-closed where Rust is authoritative
- last-good behavior still works
- restart continuity still works
- provenance is visible in Rust-controlled events or records
- the old Node-owned path is reduced, isolated, or removed

The burden of proof is on the new boundary.

## Preferred Test Strategy

### Primary

- fixture-first
- non-browser
- direct HTTP/control-plane validation
- filesystem/journal inspection
- deterministic source edits

### Secondary

- Node unit tests for bridge and fallback behavior
- Rust unit tests for policy, state machine, and persistence

### Later audit

- browser/Sourcery/manual UX confirmation

The browser is not the main proof surface for boundary work.

## Guardrails That Must Stay In Place

Keep and extend source-level guardrails that freeze exception sets for:

- `node:sqlite`
- public `node:http`
- canonical `fsWatch.watch(...)`

When a new ownership exception appears, treat it as a regression unless the roadmap explicitly authorizes it and the guardrail was intentionally updated with justification.

## Review Checklist For Agents

Before sending a change, verify:

- Which exact boundary moved?
- Which exact Node-owned exception became smaller?
- Which real consumer switched to the Rust path?
- What happens if Rust is unavailable?
- Is the path supposed to fail open or fail closed?
- Does last-good behavior still hold?
- Did any new direct Node external access slip in?
- Did tests prove the ownership claim?
- Did the roadmap checkbox state change?

If those answers are vague, the tranche is probably not ready.

## Common Failure Modes

### 1. Proxy theater

Node still performs the real effect, but Rust now gets an informational call first.
That is not ownership transfer.

### 2. Silent fallback

The Rust path fails, then Node quietly does the effect locally.
That is the exact behavior this migration is trying to eliminate.

### 3. Dual pipelines

Rust transaction commit and Node watcher both generate their own lifecycle for the same change.
That creates race conditions and provenance ambiguity.

### 4. Preview divergence

Preview gets a separate source/effect model that does not converge with the main continuity system.
That increases complexity instead of reducing it.

### 5. UI-led validation

The team believes a boundary move is real because the UI "looks right."
That is not strong enough evidence.

### 6. Re-litigation drift

Each agent reopens the architecture question and wanders into new abstractions.
Use this document to stop that behavior.

## Decision Table

### If the choice is "move a boundary" vs "improve UI around the old boundary"

Choose boundary movement first.

### If the choice is "add a general framework" vs "move one real path"

Choose the real path.

### If the choice is "keep fallback for convenience" vs "fail closed in authoritative mode"

Choose fail-closed for the authoritative path.

### If the choice is "rewrite semantics" vs "move ownership seam"

Choose the ownership seam.

### If the choice is "browser proof" vs "fixture proof"

Choose fixture proof first.

## Boundaries Still Allowed To Be Transitional

Transitional exceptions are allowed only when they are:

- named
- narrow
- tested
- documented
- on a removal path

They are not allowed to:

- expand casually
- become precedent for new code
- remain undocumented

## What "Done" Means For The Program

The program is done when:

- Rust is the only canonical owner of ports, filesystem policy, SQLite, and outbound network policy
- Node is restartable bounded compute
- preview and published paths share one external authority model
- last-good behavior is preserved through failures and restarts
- provenance exists for external effects
- the exception-set guardrails collapse toward zero

## Handoff Template

Every agent working in this area should leave a handoff that includes:

- the stage advanced
- the exact ownership seam changed
- the files touched
- what now works
- what still bypasses Rust
- tests run
- tests still failing
- which roadmap checkboxes changed
- what the next smallest tranche should be

## Final Rule

If a proposed change makes the system more powerful but less explicit about who owns the external world, it is the wrong change for this program.

That rule should override local convenience.
