# DESIRE-SPA

A faithful re-expression of the hand-coded Mill-iQ SPA
(`example-ports/engentus/`) in the DESIRE IR. The goal is not a plugin wrapper
around the app. The goal is to say the app in the language, lowering only at
genuine symmetry breaks.

This is the canonical Engentus architecture and status document. The app README
is secondary and should point back here.

Repo-wide constrained LLM authoring policy lives in
`docs/LLM-AUTHORING-POLICY.md`. The canonical authoring pathway probe method
for finding the next honest gap lives in `docs/AUTHORING-REPLAY-PLAYBOOK.md`.
The required read-first runtime ownership map lives in
`docs/RUNTIME-STACK-MAP.md`.
Internal reference import/uplift design lives in `docs/WHTML-WCSS-UPLIFT.md`.
Reference behavior evidence read from the oracle JavaScript lives in
`docs/ENGENTUS-ORACLE-BEHAVIOR-INVENTORY.md`.

## Thesis

- App structure, routes, views, copy, assets, and CSS belong to the app layer.
- The app must be authored in DESIRE terms. Handwritten browser facades must
  not regain authority over shell structure or app flow.
- Lazy transport is a runtime responsibility by default. Authors should not
  have to manually split route payloads just to avoid over-shipping off-route
  state.
- The constrained public frontend model is
  `surface + process + projection + collection + boundary + policy + capability`.
- `plugin.authoring` is the only constrained write path.
- Blocked means stop, not improvise.

## Single-track method

There is one approved advancement lane for constrained frontend work:

1. read the machine-readable authoring/runtime matrix
2. run the canonical authoring pathway probe for the next canonical authoring step
3. stop at the first blocked semantic
4. emit one structured blocked handoff and classify the blocker honestly

There is no second generic frontend initiative beside this pathway probe. If
Engentus moves honestly, it moves only by advancing that pathway ladder.

## Internal uplift workspace

`WHTML/WCSS` is the internal Engentus import/uplift workspace. It captures
reference HTML/CSS evidence, including inline styles, plus a symmetry graph for
shared presentation laws and localized symmetry breaks.

Reference JavaScript may be read only as oracle evidence for behavior, timing,
state, and leaf helper boundaries. That evidence is recorded in
`docs/ENGENTUS-ORACLE-BEHAVIOR-INVENTORY.md`. It is not permission to copy the
reference controllers or recreate an app-local browser runtime.

It is not:

- a runtime
- a public MCP authoring noun
- a second proof lane
- permission to bypass `plugin.authoring`

It feeds the same authored targets already recognized by this document:

- widget emission for concrete/imported UI representation
- surface emission for the constrained `surface + process + projection` path

The three Engentus tracks therefore stay connected:

1. the real app serving path
2. mechanical HTML/CSS parity against `example-ports/engentus/`
3. MCP-only reconstruction through the canonical authoring pathway probe

Uplift output is candidate authored evidence. It is not executable frontend
authority until it passes through the existing serving and pathway gates.

## Runtime honesty layer

`page.surface` development runs may now expose a generic runtime honesty layer:

- a session-wide runtime issue ledger
- a dev-only diagnostics FAB and drawer when issues exist
- non-fatal invariant capture during boot, route swap, refresh, capability
  mount, and settle probe
- a stable browser inspection point on `window.world`
- dev-only app expectation packs layered on the same generic issue ledger

This is support machinery for the same single-track pathway, not a second
frontend lane. Hidden runtime degradation should become visible and
machine-readable without crashing the app before evidence can be gathered.

## Current reset truth

The previous `page.surface` renderer in `src/runtime-surface-shell.js` was
false authority. It embedded app and capability behavior into a generic host.
That renderer has been removed.

Current truth:

- `page.surface` is the canonical route host
- it can project authored surface trees, route-selected alternate output, and
  native repeated collection content
- it now claims canonical route/state equivalence, query synchronization,
  route-enter preload behavior, same-origin route-backed `click` / `change` /
  `submit` effects, timed same-origin input-read effects, timed route-backed
  input-write effects through authored interaction `timing`, the canonical
  `/api/session` read and mutation lane through an explicit authored
  session-summary state subset, native conditional process branching, exact
  event/state-derived value writes, template-computed UI updates through
  authored projections and state bindings, and interactive execution through
  authored process rules
- it now claims native `surface + process + projection + collection + boundary
  + policy + capability` runtime support
- it no longer treats `dispatchDomEvent` or `witness:*` host-event bridges as
  an acceptable public runtime lane
