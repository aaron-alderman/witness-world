# Boundaries

## What it is

A first-class external interaction object.

`boundary` names the edge where authored semantics meet external capability or transport behavior.

It is also the base family used by:

- `read`
- `write`
- `adapter`

## Main fields

For base `boundary`, the semantic shape carries:

- `capabilities`

For specialized forms:

- `read` / `write`
  - `operations`
  - capability-specific operation intent
- `adapter`
  - `transport`
  - `command`
  - `operationKind`
  - `method`
  - `route`
  - `hostOperation`
  - request/response schema and state hooks

The public authoring policy treats boundary authoring as supported through:

- `boundary.create`

## What an author uses it for

- name an external seam
- declare required capabilities
- attach commands to external transport or host operations
- describe request and response flow at the system edge

## What it relates to

A boundary participates in:

- `capability`
- `command`
- `query`
- `process`
- runtime transport
- host operations

## Why it matters

Without `boundary`, external effects collapse into hidden runtime behavior instead of explicit authored seams.
