# Rust-Owned External Boundary Roadmap

## Purpose

This is the self-contained roadmap and boundary contract for the Rust-owned boundary effort.

Use it for:

- the boundary contract
- the safety rules and non-goals
- the current status snapshot
- the live checkbox state
- the small set of remaining blockers
- the execution filter that keeps new work from wandering
- the named transitional exceptions that are still tolerated

Use the linked documents for detail, not for the core safety rules.

This file is intentionally the minimum safe handoff packet.
A new agent must be able to read this file alone and avoid making the boundary worse.
If a safeguard exists only in another document, this file is incomplete.
If a shorter rewrite makes this file easier to skim but easier to mis-execute, the rewrite is wrong.

This is not a summary.
This is the execution contract.
If a future edit turns this into a status note, that edit is a regression even if the prose looks cleaner.

## Safety Packet At A Glance

Do not touch boundary code until this file still gives you all of the following in one place:

- the target boundary contract
- the fail-closed rule for authoritative modes
- the startup protocol for cold-start contributors
- the tranche statement format
- the proof hierarchy
- the named live exceptions
- the stop conditions
- the "what not to do" rules
- the document-maintenance rule that forbids stripping safeguards for readability

If any one of those becomes vague, link-only, or implied, stop and repair this file before implementing code.

Minimum misuse-resistance standard:

- a new agent must be able to read this file alone and avoid making the boundary worse
- a reviewer must be able to reject unsafe work from this file alone
- the file must remain safe even when prior conversational context is missing, wrong, or stale

## Self-Contained Handoff Packet

This file must be enough to keep a cold-start contributor from making the boundary worse.

That means a new contributor must be able to get all of this from this file alone:

- what the target boundary is
- what counts as real progress
- what does not count as progress
- what must fail closed
- what exceptions still exist
- what proof hierarchy is mandatory
- when to stop instead of improvising
- how to describe a tranche without hiding risk

This file must never require a reader to reconstruct safety from:

- oral context
- old PR discussion
- "obvious" architectural intent
- a supporting doc that may or may not be opened

If a safeguard only exists somewhere else, then this file is incomplete.
If a rewrite makes this file easier to skim but easier to misuse, that rewrite is wrong.

Related documents:

- [docs/RUST-OWNED-EXTERNAL-BOUNDARY-REMAINING.md](./RUST-OWNED-EXTERNAL-BOUNDARY-REMAINING.md)
- [docs/RUST-OWNED-EXTERNAL-BOUNDARY-HISTORICAL.md](./RUST-OWNED-EXTERNAL-BOUNDARY-HISTORICAL.md)
- [docs/RUST-OWNED-BOUNDARY-PROJECT-ROADMAP.md](./RUST-OWNED-BOUNDARY-PROJECT-ROADMAP.md)
- [docs/RUST-OWNED-BOUNDARY-DELIVERY-GUIDE.md](./RUST-OWNED-BOUNDARY-DELIVERY-GUIDE.md)
- [docs/RUST-OWNED-EXECUTION-HANDBOOK.md](./RUST-OWNED-EXECUTION-HANDBOOK.md)

## Document Roles

Use the document set like this:

- this file is the self-contained operating contract and execution filter
- [docs/RUST-OWNED-EXTERNAL-BOUNDARY-REMAINING.md](./RUST-OWNED-EXTERNAL-BOUNDARY-REMAINING.md) is the live backlog, checkbox surface, and compact safe execution brief for the current blockers
- [docs/RUST-OWNED-EXTERNAL-BOUNDARY-HISTORICAL.md](./RUST-OWNED-EXTERNAL-BOUNDARY-HISTORICAL.md) is evidence and older tranche detail
- [docs/RUST-OWNED-BOUNDARY-DELIVERY-GUIDE.md](./RUST-OWNED-BOUNDARY-DELIVERY-GUIDE.md) and [docs/RUST-OWNED-EXECUTION-HANDBOOK.md](./RUST-OWNED-EXECUTION-HANDBOOK.md) are supporting expansion packs, not substitutes for this file

Rules:

- do not treat the remaining-work file as permission to ignore the contract in this file
- the remaining-work file must stay safe enough that a contributor can execute one blocker from it without widening direct Node ownership
- do not move a safeguard out of this file unless the safeguard is duplicated here in shorter form
- if the docs disagree, trust tests first, then this file, then the narrower live claim
- do not compress this file by replacing operating rules with links
- do not remove a warning, stop condition, or fail-closed rule unless the same protection is restored here in equivalent strength

