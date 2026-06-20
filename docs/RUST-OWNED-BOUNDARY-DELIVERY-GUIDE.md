# Rust-Owned Boundary Delivery Guide

## Purpose

This document is the standalone project guide for moving the platform to the intended execution boundary:

- Rust owns the external world.
- Node owns bounded app compute only.
- Node reaches files, databases, ports, and remote systems only through Rust.

This is the document a new agent should start from when working on the live-core boundary.

If an agent reads only one file before starting, it should be this file.
The roadmap and handbook add detail, but this document is meant to be sufficient on its own to keep execution aligned.

It is not a philosophy note.
It is not a speculative rewrite plan.
It is the operating brief for getting from the current mixed state to the contained end state without wandering.

Primary related documents:

- [docs/RUST-OWNED-BOUNDARY-PROJECT-ROADMAP.md](./RUST-OWNED-BOUNDARY-PROJECT-ROADMAP.md)
- [docs/RUST-OWNED-EXTERNAL-BOUNDARY-ROADMAP.md](./RUST-OWNED-EXTERNAL-BOUNDARY-ROADMAP.md)
- [docs/RUST-OWNED-EXECUTION-HANDBOOK.md](./RUST-OWNED-EXECUTION-HANDBOOK.md)
- [docs/LIVE-CORE-GOAL-CONTRACT.md](./LIVE-CORE-GOAL-CONTRACT.md)
- [substrate/README.md](../substrate/README.md)

## How To Use This Document Set

Use the documents in this order and with these roles:

1. [docs/RUST-OWNED-BOUNDARY-PROJECT-ROADMAP.md](./RUST-OWNED-BOUNDARY-PROJECT-ROADMAP.md) is the standalone project packet for a cold-start contributor.
2. This file is the start-here operating brief. It defines the target, sequence, and guardrails.
3. [docs/RUST-OWNED-EXTERNAL-BOUNDARY-ROADMAP.md](./RUST-OWNED-EXTERNAL-BOUNDARY-ROADMAP.md) is the live truth of what is and is not complete.
4. [docs/RUST-OWNED-EXECUTION-HANDBOOK.md](./RUST-OWNED-EXECUTION-HANDBOOK.md) is the supporting rulebook and review aid.
5. [docs/LIVE-CORE-GOAL-CONTRACT.md](./LIVE-CORE-GOAL-CONTRACT.md) is the continuity contract that must remain true while ownership moves.

If prose and checkbox state ever appear to disagree:

- trust verified roadmap evidence over optimistic prose
- trust tests over intention
- trust the narrower claim over the broader claim

If context gets noisy, return to this file first.

## One-Sentence Target

Build a platform where Rust is the long-running continuity and capability substrate, and Node is a supervised worker that can be restarted or replaced without losing ownership of ports, filesystem policy, SQLite continuity, network policy, generations, or last-good serving behavior.

## The Concrete End State

The intended steady state is:

- Rust binds the real ports.
- Rust owns the canonical filesystem boundary.
- Rust owns the canonical SQLite handles.
- Rust owns watch policy and dirty-path detection.
- Rust owns outbound network policy and execution.
- Rust supervises worker lifecycles.
- Node parses, compiles, evaluates, renders, and inspects when asked.
- Node cannot mutate canonical external state except through Rust-owned contracts.

This does not mean "Rust does all semantics."
It means "Rust owns the external world, Node does bounded compute."

## Start Here

Before touching code, a new agent should do this in order:

1. Read this file end to end.
2. Read [docs/RUST-OWNED-EXTERNAL-BOUNDARY-ROADMAP.md](./RUST-OWNED-EXTERNAL-BOUNDARY-ROADMAP.md) for the live checkbox state.
3. Read [docs/LIVE-CORE-GOAL-CONTRACT.md](./LIVE-CORE-GOAL-CONTRACT.md) for the continuity constraints.
4. Run `git status --short` and note unrelated dirty files.
5. Read [test/rust-owned-external-boundary-roadmap.test.js](/C:/Users/aaron/Documents/world/test/rust-owned-external-boundary-roadmap.test.js) so the current exception set is visible before any code change.
6. Pick one exact external ownership seam to move.
7. State what is explicitly out of scope for the tranche.

