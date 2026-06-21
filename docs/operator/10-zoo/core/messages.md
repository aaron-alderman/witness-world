# Messages

## What it is

A first-class communication object.

`message` is the base family for structured payload exchange.

Specialized roles include:

- plain message
- event
- command
- query

## Main fields

For base `message`, the semantic shape carries:

- `fields`

For `event`, additional shape includes:

- `schema`
- `payload`
- `writes`

The public authoring policy treats message authoring as supported through:

- `message.create`

## What an author uses it for

- define payload shapes
- define emitted events
- define command and query contracts
- connect processes, boundaries, and surfaces through explicit structures

## What it relates to

A message participates in:

- `process`
- `command`
- `query`
- `event`
- `boundary`
- `surface` interactions

## Why it matters

Without `message`, systems fall back to ad hoc payload conventions instead of explicit contracts.