## Unsafe Readings To Reject Immediately

Reject these interpretations on sight:

- "Rust has a seam now, so the old Node owner can stay for convenience."
- "The remaining-work file is short, so it does not need its own safety packet."
- "A browser flow working is good enough proof that ownership moved."
- "A local fallback is fine because it only helps development."
- "A helper module counts as containment even if it still owns the same external effect."
- "A named compatibility seam can be copied into another path."
- "A checkbox can move first and the proof can catch up later."

If a contributor is reasoning from one of those ideas, stop and re-anchor on this roadmap before touching code.

## Non-Delegable Safeguards

These safeguards must remain readable in this file at all times:

- the target boundary contract
- the authoritative-mode fail-closed rule
- the startup protocol for new contributors
- the tranche statement format
- the proof hierarchy
- the named transitional exceptions
- the stop conditions
- the review checklist
- the documentation maintenance rule that prevents unsafe simplification

If any of those become link-only, implied, or scattered across supporting docs, the roadmap is no longer self-contained.

Minimum safety packet rule:

- at least one explicit fail-closed rule must stay near the top of the file
- at least one explicit "what not to do" block must stay in the live roadmap
- the startup protocol must stay in the live roadmap
- the named exception list must stay in the live roadmap
- the stop conditions must stay in the live roadmap
- the proof hierarchy must stay in the live roadmap

If an edit weakens any of those, restore the packet before doing other work.

Guardrail for future doc cleanup:

- do not delete a rule just because another section sounds similar
- do not convert a hard prohibition into a softer summary sentence
- do not move a fail-closed requirement into a supporting document
- do not assume future contributors will have the same oral context as the current thread

## Cold-Start Use

This file must be enough for a cold-start contributor to work safely.

Minimum safe use:

1. Read this file end to end.
2. Read `git status --short` and note unrelated dirt.
3. Read `test/rust-owned-external-boundary-roadmap.test.js`.
4. Pick one external boundary only.
5. State the exact proof before editing code.

Optional supporting reads:

- [docs/RUST-OWNED-BOUNDARY-DELIVERY-GUIDE.md](./RUST-OWNED-BOUNDARY-DELIVERY-GUIDE.md) for longer rationale
- [docs/RUST-OWNED-EXECUTION-HANDBOOK.md](./RUST-OWNED-EXECUTION-HANDBOOK.md) for review examples
- [docs/RUST-OWNED-EXTERNAL-BOUNDARY-HISTORICAL.md](./RUST-OWNED-EXTERNAL-BOUNDARY-HISTORICAL.md) for earlier tranche evidence

If this file ever stops being sufficient for safe execution, fix this file first.

Cold-start prohibition:

- do not begin from the historical file
- do not begin from code alone
- do not begin from a partially remembered prior tranche

The safe starting packet is either:

1. this roadmap
2. `git status --short`
3. `test/rust-owned-external-boundary-roadmap.test.js`

or:

1. [docs/RUST-OWNED-EXTERNAL-BOUNDARY-REMAINING.md](./RUST-OWNED-EXTERNAL-BOUNDARY-REMAINING.md)
2. this roadmap
3. `git status --short`
4. `test/rust-owned-external-boundary-roadmap.test.js`

## Execution Premise

The work is dangerous when contributors optimize for momentum over boundary truth.
The most common failure mode is not bad code.
It is over-claiming ownership transfer while leaving the old Node side path alive.

Everything in this roadmap is written to prevent four specific mistakes:

- adding a Rust seam while Node still owns the real effect
- keeping a convenience fallback in an authoritative mode
- widening the direct-owner set to get one tranche green
- claiming success from UI behavior instead of control-plane proof

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
- Node can be killed, replaced, restarted, or upgraded without losing continuity control.

Operational interpretation:

- if a Node worker leaks, crashes, races, or wedges, Rust must still own the canonical outside-world boundary
- if a path is declared Rust-owned, the authoritative mode must fail closed rather than silently falling back local
- if preview, published, debug, or supervised paths touch the same canonical source of truth, they must converge toward one ownership model rather than drift apart

Practical translation:

- adding a Rust seam is not enough if Node still owns the old direct path
- a compatibility fallback is not harmless if it can still change canonical platform behavior
- a path is not "contained" until a Node failure can no longer directly alter canon, continuity, or externally visible truth

