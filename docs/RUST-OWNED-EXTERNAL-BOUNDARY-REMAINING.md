# Rust-Owned External Boundary Remaining Work

## Purpose

This is the live remaining-work document for the Rust-owned boundary effort.
It is also the compact self-contained execution brief for the still-open blockers.

Use it for:

- the still-open blockers
- the live checkboxes
- the next recommended execution order
- the minimum safety packet needed to work on one blocker without widening direct Node ownership

This file is shorter than the roadmap, but it must still be safe on its own.
A contributor should be able to read this file, pick one blocker, and avoid making the boundary worse.
The full contract still lives in [docs/RUST-OWNED-EXTERNAL-BOUNDARY-ROADMAP.md](./RUST-OWNED-EXTERNAL-BOUNDARY-ROADMAP.md).
This file must agree with it, not replace it.

Do not use this file for historical tranche narration.
If a safeguard is missing here and a blocker can no longer be worked safely from this file, restore the safeguard here or in the roadmap before continuing.

This file is not allowed to become a thin status note.
If it is short but no longer safe, it is wrong.
If a cold-start contributor could read this file, follow the checkboxes, and accidentally widen direct Node ownership, this file has regressed.

## Self-Contained Safety Packet

Do not touch boundary code from this file unless it still gives you, in this file, all of the following:

- the boundary contract
- the fail-closed rule
- the startup packet
- the tranche framing template
- the proof hierarchy
- the stop conditions
- the named live exceptions
- the review checklist
- the document-maintenance rule

This file may be shorter than the roadmap, but it is not allowed to be looser.

If a contributor cannot safely pick one blocker from this file alone, then this file is incomplete.
If a cleanup makes this file faster to skim but easier to misuse, the cleanup is a regression.
If prior conversational context is needed to avoid an obvious mistake, stop and repair the docs before coding.

Related documents:

- [docs/RUST-OWNED-EXTERNAL-BOUNDARY-ROADMAP.md](./RUST-OWNED-EXTERNAL-BOUNDARY-ROADMAP.md)
- [docs/RUST-OWNED-EXTERNAL-BOUNDARY-HISTORICAL.md](./RUST-OWNED-EXTERNAL-BOUNDARY-HISTORICAL.md)

## Boundary Contract

The target remains unchanged:

- Rust owns the external world.
- Node owns app compute only.
- Node reaches the outside world only through Rust.

Non-negotiable end-state invariants:

- Rust is the only public host listener.
- Rust is the only owner of canonical SQLite connections.
- Rust is the only owner of canonical filesystem mutation and watch policy.
- Rust is the only owner of platform-facing process supervision.
- Rust is the only owner of external capability policy.

Authoritative-mode rule:

- if a path says Rust owns it, the runtime must either use Rust or fail visibly
- it must not silently succeed by switching back to local Node ownership

Operational translation:

- a Rust seam does not count if Node still owns the same canonical effect
- a compatibility helper does not count as containment if it preserves direct Node authority
- preview, published, supervised, and debug paths must converge on one ownership model when they touch the same canonical truth
- browser behavior is supporting evidence, not ownership proof

## Unsafe Readings To Reject Immediately

Reject these interpretations on sight:

- "The checklist is short, so I can fill in the missing policy from judgment."
- "A Rust pre-check counts even if Node still performs the real external effect."
- "A local fallback is acceptable because it only helps development."
- "A helper or adapter means ownership moved even if the same direct Node capability remains."
- "UI success is enough proof that the boundary moved."
- "A named exception can be copied into a nearby path for convenience."
- "The docs can get thinner now that the team already knows the plan."

If a tranche depends on one of those readings, stop and re-scope before editing code.

## Non-Delegable Safeguards

The following protections must stay readable in this file, not just in linked documents:

- the boundary contract
- the authoritative fail-closed rule
- the startup packet for new contributors
- the tranche framing template
- the proof hierarchy
- the stop conditions
- the named open exceptions
- the review checklist
- the document-maintenance rule that forbids unsafe simplification

If an edit removes any of those from this file, restore them before doing other work.

## Minimum Safe Packet

Before acting on any blocker below:

1. Read this file end to end.
2. Read `git status --short` and note unrelated dirt.
3. Read `test/rust-owned-external-boundary-roadmap.test.js`.
4. Name the exact external resource being moved: `port`, `filesystem`, `SQLite`, `watch policy`, or `outbound effect`.
5. Name the exact direct Node ownership path being removed, fenced, or demoted.
6. Name the authoritative mode that must fail closed after the change.
7. Name the fixture-first or control-plane proof that will demonstrate the move is real.
8. Name what is explicitly out of scope.

If those answers are vague, stop before editing code.

Hard stop:

- if you cannot fill the tranche frame below before touching code, do not touch code
- if you need oral context to fill it, fix the docs first
- if the blocker seems smaller than the proof required, keep the proof and shrink the implementation instead

Required tranche frame:

1. `Boundary:` which external resource is moving
2. `Direct Node owner:` which concrete file or runtime path is being reduced
3. `Authoritative mode:` where the path must fail closed
4. `Proof:` which fixture-first or control-plane evidence will prove it
5. `Guardrail:` which tests must stay the same or get tighter
6. `Out of scope:` what this tranche is deliberately not solving

If a contributor cannot fill those six lines before coding, they are not ready to act on the item safely.

Proof hierarchy:

1. guardrail and ownership tests
2. fixture-first continuity / control-plane tests
3. journal and capability evidence
4. runtime/UI consumers such as Sourcery

Cold-start prohibition:

- do not start from the historical archive
- do not start from code alone
- do not start from a half-remembered earlier tranche
- do not start from browser behavior first

The safe minimal starting packet is:

1. this file
2. [docs/RUST-OWNED-EXTERNAL-BOUNDARY-ROADMAP.md](./RUST-OWNED-EXTERNAL-BOUNDARY-ROADMAP.md)
3. `git status --short`
4. `test/rust-owned-external-boundary-roadmap.test.js`

## Misuse Resistance Rules

Treat this file as unsafe and repair it first if any of these become true:

- the checkboxes can be acted on without naming the exact direct Node owner being reduced
- the file stops telling you when to fail closed
- the file stops naming the currently tolerated exceptions
- the file becomes a list of tasks without telling you what not to do
- the file becomes dependent on memory of earlier tranches

Shorter is not safer here.
The blocker brief must remain strict enough to prevent a well-meaning contributor from widening direct Node ownership.

## What Not To Do

Do not:

- add a new direct Node owner for host ports, canonical filesystem, canonical SQLite, watch policy, or authoritative outbound effects
- keep a hidden local fallback in an authoritative Rust-owned mode
- count a new Rust seam as progress if the old Node side path still exists
- use browser behavior as the main proof when a deterministic fixture/control-plane proof exists
- weaken a guardrail test instead of shrinking the actual owner set
- add a second ownership model for preview, published, and supervised flows touching the same canonical source
- treat a shorter doc as permission to improvise

## Stop Conditions

Stop and re-scope if the change requires any of these:

- a new direct Node owner for host ports, canonical filesystem, canonical SQLite, watch policy, or canonical outbound effects
- a hidden local fallback to keep an authoritative Rust-owned path convenient
- browser-only proof when a deterministic fixture/control-plane proof exists
- a second ownership model for preview, published, or supervised flows touching the same canonical source
- weakening a guardrail test instead of shrinking the actual owner set

Also stop if:

- the main argument is convenience rather than ownership reduction
- the only proof available is manual testing even though the path has a controllable fixture surface
- the roadmap can no longer be used safely without opening multiple other documents

Stop condition for docs:

- if a contributor would need oral context or supporting-doc archaeology to use this file safely, fix the docs before continuing
- if a checkbox appears easier to flip than to prove, the proof standard is too weak
- if the remaining-work brief becomes less strict than the roadmap, follow the stricter reading and repair the brief

## Named Open Exceptions Right Now

These are the only live exceptions this file currently recognizes:

- [src/runtime-utility-listener.js](/C:/Users/aaron/Documents/world/src/runtime-utility-listener.js) still owns the standalone loopback utility listener
- the non-SQLite `db.sql` live path still has weaker evidence than the SQLite and filesystem boundaries
- the guardrail tests do not yet freeze the final zero-direct-ownership end state

