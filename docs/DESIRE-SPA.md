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

## Thesis

- App structure, routes, views, copy, assets, and CSS belong to the app layer.
- The app must be authored in DESIRE terms. Handwritten browser facades must
  not regain authority over shell structure or app flow.
- The constrained public frontend model is
  `surface + process + projection + capability`.
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

## Current reset truth

The previous `page.surface` renderer in `src/runtime-surface-shell.js` was
false authority. It embedded app and capability behavior into a generic host.
That renderer has been removed.

Current truth:

- `page.surface` still resolves as a route host
- it can project minimal authored static surface output
- it can serve route-selected alternate authored surface output
- it still exposes the blocked/reset host when no minimal authored payload can be projected
- it does not claim canonical interactive execution
- it does not yet claim route/state equivalence support
- it does not yet claim `surface + process + projection` runtime support

The next honest work does not begin from the old shell host. It begins from the
clean floor proved by the canonical authoring pathway probe.

## Current honest state

### Green floor

- constrained authoring policy truth
- machine-readable capability-matrix truth
- canonical authoring pathway probe truth
- no-cheat boundary truth
- authored Engentus source structure under `examples/engentus`

### Removed false authority

- bespoke shell rendering in `src/runtime-surface-shell.js`
- shell/product/chart/layout behavior blessed as generic `page.surface` truth
- tests that encoded that contaminated renderer as the correct frontend path

### Still blocked

- URL -> route-state synchronization on canonical `page.surface`
- interaction -> route-state transitions on canonical `page.surface`
- route-state -> URL synchronization on canonical `page.surface`
- same-document surface refresh after route-state change
- canonical interactive `page.surface` execution
- faithful live Engentus shell behavior through the constrained pathway
- Goodman, mill-charge, and mill-force live behavior on canonical seams

### Newly proved

- minimal static authored `page.surface` projection for one text-bearing surface
  tree through the canonical authoring pathway probe
- route-selected alternate authored `page.surface` output through the canonical
  authoring pathway probe

## Routing cluster

The next canonical frontend unit is the routing cluster:

1. route-selected authored surface output
2. URL -> route-state synchronization
3. interaction -> route-state transition
4. route-state -> URL synchronization
5. same-document surface refresh after route-state change

For Engentus this is the shell prerequisite for:

- login -> home
- home -> Goodman
- home -> mill-charge
- home -> mill-force
- any screen -> signout
- direct route entry into the authored shell state

Route and shell state are two representations of the same authored problem.
The constrained pathway must prove them together on canonical seams before
Engentus shell flow can move honestly.

## Restart lane

The restart lane is:

1. keep docs, matrix, pathway probe, and boundaries aligned
2. prove the next honest canonical `page.surface` semantic through the pathway probe
3. stop at the first missing primitive
4. only then widen platform/runtime behavior through the human platform lane

Engentus remains the downstream oracle. `example-ports/engentus/` remains the
reference for expected HTML/CSS outcomes, not executable frontend authority.
