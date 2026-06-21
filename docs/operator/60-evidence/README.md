# Evidence

This area answers:

- what the world is made from
- what counts as proof of change
- how current state is reconstructed
- where provenance comes from

## Core pieces

- witness
- thing
- relation
- retract

## Current runtime shape

The kernel keeps both:

- a witness log
- an observation log

Current world APIs expose:

- `emit(...)`
- `observe(...)`
- `allWitnesses()`
- `allObservations()`

## Why this matters

The platform is not state-first with optional audit.

It is evidence-first.

World state, module indexes, ownership, current relations, and most operator inspection views are projections over recorded evidence.