If those steps are skipped, the chance of architectural drift is high.

## Agent Startup Protocol

Before editing, a new agent should be able to answer all of these clearly:

1. Which external resource is moving in this tranche?
2. Which real consumer path will switch now?
3. Which direct Node ownership path is being reduced or removed?
4. In which modes must the new path fail closed?
5. Which tests will prove the move is real?
6. What stays deliberately unchanged after this tranche?

If any answer is vague, the tranche is not ready.

## What Problem This Solves

The platform wants all of these at once:

- 24/7 uptime
- live editing
- preview and published flows
- process supervision
- rollback and last-good safety
- multiple parallel authors
- rich diagnostics and provenance

Those goals become unstable when one long-running Node process also owns:

- host listeners
- filesystem reads and writes
- filesystem watch policy
- SQLite connections
- outbound network effects
- process lifecycle

The risk is not JavaScript by itself.
The risk is ambient ownership.

This program exists to remove that ambient ownership.

## The Failure Mode We Are Actually Containing

This program is not trying to prove that Node will never leak memory, keep an extra handle open, or race two async paths.
It is trying to make those failures survivable.

The containment target is:

- a leaking worker does not own the real listener
- a crashing worker does not own canonical generations
- a confused worker does not directly mutate canonical disk state
- a stuck worker does not hold the only SQLite truth
- a buggy worker does not emit platform side effects without Rust mediation

If a Node failure can still directly change canonical platform behavior without going through Rust, the boundary is not yet contained.

## Program Scope

This program is about transferring ownership of external boundaries.

In scope:

- host port ownership
- canonical filesystem access and mutation
- canonical watch policy and dirty detection
- canonical SQLite ownership
- outbound network mediation
- supervision, proofs, promotions, rollback, and provenance
- an explicit worker contract between Rust and Node

Out of scope until the boundary is contained:

- rewriting the app runtime into Rust
- Wasm or AssemblyScript execution as the primary next move
- new browser tooling as the main acceptance path
- a broad plugin runtime
- collaboration or product polish that does not reduce external Node authority
- UI work that observes the old boundary without changing ownership

## End-State Contract

### Rust owns

- public ingress and host port binding
- internal control plane
- process supervision
- canonical filesystem reads, writes, stats, and watch policy
- canonical SQLite connections and transactions
- canonical outbound network policy and execution
- generation registry
- proof orchestration
- promotion, rollback, and last-good aliases
- append-only journals and provenance
- capability enforcement

### Node owns

- parsing
- lowering/compilation
- rendering
- runtime evaluation
- inspection helpers
- bounded compute requested through an explicit Rust-owned contract

### Node does not own

- public listeners
- canonical `node:sqlite`
- canonical `fsWatch.watch(...)`
- direct canonical workspace mutation
- direct canonical outbound network effects
- hidden reads that bypass Rust capability policy
- continuity state that must survive worker failure

## Boundary Ownership Matrix

Use this table when choosing work.
It answers "who should own this?" and "what does success look like?" without reopening the architecture debate.

| Boundary | End-state owner | Node role | Current shape | Real completion signal |
| --- | --- | --- | --- | --- |
| Public ingress / host ports | Rust | private worker behind Rust | mixed / transitional | public clients enter through Rust only |
| Canonical published source writes | Rust | validate/build/reload when asked | partially moved | Node no longer commits canonical published writes directly on authoritative paths |
| Preview source reads/writes | Rust | compile preview state from Rust-mediated sources | partially moved | preview reads/writes fail closed in authoritative mode and no longer use hidden local canonical reads |
| Canonical watcher / dirty detection | Rust | rebuild from explicit invalidation only | mixed / transitional | Node no longer discovers canonical file changes by itself |
| Canonical SQLite | Rust | query/compute through Rust-mediated DB surface | partially moved | canonical runtime data has no direct `node:sqlite` ownership |
| Outbound network | Rust | request typed effects only | mostly unmoved | canonical remote effects are visible and mediated through Rust |

This matrix is the practical target.
Do not start new work until the boundary being changed fits one of these rows.

