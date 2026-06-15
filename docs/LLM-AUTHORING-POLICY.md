# LLM Authoring Policy

This repo supports an explicit constrained authoring mode for app/product work.

The required read-first map of the existing runtime stack and concern ownership
lives in `docs/RUNTIME-STACK-MAP.md`.

## Constitutional rule

LLM-mediated app authoring is `plugin.authoring` only.

The canonical public frontend model in constrained mode is:

- `surface`
- `process`
- `projection`
- `capability`

`DESIRE+` remains an internal lowering/debug layer, not a public MCP write
surface.

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

## Current `page.surface` truth

The old `runtime-surface-shell` path was removed because it embedded app and
capability authority into a generic host.

Current constrained truth is:

- `page.surface` exists as a route host
- it supports minimal static authored projection
- it supports route-selected alternate authored output
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