- public/operator legacy frontend-program and frontend-step authoring endpoints
  are retired; `/api/frontend-programs` and `/api/frontend-steps` now return
  explicit `410` retirement truth instead of acting as a supported app lane
- same-context and imported canonical-id sugar remain explicitly transitional,
  while unscoped canonical-id authoring is now retired from covered public
  authoring seams and survives only as historical diagnostics

The next honest work does not begin from the old shell host. It begins from the
clean floor proved by the canonical authoring pathway probe.

## Current honest state

### Green floor

- constrained authoring policy truth
- machine-readable capability-matrix truth
- canonical authoring pathway probe truth
- no-cheat boundary truth
- generic runtime honesty-layer truth
- authored Engentus source structure under `examples/engentus`
- route-local `page.surface` transport slicing for served authored surfaces
- native collection repeat authoring on canonical `page.surface`
- route-authored preload policies on canonical `page.surface`
- canonical query-state bindings on canonical `page.surface`
- governed `boundary.create`, `policy.create`, `collection.create`, and
  `frontend.upliftLegacy`

### Removed false authority

- bespoke shell rendering in `src/runtime-surface-shell.js`
- shell/product/chart/layout behavior blessed as generic `page.surface` truth
- tests that encoded that contaminated renderer as the correct frontend path

### Still blocked

- Goodman, mill-charge, and mill-force live behavior on canonical seams
- legacy routes whose remaining behavior still cannot be lowered into native
  `surface + process + projection + collection + boundary + policy +
  capability` semantics
- retired legacy app-serving routes that have not yet been uplifted; they are
  now inspectable but unservable until `frontend.upliftLegacy` succeeds
- historical legacy frontend records still exist for inspect and uplift input,
  but maintained starter/bootstrap app creation no longer seeds retired
  `page.home` material or performs post-seed uplift; the starter path is
  natively authored on `page.surface`, and the maintained tutorial now teaches
  that same native starter path instead of `widget` + `frontendProgram` +
  `frontendStep` construction as the default app-building lane
- arbitrary external network targets or host-only legacy behavior that still
  lacks a first-class native expression
- arbitrary expressions beyond the supported exact event/state subset,
  richer object or dynamic session payload branches, plus external or
  non-route-backed legacy effects that still remain outside the current native
  floor and therefore stay in structured `frontendLegacyUplift.blocked[]`

### Newly proved

- minimal static authored `page.surface` projection for one text-bearing surface
  tree through the canonical authoring pathway probe
- route-selected alternate authored `page.surface` output through the canonical
  authoring pathway probe
- authored `surface + projection` consumption on canonical `page.surface`
- URL -> route-state synchronization on canonical `page.surface`
- interaction -> route-state transition on canonical `page.surface`
- route-state -> URL synchronization on canonical `page.surface`
- same-document surface refresh after route-state change
- canonical interactive `page.surface` execution
- native collection repeat rendering on canonical `page.surface`
- route-authored preload execution on canonical `page.surface`
- same-origin route-backed `click` / `change` / `submit` effects on canonical
  `page.surface`
- native conditional branches plus exact event/state-derived writes and
  template-computed UI updates on canonical `page.surface`
- native query-state bindings on canonical `page.surface`
- faithful live Engentus shell behavior through the constrained pathway
- route-local runtime transport for served `page.surface` output, so an active
  route no longer serializes the entire broad owning process closure by default

## Routing cluster

The routing cluster is now proven on canonical seams:

1. route-selected authored surface output
2. URL -> route-state synchronization
3. interaction -> route-state transition
4. route-state -> URL synchronization
5. same-document surface refresh after route-state change

For Engentus this is now the shell substrate for:

- login -> home
- home -> Goodman
- home -> mill-charge
- home -> mill-force
- any screen -> signout
- direct route entry into the authored shell state

Route and shell state are two representations of the same authored problem.
The constrained pathway now proves them together on canonical seams, so the
next honest gap is broader module behavior plus the remaining retired legacy
semantics that still need first-class native expression before uplift can
finish.

## Restart lane

The restart lane is:

1. keep docs, matrix, pathway probe, and boundaries aligned
2. prove the next honest canonical `page.surface` semantic through the pathway probe
3. stop at the first missing primitive
4. only then widen platform/runtime behavior through the human platform lane

Engentus remains the downstream oracle. `example-ports/engentus/` remains the
reference for expected HTML/CSS outcomes, not executable frontend authority.

Load-order or cache hints are deferred until runtime-default route-local
transport has been measured and proven insufficient. The first corrective move
is to make `page.surface` ship only the reachable runtime fragment for the
active authored route subtree.