Nothing else should be treated as an open-ended excuse to add more direct Node authority.
Named exceptions are not precedent.
They are debt with identifiers.
Do not clone one of them into a neighboring code path.

## Done Enough To Stop Re-Arguing

These are not the open debates anymore:

- [x] Rust-frontdoored public ingress is the supported app-facing path.
- [x] Published authoring goes through a Rust-owned transaction path.
- [x] Preview sessions use Rust-owned source capabilities in core-connected mode.
- [x] Canonical watcher ownership has been removed from Node runtime code.
- [x] Canonical SQLite ownership has moved behind witness-core capabilities.
- [x] Shared witness-core bridge and supervised IPC transport exist.
- [x] The old standalone witness-core HTTP compatibility transport has been removed from product `src/`; bridge/status-store HTTP-shaped coverage now lives only in a test-side compatibility adapter.
- [x] Core-connected runtime plugin loading no longer depends on the old workspace-local import escape hatch for transitive first-party plugin/source graphs.
- [x] Direct `node:fs` ownership has been removed from `src/app-project.js`, `src/runtime-plugin-utils.js`, and `src/runtime-server.js`; the local-only fallback is now an explicit demoted utility at `src/runtime-local-fs.js`.
- [x] Direct `node:fs` ownership has been removed from `src/dsl.js`, `src/desire/rvm.js`, and `src/desire/wtoml.js`; witness-app and Desire file compilation now use the explicit local-fallback seam instead of importing filesystem authority directly.
- [x] Direct `node:fs` ownership has been removed from `src/app-snapshot-manager.js`; canonical snapshot and preview rebuild logic now use the explicit local-fallback seam instead of importing filesystem authority directly.
- [x] The final canonical-source `node:fs` audit is closed: direct product/runtime `src/` owners are gone, and the remaining `node:fs` imports are utility/operator-only plus the explicit `runtime-local-fs` fallback seam.
- [x] The checked-in supervised/frontdoor control plane now uses the Rust-owned control socket for readiness, health polling, supervision, and reload; `control_url`, `health_url`, and `reload_url` remain compatibility fields, not checked-in dependencies.
- [x] Transport-only published authoring no longer deadlocks when a Rust-owned transaction re-enters the worker control socket for activation reload.
- [x] Worker-control `runtime.app_http.request` now preserves route-level non-2xx responses, so authored conflicts and similar HTTP rejections no longer collapse into `runtime unavailable`.
- [x] Duplicate published generations are now suppressed across both watcher replay and retried published-authoring requests when the staged content hash and source set are unchanged.
- [x] Fixture-first continuity proof is green again; `test/witness-core-live-continuity.test.js` now passes continuity, preview, published-authoring, supervised, supervised-health, frontdoor, and soak in one full suite run.

## Still Remaining

### 1. Reduce The Remaining Node HTTP Utility Exception

- [ ] Remove the remaining standalone Node HTTP utility listener so Node no longer owns `node:http` or `server.listen(...)` anywhere on authoritative product paths.
- [x] Remove direct `node:http` / `server.listen(...)` ownership from [src/runtime-server.js](../src/runtime-server.js) by extracting the standalone loopback listener into [src/runtime-utility-listener.js](../src/runtime-utility-listener.js).
- [x] Keep worker control semantics carrier-neutral: the shared runtime-worker dispatcher exists, and Node can already answer those calls through an outbound Rust-provided control socket instead of only through inbound HTTP control routes.
- [x] Adopt the Rust-owned control socket in `witness-core` for supervised/frontdoor readiness, health polling, supervision, and reload so the checked-in control plane no longer depends on `control_url` / `health_url` / `reload_url`.
- [x] Expose carrier-neutral app request dispatch inside `runtime-server` and `runtime-worker-transport` so worker app-serving semantics are callable without coupling route execution to `http.createServer(...)`.
- [x] Keep the Rust frontdoor cutover/draining proof green by routing normal requests through the carrier-neutral worker transport while synthesizing the supported SSE routes in Rust and explicitly rejecting unsupported stream/upgrade requests.
- [x] Preserve nested published-authoring reload semantics over the worker-control socket so transport-only runtime requests survive re-entrant Rust activation calls.
- [x] Preserve non-2xx app HTTP semantics over the worker-control socket so route conflicts and validation failures remain HTTP payloads instead of transport failures.
- [x] Suppress duplicate published generations caused by watcher replay or retried published-authoring requests when the content hash and changed-source set already match the latest in-flight or settled generation.
- [x] Remove the supervised HTTP MCP listener exception by frontdooring MCP HTTP over `runtime.app_http.request` in transport-only mode with no Node MCP bind.
- [ ] Remove the remaining app-serving dependence on the standalone Node HTTP utility listener after the control plane has moved off it.