## Boundary Map

Use this map to keep work anchored to concrete ownership points.

| Boundary | End-state owner | Node role | What counts as real progress |
| --- | --- | --- | --- |
| Public ingress / host ports | Rust | private worker only | public clients no longer rely on Node listeners |
| Canonical published source writes | Rust | validate/build/reload when asked | Node no longer commits canonical published writes directly on authoritative paths |
| Preview source reads/writes | Rust | compile preview state from Rust-mediated sources | preview paths use the same ownership model and fail closed when that model is declared authoritative |
| Canonical watcher / dirty detection | Rust | rebuild from explicit invalidation only | Node no longer discovers canonical source changes by itself |
| Canonical SQLite | Rust | query/compute through Rust-mediated DB surfaces | canonical runtime data has no direct `node:sqlite` ownership |
| Outbound network effects | Rust | request typed effects only | direct authoritative Node effect ownership disappears |

If a proposed tranche does not clearly fit one row, it is probably too vague or too broad.

## Authoritative Modes

These rules must stay explicit because this is where unsafe fallback tends to creep back in.

- `Public ingress`: Rust is the supported app-facing listener. Node worker ports are private implementation details, never the supported product path.
- `Published authoring`: canonical writes, staged validation, proofing, and activation must be Rust-mediated on authoritative paths. If that path is unavailable, the mode fails closed instead of writing canon locally.
- `Preview`: preview may stay isolated and scratch-backed, but when preview source access is declared core-connected it must use the same Rust-owned source boundary and preserve last-good preview on failure.
- `Supervised serving`: when `WITNESS_CORE_URL` declares a core-owned path, the runtime must require the bounded Rust transport and fail startup closed if the carrier is missing.
- `SQLite`: authoritative canonical DB access goes through Rust. Local-only or no-core compatibility behavior must stay explicit, demoted, and non-canonical.
- `Outbound network`: authoritative remote effects must be attributable and mediated through Rust. Convenience direct `fetch(...)` in Node is not an acceptable end-state.

Authoritative-mode rule:

- if the path says Rust owns it, the runtime must either use Rust or fail visibly
- it must not silently succeed by switching back to local Node ownership

Corollary:

- a path is not safe merely because the Rust route exists
- it is safe only when the Node route is removed, fenced, or explicitly demoted out of authority

## Read This Before Any Code Change

Mandatory startup protocol for any agent touching this area:

1. Read this file end to end.
2. Read `git status --short` and note unrelated dirt.
3. Read `test/rust-owned-external-boundary-roadmap.test.js` before editing code.
4. Name the exact external resource being moved: `port`, `filesystem`, `SQLite`, `watch policy`, or `outbound effect`.
5. Name the exact direct Node ownership path being removed, fenced, or demoted.
6. Name the authoritative mode that must fail closed after the change.
7. Name the fixture-first or control-plane proof that will demonstrate the move is real.
8. State what is explicitly out of scope for the tranche.

If those answers are vague, the tranche is not ready.

Extra requirement:

- if the tranche does not reduce a direct Node owner, name the exact exception it tightens instead
- if it does neither, it is probably movement without progress

Minimum tranche statement format:

1. `Boundary:` name the exact external resource being moved.
2. `Direct Node owner being reduced:` name the concrete file or runtime path.
3. `Authoritative mode:` name where the path must fail closed.
4. `Proof:` name the fixture-first or control-plane evidence.
5. `Out of scope:` name what this tranche is deliberately not solving.

If a change proposal cannot fill those five lines, stop before editing code.

Required tranche addenda:

1. `Continuity impact:` say whether rollback, stable serving, preview isolation, restart recovery, or promotion semantics are touched.
2. `Guardrail impact:` say which guardrail tests must stay the same or get tighter.
3. `Named exception reduced:` say which transitional exception gets smaller, or say explicitly that none does and why the tranche is still justified.

Required anti-drift statement:

1. `What this does not permit:` name at least one tempting follow-on shortcut that remains forbidden after the tranche lands.

## Explicit Non-Goals

Do not:

- rewrite app semantics into Rust first
- move parsing, rendering, or evaluation into Rust before moving ownership boundaries
- build a second fake runtime beside the existing platform
- add hidden local fallbacks in supervised or Rust-owned modes
- replace one direct Node ownership path with many ad hoc exceptions
- let preview, published, debug, and operator flows drift into separate effect models
- treat tests, fixtures, or temporary utility code as proof that the canonical runtime boundary is solved
- use browser/Sourcery polish as the acceptance driver for a boundary move that can be proved without a browser
- introduce Wasm, AssemblyScript, or a new execution substrate as a detour around an unclosed ownership seam
- hide unresolved ownership behind wrappers that still call the same external resource locally

## Safety Rules

These are the operating safeguards for anyone touching this area.

### Boundary First

Prefer moving ownership of:

- ports
- filesystem
- SQLite
- outbound effects

before trying to rewrite semantics.

Do not block on a Rust rewrite of parsing, compilation, rendering, or evaluation.
The first job is to remove Node ownership of the external boundary.

### Fail Closed

When a path is declared Rust-owned or supervised:

- do not silently fall back to local Node ownership
- surface unavailability explicitly
- preserve last-good behavior instead of mutating canon directly

Visible failure is preferred to convenient hidden fallback on authoritative paths.

### No Hidden Side Paths

If a Node path can still independently:

- bind a host listener
- mutate canonical files
- open canonical DB handles
- perform authoritative outbound side effects

then the target has not been reached, even if a Rust path also exists.

Adding a Rust seam without removing or fencing the old Node side path is not progress.

Useful question:

- if Rust disappeared for one minute, could Node still keep mutating or serving canonical truth through another path

If the answer is yes, the side path is still live.

### Scratch Is Not Canon

Explicit `.witness-core/...` scratch outputs, worker-local artifacts, and temporary test-owned workspaces may exist during migration.

They must not become:

- canonical source truth
- hidden permission bypasses
- a substitute for removing the real direct ownership path

Explicit scratch exceptions are acceptable only when they are:

- named
- frozen by tests
- obviously non-canonical
- attached to a removal or containment story

Examples of acceptable scratch:

- `.witness-core/...` staging workspaces
- worker-local generated artifacts
- test-owned temporary workspaces

Examples of unacceptable scratch:

- a "temporary" canonical write path that bypasses Rust because the proper path is inconvenient
- a fallback cache or mirror that can become the source of truth during failure

### Preserve Continuity

Do not land a boundary move that weakens:

- rollback
- stable serving
- preview isolation
- restart recovery
- promotion semantics

The Rust core must stay alive even when a proof, preview edit, build worker, or supervised Node process fails.

### Evidence Over Intent

Do not mark a seam or tranche complete because the code "basically does it."
Completion requires:

- one real consumer routed through the new boundary
- the old direct Node path removed, fenced, or explicitly demoted
- fail-closed proof in the authoritative mode
- continuity proof where the tranche touches long-running behavior
- guardrails updated to freeze the tighter owner set

Negative evidence also counts:

- if only wrapper names changed but the old direct owner still performs the effect, the tranche is not complete
- if proof exists only for the happy path but not for unavailability or failure, the authoritative claim is too strong

Evidence hierarchy is mandatory:

1. source-level owner/guardrail tests
2. fixture-first or control-plane proof
3. journal / capability / process evidence
4. browser, operator, or Sourcery consumption proof

Lower layers cannot substitute for higher ones.
If a browser demo works while the guardrails or fail-closed tests are weak, the tranche is not done.

### Checkbox Honesty

Checkboxes are evidence claims, not morale signals.

Do not mark an item complete unless all of these are true:

- one real consumer uses the Rust-owned path
- the old direct Node owner is removed, fenced, or explicitly demoted
- the authoritative mode has a fail-closed or unavailability proof
- continuity proof exists when long-running behavior is touched
- the guardrail tests stayed honest or got tighter
- the doc now names any surviving exception plainly

Do not mark an item complete merely because:

- a proxy or wrapper was added
- one happy-path demo works
- the code "should" behave correctly
- the remaining direct owner feels temporary

### Fixture First

Prefer fixture-first, non-browser proof when the boundary can be tested through:

- HTTP control-plane calls
- journal inspection
- capability invocation
- direct process supervision checks

Browser and Sourcery validation are useful consumers later, not substitutes for ownership proof.

### One Boundary At A Time

Prefer one real ownership move over a broad refactor.
Do not mix unrelated boundary transfers in one tranche unless the consumer path truly requires it.

### No Guardrail Weakening

Do not widen the exception set in `test/rust-owned-external-boundary-roadmap.test.js` just to land a change faster.
If an exception must exist temporarily, document why it is safe, freeze it deliberately, and attach it to the remaining-work list.