## Direct Answer To The Current Architecture Question

Yes: Rust can and should own the database connections, filesystem access, and host port bindings.

That is the target.

The practical interpretation is:

- Rust binds the real app-facing ports.
- Rust opens the canonical SQLite handles.
- Rust owns canonical file reads, writes, stats, list, and watch policy.
- Node does not touch those resources directly on authoritative paths.
- Node communicates through Rust-owned APIs or an eventual worker protocol.

If Node still has another tendril into the external world, the migration is incomplete.

## Current Repo Reality

The repo is not at the target yet.
It is partway through the boundary move.

### Rust already owns meaningful slices

- `witness-core` generation registry and aliases
- proof execution control
- append-only event journal
- supervised worker lifecycle
- optional public front door
- preview filesystem capability reads and patch writes in strict mode
- published authoring transaction staging, proofing, commit, and activation on supervised paths
- verification-persistence seam when `WITNESS_CORE_URL` is configured
- SQLite capability seam for SQL provider runtimes when `WITNESS_CORE_URL` is configured

### Node still owns transitional seams

- main runtime HTTP server in [src/runtime-server.js](/C:/Users/aaron/Documents/world/src/runtime-server.js)
- canonical watcher logic in [src/app-snapshot-manager.js](/C:/Users/aaron/Documents/world/src/app-snapshot-manager.js)
- local verification-persistence compatibility behavior in [src/runtime-verification-persistence.js](/C:/Users/aaron/Documents/world/src/runtime-verification-persistence.js) when core is absent
- local SQLite fallback behavior in [plugins/sql/provider-runtime.js](/C:/Users/aaron/Documents/world/plugins/sql/provider-runtime.js) and [plugins/sqlite/provider-runtime.js](/C:/Users/aaron/Documents/world/plugins/sqlite/provider-runtime.js) when core is absent
- direct runtime boot/orchestration in [src/cli.js](/C:/Users/aaron/Documents/world/src/cli.js)

These are exceptions to remove, not examples to copy.

## Current Strategic Priority

The repo already has meaningful Rust ownership in generations, proofs, supervision, published transactions, preview capabilities, and parts of SQLite mediation.
The highest-value remaining moves are the ones that stop canonical app serving from depending on direct Node ownership.

The practical order remains:

1. finish Rust-first public ingress
2. finish removing authoritative published-write bypasses
3. remove canonical watcher ownership from Node
4. continue shrinking canonical SQLite fallback ownership
5. inventory and move canonical outbound network effects
6. formalize the worker contract only after those ownership lines are materially narrower

## The Governing Rule

If the resource is external, Rust is the authority.

Node may:

- request
- compute
- return results

Node may not:

- silently own
- silently persist
- silently publish
- silently reach around the boundary

## What Counts As Real Progress

Progress is real only when at least one direct Node ownership point becomes smaller.

That usually means one of these:

- a Node-owned canonical read/write path now goes through Rust
- a Node-owned canonical listener is removed or demoted to a private worker detail
- a Node-owned watcher path is removed and replaced with Rust-driven invalidation
- a Node-owned SQLite path is replaced with a Rust capability path
- a Node-owned outbound effect becomes a typed Rust-mediated capability

Progress is not real when:

- a new Rust API exists but no consumer uses it
- Node still performs the effect locally after a Rust pre-check
- the authoritative path still falls back to local behavior
- tests only prove the happy path and not fail-closed behavior
- the exception set gets wider

## What Success Looks Like

The boundary move is only real when all of these are true:

- public clients enter through Rust, not Node
- Node worker ports are private implementation details
- canonical filesystem mutation happens through Rust-owned capability or transaction endpoints
- canonical file watching is Rust-owned
- canonical SQLite access is Rust-owned
- canonical outbound effects are Rust-owned
- a Node worker can die without taking continuity with it
- failed candidates do not disturb last-good serving
- preview and published paths use the same external owner model
- the guardrail tests prove the exception set is shrinking, not spreading

## Required Evidence Before Marking A Stage Complete

Before checking a roadmap item off, there should be concrete evidence for all relevant claims:

1. A real consumer path uses the Rust-owned seam.
2. Authoritative mode fails closed when Rust is unavailable.
3. Last-good or stable-serving behavior still holds.
4. Restart continuity still holds where the tranche touches long-running state.
5. Rust-owned provenance exists for the effect that moved.
6. The old Node-owned path is removed, fenced, or explicitly frozen as a named exception.
7. Tests or guardrails would fail if the old bypass quietly came back.

Without that evidence, leave the checkbox open.

## What Not To Do

Do not:

- add new direct `node:fs` usage to canonical runtime-serving paths
- add new direct `node:sqlite` usage for canonical platform state
- add new public `node:http`, `https`, `net`, or WebSocket listeners in Node runtime code
- add new canonical watchers in Node
- add new "temporary" fallback-to-local behavior in a path declared Rust-owned
- split preview and published into different effect models
- use browser polish as a substitute for fixture-first proof
- widen the exception set in [test/rust-owned-external-boundary-roadmap.test.js](/C:/Users/aaron/Documents/world/test/rust-owned-external-boundary-roadmap.test.js)
- start Wasm, AssemblyScript, or compiler-rewrite work before boundary containment is real
- move semantics into Rust before Rust owns the external boundary
- hide direct external access behind a helper and call it architecture

Do not also:

- try to move ports, filesystem, SQLite, and outbound network all in one tranche
- treat "Node calls Rust first, then still does the real effect" as success
- add a new fallback in order to keep a test or demo green
- weaken a guardrail test just to land boundary code faster
- add a second authoritative path for preview because the published path feels harder
- use browser acceptance as the main proof for ownership transfer

## What To Optimize For

Optimize for:

- containment
- continuity
- explicit ownership
- fail-closed behavior
- last-good safety
- replayable provenance
- deterministic fixture-first acceptance

Do not optimize for:

- UI completeness
- pretty abstractions with no routed consumer
- speculative future runtimes
- "one day" plugin systems
- extra configuration without ownership transfer

## If Context Starts To Drift

When a thread becomes noisy, broad, or speculative, do this instead of improvising:

1. Re-read this file and the roadmap.
2. Re-state the exact ownership point in one sentence.
3. Drop side quests that do not reduce direct Node authority.
4. Reduce the tranche to one consumer path and one bypass path.
5. Prefer fixture-first proof over browser proof.
6. Prefer a visible failure over a convenience fallback.
7. Update docs only to reflect verified reality, not intended direction.

This is the recovery loop that keeps the work from turning into architecture soup.

## Working Style For New Agents

Every agent working in this area should follow this sequence:

1. Read this document.
2. Read [docs/RUST-OWNED-EXTERNAL-BOUNDARY-ROADMAP.md](./RUST-OWNED-EXTERNAL-BOUNDARY-ROADMAP.md).
3. Read [docs/LIVE-CORE-GOAL-CONTRACT.md](./LIVE-CORE-GOAL-CONTRACT.md).
4. Check `git status`.
5. Identify one exact ownership point to move.
6. Name the real consumer path that will switch to the new boundary.
7. Name what will deliberately remain unchanged in this tranche.
8. Implement one vertical slice.
9. Add or update tests that prove the ownership change.
10. Update the roadmap checkboxes only if the tests actually prove the claim.

If this order is skipped, drift is likely.

## First Tranche Heuristic

If a new agent does not know where to start, use this filter:

1. Choose the smallest change that removes one direct Node external ownership point.
2. Prefer a change that already has a real consumer path in the repo today.
3. Prefer a change that can be proven with fixture-first tests and control-plane calls.
4. Prefer a change that shrinks the exception set in the guardrail tests.
5. Avoid any change whose main output is a new abstraction, UI panel, or broad future-facing framework.

This usually means:

- remove a fallback
- move one canonical read/write path
- move one watcher responsibility
- move one SQLite call path

It usually does not mean:

- build a new editor
- build Sourcery affordances
- design a plugin model
- investigate Wasm
- rewrite the DSL runtime

## The Only Acceptable Shape Of A Tranche

A good tranche does all of these:

- moves one external boundary materially
- routes one real consumer through it
- fails closed when Rust ownership is declared authoritative
- preserves last-good behavior
- reduces ambient Node authority
- adds evidence in tests
- leaves the repo narrower, not wider

A weak tranche usually looks like one of these:

- new abstraction, no real consumer
- new endpoint, Node still does the real effect locally
- Rust pre-check, Node still owns commit and activation
- more config, no ownership transfer
- hidden fallback that bypasses the new boundary when things get hard

## Tranche Exit Criteria

Do not call a tranche done until all of these are true:

1. One real consumer now uses the Rust-owned path.
2. The authoritative mode fails closed when Rust is unavailable.
3. Last-good behavior still holds.
4. Restart continuity still holds.
5. Provenance for the moved effect is visible in Rust-controlled events, records, or journal entries.
6. The old Node-owned path is removed, isolated, or explicitly frozen as a named transitional exception.
7. The roadmap checkbox state was updated to match verified evidence.

If one of these is missing, the tranche is not done.

## Ordered Delivery Plan

This order is deliberate.
Do not reorder casually.

### Phase 1. Rust Public Ingress

Goal:

- Rust becomes the only supported public listener.

Why it matters:

- until ingress is Rust-owned, the runtime boundary is still blurry

Acceptance:

- public clients connect to Rust only
- Node ports become private implementation details
- scripts and product docs stop presenting direct Node port access as the supported path

Do not:

- leave mixed public ingress as a permanent "temporary" state
- treat an optional Rust front door as equivalent to authoritative ingress ownership

### Phase 2. Rust-Owned Published Filesystem Path

Goal:

- published authoring becomes Rust-mediated end to end

Why it matters:

- published writes are the highest-risk external mutation path

Acceptance:

- published authoring requests enter Rust
- Rust stages the change
- Rust invokes separate validation/proof workers
- Rust commits canonical files
- Rust controls activation
- failed build or proof does not mutate canonical files

Do not:

- let the serving worker discover published changes through ambient file watching
- allow a local Node published-write fallback where the path claims Rust ownership

### Phase 3. Rust-Owned Preview Filesystem Path

Goal:

- preview/debug editing uses the same external ownership model as published editing

Why it matters:

- preview is lower-risk than published, but it still touches the same source boundary

Acceptance:

- preview source reads and writes go through Rust capability surfaces in strict mode
- preview invalidation/rebuild uses Rust-owned source access, not hidden local reads
- preview failure keeps last good preview output
- preview does not silently fall back to local canonical access

Do not:

- let preview become a policy loophole
- preserve "in-memory only" side effects when the configured mode says Rust owns the path

### Phase 4. Rust-Owned Canonical Watchers

Goal:

- Rust becomes the only owner of canonical dirty-path detection and watcher policy

Why it matters:

- if the worker still discovers canonical changes for itself, Rust does not really own continuity

Acceptance:

- canonical watchers are removed from the authoritative Node serving path
- Rust detects changes and drives invalidation
- Node receives explicit reload or invalidation instructions

Do not:

- keep Node canonical watchers alive "just in case"
- let transaction commits and background watch pipelines duplicate generation lifecycles

### Phase 5. Rust-Owned SQLite

Goal:

- canonical DB access moves behind Rust-owned capability surfaces

Why it matters:

- SQLite handles are continuity-critical state ownership, not mere implementation details

Acceptance:

- canonical runtime code does not import `node:sqlite`
- verification persistence is Rust-mediated in authoritative mode
- SQL provider runtimes use Rust-owned SQLite capability paths in authoritative mode
- failures are structured and fail closed
- DB effects are journaled with provenance

Do not:

- claim success while canonical Node DB fallbacks still remain authoritative
- leave provider runtimes with silent direct-SQLite escape hatches

### Phase 6. Rust-Owned Outbound Network

Goal:

- all canonical remote effects become typed Rust-mediated capabilities

Why it matters:

- outbound effects are part of the platform boundary just as much as disk and DB

Acceptance:

- direct Node outbound paths are inventoried
- canonical remote effects move behind Rust policy and execution
- denied effects fail visibly

Do not:

- hide outbound calls behind utility modules
- keep "only for this integration" direct fetch exceptions on canonical paths

