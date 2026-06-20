# Rust-Owned Boundary Project Roadmap

## Purpose

This is the standalone project document for the Rust-owned boundary program.

Its job is to let a new agent start cold, understand the target, pick the next correct tranche, and execute without drifting into architecture soup, UI detours, or partial ownership moves.

If an agent reads only one file before starting work on this program, it can be this one.

Primary related documents:

- [docs/RUST-OWNED-BOUNDARY-DELIVERY-GUIDE.md](./RUST-OWNED-BOUNDARY-DELIVERY-GUIDE.md)
- [docs/RUST-OWNED-EXTERNAL-BOUNDARY-ROADMAP.md](./RUST-OWNED-EXTERNAL-BOUNDARY-ROADMAP.md)
- [docs/RUST-OWNED-EXECUTION-HANDBOOK.md](./RUST-OWNED-EXECUTION-HANDBOOK.md)
- [docs/LIVE-CORE-GOAL-CONTRACT.md](./LIVE-CORE-GOAL-CONTRACT.md)
- [docs/CAPABILITIES.md](./CAPABILITIES.md)
- [substrate/README.md](../substrate/README.md)

## One-Sentence Mission

Move the platform from mixed long-running Node ownership to a model where Rust owns the external world and Node is supervised bounded compute only.

## Direct Answer

Yes: Rust should own the canonical database connections, filesystem access, and host port bindings.

That is not an optional refinement.
That is the target architecture.

The practical reading is:

- Rust owns public ingress.
- Rust owns canonical filesystem policy and mutation.
- Rust owns canonical SQLite handles and transactions.
- Rust owns watch policy and dirty detection.
- Rust owns outbound network policy and execution.
- Node computes, renders, inspects, and returns results through Rust-owned contracts.

If Node still has another direct tendril into those boundaries on authoritative paths, the work is not done.

## Settled Decisions

These decisions are already made.
New agents should not reopen them unless the user explicitly changes direction.

1. Rust is the intended owner of host ports, canonical filesystem access, canonical SQLite, canonical watch policy, and canonical outbound network policy.
2. Node is not being promoted into a safer long-running host. Node is being narrowed into a supervised worker.
3. The current program is external-boundary-first, not Wasm-first, not AssemblyScript-first, and not UI-first.
4. Sourcery, browser panels, and operator UX are consumers of the boundary, not the acceptance driver for boundary migration.
5. Preview and published flows are not allowed to drift into separate ownership models if they touch the same canonical sources.
6. A path declared Rust-owned must fail closed when Rust is unavailable. Silent local fallback is architectural regression.
7. New abstractions do not count unless they route a real consumer and reduce a real Node-owned external seam.
8. Transitional fallbacks may exist only when they are explicit, tested, frozen, and attached to a removal tranche.

## What This Program Is And Is Not

This program is:

- a containment program for long-running execution risk
- a boundary transfer program for external authority
- a continuity program for last-good serving, rollback, and supervision
- a provenance program for external effects

This program is not:

- a rewrite-everything-in-Rust initiative
- a browser tooling initiative
- a generic plugin-platform initiative
- a "maybe we should try Wasm first" investigation
- a semantics migration program ahead of boundary ownership

## The Main Danger Being Contained

The concrete risk is not "Node exists."
The concrete risk is one long-running Node process simultaneously owning too many of these:

- public ingress
- canonical disk mutation
- canonical dirty detection
- canonical database handles
- canonical outbound effects
- continuity-critical runtime lifecycle

That combination makes memory leaks, open handles, async races, and parallel AI edits dangerous in a way they do not need to be.

The target is not to prove Node can never fail.
The target is to make Node failure non-authoritative.

## Architectural Direction Already Chosen

If a new agent needs the shortest possible answer to "where are we heading?", it is this:

- Rust owns the operating substrate.
- Node runs app semantics as a worker.
- Rust can start, stop, replace, or deny Node without losing canonical control.
- External state changes happen through Rust-controlled capabilities and transactions.
- Serving runtimes should eventually have no independent tendrils into ports, files, databases, or remote systems.

In practical terms:

- host port binding moves to Rust
- canonical source reads/writes/stats/watch policy move to Rust
- canonical SQLite handles and transactions move to Rust
- canonical remote side effects move to Rust
- Node is reached through Rust-owned process, control-plane, and eventually worker-contract seams

## The Rule For Choosing Work

Choose work that reduces authority, not work that increases instrumentation.

Good questions:

- Which direct Node external ownership point gets smaller after this change?
- Which real consumer path will now cross Rust instead of touching the resource directly?
- Which fallback gets removed or fenced?
- Which test will fail if the old bypass comes back?

Bad questions:

- What new abstraction layer can we add?
- What new UI can we build to observe the same mixed boundary?
- What future runtime might be nice once the boundary is solved?
- How do we keep local fallback so every path stays "convenient"?

## What Problem This Program Solves

The project wants:

- 24/7 continuity
- live editing
- preview and published authoring
- rollback and last-good behavior
- process supervision
- multiple contributors and agents
- truthful provenance

Those goals become brittle when one long-running Node process also owns:

- public listeners
- canonical disk mutation
- canonical file watching
- canonical SQLite connections
- outbound network effects
- continuity-critical state

The program does not try to prove Node can never leak, race, or wedge.
It tries to make those failures survivable by ensuring Node is not the final owner of external state.

## What A New Agent Must Not Do

Do not:

- widen the frozen exception set for `node:fs`, `node:sqlite`, public listeners, or direct outbound fetch
- add a new local fallback to "keep things working" on a path already declared Rust-owned
- move multiple external boundaries at once unless one real consumer truly requires it
- ship a new Rust API without routing a real consumer
- count pre-checks as ownership transfer if Node still performs the effect locally
- use browser or Sourcery work as substitute proof for boundary migration
- start Wasm, AssemblyScript, or DSL-runtime rewrite work before external authority is materially narrower
- create a second "temporary" ownership model for preview because it feels easier than reusing the canonical one
- replace precise live-roadmap evidence with optimistic prose

## What A New Agent Should Do Instead

Do this sequence every time:

1. Identify one exact external boundary seam.
2. Identify one real consumer path that will switch now.
3. Identify one current Node bypass path that should disappear or become fenced.
4. State the authoritative modes where the new path must fail closed.
5. Define the proving tests before editing.
6. Make the narrowest change that moves the owner.
7. Update the live roadmap only to the level actually proven.

If the work cannot be described that way, it is probably too broad or still too abstract.

## Hard Invariants

These rules are non-negotiable:

1. Rust is the only public host listener in the final state.
2. Rust is the only owner of canonical filesystem policy and mutation.
3. Rust is the only owner of canonical SQLite handles.
4. Rust is the only owner of canonical dirty-path detection.
5. Rust is the only owner of canonical outbound network policy.
6. Node can be restarted or replaced without losing continuity ownership.
7. Preview and published flows converge on the same external owner model.
8. Authoritative Rust-owned paths fail closed, not quietly local.
9. Provenance for external effects is visible through Rust-controlled events or records.
10. New work must shrink the Node exception set, not widen it.

## Current Reality

The repository is in a mixed state.

Rust already owns meaningful slices:

- generation registry and aliases
- proof execution control
- append-only journaling
- supervised process lifecycle
- optional frontdoor/public ingress
- preview filesystem capability seams
- published authoring transaction staging, proofing, commit, and activation
- verification-persistence mediation when `WITNESS_CORE_URL` is configured
- SQLite capability seams for SQL provider runtimes when `WITNESS_CORE_URL` is configured

Node still owns transitional seams:

- main runtime HTTP serving in [src/runtime-server.js](/C:/Users/aaron/Documents/world/src/runtime-server.js)
- direct boot/orchestration in [src/cli.js](/C:/Users/aaron/Documents/world/src/cli.js)
- local no-core dirty detection in [src/runtime-server.js](/C:/Users/aaron/Documents/world/src/runtime-server.js)
- local fallback verification persistence in [src/runtime-verification-persistence.js](/C:/Users/aaron/Documents/world/src/runtime-verification-persistence.js)
- local fallback SQLite ownership in [plugins/sql/provider-runtime.js](/C:/Users/aaron/Documents/world/plugins/sql/provider-runtime.js) and [plugins/sqlite/provider-runtime.js](/C:/Users/aaron/Documents/world/plugins/sqlite/provider-runtime.js)
- remaining server-side outbound network ownership frozen by [test/rust-owned-external-boundary-roadmap.test.js](/C:/Users/aaron/Documents/world/test/rust-owned-external-boundary-roadmap.test.js)

These are removal targets, not precedents.

## Repo Map For This Program

If a new agent does not know where to look, start here:

- [substrate/witness-core/src/lib.rs](/C:/Users/aaron/Documents/world/substrate/witness-core/src/lib.rs):
  the Rust host, capability endpoints, generation registry, journaling, supervision, and transaction authority
- [src/witness-core-bridge.js](/C:/Users/aaron/Documents/world/src/witness-core-bridge.js):
  the main Node-to-Rust bridge; if a consumer is meant to cross Rust, this file is usually part of the path
- [src/runtime-server.js](/C:/Users/aaron/Documents/world/src/runtime-server.js):
  the current Node runtime host, still a major transitional owner for serving and local no-core behavior
- [src/runtime-core-handlers.js](/C:/Users/aaron/Documents/world/src/runtime-core-handlers.js):
  the runtime-side control routes and proxy surfaces for authored operations
- [src/app-snapshot-manager.js](/C:/Users/aaron/Documents/world/src/app-snapshot-manager.js):
  canonical snapshot, rebuild, dirty-path, preview, and published source logic; a recurring hotspot for ownership moves
- [src/runtime-verification-persistence.js](/C:/Users/aaron/Documents/world/src/runtime-verification-persistence.js):
  verification-persistence boundary and fallback behavior
- [plugins/sql/provider-runtime.js](/C:/Users/aaron/Documents/world/plugins/sql/provider-runtime.js) and [plugins/sqlite/provider-runtime.js](/C:/Users/aaron/Documents/world/plugins/sqlite/provider-runtime.js):
  remaining SQLite fallback seams that must either move behind Rust or be explicitly scoped as non-canonical
- [plugins/http-outbound/glue.js](/C:/Users/aaron/Documents/world/plugins/http-outbound/glue.js), [plugins/oauth/oauth-providers.js](/C:/Users/aaron/Documents/world/plugins/oauth/oauth-providers.js), and [plugins/notifications/email-transports.js](/C:/Users/aaron/Documents/world/plugins/notifications/email-transports.js):
  current outbound network consumers and capability-family anchors
- [test/rust-owned-external-boundary-roadmap.test.js](/C:/Users/aaron/Documents/world/test/rust-owned-external-boundary-roadmap.test.js):
  frozen ownership inventory and drift guardrail
- [test/support/live-core-smoke-runner.mjs](/C:/Users/aaron/Documents/world/test/support/live-core-smoke-runner.mjs) and [test/witness-core-live-continuity.test.js](/C:/Users/aaron/Documents/world/test/witness-core-live-continuity.test.js):
  fixture-first continuity acceptance path

When a proposed tranche cannot point at one or more of those files immediately, it is probably not concrete enough yet.

## How A New Agent Should Start

Before changing code:

1. Read this file fully.
2. Read [docs/RUST-OWNED-EXTERNAL-BOUNDARY-ROADMAP.md](./RUST-OWNED-EXTERNAL-BOUNDARY-ROADMAP.md) for live checkbox state.
3. Read [docs/LIVE-CORE-GOAL-CONTRACT.md](./LIVE-CORE-GOAL-CONTRACT.md) for continuity constraints.
4. Run `git status --short` and identify unrelated worktree changes.
5. Read [test/rust-owned-external-boundary-roadmap.test.js](/C:/Users/aaron/Documents/world/test/rust-owned-external-boundary-roadmap.test.js) to see the current frozen exception set.
6. Pick one exact boundary seam.
7. Name one real consumer path that will switch in this tranche.
8. Name what remains deliberately unchanged.
9. State the fail-closed behavior.
10. State the proving tests before editing.

If those steps do not fit in one short paragraph, the tranche is not yet precise enough.

## First Session Protocol

A fresh agent should spend the first session doing orientation, not broad edits.

Use this sequence:

1. Run `git status --short` and note unrelated changes that must not be disturbed.
2. Run `node --test test/rust-owned-external-boundary-roadmap.test.js` to see whether the ownership guardrail is already green before new work starts.
3. Read the exact Node consumer file and the exact Rust host file for the seam being moved.
4. Write a one-paragraph tranche brief using the cold-start template before editing.
5. Pick the smallest targeted test set that can prove the move.
6. Edit code only after the boundary seam, bypass, fail-closed mode, and proof path are explicit.

Default command discipline:

- prefer targeted `node --test ...` and `cargo test --manifest-path substrate/Cargo.toml -p witness-core ...` runs over broad suite runs
- prefer tracked fixture apps and direct HTTP or journal checks over browser flows
- do not start with Engentus or Sourcery unless the seam itself lives there
- do not update roadmap checkboxes before the proving tests pass

The first session should end with a narrower problem statement than it started with.

## Cold-Start Tranche Template

Every new tranche should be stated in this exact shape before code changes start:

1. Boundary seam:
   `filesystem published write`, `preview source read`, `sqlite transaction`, `public ingress`, `outbound email`, and so on.
2. Real consumer:
   the exact route, handler, runtime service, or provider path that will switch in this tranche.
3. Authoritative mode:
   the condition under which Rust is declared the owner, for example `WITNESS_CORE_URL` present or supervised serving mode.
4. Removed or fenced bypass:
   the exact local Node path that must no longer silently perform the effect.
5. Fail-closed contract:
   the structured error or refusal behavior when the Rust owner is unavailable.
6. Proof:
   the specific tests, guardrails, and journal evidence that will prove the move is real.
7. Deliberately unchanged:
   what remains out of scope so the tranche does not expand mid-flight.

## Definition Of Done For Any Tranche

A tranche is not done because code exists.
It is done only if all of these are true:

1. A real consumer path now uses the Rust-owned seam.
2. The old Node-owned bypass is removed, fenced, or explicitly frozen as a remaining exception.
3. Authoritative mode fails closed.
4. Continuity and last-good behavior still hold where relevant.
5. Rust-owned events, journal records, or control-plane evidence exist for the moved effect.
6. Tests would fail if the old bypass quietly returned.
7. The live roadmap wording matches the verified scope exactly.

## The Default Acceptance Strategy

For this program, the default proof style is:

1. fixture-first
2. control-plane-first
3. deterministic
4. non-browser where possible

That means:

- use tracked minimal fixtures over large product apps when proving substrate behavior
- use direct HTTP/control-plane calls, journal reads, and filesystem evidence before UI checks
- use browser/Sourcery only after the contract is already proven underneath

This is not anti-UI.
It is anti-false-signal.

## The Practical Order From Here

Given the current repo state, a new agent should assume this ordering unless the live roadmap evidence says otherwise:

1. finish Rust-first public ingress so Node ports become private implementation details
2. finish any remaining authoritative published-write bypass removals
3. finish canonical dirty-detection ownership so Node does not self-discover canonical source change
4. continue shrinking canonical SQLite fallbacks until the remaining local owners are explicit non-canonical exceptions or gone
5. move canonical server-side outbound effects behind Rust capability execution and policy
6. only then tighten the worker contract further and consider runtime-substrate evolution beyond HTTP bridges

This order is intentional.
It keeps the highest-authority boundaries moving first.

## Current Recommended Sequence From The Live State

At the current repo state, the safest priority order is:

1. Finish Stage 1 for real:
   Rust front door becomes the default supported ingress, Node runtime ports become private implementation details, and scripts or docs stop treating Node ports as the product surface.
2. Finish the remaining Stage 5 authority gap:
   remove or explicitly quarantine the last local SQLite fallback owners so canonical runtime data no longer depends on `node:sqlite`.
3. Finish the remaining Stage 6 authority gap:
   extend Rust-owned outbound execution and policy to the remaining canonical remote-effect families and secure-target cases, then remove the corresponding Node bypasses.
4. Tighten Stage 7 only after 1 through 3 materially shrink authority:
   worker contract hardening matters, but it should not become a distraction from the remaining external ownership seams.
5. Run the final audit only when the exception set is genuinely small enough to verify end to end.

How to choose among those priorities:

- pick the tranche with one real consumer, one removable bypass, and one deterministic proof path
- prefer the tranche that shrinks a canonical owner set over the tranche that adds more observability
- if two tranches look similar, pick the one that reduces ambient authority on a product-serving path first

What not to do here:

- do not mix public ingress, SQLite, and outbound-network migration into one mega-change
- do not jump to Wasm, AssemblyScript, or worker-language questions while direct external ownership still remains in Node
- do not treat a new bridge API as progress unless a real consumer now uses it

## The Questions A New Agent Should Not Reopen

Do not spend time re-litigating these unless the user explicitly asks:

- whether Rust should own ports, files, and SQLite
- whether Node should remain the long-running continuity substrate
- whether Sourcery should be the primary acceptance path for substrate work
- whether Wasm or AssemblyScript is the immediate next step
- whether a nicer abstraction with no real consumer is preferable to a narrow vertical slice

Those questions are settled for this program.

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
- silently emit canonical side effects

## Boundary Ownership Smell Test

If you are unsure whether a proposed change belongs in this program, apply this test:

- If Node still performs the canonical external effect directly, it does not belong under "done".
- If the change mainly improves observability of a mixed boundary, it is secondary work.
- If the change would still be valuable after Node were replaced with another worker runtime, it is probably on the right architectural axis.
- If the change depends on keeping a direct local fallback hidden for convenience, it is probably the wrong move.
- If the change makes the Rust-owned control plane more authoritative and the worker more replaceable, it is probably the right move.

## What Counts As Real Progress

A tranche is real only when at least one direct Node external ownership point becomes smaller.

That usually means one of these:

- a canonical Node file read or write path now goes through Rust
- a canonical Node listener is removed or demoted behind Rust
- a canonical Node watcher path is removed
- a canonical Node SQLite path is replaced by a Rust capability
- a canonical outbound effect becomes Rust-mediated

This does not count as progress:

- a new Rust endpoint with no real consumer
- Node still doing the effect after Rust pre-check
- a hidden local fallback on a path declared Rust-owned
- a doc claim without tests and guardrails
- moving complexity without reducing authority

## Program Strategy

The correct strategy is external-boundary-first, not semantics-first.

Order matters:

1. move the owner
2. route a real consumer
3. preserve continuity and last-good behavior
4. fail closed where Rust is authoritative
5. remove or freeze the old bypass
6. prove it with deterministic tests

Do not reverse this by starting with:

- Wasm
- AssemblyScript
- runtime rewrites
- UI surfaces
- plugin frameworks
- browser-led validation

Those may matter later.
They are not the current blocker.