Why it still matters:

- As long as Node still binds any standalone utility listener, the platform has not fully reached the "Rust owns host sockets" target.

Done when:

- standalone/direct utility serving no longer requires Node-owned `server.listen(...)`
- supervised HTTP MCP no longer depends on a Node-owned listener
- the guardrails clearly reject reintroduction of Node listener ownership into canonical runtime modules

### 2. Prove The Non-SQLite `db.sql` Path Live

- [ ] Add stronger live integration evidence for the Rust-owned non-SQLite `db.sql` capability path, including successful witness-core journaling against real `postgres` / `mysql` targets.

Why it still matters:

- The seam exists.
- The final proof standard for this path is still weaker than the SQLite and filesystem paths.

Done when:

- there is authoritative live evidence, not just unit-level or seam-level proof
- journaling and capability ownership are demonstrated against real non-SQLite targets
- failure behavior is explicit enough that a bad DB path does not silently revert to local Node authority

### 3. Tighten Final Closure Guardrails

- [ ] Tighten the guardrail tests to freeze the final zero-direct-ownership state once the blockers above are complete.
- [ ] Close the final statement: `Node operates as supervised compute only, with Rust as the sole owner of external boundaries.`

Why it still matters:

- Final closure is not a feeling.
- It needs a smaller allowed-owner set and tests that fail immediately if the old side paths return.

Done when:

- the remaining exceptions above are gone
- the guardrails enforce the new zero-direct-ownership state
- the roadmap can honestly say Node is supervised compute only without relying on supporting-doc caveats

## Review Checklist

Before marking any blocker complete, confirm all of these are true:

1. The tranche reduced one concrete direct Node owner rather than adding an abstraction beside it.
2. The authoritative mode now fails closed instead of silently falling back local.
3. The proof is primarily fixture-first or control-plane, not browser-first.
4. The named exception list stayed the same size or shrank.
5. The guardrail tests stayed the same strength or got tighter.
6. The docs still describe the remaining risk honestly.
7. The change did not create a second ownership model for the same canonical truth.

If any answer is "no" or "not sure", the blocker is not complete.

## Documentation Maintenance Rule

The live docs must stay safe under context loss.

That means:

- do not replace operating rules with links
- do not remove warnings because they feel repetitive
- do not turn named risks into vague prose
- do not compress away the fail-closed rule, stop conditions, or review checklist
- do not make the remaining-work brief depend on tribal knowledge

If a rewrite improves readability but weakens execution safety, reject the rewrite.

## Safe Use Rule

This file is safe to use as the active blocker brief only if the contributor keeps these rules in force:

- an item being short does not make it lower risk
- a checkbox being nearby does not weaken the proof standard
- if this file and the roadmap ever feel different in strictness, follow the stricter reading and repair the docs
- if a blocker seems under-specified, fix the roadmap or this file before more implementation work
- if a checkbox feels easier to flip than to prove, the proof is not strong enough yet

## Recommended Execution Order

The recommended order from current state is:

1. replace the private Node HTTP listener
2. add live non-SQLite `db.sql` evidence
3. tighten final guardrails and close the program

## Acceptance Standard

This effort is only complete when:

- Node does not own canonical filesystem, database, host-port, or authoritative outbound side-effect boundaries
- the remaining supervised/runtime paths fail closed instead of falling back local
- the guardrail tests freeze that final state

## One-Sentence Test

If a Node worker can still independently touch the outside world in a way that changes canonical platform behavior, the target has not been reached.
