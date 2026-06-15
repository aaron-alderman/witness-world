# Canonical Authoring Pathway Probe

This file keeps its legacy name, but the canonical term is
`canonical authoring pathway probe`.

Use this probe whenever frontend work must stay inside constrained
`plugin.authoring` mode.

## Purpose

The canonical authoring pathway probe is the only approved proof lane for
constrained frontend progress. It is not a runtime concept, not an
implementation seam, and not a second platform initiative.

## Rules

1. Read the machine-readable authoring/runtime matrix first.
2. Author only through the first-party MCP authoring surface.
3. Prove the smallest possible canonical step.
4. Stop at the first missing primitive.
5. Record one structured blocked handoff.

## Current ladder

1. matrix baseline
2. canonical actions still exist
3. minimal static authored `page.surface` projection
4. route-selected alternate authored `page.surface` output
5. URL -> route-state synchronization
6. interaction -> route-state transition
7. route-state -> URL synchronization
8. same-document surface refresh after route-state change

This routing cluster is all-or-nothing for green status, but the pathway still
stops at the first blocked semantic and emits one structured blocked handoff.

## Current truth

What the pathway probe now proves:

- a minimal surface tree can be authored through constrained MCP
- `page.surface` can project one minimal authored static text payload
- `page.surface` can serve alternate authored output by route
- the reset host still exists as the honest fallback when no minimal static
  payload can be projected

What remains blocked:

- URL -> route-state synchronization
- interaction -> route-state transition
- route-state -> URL synchronization
- same-document surface refresh after route-state change
- interactive `page.surface` execution
- process/projection consumption by `page.surface`

## Evidence rules

- HTTP success alone is not enough
- matrix claims must match pathway-proven truth
- supported means proven by the current pathway probe
- blocked means not yet proven or explicitly failed on the pathway probe
- no later rung may run after the first blocked rung

## Anti-patterns

- widening runtime behavior ahead of the next pathway rung
- rebuilding app flow in handwritten JS
- leaving wrong-behavior tests around as traps to be “fixed”
- treating the pathway probe as a frontend runtime concept