## Review Checklist For Future Contributors

Before landing a change in this area, ask:

1. Did a real Node external ownership point get smaller?
2. Is the consumer path real, not hypothetical?
3. Does the authoritative path fail closed?
4. Is the old bypass gone or explicitly frozen?
5. Did tests prove the unhappy path, not only the happy path?
6. Did the docs get narrower and more truthful, not broader and more aspirational?
7. Would a new agent reading the roadmap understand exactly what remains?

If the answer to any of those is "no", the tranche is not ready to call complete.

## Hard Stop Conditions

Pause and narrow the tranche again if any of these become true:

- the change needs a new direct Node owner for ports, canonical filesystem access, canonical SQLite, or canonical outbound network
- the only way to keep the path working is to add a hidden local fallback on an authoritative Rust-owned path
- the proof depends on a browser flow even though the seam can be tested with a fixture, HTTP call, journal read, or direct capability invocation
- the tranche no longer has one clear removed or fenced bypass
- the tranche now spans multiple external boundaries that could have been moved independently
- the roadmap wording you want to write is broader than what the tests actually prove
- the work starts creating a second architecture track for preview, debug, or operator-only paths instead of reusing the same boundary model

When any of those happen, stop, restate the tranche in one paragraph, and cut scope before continuing.

## Minimum Evidence Bundle

Every completed tranche should leave behind the same evidence bundle:

- one explicit statement of the boundary seam moved
- one explicit statement of the real consumer path now crossing Rust
- one explicit statement of the bypass removed, fenced, or frozen
- targeted automated tests with exact commands that were run
- fail-closed proof, not only happy-path proof
- Rust-side evidence where relevant:
  journal events, control-plane responses, generation state, capability records, or supervision state
- guardrail updates when the allowed owner set changes
- roadmap checkbox updates only for what was actually proven
- a short note naming the next smallest tranche that should follow

## Program Tranches

### Tranche 0. Guardrails And Truth

Goal:

- freeze the current exception set and stop architectural drift

Must achieve:

- explicit docs naming known Node owners
- source-level guardrails freezing exceptions
- honest live roadmap state

Do:

- add guardrails before broadening a seam
- record exceptions precisely

Do not:

- normalize undocumented exceptions
- update docs aspirationally

Proof:

- guardrail tests fail when new direct ownership spreads

### Tranche 1. Rust Public Ingress

Goal:

- Rust becomes the only supported public host listener

Why now:

- until ingress is owned by Rust, the runtime boundary is still soft

Must achieve:

- public traffic enters Rust first
- Node runtime ports become private details
- supported scripts and product docs stop teaching direct Node ingress

Do:

- preserve worker restart continuity behind the same public port
- keep cutover and supervision Rust-owned

Do not:

- keep mixed public ingress as a permanent compromise
- add fresh public Node listeners for convenience

Proof:

- public serving works through Rust
- worker restarts do not move the public endpoint

### Tranche 2. Rust-Owned Published Filesystem Path

Goal:

- published authoring becomes Rust-owned end to end

Why now:

- published writes are the highest-risk external mutation seam

Must achieve:

- request intake in Rust
- baseline validation in Rust
- staged validation in isolated worker process
- canonical commit in Rust-controlled transaction flow
- activation only after success

Do:

- keep canonical files unchanged on compile/proof failure
- keep serving activation explicit

Do not:

- allow Node to keep canonical published-write authority on authoritative paths
- let the serving worker discover and self-activate ambient changes

Proof:

- published authoring path fails closed when Rust is unavailable
- compile/proof failure preserves canonical files and last-good serving

### Tranche 3. Rust-Owned Preview Filesystem Path

Goal:

- preview sessions use the same external owner model as published authoring

Why now:

- preview is lower-risk but still exercises the same canonical source boundary

Must achieve:

- preview source reads through Rust
- preview overlay writes through Rust
- preview rebuild path uses Rust-backed source access in authoritative mode
- last-good preview remains served on failure