### Phase 7. Stable Worker Contract

Goal:

- Node stops acting like an ambient host and becomes a bounded worker behind Rust

Why it matters:

- until the worker contract is explicit, Node will keep acquiring accidental authority

Acceptance:

- Rust is the substrate and control plane
- Node communicates through an explicit owned channel
- compute requests are bounded and attributable
- worker restarts do not lose continuity

Do not:

- treat ad hoc HTTP control paths as the long-term worker protocol
- start with an abstract protocol that no real consumer uses

### Phase 8. Final Audit

Goal:

- prove the boundary is actually contained

Acceptance:

- Node no longer binds public listeners
- Node no longer owns canonical watchers
- Node no longer mutates canonical files except through Rust-owned capabilities
- Node no longer owns canonical SQLite
- Node no longer performs canonical outbound effects directly
- Rust is the sole owner of external boundary policy

## What Not To Do Under Pressure

When a test is red, a demo is blocked, or a path is awkward, do not:

- add a new local fallback on a path that claims Rust ownership
- keep Node as the real committer because the Rust transaction path feels slower
- leave a worker-visible public port in place "for now"
- use Sourcery or browser polish to mask missing ownership transfer
- move semantics into Rust because the boundary work feels tedious
- split canonical and preview ownership models for convenience
- weaken a guardrail because it blocks a shortcut
- introduce a second authoritative state store in Node and Rust

The hard part here is not getting code to run once.
It is ensuring the code that runs cannot quietly reclaim ambient authority.

## Repository Hotspots

These files matter most during the migration:

- [substrate/witness-core/src/lib.rs](/C:/Users/aaron/Documents/world/substrate/witness-core/src/lib.rs)
- [src/witness-core-bridge.js](/C:/Users/aaron/Documents/world/src/witness-core-bridge.js)
- [src/runtime-server.js](/C:/Users/aaron/Documents/world/src/runtime-server.js)
- [src/app-snapshot-manager.js](/C:/Users/aaron/Documents/world/src/app-snapshot-manager.js)
- [src/runtime-verification-persistence.js](/C:/Users/aaron/Documents/world/src/runtime-verification-persistence.js)
- [plugins/sql/provider-runtime.js](/C:/Users/aaron/Documents/world/plugins/sql/provider-runtime.js)
- [plugins/sqlite/provider-runtime.js](/C:/Users/aaron/Documents/world/plugins/sqlite/provider-runtime.js)
- [test/rust-owned-external-boundary-roadmap.test.js](/C:/Users/aaron/Documents/world/test/rust-owned-external-boundary-roadmap.test.js)
- [test/witness-core-live-continuity.test.js](/C:/Users/aaron/Documents/world/test/witness-core-live-continuity.test.js)

## Acceptance Strategy

Use fixture-first, non-browser acceptance for boundary work.

Preferred proof surfaces:

- Rust unit and integration tests
- Node integration tests against minimal deterministic fixtures
- direct HTTP control-plane calls
- journal inspection
- filesystem inspection where appropriate

De-prioritize as primary acceptance:

- Sourcery
- Playwright
- browser-only validation
- manual page inspection

Those are useful later, but they are not the main proof surface for ownership transfer.

## Tranche Scoring Heuristic

If there are multiple possible next tasks, prefer the one that scores highest on this filter:

1. Removes a real direct Node ownership point.
2. Switches a real existing consumer.
3. Fails closed cleanly in authoritative mode.
4. Can be proven with deterministic fixtures and control-plane calls.
5. Shrinks the guardrail exception set.
6. Does not require broad semantic rewrites.

If a proposed task mainly improves tooling, observability, or polish while leaving authority unchanged, it is probably not the next tranche.

## Review Red Flags

Stop and re-evaluate if a proposed change does any of these:

- adds a Rust endpoint but leaves the real effect in Node
- adds a Rust-owned path but does not switch a consumer to it
- claims fail-closed behavior but catches and falls back locally
- adds state in both Rust and Node for the same canonical fact
- relies on manual browser confirmation instead of deterministic tests
- expands the allowed direct `node:fs`, `node:sqlite`, `node:http`, or watcher exception set
- improves observability while leaving ownership unchanged

