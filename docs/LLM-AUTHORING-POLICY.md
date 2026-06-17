# LLM Authoring Policy

This repo supports an explicit constrained authoring mode for app/product work.

The required read-first map of the existing runtime stack and concern ownership
lives in `docs/RUNTIME-STACK-MAP.md`.
The internal reference import/uplift workspace is described in
`docs/WHTML-WCSS-UPLIFT.md`.

## Constitutional rule

LLM-mediated app authoring is `plugin.authoring` only.

The canonical public frontend model in constrained mode is:

- `surface`
- `process`
- `projection`
- `capability`

`DESIRE+` remains an internal lowering/debug layer, not a public MCP write
surface.

Lazy route-local transport is a runtime concern by default. Constrained
authoring should stay natural and high-level unless the capability matrix proves
that additional authored load hints are genuinely required.

## Hard boundaries

In `mcp_only` mode the LLM must not:

- patch repo-tracked app/runtime files directly as an app-authoring fallback
- generate custom JS/TS runtime fallback artifacts
- edit `src/` or `plugins/` to work around missing authoring/runtime support
- create browser runtimes, presenters, controllers, or client facades
- create proposal artifacts automatically

Blocked means stop, not improvise.

## One proof lane

When the constrained pathway advances, it advances only by extending the
canonical authoring pathway probe and the corresponding machine-readable
capability-matrix truth.

There is no second lane for temporary generic frontend work outside that pathway
gate.

## Runtime honesty support

Development/runtime-debug builds may surface a generic runtime honesty layer for
`page.surface`:

- non-fatal issue ledger accumulation
- in-app diagnostics overlay
- browser inspection via `window.world`
- post-settle probe snapshots
- app-specific dev expectation packs registered on the generic diagnostics seam

This support is allowed because it makes hidden degradation visible inside the
same canonical pathway. It does not create a second authoring lane, a second
runtime, or permission to bypass constrained authoring with handwritten JS.

## Internal uplift is not authoring permission

`WHTML/WCSS` may be used as an internal import/uplift workspace for reference
HTML/CSS evidence. It is not a public constrained authoring surface.

In `mcp_only` mode the LLM still may not:

- call public `whtml.create` or `wcss.create` actions, because none exist
- treat uplift output as a custom runtime or app-local controller
- bypass `plugin.authoring` with generated JS, direct file edits, or route-local
  browser facades

Uplift can produce candidate widget or surface authored material, but public
frontend progress is still proved only through the canonical authoring pathway
probe and the capability matrix.

## Current `page.surface` truth

The old `runtime-surface-shell` path was removed because it embedded app and
capability authority into a generic host.

Current constrained truth is:

- `page.surface` exists as a route host
- it supports minimal static authored projection
- it supports route-selected alternate authored output
- it now slices served runtime transport to the reachable fragment used by the
  active authored route subtree instead of serializing the whole broad process
  closure by default
- route/state equivalence and canonical interactive execution through
  `page.surface` remain blocked

Any future claim beyond that must be pathway-proven first.

## Blocked handoff

When current authoring cannot express or run the requested change, the session
must end with a structured blocked handoff containing:

- `limitationType`
- `goal`
- `attemptedAuthoringPath`
- `missingPrimitive`
- `minimumHumanAction`
- `proof`

The canonical authoring pathway probe and capability matrix are the
machine-readable sources of truth for that stop point.