Do:

- preserve session isolation
- journal preview-related external effects

Do not:

- keep preview as a loophole around the main boundary
- let preview silently fall back to hidden canonical local reads

Proof:

- preview edits work through Rust-backed seams
- invalid preview changes fail closed and preserve last good output

### Tranche 4. Rust-Owned Canonical Watchers

Goal:

- Rust becomes the only owner of canonical dirty-path detection

Why now:

- mixed watch ownership creates race conditions and duplicate lifecycle soup

Must achieve:

- authoritative Node runtime no longer discovers canonical changes for itself
- explicit invalidation comes from Rust or runtime host control path only
- duplicate transaction/watch pipelines are suppressed

Do:

- keep no-core dev refresh separate and explicitly named
- translate Rust generation events into runtime invalidation

Do not:

- reintroduce `fsWatch.watch(...)` into canonical-serving paths
- allow both transaction commits and ambient watchers to create duplicate lifecycles

Proof:

- core-connected runtime refreshes from Rust event/input path
- guardrail blocks reintroduction of canonical watchers

### Tranche 5. Rust-Owned SQLite

Goal:

- canonical SQLite ownership moves fully behind Rust

Why now:

- DB handles are continuity-critical authority, not an implementation detail

Must achieve:

- canonical runtime code no longer owns `node:sqlite`
- verification persistence is Rust-mediated in authoritative mode
- SQL provider runtimes use Rust DB capabilities in authoritative mode
- DB effects are structured and attributable

Do:

- preserve continuity across worker restarts
- expose explicit ownership metadata while fallbacks still exist

Do not:

- leave silent local fallback on canonical authoritative paths
- spread raw SQLite ownership to new providers

Proof:

- canonical runtime path survives without Node-owned DB handles
- DB operations journal through Rust or are visibly fenced as transitional

### Tranche 6. Rust-Owned Outbound Network

Goal:

- all canonical outbound effects become typed Rust-mediated capabilities

Why now:

- remote effects are part of the same boundary as disk and DB

Must achieve:

- inventory direct outbound paths
- classify them into capability buckets
- migrate canonical effects under Rust execution or policy
- deny visibly when policy rejects the effect

Suggested capability buckets:

- control-plane loopback and local bridge calls
- runtime verification or persistence bridge calls
- remote integration effects
- browser-only or client-side fetch paths kept explicitly out of server/runtime ownership claims

Do:

- keep policy visible and typed
- keep failures structured

Do not:

- hide network access behind helper indirection
- normalize direct server-side `fetch` exceptions

Proof:

- guardrails freeze and classify remaining network owners
- migrated canonical remote effects no longer execute directly in Node

### Tranche 7. Stable Worker Contract

Goal:

- Node becomes an explicit worker engine rather than an ambient platform host

Why now:

- once major external ownership moves are in place, the worker contract can be tightened without re-litigation

Must achieve:

- explicit worker protocol for build, evaluate, render, inspect, and bounded compute
- clean distinction between canonical state access and scratch state
- deterministic restart and replacement behavior

Do:

- model a real consumer first
- keep transport replaceable but owned

Do not:

- freeze ad hoc HTTP control coupling as the permanent protocol
- design an abstract protocol with no routed consumer

Proof:

- worker can die and be replaced without losing boundary ownership or continuity

### Tranche 8. Final Audit

Goal:

- prove the target is materially reached

Must achieve:

- Node no longer binds public listeners
- Node no longer owns canonical watchers
- Node no longer mutates canonical files outside Rust-owned seams
- Node no longer owns canonical SQLite
- Node no longer performs canonical outbound effects directly
- Rust is the sole continuity substrate for the external boundary

Proof:

- guardrails collapse toward near-zero exceptions
- continuity tests still pass under restart, failure, promote, rollback, preview, and published flows

## What Not To Do

