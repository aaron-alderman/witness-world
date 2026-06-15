# LLM Authoring Policy

This repo supports an explicit constrained authoring mode for app/product work.

## Rule

LLM-mediated app authoring is `plugin.authoring` only.

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

## Blocked handoff

When current authoring cannot express the requested change, the session must end
with a structured blocked handoff containing:

- `goal`
- `attemptedAuthoringPath`
- `missingPrimitive`
- `minimumHumanAction`
- `proof`

The human platform lane then decides whether to widen the substrate, change the
runtime, open a proposal, or reject the request.

For Engentus, the expected next honest blocked handoff after live widget
projection is `surface.create`. That blocker must be addressed in the
authoring substrate, not bypassed with app-local browser JS or direct runtime
patching.
