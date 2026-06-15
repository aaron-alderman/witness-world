# Authoring Replay Playbook

Use this playbook whenever frontend work must stay inside constrained
`plugin.authoring` mode.

## Purpose

The replay is the only approved proof lane for constrained frontend progress.
It is not a workaround lane and it is not a second platform initiative.

## Rules

1. Read the machine-readable authoring/runtime matrix first.
2. Author only through the first-party MCP authoring surface.
3. Prove the smallest possible canonical step.
4. Stop at the first missing primitive.
5. Record one structured blocked handoff.

## Current ladder

1. constrained matrix baseline
2. canonical actions still exist
3. `page.surface` resolves to blocked/reset host output
4. replay emits one structured blocked handoff

This is the only approved next step. No Engentus-specific shell replay begins
until the clean floor above is stable and truthful.

## Current stop point

`page.surface` is currently blocked for canonical frontend projection and
execution.

Reason:

- the previous renderer path was removed because it embedded app and capability
  authority into a generic host

That means replay currently proves blocked/reset truth, not live authored shell
truth.

## Evidence rules

- HTTP success alone is not enough
- matrix claims must match replay-proven truth
- supported means replay-proven now
- blocked means replay hit the stop point now
- no later rung may run after the first blocked rung

## Anti-patterns

- widening runtime behavior ahead of the next replay rung
- rebuilding app flow in handwritten JS
- leaving wrong-behavior tests around as traps to be “fixed”
- treating old `page.surface` shell output as canonical truth