Do not:

- add new direct `node:fs` usage on canonical serving or authoring paths
- add new direct `node:sqlite` ownership for canonical state
- add new public `node:http`, `https`, `net`, or WebSocket listeners in Node runtime code
- add new canonical watchers in Node
- hide direct access in helpers and call that architecture
- keep a local fallback on a path declared Rust-owned authoritative
- split preview and published into unrelated effect models
- treat browser polish as proof of ownership transfer
- start Wasm or AssemblyScript work before boundary containment is real
- move app semantics into Rust before moving external authority into Rust
- widen the exception set in the guardrail tests just to land a tranche

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
- clever abstraction
- speculative runtime rewrites
- broad framework design
- convenience fallbacks

## Default Acceptance Path

Use fixture-first, non-browser proof unless there is a strong reason not to.

Preferred evidence:

- Rust unit and integration tests
- Node integration tests against deterministic fixtures
- direct control-plane HTTP calls
- journal inspection
- filesystem inspection where relevant
- guardrail tests that freeze exception sets

Secondary evidence:

- manual runtime smoke
- browser confirmation
- Sourcery integration

Browser-only acceptance is not enough for boundary movement.

## Required Proof Before Marking Work Complete

For any tranche item to be checked complete, all relevant claims should have evidence for:

1. one real consumer path uses the Rust-owned seam
2. authoritative mode fails closed where required
3. last-good or stable-serving behavior still holds
4. restart continuity still holds where the tranche touches long-running state
5. provenance for the moved effect exists in Rust-controlled records
6. the old Node-owned bypass is removed, fenced, or frozen as a named exception
7. tests would fail if the old bypass quietly returned

If one of those is missing, leave the item open.

## Review Filters

Reject or challenge a change if it does any of these:

- introduces a Rust endpoint but leaves the real effect in Node
- adds a new abstraction without switching a real consumer
- claims Rust ownership but quietly falls back locally
- duplicates canonical state in Rust and Node
- uses manual browser behavior as the only proof
- widens direct ownership exceptions
- improves observability while leaving authority unchanged

## Decision Rules

If choosing between:

- moving a boundary or improving UI around the old boundary: move the boundary
- one vertical slice or a broad reusable framework: choose the vertical slice
- convenience fallback or visible failure: choose visible failure on authoritative paths
- moving semantics or moving external ownership: move external ownership first
- browser proof or fixture proof: choose fixture proof first

## Standard Tranche Template

Every tranche should answer these before code is written:

1. Which exact external resource is moving?
2. Which real consumer path switches now?
3. Which direct Node bypass becomes smaller?
4. In which modes must the path fail closed?
5. Which tests prove the move is real?
6. What stays deliberately unchanged in this slice?

## Handoff Template

Every contributor should leave behind:

- stage or tranche advanced
- exact ownership seam moved
- exact bypass reduced or removed
- files changed
- tests run
- evidence for fail-closed behavior
- roadmap checkboxes changed
- remaining exceptions
- recommended next smallest tranche

## If Context Starts To Drift

Use this recovery loop:

1. re-read this file and the live roadmap
2. restate the exact ownership seam in one sentence
3. drop side quests that do not reduce Node authority
4. reduce scope to one consumer and one bypass
5. choose fixture-first proof
6. prefer visible failure over convenience fallback
7. update docs only to match verified reality

## Short Version

The path is:

1. Rust owns the external world.
2. Node becomes bounded worker compute.
3. Move one real boundary seam at a time.
4. Route one real consumer through it.
5. Fail closed where Rust is authoritative.
6. Preserve last-good and restart continuity.
7. Shrink the exception set every tranche.

## Shortest Possible Instruction To A New Agent

Move one real external ownership seam from Node to Rust, route one real consumer through it, remove or fence the old bypass, make authoritative mode fail closed, prove it with fixture-first tests and guardrails, and do not widen the exception set.
