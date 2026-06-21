# Witnesses

## What it is

The append-only fact row of the world.

A witness is what `world.emit(...)` writes into the witness log.

Current kernel shape:

- `id`
- `cause`
- `process`
- `actor`
- `claims`
- `body`

## What makes it special

The kernel derives witness ids from the witness payload hash.

That means a witness is not just a UI event or log line.

It is the canonical recorded change unit that projections read back through `world.allWitnesses()`.

## What an author uses it for

- record a semantic change
- reconstruct current state through projections
- inspect provenance of a thing or relation
- replay or diff authored history
- carry process-specific payload in `body`

## What it contains

- `process` says what happened
- `actor` says who initiated it
- `claims` carries graph assertions such as `thing(...)`, `relation(...)`, or `retract(...)`
- `body` carries process-local structured payload
- `cause` links the witness to the prior causal row

## What it relates to

A witness is the evidence owner for:

- things
- relations
- module definitions
- runtime policy rows
- package authorship rows

The current relation projector also attaches `witness` ids back onto projected relation rows.

## Why it matters

The platform does not treat the current world as primary and history as optional.

The witness stream is primary.

Current state is a projection of witnessed change.