Guardrail rule:

- tests should shrink the allowed-owner set over time
- if a test is relaxed, the doc must explain exactly why and when that relaxation will be removed
- "the test was too strict" is not enough unless the ownership model itself was wrong

Required burden for any relaxation:

- identify the exact new exception
- prove it is non-canonical or fail-closed
- add it to the named exception list in this file
- add or update a remaining-work item that removes it
- explain why no tighter shape was possible in the tranche

### Demoted Local Fallback Rule

Some local behavior still exists during migration.
That is tolerated only when all of the following are true:

- it is explicit and named as a compatibility or operator-local seam
- it is outside the authoritative path
- it cannot silently become canonical truth during failure
- it is frozen by tests or tracked as a live remaining exception
- it comes with a removal or containment story

If a fallback is anonymous, convenient, or able to affect canon, it is not a safe transition seam.

## Dangerous Moves

Treat these as architectural hazards, not neutral refactors:

- adding a new local `fetch(...)`, `server.listen(...)`, `node:sqlite`, `pg`, `mysql2`, `fs.readFile`, `fs.writeFile`, or `fs.watch` path in a serving or authoritative runtime flow
- introducing a second published-write path, second preview ownership model, or second supervision model because it is faster than converging the main one
- marking a boundary "done" because one consumer uses Rust while another older canonical consumer still bypasses it
- keeping a local fallback in authoritative mode because it helps development convenience
- moving logic into a new helper module that still owns the same external effect directly
- proving a boundary shift only through browser behavior when deterministic control-plane proof is available
- moving safeguards out of this file because they "also exist elsewhere"
- relying on a reviewer to remember unwritten context that the document no longer states
- rewriting the live roadmap into a minimal summary and calling the missing safety detail "historical"

If a proposed change contains one of those, assume it is moving the architecture in the wrong direction until proven otherwise.

Additional danger signs:

- turning a named exception into a reusable pattern
- moving a direct owner into a helper and calling that "contained"
- shortening docs by removing startup protocol, proof rules, or fail-closed requirements
- claiming a path is local-only while it still changes canonical runtime behavior
- using “temporary” without naming the removal owner, proof, and guardrail that will close it
- claiming a fallback is acceptable because “the browser would otherwise break”

## Named Transitional Exceptions

These exceptions still exist today and are tolerated only because they are explicit, named, and tied to removal work:

- standalone loopback utility listener in [src/runtime-utility-listener.js](/C:/Users/aaron/Documents/world/src/runtime-utility-listener.js)
- explicit local filesystem fallback seam in [src/runtime-local-fs.js](/C:/Users/aaron/Documents/world/src/runtime-local-fs.js)
- non-canonical/operator-local `node:fs` owners such as desktop/operator shells, launchers, and utility tooling
- non-SQLite `db.sql` live proof gap for real `postgres` / `mysql` targets

Rules for these exceptions:

- they are not examples to copy
- they do not justify adding parallel exceptions elsewhere
- each one must either be frozen by tests or tracked as a remaining blocker
- new work should reduce this list, not normalize it
- no exception may silently change category from demoted/local to canonical/authoritative

Explicit note:

- `runtime-local-fs` and similar demoted seams are not a license to add new local ownership
- operator-only tooling is not precedent for runtime-serving paths
- historical acceptance of a seam does not justify keeping or copying it

## Rules For New Agents

Before changing this area:

- read this file first
- read the guardrail test before editing code
- identify which remaining blocker the change advances
- name the exact direct Node ownership path being removed or tightened

When proposing a change:

- prefer one real boundary move over a broad abstraction
- include the failure mode and fail-closed behavior
- include the continuity and rollback story
- include the proof path before implementation starts
- do not count a new seam as progress if the old side path still exists
- identify whether the change reduces a named transitional exception or merely moves it
- say explicitly whether the change affects preview, published, supervised, debug, operator, or all of them

When reviewing a change:

- ask whether Node still has another path to the same external resource
- ask whether the change reduces ownership or only adds indirection
- ask whether the authoritative mode still has a hidden convenience fallback
- ask whether the proof is fixture-first where that was available
- reject new direct Node ownership of ports, canonical filesystem, canonical DB handles, or authoritative outbound effects
- reject doc simplification if it removes execution safeguards from this file

When updating docs:

- keep this roadmap sufficient as a stand-alone safety brief
- keep the remaining-work file shorter, subordinate, and still safe as a standalone blocker brief
- move long narrative or evidence to the historical file, not the execution rules
- if a safeguard is removed from here, replace it here in shorter form in the same patch
- do not delete a section just because another doc covers it in more depth
- do not trade self-containment for brevity
- if you simplify wording, preserve the force of the rule, not only the topic heading

## Review Checklist

Before merging a boundary tranche, verify all of these:

- the exact Node owner being reduced is named in code and docs
- at least one real consumer now uses the Rust-owned path
- the old direct owner was removed, fenced, or explicitly demoted
- the authoritative mode has an unavailability or fail-closed test
- continuity semantics still hold if the tranche touches long-running serving state
- the guardrail test was tightened or at least kept honest
- the remaining-work file reflects any transitional exception that still survives

Additional required checks before marking progress:

- the change did not widen the allowed direct-owner set in `src/` or `plugins/`
- no new convenience fallback was added to keep tests, demos, or UI flows green
- preview, published, and supervised paths did not drift into conflicting ownership models
- the resulting docs are still safe for a cold-start contributor
- the change did not rely on undocumented local operator knowledge to stay safe

Merge gate:

- if a reviewer cannot explain the boundary move, fail-closed mode, and proof path after reading this file plus the diff, the tranche is not documented well enough

## Stop Conditions

Stop and re-scope if the change requires any of these:

- a new direct Node owner for host ports, canonical filesystem, canonical SQLite, watch policy, or canonical outbound effects
- a hidden local fallback to keep an authoritative Rust-owned path "convenient"
- browser-only proof when a deterministic fixture/control-plane proof exists
- a second ownership model for preview, published, or supervised flows touching the same canonical source
- weakening a guardrail test instead of shrinking the actual owner set

If one of those is true, the move is probably heading away from the target.

Also stop if:

- the main argument for a change is "this keeps the browser flow working" rather than "this reduces direct Node ownership"
- the only proof available is manual testing even though the path has a controllable fixture surface
- the change introduces more narrative certainty in docs than the tests actually prove

Also stop if:

- the main benefit is readability or convenience but the direct owner set stays the same
- the work creates a second transition seam instead of shrinking an existing one
- the only reason a fallback remains is "we can clean it up later"
- the roadmap can no longer be used safely without opening multiple other documents

## How To Read This

Read in this order:

1. This file for the current shape.
2. [docs/RUST-OWNED-EXTERNAL-BOUNDARY-REMAINING.md](./RUST-OWNED-EXTERNAL-BOUNDARY-REMAINING.md) for the live backlog.
3. [docs/RUST-OWNED-EXTERNAL-BOUNDARY-HISTORICAL.md](./RUST-OWNED-EXTERNAL-BOUNDARY-HISTORICAL.md) only when you need the older tranche-by-tranche evidence trail.

If there is tension between readability and safety, keep the safety rules in this file and move only the long-form evidence out.

If there is disagreement between documents:

- trust tests over prose
- trust the narrower claim over the broader claim
- trust the live remaining blocker over an optimistic narrative sentence

If there is disagreement between docs and code:

- trust tested behavior over roadmap optimism
- reduce the roadmap claim immediately
- do not leave a stronger claim in place while “planning” to catch up later

## Status Snapshot

The program is materially advanced, but not closed.

Major progress already landed:

- [x] Rust-frontdoored public ingress is the supported path.
- [x] Published authoring runs through Rust-owned transaction control.
- [x] Preview sessions use Rust-owned source capabilities when `WITNESS_CORE_URL` is configured.
- [x] Canonical watcher ownership has been removed from Node runtime code.
- [x] Canonical SQLite ownership has moved behind witness-core capabilities.
- [x] Shared witness-core bridge and supervised IPC transport exist.
- [x] Core-connected runtime plugin loading no longer depends on the old workspace-local import escape hatch for transitive first-party plugin/source graphs.
- [x] Direct `node:fs` ownership has been removed from `src/app-project.js`, `src/runtime-plugin-utils.js`, and `src/runtime-server.js`; their local-only fallback now lives in the explicit demoted utility module `src/runtime-local-fs.js`.
- [x] Direct `node:fs` ownership has been removed from `src/dsl.js`, `src/desire/rvm.js`, and `src/desire/wtoml.js`; witness-app and Desire file compilation now use the same explicit local-fallback seam instead of importing filesystem authority directly.
- [x] Direct `node:fs` ownership has been removed from `src/app-snapshot-manager.js`; canonical snapshot and preview rebuild logic now use the same explicit local-fallback seam instead of importing filesystem authority directly.
- [x] The final canonical-source `node:fs` audit is closed: direct product/runtime `src/` owners are gone, and the remaining `node:fs` imports are utility/operator-only plus the explicit `runtime-local-fs` fallback seam.
- [x] Core-connected app-serving startup no longer treats `WITNESS_CORE_URL` alone as sufficient authority; the serve/runtime bridge now requires the Rust-bounded transport pipe and fails startup closed when that carrier is missing.
- [x] Ambient HTTP witness-core bridge fallback is gone from checked-in product/runtime call sites; bridge/status-store construction is now pipe-or-injected-transport only.
- [x] The old standalone witness-core HTTP compatibility transport has been removed from product `src/`; only a test-side compatibility adapter remains under `test/support/` for bridge/status-store fixture coverage.
- [x] Node runtime workers can now attach to a Rust-provided outbound control socket and answer the shared `witness-runtime-worker-transport/v1` control calls without requiring inbound HTTP control requests.
- [x] `witness-core` now prefers that Rust-owned control socket for supervised/frontdoor readiness, health polling, supervision, and reload; the checked-in frontdoor configs no longer depend on `control_url`, `health_url`, or `reload_url`.
- [x] `runtime-server` and `runtime-worker-transport` now expose a carrier-neutral app request path, so worker app-serving semantics are callable without coupling route execution to `http.createServer(...)`.
- [x] The Rust frontdoor smoke is green again after normal app requests moved onto the carrier-neutral worker transport, supported SSE routes moved onto Rust-owned synthesis, and unsupported stream/upgrade requests became explicit rejections.
- [x] Transport-only published authoring now survives re-entrant Rust activation reloads over the shared worker-control socket instead of deadlocking nested `runtime.app_http.request` calls.
- [x] Worker-control `runtime.app_http.request` now preserves route-level non-2xx HTTP semantics, so authored conflicts and similar rejections no longer collapse into `runtime unavailable`.
- [x] Duplicate published generations are now suppressed across both watcher replay and retried published-authoring requests when the content hash and changed-source set already match the latest in-flight or settled generation.
- [x] Fixture-first continuity proof is green again in the current state; the full `test/witness-core-live-continuity.test.js` suite now passes continuity, preview, published-authoring, supervised, supervised-health, frontdoor, and soak together.

Still open:

- [ ] Node still owns a standalone loopback HTTP utility listener.
- [ ] The non-SQLite `db.sql` path still needs stronger live integration evidence against real `postgres` / `mysql` targets.
- [ ] Final zero-direct-ownership guardrails are not yet tight enough to claim closure.

## Named Open Exceptions Right Now

The remaining blockers correspond to concrete surviving exceptions:

- [src/runtime-utility-listener.js](/C:/Users/aaron/Documents/world/src/runtime-utility-listener.js) now owns the demoted standalone loopback utility listener; canonical runtime serving no longer binds directly in [src/runtime-server.js](/C:/Users/aaron/Documents/world/src/runtime-server.js)
- the `db.sql` non-SQLite live path has weaker evidence than the SQLite and filesystem boundaries
- the guardrail tests do not yet freeze the final zero-direct-ownership end state

Nothing else should be treated as an open-ended excuse to add more direct Node authority.

## Current Truth

Current plain-language state:

- Rust already owns continuity, supervision, promotion/rollback control, published transactions, a large part of the filesystem boundary, canonical SQLite access, and most of the control-plane contract.
- Node has been pushed out of many canonical write and watch paths.
- The canonical `node:fs` audit is now closed for direct product/runtime ownership in `src/`; the remaining imports are explicit non-canonical utility/operator paths only.
- The authoritative app-serving runtime path now requires the bounded Rust transport carrier instead of silently using the legacy HTTP control adapter.
- Checked-in product/runtime bridge creation is now pipe-or-injected-transport only, with no standalone HTTP transport left in product `src/`.
- The runtime worker now has an outbound control-socket client for the shared worker-transport contract, and witness-core now uses that socket for the checked-in supervised/frontdoor readiness, health, supervision, and reload path.
- The worker now also has a carrier-neutral app request path for route execution; the Rust frontdoor uses that path for normal requests, synthesizes the supported SSE routes itself, and explicitly rejects unsupported streaming or upgrade requests instead of tunneling them to a private listener.
- Published-authoring retries and route-level conflicts now survive the worker-control path without being flattened into transport failures, and duplicate published generations from retry pressure are suppressed.
- The fixture-first continuity suite is green again across continuity, preview, published-authoring, supervised, supervised-health, frontdoor, and soak paths after restoring the bounded witness-core transport env path for embedded runtimes and reclaiming conflicting supervisor owners on core restart.
- The remaining work is no longer broad platform uncertainty; it is a concentrated set of private-listener removal, non-SQLite live-proof, and final-guardrail blockers.

