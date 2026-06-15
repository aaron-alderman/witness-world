# LLM Authoring Policy

This repo supports an explicit constrained authoring mode for app/product work.

## Rule

LLM-mediated app authoring is `plugin.authoring` only.

The canonical public frontend model in constrained mode is:

- `surface`
- `process`
- `projection`
- `capability`

`DESIRE+` remains an internal lowering/debug layer, not a public MCP write
surface.

That means the allowed write path is the first-party authoring substrate:

- `plugin.authoring-core`
- `plugin.program-authoring`
- `plugin.server-runner-authoring`
- `plugin.capability-authoring`
- `plugin.mcp-authoring`
- `plugin.proposals` for read/inspection only during constrained sessions

## Forbidden fallback

In `mcp_only` mode the LLM must not:

- patch repo-tracked app/runtime files directly
- generate custom JS/TS runtime fallback artifacts
- edit `src/` or `plugins/` as an app-authoring workaround
- create browser runtimes, presenters, controllers, or client facades
- create proposal artifacts automatically

Blocked means stop, not improvise.

The operational method for finding that blocked point is documented in
`docs/AUTHORING-REPLAY-PLAYBOOK.md`.

## Machine-readable truth

Constrained sessions must not infer the active frontend authoring model from
tool names or old examples alone.

The runtime exposes a machine-readable capability matrix through constrained
inspection so a session can see:

- which frontend concepts are public and canonical
- which concepts are legacy-only
- which runtime consumers exist
- which pairings are supported vs blocked

That matrix, not prose alone, is the primary guardrail against drift.

## Limitation types

Blocked handoffs should identify which class of limitation was hit:

- language limitation
  - the current DESIRE authoring language cannot express the requirement
- platform limitation
  - the requirement is expressible in DESIRE terms, but first-party lowering,
    runtime, or authoring APIs do not yet support it live
- policy limitation
  - a technically possible workaround exists, but constrained mode forbids it

The current Engentus blocker should be read as a platform limitation unless and
until replay proves that the missing behavior cannot be expressed in DESIRE
terms at all.

## Blocked handoff

When current authoring cannot express the requested change, the session must end
with a structured blocked handoff containing:

- `limitationType`
- `goal`
- `attemptedAuthoringPath`
- `missingPrimitive`
- `minimumHumanAction`
- `proof`

The human platform lane then decides whether to widen the substrate, change the
runtime, open a proposal, or reject the request.

For Engentus, `surface.create` is now part of the allowed authoring substrate.
The replay now proves that a minimal authored `page.surface` shell can serve
live.

The current next honest blocker is a platform limitation in the canonical
frontend model itself:

- `process.create` is now implemented as a first-party semantic authoring
  handler and emits real DESIRE `process` witnesses
- `projection.create` is part of the public constrained story, but not yet
  implemented as a first-party authoring handler
- `frontendProgram.create` / `frontendStep.create` are now legacy-only and
  must not be used as the fallback interactive story for constrained sessions

That means the stop point is now narrower: it is no longer "surface
interaction is widget-rooted" and it is no longer "process.create is missing";
it is "the canonical `surface + process + projection` interaction path is not
implemented yet because `projection.create` is still missing."
