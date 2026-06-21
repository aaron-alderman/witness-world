# Relations

## What it is

The directed edge primitive of the world graph.

Current claim shape:

- `relation(from, rel, to, meta = {})`

There is also a matching retract form:

- `retract(from, rel, to, meta = {})`

## Current authored lane

`relation` is a first-class top-level authored form.

The current DSL emits a `dsl.relation` witness whose claim is the relation itself.

## Main fields

- `from`
- `rel`
- `to`
- `meta`

`rel` is the relation type label in the current model.

`meta` carries extra structure for cases like ordering, target kind, slot, config, and other edge-local detail.

## What an author uses it for

- ownership
- context placement
- module kind assignment
- parent/child structure
- capability install
- route and runtime attachment
- package dependency and package namespace linkage

## Projection behavior

The core projectors expose:

- all asserted relation rows
- current relation rows after retractions
- ownership and steward maps derived from relation space

Current relation rows also retain the source witness id.

## Why it matters

The platform does not hide structure behind anonymous nested objects.

Important cross-object structure is made explicit in relation space so it can be:

- inspected
- retracted
- projected
- searched
- linked back to evidence