This means the effort is going well, but it is not near the final target yet.

## Execution Discipline

To keep this program from drifting, every tranche should leave behind a short factual record:

- `Boundary moved`
- `Direct owner reduced`
- `Authoritative mode`
- `Proof run`
- `Guardrail status`
- `Remaining exception`

That record can live in commit notes, PR text, or follow-up documentation, but it must exist.

Without that record, the work becomes difficult to audit and too easy to over-claim.

## Documentation Safety Rule

This roadmap must remain able to stop a well-meaning but under-context contributor from doing unsafe work.

That means:

- the file must tell them what not to touch
- the file must tell them what proof is required
- the file must tell them when to stop
- the file must tell them which exceptions are real and which are forbidden to copy

If a rewrite preserves topic coverage but weakens those four functions, it is not an improvement.

Additional rule:

- supporting documents may elaborate, but they may not become required to avoid obvious mistakes
- the historical archive may preserve detail, but it may not become the place where active safeguards actually live
- the remaining-work file may stay compact, but it must still contain enough fail-closed, proof, and stop-condition guidance to be safe for the active blockers

## What Not To Do

Do not:

- add new canonical `node:sqlite` usage
- add new public or semi-public `server.listen(...)` ownership in Node
- add new canonical `fs.readFile`, `fs.writeFile`, or `fs.watch` usage in serving paths unless the tranche is explicitly removing it
- add helper wrappers that still directly call the external resource from Node
- keep permanent fallback-to-local behavior in supervised or Rust-owned modes
- mark the work complete because a seam exists while Node still owns a side path
- add a fallback purely to keep a test, demo, or browser flow green
- treat operator polish or Sourcery/browser convenience as proof that ownership moved
- build a second "temporary" ownership model because reusing the main one is harder
- trim this file further if the result is that a new contributor can no longer execute safely from this document alone

Do not also:

- use the historical file as the live checklist
- use the remaining-work file as if it suspends the execution contract
- convert a named exception into an implied default
- count "the code now goes through a Rust-named helper" as ownership transfer unless the old direct owner is actually gone

## Acceptance Standard

This effort is only complete when:

- Node does not own canonical filesystem, database, host-port, or authoritative outbound side-effect boundaries
- remaining supervised/runtime paths fail closed instead of falling back local
- last-good continuity behavior remains intact
- guardrail tests freeze the final zero-direct-ownership state

Proof hierarchy:

1. guardrail and ownership tests
2. fixture-first continuity / control-plane tests
3. journal and capability evidence
4. runtime/UI consumers such as Sourcery

Documentation rule:

- this file must remain sufficient to keep a new agent from widening direct Node ownership
- the remaining-work file may be shorter, but it must still be safe as a standalone blocker brief and this file may not become a bare summary

One-sentence test:

- If a Node worker can still independently touch the outside world in a way that changes canonical platform behavior, the target has not been reached.

## Live Checklist

The authoritative live checklist and compact active-blocker brief live in:

- [docs/RUST-OWNED-EXTERNAL-BOUNDARY-REMAINING.md](./RUST-OWNED-EXTERNAL-BOUNDARY-REMAINING.md)

That file should be updated when:

- a remaining blocker is completed
- a new transitional exception appears
- a previously claimed proof turns out to be too weak

## Historical Record

The previous long-form roadmap has been preserved as:

- [docs/RUST-OWNED-EXTERNAL-BOUNDARY-HISTORICAL.md](./RUST-OWNED-EXTERNAL-BOUNDARY-HISTORICAL.md)

Use the historical file for:

- older tranche wording
- long evidence sections
- detailed rationale that is no longer needed in the top-level reading path

Do not treat the historical file as the primary live status document.
