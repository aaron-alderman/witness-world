# DESIRE-SPA

A faithful re-expression of the hand-coded Mill-iQ SPA
(`example-ports/engentus/`) in the DESIRE IR. The goal is not a plugin wrapper
around the app. The goal is to say the app in the language, lowering only at
genuine symmetry breaks.

This is the canonical Engentus architecture and status document. The app README
is secondary and should point back here.

Repo-wide constrained LLM authoring policy lives in
`docs/LLM-AUTHORING-POLICY.md`. The replay method for finding the next honest
gap lives in `docs/AUTHORING-REPLAY-PLAYBOOK.md`.

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
2. replay the next canonical authoring step
3. stop at the first blocked semantic
4. emit one structured blocked handoff and classify the blocker honestly

There is no second generic frontend initiative beside this replay/pathway. If
Engentus moves honestly, it moves only by advancing that replay ladder.

## Current reset truth

The previous `page.surface` renderer in `src/runtime-surface-shell.js` was
false authority. It embedded app and capability behavior into a generic host.
That renderer has been removed.

Current truth:

- `page.surface` still resolves as a route host
- it now serves a blocked/reset host page only
- it does not claim static shell parity
- it does not claim canonical interactive execution
- it does not claim `surface + process + projection` runtime support

The next honest work does not begin from the old shell host. It begins from the
clean blocked floor proved by the replay/pathway test.

## Current honest state

### Green floor

- constrained authoring policy truth
- machine-readable capability-matrix truth
- replay/pathway blocked-handoff truth
- no-cheat boundary truth
- authored Engentus source structure under `examples/engentus`

### Removed false authority

- bespoke shell rendering in `src/runtime-surface-shell.js`
- shell/product/chart/layout behavior blessed as generic `page.surface` truth
- tests that encoded that contaminated renderer as the correct frontend path

### Still blocked

- canonical static `page.surface` projection
- canonical interactive `page.surface` execution
- faithful live Engentus shell behavior through the constrained pathway
- Goodman, mill-charge, and mill-force live behavior on canonical seams

## Restart lane

The restart lane is:

1. keep docs, matrix, replay, and boundaries aligned
2. prove the next honest canonical `page.surface` semantic through replay
3. stop at the first missing primitive
4. only then widen platform/runtime behavior through the human platform lane

Engentus remains the downstream oracle. `example-ports/engentus/` remains the
reference for expected HTML/CSS outcomes, not executable frontend authority.