These are the most common ways the program wanders.

## Standard Tranche Template

Every boundary tranche should answer these questions before code is written:

### Ownership point

- Which exact external resource is moving?

Examples:

- public ingress
- canonical published write
- preview overlay read/write
- watcher ownership
- canonical SQLite query path
- canonical outbound HTTP effect

### Real consumer

- Which real user path or runtime path will switch to it now?

### Authoritative mode

- In which modes must this now fail closed instead of falling back locally?

### Old bypass

- What direct Node path is being reduced, frozen, or removed?

### Proof

- Which tests will show that the move is real?

### Non-goals

- What are we explicitly not solving in this slice?

## Decision Rules

When making tradeoffs, use these rules:

### If the choice is "move boundary" vs "improve UI around old boundary"

Move the boundary.

### If the choice is "one real vertical slice" vs "broad reusable framework"

Choose the real vertical slice.

### If the choice is "temporary fallback" vs "visible failure"

Choose visible failure on authoritative paths.

### If the choice is "new semantics in Rust" vs "external ownership in Rust"

Move external ownership first.

### If the choice is "more convenience for Node" vs "stricter authority lines"

Choose stricter authority lines.

## Specific Anti-Patterns To Reject In Review

Reject changes that:

- introduce a new direct import of `node:sqlite` on canonical runtime paths
- introduce a new direct Node public listener
- add new canonical `fsWatch.watch(...)`
- keep Node direct file commit after Rust validation
- route preview through Rust but still read canonical files locally behind the scenes
- claim fail-closed behavior but silently catch-and-fallback locally
- add a second source of truth for generations, serving mode, or provenance
- add a broad API surface before one real consumer exists

## How To Keep Future Agents On Track

The repo should stay opinionated about this work.

That means:

- keep this document current
- keep the roadmap checkboxes honest
- keep guardrail tests tight
- explicitly name current exceptions
- require new tranches to shrink or justify the exception set
- prefer docs that state ownership plainly over vague flexibility language

If an agent cannot say exactly which external authority moved, the work is probably drifting.

## Recommended Working Agreement For Contributors

Any contributor touching this area should leave behind:

- the exact boundary moved
- the exact bypass path reduced or removed
- the exact tests run
- the exact roadmap items that changed and why
- the exact remaining gap after the tranche

That handoff discipline matters because this program is long-running and easy to derail with partial truths.

## When To Say No

Reject or defer work that sounds attractive but does not advance containment:

- "Let's make Sourcery smarter first."
- "Let's add a prettier live debug surface."
- "Let's add a general plugin system."
- "Let's start the Wasm or AssemblyScript execution path now."
- "Let's keep a local fallback until later because it is convenient."
- "Let's add another server port just for this tool."

Those can matter later.
They are the wrong next move if the external owner is still Node.

## Immediate Next Focus Areas

Given the current repo state, the next high-value moves are:

1. Finish Rust-owned ingress so public serving no longer depends on direct Node listeners as the supported path.
2. Remove remaining authoritative published-write fallback in Node where Rust ownership is already declared.
3. Remove canonical watcher ownership from [src/app-snapshot-manager.js](/C:/Users/aaron/Documents/world/src/app-snapshot-manager.js).
4. Continue shrinking authoritative SQLite fallback ownership in provider runtimes.
5. Inventory and move canonical outbound network effects behind typed Rust capabilities.

That order matters.
Do not jump to worker-protocol polish or runtime-semantics rewrites before those five are materially advanced.

That sequence stays aligned with the end state and avoids getting trapped in UI or runtime-rewrite detours.

## The Short Version

If a new agent remembers only six things, they should remember these:

1. Rust owns the external world.
2. Node is a worker, not the continuity substrate.
3. Move one real boundary at a time.
4. Fail closed on authoritative Rust-owned paths.
5. Prove the move with fixture-first tests and journals.
6. Do not widen the Node exception set.

## The Shortest Possible Instruction To A New Agent

Move one real external ownership seam from Node to Rust, route one real consumer through it, make authoritative mode fail closed, prove it with fixture-first tests, and do not widen the exception set.

